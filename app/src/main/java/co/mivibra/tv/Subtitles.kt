package co.mivibra.tv

import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.URLEncoder
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.Charset
import java.nio.charset.CodingErrorAction
import java.util.zip.ZipInputStream

/** Búsqueda de subtítulos externos (SubDL), descarga y ajuste de sincronía. */
object Subtitles {
    data class Result(val name: String, val lang: String, val url: String, val season: Int, val episode: Int)

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    /** info: sTitle, sYear, sTmdb, sImdb, sKind (movie/tv), sSeason, sEpisode */
    fun search(key: String, info: JSONObject, langs: String): List<Result> {
        val kind = info.optString("sKind", "movie")
        val season = info.optInt("sSeason", 0)
        val episode = info.optInt("sEpisode", 0)
        val ids = when {
            info.optString("sImdb").isNotBlank() -> "&imdb_id=" + enc(info.optString("sImdb"))
            info.optString("sTmdb").isNotBlank() -> "&tmdb_id=" + enc(info.optString("sTmdb"))
            else -> "&film_name=" + enc(info.optString("sTitle")) + (info.optString("sYear").takeIf { it.isNotBlank() }?.let { "&year=$it" } ?: "")
        }
        val base = "https://api.subdl.com/api/v1/subtitles?api_key=" + enc(key) + ids + "&type=" + kind +
            "&languages=" + enc(langs) + "&subs_per_page=30" +
            (if (kind == "tv" && season > 0) "&season_number=$season" else "") +
            (if (kind == "tv" && episode > 0) "&episode_number=$episode" else "")
        val (code, txt) = Net.text(base)
        val j = try { JSONObject(txt) } catch (_: Exception) { throw IllegalStateException("SubDL no respondió bien ($code)") }
        if (!j.optBoolean("status", false)) {
            val err = j.optString("error").ifBlank { j.optString("message") }
            if (err.contains("api", true) && err.contains("key", true)) throw IllegalStateException("La clave de SubDL no es válida")
            return emptyList()
        }
        val arr = j.optJSONArray("subtitles") ?: return emptyList()
        val out = mutableListOf<Result>()
        for (i in 0 until arr.length()) {
            val s = arr.optJSONObject(i) ?: continue
            val url = s.optString("url"); if (url.isBlank()) continue
            val se = s.optInt("season", 0); val ep = s.optInt("episode", 0)
            // En series, descarta los de otro episodio si la respuesta los trae
            if (kind == "tv" && episode > 0 && ep > 0 && ep != episode) continue
            out.add(Result(s.optString("release_name").ifBlank { s.optString("name") }, s.optString("lang"), url, se, ep))
        }
        return out
    }

    /** Descarga el .zip y deja el subtítulo en UTF-8 (muchos .srt en español vienen en Windows-1252). */
    fun download(dir: File, r: Result): File {
        dir.mkdirs()
        val zip = File(dir, "sub.zip")
        val url = if (r.url.startsWith("http")) r.url else "https://dl.subdl.com" + r.url
        val code = Net.download(url, zip, emptyMap(), decompress = false)
        if (code >= 400) throw IllegalStateException("No se pudo descargar ($code)")
        var best: Pair<String, ByteArray>? = null
        ZipInputStream(zip.inputStream()).use { z ->
            while (true) {
                val e = z.nextEntry ?: break
                val n = e.name.lowercase()
                if (e.isDirectory || !(n.endsWith(".srt") || n.endsWith(".vtt") || n.endsWith(".ass") || n.endsWith(".ssa"))) continue
                if (n.contains("..")) continue
                val bytes = ByteArrayOutputStream().also { z.copyTo(it) }.toByteArray()
                // Prefiere .srt y el archivo más grande (el completo, no un fragmento)
                val better = best == null || (n.endsWith(".srt") && !best!!.first.endsWith(".srt")) ||
                    (n.substringAfterLast('.') == best!!.first.substringAfterLast('.') && bytes.size > best!!.second.size)
                if (better) best = n to bytes
            }
        }
        val (name, raw) = best ?: throw IllegalStateException("El archivo no trae subtítulos compatibles")
        val ext = name.substringAfterLast('.')
        val text = decode(raw)
        val f = File(dir, "externo." + ext)
        f.writeText(text, Charsets.UTF_8)
        return f
    }

