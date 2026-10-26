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

    /** BIOS conocidas que algunos núcleos necesitan (PlayStation, Lynx, Sega CD…). */
    val BIOS_NAMES = setOf(
        "scph5500.bin", "scph5501.bin", "scph5502.bin", "scph1001.bin", "scph7001.bin", "scph101.bin", "psxonpsp660.bin",
        "lynxboot.img", "bios_cd_u.bin", "bios_cd_e.bin", "bios_cd_j.bin", "bios7.bin", "bios9.bin", "firmware.bin",
        "neogeo.zip", "syscard3.pce", "7800 bios (u).rom",
    )

    fun importBios(ctx: Context, roots: List<String>): JSONArray {
        val sys = File(ctx.filesDir, "system").apply { mkdirs() }
        val copied = JSONArray()
        for (root in roots) {
            if (root.startsWith("content://")) continue
            File(root).walkTopDown().maxDepth(5).onEnter { !it.name.startsWith(".") && it.name != "Android" }.forEach { f ->
                if (f.isFile && f.name.lowercase() in BIOS_NAMES) {
                    f.copyTo(File(sys, f.name), overwrite = true)
                    copied.put(f.name)
                }
            }
        }
        return copied
    }
}
