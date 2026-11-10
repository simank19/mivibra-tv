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

    /**
     * Si hay varias instaladas, se prefiere la de la página oficial (puede leer la carpeta /MiVibra/RetroArch);
     * la de Play Store queda de última porque solo abre juegos de sus propias carpetas.
     */
    fun pkg(c: Context): String? {
        val installed = PACKAGES.filter { try { c.packageManager.getPackageInfo(it, 0); true } catch (_: Exception) { false } }
        fun fromPlay(p: String) = try {
            @Suppress("DEPRECATION") c.packageManager.getInstallerPackageName(p) == "com.android.vending"
        } catch (_: Exception) { false }
        return installed.sortedBy { if (fromPlay(it)) 1 else 0 }.firstOrNull()
    }

    fun info(c: Context): String {
        val p = pkg(c)
        return JSONObject().put("installed", p != null).put("pkg", p ?: "")
            .put("bios", Storage.retroArchSystem().absolutePath).toString()
    }

    /**
     * Dónde quedó el núcleo. La versión de RetroArch de la web los guarda en {datos}/cores;
     * la de Play Store los instala como parte de la app (carpeta de librerías nativas, con prefijo "lib").
     */
    fun corePath(ai: android.content.pm.ApplicationInfo, core: String): String {
        val name = "${core}_libretro_android.so"
        val candidates = listOfNotNull(
            ai.nativeLibraryDir?.let { File(it, "lib$name") },
            ai.nativeLibraryDir?.let { File(it, name) },
        )
        candidates.firstOrNull { it.exists() }?.let { return it.absolutePath }
        return ai.dataDir + "/cores/" + name
    }

    private fun fromPlay(c: Context, p: String) = try {
        @Suppress("DEPRECATION") c.packageManager.getInstallerPackageName(p) == "com.android.vending"
    } catch (_: Exception) { false }

    /**
     * Marco (bezel) también en RetroArch: se arma una configuración que incluye la del usuario y le suma el marco
     * de la consola como "overlay", con la imagen del juego encajada en el hueco del marco.
     * Devuelve la ruta de esa configuración, o null si no aplica (marco apagado, sin descargar o RetroArch de Play Store).
     * Llamar fuera del hilo principal (puede descargar el marco).
     */
    @Volatile var lastWhy = ""
    fun overlayConfig(c: Context, sys: String): String? {
        lastWhy = ""
        try {
            val p = pkg(c) ?: return null
            if (sys.isBlank()) { lastWhy = "consola desconocida"; return null }
            if (!Overlays.available(sys)) { lastWhy = "esta consola no tiene marco"; return null }
            if (!Overlays.enabled(c, sys)) { lastWhy = "lo quitaste en Opciones › Emuladores"; return null }
            val src = Overlays.fetch(c, sys) ?: run { lastWhy = "no se pudo descargar el marco"; return null }
            val dir = File(Environment.getExternalStorageDirectory(), "MiVibra/RetroArch/marcos").apply { mkdirs() }
            if (!dir.canWrite()) { lastWhy = "sin permiso para guardar en la memoria"; return null }
            val png = File(dir, src.name)
            if (!png.exists() || png.length() != src.length()) src.copyTo(png, true)
            val bmp = Overlays.decode(src) ?: return null
            val hole = Overlays.hole(bmp); val bw = bmp.width; val bh = bmp.height; bmp.recycle()
            if (hole == null) { lastWhy = "el marco no tiene hueco para la pantalla"; return null }
            val dm = android.util.DisplayMetrics()
            @Suppress("DEPRECATION") (c.getSystemService(Context.WINDOW_SERVICE) as android.view.WindowManager).defaultDisplay.getRealMetrics(dm)
            val sw = maxOf(dm.widthPixels, dm.heightPixels); val sh = minOf(dm.widthPixels, dm.heightPixels)
            val x = hole.left * sw / bw; val y = hole.top * sh / bh
            val w = hole.width() * sw / bw; val h = hole.height() * sh / bh
            val ov = File(dir, "$sys.cfg")
            ov.writeText("overlays = 1\noverlay0_overlay = \"${png.name}\"\noverlay0_full_screen = true\noverlay0_descs = 0\n")
            val sd = Environment.getExternalStorageDirectory().absolutePath
            val cfg = File(dir, "retroarch-$sys.cfg")
            // RetroArch se queda con el PRIMER valor de cada ajuste: los del marco van primero y la configuración del usuario al final
            cfg.writeText(listOf(
                "config_save_on_exit = \"false\"",
                "video_aspect_ratio_auto = \"false\"",
                "input_overlay_enable = \"true\"",
                "input_overlay = \"${ov.absolutePath}\"",
                "input_overlay_opacity = \"1.000000\"",
                "input_overlay_scale_landscape = \"1.000000\"",
                "input_overlay_hide_in_menu = \"true\"",
                "input_overlay_hide_when_gamepad_connected = \"false\"",
                "input_overlay_auto_scale = \"false\"",
                "input_overlay_auto_rotate = \"false\"",
                "aspect_ratio_index = \"23\"",
                "video_scale_integer = \"false\"",
                "custom_viewport_x = \"$x\"", "custom_viewport_y = \"$y\"",
                "custom_viewport_width = \"$w\"", "custom_viewport_height = \"$h\"",
                "#include \"$sd/Android/data/$p/files/retroarch.cfg\""
            ).joinToString("\n") + "\n")
            return cfg.absolutePath
        } catch (e: Throwable) { lastWhy = e.message ?: "error"; return null }
    }

    fun launch(c: Context, rom: String, core: String, config: String? = null) {
        val p = pkg(c) ?: throw IllegalStateException("Instala RetroArch desde Play Store")
        require(core.matches(Regex("[a-z0-9_]+"))) { "Núcleo no válido" }
        val ai = c.packageManager.getApplicationInfo(p, 0)
        val sd = Environment.getExternalStorageDirectory().absolutePath
        val ext = "$sd/Android/data/$p/files"
        val i = Intent(Intent.ACTION_MAIN)
            .setComponent(ComponentName(p, ACTIVITY))
            .putExtra("ROM", rom)
            .putExtra("LIBRETRO", corePath(ai, core))
            .putExtra("CONFIGFILE", config ?: "$ext/retroarch.cfg")
            .putExtra("IME", "com.android.inputmethod.latin/.LatinIME")
            .putExtra("DATADIR", ai.dataDir)
            .putExtra("APK", ai.sourceDir)
            .putExtra("SDCARD", sd)
            .putExtra("EXTERNAL", ext)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        if (!File(rom).exists()) throw IllegalStateException("No se encuentra la ROM")
        // Si RetroArch quedó abierto de la vez anterior (se salió con Inicio), queda trabado al recibir otro juego:
        // se cierra primero (solo funciona porque está en segundo plano mientras MiVibra está en pantalla)
        try { (c.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager).killBackgroundProcesses(p) } catch (_: Exception) {}
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({ try { c.startActivity(i) } catch (_: Exception) {} }, 400)
    }
}
