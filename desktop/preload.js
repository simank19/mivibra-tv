// Crea window.Android (el mismo puente que usa la app en Android) para la ventana principal del PC.
'use strict';
const { ipcRenderer, clipboard } = require('electron');

const methods = ipcRenderer.sendSync('mv-methods');
const Android = {};
for (const m of methods.async) Android[m] = (...args) => { ipcRenderer.send('mv-call', m, args.map((a) => (a === undefined ? null : a))); };
for (const m of methods.sync) Android[m] = (...args) => ipcRenderer.sendSync('mv-sync', m, args.map((a) => (a === undefined ? null : a)));

// Lo que se resuelve aquí mismo, sin pasar por el proceso principal
Android.clipText = () => { try { return clipboard.readText() || ''; } catch (e) { return ''; } };
Android.gamepads = () => {
  try { return JSON.stringify(Array.from(navigator.getGamepads ? navigator.getGamepads() : []).filter(Boolean).map((g) => ({ name: g.id.replace(/\s*\(.*$/, ''), player: g.index + 1 }))); }
  catch (e) { return '[]'; }
};
let introSnd = null;
Android.introAudio = (play) => {
  if (introSnd) {
    const s = introSnd; introSnd = null; let v = s.volume;
    const t = setInterval(() => { v -= 0.1; if (v <= 0) { clearInterval(t); s.pause(); } else s.volume = v; }, 45);
  }
  if (play) { introSnd = new Audio('/pc/intro.ogg'); introSnd.play().catch(() => {}); }
};
window.Android = Android;

// Teclas del PC → las del control remoto: Esc / botón Atrás del mouse = Atrás, tecla Menú = opciones, F11 = pantalla completa
function typing() { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable); }
function back() { try { if (window.MV && MV.onBack) MV.onBack(); } catch (e) {} }
window.addEventListener('keydown', (e) => {
  if (e.key === 'F11') { e.preventDefault(); ipcRenderer.send('main-full'); return; }
  if (e.defaultPrevented) return;
  if (e.key === 'Escape' || e.key === 'BrowserBack') {
    if (typing()) { document.activeElement.blur(); e.preventDefault(); return; }
    e.preventDefault(); back();
  } else if (e.key === 'ContextMenu') { e.preventDefault(); try { MV.onKey && MV.onKey('menu'); } catch (x) {} }
});
window.addEventListener('mouseup', (e) => { if (e.button === 3) { e.preventDefault(); back(); } });
