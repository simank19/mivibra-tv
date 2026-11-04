package co.mivibra.tv.launcher

import android.app.UiModeManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.content.res.Configuration

/** Activa "Inicio MiVibra" como pantalla de inicio posible, solo en televisores. */
object HomeSetup {
    fun isTv(c: Context): Boolean {
        val ui = c.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
        return ui?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION ||
            c.packageManager.hasSystemFeature("android.software.leanback")
    }

    fun ensure(c: Context) {
        if (!isTv(c)) return
        try {
            val cn = ComponentName(c, "co.mivibra.tv.launcher.HomeAlias")
            if (c.packageManager.getComponentEnabledSetting(cn) != PackageManager.COMPONENT_ENABLED_STATE_ENABLED) {
                c.packageManager.setComponentEnabledSetting(cn, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
            }
        } catch (_: Exception) {}
    }
}
