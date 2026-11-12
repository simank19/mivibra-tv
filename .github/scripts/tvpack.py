#!/usr/bin/env python3
"""Arma MiVibra TV para televisores Samsung (Tizen, .wgt) y LG (webOS, carpeta lista para .ipk),
y la copia publicada en GitHub Pages (site/tv) con la que se actualizan solos.

Uso:
  python3 tvpack.py app   <salida> <número>   -> carpeta de la app con config.js (para empaquetar)
  python3 tvpack.py site  <salida> <número>   -> copia pública (sin config.js ni biblioteca privada)
Requiere en vendor/ (lo baja el workflow con npm): hls.min.js, mpegts.js, pako_inflate.min.js
"""
import json, os, re, shutil, sys, time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
WWW = os.path.join(ROOT, 'app', 'src', 'main', 'assets', 'www')
PC = os.path.join(ROOT, 'desktop', 'web')
TVW = os.path.join(ROOT, 'tvweb')
VENDOR = os.path.join(ROOT, 'build-tv-vendor')


def files_of(html):
    css = [h for h in re.findall(r'<link rel="stylesheet" href="([^"]+)">', html) if not h.startswith('http')]
    js = re.findall(r'<script src="([^"]+)"></script>', html)
    return css, js


def copy_app(out, public):
    if os.path.exists(out):
        shutil.rmtree(out)
    ignore = shutil.ignore_patterns('mibiblioteca', 'config.js') if public else None
    shutil.copytree(WWW, out, ignore=ignore)
    # Reproductor (el mismo del PC) con las teclas del control del TV
    pc = os.path.join(out, 'pc')
    os.makedirs(os.path.join(pc, 'vendor'), exist_ok=True)
    for f in ('player.js', 'player.css'):
        shutil.copy(os.path.join(PC, f), pc)
    ph = open(os.path.join(PC, 'player.html'), encoding='utf-8').read()
    ph = ph.replace('<script src="player.js"></script>', '<script src="player-tv.js"></script>\n<script src="player.js"></script>')
    open(os.path.join(pc, 'player.html'), 'w', encoding='utf-8').write(ph)
    shutil.copy(os.path.join(TVW, 'player-tv.js'), pc)
    for f in ('hls.min.js', 'mpegts.js'):
        shutil.copy(os.path.join(VENDOR, f), os.path.join(pc, 'vendor', f))
    os.makedirs(os.path.join(out, 'tvvendor'), exist_ok=True)
    shutil.copy(os.path.join(VENDOR, 'pako_inflate.min.js'), os.path.join(out, 'tvvendor'))
    shutil.copy(os.path.join(TVW, 'bridge.js'), os.path.join(out, 'tvbridge.js'))
    shutil.copy(os.path.join(TVW, 'boot.js'), os.path.join(out, 'tvboot.js'))


def main():
    mode, out, num = sys.argv[1], os.path.abspath(sys.argv[2]), sys.argv[3]
    ts = int(time.time())
    html = open(os.path.join(WWW, 'index.html'), encoding='utf-8').read()
    css, js = files_of(html)
    copy_app(out, mode == 'site')
    if mode == 'site':
        json.dump({'ts': ts, 'version': '1.0.' + num, 'files': {'css': css, 'js': js}}, open(os.path.join(out, 'manifest.json'), 'w'))
        return
    # index.html del TV: los estilos y scripts los carga tvboot.js (de internet si hay una versión más nueva)
    tv = html
    for c in css:
        tv = tv.replace('<link rel="stylesheet" href="%s">\n' % c, '')
    for j in js:
        tv = tv.replace('<script src="%s"></script>\n' % j, '')
    head = ('<script>window.MVTV_VERSION=%s;window.MVTV_BUILD=%d;window.MVTV_FILES=%s;</script>\n'
            '<script src="tvvendor/pako_inflate.min.js"></script>\n<script src="tvbridge.js"></script>\n<script src="tvboot.js"></script>\n') % (
        json.dumps('1.0.' + num), ts, json.dumps({'css': css, 'js': js}))
    tv = tv.replace('</head>', head + '</head>')
    open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(tv)


if __name__ == '__main__':
    main()
