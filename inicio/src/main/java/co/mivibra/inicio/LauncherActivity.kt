package co.mivibra.inicio

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.view.KeyEvent
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader
import java.io.File

/**
 * Pantalla de inicio MiVibra (launcher estilo consola).
 * Reemplaza el inicio de la TV: apps, entradas HDMI, MiVibra TV y fondos con tus fotos de Google Fotos.
 * App aparte de MiVibra TV: las actualizaciones de una no tocan a la otra.
 */
class LauncherActivity : ComponentActivity() {
    lateinit var web: WebView
    private lateinit var bridge: LauncherBridge
    private var pageReady = false
    private val queue = mutableListOf<String>()
    private val pending = HashMap<Int, (Int, Intent?) -> Unit>()
    private var reqSeq = 300
    private var backDown = false

    private val pkgReceiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context?, i: Intent?) {
            Apps.invalidate()
            js("window.L&&L.onAppsChanged&&L.onAppsChanged()")
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WebView.setWebContentsDebuggingEnabled(false)

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .addPathHandler("/icons/", WebViewAssetLoader.InternalStoragePathHandler(this, Apps.iconDir(this)))
            .addPathHandler("/fondos/", WebViewAssetLoader.InternalStoragePathHandler(this, GooglePhotos.dir(this)))
            .build()

        web = WebView(this)
        web.setBackgroundColor(0xFF0D0C0B.toInt())
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            allowFileAccess = false
            textZoom = 100
            useWideViewPort = true
            loadWithOverviewMode = true
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                request.url.host != "appassets.androidplatform.net"

            override fun onPageFinished(view: WebView, url: String) {
                pageReady = true
                val list = queue.toList()
                queue.clear()
                list.forEach { web.evaluateJavascript(it, null) }
            }
        }
        web.webChromeClient = WebChromeClient()
        bridge = LauncherBridge(this)
        web.addJavascriptInterface(bridge, "Launcher")
        web.isFocusable = true
        web.isFocusableInTouchMode = true
        setContentView(web)
        web.requestFocus()
        web.loadUrl("https://appassets.androidplatform.net/assets/www/launcher/index.html")
        askTvPermission()

        val f = IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_ADDED)
            addAction(Intent.ACTION_PACKAGE_REMOVED)
            addAction(Intent.ACTION_PACKAGE_CHANGED)
            addAction(Intent.ACTION_PACKAGE_REPLACED)
            addDataScheme("package")
        }
        ContextCompat.registerReceiver(this, pkgReceiver, f, ContextCompat.RECEIVER_EXPORTED)
    }

    /** Permiso para leer "Continuar viendo" y las filas de sugerencias de las apps (como el inicio de Google). */
    fun askTvPermission() {
        if (!TvRows.supported()) return
        val need = arrayOf(TvRows.PERMISSION, TvRows.LISTINGS).filter { checkSelfPermission(it) != android.content.pm.PackageManager.PERMISSION_GRANTED }
        if (need.isEmpty()) return
        try { requestPermissions(need.toTypedArray(), 77) } catch (_: Exception) {}
    }

    @Deprecated("Deprecated in Java")
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 77) js("window.L&&L.onTvRows&&L.onTvRows()")
    }

    /** Botón Inicio estando ya en el launcher: vuelve arriba. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        js("window.L&&L.onHome&&L.onHome()")
    }

    override fun onResume() {
        super.onResume()
        js("window.L&&L.onResume&&L.onResume()")
    }

    override fun onPause() {
        super.onPause()
        js("window.L&&L.onPause&&L.onPause()")
    }

    override fun onDestroy() {
        try { unregisterReceiver(pkgReceiver) } catch (_: Exception) {}
        bridge.close()
        web.destroy()
        super.onDestroy()
    }

    fun js(code: String) {
        runOnUiThread {
            if (pageReady) web.evaluateJavascript(code, null) else queue.add(code)
        }
    }

    @Suppress("DEPRECATION")
    fun startSenderForResult(sender: android.content.IntentSender, cb: (Int, Intent?) -> Unit) {
        val rc = reqSeq++
        pending[rc] = cb
        try {
            startIntentSenderForResult(sender, rc, null, 0, 0, 0)
        } catch (e: Exception) {
            pending.remove(rc)
            throw e
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        pending.remove(requestCode)?.invoke(resultCode, data)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        when (event.keyCode) {
            // En el inicio, Atrás nunca cierra la pantalla: solo cierra paneles
            KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_BUTTON_B, KeyEvent.KEYCODE_ESCAPE -> {
                if (event.action == KeyEvent.ACTION_DOWN) { if (event.repeatCount == 0) backDown = true; return true }
                if (event.action == KeyEvent.ACTION_UP && backDown) {
                    backDown = false
                    js("window.L&&L.onBack&&L.onBack()")
                }
                return true
            }
            KeyEvent.KEYCODE_BUTTON_A, KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> {
                return web.dispatchKeyEvent(KeyEvent(event.downTime, event.eventTime, event.action, KeyEvent.KEYCODE_ENTER, event.repeatCount))
            }
            KeyEvent.KEYCODE_MENU, KeyEvent.KEYCODE_BUTTON_Y, KeyEvent.KEYCODE_BUTTON_X -> {
                if (event.action == KeyEvent.ACTION_UP) js("window.L&&L.onMenu&&L.onMenu()")
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }
}
