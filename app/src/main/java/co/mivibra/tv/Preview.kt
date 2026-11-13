package co.mivibra.tv

import android.graphics.Outline
import android.net.Uri
import android.view.Gravity
import android.view.TextureView
import android.view.View
import android.view.ViewOutlineProvider
import android.widget.FrameLayout
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.AspectRatioFrameLayout

/**
 * Canal en vivo dentro del Inicio: un reproductor nativo (ExoPlayer) puesto encima del recuadro del WebView.
 * Así se ven también canales .ts y HLS que el <video> del WebView no abre. Las coordenadas llegan en px CSS.
 */
@OptIn(UnstableApi::class)
class Preview(private val a: MainActivity, private val root: FrameLayout) {
    private var player: ExoPlayer? = null
    private var box: FrameLayout? = null
    private var ratio: AspectRatioFrameLayout? = null
    private var url = ""
    private var muted = true
    private var radiusPx = 0f
    private var started = false
    private var shown = true

    private fun scale(cssW: Double): Float = if (cssW > 0) a.web.width / cssW.toFloat() else a.resources.displayMetrics.density

    fun show(u: String, ua: String, ref: String, x: Double, y: Double, w: Double, h: Double, cssW: Double, radius: Double, mute: Boolean) {
        muted = mute
        if (u != url || player == null) {
            release()
            url = u
            start(ua, ref)
        }
        player?.volume = if (muted) 0f else 1f
        radiusPx = (radius * scale(cssW)).toFloat()
        move(x, y, w, h, cssW, true)
    }

    private fun start(ua: String, ref: String) {
        val http = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(7000)
            .setReadTimeoutMs(15000)
            .setUserAgent(ua.ifBlank { Net.UA })
        if (ref.isNotBlank()) http.setDefaultRequestProperties(mapOf("Referer" to ref))
        val renderers = DefaultRenderersFactory(a)
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER)
            .setEnableDecoderFallback(true)
        // Búfer corto: es una vista previa y debe arrancar rápido
        val load = DefaultLoadControl.Builder().setBufferDurationsMs(4_000, 12_000, 800, 1_500).build()
        val p = ExoPlayer.Builder(a, renderers)
            .setMediaSourceFactory(DefaultMediaSourceFactory(androidx.media3.datasource.DefaultDataSource.Factory(a, http)))
            .setLoadControl(load)
            .build()
        p.volume = if (muted) 0f else 1f
        val b = FrameLayout(a)
        b.clipToOutline = true
        b.outlineProvider = object : ViewOutlineProvider() {
            override fun getOutline(v: View, o: Outline) { o.setRoundRect(0, 0, v.width, v.height, radiusPx) }
        }
        b.isFocusable = false
        b.isClickable = false
        // Casi transparente hasta el primer cuadro (mientras tanto se ve el logo del canal); con INVISIBLE la superficie no se crea
        b.alpha = 0.01f
        started = false
        val r = AspectRatioFrameLayout(a)
        r.resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
        val tv = TextureView(a)
        r.addView(tv, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        b.addView(r, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT, Gravity.CENTER))
        root.addView(b, FrameLayout.LayoutParams(1, 1))
        p.setVideoTextureView(tv)
        p.addListener(object : Player.Listener {
            override fun onVideoSizeChanged(s: VideoSize) {
                if (s.width > 0 && s.height > 0) r.setAspectRatio(s.width * s.pixelWidthHeightRatio / s.height)
            }
            override fun onRenderedFirstFrame() {
                started = true
                box?.let { it.alpha = 1f; it.visibility = if (shown) View.VISIBLE else View.INVISIBLE }
                a.js("window.MV&&MV.onPreview&&MV.onPreview('on')")
            }
            override fun onPlayerError(error: PlaybackException) {
                release()
                a.js("window.MV&&MV.onPreview&&MV.onPreview('fail')")
            }
        })
        val item = MediaItem.Builder().setUri(Uri.parse(url))
        if (url.lowercase().substringBefore('?').let { it.endsWith(".m3u8") || it.endsWith(".m3u") }) item.setMimeType(MimeTypes.APPLICATION_M3U8)
        p.setMediaItem(item.build())
        p.playWhenReady = true
        p.prepare()
        player = p; box = b; ratio = r
    }

    fun move(x: Double, y: Double, w: Double, h: Double, cssW: Double, visible: Boolean) {
        val b = box ?: return
        val s = scale(cssW)
        val lp = b.layoutParams as FrameLayout.LayoutParams
        lp.width = (w * s).toInt().coerceAtLeast(1)
        lp.height = (h * s).toInt().coerceAtLeast(1)
        lp.leftMargin = (x * s).toInt()
        lp.topMargin = (y * s).toInt()
        lp.gravity = Gravity.TOP or Gravity.START
        b.layoutParams = lp
        b.invalidateOutline()
        shown = visible
        b.visibility = if (visible || !started) View.VISIBLE else View.INVISIBLE
        if (!started) b.alpha = 0.01f
        // Si no se ve (otra pantalla encima), sin sonido
        player?.volume = if (visible && !muted) 1f else 0f
    }

    fun mute(m: Boolean) { muted = m; player?.volume = if (m) 0f else 1f }

    fun release() {
        try { player?.release() } catch (_: Exception) {}
        player = null
        box?.let { root.removeView(it) }
        box = null; ratio = null; url = ""
    }
}
