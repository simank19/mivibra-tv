package co.mivibra.tv

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import org.json.JSONArray
import java.io.ByteArrayInputStream

/**
 * Navegador a pantalla completa, pensado para TV:
 * cursor que se mueve con el control (OK = clic), barra que aparece con MENÚ,
 * bloqueador de anuncios y rastreadores, ventanas emergentes bloqueadas y videos a pantalla completa.
 */
class BrowserActivity : ComponentActivity() {

    private lateinit var web: WebView
    private lateinit var root: FrameLayout
    private lateinit var bar: LinearLayout
    private lateinit var urlBox: EditText
    private lateinit var shield: TextView
    private lateinit var cursor: CursorView
    private var customView: View? = null
    private var customCallback: WebChromeClient.CustomViewCallback? = null
    private var isTv = false
    private var cursorOn = false
    private var desktop = false
    private var adblock = true
    private var blockedCount = 0
    private val prefs by lazy { getSharedPreferences("browser", MODE_PRIVATE) }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        isTv = packageManager.hasSystemFeature("android.software.leanback") ||
            (getSystemService(UI_MODE_SERVICE) as android.app.UiModeManager).currentModeType == android.content.res.Configuration.UI_MODE_TYPE_TELEVISION
        adblock = prefs.getBoolean("adblock", true)
        desktop = prefs.getBoolean("desktop", isTv)
        hideBars()

        root = FrameLayout(this).apply { setBackgroundColor(Color.parseColor("#0D0C0B")) }
        web = WebView(this)
        root.addView(web, FrameLayout.LayoutParams(-1, -1))

        bar = buildBar()
        root.addView(bar, FrameLayout.LayoutParams(-1, -2, Gravity.TOP))

        cursor = CursorView(this)
        root.addView(cursor, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)

