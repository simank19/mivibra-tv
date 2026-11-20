package co.mivibra.tv

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/** Avisos de partidos: se programan con AlarmManager y llegan como notificación aunque la app esté cerrada. */
class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val title = intent.getStringExtra("title") ?: return
        val text = intent.getStringExtra("text") ?: ""
        val id = intent.getIntExtra("nid", 1)
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel(CH, "Partidos", NotificationManager.IMPORTANCE_HIGH))
        val open = PendingIntent.getActivity(ctx, id, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        @Suppress("DEPRECATION")
        val b = if (Build.VERSION.SDK_INT >= 26) android.app.Notification.Builder(ctx, CH) else android.app.Notification.Builder(ctx).setPriority(android.app.Notification.PRIORITY_HIGH)
        b.setSmallIcon(R.drawable.mv_ic_sports).setContentTitle(title).setContentText(text).setAutoCancel(true).setContentIntent(open)
        try { nm.notify(id, b.build()) } catch (_: Exception) {}
    }

    companion object {
        const val CH = "partidos"
        private fun pi(ctx: Context, key: String, title: String = "", text: String = ""): PendingIntent {
            val nid = key.hashCode()
            val i = Intent(ctx, ReminderReceiver::class.java).setAction("co.mivibra.tv.REMIND.$key").putExtra("title", title).putExtra("text", text).putExtra("nid", nid)
            return PendingIntent.getBroadcast(ctx, nid, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
        fun set(ctx: Context, key: String, at: Long, title: String, text: String) {
            val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val p = pi(ctx, key, title, text)
            // Sin permiso de alarma exacta: llega con un margen de unos minutos (suficiente para un aviso de 15 min antes)
            if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p) else am.set(AlarmManager.RTC_WAKEUP, at, p)
        }
        fun cancel(ctx: Context, key: String) {
            (ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pi(ctx, key))
        }
    }
}
