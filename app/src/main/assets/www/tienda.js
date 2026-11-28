/* MiVibra TV · Tienda de juegos.
   La lista de juegos vive en la web (movimiento/tienda.json, la arma avatarpack.py al publicar): un juego nuevo o una
   expansión aparece aquí sin actualizar la app. Al descargar, los archivos del juego quedan en la memoria de la app
   (https://appassets.androidplatform.net/games/...) y funciona sin internet; luego aparece en MiVibra Movimiento.
   Si cambia algún archivo del juego (su "huella"), sale "Actualizar" solo para ese juego.
   Todos los juegos son gratis. Las expansiones (tipo "dlc") llevan "de" = id del juego y se cargan con ?dlc=a,b */
(function () {
  'use strict';
  var MV = window.MV;
  if (!MV || !MV.VIEWS) return;
  var BASE = 'https://simank19.github.io/mivibra-tv/movimiento/';
  var LOCAL = 'https://appassets.androidplatform.net/games/';
  var A = window.Android, NATIVE = !!(A && typeof A.gameGet === 'function');
  var esc = MV.esc || function (s) { return String(s); };
  var CTRL = { cel: 'Celular como mando', bt: 'Control Bluetooth', rem: 'Control remoto', tac: 'Táctil', cam: 'Con tu cuerpo (cámara)' };

  // ---------- Estado guardado ----------
  // inst: { id: { huella, version, files: [rutas], at } } · files: { ruta: huella del archivo }
  var ST = MV.load('tienda', null) || { inst: {}, files: {} };
  // Carreras RC ya estaba en Movimiento antes de la Tienda: queda puesto para todos (se juega desde la web);
  // en la app se puede descargar para jugar sin internet.
  if (!ST.v) { ST.v = 1; if (!ST.inst.rc) ST.inst.rc = { remote: true, files: [], at: Date.now(), tipo: 'juego' }; MV.save('tienda', ST); }
  function save() { MV.save('tienda', ST); }
  // ---------- Juegos que el superadministrador carga por enlace (app/config.tiendaExtra, los ven todos) ----------
  // formato: web (.zip con index.html o página .html) · rom (consolas) · apk (Android) · pc (.exe/.zip, MiVibra para PC)
  var HAS = !!(A && typeof A.storeGet === 'function'), DESK = !!(MV.device && MV.device.desktop);
  var FMT = { web: 'Juego web', rom: 'ROM de consola', apk: 'App Android', pc: 'Juego de PC' };
  function isAdmin() { return !!(MV.acct && MV.acct.isAdmin && MV.acct.isAdmin()); }
  function hash(t) { var h = 5381; t = String(t); for (var i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0; return h.toString(36); }
  function zipUrl(u) { return /\.zip([?#]|$)/i.test(u || ''); }
  function extraRaw() { var c = MV.acct && MV.acct.config; if (c && c.tiendaExtra) { MV.save('tiendaExtra', c.tiendaExtra); return c.tiendaExtra; } return MV.load('tiendaExtra', []) || []; }
  function avail(g) {
    var f = g.formato; if (!f) return true;
    if (DESK) return f === 'rom' || f === 'pc' || (f === 'web' && !zipUrl(g.url));
    if (HAS) return f !== 'pc';
    return f === 'web' && !zipUrl(g.url);
  }
  function extra() { return extraRaw().map(function (x) { return Object.assign({ tipo: 'juego' }, x, { ext: 1, huella: 'x' + hash(x.url + '|' + (x.version || '')) }); }).filter(function (g) { return isAdmin() || avail(g); }); }
  function hiddenIds() { var c = MV.acct && MV.acct.config; if (c && c.tiendaOcultos) { MV.save('tiendaOcultos', c.tiendaOcultos); return c.tiendaOcultos; } return MV.load('tiendaOcultos', []) || []; }
  function allCat() { var hid = hiddenIds(); return (CAT || MV.load('tiendaCat', []) || []).filter(function (g) { g._oculto = hid.indexOf(g.id) >= 0; return !g._oculto || isAdmin(); }).concat(extra()); }
  var CAT = null, catP = null, busy = {}, tab = 'tienda', catSel = 'Todos';

  function load(force) {
    if (catP && !force) return catP;
    catP = MV.getSmallJSON(BASE + 'tienda.json?t=' + Math.floor(Date.now() / 60000)).then(function (j) {
      CAT = (j && j.juegos) || []; MV.save('tiendaCat', CAT); return CAT;
    }).catch(function () { CAT = MV.load('tiendaCat', []) || []; return CAT; });
    return catP;
  }
  function byId(id) { return allCat().filter(function (g) { return g.id === id; })[0]; }
  function installed(g) { return !!ST.inst[g.id]; }
  function needsUpdate(g) { var i = ST.inst[g.id]; return !!(i && !i.remote && g.huella && i.huella !== g.huella); }
  function updates() { return allCat().filter(needsUpdate); }
  function mb(b) { return b ? (b / 1048576 < 10 ? (b / 1048576).toFixed(1) : Math.round(b / 1048576)) + ' MB' : ''; }
  function media(p) {
    p = p || ''; var m = p.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=download&)?id=)([\w-]{10,})/);
    if (m) return /\.(mp4|webm)|video/i.test(p) ? 'https://drive.usercontent.google.com/download?id=' + m[1] + '&export=download&confirm=t' : 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1280';
    if (/dropbox\.com\//.test(p)) return p.replace(/[?&](dl|raw)=\d/, '') + (p.indexOf('?') < 0 ? '?' : '&') + 'raw=1';
    return /^https?:/.test(p) ? p : BASE + p;
  }

  // ---------- Descargar / actualizar / desinstalar ----------
  function install(g) {
    if (busy[g.id]) return Promise.resolve();
    if (g.ext) return installExt(g);
    var todo = (g.archivos || []).filter(function (f) { return !NATIVE || ST.files[f.p] !== f.h; });
    var total = todo.reduce(function (a, f) { return a + (f.s || 0); }, 0) || 1, done = 0;
    busy[g.id] = 0; paint(g);
    var q = todo.slice(), fail = null;
    function worker() {
      var f = q.shift(); if (!f || fail) return Promise.resolve();
      if (!NATIVE) return worker();   // sin la app (navegador): se juega desde la web
      return MV.call('gameGet', [BASE + f.p + '?v=' + f.h, f.p]).then(function () {
        ST.files[f.p] = f.h; done += f.s || 0; busy[g.id] = Math.min(99, Math.round(done / total * 100)); paint(g);
      }, function (e) { fail = e; }).then(worker);
    }
    return Promise.all([worker(), worker(), worker()]).then(function () {
      if (fail) throw fail;
      ST.inst[g.id] = { huella: g.huella, version: g.version, files: (g.archivos || []).map(function (f) { return f.p; }), at: Date.now(), tipo: g.tipo, de: g.de || '' };
      save(); delete busy[g.id];
      MV.toast((g.tipo === 'dlc' ? 'Expansión lista: ' : 'Listo: ') + g.nombre + (g.tipo === 'dlc' ? '' : ' ya está en MiVibra Movimiento'), 3500);
      paint(g); refresh();
    }).catch(function (e) {
      save(); delete busy[g.id]; paint(g);
      MV.toast('No se pudo descargar ' + g.nombre + ': ' + ((e && e.message) || 'revisa tu conexión') + '. Lo bajado se guarda y sigue donde quedó.', 5000);
    });
  }
  function uninstall(g) {
    if (g.ext) { var i = ST.inst[g.id] || {}; delete ST.inst[g.id]; save(); try { if (HAS && A.storeDel) A.storeDel(g.id, i.path || ''); } catch (e) {}
      if (i.formato === 'rom' && MV.ACT.scanRoms) setTimeout(function () { MV.ACT.scanRoms(); }, 300);
      MV.toast(g.nombre + (i.formato === 'apk' ? ' se quitó de la Tienda (la app se desinstala desde los ajustes de Android)' : ' se desinstaló'), 3500); refresh(); return Promise.resolve(); }
    var mine = (ST.inst[g.id] || {}).files || [];
    // expansiones de este juego también se quitan
    Object.keys(ST.inst).forEach(function (k) { if (ST.inst[k].de === g.id) { mine = mine.concat(ST.inst[k].files || []); delete ST.inst[k]; } });
    delete ST.inst[g.id];
    var used = {}; Object.keys(ST.inst).forEach(function (k) { (ST.inst[k].files || []).forEach(function (p) { used[p] = 1; }); });
    var del = mine.filter(function (p, i, a) { return !used[p] && a.indexOf(p) === i; });
    save();
    return Promise.all(del.map(function (p) { delete ST.files[p]; return NATIVE ? MV.call('gameDel', [p]).catch(function () {}) : null; })).then(function () {
      save(); MV.toast(g.nombre + ' se desinstaló', 2500); refresh();
    });
  }
  /** Abre un juego de la tienda (desde la memoria si está descargado completo). */
  function play(g) {
    if (g.ext) return playExt(g);
    var dl = Object.keys(ST.inst).filter(function (k) { return ST.inst[k].de === g.id; });
    var local = NATIVE && (g.archivos || []).every(function (f) { return ST.files[f.p]; });
    var url = (local ? LOCAL : BASE) + g.ruta + (dl.length ? '?dlc=' + dl.join(',') : '');
    if (MV.mvOpen) MV.mvOpen(url); else location.href = url;
  }
  function installExt(g) {
    var f = g.formato;
    // juego web sin la app (o en el PC): se juega directo desde su página
    if (f === 'web' && (!HAS || DESK)) { ST.inst[g.id] = { ext: 1, formato: f, remote: true, huella: g.huella, at: Date.now(), tipo: 'juego' }; save(); MV.toast('Listo: ' + g.nombre + ' ya está en MiVibra Movimiento', 3500); paint(g); refresh(); return Promise.resolve(); }
    if (!HAS) { MV.toast('Este juego se descarga en la app de MiVibra (TV, celular o PC)', 4000); return Promise.resolve(); }
    busy[g.id] = 0; paint(g);
    var src = /mediafire\.com\//i.test(g.url) && MV.bookSrc ? MV.bookSrc({ url: g.url }) : Promise.resolve(g.url);
    return src.then(function (u) { return MV.call('storeGet', [JSON.stringify({ kind: f, url: u, gid: g.id, name: g.archivo || g.nombre })], function (p) { if (p >= 0) { busy[g.id] = Math.min(99, p); paint(g); } }); }).then(function (r) {
      r = r || {}; delete busy[g.id];
      ST.inst[g.id] = { ext: 1, formato: f, huella: g.huella, version: g.version, ruta: r.ruta || '', path: r.path || '', at: Date.now(), tipo: 'juego' }; save();
      if (f === 'rom' && g.sistema && r.path && MV.S && MV.S.prefs) { MV.S.prefs.romSystem = MV.S.prefs.romSystem || {}; MV.S.prefs.romSystem[r.path] = g.sistema; if (MV.savePrefs) MV.savePrefs(); }
      if (f === 'rom' && MV.ACT.scanRoms) setTimeout(function () { MV.ACT.scanRoms(); }, 300);
      MV.toast(f === 'apk' ? 'Sigue los pasos del instalador de Android para ' + g.nombre : 'Listo: ' + g.nombre + ' ya está en MiVibra Movimiento' + (f === 'rom' ? ' y en tus juegos de consolas' : ''), 4500);
      paint(g); refresh();
    }).catch(function (e) { delete busy[g.id]; paint(g); MV.toast('No se pudo descargar ' + g.nombre + ': ' + ((e && e.message) || 'revisa tu conexión'), 6000); });
  }
  function playExt(g) {
    var i = ST.inst[g.id] || {};
    if (g.formato === 'web') { var url = i.ruta ? LOCAL + i.ruta : media(g.url); if (MV.mvOpen) MV.mvOpen(url); else location.href = url; return; }
    if (g.formato === 'rom') { var n = (g.archivo || i.path || '').split(/[\\/]/).pop(); MV.playRom({ path: i.path, name: n || g.nombre, ext: (n.split('.').pop() || '').toLowerCase() }); return; }
    if (g.formato === 'pc') { if (!(A && A.storeOpen && A.storeOpen(i.path))) MV.toast('No se pudo abrir ' + g.nombre); return; }
    MV.toast(g.nombre + ' está instalada en Android: ábrela desde Juegos › Android', 4000);
  }
  MV.tienda = { updates: function () { return updates().length; }, newCount: function () { return allCat().filter(function (g) { return g.tipo !== 'dlc' && !installed(g); }).length; }, load: load, installedGames: function () { return Object.keys(ST.inst).map(function (k) { var g = byId(k); return g && g.tipo !== 'dlc' && g.formato !== 'apk' ? g : null; }).filter(Boolean); }, dlcOf: function (id) { return Object.keys(ST.inst).filter(function (k) { return ST.inst[k].de === id; }).length; }, play: function (id) { var g = byId(id); if (g) play(g); } };

  // ---------- Dibujo ----------
  function state(g) { return busy[g.id] != null ? 'busy' : needsUpdate(g) ? 'upd' : installed(g) ? 'inst' : 'new'; }
  function btnHtml(g, big) {
    var st = state(g), cls = 'btn f' + (big ? '' : ' sm');
    if (st === 'busy') return '<div class="td-prog"><span>Descargando · ' + (busy[g.id] || 0) + ' %</span><i style="width:' + (busy[g.id] || 0) + '%"></i></div>';
    if (st === 'upd') return '<button class="' + cls + '" data-act="tdGet" data-arg="' + esc(g.id) + '">Actualizar</button>';
    if (st === 'inst' && g.formato === 'apk') return '<span class="muted">Instalada en Android</span>';
    if (st === 'inst') return g.tipo === 'dlc' ? '<span class="muted">Instalada</span>' : '<button class="' + cls + '" data-act="tdPlay" data-arg="' + esc(g.id) + '">Jugar</button>';
    return '<button class="' + cls + '" data-act="tdGet" data-arg="' + esc(g.id) + '">Descargar' + (big && g.tamano ? ' · ' + mb(g.tamano) : '') + '</button>';
  }
  function badge(g) {
    var st = state(g);
    if (st === 'upd') return '<em class="td-tag up">Novedades</em>';
    if (st === 'inst') return '<em class="td-tag ok">Instalado</em>';
    if (g.nuevo !== false && (!g.fecha || Date.now() - Date.parse(g.fecha) < 30 * 864e5)) return '<em class="td-tag nw">Nuevo</em>';
    return '';
  }
  function card(g) {
    return '<div class="td-card glass' + (g.formato === 'rom' ? ' td-box' : '') + '"><button class="td-img f" data-act="tdOpen" data-arg="' + esc(g.id) + '" aria-label="' + esc(g.nombre) + '">' +
      (g.portada ? '<img src="' + esc(media(g.portada)) + '" alt="" loading="lazy">' : '') + badge(g) + '</button>' +
      '<div class="td-body">' + (isAdmin() ? '<button class="td-del f" data-act="tdRemove" data-arg="' + esc(g.id) + '" aria-label="Eliminar de la Tienda" title="Eliminar de la Tienda">✕</button>' : '') + '<b>' + esc(g.nombre) + (g._oculto ? ' <small class="muted">(oculto)</small>' : '') + '</b><span class="muted">' + esc((g.formato ? FMT[g.formato] + (g.ext && isAdmin() && !avail(g) ? ' · no disponible aquí' : '') + ' · ' : '') + (g.corto || g.categoria || '')) + '</span><div id="tdB-' + esc(g.id) + '">' + btnHtml(g) + '</div></div></div>';
  }
  function paint(g) {
    var el = document.getElementById('tdB-' + g.id); if (el) el.innerHTML = btnHtml(g);
    var m = document.getElementById('tdM-' + g.id); if (m) m.innerHTML = btnHtml(g, true);
  }
  function refresh() { if (MV.viewName && (MV.viewName() === 'tienda' || MV.viewName() === 'movimiento') && !MV.modalOpen()) MV.rerender(); }

  MV.VIEWS.tienda = function () {
    var all = allCat(), games = all.filter(function (g) { return g.tipo !== 'dlc'; });
    var ups = updates(), mine = games.filter(installed);
    var tabs = [['tienda', 'Tienda'], ['mios', 'Mis juegos' + (mine.length ? ' · ' + mine.length : '')], ['upd', 'Actualizaciones' + (ups.length ? ' · ' + ups.length : '')]];
    var head = MV.topHtml('Tienda de juegos', (isAdmin() ? '<button class="btn f sm" data-act="tdNew" style="margin:0 8px 0 0">Cargar juego</button><button class="btn ghost f sm" data-act="tdRomDir" style="margin:0 12px 0 0">Carpeta de ROMs</button>' : '') + '<span class="muted">Todos gratis · al descargarlos pasan a MiVibra Movimiento</span>') +
      '<div class="chips" style="margin-bottom:16px">' + tabs.map(function (t) { return '<button class="chip f' + (tab === t[0] ? ' on' : '') + '" data-act="tdTab" data-arg="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';
    if (!CAT && !games.length) return head + '<p class="muted">Cargando la tienda…</p>';
    if (tab === 'mios') return head + (mine.length ? '<div class="td-grid">' + mine.map(card).join('') + '</div>' + '<p class="muted" style="margin-top:14px">Para quitar un juego y liberar espacio, ábrelo y elige Desinstalar.</p>' : '<p class="muted">Aún no has descargado juegos de la tienda.</p>');
    if (tab === 'upd') return head + (ups.length ? '<div class="btns" style="margin-bottom:14px"><button class="btn f" data-act="tdUpdAll">Actualizar todo</button></div><div class="td-grid">' + ups.map(card).join('') + '</div>' : '<p class="muted">Todo está al día.</p>');
    var star = games.filter(function (g) { return g.destacado; })[0] || games[0];
    var cats = ['Todos'].concat(games.map(function (g) { return g.categoria; }).filter(function (c, i, a) { return c && a.indexOf(c) === i; }));
    var shown = games.filter(function (g) { return catSel === 'Todos' || g.categoria === catSel; });
    return head +
      (star ? '<div class="td-hero glass">' +
        '<div class="td-hero-media">' + (star.video ? '<video src="' + esc(media(star.video)) + '" poster="' + esc(media(star.portada)) + '" autoplay muted loop playsinline></video>' : '<img src="' + esc(media(star.portada)) + '" alt="">') + '</div>' +
        '<div class="td-hero-txt"><small>' + (state(star) === 'new' ? 'NUEVO EN LA TIENDA' : 'DESTACADO') + '</small><h2>' + esc(star.nombre) + '</h2><p class="muted">' + esc(star.descripcion || star.corto || '') + '</p>' +
        '<div class="td-ctrls">' + (star.controles || []).map(function (c) { return '<span>' + esc(CTRL[c] || c) + '</span>'; }).join('') + '</div>' +
        '<div class="btns"><span id="tdM-' + esc(star.id) + '">' + btnHtml(star, true) + '</span><button class="btn ghost f" data-act="tdOpen" data-arg="' + esc(star.id) + '">Ver detalles</button></div></div></div>' : '') +
      (cats.length > 2 ? '<div class="chips" style="margin:16px 0">' + cats.map(function (c) { return '<button class="chip f' + (catSel === c ? ' on' : '') + '" data-act="tdCat" data-arg="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div>' : '<div style="height:16px"></div>') +
      '<div class="td-grid">' + shown.map(card).join('') + '</div>';
  };
  MV.VIEWS.tienda.after = function () { if (!CAT) load().then(function () { if (MV.viewName() === 'tienda') MV.rerender(); }); };

  function detail(g) {
    var dlcs = allCat().filter(function (d) { return d.tipo === 'dlc' && d.de === g.id; });
    var fotos = g.fotos && g.fotos.length ? g.fotos : g.formato === 'rom' && /\/Named_Boxarts\//.test(g.portada || '') ? [g.portada.replace('/Named_Boxarts/', '/Named_Snaps/'), g.portada.replace('/Named_Boxarts/', '/Named_Titles/')] : [];
    var shots = fotos.slice(0, 3).map(function (f) { return '<img src="' + esc(media(f)) + '" alt="" loading="lazy">'; }).join('');
    MV.modal('<div class="td-det">' +
      '<div class="td-det-media' + (g.formato === 'rom' ? ' td-box' : '') + '">' + (g.video ? '<video src="' + esc(media(g.video)) + '" poster="' + esc(media(g.portada)) + '" autoplay muted loop playsinline controls></video>' : '<img src="' + esc(media(g.portada)) + '" alt="">') + (shots ? '<div class="td-shots">' + shots + '</div>' : '') + '</div>' +
      '<div class="td-det-txt"><h2>' + esc(g.nombre) + '</h2><p class="muted">' + esc(g.descripcion || '') + '</p>' +
      '<div class="btns"><span id="tdM-' + esc(g.id) + '">' + btnHtml(g, true) + '</span>' +
      (installed(g) && NATIVE && ST.inst[g.id].remote ? '<button class="btn ghost f" data-act="tdGet" data-arg="' + esc(g.id) + '">Guardar para jugar sin internet' + (g.tamano ? ' · ' + mb(g.tamano) : '') + '</button>' : '') +
      (installed(g) ? '<button class="btn ghost f" data-act="tdDel" data-arg="' + esc(g.id) + '">Desinstalar</button>' : '') + '</div>' +
      ((g.controles || []).length ? '<h4>Cómo se juega</h4><div class="td-ctrls">' + g.controles.map(function (c) { return '<span>' + esc(CTRL[c] || c) + '</span>'; }).join('') + '</div>' : '') +
      (dlcs.length ? '<h4>Expansiones</h4>' + dlcs.map(function (d) { return '<div class="td-dlc"><div><b>' + esc(d.nombre) + '</b><br><span class="muted">' + esc(d.corto || '') + (d.tamano ? ' · ' + mb(d.tamano) : '') + '</span></div><span id="tdB-' + esc(d.id) + '">' + (installed(g) ? btnHtml(d) : '<span class="muted">Primero descarga el juego</span>') + '</span></div>'; }).join('') : '') +
      '<div class="td-facts">' + [['Formato', g.formato ? FMT[g.formato] : ''], ['Jugadores', g.jugadores], ['Tamaño', mb(g.tamano)], ['Versión', g.version], ['Precio', 'Gratis'], ['Novedades', g.novedades]].filter(function (x) { return x[1]; }).map(function (x) { return '<div><span class="muted">' + x[0] + '</span><b>' + esc(x[1]) + '</b></div>'; }).join('') + '</div>' +
      (g.creditos ? '<p class="muted" style="font-size:13px;margin:0">' + esc(g.creditos) + '</p>' : '') +
      (isAdmin() ? '<div class="btns">' + (g.ext ? '<button class="btn ghost f" data-act="tdEdit" data-arg="' + esc(g.id) + '">Editar</button>' : '') + '<button class="btn ghost f" data-act="tdRemove" data-arg="' + esc(g.id) + '">' + (g.ext ? 'Eliminar de la Tienda' : g._oculto ? 'Volver a mostrar' : 'Ocultar de la Tienda') + '</button></div>' : '') +
      '<div class="btns"><button class="btn ghost f" data-act="closeModal">Cerrar</button></div></div></div>', { wide: true });
  }

  // ---------- Cargar un juego (solo el superadministrador) ----------
  var F = null;
  var FIELDS = [['nombre', 'Nombre del juego', 'Ej: Súper Bloques'], ['url', 'Enlace del juego', 'Google Drive, MEGA, Dropbox, GitHub o enlace directo'], ['archivo', 'Nombre del archivo (con su extensión)', 'Ej: Mario World.sfc · solo para ROM y PC'],
    ['portada', 'Enlace de la portada (imagen)', 'Imagen 16:9 · Drive o enlace directo'], ['video', 'Enlace del video corto (opcional)', '.mp4 de unos segundos'], ['fotos', 'Enlaces de fotos (opcional, separados por coma)', ''],
    ['corto', 'Frase corta', 'Ej: Plataformas clásico para 2 jugadores'], ['descripcion', 'Descripción', ''], ['categoria', 'Categoría', 'Ej: Carreras, Deportes, Aventura'], ['jugadores', 'Jugadores', 'Ej: 1 a 4'],
    ['version', 'Versión', '1.0'], ['tamanoMb', 'Tamaño en MB (opcional)', ''], ['novedades', 'Novedades de esta versión', ''], ['creditos', 'Créditos y licencia', 'Autor y licencia del juego']];
  var ROM_SKIP = ['video', 'fotos', 'corto', 'descripcion', 'categoria', 'jugadores', 'tamanoMb', 'novedades', 'creditos'];
  function sysList() { return ((window.MVD && MVD.SYSTEMS) || []).filter(function (x) { return x.thumbs && !x.port; }); }
  function sysOf(id) { return sysList().filter(function (x) { return x.id === id; })[0]; }
  function boxart(x, n) { return 'https://thumbnails.libretro.com/' + encodeURIComponent(x.thumbs) + '/' + 'Named_Boxarts/' + encodeURIComponent(n.replace(/[&*\/:`<>?\\|"]/g, '_')) + '.png'; }
  /** Carátula, fotos y ficha (Wikipedia/Wikidata) de una ROM, como en Juegos. */
  function romInfo(g) {
    var x = sysOf(g.sistema); if (!x) return Promise.resolve(g);
    var r = { path: 'tienda:' + (g.id || g.nombre), name: g.archivo || g.nombre };
    var cov = MV.findCover ? MV.findCover(r, x, g.nombre).catch(function () { return null; }) : Promise.resolve(null);
    var meta = MV.scrapeGame ? MV.scrapeGame(Object.assign({}, r, { name: g.nombre }), x, true).catch(function () { return null; }) : Promise.resolve(null);
    return Promise.all([cov, meta]).then(function (res) {
      var c = res[0], m = res[1] || {};
      if (c && c.n) { if (!g.portada) g.portada = boxart(x, c.n);
}
      if (!m.none) {
        if (!g.descripcion && m.desc) g.descripcion = m.desc;
        if (!g.corto) g.corto = [x.name, m.year, m.genre].filter(Boolean).join(' · ');
        if (!g.categoria && m.genre) g.categoria = cap1(String(m.genre).split(',')[0]);
        if (!g.creditos && (m.dev || m.pub)) g.creditos = [m.dev ? 'Desarrollo: ' + m.dev : '', m.pub ? 'Editor: ' + m.pub : ''].filter(Boolean).join(' · ');
        if (!g.jugadores && m.modes) g.jugadores = m.modes;
      }
      if (!g.corto) g.corto = x.name;
      return g;
    });
  }
  function cap1(t) { t = String(t || '').trim(); return t.charAt(0).toUpperCase() + t.slice(1); }
  function readForm() { FIELDS.forEach(function (f) { var el = document.getElementById('tdf-' + f[0]); if (el) F[f[0]] = el.value.trim(); }); var d = document.getElementById('tdf-dest'); if (d) F.destacado = d.checked; }
  function form(g) {
    if (g !== undefined) F = g ? JSON.parse(JSON.stringify(g)) : { formato: 'web', controles: ['rem', 'tac'], jugadores: '1', version: '1.0' };
    if (F.tamano && !F.tamanoMb) F.tamanoMb = String(Math.round(F.tamano / 1048576)); if (Array.isArray(F.fotos)) F.fotos = F.fotos.join(', ');
    var ch = function (act, k, lbl, on) { return '<button class="chip f' + (on ? ' on' : '') + '" data-act="' + act + '" data-arg="' + k + '">' + lbl + '</button>'; };
    MV.modal('<h2>' + (F.id ? 'Editar juego' : 'Cargar juego a la Tienda') + '</h2><p class="muted">Lo verán todos los usuarios. Comparte el archivo como público (cualquiera con el enlace).</p>' +
      '<h4 style="margin:6px 0">Formato</h4><div class="chips">' + Object.keys(FMT).map(function (k) { return ch('tdFmt', k, FMT[k], F.formato === k); }).join('') + '</div>' +
      '<p class="muted" style="font-size:13px">' + ({ web: 'Un .zip con index.html adentro (o el enlace a la página del juego). Se juega dentro de MiVibra y pasa a MiVibra Movimiento.', rom: 'La ROM (.sfc, .gba, .zip, .7z…): se baja a tus juegos de consolas y se abre con los emuladores.', apk: 'La APK: se baja y Android pide instalarla. Solo en TV y celulares Android.', pc: 'Un .exe o un .zip/.7z con el juego: solo en MiVibra para PC.' })[F.formato] + '</p>' +
      (F.formato === 'rom' ? '<h4 style="margin:10px 0 6px">Consola</h4><div class="chips" style="flex-wrap:wrap;overflow:visible">' + sysList().map(function (x) { return ch('tdSys', x.id, x.name, F.sistema === x.id); }).join('') + '</div>' +
        '<p class="muted" style="font-size:13px">Solo escribe el nombre del juego: la carátula, las fotos, la descripción, el año y el género se buscan solos al publicar.</p>' : '') +
      FIELDS.map(function (f) { if (f[0] === 'archivo' && F.formato !== 'rom' && F.formato !== 'pc') return ''; if (F.formato === 'rom' && ROM_SKIP.indexOf(f[0]) >= 0) return ''; var v = esc(F[f[0]] || '');
        return '<label class="muted" style="display:block;margin:10px 0 4px;font-size:13px">' + f[1] + '</label>' + (f[0] === 'descripcion' ? '<textarea class="in f" id="tdf-' + f[0] + '" rows="3" placeholder="' + esc(f[2]) + '">' + v + '</textarea>' : '<input class="in f" id="tdf-' + f[0] + '" value="' + v + '" placeholder="' + esc(f[2]) + '">'); }).join('') +
      '<h4 style="margin:12px 0 6px">Cómo se juega</h4><div class="chips">' + Object.keys(CTRL).map(function (k) { return ch('tdCtl', k, CTRL[k], (F.controles || []).indexOf(k) >= 0); }).join('') + '</div>' +
      '<label style="display:flex;gap:10px;align-items:center;margin:14px 0"><input type="checkbox" id="tdf-dest"' + (F.destacado ? ' checked' : '') + '> Destacarlo al abrir la Tienda</label>' +
      '<div class="btns"><button class="btn f" data-act="tdSave">' + (F.id ? 'Guardar cambios' : 'Publicar en la Tienda') + '</button><button class="btn ghost f" data-act="closeModal">Cancelar</button></div>');
  }
  function publish(list, msg) {
    if (!MV.acct || !MV.acct.push) { MV.toast('Inicia sesión con la cuenta de superadministrador'); return Promise.resolve(); }
    return MV.acct.push({ tiendaExtra: list }).then(function () {
      if (MV.acct.pushError) return;
      if (MV.acct.config) MV.acct.config.tiendaExtra = list; MV.save('tiendaExtra', list); MV.toast(msg, 3500); MV.rerender();
    });
  }
  function saveForm() {
    readForm(); var g = F;
    if (!g.nombre || !/^https?:\/\//.test(g.url || '')) return MV.toast('Escribe el nombre y un enlace que empiece por https://', 4000);
    if ((g.formato === 'rom' || g.formato === 'pc') && !/\.[a-z0-9]{2,4}$/i.test(g.archivo || '')) {
      var tail = decodeURIComponent((g.url.split('?')[0].split('/').pop()) || ''); if (/\.[a-z0-9]{2,4}$/i.test(tail)) g.archivo = tail; else return MV.toast('Escribe el nombre del archivo con su extensión (ej: Juego.sfc)', 4500);
    }
    var slug = String(g.nombre).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 30);
    var out = { id: g.id || ('u-' + slug + '-' + Date.now().toString(36)), formato: g.formato, nombre: g.nombre, url: g.url,
      archivo: g.archivo || '', portada: g.portada || '', video: g.video || '', fotos: String(g.fotos || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 6),
      corto: g.corto || '', descripcion: g.descripcion || '', categoria: g.categoria || '', jugadores: g.jugadores || '', controles: g.controles || [], version: g.version || '1.0',
      tamano: g.tamanoMb ? Math.round(parseFloat(g.tamanoMb) * 1048576) || 0 : 0, novedades: g.novedades || '', creditos: g.creditos || '', destacado: !!g.destacado, fecha: g.fecha || new Date().toISOString().slice(0, 10), at: Date.now() };
    var list = extraRaw().filter(function (x) { return x.id !== out.id; }); list.unshift(out);
    if (out.formato === 'rom') {
      out.sistema = g.sistema || '';
      if (!out.sistema) return MV.toast('Elige la consola del juego', 3500);
      var btn = document.querySelector('[data-act="tdSave"]'); if (btn) { btn.disabled = true; btn.textContent = 'Buscando carátula e información…'; }
      return romInfo(out).then(function (o) { MV.closeModal(true); list[0] = o; publish(list, (g.id ? 'Cambios publicados: ' : 'Publicado en la Tienda: ') + o.nombre + (o.portada ? '' : ' (no encontré la carátula; puedes poner una a mano)')); });
    }
    MV.closeModal(true); publish(list, (g.id ? 'Cambios publicados: ' : 'Publicado en la Tienda: ') + out.nombre);
  }

  // ---------- Publicar una carpeta de ROMs (Drive, MEGA o MediaFire): cada juego con su carátula e información ----------
  var RD = { sys: '', busy: false };
  function romDirForm() {
    MV.modal('<h2>Carpeta de ROMs</h2><p class="muted">Pega el enlace de una carpeta compartida como pública. MiVibra trae todas las ROMs de adentro (también las comprimidas en .zip, .7z o .rar y las de las subcarpetas) y busca sola la carátula y la información de cada juego.</p>' +
      '<h4 style="margin:10px 0 6px">Consola</h4><div class="chips" style="flex-wrap:wrap;overflow:visible">' + sysList().map(function (x) { return '<button class="chip f' + (RD.sys === x.id ? ' on' : '') + '" data-act="tdRdSys" data-arg="' + x.id + '">' + x.name + '</button>'; }).join('') + '</div>' +
      '<label class="muted" style="display:block;margin:10px 0 4px;font-size:13px">Enlace de la carpeta</label><input class="in f" id="tdrd-url" placeholder="https://drive.google.com/drive/folders/…">' +
      '<label class="muted" style="display:block;margin:10px 0 4px;font-size:13px">Créditos y licencia</label><input class="in f" id="tdrd-cred" placeholder="Ej: Homebrew con permiso del autor">' +
      '<p id="tdrd-msg" class="muted" style="min-height:22px;margin:12px 0 0"></p>' +
      '<div class="btns"><button class="btn f" data-act="tdRdGo" id="tdrd-go">Buscar juegos y publicar</button><button class="btn ghost f" data-act="closeModal">Cancelar</button></div>');
  }
  function romDirGo() {
    if (RD.busy) return;
    var msg = function (t) { var e = document.getElementById('tdrd-msg'); if (e) e.textContent = t; }, v = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; };
    var url = v('tdrd-url'), cred = v('tdrd-cred'), x = sysOf(RD.sys);
    if (!x) return msg('Elige la consola de los juegos.');
    if (!/^https?:\/\//.test(url)) return msg('Pega el enlace de la carpeta (empieza por https://).');
    if (!MV.cloudFiles) return msg('Actualiza la app para usar esta opción.');
    var exts = (x.exts || []).concat(['zip', '7z', 'rar']).filter(function (e, i, a) { return a.indexOf(e) === i; });
    var re = new RegExp('\\.(' + exts.join('|') + ')$', 'i');
    RD.busy = true; var go = document.getElementById('tdrd-go'); if (go) go.disabled = true; msg('Leyendo la carpeta…');
    MV.cloudFiles(url, re).then(function (files) {
      files = (files || []).filter(function (f) { return f.url; });
      // .bin con su .cue: se publica solo el .cue (los .bin sueltos de PlayStation no abren solos)
      var cues = {}; files.forEach(function (f) { if (/\.cue$/i.test(f.file || '')) cues[String(f.file).replace(/\.cue$/i, '').toLowerCase()] = 1; });
      files = files.filter(function (f) { return !(/\.bin$/i.test(f.file || '') && cues[String(f.file).replace(/\.bin$/i, '').replace(/ \(track \d+\)$/i, '').toLowerCase()]); });
      if (!files.length) throw new Error('No encontré juegos de ' + x.name + ' en esa carpeta (¿está compartida como pública?)');
      var have = {}; extraRaw().forEach(function (g) { have[g.url] = 1; });
      files = files.filter(function (f) { return !have[f.url]; });
      if (!files.length) throw new Error('Todos los juegos de esa carpeta ya están en la Tienda');
      if (files.length > 400) { msg('Son ' + files.length + ' juegos: publico los primeros 400 y luego vuelves a publicar la carpeta para el resto.'); files = files.slice(0, 400); }
      var out = [], i = 0, done = 0, stamp = Date.now();
      function one() {
        var f = files[i++]; if (!f) return Promise.resolve();
        var file = f.file || f.title, name = (MV.cleanRomName ? MV.cleanRomName(file) : file.replace(/\.[^.]+$/, '')) || file;
        var g = { id: 'u-' + (stamp + out.length * 7 + i).toString(36), formato: 'rom', sistema: x.id, nombre: name, url: f.url, archivo: file, portada: '', fotos: [], corto: '', descripcion: '', categoria: '', jugadores: '', controles: ['rem', 'bt', 'cel'], version: '1.0', tamano: 0, novedades: '', creditos: cred, destacado: false, fecha: new Date().toISOString().slice(0, 10), at: Date.now() };
        return romInfo(g).catch(function () { return g; }).then(function (r) {
          r.descripcion = String(r.descripcion || '').slice(0, 300); if (/Named_Boxarts/.test(r.portada || '')) { r.nombre = r.nombre || name; }
          out.push(r); done++; msg('Buscando carátulas e información: ' + done + ' de ' + files.length + '…');
        }).then(one);
      }
      return Promise.all([one(), one()]).then(function () { return out; });
    }).then(function (out) {
      var list = out.concat(extraRaw());
      if (JSON.stringify(list).length > 600000) throw new Error('Son demasiados juegos para guardarlos juntos. Publica carpetas más pequeñas.');
      RD.busy = false; MV.closeModal(true); publish(list, out.length + (out.length === 1 ? ' juego publicado' : ' juegos publicados') + ' en la Tienda');
    }).catch(function (e) { RD.busy = false; if (go) go.disabled = false; msg(e.message || 'No se pudo leer la carpeta'); });
  }

  Object.assign(MV.ACT, {
    tdTab: function (t) { tab = t; MV.rerender(); },
    tdNew: function () { form(null); },
    tdRomDir: function () { romDirForm(); },
    tdRdSys: function (k, el) { RD.sys = k; var p = el && el.parentNode; if (p) [].forEach.call(p.children, function (c) { c.classList.toggle('on', c === el); }); },
    tdRdGo: function () { romDirGo(); },
    tdEdit: function (id) { var g = extraRaw().filter(function (x) { return x.id === id; })[0]; if (g) { MV.closeModal(true); form(g); } },
    tdRemove: function (id) {
      var g = byId(id); if (!g) return;
      if (!g.ext) {   // juegos de MiVibra: se ocultan para todos (se pueden volver a mostrar)
        var hid = hiddenIds().slice(), on = hid.indexOf(id) >= 0;
        return MV.confirm((on ? '¿Volver a mostrar ' : '¿Ocultar ') + g.nombre + ' en la Tienda?', on ? 'Aparece otra vez para todos.' : 'Deja de aparecer para todos. A quien ya lo descargó le sigue funcionando.', on ? 'Mostrar' : 'Ocultar').then(function (ok) {
          if (!ok) return; MV.closeModal(true); if (on) hid.splice(hid.indexOf(id), 1); else hid.push(id);
          MV.acct.push({ tiendaOcultos: hid }).then(function () { if (MV.acct.pushError) return; if (MV.acct.config) MV.acct.config.tiendaOcultos = hid; MV.save('tiendaOcultos', hid); MV.toast(g.nombre + (on ? ' vuelve a aparecer en la Tienda' : ' quedó oculto para todos'), 3500); MV.rerender(); });
        });
      }
      MV.confirm('¿Eliminar ' + g.nombre + ' de la Tienda?', 'Deja de aparecer para todos. A quien ya lo descargó le sigue funcionando.', 'Eliminar').then(function (ok) { if (ok) { MV.closeModal(true); publish(extraRaw().filter(function (x) { return x.id !== id; }), g.nombre + ' se eliminó de la Tienda'); } });
    },
    tdFmt: function (k) { readForm(); F.formato = k; MV.closeModal(true); form(); },
    tdSys: function (k) { readForm(); F.sistema = k; MV.closeModal(true); form(); },
    tdCtl: function (k, el) { var c = F.controles || (F.controles = []), i = c.indexOf(k); if (i >= 0) c.splice(i, 1); else c.push(k); if (el) el.classList.toggle('on', i < 0); },
    tdSave: function () { saveForm(); },
    tdCat: function (c) { catSel = c; MV.rerender(); },
    tdOpen: function (id) { var g = byId(id); if (g) detail(g); },
    tdGet: function (id) { var g = byId(id); if (g) install(g); },
    tdUpdAll: function () { updates().reduce(function (p, g) { return p.then(function () { return install(g); }); }, Promise.resolve()); },
    tdPlay: function (id) { var g = byId(id); if (g) { if (MV.modalOpen()) MV.closeModal(true); play(g); } },
    tdDel: function (id) { var g = byId(id); if (!g) return; MV.confirm('¿Desinstalar ' + g.nombre + '?', 'Se borra de este equipo para liberar espacio. Lo puedes volver a descargar gratis cuando quieras.', 'Desinstalar').then(function (ok) { if (ok) { MV.closeModal(true); uninstall(g); } }); }
  });

  if (MV.on) MV.on('acct', function () { if (MV.viewName && (MV.viewName() === 'tienda' || MV.viewName() === 'movimiento') && !MV.modalOpen()) MV.rerender(); });
  // Al abrir la app se revisa la tienda en segundo plano (para avisar de novedades y mostrar los juegos en Movimiento)
  load().then(function () { if (MV.viewName && MV.viewName() === 'movimiento' && !MV.modalOpen()) MV.rerender(); });
  setTimeout(function () { load().then(function () { var n = updates().length; if (n) MV.toast(n === 1 ? 'Hay novedades para ' + updates()[0].nombre + ' en la Tienda' : 'Hay ' + n + ' juegos con novedades en la Tienda', 4000); }); }, 8000);

  var css = document.createElement('style');
  css.textContent =
    '.td-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px}' +
    '.td-card{border-radius:22px;overflow:hidden;display:flex;flex-direction:column}' +
    '.td-img{position:relative;display:block;width:100%;aspect-ratio:16/10;padding:0;border:0;background:rgba(255,255,255,.05);cursor:pointer;border-radius:0}' +
    '.td-img img{width:100%;height:100%;object-fit:cover;display:block}.td-box .td-img img,.td-box.td-det-media>img{object-fit:contain;background:rgba(0,0,0,.25)}' +
    '.td-img:focus{outline:3px solid var(--accent);outline-offset:-3px}' +
    '.td-tag{position:absolute;left:10px;top:10px;padding:3px 10px;border-radius:999px;font:800 11px var(--ui);font-style:normal;letter-spacing:.04em}' +
    '.td-tag.nw{background:var(--accent);color:var(--on-accent)}.td-tag.ok{background:rgba(52,211,153,.22);color:#7CFF9D}.td-tag.up{background:rgba(47,125,246,.25);color:#9CC2FF}' +
    '.td-body{position:relative;padding:12px 16px 16px;display:flex;flex-direction:column;gap:6px}.td-del{position:absolute;right:12px;top:10px;width:36px;height:36px;border-radius:50%;border:1px solid var(--line);background:var(--glass);color:var(--text);font-size:14px}.td-del:focus{outline:3px solid var(--accent)}.td-body b{padding-right:40px}.td-body b{font-size:17px}.td-body span{font-size:13px}' +
    '.btn.sm{height:38px;padding:0 16px;font-size:14px;margin-top:4px}' +
    '.td-prog{display:flex;flex-direction:column;gap:6px;margin-top:6px;min-width:150px}.td-prog span{font:700 13px var(--ui);opacity:.85}.td-prog i{display:block;height:8px;border-radius:9px;background:var(--accent);box-shadow:0 0 0 999px rgba(255,255,255,.08) inset}' +
    '.td-hero{display:grid;grid-template-columns:1.25fr 1fr;border-radius:28px;overflow:hidden}.td-hero-media{min-height:280px;background:#000}.td-hero-media video,.td-hero-media img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.td-hero-txt{padding:28px 30px;display:flex;flex-direction:column;gap:10px;justify-content:center}.td-hero-txt small{letter-spacing:.18em;font-weight:800;font-size:12px;color:var(--accent-text,var(--accent))}.td-hero-txt h2{margin:0;font-size:36px}.td-hero-txt p{margin:0;max-width:560px}' +
    '.td-ctrls{display:flex;flex-wrap:wrap;gap:8px}.td-ctrls span{padding:5px 12px;border-radius:999px;background:var(--glass);border:1px solid var(--line);font:600 12px var(--ui)}' +
    '@media (max-width:820px){.td-hero{grid-template-columns:1fr}.td-hero-media{min-height:0;aspect-ratio:16/9}.td-hero-txt{padding:18px}.td-hero-txt h2{font-size:28px}}' +
    '.td-det{display:grid;grid-template-columns:1.1fr 1fr;gap:24px;max-width:1100px}.td-det-media video,.td-det-media>img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:18px;background:#000;display:block}' +
    '.td-shots{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:8px}.td-shots img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:10px}' +
    '.td-det-txt{display:flex;flex-direction:column;gap:12px}.td-det-txt h2{margin:0;font-size:32px}.td-det-txt h4{margin:6px 0 0;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent-text,var(--accent))}' +
    '.td-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.td-facts div{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border-radius:14px;background:var(--glass);border:1px solid var(--line)}.td-facts span{font-size:12px}' +
    '.td-dlc{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:14px;background:var(--glass);border:1px solid var(--line)}' +
    '.dialog:has(.td-det){max-width:1160px!important;width:min(1160px,94vw)!important}' +
    '@media (max-width:820px){.td-det{grid-template-columns:1fr}}';
  document.head.appendChild(css);
})();
