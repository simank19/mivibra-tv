package co.mivibra.tv

import android.content.Context
import android.os.Build
import android.util.Base64
import org.drinkless.tdlib.Client
import org.drinkless.tdlib.TdApi
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedOutputStream
import java.io.File
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.zip.GZIPInputStream

/**
 * Telegram dentro de MiVibra (Cursos y Mi Telegram) con TDLib, la librería oficial de Telegram.
 * - La librería nativa (~20 MB) no va en la APK: se baja de las versiones de GitHub la primera vez que se usa.
 * - Cada usuario inicia sesión con su número; MiVibra solo lista videos y documentos de sus chats y canales.
 * - Los videos se ven mientras se descargan: un servidor local (127.0.0.1) entrega los pedazos que pide el reproductor.
 */
object Tg {
    const val VER = "1.8.61"
    private const val LIB_URL = "https://github.com/simank19/mivibra-tv/releases/download/tdlib-$VER/libtdjni-%s.so.gz"
    @Volatile private var client: Client? = null
    @Volatile private var loaded = false
    @Volatile var state = "off"; private set           // off · phone · code · password · ready · unsupported · error
    @Volatile var info = JSONObject(); private set
    private var apiId = 0
    private var apiHash = ""
    private lateinit var app: Context
    private val pool = Executors.newFixedThreadPool(4)

    private fun abi(): String = Build.SUPPORTED_ABIS.firstOrNull { it in listOf("arm64-v8a", "armeabi-v7a", "x86_64", "x86") } ?: "armeabi-v7a"
    private fun libFile(c: Context) = File(c.filesDir, "tdlib/$VER/libtdjni.so")
    fun libReady(c: Context) = libFile(c).isFile

    /** Baja (si hace falta) y carga la librería. tick(0..100) mientras descarga. */
    @Synchronized fun ensureLib(c: Context, tick: (Int) -> Unit) {
        if (loaded) return
        val f = libFile(c)
        if (!f.isFile) {
            f.parentFile?.mkdirs()
            val gz = File(f.parentFile, "lib.gz.part")
            val code = Net.download(String.format(LIB_URL, abi()), gz, emptyMap(), decompress = false, progress = tick)
            if (code >= 400 || gz.length() < 1_000_000) { gz.delete(); throw IllegalStateException("No se pudo bajar el componente de Telegram (error $code)") }
            val tmp = File(f.parentFile, "lib.so.part")
            GZIPInputStream(gz.inputStream().buffered(), 1 shl 16).use { inp -> tmp.outputStream().use { inp.copyTo(it, 1 shl 16) } }
            gz.delete()
            if (!tmp.renameTo(f)) throw IllegalStateException("No se pudo guardar el componente de Telegram")
            // versiones viejas de la librería: se borran
            File(c.filesDir, "tdlib").listFiles()?.forEach { if (it.isDirectory && it.name != VER && it.name != "db" && it.name != "files") it.deleteRecursively() }
        }
        System.load(f.absolutePath)
        try { Client.execute(TdApi.SetLogVerbosityLevel(1)) } catch (_: Throwable) {}
        loaded = true
    }

    private fun setState(s: String, i: JSONObject = JSONObject()) { state = s; info = i }

    private val handler = Client.ResultHandler { o ->
        when (o) {
            is TdApi.UpdateAuthorizationState -> onAuth(o.authorizationState)
            is TdApi.UpdateFile -> Stream.onFile(o.file)
        }
    }

