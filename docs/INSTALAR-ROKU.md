# Instalar MiVibra TV en un Roku

MiVibra TV para Roku es una versión más sencilla, hecha especialmente para Roku: tiene TV en vivo, películas y series de tus listas, y usa tu misma cuenta MiVibra.

## Lo que necesitas
- Un Roku (TV Roku, Roku Express, Streaming Stick…) y un computador conectados al mismo Wi-Fi.
- El archivo **[MiVibraTV-Roku.zip](https://github.com/simank19/mivibra-tv/releases/latest/download/MiVibraTV-Roku.zip)**. No lo descomprimas: se sube tal cual.

## 1. Activar el modo desarrollador (una sola vez)
1. Con el control del Roku, en la pantalla de inicio presiona en orden: **Inicio ×3, Arriba ×2, Derecha, Izquierda, Derecha, Izquierda, Derecha**.
2. Aparece la pantalla **Developer Settings**. Anota la dirección que muestra (algo como `http://192.168.1.50`).
3. Elige **Enable installer and restart**, acepta el acuerdo y crea una **contraseña** (anótala). El usuario siempre es `rokudev`.
4. El Roku se reinicia.

## 2. Instalar MiVibra TV
1. En el computador abre la dirección que anotaste (por ejemplo `http://192.168.1.50`).
2. Entra con el usuario **rokudev** y la contraseña que creaste.
3. Toca **Upload**, elige `MiVibraTV-Roku.zip` y toca **Install with zip**.
4. MiVibra TV se abre sola en el Roku y queda en la pantalla de inicio como **"MiVibra TV (dev)"**.

## 3. Agregar tus listas
Tienes dos formas, desde **Ajustes** dentro de la app:
- **Entrar con el celular (código):** en el celular abre `google.com/device`, escribe el código que muestra el Roku y elige tu cuenta de Google. Llegan solas tus listas incluidas, tus perfiles, tus favoritos y "Continuar viendo".
- **Panel web:** desde cualquier celular o computador entra a **simank19.github.io/mivibra-tv/panel**, escribe el código de este Roku (aparece en *Ajustes › Agregar lista desde el panel web*) y pega tu enlace M3U o tu cuenta Xtream. La lista llega sola en menos de un minuto.

## Cómo se usa
- **Izquierda / derecha:** te mueves entre el menú, las categorías y las carátulas.
- **OK:** abre el canal, la película o los capítulos de la serie.
- **\* (asterisco):** agrega o quita de Favoritos.
- **Viendo TV en vivo:** ▲ ▼ cambian de canal y OK muestra el nombre del canal.
- **Atrás:** vuelve; en el menú, presiónalo dos veces para salir.
- Lo que ves queda en **Continuar viendo** y se guarda en tu cuenta: puedes seguirlo en el celular, el TV Android o el PC, y al revés.

## Qué tiene y qué no
- **Tiene:** listas M3U y Xtream, TV en vivo, películas, series con temporadas y capítulos, búsqueda, favoritos, Continuar viendo con tu cuenta, perfiles y el panel web.
- **No tiene (por ahora):** addons de Stremio, guía de programación, YouTube, música, juegos, portales MAC (Stalker), Jellyfin y Plex.
- Algunos canales que solo vienen en formato `.ts` pueden no abrir en Roku. Si la lista es Xtream, la app los pide en `.m3u8` automáticamente.

## Actualizar
Tus listas, favoritos y "Continuar viendo" se actualizan solos. Para tener una **versión nueva de la app**, descarga otra vez `MiVibraTV-Roku.zip` y súbela igual que la primera vez (paso 2): se reemplaza y conserva tus datos.

## Problemas comunes
- **No abre la página del Roku en el computador:** revisa que estén en el mismo Wi-Fi y que escribiste `http://` y la dirección exacta.
- **Pide usuario y contraseña:** el usuario es `rokudev`; la contraseña es la que creaste al activar el modo desarrollador.
- **"No se pudo reproducir":** ese enlace no funciona en Roku o está caído. Prueba otro canal o el mismo en otra calidad.
- **Solo se puede tener una app en modo desarrollador:** si subes otra, MiVibra TV se reemplaza.
