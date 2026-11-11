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

    /** mode = "text" devuelve el texto; mode = "file" lo guarda y devuelve una ruta para fetch() (listas grandes). */
    @JavascriptInterface
    fun httpGet(id: String, url: String, headersJson: String?, mode: String?) {
        io.execute {
            try {
                if (mode == "file") {
                    val f = netFile(url)
                    val code = Net.download(url, f, headers(headersJson), decompress = true)
                    reply(id, code < 400, JSONObject().put("status", code).put("path", servedPath(f)))
                } else {
                    val (code, txt) = Net.text(url, headers(headersJson))
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

    /** Diagnóstico y optimización MiVibra (integrado, sin instalar nada aparte). */
    @JavascriptInterface
    fun openDiag() {
        a.runOnUiThread { a.startActivity(Intent(a, co.mivibra.tv.diag.DiagActivity::class.java)) }
    }

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
            .toString()
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
