package co.mivibra.tv

import android.annotation.SuppressLint
import android.content.ContentUris
import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import androidx.tvprovider.media.tv.Channel
import androidx.tvprovider.media.tv.ChannelLogoUtils
import androidx.tvprovider.media.tv.PreviewProgram
import androidx.tvprovider.media.tv.TvContractCompat
import org.json.JSONArray

/**
 * Fila "MiVibra · Recomendado" en la pantalla de inicio de Android TV (como "Mi lista" de YouTube).
 * La app le pasa los títulos sugeridos del perfil; al elegir uno se abre su ficha en MiVibra.
 */
object HomeChannel {
    @SuppressLint("RestrictedApi")
    fun publish(c: Context, json: String) {
        if (Build.VERSION.SDK_INT < 26 || !c.packageManager.hasSystemFeature("android.software.leanback")) return
        val app = c.applicationContext
        Thread {
            try {
                val prefs = app.getSharedPreferences("homech", Context.MODE_PRIVATE)
                var id = prefs.getLong("id", -1L)
                if (id >= 0) {
                    val exists = app.contentResolver.query(TvContractCompat.buildChannelUri(id), null, null, null, null)?.use { it.moveToFirst() } ?: false
                    if (!exists) id = -1L
                }
                if (id < 0) {
                    val ch = Channel.Builder()
                        .setType(TvContractCompat.Channels.TYPE_PREVIEW)
                        .setDisplayName("MiVibra · Recomendado")
                        .setAppLinkIntentUri(Uri.parse("mivibra://home"))
                        .build()
                    val uri = app.contentResolver.insert(TvContractCompat.Channels.CONTENT_URI, ch.toContentValues()) ?: return@Thread
                    id = ContentUris.parseId(uri)
                    prefs.edit().putLong("id", id).apply()
                    try {
                        BitmapFactory.decodeResource(app.resources, R.mipmap.ic_launcher)?.let { ChannelLogoUtils.storeChannelLogo(app, id, it) }
                    } catch (_: Throwable) {}
                    // La primera fila de la app se muestra sola en el inicio
                    try { TvContractCompat.requestChannelBrowsable(app, id) } catch (_: Throwable) {}
                }
                app.contentResolver.delete(TvContractCompat.buildPreviewProgramsUriForChannel(id), null, null)
                val arr = JSONArray(json)
                for (i in 0 until minOf(arr.length(), 24)) {
                    val o = arr.optJSONObject(i) ?: continue
                    val key = o.optString("key")
                    val poster = o.optString("poster")
                    if (key.isBlank() || !poster.startsWith("http")) continue
                    val b = PreviewProgram.Builder()
                        .setChannelId(id)
                        .setType(if (o.optString("type") == "series") TvContractCompat.PreviewPrograms.TYPE_TV_SERIES else TvContractCompat.PreviewPrograms.TYPE_MOVIE)
                        .setTitle(o.optString("title"))
                        .setDescription(o.optString("desc"))
                        .setPosterArtUri(Uri.parse(poster))
                        .setPosterArtAspectRatio(TvContractCompat.PreviewPrograms.ASPECT_RATIO_MOVIE_POSTER)
                        .setIntentUri(Uri.parse("mivibra://open?key=" + Uri.encode(key)))
                        .setInternalProviderId(key)
                        .setWeight(1000 - i)
                    app.contentResolver.insert(TvContractCompat.PreviewPrograms.CONTENT_URI, b.build().toContentValues())
                }
            } catch (_: Throwable) {
                // Lanzadores sin filas de apps: no pasa nada
            }
        }.start()
    }
}
