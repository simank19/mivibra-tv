package co.mivibra.tv

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.KeyEvent
import java.lang.ref.WeakReference

/** Conecta los celulares (mandos) con la pantalla que está abierta en la TV. */
object RemoteHub {
    private var mainRef = WeakReference<MainActivity>(null)
    private var currentRef = WeakReference<Activity>(null)
    private var gameRef = WeakReference<GameActivity>(null)
    private val ui = Handler(Looper.getMainLooper())

    var server: RemoteServer? = null

    val main: MainActivity? get() = mainRef.get()
    val game: GameActivity? get() = gameRef.get()

    fun setMain(a: MainActivity) { mainRef = WeakReference(a) }
    fun setCurrent(a: Activity) { currentRef = WeakReference(a) }
    fun setGame(a: GameActivity?) {
        gameRef = WeakReference(a)
        server?.broadcastMode()
    }

    val mode: String get() = if (game != null) "game" else "remote"

    /** Nombres que manda la página del celular → códigos de tecla de Android. */
    val KEYS: Map<String, Int> = mapOf(
        "UP" to KeyEvent.KEYCODE_DPAD_UP,
        "DOWN" to KeyEvent.KEYCODE_DPAD_DOWN,
        "LEFT" to KeyEvent.KEYCODE_DPAD_LEFT,
        "RIGHT" to KeyEvent.KEYCODE_DPAD_RIGHT,
        "OK" to KeyEvent.KEYCODE_DPAD_CENTER,
        "BACK" to KeyEvent.KEYCODE_BACK,
        "MENU" to KeyEvent.KEYCODE_MENU,
        "PLAYPAUSE" to KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
        "CHUP" to KeyEvent.KEYCODE_CHANNEL_UP,
        "CHDOWN" to KeyEvent.KEYCODE_CHANNEL_DOWN,
        "A" to KeyEvent.KEYCODE_BUTTON_A,
        "B" to KeyEvent.KEYCODE_BUTTON_B,
        "X" to KeyEvent.KEYCODE_BUTTON_X,
        "Y" to KeyEvent.KEYCODE_BUTTON_Y,
        "L1" to KeyEvent.KEYCODE_BUTTON_L1,
        "R1" to KeyEvent.KEYCODE_BUTTON_R1,
        "L2" to KeyEvent.KEYCODE_BUTTON_L2,
        "R2" to KeyEvent.KEYCODE_BUTTON_R2,
        "L3" to KeyEvent.KEYCODE_BUTTON_THUMBL,
        "R3" to KeyEvent.KEYCODE_BUTTON_THUMBR,
        "START" to KeyEvent.KEYCODE_BUTTON_START,
        "SELECT" to KeyEvent.KEYCODE_BUTTON_SELECT,
    )

    /** Modo control remoto: simula la tecla en la pantalla actual. */
    fun navKey(name: String, down: Boolean?) {
        if (name == "HOME") {
            ui.post { main?.js("window.MV&&MV.go&&MV.go('home')") }
            return
        }
        val code = KEYS[name] ?: return
        ui.post {
            val a = currentRef.get() ?: main ?: return@post
            val now = SystemClock.uptimeMillis()
            // En la interfaz web, OK funciona mejor como ENTER
            val c = if (a is MainActivity && code == KeyEvent.KEYCODE_DPAD_CENTER) KeyEvent.KEYCODE_ENTER else code
            if (down == null || down) a.dispatchKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_DOWN, c, 0))
            if (down == null || !down) a.dispatchKeyEvent(KeyEvent(now, now, KeyEvent.ACTION_UP, c, 0))
        }
    }

    fun text(value: String) {
        ui.post { main?.js("window.MV&&MV.remoteText&&MV.remoteText(" + org.json.JSONObject.quote(value) + ")") }
    }

    /** Modo juego: cada celular es un jugador (puerto) distinto. */
    fun gameKey(slot: Int, name: String, down: Boolean) {
        val code = KEYS[name] ?: return
        ui.post { game?.remoteKey(slot, code, down) }
    }

    fun gameAxis(slot: Int, stick: String, x: Float, y: Float) {
        ui.post { game?.remoteAxis(slot, stick, x, y) }
    }

    fun clientsChanged(count: Int, names: List<String>) {
        val arr = org.json.JSONArray(names)
        ui.post { main?.js("window.MV&&MV.onRemoteClients&&MV.onRemoteClients($count,$arr)") }
    }
}