    fun decode(b: ByteArray): String {
        val body = if (b.size >= 3 && b[0] == 0xEF.toByte() && b[1] == 0xBB.toByte() && b[2] == 0xBF.toByte()) b.copyOfRange(3, b.size) else b
        return try {
            Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(body)).toString()
        } catch (_: CharacterCodingException) {
            String(body, Charset.forName("windows-1252"))
        }
    }

    /** Subtítulo de un addon de Stremio (OpenSubtitles v3, SubDL, SubSource…). */
    class AddonSub(val url: String, val lang: String, val src: String)

    /** Pide a cada addon de subtítulos los del video. id: tt123 / tt123:1:2 / kitsu:… ; type: movie o series. */
    fun fromAddons(addons: org.json.JSONArray, type: String, id: String): List<AddonSub> {
        val out = mutableListOf<AddonSub>(); val seen = HashSet<String>()
        for (i in 0 until addons.length()) {
            val a = addons.optJSONObject(i) ?: continue
            val pre = a.optJSONArray("pre")
            if (pre != null && pre.length() > 0 && (0 until pre.length()).none { id.startsWith(pre.optString(it)) }) continue
            val base = a.optString("base").trimEnd('/')
            try {
                val (code, body) = Net.text("$base/subtitles/$type/" + java.net.URLEncoder.encode(id, "UTF-8").replace("+", "%20") + ".json")
                if (code >= 400) continue
                val arr = org.json.JSONObject(body).optJSONArray("subtitles") ?: continue
                for (k in 0 until arr.length()) {
                    val o = arr.optJSONObject(k) ?: continue
                    val u = o.optString("url"); if (!u.startsWith("http") || !seen.add(u)) continue
                    out.add(AddonSub(u, o.optString("lang"), a.optString("name")))
                }
            } catch (_: Exception) {}
        }
        return out
    }

    /** Descarga el subtítulo del addon y lo deja listo (detecta si es SRT, VTT o ASS). */
    fun downloadAddon(dir: File, s: AddonSub): File {
        dir.mkdirs()
        val tmp = File(dir, "addon.tmp")
        val code = Net.download(s.url, tmp, emptyMap(), decompress = true)
        if (code >= 400) throw IllegalStateException("No se pudo descargar ($code)")
        var raw = tmp.readBytes()
        // Algunos llegan comprimidos en .gz o .zip
        if (raw.size > 2 && raw[0] == 0x1f.toByte() && raw[1] == 0x8b.toByte()) raw = java.util.zip.GZIPInputStream(raw.inputStream()).readBytes()
        if (raw.size > 2 && raw[0] == 'P'.code.toByte() && raw[1] == 'K'.code.toByte()) {
            ZipInputStream(raw.inputStream()).use { z ->
                while (true) { val e = z.nextEntry ?: break; val n = e.name.lowercase(); if (!e.isDirectory && (n.endsWith(".srt") || n.endsWith(".vtt") || n.endsWith(".ass") || n.endsWith(".ssa"))) { raw = z.readBytes(); break } }
            }
        }
        val text = decode(raw)
        val head = text.trimStart().take(200)
        val ext = when { head.startsWith("WEBVTT") -> "vtt"; head.contains("[Script Info]") -> "ass"; else -> "srt" }
        val f = File(dir, "externo." + ext)
        f.writeText(text, Charsets.UTF_8)
        tmp.delete()
        return f
    }

    /** Nombre del idioma en español para códigos como spa, eng, pob, es-419. */
    fun langLabel(code: String): String {
        val c = code.lowercase().trim()
        return when {
            // Algunos addons mandan el nombre del idioma en vez del código
            c.contains("latin") && (c.contains("spa") || c.contains("esp")) -> "Español latino"
            c.startsWith("spanish") || c.startsWith("español") || c.startsWith("espanol") -> "Español"
            c.startsWith("english") -> "Inglés"
            c.startsWith("portuguese") && c.contains("br") -> "Portugués (Brasil)"
            c.startsWith("portuguese") -> "Portugués"
            c in setOf("spa", "es", "esp", "spn", "ea", "es-419", "es-mx", "es-la", "lat") -> if (c in setOf("spn", "ea", "es-419", "es-mx", "es-la", "lat")) "Español latino" else "Español"
            c in setOf("eng", "en") -> "Inglés"
            c in setOf("pob", "pt-br") -> "Portugués (Brasil)"
            c in setOf("por", "pt") -> "Portugués"
            c in setOf("fre", "fra", "fr") -> "Francés"
            c in setOf("ita", "it") -> "Italiano"
            c in setOf("ger", "deu", "de") -> "Alemán"
            c in setOf("jpn", "ja") -> "Japonés"
            c in setOf("kor", "ko") -> "Coreano"
            c.isBlank() -> "Otro"
            else -> { val n = java.util.Locale.forLanguageTag(c).getDisplayLanguage(java.util.Locale("es")); if (n.isBlank() || n.equals(c, true)) c.uppercase() else n.replaceFirstChar { it.uppercase() } }
        }
    }

    /** Copia el subtítulo corrido "ms" milisegundos (positivo = aparece más tarde). */
    fun shifted(src: File, ms: Long): File {
        val ext = src.extension.lowercase()
        val out = File(src.parentFile, "externo-ajustado." + ext)
        if (ms == 0L) { src.copyTo(out, true); return out }
        val text = src.readText()
        val res = if (ext == "ass" || ext == "ssa") {
            Regex("(\\d+):(\\d{2}):(\\d{2})\\.(\\d{2})").replace(text) { m ->
                val t = shift(((m.groupValues[1].toLong() * 60 + m.groupValues[2].toLong()) * 60 + m.groupValues[3].toLong()) * 1000 + m.groupValues[4].toLong() * 10, ms)
                String.format(java.util.Locale.US, "%d:%02d:%02d.%02d", t / 3600000, t / 60000 % 60, t / 1000 % 60, t % 1000 / 10)
            }
        } else {
            Regex("(\\d{1,2}):(\\d{2}):(\\d{2})([,.])(\\d{3})").replace(text) { m ->
                val t = shift(((m.groupValues[1].toLong() * 60 + m.groupValues[2].toLong()) * 60 + m.groupValues[3].toLong()) * 1000 + m.groupValues[5].toLong(), ms)
                String.format(java.util.Locale.US, "%02d:%02d:%02d%s%03d", t / 3600000, t / 60000 % 60, t / 1000 % 60, m.groupValues[4], t % 1000)
            }
        }
        out.writeText(res)
        return out
    }

    private fun shift(t: Long, ms: Long) = maxOf(0L, t + ms)
}
