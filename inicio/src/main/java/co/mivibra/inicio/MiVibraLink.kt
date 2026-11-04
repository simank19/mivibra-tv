package co.mivibra.inicio

import android.content.Context
import android.content.Intent
import android.net.Uri
import java.net.Inet4Address
import java.net.NetworkInterface

/**
 * Enlace con la app MiVibra TV (co.mivibra.tv). Ambas apps están firmadas con la misma llave:
 * MiVibra TV le entrega al inicio sus sugerencias y la clave de YouTube por un ContentProvider que solo responde a apps de MiVibra.
 */
object MiVibraLink {
    const val PKG = "co.mivibra.tv"
    private val URI = Uri.parse("content://co.mivibra.tv.inicio")

    private fun call(c: Context, method: String): String? = try {
        c.contentResolver.call(URI, method, null, null)?.getString("value")
    } catch (_: Exception) { null }

    fun installed(c: Context) = Apps.hasPackage(c, PKG)

    /** [{key,title,poster,type,play?,pct?}] lo que MiVibra TV publicó para el inicio. */
    fun recs(c: Context): String = call(c, "recs") ?: "[]"

    /** Clave de YouTube que el superadministrador puso en MiVibra TV. */
    fun ytKey(c: Context): String = call(c, "ytKey") ?: ""

    fun open(c: Context): Boolean = Apps.launch(c, PKG)

    /** play=true sigue viendo; si no, abre la ficha. */
    fun openItem(c: Context, key: String, play: Boolean): Boolean {
        val uri = Uri.parse("mivibra://" + (if (play) "play" else "open") + "?key=" + Uri.encode(key))
        return try {
            c.startActivity(Intent(Intent.ACTION_VIEW, uri).setPackage(PKG).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true
        } catch (_: Exception) { open(c) }
    }
}

object Net {
    fun localIp(): String? = try {
        NetworkInterface.getNetworkInterfaces()?.toList().orEmpty()
            .filter { it.isUp && !it.isLoopback }
            .flatMap { it.inetAddresses.toList() }
            .firstOrNull { it is Inet4Address && !it.isLoopbackAddress && it.isSiteLocalAddress }?.hostAddress
    } catch (_: Exception) { null }
}
