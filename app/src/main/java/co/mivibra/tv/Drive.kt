package co.mivibra.tv

import android.content.Context
import android.os.Environment
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.Scope
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Google Drive del usuario: sus ROMs (una carpeta que elige) y sus partidas guardadas
 * (carpeta "MiVibra Partidas" que crea la app), para jugar desde cualquier equipo.
 */
object Drive {
    private const val API = "https://www.googleapis.com/drive/v3"
    private val SCOPES = listOf(Scope("https://www.googleapis.com/auth/drive.readonly"), Scope("https://www.googleapis.com/auth/drive.file"))
    private fun prefs(c: Context) = c.getSharedPreferences("drive", Context.MODE_PRIVATE)

    // ---------- Permiso (cuenta de Google del equipo) ----------
    /** Pide el token. Si hace falta que el usuario acepte, muestra la pantalla de Google (solo si interactive). */
    fun token(a: MainActivity, interactive: Boolean, done: (String?, String?) -> Unit) {
        // Conectado desde el celular (código QR): se usa el permiso guardado, sin ventanas en la TV
        if (prefs(a).getString("rt", null) != null) {
            Thread {
                try { val t = webAccess(a); a.runOnUiThread { done(t, null) } }
                catch (e: Exception) { a.runOnUiThread { done(null, e.message ?: "Error con Google") } }
            }.start()
            return
        }
        if (interactive) { done(null, "PHONE"); return }
        val acct = prefs(a).getString("acct", null)
        if (acct != null) { legacyToken(a, acct, interactive, true, done); return }
        val req = AuthorizationRequest.builder().setRequestedScopes(SCOPES).build()
        Identity.getAuthorizationClient(a).authorize(req)
            .addOnSuccessListener { r ->
                if (r.hasResolution()) {
                    if (!interactive) { done(null, "NO_AUTH"); return@addOnSuccessListener }
                    try {
                        a.startSenderForResult(r.pendingIntent!!.intentSender) { code, data ->
                            try {
                                val res = Identity.getAuthorizationClient(a).getAuthorizationResultFromIntent(data)
                                if (res.accessToken != null) checked(a, res.accessToken!!, res.grantedScopes, done)
                                else done(null, if (code == android.app.Activity.RESULT_CANCELED) "cancelado" else "Google no dio permiso")
                            } catch (e: Exception) {
                                // Si Google devuelve un error con código (p. ej. 10 = la app no está registrada en Google Cloud), se muestra;
                                // solo se calla cuando de verdad el usuario cerró la ventana
                                val st = (e as? com.google.android.gms.common.api.ApiException)?.statusCode
                                // Error 8 (y otros internos): en muchos televisores esta ventana de permisos no funciona;
                                // se usa el método clásico de cuentas de Android, que sí abre en TV
                                if (st != null && st != 10 && st != 16 && st != 12501) { legacySignIn(a, done); return@startSenderForResult }
                                done(null, when {
                                    st == 10 -> "Google no reconoce la app: falta el cliente Android (paquete co.mivibra.tv y huella SHA-1) en Google Cloud"
                                    code == android.app.Activity.RESULT_CANCELED -> "cancelado"
                                    else -> e.message ?: "Google no dio permiso"
                                })
                            }
                        }
                    } catch (e: Exception) { done(null, e.message ?: "No se pudo abrir la cuenta de Google") }
                } else {
                    val t = r.accessToken
                    if (t == null) done(null, "Google no dio permiso") else checked(a, t, r.grantedScopes, done)
                }
            }
            .addOnFailureListener { e -> done(null, e.message ?: "No se pudo conectar con Google") }
    }
    // ---------- Método clásico (cuenta de Android + GoogleAuthUtil): funciona en Android TV ----------
    private const val SCOPE_STR = "oauth2:https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file"
    @Suppress("DEPRECATION")
    private fun legacySignIn(a: MainActivity, done: (String?, String?) -> Unit) {
        try {
            val gso = com.google.android.gms.auth.api.signin.GoogleSignInOptions.Builder(com.google.android.gms.auth.api.signin.GoogleSignInOptions.DEFAULT_SIGN_IN).requestEmail().build()
            val client = com.google.android.gms.auth.api.signin.GoogleSignIn.getClient(a, gso)
            a.startForResult(client.signInIntent) { code, data ->
                try {
                    val acc = com.google.android.gms.auth.api.signin.GoogleSignIn.getSignedInAccountFromIntent(data)
                        .getResult(com.google.android.gms.common.api.ApiException::class.java)
                    val name = acc?.email ?: acc?.account?.name
                    if (name == null) { done(null, "Google no dio la cuenta"); return@startForResult }
                    legacyToken(a, name, true, false, done)
                } catch (e: com.google.android.gms.common.api.ApiException) {
                    done(null, if (e.statusCode == 12501 || e.statusCode == 16 || code == android.app.Activity.RESULT_CANCELED) "cancelado" else "Google respondió con el error ${e.statusCode} (método clásico)")
                } catch (e: Exception) { done(null, e.message ?: "Google no dio permiso") }
            }
        } catch (e: Exception) { done(null, e.message ?: "No se pudo abrir la cuenta de Google") }
    }
    /** Token con la cuenta guardada; si Google pide aceptar los permisos, abre su pantalla (una vez). */
    @Suppress("DEPRECATION")
    private fun legacyToken(a: MainActivity, name: String, interactive: Boolean, canRetry: Boolean, done: (String?, String?) -> Unit) {
        Thread {
            try {
                val acc = android.accounts.Account(name, "com.google")
                val t = com.google.android.gms.auth.GoogleAuthUtil.getToken(a, acc, SCOPE_STR)
                prefs(a).edit().putString("acct", name).putBoolean("on", true).apply()
                a.runOnUiThread { done(t, null) }
            } catch (e: com.google.android.gms.auth.UserRecoverableAuthException) {
                val i = e.intent
                a.runOnUiThread {
                    if (!interactive || i == null) { done(null, "NO_AUTH"); return@runOnUiThread }
                    try {
                        a.startForResult(i) { code, _ ->
                            if (code == android.app.Activity.RESULT_OK) legacyToken(a, name, false, false, done)
                            else done(null, "cancelado")
                        }
                    } catch (x: Exception) { done(null, x.message ?: "No se pudo abrir la pantalla de permisos") }
                }
            } catch (e: com.google.android.gms.auth.GoogleAuthException) {
                // La cuenta guardada ya no sirve (se quitó del equipo, etc.): se olvida y se vuelve a elegir
                prefs(a).edit().remove("acct").apply()
                a.runOnUiThread { if (interactive && canRetry) legacySignIn(a, done) else done(null, "Google: ${e.message}") }
            } catch (e: Exception) {
                a.runOnUiThread { done(null, e.message ?: "Sin conexión con Google") }
            }
        }.start()
    }
    /** Al usar el token y recibir 401 (venció): se borra de la caché para pedir uno nuevo. */
    @Suppress("DEPRECATION")
    fun dropToken(c: Context, token: String) { prefs(c).edit().remove("at").apply(); try { if (prefs(c).getString("acct", null) != null) com.google.android.gms.auth.GoogleAuthUtil.clearToken(c, token) } catch (_: Exception) {} }

