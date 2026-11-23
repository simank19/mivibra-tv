package co.mivibra.tv

import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.Scope

/**
 * Permiso de solo lectura para YouTube con la cuenta de Google del equipo (suscripciones, Me gusta, tus listas).
 * Usa el selector oficial de Google: la contraseña nunca pasa por la app. Devuelve un token de acceso (dura ~1 hora).
 */
object YtAuth {
    private const val SCOPE = "https://www.googleapis.com/auth/youtube.readonly"

    fun token(a: MainActivity, done: (Boolean, String) -> Unit) {
        a.runOnUiThread {
            try {
                val req = AuthorizationRequest.builder().setRequestedScopes(listOf(Scope(SCOPE))).build()
                Identity.getAuthorizationClient(a).authorize(req)
                    .addOnSuccessListener { r: AuthorizationResult ->
                        if (r.hasResolution()) {
                            // Hay que elegir la cuenta o aceptar el permiso
                            val pi = r.pendingIntent
                            if (pi == null) { done(false, "Google no permitió continuar"); return@addOnSuccessListener }
                            try {
                                a.startSenderForResult(pi.intentSender) { _, data ->
                                    try {
                                        val r2 = Identity.getAuthorizationClient(a).getAuthorizationResultFromIntent(data)
                                        val t = r2.accessToken
                                        if (t.isNullOrBlank()) done(false, "cancelado") else done(true, t)
                                    } catch (e: Exception) { done(false, if (data == null) "cancelado" else (e.message ?: "No se pudo autorizar")) }
                                }
                            } catch (e: Exception) { done(false, e.message ?: "No se pudo abrir el selector de cuentas") }
                        } else {
                            val t = r.accessToken
                            if (t.isNullOrBlank()) done(false, "Google no entregó el permiso") else done(true, t)
                        }
                    }
                    .addOnFailureListener { e -> done(false, e.message ?: "No se pudo autorizar con Google") }
            } catch (e: Exception) {
                done(false, e.message ?: e.javaClass.simpleName)
            }
        }
    }
}
