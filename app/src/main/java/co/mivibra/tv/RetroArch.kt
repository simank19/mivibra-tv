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
    private fun prefs(c: Context) = c.getSharedPreferences("ra_frame", Context.MODE_PRIVATE)
    /** En los TV, RetroArch suele dibujar a menor resolución que las apps (en las pruebas, 16:9 veces menos). */
    private fun defScale(c: Context) = if ((c.resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_TYPE_MASK) == android.content.res.Configuration.UI_MODE_TYPE_TELEVISION) 0.5625f else 1f
    fun raScale(c: Context) = prefs(c).getFloat("k", defScale(c))
    fun raOff(c: Context, a: String) = prefs(c).getFloat(a, 0f)
    /** what: bigger, smaller, left, right, up, down, reset */
    fun adjust(c: Context, what: String): String {
        val p = prefs(c); val e = p.edit(); val k = raScale(c)
        when (what) {
            "bigger" -> e.putFloat("k", k * 1.06f); "smaller" -> e.putFloat("k", k / 1.06f)
            "left" -> e.putFloat("x", raOff(c, "x") - 0.01f); "right" -> e.putFloat("x", raOff(c, "x") + 0.01f)
            "up" -> e.putFloat("y", raOff(c, "y") - 0.01f); "down" -> e.putFloat("y", raOff(c, "y") + 0.01f)
            "reset" -> e.clear()
        }
        e.apply()
        return JSONObject().put("k", raScale(c)).put("x", raOff(c, "x")).put("y", raOff(c, "y")).toString()
    }
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
            // Tamaño de la ventana de las apps (en muchos TV 4K las apps dibujan a 1920x1080, no a 3840x2160)
            val dm = c.resources.displayMetrics
            val sw = maxOf(dm.widthPixels, dm.heightPixels); val sh = minOf(dm.widthPixels, dm.heightPixels)
            // Ajuste fino guardado por equipo (tamaño y posición), porque RetroArch no siempre dibuja a la misma resolución que las apps
            val k = raScale(c); val dx = raOff(c, "x"); val dy = raOff(c, "y")
            val cw = hole.width() * sw / bw * k; val ch = hole.height() * sh / bh * k
            val cx = ((hole.left + hole.width() / 2.0) / bw + dx) * sw * k; val cy = ((hole.top + hole.height() / 2.0) / bh + dy) * sh * k
            val x = (cx - cw / 2).toInt().coerceAtLeast(0); val y = (cy - ch / 2).toInt().coerceAtLeast(0)
            val w = cw.toInt(); val h = ch.toInt()
            val ov = File(dir, "$sys.cfg")
            ov.writeText("overlays = 1\noverlay0_overlay = \"${png.name}\"\noverlay0_full_screen = true\noverlay0_descs = 0\n")
            val sd = Environment.getExternalStorageDirectory().absolutePath
            val cfg = File(dir, "retroarch-$sys.cfg")
            // RetroArch se queda con el PRIMER valor de cada ajuste: los del marco van primero y la configuración del usuario al final
            cfg.writeText((listOf(
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
                // Sin esto RetroArch pone su mando táctil de la consola encima del marco
                "input_overlay_enable_autopreferred = \"false\"",
                "input_overlay_show_inputs = \"0\"",
                "input_overlay_aspect_adjust_landscape = \"0.000000\"",
                "input_overlay_x_separation_landscape = \"0.000000\"", "input_overlay_y_separation_landscape = \"0.000000\"",
                "input_overlay_x_offset_landscape = \"0.000000\"", "input_overlay_y_offset_landscape = \"0.000000\"",
                "aspect_ratio_index = \"23\"",
                "video_scale_integer = \"false\"",
                "custom_viewport_x = \"$x\"", "custom_viewport_y = \"$y\"",
                "custom_viewport_width = \"$w\"", "custom_viewport_height = \"$h\"",
            ) + savesLines(c) + listOf("#include \"$sd/Android/data/$p/files/retroarch.cfg\"")).joinToString("\n") + "\n")
            return cfg.absolutePath
        } catch (e: Throwable) { lastWhy = e.message ?: "error"; return null }
    }

    /** Con Google Drive conectado, las partidas de RetroArch van a /MiVibra/RetroArch (así se pueden subir a Drive). */
    private fun savesLines(c: Context): List<String> {
        if (!Drive.connected(c)) return emptyList()
        val ra = File(Environment.getExternalStorageDirectory(), "MiVibra/RetroArch")
        val sv = File(ra, "saves").apply { mkdirs() }; val st = File(ra, "states").apply { mkdirs() }
        return listOf("savefile_directory = \"${sv.absolutePath}\"", "savestate_directory = \"${st.absolutePath}\"",
            "savefiles_in_content_dir = \"false\"", "savestates_in_content_dir = \"false\"")
    }
    /** Configuración para abrir el juego: marco (si hay) y carpetas de partidas (si Drive está conectado). */
    fun launchConfig(c: Context, sys: String): String? {
        overlayConfig(c, sys)?.let { return it }
        val extra = savesLines(c); if (extra.isEmpty()) return null
        val p = pkg(c) ?: return null
        val dir = File(Environment.getExternalStorageDirectory(), "MiVibra/RetroArch/marcos").apply { mkdirs() }
        if (!dir.canWrite()) return null
        val sd = Environment.getExternalStorageDirectory().absolutePath
        val cfg = File(dir, "retroarch-partidas.cfg")
        cfg.writeText((listOf("config_save_on_exit = \"false\"") + extra + listOf("#include \"$sd/Android/data/$p/files/retroarch.cfg\"")).joinToString("\n") + "\n")
        return cfg.absolutePath
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
