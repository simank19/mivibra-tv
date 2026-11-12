/* Juegos en los TV Samsung (Tizen) y LG (webOS).
   - Biblioteca: los juegos enviados desde el celular se guardan en la memoria de la app (IndexedDB).
   - Emulador: EmulatorJS (núcleos de RetroArch para navegador, GPL-3) dentro de un iframe.
   - Conexión directa celular ↔ TV (WebRTC, por el Wi-Fi de la casa): para enviar juegos y usar el celular como mando.
     Los datos para conectarse se intercambian por Firebase (rtc/<código>/s); los juegos no pasan por la nube.
   La sección Juegos de la app es la misma: aquí se reemplazan las funciones nativas de Android que usa. */
(function () {
  var MV = window.MV, A = window.Android;
  if (!MV || !A || !document.documentElement.classList.contains('webtv')) return;
  var DIR = '/android/data/co.mivibra.tv/juegos/';
  var EJS_DATA = window.MV_EJS_DATA || 'https://cdn.emulatorjs.org/stable/data/';
  // Consola de MiVibra → sistema de EmulatorJS (las que el TV puede mover)
  var EJS_SYS = { nes: 'nes', snes: 'snes', gb: 'gb', gbc: 'gb', gba: 'gba', md: 'segaMD', sms: 'segaMS', gg: 'segaGG', psx: 'psx', a26: 'atari2600', a78: 'atari7800', lynx: 'lynx', pce: 'pce', ngp: 'ngp', ws: 'ws', arcade: 'arcade', neogeo: 'arcade', n64: 'n64', nds: 'nds',
    sg1000: 'segaMS', '32x': 'sega32x', segacd: 'segaCD', saturn: 'segaSaturn', '3do': '3do', vb: 'vb', a52: 'atari5200', jaguar: 'jaguar', coleco: 'coleco',
    c64: 'c64', amiga: 'amiga', cpc: 'cap32', zx: 'fuse' };
  MV.webSystems = Object.keys(EJS_SYS);
  var SLOW = { psx: 1, n64: 1, nds: 1, saturn: 1, '3do': 1, jaguar: 1, amiga: 1 };
  function reply(id, ok, data) { setTimeout(function () { if (MV._cb) MV._cb(id, { ok: ok, data: data == null ? null : data }); }, 0); }
  function esc(s) { return MV.esc ? MV.esc(s) : String(s); }
  function baseName(p) { return String(p || '').split('/').pop(); }

  // ---------- Archivos (IndexedDB) ----------
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var r = indexedDB.open('mivibra-juegos', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('files'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { dbp = null; rej(r.error); };
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction('files', mode), st = t.objectStore('files'), out;
        var r = fn(st); if (r) r.onsuccess = function () { out = r.result; };
        t.oncomplete = function () { res(out); };
        t.onerror = t.onabort = function () { rej(t.error || new Error('No se pudo guardar')); };
      });
    });
  }
  var fput = function (k, v) { return tx('readwrite', function (s) { return s.put(v, k); }); };
  var fget = function (k) { return tx('readonly', function (s) { return s.get(k); }); };
  var fdel = function (k) { return tx('readwrite', function (s) { return s.delete(k); }); };

  // Lista de juegos y lo que trae cada .zip (para reconocer la consola sin abrirlo)
  function meta() { return MV.load('webRoms', []) || []; }
  function setMeta(m) { MV.save('webRoms', m); }
  var ZIP = MV.load('webZip', {}) || {};
  function biosList() { return MV.load('webBios', []) || []; }

  /** Nombres de los archivos dentro de un .zip (lee el índice del final del archivo). */
  function zipNames(file) {
    var n = Math.min(file.size, 70000);
    return file.slice(file.size - n).arrayBuffer().then(function (buf) {
      var v = new DataView(buf), i = buf.byteLength - 22;
      for (; i >= 0; i--) if (v.getUint32(i, true) === 0x06054b50) break;
      if (i < 0) return [];
      var cnt = v.getUint16(i + 10, true), size = v.getUint32(i + 12, true), off = v.getUint32(i + 16, true);
      return file.slice(off, off + size).arrayBuffer().then(function (cd) {
        var d = new DataView(cd), p = 0, out = [], dec = new TextDecoder();
        for (var k = 0; k < cnt && p + 46 <= cd.byteLength; k++) {
          if (d.getUint32(p, true) !== 0x02014b50) break;
          var nl = d.getUint16(p + 28, true), xl = d.getUint16(p + 30, true), cl = d.getUint16(p + 32, true);
          out.push(dec.decode(new Uint8Array(cd, p + 46, nl)));
          p += 46 + nl + xl + cl;
        }
        return out;
      });
    }).catch(function () { return []; });
  }
  var BIOS_RX = /^(neogeo\.zip|scph\d+\.bin|psxonpsp660\.bin|ps1_rom\.bin|gba_bios\.bin|gb_bios\.bin|gbc_bios\.bin|bios7\.bin|bios9\.bin|firmware\.bin|syscard3\.pce|lynxboot\.img|7800 bios \(u\)\.rom|bios_cd_[uej]\.bin|saturn_bios\.bin|sega_101\.bin|mpr-17933\.bin|panafz1j?\.bin|panafz10\.bin|goldstar\.bin|5200\.rom|colecovision\.rom)$/i;

  /** Guarda un archivo que llegó del celular. */
  function store(file, asBios) {
    var name = String(file.name || 'juego').replace(/[\\/]/g, '_').slice(0, 120);
    var bios = asBios || BIOS_RX.test(name);
    var key = (bios ? 'bios/' : 'rom/') + name;
    return fput(key, file).then(function () {
      if (bios) {
        var b = biosList(); if (b.indexOf(name) < 0) b.push(name); MV.save('webBios', b);
        MV.toast('BIOS recibida: ' + name, 3500);
        return { name: name, bios: true };
      }
      var ext = (name.match(/\.([^.]+)$/) || [])[1]; ext = ext ? ext.toLowerCase() : '';
      var job = ext === 'zip' ? zipNames(file) : Promise.resolve(null);
      return job.then(function (names) {
        if (names) {
          ZIP[name] = { names: names.slice(0, 400), exts: names.map(function (x) { var e = (x.match(/\.([^.\/]+)$/) || [])[1]; return e ? e.toLowerCase() : ''; }).filter(Boolean).filter(function (e, i, a) { return a.indexOf(e) === i; }) };
          MV.save('webZip', ZIP);
        }
        var m = meta().filter(function (x) { return x.name !== name; });
        m.push({ name: name, ext: ext, size: file.size, at: Date.now() }); setMeta(m);
        var r = { name: name, path: DIR + name, ext: ext, size: file.size };
        if (MV.onRomReceived) MV.onRomReceived(r);
        return r;
      });
    });
  }
  MV.webGames = { store: store };

  // ---------- Lo nativo que usa la sección Juegos ----------
  A.hasStorageAccess = function () { return true; };
  A.requestStorageAccess = function () {};
  A.downloadsDir = function () { return DIR; };
  A.storageRoots = function () { return JSON.stringify([{ name: 'Juegos enviados desde el celular', path: DIR, readable: true }]); };
  A.scanRoms = function (id) { reply(id, true, meta().map(function (x) { return { name: x.name, path: DIR + x.name, ext: x.ext, size: x.size }; })); };
  A.coreInstalled = function () { return true; };
  A.downloadCore = function (id) { reply(id, true, null); };
  A.unzipRom = function (id, json) { var o = {}; try { o = JSON.parse(json); } catch (e) {} reply(id, true, o.path); };
  A.arcadePrepare = function (id, json) { var o = {}; try { o = JSON.parse(json); } catch (e) {} reply(id, true, { path: o.path, bios: biosList().indexOf('neogeo.zip') >= 0 }); };
  A.importBios = function (id) { reply(id, true, []); };
  A.zipExts = function (p) { return JSON.stringify((ZIP[baseName(p)] || {}).exts || []); };
  A.archiveNames = function (p) { return JSON.stringify((ZIP[baseName(p)] || {}).names || []); };
  A.deleteFile = function (p) {
    var n = baseName(p);
    fdel('rom/' + n).catch(function () {}); fdel('state/' + n).catch(function () {});
    setMeta(meta().filter(function (x) { return x.name !== n; }));
    delete ZIP[n]; MV.save('webZip', ZIP);
    return true;
  };
  A.gamepads = function () { return JSON.stringify(peers.filter(function (p) { return p.open; }).map(function (p) { return { name: p.name || ('Celular ' + (p.slot + 1)) }; })); };
  A.playGame = function (id, json) {
    var o = {}; try { o = JSON.parse(json); } catch (e) {}
    openEmu(o).then(function () { reply(id, true, null); }, function (e) { reply(id, false, e.message); });
  };
  A.retroArch = function () { return JSON.stringify({ installed: false }); };

  // Consolas que el TV no puede mover: aviso claro en vez de pedir RetroArch
  function canPlay(r) {
    var s = MV.romSystem && MV.romSystem(r);
    if (s && !EJS_SYS[s.id]) { MV.toast(s.name + ' no se puede jugar en este TV (necesita más potencia). Juégalo en el Android TV o en el PC.', 6000); return false; }
    return true;
  }
  function patch() {
    var orig = MV.playRom; if (!orig || orig._web) return;
    MV.playRom = function (r) { if (canPlay(r)) orig(r); };
    MV.playRom._web = 1;
    if (MV.ACT) {
      MV.ACT.playRom = function (_, el) { var it = MV.reg[el.dataset.key]; if (it) MV.playRom(it.rom); };
      MV.ACT.romsFromPhone = function () {
        MV.modal('<h2>Enviar juegos desde el celular</h2><p>Escanea el código con el celular (en el mismo Wi-Fi que el TV). En el control que se abre toca <b>Enviar juegos</b> y elige tus ROMs o BIOS: llegan directo al TV y aparecen en Juegos.</p><div id="qrBox3" style="display:flex;gap:20px;align-items:center;flex-wrap:wrap"></div><p class="muted" id="romsCount" style="margin-top:12px">Esperando archivos…</p>', {
          onOpen: function () {
            var box = document.getElementById('qrBox3'); if (!box) return;
            if (!MV.cloudRemote || !MV.cloudRemote.ok()) { box.innerHTML = '<p>Primero entra con tu cuenta (Ajustes › Sincronización).</p>'; return; }
            var q = window.qrcode(0, 'M'); q.addData(MV.cloudRemote.link()); q.make();
            box.innerHTML = '<div class="qr">' + q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }) + '</div><div><p style="margin:0 0 10px">Código de esta TV: <b style="font:800 22px var(--brand);letter-spacing:2px">' + esc(MV.deviceCodePretty()) + '</b> · clave <b style="font:800 22px var(--brand);letter-spacing:3px">' + esc(MV.cloudRemote.key()) + '</b></p><p class="muted">Funciona con el celular en el mismo Wi-Fi. Juegos de hasta unos 200 MB.</p></div>';
          }
        });
      };
      MV.ACT.romDownload = function () { MV.toast('En este TV los juegos se agregan desde el celular: Juegos › Enviar desde el celular', 5000); };
      MV.ACT.importBios = function () { MV.toast('Envía la BIOS desde el celular con “Enviar BIOS”', 4000); };
    }
  }

  // ---------- Emulador ----------
  var emu = null;   // { frame, win, sys, name, menu }
  var BTN = { B: 0, Y: 1, SELECT: 2, START: 3, UP: 4, DOWN: 5, LEFT: 6, RIGHT: 7, A: 8, X: 9, L1: 10, R1: 11, L2: 12, R2: 13, L3: 14, R3: 15 };
  // Mando del celular con botones como Xbox (A abajo, B derecha…) → posición en el mando de RetroArch
  var PAD = { A: 'B', B: 'A', X: 'Y', Y: 'X' };

  function openEmu(o) {
    var name = baseName(o.rom), s = (D_sys(o.sys)), ejs = EJS_SYS[o.sys];
    if (!ejs) return Promise.reject(new Error('Esta consola no se puede jugar en el TV'));
    return fget('rom/' + name).then(function (file) {
      if (!file) throw new Error('No encuentro el archivo del juego. Envíalo otra vez desde el celular.');
      return Promise.all([fget('state/' + name), o.sys === 'neogeo' ? fget('bios/neogeo.zip') : null, o.sys === 'psx' ? firstBios(/^scph|ps1_rom/i) : (s && s.bios) ? firstBios(s.bios) : null]).then(function (x) {
        if (s && s.bios && !x[2]) MV.toast(s.name + ' necesita su BIOS (' + s.biosName + '). Envíala desde el celular con “Enviar BIOS”.', 6000);
        if (SLOW[o.sys]) MV.toast((s ? s.name : 'Esta consola') + ' puede ir lenta en algunos TV.', 4000);
        start(file, o, ejs, x[0], x[1] || x[2]);
      });
    });
  }
  function D_sys(id) { var D = window.MVD || {}; return (D.SYSTEMS || []).find(function (s) { return s.id === id; }) || null; }
  function firstBios(rx) { var b = biosList().filter(function (n) { return rx.test(n); })[0]; return b ? fget('bios/' + b) : Promise.resolve(null); }

  function start(file, o, ejs, state, bios) {
    closeEmu(true);
    var f = document.createElement('iframe');
    f.setAttribute('allow', 'autoplay; fullscreen; gamepad');
    f.style.cssText = 'position:fixed;inset:0;left:0;top:0;width:100%;height:100%;border:0;z-index:9998;background:#000';
    f.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#000;overflow:hidden;font-family:system-ui,sans-serif}#game{width:100%;height:100%}.ejs_menu_bar,.ejs_virtualGamepad_parent{display:none!important}' +
      '#mvm{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.72);z-index:99999}#mvm.on{display:flex}' +
      '#mvm div{background:rgba(24,22,20,.95);border:1px solid rgba(255,255,255,.15);border-radius:18px;padding:22px 26px;min-width:340px;color:#F3EFEA}' +
      '#mvm h3{margin:0 0 14px;font-size:22px}#mvm button{display:block;width:100%;margin:8px 0;padding:14px 18px;border-radius:12px;border:0;background:rgba(255,255,255,.1);color:#F3EFEA;font:600 18px system-ui;text-align:left}' +
      '#mvm button.on{background:#FF6900;color:#0D0C0B}#mvt{position:fixed;left:50%;bottom:6vh;transform:translateX(-50%);background:rgba(14,13,12,.9);color:#F3EFEA;padding:12px 22px;border-radius:12px;font:600 17px system-ui;z-index:99999;display:none}</style></head>' +
      '<body><div id="game"></div><div id="mvm"><div><h3></h3><button data-a="resume">Continuar</button><button data-a="save">Guardar y salir</button><button data-a="restart">Reiniciar el juego</button><button data-a="quit">Salir sin guardar</button></div></div><div id="mvt"></div></body></html>';
    document.body.appendChild(f);
    emu = { frame: f, win: null, sys: o.sys, name: baseName(o.rom), title: o.title || baseName(o.rom), menu: false, sel: 0 };
    var me = emu;
    f.onload = function () {
      if (emu !== me) return;
      var w = f.contentWindow; me.win = w;
      w.document.querySelector('#mvm h3').textContent = me.title;
      w.EJS_player = '#game';
      w.EJS_core = ejs;
      w.EJS_gameName = me.title;
      // El archivo se vuelve a crear dentro del iframe: EmulatorJS revisa "instanceof File" con el File de su propia ventana
      w.EJS_gameUrl = new w.File([file], me.name);
      if (bios) {
        // El núcleo busca la BIOS por su nombre exacto (con mayúsculas): Sega CD bios_CD_U.bin, Saturn saturn_bios.bin…
        var sd = D_sys(o.sys), bn = bios.name || (o.sys === 'neogeo' ? 'neogeo.zip' : 'bios.bin');
        if (o.sys === 'segacd') bn = bn.replace(/^bios_cd_([uej])\.bin$/i, function (m, c) { return 'bios_CD_' + c.toUpperCase() + '.bin'; });
        else if (sd && sd.biosName && o.sys !== 'psx') bn = sd.biosName;
        w.EJS_biosUrl = new w.File([bios], bn);
      }
      if (state) { try { w.EJS_loadStateURL = URL.createObjectURL(state); } catch (e) {} }
      w.EJS_pathtodata = EJS_DATA;
      w.EJS_startOnLoaded = true;
      w.EJS_color = '#FF6900';
      w.EJS_language = 'es';
      w.EJS_backgroundColor = '#000';
      w.EJS_Buttons = { playPause: false, restart: false, mute: false, settings: false, fullscreen: false, saveState: false, loadState: false, screenRecord: false, gamepad: false, cheat: false, volume: false, saveSavFiles: false, loadSavFiles: false, quickSave: false, quickLoad: false, screenshot: false, cacheManager: false, exitEmulation: false };
      w.EJS_onGameStart = function () { toast(w, state ? 'Partida restaurada · Atrás: menú' : 'Atrás: menú del juego'); };
      w.addEventListener('keydown', function (e) { onTvKey(e, true); }, true);
      w.addEventListener('keyup', function (e) { onTvKey(e, false); }, true);
      Array.prototype.forEach.call(w.document.querySelectorAll('#mvm button'), function (b, i) { b.addEventListener('click', function () { menuAct(b.getAttribute('data-a')); }); });
      var sc = w.document.createElement('script'); sc.src = EJS_DATA + 'loader.js';
      sc.onerror = function () { MV.toast('No se pudo descargar el emulador. Revisa la conexión a internet.', 6000); closeEmu(); };
      w.document.body.appendChild(sc);
      try { w.focus(); } catch (e) {}
    };
    try { A.keepAwake && A.keepAwake(true); } catch (e) {}
    broadcast({ mode: 'game' });
  }
  function toast(w, t) { var el = w.document.getElementById('mvt'); if (!el) return; el.textContent = t; el.style.display = 'block'; clearTimeout(el._t); el._t = setTimeout(function () { el.style.display = 'none'; }, 3500); }
  function gm() { try { return emu && emu.win && emu.win.EJS_emulator && emu.win.EJS_emulator.gameManager; } catch (e) { return null; } }
  function input(slot, idx, val) { var g = gm(); if (g) try { g.simulateInput(slot, idx, val); } catch (e) {} }

  function showMenu(on) {
    if (!emu || !emu.win) return;
    emu.menu = on; emu.sel = 0;
    var m = emu.win.document.getElementById('mvm'); m.classList.toggle('on', on);
    var ej = emu.win.EJS_emulator;
    try { if (ej) { if (on) ej.pause(); else ej.play(); } } catch (e) {}
    paintMenu();
  }
  function paintMenu() { if (!emu || !emu.win) return; Array.prototype.forEach.call(emu.win.document.querySelectorAll('#mvm button'), function (b, i) { b.classList.toggle('on', i === emu.sel); }); }
  function menuAct(a) {
    if (!emu) return;
    if (a === 'resume') showMenu(false);
    else if (a === 'restart') { showMenu(false); var g = gm(); try { g && g.restart(); } catch (e) {} }
    else if (a === 'quit') closeEmu();
    else if (a === 'save') {
      var g2 = gm(), name = emu.name;
      try { if (g2 && g2.saveSaveFiles) g2.saveSaveFiles(); } catch (e) {}
      var st = null; try { st = g2 && g2.getState(); } catch (e) {}
      if (st) fput('state/' + name, new Blob([st])).then(function () { MV.toast('Partida guardada'); }, function () { MV.toast('No hay espacio para guardar la partida'); });
      closeEmu();
    }
  }
  function closeEmu(silent) {
    if (!emu) return;
    var f = emu.frame; emu = null;
    try { var ej = f.contentWindow.EJS_emulator; ej && ej.pause && ej.pause(); } catch (e) {}
    try { f.src = 'about:blank'; } catch (e) {}
    f.remove();
    try { A.keepAwake && A.keepAwake(false); } catch (e) {}
    if (!silent) { broadcast({ mode: 'remote' }); setTimeout(function () { try { window.focus(); var a = document.activeElement; if (MV.focusFirst && (!a || a === document.body)) MV.focusFirst(); } catch (e) {} }, 60); }
  }

  // Control del TV dentro del juego: cruceta = cruceta, OK = A, reproducir = START, rojo = B, verde = Y, Atrás = menú
  var TVK = { ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', Enter: 'A', MediaPlayPause: 'START', MediaPlay: 'START', ' ': 'START', ColorF0Red: 'B', ColorF1Green: 'Y', ColorF2Yellow: 'X', ColorF3Blue: 'SELECT', MediaRewind: 'L1', MediaFastForward: 'R1' };
  var TVC = { 13: 'A', 37: 'LEFT', 38: 'UP', 39: 'RIGHT', 40: 'DOWN', 415: 'START', 10252: 'START', 19: 'START', 403: 'B', 404: 'Y', 405: 'X', 406: 'SELECT', 412: 'L1', 417: 'R1' };
  function onTvKey(e, down) {
    var back = e.keyCode === 10009 || e.keyCode === 461 || e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack' || e.key === 'Backspace';
    e.preventDefault(); e.stopImmediatePropagation();
    if (back) { if (down && !e.repeat) navKey('BACK'); return; }
    var n = TVK[e.key] || TVC[e.keyCode]; if (!n) return;
    if (emu && emu.menu) { if (down) navKey(n === 'A' ? 'OK' : n); return; }
    if (e.repeat) return;
    input(0, BTN[n], down ? 1 : 0);
  }
  /** Tecla de navegación (control del TV o del celular) mientras el juego está abierto. */
  function navKey(n) {
    if (!emu) return false;
    if (n === 'BACK' || n === 'MENU') { showMenu(!emu.menu); return true; }
    if (n === 'HOME') { menuAct('save'); return true; }
    if (!emu.menu) return false;
    var bs = emu.win ? emu.win.document.querySelectorAll('#mvm button') : [];
    if (n === 'UP') emu.sel = (emu.sel + bs.length - 1) % bs.length;
    else if (n === 'DOWN') emu.sel = (emu.sel + 1) % bs.length;
    else if (n === 'OK' || n === 'A') { var b = bs[emu.sel]; if (b) menuAct(b.getAttribute('data-a')); return true; }
    paintMenu(); return true;
  }
  MV.webEmu = {
    isOpen: function () { return !!emu; },
    /** Control remoto por internet: se usa para el menú del juego. */
    nav: function (n) { if (!emu) return false; if (navKey(n)) return true; if (BTN[n] != null) { input(0, BTN[n], 1); setTimeout(function () { input(0, BTN[n], 0); }, 90); } else if (n === 'OK') { input(0, 8, 1); setTimeout(function () { input(0, 8, 0); }, 90); } return true; }
  };

  // ---------- Conexión directa con los celulares (WebRTC) ----------
  var peers = [], rtcUnsub = null;
  function broadcast(o) { var s = JSON.stringify(o); peers.forEach(function (p) { if (p.open) try { p.dc.send(s); } catch (e) {} }); }
  function freeSlot() { var used = peers.filter(function (p) { return p.open; }).map(function (p) { return p.slot; }); var s = 0; while (used.indexOf(s) >= 0) s++; return s; }
  function clientsChanged() { var open = peers.filter(function (p) { return p.open; }); if (MV.onRemoteClients) MV.onRemoteClients(open.length, open.map(function (p) { return p.name || 'Celular'; })); }

  function onMsg(p, ev) {
    if (typeof ev.data !== 'string') { // pedazo de un archivo
      if (p.rx) { p.rx.parts.push(ev.data); p.rx.got += ev.data.byteLength || ev.data.size || 0; }
      return;
    }
    var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.t === 'k') {
      var n = String(m.c || ''), d = !!m.d;
      if (emu) {
        if (emu.menu || n === 'BACK' || n === 'MENU' || n === 'HOME') { if (d) navKey(n === 'OK' ? 'OK' : n); return; }
        var b = PAD[n] || n; if (n === 'OK') b = 'A';
        if (BTN[b] != null) input(p.slot, BTN[b], d ? 1 : 0);
        return;
      }
      if (d && MV.cloudRemote && MV.cloudRemote.run) MV.cloudRemote.run({ t: 'k', c: n });
    } else if (m.t === 'a') {
      if (!emu) return;
      var x = Math.max(-1, Math.min(1, +m.x || 0)), y = Math.max(-1, Math.min(1, +m.y || 0)), base = m.s === 'r' ? 20 : 16;
      input(p.slot, base, x > 0 ? x * 0x7fff : 0); input(p.slot, base + 1, x < 0 ? -x * 0x7fff : 0);
      input(p.slot, base + 2, y > 0 ? y * 0x7fff : 0); input(p.slot, base + 3, y < 0 ? -y * 0x7fff : 0);
    } else if (m.t === 'name') { p.name = String(m.v || '').slice(0, 30); clientsChanged(); }
    else if (m.t === 'file') {
      p.rx = { name: String(m.name || 'juego'), size: +m.size || 0, bios: !!m.bios, parts: [], got: 0 };
    } else if (m.t === 'fileEnd') {
      var rx = p.rx; p.rx = null; if (!rx) return;
      var file; try { file = new File(rx.parts, rx.name); } catch (e) { file = new Blob(rx.parts); file.name = rx.name; }
      if (rx.size && file.size !== rx.size) { send(p, { t: 'fileErr', name: rx.name, e: 'Llegó incompleto, envíalo otra vez' }); return; }
      store(file, rx.bios).then(function () { send(p, { t: 'fileOk', name: rx.name }); }, function (e) {
        send(p, { t: 'fileErr', name: rx.name, e: /quota/i.test(String(e && (e.name || e.message))) ? 'El TV no tiene más espacio' : 'No se pudo guardar' });
      });
    } else if (m.t === 'go' || m.t === 'text' || m.t === 'hello') { if (MV.cloudRemote && MV.cloudRemote.run) MV.cloudRemote.run(m); }
  }
  function send(p, o) { try { p.dc.send(JSON.stringify(o)); } catch (e) {} }

  function answer(fb, col, d) {
    var pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    var p = { pc: pc, dc: null, open: false, slot: 0, name: '', sid: d.sid };
    peers.push(p);
    pc.ondatachannel = function (ev) {
      var ch = ev.channel; ch.binaryType = 'arraybuffer';
      if (ch.label === 'ax') { ch.onmessage = function (e) { onMsg(p, e); }; return; }
      p.dc = ch;
      ch.onopen = function () { p.slot = freeSlot(); p.open = true; send(p, { t: 'hello', slot: p.slot }); send(p, { mode: emu ? 'game' : 'remote' }); clientsChanged(); MV.toast('Celular conectado (jugador ' + (p.slot + 1) + ')', 3000); };
      ch.onmessage = function (e) { onMsg(p, e); };
      ch.onclose = function () { drop(p); };
    };
    pc.onconnectionstatechange = function () { if (/failed|closed|disconnected/.test(pc.connectionState)) setTimeout(function () { if (/failed|closed|disconnected/.test(pc.connectionState)) drop(p); }, 4000); };
    pc.setRemoteDescription({ type: 'offer', sdp: d.sdp })
      .then(function () { return pc.createAnswer(); })
      .then(function (a) { return pc.setLocalDescription(a); })
      .then(function () { return iceDone(pc); })
      .then(function () { return col.doc(d.sid + 'a').set({ t: 'answer', sid: d.sid, sdp: pc.localDescription.sdp, k: d.k, at: Date.now() }); })
      .catch(function () { drop(p); });
  }
  function iceDone(pc) {
    return new Promise(function (res) {
      if (pc.iceGatheringState === 'complete') return res();
      var t = setTimeout(res, 2500);
      pc.addEventListener('icegatheringstatechange', function () { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
    });
  }
  function drop(p) {
    var i = peers.indexOf(p); if (i < 0) return;
    peers.splice(i, 1);
    try { p.pc.close(); } catch (e) {}
    if (p.open) clientsChanged();
  }
  function rtcStart() {
    if (rtcUnsub || !window.RTCPeerConnection || !MV.cloudRemote || !MV.cloudRemote.ok()) return;
    var k = MV.cloudRemote.key();
    MV.sync.load().then(function (fb) {
      var col = fb.firestore().collection('rtc').doc(MV.deviceCode()).collection('s'), t0 = Date.now();
      rtcUnsub = col.onSnapshot(function (snap) {
        snap.docChanges().forEach(function (ch) {
          if (ch.type !== 'added') return;
          var d = ch.doc.data() || {};
          if (d.t !== 'offer') return;
          ch.doc.ref.delete().catch(function () {});
          if (d.k !== k || (+d.at || 0) < t0 - 60000 || !/^[A-Za-z0-9]{6,30}$/.test(d.sid || '')) return;
          answer(fb, col, d);
        });
      }, function () { rtcUnsub = null; setTimeout(rtcStart, 15000); });
    }).catch(function () { setTimeout(rtcStart, 30000); });
  }

  function boot() { patch(); setTimeout(rtcStart, 3500); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
