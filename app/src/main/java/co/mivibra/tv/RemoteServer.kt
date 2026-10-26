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
        val asset = when {
            path == "/" || path == "/index.html" -> "www/pad.html"
            path == "/isotipo.svg" -> "www/img/isotipo.svg"
            else -> null
        } ?: return NanoHTTPD.newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "No encontrado")
        return try {
            val bytes = ctx.assets.open(asset).use { it.readBytes() }
            val mime = if (asset.endsWith(".svg")) "image/svg+xml" else "text/html; charset=utf-8"
            NanoHTTPD.newFixedLengthResponse(Response.Status.OK, mime, bytes.inputStream(), bytes.size.toLong())
        } catch (e: IOException) {
            NanoHTTPD.newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain", e.message ?: "error")
        }
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
