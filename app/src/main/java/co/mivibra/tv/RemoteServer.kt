package co.mivibra.tv

import android.content.Context
import android.net.wifi.WifiManager
import fi.iki.elonen.NanoHTTPD
import fi.iki.elonen.NanoHTTPD.IHTTPSession
import fi.iki.elonen.NanoHTTPD.Response
import fi.iki.elonen.NanoWSD
import fi.iki.elonen.NanoWSD.WebSocket
import fi.iki.elonen.NanoWSD.WebSocketFrame
import org.json.JSONObject
import java.io.IOException
import java.net.Inet4Address
import java.net.NetworkInterface
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Servidor en la red Wi-Fi local: el celular abre http://IP:8765 en su navegador
 * y queda como control remoto o como mando de juego.
 */
class RemoteServer(private val ctx: Context, port: Int = PORT) : NanoWSD(port) {

    companion object {
        const val PORT = 8765

        fun localIp(ctx: Context): String? {
            try {
                val list = NetworkInterface.getNetworkInterfaces()?.toList() ?: emptyList()
                for (nif in list) {
                    if (!nif.isUp || nif.isLoopback) continue
                    for (addr in nif.inetAddresses.toList()) {
                        if (addr is Inet4Address && !addr.isLoopbackAddress && addr.isSiteLocalAddress) {
                            return addr.hostAddress
                        }
                    }
                }
            } catch (_: Exception) {
            }
            @Suppress("DEPRECATION")
            return try {
                val wm = ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                val ip = wm.connectionInfo.ipAddress
                if (ip == 0) null else "${ip and 0xff}.${ip shr 8 and 0xff}.${ip shr 16 and 0xff}.${ip shr 24 and 0xff}"
            } catch (_: Exception) {
                null
            }
        }
    }

    private val pads = CopyOnWriteArrayList<Pad>()

