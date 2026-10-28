package co.mivibra.tv

import org.json.JSONObject
import java.net.URLEncoder

/** Portales Stalker / Ministra (tipo MAG): el enlace de cada canal o película se pide al momento de reproducir y vence a los pocos minutos. */
object Stalker {
    const val UA = "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3"
    private val tokens = HashMap<String, Pair<String, Long>>()

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    private fun headers(api: String, mac: String, token: String?): Map<String, String> {
        val h = hashMapOf(
            "User-Agent" to UA,
            "X-User-Agent" to "Model: MAG250; Link: WiFi",
            "Cookie" to "mac=" + enc(mac) + "; stb_lang=es; timezone=America%2FBogota",
            "Referer" to api.replace(Regex("(server/load|portal)\\.php.*$"), "")
        )
        if (token != null) h["Authorization"] = "Bearer $token"
        return h
    }

    private fun js(txt: String): Any? = try { JSONObject(txt).opt("js") } catch (_: Exception) { null }

    @Synchronized
    private fun token(api: String, mac: String, force: Boolean): String {
        val k = "$api|$mac"
        val t = tokens[k]
        if (!force && t != null && t.second > System.currentTimeMillis()) return t.first
        val (_, hs) = Net.text("$api?type=stb&action=handshake&token=&prehash=0&JsHttpRequest=1-xml", headers(api, mac, null))
        val tok = (js(hs) as? JSONObject)?.optString("token").orEmpty()
        if (tok.isBlank()) throw IllegalStateException("El portal no aceptó la conexión")
        val ts = System.currentTimeMillis() / 1000
        try {
            Net.text("$api?type=stb&action=get_profile&hd=1&num_banks=2&stb_type=MAG250&client_type=STB&image_version=218&video_out=hdmi&auth_second_step=1&hw_version=1.7-BD-00&not_valid_token=0&timestamp=$ts&api_signature=262&prehash=0&JsHttpRequest=1-xml", headers(api, mac, tok))
        } catch (_: Exception) {}
        tokens[k] = tok to (System.currentTimeMillis() + 20 * 60_000)
        return tok
    }

    /** Pide el enlace real (create_link). stk: {api, mac, t: itv|vod, cmd, series?} */
    /** Prueba la MAC principal y, si el portal la rechaza o no da enlace, las de respaldo (la que funcione queda primero). */
    fun link(stk: JSONObject): String {
        val macs = mutableListOf(stk.optString("mac"))
        stk.optJSONArray("macs")?.let { a -> for (i in 0 until a.length()) a.optString(i).takeIf { it.isNotBlank() && it !in macs }?.let { macs.add(it) } }
        var last: Exception? = null
        for (m in macs.take(8)) {
            try {
                val u = linkWith(stk, m)
                if (m != stk.optString("mac")) stk.put("mac", m)
                return u
            } catch (e: Exception) { last = e }
        }
        throw last ?: IllegalStateException("No se pudo obtener el enlace")
    }

    private fun linkWith(stk: JSONObject, mac: String): String {
        val api = stk.optString("api")
        val type = if (stk.optString("t") == "itv") "itv" else "vod"
        val cmd = stk.optString("cmd")
        val series = stk.optInt("series", 0)
        var last: Exception? = null
        for (attempt in 0..1) {
            try {
                val tok = token(api, mac, attempt > 0)
                val url = "$api?type=$type&action=create_link&cmd=" + enc(cmd) + "&series=" + (if (series > 0) series.toString() else "") +
                    "&forced_storage=undefined&disable_ad=0&download=0&JsHttpRequest=1-xml"
                val (_, txt) = Net.text(url, headers(api, mac, tok))
                val o = js(txt) as? JSONObject
                var out = o?.optString("cmd").orEmpty().trim()
                if (out.isBlank()) { last = IllegalStateException(if (txt.contains("uthoriz")) "El portal rechazó la MAC" else "El portal no dio el enlace"); continue }
                out = out.replace(Regex("^(ffmpeg|ffrt\\d?|auto)\\s+", RegexOption.IGNORE_CASE), "").trim()
                // Algunos portales devuelven el enlace sin el número de capítulo o con el token vacío; se usa tal cual
                if (out.startsWith("http", true) || out.startsWith("rtmp", true) || out.startsWith("udp", true)) return out
                last = IllegalStateException("Enlace no válido del portal")
            } catch (e: Exception) { last = e }
        }
        throw last ?: IllegalStateException("No se pudo obtener el enlace")
    }
}
