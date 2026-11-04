# Inicio MiVibra (launcher estilo consola)

Pantalla de inicio para el televisor que viene dentro de MiVibra TV:

- **Destacados:** MiVibra TV primero y tus apps fijadas en tarjetas grandes (se mueven con el botón ☰ del control).
- **Entradas:** HDMI y AV del televisor, si la TV las reporta.
- **Todas las apps** en cuadrícula.
- **Fondos con tus fotos:** "Subir desde el celular" muestra un QR; el celular (mismo Wi-Fi) elige fotos de la galería o de Google Fotos y las manda a la TV. No necesita configurar nada.
- **Google Fotos directo** (opcional): con la cuenta de Google de la TV, después de activarlo en Google Cloud (abajo).
- Reloj, clima de Bogotá, estado de la red, sonidos al moverse, desenfoque y movimiento del fondo opcionales.

Solo se activa en televisores: en celulares y tablets no aparece como pantalla de inicio.

## Ponerlo como inicio de la TV

Con la APK nueva instalada, desde el PC (misma red, depuración activada):

```
adb connect IP_DE_LA_TV:5555
adb shell am start -n co.mivibra.tv/.launcher.LauncherActivity
adb shell cmd package set-home-activity co.mivibra.tv/co.mivibra.tv.launcher.HomeAlias
```

Si el botón Inicio sigue abriendo el inicio de Xiaomi (PatchWall), desactívalo:

```
adb shell pm disable-user --user 0 com.mitv.tvhome
```

Para volver al inicio de Xiaomi:

```
adb shell pm enable com.mitv.tvhome
adb shell cmd package set-home-activity com.mitv.tvhome/.HomeActivity
```

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

## Archivos

- `app/src/main/java/co/mivibra/tv/launcher/` — `LauncherActivity`, `LauncherBridge`, `Apps` (apps y entradas), `GooglePhotos` (Picker API), `HomeSetup`.
- `app/src/main/assets/www/launcher/` — interfaz (`index.html`, `launcher.css`, `launcher.js`). Se puede ver en el PC abriendo `index.html` con un servidor local: usa datos de prueba.
