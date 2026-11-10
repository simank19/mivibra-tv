package co.mivibra.tv

import java.io.File

/** Comprimidos con juegos: .zip, .7z (Android 8+) y .rar (RAR 4; el RAR 5 no se puede abrir). */
object Archives {
    fun kind(path: String): String = path.substringAfterLast('.', "").lowercase()
    fun supported(path: String) = kind(path) in setOf("zip", "7z", "rar")

    /** (nombre, tamaño) de cada archivo de adentro */
    fun list(path: String): List<Pair<String, Long>> = when (kind(path)) {
        "7z" -> {
            if (android.os.Build.VERSION.SDK_INT < 26) throw IllegalStateException("Los .7z necesitan Android 8 o más nuevo")
            SevenZ.list(File(path))
        }
        "rar" -> rar(path) { a -> a.fileHeaders.filter { !it.isDirectory }.map { it.fileName.replace('\\', '/') to it.fullUnpackSize } }
        else -> java.util.zip.ZipFile(path).use { z -> z.entries().toList().filter { !it.isDirectory }.map { it.name to it.size } }
    }

    /** Huellas CRC32 de los archivos de adentro */
    fun crcs(path: String): List<Long> = when (kind(path)) {
        "7z" -> if (android.os.Build.VERSION.SDK_INT >= 26) SevenZ.crcs(File(path)) else emptyList()
        "rar" -> rar(path) { a -> a.fileHeaders.filter { !it.isDirectory }.map { it.fileCRC.toLong() and 0xFFFFFFFFL } }
        else -> java.util.zip.ZipFile(path).use { z -> z.entries().toList().filter { !it.isDirectory }.map { it.crc } }
    }

    /** Saca los archivos pedidos (por nombre completo) a la carpeta, cada uno con su nombre sin carpetas. */
    fun extract(path: String, names: Set<String>, dir: File, tick: (Int) -> Unit = {}) {
        dir.mkdirs()
        when (kind(path)) {
            "7z" -> SevenZ.extract(File(path), names, dir, tick)
            "rar" -> rar(path) { a ->
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
            }
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
            throw IllegalStateException("Este .rar es formato RAR 5 y no se puede abrir. Envíalo en .zip o .7z")
        }
    }
}
