'use strict';
const { ipcRenderer } = require('electron');
let cb = null;
window.mvPlayer = {
  onRequest(f) { cb = f; const r = ipcRenderer.sendSync('player-ready'); if (r) setTimeout(() => cb(r), 0); },
  setHeaders(ua, ref) { ipcRenderer.send('player-headers', ua, ref); },
  stalker(stk) { return ipcRenderer.invoke('player-stalker', stk); },
  fullscreen() { ipcRenderer.send('player-full'); },
  close(result) { ipcRenderer.send('player-close', result); }
};
// Abrir otro video mientras este sigue: se cierra guardando su avance
window.mvPlayerReplace = () => { const b = document.getElementById('bClose'); if (b) b.click(); };
