# Cuenta MiVibra: inicio con Google y superadministrador

Con esto la app pide iniciar sesión con Google:

- **Superadministrador** (tu Gmail): agrega listas M3U, cuentas Xtream y la clave de TMDB, y decide qué usuarios entran. Lo que cambias llega a todos los equipos.
- **Usuarios**: entran con su Google y ven todo ya cargado. No pueden cambiar listas ni claves.
- Perfiles, favoritos, historial y "continuar viendo" se sincronizan por cuenta entre TV, celular y tablet.

Todo es gratis (plan Spark de Firebase). Tarda unos 15 minutos.

## 1. Proyecto de Firebase

1. Entra a <https://console.firebase.google.com> › **Agregar proyecto** (por ejemplo `mivibra-tv`). Puedes desactivar Analytics.
2. En la página del proyecto pulsa el ícono **Web `</>`** › nombre `MiVibra TV` › **Registrar app**. Copia todo el bloque `const firebaseConfig = { ... }`. Ese es el secreto **MV_FIREBASE**.
3. Menú **Compilación › Authentication › Comenzar › Google** › Habilitar › elige tu correo de asistencia › **Guardar**.
   Vuelve a abrir el proveedor Google y despliega **Configuración del SDK web**: copia el **ID de cliente web** (termina en `.apps.googleusercontent.com`). Ese es **MV_GOOGLE_WEB_CLIENT**.
4. En **Configuración del proyecto** (engranaje) › **Tus apps** › **Agregar app › Android**:
   - Nombre del paquete: `co.mivibra.tv`
   - SHA-1: `55:B3:A7:F0:24:0C:DD:3F:C1:62:9E:9F:FA:AE:CF:BB:D7:CE:46:55`
   - Después de registrarla, en esa app pulsa **Agregar huella digital** y agrega también el SHA-256:
     `F2:DD:6E:D2:82:45:A2:8B:73:43:54:66:E5:09:EA:DD:43:FE:2D:70:3E:7F:A1:29:3C:6C:D2:D2:7F:4B:B0:C8`
   - No necesitas descargar el `google-services.json`.
5. Menú **Compilación › Firestore Database › Crear base de datos** › ubicación `southamerica-east1` (o la que prefieras) › modo producción.
   En la pestaña **Reglas** pega el contenido de [`firestore.rules`](../firestore.rules), cambia `TU_CORREO@gmail.com` por tu Gmail en minúsculas y pulsa **Publicar**.

## 2. Inicio con código para Android TV

En la TV es más cómodo entrar escaneando un código con el celular.

1. Abre <https://console.cloud.google.com/apis/credentials> con el **mismo proyecto** seleccionado arriba.
2. Si te lo pide, configura la **Pantalla de consentimiento de OAuth**: tipo *Externo*, nombre `MiVibra TV`, tu correo. En **Público** pulsa **Publicar app** (con correo y perfil no necesita revisión de Google).
3. **Crear credenciales › ID de cliente de OAuth** › tipo **TV y dispositivos de entrada limitada** › nombre `MiVibra TV (TV)`.
4. Copia el **ID de cliente** (**MV_GOOGLE_TV_CLIENT**) y el **Secreto del cliente** (**MV_GOOGLE_TV_SECRET**).

## 3. Secretos en GitHub

En <https://github.com/simank19/mivibra-tv/settings/secrets/actions> › **New repository secret**, crea estos cinco:

| Nombre | Valor |
|---|---|
| `MV_FIREBASE` | el bloque `firebaseConfig` del paso 1.2 |
| `MV_ADMIN_EMAIL` | tu Gmail (el del superadministrador) |
| `MV_GOOGLE_WEB_CLIENT` | ID de cliente web del paso 1.3 |
| `MV_GOOGLE_TV_CLIENT` | ID de cliente de TV del paso 2.4 |
| `MV_GOOGLE_TV_SECRET` | secreto del cliente de TV del paso 2.4 |

Luego ve a **Actions › Compilar APK › Run workflow**. La APK nueva ya trae la cuenta configurada.

## 4. Primer uso

1. Instala la APK en tu celular y entra con **Continuar con Google** usando tu Gmail de superadministrador.
2. En **Ajustes › Listas** agrega tus listas M3U (por enlace) y cuentas Xtream; en **Ajustes › Sinopsis y carátulas** pon tu clave de TMDB. Se suben solas.
3. En **Ajustes › Usuarios** agrega el Gmail de cada persona (o activa "Cualquier cuenta de Google puede entrar").
4. En la TV o la tablet entra con tu cuenta o la de cada usuario: el contenido aparece ya cargado.

Las listas agregadas como **archivo** se quedan solo en el equipo donde las subiste; para compartirlas usa un enlace.

## Si algo falla

- "Developer console is not set up correctly" o error 10 al elegir la cuenta: revisa el SHA-1 y el paquete `co.mivibra.tv` del paso 1.4.
- "Tu cuenta todavía no tiene acceso": agrega ese correo en **Ajustes › Usuarios** desde la cuenta de superadministrador.
- En la TV, si "Continuar con Google" no muestra cuentas, usa **Entrar con el celular (código)**.
