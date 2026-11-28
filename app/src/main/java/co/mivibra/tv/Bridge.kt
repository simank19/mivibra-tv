package co.mivibra.tv

import android.app.UiModeManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import android.view.InputDevice
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.Executors

/** Funciones nativas que la interfaz web llama como window.Android.xxx() */
class Bridge(private val a: MainActivity) {
    private val io = Executors.newFixedThreadPool(4)
    /** Descargas largas (MEGA, colecciones) aparte: así no traban la carga de listas ni el resto de la app. */
    private val dl = Executors.newFixedThreadPool(2)
    /** Pedidos a internet (addons, listas, fichas): muchos a la vez, para que uno lento no haga esperar a los demás. */
    // Pedidos chicos (addons, fichas, cuentas): cada uno en su propio hilo (hasta 32 a la vez), así un addon lento
    // no deja en fila a los demás (antes con 12 hilos los addons lentos tapaban todo y "no respondía" nadie)
    // (nunca en el hilo que llama: eso congelaba la app mientras se buscaba de dónde reproducir)
    // Cuántos a la vez según la memoria del equipo: en TV con poca memoria muchas respuestas grandes juntas cerraban la app
    private val netN: Int = try { val am = a.getSystemService(android.content.Context.ACTIVITY_SERVICE) as android.app.ActivityManager; val lm = am.largeMemoryClass; if (am.isLowRamDevice || lm <= 256) 8 else if (lm <= 384) 14 else 24 } catch (_: Exception) { 10 }
    private val net = java.util.concurrent.ThreadPoolExecutor(netN, netN, 30L, java.util.concurrent.TimeUnit.SECONDS, java.util.concurrent.LinkedBlockingQueue()).also { it.allowCoreThreadTimeOut(true) }
    // Pedidos de texto (fichas de TMDB, APIs): aparte de las descargas grandes de listas, para que no esperen detrás de ellas (en TV la ficha no llegaba)
    private val api = Executors.newFixedThreadPool(6)

    private fun reply(id: String, ok: Boolean, data: Any?) {
        val payload = JSONObject().put("ok", ok).put("data", data ?: JSONObject.NULL)
        a.js("window.MV&&MV._cb(" + JSONObject.quote(id) + "," + payload.toString() + ")")
    }

    private fun progress(id: String, pct: Int) {
        a.js("window.MV&&MV._progress(" + JSONObject.quote(id) + "," + pct + ")")
    }

    private fun headers(json: String?): Map<String, String> {
        if (json.isNullOrBlank()) return emptyMap()
        return try {
            val o = JSONObject(json)
            o.keys().asSequence().associateWith { o.optString(it) }
        } catch (_: Exception) {
            emptyMap()
        }
    }

    private fun netFile(url: String): File {
        val md = MessageDigest.getInstance("MD5").digest(url.toByteArray())
        val name = md.joinToString("") { "%02x".format(it) } + ".txt"
        return File(File(a.cacheDir, "net").apply { mkdirs() }, name)
    }

    private fun servedPath(f: File) = "https://appassets.androidplatform.net/net/" + f.name

    // ---------------- Red ----------------

    // ---------------- Tienda de juegos ----------------
    private val games = Executors.newFixedThreadPool(3)
    private fun gameFile(rel: String): File? {
        val root = File(a.filesDir, "games").canonicalFile
        val f = File(root, rel.trimStart('/')).canonicalFile
        return if (f.path.startsWith(root.path + File.separator)) f else null
    }

    /** Baja un archivo de un juego a la memoria de la app (games/<rel>). Responde el tamaño. */
    @JavascriptInterface
    fun gameGet(id: String, url: String, rel: String) {
        games.execute {
            try {
                val f = gameFile(rel) ?: throw IllegalArgumentException("ruta no válida")
                val code = Net.download(url, f, decompress = true)   // GitHub manda los archivos comprimidos (gzip): se guardan ya descomprimidos
                if (code >= 400 || !f.exists()) reply(id, false, "HTTP $code") else reply(id, true, f.length())
            } catch (e: Exception) { reply(id, false, e.message ?: "error") }
        }
    }

    /** Borra un archivo de un juego (al desinstalar). */
    @JavascriptInterface
    fun gameDel(id: String, rel: String) {
        games.execute {
            try { val f = gameFile(rel); val ok = f != null && (!f.exists() || f.delete()); f?.parentFile?.let { if (it.list()?.isEmpty() == true) it.delete() }; reply(id, ok, null) }
            catch (e: Exception) { reply(id, false, e.message ?: "error") }
        }
    }

    // ---------- Juegos que el superadministrador carga a la Tienda por enlace ----------
    /** Enlace de "ver" → enlace de descarga (Google Drive, Dropbox, GitHub). MEGA se descarga y descifra aparte. */
    private fun storeFetch(id: String, url: String, dest: File, allowHtml: Boolean = false) =
        Fetch.get(url, dest, allowHtml = allowHtml) { progress(id, it) }
    /** .rar (también RAR 5) o .7z, por su firma */
    private fun arcKind(f: File): String? = try { f.inputStream().use { val b = ByteArray(6); val n = it.read(b)
        when {
            n >= 4 && b[0] == 'R'.code.toByte() && b[1] == 'a'.code.toByte() && b[2] == 'r'.code.toByte() && b[3] == '!'.code.toByte() -> "rar"
            n >= 2 && b[0] == '7'.code.toByte() && b[1] == 'z'.code.toByte() -> "7z"
            else -> null
        } } } catch (_: Exception) { null }
    /** Saca todo el .rar/.7z a la carpeta (Archives reconoce el formato por la extensión) */
    private fun unarc(f: File, kind: String, out: File) {
        val named = File(f.parentFile, f.nameWithoutExtension + "." + kind)
        if (named != f) { named.delete(); f.renameTo(named) }
        try {
            val names = Archives.list(named.path).map { it.first }.filter { !it.contains("__MACOSX") && !it.contains("..") }
            if (names.isEmpty()) throw IllegalStateException("El comprimido está vacío")
            // Se respeta la estructura de carpetas: cada archivo a su subcarpeta
            names.groupBy { it.substringBeforeLast('/', "") }.forEach { (dir, list) -> Archives.extract(named.path, list.toSet(), if (dir.isEmpty()) out else File(out, dir)) }
        } finally { named.delete() }
    }
    private fun isZip(f: File) = try { f.inputStream().use { val b = ByteArray(2); it.read(b) == 2 && b[0] == 'P'.code.toByte() && b[1] == 'K'.code.toByte() } } catch (_: Exception) { false }
    private fun isHtml(f: File) = try { f.inputStream().use { val b = ByteArray(512); val n = it.read(b); n > 0 && String(b, 0, n).contains("<html", true) || String(b, 0, maxOf(n, 0)).contains("<!doctype", true) } } catch (_: Exception) { false }

    /** json: {kind: web|rom|apk, url, gid, name}. web: .zip (o página .html) a games/x/<gid>/ y responde {ruta};
     *  rom: a la carpeta de juegos de consolas y responde {path}; apk: abre el instalador de Android. */
    @JavascriptInterface
    fun storeGet(id: String, json: String) {
        games.execute {
            try {
                val o = JSONObject(json)
                val kind = o.getString("kind"); val url = o.getString("url")
                val gid = o.getString("gid").replace(Regex("[^\\w-]"), "_")
                val name = o.optString("name").ifBlank { gid }.replace(Regex("[\\\\/:*?\"<>|]"), "_").takeLast(120)
                when (kind) {
                    "web" -> {
                        val tmp = File(File(a.cacheDir, "store").apply { mkdirs() }, "$gid.part")
                        storeFetch(id, url, tmp, allowHtml = true)
                        val out = gameFile("x/$gid") ?: throw IllegalArgumentException("ruta no válida")
                        out.deleteRecursively(); out.mkdirs()
                        val ak = arcKind(tmp)
                        if (isZip(tmp)) Cores.unzip(tmp, out)
                        else if (ak != null) unarc(tmp, ak, out)
                        else if (isHtml(tmp)) tmp.copyTo(File(out, "index.html"), true)
                        else throw IllegalStateException("El enlace no trae un .zip, .rar o .7z con el juego ni una página .html")
                        tmp.delete()
                        // index.html en la raíz o dentro de una carpeta del .zip
                        val idx = out.walkTopDown().maxDepth(3).filter { it.isFile && it.name.equals("index.html", true) }.minByOrNull { it.path.length }
                            ?: out.walkTopDown().maxDepth(3).filter { it.isFile && it.extension.lowercase() in listOf("html", "htm") }.minByOrNull { it.path.length }
                            ?: throw IllegalStateException("El .zip no trae un index.html")
                        val rel = idx.canonicalPath.removePrefix(File(a.filesDir, "games").canonicalPath + File.separator).replace(File.separatorChar, '/')
                        reply(id, true, JSONObject().put("ruta", rel).put("size", out.walkTopDown().filter { it.isFile }.sumOf { it.length() }))
                    }
                    "rom" -> {
                        val dir = a.getExternalFilesDir("roms") ?: File(a.filesDir, "roms")
                        val dest = File(dir, name)
                        storeFetch(id, url, dest)
                        val ak = arcKind(dest)
                        if (ak == null) { reply(id, true, JSONObject().put("path", dest.absolutePath).put("size", dest.length())); return@execute }
                        // ROM en .rar/.7z (los emuladores no los leen): se saca a una carpeta con su nombre y se elige el archivo principal
                        val out = File(dir, dest.nameWithoutExtension.ifBlank { gid }); out.deleteRecursively(); out.mkdirs()
                        unarc(dest, ak, out)
                        val files = out.walkTopDown().filter { it.isFile }.toList()
                        val main = listOf("m3u", "cue", "chd", "pbp", "iso", "gdi", "cso").firstNotNullOfOrNull { e -> files.filter { it.extension.equals(e, true) }.minByOrNull { it.name } }
                            ?: files.maxByOrNull { it.length() } ?: throw IllegalStateException("El comprimido no trae el juego")
                        reply(id, true, JSONObject().put("path", main.absolutePath).put("size", files.sumOf { it.length() }))
                    }
                    "apk" -> {
                        if (!Updater.canInstall(a)) { a.runOnUiThread { Updater.askPermission(a) }; reply(id, false, "Permite que MiVibra instale apps y vuelve a tocar Descargar"); return@execute }
                        val f = File(File(a.cacheDir, "updates").apply { mkdirs() }, "tienda-$gid.apk")
                        storeFetch(id, url, f)
                        if (!isZip(f)) { f.delete(); throw IllegalStateException("El enlace no trae una APK (¿está compartido como público?)") }
                        a.runOnUiThread {
                            try { Updater.install(a, f); reply(id, true, JSONObject().put("installing", true)) }
                            catch (e: Exception) { reply(id, false, e.message ?: "No se pudo abrir el instalador") }
                        }
                    }
                    else -> reply(id, false, "Este formato se instala en MiVibra para PC")
                }
            } catch (e: Exception) { reply(id, false, e.message ?: "No se pudo descargar") }
        }
    }

