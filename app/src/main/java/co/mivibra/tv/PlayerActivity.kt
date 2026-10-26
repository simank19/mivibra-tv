package co.mivibra.tv

import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.annotation.OptIn
import androidx.activity.OnBackPressedCallback
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import org.json.JSONArray
import org.json.JSONObject

/**
 * Reproductor nativo a pantalla completa (ExoPlayer): HLS, DASH, MPEG-TS, MP4,
 * pistas de audio, subtítulos, cambio de canal con arriba/abajo y retomar donde ibas.
 */
@OptIn(UnstableApi::class)
class PlayerActivity : ComponentActivity() {

    companion object {
        /** El pedido llega por aquí para no pasar listas enormes por el Intent. */
        @Volatile var pendingRequest: String? = null
    }

    private lateinit var view: PlayerView
    private lateinit var info: TextView
    private lateinit var errorView: TextView
    private var player: ExoPlayer? = null
    private val ui = Handler(Looper.getMainLooper())

    private var queue = JSONArray()
    private var index = 0
    private var live = false
    private var resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
    private var audioLang = "es"
    private var subLang = ""
    private var retries = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemBars()

        val req = try { JSONObject(pendingRequest ?: "{}") } catch (_: Exception) { JSONObject() }
        pendingRequest = null
        queue = req.optJSONArray("queue") ?: JSONArray().put(req)
        index = req.optInt("index", 0).coerceIn(0, maxOf(0, queue.length() - 1))
        live = req.optBoolean("live", false)
        audioLang = req.optString("audioLang", "es")
        subLang = req.optString("subLang", "")

        val root = FrameLayout(this)
        root.setBackgroundColor(Color.BLACK)
        view = PlayerView(this)
        view.setShowSubtitleButton(true)
        view.setShowNextButton(queue.length() > 1)
        view.setShowPreviousButton(queue.length() > 1)
        view.controllerAutoShow = true
        view.setKeepContentOnPlayerReset(true)
        root.addView(view, FrameLayout.LayoutParams(-1, -1))

