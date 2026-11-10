/* MiVibra TV — Modo consola para Juegos (diseño propio de MiVibra).
   Inicio: portadas grandes en una fila y accesos redondos abajo. Biblioteca: una estantería por consola.
   Usa las mismas funciones de la sección Juegos (MV.playRom, MV.ACT.scanRoms, importBios…). */
(function () {
  'use strict';
  var MV = window.MV, A = window.Android || null;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var box = null, tab = 'home', clockT = null, watchT = null, lastCount = -1, sound = true;
  function systems() { return (window.MVD || {}).SYSTEMS || []; }

  // ---------------- Datos ----------------
  function roms() {
    var list = (MV.load('roms', []) || []).filter(function (r) { return MV.isGame ? MV.isGame(r) : true; });
    list = list.filter(function (r) { return r.ext !== 'exe' || /doukutsu\.exe$/i.test(r.name); }).filter(function (r) { return r.ext !== 'pak' || /^pak0\.pak$/i.test(r.name); });
    // El mismo juego repetido (enviado dos veces, o en .zip y suelto) sale una sola vez
    var seen = {};
    return list.filter(function (r) {
      var s = MV.romSystem(r), k = title(r).toLowerCase() + '|' + (s ? s.id : '?');
      if (seen[k]) return false; seen[k] = 1; return true;
    });
  }
  function title(r) { var nt = MV.romTitle && MV.romTitle(r); if (nt) return nt;
    return String(r.name || '').replace(/\.[^.]+$/, '').replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '').replace(/_/g, ' ').trim() || r.name; }
  // Portadas de la base pública de libretro (por nombre No-Intro / Redump del archivo)
  function thumb(r, s) {
    if (!s || !s.thumbs) return '';
    var n = ((MV.coverName && MV.coverName(r)) || String(r.name || '').replace(/\.[^.]+$/, '')).replace(/[&*\/:`<>?\\|"]/g, '_');
    return 'https://thumbnails.libretro.com/' + encodeURIComponent(s.thumbs) + '/Named_Boxarts/' + encodeURIComponent(n) + '.png';
  }
  function cover(r, s, cls) {
    var c = s ? s.color : '#6B7280', t = thumb(r, s);
    return '<span class="cv ' + (cls || '') + '" style="--c:' + c + '"><i class="mono">' + (MV.sysIcon ? MV.sysIcon(s ? s.id : '?') : esc(s ? s.mono : '?')) + '</i><b class="nm">' + esc(title(r)) + '</b>' +
      (t ? '<img loading="lazy" src="' + esc(t) + '" alt="" onload="this.parentNode.classList.add(\'art\')" onerror="this.remove()">' : '') + '</span>';
  }
  var reg = {};
  var delMode = false, editMode = false;
  function tile(r, big) {
    var s = MV.romSystem(r), k = 'g' + Object.keys(reg).length; reg[k] = r;
    var eng = s ? MV.gameEngine(s) : '';
    return '<button class="cf ctile' + (big ? ' big' : '') + (delMode ? ' cdel' : editMode ? ' cedit' : '') + '" data-rom="' + k + '" data-title="' + esc(title(r)) + '" data-sys="' + esc(s ? s.name : 'Elegir sistema') + (eng === 'retroarch' ? ' · RetroArch' : '') + '">' + cover(r, s) + '</button>';
  }

  // ---------------- Pantallas ----------------
  function topBar() {
    var p = MV.profile && MV.profile(), pads = [];
    try { pads = A ? JSON.parse(A.gamepads()) : []; } catch (e) {}
    return '<header class="ctop"><div class="cme">' + (p ? '<img src="' + esc(MV.avatarOf(p.avatar)) + '" alt=""><b>' + esc(p.name) + '</b>' : '<b>Juegos</b>') + '</div>' +
      '<nav class="ctabs"><span class="' + (tab === 'home' ? 'on' : '') + '">Inicio</span><span class="' + (tab === 'lib' ? 'on' : '') + '">Biblioteca</span></nav>' +
      '<div class="cstat"><span class="cver">v' + esc((MV.device && MV.device.versionCode) || '') + '</span><span class="cpad" title="Mandos">' + PAD + (pads.length || '') + '</span><span id="cclock"></span></div></header>';
  }
  var PAD = '<svg viewBox="0 0 24 24" width="1.3em" height="1.3em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M7 8h10a4 4 0 0 1 4 4v2.5a2.5 2.5 0 0 1-4.6 1.4L15 14H9l-1.4 1.9A2.5 2.5 0 0 1 3 14.5V12a4 4 0 0 1 4-4z"/><path d="M8 11v3M6.5 12.5h3"/></svg>';
  var IC = {
    lib: '<path d="M4 4h4v16H4zM10 4h4v16h-4zM16 5l3.5-1 3 15-3.5 1z"/>',
    usb: '<path d="M12 2v14M8 6l4-4 4 4M7 11v3l5 3 5-3v-3"/><circle cx="12" cy="20" r="2"/>',
    bios: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6v6H9zM9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/>',
    engine: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    send: '<rect x="2" y="3" width="8" height="15" rx="1.5"/><path d="M5.5 15h1M13 10h8M18 7l3 3-3 3M14 21h7a1 1 0 0 0 1-1v-4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
    exit: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>'
  };
  function ic(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + IC[n] + '</svg>'; }
  function round(act, icon, label) { return '<button class="cf cround" data-act="' + act + '" data-title="' + esc(label) + '"><span>' + ic(icon) + '</span><em>' + esc(label) + '</em></button>'; }

  function homeHtml() {
    var all = roms(), rec = (MV.load('recentGames', []) || []).filter(function (r) { return all.some(function (x) { return x.path === r.path; }); });
    var seen = {}, list = [];
    rec.forEach(function (r) { if (!seen[r.path] && list.length < 12) { seen[r.path] = 1; list.push(r); } });
    var recLabel = list.length ? 'Jugados recientemente' : 'Tus juegos';
    if (!list.length) list = all.slice().sort(function (a, b) { return title(a).localeCompare(title(b)); }).slice(0, 12);
    // Consolas con juegos: una tarjeta por consola
    var by = {}; all.forEach(function (r) { var s = MV.romSystem(r); var id = s ? s.id : '?'; by[id] = (by[id] || 0) + 1; });
    var cons = systems().filter(function (s) { return by[s.id]; }).map(function (s) {
      return '<button class="cf ctile csys" data-act="sys" data-arg="' + s.id + '" data-title="' + esc(s.name) + '" data-sys="' + by[s.id] + (by[s.id] === 1 ? ' juego' : ' juegos') + '">' +
        '<span class="cv" style="--c:' + s.color + '"><i class="mono sysbig">' + (MV.sysIcon ? MV.sysIcon(s.id) : esc(s.mono)) + '</i><b class="nm">' + esc(s.name) + '</b><small>' + by[s.id] + '</small></span></button>';
    });
    if (by['?']) cons.push('<button class="cf ctile csys" data-act="sys" data-arg="?" data-title="Sin sistema" data-sys="' + by['?'] + ' por elegir"><span class="cv" style="--c:#6B7280"><i class="mono">?</i><b class="nm">Sin sistema</b><small>' + by['?'] + '</small></span></button>');
    var row = all.length ? list.map(function (r) { return tile(r, true); }).join('')
      : '<button class="cf ctile big empty" data-act="scan" data-title="Buscar juegos" data-sys="Conecta tu USB y presiona OK"><span class="cv"><i class="mono">' + ic('usb') + '</i><b class="nm">Conecta tu USB con ROMs y presiona OK</b></span></button>';
    return topBar() +
      '<section class="chome"><div class="csel"><b id="ctitle"></b><span id="csys"></span><p id="cdesc"></p></div>' +
      (all.length ? '<h4 class="clabel">' + recLabel + '</h4>' : '') +
      '<div class="crow cgames">' + row + '</div>' +
      (cons.length ? '<h4 class="clabel">Consolas</h4><div class="crow cconsoles">' + cons.join('') + '</div>' : '') +
      '<div class="crow cbtns">' + round('lib', 'lib', 'Biblioteca') + round('scan', 'usb', 'Buscar juegos') + round('bios', 'bios', 'Importar BIOS') +
      round('send', 'send', 'Enviar desde el celular') + round('scrape', 'info', 'Buscar información') + round('engine', 'engine', 'Emuladores') + round('phone', 'phone', 'Celular como mando') + round('edit', 'edit', editMode ? 'Terminar de editar' : 'Editar juegos (nombre y carátula)') + round('del', 'trash', delMode ? 'Terminar de borrar' : 'Borrar juegos') + round('classic', 'list', 'Vista clásica') + round('exit', 'exit', 'Salir') + '</div></section>' +
      (delMode ? '<footer class="chint del"><span><i>OK</i>Borrar el juego elegido</span><span><i>⟵</i>Terminar de borrar</span></footer>' :
      editMode ? '<footer class="chint edit"><span><i>OK</i>Renombrar, carátula y más</span><span><i>⟵</i>Terminar de editar</span></footer>' :
      '<footer class="chint"><span><i>OK</i>Jugar</span><span><i>OK</i>Dejar presionado: opciones</span><span><i>⟵</i>Atrás</span></footer>');
  }

  function libHtml() {
    var all = roms(), by = {};
    all.forEach(function (r) { var s = MV.romSystem(r); var id = s ? s.id : '?'; (by[id] = by[id] || []).push(r); });
    var shelves = systems().filter(function (s) { return by[s.id]; }).map(function (s) {
      var list = by[s.id].sort(function (a, b) { return title(a).localeCompare(title(b)); });
      return '<div class="cshelf" data-sys="' + s.id + '"><h3 style="--c:' + s.color + '"><i>' + (MV.sysIcon ? MV.sysIcon(s.id) : esc(s.mono)) + '</i>' + esc(s.name) + '<small>' + list.length + (MV.gameEngine(s) === 'retroarch' ? ' · RetroArch' : '') + '</small></h3>' +
        '<div class="crow cshelfrow">' + list.slice(0, 150).map(function (r) { return tile(r, false); }).join('') + '</div></div>';
    });
    if (by['?']) shelves.push('<div class="cshelf" data-sys="?"><h3 style="--c:#6B7280"><i>?</i>Sin sistema<small>' + by['?'].length + ' · OK para elegir</small></h3><div class="crow cshelfrow">' + by['?'].map(function (r) { return tile(r, false); }).join('') + '</div></div>');
    return topBar() + '<div class="csel clibsel"><b id="ctitle"></b><span id="csys"></span><p id="cdesc"></p></div><section class="clib">' + (shelves.length ? shelves.join('') : '<div class="cnone"><h2>Aún no hay juegos</h2><p>Conecta tu USB y usa “Buscar juegos”, o usa “Enviar desde el celular” en el Inicio.</p></div>') + '</section>' +
      (delMode ? '<footer class="chint del"><span><i>OK</i>Borrar el juego elegido</span><span><i>⟵</i>Terminar de borrar</span></footer>' :
      editMode ? '<footer class="chint edit"><span><i>OK</i>Renombrar, carátula y más</span><span><i>⟵</i>Terminar de editar</span></footer>' :
      '<footer class="chint"><span><i>OK</i>Jugar</span><span><i>OK</i>Dejar presionado: opciones</span><span><i>⟵</i>Inicio</span></footer>');
  }

  function render(focusSel) {
    reg = {};
    box.innerHTML = tab === 'home' ? homeHtml() : libHtml();
    lastCount = roms().length;
    tick();
    var f = (focusSel && $(focusSel, box)) || $('.cgames .cf, .cshelfrow .cf, .cbtns .cf', box);
    if (f) focus(f, true);
  }
  function tick() {
    var c = $('#cclock', box); if (c) c.textContent = new Date().toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  }

  // ---------------- Foco y navegación ----------------
  function focus(el, quiet) {
    el.focus({ preventScroll: true });
    var row = el.closest('.crow');
    if (row) {
      var r = el.getBoundingClientRect(), b = row.getBoundingClientRect(), pad = b.width * 0.12;
      if (r.left < b.left + pad) row.scrollLeft -= (b.left + pad - r.left);
      else if (r.right > b.right - pad) row.scrollLeft += (r.right - (b.right - pad));
    }
    var home = el.closest('.chome');
    if (home && row) { var hr = row.getBoundingClientRect(), hb = home.getBoundingClientRect(); if (hr.bottom > hb.bottom) home.scrollTop += hr.bottom - hb.bottom + 20; else if (hr.top < hb.top + 120) home.scrollTop -= (hb.top + 120 - hr.top); }
    var lib = el.closest('.clib');
    if (lib) { var sh = el.closest('.cshelf'); if (sh) lib.scrollTop += sh.getBoundingClientRect().top - lib.getBoundingClientRect().top - lib.clientHeight * 0.18; }
    var t = $('#ctitle', box), s = $('#csys', box);
    if (t) { t.textContent = el.getAttribute('data-title') || ''; s.textContent = el.classList.contains('cround') ? '' : (el.getAttribute('data-sys') || ''); }
    if (!quiet) blip(el.classList.contains('cround') ? 620 : 760);
    var k = el.getAttribute('data-rom');
    clearTimeout(heroT);
    heroT = setTimeout(function () { hero(k && reg[k] ? reg[k] : null); }, 450);
  }

  // ---------------- Vista previa del juego elegido ----------------
  // Al pasar por un juego: su pantalla de título y una captura se alternan de fondo, con año, género y estudio.
  var heroT = null, heroCycle = null, heroRom = null;
  // La imagen va como fondo del propio modo consola (en algunas TV las capas encima de las filas con scroll no se ven)
  var BASE_BG = 'radial-gradient(120% 90% at 85% -10%, rgba(255,105,0,.22), transparent 55%), radial-gradient(90% 80% at -10% 110%, rgba(76,141,255,.14), transparent 55%)';
  function setHeroBg(url) {
    if (!box) return;
    if (!url) { box.style.backgroundImage = ''; box.style.backgroundSize = ''; box.style.backgroundPosition = ''; box.style.backgroundRepeat = ''; return; }
    box.style.backgroundImage = 'linear-gradient(90deg, #0E0D0C 40%, rgba(14,13,12,.55) 52%, rgba(14,13,12,0) 66%), ' +
      'linear-gradient(0deg, #0E0D0C 34%, rgba(14,13,12,.5) 44%, rgba(14,13,12,0) 60%), url("' + url.replace(/"/g, '%22') + '"), ' + BASE_BG;
    box.style.backgroundSize = '100% 100%, 100% 100%, 60% 66%, 100% 100%, 100% 100%';
    box.style.backgroundPosition = '0 0, 0 0, right top, 0 0, 0 0';
    box.style.backgroundRepeat = 'no-repeat';
  }
  function hero(r) {
    if (!box) return;
    clearInterval(heroCycle);
    if (!r) { setHeroBg(null); heroRom = null; var d0 = $('#cdesc', box); if (d0) d0.textContent = ''; return; }
    if (heroRom === r) return;
    heroRom = r;
    var s = MV.romSystem(r), sh = MV.gameShots ? MV.gameShots(r, s) : {}, ok = [sh.snap, sh.title].filter(Boolean);
    var show = function (u) {
      var im = new Image();
      im.onload = function () { if (heroRom === r) setHeroBg(u); };
      im.onerror = function () { var i = ok.indexOf(u); if (i >= 0) ok.splice(i, 1); if (heroRom === r && !ok.length) setHeroBg(null); };
      im.src = u;
    };
    if (!ok.length) setHeroBg(null);
    else { var i = 0; show(ok[0]); heroCycle = setInterval(function () { if (ok.length > 1 && box) { i = (i + 1) % ok.length; show(ok[i]); } }, 4000); }
    // Datos del juego debajo del título
    var line = function (m) {
      if (!box || heroRom !== r) return;
      var c = $('#csys', box), d = $('#cdesc', box), l = MV.gameMetaLine ? MV.gameMetaLine(m) : '';
      if (c) c.textContent = (s ? s.name : 'Elegir sistema') + (l ? ' · ' + l : '');
      if (d) d.textContent = m && m.desc ? m.desc : (m && m.none ? '' : 'Buscando información…');
    };
    line(null);
    var m = MV.gameMeta ? MV.gameMeta(r) : null;
    if (m) line(m); else if (MV.scrapeGame) MV.scrapeGame(r, s).then(line);
  }

  // Buscar la información de toda la biblioteca
  function scrapeAll() {
    if (!MV.scrapeAll) return;
    var list = roms(), job;
    MV.modal('<h2>Buscar información de los juegos</h2><p>Se busca el año, género, estudio y una descripción de cada juego en Wikipedia. Las imágenes vienen de la base de libretro.</p><div class="bar"><i id="scrBar"></i></div><p class="muted" id="scrTxt">Empezando…</p><div class="btns"><button class="btn ghost f" data-act="scrStop">Detener</button></div>');
    var x = document.getElementById('scrTxt'); if (x) x.textContent = 'Buscando carátulas y nombres…';
    var covers = MV.scrapeCoversAll ? MV.scrapeCoversAll(list, MV.romSystem, function (n, t) { var b = document.getElementById('scrBar'); if (b) b.style.width = Math.round(n * 50 / Math.max(t, 1)) + '%'; }, false) : Promise.resolve();
    var cancelled = false;
    job = covers.then(function () { if (cancelled) return { total: 0, found: 0 }; return MV.scrapeAll(list, MV.romSystem, function (n, t, r) {
      var b = document.getElementById('scrBar'), x = document.getElementById('scrTxt');
      if (b) b.style.width = Math.round(n * 100 / Math.max(t, 1)) + '%';
      if (x) x.textContent = n + ' de ' + t + ' · ' + (MV.gameTitle ? MV.gameTitle(r) : r.name);
    }); });
    job.cancel = function () { cancelled = true; };
    MV._scrJob = job;
    job.then(function (res) {
      var x = document.getElementById('scrTxt');
      if (x) x.textContent = res.total ? 'Listo: ' + res.found + ' de ' + res.total + ' juegos con información.' : 'Todos tus juegos ya tienen su información.';
      var b = document.querySelector('[data-act="scrStop"]'); if (b) b.textContent = 'Cerrar';
    });
  }
  if (MV.ACT) MV.ACT.scrStop = function () { if (MV._scrJob) MV._scrJob.cancel(); MV.closeModal(true); };
  function move(dir) {
    var cur = document.activeElement;
    if (!cur || !box.contains(cur) || !cur.classList.contains('cf')) { var f = $('.cf', box); if (f) focus(f); return; }
    var row = cur.closest('.crow'), items = $$('.cf', row), i = items.indexOf(cur);
    if (dir === 'left' || dir === 'right') { var n = items[i + (dir === 'right' ? 1 : -1)]; if (n) focus(n); return; }
    var rows = $$('.crow', box).filter(function (r) { return $('.cf', r); }), ri = rows.indexOf(row) + (dir === 'down' ? 1 : -1), target = rows[ri];
    if (!target) return;
    var cx = cur.getBoundingClientRect().left + cur.offsetWidth / 2, best = null, bd = 1e9;
    $$('.cf', target).forEach(function (el) { var q = el.getBoundingClientRect(), d = Math.abs(q.left + q.width / 2 - cx); if (d < bd) { bd = d; best = el; } });
    if (best) focus(best);
  }
  var ac = null;
  function blip(f) {
    if (!sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      var o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      o.type = 'triangle'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.25, t + 0.05);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.04, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.1);
    } catch (e) {}
  }

  // ---------------- Acciones ----------------
  function activate(el) {
    var k = el.getAttribute('data-rom');
    if (k && reg[k]) { if (delMode) { askDelete(reg[k]); return; } if (editMode) { options(el); return; } blip(990); MV.playRom(reg[k]); return; }
    switch (el.getAttribute('data-act')) {
      case 'lib': tab = 'lib'; render(); break;
      case 'sys': tab = 'lib'; render('.cshelf[data-sys="' + el.getAttribute('data-arg') + '"] .cf'); break;
      case 'scan': (MV.ACT.scanChooser || MV.ACT.scanRoms)(); break;
      case 'bios': MV.ACT.importBios(); break;
      case 'engine': engines(); break;
      case 'phone': MV.ACT.remoteQR(); break;
      case 'send': MV.ACT.romsFromPhone(); break;
      case 'classic': MV.save('gamesClassic', true); close(); if (MV.rerender) MV.rerender(); break;
      case 'scrape': scrapeAll(); break;
      case 'edit': editMode = !editMode; delMode = false; render('.cbtns [data-act="edit"]'); if (editMode) MV.toast('Elige con OK el juego que quieres editar'); break;
      case 'del': delMode = !delMode; editMode = false; render('.cbtns [data-act="del"]'); if (delMode) MV.toast('Elige con OK el juego que quieres borrar'); break;
      case 'exit': close(true); break;
    }
  }

  // Elegir con qué se juega cada consola
  function engines() {
    var ra = {}; try { ra = A ? JSON.parse(A.retroArch()) : {}; } catch (e) {}
    var have = {}; roms().forEach(function (r) { var s = MV.romSystem(r); if (s) have[s.id] = 1; });
    var list = systems().filter(function (s) { return have[s.id] || s.ra; });
    MV.modal('<h2>Emuladores</h2><p class="muted">' + (ra.installed ? 'RetroArch está instalado.' : 'RetroArch no está instalado (gratis en Play Store).') +
      ' Con RetroArch, descarga cada núcleo en RetroArch → Actualizador en línea → Descargar núcleos. Sus BIOS se copian a ' + esc(ra.bios || 'RetroArch/system') + ' al usar “Importar BIOS”.</p>' +
      list.map(function (s) {
        var e = MV.gameEngine(s);
        var ov = A && A.overlay ? A.overlay(s.id) : -1, ovs = null;
        if (ov >= 0 && A.overlayStyles) { try { ovs = JSON.parse(A.overlayStyles(s.id)); } catch (e) {} }
        var ovName = ovs ? (ovs.cur >= ovs.n ? 'sin marco' : 'Marco ' + (ovs.cur + 1) + ' de ' + ovs.n) : (ov ? 'puesto' : 'quitado');
        return '<div class="line"><div class="t"><b>' + esc(s.name) + '</b><span>' + (e === 'retroarch' ? 'RetroArch · núcleo ' + esc(s.raCore || s.core) : 'Emulador de MiVibra') + (s.ra ? ' (solo RetroArch)' : '') + (ov >= 0 && e !== 'retroarch' ? ' · ' + ovName : '') + '</span></div>' +
          (ov >= 0 && e !== 'retroarch' ? '<button class="btn ghost sm f" data-act="consoleFrame" data-arg="' + s.id + '">Cambiar marco</button>' : '') +
          (s.ra ? '' : '<button class="btn ghost sm f" data-act="consoleEngine" data-arg="' + s.id + '">' + (e === 'retroarch' ? 'Usar MiVibra' : 'Usar RetroArch') + '</button>') + '</div>';
      }).join('') + (ra.installed ? '' : '<div class="btns"><button class="btn f" data-act="consoleGetRA">Instalar RetroArch</button></div>'));
  }
  if (MV.ACT) {
    MV.ACT.consoleEngine = function (id) {
      var s = systems().find(function (x) { return x.id === id; }); if (!s) return;
      MV.setGameEngine(id, MV.gameEngine(s) === 'retroarch' ? 'interno' : 'retroarch');
      MV.closeModal(true); engines();
    };
    MV.ACT.consoleFrame = function (id) {
      if (A && A.nextOverlay) A.nextOverlay(id); else if (A && A.setOverlay) A.setOverlay(id, A.overlay(id) !== 1);
      MV.closeModal(true); engines();
      setTimeout(function () { var b = document.querySelector('[data-act="consoleFrame"][data-arg="' + id + '"]'); if (b) b.focus(); }, 60);
    };
    MV.ACT.consoleGetRA = function () { if (A) A.openExternal('market://details?id=' + (MV.raPkg || 'com.retroarch.ra32')); };
  }

  // Opciones de un juego (botón ☰)
  function options(el) {
    var k = el && el.getAttribute('data-rom'); if (!k || !reg[k]) return;
    var r = reg[k], s = MV.romSystem(r);
    MV._consoleRom = r;
    MV.modal('<h2>' + esc(title(r)) + '</h2><p class="muted">' + esc(s ? s.name : 'Sistema sin elegir') + ' · ' + esc(r.path) + '</p><div class="btns" style="flex-direction:column;align-items:stretch">' +
      '<button class="btn f" data-act="consolePlay">Jugar</button>' +
      '<button class="btn ghost f" data-act="consoleInfo">Ver ficha del juego</button>' +
      '<button class="btn ghost f" data-act="consoleRename">Renombrar</button>' +
      '<button class="btn ghost f" data-act="consoleCover">Buscar carátula otra vez</button>' +
      (s && !s.ra ? '<button class="btn ghost f" data-act="consoleSwap">' + (MV.gameEngine(s) === 'retroarch' ? 'Jugar ' + esc(s.name) + ' con el emulador de MiVibra' : 'Jugar ' + esc(s.name) + ' con RetroArch') + '</button>' : '') +
      '<button class="btn ghost f" data-act="consoleSys">Cambiar sistema</button>' +
      '<button class="btn danger f" data-act="consoleDel">Borrar juego</button></div>');
  }

  // Borrar: si el archivo está en la carpeta de MiVibra (enviado desde el celular) se elimina del TV;
  // si está en la USB solo se quita de la biblioteca (no se vuelve a agregar al buscar juegos).
  function askDelete(r) {
    var own = /\/android\/data\/co\.mivibra\.tv\//i.test(r.path || '');
    MV.confirm('¿Borrar “' + title(r) + '”?', own ? 'Se elimina del TV y libera espacio. Su partida guardada se conserva.' : 'Se quita de la biblioteca. El archivo sigue en tu USB.', 'Borrar').then(function (yes) {
      if (!yes) return;
      if (own && A && A.deleteFile) { try { A.deleteFile(r.path); } catch (e) {} }
      if (!own) { var hid = MV.load('romsHidden', []) || []; if (hid.indexOf(r.path) < 0) { hid.push(r.path); MV.save('romsHidden', hid); } }
      MV.save('roms', (MV.load('roms', []) || []).filter(function (x) { return x.path !== r.path; }));
      MV.save('recentGames', (MV.load('recentGames', []) || []).filter(function (x) { return x.path !== r.path; }));
      MV.toast('Borrado: ' + title(r));
      if (box) render(delMode || editMode ? '.cf.ctile' : null);
    });
  }
  if (MV.ACT) {
    MV.ACT.consolePlay = function () { MV.closeModal(true); MV.playRom(MV._consoleRom); };
    MV.ACT.consoleSwap = function () { var s = MV.romSystem(MV._consoleRom); MV.setGameEngine(s.id, MV.gameEngine(s) === 'retroarch' ? 'interno' : 'retroarch'); MV.closeModal(true); render(); };
    MV.ACT.consoleRename = function () { MV.closeModal(true); MV.renameRom(MV._consoleRom, function () { if (box) render(); }); };
    MV.ACT.consoleCover = function () {
      var r = MV._consoleRom; MV.closeModal(true); MV.toast('Buscando carátula…');
      MV.scrapeCover(r, MV.romSystem(r), true).then(function (c) { MV.toast(c && !c.none ? 'Carátula encontrada' : 'No encontré carátula; prueba renombrándolo'); if (box) render(); });
    };
    MV.ACT.consoleInfo = function () { MV.closeModal(true); MV.gameInfo(MV._consoleRom, MV.romSystem(MV._consoleRom)); };
    MV.ACT.consoleDel = function () { MV.closeModal(true); askDelete(MV._consoleRom); };
    MV.ACT.consoleSys = function () { MV.closeModal(true); MV.chooseSystem(MV._consoleRom); };
  }

  // ---------------- Abrir y cerrar ----------------
  function open() {
    if (box) return;
    tab = 'home'; delMode = false; editMode = false;
    box = document.createElement('div'); box.id = 'console'; box.setAttribute('role', 'application');
    document.body.appendChild(box);
    document.documentElement.classList.add('console-open');
    render();
    if (MV.syncOwnRoms) MV.syncOwnRoms();
    // Carátulas y nombres automáticos de lo nuevo, en segundo plano
    setTimeout(autoCovers, 1500);
    clockT = setInterval(tick, 15000);
    // Buscar juegos, BIOS o cambio de sistema: se actualiza solo cuando cambia la lista
    watchT = setInterval(function () { if (!MV.modalOpen() && roms().length !== lastCount) render(); }, 1200);
  }
  function autoCovers() {
    if (!box || !MV.scrapeCoversAll) return;
    MV.scrapeCoversAll(roms(), MV.romSystem).then(function (found) { if (found && box && !MV.modalOpen()) render(document.activeElement && document.activeElement.getAttribute('data-rom') ? null : null); });
  }
  function close(back) {
    if (!box) return;
    clearInterval(clockT); clearInterval(watchT); clearInterval(heroCycle); clearTimeout(heroT); heroRom = null;
    box.remove(); box = null;
    document.documentElement.classList.remove('console-open');
    if (back && MV.onBack) MV.onBack();
  }
  function voiceFind(q) {
    var n = function (z) { return String(z).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); };
    var w = n(q).split(' ').filter(Boolean);
    var hit = roms().map(function (r) { var tt = n(title(r)); return { r: r, s: w.filter(function (x) { return tt.indexOf(x) >= 0; }).length }; })
      .filter(function (x) { return x.s > 0; }).sort(function (a, b) { return b.s - a.s; })[0];
    if (!hit) { MV.toast('No encontré “' + q + '” en tus juegos'); return; }
    tab = 'lib'; render();
    var el = $$('.cshelfrow .cf', box).filter(function (e) { return reg[e.getAttribute('data-rom')] === hit.r; })[0];
    if (el) focus(el);
    MV.toast('🎤 ' + title(hit.r));
  }
  MV.console = { open: open, close: close, isOpen: function () { return !!box; }, search: voiceFind };

  // Atrás: Biblioteca → Inicio → salir de Juegos
  var origBack = MV.onBack;
  MV.onBack = function () {
    if (box && !MV.modalOpen() && delMode) { delMode = false; render('.cbtns [data-act="del"]'); return true; }
    if (box && !MV.modalOpen() && editMode) { editMode = false; render('.cbtns [data-act="edit"]'); return true; }
    if (box && !MV.modalOpen()) { if (tab === 'lib') { tab = 'home'; render('.cbtns [data-act="lib"]'); } else close(true); return true; }
    return origBack.apply(this, arguments);
  };
  var origKey = MV.onKey;
  MV.onKey = function (k) {
    if (box && !MV.modalOpen()) {
      if (k === 'menu') { options(document.activeElement); return; }
      if (k === 'prevTab' || k === 'nextTab') { tab = tab === 'home' ? 'lib' : 'home'; render(); return; }
    }
    return origKey && origKey.apply(this, arguments);
  };
  // El control maneja la consola mientras está abierta (los diálogos siguen con la navegación normal)
  window.addEventListener('keydown', function (e) {
    // OK sigue presionado después de abrir las opciones: no elegir nada en el menú
    if (box && okHeld && (e.key === 'Enter' || e.key === ' ' || e.key === 'NumpadEnter')) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (!box || MV.modalOpen()) return;
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') move(k.replace('Arrow', '').toLowerCase());
    else if (k === 'Enter' || k === ' ' || k === 'NumpadEnter') {
      // OK juega al soltarlo; si se deja presionado abre las opciones (para controles sin botón ☰)
      var a = document.activeElement;
      if (!e.repeat) {
        okAt = Date.now(); okEl = a; okHeld = false; clearTimeout(okT);
        // Algunos controles no repiten la tecla al dejarla presionada: se mide con un temporizador
        if (a && a.getAttribute('data-rom')) okT = setTimeout(function () { if (okEl === a && !okHeld && document.activeElement === a && !MV.modalOpen()) { okHeld = true; blip(660); options(a); } }, 600);
      }
      else if (!okHeld && okEl === a && Date.now() - okAt > 600 && a && a.getAttribute('data-rom')) { okHeld = true; clearTimeout(okT); options(a); }
    }
    else if (k === 'ContextMenu') options(document.activeElement);
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  var okAt = 0, okEl = null, okHeld = false, okT = null;
  window.addEventListener('keyup', function (e) {
    if (!box || (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'NumpadEnter')) return;
    clearTimeout(okT);
    // Al soltar OK después de abrir las opciones no se debe elegir nada en el menú
    if (MV.modalOpen()) { if (okHeld) { e.preventDefault(); e.stopImmediatePropagation(); } okEl = null; okHeld = false; return; }
    e.preventDefault(); e.stopImmediatePropagation();
    var a = document.activeElement;
    if (!okHeld && okEl && a === okEl && box.contains(a)) activate(a);
    okEl = null; okHeld = false;
  }, true);
  document.addEventListener('click', function (e) {
    if (!box || !box.contains(e.target)) return;
    var el = e.target.closest('.cf'); if (!el) return;
    e.preventDefault(); e.stopPropagation(); focus(el, true); activate(el);
  }, true);
})();
