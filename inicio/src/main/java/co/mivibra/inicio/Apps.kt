package co.mivibra.inicio

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.media.tv.TvContract
import android.media.tv.TvInputInfo
import android.media.tv.TvInputManager
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

/** Apps instaladas (con su banner o ícono guardado como PNG) y entradas HDMI de la TV. */
object Apps {
    @Volatile private var cache: String? = null

    fun iconDir(c: Context) = File(c.cacheDir, "launcher-icons").apply { mkdirs() }

    fun invalidate() { cache = null }

    /** [{pkg,label,banner:"/icons/x.png"|"",icon:"/icons/y.png"}] ordenado por nombre. */
    fun list(c: Context): String {
        cache?.let { return it }
        val pm = c.packageManager
        val seen = LinkedHashMap<String, JSONObject>()
        val cats = listOf(Intent.CATEGORY_LEANBACK_LAUNCHER, Intent.CATEGORY_LAUNCHER)
        for (cat in cats) {
            val q = Intent(Intent.ACTION_MAIN).addCategory(cat)
            val res = try { pm.queryIntentActivities(q, 0) } catch (_: Exception) { emptyList() }
            for (ri in res) {
                val ai = ri.activityInfo ?: continue
                val pkg = ai.packageName
                if (pkg == c.packageName || seen.containsKey(pkg)) continue
                val label = try { ri.loadLabel(pm).toString() } catch (_: Exception) { pkg }
                val stamp = try { pm.getPackageInfo(pkg, 0).lastUpdateTime } catch (_: Exception) { 0L }
                val base = pkg.replace('.', '_') + "_" + stamp
                val bannerDr: Drawable? = try { ai.loadBanner(pm) ?: ai.applicationInfo.loadBanner(pm) } catch (_: Exception) { null }
                val iconDr: Drawable? = try { ri.loadIcon(pm) } catch (_: Exception) { null }
                val banner = bannerDr?.let { save(c, it, base + "_b.png", 320, 180) } ?: ""
                val icon = iconDr?.let { save(c, it, base + "_i.png", 160, 160) } ?: ""
                seen[pkg] = JSONObject().put("pkg", pkg).put("label", label).put("banner", banner).put("icon", icon)
                    .put("tv", cat == Intent.CATEGORY_LEANBACK_LAUNCHER)
            }
        }
        val arr = JSONArray()
        seen.values.sortedBy { it.optString("label").lowercase() }.forEach { arr.put(it) }
        return arr.toString().also { cache = it }
    }

    private fun save(c: Context, d: Drawable, name: String, w: Int, h: Int): String? {
        val f = File(iconDir(c), name)
        if (f.exists() && f.length() > 0) return "/icons/$name"
        return try {
            val bmp = if (d is BitmapDrawable && d.bitmap != null) {
                val b = d.bitmap
                val scale = minOf(w.toFloat() / b.width, h.toFloat() / b.height, 1f)
                Bitmap.createScaledBitmap(b, maxOf(1, (b.width * scale).toInt()), maxOf(1, (b.height * scale).toInt()), true)
            } else {
                val iw = if (d.intrinsicWidth > 0) d.intrinsicWidth else w
                val ih = if (d.intrinsicHeight > 0) d.intrinsicHeight else h
                val scale = minOf(w.toFloat() / iw, h.toFloat() / ih)
                val bw = maxOf(1, (iw * scale).toInt())
                val bh = maxOf(1, (ih * scale).toInt())
                Bitmap.createBitmap(bw, bh, Bitmap.Config.ARGB_8888).also {
                    val cv = Canvas(it)
                    d.setBounds(0, 0, bw, bh)
                    d.draw(cv)
                }
            }
            FileOutputStream(f).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
            "/icons/$name"
        } catch (_: Exception) { null }
    }

    fun launch(c: Context, pkg: String): Boolean {
        val pm = c.packageManager
        val i = pm.getLeanbackLaunchIntentForPackage(pkg) ?: pm.getLaunchIntentForPackage(pkg) ?: return false
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
        return try { c.startActivity(i); true } catch (_: Exception) { false }
    }

    fun details(c: Context, pkg: String): Boolean = try {
        c.startActivity(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            .setData(android.net.Uri.parse("package:$pkg")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (_: Exception) { false }

    // ---------------- Entradas (HDMI, AV) ----------------

    /** [{id,label,type}] solo entradas físicas. */
    fun inputs(c: Context): String {
        val arr = JSONArray()
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return arr.toString()
        try {
            val tim = c.getSystemService(Context.TV_INPUT_SERVICE) as? TvInputManager ?: return arr.toString()
            for (info in tim.tvInputList) {
                if (!info.isPassthroughInput) continue
                if (info.parentId != null) continue
                val type = when (info.type) {
                    TvInputInfo.TYPE_HDMI -> "hdmi"
                    TvInputInfo.TYPE_COMPONENT, TvInputInfo.TYPE_COMPOSITE, TvInputInfo.TYPE_SCART, TvInputInfo.TYPE_SVIDEO -> "av"
                    TvInputInfo.TYPE_VGA, TvInputInfo.TYPE_DVI, TvInputInfo.TYPE_DISPLAY_PORT -> "pc"
                    else -> "otro"
                }
                val label = try { info.loadCustomLabel(c)?.toString()?.takeIf { it.isNotBlank() } ?: info.loadLabel(c).toString() } catch (_: Exception) { info.id }
                arr.put(JSONObject().put("id", info.id).put("label", label).put("type", type))
            }
        } catch (_: Exception) {}
        return arr.toString()
    }

    fun openInput(c: Context, id: String): Boolean = try {
        c.startActivity(Intent(Intent.ACTION_VIEW, TvContract.buildChannelUriForPassthroughInput(id))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (_: Exception) { false }

    fun hasPackage(c: Context, pkg: String) = try { c.packageManager.getPackageInfo(pkg, 0); true } catch (_: PackageManager.NameNotFoundException) { false }
}