    // ---------- Conexión desde el celular (en la TV Google no deja dar el permiso de ver archivos) ----------
    const val REDIRECT = "https://simank19.github.io/mivibra-tv/drive.html"
    private const val WEB_SCOPES = "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file"
    fun setKeys(c: Context, id: String, secret: String) {
        if (id.isBlank() || secret.isBlank()) return
        prefs(c).edit().putString("cid", id.trim()).putString("csec", secret.trim()).apply()
    }
    fun clientId(c: Context) = prefs(c).getString("cid", "") ?: ""
    fun hasKeys(c: Context) = !prefs(c).getString("cid", null).isNullOrBlank() && !prefs(c).getString("csec", null).isNullOrBlank()
    fun authUrl(c: Context, state: String): String {
        val p = prefs(c)
        return "https://accounts.google.com/o/oauth2/v2/auth?client_id=${q(p.getString("cid", "")!!)}&redirect_uri=${q(REDIRECT)}" +
            "&response_type=code&access_type=offline&prompt=consent&include_granted_scopes=true&scope=${q(WEB_SCOPES)}&state=${q(state)}"
    }
    private fun tokenCall(form: String): JSONObject {
        val c = URL("https://oauth2.googleapis.com/token").openConnection() as HttpURLConnection
        c.requestMethod = "POST"; c.doOutput = true; c.connectTimeout = 20000; c.readTimeout = 30000
        c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
        c.outputStream.use { it.write(form.toByteArray()) }
        val code = c.responseCode
        val body = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
        val o = try { JSONObject(body) } catch (_: Exception) { JSONObject() }
        if (code !in 200..299) throw IllegalStateException("Google: " + (o.optString("error_description").ifBlank { o.optString("error").ifBlank { "error $code" } }))
        return o
    }
    /** Cambia el código que llegó del celular por el permiso permanente (refresh token). */
    fun exchange(c: Context, code: String) {
        val p = prefs(c)
        val o = tokenCall("code=${q(code)}&client_id=${q(p.getString("cid", "")!!)}&client_secret=${q(p.getString("csec", "")!!)}&redirect_uri=${q(REDIRECT)}&grant_type=authorization_code")
        val rt = o.optString("refresh_token")
        if (rt.isBlank()) throw IllegalStateException("Google no entregó el permiso permanente; vuelve a intentar")
        if (!o.optString("scope").contains("drive.readonly")) throw IllegalStateException("Falta marcar la casilla «Ver y descargar todos tus archivos de Google Drive»")
        p.edit().putString("rt", rt).putString("at", o.optString("access_token"))
            .putLong("atExp", System.currentTimeMillis() + o.optLong("expires_in", 3000) * 1000 - 60000)
            .putBoolean("on", true).remove("acct").remove("savesId").apply()
    }
    private fun webAccess(c: Context): String {
        val p = prefs(c)
        val at = p.getString("at", null)
        if (at != null && System.currentTimeMillis() < p.getLong("atExp", 0)) return at
        val o = try {
            tokenCall("refresh_token=${q(p.getString("rt", "")!!)}&client_id=${q(p.getString("cid", "")!!)}&client_secret=${q(p.getString("csec", "")!!)}&grant_type=refresh_token")
        } catch (e: IllegalStateException) {
            if (e.message?.contains("invalid_grant") == true || e.message?.contains("expired", true) == true || e.message?.contains("revoked", true) == true) {
                p.edit().remove("rt").remove("at").putBoolean("on", false).apply()
                throw IllegalStateException("El permiso de Google Drive venció: vuelve a conectar con el celular")
            }
            throw e
        }
        val t = o.getString("access_token")
        p.edit().putString("at", t).putLong("atExp", System.currentTimeMillis() + o.optLong("expires_in", 3000) * 1000 - 60000).apply()
        return t
    }

