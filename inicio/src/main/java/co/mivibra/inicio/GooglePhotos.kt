package co.mivibra.inicio

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Fondos desde Google Fotos con la API oficial "Picker":
 * la TV crea una sesión, muestra un QR, eliges las fotos en el celular y la TV las descarga.
 * Las fotos quedan guardadas en la TV (no se vuelven a pedir a Google).
 */
object GooglePhotos {
    const val SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly"
    private const val API = "https://photospicker.googleapis.com/v1"

    fun dir(c: Context) = File(c.filesDir, "fondos").apply { mkdirs() }

    /** ["/fondos/a.jpg", ...] del más nuevo al más viejo. */
    fun list(c: Context): String {
        val arr = JSONArray()
        dir(c).listFiles { f -> f.isFile && f.length() > 0 && f.name.endsWith(".jpg") }
            ?.sortedByDescending { it.lastModified() }
            ?.forEach { arr.put("/fondos/" + it.name) }
        return arr.toString()
    }

    fun delete(c: Context, name: String): Boolean {
        val f = File(dir(c), File(name).name)
        return f.exists() && f.delete()
    }

    fun clear(c: Context) { dir(c).listFiles()?.forEach { it.delete() } }

    // ---------------- HTTP ----------------

    private fun http(method: String, url: String, token: String?, body: String? = null, form: Boolean = false): Pair<Int, String> {
        val con = URL(url).openConnection() as HttpURLConnection
        con.requestMethod = method
        con.connectTimeout = 15000
        con.readTimeout = 30000
        if (token != null) con.setRequestProperty("Authorization", "Bearer $token")
        if (body != null) {
            con.doOutput = true
            con.setRequestProperty("Content-Type", if (form) "application/x-www-form-urlencoded" else "application/json")
            con.outputStream.use { it.write(body.toByteArray()) }
        }
        val code = con.responseCode
        val txt = try { (if (code in 200..299) con.inputStream else con.errorStream)?.bufferedReader()?.use { it.readText() } ?: "" } catch (_: Exception) { "" }
        con.disconnect()
        return code to txt
    }

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    // ---------------- Inicio con código (respaldo si la TV no tiene cuenta de Google) ----------------

    fun deviceCode(clientId: String): JSONObject {
        val (code, txt) = http("POST", "https://oauth2.googleapis.com/device/code", null,
            "client_id=" + enc(clientId) + "&scope=" + enc(SCOPE), form = true)
        val o = try { JSONObject(txt) } catch (_: Exception) { JSONObject() }
        if (code !in 200..299 || !o.has("device_code")) throw Exception(o.optString("error_description", o.optString("error", "Google no entregó el código")))
        return o
    }

    /** Devuelve el token, "" si todavía falta aprobar, o lanza error. */
    fun deviceToken(clientId: String, secret: String, deviceCode: String): String {
        val (_, txt) = http("POST", "https://oauth2.googleapis.com/token", null,
            "client_id=" + enc(clientId) + "&client_secret=" + enc(secret) + "&device_code=" + enc(deviceCode) +
                "&grant_type=" + enc("urn:ietf:params:oauth:grant-type:device_code"), form = true)
        val o = try { JSONObject(txt) } catch (_: Exception) { JSONObject() }
        o.optString("access_token").takeIf { it.isNotBlank() }?.let { return it }
        return when (o.optString("error")) {
            "authorization_pending", "slow_down" -> ""
            "access_denied" -> throw Exception("Cancelaste el permiso")
            "expired_token" -> throw Exception("El código venció")
            else -> throw Exception(o.optString("error_description", o.optString("error", "Error de Google")))
        }
    }

    // ---------------- Picker ----------------

    /** Crea la sesión: {id, pickerUri, pollMs} */
    fun createSession(token: String): JSONObject {
        val (code, txt) = http("POST", "$API/sessions", token, "{}")
        val o = try { JSONObject(txt) } catch (_: Exception) { JSONObject() }
        if (code !in 200..299 || !o.has("id")) throw Exception(o.optJSONObject("error")?.optString("message") ?: "No se pudo abrir Google Fotos ($code)")
        return o
    }

    fun sessionReady(token: String, id: String): Boolean {
        val (code, txt) = http("GET", "$API/sessions/" + enc(id), token)
        if (code == 404) throw Exception("La sesión de Google Fotos venció")
        return try { JSONObject(txt).optBoolean("mediaItemsSet") } catch (_: Exception) { false }
    }

    /** Descarga las fotos elegidas en tamaño TV. onProgress(hechas, total). Devuelve cuántas guardó. */
    fun download(c: Context, token: String, sessionId: String, onProgress: (Int, Int) -> Unit): Int {
        val items = ArrayList<JSONObject>()
        var page = ""
        do {
            val url = "$API/mediaItems?sessionId=" + enc(sessionId) + "&pageSize=100" + (if (page.isNotBlank()) "&pageToken=" + enc(page) else "")
            val (code, txt) = http("GET", url, token)
            if (code !in 200..299) throw Exception("Google Fotos no entregó las fotos ($code)")
            val o = JSONObject(txt)
            val arr = o.optJSONArray("mediaItems") ?: JSONArray()
            for (i in 0 until arr.length()) {
                val it = arr.optJSONObject(i) ?: continue
                if (it.optString("type") == "VIDEO") continue
                items.add(it)
            }
            page = o.optString("nextPageToken")
        } while (page.isNotBlank())

        var saved = 0
        items.forEachIndexed { idx, it ->
            onProgress(idx, items.size)
            val base = it.optJSONObject("mediaFile")?.optString("baseUrl") ?: return@forEachIndexed
            val name = "g_" + it.optString("id").replace(Regex("[^A-Za-z0-9_-]"), "").takeLast(40) + ".jpg"
            val out = File(dir(c), name)
            if (out.exists() && out.length() > 0) { saved++; return@forEachIndexed }
            try {
                // =w1920-h1080: Google entrega la foto ya reducida a tamaño TV (JPG)
                val con = URL("$base=w1920-h1080").openConnection() as HttpURLConnection
                con.setRequestProperty("Authorization", "Bearer $token")
                con.connectTimeout = 15000
                con.readTimeout = 60000
                if (con.responseCode in 200..299) {
                    val tmp = File(out.path + ".part")
                    con.inputStream.use { inp -> tmp.outputStream().use { inp.copyTo(it) } }
                    if (tmp.length() > 0 && tmp.renameTo(out)) saved++
                }
                con.disconnect()
            } catch (_: Exception) {}
        }
        onProgress(items.size, items.size)
        try { http("DELETE", "$API/sessions/" + enc(sessionId), token) } catch (_: Exception) {}
        return saved
    }
}
