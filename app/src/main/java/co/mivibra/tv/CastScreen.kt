package co.mivibra.tv

import android.app.Activity
import android.content.Intent
import android.provider.Settings
import android.widget.Toast

/**
 * Pantalla inalámbrica (Miracast / Transmitir pantalla): abre el menú del sistema para elegir el TV.
 * Cada marca lo llama distinto, así que se prueban varias pantallas de ajustes en orden.
 */
object CastScreen {
    fun open(a: Activity) {
        val tries = listOf(
            Intent("android.settings.CAST_SETTINGS"),
            Intent("android.settings.WIFI_DISPLAY_SETTINGS"),
            Intent().setClassName("com.milink.service", "com.milink.ui.activity.ScreeningConnectActivity"),
            Intent(Settings.ACTION_WIRELESS_SETTINGS)
        )
        for (i in tries) {
            try { a.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return } catch (_: Exception) {}
        }
        Toast.makeText(a, "Abre «Transmitir» o «Pantalla inalámbrica» desde los accesos rápidos del celular", Toast.LENGTH_LONG).show()
    }
}