    private const val READ = "https://www.googleapis.com/auth/drive.readonly"
    /**
     * En la pantalla de Google cada permiso trae su casilla: si no se marcó "ver y descargar tus archivos",
     * Drive solo deja ver lo que creó la app y la carpeta de juegos sale vacía. En ese caso se retira el permiso
     * (para que la próxima vez Google vuelva a preguntar) y se explica qué marcar.
     */
    private fun checked(a: MainActivity, token: String, granted: List<String>?, done: (String?, String?) -> Unit) {
        if (granted != null && granted.isNotEmpty() && READ !in granted) {
            prefs(a).edit().clear().apply()
            Thread {
                try { val c = URL("https://oauth2.googleapis.com/revoke?token=${q(token)}").openConnection() as HttpURLConnection
                    c.requestMethod = "POST"; c.doOutput = true; c.outputStream.close(); c.responseCode; c.disconnect() } catch (_: Exception) {}
                a.runOnUiThread { done(null, "Falta un permiso: vuelve a conectar y en la pantalla de Google marca la casilla «Ver y descargar todos tus archivos de Google Drive»") }
            }.start()
            return
        }
        prefs(a).edit().putBoolean("on", true).apply()
        done(token, null)
    }
    fun connected(c: Context) = prefs(c).getBoolean("on", false)
    fun disconnect(c: Context) {
        // Se olvida la cuenta pero no las claves de la app (Client ID / secreto)
        val p = prefs(c); val id = p.getString("cid", null); val sec = p.getString("csec", null)
        p.edit().clear().apply()
        if (id != null && sec != null) setKeys(c, id, sec)
    }