        val s = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.databaseEnabled = true
        s.mediaPlaybackRequiresUserGesture = false
        s.loadWithOverviewMode = true
        s.useWideViewPort = true
        s.builtInZoomControls = true
        s.displayZoomControls = false
        s.setSupportMultipleWindows(true)           // las ventanas nuevas se revisan en onCreateWindow (anuncios fuera)
        s.javaScriptCanOpenWindowsAutomatically = false
        s.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        applyUserAgent()
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, !adblock)

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                if (adblock && !request.isForMainFrame && AdBlock.blocks(request.url.host)) {
                    blockedCount++
                    runOnUiThread { updateShield() }
                    return WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(ByteArray(0)))
                }
                return null
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                val scheme = u.scheme ?: ""
                if (scheme == "http" || scheme == "https" || scheme == "about" || scheme == "data") {
                    if (adblock && request.isForMainFrame && (AdBlock.blocks(u.host) || AdBlock.isAdRedirect(u, web.url))) {
                        blockedCount++; updateShield(); toast("Anuncio bloqueado"); return true
                    }
                    return false
                }
                // intent://, market://, whatsapp://… se abren en su app
                try { startActivity(Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {}
                return true
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                if (url != null && !url.startsWith("data:")) urlBox.setText(url)
                blockedCount = 0; updateShield()
            }

            // Página de error propia (en vez de "Página web no disponible")
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: android.webkit.WebResourceError) {
                if (!request.isForMainFrame) return
                val url = request.url.toString()
                val ad = AdBlock.isAdRedirect(request.url, null) || AdBlock.blocks(request.url.host)
                val why = when {
                    ad -> "Era un anuncio o redireccionamiento publicitario de la página anterior."
                    error.errorCode == ERROR_HOST_LOOKUP -> "No existe esa dirección o no hay internet."
                    error.errorCode == ERROR_CONNECT || error.errorCode == ERROR_TIMEOUT -> "El sitio no respondió. Puede estar caído o bloqueado por tu red o tu DNS."
                    else -> "El sitio no se pudo abrir (" + error.description + ")."
                }
                val html = "<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'><style>body{margin:0;background:#0D0C0B;color:#F3EFEA;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:24px;box-sizing:border-box;text-align:center}h1{font-size:28px;margin:0 0 10px}p{color:#A39C94;max-width:620px;line-height:1.5}code{color:#FFB98A;word-break:break-all;font-size:13px}a{margin-top:18px;background:#FF6900;color:#0D0C0B;font-weight:800;padding:14px 28px;border-radius:40px;text-decoration:none}</style></head><body>" +
                    "<h1>" + (if (ad) "Anuncio evitado" else "No se pudo abrir") + "</h1><p>" + why + "</p><code>" + esc(url.take(120)) + "</code>" +
                    "<a href='javascript:history.back()'>Volver</a></body></html>"
                view.loadDataWithBaseURL(url, html, "text/html", "utf-8", url)
            }

            override fun onPageFinished(view: WebView, url: String?) {
                if (adblock) view.evaluateJavascript(AdBlock.COSMETIC, null)
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            // Micrófono para páginas como YouTube o Google (búsqueda por voz): se pide permiso una vez a Android
            override fun onPermissionRequest(request: android.webkit.PermissionRequest) {
                val wantsMic = request.resources.contains(android.webkit.PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                if (!wantsMic) { request.deny(); return }
                val res = arrayOf(android.webkit.PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    runOnUiThread { request.grant(res) }
                } else {
                    pendingMic = request
                    @Suppress("DEPRECATION") requestPermissions(arrayOf(android.Manifest.permission.RECORD_AUDIO), 7302)
                }
            }
            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                customView = view; customCallback = callback
                root.addView(view, FrameLayout.LayoutParams(-1, -1))
                web.visibility = View.GONE; bar.visibility = View.GONE; cursor.visibility = View.GONE
            }

            override fun onHideCustomView() {
                customView?.let { root.removeView(it) }
                customView = null
                customCallback?.onCustomViewHidden()
                web.visibility = View.VISIBLE
                cursor.visibility = if (cursorOn) View.VISIBLE else View.GONE
                hideBars()
            }

            override fun onReceivedTitle(view: WebView, title: String?) {}

            /** Ventanas nuevas: sin toque del usuario se bloquean; con toque, se mira a dónde van y los anuncios se descartan. */
            override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: android.os.Message): Boolean {
                if (!isUserGesture) { blockedCount++; updateShield(); return false }
                val probe = WebView(this@BrowserActivity)
                probe.webViewClient = object : WebViewClient() {
                    private var done = false
                    override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean { take(r.url); return true }
                    override fun onPageStarted(v: WebView, url: String?, f: android.graphics.Bitmap?) { if (url != null) take(Uri.parse(url)) }
                    private fun take(u: Uri) {
                        if (done) return; done = true
                        val ad = AdBlock.blocks(u.host) || AdBlock.isAdRedirect(u, web.url)
                        if (adblock && ad) { blockedCount++; updateShield(); toast("Ventana de anuncio bloqueada") }
                        else if (u.scheme == "http" || u.scheme == "https") web.loadUrl(u.toString())
                        probe.stopLoading(); probe.post { probe.destroy() }
                    }
                }
                (resultMsg.obj as WebView.WebViewTransport).webView = probe
                resultMsg.sendToTarget()
                return true
            }
        }
        web.setDownloadListener { url, _, _, _, _ ->
            try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {}
        }

        setCursor(isTv)
        val start = intent.getStringExtra("url")
        if (start.isNullOrBlank()) showHome() else web.loadUrl(fixUrl(start))
        if (isTv) showBar(false) else bar.visibility = View.VISIBLE

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    customView != null -> web.webChromeClient?.onHideCustomView()
                    bar.visibility == View.VISIBLE && isTv && bar.hasFocus() -> showBar(false)
                    web.canGoBack() -> web.goBack()
                    else -> finish()
                }
            }
        })
    }

    // ---------- Barra ----------
    private fun pill(color: Int, stroke: Int = 0) = GradientDrawable().apply { cornerRadius = 60f; setColor(color); if (stroke != 0) setStroke(2, stroke) }

    private fun btn(label: String, onClick: () -> Unit): TextView = TextView(this).apply {
        text = label
        setTextColor(Color.WHITE)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
        typeface = Typeface.DEFAULT_BOLD
        gravity = Gravity.CENTER
        setPadding(30, 16, 30, 16)
        isFocusable = true; isClickable = true
        background = android.graphics.drawable.StateListDrawable().apply {
            addState(intArrayOf(android.R.attr.state_focused), pill(0xFFFF6900.toInt()))
            addState(intArrayOf(android.R.attr.state_pressed), pill(0xFFFF6900.toInt()))
            addState(intArrayOf(), pill(0x33FFFFFF))
        }
        setOnClickListener { onClick() }
        layoutParams = LinearLayout.LayoutParams(-2, -2).apply { setMargins(6, 0, 6, 0) }
    }

    private fun buildBar(): LinearLayout {
        val b = LinearLayout(this)
        b.orientation = LinearLayout.HORIZONTAL
        b.gravity = Gravity.CENTER_VERTICAL
        b.setPadding(18, 14, 18, 14)
        b.background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(0xF20D0C0B.toInt(), 0xCC0D0C0B.toInt()))
        b.addView(btn("✕") { finish() })
        b.addView(btn("◀") { if (web.canGoBack()) web.goBack() })
        b.addView(btn("▶") { if (web.canGoForward()) web.goForward() })
        b.addView(btn("⟳") { web.reload() })
        b.addView(btn("⌂") { showHome() })
        urlBox = EditText(this).apply {
            setSingleLine(true)
            hint = "Buscar o escribir dirección"
            setHintTextColor(0x99FFFFFF.toInt())
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setPadding(30, 14, 30, 14)
            inputType = InputType.TYPE_TEXT_VARIATION_URI
            imeOptions = EditorInfo.IME_ACTION_GO
            setSelectAllOnFocus(true)
            background = pill(0x22FFFFFF, 0x55FFFFFF)
            setOnEditorActionListener { v, _, _ ->
                web.loadUrl(fixUrl(v.text.toString()))
                (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(v.windowToken, 0)
                if (isTv) showBar(false)
                web.requestFocus(); true
            }
            layoutParams = LinearLayout.LayoutParams(0, -2, 1f).apply { setMargins(10, 0, 10, 0) }
        }
        b.addView(urlBox)
        b.addView(btn("★") { addBookmark() })
        shield = btn("Bloqueo") { toggleAdblock() }
        b.addView(shield)
        b.addView(btn("PC") { desktop = !desktop; prefs.edit().putBoolean("desktop", desktop).apply(); applyUserAgent(); web.reload(); toast(if (desktop) "Modo escritorio" else "Modo celular") })
        b.addView(btn("Cursor") { setCursor(!cursorOn); toast(if (cursorOn) "Cursor activado: muévelo con las flechas, OK hace clic" else "Cursor desactivado: las flechas desplazan la página") })
        updateShield()
        return b
    }

    private fun showBar(focus: Boolean) {
        bar.visibility = View.VISIBLE
        if (focus) urlBox.requestFocus()
    }

    private fun updateShield() {
        if (!::shield.isInitialized) return
        shield.text = if (adblock) "Bloqueo $blockedCount" else "Bloqueo no"
    }

    private fun toggleAdblock() {
        adblock = !adblock
        prefs.edit().putBoolean("adblock", adblock).apply()
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, !adblock)
        updateShield(); web.reload()
        toast(if (adblock) "Bloqueador de anuncios activado" else "Bloqueador de anuncios desactivado en todas las páginas")
    }

    private fun applyUserAgent() {
        val s = web.settings
        s.userAgentString = if (desktop)
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
        else null
    }

    private fun fixUrl(t: String): String {
        val q = t.trim()
        if (q.isEmpty()) return "https://www.google.com"
        if (Regex("^[a-z]+://", RegexOption.IGNORE_CASE).containsMatchIn(q)) return q
        if (!q.contains(' ') && Regex("^[\\w-]+(\\.[\\w-]+)+(:\\d+)?(/.*)?$").matches(q)) return "https://$q"
        return "https://www.google.com/search?q=" + Uri.encode(q)
    }

    // ---------- Inicio y favoritos ----------
    private fun bookmarks(): JSONArray = try { JSONArray(prefs.getString("bookmarks", "[]")) } catch (_: Exception) { JSONArray() }

    private fun addBookmark() {
        val url = web.url ?: return
        if (url.startsWith("data:")) return
        val arr = bookmarks()
        for (i in 0 until arr.length()) if (arr.optJSONObject(i)?.optString("u") == url) { toast("Ya está en favoritos"); return }
        arr.put(org.json.JSONObject().put("u", url).put("t", web.title ?: url))
        prefs.edit().putString("bookmarks", arr.toString()).apply()
        toast("Agregado a favoritos del navegador")
    }

    private fun esc(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

    private fun showHome() {
        val defaults = listOf(
            "Google" to "https://www.google.com", "YouTube" to "https://m.youtube.com", "Wikipedia" to "https://es.wikipedia.org",
            "Noticias" to "https://news.google.com/?hl=es-419&gl=CO&ceid=CO:es-419", "El Tiempo" to "https://www.eltiempo.com",
            "Fútbol" to "https://www.google.com/search?q=resultados+futbol", "Clima" to "https://www.google.com/search?q=clima",
            "Mapas" to "https://www.google.com/maps"
        )
        val bm = bookmarks()
        val tiles = StringBuilder()
        defaults.forEach { (t, u) -> tiles.append("<a class=t href=\"${esc(u)}\"><b>${esc(t.take(1))}</b><span>${esc(t)}</span></a>") }
        for (i in 0 until bm.length()) {
            val o = bm.optJSONObject(i) ?: continue
            val t = o.optString("t").ifBlank { o.optString("u") }
            tiles.append("<a class='t fav' href=\"${esc(o.optString("u"))}\"><b>★</b><span>${esc(t.take(28))}</span></a>")
        }
        val html = """<!doctype html><html><head><meta name=viewport content="width=device-width,initial-scale=1"><style>
            body{margin:0;background:radial-gradient(1200px 600px at 70% -10%,#5a2a00,#0D0C0B 60%);color:#F3EFEA;font-family:sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:7vh 24px;box-sizing:border-box}
            h1{font-size:34px;margin:0 0 6px}h1 i{color:#FF6900;font-style:normal}p{color:#A39C94;margin:0 0 26px}
            form{display:flex;width:min(760px,100%);gap:10px;margin-bottom:34px}
            input{flex:1;font-size:20px;padding:16px 22px;border-radius:40px;border:2px solid #444;background:#1b1916;color:#fff;outline:none}input:focus{border-color:#FF6900}
            button{font-size:18px;padding:0 26px;border-radius:40px;border:0;background:#FF6900;color:#0D0C0B;font-weight:800}
            .g{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px;width:min(900px,100%)}
            .t{display:flex;flex-direction:column;align-items:center;gap:10px;padding:18px 10px;border-radius:20px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:#fff;text-decoration:none;outline:none}
            .t:focus,.t:hover{background:#FF6900;color:#0D0C0B}.t b{width:54px;height:54px;border-radius:16px;background:rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center;font-size:24px}
            .t span{font-size:15px;text-align:center;overflow:hidden;text-overflow:ellipsis;max-width:100%;white-space:nowrap}
            small{color:#A39C94;margin-top:28px;text-align:center;max-width:640px;line-height:1.5}
            </style></head><body><h1>Mi<i>Vibra</i> · Navegador</h1><p>Con bloqueador de anuncios ${if (adblock) "activado" else "desactivado"}</p>
            <form action="https://www.google.com/search"><input name=q placeholder="Buscar en Google o escribir una dirección" autofocus><button>Buscar</button></form>
            <div class=g>$tiles</div>
            <small>${if (isTv) "Control remoto: flechas mueven el cursor y OK hace clic · MENÚ muestra la barra · Atrás vuelve" else "Toca ★ en la barra para guardar una página en esta pantalla"}</small></body></html>"""
        web.loadDataWithBaseURL("https://mivibra.home/", html, "text/html", "utf-8", null)
        urlBox.setText("")
    }

    // ---------- Cursor para control remoto ----------
    private fun setCursor(on: Boolean) {
        cursorOn = on
        cursor.visibility = if (on) View.VISIBLE else View.GONE
        if (on && cursor.px == 0f) { cursor.px = resources.displayMetrics.widthPixels / 2f; cursor.py = resources.displayMetrics.heightPixels / 2f }
        cursor.invalidate()
    }

    private fun click(down: Boolean) {
        val t = SystemClock.uptimeMillis()
        val loc = IntArray(2); web.getLocationOnScreen(loc)
        val x = cursor.px - loc[0]; val y = cursor.py - loc[1]
        if (down) web.evaluateJavascript(REMEMBER_FIELD, null)
        val ev = MotionEvent.obtain(t, t, if (down) MotionEvent.ACTION_DOWN else MotionEvent.ACTION_UP, x, y, 0)
        ev.source = android.view.InputDevice.SOURCE_TOUCHSCREEN
        web.dispatchTouchEvent(ev); ev.recycle()
        cursor.down = down; cursor.invalidate()
        if (!down) { web.postDelayed({ keyboardIfTyping(x, y) }, 250); web.postDelayed({ keyboardIfTyping(x, y) }, 900) }
    }

    /**
     * En TV el teclado del sistema casi nunca sale dentro de una página (Google, YouTube…).
     * Si lo que quedó elegido es un campo de texto, abrimos nuestra propia cajita de texto
     * (que sí saca el teclado y el dictado por voz) y luego escribimos lo que pongas en la página.
     */
    private var typing = false
    private val FIND_FIELD = "(function(){function deep(e){while(e&&e.shadowRoot&&e.shadowRoot.activeElement)e=e.shadowRoot.activeElement;" +
        "try{while(e&&e.tagName==='IFRAME'&&e.contentDocument&&e.contentDocument.activeElement){e=e.contentDocument.activeElement;while(e&&e.shadowRoot&&e.shadowRoot.activeElement)e=e.shadowRoot.activeElement}}catch(x){}return e}" +
        "var e=deep(document.activeElement);if(!e)return null;var t=(e.tagName||'').toUpperCase();var ok=e.isContentEditable||" +
        "(t==='TEXTAREA'&&!e.readOnly&&!e.disabled)||(t==='INPUT'&&!e.readOnly&&!e.disabled&&!/^(button|submit|reset|checkbox|radio|range|color|file|image|hidden)$/i.test(e.type||''));" +
        "if(!ok)return null;var at=__AT__;if(at){var h=document.elementFromPoint(at[0]*innerWidth,at[1]*innerHeight);var host=e.getRootNode&&e.getRootNode().host;" +
        "if(!(h&&(h.tagName==='IFRAME'||h===e||h.contains(e)||e.contains(h)||(host&&(host===h||host.contains(h)||h.contains(host)))))&&e===window.__mvPrev)return null}" +
        "window.__mvField=e;return JSON.stringify({v:e.isContentEditable?e.textContent:(e.value||''),p:e.placeholder||e.getAttribute('aria-label')||e.title||'',t:e.type||'',s:!!(e.form||e.closest('form'))||/search|buscar|q$/i.test((e.name||'')+(e.id||'')+(e.getAttribute('aria-label')||''))})})()"

    /** Guarda qué campo tenía el foco antes del clic: si después del clic hay otro campo enfocado, fue por el clic. */
    private val REMEMBER_FIELD = "(function(){function deep(e){while(e&&e.shadowRoot&&e.shadowRoot.activeElement)e=e.shadowRoot.activeElement;return e}" +
        "var e=deep(document.activeElement);var t=e&&(e.tagName||'').toUpperCase();window.__mvPrev=(e&&(e.isContentEditable||t==='INPUT'||t==='TEXTAREA'))?e:null})()"

    private fun keyboardIfTyping(x: Float = -1f, y: Float = -1f) {
        if (typing) return
        // Con el cursor: solo si el clic cayó sobre el campo (si no, un campo que quedó enfocado antes lo abriría a cada clic)
        val at = if (x < 0 || web.width == 0) "null" else "[${x / web.width},${y / web.height}]"   // fracción de la pantalla; en la página se pasa a píxeles CSS
        web.evaluateJavascript(FIND_FIELD.replace("__AT__", at)) { v ->
            if (v == null || v == "null" || typing) return@evaluateJavascript
            try {
                val o = org.json.JSONObject(org.json.JSONTokener(v).nextValue() as String)
                askText(o.optString("v"), o.optString("p"), o.optString("t"))
            } catch (_: Exception) {}
        }
    }

    /**
     * Cajita para escribir con teclado propio en pantalla (en muchas TV el teclado del sistema no sale):
     * letras, números, borrar, espacio, búsqueda por voz y Buscar. También funciona el teclado del sistema si aparece.
     */
    private var voiceTarget: EditText? = null
    private fun askText(current: String, hint: String, type: String) {
        typing = true
        val d = resources.displayMetrics.density
        fun dp(v: Int) = (v * d).toInt()
        val input = EditText(this).apply {
            setText(current); setSelection(text.length)
            this.hint = hint.ifBlank { "Escribe aquí" }
            setSingleLine(true); textSize = 20f
            inputType = when (type.lowercase()) {
                "password" -> InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
                "email" -> InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
                "number", "tel" -> InputType.TYPE_CLASS_NUMBER
                "url" -> InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
                else -> InputType.TYPE_CLASS_TEXT
            }
            imeOptions = EditorInfo.IME_ACTION_GO
            if (isTv) showSoftInputOnFocus = false     // en TV usamos el teclado de abajo
        }
        voiceTarget = input
        var dlg: android.app.AlertDialog? = null
        var upper = false
        fun send(go: Boolean) { fillField(input.text.toString(), go); dlg?.dismiss() }
        fun type(t: String) { val st = input.selectionStart.coerceAtLeast(0); input.text.insert(st, t) }
        fun back() { val st = input.selectionStart; if (st > 0) input.text.delete(st - 1, st) }

        val keys = ArrayList<TextView>()
        fun key(label: String, weight: Float = 1f, onClick: () -> Unit) = TextView(this).apply {
            text = label; gravity = Gravity.CENTER; textSize = 18f; setTextColor(Color.WHITE)
            isFocusable = true; isClickable = true
            background = android.graphics.drawable.StateListDrawable().apply {
                addState(intArrayOf(android.R.attr.state_focused), GradientDrawable().apply { cornerRadius = dp(8).toFloat(); setColor(0xFFFF6900.toInt()) })
                addState(intArrayOf(), GradientDrawable().apply { cornerRadius = dp(8).toFloat(); setColor(0x33FFFFFF) })
            }
            layoutParams = LinearLayout.LayoutParams(0, dp(44), weight).apply { setMargins(dp(3), dp(3), dp(3), dp(3)) }
            setOnClickListener { onClick() }
        }
        val grid = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(0, dp(8), 0, 0) }
        val letterRows = listOf("1234567890", "qwertyuiop", "asdfghjklñ", "zxcvbnm.-_", "@/:?&=#.com")
        for (row in letterRows) {
            val line = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            val items = if (row == "@/:?&=#.com") listOf("@", "/", ":", "?", "&", "=", "#", ".com") else row.map { it.toString() }
            for (ch in items) {
                val k = key(ch) { type(if (upper && ch.length == 1) ch.uppercase() else ch) }
                if (ch.length == 1 && ch[0].isLetter()) keys.add(k)
                line.addView(k)
            }
            grid.addView(line)
        }
        val last = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        last.addView(key("⇧", 1.2f) { upper = !upper; keys.forEach { k -> k.text = if (upper) k.text.toString().uppercase() else k.text.toString().lowercase() } })
        last.addView(key("Espacio", 3f) { type(" ") })
        last.addView(key("⌫ Borrar", 1.6f) { back() })
        last.addView(key("🎤 Voz", 1.4f) { voiceInput() })
        last.addView(key("Buscar ↵", 1.8f) { send(true) })
        grid.addView(last)

        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setPadding(dp(20), dp(8), dp(20), dp(4))
            addView(input); addView(grid)
        }
        dlg = android.app.AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle(if (hint.isBlank()) "Escribir" else hint)
            .setView(box)
            .setNeutralButton("Solo escribir") { _, _ -> send(false) }
            .setNegativeButton("Cancelar", null)
            .create()
        input.setOnEditorActionListener { _, _, _ -> send(true); true }
        dlg.setOnDismissListener { typing = false; voiceTarget = null; web.requestFocus() }
        dlg.window?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN)
        dlg.show()
        dlg.window?.setLayout((resources.displayMetrics.widthPixels * 0.72).toInt(), WindowManager.LayoutParams.WRAP_CONTENT)
        // En TV el foco empieza en el teclado (letra "q"); en celular, en el campo con su teclado normal
        if (isTv) grid.post { (grid.getChildAt(1) as? LinearLayout)?.getChildAt(0)?.requestFocus() }
        else input.post {
            input.requestFocus()
            (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).showSoftInput(input, InputMethodManager.SHOW_IMPLICIT)
        }
    }

    private var pendingMic: android.webkit.PermissionRequest? = null

    @Deprecated("Deprecated in Java")
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        @Suppress("DEPRECATION") super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 7302) {
            val r = pendingMic ?: return; pendingMic = null
            if (grantResults.firstOrNull() == android.content.pm.PackageManager.PERMISSION_GRANTED) r.grant(arrayOf(android.webkit.PermissionRequest.RESOURCE_AUDIO_CAPTURE))
            else { r.deny(); toast("Sin permiso de micrófono no se puede buscar por voz") }
        }
    }

    /** Dictado por voz para la cajita de texto */
    private fun voiceInput() {
        val i = Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL, android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE, "es-CO")
        try { @Suppress("DEPRECATION") startActivityForResult(i, 7301) } catch (_: Exception) { toast("Este TV no tiene dictado por voz") }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION") super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 7301 && resultCode == RESULT_OK) {
            val t = data?.getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS)?.firstOrNull() ?: return
            voiceTarget?.let { it.setText(t); it.setSelection(t.length) }
        }
    }

    /** Pone el texto en el campo de la página como si se hubiera escrito (sirve con Google, YouTube y páginas React). */
    private fun fillField(text: String, go: Boolean) {
        val q = org.json.JSONObject.quote(text)
        val js = "(function(){var e=window.__mvField;if(!e)return;try{e.focus()}catch(x){}var v=$q;" +
            "if(e.isContentEditable){e.textContent=v}else{var pr=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;" +
            "var d=Object.getOwnPropertyDescriptor(pr,'value');if(d&&d.set)d.set.call(e,v);else e.value=v}" +
            "e.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,data:v,inputType:'insertText'}));e.dispatchEvent(new Event('change',{bubbles:true}));" +
            (if (go) "setTimeout(function(){var f=e.form||(e.closest&&e.closest('form'));if(f){try{f.requestSubmit?f.requestSubmit():f.submit();return}catch(x){}}" +
                "var o={key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true,composed:true};e.dispatchEvent(new KeyboardEvent('keydown',o));e.dispatchEvent(new KeyboardEvent('keypress',o));e.dispatchEvent(new KeyboardEvent('keyup',o))},150);" else "") +
            "})()"
        web.evaluateJavascript(js, null)
    }

    override fun dispatchKeyEvent(e: KeyEvent): Boolean {
        val k = e.keyCode
        if (k == KeyEvent.KEYCODE_MENU || k == KeyEvent.KEYCODE_BUTTON_Y) {
            if (e.action == KeyEvent.ACTION_UP) { if (bar.visibility == View.VISIBLE && bar.hasFocus()) { showBar(false); web.requestFocus() } else showBar(true) }
            return true
        }
        val barFocused = bar.visibility == View.VISIBLE && bar.hasFocus()
        if (cursorOn && customView == null && !barFocused) {
            val step = (14 + e.repeatCount * 6).coerceAtMost(70).toFloat()
            val w = root.width.toFloat(); val h = root.height.toFloat(); val edge = 60f
            when (k) {
                KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN -> {
                    if (e.action == KeyEvent.ACTION_DOWN) {
                        when (k) {
                            KeyEvent.KEYCODE_DPAD_LEFT -> { cursor.px -= step; if (cursor.px < edge) web.scrollBy(-step.toInt(), 0) }
                            KeyEvent.KEYCODE_DPAD_RIGHT -> { cursor.px += step; if (cursor.px > w - edge) web.scrollBy(step.toInt(), 0) }
                            KeyEvent.KEYCODE_DPAD_UP -> {
                                cursor.py -= step
                                if (cursor.py < edge) { if (web.scrollY <= 0 && bar.visibility != View.VISIBLE) showBar(false); web.scrollBy(0, -(step * 2).toInt()) }
                            }
                            KeyEvent.KEYCODE_DPAD_DOWN -> { cursor.py += step; if (cursor.py > h - edge) web.scrollBy(0, (step * 2).toInt()) }
                        }
                        cursor.px = cursor.px.coerceIn(0f, w); cursor.py = cursor.py.coerceIn(0f, h)
                        if (isTv && bar.visibility == View.VISIBLE && cursor.py > bar.height + 40) bar.visibility = View.GONE
                        cursor.invalidate()
                    }
                    return true
                }
                KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_BUTTON_A -> {
                    if (e.action == KeyEvent.ACTION_DOWN && e.repeatCount == 0) click(true)
                    if (e.action == KeyEvent.ACTION_UP) click(false)
                    return true
                }
                KeyEvent.KEYCODE_CHANNEL_UP, KeyEvent.KEYCODE_PAGE_UP -> { if (e.action == KeyEvent.ACTION_DOWN) web.pageUp(false); return true }
                KeyEvent.KEYCODE_CHANNEL_DOWN, KeyEvent.KEYCODE_PAGE_DOWN -> { if (e.action == KeyEvent.ACTION_DOWN) web.pageDown(false); return true }
            }
        }
        // Sin cursor (moviéndose por los enlaces): OK sobre un campo de texto también abre el teclado
        if (!cursorOn && customView == null && e.action == KeyEvent.ACTION_UP &&
            (e.keyCode == KeyEvent.KEYCODE_DPAD_CENTER || e.keyCode == KeyEvent.KEYCODE_ENTER) && web.hasFocus()) {
            val r = super.dispatchKeyEvent(e)
            web.postDelayed({ keyboardIfTyping() }, 200)
            return r
        }
        return super.dispatchKeyEvent(e)
    }

    private fun toast(t: String) = Toast.makeText(this, t, Toast.LENGTH_SHORT).show()

    private fun hideBars() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val c = WindowInsetsControllerCompat(window, window.decorView)
        c.hide(WindowInsetsCompat.Type.systemBars())
        c.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    override fun onResume() { super.onResume(); web.onResume(); hideBars() }
    override fun onPause() { web.onPause(); CookieManager.getInstance().flush(); super.onPause() }
    override fun onDestroy() { (web.parent as? ViewGroup)?.removeView(web); web.destroy(); super.onDestroy() }

    /** Puntero en pantalla (solo se dibuja, no recibe toques). */
    class CursorView(ctx: Context) : View(ctx) {
        var px = 0f
        var py = 0f
        var down = false
        private val p = Paint(Paint.ANTI_ALIAS_FLAG)
        init { isFocusable = false; isClickable = false }
        override fun onTouchEvent(event: MotionEvent?) = false
        override fun onDraw(c: Canvas) {
            val r = if (down) 14f else 18f
            p.style = Paint.Style.FILL; p.color = if (down) 0xFFFF6900.toInt() else 0xCCFFFFFF.toInt()
            c.drawCircle(px, py, r, p)
            p.style = Paint.Style.STROKE; p.strokeWidth = 4f; p.color = 0xFF0D0C0B.toInt()
            c.drawCircle(px, py, r, p)
            p.color = 0xFFFF6900.toInt(); p.strokeWidth = 3f
            c.drawCircle(px, py, r + 6f, p)
        }
    }
}

