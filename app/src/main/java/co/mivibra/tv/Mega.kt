package co.mivibra.tv

import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import javax.crypto.Cipher
import javax.crypto.CipherInputStream
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Enlaces públicos de MEGA (carpetas y archivos compartidos). La clave viene en el propio enlace que
 * compartió el dueño: con ella se leen los nombres y se descifra el archivo, igual que hace la web de MEGA.
 * Formato interno de cada libro de una carpeta: mega:CARPETA:NODO:CLAVE (base64url).
 */
object Mega {
    private const val API = "https://g.api.mega.co.nz/cs"
    private var seq = (Math.random() * 1e9).toLong()

    private fun b64(s: String): ByteArray {
        var t = s.replace('-', '+').replace('_', '/').replace(",", "")
        while (t.length % 4 != 0) t += "="
        return Base64.decode(t, Base64.DEFAULT)
    }
    fun b64url(b: ByteArray): String = Base64.encodeToString(b, Base64.NO_WRAP or Base64.NO_PADDING or Base64.URL_SAFE)

    private fun api(body: String, folder: String?): Any {
        val q = "?id=" + (seq++) + (if (folder != null) "&n=$folder" else "")
        var tries = 0
        while (true) {
            val c = URL(API + q).openConnection() as HttpURLConnection
            c.requestMethod = "POST"; c.doOutput = true; c.connectTimeout = 20000; c.readTimeout = 40000
            c.setRequestProperty("Content-Type", "application/json")
            c.outputStream.use { it.write(body.toByteArray()) }
            val txt = (if (c.responseCode >= 400) c.errorStream else c.inputStream)?.bufferedReader()?.use { it.readText() } ?: ""
            c.disconnect()
            val v: Any = if (txt.trim().startsWith("[")) JSONArray(txt).get(0) else txt.trim().toIntOrNull() ?: -1
            // -3: MEGA pide reintentar
            if (v is Int && v == -3 && tries++ < 4) { Thread.sleep(800L * tries); continue }
            if (v is Int && v < 0) throw IllegalStateException(when (v) { -9 -> "El enlace de MEGA no existe o fue borrado"; -11, -16 -> "MEGA bloqueó el acceso a ese enlace"; -17 -> "Se superó el límite de descargas de MEGA, intenta más tarde"; else -> "MEGA respondió con error $v" })
            return v
        }
    }

    private fun ecb(key: ByteArray, data: ByteArray): ByteArray {
        val c = Cipher.getInstance("AES/ECB/NoPadding"); c.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES")); return c.doFinal(data)
    }
    private fun aesKey(k: ByteArray): ByteArray = if (k.size >= 32) ByteArray(16) { (k[it].toInt() xor k[it + 16].toInt()).toByte() } else k.copyOf(16)

    private fun attrs(a: String, k: ByteArray): JSONObject? = try {
        val c = Cipher.getInstance("AES/CBC/NoPadding"); c.init(Cipher.DECRYPT_MODE, SecretKeySpec(aesKey(k), "AES"), IvParameterSpec(ByteArray(16)))
        val s = String(c.doFinal(b64(a)), Charsets.UTF_8).trimEnd('\u0000')
        if (s.startsWith("MEGA{")) JSONObject(s.substring(4, s.lastIndexOf('}') + 1)) else null
    } catch (_: Exception) { null }

    /** "https://mega.nz/folder/ID#KEY", "https://mega.nz/#F!ID!KEY", "https://mega.nz/file/ID#KEY" o "https://mega.nz/#!ID!KEY" */
    data class Link(val folder: Boolean, val id: String, val key: String)
    fun parse(u: String): Link? {
        Regex("mega(?:\\.co)?\\.nz/(folder|file)/([\\w-]+)#([\\w-]+)").find(u)?.let { return Link(it.groupValues[1] == "folder", it.groupValues[2], it.groupValues[3]) }
        Regex("mega(?:\\.co)?\\.nz/#(F?)!([\\w-]+)!([\\w-]+)").find(u)?.let { return Link(it.groupValues[1] == "F", it.groupValues[2], it.groupValues[3]) }
        return null
    }

