package co.mivibra.tv

import android.util.Xml
import org.json.JSONArray
import org.json.JSONObject
import org.xmlpull.v1.XmlPullParser
import java.io.InputStream
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/** Lee guías XMLTV (también .gz) y devuelve solo la programación cercana, en JSON compacto. */
object Epg {
    private val fmtTz = SimpleDateFormat("yyyyMMddHHmmss Z", Locale.US)
    private val fmtUtc = SimpleDateFormat("yyyyMMddHHmmss", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }

    private fun time(s: String?): Long {
        if (s.isNullOrBlank()) return 0
        val t = s.trim()
        return try {
            if (t.length > 14 && t.contains(' ')) fmtTz.parse(t)?.time ?: 0 else fmtUtc.parse(t.take(14))?.time ?: 0
        } catch (_: Exception) {
            0
        }
    }

    fun parse(input: InputStream, wanted: Set<String>, hoursAhead: Int): JSONObject {
        val now = System.currentTimeMillis()
        val from = now - 3 * 3600_000L
        val to = now + hoursAhead * 3600_000L
        val channels = JSONObject()
        val progs = HashMap<String, JSONArray>()
        var count = 0

        val p = Xml.newPullParser()
        p.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false)
        p.setInput(input, null)

        var ev = p.eventType
        var chId: String? = null
        var chName: String? = null
        var chIcon: String? = null
        var prCh: String? = null
        var prStart = 0L
        var prStop = 0L
        var prTitle: String? = null
        var prDesc: String? = null
        var keep = false
        var field: String? = null

        while (ev != XmlPullParser.END_DOCUMENT) {
            when (ev) {
                XmlPullParser.START_TAG -> when (p.name) {
                    "channel" -> {
                        chId = p.getAttributeValue(null, "id"); chName = null; chIcon = null
                    }
                    "display-name" -> field = if (chId != null && prCh == null && chName == null) "cname" else null
                    "icon" -> if (chId != null && prCh == null) chIcon = p.getAttributeValue(null, "src")
                    "programme" -> {
                        prCh = p.getAttributeValue(null, "channel")
                        val chKey = prCh?.lowercase()
                        prStart = time(p.getAttributeValue(null, "start"))
                        prStop = time(p.getAttributeValue(null, "stop"))
                        keep = chKey != null && prStop > from && prStart < to &&
                            (wanted.isEmpty() || wanted.contains(chKey)) && count < 200_000
                        prTitle = null; prDesc = null
                    }
                    "title" -> field = if (keep && prTitle == null) "title" else null
                    "desc" -> field = if (keep && prDesc == null) "desc" else null
                    else -> field = null
                }
                XmlPullParser.TEXT -> when (field) {
                    "cname" -> chName = (chName ?: "") + p.text
                    "title" -> prTitle = (prTitle ?: "") + p.text
                    "desc" -> prDesc = (prDesc ?: "") + p.text
                }
                XmlPullParser.END_TAG -> {
                    when (p.name) {
                        "channel" -> {
                            val id = chId
                            if (id != null && (wanted.isEmpty() || wanted.contains(id.lowercase()))) {
                                channels.put(id, JSONObject().put("n", chName?.trim() ?: id).put("i", chIcon ?: ""))
                            }
                            chId = null
                        }
                        "programme" -> {
                            val ch = prCh
                            if (keep && ch != null) {
                                val o = JSONObject()
                                    .put("s", prStart)
                                    .put("e", prStop)
                                    .put("t", prTitle?.trim() ?: "")
                                val d = prDesc?.trim()
                                if (!d.isNullOrEmpty()) o.put("d", if (d.length > 400) d.take(400) + "…" else d)
                                progs.getOrPut(ch) { JSONArray() }.put(o)
                                count++
                            }
                            prCh = null; keep = false
                        }
                    }
                    field = null
                }
            }
            ev = p.next()
        }
        val out = JSONObject()
        val pj = JSONObject()
        for ((k, v) in progs) pj.put(k, v)
        out.put("channels", channels).put("progs", pj).put("count", count)
        return out
    }
}