    override fun serveHttp(session: IHTTPSession): Response {
        val path = session.uri ?: "/"
        // Enviar ROMs y BIOS desde el celular
        if (path == "/roms/info") return romInfo()
        if (path == "/roms/upload" && session.method == NanoHTTPD.Method.POST) return romUpload(session)
        // Agregar una lista de TV desde el celular
        if (path == "/listas/add" && session.method == NanoHTTPD.Method.POST) return listAdd(session)
        if (path == "/listas/image" && session.method == NanoHTTPD.Method.POST) return listImage(session)
        val asset = when {
            path == "/" || path == "/index.html" -> "www/pad.html"
            path == "/roms" || path == "/roms/" -> "www/roms.html"
            path == "/listas" || path == "/listas/" -> "www/listas.html"
            path == "/isotipo.svg" || path == "/listas/isotipo.svg" -> "www/img/isotipo.svg"
            else -> null
        } ?: return NanoHTTPD.newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "No encontrado")
        return try {
            val bytes = ctx.assets.open(asset).use { it.readBytes() }
            val mime = if (asset.endsWith(".svg")) "image/svg+xml" else "text/html; charset=utf-8"
            NanoHTTPD.newFixedLengthResponse(Response.Status.OK, mime, bytes.inputStream(), bytes.size.toLong()).apply {
                // Que el celular siempre cargue la versión nueva de la página (lista de consolas, etc.)
                addHeader("Cache-Control", "no-store, no-cache, must-revalidate"); addHeader("Pragma", "no-cache")
            }
        } catch (e: IOException) {
            NanoHTTPD.newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain", e.message ?: "error")
        }
    }

    // ---------------- Listas desde el celular ----------------

    private fun listAdd(session: IHTTPSession): Response {
        fun reply(ok: Boolean, msg: String = "") = NanoHTTPD.newFixedLengthResponse(if (ok) Response.Status.OK else Response.Status.BAD_REQUEST, "application/json",
            JSONObject().put("ok", ok).apply { if (msg.isNotEmpty()) put("error", msg) }.toString())
        return try {
            val len = (session.headers["content-length"]?.toIntOrNull() ?: 0)
            if (len <= 0 || len > 512 * 1024) return reply(false, "Datos no válidos")
            val buf = ByteArray(len); var off = 0
            while (off < len) { val r = session.inputStream.read(buf, off, len - off); if (r <= 0) break; off += r }
            val o = JSONObject(String(buf, 0, off, Charsets.UTF_8))
            val clean = JSONObject()
            for (k in listOf("type", "name", "url", "epg", "host", "user", "pass", "portal", "mac")) if (o.has(k)) clean.put(k, o.optString(k).take(2000))
            if (o.has("text")) clean.put("text", o.optString("text").take(200000))
            if (clean.optString("type") !in listOf("url", "xtream", "stalker", "text")) return reply(false, "Tipo de lista no válido")
            RemoteHub.listReceived(clean.toString())
            reply(true)
        } catch (e: Exception) { reply(false, e.message ?: "Error") }
    }

    /** Foto o captura de una lista enviada desde el celular: se lee el texto y se abre en "Varias" en la TV. */
    private fun listImage(session: IHTTPSession): Response {
        fun reply(ok: Boolean, msg: String = "", n: Int = 0) = NanoHTTPD.newFixedLengthResponse(if (ok) Response.Status.OK else Response.Status.BAD_REQUEST, "application/json",
            JSONObject().put("ok", ok).put("chars", n).apply { if (msg.isNotEmpty()) put("error", msg) }.toString())
        val len = session.headers["content-length"]?.toLongOrNull() ?: return reply(false, "Falta el tamaño")
        if (len <= 0 || len > 25L * 1024 * 1024) return reply(false, "La imagen es muy grande")
        val f = java.io.File(ctx.cacheDir, "lista-foto")
        return try {
            f.outputStream().use { out ->
                val buf = ByteArray(64 * 1024); var left = len
                while (left > 0) { val r = session.inputStream.read(buf, 0, minOf(buf.size.toLong(), left).toInt()); if (r <= 0) break; out.write(buf, 0, r); left -= r }
            }
            val text = Ocr.fromFile(f)
            if (text.isBlank()) return reply(false, "No encontré texto en la imagen")
            RemoteHub.listReceived(JSONObject().put("type", "text").put("text", text).toString())
            reply(true, n = text.length)
        } catch (e: Exception) { reply(false, e.message ?: "No se pudo leer la imagen") } finally { f.delete() }
    }

    // ---------------- ROMs desde el celular ----------------

    /** Carpeta donde llegan las ROMs (la de MiVibra, que ya se busca con "Buscar juegos"; no necesita permisos). */
    private fun romDir(): java.io.File = (ctx.getExternalFilesDir("roms") ?: java.io.File(ctx.filesDir, "roms")).apply { mkdirs() }

    private fun romInfo(): Response {
        val d = romDir()
        val o = JSONObject().put("free", d.usableSpace).put("dir", d.absolutePath)
        return NanoHTTPD.newFixedLengthResponse(Response.Status.OK, "application/json", o.toString())
    }

    private fun romUpload(session: IHTTPSession): Response {
        fun err(msg: String) = NanoHTTPD.newFixedLengthResponse(Response.Status.BAD_REQUEST, "application/json", JSONObject().put("ok", false).put("error", msg).toString())
        val q = session.parameters
        val name = java.io.File(q["name"]?.firstOrNull() ?: "").name.trim()
        val sys = (q["sys"]?.firstOrNull() ?: "").lowercase()
        if (name.isEmpty() || name.startsWith(".")) return err("Nombre no válido")
        if (!sys.matches(Regex("[a-z0-9]{1,12}"))) return err("Consola no válida")
        val len = session.headers["content-length"]?.toLongOrNull() ?: return err("Falta el tamaño")
        val dir = romDir()
        if (len > dir.usableSpace - 50L * 1024 * 1024) return err("No hay espacio en la TV")
        val isBios = sys == "bios"
        val target = java.io.File(if (isBios) java.io.File(dir, "_bios") else java.io.File(dir, sys), name).apply { parentFile?.mkdirs() }
        val part = java.io.File(target.path + ".part")
        try {
            val inp = session.inputStream
            part.outputStream().buffered(256 * 1024).use { out ->
                val buf = ByteArray(256 * 1024)
                var left = len
                while (left > 0) {
                    val r = inp.read(buf, 0, if (left < buf.size) left.toInt() else buf.size)
                    if (r <= 0) break
                    out.write(buf, 0, r); left -= r
                }
                if (left > 0) throw IOException("Se cortó la subida")
            }
            if (target.exists()) target.delete()
            if (!part.renameTo(target)) throw IOException("No se pudo guardar")
        } catch (e: Exception) {
            part.delete()
            return err(e.message ?: "Error al recibir")
        }
        // BIOS: se instalan para el emulador de MiVibra y para RetroArch
        val bios = if (isBios) Storage.importBios(ctx, listOf(target.parent ?: "")).length() else 0
        val info = JSONObject().put("name", target.name).put("path", target.absolutePath).put("ext", target.extension.lowercase())
            .put("size", target.length()).put("sys", sys).put("bios", isBios)
        RemoteHub.romReceived(info.toString())
        return NanoHTTPD.newFixedLengthResponse(Response.Status.OK, "application/json", JSONObject().put("ok", true).put("bios", bios).toString())
    }

    override fun openWebSocket(handshake: IHTTPSession): WebSocket = Pad(handshake)

    fun clientCount(): Int = pads.count { it.isOpen }

    fun broadcastMode() {
        val msg = JSONObject().put("t", "mode").put("mode", RemoteHub.mode).toString()
        for (p in pads) {
            try { if (p.isOpen) p.send(msg) } catch (_: Exception) {}
        }
    }

    /** Cuántos puestos de jugador ocupan los celulares (Celular 1 y 2 conectados → 2) */
    fun phoneSlots(): Int = (pads.filter { it.isOpen }.maxOfOrNull { it.slot } ?: -1) + 1

    private fun freeSlot(): Int {
        val used = pads.filter { it.isOpen }.map { it.slot }.toSet()
        var s = 0
        while (s in used) s++
        return s
    }

    private fun notifyClients() {
        val open = pads.filter { it.isOpen }.sortedBy { it.slot }
        RemoteHub.clientsChanged(open.size, open.map { it.name })
    }

    inner class Pad(handshake: IHTTPSession) : WebSocket(handshake) {
        var slot = 0
        var name = "Celular"

        override fun onOpen() {
            slot = freeSlot()
            name = "Celular ${slot + 1}"
            pads.add(this)
            try {
                send(JSONObject().put("t", "hello").put("slot", slot).put("mode", RemoteHub.mode).toString())
            } catch (_: Exception) {}
            notifyClients()
        }

        override fun onClose(code: WebSocketFrame.CloseCode?, reason: String?, initiatedByRemote: Boolean) {
            pads.remove(this)
            // Suelta cualquier botón que haya quedado presionado
            for (k in listOf("A", "B", "X", "Y", "UP", "DOWN", "LEFT", "RIGHT", "START", "SELECT", "L1", "R1", "L2", "R2")) {
                RemoteHub.gameKey(slot, k, false)
            }
            RemoteHub.gameAxis(slot, "l", 0f, 0f)
            RemoteHub.gameAxis(slot, "r", 0f, 0f)
            notifyClients()
        }

        override fun onMessage(message: WebSocketFrame) {
            val m = try { JSONObject(message.textPayload ?: return) } catch (_: Exception) { return }
            when (m.optString("t")) {
                "ping" -> try { send("{\"t\":\"pong\"}") } catch (_: Exception) {}
                "name" -> {
                    name = m.optString("v", name).take(24)
                    notifyClients()
                }
                "k" -> {
                    val key = m.optString("c")
                    val down = m.optInt("d", 1) == 1
                    // El botón de menú/atrás del celular abre el menú del juego (guardar, cargar, salir…)
                    if (RemoteHub.game != null && (key == "BACK" || key == "MENU")) { if (down) RemoteHub.gameMenu() }
                    else if (RemoteHub.game != null) RemoteHub.gameKey(slot, key, down)
                    else if (down) RemoteHub.navKey(key, null)
                }
                "a" -> RemoteHub.gameAxis(slot, m.optString("s", "l"), m.optDouble("x", 0.0).toFloat(), m.optDouble("y", 0.0).toFloat())
                "text" -> RemoteHub.text(m.optString("v"))
            }
        }

        override fun onPong(pong: WebSocketFrame?) {}

        override fun onException(exception: IOException?) {
            pads.remove(this)
            notifyClients()
        }
    }
}
