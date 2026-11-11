package co.mivibra.tv

import android.app.Activity
import android.app.Dialog
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.os.Build
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * Menú con el mismo estilo "glass" de la plataforma (fondo oscuro translúcido, bordes redondeados,
 * opciones tipo píldora y foco con aro naranja). Reemplaza los AlertDialog del reproductor y de los juegos.
 */
class GlassMenu(private val act: Activity, private val title: String) {
    private sealed class Entry
    private class Header(val text: String) : Entry()
    private class Note(val text: String) : Entry()
    private class Opt(val label: String, val selected: Boolean?, val action: (() -> Unit)?, val keepOpen: Boolean) : Entry()
    private class Custom(val view: View) : Entry()

    private val entries = mutableListOf<Entry>()
    private var subtitle: String? = null
    private var closeText = "Listo"
    private var closeAction: (() -> Unit)? = null
    private var dismissCb: (() -> Unit)? = null
    private var chips = false

    fun subtitle(t: String) = apply { subtitle = t }
    fun header(t: String) = apply { entries.add(Header(t)) }
    fun note(t: String) = apply { entries.add(Note(t)) }
    /** selected: null = acción simple; true/false = opción marcable. */
    fun option(label: String, selected: Boolean? = null, keepOpen: Boolean = false, action: (() -> Unit)?) = apply { entries.add(Opt(label, selected, action, keepOpen)) }
    fun custom(v: View) = apply { entries.add(Custom(v)) }
    fun close(text: String, action: (() -> Unit)? = null) = apply { closeText = text; closeAction = action }
    fun onDismiss(cb: () -> Unit) = apply { dismissCb = cb }
    /** Opciones de cada sección en fila (como píldoras), en vez de una debajo de otra. */
    fun chips(on: Boolean = true) = apply { chips = on }

    private fun dp(v: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, act.resources.displayMetrics).toInt()

    private fun pill(selected: Boolean): StateListDrawable {
        fun shape(fill: Int, stroke: Int, w: Float) = GradientDrawable().apply {
            cornerRadius = dp(999f).toFloat(); setColor(fill); setStroke(dp(w), stroke)
        }
        val base = if (selected) 0x40FF6900 else 0x1AFFFFFF
        val edge = if (selected) 0x99FF8A2A.toInt() else 0x33FFFFFF
        return StateListDrawable().apply {
            addState(intArrayOf(android.R.attr.state_focused), shape(if (selected) 0x59FF6900 else 0x33FFFFFF, 0xFFFF8A1F.toInt(), 2.5f))
            addState(intArrayOf(android.R.attr.state_pressed), shape(0x40FFFFFF, 0xFFFF8A1F.toInt(), 2.5f))
            addState(intArrayOf(), shape(base, edge, 1f))
        }
    }

    private fun text(t: String, sp: Float, bold: Boolean, color: Int) = TextView(act).apply {
        text = t; setTextColor(color); setTextSize(TypedValue.COMPLEX_UNIT_SP, sp)
        if (bold) typeface = Typeface.create("sans-serif", Typeface.BOLD)
    }

    private fun optView(o: Opt, d: Dialog): TextView = TextView(act).apply {
        val mark = when (o.selected) { true -> "✓  "; else -> "" }
        text = mark + o.label
        setTextColor(if (o.action == null && o.selected == null) 0x99FFFFFF.toInt() else Color.WHITE)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
        typeface = Typeface.create("sans-serif-medium", if (o.selected == true) Typeface.BOLD else Typeface.NORMAL)
        setPadding(dp(18f), dp(10f), dp(18f), dp(10f))
        background = pill(o.selected == true)
        isFocusable = true; isClickable = true
        tag = if (o.selected == true) "sel" else null
        setOnFocusChangeListener { v, f -> v.animate().scaleX(if (f) 1.04f else 1f).scaleY(if (f) 1.04f else 1f).setDuration(120).start() }
        setOnClickListener {
            val a = o.action ?: return@setOnClickListener
            if (!o.keepOpen) d.dismiss()
            a()
        }
    }

