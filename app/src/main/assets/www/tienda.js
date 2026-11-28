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
  var CAT = null, catP = null, busy = {}, tab = 'tienda', catSel = 'Todos';

  function load(force) {
    if (catP && !force) return catP;
    catP = MV.getSmallJSON(BASE + 'tienda.json?t=' + Math.floor(Date.now() / 60000)).then(function (j) {
      CAT = (j && j.juegos) || []; MV.save('tiendaCat', CAT); return CAT;
    }).catch(function () { CAT = MV.load('tiendaCat', []) || []; return CAT; });
    return catP;
  }
  function byId(id) { return (CAT || MV.load('tiendaCat', []) || []).filter(function (g) { return g.id === id; })[0]; }
  function installed(g) { return !!ST.inst[g.id]; }
  function needsUpdate(g) { var i = ST.inst[g.id]; return !!(i && !i.remote && g.huella && i.huella !== g.huella); }
  function updates() { return (CAT || []).filter(needsUpdate); }
  function mb(b) { return b ? (b / 1048576 < 10 ? (b / 1048576).toFixed(1) : Math.round(b / 1048576)) + ' MB' : ''; }
  function media(p) { return /^https?:/.test(p || '') ? p : BASE + p; }

  // ---------- Descargar / actualizar / desinstalar ----------
  function install(g) {
    if (busy[g.id]) return Promise.resolve();
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
    var dl = Object.keys(ST.inst).filter(function (k) { return ST.inst[k].de === g.id; });
    var local = NATIVE && (g.archivos || []).every(function (f) { return ST.files[f.p]; });
    var url = (local ? LOCAL : BASE) + g.ruta + (dl.length ? '?dlc=' + dl.join(',') : '');
    if (MV.mvOpen) MV.mvOpen(url); else location.href = url;
  }
  MV.tienda = { updates: function () { return updates().length; }, newCount: function () { return (CAT || []).filter(function (g) { return g.tipo !== 'dlc' && !installed(g); }).length; }, load: load, installedGames: function () { return Object.keys(ST.inst).map(function (k) { var g = byId(k); return g && g.tipo !== 'dlc' ? g : null; }).filter(Boolean); }, dlcOf: function (id) { return Object.keys(ST.inst).filter(function (k) { return ST.inst[k].de === id; }).length; }, play: function (id) { var g = byId(id); if (g) play(g); } };

  // ---------- Dibujo ----------
  function state(g) { return busy[g.id] != null ? 'busy' : needsUpdate(g) ? 'upd' : installed(g) ? 'inst' : 'new'; }
  function btnHtml(g, big) {
    var st = state(g), cls = 'btn f' + (big ? '' : ' sm');
    if (st === 'busy') return '<div class="td-prog"><span>Descargando · ' + (busy[g.id] || 0) + ' %</span><i style="width:' + (busy[g.id] || 0) + '%"></i></div>';
    if (st === 'upd') return '<button class="' + cls + '" data-act="tdGet" data-arg="' + esc(g.id) + '">Actualizar</button>';
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
    return '<div class="td-card glass"><button class="td-img f" data-act="tdOpen" data-arg="' + esc(g.id) + '" aria-label="' + esc(g.nombre) + '">' +
      (g.portada ? '<img src="' + esc(media(g.portada)) + '" alt="" loading="lazy">' : '') + badge(g) + '</button>' +
      '<div class="td-body"><b>' + esc(g.nombre) + '</b><span class="muted">' + esc(g.corto || g.categoria || '') + '</span><div id="tdB-' + esc(g.id) + '">' + btnHtml(g) + '</div></div></div>';
  }
  function paint(g) {
    var el = document.getElementById('tdB-' + g.id); if (el) el.innerHTML = btnHtml(g);
    var m = document.getElementById('tdM-' + g.id); if (m) m.innerHTML = btnHtml(g, true);
  }
  function refresh() { if (MV.viewName && (MV.viewName() === 'tienda' || MV.viewName() === 'movimiento') && !MV.modalOpen()) MV.rerender(); }

  MV.VIEWS.tienda = function () {
    var all = (CAT || MV.load('tiendaCat', []) || []), games = all.filter(function (g) { return g.tipo !== 'dlc'; });
    var ups = updates(), mine = games.filter(installed);
    var tabs = [['tienda', 'Tienda'], ['mios', 'Mis juegos' + (mine.length ? ' · ' + mine.length : '')], ['upd', 'Actualizaciones' + (ups.length ? ' · ' + ups.length : '')]];
    var head = MV.topHtml('Tienda de juegos', '<span class="muted">Todos gratis · al descargarlos pasan a MiVibra Movimiento</span>') +
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
    var dlcs = (CAT || []).filter(function (d) { return d.tipo === 'dlc' && d.de === g.id; });
    var shots = (g.fotos || []).slice(0, 3).map(function (f) { return '<img src="' + esc(media(f)) + '" alt="" loading="lazy">'; }).join('');
    MV.modal('<div class="td-det">' +
      '<div class="td-det-media">' + (g.video ? '<video src="' + esc(media(g.video)) + '" poster="' + esc(media(g.portada)) + '" autoplay muted loop playsinline controls></video>' : '<img src="' + esc(media(g.portada)) + '" alt="">') + (shots ? '<div class="td-shots">' + shots + '</div>' : '') + '</div>' +
      '<div class="td-det-txt"><h2>' + esc(g.nombre) + '</h2><p class="muted">' + esc(g.descripcion || '') + '</p>' +
      '<div class="btns"><span id="tdM-' + esc(g.id) + '">' + btnHtml(g, true) + '</span>' +
      (installed(g) && NATIVE && ST.inst[g.id].remote ? '<button class="btn ghost f" data-act="tdGet" data-arg="' + esc(g.id) + '">Guardar para jugar sin internet' + (g.tamano ? ' · ' + mb(g.tamano) : '') + '</button>' : '') +
      (installed(g) ? '<button class="btn ghost f" data-act="tdDel" data-arg="' + esc(g.id) + '">Desinstalar</button>' : '') + '</div>' +
      ((g.controles || []).length ? '<h4>Cómo se juega</h4><div class="td-ctrls">' + g.controles.map(function (c) { return '<span>' + esc(CTRL[c] || c) + '</span>'; }).join('') + '</div>' : '') +
      (dlcs.length ? '<h4>Expansiones</h4>' + dlcs.map(function (d) { return '<div class="td-dlc"><div><b>' + esc(d.nombre) + '</b><br><span class="muted">' + esc(d.corto || '') + (d.tamano ? ' · ' + mb(d.tamano) : '') + '</span></div><span id="tdB-' + esc(d.id) + '">' + (installed(g) ? btnHtml(d) : '<span class="muted">Primero descarga el juego</span>') + '</span></div>'; }).join('') : '') +
      '<div class="td-facts">' + [['Jugadores', g.jugadores], ['Tamaño', mb(g.tamano)], ['Versión', g.version], ['Precio', 'Gratis'], ['Novedades', g.novedades]].filter(function (x) { return x[1]; }).map(function (x) { return '<div><span class="muted">' + x[0] + '</span><b>' + esc(x[1]) + '</b></div>'; }).join('') + '</div>' +
      (g.creditos ? '<p class="muted" style="font-size:13px;margin:0">' + esc(g.creditos) + '</p>' : '') +
      '<div class="btns"><button class="btn ghost f" data-act="closeModal">Cerrar</button></div></div></div>', { wide: true });
  }

  Object.assign(MV.ACT, {
    tdTab: function (t) { tab = t; MV.rerender(); },
    tdCat: function (c) { catSel = c; MV.rerender(); },
    tdOpen: function (id) { var g = byId(id); if (g) detail(g); },
    tdGet: function (id) { var g = byId(id); if (g) install(g); },
    tdUpdAll: function () { updates().reduce(function (p, g) { return p.then(function () { return install(g); }); }, Promise.resolve()); },
    tdPlay: function (id) { var g = byId(id); if (g) { if (MV.modalOpen()) MV.closeModal(true); play(g); } },
    tdDel: function (id) { var g = byId(id); if (!g) return; MV.confirm('¿Desinstalar ' + g.nombre + '?', 'Se borra de este equipo para liberar espacio. Lo puedes volver a descargar gratis cuando quieras.', 'Desinstalar').then(function (ok) { if (ok) { MV.closeModal(true); uninstall(g); } }); }
  });

  // Al abrir la app se revisa la tienda en segundo plano (para avisar de novedades y mostrar los juegos en Movimiento)
  load().then(function () { if (MV.viewName && MV.viewName() === 'movimiento' && !MV.modalOpen()) MV.rerender(); });
  setTimeout(function () { load().then(function () { var n = updates().length; if (n) MV.toast(n === 1 ? 'Hay novedades para ' + updates()[0].nombre + ' en la Tienda' : 'Hay ' + n + ' juegos con novedades en la Tienda', 4000); }); }, 8000);

  var css = document.createElement('style');
  css.textContent =
    '.td-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px}' +
    '.td-card{border-radius:22px;overflow:hidden;display:flex;flex-direction:column}' +
    '.td-img{position:relative;display:block;width:100%;aspect-ratio:16/10;padding:0;border:0;background:rgba(255,255,255,.05);cursor:pointer;border-radius:0}' +
    '.td-img img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.td-img:focus{outline:3px solid var(--accent);outline-offset:-3px}' +
    '.td-tag{position:absolute;left:10px;top:10px;padding:3px 10px;border-radius:999px;font:800 11px var(--ui);font-style:normal;letter-spacing:.04em}' +
    '.td-tag.nw{background:var(--accent);color:var(--on-accent)}.td-tag.ok{background:rgba(52,211,153,.22);color:#7CFF9D}.td-tag.up{background:rgba(47,125,246,.25);color:#9CC2FF}' +
    '.td-body{padding:12px 16px 16px;display:flex;flex-direction:column;gap:6px}.td-body b{font-size:17px}.td-body span{font-size:13px}' +
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