/** Bloqueador: servidores de anuncios, ventanas emergentes y rastreadores más comunes. */
object AdBlock {
    private val hosts = hashSetOf(
        "doubleclick.net", "googlesyndication.com", "googleadservices.com", "google-analytics.com", "googletagmanager.com", "googletagservices.com",
        "adservice.google.com", "pagead2.googlesyndication.com", "imasdk.googleapis.com", "2mdn.net", "admob.com", "app-measurement.com",
        "adnxs.com", "adsrvr.org", "advertising.com", "taboola.com", "outbrain.com", "criteo.com", "criteo.net", "pubmatic.com", "rubiconproject.com",
        "openx.net", "casalemedia.com", "smartadserver.com", "amazon-adsystem.com", "adsafeprotected.com", "moatads.com", "scorecardresearch.com",
        "quantserve.com", "zedo.com", "yieldmo.com", "media.net", "bidswitch.net", "sharethrough.com", "teads.tv", "spotxchange.com", "springserve.com",
        "propellerads.com", "popads.net", "popcash.net", "popmyads.com", "adsterra.com", "exoclick.com", "exosrv.com", "juicyads.com", "trafficjunky.net",
        "hilltopads.net", "clickadu.com", "adcash.com", "mgid.com", "revcontent.com", "onclickads.net", "onclkds.com", "a-ads.com", "coinzilla.com",
        "bidvertiser.com", "adf.ly", "shorte.st", "admaven.com", "ad-maven.com", "galaksion.com", "monetag.com", "highperformanceformat.com",
        "profitablegatecpm.com", "effectivegatecpm.com", "realsrv.com", "tsyndicate.com", "adskeeper.com", "adskeeper.co.uk", "richpush.co", "pushame.com",
        "facebook.net", "connect.facebook.net", "analytics.tiktok.com", "ads.tiktok.com", "hotjar.com", "mixpanel.com", "segment.io", "amplitude.com",
        "yandex.ru/ads", "mc.yandex.ru", "an.yandex.ru", "adform.net", "serving-sys.com", "flashtalking.com", "innovid.com", "sizmek.com", "lijit.com",
        "33across.com", "indexww.com", "contextweb.com", "districtm.io", "gumgum.com", "undertone.com", "zemanta.com", "adroll.com", "perfectaudience.com",
        "crwdcntrl.net", "bluekai.com", "demdex.net", "everesttech.net", "rlcdn.com", "agkn.com", "tapad.com", "adition.com", "ligatus.com",
        "doubleverify.com", "ad.atdmt.com", "atdmt.com", "ads.yahoo.com", "advertising.yahoo.com", "adtech.de", "adtechus.com", "unrulymedia.com",
        "vidazoo.com", "primis.tech", "connatix.com", "aniview.com", "ads.pubmatic.com", "securepubads.g.doubleclick.net", "adclick.g.doubleclick.net"
    )

