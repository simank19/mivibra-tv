package co.mivibra.tv

import android.app.Service
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.os.Message
import android.os.Messenger
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/** Telegram (TDLib) corre en su propio proceso (":tg"): si la librería nativa falla en un equipo, se cae solo ese proceso,
 *  MiVibra sigue abierta y muestra el motivo. La app le habla por mensajes (método + argumentos en JSON). */
class TgService : Service() {
    private val pool = Executors.newFixedThreadPool(4)
    private val messenger = Messenger(Handler(Looper.getMainLooper()) { msg ->
        val b = Bundle(msg.data); val to = msg.replyTo
        val rid = b.getInt("id"); val m = b.getString("m") ?: ""; val a = try { JSONArray(b.getString("a") ?: "[]") } catch (_: Exception) { JSONArray() }
        pool.execute {
            val out = Bundle(); out.putInt("id", rid)
            try {
                val r = run(m, a) { p -> send(to, Bundle().apply { putInt("id", rid); putInt("p", p) }) }
                out.putBoolean("ok", true); out.putString("r", JSONObject().put("v", r ?: JSONObject.NULL).toString())
            } catch (e: Throwable) { out.putBoolean("ok", false); out.putString("r", e.message ?: e.javaClass.simpleName) }
            send(to, out)
        }
        true
    })

    private fun send(to: Messenger?, b: Bundle) { try { to?.send(Message.obtain().apply { data = b }) } catch (_: Exception) {} }

    private fun run(m: String, a: JSONArray, tick: (Int) -> Unit): Any? = when (m) {
        "state" -> Tg.status()
        "start" -> Tg.start(this, a.getInt(0), a.getString(1), tick)
        "phone" -> { Tg.phone(a.getString(0)); true }
        "code" -> { Tg.code(a.getString(0)); true }
        "password" -> { Tg.password(a.getString(0)); true }
        "logout" -> { Tg.logout(); true }
        "chats" -> Tg.chats()
        "chatFiles" -> Tg.chatFiles(a.getString(0).toLong(), a.getString(1).toLongOrNull() ?: 0L, a.getInt(2), a.getString(3), a.getString(4))
        "search" -> Tg.search(a.getString(0), a.getString(1), a.getString(2))
        "public" -> Tg.publicChat(a.getString(0))
        "history" -> Tg.history(a.getString(0).toLong(), a.getInt(1))
        "message" -> Tg.message(a.getString(0).toLong(), a.getString(1).toLong()) ?: JSONObject()
        "thumb" -> Tg.thumb(a.getInt(0))
        "fetch" -> Tg.fetchFile(a.getInt(0), tick)
        "streamUrl" -> Tg.Stream.url(a.getInt(0), a.getString(1))
        else -> throw IllegalArgumentException("método desconocido: $m")
    }

    override fun onCreate() {
        super.onCreate()
        // Un error de Java aquí no debe mostrar "la app se detuvo": se anota y se cierra solo este proceso
        Thread.setDefaultUncaughtExceptionHandler { _, e ->
            try { File(filesDir, "tdlib").mkdirs(); File(filesDir, "tdlib/step.txt").writeText("error: " + (e.message ?: e.javaClass.simpleName)) } catch (_: Throwable) {}
            android.os.Process.killProcess(android.os.Process.myPid()); kotlin.system.exitProcess(10)
        }
    }

    override fun onBind(intent: Intent?): IBinder = messenger.binder
}

/** Lado de la app: conecta con TgService y espera las respuestas. Se usa desde hilos de fondo (nunca el principal). */
object TgClient {
    private class Pending(val tick: (Int) -> Unit) { val latch = CountDownLatch(1); var ok = false; var r: String? = null }
    private val pending = ConcurrentHashMap<Int, Pending>()
    private val seq = AtomicInteger(1)
    @Volatile private var remote: Messenger? = null
    @Volatile private var connecting: CountDownLatch? = null
    @Volatile var died: String? = null; private set
    private lateinit var app: Context
    private val thread by lazy { HandlerThread("tg-client").apply { start() } }
    private val inbox by lazy {
        Messenger(Handler(thread.looper) { msg ->
            val b = msg.data; val p = pending[b.getInt("id")]
            if (p != null) {
                if (b.containsKey("p")) p.tick(b.getInt("p"))
                else { p.ok = b.getBoolean("ok"); p.r = b.getString("r"); pending.remove(b.getInt("id")); p.latch.countDown() }
            }
            true
        })
    }
    private val conn = object : ServiceConnection {
        override fun onServiceConnected(n: ComponentName?, s: IBinder?) {
            remote = Messenger(s); died = null
            try { s?.linkToDeath({ lost() }, 0) } catch (_: Exception) {}
            connecting?.countDown()
        }
        override fun onServiceDisconnected(n: ComponentName?) { lost() }
    }

