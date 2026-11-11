# Plugins de MiVibra TV

Un plugin agrega películas, series, canales o videos a MiVibra TV. Se instala pegando su dirección en
**Ajustes › Listas › Plugins**. Los plugins **no ejecutan código**: son un archivo JSON que describe el contenido,
así que instalar uno no pone en riesgo el equipo.

> Publica solo contenido que tengas derecho a compartir: tus propios videos, material con licencia libre
> (Creative Commons, dominio público) o servicios que te autoricen.

## Cómo se instala

En **Plugins** se puede pegar cualquiera de estas formas:

| Lo que pegas | Ejemplo |
|---|---|
| Repositorio de GitHub | `usuario/mi-plugin` |
| Carpeta dentro de un repositorio | `simank19/mivibra-tv/plugins/cine-libre` |
| Enlace de GitHub | `https://github.com/usuario/mi-plugin` |
| Enlace directo al archivo | `https://misitio.com/mivibra-plugin.json` |

MiVibra busca el archivo `mivibra-plugin.json` (o `mivibra-repo.json`) en la rama `main` y luego en `master`.

## El archivo `mivibra-plugin.json`

```json
{
  "mivibra": 1,
  "name": "Mis videos",
  "version": "1.0.0",
  "author": "Tu nombre",
  "description": "Lo que trae el plugin",
  "logo": "logo.png",
  "items": [ … ],
  "catalog": "catalogo.json",
  "source": { … }
}
```

Puedes usar `items`, `catalog`, `source` o varios a la vez.

- **`items`**: el contenido escrito en el mismo archivo.
- **`catalog`**: otro archivo JSON del repositorio con la lista de `items`. Sirve para catálogos grandes.
- **`source`**: el contenido sale de otro lugar (ver abajo).

Las direcciones relativas (`poster.jpg`, `videos/1.mp4`) se toman desde la carpeta del plugin.

### Elementos (`items`)

| Campo | Para qué |
|---|---|
| `type` | `movie`, `series`, `live` o `video` |
| `name` | Título |
| `year` | Año (películas) |
| `poster` / `logo` | Carátula / logo del canal |
| `description` | Sinopsis |
| `genres` | Lista de géneros |
| `group` | Categoría dentro del plugin |
| `url` | Enlace del video (mp4, mkv, m3u8…) |
| `archive` | En vez de `url`: identificador de una película de Internet Archive |
| `userAgent` / `referer` | Encabezados, si el servidor los pide |
| `episodes` | Solo series (ver abajo) |

Capítulos de una serie:

```json
{
  "type": "series", "name": "Mi serie", "poster": "serie.jpg",
  "episodes": [
    { "season": 1, "episode": 1, "name": "Piloto", "url": "https://…/s1e1.mp4", "thumbnail": "s1e1.jpg", "description": "…" }
  ]
}
```

### Fuentes (`source`)

Lista M3U:

```json
"source": { "type": "m3u", "url": "https://…/mis-canales.m3u" }
```

Colección de Internet Archive (cine de dominio público):

```json
"source": { "type": "archive", "collection": "feature_films", "group": "Clásicos", "limit": 200 }
```

## Repositorio de varios plugins: `mivibra-repo.json`

Al pegarlo se abre un menú para instalar cada plugin, como en Kodi.

```json
{
  "name": "Mis plugins",
  "plugins": [
    { "name": "Cine libre", "description": "Clásicos de dominio público", "repo": "simank19/mivibra-tv/plugins/cine-libre" },
    { "name": "Mis canales", "repo": "usuario/mis-canales" }
  ]
}
```

También acepta addons de Stremio (`"manifest": "https://…/manifest.json"`) y listas (`"m3u": "https://…/lista.m3u"`).

## Ejemplos

- `simank19/mivibra-tv/plugins` — repositorio con los plugins oficiales.
- `simank19/mivibra-tv/plugins/cine-libre` — clásicos de Internet Archive.
- `simank19/mivibra-tv/plugins/peliculas-abiertas` — cortos libres de Blender (plantilla para el tuyo).
