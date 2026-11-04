package co.mivibra.inicio

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.database.Cursor
import android.media.tv.TvContract
import android.net.Uri
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Filas oficiales de Android TV que publican las apps (YouTube, Netflix, Prime…):
 * "Continuar viendo" (Watch Next) y sus canales de sugerencias (Recomendado, Suscripciones…).
 * Es lo mismo que muestra el inicio de Google; requiere el permiso "leer las listas de TV" (READ_EPG_DATA).
 */
object TvRows {
    const val PERMISSION = "com.android.providers.tv.permission.READ_EPG_DATA"
    const val LISTINGS = "android.permission.READ_TV_LISTINGS"

    fun supported() = Build.VERSION.SDK_INT >= 26
    fun granted(c: Context) = c.checkSelfPermission(PERMISSION) == PackageManager.PERMISSION_GRANTED

    /** Para el diagnóstico: cuántas filas deja leer el sistema. */
    fun debug(c: Context): String {
        fun count(u: Uri) = try { c.contentResolver.query(u, null, null, null, null)?.use { it.count }?.toString() ?: "null" } catch (e: Exception) { "error: " + e.message }
        return "watchNext=" + count(TvContract.WatchNextPrograms.CONTENT_URI) + " channels=" + count(TvContract.Channels.CONTENT_URI) +
            " listings=" + (c.checkSelfPermission(LISTINGS) == PackageManager.PERMISSION_GRANTED)
    }

    private fun Cursor.str(col: String): String = getColumnIndex(col).let { if (it >= 0 && !isNull(it)) getString(it) ?: "" else "" }
    private fun Cursor.num(col: String): Long = getColumnIndex(col).let { if (it >= 0 && !isNull(it)) getLong(it) else 0L }

    private fun label(c: Context, pkg: String) = try { c.packageManager.getApplicationInfo(pkg, 0).loadLabel(c.packageManager).toString() } catch (_: Exception) { pkg }

    /** Las imágenes content:// solo las puede abrir esta app: se copian a la caché y se sirven por /icons/. */
    private fun image(c: Context, raw: String): String {
        if (raw.isBlank()) return ""
        if (raw.startsWith("http")) return raw
        return try {
            val name = "tv_" + Integer.toHexString(raw.hashCode()) + ".img"
            val f = File(Apps.iconDir(c), name)
            if (!f.exists() || f.length() == 0L) {
                c.contentResolver.openInputStream(Uri.parse(raw))?.use { inp -> f.outputStream().use { inp.copyTo(it) } }
            }
            if (f.length() > 0) "/icons/$name" else ""
        } catch (_: Exception) { "" }
    }

    private fun item(c: Context, cur: Cursor, pkg: String): JSONObject? {
        val intent = cur.str("intent_uri")
        if (intent.isBlank()) return null
        val poster = cur.str("poster_art_uri")
        val thumb = cur.str("thumbnail_uri")
        // Aspecto: 0=16:9, 1=3:2, 2=4:3, 3=1:1, 4=2:3 (póster)
        val aspect = cur.getColumnIndex("poster_art_aspect_ratio").let { if (it >= 0 && !cur.isNull(it)) cur.getInt(it) else 0 }
        val img = image(c, poster.ifBlank { thumb })
        val pos = cur.num("last_playback_position_millis")
        val dur = cur.num("duration_millis")
        val ep = cur.str("episode_title")
        return JSONObject()
            .put("title", cur.str("title"))
            .put("sub", ep.ifBlank { cur.str("short_description") })
            .put("img", img)
            .put("poster", aspect == 4)
            .put("intent", intent)
            .put("pkg", pkg)
            .put("pct", if (dur > 0 && pos > 0) minOf(99L, pos * 100 / dur) else 0L)
    }

    /** Continuar viendo de todas las apps, lo más reciente primero. */
    fun watchNext(c: Context): JSONArray {
        val out = JSONArray()
        if (!supported() || !granted(c)) return out
        val rows = ArrayList<Pair<Long, JSONObject>>()
        try {
            c.contentResolver.query(TvContract.WatchNextPrograms.CONTENT_URI, null, null, null, null)?.use { cur ->
                while (cur.moveToNext()) {
                    val pkg = cur.str("package_name")
                    if (pkg.isBlank() || pkg == c.packageName || cur.num("browsable") == 0L && cur.getColumnIndex("browsable") >= 0) continue
                    val o = item(c, cur, pkg) ?: continue
                    o.put("app", label(c, pkg))
                    rows.add(cur.num("last_engagement_time_utc_millis") to o)
                }
            }
        } catch (_: Exception) {}
        rows.sortedByDescending { it.first }.take(25).forEach { out.put(it.second) }
        return out
    }

    /** Canales de sugerencias de las apps indicadas: [{pkg, app, name, items:[...]}] */
    fun channels(c: Context, pkgs: Set<String>): JSONArray {
        val out = JSONArray()
        if (!supported() || !granted(c)) return out
        try {
            c.contentResolver.query(TvContract.Channels.CONTENT_URI, null, null, null, null)?.use { cur ->
                while (cur.moveToNext()) {
                    val pkg = cur.str("package_name")
                    if (pkg !in pkgs || cur.str("type") != TvContract.Channels.TYPE_PREVIEW) continue
                    if (cur.getColumnIndex("browsable") >= 0 && cur.num("browsable") == 0L) continue
                    val id = cur.num("_id")
                    val items = JSONArray()
                    try {
                        c.contentResolver.query(TvContract.buildPreviewProgramsUriForChannel(id), null, null, null, null)?.use { pc ->
                            val list = ArrayList<Pair<Long, JSONObject>>()
                            while (pc.moveToNext()) {
                                if (pc.getColumnIndex("browsable") >= 0 && pc.num("browsable") == 0L) continue
                                item(c, pc, pkg)?.let { list.add(pc.num("weight") to it) }
                            }
                            list.sortedByDescending { it.first }.take(20).forEach { items.put(it.second) }
                        }
                    } catch (_: Exception) {}
                    if (items.length() == 0) continue
                    out.put(JSONObject().put("pkg", pkg).put("app", label(c, pkg)).put("name", cur.str("display_name")).put("items", items))
                }
            }
        } catch (_: Exception) {}
        return out
    }

    fun open(c: Context, uri: String): Boolean = try {
        val i = Intent.parseUri(uri, Intent.URI_INTENT_SCHEME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        c.startActivity(i); true
    } catch (_: Exception) {
        try { c.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(uri)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true } catch (_: Exception) { false }
    }
}
