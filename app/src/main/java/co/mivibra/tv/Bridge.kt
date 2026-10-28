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

    /** Fila de recomendados en el inicio de Android TV. */
    @JavascriptInterface
    fun publishHome(json: String) { HomeChannel.publish(a, json) }

    @JavascriptInterface
    fun play(json: String) {
        a.runOnUiThread { a.openPlayer(json) }
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
                a.requestPermissions(arrayOf(android.Manifest.permission.READ_EXTERNAL_STORAGE), 7)
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
        val f = File(path)
        val dl = downloadsDir()
        return f.absolutePath.startsWith(dl) && f.delete()
    }

    // ---------------- Juegos ----------------

    @JavascriptInterface
    fun coreInstalled(core: String): Boolean = Cores.installed(a, core)

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
        return JSONObject().put("ok", ip != null).put("url", url).put("clients", RemoteHub.server?.clientCount() ?: 0).toString()
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
