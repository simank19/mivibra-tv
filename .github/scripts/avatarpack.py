#!/usr/bin/env python3
"""Arma MiVibra Movimiento para GitHub Pages (site/movimiento):
el editor de avatares caricatura (piezas CC0 de Quaternius), los juegos (vallas, 100 m planos, salto largo, bolos, tenis de mesa, voleibol y fútbol de playa) y la cámara del celular;
además deja
el editor de avatares VRM Avatar Maker (MIT, piezas CC0 de MakeHuman) en español y con la marca MiVibra,
más el juego de 100 m con vallas, que corre con el avatar guardado en el mismo navegador.

Uso: python3 avatarpack.py <carpeta web/ del editor original> <salida>
"""
import os, re, shutil, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OVR = os.path.join(ROOT, 'movimiento')


def sub1(text, old, new, what):
    if old not in text:
        sys.exit('avatarpack: no encontré %s en el editor original (¿cambió la versión?)' % what)
    return text.replace(old, new, 1)


def tienda(out):
    """Tienda de juegos: copia las portadas y videos, y arma tienda.json con los archivos de cada juego (tamaño y huella)."""
    import hashlib, json
    src = os.path.join(OVR, 'tienda')
    if not os.path.isdir(src):
        return
    shutil.copytree(src, os.path.join(out, 'tienda'), dirs_exist_ok=True, ignore=shutil.ignore_patterns('catalogo.json'))
    cat = json.load(open(os.path.join(src, 'catalogo.json'), encoding='utf-8'))
    for g in cat['juegos']:
        files, total = [], 0
        rels = []
        for rel in g.pop('archivos', []):
            # se permiten comodines (mg/*.json, sonidos/*) para no listar cada archivo a mano
            if '*' in rel:
                import glob
                hits = sorted(os.path.relpath(x, out).replace(os.sep, '/') for x in glob.glob(os.path.join(out, rel)) if os.path.isfile(x))
                if not hits:
                    sys.exit('tienda: nada coincide con %s para %s' % (rel, g['id']))
                rels += hits
            else:
                rels.append(rel)
        for rel in dict.fromkeys(rels):
            f = os.path.join(out, rel)
            if not os.path.isfile(f):
                sys.exit('tienda: falta %s para %s' % (rel, g['id']))
            data = open(f, 'rb').read()
            files.append({'p': rel, 's': len(data), 'h': hashlib.sha1(data).hexdigest()[:12]})
            total += len(data)
        g['archivos'] = files
        g['tamano'] = total
        # la versión cambia sola si cambia cualquier archivo (así sale "Actualizar")
        g['huella'] = hashlib.sha1(''.join(x['h'] for x in files).encode()).hexdigest()[:12]
    cat.pop('nota', None)
    json.dump(cat, open(os.path.join(out, 'tienda.json'), 'w', encoding='utf-8'), ensure_ascii=False)


