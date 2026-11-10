#!/usr/bin/env python3
"""Arma www/mibiblioteca/ (MiBiblioteca completa, sección privada del administrador) a partir del index.html de MiBiblioteca.
Uso: python3 tools/build-mibiblioteca.py carpeta/de/mibiblioteca"""
import sys, os, shutil
src = sys.argv[1]
root = os.path.dirname(os.path.abspath(__file__)) + '/../app/src/main/assets/www/mibiblioteca'
s = open(src + '/index.html', encoding='utf-8').read()
def sub(old, new, count=1):
    global s
    if old not in s: raise SystemExit('No encontré para reemplazar: ' + old[:90])
    s = s.replace(old, new) if count == 0 else s.replace(old, new, count)
# Los módulos van con extensión .js (el cargador de archivos de Android no reconoce .mjs)
sub("'lib/megajs.mjs'", "'lib/megajs.js'"); sub("new URL('unrar.mjs', location.href)", "new URL('unrar.js', location.href)", 0)
# Sin service worker dentro de la app
sub("if ('serviceWorker' in navigator && location.protocol === 'https:' || location.hostname === 'localhost') {", "if (false) {")
# Entrar con la cuenta de Google del equipo (el navegador interno no deja abrir la ventana de Google)
sub("  try { await auth.signInWithPopup(provider); }",
    "  if (window.mvNativeLogin) { try { await window.mvNativeLogin(auth); } catch (e) { $('loginMsg').textContent = window.mvLoginHelp(e); } btn.disabled = false; btn.textContent = 'Entrar con Google'; return; }\n  try { await auth.signInWithPopup(provider); }")
