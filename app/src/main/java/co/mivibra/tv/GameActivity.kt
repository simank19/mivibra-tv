package co.mivibra.tv

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.InputDevice
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import androidx.webkit.WebViewAssetLoader
import com.swordfish.libretrodroid.GLRetroView
import com.swordfish.libretrodroid.GLRetroViewData
import com.swordfish.libretrodroid.ShaderConfig
import kotlinx.coroutines.launch
import java.io.File

/**
 * Emulador (LibretroDroid). Acepta mandos Bluetooth/USB con sus joysticks,
 * celulares como mandos por Wi-Fi y, en celular o tablet, controles táctiles con joystick.
 */
class GameActivity : ComponentActivity() {

    private lateinit var retroView: GLRetroView
    private var pad: TouchPadView? = null
    private lateinit var romFile: File
    private lateinit var saveFile: File
    private lateinit var stateFile: File

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemBars()

        val corePath = intent.getStringExtra("core") ?: return finish()
        romFile = File(intent.getStringExtra("rom") ?: return finish())
        val base = romFile.nameWithoutExtension
        val saves = File(filesDir, "saves").apply { mkdirs() }
        val states = File(filesDir, "states").apply { mkdirs() }
        val system = File(filesDir, "system").apply { mkdirs() }
        saveFile = File(saves, "$base.srm")
        stateFile = File(states, "$base.state")

        val data = GLRetroViewData(this).apply {
            coreFilePath = corePath
            gameFilePath = romFile.absolutePath
            systemDirectory = system.absolutePath
            savesDirectory = saves.absolutePath
            saveRAMState = if (saveFile.exists()) saveFile.readBytes() else null
            shader = when (intent.getStringExtra("shader")) {
                "crt" -> ShaderConfig.CRT
                "lcd" -> ShaderConfig.LCD
                "sharp" -> ShaderConfig.Sharp
                else -> ShaderConfig.Default
            }
            rumbleEventsEnabled = true
            preferLowLatencyAudio = true
        }

        val root = FrameLayout(this)
        root.setBackgroundColor(Color.BLACK)
        retroView = GLRetroView(this, data)
        lifecycle.addObserver(retroView)
        root.addView(retroView, FrameLayout.LayoutParams(-1, -1, Gravity.CENTER))
        retroView.isFocusable = true
        retroView.isFocusableInTouchMode = true

        // Controles táctiles sobrepuestos: siempre en celular/tablet; se ocultan solos si usas un mando físico
        val isTv = packageManager.hasSystemFeature("android.software.leanback") ||
            (getSystemService(UI_MODE_SERVICE) as android.app.UiModeManager).currentModeType == android.content.res.Configuration.UI_MODE_TYPE_TELEVISION
        if (!isTv) addTouchPad(root)

        // Aviso mientras arranca el núcleo; se quita con el primer cuadro dibujado
        val loading = TextView(this).apply {
            text = "Cargando juego…"
            setTextColor(Color.WHITE)
            textSize = 18f
            gravity = Gravity.CENTER
            setBackgroundColor(Color.BLACK)
        }
        root.addView(loading, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)
        retroView.requestFocus()

        var firstFrame = false
        lifecycleScope.launch {
            retroView.getGLRetroEvents().collect { ev ->
                if (ev is GLRetroView.GLRetroEvents.FrameRendered && !firstFrame) {
                    firstFrame = true
                    runOnUiThread { loading.animate().alpha(0f).setDuration(300).withEndAction { loading.visibility = View.GONE }.start() }
                }
            }
        }
        root.postDelayed({
            if (!firstFrame) loading.text = "El juego no arranca.\n\nRevisa que el archivo sea del sistema correcto y que la BIOS esté importada (PlayStation, Lynx).\nPresiona Atrás para salir."
        }, 15000)

