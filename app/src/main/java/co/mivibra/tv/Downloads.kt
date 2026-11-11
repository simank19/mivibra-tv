package co.mivibra.tv

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Descargas para ver sin internet (películas y capítulos con archivo directo: mp4, mkv…).
 * Usa el administrador de descargas de Android: sigue aunque se cierre la app, se reanuda si se cae la red
 * y muestra el avance en la barra de notificaciones. Los archivos quedan en la carpeta privada de la app.
 */
object Downloads {
    private fun prefs(c: Context) = c.getSharedPreferences("descargas", Context.MODE_PRIVATE)
    private fun dir(c: Context) = File(c.getExternalFilesDir(Environment.DIRECTORY_MOVIES) ?: File(c.filesDir, "videos"), "MiVibra").apply { mkdirs() }

    private fun all(c: Context): JSONObject = try { JSONObject(prefs(c).getString("items", "{}") ?: "{}") } catch (_: Exception) { JSONObject() }
    private fun save(c: Context, o: JSONObject) { prefs(c).edit().putString("items", o.toString()).apply() }

    /** Solo se descargan archivos directos (no transmisiones en vivo ni listas HLS). */
    fun canDownload(url: String): Boolean {
        val u = url.lowercase().substringBefore('?')
        return u.startsWith("http") && !u.endsWith(".m3u8") && !u.endsWith(".mpd") && !u.contains("/live/")
    }

    fun start(c: Context, info: JSONObject): String {
        val key = info.getString("key"); val url = info.getString("url")
        if (!canDownload(url)) throw IllegalStateException("Este contenido es una transmisión y no se puede descargar")
        val items = all(c)
        items.optJSONObject(key)?.let { old -> if (old.optString("status") != "error") return "ya" }
        val ext = url.substringBefore('?').substringAfterLast('.', "mp4").take(4).lowercase().filter { it.isLetterOrDigit() }.ifBlank { "mp4" }
        val name = key.replace(Regex("[^A-Za-z0-9_-]"), "_").take(80) + "." + ext
        val file = File(dir(c), name); file.delete()
        val req = DownloadManager.Request(Uri.parse(url))
            .setTitle(info.optString("title", "MiVibra TV"))
            .setDescription(info.optString("sub", "Descargando para ver sin internet"))
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationUri(Uri.fromFile(file))
            .setAllowedOverMetered(info.optBoolean("mobile", true))
            .setAllowedOverRoaming(false)
        info.optString("ua").takeIf { it.isNotBlank() }?.let { req.addRequestHeader("User-Agent", it) }
        info.optString("ref").takeIf { it.isNotBlank() }?.let { req.addRequestHeader("Referer", it) }
        val dm = c.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val id = dm.enqueue(req)
        info.put("dmId", id).put("file", file.absolutePath).put("ts", System.currentTimeMillis()).put("status", "running")
        items.put(key, info); save(c, items)
        return "ok"
    }

    /** Lista con el estado y el avance de cada descarga. */
    fun list(c: Context): JSONArray {
        val items = all(c); val dm = c.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val out = JSONArray(); var changed = false
        items.keys().asSequence().toList().forEach { k ->
            val o = items.getJSONObject(k)
            if (o.optString("status") != "done") {
                try {
                    dm.query(DownloadManager.Query().setFilterById(o.optLong("dmId"))).use { cur ->
                        if (cur != null && cur.moveToFirst()) {
                            val st = cur.getInt(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
                            val done = cur.getLong(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
                            val total = cur.getLong(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
                            o.put("bytes", done).put("total", total)
                            val ns = when (st) {
                                DownloadManager.STATUS_SUCCESSFUL -> "done"
                                DownloadManager.STATUS_FAILED -> "error"
                                DownloadManager.STATUS_PAUSED -> "paused"
                                else -> "running"
                            }
                            if (ns != o.optString("status")) { o.put("status", ns); changed = true }
                        } else if (File(o.optString("file")).length() > 0) { o.put("status", "done"); changed = true }
                        else { o.put("status", "error"); changed = true }
                    }
                } catch (_: Exception) {}
            }
            val f = File(o.optString("file"))
            if (o.optString("status") == "done") { if (!f.exists()) { items.remove(k); changed = true; return@forEach }; o.put("bytes", f.length()).put("total", f.length()) }
            out.put(o)
        }
        if (changed) save(c, items)
        return out
    }

    fun remove(c: Context, key: String) {
        val items = all(c); val o = items.optJSONObject(key) ?: return
        try { (c.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).remove(o.optLong("dmId")) } catch (_: Exception) {}
        try { File(o.optString("file")).delete() } catch (_: Exception) {}
        items.remove(key); save(c, items)
    }

    /** Espacio libre en la carpeta de descargas (bytes). */
    fun free(c: Context): Long = try { dir(c).usableSpace } catch (_: Exception) { 0L }
}
