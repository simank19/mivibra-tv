# Inicio MiVibra (launcher estilo consola)

App aparte (`co.mivibra.inicio`, carpeta `inicio/`) que reemplaza la pantalla de inicio del televisor. Se actualiza por separado de MiVibra TV, así una actualización de una nunca borra la otra. Se compila con `.github/workflows/inicio.yml` y se publica como `inicio-N` en Releases.

Las sugerencias de MiVibra TV y la clave de YouTube llegan desde MiVibra TV por `InicioProvider` (solo responde a apps firmadas con la misma llave).

Incluye:

- **Destacados:** MiVibra TV primero y tus apps fijadas en tarjetas grandes (se mueven con el botón ☰ del control).
- **Entradas:** HDMI y AV del televisor, si la TV las reporta.
- **Todas las apps** en cuadrícula.
- **Fondos con tus fotos:** "Subir desde el celular" muestra un QR; el celular (mismo Wi-Fi) elige fotos de la galería o de Google Fotos y las manda a la TV. No necesita configurar nada.
- **Google Fotos directo** (opcional): con la cuenta de Google de la TV, después de activarlo en Google Cloud (abajo).
- Reloj, clima de Bogotá, estado de la red, sonidos al moverse, desenfoque y movimiento del fondo opcionales.


## Ponerlo como inicio de la TV

Con la APK instalada, desde el PC (misma red, depuración activada):

```
adb connect IP_DE_LA_TV:5555
adb install -r InicioMiVibra-N.apk
adb shell cmd package set-home-activity co.mivibra.inicio/.LauncherActivity
adb shell pm disable-user --user 0 com.google.android.tvlauncher
```

En televisores Xiaomi con PatchWall el paquete del inicio original es `com.mitv.tvhome`.

Para volver al inicio original:

```
adb shell pm enable com.google.android.tvlauncher
adb shell cmd package set-home-activity com.google.android.tvlauncher/.MainActivity
```

**Importante:** antes de desinstalar Inicio MiVibra, vuelve a activar el inicio original; si no, la TV se queda sin pantalla de inicio.

## Activar Google Fotos (una sola vez)

Se hace en el mismo proyecto de Google Cloud que ya usa MiVibra TV para el inicio de sesión.

1. **APIs y servicios → Biblioteca:** busca **Google Photos Picker API** y actívala.
2. **Pantalla de consentimiento de OAuth → Permisos (Data access):** agrega el permiso
   `https://www.googleapis.com/auth/photospicker.mediaitems.readonly`.
   Si la app está en modo *Prueba*, agrega tu correo en **Usuarios de prueba**.
3. **Credenciales → Crear credenciales → ID de cliente de OAuth → Android:**
   - Nombre del paquete: `co.mivibra.tv`
   - Huella SHA-1: `55:B3:A7:F0:24:0C:DD:3F:C1:62:9E:9F:FA:AE:CF:BB:D7:CE:46:55`

Con eso, en la TV: **Fondos → Conectar Google Fotos** pide el permiso con la cuenta de Google de la TV.
Google no permite este permiso con el código de `google.com/device`, por eso el camino sin configuración es "Subir desde el celular".

Google ya no deja que las apps lean toda la biblioteca: siempre eliges qué fotos usar. Para agregar más, vuelve a
tocar **Elegir de Google Fotos**. Las fotos quedan guardadas en la TV a tamaño 1080p.

## Tu cuenta de YouTube (Nuevo de tus suscripciones y Tus me gusta)

En el inicio, al final de "Tendencias en YouTube", está **Conectar mi YouTube** (también en Fondos → Mi YouTube).
La TV muestra un código para `google.com/device`; se usa el cliente de TV que ya tiene MiVibra (`MV_GOOGLE_TV_CLIENT`)
con el permiso de solo lectura `youtube.readonly`. El token queda guardado solo en esa TV.

En Google Cloud, en el proyecto del cliente de TV:
1. **Biblioteca:** activa **YouTube Data API v3** (si la clave de YouTube de MiVibra es de otro proyecto, actívala también aquí).
2. **Pantalla de consentimiento → Permisos:** agrega `https://www.googleapis.com/auth/youtube.readonly`.
   Si la app está en *Prueba*, agrega tu correo como usuario de prueba. Si no está verificada, Google muestra
   "Google no verificó esta app": toca *Avanzado → Ir a MiVibra* para seguir.

Google no deja leer las recomendaciones personales del inicio de YouTube; por eso se muestran tus suscripciones y tus me gusta.

## Archivos

- `inicio/src/main/java/co/mivibra/inicio/` — `LauncherActivity`, `LauncherBridge`, `Apps` (apps y entradas), `GooglePhotos` (Picker API), `PhotoUploadServer`, `YouTubeAccount`, `MiVibraLink`.
- `app/src/main/java/co/mivibra/tv/InicioProvider.kt` — lo que MiVibra TV le entrega al inicio.
- `inicio/src/main/assets/www/launcher/` — interfaz (`index.html`, `launcher.css`, `launcher.js`). Se puede ver en el PC abriendo `index.html` con un servidor local: usa datos de prueba.