    /** Quita un juego cargado a la Tienda: web borra games/x/<gid>; rom borra el archivo (solo dentro de la carpeta de la app). */
    @JavascriptInterface
    fun storeDel(gid: String, path: String?) {
        games.execute {
            try {
                gameFile("x/" + gid.replace(Regex("[^\\w-]"), "_"))?.deleteRecursively()
                if (!path.isNullOrBlank()) deleteFile(path)
            } catch (_: Exception) {}
        }
    }

    // ---------- Telegram (Cursos y Mi Telegram) ----------
    private val tg = Executors.newFixedThreadPool(3)
    private fun tgRun(id: String, f: () -> Any?) { tg.execute { try { reply(id, true, f()) } catch (e: Throwable) { reply(id, false, e.message ?: e.javaClass.simpleName) } } }
    // Telegram corre en otro proceso (TgService): si su librería nativa falla, la app no se cierra
    private fun tgc(id: String, m: String, vararg args: Any?, tick: Boolean = false) = tgRun(id) {
        TgClient.call(a, m, JSONArray().apply { args.forEach { put(it) } }, tick = if (tick) ({ p: Int -> progress(id, p) }) else ({ _: Int -> }))
    }
    @JavascriptInterface fun tgState(): String = try { TgClient.state(a).toString() } catch (e: Throwable) { JSONObject().put("state", "error").put("info", JSONObject().put("message", e.message ?: "Telegram no está disponible")).toString() }
    @JavascriptInterface fun tgStart(id: String, apiId: Int, apiHash: String) = tgc(id, "start", apiId, apiHash, tick = true)
    @JavascriptInterface fun tgPhone(id: String, phone: String) = tgc(id, "phone", phone)
    @JavascriptInterface fun tgCode(id: String, code: String) = tgc(id, "code", code)
    @JavascriptInterface fun tgPassword(id: String, pw: String) = tgc(id, "password", pw)
    @JavascriptInterface fun tgLogout(id: String) = tgc(id, "logout")
    @JavascriptInterface fun tgChats(id: String) = tgc(id, "chats")
    @JavascriptInterface fun tgChatFiles(id: String, chatId: String, from: String, limit: Int, kind: String, query: String) = tgc(id, "chatFiles", chatId, from, limit, kind, query)
    @JavascriptInterface fun tgSearch(id: String, query: String, offset: String, kind: String) = tgc(id, "search", query, offset, kind)
    @JavascriptInterface fun tgPublic(id: String, username: String) = tgc(id, "public", username)
    @JavascriptInterface fun tgHistory(id: String, chatId: String, max: Int) = tgc(id, "history", chatId, max)
    @JavascriptInterface fun tgMessage(id: String, chatId: String, msgId: String) = tgc(id, "message", chatId, msgId)
    @JavascriptInterface fun tgThumb(id: String, fileId: Int) = tgc(id, "thumb", fileId)
    @JavascriptInterface fun tgFetch(id: String, fileId: Int) = tgc(id, "fetch", fileId, tick = true)
    @JavascriptInterface fun tgStreamUrl(fileId: Int, name: String): String = try { TgClient.call(a, "streamUrl", JSONArray().put(fileId).put(name), timeoutS = 10) as? String ?: "" } catch (_: Throwable) { "" }

    /** Espacio libre en la memoria de la app (MB). */
    @JavascriptInterface
    fun gameFree(): Long = try { a.filesDir.usableSpace / 1048576 } catch (_: Exception) { -1 }

    /** mode = "text" devuelve el texto; mode = "file" lo guarda y devuelve una ruta para fetch() (listas grandes). */
    @JavascriptInterface
    fun httpGet(id: String, url: String, headersJson: String?, mode: String?) {
        // Respuestas chicas (addons, fichas): muchas a la vez. Listas y catálogos (pueden pesar decenas de MB): de a 4, para no llenar la memoria
        (when (mode) { "small" -> net; "file" -> io; else -> api }).execute {
            try {
                if (mode == "file") {
                    val f = netFile(url)
                    val code = Net.download(url, f, headers(headersJson), decompress = true)
                    reply(id, code < 400, JSONObject().put("status", code).put("path", servedPath(f)))
                } else {
                    // pedidos chicos con tiempos cortos: si un servidor no contesta, se suelta rápido
                    val (code, txt) = Net.text(url, headers(headersJson), if (mode == "small") 9000 else 20000)
                    reply(id, code < 400, JSONObject().put("status", code).put("text", txt))
                }
            } catch (e: Exception) {
                reply(id, false, e.message ?: e.javaClass.simpleName)
            }
        }
    }

    /** POST (para el inicio de sesión con código en TV). */
    @JavascriptInterface
    fun httpPost(id: String, url: String, body: String, contentType: String?) {
        io.execute {
            try {
                val c = java.net.URL(url).openConnection() as java.net.HttpURLConnection
                c.connectTimeout = 15000
                c.readTimeout = 20000
                c.requestMethod = "POST"
                c.doOutput = true
                c.setRequestProperty("Content-Type", contentType ?: "application/x-www-form-urlencoded")
                c.outputStream.use { it.write(body.toByteArray()) }
                val code = c.responseCode
                val txt = Net.body(c).use { it.readBytes().toString(Charsets.UTF_8) }
                c.disconnect()
                reply(id, true, JSONObject().put("status", code).put("text", txt))
            } catch (e: Exception) {
                reply(id, false, e.message ?: e.javaClass.simpleName)
            }
        }
    }

    /** Abre una página en un navegador invisible, espera a que su JavaScript termine de armarla y devuelve el HTML final
        (para páginas hechas con Wix, constructores de WordPress, React…, donde el reproductor no está en el HTML inicial). */
    @JavascriptInterface
    fun renderHtml(id: String, url: String, waitMs: Int) {
        a.runOnUiThread {
            try {
                val w = android.webkit.WebView(a)
                w.settings.javaScriptEnabled = true
                w.settings.domStorageEnabled = true
                w.settings.mediaPlaybackRequiresUserGesture = true   // que no suene nada
                w.settings.userAgentString = "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36"
                w.measure(android.view.View.MeasureSpec.makeMeasureSpec(1280, android.view.View.MeasureSpec.EXACTLY), android.view.View.MeasureSpec.makeMeasureSpec(2400, android.view.View.MeasureSpec.EXACTLY))
                w.layout(0, 0, 1280, 2400)
                var done = false
                val ui = android.os.Handler(android.os.Looper.getMainLooper())
                fun finish() {
                    if (done) return
                    done = true
                    w.evaluateJavascript("(function(){window.scrollTo(0,document.body.scrollHeight);return document.documentElement.outerHTML})()") { html ->
                        val text = try { org.json.JSONArray("[" + html + "]").optString(0) } catch (_: Exception) { "" }
                        reply(id, true, JSONObject().put("html", text))
                        try { w.stopLoading(); w.destroy() } catch (_: Exception) {}
                    }
                }
                w.webViewClient = object : android.webkit.WebViewClient() {
                    override fun onPageFinished(view: android.webkit.WebView, u: String) { ui.postDelayed({ finish() }, waitMs.coerceIn(1000, 10000).toLong()) }
                }
                ui.postDelayed({ finish() }, 25000)   // por si la página nunca termina de cargar
                w.loadUrl(url)
            } catch (e: Exception) {
                reply(id, false, e.message ?: "No se pudo abrir la página")
            }
        }
    }

