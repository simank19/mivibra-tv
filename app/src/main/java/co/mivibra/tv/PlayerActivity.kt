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
import androidx.media3.ui.SubtitleView
import androidx.media3.ui.CaptionStyleCompat
import androidx.media3.common.TrackSelectionOverride
import android.app.AlertDialog
import java.util.Locale
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
        /** Solo un reproductor a la vez: si hay uno en la ventana flotante, se cierra al abrir otro. */
        private var active: java.lang.ref.WeakReference<PlayerActivity>? = null
    }
    private var replacedBy = false
    private var session: androidx.media3.session.MediaSession? = null
    private var panel: ChannelPanel? = null
    private val favToggles = linkedSetOf<String>()   // ids cuyo favorito cambió aquí (la app lo guarda al cerrar)
    private var panelOpen = false
    private lateinit var root: FrameLayout
    private val hidePanel = Runnable { closePanel() }

    private lateinit var view: PlayerView
    private lateinit var tracksBtn: TextView
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

        active?.get()?.let { old -> if (old !== this && !old.isFinishing) { old.replacedBy = true; old.player?.pause(); old.finishWithResult() } }
        active = java.lang.ref.WeakReference(this)

        val req = try { JSONObject(pendingRequest ?: "{}") } catch (_: Exception) { JSONObject() }
        pendingRequest = null
        queue = req.optJSONArray("queue") ?: JSONArray().put(req)
        index = req.optInt("index", 0).coerceIn(0, maxOf(0, queue.length() - 1))
        live = req.optBoolean("live", false)
        audioLang = req.optString("audioLang", "es")
        subLang = req.optString("subLang", "")
        subKey = req.optString("subKey", "")

        root = FrameLayout(this)
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

        // Botón "Audio y subtítulos": aparece con los controles; en el control remoto también con MENÚ
        tracksBtn = TextView(this).apply {
            text = "Audio y subtítulos"
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            typeface = Typeface.DEFAULT_BOLD
            setPadding(34, 20, 34, 20)
            isFocusable = true
            isClickable = true
            background = android.graphics.drawable.StateListDrawable().apply {
                addState(intArrayOf(android.R.attr.state_focused), android.graphics.drawable.GradientDrawable().apply { cornerRadius = 50f; setColor(0xFFFF6900.toInt()) })
                addState(intArrayOf(), android.graphics.drawable.GradientDrawable().apply { cornerRadius = 50f; setColor(0xB30D0C0B.toInt()); setStroke(2, 0x55FFFFFF) })
            }
            setOnClickListener { showTracks() }
            visibility = View.GONE
        }

        // Los botones ⚙ y CC de la barra de controles abren el mismo menú de audio y subtítulos
        listOf(androidx.media3.ui.R.id.exo_settings, androidx.media3.ui.R.id.exo_subtitle).forEach { id ->
            view.findViewById<View>(id)?.setOnClickListener { showTracks() }
        }
        view.setShowSubtitleButton(true)
        arrangeControls()
        setupPanel(req)
        if (panel == null) compactControls()
        if (!live && queue.length() > 1) ui.postDelayed(nextTick, 1000)
        applySubtitleStyle()
        setContentView(root)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            // Atrás: primero esconde los controles; con los controles ocultos, sale del reproductor
            override fun handleOnBackPressed() {
                if (panelOpen && !portraitPanel()) closePanel()
                else if (view.isControllerFullyVisible) view.hideController() else finishWithResult()
            }
        })

        createPlayer()
        playIndex(index, req.optLong("startMs", 0))
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    /**
     * Controles estilo YouTube (diseño en res/layout/exo_player_control_view.xml): barra de progreso naranja,
     * botones abajo, botón grande al centro en pausa, se ocultan rápido y botón +1:30 para saltar openings.
     */
    @OptIn(UnstableApi::class)
    private fun arrangeControls() {
        view.controllerShowTimeoutMs = 2500
        // TV: margen de seguridad (muchos televisores recortan los bordes de la imagen)
        if (packageManager.hasSystemFeature("android.software.leanback")) {
            view.findViewById<View>(androidx.media3.ui.R.id.exo_controller)?.setPadding(dp(40), dp(18), dp(40), dp(22))
        }
        (view.findViewById<View>(androidx.media3.ui.R.id.exo_progress) as? androidx.media3.ui.DefaultTimeBar)?.apply {
            setPlayedColor(0xFFFF6900.toInt())
            setScrubberColor(0xFFFF6900.toInt())
            setBufferedColor(0x66FFFFFF)
            setUnplayedColor(0x33FFFFFF)
        }
        view.findViewById<View>(R.id.mv_center_play)?.setOnClickListener { player?.play() }
        // Favorito del canal o video actual
        view.findViewById<android.widget.ImageButton>(R.id.mv_fav)?.setOnClickListener { toggleFav() }
        // Silenciar / quitar silencio
        view.findViewById<android.widget.ImageButton>(R.id.mv_mute)?.let { b ->
            b.setOnClickListener {
                val p = player ?: return@setOnClickListener
                val muted = p.volume > 0f
                p.volume = if (muted) 0f else 1f
                b.setImageResource(if (muted) R.drawable.mv_vol_off else R.drawable.mv_vol_on)
                b.contentDescription = if (muted) "Quitar silencio" else "Silenciar"
                view.showController()
            }
        }

        val left = view.findViewById<android.widget.LinearLayout>(R.id.mv_left) ?: return
        if (live) return
        val skip = TextView(this).apply {
            text = "+1:30"
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setPadding(dp(14), dp(6), dp(14), dp(6))
            isFocusable = true
            isClickable = true
            contentDescription = "Adelantar 1 minuto 30 segundos"
            background = android.graphics.drawable.StateListDrawable().apply {
                addState(intArrayOf(android.R.attr.state_focused), android.graphics.drawable.GradientDrawable().apply { cornerRadius = dp(20).toFloat(); setColor(0xFFFF6900.toInt()) })
                addState(intArrayOf(), android.graphics.drawable.GradientDrawable().apply { cornerRadius = dp(20).toFloat(); setColor(0x33FFFFFF); setStroke(dp(1), 0x88FFFFFF.toInt()) })
            }
            setOnClickListener {
                player?.let { p ->
                    val d = p.duration
                    val to = p.currentPosition + 90_000
                    p.seekTo(if (d > 0) minOf(to, d - 1000) else to)
                }
                view.showController()
            }
        }
        val next = left.findViewById<View>(androidx.media3.ui.R.id.exo_next)
        val at = if (next != null) left.indexOfChild(next) else left.childCount
        left.addView(skip, at, android.widget.LinearLayout.LayoutParams(-2, -2).apply {
            gravity = Gravity.CENTER_VERTICAL
            leftMargin = dp(6); rightMargin = dp(6)
        })
    }

    /** Botón grande al centro solo en pausa (como YouTube). */
    private fun updateCenterPlay() {
        val c = view.findViewById<View>(R.id.mv_center_play) ?: return
        val p = player
        c.visibility = if (p != null && !p.isPlaying && p.playbackState == Player.STATE_READY) View.VISIBLE else View.GONE
    }

    // ---------- Siguiente episodio automático ----------
    private var nextCard: TextView? = null
    private fun hasNext() = !live && index < queue.length() - 1
    private fun goNext() {
        ui.removeCallbacks(nextTick)
        nextCard?.visibility = View.GONE
        if (hasNext()) { playIndex(index + 1, 0); panel?.setCurrent(index) }
    }
    /** En los últimos 20 s aparece "Siguiente capítulo en N s" (OK para verlo ya); al terminar pasa solo. */
    private val nextTick = object : Runnable {
        override fun run() {
            val p = player
            if (p != null && hasNext() && p.duration > 0) {
                val left = (p.duration - p.currentPosition) / 1000
                val card = nextCard ?: makeNextCard().also { nextCard = it }
                if (left in 0..20) {
                    val n = queue.optJSONObject(index + 1)
                    card.text = "▶  Siguiente: " + (n?.optString("subtitle")?.ifBlank { null } ?: n?.optString("title") ?: "") + "  ·  en " + left + " s"
                    if (card.visibility != View.VISIBLE) { card.visibility = View.VISIBLE; card.requestFocus() }
                } else card.visibility = View.GONE
            }
            ui.postDelayed(this, 1000)
        }
    }
    private fun makeNextCard(): TextView {
        val t = TextView(this).apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            typeface = Typeface.DEFAULT_BOLD
            setPadding(dp(22), dp(14), dp(22), dp(14))
            isFocusable = true; isClickable = true
            background = android.graphics.drawable.StateListDrawable().apply {
                addState(intArrayOf(android.R.attr.state_focused), android.graphics.drawable.GradientDrawable().apply { cornerRadius = dp(26).toFloat(); setColor(0xFFFF6900.toInt()) })
                addState(intArrayOf(), android.graphics.drawable.GradientDrawable().apply { cornerRadius = dp(26).toFloat(); setColor(0xE60D0C0B.toInt()); setStroke(dp(2), 0xFFFF6900.toInt()) })
            }
            visibility = View.GONE
            setOnClickListener { goNext() }
        }
        root.addView(t, FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.END).apply { setMargins(0, 0, dp(28), dp(96)) })
        return t
    }

    private fun isFav(o: JSONObject) = o.optBoolean("fav")
    private fun toggleFav() {
        val o = current()
        val id = o.optString("id"); if (id.isBlank()) return
        val on = !isFav(o)
        o.put("fav", on)
        if (!favToggles.remove(id)) favToggles.add(id)
        updateFavBtn()
        panel?.setCurrent(index)
        android.widget.Toast.makeText(this, if (on) "Agregado a favoritos" else "Quitado de favoritos", android.widget.Toast.LENGTH_SHORT).show()
        view.showController()
    }
    private fun updateFavBtn() {
        val b = view.findViewById<android.widget.ImageButton>(R.id.mv_fav) ?: return
        val on = isFav(current())
        b.setImageResource(if (on) R.drawable.mv_ic_star_on else R.drawable.mv_ic_star)
        b.contentDescription = if (on) "Quitar de favoritos" else "Agregar a favoritos"
    }

    // ---------- Lista de canales (TV en vivo) ----------
    private fun portrait() = resources.configuration.orientation == android.content.res.Configuration.ORIENTATION_PORTRAIT
    private fun portraitPanel() = portrait() && panel != null
    private fun panelShowing() = panel != null && (panelOpen || portrait())

    private fun setupPanel(req: JSONObject) {
        if (!live || queue.length() < 2) return
        val recent = mutableListOf<String>()
        req.optJSONArray("recent")?.let { r -> for (i in 0 until r.length()) recent.add(r.optString(i)) }
        val touch = packageManager.hasSystemFeature("android.hardware.touchscreen") && !packageManager.hasSystemFeature("android.software.leanback")
        val p = ChannelPanel(this, queue, recent, touch,
            onPick = { i ->
                playIndex(i, 0, announce = true)
                panel?.setCurrent(i)
                if (!portrait()) closePanel()
            },
            onActivity = { if (panelOpen && !portrait()) { ui.removeCallbacks(hidePanel); ui.postDelayed(hidePanel, 12_000) } })
        p.setCurrent(index)
        p.startCountry(index)
        panel = p
        root.addView(p.root)
        view.findViewById<View>(R.id.mv_channels)?.apply {
            visibility = View.VISIBLE
            setOnClickListener { if (panelOpen) closePanel() else openPanel() }
        }
        layoutForOrientation()
    }

    /**
     * Barra de controles según el ancho: en pantallas angostas (celular vertical) quedan solo los botones
     * principales y más pequeños, para que nada quede encima de otra cosa.
     */
    private fun compactControls() {
        val wDp = resources.configuration.screenWidthDp
        val narrow = wDp < 600
        val size = dp(if (narrow) 38 else 44)
        val hideNarrow = listOf(androidx.media3.ui.R.id.exo_rew, androidx.media3.ui.R.id.exo_ffwd, androidx.media3.ui.R.id.exo_prev, androidx.media3.ui.R.id.exo_subtitle, R.id.mv_channels)
        listOf(androidx.media3.ui.R.id.exo_play_pause, androidx.media3.ui.R.id.exo_prev, androidx.media3.ui.R.id.exo_rew, androidx.media3.ui.R.id.exo_ffwd, androidx.media3.ui.R.id.exo_next,
            androidx.media3.ui.R.id.exo_subtitle, androidx.media3.ui.R.id.exo_settings, R.id.mv_fav, R.id.mv_mute, R.id.mv_channels).forEach { id ->
            val v = view.findViewById<View>(id) ?: return@forEach
            v.layoutParams = v.layoutParams.apply { width = size; height = size }
            v.setPadding(dp(if (narrow) 8 else 10), dp(if (narrow) 8 else 10), dp(if (narrow) 8 else 10), dp(if (narrow) 8 else 10))
            if (narrow && id in hideNarrow) v.alpha = 0f
            if (narrow && id in hideNarrow) v.layoutParams = v.layoutParams.apply { width = 0 }
            if (!narrow && v.alpha == 0f) v.alpha = 1f
            v.isFocusable = !(narrow && id in hideNarrow)
        }
        // La lista de canales no hace falta como botón cuando ya está fija debajo del video
        view.findViewById<View>(R.id.mv_channels)?.visibility = if (panel != null && !portrait()) View.VISIBLE else View.GONE
        listOf(androidx.media3.ui.R.id.exo_position, androidx.media3.ui.R.id.exo_duration).forEach { id ->
            view.findViewById<TextView>(id)?.setTextSize(TypedValue.COMPLEX_UNIT_SP, if (narrow) 12f else 14f)
        }
    }

    /** Celular vertical: video arriba (16:9) y lista abajo. Horizontal / TV: video completo y lista a la izquierda al abrirla. */
    private fun layoutForOrientation() {
        compactControls()
        val p = panel
        val w = resources.displayMetrics.widthPixels
        if (portrait()) {
            val vh = w * 9 / 16
            view.layoutParams = FrameLayout.LayoutParams(-1, if (p != null || live) vh else -1, Gravity.TOP or Gravity.CENTER_HORIZONTAL)
            if (!live) view.layoutParams = FrameLayout.LayoutParams(-1, -1)
            p?.root?.let { r ->
                r.layoutParams = FrameLayout.LayoutParams(-1, -1).apply { topMargin = vh }
                r.visibility = View.VISIBLE
            }
        } else {
            view.layoutParams = FrameLayout.LayoutParams(-1, -1)
            p?.root?.let { r ->
                r.layoutParams = FrameLayout.LayoutParams(maxOf(dp(380), (w * 0.44f).toInt()), -1, Gravity.START)
                r.visibility = if (panelOpen) View.VISIBLE else View.GONE
            }
        }
        view.requestLayout()
    }

    private fun openPanel() {
        val p = panel ?: return
        panelOpen = true
        view.hideController()
        p.root.visibility = View.VISIBLE
        p.setCurrent(index)
        p.focusCurrent()
        if (!portrait()) { ui.removeCallbacks(hidePanel); ui.postDelayed(hidePanel, 12_000) }
    }

    private fun closePanel() {
        ui.removeCallbacks(hidePanel)
        panelOpen = false
        if (!portrait()) panel?.root?.visibility = View.GONE
        view.requestFocus()
    }

    override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
        super.onConfigurationChanged(newConfig)
        layoutForOrientation()
        hideSystemBars()
    }

    private fun current(): JSONObject = queue.optJSONObject(index) ?: JSONObject()

    private lateinit var http: DefaultHttpDataSource.Factory

    /** Formas de abrir un canal: la URL tal cual, forzando HLS, con otro User-Agent, .ts/.m3u8 y señales alternativas. */
    private data class Attempt(val url: String, val forceHls: Boolean, val ua: String?)
    private var attempts = listOf<Attempt>()
    private var attemptIndex = 0
    private var startPosition = 0L
    private var subKey = ""
    private var extSub: java.io.File? = null
    private var extSubName = ""
    private var extOffset = 0L

    private val vlcUa = "VLC/3.0.20 LibVLC/3.0.20"

    private fun createPlayer() {
        val first = current()
        http = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(7000)
            .setReadTimeoutMs(15000)
            .setUserAgent(first.optString("ua").ifBlank { Net.UA })
        val referer = first.optString("ref")
        if (referer.isNotBlank()) http.setDefaultRequestProperties(mapOf("Referer" to referer))

        // FFmpeg primero para el audio: AC3/E-AC3/MP2/DTS suenan aunque el equipo no los soporte
        val renderers = DefaultRenderersFactory(this)
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER)
            .setEnableDecoderFallback(true)

        // Arranca con 1 s en memoria (antes 2,5 s) y sigue llenando el búfer mientras se ve
        val load = androidx.media3.exoplayer.DefaultLoadControl.Builder()
            .setBufferDurationsMs(15_000, 50_000, 1_000, 2_500)
            .setPrioritizeTimeOverSizeThresholds(true)
            .build()
        val p = ExoPlayer.Builder(this, renderers)
            .setMediaSourceFactory(DefaultMediaSourceFactory(this).setDataSourceFactory(http))
            .setLoadControl(load)
            .build()
        p.trackSelectionParameters = p.trackSelectionParameters.buildUpon()
            .setPreferredAudioLanguage(audioLang)
            .apply {
                if (subLang.isNotBlank()) setPreferredTextLanguage(subLang).setSelectUndeterminedTextLanguage(true)
            }
            .build()
        // Sesión de medios: la ventana flotante y el sistema muestran el título (no "Programa sin título")
        try {
            session?.release()
            session = androidx.media3.session.MediaSession.Builder(this, p).setId("mv" + System.nanoTime()).build()
        } catch (_: Throwable) {}
        p.addListener(object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) { onFail(error) }
            override fun onIsPlayingChanged(isPlaying: Boolean) { updateCenterPlay(); WatchNext.update(this@PlayerActivity, current(), p, live) }
            override fun onTracksChanged(tracks: androidx.media3.common.Tracks) { logTracks(tracks) }

            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_READY) {
                    cancelWatchdog()
                    retries = 0
                    errorView.visibility = View.GONE
                    // Ya abrió: quita el aviso de "Probando otra forma…"
                    if (info.visibility == View.VISIBLE && info.text.startsWith("Probando")) hideInfo(600)
                }
                if (state == Player.STATE_ENDED && !live && hasNext()) { goNext(); return }
                if (state == Player.STATE_ENDED && !live) {
                    if (index < queue.length() - 1) playIndex(index + 1, 0) else finishWithResult()
                }
            }
        })
        view.player = p
        player = p
    }

    /** Explica en palabras simples por qué falló, con el código para poder revisarlo. */
    private fun explain(e: PlaybackException): String {
        var cause: Throwable? = e
        var http = 0
        while (cause != null) {
            if (cause is androidx.media3.datasource.HttpDataSource.InvalidResponseCodeException) { http = cause.responseCode; break }
            cause = cause.cause
        }
        val why = when {
            http == 401 || http == 403 -> "El servidor rechazó la reproducción. Suele pasar cuando la cuenta ya tiene el máximo de pantallas abiertas (ciérrala en otros equipos o apps), está vencida o el proveedor bloquea esta app."
            http == 404 -> "El servidor no tiene este archivo (puede haberlo borrado)."
            http == 458 || http == 509 || http == 429 -> "El servidor tiene demasiadas conexiones con esta cuenta. Cierra la reproducción en otros equipos y vuelve a intentar."
            http >= 500 -> "El servidor del proveedor tiene un problema en este momento."
            http > 0 -> "El servidor respondió con un error."
            e.errorCode == PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED || e.errorCode == PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT ->
                "No hay conexión con el servidor (revisa tu internet o el servidor está caído)."
            e.errorCode == PlaybackException.ERROR_CODE_IO_CLEARTEXT_NOT_PERMITTED -> "El enlace usa una conexión no permitida."
            e.errorCode == PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED || e.errorCode == PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED ||
                e.errorCode == PlaybackException.ERROR_CODE_PARSING_MANIFEST_MALFORMED ->
                "El servidor no entregó un video válido (puede ser una página de error o un formato no compatible)."
            e.errorCode == PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED || e.errorCode == PlaybackException.ERROR_CODE_DECODER_INIT_FAILED ||
                e.errorCode == PlaybackException.ERROR_CODE_DECODING_FORMAT_EXCEEDS_CAPABILITIES ->
                "Este equipo no puede decodificar el video (por ejemplo 4K o HEVC de 10 bits)."
            e.errorCode == PlaybackException.ERROR_CODE_DRM_UNSPECIFIED || e.errorCode in 6000..6999 -> "El contenido está protegido (DRM) y no se puede reproducir aquí."
            else -> "Error del reproductor."
        }
        return why + "\n(código " + (if (http > 0) "HTTP $http" else e.errorCodeName) + ")"
    }


    /** Si una forma de abrir falla (o se queda colgada), prueba la siguiente. */
    private fun onFail(error: PlaybackException) {
        cancelWatchdog()
        val p = player ?: return
        // Si falla en los últimos 90 s de un episodio (créditos cortados), pasa al siguiente
        if (!live && hasNext() && p.duration > 0 && p.duration - p.currentPosition < 90_000) { goNext(); return }

        if (error.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {
            p.seekToDefaultPosition(); p.prepare(); return
        }
        val transient = error.errorCode == PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT ||
            error.errorCode == PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED
        if (transient && retries < 1) {
            retries++
            ui.postDelayed({ p.prepare(); p.play(); armWatchdog() }, 1500)
            return
        }
        if (attemptIndex < attempts.size - 1) {
            attemptIndex++
            retries = 0
            info.text = (if (live) "Probando otra forma de abrir el canal… (" else "Probando otra forma de abrir el video… (") + (attemptIndex + 1) + "/" + attempts.size + ")"
            info.visibility = View.VISIBLE
            info.alpha = 1f
            hideInfo(6000)
            startAttempt()
            return
        }
        errorView.text = "No se pudo reproducir este contenido.\n\n" + explain(error) +
            (if (live) "\n\nPrueba otro canal con ▲ ▼." else "\n\nVuelve atrás e intenta de nuevo.")
        errorView.visibility = View.VISIBLE
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
        // Xtream películas y series: el mismo archivo suele estar en otros formatos
        val vod = Regex("(/(?:movie|series)/[^?]+/\\d+)\\.(\\w{2,4})(\\?.*)?$", RegexOption.IGNORE_CASE).find(url)
        if (vod != null) {
            val ext = vod.groupValues[2].lowercase()
            for (e in listOf("mp4", "mkv", "m3u8", "ts", "avi")) if (e != ext) urls.add(url.replaceRange(vod.groups[2]!!.range, e))
        }
        // Mismo enlace con el otro protocolo (algunos servidores solo responden en http o en https)
        if (url.startsWith("https://", true)) urls.add("http://" + url.substring(8)) else if (url.startsWith("http://", true)) urls.add("https://" + url.substring(7))
        val alts = item.optJSONArray("alts")
        val altList = mutableListOf<String>()
        if (alts != null) for (i in 0 until alts.length()) alts.optString(i).takeIf { it.isNotBlank() && it != url }?.let { altList.add(it) }
        fun hlsOf(u: String) = u.lowercase().substringBefore('?').let { it.endsWith(".m3u8") || it.contains("/hls/") }
        val out = mutableListOf<Attempt>()
        // Orden pensado para arrancar rápido: 1) el enlace tal cual, 2) las otras listas (versiones de respaldo) tal cual,
        // 3) recién después las variantes de formato, protocolo e identificación de cada una
        out.add(Attempt(url, hlsOf(url), ua))
        for (a in altList) out.add(Attempt(a, hlsOf(a), ua))
        for (u in (urls + altList).distinct()) {
            val isHls = hlsOf(u)
            out.add(Attempt(u, isHls, ua))
            if (!isHls && live) out.add(Attempt(u, true, ua))     // HLS sin extensión .m3u8
            out.add(Attempt(u, isHls, vlcUa))                      // servidores que solo aceptan reproductores conocidos
            if (!live) out.add(Attempt(u, isHls, "IPTVSmartersPro"))
            if (!live && u == url) out.add(Attempt(u, isHls, "okhttp/4.12.0"))
        }
        return out.distinctBy { it.url + "|" + it.forceHls + "|" + it.ua }.take(24)
    }

    private fun startAttempt() {
        val p = player ?: return
        val item = current()
        val at = attempts.getOrNull(attemptIndex) ?: return
        http.setUserAgent(at.ua ?: Net.UA)
        val b = MediaItem.Builder().setUri(Uri.parse(at.url)).setMediaId(item.optString("id", at.url))
            .setMediaMetadata(androidx.media3.common.MediaMetadata.Builder()
                .setTitle(item.optString("title"))
                .setSubtitle(item.optString("subtitle"))
                .setArtworkUri(item.optString("poster").takeIf { it.startsWith("http") }?.let { Uri.parse(it) })
                .build())
        val lower = at.url.lowercase().substringBefore('?')
        when {
            at.forceHls -> b.setMimeType(MimeTypes.APPLICATION_M3U8)
            lower.endsWith(".mpd") -> b.setMimeType(MimeTypes.APPLICATION_MPD)
        }
        val ext = extSub
        val sub = if (ext != null) Uri.fromFile(Subtitles.shifted(ext, extOffset)).toString() else item.optString("sub")
        if (sub.isNotBlank()) {
            val sl = sub.lowercase()
            val mime = if (sl.endsWith(".vtt")) MimeTypes.TEXT_VTT else if (sl.endsWith(".ass") || sl.endsWith(".ssa")) MimeTypes.TEXT_SSA else MimeTypes.APPLICATION_SUBRIP
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
        armWatchdog()
    }

    // Vigilante: si en 25 s no arranca, se toma como fallo y se prueba la siguiente forma
    private val watchdog = Runnable {
        val p = player
        if (p != null && p.playbackState != Player.STATE_READY) {
            onFail(PlaybackException("El servidor no respondió a tiempo", null, PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT))
        }
    }
    // Los primeros intentos esperan menos (si no arranca rápido, mejor probar la versión de respaldo); los últimos, más
    private fun armWatchdog() { ui.removeCallbacks(watchdog); ui.postDelayed(watchdog, if (attemptIndex < 3) 12000L else 20000L) }
    private fun cancelWatchdog() { ui.removeCallbacks(watchdog) }

    /** announce: muestra el nombre arriba (solo al cambiar de canal con ▲▼, no al abrir). */
    private fun playIndex(i: Int, startMs: Long, announce: Boolean = false) {
        index = (i + queue.length()) % maxOf(1, queue.length())
        val item = current()
        if (item.optString("url").isBlank()) return
        // Portal MAC: primero se pide el enlace (vence en minutos, por eso se pide cada vez que se abre)
        val stk = item.optJSONObject("stk")
        if (stk != null && !item.optBoolean("stkReady")) {
            val want = index
            info.text = "Conectando con el portal…"; info.visibility = View.VISIBLE; info.alpha = 1f
            Thread {
                val res = try { Result.success(Stalker.link(stk)) } catch (e: Exception) { Result.failure(e) }
                runOnUiThread {
                    if (isFinishing || index != want) return@runOnUiThread
                    info.visibility = View.GONE
                    res.onSuccess { u ->
                        item.put("url", u); item.put("ua", Stalker.UA); item.put("stkReady", true)
                        playIndex(want, startMs, announce)
                    }.onFailure { e ->
                        errorView.text = "No se pudo abrir desde el portal.\n\n" + (e.message ?: "") + (if (live) "\n\nPrueba otro canal con ▲ ▼." else "\n\nVuelve atrás e intenta de nuevo.")
                        errorView.visibility = View.VISIBLE
                    }
                }
            }.start()
            return
        }
        if (stk != null) item.put("stkReady", false)   // la próxima vez se vuelve a pedir un enlace fresco
        val ref = item.optString("ref")
        http.setDefaultRequestProperties(if (ref.isNotBlank()) mapOf("Referer" to ref) else emptyMap())
        extSub = null; extSubName = ""; extOffset = 0L
        attempts = buildAttempts(item)
        attemptIndex = 0
        retries = 0
        startPosition = startMs
        startAttempt()
        // Sin recuadro con el nombre del canal (pedido); solo se actualiza el botón de favorito
        updateFavBtn()
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
        playIndex(index + delta, 0, announce = true)
    }

    // ---------- Audio, subtítulos y pantalla ----------
    private val prefs by lazy { getSharedPreferences("player", MODE_PRIVATE) }
    private val subSizes = listOf("Pequeño" to 0.8f, "Mediano" to 1f, "Grande" to 1.3f, "Muy grande" to 1.6f)

    private fun applySubtitleStyle() {
        val f = subSizes.getOrNull(prefs.getInt("subSize", 1))?.second ?: 1f
        view.subtitleView?.apply {
            setFractionalTextSize(SubtitleView.DEFAULT_TEXT_SIZE_FRACTION * f)
            setApplyEmbeddedStyles(false)
            setStyle(CaptionStyleCompat(Color.WHITE, 0x99000000.toInt(), Color.TRANSPARENT, CaptionStyleCompat.EDGE_TYPE_OUTLINE, Color.BLACK, null))
        }
    }

    private fun langName(code: String?): String {
        if (code.isNullOrBlank() || code == "und") return ""
        val n = Locale.forLanguageTag(code).getDisplayLanguage(Locale("es"))
        return if (n.isBlank() || n == code) code.uppercase() else n.replaceFirstChar { it.uppercase() }
    }

    // Idiomas de audio y subtítulos que trae cada contenido (se devuelven a la app para mostrar solo esos en "Audio y subtítulos")
    private val trackLog = JSONObject()
    private fun logTracks(tracks: androidx.media3.common.Tracks) {
        if (live) return
        val id = current().optString("id"); if (id.isBlank()) return
        val a = JSONArray(); val t = JSONArray(); val seen = HashSet<String>()
        for (g in tracks.groups) for (i in 0 until g.length) {
            if (!g.isTrackSupported(i)) continue
            val f = g.getTrackFormat(i)
            val v = (f.language ?: "und") + "|" + (f.label ?: "")
            when (g.type) {
                C.TRACK_TYPE_AUDIO -> if (seen.add("a$v")) a.put(v)
                C.TRACK_TYPE_TEXT -> if (seen.add("t$v")) t.put(v)
            }
        }
        if (a.length() > 0 || t.length() > 0) trackLog.put(id, JSONObject().put("a", a).put("s", t))
    }

    private class Opt(val label: String, val selected: Boolean, val run: () -> Unit)

    private fun showTracks() {
        val p = player ?: return
        val audio = mutableListOf<Opt>()
        val text = mutableListOf<Opt>()
        val textOff = p.trackSelectionParameters.disabledTrackTypes.contains(C.TRACK_TYPE_TEXT)
        var anyTextSelected = false
        for (g in p.currentTracks.groups) {
            for (i in 0 until g.length) {
                if (!g.isTrackSupported(i)) continue
                val f = g.getTrackFormat(i)
                val sel = g.isTrackSelected(i)
                when (g.type) {
                    C.TRACK_TYPE_AUDIO -> {
                        val ch = when (f.channelCount) { 1 -> "Mono"; 2 -> "Estéreo"; 6 -> "5.1"; 8 -> "7.1"; else -> if (f.channelCount > 0) "${f.channelCount} canales" else "" }
                        val name = listOf(langName(f.language), f.label ?: "", ch).filter { it.isNotBlank() }.distinct().joinToString(" · ").ifBlank { "Pista ${audio.size + 1}" }
                        audio.add(Opt(name, sel) {
                            p.trackSelectionParameters = p.trackSelectionParameters.buildUpon().setOverrideForType(TrackSelectionOverride(g.mediaTrackGroup, i)).build()
                            toastInfo("Audio: $name")
                        })
                    }
                    C.TRACK_TYPE_TEXT -> {
                        if (sel && !textOff) anyTextSelected = true
                        val name = listOf(langName(f.language), f.label ?: "").filter { it.isNotBlank() }.distinct().joinToString(" · ").ifBlank { "Subtítulos ${text.size + 1}" }
                        text.add(Opt(name, sel && !textOff) {
                            p.trackSelectionParameters = p.trackSelectionParameters.buildUpon()
                                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
                                .setOverrideForType(TrackSelectionOverride(g.mediaTrackGroup, i)).build()
                            toastInfo("Subtítulos: $name")
                        })
                    }
                }
            }
        }
        val labels = mutableListOf<String>()
        val actions = mutableListOf<(() -> Unit)?>()
        fun header(t: String) { labels.add("— $t —"); actions.add(null) }
        fun item(o: Opt) { labels.add((if (o.selected) "●  " else "○  ") + o.label); actions.add(o.run) }

        header("IDIOMA DEL AUDIO")
        if (audio.isEmpty()) { labels.add("   Este video no informa sus idiomas"); actions.add(null) } else audio.forEach { item(it) }
        if (audio.size == 1) { labels.add("   Este video solo trae un idioma"); actions.add(null) }

        header("SUBTÍTULOS")
        item(Opt("Desactivados", text.isEmpty() || !anyTextSelected) {
            p.trackSelectionParameters = p.trackSelectionParameters.buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true).build()
            toastInfo("Subtítulos desactivados")
        })
        text.forEach { item(it) }
        if (text.isEmpty() && extSub == null) { labels.add("   Este video no trae subtítulos propios"); actions.add(null) }
        if (extSub != null) {
            labels.add("●  Externo: $extSubName"); actions.add(null)
            labels.add("    ⏪  Que aparezcan antes (−0,5 s)" + offLabel()); actions.add({ extOffset -= 500; reloadExternal("Subtítulos " + offText()) })
            labels.add("    ⏩  Que aparezcan después (+0,5 s)"); actions.add({ extOffset += 500; reloadExternal("Subtítulos " + offText()) })
            labels.add("    ⏪⏪  Mucho antes (−5 s)"); actions.add({ extOffset -= 5000; reloadExternal("Subtítulos " + offText()) })
            labels.add("    ⏩⏩  Mucho después (+5 s)"); actions.add({ extOffset += 5000; reloadExternal("Subtítulos " + offText()) })
            labels.add("    Quitar el subtítulo externo"); actions.add({ extSub = null; extOffset = 0; reloadExternal("Subtítulo externo quitado") })
        }
        if (!live) {
            labels.add(if (subKey.isNotBlank()) "Buscar subtítulos en internet" else "Buscar en internet (falta la clave de SubDL en Ajustes)")
            actions.add(if (subKey.isNotBlank()) ({ searchSubs() }) else null)
        }

        header("TAMAÑO DE LOS SUBTÍTULOS")
        val curSize = prefs.getInt("subSize", 1)
        subSizes.forEachIndexed { idx, sz -> item(Opt(sz.first, idx == curSize) { prefs.edit().putInt("subSize", idx).apply(); applySubtitleStyle(); toastInfo("Subtítulos: ${sz.first}") }) }

        header("PANTALLA")
        listOf(AspectRatioFrameLayout.RESIZE_MODE_FIT to "Original", AspectRatioFrameLayout.RESIZE_MODE_ZOOM to "Recortar (llenar pantalla)", AspectRatioFrameLayout.RESIZE_MODE_FILL to "Estirar").forEach { (m, n) ->
            item(Opt(n, resizeMode == m) { resizeMode = m; view.resizeMode = m; toastInfo("Pantalla: $n") })
        }

        val dlg = AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("Audio y subtítulos")
            .setItems(labels.toTypedArray()) { d, which -> actions[which]?.let { it(); d.dismiss() } }
            .setNegativeButton("Cerrar", null)
            .create()
        dlg.show()
        // Enfoca la opción marcada, saltando los títulos de sección
        dlg.listView?.post { val first = labels.indexOfFirst { it.startsWith("●") }; if (first >= 0) dlg.listView.setSelection(first) }
    }

    private val hideInfoRun = Runnable { info.animate().alpha(0f).setDuration(300).withEndAction { info.visibility = View.GONE }.start() }
    private fun hideInfo(delay: Long) { ui.removeCallbacks(hideInfoRun); ui.postDelayed(hideInfoRun, delay) }

    private fun offText() = if (extOffset == 0L) "sincronizados como vienen" else String.format(Locale("es"), "%+.1f s", extOffset / 1000.0)
    private fun offLabel() = if (extOffset != 0L) "   [ahora " + offText() + "]" else ""

    /** Vuelve a cargar el video con el subtítulo externo (corrido), en el mismo punto. */
    private fun reloadExternal(msg: String) {
        val p = player ?: return
        startPosition = p.currentPosition
        p.trackSelectionParameters = p.trackSelectionParameters.buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_TEXT, extSub == null).build()
        startAttempt()
        toastInfo(msg)
    }

    private fun searchSubs() {
        val item = current()
        val langs = when (subLang) { "en" -> "EN,ES"; "pt" -> "BR_PT,PT,ES"; else -> "ES,EN" }
        toastInfo("Buscando subtítulos…")
        Thread {
            val res = try { Subtitles.search(subKey, item, langs) } catch (e: Exception) { ui.post { toastInfo(e.message ?: "No se pudo buscar") }; return@Thread }
            ui.post {
                if (res.isEmpty()) { toastInfo("No encontré subtítulos para este título"); return@post }
                val names = res.map { r -> (if (r.lang.isNotBlank()) "[" + r.lang.uppercase() + "]  " else "") + r.name + (if (r.episode > 0) "  (T${r.season} E${r.episode})" else "") }.toTypedArray()
                AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                    .setTitle("Elige un subtítulo (el que coincida con tu versión)")
                    .setItems(names) { _, w -> applySub(res[w]) }
                    .setNegativeButton("Cancelar", null)
                    .show()
            }
        }.start()
    }

    private fun applySub(r: Subtitles.Result) {
        toastInfo("Descargando subtítulo…")
        Thread {
            try {
                val f = Subtitles.download(java.io.File(cacheDir, "subs"), r)
                ui.post { extSub = f; extSubName = r.name.take(40); extOffset = 0; reloadExternal("Subtítulo listo. Si no coincide, ajústalo en Ajustes del reproductor") }
            } catch (e: Exception) {
                ui.post { toastInfo(e.message ?: "No se pudo descargar") }
            }
        }.start()
    }

    private fun toastInfo(t: String) {
        info.text = t
        info.visibility = View.VISIBLE
        info.alpha = 1f
        ui.postDelayed({ info.visibility = View.GONE }, 1800)
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
        if (panelOpen && !portraitPanel()) { ui.removeCallbacks(hidePanel); ui.postDelayed(hidePanel, 12_000) }
        if (event.action == KeyEvent.ACTION_DOWN) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_CHANNEL_UP, KeyEvent.KEYCODE_PAGE_UP -> { zap(-1); return true }
                KeyEvent.KEYCODE_CHANNEL_DOWN, KeyEvent.KEYCODE_PAGE_DOWN -> { zap(1); return true }
                KeyEvent.KEYCODE_DPAD_UP -> if (live && !controllerVisible && !panelShowing()) { zap(-1); return true }
                KeyEvent.KEYCODE_DPAD_DOWN -> if (live && !controllerVisible && !panelShowing()) { zap(1); return true }
                // TV en vivo: OK o ◀ abren la lista de canales; ▶ la cierra
                KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_DPAD_LEFT ->
                    if (panel != null && !controllerVisible && !panelShowing()) { openPanel(); return true }
                KeyEvent.KEYCODE_DPAD_RIGHT -> if (panelOpen && !portraitPanel() && panel?.hasFocus() == true && currentFocus is android.widget.ListView) { closePanel(); return true }
                KeyEvent.KEYCODE_BUTTON_Y -> { cycleResize(); return true }
                KeyEvent.KEYCODE_MENU, KeyEvent.KEYCODE_CAPTIONS, KeyEvent.KEYCODE_BUTTON_X, KeyEvent.KEYCODE_MEDIA_AUDIO_TRACK -> { showTracks(); return true }
                KeyEvent.KEYCODE_BUTTON_B, KeyEvent.KEYCODE_ESCAPE -> { if (controllerVisible) view.hideController() else finishWithResult(); return true }
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
        WatchNext.update(this, current(), p, live)
        val item = current()
        val result = JSONObject()
            .put("id", item.optString("id"))
            .put("url", item.optString("url"))
            .put("index", index)
            .put("position", p?.currentPosition ?: 0)
            .put("duration", p?.duration?.takeIf { it > 0 } ?: 0)
            .put("live", live)
            .put("replaced", replacedBy)
            .put("favToggles", JSONArray(favToggles.toList()))
            .put("tracks", trackLog)
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
        // Ventana pequeña al salir con Inicio (celular, tablet y Android TV que lo soporten)
        if (Build.VERSION.SDK_INT >= 26 && player?.isPlaying == true && packageManager.hasSystemFeature(android.content.pm.PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
            try { enterPictureInPictureMode(android.app.PictureInPictureParams.Builder().build()) } catch (_: Exception) {}
        }
    }

    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: android.content.res.Configuration) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        // En la ventana pequeña no se muestran controles ni avisos
        view.useController = !isInPictureInPictureMode
        if (isInPictureInPictureMode) { view.hideController(); info.visibility = View.GONE; tracksBtn.visibility = View.GONE }
    }

    override fun onDestroy() {
        ui.removeCallbacksAndMessages(null)
        try { session?.release() } catch (_: Throwable) {}
        session = null
        player?.release()
        player = null
        super.onDestroy()
    }
}
