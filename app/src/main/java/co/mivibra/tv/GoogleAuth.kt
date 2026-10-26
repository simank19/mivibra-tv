package co.mivibra.tv

import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import androidx.lifecycle.lifecycleScope
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.launch

/** Inicio de sesión con Google nativo (Credential Manager). Devuelve el idToken para Firebase. */
object GoogleAuth {
    fun signIn(a: MainActivity, webClientId: String, done: (Boolean, String, String) -> Unit) {
        a.lifecycleScope.launch {
            try {
                val option = GetSignInWithGoogleOption.Builder(webClientId).build()
                val req = GetCredentialRequest.Builder().addCredentialOption(option).build()
                val res = CredentialManager.create(a).getCredential(a, req)
                val c = res.credential
                if (c is CustomCredential && c.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                    val t = GoogleIdTokenCredential.createFrom(c.data)
                    done(true, t.idToken, t.id)
                } else {
                    done(false, "Respuesta de Google no reconocida", "")
                }
            } catch (e: GetCredentialCancellationException) {
                done(false, "cancelado", "")
            } catch (e: NoCredentialException) {
                done(false, "No hay cuentas de Google en este equipo. Usa la opción con código.", "")
            } catch (e: GetCredentialException) {
                done(false, e.message ?: "No se pudo iniciar sesión con Google", "")
            } catch (e: Exception) {
                done(false, e.message ?: e.javaClass.simpleName, "")
            }
        }
    }
}