    /** Texto copiado en el portapapeles (para pegar listas o MAC sin teclado). */
    @JavascriptInterface
    fun clipText(): String = try {
        val cm = a.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
        val clip = cm.primaryClip
        if (clip != null && clip.itemCount > 0) (0 until clip.itemCount).joinToString("\n") { clip.getItemAt(it).coerceToText(a)?.toString().orEmpty() } else ""
    } catch (_: Exception) { "" }

    /** POST con cabeceras propias (inicio de sesión en Jellyfin/Emby). */
    @JavascriptInterface
    fun httpPost2(id: String, url: String, body: String, contentType: String?, headersJson: String?) {
        io.execute {
            try {
                val c = java.net.URL(url).openConnection() as java.net.HttpURLConnection
                c.connectTimeout = 15000
                c.readTimeout = 30000
                c.requestMethod = "POST"
                c.doOutput = true
                c.setRequestProperty("Content-Type", contentType ?: "application/json")
                c.setRequestProperty("Accept", "application/json")
                for ((k, v) in headers(headersJson)) if (v.isNotBlank()) c.setRequestProperty(k, v)
                c.outputStream.use { it.write(body.toByteArray()) }
                val code = c.responseCode
                val txt = Net.body(c).use { it.readBytes().toString(Charsets.UTF_8) }
                c.disconnect()
                reply(id, true, JSONObject().put("status", code).put("text", txt))
            } catch (e: Exception) {
                reply(id, false, e.message ?: e.javaClass.simpleName)
            }
        }
    }

    /** Prueba varias señales a la vez y dice cuáles responden y en cuánto tiempo. */
    @JavascriptInterface
    fun probe(id: String, json: String) {
        Thread {
            val arr = try { JSONArray(json) } catch (_: Exception) { JSONArray() }
            val out = arrayOfNulls<JSONObject>(arr.length())
            val threads = (0 until arr.length()).map { i ->
                Thread {
                    val o = arr.optJSONObject(i) ?: JSONObject()
                    val url = o.optString("url")
                    val h = HashMap<String, String>()
                    o.optString("ua").takeIf { it.isNotBlank() }?.let { h["User-Agent"] = it }
                    o.optString("ref").takeIf { it.isNotBlank() }?.let { h["Referer"] = it }
                    val t0 = System.currentTimeMillis()
                    var ok = false
                    var code = 0
                    try {
                        val c = Net.open(url, h, 7000)
                        code = c.responseCode
                        if (code < 400) {
                            val buf = ByteArray(2048)
                            val n = Net.body(c).use { it.read(buf) }
                            val head = if (n > 0) String(buf, 0, n, Charsets.ISO_8859_1) else ""
                            val isPlaylist = url.contains(".m3u8", true) || head.startsWith("#EXTM3U")
                            ok = n > 0 && (!isPlaylist || head.contains("#EXT"))
                        }
                        c.disconnect()
                    } catch (_: Exception) {
                    }
                    out[i] = JSONObject().put("ok", ok).put("code", code).put("ms", System.currentTimeMillis() - t0)
                }.also { it.start() }
            }
            threads.forEach { try { it.join(12000) } catch (_: Exception) {} }
            val res = JSONArray()
            out.forEach { res.put(it ?: JSONObject().put("ok", false).put("ms", 99999)) }
            reply(id, true, res)
        }.start()
    }

    /** YouTube con tu cuenta (solo lectura): token de acceso de Google para suscripciones, Me gusta y tus listas. */
    @JavascriptInterface
    fun ytAuth(id: String) { YtAuth.token(a) { ok, t -> reply(id, ok, t) } }

    /** Inicio de sesión con Google (selector de cuentas del equipo). */
    @JavascriptInterface
    fun googleSignIn(id: String, webClientId: String) {
        a.runOnUiThread {
            GoogleAuth.signIn(a, webClientId) { ok, tokenOrError, email ->
                reply(id, ok, if (ok) JSONObject().put("idToken", tokenOrError).put("email", email) else tokenOrError)
            }
        }
    }

    @JavascriptInterface
    fun epg(id: String, url: String, idsJson: String?, hours: Int) {
        io.execute {
            try {
                val wanted = HashSet<String>()
                if (!idsJson.isNullOrBlank()) {
                    val arr = JSONArray(idsJson)
                    for (i in 0 until arr.length()) wanted.add(arr.optString(i).lowercase())
                }
                val c = Net.open(url, emptyMap(), 30000)
                val result = try {
                    Net.body(c).use { Epg.parse(it, wanted, if (hours <= 0) 36 else hours) }
                } finally {
                    c.disconnect()
                }
                val f = netFile("epg:" + url)
                f.writeText(result.toString())
                reply(id, true, JSONObject().put("path", servedPath(f)).put("count", result.optInt("count")))
            } catch (e: Exception) {
                reply(id, false, e.message ?: "Error leyendo la guía")
            }
        }
    }

    // ---------------- Reproductor ----------------

    /** Duplicar la pantalla en un TV (Miracast / Transmitir pantalla del sistema). */
    @JavascriptInterface
    fun castScreen() { a.runOnUiThread { CastScreen.open(a) } }

    // ---------------- Descargas para ver sin internet ----------------
    @JavascriptInterface
    fun dlStartVideo(json: String): String = try { Downloads.start(a, JSONObject(json)) } catch (e: Exception) { "error:" + (e.message ?: "No se pudo descargar") }
    /** Favoritos del reproductor pendientes de guardar en el perfil (se entregan una sola vez). */
    @JavascriptInterface
    fun takeFavs(): String = try {
        val p = a.getSharedPreferences("favs", Context.MODE_PRIVATE)
        val s = p.getString("pending", "{}") ?: "{}"
        p.edit().remove("pending").commit(); s
    } catch (_: Exception) { "{}" }

    @JavascriptInterface
    fun dlList(): String = try { Downloads.list(a).toString() } catch (_: Exception) { "[]" }
    @JavascriptInterface
    fun dlRemove(key: String) { Downloads.remove(a, key) }
    @JavascriptInterface
    fun dlFree(): Double = Downloads.free(a).toDouble()

    // ---------------- Celular como control (app del celular) ----------------
    /** Busca TVs con MiVibra en el mismo Wi-Fi (revisa las 254 direcciones de la red en paralelo). */
    @JavascriptInterface
    fun remoteFind(id: String) {
        Thread {
            val me = RemoteServer.localIp(a)
            if (me == null) { reply(id, false, "Conéctate al Wi-Fi de la casa"); return@Thread }
            val base = me.substringBeforeLast('.') + "."
            val found = java.util.Collections.synchronizedList(ArrayList<JSONObject>())
            val pool = Executors.newFixedThreadPool(48)
            for (i in 1..254) {
                val ip = base + i
                if (ip == me) continue
                pool.execute {
                    try {
                        val c = java.net.URL("http://$ip:${RemoteServer.PORT}/hello").openConnection() as java.net.HttpURLConnection
                        c.connectTimeout = 700; c.readTimeout = 900
                        if (c.responseCode == 200) {
                            val o = JSONObject(c.inputStream.bufferedReader().use { it.readText() })
                            if (o.optString("app") == "mivibra-tv") found.add(JSONObject().put("ip", ip).put("name", o.optString("name", "TV")))
                        }
                        c.disconnect()
                    } catch (_: Exception) {}
                }
            }
            pool.shutdown()
            try { pool.awaitTermination(8, java.util.concurrent.TimeUnit.SECONDS) } catch (_: Exception) {}
            reply(id, true, JSONArray(found.sortedBy { it.optString("ip") }))
        }.start()
    }
    /** Pide a la TV que muestre su código QR para emparejar. */
    @JavascriptInterface
    fun remotePairAsk(id: String, ip: String) {
        io.execute {
            try {
                val c = java.net.URL("http://$ip:${RemoteServer.PORT}/pair").openConnection() as java.net.HttpURLConnection
                c.connectTimeout = 3000; c.readTimeout = 4000
                val ok = c.responseCode == 200; c.disconnect()
                reply(id, ok, if (ok) true else "La TV no respondió")
            } catch (e: Exception) { reply(id, false, "La TV no respondió: revisa que MiVibra TV esté abierta") }
        }
    }
    /** Lee el código QR de la TV con la cámara (lector de Google Play). */
    @JavascriptInterface
    fun remoteScan(id: String) {
        a.runOnUiThread {
            try {
                val opts = com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions.Builder()
                    .setBarcodeFormats(com.google.mlkit.vision.barcode.common.Barcode.FORMAT_QR_CODE).build()
                com.google.mlkit.vision.codescanner.GmsBarcodeScanning.getClient(a, opts).startScan()
                    .addOnSuccessListener { b -> reply(id, true, b.rawValue ?: "") }
                    .addOnCanceledListener { reply(id, false, "cancelado") }
                    .addOnFailureListener { e -> reply(id, false, e.message ?: "No se pudo abrir la cámara") }
            } catch (e: Exception) { reply(id, false, e.message ?: "No se pudo abrir la cámara") }
        }
    }
    /** Abre el control (la página que sirve la TV) a pantalla completa dentro de la app. */
    @JavascriptInterface
    fun remoteOpen(url: String) {
        if (!url.startsWith("http://")) return
        a.runOnUiThread { a.startActivity(Intent(a, RemoteActivity::class.java).putExtra("url", url)) }
    }

