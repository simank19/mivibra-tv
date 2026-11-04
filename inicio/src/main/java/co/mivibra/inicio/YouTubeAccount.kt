package co.mivibra.inicio

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Tu cuenta de YouTube en el inicio (API oficial, permiso de solo lectura):
 * se conecta con un código en google.com/device y trae lo nuevo de tus suscripciones y tus "Me gusta".
 * El token queda solo en la TV (SharedPreferences privadas de la app).
 */
object YouTubeAccount {
    private const val SCOPE = "https://www.googleapis.com/auth/youtube.readonly"
    private const val API = "https://www.googleapis.com/youtube/v3"

    private fun prefs(c: Context) = c.getSharedPreferences("ytacct", Context.MODE_PRIVATE)
    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    fun connected(c: Context) = !prefs(c).getString("refresh", null).isNullOrBlank()
    fun name(c: Context) = prefs(c).getString("name", "") ?: ""
    fun signOut(c: Context) { prefs(c).edit().clear().apply() }

    private fun http(method: String, url: String, token: String? = null, form: String? = null): Pair<Int, String> {
        val con = URL(url).openConnection() as HttpURLConnection
        con.requestMethod = method
        con.connectTimeout = 15000
        con.readTimeout = 20000
        if (token != null) con.setRequestProperty("Authorization", "Bearer $token")
        if (form != null) {
            con.doOutput = true
            con.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
            con.outputStream.use { it.write(form.toByteArray()) }
        }
        val code = con.responseCode
        val txt = try { (if (code in 200..299) con.inputStream else con.errorStream)?.bufferedReader()?.use { it.readText() } ?: "" } catch (_: Exception) { "" }
        con.disconnect()
        return code to txt
    }

    // ---------------- Conectar con código ----------------

    fun deviceCode(clientId: String): JSONObject {
        val (code, txt) = http("POST", "https://oauth2.googleapis.com/device/code", form = "client_id=" + enc(clientId) + "&scope=" + enc(SCOPE))
        val o = try { JSONObject(txt) } catch (_: Exception) { JSONObject() }
        if (code !in 200..299 || !o.has("device_code")) throw Exception(o.optString("error_description", o.optString("error", "Google no entregó el código")))
        return o
    }

    /** true = conectado; false = todavía falta aprobar en el celular. */
    fun poll(c: Context, clientId: String, secret: String, deviceCode: String): Boolean {
        val (_, txt) = http("POST", "https://oauth2.googleapis.com/token", form = "client_id=" + enc(clientId) + "&client_secret=" + enc(secret) +
            "&device_code=" + enc(deviceCode) + "&grant_type=" + enc("urn:ietf:params:oauth:grant-type:device_code"))
        val o = try { JSONObject(txt) } catch (_: Exception) { JSONObject() }
        val access = o.optString("access_token")
        if (access.isNotBlank()) {
            prefs(c).edit()
                .putString("refresh", o.optString("refresh_token"))
                .putString("access", access)
                .putLong("exp", System.currentTimeMillis() + o.optLong("expires_in", 3600) * 1000 - 60000)
                .apply()
            try { loadName(c, access) } catch (_: Exception) {}
            return true
        }
        return when (o.optString("error")) {
            "authorization_pending", "slow_down" -> false
            "access_denied" -> throw Exception("Cancelaste el permiso")
            "expired_token" -> throw Exception("El código venció")
            else -> throw Exception(o.optString("error_description", o.optString("error", "Error de Google")))
        }
    }

    private fun token(c: Context, clientId: String, secret: String): String {
        val p = prefs(c)
        val acc = p.getString("access", "") ?: ""
        if (acc.isNotBlank() && p.getLong("exp", 0) > System.currentTimeMillis()) return acc
        val refresh = p.getString("refresh", "") ?: ""
        if (refresh.isBlank()) throw Exception("YouTube no está conectado")
        val (code, txt) = http("POST", "https://oauth2.googleapis.com/token", form = "client_id=" + enc(clientId) + "&client_secret=" + enc(secret) +
            "&refresh_token=" + enc(refresh) + "&grant_type=refresh_token")
        val o = try { JSONObject(txt) } catch (_: Exception) { JSONObject() }
        val access = o.optString("access_token")
        if (access.isBlank()) {
            if (code == 400 || code == 401) signOut(c)   // permiso quitado desde la cuenta de Google
            throw Exception(o.optString("error_description", "Vuelve a conectar YouTube"))
        }
        p.edit().putString("access", access).putLong("exp", System.currentTimeMillis() + o.optLong("expires_in", 3600) * 1000 - 60000).apply()
        return access
    }