sub("window.addEventListener('popstate', () => closeReader(true));", "window.addEventListener('popstate', () => closeReader(true));\n" + r'''
/* ================= DENTRO DE MIVIBRA TV: cuenta, control remoto y Atrás ================= */
const MVP = window.parent !== window ? window.parent : null, MVX = MVP && MVP.MV;
function mvPost(m) { try { MVP && MVP.postMessage(Object.assign({ mbr: 1 }, m), '*'); } catch {} }
if (MVX && MVX.native && MVX.call && !(MVX.device && MVX.device.desktop) && MVP.MV_CONFIG && MVP.MV_CONFIG.webClientId) {
  window.mvNativeLogin = async a => {
    const d = await MVX.call('googleSignIn', [MVP.MV_CONFIG.webClientId]);
    await a.signInWithCredential(firebase.auth.GoogleAuthProvider.credential(d.idToken));
  };
  window.mvLoginHelp = e => /invalid-credential|audience|INVALID_IDP|OAuth client/i.test((e && (e.code + ' ' + e.message)) || '')
    ? 'Falta un paso (solo una vez): en Firebase › proyecto Bibliopub › Authentication › Método de acceso › Google › "Incluir IDs de cliente de proyectos externos", agrega este ID y guarda:\n' + MVP.MV_CONFIG.webClientId
    : authMsg(e);
}
if (MVX && MVX.device && MVX.device.tv) document.documentElement.classList.add('tv');
document.head.insertAdjacentHTML('beforeend', '<style>#loginMsg{white-space:pre-wrap;word-break:break-all}.mvf:focus,button:focus-visible,a:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid #FF6900!important;outline-offset:2px;border-radius:10px}html.tv .mvf:focus,html.tv button:focus{outline:3px solid #FF6900!important;outline-offset:2px}</style>');
const MV_SHEETS = ['noteBox', 'aa', 'toc'];
const mvReaderOn = () => !$('reader').classList.contains('hidden');
function mvVisible(el) { if (!el || el.disabled || el.closest('.hidden')) return false; const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden'; }
function mvScope() { // lo que está encima: una hoja abierta, el lector o la app
  const top = [...document.querySelectorAll('.scrim:not(.hidden), .modal:not(.hidden), dialog[open]')].filter(mvVisible).pop();
  return top || (mvReaderOn() ? $('reader') : document.body);
}
function mvItems(box) { return [...box.querySelectorAll('button, a[href], input, select, textarea, [tabindex], [role="button"], .card, .fc, .rec, .nowcard, .chip, .themecard, .bmgo')].filter(mvVisible); }
function mvFocus(el) { if (!el) return; if (!el.matches('button, a[href], input, select, textarea, [tabindex]')) el.tabIndex = -1; el.classList.add('mvf'); el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
function mvMove(dir) { // mueve el foco al elemento más cercano en esa dirección
  const list = mvItems(mvScope()); if (!list.length) return;
  const a = document.activeElement, cur = list.includes(a) ? a : null;
  if (!cur) { mvFocus(list.find(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }) || list[0]); return; }
  const c = cur.getBoundingClientRect(), cx = c.left + c.width / 2, cy = c.top + c.height / 2; let best = null, bs = 1e12;
  for (const el of list) {
    if (el === cur) continue; const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, dx = x - cx, dy = y - cy;
    const ok = dir === 'left' ? dx < -4 && r.right <= c.left + 6 : dir === 'right' ? dx > 4 && r.left >= c.right - 6 : dir === 'up' ? dy < -4 && r.bottom <= c.top + 6 : dy > 4 && r.top >= c.bottom - 6;
    if (!ok) continue;
    const sc = (dir === 'left' || dir === 'right') ? Math.abs(dx) + Math.abs(dy) * 3 : Math.abs(dy) + Math.abs(dx) * 3;
    if (sc < bs) { bs = sc; best = el; }
  }
  if (best) mvFocus(best); else if (dir === 'up' || dir === 'down') (document.scrollingElement || document.documentElement).scrollBy({ top: dir === 'down' ? innerHeight * .6 : -innerHeight * .6, behavior: 'smooth' });
}
function mvKey(e) {
  const k = e.key, a = document.activeElement, typing = a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.type !== 'range' && a.type !== 'checkbox';
  const done = () => { e.preventDefault(); e.stopImmediatePropagation(); return true; };
  const dirs = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  const sheetOpen = mvScope() !== $('reader') && mvScope() !== document.body;
  if (mvReaderOn() && !sheetOpen) {
    const bar = a && a.closest && a.closest('#rbar, #rfoot, #tts, #hlBar');
    if (bar) {
      if (a.type === 'range' && (k === 'ArrowLeft' || k === 'ArrowRight')) return false;
      if (k === 'ArrowLeft' || k === 'ArrowRight') { const l = mvItems(bar), i = l.indexOf(a); mvFocus(l[Math.max(0, Math.min(l.length - 1, i + (k === 'ArrowRight' ? 1 : -1)))]); return done(); }
      if (k === 'ArrowDown') { if (bar.id === 'rbar' && !$('rSlider').disabled) { mvFocus($('rSlider')); return done(); } a.blur(); toggleChrome(true); return done(); }
      if (k === 'ArrowUp') { if (bar.id !== 'rbar') { mvFocus($('rToc')); return done(); } a.blur(); toggleChrome(true); return done(); }
      return false;
    }
    if (k === 'Enter' || k === 'ArrowUp' || k === 'ContextMenu') { toggleChrome(false); mvFocus($('rToc')); return done(); }
    if (k === 'MediaPlayPause' && tts.on) { ttsToggle(); return done(); }
    if (k === 'ArrowDown' || k === 'PageDown') { turnPage(1); return done(); }
    if (k === 'PageUp') { turnPage(-1); return done(); }
    return false;   // ◀ ▶ los maneja el lector
  }
  if (dirs[k]) {
    if (a && a.type === 'range' && (k === 'ArrowLeft' || k === 'ArrowRight')) return false;
    if (typing && (k === 'ArrowLeft' || k === 'ArrowRight')) return false;
    mvMove(dirs[k]); return done();
  }
  if (k === 'Enter' && a && a !== document.body && !a.matches('button, a[href], input, select, textarea')) { a.click(); return done(); }
  return false;
}
window.addEventListener('keydown', e => { mvKey(e); }, true);
function mvBack() {
  if (mvReaderOn()) {
    const sh = MV_SHEETS.map($).find(x => x && !x.classList.contains('hidden')); if (sh) { sh.classList.add('hidden'); return; }
    if (!$('hlBar').classList.contains('hidden')) { hlHide(); return; }
    const a = document.activeElement; if (a && a.closest && a.closest('#rbar, #rfoot, #tts')) { a.blur(); toggleChrome(true); return; }
    closeReader(); return;
  }
  const top = [...document.querySelectorAll('.scrim:not(.hidden)')].filter(mvVisible).pop();
  if (top) { if (history.state) history.back(); else top.classList.add('hidden'); return; }
  if (history.state) { history.back(); return; }
  mvPost({ type: 'closed' });
}
window.addEventListener('message', e => { const m = e.data || {}; if (m.mbr && m.type === 'back') mvBack(); });
''')
# El control del TV también llega desde las páginas del libro
sub("doc.addEventListener('keydown', onKey);", "doc.addEventListener('keydown', e => { if (mvKey(e)) return; onKey(e); });")
# Voz con el motor de Android (igual que en el lector de listas)
mb = open(os.path.normpath(root + '/../mbreader/index.html'), encoding='utf-8').read()
a = mb.index('<script>\n// En la app de Android la voz'); b = mb.index('</script>', a) + 9
sub('<script type="module">', mb[a:b] + '\n<script type="module">')
if os.path.isdir(root): shutil.rmtree(root)
os.makedirs(root + '/lib')
open(root + '/index.html', 'w', encoding='utf-8').write(s)
for f in os.listdir(src + '/lib'):
    shutil.copy(src + '/lib/' + f, root + '/lib/' + (f[:-4] + '.js' if f.endswith('.mjs') else f))
shutil.copy(src + '/unrar.mjs', root + '/unrar.js'); shutil.copy(src + '/unrar.wasm', root + '/unrar.wasm')
for f in ('icon-192.png',):
    if os.path.exists(src + '/' + f): shutil.copy(src + '/' + f, root + '/' + f)
print('ok', len(s))