    /** Navegador interno a pantalla completa (url vacío = página de inicio). */
    @JavascriptInterface
    fun openBrowser(url: String?) {
        a.runOnUiThread { a.startActivity(Intent(a, BrowserActivity::class.java).putExtra("url", url ?: "")) }
    }

    /** Aviso en el celular antes de un partido (notificación aunque la app esté cerrada). */
    @JavascriptInterface
    fun remindAt(key: String, at: Long, title: String, text: String) {
        if (Build.VERSION.SDK_INT >= 33 && a.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED)
            a.runOnUiThread { try { a.requestPermissions(arrayOf("android.permission.POST_NOTIFICATIONS"), 9911) } catch (_: Exception) {} }
        if (at > System.currentTimeMillis()) ReminderReceiver.set(a, key, at, title, text)
    }

    @JavascriptInterface
    fun remindCancel(key: String) { ReminderReceiver.cancel(a, key) }

    /** Dictado por voz para una caja de texto de MiVibra (el texto vuelve a MV.voiceText). */
    @JavascriptInterface
    fun voiceInput(target: String) {
        a.runOnUiThread { a.voiceDictate(target) }
    }

    /** Diagnóstico y optimización MiVibra (integrado, sin instalar nada aparte). */
    @JavascriptInterface
    fun openDiag() {
        a.runOnUiThread { a.startActivity(Intent(a, co.mivibra.tv.diag.DiagActivity::class.java)) }
    }

    /** Canal en vivo del Inicio con el reproductor nativo encima del recuadro (coordenadas en px CSS). */
    @JavascriptInterface
    fun previewShow(url: String, ua: String, ref: String, x: Double, y: Double, w: Double, h: Double, cssW: Double, radius: Double, mute: Boolean) {
        a.runOnUiThread { a.preview.show(url, ua, ref, x, y, w, h, cssW, radius, mute) }
    }
    @JavascriptInterface
    fun previewMove(x: Double, y: Double, w: Double, h: Double, cssW: Double, visible: Boolean) { a.runOnUiThread { a.preview.move(x, y, w, h, cssW, visible) } }
    @JavascriptInterface
    fun previewMute(m: Boolean) { a.runOnUiThread { a.preview.mute(m) } }
    @JavascriptInterface
    fun previewHide() { a.runOnUiThread { a.preview.release() } }

    /** Ventana flotante para el reproductor de YouTube / Twitch / Kick (sigue visible sobre otras apps). */
    @JavascriptInterface
    fun setPip(on: Boolean) { a.runOnUiThread { a.setPip(on) } }

    /** Fila de recomendados en el inicio de Android TV. */
    @JavascriptInterface
    fun publishHome(json: String) { HomeChannel.publish(a, json) }

    /** Datos para la app Inicio MiVibra (por ahora la clave de YouTube). */
    @JavascriptInterface
    fun setInicio(json: String) {
        try { java.io.File(a.filesDir, "inicio-datos.json").writeText(json) } catch (_: Exception) {}
    }

    @JavascriptInterface
    fun play(json: String) {
        a.runOnUiThread { a.openPlayer(json) }
    }

    // ---------------- Sonido de la intro ----------------
    // Se reproduce con Android (no con Web Audio): algunos televisores no dejan sonar el audio de la página al abrir
    private var introPlayer: android.media.MediaPlayer? = null

    /** La página avisa cuándo empieza y termina la intro (para poder saltarla al instante desde Android). */
    @JavascriptInterface
    fun introState(on: Boolean) { a.runOnUiThread { a.introShown(on) } }

    @JavascriptInterface
    fun introAudio(play: Boolean) {
        a.runOnUiThread {
            val old = introPlayer
            if (old != null) {
                introPlayer = null
                // Se apaga suave en medio segundo
                val h = android.os.Handler(android.os.Looper.getMainLooper())
                var v = 1f
                val step = object : Runnable { override fun run() {
                    v -= 0.1f
                    if (v <= 0f) { try { old.stop() } catch (_: Exception) {}; old.release() }
                    else { try { old.setVolume(v, v) } catch (_: Exception) {}; h.postDelayed(this, 45) }
                } }
                h.post(step)
            }
            if (!play) return@runOnUiThread
            try {
                val mp = android.media.MediaPlayer.create(a, R.raw.intro) ?: return@runOnUiThread
                mp.setOnCompletionListener { if (introPlayer === it) introPlayer = null; it.release() }
                introPlayer = mp
                mp.start()
            } catch (_: Exception) {}
        }
    }

    // ---------------- Archivos ----------------

    @JavascriptInterface
    fun pickFile(id: String) {
        a.runOnUiThread {
            val i = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
            try {
                a.startForResult(i) { res, data ->
                    val uri = data?.data
                    if (res != android.app.Activity.RESULT_OK || uri == null) reply(id, false, "cancel")
                    else io.execute {
                        try {
                            val txt = Storage.readText(a, uri.toString())
                            val f = netFile(uri.toString())
                            f.writeText(txt)
                            reply(id, true, JSONObject().put("path", servedPath(f)).put("name", uri.lastPathSegment ?: "lista"))
                        } catch (e: Exception) {
                            reply(id, false, e.message ?: "No se pudo leer el archivo")
                        }
                    }
                }
            } catch (_: ActivityNotFoundException) {
                reply(id, false, "nopicker")
            }
        }
    }

    /** Elige una imagen (foto o captura de una lista) y devuelve el texto que se lee en ella. */
    @JavascriptInterface
    fun ocrImage(id: String) {
        a.runOnUiThread {
            val i = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*")
            try {
                a.startForResult(i) { res, data ->
                    val uri = data?.data
                    if (res != android.app.Activity.RESULT_OK || uri == null) reply(id, false, "cancel")
                    else io.execute {
                        try { reply(id, true, JSONObject().put("text", Ocr.fromUri(a, uri))) }
                        catch (e: Exception) { reply(id, false, "No se pudo leer la imagen: " + (e.message ?: "")) }
                    }
                }
            } catch (_: ActivityNotFoundException) { reply(id, false, "nopicker") }
        }
    }

    @JavascriptInterface
    fun readLocalFile(id: String, path: String) {
        io.execute {
            try {
                val txt = Storage.readText(a, path)
                val f = netFile(path)
                f.writeText(txt)
                reply(id, true, JSONObject().put("path", servedPath(f)))
            } catch (e: Exception) {
                reply(id, false, e.message ?: "No se pudo leer")
            }
        }
    }

