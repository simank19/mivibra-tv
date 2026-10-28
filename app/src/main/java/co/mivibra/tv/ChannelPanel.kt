package co.mivibra.tv

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.TextUtils
import android.text.TextWatcher
import android.util.LruCache
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.AdapterView
import android.widget.BaseAdapter
import android.widget.EditText
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.Normalizer
import java.util.concurrent.Executors

/**
 * Lista de canales dentro del reproductor de TV en vivo (estilo de las apps IPTV):
 * a la izquierda los íconos Buscar, Recientes, Favoritos y Lista; a la derecha los canales con logo y número.
 * En TV se abre con OK o ◀; en el celular vertical queda fija debajo del video.
 */
class ChannelPanel(
    private val a: Activity,
    private val items: JSONArray,
    private val recentIds: List<String>,
    private val touch: Boolean,
    private val onPick: (Int) -> Unit,
    private val onActivity: () -> Unit
) {
    val root = LinearLayout(a)
    private val rail = LinearLayout(a)
    private val title = TextView(a)
    private val search = EditText(a)
    private val list = ListView(a)
    private val hintView = TextView(a)
    private var shown: List<Int> = emptyList()
    private var mode = "all"
    private var current = -1
    private val railBtns = mutableMapOf<String, ImageButton>()
    private val accent = 0xFFFF6900.toInt()

    private fun dp(v: Int) = (v * a.resources.displayMetrics.density).toInt()

    init {
        root.orientation = LinearLayout.HORIZONTAL
        root.setBackgroundColor(0xF20B0E18.toInt())
        root.isClickable = true

        // Íconos de secciones
        rail.orientation = LinearLayout.VERTICAL
        rail.gravity = Gravity.CENTER_HORIZONTAL
        rail.setPadding(0, dp(28), 0, dp(12))
        rail.setBackgroundColor(0xFF06080F.toInt())
        listOf("search" to R.drawable.mv_ic_search, "recent" to R.drawable.mv_ic_clock, "fav" to R.drawable.mv_ic_star, "all" to R.drawable.mv_ic_list).forEach { (m, ic) ->
            val b = ImageButton(a).apply {
                setImageResource(ic)
                scaleType = ImageView.ScaleType.FIT_CENTER
                setPadding(dp(12), dp(12), dp(12), dp(12))
                background = StateListDrawable().apply {
                    addState(intArrayOf(android.R.attr.state_focused), GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(accent) })
                    addState(intArrayOf(), ColorDrawable(Color.TRANSPARENT))
                }
                isFocusable = true
                contentDescription = when (m) { "search" -> "Buscar"; "recent" -> "Recientes"; "fav" -> "Favoritos"; else -> "Lista de canales" }
                setOnClickListener { setMode(m); if (m == "search") focusSearch() else list.requestFocus() }
                setOnFocusChangeListener { _, has -> if (has && m != "search") setMode(m) }
            }
            railBtns[m] = b
            rail.addView(b, LinearLayout.LayoutParams(dp(52), dp(52)).apply { bottomMargin = dp(18) })
        }
        root.addView(rail, LinearLayout.LayoutParams(dp(68), ViewGroup.LayoutParams.MATCH_PARENT))

        // Columna de canales
        val col = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL }
        title.apply {
            setTextColor(0xFFCFD6E6.toInt())
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            setPadding(dp(18), dp(16), dp(18), dp(12))
        }
        search.apply {
            hint = "Buscar canal"
            setHintTextColor(0x88FFFFFF.toInt())
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
            isSingleLine = true
            imeOptions = EditorInfo.IME_ACTION_SEARCH
            background = GradientDrawable().apply { cornerRadius = dp(22).toFloat(); setColor(0x22FFFFFF) }
            setPadding(dp(16), dp(10), dp(16), dp(10))
            visibility = View.GONE
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, st: Int, c: Int, af: Int) {}
                override fun onTextChanged(s: CharSequence?, st: Int, b: Int, c: Int) {}
                override fun afterTextChanged(s: Editable?) { if (mode == "search") refresh() }
            })
            setOnEditorActionListener { _, _, _ -> list.requestFocus(); true }
        }
        col.addView(title, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        col.addView(search, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { setMargins(dp(14), 0, dp(14), dp(8)) })
        col.addView(View(a).apply { setBackgroundColor(0x33FFFFFF) }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1)))
        list.apply {
            divider = ColorDrawable(0x22FFFFFF)
            dividerHeight = dp(1)
            selector = StateListDrawable().apply {
                addState(intArrayOf(android.R.attr.state_focused), ColorDrawable(0x55FF6900))
                addState(intArrayOf(android.R.attr.state_pressed), ColorDrawable(0x33FFFFFF))
                addState(intArrayOf(), ColorDrawable(Color.TRANSPARENT))
            }
            isFocusable = true
            itemsCanFocus = false
            adapter = Adapter()
            onItemClickListener = AdapterView.OnItemClickListener { _, _, pos, _ -> shown.getOrNull(pos)?.let { onPick(it) } }
            setOnKeyListener { _, _, e -> onActivity(); if (e.action == KeyEvent.ACTION_DOWN) onActivity(); false }
        }
        col.addView(list, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        hintView.apply {
            text = if (touch) "Toca un canal para verlo" else "OK: ver canal   ◀ Secciones   ▶ Cerrar"
            setTextColor(0x99FFFFFF.toInt())
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            setPadding(dp(18), dp(10), dp(18), dp(12))
        }
        col.addView(hintView, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(col, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f))
        setMode("all")
    }

    fun hasFocus() = root.hasFocus()

    fun setCurrent(i: Int) { current = i; (list.adapter as BaseAdapter).notifyDataSetChanged() }

    /** Abre la lista con el canal actual seleccionado. */
    fun focusCurrent() {
        if (mode == "search") setMode("all")
        val pos = shown.indexOf(current).coerceAtLeast(0)
        list.setSelection(pos)
        list.requestFocus()
        list.post { list.setSelection(pos) }
    }

    private fun focusSearch() {
        search.visibility = View.VISIBLE
        search.requestFocus()
        val im = a.getSystemService(Activity.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
        im.showSoftInput(search, 0)
    }

    private fun setMode(m: String) {
        if (mode == m && shown.isNotEmpty()) return
        mode = m
        search.visibility = if (m == "search") View.VISIBLE else View.GONE
        refresh()
    }

    private fun norm(s: String) = Normalizer.normalize(s.lowercase(), Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "")

    private fun refresh() {
        val all = (0 until items.length()).toList()
        shown = when (mode) {
            "fav" -> all.filter { items.optJSONObject(it)?.optBoolean("fav") == true }
            "recent" -> recentIds.mapNotNull { id -> all.firstOrNull { items.optJSONObject(it)?.optString("id") == id } }
            "search" -> {
                val q = norm(search.text.toString().trim())
                if (q.isEmpty()) all else all.filter { norm(items.optJSONObject(it)?.optString("title") ?: "").contains(q) }
            }
            else -> all
        }
        title.text = when (mode) {
            "fav" -> "Favoritos" + if (shown.isEmpty()) " · aún no tienes" else ""
            "recent" -> "Vistos recientemente" + if (shown.isEmpty()) " · aún no hay" else ""
            "search" -> "Buscar · ${shown.size} canales"
            else -> "Lista de canales · ${shown.size}"
        }
        (list.adapter as BaseAdapter).notifyDataSetChanged()
    }

    private inner class Adapter : BaseAdapter() {
        override fun getCount() = shown.size
        override fun getItem(p: Int): Any = items.optJSONObject(shown[p]) ?: JSONObject()
        override fun getItemId(p: Int) = shown[p].toLong()
        override fun getView(p: Int, convert: View?, parent: ViewGroup?): View {
            val row = (convert as? LinearLayout) ?: LinearLayout(a).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(14), dp(10), dp(14), dp(10))
                addView(ImageView(a).apply { scaleType = ImageView.ScaleType.FIT_CENTER }, LinearLayout.LayoutParams(dp(64), dp(42)))
                addView(TextView(a).apply {
                    setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
                    isSingleLine = true
                    ellipsize = TextUtils.TruncateAt.END
                    setPadding(dp(16), 0, 0, 0)
                }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            }
            val idx = shown[p]
            val o = items.optJSONObject(idx) ?: JSONObject()
            val img = row.getChildAt(0) as ImageView
            val tv = row.getChildAt(1) as TextView
            val num = o.optString("num").ifBlank { (idx + 1).toString() }
            tv.text = num + "  " + o.optString("title")
            val playing = idx == current
            tv.setTextColor(if (playing) accent else Color.WHITE)
            tv.typeface = if (playing) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
            Logos.load(o.optString("logo"), img)
            return row
        }
    }
}

/** Carga de logos de canales con caché en memoria. */
object Logos {
    private val cache = object : LruCache<String, Bitmap>(16 * 1024 * 1024) { override fun sizeOf(k: String, v: Bitmap) = v.byteCount }
    private val pool = Executors.newFixedThreadPool(3)
    private val ui = Handler(Looper.getMainLooper())

    fun load(url: String, iv: ImageView) {
        iv.tag = url
        if (!url.startsWith("http")) { iv.setImageDrawable(null); return }
        cache.get(url)?.let { iv.setImageBitmap(it); return }
        iv.setImageDrawable(null)
        pool.execute {
            val bmp = try {
                val c = URL(url).openConnection() as HttpURLConnection
                c.connectTimeout = 6000; c.readTimeout = 8000
                c.setRequestProperty("User-Agent", Net.UA)
                val bytes = c.inputStream.use { it.readBytes() }
                val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, o)
                var s = 1
                while (o.outWidth / (s * 2) >= 160 && o.outHeight / (s * 2) >= 100) s *= 2
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = s })
            } catch (_: Throwable) { null }
            if (bmp != null) {
                cache.put(url, bmp)
                ui.post { if (iv.tag == url) iv.setImageBitmap(bmp) }
            }
        }
    }
}
