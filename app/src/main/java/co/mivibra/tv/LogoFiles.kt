package co.mivibra.tv

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.util.Base64
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import java.io.File
import java.io.FileOutputStream

/**
 * Logos de canales sin fondo:
 * https://appassets.androidplatform.net/logo/<url en base64>.png
 * Descarga el logo, quita el fondo uniforme que lo rodea (blanco, negro o de un color, tocando los bordes),
 * recorta los márgenes vacíos y lo guarda en caché. Si el logo no tiene un fondo claro de quitar, queda igual.
 */
class LogoFiles(private val ctx: Context) : WebViewAssetLoader.PathHandler {

    override fun handle(path: String): WebResourceResponse? {
        return try {
            val b64 = path.substringBefore('.')
            val url = String(Base64.decode(b64, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING))
            if (!url.startsWith("http")) return null
            val dir = File(ctx.cacheDir, "logos").apply { mkdirs() }
            val out = File(dir, Integer.toHexString(url.hashCode()) + "_" + url.length + ".png")
            if (!out.exists() || out.length() == 0L) synchronized(lockFor(out.name)) { if (!out.exists() || out.length() == 0L) build(url, out) }
            if (out.exists() && out.length() > 0) WebResourceResponse("image/png", null, out.inputStream()).apply {
                responseHeaders = mapOf("Cache-Control" to "max-age=604800", "Access-Control-Allow-Origin" to "*")
            } else null
        } catch (_: Throwable) {
            null
        }
    }

    private val locks = HashMap<String, Any>()
    private fun lockFor(k: String): Any = synchronized(locks) { locks.getOrPut(k) { Any() } }

    private fun build(url: String, out: File) {
        val tmp = File(out.path + ".dl")
        try {
            val code = Net.download(url, tmp, emptyMap(), decompress = true)
            if (code >= 400 || !tmp.exists()) return
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(tmp.path, bounds)
            if (bounds.outWidth <= 0) return
            var sample = 1
            while (bounds.outWidth / sample > 512 || bounds.outHeight / sample > 512) sample *= 2
            val src = BitmapFactory.decodeFile(tmp.path, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return
            val bmp = clean(src.copy(Bitmap.Config.ARGB_8888, true))
            FileOutputStream(out).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
        } finally {
            tmp.delete()
        }
    }

    private fun dist(a: Int, b: Int): Int {
        val dr = Color.red(a) - Color.red(b); val dg = Color.green(a) - Color.green(b); val db = Color.blue(a) - Color.blue(b)
        return kotlin.math.sqrt((dr * dr + dg * dg + db * db).toDouble()).toInt()
    }

    private fun clean(bmp: Bitmap): Bitmap {
        val w = bmp.width; val h = bmp.height
        if (w < 8 || h < 8) return bmp
        val px = IntArray(w * h); bmp.getPixels(px, 0, w, 0, 0, w, h)
        // Bordes: si casi todo ya es transparente, no hay nada que quitar
        val border = ArrayList<Int>()
        for (x in 0 until w) { border.add(x); border.add((h - 1) * w + x) }
        for (y in 0 until h) { border.add(y * w); border.add(y * w + w - 1) }
        val opaque = border.filter { Color.alpha(px[it]) > 40 }
        if (opaque.size < border.size * 0.5) return trim(bmp, px)
        // Color de fondo: el más repetido entre las esquinas; debe cubrir buena parte del borde
        val corners = listOf(px[0], px[w - 1], px[(h - 1) * w], px[h * w - 1])
        val bg = corners.maxByOrNull { c -> opaque.count { dist(px[it], c) < 40 } } ?: return bmp
        val share = opaque.count { dist(px[it], bg) < 40 }.toDouble() / border.size
        if (share < 0.6) return trim(bmp, px)
        val tol = 46; val soft = 80
        val seen = BooleanArray(w * h)
        val queue = IntArray(w * h); var qh = 0; var qt = 0
        for (i in border) if (!seen[i] && dist(px[i], bg) < soft && Color.alpha(px[i]) > 0) { seen[i] = true; queue[qt++] = i }
        var removed = 0
        val orig = px.copyOf()
        while (qh < qt) {
            val i = queue[qh++]
            val d = dist(px[i], bg)
            if (d < tol) { px[i] = px[i] and 0x00FFFFFF; removed++ }
            else if (d < soft) {
                // Borde suave (antialias): se deja semitransparente y no se sigue más allá
                val a = ((d - tol) * 255 / (soft - tol)).coerceIn(0, 255)
                px[i] = (minOf(a, Color.alpha(px[i])) shl 24) or (px[i] and 0x00FFFFFF)
                continue
            } else continue
            val x = i % w; val y = i / w
            if (x > 0) { val n = i - 1; if (!seen[n]) { seen[n] = true; queue[qt++] = n } }
            if (x < w - 1) { val n = i + 1; if (!seen[n]) { seen[n] = true; queue[qt++] = n } }
            if (y > 0) { val n = i - w; if (!seen[n]) { seen[n] = true; queue[qt++] = n } }
            if (y < h - 1) { val n = i + w; if (!seen[n]) { seen[n] = true; queue[qt++] = n } }
        }
        // Si se fue casi todo, el "fondo" era el logo mismo: se deja como estaba
        if (removed > w * h * 0.88) return trim(bmp, orig)
        return trim(bmp, px)
    }

    /** Recorta el espacio vacío alrededor (deja un margen pequeño). */
    private fun trim(bmp: Bitmap, px: IntArray): Bitmap {
        val w = bmp.width; val h = bmp.height
        var l = w; var t = h; var r = -1; var b = -1
        for (y in 0 until h) for (x in 0 until w) if (Color.alpha(px[y * w + x]) > 24) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y }
        val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        out.setPixels(px, 0, w, 0, 0, w, h)
        if (r < 0) return out
        val pad = maxOf(2, (maxOf(r - l, b - t) * 0.04).toInt())
        l = maxOf(0, l - pad); t = maxOf(0, t - pad); r = minOf(w - 1, r + pad); b = minOf(h - 1, b + pad)
        return if (l == 0 && t == 0 && r == w - 1 && b == h - 1) out else Bitmap.createBitmap(out, l, t, r - l + 1, b - t + 1)
    }
}