        lifecycleScope.launch {
            retroView.getGLRetroErrors().collect { code ->
                val msg = when (code) {
                    GLRetroView.ERROR_LOAD_LIBRARY -> "No se pudo cargar el núcleo del emulador"
                    GLRetroView.ERROR_LOAD_GAME -> "Este archivo no es compatible con el sistema elegido (¿falta la BIOS?)"
                    GLRetroView.ERROR_GL_NOT_COMPATIBLE -> "Tu equipo no soporta los gráficos que pide este sistema"
                    else -> "Error del emulador ($code)"
                }
                Toast.makeText(this@GameActivity, msg, Toast.LENGTH_LONG).show()
                finish()
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = showMenu()
        })
        RemoteHub.setGame(this)
    }

    private fun addTouchPad(root: FrameLayout) {
        val v = TouchPadView(this,
            onKey = { code, down -> retroView.sendKeyEvent(if (down) KeyEvent.ACTION_DOWN else KeyEvent.ACTION_UP, code, 0) },
            onStick = { x, y ->
                retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_ANALOG_LEFT, x, y, 0)
                // También como cruceta, para consolas sin palanca analógica (NES, SNES, Doom…)
                fun dir(a: Float) = if (a > 0.4f) 1f else if (a < -0.4f) -1f else 0f
                retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_DPAD, dir(x), dir(y), 0)
            },
            onMenu = { showMenu() })
        root.addView(v, FrameLayout.LayoutParams(-1, -1))
        pad = v
    }

    private fun physicalPads(): Int = InputDevice.getDeviceIds().count { id ->
        val d = InputDevice.getDevice(id)
        d != null && !d.isVirtual &&
            ((d.sources and InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD ||
                (d.sources and InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK)
    }

    /** Los celulares van después de los mandos físicos: si hay 1 mando, el primer celular es el jugador 2. */
    private fun portFor(slot: Int): Int = (physicalPads() + slot).coerceIn(0, 3)

    fun remoteKey(slot: Int, keyCode: Int, down: Boolean) {
        retroView.sendKeyEvent(if (down) KeyEvent.ACTION_DOWN else KeyEvent.ACTION_UP, keyCode, portFor(slot))
    }

    fun remoteAxis(slot: Int, stick: String, x: Float, y: Float) = sendAxis(portFor(slot), stick, x, y)

    private fun sendAxis(port: Int, stick: String, x: Float, y: Float) {
        val source = when (stick) {
            "r" -> GLRetroView.MOTION_SOURCE_ANALOG_RIGHT
            "d" -> GLRetroView.MOTION_SOURCE_DPAD
            else -> GLRetroView.MOTION_SOURCE_ANALOG_LEFT
        }
        retroView.sendMotionEvent(source, x.coerceIn(-1f, 1f), y.coerceIn(-1f, 1f), port)
    }

    private fun setPadVisible(show: Boolean) {
        val p = pad ?: return
        p.releaseAll()
        p.visibility = if (show) View.VISIBLE else View.GONE
    }

    private fun fromGamepad(source: Int) =
        (source and InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD ||
            (source and InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK

    /** Si los controles estaban ocultos (por usar un mando) y tocas la pantalla, vuelven a salir. */
    override fun dispatchTouchEvent(ev: android.view.MotionEvent): Boolean {
        if (ev.actionMasked == android.view.MotionEvent.ACTION_DOWN && pad != null && pad?.visibility != View.VISIBLE && !padHiddenByUser) setPadVisible(true)
        return super.dispatchTouchEvent(ev)
    }
    private var padHiddenByUser = false

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (pad?.visibility == View.VISIBLE && fromGamepad(event.source) && KeyEvent.isGamepadButton(event.keyCode)) setPadVisible(false)
        if (event.keyCode == KeyEvent.KEYCODE_BUTTON_MODE || event.keyCode == KeyEvent.KEYCODE_MENU) {
            if (event.action == KeyEvent.ACTION_UP) showMenu()
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    private fun showMenu() {
        pad?.releaseAll()
        val padItem = if (pad == null) null else if (pad?.visibility == View.VISIBLE) "Ocultar controles en pantalla" else "Mostrar controles en pantalla"
        val items = listOfNotNull("Continuar", "Guardar partida", "Cargar partida", "Reiniciar juego", "Salir del juego", padItem).toTypedArray()
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle(intent.getStringExtra("title") ?: "Juego")
            .setItems(items) { d, which ->
                when (which) {
                    1 -> saveState()
                    2 -> loadState()
                    3 -> retroView.reset()
                    4 -> { saveSram(); finish() }
                    5 -> { val show = pad?.visibility != View.VISIBLE; padHiddenByUser = !show; setPadVisible(show) }
                }
                d.dismiss()
                retroView.requestFocus()
            }
            .show()
    }

    private fun saveState() {
        try {
            stateFile.writeBytes(retroView.serializeState())
            Toast.makeText(this, "Partida guardada", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(this, "No se pudo guardar: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun loadState() {
        if (!stateFile.exists()) {
            Toast.makeText(this, "Aún no hay partida guardada", Toast.LENGTH_SHORT).show()
            return
        }
        val ok = try { retroView.unserializeState(stateFile.readBytes()) } catch (_: Exception) { false }
        Toast.makeText(this, if (ok) "Partida cargada" else "No se pudo cargar la partida", Toast.LENGTH_SHORT).show()
    }

    private fun saveSram() {
        try {
            val bytes = retroView.serializeSRAM()
            if (bytes.isNotEmpty()) saveFile.writeBytes(bytes)
        } catch (_: Exception) {
        }
    }

    private fun hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val c = WindowInsetsControllerCompat(window, window.decorView)
        c.hide(WindowInsetsCompat.Type.systemBars())
        c.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    override fun onResume() {
        super.onResume()
        RemoteHub.setCurrent(this)
        hideSystemBars()
        retroView.requestFocus()
    }

    override fun onPause() {
        saveSram()
        super.onPause()
    }

    override fun onDestroy() {
        RemoteHub.setGame(null)
        super.onDestroy()
    }

    @Suppress("unused")
    private fun View.gone() { visibility = View.GONE }
}
