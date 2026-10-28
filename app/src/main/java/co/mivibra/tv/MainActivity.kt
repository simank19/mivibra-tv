package co.mivibra.tv

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.os.SystemClock
import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.File

/** Pantalla principal: la interfaz glass (HTML) dentro de un WebView, con puente nativo. */
class MainActivity : ComponentActivity() {
    lateinit var web: WebView
    private lateinit var bridge: Bridge
    private val pending = HashMap<Int, (Int, Intent?) -> Unit>()
    private var reqSeq = 100
    private var pageReady = false
    private val queue = mutableListOf<String>()
    private var lastAxisNav = 0L

    private val storageReceiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context?, i: Intent?) {
            js("window.MV&&MV.onStorageChanged&&MV.onStorageChanged()")
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .addPathHandler("/net/", WebViewAssetLoader.InternalStoragePathHandler(this, File(cacheDir, "net").apply { mkdirs() }))
            .addPathHandler("/media/", MediaFiles(this))
            .build()

        web = WebView(this)
        web.setBackgroundColor(0xFF0D0C0B.toInt())
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            @Suppress("DEPRECATION")
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            allowFileAccess = false
            useWideViewPort = true
            loadWithOverviewMode = true
            textZoom = 100
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == "appassets.androidplatform.net") return false
                try { startActivity(Intent(Intent.ACTION_VIEW, request.url)) } catch (_: Exception) {}
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                pageReady = true
                val list = queue.toList()
                queue.clear()
                list.forEach { web.evaluateJavascript(it, null) }
            }
        }
        web.webChromeClient = WebChromeClient()
        bridge = Bridge(this)
        web.addJavascriptInterface(bridge, "Android")
        web.isFocusable = true
        web.isFocusableInTouchMode = true
        setContentView(web)
        web.requestFocus()
        web.loadUrl("https://appassets.androidplatform.net/assets/www/index.html")

        RemoteHub.setMain(this)
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_MEDIA_MOUNTED)
            addAction(Intent.ACTION_MEDIA_UNMOUNTED)
            addAction(Intent.ACTION_MEDIA_REMOVED)
            addDataScheme("file")
        }
        ContextCompat.registerReceiver(this, storageReceiver, filter, ContextCompat.RECEIVER_EXPORTED)
        handleViewIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleViewIntent(intent)
    }

    private fun handleViewIntent(i: Intent?) {
        val uri = i?.data ?: return
        if (i.action != Intent.ACTION_VIEW) return
        // Desde "Continuar viendo" del inicio de Android TV
        if (uri.scheme == "mivibra") {
            val key = uri.getQueryParameter("key") ?: return
            // play = seguir viendo; open = abrir la ficha (fila de recomendados)
            val detail = if (uri.host == "open") ",0,true" else ""
            js("window.MV&&MV.openFromHome&&MV.openFromHome(" + org.json.JSONObject.quote(key) + detail + ")")
            return
        }
        bridge.readLocalFile("open-intent", uri.toString())
    }

    override fun onResume() {
        super.onResume()
        RemoteHub.setCurrent(this)
        js("window.MV&&MV.onResume&&MV.onResume()")
    }

    override fun onDestroy() {
        try { unregisterReceiver(storageReceiver) } catch (_: Exception) {}
        RemoteHub.server?.stop()
        RemoteHub.server = null
        web.destroy()
        super.onDestroy()
    }

    fun js(code: String) {
        runOnUiThread {
            if (pageReady) web.evaluateJavascript(code, null) else queue.add(code)
        }
    }

    @Suppress("DEPRECATION")
    fun startForResult(i: Intent, cb: (Int, Intent?) -> Unit) {
        val rc = reqSeq++
        pending[rc] = cb
        try {
            startActivityForResult(i, rc)
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

    @Deprecated("Deprecated in Java")
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        js("window.MV&&MV.onStorageChanged&&MV.onStorageChanged()")
    }

    /** Abre el reproductor nativo; al cerrarlo devuelve posición y duración a la interfaz. */
    fun openPlayer(json: String) {
        PlayerActivity.pendingRequest = json
        startForResult(Intent(this, PlayerActivity::class.java)) { _, data ->
            val r = data?.getStringExtra("result") ?: JSONObject().put("id", "").toString()
            js("window.MV&&MV.onPlayerClosed&&MV.onPlayerClosed($r)")
        }
    }

    private var backDown = false

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        when (event.keyCode) {
            KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_BUTTON_B, KeyEvent.KEYCODE_ESCAPE -> {
                // Solo cuenta un Atrás completo (bajar y soltar aquí): al cerrarse el teclado de la TV llega un "soltar" suelto
                if (event.action == KeyEvent.ACTION_DOWN) { if (event.repeatCount == 0) backDown = true; return true }
                if (event.action == KeyEvent.ACTION_UP) {
                    if (!backDown) return true
                    backDown = false
                    web.evaluateJavascript("(window.MV&&MV.onBack&&MV.onBack())?'1':'0'") { r ->
                        if (r == null || !r.contains("1")) finish()
                    }
                }
                return true
            }
            KeyEvent.KEYCODE_BUTTON_A, KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> {
                return web.dispatchKeyEvent(KeyEvent(event.downTime, event.eventTime, event.action, KeyEvent.KEYCODE_ENTER, event.repeatCount))
            }
            KeyEvent.KEYCODE_MENU, KeyEvent.KEYCODE_BUTTON_Y, KeyEvent.KEYCODE_BUTTON_X -> {
                if (event.action == KeyEvent.ACTION_UP) js("window.MV&&MV.onKey&&MV.onKey('menu')")
                return true
            }
            KeyEvent.KEYCODE_BUTTON_L1, KeyEvent.KEYCODE_PAGE_UP, KeyEvent.KEYCODE_CHANNEL_UP -> {
                if (event.action == KeyEvent.ACTION_UP) js("window.MV&&MV.onKey&&MV.onKey('prevTab')")
                return true
            }
            KeyEvent.KEYCODE_BUTTON_R1, KeyEvent.KEYCODE_PAGE_DOWN, KeyEvent.KEYCODE_CHANNEL_DOWN -> {
                if (event.action == KeyEvent.ACTION_UP) js("window.MV&&MV.onKey&&MV.onKey('nextTab')")
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }

    /** La palanca izquierda de un mando también mueve el foco en los menús. */
    override fun dispatchGenericMotionEvent(ev: MotionEvent): Boolean {
        if ((ev.source and InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK && ev.action == MotionEvent.ACTION_MOVE) {
            val x = ev.getAxisValue(MotionEvent.AXIS_X)
            val y = ev.getAxisValue(MotionEvent.AXIS_Y)
            val now = SystemClock.uptimeMillis()
            if (now - lastAxisNav > 220) {
                val code = when {
                    y < -0.6f -> KeyEvent.KEYCODE_DPAD_UP
                    y > 0.6f -> KeyEvent.KEYCODE_DPAD_DOWN
                    x < -0.6f -> KeyEvent.KEYCODE_DPAD_LEFT
                    x > 0.6f -> KeyEvent.KEYCODE_DPAD_RIGHT
                    else -> 0
                }
                if (code != 0) {
                    lastAxisNav = now
                    web.dispatchKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_DOWN, code, 0))
                    web.dispatchKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_UP, code, 0))
                    return true
                }
            }
        }
        return super.dispatchGenericMotionEvent(ev)
    }
}
