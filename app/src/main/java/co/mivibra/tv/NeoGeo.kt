package co.mivibra.tv

import android.content.Context
import org.json.JSONObject
import java.io.File

/**
 * Reconoce juegos de Neo Geo aunque el .zip tenga otro nombre ("King of Fighters 98.zip"):
 * compara las huellas (CRC) de los archivos de adentro con la lista de FBNeo, y luego
 * le pone al .zip el nombre corto que el emulador exige (kof98.zip) junto a la BIOS neogeo.zip.
 */
object NeoGeo {
    private class Set(val name: String, val title: String, val parent: String?, val crcs: HashSet<Long>)
    @Volatile private var db: List<Set>? = null

    private fun load(ctx: Context): List<Set> {
        db?.let { return it }
        val o = JSONObject(ctx.assets.open("neogeo.json").bufferedReader().use { it.readText() })
        val out = ArrayList<Set>()
        for (k in o.keys()) {
            val g = o.getJSONObject(k); val c = g.getJSONArray("c")
            val crcs = HashSet<Long>(); for (i in 0 until c.length()) crcs.add(c.getString(i).toLong(16))
            out.add(Set(k, g.optString("t").substringBefore(" / ").trim(), g.optString("p").takeIf { it.isNotEmpty() && it != "null" }, crcs))
        }
        db = out
        return out
    }

    private fun entryCrcs(path: String): List<Long> {
        if (path.lowercase().endsWith(".7z")) {
            if (android.os.Build.VERSION.SDK_INT < 26) return emptyList()
            return SevenZ.crcs(File(path))
        }
        java.util.zip.ZipFile(path).use { z -> return z.entries().toList().filter { !it.isDirectory }.map { it.crc } }
    }

    /** {set, title, parent} si es un juego de Neo Geo; null si no. */
    fun identify(ctx: Context, path: String): JSONObject? {
        val low = path.lowercase()
        if (!low.endsWith(".zip") && !low.endsWith(".7z")) return null
        val base = File(path).nameWithoutExtension.lowercase()
        val sets = load(ctx)
        sets.firstOrNull { it.name == base }?.let { return JSONObject().put("set", it.name).put("title", it.title).put("parent", it.parent ?: "") }
        val have = try { entryCrcs(path).toHashSet() } catch (_: Throwable) { return null }
        if (have.isEmpty()) return null
        var best: Set? = null; var bestScore = 0.0
        for (s in sets) {
            if (s.crcs.isEmpty()) continue
            val hit = s.crcs.count { it in have }
            if (hit == 0) continue
            val score = hit.toDouble() / s.crcs.size + hit * 1e-4
            if (score > bestScore) { bestScore = score; best = s }
        }
        val b = best ?: return null
        if (bestScore < 0.6) return null
        return JSONObject().put("set", b.name).put("title", b.title).put("parent", b.parent ?: "")
    }

    /**
     * Deja el juego listo para FBNeo: con el nombre corto correcto y la BIOS al lado.
     * Lo enviado desde el celular se renombra; lo de la USB se copia una vez a la carpeta de la app.
     */
    fun prepare(ctx: Context, path: String, set: String): JSONObject {
        val src = File(path)
        val ext = src.extension.lowercase()
        val own = ctx.getExternalFilesDir(null)?.absolutePath?.let { path.startsWith(it) } == true
        var game = src
        if (src.nameWithoutExtension.lowercase() != set) {
            val dir = if (own) src.parentFile!! else File(ctx.filesDir, "arcade").apply { mkdirs() }
            val target = File(dir, "$set.$ext")
            if (own && !target.exists() && src.renameTo(target)) game = target
            else {
                if (!target.exists() || target.length() != src.length()) src.copyTo(target, overwrite = true)
                game = target
            }
        }
        // BIOS neogeo.zip junto al juego (FBNeo la busca en la misma carpeta o en system/fbneo)
        val dir = game.parentFile!!
        val bios = File(dir, "neogeo.zip")
        if (!bios.exists()) {
            val from = listOf(File(ctx.filesDir, "system/neogeo.zip"), File(ctx.filesDir, "system/fbneo/neogeo.zip"),
                File(ctx.getExternalFilesDir("roms") ?: ctx.filesDir, "_bios/neogeo.zip")).firstOrNull { it.exists() }
            if (from != null) try { from.copyTo(bios, overwrite = true) } catch (_: Exception) {}
        }
        return JSONObject().put("path", game.absolutePath).put("bios", bios.exists()).put("renamed", game.absolutePath != path)
    }
}
