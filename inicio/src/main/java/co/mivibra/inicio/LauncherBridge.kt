package co.mivibra.inicio

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.widget.Toast
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.Scope
import org.json.JSONObject
import java.util.concurrent.Executors

/** Puente entre la interfaz del launcher (launcher.js, objeto "Launcher") y Android. */
class LauncherBridge(private val a: LauncherActivity) {
    private val pool = Executors.newCachedThreadPool()
    @Volatile private var photosCancel = false

    private var upload: PhotoUploadServer? = null

    fun close() { photosCancel = true; uploadStop(); pool.shutdownNow() }

    /** Responde a una llamada de JS: L._r(id, ok, datoJSON) */
    private fun reply(id: String, ok: Boolean, json: String) {
        a.js("window.L&&L._r(" + JSONObject.quote(id) + "," + ok + "," + json + ")")
    }
    private fun replyErr(id: String, e: Throwable) = reply(id, false, JSONObject.quote(e.message ?: e.javaClass.simpleName))

    private fun bg(id: String, work: () -> String) {
        pool.execute {
            try { reply(id, true, work()) } catch (e: Throwable) { replyErr(id, e) }
        }
    }

    // ---------------- Apps y entradas ----------------

    @JavascriptInterface
    fun apps(id: String) = bg(id) { Apps.list(a) }

    @JavascriptInterface
    fun launch(pkg: String): Boolean = Apps.launch(a, pkg)

    @JavascriptInterface
    fun appInfo(pkg: String): Boolean = Apps.details(a, pkg)

    @JavascriptInterface
    fun inputs(): String = Apps.inputs(a)

    @JavascriptInterface
    fun openInput(inputId: String): Boolean = Apps.openInput(a, inputId)

    @JavascriptInterface
    fun openMiVibra() {
        if (!MiVibraLink.open(a)) toast("Instala MiVibra TV")
    }

    // ---------------- Contenido sugerido ----------------

    /** Lo que MiVibra TV publicó para el inicio: [{key,title,poster,type,play?,pct?}] */
    @JavascriptInterface
    fun mivibraRecs(): String = MiVibraLink.recs(a)

    @JavascriptInterface
    fun ytKey(): String = MiVibraLink.ytKey(a)

    /** Abre un título de MiVibra: play=true sigue viendo; si no, abre su ficha. */
    @JavascriptInterface
    fun openMiVibraItem(key: String, play: Boolean) {
        MiVibraLink.openItem(a, key, play)
    }

    // ---------------- Tu cuenta de YouTube ----------------

    @JavascriptInterface
    fun ytConnected(): String = JSONObject().put("on", YouTubeAccount.connected(a)).put("name", YouTubeAccount.name(a)).toString()

    @JavascriptInterface
    fun ytCode(id: String, clientId: String) = bg(id) { YouTubeAccount.deviceCode(clientId).toString() }

    @JavascriptInterface
    fun ytPoll(id: String, clientId: String, secret: String, deviceCode: String) =
        bg(id) { YouTubeAccount.poll(a, clientId, secret, deviceCode).toString() }

    @JavascriptInterface
    fun ytFeed(id: String, clientId: String, secret: String) = bg(id) { YouTubeAccount.feed(a, clientId, secret).toString() }

    @JavascriptInterface
    fun ytSignOut() = YouTubeAccount.signOut(a)

    // ---------------- Filas oficiales de Android TV (Continuar viendo y sugerencias de YouTube) ----------------

    /** {ok, watchNext:[...], youtube:[{name, items}]}; ok=false si falta el permiso. */
    @JavascriptInterface
    fun tvRows(id: String) = bg(id) {
        val yt = setOf("com.google.android.youtube.tv", "com.google.android.youtube.googletv", "com.google.android.youtube")
        JSONObject()
            .put("supported", TvRows.supported())
            .put("ok", TvRows.granted(a))
            .put("watchNext", TvRows.watchNext(a))
            .put("youtube", TvRows.channels(a, yt))
            .put("debug", TvRows.debug(a))
            .toString()
    }

    @JavascriptInterface
    fun tvOpen(uri: String): Boolean = TvRows.open(a, uri)

    @JavascriptInterface
    fun tvAsk() { a.runOnUiThread { a.askTvPermission() } }

