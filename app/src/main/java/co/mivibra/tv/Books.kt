package co.mivibra.tv

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

/**
 * Lector de libros y mangas: descarga el archivo (PDF, EPUB, CBZ, CBR, CB7) a la caché y lo deja listo
 * para la interfaz, servido en https://appassets.androidplatform.net/books/…
 *  - PDF: el archivo tal cual (lo dibuja pdf.js).
 *  - EPUB: descomprimido conservando sus carpetas (la interfaz lee el índice y muestra cada capítulo).
 *  - Cómics y mangas (zip/rar/7z): solo las imágenes, en el orden de lectura.
 */
object Books {
    private val IMG = Regex("\\.(jpe?g|png|webp|gif|bmp|avif)$", RegexOption.IGNORE_CASE)
    fun dir(ctx: Context) = File(ctx.cacheDir, "books").apply { mkdirs() }
    private fun served(ctx: Context, f: File): String {
        val rel = f.canonicalPath.removePrefix(dir(ctx).canonicalPath).trimStart('/')
        return "https://appassets.androidplatform.net/books/" + rel.split('/').joinToString("/") { android.net.Uri.encode(it) }
    }
    private fun md5(s: String) = MessageDigest.getInstance("MD5").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }.take(16)

    /** Orden natural: "2.jpg" antes que "10.jpg" (capítulos y páginas). */
    private val natural = Comparator<String> { a, b ->
        val ra = Regex("\\d+|\\D+").findAll(a.lowercase()).map { it.value }.toList()
        val rb = Regex("\\d+|\\D+").findAll(b.lowercase()).map { it.value }.toList()
        for (i in 0 until minOf(ra.size, rb.size)) {
            val x = ra[i]; val y = rb[i]
            val c = if (x[0].isDigit() && y[0].isDigit()) (x.trimStart('0').length - y.trimStart('0').length).let { if (it != 0) it else x.trimStart('0').compareTo(y.trimStart('0')) } else x.compareTo(y)
            if (c != 0) return@Comparator c
        }
        ra.size - rb.size
    }

    private fun sniff(f: File): String {
        val h = ByteArray(8); f.inputStream().use { it.read(h) }
        return when {
            h[0] == '%'.code.toByte() && h[1] == 'P'.code.toByte() && h[2] == 'D'.code.toByte() && h[3] == 'F'.code.toByte() -> "pdf"
            h[0] == 'R'.code.toByte() && h[1] == 'a'.code.toByte() && h[2] == 'r'.code.toByte() -> "rar"
            h[0] == '7'.code.toByte() && h[1] == 'z'.code.toByte() -> "7z"
            h[0] == 'P'.code.toByte() && h[1] == 'K'.code.toByte() -> {
                val epub = try { java.util.zip.ZipFile(f).use { z -> z.getEntry("mimetype")?.let { e -> z.getInputStream(e).use { String(it.readBytes()).trim() } } == "application/epub+zip" } } catch (_: Exception) { false }
                if (epub) "epub" else "zip"
            }
            else -> "?"
        }
    }

    fun open(ctx: Context, o: JSONObject, tick: (Int) -> Unit): JSONObject {
        val src = o.optString("url").ifBlank { o.optString("path") }
        if (src.isBlank()) throw IllegalArgumentException("Falta el archivo")
        val key = md5(src)
        val base = dir(ctx)
        // Descarga (o archivo del equipo)
        val isMega = src.startsWith("mega:") || Mega.parse(src) != null
        val file: File = if (isMega) {
            // MEGA: se descarga y se descifra con la clave del enlace
            val prev = listOf("pdf", "epub", "zip", "rar", "7z").map { File(base, "$key.$it") }.firstOrNull { it.isFile && it.length() > 0 }
            val f = prev ?: File(base, "$key.bin")
            if (prev == null && (!f.isFile || f.length() == 0L)) Mega.download(src, f) { tick(it) }
            f
        } else if (src.startsWith("http")) {
            // Si ya se descargó antes (con su formato ya reconocido) no se vuelve a bajar
            val prev = listOf("pdf", "epub", "zip", "rar", "7z").map { File(base, "$key.$it") }.firstOrNull { it.isFile && it.length() > 0 }
            val f = prev ?: File(base, "$key.bin")
            if (prev == null && (!f.isFile || f.length() == 0L)) {
                val h = HashMap<String, String>()
                o.optString("ua").takeIf { it.isNotBlank() }?.let { h["User-Agent"] = it }
                o.optString("ref").takeIf { it.isNotBlank() }?.let { h["Referer"] = it }
                o.optString("auth").takeIf { it.isNotBlank() }?.let { h["Authorization"] = it }
                Fetch.get(src, f, h, decompress = false, tick = tick)
            }
            f
        } else File(src)
        if (!file.isFile) throw IllegalStateException("No se encontró el archivo")
        clean(base, key)
        val kind = sniff(file)
        // Lo descargado queda con la extensión de su formato (los comprimidos se reconocen por la extensión)
        val file2 = if (file.parentFile?.canonicalPath == base.canonicalPath && file.name == "$key.bin" && kind != "?") File(base, "$key.$kind").also { file.renameTo(it) } else file
        return when (kind) {
            "pdf" -> JSONObject().put("fmt", "pdf").put("url", served(ctx, if (file2.parentFile?.canonicalPath == base.canonicalPath) file2 else File(base, "$key.pdf").also { if (!it.exists()) file2.copyTo(it) }))
            "epub" -> {
                val out = File(base, key)
                if (!File(out, ".ok").exists()) {
                    out.deleteRecursively(); out.mkdirs()
                    java.util.zip.ZipFile(file2).use { z ->
                        for (e in z.entries()) {
                            if (e.isDirectory) continue
                            val t = File(out, e.name)
                            if (!t.canonicalPath.startsWith(out.canonicalPath + File.separator)) continue   // sin rutas tramposas
                            t.parentFile?.mkdirs()
                            z.getInputStream(e).use { i -> t.outputStream().use { i.copyTo(it) } }
                        }
                    }
                    File(out, ".ok").writeText("1")
                }
                val ef = if (file2.parentFile?.canonicalPath == base.canonicalPath) file2 else File(base, "$key.epub").also { if (!it.exists()) file2.copyTo(it) }
                JSONObject().put("fmt", "epub").put("base", served(ctx, out) + "/").put("file", served(ctx, ef))
            }
            "zip", "rar", "7z" -> {
                val out = File(base, key)
                // Archivos del equipo (.cbz, .cbr…) se copian con la extensión que se reconoce (zip, rar, 7z)
                val arch = if (file2.parentFile?.canonicalPath == base.canonicalPath) file2 else File(base, "$key.$kind").also { if (!it.exists()) file2.copyTo(it) }
                val path = arch.path
                val names = Archives.list(path).map { it.first }.filter { IMG.containsMatchIn(it) && !it.contains("__MACOSX") }.sortedWith(natural)
                if (names.isEmpty()) throw IllegalStateException("El archivo no trae páginas (imágenes)")
                val pages = JSONArray()
                if (!File(out, ".ok").exists()) {
                    out.deleteRecursively(); out.mkdirs()
                    // Cada carpeta (capítulo) en su propia subcarpeta: así "001.jpg" de dos capítulos no se pisan
                    val folders = names.map { it.substringBeforeLast('/', "") }.distinct()
                    var done = 0L; val total = Archives.list(path).filter { it.first in names }.sumOf { it.second }.coerceAtLeast(1)
                    folders.forEachIndexed { i, fo ->
                        Archives.extract(path, names.filter { it.substringBeforeLast('/', "") == fo }.toSet(), File(out, i.toString())) { n -> done += n; tick((done * 100 / total).toInt().coerceAtMost(100)) }
                    }
                    File(out, ".ok").writeText("1")
                }
                val folders = names.map { it.substringBeforeLast('/', "") }.distinct()
                for (n in names) pages.put(served(ctx, File(File(out, folders.indexOf(n.substringBeforeLast('/', "")).toString()), n.substringAfterLast('/'))))
                JSONObject().put("fmt", "comic").put("pages", pages)
            }
            else -> throw IllegalStateException("Formato no compatible (usa PDF, EPUB, CBZ, CBR o CB7)")
        }
    }

    // ---------- Colecciones: comprimidos (.zip, .rar, .7z) con muchos libros adentro ----------
    private val BOOKF = Regex("\\.(pdf|epub|cbz|cbr|cb7)$", RegexOption.IGNORE_CASE)
    private fun packDir(ctx: Context) = File(ctx.cacheDir, "packs").apply { mkdirs() }

    /** Baja (o reutiliza) el comprimido de la colección. Se guardan los últimos 3. */
    private fun packFile(ctx: Context, o: JSONObject, tick: (Int) -> Unit): File {
        val src = o.optString("url").ifBlank { o.optString("path") }
        if (src.isBlank()) throw IllegalArgumentException("Falta el archivo")
        val d = packDir(ctx); val key = md5(src)
        listOf("zip", "rar", "7z").map { File(d, "$key.$it") }.firstOrNull { it.isFile && it.length() > 0 }?.let { it.setLastModified(System.currentTimeMillis()); return it }
        val f = File(d, "$key.bin")
        when {
            src.startsWith("mega:") || src.startsWith("http") -> {
                val h = HashMap<String, String>()
                o.optString("ua").takeIf { it.isNotBlank() }?.let { h["User-Agent"] = it }
                o.optString("ref").takeIf { it.isNotBlank() }?.let { h["Referer"] = it }
                o.optString("auth").takeIf { it.isNotBlank() }?.let { h["Authorization"] = it }
                // Drive (aviso de archivo grande), MediaFire, Dropbox…: se sigue hasta el archivo de verdad
                Fetch.get(src, f, h, decompress = false, tick = tick)
            }
            else -> File(src).copyTo(f, true)
        }
        val kind = sniff(f)
        if (kind !in setOf("zip", "rar", "7z")) { f.delete(); throw IllegalStateException("No es un comprimido .zip, .rar o .7z") }
        val out = File(d, "$key.$kind"); f.renameTo(out)
        // Solo las 3 colecciones más recientes
        val groups = (d.listFiles() ?: emptyArray()).groupBy { it.name.substringBefore('.').substringBefore('_') }
        groups.filterKeys { it != key }.entries.sortedByDescending { e -> e.value.maxOf { it.lastModified() } }.drop(2).forEach { e -> e.value.forEach { it.deleteRecursively() } }
        return out
    }

    /** Libros que trae el comprimido (si no trae libros, es un cómic: se abre como siempre). */
    fun packList(ctx: Context, o: JSONObject, tick: (Int) -> Unit): JSONObject {
        val f = packFile(ctx, o, tick)
        val arr = JSONArray()
        for ((n, size) in Archives.list(f.path)) if (BOOKF.containsMatchIn(n) && !n.contains("__MACOSX")) arr.put(JSONObject().put("name", n).put("size", size))
        return JSONObject().put("entries", arr)
    }

    /** Saca un libro del comprimido y devuelve su ruta para abrirlo. */
    fun packEntry(ctx: Context, o: JSONObject, tick: (Int) -> Unit): JSONObject {
        val f = packFile(ctx, o, tick)
        val entry = o.optString("entry")
        val out = File(packDir(ctx), f.name.substringBefore('.') + "_x" + md5(entry))
        val t = File(out, File(entry).name)
        if (!t.isFile || t.length() == 0L) { out.deleteRecursively(); Archives.extract(f.path, setOf(entry), out) }
        if (!t.isFile) throw IllegalStateException("No se encontró el libro dentro del comprimido")
        return JSONObject().put("path", t.absolutePath)
    }

    /** Deja solo los últimos 6 libros en la caché. */
    private fun clean(base: File, keep: String) {
        val groups = (base.listFiles() ?: return).groupBy { it.name.substringBefore('.') }
        val old = groups.filterKeys { it != keep }.entries.sortedByDescending { e -> e.value.maxOf { it.lastModified() } }.drop(5)
        for (e in old) for (f in e.value) f.deleteRecursively()
        groups[keep]?.forEach { it.setLastModified(System.currentTimeMillis()) }
    }
}