    // ---------- Llamadas a Drive ----------
    private fun open(url: String, token: String, method: String = "GET"): HttpURLConnection {
        val c = URL(url).openConnection() as HttpURLConnection
        c.requestMethod = method; c.connectTimeout = 20000; c.readTimeout = 60000
        c.setRequestProperty("Authorization", "Bearer $token")
        return c
    }
    private fun json(c: HttpURLConnection): JSONObject {
        val code = c.responseCode
        val body = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
        if (code !in 200..299) {
            val msg = try { JSONObject(body).getJSONObject("error").optString("message") } catch (_: Exception) { body.take(200) }
            if (code == 401) throw IllegalStateException("AUTH")
            if (code == 403 && msg.contains("has not been used", true)) throw IllegalStateException("Falta activar la API de Google Drive en el proyecto (te pasé los pasos)")
            throw IllegalStateException("Drive: $msg")
        }
        return if (body.isBlank()) JSONObject() else JSONObject(body)
    }
    private fun q(s: String) = URLEncoder.encode(s, "UTF-8")
    private fun listAll(token: String, query: String, fields: String): JSONArray {
        val out = JSONArray(); var page: String? = null; var n = 0
        do {
            val url = "$API/files?pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true&q=${q(query)}&fields=${q("nextPageToken,files($fields)")}" + (page?.let { "&pageToken=${q(it)}" } ?: "")
            val r = json(open(url, token))
            val fs = r.optJSONArray("files") ?: JSONArray()
            for (i in 0 until fs.length()) out.put(fs.getJSONObject(i))
            page = r.optString("nextPageToken").ifEmpty { null }
        } while (page != null && ++n < 50)
        return out
    }

    private const val FOLDER = "application/vnd.google-apps.folder"
    private const val SHORTCUT = "application/vnd.google-apps.shortcut"

    /**
     * Carpetas para elegir: las de un nivel (parent) o las que coinciden con un nombre.
     * También los "accesos directos" a carpetas (así se ven en Mi unidad las carpetas que otros compartieron);
     * se devuelve la carpeta real a la que apuntan. Sin parent, al final va "Compartidos conmigo".
     */
    fun folders(token: String, parent: String?, search: String?): JSONArray {
        val kinds = "(mimeType='$FOLDER' or mimeType='$SHORTCUT') and trashed=false"
        val query = when {
            !search.isNullOrBlank() -> "$kinds and name contains '${search.replace("\\", "").replace("'", "\\'")}'"
            parent == "shared" -> "mimeType='$FOLDER' and sharedWithMe=true and trashed=false"
            else -> "$kinds and '${parent ?: "root"}' in parents"
        }
        val fs = listAll(token, query, "id,name,mimeType,shortcutDetails")
        val out = JSONArray(); val seen = HashSet<String>()
        for (i in 0 until fs.length()) {
            val f = fs.getJSONObject(i)
            val id = if (f.optString("mimeType") == SHORTCUT) {
                val d = f.optJSONObject("shortcutDetails") ?: continue
                if (d.optString("targetMimeType") != FOLDER) continue
                d.optString("targetId")
            } else f.getString("id")
            if (id.isBlank() || !seen.add(id)) continue
            out.put(JSONObject().put("id", id).put("name", f.optString("name")))
        }
        val sorted = (0 until out.length()).map { out.getJSONObject(it) }.sortedBy { it.optString("name").lowercase() }
        val res = JSONArray(); sorted.forEach { res.put(it) }
        if (parent.isNullOrBlank() && search.isNullOrBlank()) res.put(JSONObject().put("id", "shared").put("name", "Compartidos conmigo"))
        return res
    }

