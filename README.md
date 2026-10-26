# MiVibra TV

Reproductor de listas IPTV con interfaz *glass* para **Android TV, celular y tablet**, de MiVibra.

## Descargar la APK

Cada vez que se sube un cambio, GitHub compila la app sola. La APK queda en
**Releases** (columna derecha del repositorio) con el nombre `MiVibraTV-N.apk`.
Ábrela desde el celular o la TV y acepta "Instalar apps de origen desconocido".
Las nuevas versiones se instalan encima de la anterior sin perder tus datos.

## Qué incluye

**Ver**
- Listas M3U/M3U8 por enlace o archivo, y cuentas Xtream Codes (en vivo, películas y series).
- Todas las listas se combinan en un solo catálogo; los canales repetidos guardan señales alternativas y el reproductor cambia solo si una falla.
- Secciones: Inicio, En vivo, Guía EPG, Películas, Series, Plataformas, Anime, K-Drama, Documentales, Favoritos e Historial.
- Separadores por plataforma (Netflix, Disney+, Prime Video, Max, Paramount+, Apple TV+, Hulu, Crunchyroll, Viki, Star+, ViX y más) según las categorías de tus listas; solo texto, sin logotipos de marcas.
- Clasificador de géneros: acción, aventura, suspenso, terror, comedia, drama, romance, ciencia ficción, fantasía, crimen, infantil, documental y más.
- Sugerencias en el Inicio según lo que ve cada perfil.
- Buscador con teclado en pantalla y por voz desde el celular.
- Fichas automáticas con sinopsis, reparto y carátulas (TMDB para películas y series, MyAnimeList/Jikan para anime).
- Cine clásico de dominio público (Internet Archive).
- Canales gratuitos y legales con un toque (Free-TV, iptv-org).

**Reproductor**
- Pantalla completa nativa (ExoPlayer/Media3): HLS, DASH, MPEG-TS, MP4, MKV.
- Idioma de audio y subtítulos, ajuste de imagen, cambio de canal con ▲▼, imagen en imagen en el celular.
- Continuar donde lo dejaste, también desde otro dispositivo.

**Perfiles y familia**
- Perfiles con 98 avatares de [alohe/avatars](https://github.com/alohe/avatars) (MIT) y PIN opcional.
- Menú infantil con límite de tiempo diario y salida con PIN parental.
- Contenido +18 oculto con usuario, contraseña y PIN, que se bloquea solo a los 30 minutos.
- Temas de color, intensidad del vidrio y animaciones configurables.

**Juegos**
- Emulación con [LibretroDroid](https://github.com/Swordfish90/LibretroDroid): NES, SNES, Game Boy/Color/Advance, N64, DS, Genesis, Master System, Game Gear, PlayStation, Atari, PC Engine, Neo Geo Pocket, WonderSwan y Arcade.
- Ports: Doom, Quake, Wolfenstein 3D y Cave Story (con Freedoom gratis para empezar).
- Lee ROMs desde la memoria interna, USB o disco duro, y las descarga desde un enlace.
- Mandos Bluetooth/USB con joysticks, y controles táctiles en celular y tablet.
- Partidas guardadas y géneros de juego.

**Celular como mando**
- En Ajustes › Mando con celular aparece un código QR. Con el celular en el mismo Wi-Fi lo escaneas y queda como control remoto, teclado o mando de juego con joysticks. Cada celular es un jugador.

**Sincronización**
- Opcional, con tu propio proyecto gratuito de Firebase: perfiles, favoritos, historial, continuar viendo y listas en todos tus dispositivos.

## Configuración opcional

- **TMDB** (sinopsis y carátulas): crea una clave gratis en themoviedb.org › Ajustes › API y pégala en Ajustes › Sinopsis y carátulas.
- **Firebase** (sincronización): crea un proyecto, activa Authentication (correo/contraseña) y Firestore, y pega el `firebaseConfig` en Ajustes › Sincronización.
- Reglas sugeridas de Firestore:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /mivibra/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

## Estructura

```
app/src/main/java/co/mivibra/tv/   Código nativo (Kotlin)
  MainActivity.kt    Interfaz web + puente nativo
  Bridge.kt          Funciones que llama la interfaz (red, archivos, juegos, mando)
  PlayerActivity.kt  Reproductor ExoPlayer
  GameActivity.kt    Emulador LibretroDroid
  RemoteServer.kt    Servidor Wi-Fi para el celular como mando
  Epg.kt, Storage.kt, Cores.kt, Net.kt, RemoteHub.kt
app/src/main/assets/www/           Interfaz (HTML, CSS, JS)
  index.html, app.css, data.js, core.js, catalog.js, ui.js
  pad.html           Mando del celular y controles táctiles
  avatars/           Avatares de alohe/avatars (MIT)
```

## Aviso

MiVibra TV no incluye ni vende contenido. Reproduce las listas que agrega cada usuario
y canales públicos gratuitos. Los juegos y BIOS los aporta el usuario.
Este producto usa la API de TMDB pero no está respaldado ni certificado por TMDB.

## Licencia

GPL-3.0 (requerida por LibretroDroid). Ver `LICENSE`.
Algunos núcleos libretro (Snes9x, Genesis Plus GX, FBNeo, MAME) solo permiten uso no comercial.
