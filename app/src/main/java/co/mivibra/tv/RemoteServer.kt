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
        val asset = when {
            path == "/" || path == "/index.html" -> "www/pad.html"
            path == "/roms" || path == "/roms/" -> "www/roms.html"
            path == "/isotipo.svg" -> "www/img/isotipo.svg"
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
                    if (RemoteHub.game != null) RemoteHub.gameKey(slot, key, down)
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
