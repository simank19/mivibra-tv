package co.mivibra.tv

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File

/** Descarga la APK nueva y abre el instalador de Android. */
object Updater {
    fun apkFile(a: MainActivity): File = File(File(a.cacheDir, "updates").apply { mkdirs() }, "MiVibraTV-update.apk")

    /** true si Android ya permite que esta app instale actualizaciones. */
    fun canInstall(a: MainActivity): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O || a.packageManager.canRequestPackageInstalls()

    /** Abre el ajuste "Instalar apps desconocidas" de MiVibra TV. */
    fun askPermission(a: MainActivity) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val i = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + a.packageName))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try { a.startActivity(i) } catch (_: Exception) {
            a.startActivity(Intent(Settings.ACTION_SECURITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    fun install(a: MainActivity, f: File) {
        val uri = FileProvider.getUriForFile(a, a.packageName + ".files", f)
        val i = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        a.startActivity(i)
    }
}