    private fun api(token: String, path: String): JSONObject {
        val (code, txt) = http("GET", "$API/$path", token)
        val o = try { JSONObject(txt) } catch (_: Exception) { JSONObject() }
        if (code !in 200..299) throw Exception(o.optJSONObject("error")?.optString("message") ?: "Error de YouTube ($code)")
        return o
    }

    private fun loadName(c: Context, token: String) {
        val ch = api(token, "channels?part=snippet&mine=true").optJSONArray("items")?.optJSONObject(0)
        prefs(c).edit().putString("name", ch?.optJSONObject("snippet")?.optString("title") ?: "").apply()
    }

    private fun video(id: String, sn: JSONObject?): JSONObject {
        val t = sn?.optJSONObject("thumbnails")
        val thumb = listOf("maxres", "standard", "high", "medium", "default").firstNotNullOfOrNull { t?.optJSONObject(it)?.optString("url")?.takeIf { u -> u.isNotBlank() } } ?: ""
        return JSONObject().put("id", id).put("title", sn?.optString("title") ?: "")
            .put("channel", sn?.optString("videoOwnerChannelTitle")?.takeIf { it.isNotBlank() } ?: sn?.optString("channelTitle") ?: "")
            .put("thumb", thumb).put("date", sn?.optString("publishedAt") ?: "")
    }

    // ---------------- Contenido ----------------

    /** {name, subs:[video], likes:[video]} */
    fun feed(c: Context, clientId: String, secret: String): JSONObject {
        val tk = token(c, clientId, secret)
        if (name(c).isBlank()) try { loadName(c, tk) } catch (_: Exception) {}

        // Canales que sigues (hasta 100, los más relevantes primero)
        val channels = ArrayList<String>()
        var page = ""
        do {
            val o = api(tk, "subscriptions?part=snippet&mine=true&maxResults=50&order=relevance" + (if (page.isNotBlank()) "&pageToken=" + enc(page) else ""))
            val arr = o.optJSONArray("items") ?: JSONArray()
            for (i in 0 until arr.length()) {
                arr.optJSONObject(i)?.optJSONObject("snippet")?.optJSONObject("resourceId")?.optString("channelId")?.takeIf { it.startsWith("UC") }?.let { channels.add(it) }
            }
            page = o.optString("nextPageToken")
        } while (page.isNotBlank() && channels.size < 100)

        // Últimos 3 videos de cada canal (lista "uploads" = UU + id del canal), en paralelo
        val pool = Executors.newFixedThreadPool(8)
        val tasks = channels.map { ch ->
            Callable {
                val out = ArrayList<JSONObject>()
                try {
                    val arr = api(tk, "playlistItems?part=snippet,contentDetails&maxResults=3&playlistId=UU" + ch.substring(2)).optJSONArray("items") ?: JSONArray()
                    for (i in 0 until arr.length()) {
                        val it = arr.optJSONObject(i) ?: continue
                        val sn = it.optJSONObject("snippet")
                        val id = it.optJSONObject("contentDetails")?.optString("videoId") ?: sn?.optJSONObject("resourceId")?.optString("videoId") ?: continue
                        val v = video(id, sn)
                        it.optJSONObject("contentDetails")?.optString("videoPublishedAt")?.takeIf { d -> d.isNotBlank() }?.let { d -> v.put("date", d) }
                        out.add(v)
                    }
                } catch (_: Exception) {}
                out
            }
        }
        val all = ArrayList<JSONObject>()
        try { pool.invokeAll(tasks, 40, TimeUnit.SECONDS).forEach { f -> try { all.addAll(f.get()) } catch (_: Exception) {} } } finally { pool.shutdownNow() }
        val subs = JSONArray()
        all.filter { it.optString("title") != "Private video" && it.optString("title") != "Deleted video" }
            .sortedByDescending { it.optString("date") }.take(30).forEach { subs.put(it) }

        // Tus "Me gusta"
        val likes = JSONArray()
        try {
            val arr = api(tk, "videos?part=snippet&myRating=like&maxResults=25").optJSONArray("items") ?: JSONArray()
            for (i in 0 until arr.length()) {
                val it = arr.optJSONObject(i) ?: continue
                likes.put(video(it.optString("id"), it.optJSONObject("snippet")))
            }
        } catch (_: Exception) {}

        return JSONObject().put("name", name(c)).put("subs", subs).put("likes", likes)
    }
}
