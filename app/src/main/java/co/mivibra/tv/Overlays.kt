package co.mivibra.tv

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Rect
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Marcos decorativos (bezels) por consola, de libretro/overlay-borders (licencia MIT).
 * Se descargan la primera vez que se juega esa consola y quedan guardados.
 */
object Overlays {
    private const val BASE = "https://raw.githubusercontent.com/libretro/overlay-borders/master/16x9%20Collections/"
    private const val NOSH = "Nosh01%201440%20Plain/"
    private const val NYNY = "NyNy77%201080%20Bezel/"

    private val FILES = mapOf(
        "nes" to NOSH + "Nintendo-Entertainment-System-Bezel-16x9-2560x1440.png",
        "snes" to NOSH + "Super-Nintendo-Entertainment-System-Bezel-16x9-2560x1440.png",
        "gb" to NOSH + "Nintendo-Game-Boy-Bezel-16x9-2560x1440.png",
        "gbc" to NOSH + "Nintendo-Game-Boy-Color-Bezel-16x9-2560x1440.png",
        "gba" to NOSH + "Nintendo-Game-Boy-Advance-Bezel-16x9-2560x1440.png",
        "n64" to NOSH + "Nintendo-64-Bezel-16x9-2560x1440.png",
        "md" to NOSH + "Sega-Genesis-Bezel-16x9-2560x1440.png",
        "sms" to NOSH + "Sega-Master-System-Bezel-16x9-2560x1440.png",
        "gg" to NOSH + "Sega-Game-Gear-Bezel-16x9-2560x1440.png",
        "psx" to NOSH + "Sony-Playstation-Bezel-16x9-2560x1440.png",
        "psp" to NOSH + "Sony-Playstation-Portable-Bezel-16x9-2560x1440.png",
        "a26" to NOSH + "Atari-2600-Bezel-16x9-2560x1440.png",
        "a78" to NOSH + "Atari-7800-Bezel-16x9-2560x1440.png",
        "lynx" to NOSH + "Atari-Lynx-Horizontal-Bezel-16x9-2560x1440.png",
        "pce" to NOSH + "NEC-PC-Engine-Bezel-16x9-2560x1440.png",
        "ngp" to NOSH + "SNK-Neo-Geo-Pocket-Color-Bezel-16x9-2560x1440.png",
        "ws" to NOSH + "Bandai-WonderSwan-Color-Horizontal-Bezel-16x9-2560x1440.png",
        "arcade" to NOSH + "MAME-Horizontal-Bezel-16x9-2560x1440.png",
        "doom" to NOSH + "DOOM-Bezel-16x9-2560x1440.png",
        "dc" to NYNY + "SegaDreamcast-nyny77.png",
        "gc" to NYNY + "NintendoGameCube-nyny77.png",
    )

    fun available(sys: String) = sys in FILES

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("marcos", Context.MODE_PRIVATE)
    fun enabled(ctx: Context, sys: String) = available(sys) && prefs(ctx).getBoolean(sys, true)
    fun setEnabled(ctx: Context, sys: String, on: Boolean) { prefs(ctx).edit().putBoolean(sys, on).apply() }

    fun file(ctx: Context, sys: String) = File(File(ctx.filesDir, "marcos").apply { mkdirs() }, "$sys.png")

    /** Descarga el marco si falta. Devuelve el archivo o null si no se pudo. */
    fun fetch(ctx: Context, sys: String): File? {
        val f = file(ctx, sys)
        if (f.exists() && f.length() > 0) return f
        val path = FILES[sys] ?: return null
        return try {
            val c = URL(BASE + path).openConnection() as HttpURLConnection
            c.connectTimeout = 15000; c.readTimeout = 30000
            if (c.responseCode != 200) return null
            val tmp = File(f.path + ".part")
            c.inputStream.use { inp -> tmp.outputStream().use { inp.copyTo(it, 64 * 1024) } }
            if (tmp.renameTo(f)) f else null
        } catch (_: Exception) { null }
    }

    /** Busca el hueco transparente (la "pantalla") alrededor del centro del marco. */
    fun hole(bmp: Bitmap): Rect? {
        val s = 4
        val w = bmp.width / s; val h = bmp.height / s
        val small = Bitmap.createScaledBitmap(bmp, w, h, false)
        val px = IntArray(w * h); small.getPixels(px, 0, w, 0, 0, w, h)
        if (small != bmp) small.recycle()
        fun clear(i: Int) = (px[i] ushr 24) < 40
        val start = (h / 2) * w + w / 2
        if (!clear(start)) return null
        val seen = BooleanArray(w * h); val q = IntArray(w * h); var head = 0; var tail = 0
        q[tail++] = start; seen[start] = true
        var minX = w; var minY = h; var maxX = 0; var maxY = 0
        while (head < tail) {
            val i = q[head++]; val x = i % w; val y = i / w
            if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y
            if (x > 0 && !seen[i - 1] && clear(i - 1)) { seen[i - 1] = true; q[tail++] = i - 1 }
            if (x < w - 1 && !seen[i + 1] && clear(i + 1)) { seen[i + 1] = true; q[tail++] = i + 1 }
            if (y > 0 && !seen[i - w] && clear(i - w)) { seen[i - w] = true; q[tail++] = i - w }
            if (y < h - 1 && !seen[i + w] && clear(i + w)) { seen[i + w] = true; q[tail++] = i + w }
        }
        return Rect(minX * s, minY * s, (maxX + 1) * s, (maxY + 1) * s)
    }

    fun decode(f: File): Bitmap? = try { BitmapFactory.decodeFile(f.absolutePath) } catch (_: Throwable) { null }
}