    fun show(): Dialog {
        val d = Dialog(act)
        val panel = LinearLayout(act).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(28f), dp(24f), dp(28f), dp(20f))
            background = GradientDrawable().apply {
                cornerRadius = dp(26f).toFloat()
                setColor(0xE6161B26.toInt())
                setStroke(dp(1f), 0x38FFFFFF)
            }
            elevation = dp(16f).toFloat()
        }
        panel.addView(text(title, 24f, true, Color.WHITE))
        subtitle?.let { panel.addView(text(it, 15f, false, 0xD9FFFFFF.toInt()).apply { setPadding(0, dp(8f), 0, 0) }) }

        val body = LinearLayout(act).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(2f), dp(6f), dp(2f), dp(6f)) }
        var row: ViewGroup? = null
        fun newRow(): ViewGroup {
            val r: ViewGroup = if (chips) FlowRow(act, dp(10f)) else LinearLayout(act).apply { orientation = LinearLayout.VERTICAL }
            body.addView(r, LinearLayout.LayoutParams(-1, -2)); row = r; return r
        }
        for (e in entries) when (e) {
            is Header -> { body.addView(text(e.text, 17f, true, Color.WHITE).apply { setPadding(0, dp(16f), 0, dp(8f)) }); row = null }
            is Note -> { body.addView(text(e.text, 14f, false, 0xB3FFFFFF.toInt()).apply { setPadding(dp(4f), dp(6f), 0, dp(4f)) }); row = null }
            is Custom -> { body.addView(e.view, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8f) }); row = null }
            is Opt -> {
                val r = row ?: newRow()
                val v = optView(e, d)
                if (chips) r.addView(v, ViewGroup.MarginLayoutParams(-2, -2))
                else r.addView(v, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(5f); bottomMargin = dp(5f) })
            }
        }
        val scroll = ScrollView(act).apply { isVerticalScrollBarEnabled = false; isFillViewport = false; addView(body) }
        val dm = act.resources.displayMetrics
        val maxH = (dm.heightPixels * 0.62f).toInt()
        panel.addView(object : FrameLayout(act) {
            override fun onMeasure(w: Int, h: Int) { super.onMeasure(w, View.MeasureSpec.makeMeasureSpec(maxH, View.MeasureSpec.AT_MOST)) }
        }.apply { addView(scroll) }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(6f) })

        val closeBtn = optView(Opt(closeText, null, { closeAction?.invoke() }, false), d).apply {
            setTypeface(typeface, Typeface.BOLD); gravity = Gravity.CENTER; minWidth = dp(110f)
        }
        panel.addView(closeBtn, LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(14f) })

        val width = minOf(dp(620f), (dm.widthPixels * 0.9f).toInt())
        val root = FrameLayout(act).apply { addView(panel, FrameLayout.LayoutParams(width, -2, Gravity.CENTER)) }
        d.setContentView(root)
        d.window?.apply {
            setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
            setDimAmount(0.45f)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                addFlags(WindowManager.LayoutParams.FLAG_BLUR_BEHIND)
                attributes = attributes.apply { blurBehindRadius = dp(18f) }
            }
        }
        root.setOnClickListener { d.dismiss() }
        panel.isClickable = true
        d.setOnDismissListener { dismissCb?.invoke() }
        d.show()
        // Foco en la opción marcada (o la primera)
        body.post {
            val sel = body.findViewWithTag<View>("sel") ?: firstFocusable(body) ?: closeBtn
            sel.requestFocus()
        }
        return d
    }

    private fun firstFocusable(g: ViewGroup): View? {
        for (i in 0 until g.childCount) {
            val c = g.getChildAt(i)
            if (c.isFocusable && c.visibility == View.VISIBLE) return c
            if (c is ViewGroup) firstFocusable(c)?.let { return it }
        }
        return null
    }

    /** Fila que acomoda las píldoras y salta de línea cuando no caben. */
    private class FlowRow(ctx: android.content.Context, val gap: Int) : ViewGroup(ctx) {
        override fun onMeasure(wSpec: Int, hSpec: Int) {
            val maxW = View.MeasureSpec.getSize(wSpec)
            var x = 0; var y = 0; var lineH = 0
            for (i in 0 until childCount) {
                val c = getChildAt(i)
                c.measure(View.MeasureSpec.makeMeasureSpec(maxW, View.MeasureSpec.AT_MOST), View.MeasureSpec.UNSPECIFIED)
                if (x > 0 && x + c.measuredWidth > maxW) { x = 0; y += lineH + gap; lineH = 0 }
                x += c.measuredWidth + gap; lineH = maxOf(lineH, c.measuredHeight)
            }
            setMeasuredDimension(maxW, y + lineH + gap / 2)
        }
        override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
            val maxW = r - l
            var x = 0; var y = gap / 4; var lineH = 0
            for (i in 0 until childCount) {
                val c = getChildAt(i)
                if (x > 0 && x + c.measuredWidth > maxW) { x = 0; y += lineH + gap; lineH = 0 }
                c.layout(x, y, x + c.measuredWidth, y + c.measuredHeight)
                x += c.measuredWidth + gap; lineH = maxOf(lineH, c.measuredHeight)
            }
        }
    }
}
