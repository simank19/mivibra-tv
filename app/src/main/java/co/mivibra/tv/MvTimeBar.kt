package co.mivibra.tv

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.DefaultTimeBar
import androidx.media3.ui.TimeBar

/**
 * Barra de progreso con lo visto más grueso y lo que falta más delgado.
 * Se apoya en la barra de Media3 (toque, arrastre y control remoto siguen igual); solo cambia cómo se dibuja.
 */
@OptIn(UnstableApi::class)
class MvTimeBar @JvmOverloads constructor(ctx: Context, attrs: AttributeSet? = null) : DefaultTimeBar(ctx, attrs) {
    private val dp = resources.displayMetrics.density
    private val played = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFFF6900.toInt() }
    private val buffered = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x66FFFFFF }
    private val rest = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x40FFFFFF }
    private var pos = 0L; private var buf = 0L; private var dur = 0L
    private var scrubbing = false; private var scrubPos = 0L
    private val r = RectF()

    init {
        // La barra de Media3 solo dibuja el punto; las líneas las pinta esta clase
        setPlayedColor(0); setBufferedColor(0); setUnplayedColor(0)
        addListener(object : TimeBar.OnScrubListener {
            override fun onScrubStart(timeBar: TimeBar, position: Long) { scrubbing = true; scrubPos = position; invalidate() }
            override fun onScrubMove(timeBar: TimeBar, position: Long) { scrubPos = position; invalidate() }
            override fun onScrubStop(timeBar: TimeBar, position: Long, canceled: Boolean) { scrubbing = false; if (!canceled) pos = position; invalidate() }
        })
    }

    fun setColors(playedColor: Int, restColor: Int, bufferedColor: Int) { played.color = playedColor; rest.color = restColor; buffered.color = bufferedColor; invalidate() }

    override fun setPosition(position: Long) { super.setPosition(position); pos = position; invalidate() }
    override fun setBufferedPosition(bufferedPosition: Long) { super.setBufferedPosition(bufferedPosition); buf = bufferedPosition; invalidate() }
    override fun setDuration(duration: Long) { super.setDuration(duration); dur = duration; invalidate() }

    override fun onDraw(canvas: Canvas) {
        val pad = 9 * dp                                  // margen del punto (igual que la barra de Media3)
        val left = paddingLeft + pad
        val right = width - paddingRight - pad
        val cy = height / 2f
        if (right > left) {
            val thin = 2.5f * dp; val thick = 6f * dp
            val p = if (scrubbing) scrubPos else pos
            val f = if (dur > 0) (p.toFloat() / dur).coerceIn(0f, 1f) else 0f
            val fb = if (dur > 0) (buf.toFloat() / dur).coerceIn(0f, 1f) else 0f
            val x = left + (right - left) * f
            // Lo que falta: delgado
            r.set(x, cy - thin / 2, right, cy + thin / 2); canvas.drawRoundRect(r, thin, thin, rest)
            if (fb > f) { r.set(x, cy - thin / 2, left + (right - left) * fb, cy + thin / 2); canvas.drawRoundRect(r, thin, thin, buffered) }
            // Lo visto: grueso
            if (x > left) { r.set(left, cy - thick / 2, x, cy + thick / 2); canvas.drawRoundRect(r, thick, thick, played) }
        }
        super.onDraw(canvas)
    }
}
