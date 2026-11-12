"""Arma el canal de Roku (MiVibraTV-Roku.zip) a partir de roku/.

Uso: python3 .github/scripts/rokupack.py <salida.zip> <número de versión>
Toma la cuenta MiVibra de app/src/main/assets/www/config.js (lo escribe config.py con los secretos)
y genera los íconos y la pantalla de inicio con el logo de la app.
"""
import json, os, re, shutil, sys, tempfile, zipfile
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
out_zip, num = sys.argv[1], int(sys.argv[2])
src = os.path.join(ROOT, 'roku')
tmp = tempfile.mkdtemp()
dst = os.path.join(tmp, 'roku')
shutil.copytree(src, dst)

# Versión
man = open(os.path.join(dst, 'manifest')).read()
man = re.sub(r'build_version=\d+', 'build_version=%05d' % (num % 100000), man)
open(os.path.join(dst, 'manifest'), 'w').write(man)

# Cuenta MiVibra (Firebase y el inicio con código de Google)
cfg = {}
cj = os.path.join(ROOT, 'app/src/main/assets/www/config.js')
if os.path.exists(cj):
    t = open(cj).read()
    m = re.search(r'window\.MV_CONFIG\s*=\s*(\{.*\})\s*;?', t, re.S)
    if m:
        try:
            cfg = json.loads(m.group(1))
        except Exception:
            cfg = {}
fb = cfg.get('firebase') or {}
def q(s):
    return '"' + str(s or '').replace('"', '""') + '"'
open(os.path.join(dst, 'components/Config.brs'), 'w').write(
    "' Generado al compilar\nfunction mvConfig() as Object\n    return {\n"
    "        apiKey: %s\n        projectId: %s\n        tvClientId: %s\n        tvClientSecret: %s\n"
    "        panel: \"https://simank19.github.io/mivibra-tv/panel/\"\n    }\nend function\n" % (
        q(fb.get('apiKey')), q(fb.get('projectId')), q(cfg.get('tvClientId')), q(cfg.get('tvClientSecret'))))
print('Roku: cuenta', fb.get('projectId') or '(sin cuenta)', '· código TV:', bool(cfg.get('tvClientId')))

# Imágenes
night = (13, 12, 11)
icon = Image.open(os.path.join(ROOT, 'desktop/assets/icon.png')).convert('RGBA')
img = os.path.join(dst, 'images')
os.makedirs(img, exist_ok=True)

def card(w, h, logo_h, text=None):
    im = Image.new('RGBA', (w, h), night + (255,))
    glow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    d.ellipse((-w * 0.2, -h * 0.5, w * 0.6, h * 0.7), fill=(255, 105, 0, 110))
    d.ellipse((w * 0.55, h * 0.4, w * 1.3, h * 1.5), fill=(179, 74, 0, 90))
    glow = glow.filter(ImageFilter.GaussianBlur(min(w, h) // 6))
    im = Image.alpha_composite(im, glow)
    lg = icon.resize((logo_h, logo_h), Image.LANCZOS)
    im.alpha_composite(lg, ((w - logo_h) // 2, (h - logo_h) // 2 - (h // 14 if text else 0)))
    if text:
        try:
            from PIL import ImageFont
            f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', max(14, h // 12))
        except Exception:
            f = None
        d = ImageDraw.Draw(im)
        tw = d.textlength(text, font=f) if f else len(text) * 7
        d.text(((w - tw) / 2, (h + logo_h) // 2 - h // 14 + h // 30), text, fill=(243, 239, 234, 255), font=f)
    return im

card(540, 405, 200, 'MiVibra TV').convert('RGB').save(os.path.join(img, 'icon_fhd.png'))
card(290, 218, 110, 'MiVibra TV').convert('RGB').save(os.path.join(img, 'icon_hd.png'))
card(1920, 1080, 300, 'MiVibra TV').convert('RGB').save(os.path.join(img, 'splash_fhd.jpg'), quality=88)
card(1280, 720, 200, 'MiVibra TV').convert('RGB').save(os.path.join(img, 'splash_hd.jpg'), quality=88)
icon.resize((64, 64), Image.LANCZOS).save(os.path.join(img, 'logo.png'))
# Fondo con brillo naranja suave
bg = Image.new('RGBA', (1920, 1080), (0, 0, 0, 0))
d = ImageDraw.Draw(bg)
d.ellipse((-500, -500, 700, 500), fill=(255, 105, 0, 60))
d.ellipse((1300, 650, 2300, 1500), fill=(179, 74, 0, 50))
bg.filter(ImageFilter.GaussianBlur(180)).save(os.path.join(img, 'glow.png'))
# Carátula vacía (cuando el canal no trae logo)
t = Image.new('RGBA', (290, 163), (34, 31, 28, 255))
lg = icon.resize((70, 70), Image.LANCZOS)
lg.putalpha(lg.getchannel('A').point(lambda a: a * 0.35))
t.alpha_composite(lg, (110, 46))
t.save(os.path.join(img, 'tile.png'))

if os.path.exists(out_zip):
    os.remove(out_zip)
with zipfile.ZipFile(out_zip, 'w', zipfile.ZIP_DEFLATED) as z:
    for base, _, files in os.walk(dst):
        for fn in files:
            p = os.path.join(base, fn)
            z.write(p, os.path.relpath(p, dst))
shutil.rmtree(tmp)
print('Listo:', out_zip, os.path.getsize(out_zip), 'bytes')
