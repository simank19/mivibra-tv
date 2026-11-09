package co.mivibra.tv

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Rect
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Marcos decorativos (bezels) por consola, de libretro/overlay-borders (licencia MIT).
 * Se descargan la primera vez que se juega esa consola y quedan guardados.
 */
object Overlays {
    private const val BASE = "https://raw.githubusercontent.com/libretro/overlay-borders/master/16x9%20Collections/"
    private const val NOSH = "Nosh01%201440%20Plain/"
    private const val NYNY = "NyNy77%201080%20Bezel/"

    private fun n(f: String) = NOSH + f + "-Bezel-16x9-2560x1440.png"
    private fun y(f: String) = NYNY + f + "-nyny77.png"

    /** Estilos por consola: el 1 (Nosh01, consola y control a los lados) y el 2 (NyNy77, pantalla tipo TV antigua). */
    private val STYLES: Map<String, List<String>> = mapOf(
        "nes" to listOf(n("Nintendo-Entertainment-System"), y("NintendoEntertainmentSystem")),
        "snes" to listOf(n("Super-Nintendo-Entertainment-System"), y("NintendoSuperNintendo")),
        "gb" to listOf(n("Nintendo-Game-Boy"), y("NintendoGameBoy")),
        "gbc" to listOf(n("Nintendo-Game-Boy-Color"), y("NintendoGameBoyColorBleu")),
        "gba" to listOf(n("Nintendo-Game-Boy-Advance")),
        "n64" to listOf(n("Nintendo-64"), y("NintendoN64")),
        "md" to listOf(n("Sega-Genesis"), y("SegaGenesis")),
        "sms" to listOf(n("Sega-Master-System"), y("SegaMasterSystem")),
        "gg" to listOf(n("Sega-Game-Gear"), y("SegaGameGear")),
        "psx" to listOf(n("Sony-Playstation"), y("SonyPlaystation")),
        "psp" to listOf(n("Sony-Playstation-Portable")),
        "a26" to listOf(n("Atari-2600"), y("Atari2600")),
        "a78" to listOf(n("Atari-7800"), y("Atari7800")),
        "lynx" to listOf(n("Atari-Lynx-Horizontal"), y("AtariLynxBezel")),
        "pce" to listOf(n("NEC-PC-Engine"), y("NECPCEngine")),
        "ngp" to listOf(n("SNK-Neo-Geo-Pocket-Color"), y("SNKNeoGeoPocketColor")),
        "ws" to listOf(n("Bandai-WonderSwan-Color-Horizontal"), y("BandaiWonderSwanColor")),
        "arcade" to listOf(n("MAME-Horizontal"), y("Mame")),
        "doom" to listOf(n("DOOM")),
        "dc" to listOf(y("SegaDreamcast")),
        "gc" to listOf(y("NintendoGameCube")),
    )

    fun available(sys: String) = sys in STYLES
    fun styleCount(sys: String) = STYLES[sys]?.size ?: 0

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("marcos", Context.MODE_PRIVATE)
    fun enabled(ctx: Context, sys: String) = available(sys) && prefs(ctx).getBoolean(sys, true)
    fun setEnabled(ctx: Context, sys: String, on: Boolean) { prefs(ctx).edit().putBoolean(sys, on).apply() }
    fun style(ctx: Context, sys: String) = prefs(ctx).getInt("style_$sys", 0).coerceIn(0, (styleCount(sys) - 1).coerceAtLeast(0))
    fun setStyle(ctx: Context, sys: String, i: Int) { prefs(ctx).edit().putInt("style_$sys", i).putBoolean(sys, true).apply() }
    fun styleName(i: Int) = "Marco ${i + 1}"

    fun file(ctx: Context, sys: String, i: Int = style(ctx, sys)) =
        File(File(ctx.filesDir, "marcos").apply { mkdirs() }, if (i == 0) "$sys.png" else "${sys}_$i.png")

    /** Descarga el marco elegido si falta. Devuelve el archivo o null si no se pudo. */
    fun fetch(ctx: Context, sys: String): File? {
        val i = style(ctx, sys)
        val f = file(ctx, sys, i)
        if (f.exists() && f.length() > 0) return f
        val path = STYLES[sys]?.getOrNull(i) ?: return null
        return try {
            val c = URL(BASE + path).openConnection() as HttpURLConnection
            c.connectTimeout = 15000; c.readTimeout = 30000
            if (c.responseCode != 200) return null
            val tmp = File(f.path + ".part")
            c.inputStream.use { inp -> tmp.outputStream().use { inp.copyTo(it, 64 * 1024) } }
            if (tmp.renameTo(f)) f else null
        } catch (_: Exception) { null }
    }

    /** Busca el hueco transparente (la "pantalla") alrededor del centro del marco. */
    fun hole(bmp: Bitmap): Rect? {
        val s = 4
        val w = bmp.width / s; val h = bmp.height / s
        val small = Bitmap.createScaledBitmap(bmp, w, h, false)
        val px = IntArray(w * h); small.getPixels(px, 0, w, 0, 0, w, h)
        if (small != bmp) small.recycle()
        fun clear(i: Int) = (px[i] ushr 24) < 40
        val start = (h / 2) * w + w / 2
        if (!clear(start)) return null
        val seen = BooleanArray(w * h); val q = IntArray(w * h); var head = 0; var tail = 0
        q[tail++] = start; seen[start] = true
        var minX = w; var minY = h; var maxX = 0; var maxY = 0
        while (head < tail) {
            val i = q[head++]; val x = i % w; val y = i / w
            if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y
            if (x > 0 && !seen[i - 1] && clear(i - 1)) { seen[i - 1] = true; q[tail++] = i - 1 }
            if (x < w - 1 && !seen[i + 1] && clear(i + 1)) { seen[i + 1] = true; q[tail++] = i + 1 }
            if (y > 0 && !seen[i - w] && clear(i - w)) { seen[i - w] = true; q[tail++] = i - w }
            if (y < h - 1 && !seen[i + w] && clear(i + w)) { seen[i + w] = true; q[tail++] = i + w }
        }
        return Rect(minX * s, minY * s, (maxX + 1) * s, (maxY + 1) * s)
    }

    fun decode(f: File): Bitmap? = try { BitmapFactory.decodeFile(f.absolutePath) } catch (_: Throwable) { null }
}
