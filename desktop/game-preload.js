'use strict';
const { ipcRenderer } = require('electron');
window.mvGame = {
  close() { ipcRenderer.send('game-close'); },
  fullscreen() { ipcRenderer.send('game-full'); }
};
window.addEventListener('keydown', (e) => { if (e.key === 'F11') { e.preventDefault(); ipcRenderer.send('game-full'); } }, true);
