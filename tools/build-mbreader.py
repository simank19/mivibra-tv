#!/usr/bin/env python3
"""Arma www/mbreader/index.html con el lector de MiBiblioteca (epub.js) adaptado a MiVibra TV.
Uso: python3 tools/build-mbreader.py ruta/a/mibiblioteca/index.html"""
import re, sys, os, shutil
src = sys.argv[1]
root = os.path.dirname(os.path.abspath(__file__)) + '/../app/src/main/assets/www/mbreader'
L = open(src, encoding='utf-8').read().split('\n')
def block(a, b): return '\n'.join(L[a - 1:b])
def find(pat, start=1):
    for i in range(start - 1, len(L)):
        if re.search(pat, L[i]): return i + 1
    raise SystemExit('No encontré: ' + pat)
css_a = find(r'^<style>') + 1; css_b = find(r'^</style>') - 1
html_a = find(r'^<!-- LECTOR -->'); html_b = find(r'^<div id="toast">') - 1
util_a = find(r'^/\* =+ UTILIDADES'); util_b = find(r'^/\* =+ INDEXEDDB') - 1
rd_a = find(r'^/\* =+ LECTOR =+ \*/'); rd_b = find(r'^/\* -+ Ajustes de escaneo automático') - 1
css = block(css_a, css_b); html = block(html_a, html_b); util = block(util_a, util_b); rd = block(rd_a, rd_b)

def sub(s, old, new, must=True):
    if old not in s:
        if must: raise SystemExit('No encontré para reemplazar: ' + old[:80])
        return s
    return s.replace(old, new)
# Sin historial del navegador: Atrás lo maneja MiVibra
rd = sub(rd, "history.pushState({ reader: 1 }, '');", "")
rd = sub(rd, "if (!fromPop && history.state?.reader) history.back();", "mvPost({ type: 'closed' });")
rd = sub(rd, "window.addEventListener('popstate', () => closeReader(true));", "")
# El control del TV también llega desde las páginas del libro
rd = sub(rd, "doc.addEventListener('keydown', onKey);", "doc.addEventListener('keydown', e => { if (mvKey(e)) return; onKey(e); });")
# El progreso también se avisa a MiVibra (Seguir leyendo)
rd = sub(rd, "  const d = { cfi, pct: +pct.toFixed(4), at: Date.now() };", "  const d = { cfi, pct: +pct.toFixed(4), at: Date.now() }; mvPost({ type: 'progress', id, pct: d.pct });")
rd = rd.replace("<i>MiBiblioteca</i>", "<i>MiVibra TV</i>").replace("'MiBiblioteca'", "'MiVibra TV'").replace("en MiBiblioteca.", "en MiVibra TV.")