    private fun onAuth(a: TdApi.AuthorizationState) {
        when (a) {
            is TdApi.AuthorizationStateWaitTdlibParameters -> {
                val base = File(app.filesDir, "tdlib")
                client?.send(TdApi.SetTdlibParameters(false, File(base, "db").absolutePath, File(app.cacheDir, "tgfiles").absolutePath, null,
                    true, true, true, false, apiId, apiHash, "es", Build.MANUFACTURER + " " + Build.MODEL, "Android " + Build.VERSION.RELEASE, BuildConfig.VERSION_NAME)) { r ->
                    if (r is TdApi.Error) setState("error", JSONObject().put("message", r.message))
                }
            }
            is TdApi.AuthorizationStateWaitPhoneNumber -> setState("phone")
            is TdApi.AuthorizationStateWaitCode -> setState("code", JSONObject().put("phone", a.codeInfo.phoneNumber).put("type", a.codeInfo.type.javaClass.simpleName))
            is TdApi.AuthorizationStateWaitPassword -> setState("password", JSONObject().put("hint", a.passwordHint ?: ""))
            is TdApi.AuthorizationStateReady -> { setState("ready"); cleanCache() }
            is TdApi.AuthorizationStateLoggingOut, is TdApi.AuthorizationStateClosing -> setState("closing")
            is TdApi.AuthorizationStateClosed -> { client = null; setState("off") }
            else -> setState("unsupported", JSONObject().put("message", "Este tipo de inicio de sesión no se puede hacer desde MiVibra; termina el registro en la app de Telegram y vuelve a intentar."))
        }
    }

    /** Arranca TDLib (con la sesión guardada, si existe). Espera hasta saber en qué paso va. */
    fun start(c: Context, id: Int, hash: String, tick: (Int) -> Unit): JSONObject {
        app = c.applicationContext
        if (id <= 0 || hash.isBlank()) throw IllegalStateException("Falta configurar Telegram (api_id y api_hash) en la compilación de la app")
        apiId = id; apiHash = hash
        ensureLib(c, tick)
        if (client == null) { setState("starting"); client = Client.create(handler, null, null) }
        for (i in 0 until 100) { if (state != "starting" && state != "off") break; Thread.sleep(100) }
        return status()
    }
    fun status(): JSONObject = JSONObject().put("state", state).put("info", info).put("lib", loaded)

    /** Llamada que espera la respuesta (en un hilo de trabajo). */
    fun call(f: TdApi.Function<*>, timeoutS: Long = 60): TdApi.Object {
        val cl = client ?: throw IllegalStateException("Telegram no está iniciado")
        val latch = CountDownLatch(1); var res: TdApi.Object? = null
        cl.send(f) { r -> res = r; latch.countDown() }
        if (!latch.await(timeoutS, TimeUnit.SECONDS)) throw IllegalStateException("Telegram tardó demasiado en responder")
        val r = res!!
        if (r is TdApi.Error) throw IllegalStateException(errText(r))
        return r
    }
    private fun errText(e: TdApi.Error): String = when {
        e.message.contains("PHONE_NUMBER_INVALID") -> "El número no es válido: escríbelo con el indicativo, por ejemplo +57 300 000 0000"
        e.message.contains("PHONE_CODE_INVALID") -> "El código no es correcto"
        e.message.contains("PHONE_CODE_EXPIRED") -> "El código venció: pide uno nuevo"
        e.message.contains("PASSWORD_HASH_INVALID") -> "La contraseña de verificación en dos pasos no es correcta"
        e.message.contains("FLOOD_WAIT") -> "Telegram pide esperar un rato antes de volver a intentar"
        e.message.contains("USERNAME_NOT_OCCUPIED") || e.message.contains("USERNAME_INVALID") -> "No existe un canal con ese nombre"
        else -> e.message
    }

    fun phone(p: String) { call(TdApi.SetAuthenticationPhoneNumber(p.replace(Regex("[\\s()-]"), ""), null)) }
    fun code(code: String) { call(TdApi.CheckAuthenticationCode(code.trim())) }
    fun password(p: String) { call(TdApi.CheckAuthenticationPassword(p)) }
    fun logout() { try { call(TdApi.LogOut(), 20) } catch (_: Exception) {} }

    // ---------- Chats, videos y documentos ----------
    private fun mini(m: TdApi.Minithumbnail?): String? = m?.data?.let { "data:image/jpeg;base64," + Base64.encodeToString(it, Base64.NO_WRAP) }