    /** Archivos de la carpeta de juegos (también los de sus subcarpetas y accesos directos, hasta 4 niveles). */
    fun games(token: String, folder: String): JSONArray {
        val out = JSONArray(); val seen = HashSet<String>()
        fun walk(id: String, sub: String, depth: Int) {
            if (!seen.add(id)) return
            val q = if (id == "shared") "sharedWithMe=true and trashed=false" else "'$id' in parents and trashed=false"
            val fs = listAll(token, q, "id,name,size,mimeType,modifiedTime,shortcutDetails")
            for (i in 0 until fs.length()) {
                val f = fs.getJSONObject(i); val mt = f.optString("mimeType")
                when {
                    mt == FOLDER -> if (depth < 4) walk(f.getString("id"), sub + f.getString("name") + "/", depth + 1)
                    mt == SHORTCUT -> {
                        val d = f.optJSONObject("shortcutDetails") ?: continue
                        val tid = d.optString("targetId"); if (tid.isBlank()) continue
                        if (d.optString("targetMimeType") == FOLDER) { if (depth < 4) walk(tid, sub + f.getString("name") + "/", depth + 1) }
                        else if (!d.optString("targetMimeType").startsWith("application/vnd.google-apps") && seen.add(tid))
                            out.put(JSONObject().put("id", tid).put("name", f.optString("name")).put("size", "0").put("sub", sub))
                    }
                    !mt.startsWith("application/vnd.google-apps") -> if (seen.add(f.getString("id"))) out.put(f.put("sub", sub))
                }
            }
        }
        walk(folder, "", 0)
        return out
    }

    // ---------- Juego descargado solo mientras se juega ----------
    fun cacheDir(c: Context) = File(c.getExternalFilesDir(null) ?: c.filesDir, "drive").apply { mkdirs() }
    fun download(c: Context, token: String, id: String, name: String, onPct: (Int) -> Unit): String {
        require(id.matches(Regex("[A-Za-z0-9_-]+"))) { "Archivo no válido" }
        val safe = name.replace(Regex("[\\\\/:*?\"<>|]"), "_").ifBlank { id }
        val dir = File(cacheDir(c), id).apply { mkdirs() }
        val out = File(dir, safe)
        var conn = open("$API/files/$id?alt=media&supportsAllDrives=true", token)
        var code = conn.responseCode
        if (code == 401) throw IllegalStateException("AUTH")
        var copyId: String? = null
        if (code == 403) {
            val why = errorReason(conn)
            if (why.contains("abus", true) || why.contains("malware", true)) {
                // Google marca muchas ROMs/zip como "posible riesgo" y no las entrega sin confirmar: se confirma y se pide otra vez
                conn = open("$API/files/$id?alt=media&acknowledgeAbuse=true&supportsAllDrives=true", token)
                code = conn.responseCode
            } else if (why.contains("quota", true) || why.contains("limit", true)) {
                // Archivo compartido que ya bajó mucha gente hoy: se hace una copia en tu Drive (tiene su propio límite) y se baja esa
                copyId = copyToMyDrive(token, id, safe)
                conn = open("$API/files/$copyId?alt=media&acknowledgeAbuse=true", token)
                code = conn.responseCode
            } else if (why.contains("appNotAuthorized", true) || why.contains("insufficientPermissions", true) || why.contains("insufficient authentication scopes", true)) {
                throw IllegalStateException("Falta permiso para leer ese archivo: desconecta Google Drive en Juegos y vuelve a conectarlo marcando la casilla \"Ver todos tus archivos de Google Drive\".")
            } else if (why.contains("cannotDownload", true) || why.contains("copyRequiresWriterPermission", true) || why.contains("insufficient", true)) {
                throw IllegalStateException("El dueño de ese archivo no permite descargarlo. Pídele que active \"Permitir que los lectores descarguen\" o súbelo a tu propio Drive.")
            } else {
                throw IllegalStateException("Drive no entregó el juego: " + why.ifBlank { "403" })
            }
        }
        if (code == 401) throw IllegalStateException("AUTH")
        if (code !in 200..299) {
            val why = errorReason(conn)
            copyId?.let { deleteQuiet(token, it) }
            throw IllegalStateException("Drive no entregó el juego ($code" + (if (why.isNotBlank()) ": $why" else "") + ")")
        }
        try {
            return save(c, token, id, conn, dir, out, safe, onPct)
        } finally {
            copyId?.let { deleteQuiet(token, it) }
        }
    }

    /** Motivo del error que da Drive (cannotDownloadAbusiveFile, downloadQuotaExceeded…) y su mensaje. */
    private fun errorReason(conn: HttpURLConnection): String {
        val body = try { conn.errorStream?.bufferedReader()?.use { it.readText() } ?: "" } catch (_: Exception) { "" }
        return try {
            val e = JSONObject(body).getJSONObject("error")
            val r = e.optJSONArray("errors")?.optJSONObject(0)?.optString("reason") ?: ""
            (r + " " + e.optString("message")).trim()
        } catch (_: Exception) { body.take(200) }
    }