shim = r'''
/* ---------- Puente con MiVibra TV ---------- */
const MVP = window.parent !== window ? window.parent : null;
function mvPost(m) { try { MVP && MVP.postMessage(Object.assign({ mbr: 1 }, m), '*'); } catch {} }
const progMap = new Map(Object.entries(JSON.parse(localStorage.getItem('mbr_prog') || '{}')));
const metaMap = new Map(), coverCache = new Map();
let db = null;
const idb = {
  get: async (s, k) => { try { return JSON.parse(localStorage.getItem('mbr_' + k) || 'null'); } catch { return null; } },
  set: async (s, k, v) => { try { localStorage.setItem('mbr_' + k, JSON.stringify(v)); } catch {} }
};
const isGuest = () => false, nightOn = () => false, render = () => {}, cloudSaveSoon = () => {}, syncFail = () => {};
const fsCommit = () => Promise.resolve(), fsClean = v => v, fsMergeW = () => null, saveMeta = () => {};
const extractAnyMeta = () => Promise.reject(new Error('no')), getCover = async () => '', isPdf = () => false;
const loadPdfJs = async () => { throw new Error('PDF'); };
const view = b => ({ t: b.t || 'Sin título', a: b.a || '', cover: b.cover || '', lang: b.lang || '', id: b.id });
async function getBookBytes(b) {
  const r = await fetch(b.file); if (!r.ok) throw new Error('No se pudo leer el libro (' + r.status + ')');
  return new Uint8Array(await r.arrayBuffer());
}
'''
glue = r'''
/* ---------- Control remoto del TV, teclado y Atrás ---------- */
const SHEETS = ['noteBox', 'aa', 'toc'];
function openSheet() { return SHEETS.map($).find(s => s && !s.classList.contains('hidden')); }
function focusables(box) { return [...box.querySelectorAll('button, select, input, textarea, [tabindex]')].filter(el => !el.disabled && el.offsetParent !== null && !el.closest('.hidden')); }
function moveFocus(list, d) { if (!list.length) return; const i = list.indexOf(document.activeElement); const n = list[i < 0 ? 0 : Math.max(0, Math.min(list.length - 1, i + d))]; n.focus(); n.scrollIntoView?.({ block: 'nearest' }); }
function chromeShown() { return !$('reader').classList.contains('chrome-off'); }
function showBar() { toggleChrome(false); const b = $('rToc') || $('rBack'); b?.focus(); }
function mvKey(e) {
  if ($('reader').classList.contains('hidden')) return false;
  const k = e.key, a = document.activeElement, sh = openSheet();
  const ok = () => { e.preventDefault(); e.stopPropagation(); return true; };
  if (sh) {
    if (a && a.type === 'range' && (k === 'ArrowLeft' || k === 'ArrowRight')) return false;
    if (k === 'ArrowDown' || k === 'ArrowRight') { moveFocus(focusables(sh), 1); return ok(); }
    if (k === 'ArrowUp' || k === 'ArrowLeft') { moveFocus(focusables(sh), -1); return ok(); }
    if (k === 'Escape') { sh.classList.add('hidden'); return ok(); }
    return false;
  }
  const bar = a && a.closest && a.closest('#rbar, #rfoot, #tts, #hlBar');
  if (bar) {
    if (a.type === 'range' && (k === 'ArrowLeft' || k === 'ArrowRight')) return false;
    if (k === 'ArrowLeft' || k === 'ArrowRight') { moveFocus(focusables(bar), k === 'ArrowRight' ? 1 : -1); return ok(); }
    if (k === 'ArrowDown') { if (bar.id === 'rbar') { const s = $('rSlider'); if (!s.disabled) { s.focus(); return ok(); } } a.blur(); toggleChrome(true); return ok(); }
    if (k === 'ArrowUp') { if (bar.id === 'rfoot' || bar.id === 'tts') { $('rToc').focus(); return ok(); } a.blur(); toggleChrome(true); return ok(); }
    return false;
  }
  if (k === 'Enter' || k === 'ArrowUp' || k === 'MediaPlayPause' || k === 'ContextMenu') { if (tts.on && k === 'MediaPlayPause') { ttsToggle(); return ok(); } showBar(); return ok(); }
  if (k === 'ArrowDown') { turnPage(1); return ok(); }
  if (k === 'PageDown') { turnPage(1); return ok(); }
  if (k === 'PageUp') { turnPage(-1); return ok(); }
  return false;
}
window.addEventListener('keydown', e => { mvKey(e); }, true);
function mvBack() {
  const sh = openSheet(); if (sh) { sh.classList.add('hidden'); $('rToc')?.focus(); return; }
  if (!$('hlBar').classList.contains('hidden')) { hlHide(); return; }
  const a = document.activeElement;
  if (a && a.closest && a.closest('#rbar, #rfoot, #tts')) { a.blur(); toggleChrome(true); return; }
  closeReader();
}
window.addEventListener('message', e => {
  const m = e.data || {}; if (!m.mbr) return;
  if (m.type === 'back') mvBack();
  if (m.type === 'open') { if (window.MV_TV) { if (!localStorage.getItem('bp_reader')) { rPrefs.flip = window.MV_LITE ? 'slide' : 'book'; } } openReader(m.book); setTimeout(() => window.focus(), 50); }
});
loadBookmarks().catch(() => {}); loadHighlights().catch(() => {});
if (window.MV_TV) document.documentElement.classList.add('tv');
mvPost({ type: 'ready' });
'''
tts_poly = r'''<script>
// En la app de Android la voz del sistema se usa con el motor de Android (el navegador interno no trae voces)
(function () {
  var P = window.parent, A = P && P.Android, MV = P && P.MV;
  if (!A || !A.ttsSpeak || !MV || !MV.call || (MV.device && MV.device.desktop)) return;
  var voices = [], cur = 0, S;
  function U(t) { this.text = t; this.lang = 'es-ES'; this.rate = 1; this.pitch = 1; this.voice = null; this.onend = null; this.onerror = null; this.onstart = null; }
  S = { speaking: false, paused: false, pending: false, onvoiceschanged: null,
    getVoices: function () { return voices; },
    speak: function (u) { var my = ++cur, self = this; self.speaking = true; if (u.onstart) try { u.onstart({}); } catch (e) {}
      MV.call('ttsSpeak', [String(u.text || ''), (u.voice && u.voice.lang) || u.lang || 'es-ES', +u.rate || 1, (u.voice && u.voice.name) || '']).then(function () { if (my !== cur) return; self.speaking = false; if (u.onend) u.onend({}); }, function (e) { if (my !== cur) return; self.speaking = false; if (u.onerror) u.onerror({ error: String((e && e.message) || e) }); }); },
    cancel: function () { cur++; this.speaking = false; try { A.ttsStop(); } catch (e) {} },
    pause: function () { this.cancel(); }, resume: function () {} };
  try { Object.defineProperty(window, 'speechSynthesis', { value: S, configurable: true }); } catch (e) { window.speechSynthesis = S; }
  window.SpeechSynthesisUtterance = U;
  MV.call('ttsVoices', []).then(function (v) { voices = (v || []).map(function (x) { return { name: x.name, lang: x.lang, localService: x.local !== false, default: false, voiceURI: x.name }; }); if (S.onvoiceschanged) try { S.onvoiceschanged(); } catch (e) {} }).catch(function () {});
})();
try { var M = window.parent && window.parent.MV; window.MV_TV = !!(M && M.device && M.device.tv); window.MV_LITE = !!(M && M.lite); } catch (e) {}
</script>'''
extra_css = r'''
/* MiVibra TV: foco visible con el control remoto */
html,body{background:#0A0908}
button:focus-visible,select:focus-visible,input:focus-visible,.btn:focus-visible,.icon-btn:focus-visible{outline:3px solid #FF6900!important;outline-offset:2px;border-radius:10px}
html.tv #rbar .icon-btn:focus,html.tv .sheet button:focus,html.tv #tts button:focus{outline:3px solid #FF6900!important;outline-offset:2px}
'''
page = ('<!DOCTYPE html>\n<html lang="es"><head><meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        '<title>Lector</title>\n<style>\n' + css + extra_css + '\n</style>\n' + tts_poly + '\n</head><body>\n' + html +
        '\n<div id="toast"></div>\n<div hidden><select id="uVoice"></select><select id="uRate"></select><button id="uReload"></button><button id="uTest"></button></div>\n'
        '<script type="module">\n' + util + '\n' + shim + '\n' + rd + '\n' + glue + '\n</script>\n</body></html>\n')
os.makedirs(root + '/lib', exist_ok=True)
open(root + '/index.html', 'w', encoding='utf-8').write(page)
libdir = os.path.join(os.path.dirname(src), 'lib')
for f in ('epub.min.js', 'jszip.min.js'):
    shutil.copy(os.path.join(libdir, f), root + '/lib/' + f)
print('ok', len(page))
