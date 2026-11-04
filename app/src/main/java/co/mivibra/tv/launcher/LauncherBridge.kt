package co.mivibra.tv.launcher

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.widget.Toast
import co.mivibra.tv.BuildConfig
import co.mivibra.tv.MainActivity
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.Scope
import org.json.JSONObject
import java.util.concurrent.Executors

/** Puente entre la interfaz del launcher (launcher.js, objeto "Launcher") y Android. */
class LauncherBridge(private val a: LauncherActivity) {
    private val pool = Executors.newCachedThreadPool()
    @Volatile private var photosCancel = false

    fun close() { photosCancel = true; pool.shutdownNow() }

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
        a.startActivity(Intent(a, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
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
            .put("version", BuildConfig.VERSION_NAME)
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
}
