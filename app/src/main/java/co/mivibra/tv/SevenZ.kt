package co.mivibra.tv

import androidx.annotation.RequiresApi
import org.apache.commons.compress.archivers.sevenz.SevenZFile
import java.io.File

/** Lectura de comprimidos .7z (Android 8+). */
@RequiresApi(26)
object SevenZ {
    fun list(f: File): List<Pair<String, Long>> =
        SevenZFile(f).use { z -> z.entries.filter { !it.isDirectory }.map { it.name to it.size } }

    fun extract(f: File, names: Set<String>, dir: File, tick: (Int) -> Unit = {}) {
        SevenZFile(f).use { z ->
            val buf = ByteArray(256 * 1024)
            var e = z.nextEntry
            while (e != null) {
                if (!e.isDirectory && e.name in names) {
                    File(dir, File(e.name).name).outputStream().buffered(256 * 1024).use { out ->
                        while (true) { val n = z.read(buf); if (n < 0) break; out.write(buf, 0, n); tick(n) }
                    }
                }
                e = z.nextEntry
            }
        }
    }
}
