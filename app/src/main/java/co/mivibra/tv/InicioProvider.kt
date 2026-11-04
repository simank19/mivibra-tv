package co.mivibra.tv

import android.content.ContentProvider
import android.content.ContentValues
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.os.Binder
import android.os.Bundle
import org.json.JSONObject
import java.io.File

/**
 * Puente con la app "Inicio MiVibra" (launcher): le entrega lo sugerido para el inicio y la clave de YouTube.
 * Solo responde a apps firmadas con la misma llave que MiVibra TV.
 */
class InicioProvider : ContentProvider() {
    override fun onCreate() = true

    private fun trusted(): Boolean {
        val c = context ?: return false
        val pm = c.packageManager
        val uid = Binder.getCallingUid()
        val pkgs = pm.getPackagesForUid(uid) ?: return false
        return pkgs.any { it != c.packageName && pm.checkSignatures(it, c.packageName) == PackageManager.SIGNATURE_MATCH } || uid == android.os.Process.myUid()
    }

    override fun call(method: String, arg: String?, extras: Bundle?): Bundle? {
        val c = context ?: return null
        if (!trusted()) throw SecurityException("Solo apps de MiVibra")
        val value = when (method) {
            "recs" -> HomeChannel.saved(c)
            "ytKey" -> try { JSONObject(File(c.filesDir, "inicio-datos.json").readText()).optString("ytKey") } catch (_: Exception) { "" }
            else -> return null
        }
        return Bundle().apply { putString("value", value) }
    }

    override fun query(uri: Uri, p: Array<out String>?, s: String?, a: Array<out String>?, o: String?): Cursor? = null
    override fun getType(uri: Uri): String? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, s: String?, a: Array<out String>?) = 0
    override fun update(uri: Uri, v: ContentValues?, s: String?, a: Array<out String>?) = 0
}