    /** Enlaces típicos de redes de anuncios que secuestran los clics (Adsterra, PropellerAds, Monetag, PopCash…). */
    private val redirectQuery = Regex("[?&](key=[0-9a-f]{20,}|zoneid=\\d+|zone_id=\\d+|z=\\d{5,}|var=\\d{6,}|clickid=|cid=[0-9a-f]{16,}|subid=|campaign_id=)", RegexOption.IGNORE_CASE)
    private val redirectPath = Regex("/(afu|pu|go|click|redirect|out|tds|pop|smartlink|jump)\\.php|/smartlink/|/4/\\d{6,}", RegexOption.IGNORE_CASE)
    fun isAdRedirect(u: android.net.Uri, from: String?): Boolean {
        val host = (u.host ?: "").lowercase()
        if (host.isBlank()) return false
        val q = "?" + (u.encodedQuery ?: "")
        val path = u.encodedPath ?: ""
        // Dominio de palabras al azar + ruta corta aleatoria + clave larga: "offspringthisscarcely.com/c6q2rq2qxx?key=…"
        val randomPath = Regex("^/[a-z0-9]{8,14}/?$", RegexOption.IGNORE_CASE).matches(path)
        if (redirectQuery.containsMatchIn(q) && (randomPath || redirectPath.containsMatchIn(path))) return true
        if (redirectPath.containsMatchIn(path) && redirectQuery.containsMatchIn(q)) return true
        if (randomPath && Regex("[?&]key=[0-9a-f]{24,}", RegexOption.IGNORE_CASE).containsMatchIn(q)) return true
        return false
    }

    fun blocks(host: String?): Boolean {
        if (host.isNullOrBlank()) return false
        var h = host.lowercase()
        while (true) {
            if (hosts.contains(h)) return true
            val i = h.indexOf('.')
            if (i < 0 || h.indexOf('.', i + 1) < 0) return false
            h = h.substring(i + 1)
        }
    }

    /** Oculta los recuadros de anuncios que quedan vacíos en la página. */
    const val COSMETIC = """(function(){try{var css='ins.adsbygoogle,[id^="google_ads"],[id^="div-gpt-ad"],[class*="ad-container"],[class*="adContainer"],[class*="ad-slot"],[class*="adslot"],[class*="banner-ad"],[class*="advert"],[aria-label="Advertisement"],[data-ad-slot],iframe[src*="doubleclick"],iframe[src*="googlesyndication"]{display:none!important}';var s=document.createElement('style');s.textContent=css;(document.head||document.documentElement).appendChild(s);}catch(e){}})();"""
}