    val connected get() = remote != null

    /** El proceso de Telegram se cayó: se avisa a quien esperaba y se guarda el motivo que da Android */
    private fun lost() {
        if (remote == null && pending.isEmpty()) return
        remote = null
        Thread.sleep(400)   // Android tarda un instante en registrar el motivo
        died = "Telegram se cerró en este equipo" + reason().let { if (it.isNotBlank()) " ($it)" else "" }
        try { File(app.filesDir, "tdlib/step.txt").takeIf { it.exists() }?.readText()?.let { died += ". Último paso: $it" } } catch (_: Exception) {}
        pending.values.forEach { it.ok = false; it.r = died; it.latch.countDown() }
        pending.clear()
        try { app.unbindService(conn) } catch (_: Exception) {}
    }

    private fun reason(): String {
        if (android.os.Build.VERSION.SDK_INT < 30) return ""
        return try {
            val am = app.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            val e = am.getHistoricalProcessExitReasons(app.packageName, 0, 10).firstOrNull { it.processName.endsWith(":tg") } ?: return ""
            val r = when (e.reason) {
                android.app.ApplicationExitInfo.REASON_CRASH_NATIVE -> "falla nativa"
                android.app.ApplicationExitInfo.REASON_CRASH -> "error"
                android.app.ApplicationExitInfo.REASON_SIGNALED -> "señal " + e.status
                android.app.ApplicationExitInfo.REASON_LOW_MEMORY -> "poca memoria"
                android.app.ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "no pudo iniciar"
                else -> "motivo " + e.reason
            }
            r + (e.description?.let { " · $it" } ?: "")
        } catch (_: Exception) { "" }
    }

    private fun ensure(c: Context) {
        if (remote != null) return
        app = c.applicationContext
        val l = synchronized(this) { connecting?.takeIf { it.count > 0 } ?: CountDownLatch(1).also { connecting = it; app.bindService(Intent(app, TgService::class.java), conn, Context.BIND_AUTO_CREATE) } }
        if (!l.await(15, TimeUnit.SECONDS) || remote == null) throw IllegalStateException("No se pudo abrir Telegram")
    }

    /** Llama un método en el proceso de Telegram y devuelve su resultado (JSONObject, JSONArray, String, Boolean…) */
    fun call(c: Context, m: String, args: JSONArray = JSONArray(), timeoutS: Long = 600, tick: (Int) -> Unit = {}): Any? {
        ensure(c)
        val id = seq.getAndIncrement(); val p = Pending(tick); pending[id] = p
        val msg = Message.obtain().apply { data = Bundle().apply { putInt("id", id); putString("m", m); putString("a", args.toString()) }; replyTo = inbox }
        try { remote?.send(msg) ?: throw IllegalStateException(died ?: "Telegram no está disponible") } catch (e: android.os.RemoteException) { pending.remove(id); lost(); throw IllegalStateException(died ?: "Telegram se cerró") }
        if (!p.latch.await(timeoutS, TimeUnit.SECONDS)) { pending.remove(id); throw IllegalStateException("Telegram no respondió a tiempo") }
        if (!p.ok) throw IllegalStateException(p.r ?: "Error de Telegram")
        val v = JSONObject(p.r ?: "{}").opt("v")
        return if (v == JSONObject.NULL) null else v
    }

    /** Estado sin arrancar nada: si el proceso no está abierto, "off" (y el motivo si se cayó) */
    fun state(c: Context): JSONObject {
        if (remote == null) {
            val o = JSONObject().put("state", "off").put("info", JSONObject()).put("lib", false)
            died?.let { o.put("state", "error").put("info", JSONObject().put("message", it)); died = null }
            return o
        }
        return try { call(c, "state", timeoutS = 5) as JSONObject } catch (e: Exception) { JSONObject().put("state", "error").put("info", JSONObject().put("message", e.message)) }
    }
}
