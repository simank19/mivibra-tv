package co.mivibra.tv

import android.annotation.SuppressLint
import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.os.Build
import androidx.media3.common.Player
import androidx.tvprovider.media.tv.TvContractCompat
import androidx.tvprovider.media.tv.WatchNextProgram
import org.json.JSONObject

/**
 * "Continuar viendo" en la pantalla de inicio de Android TV (fila del sistema, como YouTube o Netflix).
 * Al pausar o salir de una película o episodio se agrega o actualiza; al terminarla se quita.
 * Al elegirla desde el inicio abre MiVibra y sigue donde iba (mivibra://play?key=…).
 */
object WatchNext {
    private fun prefs(c: Context) = c.getSharedPreferences("watchnext", Context.MODE_PRIVATE)

    fun supported(c: Context) = Build.VERSION.SDK_INT >= 26 && c.packageManager.hasSystemFeature("android.software.leanback")

    fun update(c: Context, item: JSONObject, p: Player?, live: Boolean) {
        if (live || p == null || !supported(c)) return
        val key = item.optString("id")
        if (key.isBlank() || key.startsWith("radio:")) return
        val pos = p.currentPosition
        val dur = p.duration
        val title = item.optString("title")
        val sub = item.optString("subtitle")
        val poster = item.optString("poster")
        val app = c.applicationContext
        Thread { save(app, key, title, sub, poster, pos, dur) }.start()
    }

    @SuppressLint("RestrictedApi")
    private fun save(c: Context, key: String, title: String, sub: String, poster: String, pos: Long, dur: Long) {
        try {
            val pr = prefs(c)
            val existing = pr.getLong(key, -1L)
            if (dur <= 0 || pos < 30_000) return
            // Casi terminada: se quita de "Continuar viendo"
            if (dur - pos < 120_000) {
                if (existing >= 0) {
                    c.contentResolver.delete(TvContractCompat.buildWatchNextProgramUri(existing), null, null)
                    pr.edit().remove(key).apply()
                }
                return
            }
            val episode = key.contains("#")
            val b = WatchNextProgram.Builder()
                .setWatchNextType(TvContractCompat.WatchNextPrograms.WATCH_NEXT_TYPE_CONTINUE)
                .setType(if (episode) TvContractCompat.WatchNextPrograms.TYPE_TV_EPISODE else TvContractCompat.WatchNextPrograms.TYPE_MOVIE)
                .setTitle(title)
                .setLastEngagementTimeUtcMillis(System.currentTimeMillis())
                .setLastPlaybackPositionMillis(pos.toInt())
                .setDurationMillis(dur.toInt())
                .setIntentUri(Uri.parse("mivibra://play?key=" + Uri.encode(key)))
                .setInternalProviderId(key)
            if (episode && sub.isNotBlank()) b.setEpisodeTitle(sub)
            if (poster.startsWith("http")) {
                b.setPosterArtUri(Uri.parse(poster))
                b.setPosterArtAspectRatio(TvContractCompat.PreviewPrograms.ASPECT_RATIO_MOVIE_POSTER)
            }
            val values = b.build().toContentValues()
            var updated = 0
            if (existing >= 0) updated = c.contentResolver.update(TvContractCompat.buildWatchNextProgramUri(existing), values, null, null)
            if (updated <= 0) {
                val uri = c.contentResolver.insert(TvContractCompat.WatchNextPrograms.CONTENT_URI, values) ?: return
                pr.edit().putLong(key, ContentUris.parseId(uri)).apply()
            }
        } catch (_: Throwable) {
            // Lanzadores sin "Continuar viendo": no pasa nada
        }
    }
}
