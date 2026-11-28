package co.mivibra.tv

import java.io.File

/** Descarga de un archivo desde un enlace para compartir (Google Drive, MEGA, MediaFire, Dropbox, OneDrive, GitHub, pixeldrain…).
 *  Si el enlace responde con una página (aviso de Drive, botón de descarga de MediaFire…) se sigue hasta el archivo de verdad;
 *  si no se puede, se explica qué pasa (no está público, es una carpeta, Drive bloqueó la descarga por cuota…). */
object Fetch {
    fun direct(u: String): String {
        val drive = Regex("(?:drive|docs)\\.google\\.com/(?:file/d/|open\\?id=|uc\\?(?:[^#]*&)?id=)([\\w-]{10,})").find(u)
            ?: Regex("drive\\.usercontent\\.google\\.com/[^?]*\\?(?:[^#]*&)?id=([\\w-]{10,})").find(u)
        if (drive != null) return "https://drive.usercontent.google.com/download?id=" + drive.groupValues[1] + "&export=download&confirm=t"
        if (u.contains("dropbox.com/")) return u.replace(Regex("[?&]dl=0"), "").let { it + (if (it.contains("?")) "&" else "?") + "dl=1" }
        Regex("^https://github\\.com/([^/]+)/([^/]+)/blob/(.+)$").find(u)?.let { return "https://raw.githubusercontent.com/" + it.groupValues[1] + "/" + it.groupValues[2] + "/" + it.groupValues[3] }
        Regex("pixeldrain\\.com/u/([\\w-]+)").find(u)?.let { return "https://pixeldrain.com/api/file/" + it.groupValues[1] + "?download" }
        if (Regex("1drv\\.ms/|onedrive\\.live\\.com/").containsMatchIn(u) && !u.contains("download=1")) return u + (if (u.contains("?")) "&" else "?") + "download=1"
        return u
    }

    fun get(url: String, dest: File, headers: Map<String, String> = emptyMap(), decompress: Boolean = true, allowHtml: Boolean = false, tick: (Int) -> Unit = {}) {
        dest.parentFile?.mkdirs()
        if (Regex("drive\\.google\\.com/(?:drive/)?(?:u/\\d+/)?folders/").containsMatchIn(url))
            throw IllegalStateException("Ese enlace es de una carpeta, no de un archivo: usa la opción de publicar carpeta")
        if (url.startsWith("mega:") || Mega.parse(url) != null) { Mega.download(url, dest, tick); return }
        var u = direct(url)
        for (hop in 0..3) {
            val code = Net.download(u, dest, headers, decompress = decompress) { tick(it) }
            if (code >= 400 || !dest.isFile) {
                dest.delete()
                throw IllegalStateException(if (code == 403 || code == 401) "El archivo no está compartido como público (error $code)" else if (code == 404) "El archivo ya no existe en ese enlace (404)" else "Error $code al descargar")
            }
            if (!looksHtml(dest)) return
            val h = try { dest.readText() } catch (_: Exception) { "" }
            // Un juego web puede ser una sola página .html: se acepta si no es un aviso de Drive ni MediaFire
            val next = driveForm(h) ?: mediafire(h) ?: (if (allowHtml) null else fileLink(h, u))
            if (next == null && allowHtml && !u.contains("google")) return
            if (next == null || next == u || hop == 3) { dest.delete(); throw IllegalStateException(explain(h, url)) }
            u = next
        }
    }

    fun looksHtml(f: File): Boolean {
        if (!f.isFile || f.length() > 2_000_000) return false
        val head = try { f.inputStream().use { val b = ByteArray(1024); val n = it.read(b); if (n <= 0) "" else String(b, 0, n) } } catch (_: Exception) { "" }
        return Regex("<!doctype html|<html|<head", RegexOption.IGNORE_CASE).containsMatchIn(head)
    }

    /** Aviso de Google Drive para archivos grandes ("no se puede analizar en busca de virus"): su formulario lleva al archivo */
    private fun driveForm(h: String): String? {
        val tag = Regex("<form[^>]*(?:download-form|downloadForm)[^>]*>", RegexOption.IGNORE_CASE).find(h)?.value
        if (tag != null) {
            val action = Regex("action=\"([^\"]+)\"").find(tag)?.groupValues?.get(1)?.replace("&amp;", "&") ?: return null
            val q = Regex("<input[^>]*>", RegexOption.IGNORE_CASE).findAll(h).mapNotNull { m ->
                val t = m.value
                if (!t.contains("hidden", true)) return@mapNotNull null
                val n = Regex("name=\"([^\"]+)\"").find(t)?.groupValues?.get(1) ?: return@mapNotNull null
                val v = Regex("value=\"([^\"]*)\"").find(t)?.groupValues?.get(1)?.replace("&amp;", "&") ?: ""
                n + "=" + java.net.URLEncoder.encode(v, "UTF-8")
            }.joinToString("&")
            return action + (if (action.contains("?")) "&" else "?") + q
        }
        // Página vieja de Drive: enlace "uc-download-link" / "Descargar de todos modos"
        Regex("href=\"(/uc\\?export=download[^\"]+)\"").find(h)?.let { return "https://drive.google.com" + it.groupValues[1].replace("&amp;", "&") }
        return null
    }

    private fun mediafire(h: String): String? {
        if (!h.contains("mediafire", true)) return null
        Regex("data-scrambled-url=\"([A-Za-z0-9+/=]+)\"").find(h)?.let { m ->
            try { val s = String(android.util.Base64.decode(m.groupValues[1], android.util.Base64.DEFAULT)); if (s.startsWith("http")) return s } catch (_: Exception) {}
        }
        return Regex("href=\"(https?://download\\d*\\.mediafire\\.com/[^\"]+)\"").find(h)?.groupValues?.get(1)
    }

    private val EXT = "zip|rar|7z|apk|exe|iso|chd|cue|bin|pbp|cso|gba|gbc|gb|nes|sfc|smc|n64|z64|v64|nds|md|gen|smd|sms|gg|pce|a26|lnx|ws|wsc|ngp|epub|pdf|cbz|cbr|cb7|html"
    /** Cualquier otra página de descarga: el primer enlace directo a un archivo conocido */
    private fun fileLink(h: String, base: String): String? {
        val m = Regex("href=\"([^\"#]+\\.(?:$EXT)(?:\\?[^\"]*)?)\"", RegexOption.IGNORE_CASE).find(h) ?: return null
        val l = m.groupValues[1].replace("&amp;", "&")
        return try { java.net.URL(java.net.URL(base), l).toString() } catch (_: Exception) { null }
    }

    private fun explain(h: String, url: String): String = when {
        Regex("ServiceLogin|accounts\\.google\\.com|Iniciar sesión|Sign in", RegexOption.IGNORE_CASE).containsMatchIn(h) && url.contains("google") ->
            "Google Drive pide iniciar sesión: comparte el archivo como «Cualquier persona con el enlace»"
        Regex("quota|Too many users|demasiados usuarios|excedido", RegexOption.IGNORE_CASE).containsMatchIn(h) ->
            "Google Drive bloqueó la descarga por hoy (demasiadas descargas de ese archivo). Prueba más tarde o súbelo a MEGA"
        Regex("doesn.t exist|no existe|not found|404", RegexOption.IGNORE_CASE).containsMatchIn(h) -> "El archivo ya no existe en ese enlace"
        else -> "El enlace abre una página y no el archivo. Usa el enlace para compartir del archivo (Drive, MEGA, MediaFire o Dropbox) y que sea público"
    }
}
