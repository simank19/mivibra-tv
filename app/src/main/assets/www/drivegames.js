/* Juegos en Google Drive: la carpeta de ROMs del usuario aparece en la consola con carátula e información;
   cada juego se descarga solo al jugarlo y se borra al cerrarlo; las partidas se guardan en "MiVibra Partidas". */
(function () {
  var MV = window.MV, A = window.Android;
  if (!MV || !A || !A.driveConnected) return;
  var esc = MV.esc;
  function cfg() { return MV.load('driveGames', {}) || {}; }
  function setCfg(c) { MV.save('driveGames', c); }
  MV.driveOn = function () { try { return A.driveConnected() && !!cfg().folder; } catch (e) { return false; } };
  MV.driveStatus = function () { var c = cfg(); return MV.driveOn() ? 'Conectado · ' + (c.count || 0) + ' juegos en “' + (c.folderName || 'tu carpeta') + '”' : 'Tus juegos y partidas en la nube'; };

  // La consola sale del nombre de la carpeta (Nintendo 64 Games, Gameboy Advanced, Sega Genesis…); se mira de la más interna a la de afuera
  var DIRS = [
    ['gbc', /game ?boy colou?r|\bgbc\b/], ['gba', /game ?boy adv|\bgba\b/], ['gb', /game ?boy|\bgb\b/],
    ['nds', /nintendo ds|\bnds\b|^ds$/], ['n64', /nintendo 64|\bn64\b/], ['snes', /super nintendo|\bsnes\b|super famicom|\bsfc\b/],
    ['nes', /nintendo entertainment|\bnes\b|famicom/], ['gc', /gamecube|game cube|\bngc\b/],
    ['psp', /\bpsp\b|playstation portable/], ['psx', /playstation|\bpsx\b|\bps1\b/],
    ['md', /genesis|mega ?drive/], ['sms', /master system/], ['gg', /game ?gear/], ['dc', /dreamcast/],
    ['a26', /atari 2600|\b2600\b/], ['a78', /atari 7800|\b7800\b/], ['lynx', /lynx/], ['pce', /pc ?engine|turbografx/],
    ['ngp', /neo ?geo pocket/], ['neogeo', /neo ?geo/], ['ws', /wonderswan/], ['arcade', /arcade|mame|fbneo|final burn/]
  ];
  function dirSys(sub) {
    var parts = (sub || '').toLowerCase().split('/').filter(Boolean).reverse();
    for (var i = 0; i < parts.length; i++) for (var j = 0; j < DIRS.length; j++) if (DIRS[j][1].test(parts[i])) return DIRS[j][0];
    return '';
  }
  function ext(n) { var m = /\.([a-z0-9]{1,5})$/i.exec(n || ''); return m ? m[1].toLowerCase() : ''; }
  /** Lee la carpeta y deja sus juegos en la biblioteca (reemplaza los de Drive anteriores). */
  function scan(quiet) {
    var c = cfg(); if (!c.folder) return Promise.resolve(0);
    if (!quiet) MV.toast('Leyendo tus juegos de Google Drive…', 4000);
    return MV.call('driveGames', [c.folder]).then(function (files) {
      var found = (files || []).map(function (f) {
        return { path: 'gdrive:' + f.id, name: f.name, ext: ext(f.name), size: +f.size || 0, drive: 1, pick: 1, sub: f.sub || '', sys: dirSys(f.sub) };
      }).filter(function (r) { return r.ext && !/^(txt|nfo|jpg|jpeg|png|gif|pdf|srm|state|sav|xml|dat|ini|cfg|db|url|html?)$/.test(r.ext); });
      var list = (MV.load('roms', []) || []).filter(function (r) { return !/^gdrive:/.test(r.path || ''); });
      MV.save('roms', list.concat(found));
      c.count = found.length; c.scanAt = Date.now(); setCfg(c);
      if (!quiet) MV.toast(found.length + ' juegos de Google Drive en tu biblioteca', 5000);
      if (MV.console && MV.console.isOpen && MV.console.isOpen() && MV.console.refresh) MV.console.refresh();
      else if (MV.rerender) MV.rerender();
      return found.length;
    }).catch(function (e) { if (!quiet) MV.toast(e.message, 7000); return 0; });
  }
  MV.driveScan = scan;

  // ---------- Jugar: partidas al día → descargar → jugar; al volver: subir partidas y borrar el juego ----------
  var session = null;
  MV.drivePlay = function (r) {
    if (!MV.driveOn()) { MV.toast('Conecta tu Google Drive en Juegos › Opciones'); return; }
    var box = MV.unzipBox || function () {};
    box({ name: 'Partidas de ' + (MV.romTitle ? MV.romTitle(r) : r.name) }, 0);
    MV.call('driveSync', []).catch(function () {}).then(function () {
      box(r, 0);
      return MV.call('driveFetch', [r.path.slice(7), r.name], function (p) { box(r, p); });
    }).then(function (local) {
      box(null);
      session = { at: Date.now(), name: r.name };
      MV.playRom(Object.assign({}, r, { path: local, orig: r.path, drive: 1 }));
    }).catch(function (e) { box(null); MV.toast(e.message || 'No se pudo bajar el juego de Drive', 7000); });
  };
  function afterGame() {
    if (!session || Date.now() - session.at < 8000) return;
    session = null;
    MV.toast('Guardando tu partida en Google Drive…', 3000);
    setTimeout(function () {
      MV.call('driveSync', []).then(function (r) {
        A.driveClear();
        MV.toast(r && r.up ? 'Partida guardada en Google Drive' : 'Listo: el juego se borró del equipo', 4000);
      }).catch(function (e) { A.driveClear(); MV.toast('No se pudo guardar la partida en Drive: ' + e.message, 7000); });
    }, 1500);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) afterGame(); });
  window.addEventListener('focus', afterGame);

  // ---------- Conectar y elegir la carpeta ----------
  MV.ACT.driveMenu = function () {
    var c = cfg(), on = MV.driveOn();
    MV.modal('<h2>Google Drive</h2><p class="muted">' + (on ? 'Conectado. Juegos de la carpeta “' + esc(c.folderName || '') + '”: ' + (c.count || 0) + '. Cada juego se descarga solo al jugarlo y se borra al cerrarlo; tus partidas se guardan en “MiVibra Partidas” de tu Drive para seguir en cualquier equipo.' :
      'Guarda tus juegos en una carpeta de tu Google Drive y juégalos aquí sin ocupar espacio: se descargan al jugar y se borran al cerrar. Tus partidas quedan en tu Drive para seguir desde cualquier equipo.') + '</p>' +
      '<div class="btns" style="flex-direction:column;align-items:stretch">' +
      (on ? '<button class="btn f" data-act="driveRescan" data-autofocus>🔄 Actualizar mis juegos</button><button class="btn ghost f" data-act="driveSyncNow">💾 Sincronizar partidas ahora</button><button class="btn ghost f" data-act="driveConnect">📁 Cambiar de carpeta</button><button class="btn ghost f" data-act="driveOff">Desconectar Drive</button>'
        : '<button class="btn f" data-act="driveConnect" data-autofocus>Conectar mi Google Drive</button>') +
      '<button class="btn ghost f" data-act="confirmNo">Cerrar</button></div>');
  };
  MV.ACT.driveConnect = function () {
    MV.closeModal(true);
    MV.toast('Abriendo tu cuenta de Google…', 3000);
    MV.call('driveConnect', []).then(function () { browse('', 'Mi unidad', []); })
      .catch(function (e) { if (e.message !== 'cancelado') MV.toast(e.message, 8000); });
  };
  /** Explorador de carpetas de Drive: entrar en una, subir, buscar por nombre o elegirla. */
  function browse(parent, name, trail, search) {
    MV.modal('<h2>Elige la carpeta de tus juegos</h2><p class="muted">Cargando…</p>');
    MV.call('driveFolders', [parent || '', search || '']).then(function (fs) {
      MV._drv = { parent: parent, name: name, trail: trail, fs: fs || [] };
      MV.closeModal(true);
      MV.modal('<h2>' + esc(search ? 'Resultados de “' + search + '”' : name) + '</h2><p class="muted">Entra a la carpeta donde guardas tus juegos y toca “Usar esta carpeta”.</p>' +
        '<div class="btns" style="flex-direction:column;align-items:stretch">' +
        (!search ? '<button class="btn f" data-act="drvUse"' + (parent ? ' data-autofocus' : '') + '>✔ Usar esta carpeta (' + esc(name) + ')</button>' : '') +
        '<div style="display:flex;gap:8px"><input class="in f" id="drvQ" placeholder="Buscar carpeta por nombre" autocomplete="off" style="flex:1"><button class="btn ghost f" data-act="drvFind">Buscar</button></div>' +
        '<div style="max-height:44vh;overflow:auto;display:flex;flex-direction:column;gap:8px">' +
        (MV._drv.fs.length ? MV._drv.fs.map(function (f, i) { return '<button class="btn ghost f" data-act="drvOpen" data-arg="' + i + '"' + (!parent && !search && !i ? ' data-autofocus' : '') + '>📁 ' + esc(f.name) + '</button>'; }).join('') : '<p class="muted">No hay carpetas aquí.</p>') +
        '</div>' + (trail.length || search ? '<button class="btn ghost f" data-act="drvUp">⬆ Volver</button>' : '') +
        '<button class="btn ghost f" data-act="confirmNo">Cancelar</button></div>');
    }).catch(function (e) { MV.closeModal(true); MV.toast(e.message, 8000); });
  }
  MV.ACT.drvOpen = function (i) { var d = MV._drv, f = d.fs[+i]; if (!f) return; MV.closeModal(true); browse(f.id, f.name, d.trail.concat([{ id: d.parent, name: d.name }])); };
  MV.ACT.drvUp = function () { var d = MV._drv, t = d.trail.slice(), up = t.pop() || { id: '', name: 'Mi unidad' }; MV.closeModal(true); browse(up.id, up.name, t); };
  MV.ACT.drvFind = function () { var q = ((document.getElementById('drvQ') || {}).value || '').trim(); if (!q) return; var d = MV._drv; MV.closeModal(true); browse('', d.name, d.trail.concat([{ id: d.parent, name: d.name }]), q); };
  MV.ACT.drvUse = function () {
    var d = MV._drv; MV.closeModal(true);
    var c = cfg(); c.folder = d.parent || 'root'; c.folderName = d.name || 'Mi unidad'; setCfg(c);
    scan(false).then(function () { MV.call('driveSync', []).catch(function () {}); });
  };
  MV.ACT.driveRescan = function () { MV.closeModal(true); scan(false); };
  MV.ACT.driveSyncNow = function () {
    MV.closeModal(true); MV.toast('Sincronizando partidas…');
    MV.call('driveSync', []).then(function (r) { MV.toast('Partidas al día · subidas ' + (r.up || 0) + ', bajadas ' + (r.down || 0), 5000); }).catch(function (e) { MV.toast(e.message, 7000); });
  };
  MV.ACT.driveOff = function () {
    MV.closeModal(true); A.driveDisconnect(); setCfg({});
    MV.save('roms', (MV.load('roms', []) || []).filter(function (r) { return !/^gdrive:/.test(r.path || ''); }));
    MV.toast('Google Drive desconectado'); if (MV.console && MV.console.refresh) MV.console.refresh();
  };
  // Al entrar a Juegos se revisa la carpeta (como mucho cada 10 minutos)
  MV.driveAuto = function () { var c = cfg(); if (MV.driveOn() && Date.now() - (c.scanAt || 0) > 600e3) scan(true); };
})();
