package co.mivibra.tv

import java.io.File

/** Comprimidos (juegos y colecciones de libros): .zip, .7z (Android 8+) y .rar (RAR 4 con junrar; RAR 5 con libarchive). */
object Archives {
    fun kind(path: String): String = path.substringAfterLast('.', "").lowercase()
    fun supported(path: String) = kind(path) in setOf("zip", "7z", "rar")

    /** (nombre, tamaño) de cada archivo de adentro */
    fun list(path: String): List<Pair<String, Long>> = when (kind(path)) {
        "7z" -> {
            if (android.os.Build.VERSION.SDK_INT < 26) throw IllegalStateException("Los .7z necesitan Android 8 o más nuevo")
            SevenZ.list(File(path))
        }
        "rar" -> try { rar(path) { a -> a.fileHeaders.filter { !it.isDirectory }.map { it.fileName.replace('\\', '/') to it.fullUnpackSize } } } catch (e: Rar5) { LibArc.list(path) }
        else -> java.util.zip.ZipFile(path).use { z -> z.entries().toList().filter { !it.isDirectory }.map { it.name to it.size } }
    }

    /** Huellas CRC32 de los archivos de adentro */
    fun crcs(path: String): List<Long> = when (kind(path)) {
        "7z" -> if (android.os.Build.VERSION.SDK_INT >= 26) SevenZ.crcs(File(path)) else emptyList()
        "rar" -> try { rar(path) { a -> a.fileHeaders.filter { !it.isDirectory }.map { it.fileCRC.toLong() and 0xFFFFFFFFL } } } catch (e: Rar5) { emptyList() }
        else -> java.util.zip.ZipFile(path).use { z -> z.entries().toList().filter { !it.isDirectory }.map { it.crc } }
    }

    /** Saca los archivos pedidos (por nombre completo) a la carpeta, cada uno con su nombre sin carpetas. */
    fun extract(path: String, names: Set<String>, dir: File, tick: (Int) -> Unit = {}) {
        dir.mkdirs()
        when (kind(path)) {
            "7z" -> SevenZ.extract(File(path), names, dir, tick)
            "rar" -> try { rar(path) { a ->
                for (h in a.fileHeaders) {
                    val n = h.fileName.replace('\\', '/')
                    if (h.isDirectory || n !in names) continue
                    File(dir, File(n).name).outputStream().buffered(256 * 1024).use { out ->
                        a.extractFile(h, object : java.io.OutputStream() {
                            override fun write(b: Int) { out.write(b); tick(1) }
                            override fun write(b: ByteArray, off: Int, len: Int) { out.write(b, off, len); tick(len) }
                        })
                    }
                }
            } } catch (e: Rar5) { LibArc.extract(path, names, dir, tick) }
            else -> java.util.zip.ZipFile(path).use { z ->
                for (e in z.entries().toList().filter { !it.isDirectory && it.name in names }) {
                    z.getInputStream(e).use { inp -> File(dir, File(e.name).name).outputStream().buffered(256 * 1024).use { o ->
                        val buf = ByteArray(256 * 1024)
                        while (true) { val n = inp.read(buf); if (n < 0) break; o.write(buf, 0, n); tick(n) }
                    } }
                }
            }
        }
    }

    private fun <T> rar(path: String, f: (com.github.junrar.Archive) -> T): T {
        try {
            return com.github.junrar.Archive(File(path)).use { a ->
                if (a.isEncrypted) throw IllegalStateException("El .rar tiene contraseña")
                f(a)
            }
        } catch (e: com.github.junrar.exception.UnsupportedRarV5Exception) {
            throw Rar5()
        }
    }
    /** El .rar es RAR 5 (junrar no lo lee): se abre con libarchive. */
    private class Rar5 : Exception()
}

/** Lector de comprimidos con libarchive (RAR 5, y de respaldo cualquier otro formato que soporte). */
object LibArc {
    private inline fun <T> open(path: String, f: (Long) -> T): T {
        val a = me.zhanghai.android.libarchive.Archive.readNew()
        try {
            me.zhanghai.android.libarchive.Archive.readSupportFilterAll(a)
            me.zhanghai.android.libarchive.Archive.readSupportFormatAll(a)
            me.zhanghai.android.libarchive.Archive.readOpenFileName(a, path.toByteArray(), 64 * 1024L)
            return f(a)
        } catch (e: me.zhanghai.android.libarchive.ArchiveException) {
            throw IllegalStateException("No se pudo abrir el comprimido: " + (e.message ?: "formato no compatible"))
        } finally {
            try { me.zhanghai.android.libarchive.Archive.readFree(a) } catch (_: Exception) {}
        }
    }
    private fun name(e: Long): String {
        val n = try { me.zhanghai.android.libarchive.ArchiveEntry.pathnameUtf8(e) } catch (_: Exception) { null }
            ?: me.zhanghai.android.libarchive.ArchiveEntry.pathname(e)?.let { String(it) } ?: ""
        return n.replace('\\', '/')
    }
    private fun isDir(e: Long) = me.zhanghai.android.libarchive.ArchiveEntry.filetype(e) == me.zhanghai.android.libarchive.ArchiveEntry.AE_IFDIR

    fun list(path: String): List<Pair<String, Long>> = open(path) { a ->
        val out = ArrayList<Pair<String, Long>>()
        while (true) {
            val e = me.zhanghai.android.libarchive.Archive.readNextHeader(a)
            if (e == 0L) break
            if (!isDir(e)) out.add(name(e) to me.zhanghai.android.libarchive.ArchiveEntry.size(e))
            me.zhanghai.android.libarchive.Archive.readDataSkip(a)
        }
        out
    }

    fun extract(path: String, names: Set<String>, dir: File, tick: (Int) -> Unit) = open(path) { a ->
        dir.mkdirs()
        var left = names.size
        while (left > 0) {
            val e = me.zhanghai.android.libarchive.Archive.readNextHeader(a)
            if (e == 0L) break
            val n = name(e)
            if (isDir(e) || n !in names) { me.zhanghai.android.libarchive.Archive.readDataSkip(a); continue }
            val f = File(dir, File(n).name)
            android.os.ParcelFileDescriptor.open(f, android.os.ParcelFileDescriptor.MODE_CREATE or android.os.ParcelFileDescriptor.MODE_TRUNCATE or android.os.ParcelFileDescriptor.MODE_WRITE_ONLY).use { pfd ->
                me.zhanghai.android.libarchive.Archive.readDataIntoFd(a, pfd.fd)
            }
            tick(f.length().coerceAtMost(Int.MAX_VALUE.toLong()).toInt()); left--
        }
    }
}