        info = TextView(this).apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
            typeface = Typeface.DEFAULT_BOLD
            setPadding(36, 22, 36, 22)
            background = android.graphics.drawable.GradientDrawable().apply {
                cornerRadius = 40f
                setColor(0xB30D0C0B.toInt())
                setStroke(2, 0x55FF6900)
            }
            visibility = View.GONE
        }
        root.addView(info, FrameLayout.LayoutParams(-2, -2, Gravity.TOP or Gravity.START).apply { setMargins(48, 40, 48, 0) })

        errorView = TextView(this).apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            gravity = Gravity.CENTER
            setPadding(60, 40, 60, 40)
            visibility = View.GONE
        }
        root.addView(errorView, FrameLayout.LayoutParams(-1, -2, Gravity.CENTER))
        setContentView(root)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = finishWithResult()
        })

        createPlayer()
        playIndex(index, req.optLong("startMs", 0))
    }

    private fun current(): JSONObject = queue.optJSONObject(index) ?: JSONObject()

    private lateinit var http: DefaultHttpDataSource.Factory

    /** Formas de abrir un canal: la URL tal cual, forzando HLS, con otro User-Agent, .ts/.m3u8 y señales alternativas. */
    private data class Attempt(val url: String, val forceHls: Boolean, val ua: String?)
    private var attempts = listOf<Attempt>()
    private var attemptIndex = 0
    private var startPosition = 0L

    private val vlcUa = "VLC/3.0.20 LibVLC/3.0.20"

    private fun createPlayer() {
        val first = current()
        http = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15000)
            .setReadTimeoutMs(20000)
            .setUserAgent(first.optString("ua").ifBlank { Net.UA })
        val referer = first.optString("ref")
        if (referer.isNotBlank()) http.setDefaultRequestProperties(mapOf("Referer" to referer))

        // FFmpeg primero para el audio: AC3/E-AC3/MP2/DTS suenan aunque el equipo no los soporte
        val renderers = DefaultRenderersFactory(this)
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER)
            .setEnableDecoderFallback(true)

        val p = ExoPlayer.Builder(this, renderers)
            .setMediaSourceFactory(DefaultMediaSourceFactory(this).setDataSourceFactory(http))
            .build()
        p.trackSelectionParameters = p.trackSelectionParameters.buildUpon()
            .setPreferredAudioLanguage(audioLang)
            .apply {
                if (subLang.isNotBlank()) setPreferredTextLanguage(subLang).setSelectUndeterminedTextLanguage(true)
            }
            .build()
        p.addListener(object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                if (error.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {
                    p.seekToDefaultPosition(); p.prepare(); return
                }
                val transient = error.errorCode == PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT ||
                    error.errorCode == PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED
                if (transient && retries < 1) {
                    retries++
                    ui.postDelayed({ p.prepare(); p.play() }, 1500)
                    return
                }
                if (attemptIndex < attempts.size - 1) {
                    attemptIndex++
                    retries = 0
                    info.text = "Probando otra forma de abrir el canal… (" + (attemptIndex + 1) + "/" + attempts.size + ")"
                    info.visibility = View.VISIBLE
                    info.alpha = 1f
                    startAttempt()
                    return
                }
                errorView.text = "No se pudo reproducir este contenido.\n" +
                    (if (live) "El canal puede estar caído o bloqueado en tu país. Prueba otro con ▲ ▼." else "Vuelve atrás e intenta de nuevo.")
                errorView.visibility = View.VISIBLE
            }

            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_READY) {
                    retries = 0
                    errorView.visibility = View.GONE
                }
                if (state == Player.STATE_ENDED && !live) {
                    if (index < queue.length() - 1) playIndex(index + 1, 0) else finishWithResult()
                }
            }
        })
        view.player = p
        player = p
    }

    private fun buildAttempts(item: JSONObject): List<Attempt> {
        val url = item.optString("url")
        val ua = item.optString("ua").ifBlank { null }
        val urls = mutableListOf(url)
        val lower = url.lowercase().substringBefore('?')
        // Xtream: el mismo canal suele existir en .m3u8 y en .ts
        if (lower.contains("/live/")) {
            if (lower.endsWith(".m3u8")) urls.add(url.replaceFirst(Regex("\\.m3u8", RegexOption.IGNORE_CASE), ".ts"))
            else if (lower.endsWith(".ts")) urls.add(url.replaceFirst(Regex("\\.ts", RegexOption.IGNORE_CASE), ".m3u8"))
        }
        val alts = item.optJSONArray("alts")
        if (alts != null) for (i in 0 until alts.length()) alts.optString(i).takeIf { it.isNotBlank() }?.let { urls.add(it) }
        val out = mutableListOf<Attempt>()
        for (u in urls.distinct()) {
            val isHls = u.lowercase().substringBefore('?').let { it.endsWith(".m3u8") || it.contains("/hls/") }
            out.add(Attempt(u, isHls, ua))
            if (!isHls && live) out.add(Attempt(u, true, ua))     // HLS sin extensión .m3u8
            out.add(Attempt(u, isHls, vlcUa))                      // servidores que solo aceptan reproductores conocidos
        }
        return out.take(10)
    }

    private fun startAttempt() {
        val p = player ?: return
        val item = current()
        val at = attempts.getOrNull(attemptIndex) ?: return
        http.setUserAgent(at.ua ?: Net.UA)
        val b = MediaItem.Builder().setUri(Uri.parse(at.url)).setMediaId(item.optString("id", at.url))
        val lower = at.url.lowercase().substringBefore('?')
        when {
            at.forceHls -> b.setMimeType(MimeTypes.APPLICATION_M3U8)
            lower.endsWith(".mpd") -> b.setMimeType(MimeTypes.APPLICATION_MPD)
        }
        val sub = item.optString("sub")
        if (sub.isNotBlank()) {
            val mime = if (sub.lowercase().endsWith(".vtt")) MimeTypes.TEXT_VTT else MimeTypes.APPLICATION_SUBRIP
            b.setSubtitleConfigurations(
                listOf(
                    MediaItem.SubtitleConfiguration.Builder(Uri.parse(sub))
                        .setMimeType(mime)
                        .setLanguage(subLang.ifBlank { "es" })
                        .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
                        .build()
                )
            )
        }
        errorView.visibility = View.GONE
        p.setMediaItem(b.build(), if (startPosition > 0) startPosition else C.TIME_UNSET)
        p.prepare()
        p.play()
    }

    private fun playIndex(i: Int, startMs: Long) {
        index = (i + queue.length()) % maxOf(1, queue.length())
        val item = current()
        if (item.optString("url").isBlank()) return
        val ref = item.optString("ref")
        http.setDefaultRequestProperties(if (ref.isNotBlank()) mapOf("Referer" to ref) else emptyMap())
        attempts = buildAttempts(item)
        attemptIndex = 0
        retries = 0
        startPosition = startMs
        startAttempt()
        showInfo(item)
    }

    private fun showInfo(item: JSONObject) {
        val num = item.optString("num")
        val title = item.optString("title")
        val sub = item.optString("subtitle")
        info.text = buildString {
            if (num.isNotBlank()) append(num).append("  ·  ")
            append(title)
            if (sub.isNotBlank()) append("\n").append(sub)
        }
        info.visibility = View.VISIBLE
        info.alpha = 0f
        info.animate().alpha(1f).setDuration(250).start()
        ui.removeCallbacksAndMessages("info")
        ui.postAtTime({ info.animate().alpha(0f).setDuration(400).withEndAction { info.visibility = View.GONE }.start() }, "info", android.os.SystemClock.uptimeMillis() + 4000)
    }

    private fun zap(delta: Int) {
        if (queue.length() < 2) return
        playIndex(index + delta, 0)
    }

    private fun cycleResize() {
        resizeMode = when (resizeMode) {
            AspectRatioFrameLayout.RESIZE_MODE_FIT -> AspectRatioFrameLayout.RESIZE_MODE_ZOOM
            AspectRatioFrameLayout.RESIZE_MODE_ZOOM -> AspectRatioFrameLayout.RESIZE_MODE_FILL
            else -> AspectRatioFrameLayout.RESIZE_MODE_FIT
        }
        view.resizeMode = resizeMode
        val label = when (resizeMode) {
            AspectRatioFrameLayout.RESIZE_MODE_ZOOM -> "Ajustar: Recortar"
            AspectRatioFrameLayout.RESIZE_MODE_FILL -> "Ajustar: Estirar"
            else -> "Ajustar: Original"
        }
        info.text = label
        info.visibility = View.VISIBLE
        info.alpha = 1f
        ui.postDelayed({ info.visibility = View.GONE }, 1500)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val controllerVisible = view.isControllerFullyVisible
        if (event.action == KeyEvent.ACTION_DOWN) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_CHANNEL_UP, KeyEvent.KEYCODE_PAGE_UP -> { zap(-1); return true }
                KeyEvent.KEYCODE_CHANNEL_DOWN, KeyEvent.KEYCODE_PAGE_DOWN -> { zap(1); return true }
                KeyEvent.KEYCODE_DPAD_UP -> if (live && !controllerVisible) { zap(-1); return true }
                KeyEvent.KEYCODE_DPAD_DOWN -> if (live && !controllerVisible) { zap(1); return true }
                KeyEvent.KEYCODE_BUTTON_Y, KeyEvent.KEYCODE_MENU -> { cycleResize(); return true }
                KeyEvent.KEYCODE_BUTTON_B, KeyEvent.KEYCODE_ESCAPE -> { finishWithResult(); return true }
                KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_BUTTON_A -> if (!controllerVisible) {
                    player?.let { if (it.isPlaying) it.pause() else it.play() }
                    view.showController()
                    return true
                }
            }
        }
        return super.dispatchKeyEvent(event)
    }

    private fun finishWithResult() {
        val p = player
        val item = current()
        val result = JSONObject()
            .put("id", item.optString("id"))
            .put("url", item.optString("url"))
            .put("index", index)
            .put("position", p?.currentPosition ?: 0)
            .put("duration", p?.duration?.takeIf { it > 0 } ?: 0)
            .put("live", live)
        setResult(RESULT_OK, Intent().putExtra("result", result.toString()))
        finish()
    }

    private fun hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val c = WindowInsetsControllerCompat(window, window.decorView)
        c.hide(WindowInsetsCompat.Type.systemBars())
        c.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    override fun onResume() {
        super.onResume()
        RemoteHub.setCurrent(this)
        hideSystemBars()
    }

    override fun onStop() {
        super.onStop()
        if (Build.VERSION.SDK_INT >= 24 && isInPictureInPictureMode) return
        player?.pause()
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (Build.VERSION.SDK_INT >= 26 && player?.isPlaying == true && !packageManager.hasSystemFeature("android.software.leanback")) {
            try { enterPictureInPictureMode(android.app.PictureInPictureParams.Builder().build()) } catch (_: Exception) {}
        }
    }

    override fun onDestroy() {
        ui.removeCallbacksAndMessages(null)
        player?.release()
        player = null
        super.onDestroy()
    }
}
