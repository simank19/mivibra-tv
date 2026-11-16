#!/usr/bin/env python3
"""Arma MiVibra Movimiento para GitHub Pages (site/movimiento):
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
    shutil.copytree(os.path.join(OVR, 'avatars'), os.path.join(out, 'avatars'))
    os.makedirs(os.path.join(out, 'vallas'), exist_ok=True)
    shutil.copy(os.path.join(OVR, 'vallas.html'), os.path.join(out, 'vallas', 'index.html'))
    open(os.path.join(out, 'index.html'), 'w').write('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=editor/"><title>MiVibra Movimiento</title>')


if __name__ == '__main__':
    main()
