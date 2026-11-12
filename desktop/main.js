// MiVibra TV para PC (Windows). Usa la misma interfaz de la app de Android y reemplaza las funciones
// nativas (red, archivos, reproductor, juegos, celular como mando, actualizaciones) por las del PC.
'use strict';
const { app, BrowserWindow, ipcMain, shell, dialog, session, powerSaveBlocker, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const net = require('./lib/net');
const server = require('./lib/server');
const epg = require('./lib/epg');
const stalker = require('./lib/stalker');
const storage = require('./lib/storage');
const archives = require('./lib/archives');
const remoteLib = require('./lib/remote');

const APP_PORT = 47800;   // fijo: el almacenamiento (perfiles, listas) queda guardado por dirección
const VERSION = app.getVersion();                                   // 1.0.N
const VERSION_CODE = +(VERSION.split('.').pop()) || 0;              // N = número de la versión de Android
const REPO = 'simank19/mivibra-tv';

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.setAppUserModelId('co.mivibra.tv');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');

const DEV = !app.isPackaged;
const RES = DEV ? path.join(__dirname, '..', 'app', 'src', 'main') : process.resourcesPath;
const DIRS = {
  www: DEV ? path.join(RES, 'assets', 'www') : path.join(RES, 'www'),
  pc: path.join(__dirname, 'web'),
  intro: DEV ? path.join(RES, 'res', 'raw', 'intro.ogg') : path.join(RES, 'intro.ogg'),
  neogeoJson: DEV ? path.join(RES, 'assets', 'neogeo.json') : path.join(RES, 'neogeo.json'),
  ejs: DEV ? path.join(__dirname, 'build', 'ejs') : path.join(RES, 'ejs')
};
const DATA = app.getPath('userData');
const NET = path.join(DATA, 'cache', 'net');
fs.mkdirSync(NET, { recursive: true });
storage.init({ roms: path.join(DATA, 'roms'), system: path.join(DATA, 'system'), unzip: path.join(DATA, 'cache', 'unzip'), arcade: path.join(DATA, 'arcade'), neogeoJson: DIRS.neogeoJson });

let win = null, playerWin = null, gameWin = null, srv = null;
const BASE = 'http://localhost:' + APP_PORT;

// ---------------- Utilidades ----------------
function js(code, w = win) { if (w && !w.isDestroyed()) w.webContents.executeJavaScript(code).catch(() => {}); }
function reply(id, ok, data) { js('window.MV&&MV._cb(' + JSON.stringify(id) + ',' + JSON.stringify({ ok, data: data == null ? null : data }) + ')'); }
function progress(id, pct) { js('window.MV&&MV._progress(' + JSON.stringify(id) + ',' + pct + ')'); }
function netFile(key) { return path.join(NET, crypto.createHash('md5').update(key).digest('hex') + '.txt'); }
function served(f) { return BASE + '/net/' + path.basename(f); }
const SESSION = crypto.randomBytes(16).toString('hex');   // clave de esta sesión para servir archivos del equipo
function romUrl(p) { return BASE + '/rom/' + SESSION + '/' + Buffer.from(p, 'utf8').toString('base64url') + '/' + encodeURIComponent(path.basename(p)); }
/** Clave de vinculación del celular (6 números), guardada en este PC. */
function remoteKey() {
  const f = path.join(DATA, 'remote-key.txt');
  try { const k = fs.readFileSync(f, 'utf8').trim(); if (/^\d{6}$/.test(k)) return k; } catch (e) {}
  const k = String(crypto.randomInt(0, 1000000)).padStart(6, '0'); fs.writeFileSync(f, k); return k;
}
function parseHeaders(j) { try { const o = JSON.parse(j || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
function errMsg(e) { return (e && e.message) || String(e || 'Error'); }

// ---------------- Juegos: núcleos de EmulatorJS ----------------
const EJS = {
  fceumm: 'fceumm', snes9x: 'snes9x', gambatte: 'gambatte', mgba: 'mgba', mupen64plus_next_gles3: 'mupen64plus_next', mupen64plus_next: 'mupen64plus_next',
  melonds: 'melonds', genesis_plus_gx: 'genesis_plus_gx', pcsx_rearmed: 'pcsx_rearmed', stella: 'stella2014', prosystem: 'prosystem', handy: 'handy',
  mednafen_pce_fast: 'mednafen_pce', mednafen_ngp: 'mednafen_ngp', mednafen_wswan: 'mednafen_wswan', fbneo: 'fbneo', ppsspp: 'ppsspp', prboom: 'prboom',
  picodrive: 'picodrive', yabause: 'yabause', opera: 'opera', mednafen_vb: 'beetle_vb', a5200: 'a5200', virtualjaguar: 'virtualjaguar',
  gearcoleco: 'gearcoleco', vice_x64: 'vice_x64', puae: 'puae', cap32: 'cap32', fuse: 'fuse'
};
const BIOS_FOR = {
  pcsx_rearmed: ['scph5501.bin', 'scph5500.bin', 'scph5502.bin', 'scph1001.bin', 'scph7001.bin', 'scph101.bin'],
  handy: ['lynxboot.img'], fbneo: ['neogeo.zip'], mgba: ['gba_bios.bin'],
  yabause: ['saturn_bios.bin', 'sega_101.bin', 'mpr-17933.bin'], opera: ['panafz10.bin', 'panafz1.bin', 'panafz1j.bin', 'goldstar.bin'],
  a5200: ['5200.rom'], gearcoleco: ['colecovision.rom']
};
// Sega CD usa el mismo núcleo que Mega Drive pero con su BIOS
const BIOS_SYS = { segacd: ['bios_CD_U.bin', 'bios_CD_E.bin', 'bios_CD_J.bin'] };

// ---------------- RetroArch para Windows (Dreamcast, GameCube y quien lo prefiera) ----------------
function retroArchExe() {
  const env = process.env;
  const c = [
    'C:\\RetroArch-Win64\\retroarch.exe', 'C:\\RetroArch\\retroarch.exe',
    path.join(env.ProgramFiles || 'C:\\Program Files', 'RetroArch', 'retroarch.exe'),
    path.join(env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Steam', 'steamapps', 'common', 'RetroArch', 'retroarch.exe'),
    path.join(env.APPDATA || '', 'RetroArch', 'retroarch.exe'), path.join(env.LOCALAPPDATA || '', 'Programs', 'RetroArch', 'retroarch.exe')
  ];
  return c.find((f) => f && storage.exists(f)) || null;
}

// ---------------- Ventanas de juego y reproductor ----------------
function coverBounds() { const b = win && !win.isDestroyed() ? win.getBounds() : screen.getPrimaryDisplay().workArea; return b; }
let blocker = null;
function keepAwake(on) {
  if (on && blocker == null) blocker = powerSaveBlocker.start('prevent-display-sleep');
  if (!on && blocker != null) { try { powerSaveBlocker.stop(blocker); } catch (e) {} blocker = null; }
}

function openGame(cfg) {
  if (gameWin && !gameWin.isDestroyed()) gameWin.close();
  gameWin = new BrowserWindow(Object.assign(coverBounds(), {
    backgroundColor: '#0D0C0B', autoHideMenuBar: true, show: false, icon: iconPath(), title: cfg.title || 'Juego',
    fullscreen: win && win.isFullScreen(),
    webPreferences: { preload: path.join(__dirname, 'game-preload.js'), contextIsolation: false, sandbox: false, backgroundThrottling: false }
  }));
  if (win && win.isMaximized()) gameWin.maximize();
  gameWin.loadURL(BASE + '/pc/game.html?c=' + encodeURIComponent(JSON.stringify(cfg)));
  gameWin.once('ready-to-show', () => gameWin.show());
  keepAwake(true);
  remote.broadcastMode();
  gameWin.on('closed', () => { gameWin = null; keepAwake(!!playerWin); remote.broadcastMode(); if (win && !win.isDestroyed()) { win.focus(); js('window.MV&&MV.onResume&&MV.onResume()'); } });
}

let playerReq = null, replacing = null;
const playerHeaders = { ua: '', ref: '' };
function openPlayer(reqJson) {
  if (playerWin && !playerWin.isDestroyed()) {
    // Ya había un video abierto: se cierra (su avance se guarda aparte) y se abre el nuevo
    replacing = reqJson;
    js('window.mvPlayerReplace&&mvPlayerReplace()', playerWin);
    return;
  }
  playerReq = reqJson;
  playerWin = new BrowserWindow(Object.assign(coverBounds(), {
    backgroundColor: '#000000', autoHideMenuBar: true, show: false, icon: iconPath(), title: 'Reproductor',
    fullscreen: win && win.isFullScreen(),
    webPreferences: {
      preload: path.join(__dirname, 'player-preload.js'), contextIsolation: false, sandbox: false,
      webSecurity: false, partition: 'persist:player', autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false
    }
  }));
  if (win && win.isMaximized()) playerWin.maximize();
  playerWin.loadURL(BASE + '/pc/player.html');
  playerWin.once('ready-to-show', () => playerWin.show());
  keepAwake(true);
  playerWin.on('closed', () => {
    playerWin = null; keepAwake(!!gameWin);
    if (win && !win.isDestroyed()) win.focus();
    if (replacing) { const r = replacing; replacing = null; openPlayer(r); }
  });
}
ipcMain.on('player-ready', (e) => { e.returnValue = playerReq; });
ipcMain.on('player-headers', (e, ua, ref) => { playerHeaders.ua = ua || ''; playerHeaders.ref = ref || ''; });
ipcMain.handle('player-stalker', async (e, stk) => stalker.link(stk));
ipcMain.on('player-full', () => { if (playerWin) playerWin.setFullScreen(!playerWin.isFullScreen()); });
ipcMain.on('player-close', (e, result) => {
  if (replacing) result.replaced = true;
  js('window.MV&&MV.onPlayerClosed&&MV.onPlayerClosed(' + JSON.stringify(result) + ')');
  if (playerWin && !playerWin.isDestroyed()) playerWin.close();
});
ipcMain.on('game-close', () => { if (gameWin && !gameWin.isDestroyed()) gameWin.close(); });
ipcMain.on('game-full', () => { if (gameWin) gameWin.setFullScreen(!gameWin.isFullScreen()); });
ipcMain.on('main-full', () => { if (win) win.setFullScreen(!win.isFullScreen()); });

// ---------------- Celular como mando ----------------
const NAV = { UP: 'Up', DOWN: 'Down', LEFT: 'Left', RIGHT: 'Right', OK: 'Enter', BACK: 'Escape', PLAYPAUSE: 'Space' };
const remote = remoteLib.create({
  www: DIRS.www,
  key: () => remoteKey(),
  romDir: () => storage.init && path.join(DATA, 'roms'),
  importBios: (dir) => storage.importBios([dir]),
  romReceived: (info) => js('window.MV&&MV.onRomReceived&&MV.onRomReceived(' + JSON.stringify(info) + ')'),
  listReceived: (o) => { js('window.MV&&MV.onListReceived&&MV.onListReceived(' + JSON.stringify(o) + ')'); if (win) win.focus(); },
  ocrFile: (f) => ocr(f),
  clients: (n, names) => js('window.MV&&MV.onRemoteClients&&MV.onRemoteClients(' + n + ',' + JSON.stringify(names) + ')'),
  mode: () => (gameWin ? 'game' : 'remote'),
  gameKey: (slot, key, down) => { if (gameWin) js('window.MVpad&&MVpad(' + slot + ',' + JSON.stringify(key) + ',' + (down ? 1 : 0) + ')', gameWin); },
  gameAxis: (slot, stick, x, y) => { if (gameWin) js('window.MVaxis&&MVaxis(' + slot + ',' + JSON.stringify(stick) + ',' + x + ',' + y + ')', gameWin); },
  gameMenu: () => { if (gameWin) { js('window.MVsave&&MVsave()', gameWin); setTimeout(() => { if (gameWin) gameWin.close(); }, 300); } },
  navKey: (key) => {
    if (key === 'HOME') { if (playerWin) js('window.mvPlayerReplace&&mvPlayerReplace()', playerWin); js("window.MV&&MV.go&&MV.go('home')"); return; }
    if (key === 'MENU') { js("window.MV&&MV.onKey&&MV.onKey('menu')"); return; }
    const code = NAV[key]; if (!code) return;
    const w = (playerWin && !playerWin.isDestroyed() && playerWin) || win; if (!w) return;
    w.webContents.sendInputEvent({ type: 'keyDown', keyCode: code });
    if (code === 'Enter' || code === 'Space') w.webContents.sendInputEvent({ type: 'char', keyCode: code === 'Enter' ? '\r' : ' ' });
    w.webContents.sendInputEvent({ type: 'keyUp', keyCode: code });
  },
  text: (v) => js('window.MV&&MV.remoteText&&MV.remoteText(' + JSON.stringify(v) + ')')
});

// ---------------- Leer texto de imágenes (listas en foto) ----------------
let ocrWorker = null;
async function ocr(file) {
  const T = require('tesseract.js');
  if (!ocrWorker) {
    // Diccionario incluido en el instalador: funciona sin internet
    const langPath = path.dirname(require.resolve('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz')).replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
    ocrWorker = await T.createWorker('eng', 1, { langPath, cachePath: path.join(DATA, 'cache', 'ocr'), gzip: true });
  }
  const { data } = await ocrWorker.recognize(file);
  return String(data.text || '').split(/\r?\n/).map((l) => l.trim()
    .replace(/h\s*t\s*t\s*p\s*(s?)\s*:\s*\/\s*\//ig, 'http$1://')
    .replace(/\b([0-9A-FO]{2}[:-]){5}[0-9A-FO]{2}\b/ig, (m) => m.toUpperCase().replace(/O/g, '0'))).filter(Boolean).join('\n');
}

// ---------------- Puente: métodos con respuesta (id primero) ----------------
const INFLIGHT = new Map();
const ASYNC = {
  async httpGet(id, url, headersJson, mode) {
    const h = parseHeaders(headersJson);
    if (mode === 'file') {
      // La misma lista pedida dos veces a la vez: se espera la misma descarga
      const f = netFile(url);
      let job = INFLIGHT.get(f);
      if (!job) { job = net.download(url, f, h).finally(() => INFLIGHT.delete(f)); INFLIGHT.set(f, job); }
      const code = await job;
      reply(id, code < 400, { status: code, path: served(f) });
    } else {
      const r = await net.text(url, h);
      reply(id, r.status < 400, { status: r.status, text: r.text });
    }
  },
  async httpPost(id, url, body, ct) { const r = await net.post(url, body, ct); reply(id, true, { status: r.status, text: r.text }); },
  async httpPost2(id, url, body, ct, headersJson) { const r = await net.post(url, body, ct || 'application/json', Object.assign({ Accept: 'application/json' }, parseHeaders(headersJson))); reply(id, true, { status: r.status, text: r.text }); },
  async renderHtml(id, url, waitMs) {
    const w = new BrowserWindow({ show: false, width: 1280, height: 2400, webPreferences: { offscreen: true, javascript: true, images: false, sandbox: true } });
    w.webContents.setAudioMuted(true);
    let done = false;
    const finish = async () => {
      if (done) return; done = true;
      try { const html = await w.webContents.executeJavaScript('window.scrollTo(0,document.body.scrollHeight);document.documentElement.outerHTML'); reply(id, true, { html }); }
      catch (e) { reply(id, false, errMsg(e)); }
      if (!w.isDestroyed()) w.destroy();
    };
    w.webContents.on('did-finish-load', () => setTimeout(finish, Math.max(1000, Math.min(10000, +waitMs || 3000))));
    setTimeout(finish, 25000);
    w.loadURL(url, { userAgent: net.UA }).catch(() => {});
  },
  async probe(id, json) {
    let arr = []; try { arr = JSON.parse(json); } catch (e) {}
    const res = await Promise.all(arr.map(async (o) => {
      const t0 = Date.now(); let ok = false, code = 0;
      const h = {}; if (o.ua) h['User-Agent'] = o.ua; if (o.ref) h.Referer = o.ref;
      try {
        const r = await Promise.race([net.open(o.url, h, 7000), new Promise((_, rej) => setTimeout(() => rej(new Error('t')), 9000))]);
        code = r.statusCode;
        if (code < 400) {
          const head = await new Promise((resolve) => { const s = net.bodyStream(r); let got = false; s.once('data', (c) => { got = true; resolve(c.slice(0, 2048).toString('latin1')); r.destroy(); }); s.once('end', () => { if (!got) resolve(''); }); s.once('error', () => resolve('')); setTimeout(() => resolve(''), 6000); });
          const isPl = /\.m3u8/i.test(o.url) || head.startsWith('#EXTM3U');
          ok = head.length > 0 && (!isPl || head.includes('#EXT'));
        } else r.resume();
      } catch (e) {}
      return { ok, code, ms: Date.now() - t0 };
    }));
    reply(id, true, res);
  },
  async googleSignIn(id) { reply(id, false, 'En el PC entra con “Entrar con el celular (código)”.'); },
  async epg(id, url, idsJson, hours) {
    let wanted = new Set(); try { wanted = new Set((JSON.parse(idsJson || '[]') || []).map((x) => String(x).toLowerCase())); } catch (e) {}
    const r = await net.open(url, {}, 30000);
    const out = await epg.parse(net.bodyStream(r), wanted, +hours || 36);
    const f = netFile('epg:' + url); fs.writeFileSync(f, JSON.stringify(out));
    reply(id, true, { path: served(f), count: out.count });
  },
  async pickFile(id) {
    const r = await dialog.showOpenDialog(win, { title: 'Elegir archivo', properties: ['openFile'], filters: [{ name: 'Listas', extensions: ['m3u', 'm3u8', 'txt', 'gz'] }, { name: 'Todos', extensions: ['*'] }] });
    if (r.canceled || !r.filePaths[0]) return reply(id, false, 'cancel');
    const buf = net.maybeGunzip(fs.readFileSync(r.filePaths[0]));
    const f = netFile('file:' + r.filePaths[0] + Date.now()); fs.writeFileSync(f, buf);
    reply(id, true, { path: served(f), name: path.basename(r.filePaths[0]) });
  },
  async ocrImage(id) {
    const r = await dialog.showOpenDialog(win, { title: 'Elegir la foto de la lista', properties: ['openFile'], filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }] });
    if (r.canceled || !r.filePaths[0]) return reply(id, false, 'cancel');
    reply(id, true, { text: await ocr(r.filePaths[0]) });
  },
  async readLocalFile(id, p) { const buf = net.maybeGunzip(fs.readFileSync(p)); const f = netFile('local:' + p); fs.writeFileSync(f, buf); reply(id, true, { path: served(f), text: buf.length < 200000 ? buf.toString('utf8') : undefined }); },
  /** Elegir uno o varios juegos (se usan donde están, sin copiarlos). */
  async pickFiles(id) {
    const r = await dialog.showOpenDialog(win, { title: 'Elegir juegos', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Juegos', extensions: ['nes', 'fds', 'sfc', 'smc', 'gb', 'gbc', 'gba', 'n64', 'z64', 'v64', 'nds', 'md', 'gen', 'smd', 'bin', 'sms', 'gg', 'cue', 'chd', 'iso', 'cso', 'pbp', 'img', 'a26', 'a78', 'lnx', 'pce', 'ngp', 'ngc', 'ws', 'wsc', 'neo', 'wad', 'zip', '7z', 'rar'] }, { name: 'Todos los archivos', extensions: ['*'] }] });
    if (r.canceled || !r.filePaths.length) return reply(id, false, 'cancel');
    reply(id, true, r.filePaths.map((f) => { let size = 0; try { size = fs.statSync(f).size; } catch (e) {} const name = path.basename(f); return { name, path: f, size, ext: (name.includes('.') ? name.split('.').pop() : '').toLowerCase() }; }));
  },
  /** Carátula sacada del propio video (una imagen del contenido), con una ventana invisible. */
  async videoFrame(id, url, headers, at) {
    try { reply(id, true, await thumbQueue(() => videoFrame(url, +at || 0.15))); }
    catch (e) { reply(id, false, errMsg(e) || 'No se pudo sacar una imagen de este video'); }
  },
  /** Libros y mangas: descarga y deja listas las páginas (PDF, EPUB, CBZ, CBR, CB7). */
  async openBook(id, json) {
    const o = JSON.parse(json), src = o.url || o.path;
    if (!src) return reply(id, false, 'Falta el archivo');
    const BOOKS = path.join(DATA, 'cache', 'books'); fs.mkdirSync(BOOKS, { recursive: true });
    const key = crypto.createHash('md5').update(src).digest('hex').slice(0, 16);
    const served = (f) => BASE + '/books/' + path.relative(BOOKS, f).split(path.sep).map(encodeURIComponent).join('/');
    let file = ['pdf', 'epub', 'zip', 'rar', '7z'].map((e) => path.join(BOOKS, key + '.' + e)).find((f) => storage.exists(f));
    if (!file) {
      if (/^https?:/i.test(src)) {
        file = path.join(BOOKS, key + '.bin');
        const h = {}; if (o.ua) h['User-Agent'] = o.ua; if (o.ref) h.Referer = o.ref;
        const code = await net.download(src, file, h, (p) => progress(id, p), false);
        if (code >= 400) return reply(id, false, 'El servidor respondió con error ' + code);
      } else file = src;
      const head = Buffer.alloc(8); const fd = fs.openSync(file, 'r'); fs.readSync(fd, head, 0, 8, 0); fs.closeSync(fd);
      let kind = head.toString('latin1', 0, 4) === '%PDF' ? 'pdf' : head.toString('latin1', 0, 3) === 'Rar' ? 'rar' : head.toString('latin1', 0, 2) === '7z' ? '7z' : head.toString('latin1', 0, 2) === 'PK' ? 'zip' : '';
      if (kind === 'zip') { try { const names = (await archives.list(file)).map((x) => x.name); if (names.includes('mimetype') && names.some((n) => /\.opf$/i.test(n))) kind = 'epub'; } catch (e) {} }
      if (!kind) return reply(id, false, 'Formato no compatible (usa PDF, EPUB, CBZ, CBR o CB7)');
      const target = path.join(BOOKS, key + '.' + kind);
      if (path.dirname(file) === BOOKS) fs.renameSync(file, target); else fs.copyFileSync(file, target);
      file = target;
    }
    // Solo los últimos 6 libros en la caché
    try {
      const groups = {}; for (const f of fs.readdirSync(BOOKS)) { const k = f.split('.')[0]; (groups[k] = groups[k] || []).push(path.join(BOOKS, f)); }
      Object.keys(groups).filter((k) => k !== key).sort((a, b) => Math.max(...groups[b].map((f) => fs.statSync(f).mtimeMs)) - Math.max(...groups[a].map((f) => fs.statSync(f).mtimeMs)))
        .slice(5).forEach((k) => groups[k].forEach((f) => fs.rmSync(f, { recursive: true, force: true })));
    } catch (e) {}
    const kind = path.extname(file).slice(1);
    if (kind === 'pdf') return reply(id, true, { fmt: 'pdf', url: served(file) });
    const out = path.join(BOOKS, key);
    if (!storage.exists(path.join(out, '.ok'))) { fs.rmSync(out, { recursive: true, force: true }); await archives.extractAll(file, out, (p) => progress(id, p)); fs.writeFileSync(path.join(out, '.ok'), '1'); }
    if (kind === 'epub') return reply(id, true, { fmt: 'epub', base: served(out) + '/', file: served(file) });
    const imgs = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== '__MACOSX') walk(f); } else if (/\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(e.name)) imgs.push(f); } };
    walk(out);
    const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    imgs.sort((a, b) => coll.compare(path.relative(out, a), path.relative(out, b)));
    if (!imgs.length) return reply(id, false, 'El archivo no trae páginas (imágenes)');
    reply(id, true, { fmt: 'comic', pages: imgs.map(served) });
  },
  async pickFolder(id) {
    const r = await dialog.showOpenDialog(win, { title: 'Elegir carpeta', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return reply(id, false, 'cancel');
    reply(id, true, r.filePaths[0]);
  },
  async listDir(id, p) { reply(id, true, storage.listDir(p)); },
  async scanRoms(id, rootsJson, extsJson) {
    const roots = JSON.parse(rootsJson || '[]'), exts = new Set(JSON.parse(extsJson || '[]').map((x) => String(x).toLowerCase()));
    reply(id, true, await storage.scan(roots, exts));
  },
  async importBios(id, rootsJson) { reply(id, true, await storage.importBios(JSON.parse(rootsJson || '[]'))); },
  async unzip(id, p) {
    const out = path.join(path.dirname(p), path.parse(p).name);
    const items = await archives.list(p);
    await archives.extract(p, items.map((x) => x.name), out);
    reply(id, true, { dir: out, files: items.length });
  },
  async downloadFile(id, url, fileName) {
    let name = (fileName || decodeURIComponent((new URL(url).pathname.split('/').pop()) || '') || 'archivo.bin').replace(/[\\/:*?"<>|]/g, '_').slice(-120);
    const dest = path.join(DATA, 'roms', name);
    const code = await net.download(url, dest, {}, (p) => progress(id, p), false);
    if (code >= 400) return reply(id, false, 'Error ' + code + ' al descargar');
    reply(id, true, { path: dest, name, size: fs.statSync(dest).size });
  },
  async unzipRom(id, json) {
    const o = JSON.parse(json);
    try { reply(id, true, await storage.unzipRom(o.path, (o.exts || []).map((x) => String(x).toLowerCase()), (p) => progress(id, p))); }
    catch (e) { reply(id, false, 'No se pudo abrir el comprimido: ' + errMsg(e)); }
  },
  async arcadePrepare(id, json) { const o = JSON.parse(json); reply(id, true, await storage.arcadePrepare(o.path, o.set || '')); },
  async downloadCore(id) { reply(id, true, {}); },
  async playGame(id, json) {
    const o = JSON.parse(json);
    const core = EJS[o.core];
    if (!core) {
      const why = o.core === 'geolith' ? 'Los juegos .neo de Neo Geo se juegan en la TV. En el PC usa el juego en .zip (romset de MAME/FBNeo).'
        : (o.core === 'flycast' || o.core === 'dolphin') ? 'Dreamcast y GameCube se juegan con RetroArch para Windows.'
        : 'Esta consola todavía no se puede jugar en el PC.';
      return reply(id, false, why);
    }
    let bios = '';
    for (const b of BIOS_SYS[o.sys] || BIOS_FOR[core] || []) {
      const local = storage.biosPath(b) || (storage.exists(path.join(path.dirname(o.rom), b)) ? path.join(path.dirname(o.rom), b) : null);
      if (local) { bios = romUrl(local); break; }
    }
    openGame({ core, rom: romUrl(o.rom), bios, title: o.title || path.basename(o.rom), save: path.parse(o.rom).name, sys: o.sys, threads: core === 'ppsspp' });
    reply(id, true, {});
  },
  async playRetroArch(id, json) {
    const o = JSON.parse(json), exe = retroArchExe();
    if (!exe) return reply(id, false, 'Falta RetroArch para Windows. Descárgalo gratis en retroarch.com.');
    let rom = o.rom;
    if (archives.supported(rom)) rom = await storage.unzipRom(rom, (o.exts || []).map((x) => String(x).toLowerCase()), (p) => progress(id, p));
    const dll = path.join(path.dirname(exe), 'cores', o.core + '_libretro.dll');
    if (!storage.exists(dll)) return reply(id, false, 'Falta el núcleo “' + o.core + '” en RetroArch: ábrelo → Actualizador en línea → Descargar núcleos.');
    // BIOS de MiVibra también para RetroArch
    try { const sys = path.join(path.dirname(exe), 'system'); fs.mkdirSync(sys, { recursive: true }); for (const f of fs.readdirSync(path.join(DATA, 'system'))) { const t = path.join(sys, f); if (!storage.exists(t)) fs.copyFileSync(path.join(DATA, 'system', f), t); } } catch (e) {}
    spawn(exe, ['-L', dll, rom], { detached: true, stdio: 'ignore', cwd: path.dirname(exe) }).unref();
    reply(id, true, {});
  },
  async installUpdate(id, url) {
    const f = path.join(os.tmpdir(), 'MiVibraTV-Instalador.exe');
    try { fs.unlinkSync(f); } catch (e) {}
    const code = await net.download(url, f, {}, (p) => progress(id, p), false);
    if (code >= 400 || fs.statSync(f).size < 1000000) throw new Error('La descarga falló (' + code + ')');
    reply(id, true, { installing: true });
    // Instalación silenciosa encima de la actual; se abre sola al terminar
    setTimeout(() => { spawn(f, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore' }).unref(); app.quit(); }, 600);
  }
};

// ---------------- Soporte MiVibra PC ----------------
// "Diagnóstico / Soporte MiVibra" en PC abre MiVibra PC (simank19/mivibra-pc): un .exe portable de diagnóstico y optimización.
// Se busca la última versión en GitHub, se descarga con verificación TLS y SHA-256 y se guarda en los datos de la app;
// si ya está al día se abre directo. Sin internet se abre la copia guardada.
const SUPPORT_DIR = path.join(DATA, 'soporte');
const SUPPORT_EXE = path.join(SUPPORT_DIR, 'MiVibra-PC.exe');
let supportBusy = false;
function pcToast(msg, ms) { js('window.MV&&MV.toast(' + JSON.stringify(msg) + ',' + (ms || 3000) + ')'); }
async function openSupportPc() {
  if (supportBusy) return pcToast('Abriendo MiVibra PC…');
  supportBusy = true;
  const efetch = require('electron').net.fetch;
  const verFile = path.join(SUPPORT_DIR, 'version.txt');
  const have = fs.existsSync(SUPPORT_EXE) ? (() => { try { return fs.readFileSync(verFile, 'utf8').trim(); } catch (e) { return ''; } })() : '';
  const launch = async () => {
    const err = await shell.openPath(SUPPORT_EXE);   // ShellExecute: pide permisos de administrador si el programa los necesita
    if (err) pcToast('No se pudo abrir MiVibra PC: ' + err, 5000);
  };
  try {
    if (process.platform !== 'win32') { shell.openExternal('https://github.com/simank19/mivibra-pc/releases/latest'); return; }
    pcToast('Buscando MiVibra PC…');
    let rel = null;
    try {
      const r = await efetch('https://api.github.com/repos/simank19/mivibra-pc/releases/latest', { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'MiVibra-TV' } });
      if (r.ok) rel = await r.json();
    } catch (e) {}
    if (!rel) { if (have) return launch(); pcToast('Sin conexión con GitHub: no se pudo descargar MiVibra PC', 5000); return; }
    const exe = (rel.assets || []).find((a) => /^MiVibra-PC\.exe$/i.test(a.name));
    const sum = (rel.assets || []).find((a) => /^MiVibra-PC\.exe\.sha256$/i.test(a.name));
    if (!exe) { if (have) return launch(); shell.openExternal(rel.html_url || 'https://github.com/simank19/mivibra-pc/releases/latest'); return; }
    if (have && have === rel.tag_name) return launch();
    pcToast('Descargando MiVibra PC ' + (rel.tag_name || '') + '…', 6000);
    fs.mkdirSync(SUPPORT_DIR, { recursive: true });
    const res = await efetch(exe.browser_download_url);
    if (!res.ok) throw new Error('descarga ' + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 500000 || buf[0] !== 0x4d || buf[1] !== 0x5a) throw new Error('el archivo descargado no es un programa válido');
    if (sum) {
      const rs = await efetch(sum.browser_download_url);
      const want = rs.ok ? ((await rs.text()).match(/[a-f0-9]{64}/i) || [''])[0].toLowerCase() : '';
      const got = crypto.createHash('sha256').update(buf).digest('hex');
      if (!want || want !== got) throw new Error('la huella SHA-256 no coincide');
    }
    const tmp = SUPPORT_EXE + '.part';
    fs.writeFileSync(tmp, buf);
    try { fs.unlinkSync(SUPPORT_EXE); } catch (e) {}
    fs.renameSync(tmp, SUPPORT_EXE);
    fs.writeFileSync(verFile, String(rel.tag_name || ''));
    await launch();
  } catch (e) {
    if (have) { pcToast('No se pudo actualizar MiVibra PC; se abre la versión guardada'); await launch(); }
    else { pcToast('No se pudo descargar MiVibra PC (' + e.message + '). Abrimos la página de descarga.', 6000); shell.openExternal('https://github.com/simank19/mivibra-pc/releases/latest'); }
  } finally { supportBusy = false; }
}

// ---------------- Puente: métodos directos ----------------
const SYNC = {
  openBrowser(url) { openBrowser(url || 'https://www.google.com'); },
  openDiag() { openSupportPc(); },
  setPip() {}, publishHome() {}, setInicio() {},
  play(json) { openPlayer(JSON.parse(json)); },
  hasStorageAccess() { return true; },
  requestStorageAccess() {},
  storageRoots() { return JSON.stringify(storage.roots()); },
  downloadsDir() { return path.join(DATA, 'roms'); },
  deleteFile(p) {
    const ok = [DATA, os.tmpdir()].some((d) => path.resolve(p).toLowerCase().startsWith(path.resolve(d).toLowerCase()));
    if (!ok) return false;
    try { fs.unlinkSync(p); return true; } catch (e) { return false; }
  },
  coreInstalled() { return true; },
  async zipExts(p) { return JSON.stringify(await storage.zipExts(p)); },
  overlay() { return -1; }, setOverlay() {}, overlayStyles() { return '[]'; }, nextOverlay() {},
  async arcadeId(p) { try { return JSON.stringify(await storage.identify(p)); } catch (e) { return 'null'; } },
  async archiveNames(p) { return JSON.stringify((await storage.entryNames(p)).slice(0, 40)); },
  retroArch() { const exe = retroArchExe(); return JSON.stringify({ installed: !!exe, bios: exe ? path.join(path.dirname(exe), 'system') : 'RetroArch\\system', pkg: 'retroarch-windows' }); },
  async remoteStart() {
    const ip = remoteLib.localIp();
    try { await remote.start(); } catch (e) { return JSON.stringify({ ok: false, error: errMsg(e) }); }
    return JSON.stringify({ ok: !!ip, url: ip ? 'http://' + ip + ':' + remoteLib.PORT + '/' : '', key: remoteKey(), clients: remote.clientCount() });
  },
  remoteStop() {},
  deviceInfo() {
    return JSON.stringify({ tv: false, touch: false, desktop: true, ramMb: Math.round(os.totalmem() / 1048576), lowRam: false, model: 'PC ' + (process.platform === 'win32' ? 'Windows' : process.platform), sdk: 0, abi: process.arch, version: VERSION, versionCode: VERSION_CODE, external: os.homedir(), cores: os.cpus().length, maxMhz: Math.max(0, ...os.cpus().map((c) => c.speed || 0)) });
  },
  appsInstalled() { return '{}'; },
  canInstallUpdates() { return process.platform === 'win32'; },
  toast() {},
  keepAwake(on) { keepAwake(!!on); },
  openExternal(url) {
    url = String(url || '');
    if (/^market:\/\/details\?id=com\.retroarch/i.test(url)) url = 'https://www.retroarch.com/?page=platforms';
    else if (/^market:/i.test(url)) url = 'https://play.google.com/store/apps/' + url.replace(/^market:\/\//i, '');
    if (/^https?:/i.test(url)) shell.openExternal(url);
  },
  exit() { app.quit(); },
  user() { return null; }
};

ipcMain.on('mv-call', (e, method, args) => {
  const f = ASYNC[method], id = args[0];
  if (!f) return reply(id, false, 'No disponible en el PC');
  Promise.resolve().then(() => f.apply(null, args)).catch((err) => reply(id, false, errMsg(err)));
});
ipcMain.on('mv-sync', async (e, method, args) => {
  const f = SYNC[method];
  try { const v = f ? await f.apply(null, args) : null; e.returnValue = v === undefined ? null : v; }
  catch (err) { e.returnValue = null; }
});
ipcMain.on('mv-methods', (e) => { e.returnValue = { async: Object.keys(ASYNC), sync: Object.keys(SYNC) }; });

// ---------------- Navegador ----------------
function openBrowser(url) {
  const b = new BrowserWindow(Object.assign(coverBounds(), { autoHideMenuBar: true, icon: iconPath(), title: 'Navegador · MiVibra TV', webPreferences: { sandbox: true } }));
  b.webContents.setWindowOpenHandler(({ url: u }) => { b.loadURL(u); return { action: 'deny' }; });
  b.webContents.on('before-input-event', (ev, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'BrowserBack' || (input.alt && input.key === 'ArrowLeft')) { if (b.webContents.navigationHistory.canGoBack()) b.webContents.navigationHistory.goBack(); }
    if (input.key === 'F11') b.setFullScreen(!b.isFullScreen());
  });
  b.loadURL(/^https?:/i.test(url) ? url : 'https://www.google.com/search?q=' + encodeURIComponent(url));
}


// ---------------- Carátulas desde el video ----------------
const THUMBS = path.join(DATA, 'cache', 'thumbs');
let thumbWin = null, thumbChain = Promise.resolve();
function thumbQueue(fn) { const p = thumbChain.then(fn, fn); thumbChain = p.catch(() => {}); return p; }
async function videoFrame(url, at) {
  fs.mkdirSync(THUMBS, { recursive: true });
  const name = crypto.createHash('md5').update(url + '|' + at).digest('hex').slice(0, 20) + '.jpg', f = path.join(THUMBS, name);
  const served = BASE + '/thumbs/' + name;
  if (storage.exists(f)) return served;
  if (!thumbWin || thumbWin.isDestroyed()) {
    thumbWin = new BrowserWindow({ show: false, width: 480, height: 270, webPreferences: { webSecurity: false, partition: 'persist:thumbs', backgroundThrottling: false, offscreen: true, autoplayPolicy: 'no-user-gesture-required' } });
    thumbWin.webContents.setAudioMuted(true);
    await thumbWin.loadURL('about:blank');
  }
  const js = `new Promise((res, rej) => {
    const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
    const t = setTimeout(() => { v.src = ''; rej(new Error('El video no respondió')); }, 20000);
    v.onerror = () => { clearTimeout(t); rej(new Error('Formato no compatible')); };
    v.onloadedmetadata = () => { const d = isFinite(v.duration) && v.duration > 0 ? v.duration : 600; v.currentTime = Math.max(1, d * ${Math.min(0.95, Math.max(0.02, at))}); };
    v.onseeked = () => { setTimeout(() => { try { const w = Math.min(480, v.videoWidth || 480), h = Math.round(w * (v.videoHeight || 270) / (v.videoWidth || 480)); const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(v, 0, 0, w, h); const u = c.toDataURL('image/jpeg', 0.82); clearTimeout(t); v.src = ''; res(u); } catch (e) { clearTimeout(t); rej(e); } }, 250); };
    v.src = ${JSON.stringify(url)};
  })`;
  const data = await thumbWin.webContents.executeJavaScript(js);
  fs.writeFileSync(f, Buffer.from(String(data).split(',')[1], 'base64'));
  try { const all = fs.readdirSync(THUMBS).map((n) => ({ n, t: fs.statSync(path.join(THUMBS, n)).mtimeMs })).sort((a, b) => b.t - a.t); all.slice(600).forEach((x) => fs.unlinkSync(path.join(THUMBS, x.n))); } catch (e) {}
  return served;
}
// ---------------- Ventana principal ----------------
function iconPath() { const f = path.join(__dirname, 'assets', 'icon.png'); return storage.exists(f) ? f : undefined; }

async function startServer() {
  const extra = (req, res, u) => {
    const p = u.pathname;
    if (p === '/pc/intro.ogg') { server.sendFile(req, res, DIRS.intro); return true; }
    if (p.startsWith('/thumbs/')) {
      const f = path.join(THUMBS, path.basename(decodeURIComponent(p.slice(8))));
      server.sendFile(req, res, f); return true;
    }
    if (p.startsWith('/books/')) {
      // Libros y mangas abiertos (caché de la app)
      const base = path.join(DATA, 'cache', 'books');
      const f = path.normalize(path.join(base, decodeURIComponent(p.slice(7))));
      if (!f.startsWith(path.normalize(base))) { res.writeHead(403); res.end(); return true; }
      server.sendFile(req, res, f); return true;
    }
    if (p.startsWith('/pc/ejs/')) {
      // EmulatorJS y sus núcleos (vienen dentro del instalador)
      const f = path.normalize(path.join(DIRS.ejs, decodeURIComponent(p.slice(8))));
      if (!f.startsWith(path.normalize(DIRS.ejs))) { res.writeHead(403); res.end(); return true; }
      server.sendFile(req, res, f, { 'Cross-Origin-Resource-Policy': 'same-origin' }); return true;
    }
    if (p === '/pc/vendor/hls.min.js') { server.sendFile(req, res, require.resolve('hls.js/dist/hls.min.js')); return true; }
    if (p === '/pc/vendor/mpegts.js') { server.sendFile(req, res, require.resolve('mpegts.js/dist/mpegts.js')); return true; }
    return false;
  };
  srv = await server.start(APP_PORT, { www: DIRS.www, pc: DIRS.pc, net: NET }, extra, SESSION);
}

function createWindow() {
  const wa = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: Math.min(1600, wa.width), height: Math.min(900, wa.height), minWidth: 900, minHeight: 560,
    backgroundColor: '#0D0C0B', autoHideMenuBar: true, show: false, icon: iconPath(), title: 'MiVibra TV',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: false, sandbox: false, nodeIntegration: false, backgroundThrottling: false }
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (ev, url) => { if (!url.startsWith(BASE)) { ev.preventDefault(); shell.openExternal(url); } });
  win.on('closed', () => { win = null; for (const w of [playerWin, gameWin]) if (w && !w.isDestroyed()) w.close(); });
  win.loadURL(BASE + '/index.html');
}

// Seguridad: sin <webview>, permisos solo los necesarios (pantalla completa, micrófono para búsqueda por voz)
app.on('web-contents-created', (e, c) => {
  c.on('will-attach-webview', (ev) => ev.preventDefault());
});
app.whenReady().then(async () => {
  for (const s of [session.defaultSession, session.fromPartition('persist:player')]) {
    s.setPermissionRequestHandler((wc, perm, cb) => cb(['fullscreen', 'media', 'clipboard-sanitized-write', 'pointerLock'].includes(perm)));
  }
  // Cabeceras de cada señal (identificación y página de origen que piden algunos servidores)
  session.fromPartition('persist:player').webRequest.onBeforeSendHeaders({ urls: ['http://*/*', 'https://*/*'] }, (d, cb) => {
    const h = d.requestHeaders;
    if (!/^http:\/\/localhost:/.test(d.url)) {
      if (playerHeaders.ua) h['User-Agent'] = playerHeaders.ua;
      if (playerHeaders.ref) h.Referer = playerHeaders.ref;
    }
    cb({ requestHeaders: h });
  });
  try { await startServer(); }
  catch (e) {
    dialog.showErrorBox('MiVibra TV', 'No se pudo iniciar (el puerto ' + APP_PORT + ' está ocupado). Cierra otras copias de MiVibra TV e inténtalo de nuevo.\n\n' + errMsg(e));
    app.quit(); return;
  }
  createWindow();
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { try { if (ocrWorker) ocrWorker.terminate(); } catch (e) {} });
