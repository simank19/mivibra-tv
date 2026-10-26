package co.mivibra.tv

import java.io.BufferedInputStream
import java.io.ByteArrayInputStream
import java.io.File
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.GZIPInputStream

/** Descargas HTTP sin las restricciones de CORS del navegador. */
object Net {
    const val UA = "Mozilla/5.0 (Linux; Android 12) MiVibraTV/1.0"

    fun open(url: String, headers: Map<String, String> = emptyMap(), timeoutMs: Int = 20000): HttpURLConnection {
        var current = url
        var redirects = 0
        while (true) {
            val c = URL(current).openConnection() as HttpURLConnection
            c.connectTimeout = timeoutMs
            c.readTimeout = timeoutMs * 2
            c.instanceFollowRedirects = false
            c.setRequestProperty("User-Agent", UA)
            c.setRequestProperty("Accept-Encoding", "gzip")
            for ((k, v) in headers) {
                if (v.isNotBlank()) c.setRequestProperty(k, v)
            }
            val code = c.responseCode
            if (code in 300..399 && redirects < 8) {
                val location = c.getHeaderField("Location")
                c.disconnect()
                if (location.isNullOrBlank()) throw IllegalStateException("Redirección sin destino")
                current = URL(URL(current), location).toString()
                redirects++
                continue
            }
            return c
        }
    }

    /** Devuelve el contenido ya descomprimido si viene en gzip (por cabecera o por extensión .gz). */
    fun body(c: HttpURLConnection): InputStream {
        val raw: InputStream = if (c.responseCode >= 400) {
            c.errorStream ?: ByteArrayInputStream(ByteArray(0))
        } else {
            c.inputStream
        }
        return ungzip(raw)
    }

    fun ungzip(raw: InputStream): InputStream {
        val bis = BufferedInputStream(raw, 64 * 1024)
        bis.mark(4)
        val b1 = bis.read()
        val b2 = bis.read()
        bis.reset()
        return if (b1 == 0x1f && b2 == 0x8b) GZIPInputStream(bis, 64 * 1024) else bis
    }

    fun text(url: String, headers: Map<String, String> = emptyMap()): Pair<Int, String> {
        val c = open(url, headers)
        try {
            val code = c.responseCode
            val txt = body(c).use { it.readBytes().toString(Charsets.UTF_8) }
            return code to txt
        } finally {
            c.disconnect()
        }
    }

    /** Descarga a un archivo con progreso (0..100, o -1 si no se conoce el tamaño). */
    fun download(
        url: String,
        dest: File,
        headers: Map<String, String> = emptyMap(),
        decompress: Boolean = false,
        progress: (Int) -> Unit = {},
    ): Int {
        val c = open(url, headers, 30000)
        try {
            val code = c.responseCode
            if (code >= 400) return code
            val total = c.contentLengthLong
            dest.parentFile?.mkdirs()
            val tmp = File(dest.parentFile, dest.name + ".part")
            val input = if (decompress) body(c) else c.inputStream
            input.use { ins ->
                tmp.outputStream().use { out ->
                    val buf = ByteArray(128 * 1024)
                    var done = 0L
                    var lastPct = -2
                    while (true) {
                        val n = ins.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                        done += n
                        val pct = if (total > 0) ((done * 100) / total).toInt() else -1
                        if (pct != lastPct) {
                            lastPct = pct
                            progress(pct)
                        }
                    }
                }
            }
            if (dest.exists()) dest.delete()
            tmp.renameTo(dest)
            return code
        } finally {
            c.disconnect()
        }
    }
}
