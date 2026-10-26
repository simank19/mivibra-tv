package co.mivibra.tv

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.view.HapticFeedbackConstants
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import kotlin.math.hypot
import kotlin.math.min

/**
 * Controles táctiles nativos sobre el juego: joystick (también cruceta), A B X Y, L1 R1 L2 R2,
 * SELECT, START y botón de menú. Admite varios dedos a la vez.
 */
@SuppressLint("ViewConstructor")
class TouchPadView(
    context: Context,
    private val onKey: (keyCode: Int, down: Boolean) -> Unit,
    private val onStick: (x: Float, y: Float) -> Unit,
    private val onMenu: () -> Unit
) : View(context) {

    private class Btn(val label: String, val code: Int, val round: Boolean) {
        val r = RectF()
        var pressed = false
    }

    private val buttons = listOf(
        Btn("A", KeyEvent.KEYCODE_BUTTON_A, true),
        Btn("B", KeyEvent.KEYCODE_BUTTON_B, true),
        Btn("X", KeyEvent.KEYCODE_BUTTON_X, true),
        Btn("Y", KeyEvent.KEYCODE_BUTTON_Y, true),
        Btn("L1", KeyEvent.KEYCODE_BUTTON_L1, false),
        Btn("R1", KeyEvent.KEYCODE_BUTTON_R1, false),
        Btn("L2", KeyEvent.KEYCODE_BUTTON_L2, false),
        Btn("R2", KeyEvent.KEYCODE_BUTTON_R2, false),
        Btn("SELECT", KeyEvent.KEYCODE_BUTTON_SELECT, false),
        Btn("START", KeyEvent.KEYCODE_BUTTON_START, false)
    )
    private val menuRect = RectF()

    private var stickCx = 0f
    private var stickCy = 0f
    private var stickR = 0f
    private var knobX = 0f
    private var knobY = 0f
    private var stickPointer = -1
    private val owner = HashMap<Int, Btn>()   // dedo -> botón presionado
    private var menuPointer = -1

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.argb(150, 255, 255, 255) }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; textAlign = Paint.Align.CENTER; isFakeBoldText = true }
    private val accent = Color.rgb(255, 105, 0)

    init {
        isHapticFeedbackEnabled = true
        isFocusable = false
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        val u = min(w, h).toFloat()
        stroke.strokeWidth = u * 0.006f
        text.textSize = u * 0.045f
        // Joystick a la izquierda
        stickR = u * 0.17f
        stickCx = w * 0.15f + stickR * 0.2f
        stickCy = h - stickR - u * 0.08f
        knobX = stickCx; knobY = stickCy
        // A B X Y en rombo a la derecha
        val br = u * 0.075f
        val cx = w - u * 0.27f
        val cy = h - u * 0.30f
        val gap = br * 1.45f
        place("A", cx + gap, cy, br)
        place("B", cx, cy + gap, br)
        place("X", cx, cy - gap, br)
        place("Y", cx - gap, cy, br)
        // Gatillos arriba
        val sw = u * 0.20f
        val sh = u * 0.085f
        val m = u * 0.04f
        rect("L1", m, m + sh + m * 0.4f, sw, sh)
        rect("L2", m, m, sw, sh)
        rect("R1", w - m - sw, m + sh + m * 0.4f, sw, sh)
        rect("R2", w - m - sw, m, sw, sh)
        // SELECT y START abajo al centro
        val pw = u * 0.18f
        val ph = u * 0.07f
        rect("SELECT", w / 2f - pw - m * 0.3f, h - ph - m * 0.6f, pw, ph)
        rect("START", w / 2f + m * 0.3f, h - ph - m * 0.6f, pw, ph)
        // Menú arriba al centro
        val mw = u * 0.11f
        menuRect.set(w / 2f - mw / 2, m * 0.6f, w / 2f + mw / 2, m * 0.6f + mw * 0.6f)
    }

    private fun btn(l: String) = buttons.first { it.label == l }
    private fun place(l: String, x: Float, y: Float, r: Float) { btn(l).r.set(x - r, y - r, x + r, y + r) }
    private fun rect(l: String, x: Float, y: Float, w: Float, h: Float) { btn(l).r.set(x, y, x + w, y + h) }

    override fun onDraw(c: Canvas) {
        // Joystick
        fill.color = Color.argb(60, 255, 255, 255)
        c.drawCircle(stickCx, stickCy, stickR, fill)
        c.drawCircle(stickCx, stickCy, stickR, stroke)
        fill.color = if (stickPointer >= 0) Color.argb(200, 255, 105, 0) else Color.argb(130, 255, 255, 255)
        c.drawCircle(knobX, knobY, stickR * 0.42f, fill)
        // Botones
        for (b in buttons) {
            fill.color = if (b.pressed) Color.argb(210, Color.red(accent), Color.green(accent), Color.blue(accent)) else Color.argb(70, 255, 255, 255)
            if (b.round) {
                c.drawCircle(b.r.centerX(), b.r.centerY(), b.r.width() / 2, fill)
                c.drawCircle(b.r.centerX(), b.r.centerY(), b.r.width() / 2, stroke)
            } else {
                val rr = b.r.height() / 2
                c.drawRoundRect(b.r, rr, rr, fill)
                c.drawRoundRect(b.r, rr, rr, stroke)
            }
            val size = text.textSize
            if (b.label.length > 2) text.textSize = size * 0.7f
            c.drawText(b.label, b.r.centerX(), b.r.centerY() - (text.descent() + text.ascent()) / 2, text)
            text.textSize = size
        }
        // Menú (≡)
        fill.color = Color.argb(if (menuPointer >= 0) 200 else 70, 255, 255, 255)
        val rr = menuRect.height() / 2
        c.drawRoundRect(menuRect, rr, rr, fill)
        c.drawRoundRect(menuRect, rr, rr, stroke)
        val lx1 = menuRect.centerX() - menuRect.width() * 0.22f
        val lx2 = menuRect.centerX() + menuRect.width() * 0.22f
        for (i in -1..1) {
            val y = menuRect.centerY() + i * menuRect.height() * 0.2f
            c.drawLine(lx1, y, lx2, y, stroke)
        }
    }

    private fun hit(x: Float, y: Float): Btn? {
        // Zona un poco más grande que el dibujo para que sea fácil acertar
        return buttons.firstOrNull { b ->
            val pad = b.r.height() * 0.25f
            x >= b.r.left - pad && x <= b.r.right + pad && y >= b.r.top - pad && y <= b.r.bottom + pad
        }
    }

    private fun inStickZone(x: Float, y: Float) = x < width * 0.45f && y > height * 0.3f && hit(x, y) == null

    private fun moveStick(x: Float, y: Float) {
        var dx = x - stickCx
        var dy = y - stickCy
        val d = hypot(dx, dy)
        if (d > stickR) { dx = dx / d * stickR; dy = dy / d * stickR }
        knobX = stickCx + dx; knobY = stickCy + dy
        onStick(dx / stickR, dy / stickR)
    }

    private fun press(pointer: Int, b: Btn?) {
        val old = owner[pointer]
        if (old === b) return
        if (old != null) { old.pressed = owner.filter { it.key != pointer }.values.any { it === old }; if (!old.pressed) onKey(old.code, false) }
        if (b != null) {
            owner[pointer] = b
            if (!b.pressed) { b.pressed = true; onKey(b.code, true); performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY) }
        } else owner.remove(pointer)
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(e: MotionEvent): Boolean {
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> {
                val i = e.actionIndex
                val id = e.getPointerId(i)
                val x = e.getX(i)
                val y = e.getY(i)
                when {
                    menuRect.contains(x, y) -> menuPointer = id
                    stickPointer < 0 && inStickZone(x, y) -> { stickPointer = id; moveStick(x, y); performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY) }
                    else -> press(id, hit(x, y))
                }
            }
            MotionEvent.ACTION_MOVE -> {
                for (i in 0 until e.pointerCount) {
                    val id = e.getPointerId(i)
                    if (id == stickPointer) moveStick(e.getX(i), e.getY(i))
                    else if (id != menuPointer && owner.containsKey(id)) press(id, hit(e.getX(i), e.getY(i)))
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP, MotionEvent.ACTION_CANCEL -> {
                val all = e.actionMasked == MotionEvent.ACTION_CANCEL
                val ids = if (all) (0 until e.pointerCount).map { e.getPointerId(it) } else listOf(e.getPointerId(e.actionIndex))
                for (id in ids) {
                    if (id == stickPointer) { stickPointer = -1; knobX = stickCx; knobY = stickCy; onStick(0f, 0f) }
                    if (id == menuPointer) { menuPointer = -1; if (!all) onMenu() }
                    press(id, null)
                }
            }
        }
        invalidate()
        return true
    }

    /** Suelta todo (al ocultar los controles o abrir el menú). */
    fun releaseAll() {
        owner.keys.toList().forEach { press(it, null) }
        if (stickPointer >= 0) { stickPointer = -1; knobX = stickCx; knobY = stickCy; onStick(0f, 0f) }
        menuPointer = -1
        invalidate()
    }
}