def main():
    src, out = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
    if os.path.exists(out):
        shutil.rmtree(out)
    shutil.copytree(src, out)
    # Editor: español, fuentes y estilos MiVibra, y el puente para guardar el avatar
    p = os.path.join(out, 'editor', 'index.html')
    h = open(p, encoding='utf-8').read()
    h = sub1(h, '<html lang="en">', '<html lang="es">', 'lang')
    h = re.sub(r'<title>[^<]*</title>', '<title>MiVibra · Crea tu avatar</title>', h, count=1)
    h = sub1(h, '</style>', '</style>\n<link rel="preconnect" href="https://fonts.googleapis.com">\n'
             '<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">\n'
             '<link rel="stylesheet" href="../mivibra.css">', 'estilos')
    h = sub1(h, '<script type="module" src="./editor.js"></script>', '<script src="../mivibra.js"></script>\n<script type="module" src="./editor.js"></script>', 'script')
    open(p, 'w', encoding='utf-8').write(h)
    p = os.path.join(out, 'editor', 'editor.js')
    j = open(p, encoding='utf-8').read()
    j = sub1(j, 'authors: ["Made with VRM Avatar Maker"]', 'authors: ["MiVibra Movimiento (VRM Avatar Maker)"]', 'autores')
    j = sub1(j, 'name: recipe.name || "My avatar"', 'name: recipe.name || "Mi avatar"', 'nombre')
    j = sub1(j, 'new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })', 'new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })', 'renderer')
    j = sub1(j, 'scene.background = new THREE.Color(0x26282b);', 'scene.background = null;  // MiVibra: fondo de vidrio gris (CSS)', 'fondo')
    j = sub1(j, 'new THREE.GridHelper(4, 8, 0x555555, 0x3a3a3a)', 'new THREE.GridHelper(4, 8, 0xb8bcc0, 0x8a8e92)', 'cuadrícula')
    j += '\n// MiVibra: el botón "Guardar en MiVibra" arma el VRM con la misma función que la descarga\nwindow.MV_EXPORT = exportVRM;\n'
    open(p, 'w', encoding='utf-8').write(j)
    for f in ('mivibra.js', 'mivibra.css'):
        shutil.copy(os.path.join(OVR, f), os.path.join(out, f))
    # El editor VRM queda en editor-vrm/ (avatares realistas, ya no se usa en los juegos);
    # el editor nuevo de avatares caricatura va en editor/
    shutil.move(os.path.join(out, 'editor'), os.path.join(out, 'editor-vrm'))
    os.makedirs(os.path.join(out, 'editor'), exist_ok=True)
    shutil.copy(os.path.join(OVR, 'editor.html'), os.path.join(out, 'editor', 'index.html'))
    # todos los módulos comunes (motor de juegos, estilo de las maquetas, efectos, sonidos…)
    for f in sorted(os.listdir(OVR)):
        if f.endswith('.js') or f in ('animaciones.json', 'patrocinadores.json'):
            shutil.copy(os.path.join(OVR, f), os.path.join(out, f))
    # Avatares anime (cuerpos de Tripo con esqueleto propio) y su editor nuevo
    # Desde el muñeco MiVibra solo se publica su cuerpo (los cuerpos anime y sus piezas quedan en el repo)
    if os.path.exists(os.path.join(OVR, 'cuerpos')):
        shutil.copytree(os.path.join(OVR, 'cuerpos'), os.path.join(out, 'cuerpos'), ignore=shutil.ignore_patterns('hombre*', 'mujer*'))
    # Editor del muñeco (solo color y nombre). También en anime/ y editor/ para las versiones viejas de la app.
    for d in ('muneco', 'anime', 'editor'):
        os.makedirs(os.path.join(out, d), exist_ok=True)
        shutil.copy(os.path.join(OVR, 'muneco.html'), os.path.join(out, d, 'index.html'))
    for d in ('kit', 'sonidos'):
        shutil.copytree(os.path.join(OVR, d), os.path.join(out, d))
    shutil.copytree(os.path.join(OVR, 'avatars'), os.path.join(out, 'avatars'), ignore=shutil.ignore_patterns('*.vrm', 'tv'))
    if os.path.exists(os.path.join(OVR, 'bolos.html')):
        os.makedirs(os.path.join(out, 'bolos'), exist_ok=True)
        shutil.copy(os.path.join(OVR, 'bolos.html'), os.path.join(out, 'bolos', 'index.html'))
    for game in ('futbol', 'voley', 'dardos', 'arco', 'boxeo', 'golf', 'beisbol', 'esqui', 'americano', 'baile', 'carrera', 'tenis-cancha', 'rc', 'minigolf'):
        if os.path.exists(os.path.join(OVR, game + '.html')):
            os.makedirs(os.path.join(out, game), exist_ok=True)
            shutil.copy(os.path.join(OVR, game + '.html'), os.path.join(out, game, 'index.html'))
    # Carreras RC: cielos y luz real (HDRI CC0 de Poly Haven)
    # Minigolf: hoyos de Open Golf (MIT) y modelos Kenney (CC0) convertidos a JSON
    if os.path.isdir(os.path.join(OVR, 'mg')):
        shutil.copytree(os.path.join(OVR, 'mg'), os.path.join(out, 'mg'), dirs_exist_ok=True)
    if os.path.isdir(os.path.join(OVR, 'rchdr')):
        shutil.copytree(os.path.join(OVR, 'rchdr'), os.path.join(out, 'rchdr'), dirs_exist_ok=True)
    if os.path.exists(os.path.join(OVR, 'tenis.html')):
        os.makedirs(os.path.join(out, 'tenis'), exist_ok=True)
        shutil.copy(os.path.join(OVR, 'tenis.html'), os.path.join(out, 'tenis', 'index.html'))
    os.makedirs(os.path.join(out, 'vallas'), exist_ok=True)
    shutil.copy(os.path.join(OVR, 'vallas.html'), os.path.join(out, 'vallas', 'index.html'))
    # el mismo estadio para 100 m planos y salto largo (solo cambia el modo)
    vh = open(os.path.join(OVR, 'vallas.html'), encoding='utf-8').read()
    for mode in ('planos', 'salto'):
        os.makedirs(os.path.join(out, mode), exist_ok=True)
        with open(os.path.join(out, mode, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(vh.replace('<script type="importmap">', '<script>window.MV_MODE = "' + mode + '";</script>\n<script type="importmap">', 1))
    shutil.copytree(os.path.join(OVR, 'addons3'), os.path.join(out, 'vendor', 'three-0.183.2', 'addons'), dirs_exist_ok=True)
    os.makedirs(os.path.join(out, 'camara'), exist_ok=True)
    shutil.copy(os.path.join(OVR, 'camara.html'), os.path.join(out, 'camara', 'index.html'))
    tienda(out)
    open(os.path.join(out, 'index.html'), 'w').write('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=muneco/"><title>MiVibra Movimiento</title>')


if __name__ == '__main__':
    main()