    fun chats(): JSONArray {
        try { for (i in 0 until 6) call(TdApi.LoadChats(TdApi.ChatListMain(), 200), 30) } catch (_: Exception) {}   // 404 = ya están todos
        val ids = (call(TdApi.GetChats(TdApi.ChatListMain(), 1000)) as TdApi.Chats).chatIds
        val out = JSONArray()
        for (id in ids) {
            val ch = try { call(TdApi.GetChat(id), 15) as TdApi.Chat } catch (_: Exception) { continue }
            val type = when (val t = ch.type) { is TdApi.ChatTypeSupergroup -> if (t.isChannel) "channel" else "group"; is TdApi.ChatTypeBasicGroup -> "group"; else -> "private" }
            if (type == "private") continue
            out.put(JSONObject().put("id", ch.id).put("title", ch.title).put("type", type).put("photo", mini(ch.photo?.minithumbnail) ?: JSONObject.NULL))
        }
        return out
    }

    private val VIDEO_EXT = Regex("\\.(mp4|mkv|avi|mov|m4v|webm|ts|wmv|flv|3gp)$", RegexOption.IGNORE_CASE)
    /** Mensaje → video, documento o null. */
    fun item(m: TdApi.Message, chatTitle: String? = null): JSONObject? {
        val o = JSONObject().put("chatId", m.chatId).put("msgId", m.id).put("date", m.date)
        if (chatTitle != null) o.put("chat", chatTitle)
        when (val c = m.content) {
            is TdApi.MessageVideo -> {
                val v = c.video
                o.put("kind", "video").put("fileId", v.video.id).put("size", if (v.video.size > 0) v.video.size else v.video.expectedSize).put("name", v.fileName ?: "")
                    .put("mime", v.mimeType ?: "video/mp4").put("dur", v.duration).put("w", v.width).put("h", v.height).put("caption", c.caption?.text ?: "")
                    .put("mini", mini(v.minithumbnail) ?: JSONObject.NULL).put("thumb", v.thumbnail?.file?.id ?: 0)
            }
            is TdApi.MessageDocument -> {
                val d = c.document; val name = d.fileName ?: ""
                val isVid = (d.mimeType ?: "").startsWith("video/") || VIDEO_EXT.containsMatchIn(name)
                o.put("kind", if (isVid) "video" else "doc").put("fileId", d.document.id).put("size", if (d.document.size > 0) d.document.size else d.document.expectedSize)
                    .put("name", name).put("mime", d.mimeType ?: "").put("caption", c.caption?.text ?: "").put("mini", mini(d.minithumbnail) ?: JSONObject.NULL).put("thumb", d.thumbnail?.file?.id ?: 0)
            }
            is TdApi.MessageText -> o.put("kind", "text").put("caption", c.text.text)
            else -> return null
        }
        return o
    }

    /** Videos (y documentos) de un chat. kind: video | doc. Devuelve {items, next}. */
    fun chatFiles(chatId: Long, from: Long, limit: Int, kind: String, query: String): JSONObject {
        val filter: TdApi.SearchMessagesFilter = if (kind == "doc") TdApi.SearchMessagesFilterDocument() else TdApi.SearchMessagesFilterVideo()
        val r = call(TdApi.SearchChatMessages(chatId, null, query, null, from, 0, limit, filter)) as TdApi.FoundChatMessages
        val arr = JSONArray(); r.messages.forEach { m -> item(m)?.let { arr.put(it) } }
        return JSONObject().put("items", arr).put("next", r.nextFromMessageId)
    }

    /** Busca en todos los chats del usuario (videos y documentos de video). */
    fun search(query: String, offset: String, kind: String): JSONObject {
        val filter: TdApi.SearchMessagesFilter = if (kind == "doc") TdApi.SearchMessagesFilterDocument() else TdApi.SearchMessagesFilterVideo()
        val r = call(TdApi.SearchMessages(TdApi.ChatListMain(), query, offset, 50, filter, null, 0, 0)) as TdApi.FoundMessages
        val titles = HashMap<Long, String>(); val arr = JSONArray()
        for (m in r.messages) {
            val t = titles.getOrPut(m.chatId) { try { (call(TdApi.GetChat(m.chatId), 15) as TdApi.Chat).title } catch (_: Exception) { "" } }
            item(m, t)?.let { arr.put(it) }
        }
        return JSONObject().put("items", arr).put("next", r.nextOffset ?: "")
    }