    /** Copia temporal del juego en tu Drive (en la carpeta de MiVibra), que se borra al terminar de bajarla. */
    private fun copyToMyDrive(token: String, id: String, name: String): String {
        val c = open("$API/files/$id/copy?supportsAllDrives=true&fields=id", token, "POST")
        c.doOutput = true
        c.setRequestProperty("Content-Type", "application/json")
        c.outputStream.use { it.write(JSONObject().put("name", "MiVibra (temporal) $name").toString().toByteArray()) }
        val nid = try { json(c).optString("id") } catch (e: Exception) {
            throw IllegalStateException("Google limitó las descargas de ese archivo por hoy (lo bajó mucha gente). Haz una copia en tu Drive (clic derecho › Hacer una copia) y juega con la copia.")
        }
        if (nid.isBlank()) throw IllegalStateException("No se pudo copiar el juego a tu Drive")
        return nid
    }

    private fun deleteQuiet(token: String, id: String) {
        try { val c = open("$API/files/$id", token, "DELETE"); c.responseCode; c.disconnect() } catch (_: Exception) {}
    }

    private fun save(c: Context, token: String, id: String, conn: HttpURLConnection, dir: File, out: File, safe: String, onPct: (Int) -> Unit): String {
        // Drive a veces no manda el tamaño (descarga por partes): se pregunta aparte
        var total = conn.contentLengthLong
        if (total <= 0) total = try { json(open("$API/files/$id?fields=size&supportsAllDrives=true", token)).optString("size").toLongOrNull() ?: 0L } catch (_: Exception) { 0L }
        if (total <= 0) total = Long.MAX_VALUE
        if (out.exists() && (out.length() == total || (total == Long.MAX_VALUE && out.length() > 0))) { conn.disconnect(); return out.absolutePath }
        // Solo un juego a la vez en el equipo
        cacheDir(c).listFiles()?.forEach { if (it != dir) it.deleteRecursively() }
        val tmp = File(dir, "$safe.part")
        var done = 0L; var last = -1
        conn.inputStream.use { i -> tmp.outputStream().use { o ->
            val buf = ByteArray(256 * 1024)
            while (true) { val n = i.read(buf); if (n < 0) break; o.write(buf, 0, n); done += n
                val p = if (total == Long.MAX_VALUE) -1 else (done.toDouble() * 100 / total).toInt().coerceIn(0, 100); if (p != last) { last = p; onPct(p) } }
        } }
        if (!tmp.renameTo(out)) throw IllegalStateException("No se pudo guardar el juego")
        prefs(c).edit().putString("last", safe).apply()
        return out.absolutePath
    }
    /** Al terminar de jugar se borra lo descargado (también lo descomprimido para RetroArch). */
    fun clearCache(c: Context) {
        cacheDir(c).deleteRecursively()
        val ra = File(Environment.getExternalStorageDirectory(), "MiVibra/RetroArch")
        // La copia que se le pasó a RetroArch
        prefs(c).getString("last", null)?.let { n -> File(ra, "enviados/$n").delete(); prefs(c).edit().remove("last").apply() }
    }

