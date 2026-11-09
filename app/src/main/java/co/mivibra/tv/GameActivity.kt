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

    // ---------------- Mandos físicos (Bluetooth / USB) ----------------

    /** Jugador de cada mando físico: el primero que se conectó es el 1, el segundo el 2… */
    private fun physicalPort(deviceId: Int): Int {
        val ids = InputDevice.getDeviceIds().filter { id ->
            val d = InputDevice.getDevice(id)
            d != null && !d.isVirtual && fromGamepad(d.sources)
        }.sorted()
        return ids.indexOf(deviceId).coerceIn(0, 3)
    }

    private var selectDown = false
    private var startDown = false
    private val triggers = HashMap<Int, Boolean>()

    // Mandos genéricos (modo D-input / PC) mandan BUTTON_1..12 en vez de A/B/X/Y
    private val GENERIC = mapOf(
        KeyEvent.KEYCODE_BUTTON_1 to KeyEvent.KEYCODE_BUTTON_Y, KeyEvent.KEYCODE_BUTTON_2 to KeyEvent.KEYCODE_BUTTON_B,
        KeyEvent.KEYCODE_BUTTON_3 to KeyEvent.KEYCODE_BUTTON_A, KeyEvent.KEYCODE_BUTTON_4 to KeyEvent.KEYCODE_BUTTON_X,
        KeyEvent.KEYCODE_BUTTON_5 to KeyEvent.KEYCODE_BUTTON_L1, KeyEvent.KEYCODE_BUTTON_6 to KeyEvent.KEYCODE_BUTTON_R1,
        KeyEvent.KEYCODE_BUTTON_7 to KeyEvent.KEYCODE_BUTTON_L2, KeyEvent.KEYCODE_BUTTON_8 to KeyEvent.KEYCODE_BUTTON_R2,
        KeyEvent.KEYCODE_BUTTON_9 to KeyEvent.KEYCODE_BUTTON_SELECT, KeyEvent.KEYCODE_BUTTON_10 to KeyEvent.KEYCODE_BUTTON_START,
        KeyEvent.KEYCODE_BUTTON_11 to KeyEvent.KEYCODE_BUTTON_THUMBL, KeyEvent.KEYCODE_BUTTON_12 to KeyEvent.KEYCODE_BUTTON_THUMBR,
        KeyEvent.KEYCODE_BUTTON_C to KeyEvent.KEYCODE_BUTTON_X, KeyEvent.KEYCODE_BUTTON_Z to KeyEvent.KEYCODE_BUTTON_Y,
        KeyEvent.KEYCODE_DPAD_CENTER to KeyEvent.KEYCODE_BUTTON_A, KeyEvent.KEYCODE_ENTER to KeyEvent.KEYCODE_BUTTON_A,
        KeyEvent.KEYCODE_SPACE to KeyEvent.KEYCODE_BUTTON_A, KeyEvent.KEYCODE_ESCAPE to KeyEvent.KEYCODE_BUTTON_B)

    private val RETRO_KEYS = setOf(
        KeyEvent.KEYCODE_BUTTON_A, KeyEvent.KEYCODE_BUTTON_B, KeyEvent.KEYCODE_BUTTON_X, KeyEvent.KEYCODE_BUTTON_Y,
        KeyEvent.KEYCODE_BUTTON_L1, KeyEvent.KEYCODE_BUTTON_R1, KeyEvent.KEYCODE_BUTTON_L2, KeyEvent.KEYCODE_BUTTON_R2,
        KeyEvent.KEYCODE_BUTTON_SELECT, KeyEvent.KEYCODE_BUTTON_START, KeyEvent.KEYCODE_BUTTON_THUMBL, KeyEvent.KEYCODE_BUTTON_THUMBR,
        KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN, KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT)

    private fun mapKey(ev: KeyEvent): Int? {
        val custom = customMap(ev.device)
        custom[ev.keyCode]?.let { return it }
        if (ev.keyCode in RETRO_KEYS) return ev.keyCode
        return GENERIC[ev.keyCode]
    }

    // ---- Asignación personalizada de botones (menú › Configurar mando) ----
    private val prefs by lazy { getSharedPreferences("mandos", MODE_PRIVATE) }
    private val mapCache = HashMap<String, Map<Int, Int>>()
    private fun devKey(d: InputDevice?) = "map_" + (d?.descriptor ?: d?.name ?: "x")
    private fun customMap(d: InputDevice?): Map<Int, Int> = mapCache.getOrPut(devKey(d)) {
        (prefs.getString(devKey(d), "") ?: "").split(',').mapNotNull {
            val p = it.split(':'); if (p.size == 2) (p[0].toIntOrNull() ?: return@mapNotNull null) to (p[1].toIntOrNull() ?: return@mapNotNull null) else null
        }.toMap()
    }

    private val CONFIG_STEPS = listOf(
        "ARRIBA (cruceta)" to KeyEvent.KEYCODE_DPAD_UP, "ABAJO (cruceta)" to KeyEvent.KEYCODE_DPAD_DOWN,
        "IZQUIERDA (cruceta)" to KeyEvent.KEYCODE_DPAD_LEFT, "DERECHA (cruceta)" to KeyEvent.KEYCODE_DPAD_RIGHT,
        "A  (abajo · X en PlayStation)" to KeyEvent.KEYCODE_BUTTON_A, "B  (derecha · ○ en PlayStation)" to KeyEvent.KEYCODE_BUTTON_B,
        "X  (izquierda · □ en PlayStation)" to KeyEvent.KEYCODE_BUTTON_X, "Y  (arriba · △ en PlayStation)" to KeyEvent.KEYCODE_BUTTON_Y,
        "L1" to KeyEvent.KEYCODE_BUTTON_L1, "R1" to KeyEvent.KEYCODE_BUTTON_R1, "L2" to KeyEvent.KEYCODE_BUTTON_L2, "R2" to KeyEvent.KEYCODE_BUTTON_R2,
        "SELECT" to KeyEvent.KEYCODE_BUTTON_SELECT, "START" to KeyEvent.KEYCODE_BUTTON_START)
    private var configStep = -1
    private var configDevice: InputDevice? = null
    private val configMap = HashMap<Int, Int>()
    private var configView: TextView? = null

    private fun startConfig() {
        configStep = 0; configDevice = null; configMap.clear()
        val root = window.decorView.findViewById<FrameLayout>(android.R.id.content)
        configView = TextView(this).apply {
            setTextColor(Color.WHITE); textSize = 26f; gravity = Gravity.CENTER
            setBackgroundColor(0xE6000000.toInt())
        }
        root.addView(configView, FrameLayout.LayoutParams(-1, -1))
        showConfigStep()
    }

    private fun showConfigStep() {
        if (configStep >= CONFIG_STEPS.size) { finishConfig(); return }
        configView?.text = "Configurar mando  (${configStep + 1}/${CONFIG_STEPS.size})\n\nPresiona en el mando:\n\n${CONFIG_STEPS[configStep].first}\n\n" +
            "Si tu mando no tiene ese botón, presiona Atrás en el control de la TV para saltarlo."
    }

    private fun finishConfig() {
        val d = configDevice
        if (d != null && configMap.isNotEmpty()) {
            prefs.edit().putString(devKey(d), configMap.entries.joinToString(",") { "${it.key}:${it.value}" }).apply()
            mapCache.remove(devKey(d))
            Toast.makeText(this, "Mando \"${d.name}\" configurado", Toast.LENGTH_LONG).show()
        }
        (configView?.parent as? FrameLayout)?.removeView(configView)
        configView = null; configStep = -1
        retroView.requestFocus()
    }

    private fun configKey(event: KeyEvent): Boolean {
        if (event.action != KeyEvent.ACTION_DOWN || event.repeatCount > 0) return true
        val fromPad = event.device != null && !event.device.isVirtual && event.keyCode != KeyEvent.KEYCODE_BACK
        if (!fromPad) { configStep++; showConfigStep(); return true }   // Atrás = saltar
        if (configDevice == null) configDevice = event.device
        if (event.deviceId != configDevice?.id) return true
        configMap[event.keyCode] = CONFIG_STEPS[configStep].second
        configStep++; showConfigStep()
        return true
    }

    private var announced = HashSet<Int>()

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (configStep >= 0) return configKey(event)
        if (pad?.visibility == View.VISIBLE && fromGamepad(event.source) && KeyEvent.isGamepadButton(event.keyCode)) setPadVisible(false)
        val code = event.keyCode
        if (code == KeyEvent.KEYCODE_BUTTON_MODE || code == KeyEvent.KEYCODE_MENU) {
            if (event.action == KeyEvent.ACTION_UP) showMenu()
            return true
        }
        if (code == KeyEvent.KEYCODE_BACK && customMap(event.device)[code] == null) return super.dispatchKeyEvent(event)
        val sent = mapKey(event)
        val dev = event.device
        val physical = dev != null && !dev.isVirtual
        if (sent == null) {
            // Botón que no conocemos: avisamos una vez para que se pueda configurar
            if (physical && event.action == KeyEvent.ACTION_DOWN && announced.add(code))
                Toast.makeText(this, "Botón no reconocido (${KeyEvent.keyCodeToString(code)}). Abre el menú › Configurar mando", Toast.LENGTH_LONG).show()
            return super.dispatchKeyEvent(event)
        }
        if (physical && announced.add(-event.deviceId - 1000))
            Toast.makeText(this, "Mando: ${dev?.name}", Toast.LENGTH_SHORT).show()
        if (event.repeatCount == 0) {
            if (sent == KeyEvent.KEYCODE_BUTTON_SELECT) selectDown = event.action == KeyEvent.ACTION_DOWN
            if (sent == KeyEvent.KEYCODE_BUTTON_START) startDown = event.action == KeyEvent.ACTION_DOWN
            if (selectDown && startDown) { selectDown = false; startDown = false; showMenu(); return true }
            retroView.sendKeyEvent(event.action, sent, if (physical && fromGamepad(event.source)) physicalPort(event.deviceId) else 0)
        }
        return true
    }

    /** Palancas, cruceta "HAT" y gatillos analógicos de los mandos. */
    override fun dispatchGenericMotionEvent(ev: android.view.MotionEvent): Boolean {
        if (configStep >= 0) {
            // En la configuración, la cruceta tipo "HAT" ya funciona sola: se salta ese paso
            if (configStep < 4 && (ev.getAxisValue(android.view.MotionEvent.AXIS_HAT_X) != 0f || ev.getAxisValue(android.view.MotionEvent.AXIS_HAT_Y) != 0f)) {
                if (configDevice == null) configDevice = ev.device
                configStep = 4; showConfigStep()
            }
            return true
        }
        if (fromGamepad(ev.source) && ev.action == android.view.MotionEvent.ACTION_MOVE) {
            if (pad?.visibility == View.VISIBLE) setPadVisible(false)
            val port = physicalPort(ev.deviceId)
            fun ax(a: Int) = ev.getAxisValue(a)
            retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_DPAD, ax(android.view.MotionEvent.AXIS_HAT_X), ax(android.view.MotionEvent.AXIS_HAT_Y), port)
            retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_ANALOG_LEFT, ax(android.view.MotionEvent.AXIS_X), ax(android.view.MotionEvent.AXIS_Y), port)
            retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_ANALOG_RIGHT, ax(android.view.MotionEvent.AXIS_Z), ax(android.view.MotionEvent.AXIS_RZ), port)
            // Gatillos: algunos mandos los mandan como eje y no como botón
            fun trig(key: Int, v: Float) {
                val on = v > 0.5f
                if (triggers[port * 1000 + key] != on) {
                    triggers[port * 1000 + key] = on
                    retroView.sendKeyEvent(if (on) KeyEvent.ACTION_DOWN else KeyEvent.ACTION_UP, key, port)
                }
            }
            trig(KeyEvent.KEYCODE_BUTTON_L2, maxOf(ax(android.view.MotionEvent.AXIS_LTRIGGER), ax(android.view.MotionEvent.AXIS_BRAKE)))
            trig(KeyEvent.KEYCODE_BUTTON_R2, maxOf(ax(android.view.MotionEvent.AXIS_RTRIGGER), ax(android.view.MotionEvent.AXIS_GAS)))
            return true
        }
        return super.dispatchGenericMotionEvent(ev)
    }

    companion object {
        private val DPAD_KEYS = setOf(KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN, KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT)
    }

    private fun showMenu() {
        pad?.releaseAll()
        val padItem = if (pad == null) null else if (pad?.visibility == View.VISIBLE) "Ocultar controles en pantalla" else "Mostrar controles en pantalla"
        val items = listOfNotNull("Continuar", "Guardar partida", "Cargar partida", "Reiniciar juego", "Configurar mando", "Salir del juego", padItem).toTypedArray()
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle(intent.getStringExtra("title") ?: "Juego")
            .setItems(items) { d, which ->
                d.dismiss()
                retroView.requestFocus()
                when (items[which]) {
                    "Guardar partida" -> saveState()
                    "Cargar partida" -> loadState()
                    "Reiniciar juego" -> retroView.reset()
                    "Configurar mando" -> startConfig()
                    "Salir del juego" -> { saveSram(); finish() }
                    padItem -> { val show = pad?.visibility != View.VISIBLE; padHiddenByUser = !show; setPadVisible(show) }
                }
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