    /** Canal público por su nombre (t.me/nombre): id, título y foto. */
    fun publicChat(username: String): JSONObject {
        val u = username.trim().removePrefix("@").replace(Regex("^(https?://)?(t|telegram)\\.(me|dog)/(s/)?"), "").substringBefore('/').substringBefore('?')
        val ch = call(TdApi.SearchPublicChat(u)) as TdApi.Chat
        return JSONObject().put("id", ch.id).put("title", ch.title).put("username", u).put("photo", mini(ch.photo?.minithumbnail) ?: JSONObject.NULL)
    }

    /** Todo el historial de un canal (para armar un curso), del más viejo al más nuevo. Máximo 3000 mensajes. */
    fun history(chatId: Long, max: Int): JSONArray {
        try { call(TdApi.OpenChat(chatId), 15) } catch (_: Exception) {}
        val all = ArrayList<TdApi.Message>(); var from = 0L; var empty = 0
        while (all.size < max && empty < 3) {
            val r = call(TdApi.GetChatHistory(chatId, from, 0, 100, false)) as TdApi.Messages
            if (r.messages.isEmpty()) { empty++; Thread.sleep(300); continue }
            empty = 0; all.addAll(r.messages); from = r.messages.last().id
        }
        try { call(TdApi.CloseChat(chatId), 15) } catch (_: Exception) {}
        val arr = JSONArray(); all.distinctBy { it.id }.sortedBy { it.id }.forEach { m -> item(m)?.let { arr.put(it) } }
        return arr
    }

    /** Miniatura (pequeña) de un video: data URL. */
    fun thumb(fileId: Int): String {
        val f = call(TdApi.DownloadFile(fileId, 1, 0, 0, true), 30) as TdApi.File
        val p = f.local?.path ?: return ""
        val b = File(p).takeIf { it.isFile && it.length() < 400_000 }?.readBytes() ?: return ""
        return "data:image/jpeg;base64," + Base64.encodeToString(b, Base64.NO_WRAP)
    }

    /** Baja un documento completo (PDF de un curso, por ejemplo) y devuelve la ruta. */
    fun fetchFile(fileId: Int, tick: (Int) -> Unit): String {
        val total = (call(TdApi.GetFile(fileId)) as TdApi.File).let { if (it.size > 0) it.size else it.expectedSize }
        call(TdApi.DownloadFile(fileId, 16, 0, 0, false))
        while (true) {
            val f = call(TdApi.GetFile(fileId)) as TdApi.File
            if (f.local.isDownloadingCompleted) return f.local.path
            if (!f.local.isDownloadingActive && !f.local.canBeDownloaded) throw IllegalStateException("Telegram no dejó bajar el archivo")
            if (total > 0) tick((f.local.downloadedSize * 100 / total).toInt())
            Thread.sleep(400)
        }
    }

    /** Deja la caché de Telegram por debajo de ~2 GB (los videos vistos se borran primero). */
    fun cleanCache() { pool.execute { try { call(TdApi.OptimizeStorage(2L shl 30, 7 * 86400, -1, 60, null, null, null, false, 0), 120) } catch (_: Exception) {} } }

    // ---------- Servidor local para ver los videos mientras bajan ----------
    object Stream {
        private var server: ServerSocket? = null
        private val waits = java.util.concurrent.ConcurrentHashMap<Int, Any>()
        fun onFile(f: TdApi.File) { waits[f.id]?.let { synchronized(it) { (it as Object).notifyAll() } } }

        @Synchronized fun port(): Int {
            server?.let { if (!it.isClosed) return it.localPort }
            val s = ServerSocket(0, 16, InetAddress.getByName("127.0.0.1")); server = s
            Thread({ while (!s.isClosed) { val k = try { s.accept() } catch (_: Exception) { break }; Tg.pool.execute { serve(k) } } }, "tg-stream").apply { isDaemon = true }.start()
            return s.localPort
        }
        fun url(fileId: Int, name: String): String = "http://127.0.0.1:" + port() + "/tg/" + fileId + "/" + java.net.URLEncoder.encode(name.ifBlank { "video.mp4" }, "UTF-8").replace("+", "%20")