    /** Lista los archivos de una carpeta compartida (con sus subcarpetas como "ruta"). */
    fun list(link: String): JSONArray {
        val l = parse(link) ?: throw IllegalArgumentException("No es un enlace de MEGA")
        val out = JSONArray()
        if (!l.folder) {
            val k = b64(l.key)
            val r = api("""[{"a":"g","p":"${l.id}"}]""", null) as JSONObject
            val name = attrs(r.optString("at"), k)?.optString("n") ?: "Libro"
            out.put(JSONObject().put("name", name).put("size", r.optLong("s")).put("url", link).put("path", ""))
            return out
        }
        val master = b64(l.key)
        val r = api("""[{"a":"f","c":1,"ca":1,"r":1}]""", l.id) as JSONObject
        val nodes = r.optJSONArray("f") ?: JSONArray()
        val names = HashMap<String, String>(); val parent = HashMap<String, String>()
        val files = ArrayList<Triple<JSONObject, ByteArray, String>>()
        for (i in 0 until nodes.length()) {
            val n = nodes.optJSONObject(i) ?: continue
            val h = n.optString("h")
            // "k" puede traer varias claves (dueño:clave/carpeta:clave): se usa la que abre los atributos con la clave del enlace
            var key: ByteArray? = null; var name: String? = null
            for (pair in n.optString("k").split("/")) {
                val kk = pair.substringAfter(':', "")
                if (kk.isBlank()) continue
                val k2 = try { ecb(master, b64(kk)) } catch (_: Exception) { continue }
                val nm = attrs(n.optString("a"), k2)?.optString("n")
                if (!nm.isNullOrEmpty()) { key = k2; name = nm; break }
            }
            if (key == null || name == null) continue
            names[h] = name; parent[h] = n.optString("p")
            if (n.optInt("t") == 0) files.add(Triple(n, key, name))
        }
        for ((n, key, name) in files) {
            // Ruta de subcarpetas (sin la carpeta principal) para agrupar por categoría
            val path = ArrayList<String>(); var p = parent[n.optString("h")]; var guard = 0
            while (p != null && names[p] != null && parent[p] != null && names[parent[p]!!] != null && guard++ < 10) { path.add(0, names[p]!!); p = parent[p] }
            out.put(JSONObject().put("name", name).put("size", n.optLong("s"))
                .put("url", "mega:" + l.id + ":" + n.optString("h") + ":" + b64url(key)).put("path", path.joinToString(" / ")))
        }
        return out
    }

    /** Descarga y descifra un archivo (de carpeta "mega:…" o enlace de archivo). */
    fun download(src: String, dest: File, tick: (Int) -> Unit) {
        val key: ByteArray; val r: JSONObject
        if (src.startsWith("mega:")) {
            val p = src.split(":")
            key = b64(p[3]); r = api("""[{"a":"g","g":1,"ssl":1,"n":"${p[2]}"}]""", p[1]) as JSONObject
        } else {
            val l = parse(src) ?: throw IllegalArgumentException("Enlace de MEGA no válido")
            if (l.folder) throw IllegalArgumentException("Es una carpeta de MEGA: agrégala en Libros por enlace")
            key = b64(l.key); r = api("""[{"a":"g","g":1,"ssl":1,"p":"${l.id}"}]""", null) as JSONObject
        }
        val url = r.optString("g").ifBlank { throw IllegalStateException("MEGA no dio el archivo") }
        val total = r.optLong("s")
        val iv = ByteArray(16).also { System.arraycopy(key, 16, it, 0, 8) }
        val c = Cipher.getInstance("AES/CTR/NoPadding"); c.init(Cipher.DECRYPT_MODE, SecretKeySpec(aesKey(key), "AES"), IvParameterSpec(iv))
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 30000; conn.readTimeout = 60000
        if (conn.responseCode >= 400) throw IllegalStateException("MEGA respondió con error " + conn.responseCode)
        val tmp = File(dest.parentFile, dest.name + ".part")
        CipherInputStream(conn.inputStream, c).use { ins ->
            tmp.outputStream().use { out ->
                val buf = ByteArray(128 * 1024); var done = 0L; var last = -1
                while (true) {
                    val n = ins.read(buf); if (n < 0) break
                    out.write(buf, 0, n); done += n
                    val pct = if (total > 0) (done * 100 / total).toInt() else -1
                    if (pct != last) { last = pct; tick(pct) }
                }
            }
        }
        conn.disconnect()
        dest.delete(); tmp.renameTo(dest)
    }
}
