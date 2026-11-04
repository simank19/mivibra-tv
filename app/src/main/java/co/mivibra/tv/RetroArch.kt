package co.mivibra.tv

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Environment
import org.json.JSONObject
import java.io.File

/**
 * Abrir juegos en la app RetroArch (opcional, se elige por consola en el frontend de juegos).
 * Usa la forma estándar de los frontends de Android: RetroActivityFuture con ROM, LIBRETRO y CONFIGFILE.
 * El núcleo debe estar descargado en RetroArch (Actualizador en línea → Descargar núcleos).
 */
object RetroArch {
    private val PACKAGES = listOf("com.retroarch.aarch64", "com.retroarch", "com.retroarch.ra32")
    private const val ACTIVITY = "com.retroarch.browser.retroactivity.RetroActivityFuture"

    fun pkg(c: Context): String? = PACKAGES.firstOrNull {
        try { c.packageManager.getPackageInfo(it, 0); true } catch (_: Exception) { false }
    }

    fun info(c: Context): String {
        val p = pkg(c)
        return JSONObject().put("installed", p != null).put("pkg", p ?: "")
            .put("bios", Storage.retroArchSystem().absolutePath).toString()
    }

    fun launch(c: Context, rom: String, core: String) {
        val p = pkg(c) ?: throw IllegalStateException("Instala RetroArch desde Play Store")
        require(core.matches(Regex("[a-z0-9_]+"))) { "Núcleo no válido" }
        val ai = c.packageManager.getApplicationInfo(p, 0)
        val sd = Environment.getExternalStorageDirectory().absolutePath
        val ext = "$sd/Android/data/$p/files"
        val i = Intent(Intent.ACTION_MAIN)
            .setComponent(ComponentName(p, ACTIVITY))
            .putExtra("ROM", rom)
            .putExtra("LIBRETRO", ai.dataDir + "/cores/" + core + "_libretro_android.so")
            .putExtra("CONFIGFILE", "$ext/retroarch.cfg")
            .putExtra("IME", "com.android.inputmethod.latin/.LatinIME")
            .putExtra("DATADIR", ai.dataDir)
            .putExtra("APK", ai.sourceDir)
            .putExtra("SDCARD", sd)
            .putExtra("EXTERNAL", ext)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        if (!File(rom).exists()) throw IllegalStateException("No se encuentra la ROM")
        c.startActivity(i)
    }
}