        private fun serve(k: Socket) {
            k.use { sock ->
                sock.soTimeout = 60000
                val inp = sock.getInputStream().bufferedReader()
                val first = inp.readLine() ?: return
                var range: String? = null
                while (true) { val l = inp.readLine() ?: break; if (l.isEmpty()) break; if (l.startsWith("Range:", true)) range = l.substringAfter(':').trim() }
                val out = BufferedOutputStream(sock.getOutputStream(), 1 shl 16)
                val m = Regex("^(GET|HEAD) /tg/(\\d+)").find(first)
                if (m == null) { out.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n".toByteArray()); out.flush(); return }
                val head = m.groupValues[1] == "HEAD"; val fileId = m.groupValues[2].toInt()
                val f = try { Tg.call(TdApi.GetFile(fileId), 20) as TdApi.File } catch (_: Exception) { null }
                if (f == null) { out.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n".toByteArray()); out.flush(); return }
                val total = if (f.size > 0) f.size else f.expectedSize
                var start = 0L; var end = total - 1
                range?.let { r -> Regex("bytes=(\\d*)-(\\d*)").find(r)?.let { g -> if (g.groupValues[1].isNotEmpty()) start = g.groupValues[1].toLong(); if (g.groupValues[2].isNotEmpty()) end = minOf(end, g.groupValues[2].toLong()) } }
                if (start >= total) { out.write("HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */$total\r\n\r\n".toByteArray()); out.flush(); return }
                val len = end - start + 1
                val mime = if (first.contains(".mkv", true)) "video/x-matroska" else if (first.contains(".webm", true)) "video/webm" else "video/mp4"
                out.write(((if (range != null) "HTTP/1.1 206 Partial Content\r\nContent-Range: bytes $start-$end/$total\r\n" else "HTTP/1.1 200 OK\r\n") +
                    "Content-Type: $mime\r\nAccept-Ranges: bytes\r\nContent-Length: $len\r\nConnection: close\r\n\r\n").toByteArray())
                if (head) { out.flush(); return }
                var pos = start; val chunk = 1L shl 20
                while (pos <= end) {
                    val want = minOf(chunk, end - pos + 1)
                    val data = read(fileId, pos, want) ?: break
                    if (data.isEmpty()) break
                    try { out.write(data); out.flush() } catch (_: Exception) { break }   // el reproductor cerró o saltó a otra parte
                    pos += data.size
                }
            }
        }
        /** Pide a Telegram ese pedazo (con prioridad alta) y lo lee apenas esté. */
        private fun read(fileId: Int, pos: Long, n: Long): ByteArray? {
            val lock = waits.getOrPut(fileId) { Object() }
            try { Tg.call(TdApi.DownloadFile(fileId, 32, pos, maxOf(n, 2L shl 20), false), 20) } catch (_: Exception) { return null }
            val t0 = System.currentTimeMillis()
            while (System.currentTimeMillis() - t0 < 60000) {
                val f = try { Tg.call(TdApi.GetFile(fileId), 20) as TdApi.File } catch (_: Exception) { return null }
                val have = if (f.local.isDownloadingCompleted) Long.MAX_VALUE else if (f.local.downloadOffset <= pos) f.local.downloadOffset + f.local.downloadedPrefixSize - pos else 0L
                if (have >= n || (have > 0 && f.local.isDownloadingCompleted)) {
                    val part = try { Tg.call(TdApi.ReadFilePart(fileId, pos, n), 20) } catch (_: Exception) { return null }
                    return (part as? TdApi.Data)?.data
                }
                if (!f.local.isDownloadingActive) try { Tg.call(TdApi.DownloadFile(fileId, 32, pos, maxOf(n, 2L shl 20), false), 20) } catch (_: Exception) {}
                synchronized(lock) { try { (lock as Object).wait(400) } catch (_: InterruptedException) { return null } }
            }
            return null
        }
    }
}