    @JavascriptInterface
    fun pickFolder(id: String) {
        a.runOnUiThread {
            try {
                a.startForResult(Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)) { res, data ->
                    val uri = data?.data
                    if (res != android.app.Activity.RESULT_OK || uri == null) reply(id, false, "cancel")
                    else {
                        try {
                            a.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        } catch (_: Exception) {}
                        reply(id, true, uri.toString())
                    }
                }
            } catch (_: ActivityNotFoundException) {
                reply(id, false, "nopicker")
            }
        }
    }

    /**
     * Elegir uno o varios juegos con el selector de archivos del celular. Funciona sin el permiso de
     * "todos los archivos": se copian a la carpeta de juegos de la app (Descargas de MiVibra).
     */
    @JavascriptInterface
    fun pickFiles(id: String) {
        a.runOnUiThread {
            val i = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            try {
                a.startForResult(i) { res, data ->
                    if (res != android.app.Activity.RESULT_OK || data == null) { reply(id, false, "cancel"); return@startForResult }
                    val uris = mutableListOf<Uri>()
                    data.clipData?.let { c -> for (k in 0 until c.itemCount) uris.add(c.getItemAt(k).uri) }
                    if (uris.isEmpty()) data.data?.let { uris.add(it) }
                    io.execute {
                        try {
                            val dir = File(downloadsDir()); dir.mkdirs()
                            val out = JSONArray()
                            var total = 0L; val sizes = uris.map { androidx.documentfile.provider.DocumentFile.fromSingleUri(a, it)?.length() ?: 0L }
                            val all = sizes.sum().coerceAtLeast(1L)
                            uris.forEachIndexed { k, u ->
                                val doc = androidx.documentfile.provider.DocumentFile.fromSingleUri(a, u)
                                val name = (doc?.name ?: "juego.bin").replace(Regex("[\\\\/:*?\"<>|]"), "_")
                                val target = File(dir, name)
                                if (!(target.exists() && target.length() == sizes[k] && sizes[k] > 0)) {
                                    val tmp = File(dir, "$name.part")
                                    a.contentResolver.openInputStream(u)?.use { ins ->
                                        tmp.outputStream().use { os ->
                                            val buf = ByteArray(256 * 1024); var n: Int; var last = -1
                                            while (ins.read(buf).also { n = it } > 0) {
                                                os.write(buf, 0, n); total += n
                                                val pct = (total.toDouble() * 100 / all).toInt().coerceIn(0, 100); if (pct != last) { last = pct; progress(id, pct) }
                                            }
                                        }
                                    } ?: throw IllegalStateException("No se pudo abrir " + name)
                                    target.delete(); tmp.renameTo(target)
                                } else total += sizes[k]
                                out.put(JSONObject().put("name", name).put("path", target.absolutePath).put("size", target.length())
                                    .put("ext", name.substringAfterLast('.', "").lowercase()))
                            }
                            reply(id, true, out)
                        } catch (e: Exception) { reply(id, false, "No se pudo copiar el juego: " + (e.message ?: "")) }
                    }
                }
            } catch (_: ActivityNotFoundException) { reply(id, false, "nopicker") }
        }
    }

    /** Lectura en voz alta (lector de libros). */
    @JavascriptInterface
    fun ttsSpeak(id: String, text: String, lang: String?, rate: Double, voice: String?) {
        io.execute {
            try { Tts.speak(a, id, text, lang ?: "es-ES", rate, voice ?: "") { ok, err -> reply(id, ok, if (ok) null else err) } }
            catch (e: Throwable) { reply(id, false, e.message ?: "Sin voz") }
        }
    }
    @JavascriptInterface
    fun ttsStop() { Tts.stop() }
    @JavascriptInterface
    fun ttsVoices(id: String) {
        io.execute { try { reply(id, true, Tts.voices(a)) } catch (e: Throwable) { reply(id, false, e.message ?: "Sin voz") } }
    }

    /** Carátula sacada del propio video (una imagen del contenido). */
    @JavascriptInterface
    fun videoFrame(id: String, url: String, headers: String?, at: Double) {
        io.execute {
            try { reply(id, true, Thumbs.frame(a, url, try { JSONObject(headers ?: "{}") } catch (e: Exception) { JSONObject() }, at)) }
            catch (e: Throwable) { reply(id, false, e.message ?: "No se pudo") }
        }
    }

    /** Archivos de una carpeta (o archivo) compartida de MEGA: nombre, tamaño y enlace interno para descargarlo. */
    @JavascriptInterface
    fun megaList(id: String, link: String) {
        dl.execute {
            try { reply(id, true, Mega.list(link)) }
            catch (e: Exception) { reply(id, false, e.message ?: "No se pudo leer el enlace de MEGA") }
        }
    }

    /** Colecciones comprimidas (.zip/.rar/.7z con libros adentro): lista y saca un libro. */
    @JavascriptInterface
    fun bookPack(id: String, json: String) {
        dl.execute {
            try {
                val o = JSONObject(json)
                reply(id, true, if (o.optString("entry").isNotBlank()) Books.packEntry(a, o) { progress(id, it) } else Books.packList(a, o) { progress(id, it) })
            } catch (e: Exception) { reply(id, false, e.message ?: "No se pudo abrir el comprimido") }
        }
    }

    // ---------------- Fotos ----------------
    /** Elige una o varias fotos de la galería. No se copian: se guarda el permiso para verlas siempre. */
    @JavascriptInterface
    fun pickPhotos(id: String) {
        a.runOnUiThread {
            val i = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*").putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            try {
                a.startForResult(i) { res, data ->
                    if (res != android.app.Activity.RESULT_OK || data == null) { reply(id, false, "cancel"); return@startForResult }
                    val uris = ArrayList<android.net.Uri>()
                    data.clipData?.let { c -> for (n in 0 until c.itemCount) uris.add(c.getItemAt(n).uri) } ?: data.data?.let { uris.add(it) }
                    io.execute {
                        val arr = JSONArray()
                        for (u in uris) {
                            try { a.contentResolver.takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (_: Exception) {}
                            var name = u.lastPathSegment ?: "foto.jpg"
                            try { a.contentResolver.query(u, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) name = c.getString(0) ?: name } } catch (_: Exception) {}
                            val mime = try { a.contentResolver.getType(u) } catch (_: Exception) { null } ?: ""
                            arr.put(JSONObject().put("uri", u.toString()).put("name", name).put("mime", mime))
                        }
                        reply(id, true, arr)
                    }
                }
            } catch (_: ActivityNotFoundException) { reply(id, false, "nopicker") }
        }
    }

    /** Foto de una carpeta de MEGA: se descarga y descifra una vez y queda en caché. */
    @JavascriptInterface
    fun megaPhoto(id: String, src: String) {
        dl.execute {
            try {
                val dir = java.io.File(a.filesDir, "photos/mega").apply { mkdirs() }
                val key = java.security.MessageDigest.getInstance("MD5").digest(src.toByteArray()).joinToString("") { "%02x".format(it) }.take(16)
                val f = java.io.File(dir, "$key.jpg")
                if (!f.isFile || f.length() == 0L) Mega.download(src, f) {}
                // Solo las 300 más recientes
                (dir.listFiles() ?: emptyArray()).sortedByDescending { it.lastModified() }.drop(300).forEach { it.delete() }
                reply(id, true, JSONObject().put("url", "https://appassets.androidplatform.net/photos/mega/" + f.name))
            } catch (e: Exception) { reply(id, false, e.message ?: "No se pudo traer la foto de MEGA") }
        }
    }

    /** Borra una foto que llegó desde el celular. */
    @JavascriptInterface
    fun deletePhoto(name: String) {
        val f = java.io.File(java.io.File(a.filesDir, "photos"), java.io.File(name).name)
        if (f.isFile) f.delete()
    }

    /** Reproductor abierto: capítulo actual y capítulos sin enlace (para buscar el siguiente en el mismo addon). */
    @JavascriptInterface
    fun playerQueue(): String = PlayerActivity.queueInfo()

    /** Pone el enlace de un capítulo de la cola del reproductor abierto. */
    @JavascriptInterface
    fun playerSetUrl(i: Int, json: String) { PlayerActivity.setQueueUrl(i, json) }

    /** Abre un libro, manga o cómic (descarga y prepara las páginas). */
    @JavascriptInterface
    fun openBook(id: String, json: String) {
        io.execute {
            try { reply(id, true, Books.open(a, JSONObject(json)) { progress(id, it) }) }
            catch (e: Exception) { reply(id, false, e.message ?: "No se pudo abrir") }
        }
    }

    @JavascriptInterface
    fun hasStorageAccess(): Boolean = Storage.hasAllFilesAccess(a)

    @JavascriptInterface
    fun requestStorageAccess() {
        a.runOnUiThread {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                try {
                    a.startActivity(Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + a.packageName)))
                } catch (_: Exception) {
                    try {
                        a.startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
                    } catch (_: Exception) {
                        Toast.makeText(a, "Activa 'Acceso a todos los archivos' para MiVibra TV en Ajustes", Toast.LENGTH_LONG).show()
                    }
                }
            } else {
                a.requestPermissions(arrayOf(android.Manifest.permission.READ_EXTERNAL_STORAGE, android.Manifest.permission.WRITE_EXTERNAL_STORAGE), 7)
            }
        }
    }

    @JavascriptInterface
    fun storageRoots(): String = Storage.roots(a).toString()

    @JavascriptInterface
    fun listDir(id: String, path: String) {
        io.execute {
            try { reply(id, true, Storage.listDir(path)) } catch (e: Exception) { reply(id, false, e.message) }
        }
    }

    @JavascriptInterface
    fun scanRoms(id: String, rootsJson: String, extsJson: String) {
        io.execute {
            try {
                val r = JSONArray(rootsJson)
                val e = JSONArray(extsJson)
                val roots = (0 until r.length()).map { r.optString(it) }
                val exts = (0 until e.length()).map { e.optString(it).lowercase() }.toSet()
                reply(id, true, Storage.scan(a, roots, exts))
            } catch (ex: Exception) {
                reply(id, false, ex.message ?: "Error al buscar juegos")
            }
        }
    }

    @JavascriptInterface
    fun importBios(id: String, rootsJson: String) {
        io.execute {
            try {
                val r = JSONArray(rootsJson)
                reply(id, true, Storage.importBios(a, (0 until r.length()).map { r.optString(it) }))
            } catch (e: Exception) {
                reply(id, false, e.message)
            }
        }
    }

    /** Descarga un archivo (por ejemplo una ROM tuya o homebrew) a la carpeta de descargas de la app. */
    /** Descomprime un .zip de la carpeta de descargas en una subcarpeta con su nombre. */
    @JavascriptInterface
    fun unzip(id: String, path: String) {
        io.execute {
            try {
                val zip = File(path)
                val out = File(zip.parentFile, zip.nameWithoutExtension)
                val n = Cores.unzip(zip, out)
                reply(id, true, JSONObject().put("dir", out.absolutePath).put("files", n))
            } catch (e: Exception) {
                reply(id, false, e.message ?: "No se pudo descomprimir")
            }
        }
    }

    @JavascriptInterface
    fun downloadFile(id: String, url: String, fileName: String?) {
        io.execute {
            try {
                val dir = a.getExternalFilesDir("roms") ?: File(a.filesDir, "roms")
                var name = (fileName?.takeIf { it.isNotBlank() } ?: Uri.parse(url).lastPathSegment ?: "archivo.bin")
                    .replace(Regex("[\\\\/:*?\"<>|]"), "_")
                if (name.length > 120) name = name.takeLast(120)
                val dest = File(dir, name)
                val code = Net.download(url, dest) { progress(id, it) }
                if (code >= 400) reply(id, false, "Error $code al descargar")
                else reply(id, true, JSONObject().put("path", dest.absolutePath).put("name", dest.name).put("size", dest.length()))
            } catch (e: Exception) {
                reply(id, false, e.message ?: "No se pudo descargar")
            }
        }
    }

    @JavascriptInterface
    fun downloadsDir(): String = (a.getExternalFilesDir("roms") ?: File(a.filesDir, "roms")).apply { mkdirs() }.absolutePath

    @JavascriptInterface
    fun deleteFile(path: String): Boolean {
        // Solo dentro de la carpeta de la app, y sin trucos de "../" en la ruta
        val f = try { File(path).canonicalFile } catch (_: Exception) { return false }
        val dl = File(downloadsDir()).canonicalPath + File.separator
        return f.path.startsWith(dl) && f.isFile && f.delete()
    }

    // ---------------- Juegos ----------------

    @JavascriptInterface
    fun coreInstalled(core: String): Boolean = Cores.installed(a, core)

    /** Extensiones de lo que trae un .zip (para reconocer la consola). */
    @JavascriptInterface
    fun zipExts(path: String): String = if (path.startsWith("content://")) "[]" else try { Storage.zipExts(path).toString() } catch (_: Throwable) { "[]" }

    /** Descomprime la ROM de un .zip y responde la ruta del juego: {path, exts:[..]} */
    @JavascriptInterface
    fun unzipRom(id: String, json: String) {
        io.execute {
            try {
                val o = JSONObject(json)
                val src = Storage.toLocalFile(a, o.getString("path"))
                val arr = o.optJSONArray("exts") ?: JSONArray()
                val exts = (0 until arr.length()).map { arr.getString(it).lowercase() }
                val out = Storage.unzipRom(a, src.absolutePath, exts, onPct = { progress(id, it) })
                reply(id, true, out)
            } catch (e: OutOfMemoryError) {
                reply(id, false, "El TV no tiene memoria suficiente para abrir este .7z. Envíalo en .zip o sin comprimir.")
            } catch (e: Throwable) {
                reply(id, false, (e.message ?: e.javaClass.simpleName).let { "No se pudo abrir el comprimido: $it" })
            }
        }
    }

    /** Marco (bezel) de cada consola: -1 = no hay para esa consola, 0 = apagado, 1 = encendido */
    @JavascriptInterface
    fun overlay(sys: String): Int = if (!Overlays.available(sys)) -1 else if (Overlays.enabled(a, sys)) 1 else 0

    @JavascriptInterface
    fun setOverlay(sys: String, on: Boolean) = Overlays.setEnabled(a, sys, on)

    /** {n: estilos disponibles, cur: el elegido (n = sin marco)} */
    @JavascriptInterface
    fun overlayStyles(sys: String): String {
        val n = Overlays.styleCount(sys)
        return JSONObject().put("n", n).put("cur", if (Overlays.enabled(a, sys)) Overlays.style(a, sys) else n).toString()
    }

    /** Siguiente opción: Marco 1 → Marco 2 → … → Sin marco → Marco 1 */
    @JavascriptInterface
    fun nextOverlay(sys: String) {
        val n = Overlays.styleCount(sys); if (n == 0) return
        val cur = if (Overlays.enabled(a, sys)) Overlays.style(a, sys) else n
        val next = (cur + 1) % (n + 1)
        if (next == n) Overlays.setEnabled(a, sys, false) else Overlays.setStyle(a, sys, next)
    }

    /** Juego de Neo Geo dentro de un .zip/.7z: {set,title,parent} o "null" */
    @JavascriptInterface
    fun arcadeId(path: String): String = if (path.startsWith("content://")) "null" else try { NeoGeo.identify(a, path)?.toString() ?: "null" } catch (_: Throwable) { "null" }

    /** Archivos de adentro de un .zip/.7z (para mostrar qué trae) */
    @JavascriptInterface
    fun archiveNames(path: String): String = org.json.JSONArray(NeoGeo.entryNames(path).take(40)).toString()

    /** Pone el nombre corto y la BIOS al lado: {path, bios, renamed} */
    @JavascriptInterface
    fun arcadePrepare(id: String, json: String) {
        io.execute {
            try {
                val o = JSONObject(json)
                reply(id, true, NeoGeo.prepare(a, o.getString("path"), o.getString("set")))
            } catch (e: Throwable) { reply(id, false, e.message ?: "No se pudo preparar el juego") }
        }
    }

    // ---------------- PSP con la app PPSSPP ----------------
    private val PPSSPP = listOf("org.ppsspp.ppssppgold", "org.ppsspp.ppsspp")
    private fun ppssppPkg(): String? = PPSSPP.firstOrNull { try { a.packageManager.getPackageInfo(it, 0); true } catch (_: Exception) { false } }

    @JavascriptInterface
    fun ppssppInstalled(): Boolean = ppssppPkg() != null

    /** Abre el juego en PPSSPP entregándoselo directamente (sin depender de permisos de carpetas). {rom, exts} */
    @JavascriptInterface
    fun playPpsspp(id: String, json: String) {
        io.execute {
            try {
                val o = JSONObject(json)
                val pkg = ppssppPkg() ?: throw IllegalStateException("Instala PPSSPP desde Play Store")
                var rom = Storage.toLocalFile(a, o.getString("rom"))
                if (Archives.supported(rom.absolutePath)) {
                    val ex = o.optJSONArray("exts"); val exts = if (ex == null) listOf("iso", "cso", "pbp", "chd") else (0 until ex.length()).map { ex.getString(it).lowercase() }
                    rom = File(Storage.unzipRom(a, rom.absolutePath, exts, onPct = { progress(id, it) }, keep = 3))
                }
                val uri = androidx.core.content.FileProvider.getUriForFile(a, a.packageName + ".files", rom)
                a.runOnUiThread {
                    try {
                        val i = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/octet-stream").setPackage(pkg)
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                        a.grantUriPermission(pkg, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        a.startActivity(i)
                        reply(id, true, rom.absolutePath)
                    } catch (e: Exception) { reply(id, false, e.message ?: "No se pudo abrir PPSSPP") }
                }
            } catch (e: Throwable) { reply(id, false, e.message ?: "No se pudo abrir PPSSPP") }
        }
    }

    // ---------------- Emuladores externos (consolas modernas) ----------------
    private fun installedPkg(list: org.json.JSONArray): String? {
        for (i in 0 until list.length()) {
            val p = list.optString(i)
            if (p.isNotEmpty() && try { a.packageManager.getPackageInfo(p, 0); true } catch (_: Exception) { false }) return p
        }
        return null
    }

    /** Primer emulador instalado de la lista de paquetes (JSON). "" si ninguno. */
    @JavascriptInterface
    fun extInstalled(pkgsJson: String): String = try { installedPkg(org.json.JSONArray(pkgsJson)) ?: "" } catch (_: Exception) { "" }

    /**
     * Abre el juego en el emulador de la consola instalado en el equipo (Dolphin, Cemu, Azahar, NetherSX2, aPS3e, Vita3K…).
     * Se le entrega el archivo con permiso de lectura; si el emulador no acepta abrir archivos de afuera, se abre la app
     * y se responde {opened:"app", path} para que el usuario elija el juego desde ahí. {rom, pkgs:[..], exts:[..]}
     */
    @JavascriptInterface
    fun playExternal(id: String, json: String) {
        io.execute {
            try {
                val o = JSONObject(json)
                val pkg = installedPkg(o.optJSONArray("pkgs") ?: org.json.JSONArray()) ?: throw IllegalStateException("NOAPP")
                var rom = Storage.toLocalFile(a, o.getString("rom"))
                if (Archives.supported(rom.absolutePath)) {
                    val ex = o.optJSONArray("exts"); val exts = if (ex == null) emptyList() else (0 until ex.length()).map { ex.getString(it).lowercase() }
                    rom = File(Storage.unzipRom(a, rom.absolutePath, exts, onPct = { progress(id, it) }, keep = 3))
                }
                val uri = androidx.core.content.FileProvider.getUriForFile(a, a.packageName + ".files", rom)
                a.runOnUiThread {
                    val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK
                    try { a.grantUriPermission(pkg, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION) } catch (_: Exception) {}
                    val view = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/octet-stream").setPackage(pkg).addFlags(flags)
                        // Nombres de "extra" que usan algunos emuladores para arrancar un juego directo
                        .putExtra("bootPath", uri.toString())
                        .putExtra("AutoStartFile", uri.toString())
                        .putExtra("SelectedGames", arrayOf(uri.toString()))
                        .putExtra("GamePath", uri.toString())
                    try {
                        a.startActivity(view)
                        reply(id, true, JSONObject().put("opened", "game").put("pkg", pkg))
                    } catch (_: Exception) {
                        try {
                            val launch = a.packageManager.getLeanbackLaunchIntentForPackage(pkg) ?: a.packageManager.getLaunchIntentForPackage(pkg)
                                ?: throw IllegalStateException("No se pudo abrir el emulador")
                            a.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                            reply(id, true, JSONObject().put("opened", "app").put("pkg", pkg).put("path", rom.absolutePath))
                        } catch (e: Exception) { reply(id, false, e.message ?: "No se pudo abrir el emulador") }
                    }
                }
            } catch (e: Throwable) { reply(id, false, e.message ?: "No se pudo abrir el emulador") }
        }
    }

    // ---------------- Google Drive (juegos y partidas) ----------------
    /** Ejecuta con un token de Drive; si venció, lo pide otra vez (sin molestar si ya se dio permiso). */
    private fun withDrive(id: String, interactive: Boolean, work: (String) -> Any?) {
        a.runOnUiThread {
            Drive.token(a, interactive) { tok, err ->
                if (tok == null) { reply(id, false, if (err == "NO_AUTH") "Conecta tu Google Drive" else err); return@token }
                io.execute {
                    try { reply(id, true, work(tok)) }
                    catch (e: Exception) {
                        if (e.message == "AUTH") {
                            // El permiso venció: se pide uno nuevo una vez y se reintenta
                            Drive.dropToken(a, tok)
                            a.runOnUiThread { Drive.token(a, false) { t2, _ ->
                                if (t2 == null) { reply(id, false, "Google pidió volver a conectar Drive"); return@token }
                                io.execute { try { reply(id, true, work(t2)) } catch (e2: Exception) { reply(id, false, if (e2.message == "AUTH") "Google pidió volver a conectar Drive" else (e2.message ?: "Error con Drive")) } }
                            } }
                        } else reply(id, false, e.message ?: "Error con Drive")
                    }
                }
            }
        }
    }
    /** Intercambiar A y B del mando en los menús (get: solo consultar; on/off: cambiar). */
    @JavascriptInterface fun padSwap(v: String): Boolean {
        val p = a.getSharedPreferences("pad", Context.MODE_PRIVATE)
        if (v == "on" || v == "off") p.edit().putBoolean("swapAB", v == "on").apply()
        return p.getBoolean("swapAB", false)
    }
    @JavascriptInterface fun driveConnected(): Boolean = Drive.connected(a)
    @JavascriptInterface fun driveKeys(id: String, secret: String) { Drive.setKeys(a, id, secret) }
    @JavascriptInterface fun driveConnect(id: String) = withDrive(id, true) { true }
    @JavascriptInterface fun driveDisconnect() { Drive.disconnect(a) }
    @JavascriptInterface fun driveExport(): String = Drive.exportRt(a)
    @JavascriptInterface fun driveImport(rt: String) { Drive.importRt(a, rt) }
    @JavascriptInterface fun driveFolders(id: String, parent: String?, search: String?) = withDrive(id, false) { Drive.folders(it, parent?.ifBlank { null }, search) }
    @JavascriptInterface fun driveGames(id: String, folder: String) = withDrive(id, false) { Drive.games(it, folder) }
    @JavascriptInterface fun driveFetch(id: String, fileId: String, name: String) = withDrive(id, false) { Drive.download(a, it, fileId, name) { p -> progress(id, p) } }
    @JavascriptInterface fun driveSync(id: String) = withDrive(id, false) { Drive.syncSaves(a, it) }
    @JavascriptInterface fun driveClear() { io.execute { try { Drive.clearCache(a) } catch (_: Exception) {} } }

    /** Ajuste del juego dentro del marco en RetroArch (tamaño y posición). */
    @JavascriptInterface
    fun raFrameAdjust(what: String): String = RetroArch.adjust(a, what)

    /** {installed, pkg, bios} de la app RetroArch. */
    @JavascriptInterface
    fun retroArch(): String = RetroArch.info(a)

    /** Abre la ROM en RetroArch con su núcleo: {rom, core} */
    @JavascriptInterface
    fun playRetroArch(id: String, json: String) {
        io.execute {
            try {
                val o = JSONObject(json)
                var rom = Storage.toLocalFile(a, o.getString("rom"))
                // Comprimidos (.zip/.7z/.rar) y lo enviado desde el celular: a una carpeta que RetroArch pueda abrir
                val ex = o.optJSONArray("exts"); val exts = if (ex == null) emptyList() else (0 until ex.length()).map { ex.getString(it).lowercase() }
                try {
                    rom = File(Storage.forRetroArch(a, rom.absolutePath, exts) { progress(id, it) })
                } catch (e: IllegalStateException) {
                    if (e.message == "PERMISO") { requestStorageAccess(); throw IllegalStateException("Para jugar con RetroArch, permite a MiVibra guardar en la memoria (se abrió el ajuste) y vuelve a intentar.") }
                    throw e
                }
                val cfg = RetroArch.launchConfig(a, o.optString("sys"))
                val why = RetroArch.lastWhy
                val msg = if (cfg != null && why.isEmpty()) "Abriendo RetroArch con marco" else "Abriendo RetroArch sin marco: ${why.ifEmpty { "motivo desconocido" }}"
                a.runOnUiThread { android.widget.Toast.makeText(a, msg, android.widget.Toast.LENGTH_LONG).show() }
                a.runOnUiThread {
                    try { RetroArch.launch(a, rom.absolutePath, o.getString("core"), cfg); reply(id, true, rom.absolutePath) }
                    catch (e: Exception) { reply(id, false, e.message ?: "No se pudo abrir RetroArch") }
                }
            } catch (e: Exception) {
                reply(id, false, e.message ?: "No se pudo abrir RetroArch")
            }
        }
    }

    @JavascriptInterface
    fun downloadCore(id: String, core: String, source: String?) {
        io.execute {
            try {
                Cores.download(a, core, source ?: "") { progress(id, it) }
                reply(id, true, core)
            } catch (e: Exception) {
                reply(id, false, e.message ?: "No se pudo descargar el núcleo")
            }
        }
    }

    @JavascriptInterface
    fun playGame(id: String, json: String) {
        io.execute {
            try {
                val o = JSONObject(json)
                val core = o.getString("core")
                if (!Cores.installed(a, core)) throw IllegalStateException("Falta el núcleo $core")
                val rom = Storage.toLocalFile(a, o.getString("rom"))
                if (!rom.exists()) throw IllegalStateException("No se encuentra la ROM")
                a.runOnUiThread {
                    a.startActivity(
                        Intent(a, GameActivity::class.java)
                            .putExtra("core", Cores.file(a, core).absolutePath)
                            .putExtra("rom", rom.absolutePath)
                            .putExtra("title", o.optString("title"))
                            .putExtra("shader", o.optString("shader", "default"))
                            .putExtra("sys", o.optString("sys"))
                            .putExtra("vars", o.optJSONObject("vars")?.toString())
                    )
                }
                reply(id, true, rom.absolutePath)
            } catch (e: Exception) {
                reply(id, false, e.message ?: "No se pudo abrir el juego")
            }
        }
    }

    @JavascriptInterface
    fun gamepads(): String {
        val arr = JSONArray()
        for (devId in InputDevice.getDeviceIds()) {
            val d = InputDevice.getDevice(devId) ?: continue
            val s = d.sources
            if ((s and InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD || (s and InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK) {
                arr.put(JSONObject().put("name", d.name).put("player", d.controllerNumber))
            }
        }
        return arr.toString()
    }

    // ---------------- Celular como mando ----------------

    @JavascriptInterface
    fun remoteStart(): String {
        val ip = RemoteServer.localIp(a)
        try {
            if (RemoteHub.server == null) {
                val s = RemoteServer(a.applicationContext)
                s.start(0, true)
                RemoteHub.server = s
            }
        } catch (e: Exception) {
            return JSONObject().put("ok", false).put("error", e.message).toString()
        }
        val url = if (ip != null) "http://$ip:${RemoteServer.PORT}/" else ""
        return JSONObject().put("ok", ip != null).put("url", url).put("key", RemoteServer.key(a)).put("clients", RemoteHub.server?.clientCount() ?: 0).toString()
    }

    @JavascriptInterface
    fun remoteStop() {
        RemoteHub.server?.stop()
        RemoteHub.server = null
    }

    // ---------------- Dispositivo ----------------

    @JavascriptInterface
    fun deviceInfo(): String {
        val ui = a.getSystemService(Context.UI_MODE_SERVICE) as UiModeManager
        val tv = ui.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION ||
            a.packageManager.hasSystemFeature("android.software.leanback")
        val touch = a.packageManager.hasSystemFeature("android.hardware.touchscreen")
        return JSONObject()
            .put("tv", tv)
            .put("ramMb", try { val mi = android.app.ActivityManager.MemoryInfo(); (a.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager).getMemoryInfo(mi); mi.totalMem / 1048576 } catch (_: Exception) { 0L })
            .put("lowRam", try { (a.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager).isLowRamDevice } catch (_: Exception) { false })
            .put("touch", touch)
            .put("model", Build.MANUFACTURER + " " + Build.MODEL)
            .put("sdk", Build.VERSION.SDK_INT)
            .put("abi", Build.SUPPORTED_ABIS.firstOrNull() ?: "")
            .put("version", BuildConfig.VERSION_NAME)
            .put("versionCode", BuildConfig.VERSION_CODE)
            .put("external", Environment.getExternalStorageDirectory().absolutePath)
            .put("cores", Runtime.getRuntime().availableProcessors())
            .put("soc", try { if (Build.VERSION.SDK_INT >= 31) (Build.SOC_MANUFACTURER + " " + Build.SOC_MODEL).trim() else Build.HARDWARE } catch (_: Throwable) { Build.HARDWARE })
            .put("hw", Build.HARDWARE ?: "")
            .put("maxMhz", maxCpuMhz())
            .put("screenW", a.resources.displayMetrics.widthPixels)
            .put("screenH", a.resources.displayMetrics.heightPixels)
            .put("density", a.resources.displayMetrics.density.toDouble())
            .put("heapMb", try { (a.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager).memoryClass } catch (_: Exception) { 0 })
            .toString()
    }

    /** Frecuencia máxima de CPU (MHz) leyendo cpufreq; 0 si no se puede. */
    private fun maxCpuMhz(): Int {
        var best = 0
        try {
            val n = Runtime.getRuntime().availableProcessors()
            for (i in 0 until n) {
                val f = File("/sys/devices/system/cpu/cpu$i/cpufreq/cpuinfo_max_freq")
                if (f.canRead()) { val v = f.readText().trim().toIntOrNull() ?: 0; if (v / 1000 > best) best = v / 1000 }
            }
        } catch (_: Throwable) {}
        return best
    }

    // ---------------- Juegos instalados en el equipo (para lanzarlos desde Juegos) ----------------

    /**
     * Juegos instalados (apps marcadas como juego por la tienda). Con all=true devuelve todas las apps que se pueden abrir,
     * con "game" para saber cuáles son juegos. Cada una trae su ícono (o el banner de Android TV) como imagen.
     */
    @JavascriptInterface
    fun installedGames(all: Boolean): String {
        val pm = a.packageManager
        val out = JSONArray()
        val seen = HashSet<String>()
        val intents = listOf(
            Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER),
            Intent(Intent.ACTION_MAIN).addCategory("android.intent.category.LEANBACK_LAUNCHER"))
        for (it in intents) {
            val list = try { pm.queryIntentActivities(it, 0) } catch (_: Exception) { emptyList() }
            for (ri in list) {
                val ai = ri.activityInfo?.applicationInfo ?: continue
                val pkg = ai.packageName
                if (pkg == a.packageName || !seen.add(pkg)) continue
                @Suppress("DEPRECATION")
                val game = (android.os.Build.VERSION.SDK_INT >= 26 && ai.category == android.content.pm.ApplicationInfo.CATEGORY_GAME) ||
                    (ai.flags and android.content.pm.ApplicationInfo.FLAG_IS_GAME) != 0
                if (!game && !all) continue
                val o = JSONObject().put("pkg", pkg).put("name", ai.loadLabel(pm).toString()).put("game", game)
                try {
                    val banner = ai.loadBanner(pm)
                    val d = banner ?: ai.loadIcon(pm)
                    val w = if (banner != null) 320 else 128
                    val h = if (banner != null) 180 else 128
                    val bmp = android.graphics.Bitmap.createBitmap(w, h, android.graphics.Bitmap.Config.ARGB_8888)
                    val c = android.graphics.Canvas(bmp)
                    d.setBounds(0, 0, w, h); d.draw(c)
                    val bo = java.io.ByteArrayOutputStream()
                    bmp.compress(android.graphics.Bitmap.CompressFormat.PNG, 90, bo)
                    o.put("img", "data:image/png;base64," + android.util.Base64.encodeToString(bo.toByteArray(), android.util.Base64.NO_WRAP))
                    o.put("banner", banner != null)
                } catch (_: Throwable) {}
                try { o.put("installed", pm.getPackageInfo(pkg, 0).firstInstallTime) } catch (_: Exception) {}
                out.put(o)
            }
        }
        return out.toString()
    }

    /** Abre un juego instalado. */
    @JavascriptInterface
    fun launchGame(json: String): Boolean {
        val o = try { JSONObject(json) } catch (_: Exception) { return false }
        val pkg = o.optString("pkg"); if (pkg.isBlank()) return false
        val pm = a.packageManager
        val i = pm.getLeanbackLaunchIntentForPackage(pkg) ?: pm.getLaunchIntentForPackage(pkg) ?: return false
        return try { a.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true } catch (_: Exception) { false }
    }

    // ---------------- Otras apps (YouTube, música) ----------------

    /** Qué apps de la lista están instaladas: {"com.google.android.youtube": true, ...} */
    @JavascriptInterface
    fun appsInstalled(pkgsJson: String): String {
        val out = JSONObject()
        val arr = try { JSONArray(pkgsJson) } catch (_: Exception) { JSONArray() }
        for (i in 0 until arr.length()) {
            val p = arr.optString(i)
            out.put(p, try { a.packageManager.getPackageInfo(p, 0); true } catch (_: Exception) { false })
        }
        return out.toString()
    }

    /**
     * Abre la primera app instalada de "pkgs". Con "url" la abre en esa app (por ejemplo una búsqueda de YouTube).
     * Si ninguna está instalada, abre la tienda o el enlace en el navegador.
     */
    @JavascriptInterface
    fun openApp(json: String): Boolean {
        val o = try { JSONObject(json) } catch (_: Exception) { return false }
        val pkgs = o.optJSONArray("pkgs") ?: JSONArray()
        val url = o.optString("url")
        val pm = a.packageManager
        for (i in 0 until pkgs.length()) {
            val p = pkgs.optString(i)
            val installed = try { pm.getPackageInfo(p, 0); true } catch (_: Exception) { false }
            if (!installed) continue
            try {
                val intent = if (url.isNotBlank()) Intent(Intent.ACTION_VIEW, Uri.parse(url)).setPackage(p)
                else (pm.getLeanbackLaunchIntentForPackage(p) ?: pm.getLaunchIntentForPackage(p))
                if (intent != null) {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    a.runOnUiThread { try { a.startActivity(intent) } catch (_: Exception) {
                        pm.getLaunchIntentForPackage(p)?.let { li -> a.startActivity(li.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                    } }
                    return true
                }
            } catch (_: Exception) {
            }
        }
        val store = pkgs.optString(0)
        a.runOnUiThread {
            try {
                if (store.isNotBlank()) a.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$store")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                else if (url.isNotBlank()) a.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (_: Exception) {
                try { if (url.isNotBlank()) a.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {}
            }
        }
        return false
    }

    // ---------------- Actualizaciones ----------------

    /** Descarga la APK nueva (con progreso) y abre el instalador. Si falta el permiso, abre el ajuste y avisa. */
    @JavascriptInterface
    fun installUpdate(id: String, url: String) {
        // Solo actualizaciones oficiales de MiVibra TV (GitHub de MiVibra)
        if (!Regex("^https://github\\.com/simank19/mivibra-tv/releases/download/[^?#]+\\.apk$").matches(url)) { reply(id, false, "Actualización no válida"); return }
        if (!Updater.canInstall(a)) {
            a.runOnUiThread { Updater.askPermission(a) }
            reply(id, true, JSONObject().put("needPermission", true))
            return
        }
        io.execute {
            try {
                val f = Updater.apkFile(a)
                if (f.exists()) f.delete()
                val code = Net.download(url, f, emptyMap(), decompress = false) { p -> progress(id, p) }
                if (code >= 400 || f.length() < 1_000_000) throw IllegalStateException("La descarga falló (" + code + ")")
                a.runOnUiThread {
                    try {
                        Updater.install(a, f)
                        reply(id, true, JSONObject().put("installing", true))
                    } catch (e: Exception) {
                        reply(id, false, e.message ?: "No se pudo abrir el instalador")
                    }
                }
            } catch (e: Exception) {
                reply(id, false, e.message ?: e.javaClass.simpleName)
            }
        }
    }

    @JavascriptInterface
    fun canInstallUpdates(): Boolean = Updater.canInstall(a)

    @JavascriptInterface
    fun toast(msg: String) {
        a.runOnUiThread { Toast.makeText(a, msg, Toast.LENGTH_SHORT).show() }
    }

    @JavascriptInterface
    fun keepAwake(on: Boolean) {
        a.runOnUiThread {
            if (on) a.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else a.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    @JavascriptInterface
    fun openExternal(url: String) {
        a.runOnUiThread {
            try { a.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: Exception) {}
        }
    }

    @JavascriptInterface
    fun exit() {
        a.runOnUiThread { a.finish() }
    }
}
