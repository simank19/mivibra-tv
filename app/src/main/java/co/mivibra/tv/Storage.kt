package co.mivibra.tv

import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.storage.StorageManager
import androidx.documentfile.provider.DocumentFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Memoria interna, USB y discos duros: listar, escanear ROMs y copiar archivos. */
object Storage {

    fun hasAllFilesAccess(ctx: Context): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) Environment.isExternalStorageManager()
        else ctx.checkSelfPermission(android.Manifest.permission.READ_EXTERNAL_STORAGE) == android.content.pm.PackageManager.PERMISSION_GRANTED

    fun roots(ctx: Context): JSONArray {
        val out = JSONArray()
        val seen = HashSet<String>()
        fun add(name: String, path: String, removable: Boolean) {
            val f = File(path)
            if (!f.exists() || !seen.add(f.absolutePath)) return
            out.put(JSONObject().put("name", name).put("path", f.absolutePath).put("removable", removable).put("readable", f.canRead()))
        }
        add("Memoria interna", Environment.getExternalStorageDirectory().absolutePath, false)
        try {
            val sm = ctx.getSystemService(Context.STORAGE_SERVICE) as StorageManager
            for (v in sm.storageVolumes) {
                val dir: File? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) v.directory else try {
                    v.javaClass.getMethod("getPathFile").invoke(v) as? File
                } catch (_: Exception) { null }
                if (dir != null) add(v.getDescription(ctx) ?: dir.name, dir.absolutePath, v.isRemovable)
            }
        } catch (_: Exception) {
        }
        // Algunos TV box montan USB/discos aquí sin reportarlos como volúmenes
        for (base in listOf("/storage", "/mnt/media_rw", "/mnt/usb", "/mnt/usb_storage")) {
            File(base).listFiles()?.forEach { f ->
                if (f.isDirectory && f.name != "self" && f.name != "emulated" && f.canRead()) add("USB / Disco (${f.name})", f.absolutePath, true)
            }
        }
        // Carpeta propia donde se guardan las ROMs descargadas
        ctx.getExternalFilesDir("roms")?.let { it.mkdirs(); add("Descargas de MiVibra", it.absolutePath, false) }
        return out
    }

    fun listDir(path: String): JSONArray {
        val out = JSONArray()
        val files = File(path).listFiles() ?: return out
        files.filter { !it.name.startsWith(".") }
            .sortedWith(compareBy({ !it.isDirectory }, { it.name.lowercase() }))
            .take(2000)
            .forEach { f ->
                out.put(JSONObject().put("name", f.name).put("path", f.absolutePath).put("dir", f.isDirectory).put("size", if (f.isFile) f.length() else 0))
            }
        return out
    }

    fun scan(ctx: Context, roots: List<String>, exts: Set<String>, limit: Int = 8000): JSONArray {
        val out = JSONArray()
        var n = 0
        fun put(name: String, path: String, size: Long) {
            val ext = name.substringAfterLast('.', "").lowercase()
            if (ext in exts && n < limit) {
                out.put(JSONObject().put("name", name).put("path", path).put("size", size).put("ext", ext))
                n++
            }
        }
        for (root in roots) {
            if (root.startsWith("content://")) {
                val doc = DocumentFile.fromTreeUri(ctx, Uri.parse(root)) ?: continue
                fun walk(d: DocumentFile, depth: Int) {
                    if (depth > 6 || n >= limit) return
                    for (c in d.listFiles()) {
                        val nm = c.name ?: continue
                        if (nm.startsWith(".")) continue
                        if (c.isDirectory) walk(c, depth + 1) else put(nm, c.uri.toString(), c.length())
                    }
                }
                walk(doc, 0)
            } else {
                File(root).walkTopDown()
                    .maxDepth(6)
                    .onEnter { !it.name.startsWith(".") && it.name != "Android" && it.name != "LOST.DIR" }
                    .forEach { f -> if (f.isFile) put(f.name, f.absolutePath, f.length()) }
            }
        }
        return out
    }

    /** Las ROMs que vienen del selector de Android (content://) se copian a la caché para el emulador. */
    fun toLocalFile(ctx: Context, path: String): File {
        if (!path.startsWith("content://")) return File(path)
        val uri = Uri.parse(path)
        val name = DocumentFile.fromSingleUri(ctx, uri)?.name ?: "juego.bin"
        val dest = File(File(ctx.cacheDir, "roms").apply { mkdirs() }, name)
        val size = DocumentFile.fromSingleUri(ctx, uri)?.length() ?: -1
        if (!dest.exists() || dest.length() != size) {
            ctx.contentResolver.openInputStream(uri)?.use { ins -> dest.outputStream().use { ins.copyTo(it) } }
        }
        return dest
    }

    fun readText(ctx: Context, path: String): String {
        val ins = if (path.startsWith("content://")) ctx.contentResolver.openInputStream(Uri.parse(path)) else File(path).inputStream()
        return ins?.let { Net.ungzip(it).use { s -> s.readBytes().toString(Charsets.UTF_8) } } ?: ""
    }

    // ---------------- ROMs dentro de .zip ----------------

    /** Extensiones de lo que hay dentro del .zip (las más grandes primero), para saber de qué consola es. */
    fun zipExts(path: String): JSONArray {
        val out = JSONArray()
        try {
            java.util.zip.ZipFile(path).use { z ->
                z.entries().toList().filter { !it.isDirectory && !it.name.contains("__MACOSX") }
                    .sortedByDescending { it.size }.take(8)
                    .forEach { out.put(it.name.substringAfterLast('.', "").lowercase()) }
            }
        } catch (_: Exception) {}
        return out
    }

    /**
     * Saca la ROM del .zip a la caché de la app (una sola vez) y devuelve la ruta del archivo a jugar.
     * Para PlayStation saca también los .bin del .cue. Se guardan como mucho 6 juegos descomprimidos.
     */
    fun unzipRom(ctx: Context, path: String, exts: List<String>): String {
        val base = File(ctx.cacheDir, "unzip").apply { mkdirs() }
        val src = File(path)
        val dir = File(base, Integer.toHexString((src.absolutePath + src.length() + src.lastModified()).hashCode()))
        java.util.zip.ZipFile(src).use { z ->
            val entries = z.entries().toList().filter { !it.isDirectory && !it.name.contains("__MACOSX") }
            val main = entries.filter { it.name.substringAfterLast('.', "").lowercase() in exts }.maxByOrNull { it.size }
                ?: throw IllegalStateException("El .zip no trae un juego de esta consola")
            val target = File(dir, File(main.name).name)
            if (target.exists() && target.length() == main.size) { dir.setLastModified(System.currentTimeMillis()); return target.absolutePath }
            dir.deleteRecursively(); dir.mkdirs()
            val need = entries.filter { it == main || File(it.name).parent == File(main.name).parent }
                .filter { it == main || it.name.substringAfterLast('.', "").lowercase() in setOf("bin", "img", "sub", "ccd", "iso", "cue", "m3u") }
            val total = need.sumOf { it.size.coerceAtLeast(0) }
            if (total > base.usableSpace - 100L * 1024 * 1024) throw IllegalStateException("No hay espacio para descomprimir el juego")
            for (e in need) {
                val out = File(dir, File(e.name).name)
                z.getInputStream(e).use { inp -> out.outputStream().buffered(256 * 1024).use { inp.copyTo(it, 256 * 1024) } }
            }
            // Limpieza: deja solo los 6 más recientes
            base.listFiles()?.filter { it.isDirectory && it != dir }?.sortedByDescending { it.lastModified() }?.drop(5)?.forEach { it.deleteRecursively() }
            return target.absolutePath
        }
    }

    /** BIOS conocidas que algunos núcleos necesitan (PlayStation, Lynx, Sega CD, Dreamcast…). */
    val BIOS_NAMES = setOf(
        "scph5500.bin", "scph5501.bin", "scph5502.bin", "scph1001.bin", "scph7001.bin", "scph101.bin", "psxonpsp660.bin",
        "lynxboot.img", "bios_cd_u.bin", "bios_cd_e.bin", "bios_cd_j.bin", "bios7.bin", "bios9.bin", "firmware.bin",
        "neogeo.zip", "syscard3.pce", "7800 bios (u).rom", "gba_bios.bin", "gb_bios.bin", "gbc_bios.bin",
        "dc_boot.bin", "dc_flash.bin", "sega_101.bin", "mpr-17933.bin", "saturn_bios.bin",
    )
    /** Estas van en una subcarpeta del directorio de sistema (como las espera el núcleo). */
    private val BIOS_SUBDIR = mapOf("dc_boot.bin" to "dc", "dc_flash.bin" to "dc")

    /** Carpeta de BIOS de RetroArch en la memoria compartida (la predeterminada de RetroArch para Android). */
    fun retroArchSystem(): File = File(android.os.Environment.getExternalStorageDirectory(), "RetroArch/system")

    fun importBios(ctx: Context, roots: List<String>): JSONArray {
        val sys = File(ctx.filesDir, "system").apply { mkdirs() }
        // También para RetroArch, si MiVibra puede escribir en la memoria compartida
        val ra = try { retroArchSystem().apply { mkdirs() }.takeIf { it.canWrite() } } catch (_: Exception) { null }
        val copied = JSONArray()
        for (root in roots) {
            if (root.startsWith("content://")) continue
            File(root).walkTopDown().maxDepth(5).onEnter { !it.name.startsWith(".") && it.name != "Android" && it.absolutePath != ra?.absolutePath }.forEach { f ->
                val low = f.name.lowercase()
                if (f.isFile && low in BIOS_NAMES) {
                    val sub = BIOS_SUBDIR[low]
                    for (base in listOfNotNull(sys, ra)) {
                        val dir = if (sub != null) File(base, sub).apply { mkdirs() } else base
                        try { f.copyTo(File(dir, f.name), overwrite = true) } catch (_: Exception) {}
                    }
                    copied.put(f.name)
                }
            }
        }
        return copied
    }
}
