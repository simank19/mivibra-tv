package co.mivibra.tv

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Carátulas sacadas del propio video: una imagen del contenido (sin descargarlo completo). */
object Thumbs {
    private val pool = Executors.newFixedThreadPool(2)
    private fun md5(s: String) = MessageDigest.getInstance("MD5").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }.take(20)
    fun dir(ctx: Context) = File(ctx.cacheDir, "thumbs").apply { mkdirs() }

    /** at: posición entre 0 y 1 del video (si no se sabe la duración, segundos fijos). */
    fun frame(ctx: Context, url: String, headers: JSONObject, at: Double): String {
        val name = md5(url + "|" + at) + ".jpg"
        val out = File(dir(ctx), name)
        if (out.isFile && out.length() > 0) return served(name)
        val job = pool.submit<Bitmap?> {
            val r = MediaMetadataRetriever()
            try {
                val h = HashMap<String, String>()
                headers.keys().forEach { k -> headers.optString(k).takeIf { it.isNotBlank() }?.let { h[k] = it } }
                if (!h.containsKey("User-Agent")) h["User-Agent"] = "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36"
                if (url.startsWith("http")) r.setDataSource(url, h) else r.setDataSource(url)
                val dur = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
                val us = if (dur > 0) (dur * at.coerceIn(0.02, 0.95) * 1000).toLong() else (60_000_000L * (at * 10).coerceAtLeast(1.0)).toLong()
                val w = 480
                val bm = if (android.os.Build.VERSION.SDK_INT >= 27) r.getScaledFrameAtTime(us, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, w, w * 2)
                    else r.getFrameAtTime(us, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
                bm ?: r.frameAtTime
            } catch (e: Throwable) { null } finally { try { r.release() } catch (e: Throwable) {} }
        }
        val got: Bitmap? = try { job.get(25, TimeUnit.SECONDS) } catch (e: Exception) { job.cancel(true); null }
        val bm = got ?: throw IllegalStateException("No se pudo sacar una imagen de este video")
        val scaled = if (bm.width > 480) Bitmap.createScaledBitmap(bm, 480, (bm.height * 480f / bm.width).toInt().coerceAtLeast(1), true) else bm
        out.outputStream().use { scaled.compress(Bitmap.CompressFormat.JPEG, 82, it) }
        // Solo se guardan las últimas 600 carátulas
        dir(ctx).listFiles()?.sortedByDescending { it.lastModified() }?.drop(600)?.forEach { it.delete() }
        return served(name)
    }
    private fun served(name: String) = "https://appassets.androidplatform.net/thumbs/$name"
}