    // ---------- Partidas guardadas en "MiVibra Partidas" ----------
    /** Carpetas locales de partidas: emulador de MiVibra y RetroArch. */
    fun saveAreas(c: Context): Map<String, File> {
        val ra = File(Environment.getExternalStorageDirectory(), "MiVibra/RetroArch")
        return linkedMapOf(
            "mivibra-saves" to File(c.filesDir, "saves"), "mivibra-states" to File(c.filesDir, "states"),
            "retroarch-saves" to File(ra, "saves"), "retroarch-states" to File(ra, "states")
        )
    }
    private fun savesFolder(c: Context, token: String): String {
        prefs(c).getString("savesId", null)?.let { return it }
        val found = listAll(token, "name='MiVibra Partidas' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents", "id,name")
        val id = if (found.length() > 0) found.getJSONObject(0).getString("id") else {
            val c2 = open("$API/files?fields=id", token, "POST")
            c2.doOutput = true; c2.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            c2.outputStream.use { it.write(JSONObject().put("name", "MiVibra Partidas").put("mimeType", "application/vnd.google-apps.folder").toString().toByteArray()) }
            json(c2).getString("id")
        }
        prefs(c).edit().putString("savesId", id).apply()
        return id
    }
    private fun upload(token: String, folder: String, name: String, f: File, existing: String?) {
        val meta = JSONObject().put("name", name).put("appProperties", JSONObject().put("mt", f.lastModified().toString()))
        if (existing == null) meta.put("parents", JSONArray().put(folder))
        val start = open("https://www.googleapis.com/upload/drive/v3/files" + (existing?.let { "/$it" } ?: "") + "?uploadType=resumable", token, if (existing == null) "POST" else "PATCH")
        if (existing != null) { start.setRequestProperty("X-HTTP-Method-Override", "PATCH"); start.requestMethod = "POST" }
        start.doOutput = true
        start.setRequestProperty("Content-Type", "application/json; charset=utf-8")
        start.setRequestProperty("X-Upload-Content-Length", f.length().toString())
        start.outputStream.use { it.write(meta.toString().toByteArray()) }
        val code = start.responseCode
        if (code == 401) throw IllegalStateException("AUTH")
        val loc = start.getHeaderField("Location") ?: throw IllegalStateException("Drive no aceptó la partida ($code)")
        val put = URL(loc).openConnection() as HttpURLConnection
        put.requestMethod = "PUT"; put.doOutput = true; put.setFixedLengthStreamingMode(f.length())
        put.connectTimeout = 20000; put.readTimeout = 120000
        f.inputStream().use { i -> put.outputStream.use { o -> i.copyTo(o, 256 * 1024) } }
        if (put.responseCode !in 200..299) throw IllegalStateException("No se pudo subir la partida (${put.responseCode})")
    }
    /**
     * Sincroniza en ambos sentidos: lo más nuevo gana (por la hora de la última modificación).
     * Devuelve {up, down}.
     */
    fun syncSaves(c: Context, token: String): JSONObject {
        val folder = savesFolder(c, token)
        val remote = HashMap<String, JSONObject>()
        val rs = listAll(token, "'$folder' in parents and trashed=false", "id,name,appProperties,modifiedTime")
        for (i in 0 until rs.length()) { val f = rs.getJSONObject(i); remote[f.getString("name")] = f }
        var up = 0; var down = 0
        val seen = HashSet<String>()
        for ((area, dir) in saveAreas(c)) {
            if (!dir.exists()) continue
            dir.walkTopDown().filter { it.isFile && it.length() < 200L * 1024 * 1024 }.forEach { f ->
                val name = area + "/" + f.relativeTo(dir).path.replace('\\', '/')
                seen.add(name)
                val r = remote[name]
                val rmt = r?.optJSONObject("appProperties")?.optString("mt")?.toLongOrNull() ?: 0L
                if (r == null || f.lastModified() > rmt + 2000) { upload(token, folder, name, f, r?.getString("id")); up++ }
                else if (rmt > f.lastModified() + 2000) { get(token, r.getString("id"), f, rmt); down++ }
            }
        }
        for ((name, r) in remote) {
            if (name in seen) continue
            val area = name.substringBefore('/'); val rel = name.substringAfter('/', "")
            val dir = saveAreas(c)[area] ?: continue
            if (rel.isBlank() || rel.contains("..")) continue
            val f = File(dir, rel)
            if (!f.canonicalPath.startsWith(dir.canonicalPath)) continue
            val rmt = r.optJSONObject("appProperties")?.optString("mt")?.toLongOrNull() ?: 0L
            try { get(token, r.getString("id"), f, rmt); down++ } catch (_: Exception) {}
        }
        return JSONObject().put("up", up).put("down", down)
    }
    private fun get(token: String, id: String, f: File, mt: Long) {
        f.parentFile?.mkdirs()
        val conn = open("$API/files/$id?alt=media", token)
        if (conn.responseCode == 401) throw IllegalStateException("AUTH")
        if (conn.responseCode !in 200..299) throw IllegalStateException("No se pudo bajar la partida")
        val tmp = File(f.parentFile, f.name + ".part")
        conn.inputStream.use { i -> tmp.outputStream().use { o -> i.copyTo(o, 256 * 1024) } }
        if (f.exists()) f.delete()
        tmp.renameTo(f)
        if (mt > 0) f.setLastModified(mt)
    }
}
