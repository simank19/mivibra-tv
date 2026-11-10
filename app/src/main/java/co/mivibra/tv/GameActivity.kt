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
            // Opciones del núcleo (por ejemplo Neo Geo en modo arcade MVS)
            intent.getStringExtra("vars")?.let { js ->
                try {
                    val o = org.json.JSONObject(js)
                    variables = o.keys().asSequence().map { k -> com.swordfish.libretrodroid.Variable(k, o.getString(k)) }.toList().toTypedArray()
                } catch (_: Exception) {}
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
        gameRoot = root
        root.post { loadOverlay() }

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
            onKey = { code, down -> retroView.sendKeyEvent(if (down) KeyEvent.ACTION_DOWN else KeyEvent.ACTION_UP, pspSwap(code), 0) },
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
    /** Celular 1 = jugador 1, Celular 2 = jugador 2… (los mandos físicos van después de los celulares) */
    private fun portFor(slot: Int): Int = slot.coerceIn(0, 3)

    fun remoteMenu() { showMenu() }

    fun remoteKey(slot: Int, keyCode: Int, down: Boolean) {
        retroView.sendKeyEvent(if (down) KeyEvent.ACTION_DOWN else KeyEvent.ACTION_UP, pspSwap(keyCode), portFor(slot))
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

    /**
     * Jugador de cada mando físico, según el orden en que se usan: el primer mando que
     * presiona un botón es el jugador 1. Algunos mandos (y el control de la TV) aparecen
     * como varios dispositivos (p. ej. "Xbox 360 dpad"); lo que no ha presionado un botón
     * va al jugador 1 para que nunca quede "mudo" en otro puerto.
     */
    private val ports = LinkedHashMap<String, Int>()
    private fun padKey(id: Int): String {
        val d = InputDevice.getDevice(id) ?: return "id$id"
        return "${d.vendorId}:${d.productId}:${d.name.replace(Regex("(?i)\\s*(dpad|keyboard|consumer control|system control)$"), "")}"
    }
    private fun physicalPort(deviceId: Int, isButton: Boolean = false): Int {
        val k = padKey(deviceId)
        ports[k]?.let { return it }
        if (!isButton) return RemoteHub.phoneSlots().coerceAtMost(3)
        val port = (RemoteHub.phoneSlots() + ports.size).coerceAtMost(3)
        ports[k] = port
        return port
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
        return pspSwap(mapKey0(ev) ?: return null)
    }
    // PSP (núcleo PPSSPP): sus botones quedaban al revés; se cruzan para que ✕ quede abajo, ○ a la derecha, □ a la izquierda y △ arriba
    private fun pspSwap(k: Int): Int = if (sys != "psp") k else when (k) {
        KeyEvent.KEYCODE_BUTTON_A -> KeyEvent.KEYCODE_BUTTON_B; KeyEvent.KEYCODE_BUTTON_B -> KeyEvent.KEYCODE_BUTTON_A
        KeyEvent.KEYCODE_BUTTON_X -> KeyEvent.KEYCODE_BUTTON_Y; KeyEvent.KEYCODE_BUTTON_Y -> KeyEvent.KEYCODE_BUTTON_X
        else -> k
    }
    private fun mapKey0(ev: KeyEvent): Int? {
        val custom = customMap(ev.device)
        custom[ev.keyCode]?.let { return it }
        if (ev.keyCode in RETRO_KEYS) return ev.keyCode
        return GENERIC[ev.keyCode]
    }

    // ---- Asignación personalizada de botones (menú › Configurar mando) ----
    private val prefs by lazy { getSharedPreferences("mandos", MODE_PRIVATE) }
    private val mapCache = HashMap<String, Map<Int, Int>>()
    private fun devKey(d: InputDevice?) = "map2_" + (d?.descriptor ?: d?.name ?: "x")
    private fun customMap(d: InputDevice?): Map<Int, Int> = mapCache.getOrPut(devKey(d)) {
        (prefs.getString(devKey(d), "") ?: "").split(',').mapNotNull {
            val p = it.split(':'); if (p.size == 2) (p[0].toIntOrNull() ?: return@mapNotNull null) to (p[1].toIntOrNull() ?: return@mapNotNull null) else null
        }.toMap()
    }

    private val CONFIG_STEPS = listOf(
        "A  (abajo · X en PlayStation)" to KeyEvent.KEYCODE_BUTTON_A, "B  (derecha · ○ en PlayStation)" to KeyEvent.KEYCODE_BUTTON_B,
        "X  (izquierda · □ en PlayStation)" to KeyEvent.KEYCODE_BUTTON_X, "Y  (arriba · △ en PlayStation)" to KeyEvent.KEYCODE_BUTTON_Y,
        "L1" to KeyEvent.KEYCODE_BUTTON_L1, "R1" to KeyEvent.KEYCODE_BUTTON_R1, "L2" to KeyEvent.KEYCODE_BUTTON_L2, "R2" to KeyEvent.KEYCODE_BUTTON_R2,
        "SELECT" to KeyEvent.KEYCODE_BUTTON_SELECT, "START" to KeyEvent.KEYCODE_BUTTON_START)
    private var configStep = -1
    private var configDevice: InputDevice? = null
    private val configMap = HashMap<Int, Int>()
    private var configView: TextView? = null

    private fun startConfig() {
        releaseEverything(); configHeld = -1
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

    private var configHeld = -1
    private fun configKey(event: KeyEvent): Boolean {
        val code = event.keyCode
        if (event.action == KeyEvent.ACTION_UP) { if (code == configHeld) configHeld = -1; return true }
        if (event.repeatCount > 0 || configHeld != -1) return true          // hay que soltar antes del siguiente
        if (code in DPAD_KEYS || code == KeyEvent.KEYCODE_DPAD_CENTER) return true   // la cruceta ya funciona sola
        val samePad = configDevice != null && event.deviceId == configDevice?.id
        val fromPad = event.device != null && !event.device.isVirtual &&
            (code != KeyEvent.KEYCODE_BACK || samePad || fromGamepad(event.source))
        if (!fromPad) { configStep++; showConfigStep(); return true }   // Atrás del control de la TV = saltar
        if (configDevice == null) configDevice = event.device
        if (event.deviceId != configDevice?.id) return true
        if (configMap.containsKey(code)) return true                    // ese botón ya quedó asignado
        configHeld = code
        configMap[code] = CONFIG_STEPS[configStep].second
        configStep++; showConfigStep()
        return true
    }

    private var announced = HashSet<Int>()

    // ---- Probar mando: muestra en vivo lo que manda el mando (para revisar problemas) ----
    private var testView: TextView? = null
    private val testLines = ArrayDeque<String>()
    private fun startTest() {
        releaseEverything()
        val root = window.decorView.findViewById<FrameLayout>(android.R.id.content)
        testView = TextView(this).apply {
            setTextColor(Color.WHITE); textSize = 15f; typeface = android.graphics.Typeface.MONOSPACE
            setBackgroundColor(0xE6000000.toInt()); setPadding(40, 30, 40, 30)
        }
        root.addView(testView, FrameLayout.LayoutParams(-1, -1))
        testLog("Probar mando — presiona botones y mueve la cruceta y las palancas.\nPara salir presiona Atrás en el control de la TV.")
    }
    private fun testLog(line: String) {
        testLines.addLast(line); while (testLines.size > 22) testLines.removeFirst()
        testView?.text = testLines.joinToString("\n")
    }
    private fun testKey(e: KeyEvent): Boolean {
        val d = e.device
        if (e.keyCode == KeyEvent.KEYCODE_BACK && (d == null || !fromGamepad(e.source)) && e.action == KeyEvent.ACTION_UP) {
            (testView?.parent as? FrameLayout)?.removeView(testView); testView = null; testLines.clear(); retroView.requestFocus(); return true
        }
        if (e.repeatCount == 0) testLog("${if (e.action == KeyEvent.ACTION_DOWN) "▼" else "▲"} ${KeyEvent.keyCodeToString(e.keyCode).removePrefix("KEYCODE_")}  · ${d?.name} #${e.deviceId}  src=0x${Integer.toHexString(e.source)}")
        return true
    }
    private val testLast = HashMap<Int, String>()
    private fun testMotion(ev: android.view.MotionEvent): Boolean {
        val d = ev.device ?: return true
        val parts = d.motionRanges.map { it.axis }.distinct().mapNotNull { a ->
            val v = ev.getAxisValue(a); if (kotlin.math.abs(v) > 0.15f) "${android.view.MotionEvent.axisToString(a).removePrefix("AXIS_")}=${"%.1f".format(v)}" else null
        }
        val line = "~ ${d.name} #${ev.deviceId}: " + (if (parts.isEmpty()) "(centro)" else parts.joinToString(" "))
        if (testLast[ev.deviceId] != line) { testLast[ev.deviceId] = line; testLog(line) }
        return true
    }

    /** Estado de cada botón enviado al emulador, para no dejar nada "pegado". */
    private val pressed = HashSet<Int>()
    private fun press(port: Int, key: Int, down: Boolean) {
        val id = port * 1000 + key
        if (down) { if (!pressed.add(id)) return } else if (!pressed.remove(id)) return
        retroView.sendKeyEvent(if (down) KeyEvent.ACTION_DOWN else KeyEvent.ACTION_UP, key, port)
    }
    private fun releaseEverything() {
        for (id in pressed.toList()) retroView.sendKeyEvent(KeyEvent.ACTION_UP, id % 1000, id / 1000)
        pressed.clear(); triggers.clear(); lastHat.clear(); devHat.clear()
        for (port in 0..3) for (src in intArrayOf(GLRetroView.MOTION_SOURCE_DPAD, GLRetroView.MOTION_SOURCE_ANALOG_LEFT, GLRetroView.MOTION_SOURCE_ANALOG_RIGHT))
            retroView.sendMotionEvent(src, 0f, 0f, port)
    }
    private val lastHat = HashMap<Int, Pair<Float, Float>>()
    private val devHat = HashMap<Int, Pair<Int, Pair<Float, Float>>>()
    /** Un eje que al empezar no está en el centro (gatillo o eje raro) no se usa como palanca. */
    private val axisFirst = HashMap<Int, Float>()
    private fun stickOk(ev: android.view.MotionEvent, a: Int): Boolean {
        if (ev.device?.getMotionRange(a, ev.source) == null) return false
        val k = ev.deviceId * 100 + a
        val first = axisFirst.getOrPut(k) { ev.getAxisValue(a) }
        return kotlin.math.abs(first) < 0.5f
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (testView != null) return testKey(event)
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
        if (physical && event.action == KeyEvent.ACTION_DOWN && announced.add(-event.deviceId - 1000)) {
            val j = if (fromGamepad(event.source)) physicalPort(event.deviceId, true) + 1 else 1
            Toast.makeText(this, "Mando: ${dev?.name} · Jugador $j", Toast.LENGTH_SHORT).show()
        }
        if (event.repeatCount == 0) {
            if (sent == KeyEvent.KEYCODE_BUTTON_SELECT) selectDown = event.action == KeyEvent.ACTION_DOWN
            if (sent == KeyEvent.KEYCODE_BUTTON_START) startDown = event.action == KeyEvent.ACTION_DOWN
            if (selectDown && startDown) { selectDown = false; startDown = false; showMenu(); return true }
            val port = if (physical && fromGamepad(event.source)) physicalPort(event.deviceId, true) else 0
            press(port, sent, event.action == KeyEvent.ACTION_DOWN)
        }
        return true
    }

    /** Palancas, cruceta "HAT" y gatillos analógicos de los mandos. */
    override fun dispatchGenericMotionEvent(ev: android.view.MotionEvent): Boolean {
        if (testView != null) return testMotion(ev)
        if (configStep >= 0) {
            // L2 / R2: en muchos mandos (Xbox 360) son gatillos analógicos, no botones
            val target = CONFIG_STEPS.getOrNull(configStep)?.second
            if (target == KeyEvent.KEYCODE_BUTTON_L2 || target == KeyEvent.KEYCODE_BUTTON_R2) {
                if (configDevice != null && ev.deviceId != configDevice?.id) return true
                for (a in TRIGGER_AXES) {
                    if (configMap.containsKey(10000 + a)) continue
                    val v = ev.getAxisValue(a)
                    val k = ev.deviceId * 100 + a
                    val rest = minOf(axisRest[k] ?: 0f, v); axisRest[k] = rest
                    if (v - rest > 0.6f) {
                        if (configDevice == null) configDevice = ev.device
                        configMap[10000 + a] = target
                        configStep++; showConfigStep()
                        break
                    }
                }
            }
            return true
        }
        if (fromGamepad(ev.source) && ev.action == android.view.MotionEvent.ACTION_MOVE) {
            if (pad?.visibility == View.VISIBLE) setPadVisible(false)
            val port = physicalPort(ev.deviceId)
            fun ax(a: Int) = ev.getAxisValue(a)
            val dev = ev.device
            fun has(a: Int) = dev?.getMotionRange(a, ev.source) != null
            fun dz(v: Float) = if (kotlin.math.abs(v) < 0.2f) 0f else v
            // Cruceta = HAT del mando, o la palanca izquierda si la HAT está suelta
            // (los juegos de PlayStation 1, NES, SNES… solo entienden la cruceta).
            // Se guarda por dispositivo y se combina, para que un mando "doble" no deje nada pegado.
            fun dir(v: Float) = if (v > 0.5f) 1f else if (v < -0.5f) -1f else 0f
            var hx = 0f; var hy = 0f
            if (has(android.view.MotionEvent.AXIS_HAT_X)) { hx = dir(ax(android.view.MotionEvent.AXIS_HAT_X)); hy = dir(ax(android.view.MotionEvent.AXIS_HAT_Y)) }
            if (hx == 0f && hy == 0f && stickOk(ev, android.view.MotionEvent.AXIS_X) && stickOk(ev, android.view.MotionEvent.AXIS_Y)) {
                hx = dir(ax(android.view.MotionEvent.AXIS_X)); hy = dir(ax(android.view.MotionEvent.AXIS_Y))
            }
            devHat[ev.deviceId] = Pair(port, Pair(hx, hy))
            var cx = 0f; var cy = 0f
            for ((p2, h2) in devHat.values) if (p2 == port) { if (cx == 0f) cx = h2.first; if (cy == 0f) cy = h2.second }
            val h = Pair(cx, cy)
            if (lastHat[port] != h) { lastHat[port] = h; retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_DPAD, cx, cy, port) }
            if (stickOk(ev, android.view.MotionEvent.AXIS_X) && stickOk(ev, android.view.MotionEvent.AXIS_Y))
                retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_ANALOG_LEFT, dz(ax(android.view.MotionEvent.AXIS_X)), dz(ax(android.view.MotionEvent.AXIS_Y)), port)
            fun trig(key: Int, v: Float) {
                val on = v > 0.5f
                if (triggers[port * 1000 + key] != on) {
                    triggers[port * 1000 + key] = on
                    press(port, key, on)
                }
            }
            val custom = customMap(ev.device).filterKeys { it >= 10000 }
            if (custom.isEmpty()) {
                retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_ANALOG_RIGHT, dz(ax(android.view.MotionEvent.AXIS_Z)), dz(ax(android.view.MotionEvent.AXIS_RZ)), port)
                // Gatillos: algunos mandos los mandan como eje y no como botón
                trig(KeyEvent.KEYCODE_BUTTON_L2, maxOf(ax(android.view.MotionEvent.AXIS_LTRIGGER), ax(android.view.MotionEvent.AXIS_BRAKE)))
                trig(KeyEvent.KEYCODE_BUTTON_R2, maxOf(ax(android.view.MotionEvent.AXIS_RTRIGGER), ax(android.view.MotionEvent.AXIS_GAS)))
            } else {
                // Gatillos configurados a mano; si usan Z/RZ, la palanca derecha va por RX/RY
                val used = custom.keys.map { it - 10000 }
                val zUsed = android.view.MotionEvent.AXIS_Z in used || android.view.MotionEvent.AXIS_RZ in used
                if (zUsed) retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_ANALOG_RIGHT, dz(ax(android.view.MotionEvent.AXIS_RX)), dz(ax(android.view.MotionEvent.AXIS_RY)), port)
                else retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_ANALOG_RIGHT, dz(ax(android.view.MotionEvent.AXIS_Z)), dz(ax(android.view.MotionEvent.AXIS_RZ)), port)
                for ((code, key) in custom) {
                    val a = code - 10000
                    val v = ax(a); val k = ev.deviceId * 100 + a
                    val rest = minOf(axisRest[k] ?: 0f, v); axisRest[k] = rest
                    trig(key, (v - rest) * 0.8f)
                }
            }
            return true
        }
        return super.dispatchGenericMotionEvent(ev)
    }

    private val axisRest = HashMap<Int, Float>()

    companion object {
        private val TRIGGER_AXES = intArrayOf(
            android.view.MotionEvent.AXIS_LTRIGGER, android.view.MotionEvent.AXIS_RTRIGGER,
            android.view.MotionEvent.AXIS_BRAKE, android.view.MotionEvent.AXIS_GAS,
            android.view.MotionEvent.AXIS_Z, android.view.MotionEvent.AXIS_RZ,
            android.view.MotionEvent.AXIS_RX, android.view.MotionEvent.AXIS_RY)
        private val DPAD_KEYS = setOf(KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN, KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT)
    }

    // ---------------- Marco de la consola (bezel) ----------------
    private var gameRoot: FrameLayout? = null
    private var overlayView: android.widget.ImageView? = null
    private val sys get() = intent.getStringExtra("sys") ?: ""

    private fun loadOverlay() {
        if (!Overlays.enabled(this, sys)) return
        lifecycleScope.launch {
            val res = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                val f = Overlays.fetch(this@GameActivity, sys) ?: return@withContext null
                val bmp = Overlays.decode(f) ?: return@withContext null
                val hole = Overlays.hole(bmp)
                if (hole == null) { bmp.recycle(); null } else Pair(bmp, hole)
            } ?: return@launch
            if (isFinishing || !Overlays.enabled(this@GameActivity, sys)) return@launch
            applyOverlay(res.first, res.second)
        }
    }

    private fun applyOverlay(bmp: android.graphics.Bitmap, hole: android.graphics.Rect) {
        val root = gameRoot ?: return
        val rw = root.width.toFloat(); val rh = root.height.toFloat()
        if (rw <= 0 || rh <= 0) return
        // El marco es 16:9 y se estira a la pantalla; el juego va exactamente en el hueco
        val sx = rw / bmp.width; val sy = rh / bmp.height
        val lp = FrameLayout.LayoutParams((hole.width() * sx).toInt(), (hole.height() * sy).toInt(), Gravity.TOP or Gravity.START)
        lp.leftMargin = (hole.left * sx).toInt(); lp.topMargin = (hole.top * sy).toInt()
        retroView.layoutParams = lp
        overlayView?.let { root.removeView(it) }
        val iv = android.widget.ImageView(this).apply {
            setImageBitmap(bmp); scaleType = android.widget.ImageView.ScaleType.FIT_XY
            isFocusable = false; isClickable = false
        }
        root.addView(iv, 1, FrameLayout.LayoutParams(-1, -1))
        overlayView = iv
    }

    /** Elegir estilo de marco (o ninguno) para esta consola. */
    private fun chooseFrame() {
        val n = Overlays.styleCount(sys)
        val names = (0 until n).map { Overlays.styleName(it) } + "Sin marco"
        val cur = if (!Overlays.enabled(this, sys)) n else Overlays.style(this, sys)
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("Marco de la consola")
            .setSingleChoiceItems(names.toTypedArray(), cur) { d, which ->
                d.dismiss(); retroView.requestFocus()
                if (which == n) { Overlays.setEnabled(this, sys, false); removeOverlay() }
                else {
                    Overlays.setStyle(this, sys, which)
                    if (!Overlays.file(this, sys, which).exists()) Toast.makeText(this, "Descargando el marco…", Toast.LENGTH_SHORT).show()
                    loadOverlay()
                }
            }
            .show()
    }

    private fun removeOverlay() {
        overlayView?.let { gameRoot?.removeView(it) }
        overlayView = null
        retroView.layoutParams = FrameLayout.LayoutParams(-1, -1, Gravity.CENTER)
    }

    private fun showMenu() {
        releaseEverything()
        pad?.releaseAll()
        val padItem = if (pad == null) null else if (pad?.visibility == View.VISIBLE) "Ocultar controles en pantalla" else "Mostrar controles en pantalla"
        val frameItem = if (!Overlays.available(sys)) null else "Marco: " + (if (Overlays.enabled(this, sys)) Overlays.styleName(Overlays.style(this, sys)) else "sin marco")
        val items = listOfNotNull("Continuar", "Guardar partida", "Cargar partida", "Reiniciar juego", frameItem, "Configurar mando", "Probar mando", "Salir del juego", padItem).toTypedArray()
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
                    "Probar mando" -> startTest()
                    frameItem -> chooseFrame()
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
        if (::retroView.isInitialized) releaseEverything()
        super.onPause()
    }

    override fun onDestroy() {
        RemoteHub.setGame(null)
        super.onDestroy()
    }

    @Suppress("unused")
    private fun View.gone() { visibility = View.GONE }
}