    /** Abre un video en la app de YouTube de la TV (o la primera que haya). */
    @JavascriptInterface
    fun openYouTube(videoId: String): Boolean {
        val uri = android.net.Uri.parse("https://www.youtube.com/watch?v=" + android.net.Uri.encode(videoId))
        val pkgs = listOf("com.google.android.youtube.tv", "com.google.android.youtube.googletv", "com.google.android.youtube")
        for (p in pkgs) {
            if (!Apps.hasPackage(a, p)) continue
            try {
                a.startActivity(Intent(Intent.ACTION_VIEW, uri).setPackage(p).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return true
            } catch (_: Exception) {}
        }
        return try { a.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true } catch (_: Exception) { false }
    }

    @JavascriptInterface
    fun openSettings(which: String?) {
        val action = when (which) {
            "wifi" -> Settings.ACTION_WIFI_SETTINGS
            "apps" -> Settings.ACTION_APPLICATION_SETTINGS
            "home" -> Settings.ACTION_HOME_SETTINGS
            else -> Settings.ACTION_SETTINGS
        }
        try { a.startActivity(Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
        catch (_: Exception) { try { a.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {} }
    }

    @JavascriptInterface
    fun status(): String {
        var net = "none"
        try {
            val cm = a.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val caps = cm.getNetworkCapabilities(cm.activeNetwork)
            if (caps != null) net = when {
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
                else -> "other"
            }
        } catch (_: Exception) {}
        return JSONObject()
            .put("net", net)
            .put("model", Build.MANUFACTURER + " " + Build.MODEL)
            .put("version", try { a.packageManager.getPackageInfo(a.packageName, 0).versionName } catch (_: Exception) { "" })
            .toString()
    }

    @JavascriptInterface
    fun toast(msg: String) { a.runOnUiThread { Toast.makeText(a, msg, Toast.LENGTH_SHORT).show() } }

    // ---------------- Fondos (Google Fotos) ----------------

    @JavascriptInterface
    fun photos(): String = GooglePhotos.list(a)

    @JavascriptInterface
    fun deletePhoto(path: String): Boolean = GooglePhotos.delete(a, path)

    @JavascriptInterface
    fun clearPhotos() = GooglePhotos.clear(a)

    /** Permiso de Google Fotos con la cuenta de Google de la TV. Responde el token. */
    @JavascriptInterface
    fun photosAuth(id: String) {
        a.runOnUiThread {
            try {
                val req = AuthorizationRequest.builder()
                    .setRequestedScopes(listOf(Scope(GooglePhotos.SCOPE)))
                    .build()
                val client = Identity.getAuthorizationClient(a)
                client.authorize(req)
                    .addOnSuccessListener { r ->
                        val pi = r.pendingIntent
                        if (r.hasResolution() && pi != null) {
                            try {
                                a.startSenderForResult(pi.intentSender) { _, data ->
                                    try {
                                        val res = client.getAuthorizationResultFromIntent(data)
                                        val t = res.accessToken
                                        if (t.isNullOrBlank()) reply(id, false, JSONObject.quote("Google no entregó el permiso"))
                                        else reply(id, true, JSONObject.quote(t))
                                    } catch (e: Exception) { replyErr(id, e) }
                                }
                            } catch (e: Exception) { replyErr(id, e) }
                        } else {
                            val t = r.accessToken
                            if (t.isNullOrBlank()) reply(id, false, JSONObject.quote("Google no entregó el permiso"))
                            else reply(id, true, JSONObject.quote(t))
                        }
                    }
                    .addOnFailureListener { e -> replyErr(id, e) }
            } catch (e: Throwable) { replyErr(id, e) }
        }
    }

    /** Respaldo: código para aprobar en google.com/device desde el celular. */
    @JavascriptInterface
    fun photosDeviceCode(id: String, clientId: String) = bg(id) { GooglePhotos.deviceCode(clientId).toString() }

    @JavascriptInterface
    fun photosDeviceToken(id: String, clientId: String, secret: String, deviceCode: String) =
        bg(id) { JSONObject.quote(GooglePhotos.deviceToken(clientId, secret, deviceCode)) }

    /** Crea la sesión de selección: {id, pickerUri, pollingConfig} */
    @JavascriptInterface
    fun photosSession(id: String, token: String) = bg(id) { GooglePhotos.createSession(token).toString() }

    /** Espera a que elijas las fotos en el celular y las descarga. Avisa el avance con L.onPhotosProgress. */
    @JavascriptInterface
    fun photosWait(id: String, token: String, sessionId: String, pollMs: Int) {
        photosCancel = false
        bg(id) {
            val deadline = System.currentTimeMillis() + 15 * 60 * 1000
            while (!GooglePhotos.sessionReady(token, sessionId)) {
                if (photosCancel) throw Exception("cancelado")
                if (System.currentTimeMillis() > deadline) throw Exception("Se acabó el tiempo para elegir las fotos")
                Thread.sleep(pollMs.coerceIn(2000, 15000).toLong())
            }
            a.js("window.L&&L.onPhotosProgress&&L.onPhotosProgress(0,0)")
            val n = GooglePhotos.download(a, token, sessionId) { done, total ->
                a.js("window.L&&L.onPhotosProgress&&L.onPhotosProgress($done,$total)")
            }
            n.toString()
        }
    }

    @JavascriptInterface
    fun photosCancel() { photosCancel = true }

    // ---------------- Subir fondos desde el celular (sin cuentas) ----------------

    /** Prende el servidor de subida y devuelve {url} para el QR, o {error}. */
    @JavascriptInterface
    fun uploadStart(): String {
        val ip = Net.localIp() ?: return JSONObject().put("error", "La TV no está conectada a una red").toString()
        return try {
            if (upload == null) {
                upload = PhotoUploadServer(a) { n -> a.js("window.L&&L.onPhotoUploaded&&L.onPhotoUploaded($n)") }
                    .also { it.start(fi.iki.elonen.NanoHTTPD.SOCKET_READ_TIMEOUT, false) }
            }
            JSONObject().put("url", "http://$ip:${PhotoUploadServer.PORT}/").toString()
        } catch (e: Exception) {
            upload = null
            JSONObject().put("error", e.message ?: "No se pudo abrir la subida").toString()
        }
    }

    @JavascriptInterface
    fun uploadStop() {
        try { upload?.stop() } catch (_: Exception) {}
        upload = null
    }
}
