package co.mivibra.tv

import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import java.io.File

/**
 * Juegos descargados de la Tienda: https://appassets.androidplatform.net/games/<ruta>
 * Se sirven desde la memoria de la app (funcionan sin internet) con el tipo correcto
 * (los módulos .js deben ir como JavaScript o el navegador no los carga).
 */
class GameFiles(private val root: File) : WebViewAssetLoader.PathHandler {
    override fun handle(path: String): WebResourceResponse? {
        return try {
            var p = path.trimStart('/')
            if (p.isEmpty() || p.endsWith("/")) p += "index.html"
            val f = File(root, p).canonicalFile
            if (!f.path.startsWith(root.canonicalPath) || !f.isFile) return null
            WebResourceResponse(mime(f.name), if (mime(f.name).startsWith("text") || f.name.endsWith(".js") || f.name.endsWith(".json")) "utf-8" else null, open(f)).apply {
                responseHeaders = mapOf("Access-Control-Allow-Origin" to "*", "Cache-Control" to "no-cache")
            }
        } catch (_: Throwable) { null }
    }

    // Las versiones anteriores guardaron algunos archivos todavía comprimidos (gzip): se descomprimen al servirlos
    private fun open(f: File): java.io.InputStream {
        val head = ByteArray(2)
        val n = f.inputStream().use { it.read(head) }
        val gz = n == 2 && head[0] == 0x1f.toByte() && head[1] == 0x8b.toByte() && !f.name.endsWith(".gz")
        return if (gz) java.util.zip.GZIPInputStream(f.inputStream().buffered(), 64 * 1024) else f.inputStream()
    }

    private fun mime(n: String): String = when (n.substringAfterLast('.', "").lowercase()) {
        "html", "htm" -> "text/html"
        "js", "mjs" -> "text/javascript"
        "json" -> "application/json"
        "css" -> "text/css"
        "png" -> "image/png"
        "jpg", "jpeg" -> "image/jpeg"
        "webp" -> "image/webp"
        "svg" -> "image/svg+xml"
        "mp4" -> "video/mp4"
        "webm" -> "video/webm"
        "mp3" -> "audio/mpeg"
        "ogg" -> "audio/ogg"
        "wasm" -> "application/wasm"
        "glb" -> "model/gltf-binary"
        else -> "application/octet-stream"
    }
}
