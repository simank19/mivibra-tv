package co.mivibra.tv

import android.content.Context
import android.os.Build
import java.io.File
import java.util.zip.ZipInputStream

/**
 * Núcleos libretro para Android.
 * - Consolas: compilaciones de LemuroidCores (las que usa Lemuroid, GPL-3).
 * - Ports (Doom, Quake, Wolfenstein 3D, Cave Story): buildbot oficial de libretro.
 * Se descargan la primera vez que juegas un sistema.
 */
object Cores {
    private const val VERSION = "1.17.0"
    private const val LEMUROID = "https://github.com/Swordfish90/LemuroidCores/raw/$VERSION"
    private const val BUILDBOT = "https://buildbot.libretro.com/nightly/android/latest"

    private fun abi(): String = Build.SUPPORTED_ABIS.firstOrNull { it == "arm64-v8a" || it == "armeabi-v7a" } ?: "arm64-v8a"

    fun file(ctx: Context, core: String): File =
        File(ctx.filesDir, "cores/$VERSION/lib${core}_libretro_android.so")

    fun installed(ctx: Context, core: String): Boolean {
        val f = file(ctx, core)
        return f.exists() && f.length() > 50_000
    }

    fun download(ctx: Context, core: String, source: String, progress: (Int) -> Unit): File {
        require(core.matches(Regex("[a-z0-9_]+"))) { "Núcleo no válido" }
        val dest = file(ctx, core)
        if (installed(ctx, core)) return dest
        dest.parentFile?.parentFile?.listFiles()?.filter { it.name != VERSION }?.forEach { it.deleteRecursively() }

        if (source == "bb") {
            val zip = File(ctx.cacheDir, "${core}_core.zip")
            val code = Net.download("$BUILDBOT/${abi()}/${core}_libretro_android.so.zip", zip, progress = progress)
            if (code >= 400) throw IllegalStateException("No se pudo descargar el núcleo ($code)")
            ZipInputStream(zip.inputStream()).use { zin ->
                var e = zin.nextEntry
                while (e != null) {
                    if (!e.isDirectory && e.name.endsWith(".so")) {
                        dest.parentFile?.mkdirs()
                        dest.outputStream().use { zin.copyTo(it) }
                        break
                    }
                    e = zin.nextEntry
                }
            }
            zip.delete()
        } else {
            val url = "$LEMUROID/lemuroid_core_$core/src/main/jniLibs/${abi()}/lib${core}_libretro_android.so"
            val code = Net.download(url, dest, progress = progress)
            if (code >= 400) throw IllegalStateException("No se pudo descargar el núcleo ($code)")
        }

        // Debe ser una librería ELF real, no una página de error
        if (!dest.exists()) throw IllegalStateException("El núcleo no venía en el archivo descargado")
        val head = dest.inputStream().use { val b = ByteArray(4); it.read(b); b }
        if (!(head[0] == 0x7F.toByte() && head[1] == 'E'.code.toByte() && head[2] == 'L'.code.toByte() && head[3] == 'F'.code.toByte())) {
            dest.delete()
            throw IllegalStateException("El archivo descargado no es un núcleo válido")
        }
        return dest
    }

    /** Extrae un .zip descargado (por ejemplo Freedoom) en una carpeta al lado. */
    fun unzip(zip: File, outDir: File): Int {
        var n = 0
        val root = outDir.canonicalPath
        ZipInputStream(zip.inputStream()).use { zin ->
            var e = zin.nextEntry
            while (e != null) {
                val out = File(outDir, e.name)
                if (!out.canonicalPath.startsWith(root)) throw SecurityException("Ruta no permitida en el zip")
                if (e.isDirectory) out.mkdirs() else {
                    out.parentFile?.mkdirs()
                    out.outputStream().use { zin.copyTo(it) }
                    n++
                }
                e = zin.nextEntry
            }
        }
        return n
    }
}
