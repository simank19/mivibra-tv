package co.mivibra.tv

import android.content.Context
import android.net.Uri
import android.util.Base64
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import java.io.File

/**
 * Sirve tus archivos de música/video del equipo o de una USB a la interfaz:
 * https://appassets.androidplatform.net/media/<ruta en base64>.<ext>
 * Solo entrega archivos de audio y video.
 */
class MediaFiles(private val ctx: Context) : WebViewAssetLoader.PathHandler {
    private val mimes = mapOf(
        "mp3" to "audio/mpeg", "m4a" to "audio/mp4", "aac" to "audio/aac", "flac" to "audio/flac",
        "ogg" to "audio/ogg", "opus" to "audio/ogg", "wav" to "audio/wav", "wma" to "audio/x-ms-wma",
        "mp4" to "video/mp4", "webm" to "video/webm"
    )

    override fun handle(path: String): WebResourceResponse? {
        return try {
            val dot = path.lastIndexOf('.')
            val ext = if (dot > 0) path.substring(dot + 1).lowercase() else ""
            val mime = mimes[ext] ?: return null
            val real = String(Base64.decode(path.substring(0, dot), Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING))
            val stream = if (real.startsWith("content://")) ctx.contentResolver.openInputStream(Uri.parse(real))
            else File(real).takeIf { it.isFile }?.inputStream()
            stream?.let { WebResourceResponse(mime, null, it) }
        } catch (_: Exception) {
            null
        }
    }
}
