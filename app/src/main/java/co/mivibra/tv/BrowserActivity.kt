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
        s.setSupportMultipleWindows(false)          // sin ventanas emergentes
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
                    if (adblock && AdBlock.blocks(u.host) && request.isForMainFrame && !request.isRedirect) { blockedCount++; updateShield(); return true }
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

            override fun onPageFinished(view: WebView, url: String?) {
                if (adblock) view.evaluateJavascript(AdBlock.COSMETIC, null)
            }
        }
        web.webChromeClient = object : WebChromeClient() {
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
        shield = btn("🛡") { toggleAdblock() }
        b.addView(shield)
        b.addView(btn("🖥") { desktop = !desktop; prefs.edit().putBoolean("desktop", desktop).apply(); applyUserAgent(); web.reload(); toast(if (desktop) "Modo escritorio" else "Modo celular") })
        b.addView(btn("🖱") { setCursor(!cursorOn); toast(if (cursorOn) "Cursor activado: muévelo con las flechas, OK hace clic" else "Cursor desactivado: las flechas desplazan la página") })
        updateShield()
        return b
    }

    private fun showBar(focus: Boolean) {
        bar.visibility = View.VISIBLE
        if (focus) urlBox.requestFocus()
    }

    private fun updateShield() {
        if (!::shield.isInitialized) return
        shield.text = if (adblock) "🛡 $blockedCount" else "🛡 off"
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
        val ev = MotionEvent.obtain(t, t, if (down) MotionEvent.ACTION_DOWN else MotionEvent.ACTION_UP, x, y, 0)
        ev.source = android.view.InputDevice.SOURCE_TOUCHSCREEN
        web.dispatchTouchEvent(ev); ev.recycle()
        cursor.pressed = down; cursor.invalidate()
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
        var pressed = false
        private val p = Paint(Paint.ANTI_ALIAS_FLAG)
        init { isFocusable = false; isClickable = false }
        override fun onTouchEvent(event: MotionEvent?) = false
        override fun onDraw(c: Canvas) {
            val r = if (pressed) 14f else 18f
            p.style = Paint.Style.FILL; p.color = if (pressed) 0xFFFF6900.toInt() else 0xCCFFFFFF.toInt()
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
