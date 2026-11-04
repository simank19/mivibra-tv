package co.mivibra.tv.launcher

import android.content.Context
import fi.iki.elonen.NanoHTTPD
import java.io.File

/**
 * Subir fondos desde el celular sin configurar nada: la TV muestra un QR a http://IP:8766,
 * el celular elige fotos (galería o Google Fotos), las achica a 1080p y las manda una por una.
 */
class PhotoUploadServer(private val ctx: Context, private val onSaved: (Int) -> Unit) : NanoHTTPD(PORT) {
    companion object { const val PORT = 8766; private const val MAX = 15 * 1024 * 1024 }

    private var count = 0

    override fun serve(session: IHTTPSession): Response {
        val uri = session.uri ?: "/"
        return try {
            when {
                session.method == Method.GET && (uri == "/" || uri == "/index.html") -> asset("www/launcher/subir.html", "text/html; charset=utf-8")
                session.method == Method.GET && uri == "/isotipo.svg" -> asset("www/img/isotipo.svg", "image/svg+xml")
                session.method == Method.POST && uri == "/subir" -> upload(session)
                else -> newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "No encontrado")
            }
        } catch (e: Exception) {
            newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain", e.message ?: "error")
        }
    }

    private fun asset(path: String, mime: String): Response {
        val bytes = ctx.assets.open(path).use { it.readBytes() }
        return newFixedLengthResponse(Response.Status.OK, mime, bytes.inputStream(), bytes.size.toLong())
    }

    private fun upload(session: IHTTPSession): Response {
        val len = session.headers["content-length"]?.toIntOrNull() ?: 0
        if (len <= 0 || len > MAX) return newFixedLengthResponse(Response.Status.BAD_REQUEST, "text/plain", "Foto vacía o muy grande")
        val buf = ByteArray(len)
        var off = 0
        val inp = session.inputStream
        while (off < len) {
            val r = inp.read(buf, off, len - off)
            if (r <= 0) break
            off += r
        }
        if (off < len) return newFixedLengthResponse(Response.Status.BAD_REQUEST, "text/plain", "Se cortó la subida")
        // Solo JPG (el celular ya la convierte); se revisa la firma del archivo
        if (len < 3 || buf[0] != 0xFF.toByte() || buf[1] != 0xD8.toByte()) return newFixedLengthResponse(Response.Status.BAD_REQUEST, "text/plain", "No es una foto JPG")
        val f = File(GooglePhotos.dir(ctx), "c_" + System.currentTimeMillis() + "_" + (count % 1000) + ".jpg")
        f.writeBytes(buf)
        count++
        onSaved(count)
        return newFixedLengthResponse(Response.Status.OK, "application/json", "{\"ok\":true,\"total\":$count}")
    }
}
