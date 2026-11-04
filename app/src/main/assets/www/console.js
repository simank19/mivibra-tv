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
    return list;
  }
  function title(r) { return String(r.name || '').replace(/\.[^.]+$/, '').replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '').replace(/_/g, ' ').trim() || r.name; }
  // Portadas de la base pública de libretro (por nombre No-Intro / Redump del archivo)
  function thumb(r, s) {
    if (!s || !s.thumbs) return '';
    var n = String(r.name || '').replace(/\.[^.]+$/, '').replace(/[&*\/:`<>?\\|"]/g, '_');
    return 'https://thumbnails.libretro.com/' + encodeURIComponent(s.thumbs) + '/Named_Boxarts/' + encodeURIComponent(n) + '.png';
  }
  function cover(r, s, cls) {
    var c = s ? s.color : '#6B7280', t = thumb(r, s);
    return '<span class="cv ' + (cls || '') + '" style="--c:' + c + '"><i class="mono">' + esc(s ? s.mono : '?') + '</i><b class="nm">' + esc(title(r)) + '</b>' +
      (t ? '<img loading="lazy" src="' + esc(t) + '" alt="" onload="this.parentNode.classList.add(\'art\')" onerror="this.remove()">' : '') + '</span>';
  }
  var reg = {};
  function tile(r, big) {
    var s = MV.romSystem(r), k = 'g' + Object.keys(reg).length; reg[k] = r;
    var eng = s ? MV.gameEngine(s) : '';
    return '<button class="cf ctile' + (big ? ' big' : '') + '" data-rom="' + k + '" data-title="' + esc(title(r)) + '" data-sys="' + esc(s ? s.name : 'Elegir sistema') + (eng === 'retroarch' ? ' · RetroArch' : '') + '">' + cover(r, s) + '</button>';
  }

  // ---------------- Pantallas ----------------
  function topBar() {
    var p = MV.profile && MV.profile(), pads = [];
    try { pads = A ? JSON.parse(A.gamepads()) : []; } catch (e) {}
    return '<header class="ctop"><div class="cme">' + (p ? '<img src="' + esc(MV.avatarOf(p.avatar)) + '" alt=""><b>' + esc(p.name) + '</b>' : '<b>Juegos</b>') + '</div>' +
      '<nav class="ctabs"><span class="' + (tab === 'home' ? 'on' : '') + '">Inicio</span><span class="' + (tab === 'lib' ? 'on' : '') + '">Biblioteca</span></nav>' +
      '<div class="cstat"><span class="cpad" title="Mandos">' + PAD + (pads.length || '') + '</span><span id="cclock"></span></div></header>';
  }
  var PAD = '<svg viewBox="0 0 24 24" width="1.3em" height="1.3em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M7 8h10a4 4 0 0 1 4 4v2.5a2.5 2.5 0 0 1-4.6 1.4L15 14H9l-1.4 1.9A2.5 2.5 0 0 1 3 14.5V12a4 4 0 0 1 4-4z"/><path d="M8 11v3M6.5 12.5h3"/></svg>';
  var IC = {
    lib: '<path d="M4 4h4v16H4zM10 4h4v16h-4zM16 5l3.5-1 3 15-3.5 1z"/>',
    usb: '<path d="M12 2v14M8 6l4-4 4 4M7 11v3l5 3 5-3v-3"/><circle cx="12" cy="20" r="2"/>',
    bios: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6v6H9zM9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/>',
    engine: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    exit: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>'
  };
  function ic(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + IC[n] + '</svg>'; }
  function round(act, icon, label) { return '<button class="cf cround" data-act="' + act + '" data-title="' + esc(label) + '"><span>' + ic(icon) + '</span><em>' + esc(label) + '</em></button>'; }

  function homeHtml() {
    var all = roms(), rec = (MV.load('recentGames', []) || []).filter(function (r) { return all.some(function (x) { return x.path === r.path; }); });
    var seen = {}, list = [];
    rec.concat(all.slice().sort(function (a, b) { return title(a).localeCompare(title(b)); })).forEach(function (r) { if (!seen[r.path] && list.length < 40) { seen[r.path] = 1; list.push(r); } });
    var row = list.length ? list.map(function (r) { return tile(r, true); }).join('') +
      (all.length > list.length ? '<button class="cf ctile big more" data-act="lib" data-title="Ver toda la biblioteca" data-sys="' + all.length + ' juegos"><span class="cv"><i class="mono">+' + (all.length - list.length) + '</i><b class="nm">Toda la biblioteca</b></span></button>' : '')
      : '<button class="cf ctile big empty" data-act="scan" data-title="Buscar juegos" data-sys="Conecta tu USB y presiona OK"><span class="cv"><i class="mono">' + ic('usb') + '</i><b class="nm">Conecta tu USB con ROMs y presiona OK</b></span></button>';
    return topBar() +
      '<section class="chome"><div class="csel"><b id="ctitle"></b><span id="csys"></span></div>' +
      '<div class="crow cgames">' + row + '</div>' +
      '<div class="crow cbtns">' + round('lib', 'lib', 'Biblioteca') + round('scan', 'usb', 'Buscar juegos') + round('bios', 'bios', 'Importar BIOS') +
      round('engine', 'engine', 'Emuladores') + round('phone', 'phone', 'Celular como mando') + round('classic', 'list', 'Vista clásica') + round('exit', 'exit', 'Salir') + '</div></section>' +
      '<footer class="chint"><span><i>OK</i>Jugar</span><span><i>☰</i>Opciones</span><span><i>⟵</i>Atrás</span></footer>';
  }

  function libHtml() {
    var all = roms(), by = {};
    all.forEach(function (r) { var s = MV.romSystem(r); var id = s ? s.id : '?'; (by[id] = by[id] || []).push(r); });
    var shelves = systems().filter(function (s) { return by[s.id]; }).map(function (s) {
      var list = by[s.id].sort(function (a, b) { return title(a).localeCompare(title(b)); });
      return '<div class="cshelf"><h3 style="--c:' + s.color + '"><i>' + esc(s.mono) + '</i>' + esc(s.name) + '<small>' + list.length + (MV.gameEngine(s) === 'retroarch' ? ' · RetroArch' : '') + '</small></h3>' +
        '<div class="crow cshelfrow">' + list.slice(0, 150).map(function (r) { return tile(r, false); }).join('') + '</div></div>';
    });
    if (by['?']) shelves.push('<div class="cshelf"><h3 style="--c:#6B7280"><i>?</i>Sin sistema<small>' + by['?'].length + ' · OK para elegir</small></h3><div class="crow cshelfrow">' + by['?'].map(function (r) { return tile(r, false); }).join('') + '</div></div>');
    return topBar() + '<section class="clib">' + (shelves.length ? shelves.join('') : '<div class="cnone"><h2>Aún no hay juegos</h2><p>Conecta tu USB con ROMs y usa “Buscar juegos” en el Inicio.</p></div>') + '</section>' +
      '<footer class="chint"><span><i>OK</i>Jugar</span><span><i>☰</i>Opciones</span><span><i>⟵</i>Inicio</span></footer>';
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
    var lib = el.closest('.clib');
    if (lib) { var sh = el.closest('.cshelf'); if (sh) lib.scrollTop += sh.getBoundingClientRect().top - lib.getBoundingClientRect().top - lib.clientHeight * 0.18; }
    var t = $('#ctitle', box), s = $('#csys', box);
    if (t) { t.textContent = el.getAttribute('data-title') || ''; s.textContent = el.classList.contains('cround') ? '' : (el.getAttribute('data-sys') || ''); }
    if (!quiet) blip(el.classList.contains('cround') ? 620 : 760);
  }
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
    if (k && reg[k]) { blip(990); MV.playRom(reg[k]); return; }
    switch (el.getAttribute('data-act')) {
      case 'lib': tab = 'lib'; render(); break;
      case 'scan': MV.ACT.scanRoms(); break;
      case 'bios': MV.ACT.importBios(); break;
      case 'engine': engines(); break;
      case 'phone': MV.ACT.remoteQR(); break;
      case 'classic': MV.save('gamesClassic', true); close(); if (MV.rerender) MV.rerender(); break;
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
        return '<div class="line"><div class="t"><b>' + esc(s.name) + '</b><span>' + (e === 'retroarch' ? 'RetroArch · núcleo ' + esc(s.raCore || s.core) : 'Emulador de MiVibra') + (s.ra ? ' (solo RetroArch)' : '') + '</span></div>' +
          (s.ra ? '' : '<button class="btn ghost sm f" data-act="consoleEngine" data-arg="' + s.id + '">' + (e === 'retroarch' ? 'Usar MiVibra' : 'Usar RetroArch') + '</button>') + '</div>';
      }).join('') + (ra.installed ? '' : '<div class="btns"><button class="btn f" data-act="consoleGetRA">Instalar RetroArch</button></div>'));
  }
  if (MV.ACT) {
    MV.ACT.consoleEngine = function (id) {
      var s = systems().find(function (x) { return x.id === id; }); if (!s) return;
      MV.setGameEngine(id, MV.gameEngine(s) === 'retroarch' ? 'interno' : 'retroarch');
      MV.closeModal(true); engines();
    };
    MV.ACT.consoleGetRA = function () { if (A) A.openExternal('market://details?id=com.retroarch.aarch64'); };
  }

  // Opciones de un juego (botón ☰)
  function options(el) {
    var k = el && el.getAttribute('data-rom'); if (!k || !reg[k]) return;
    var r = reg[k], s = MV.romSystem(r);
    MV._consoleRom = r;
    MV.modal('<h2>' + esc(title(r)) + '</h2><p class="muted">' + esc(s ? s.name : 'Sistema sin elegir') + ' · ' + esc(r.path) + '</p><div class="btns" style="flex-direction:column;align-items:stretch">' +
      '<button class="btn f" data-act="consolePlay">Jugar</button>' +
      (s && !s.ra ? '<button class="btn ghost f" data-act="consoleSwap">' + (MV.gameEngine(s) === 'retroarch' ? 'Jugar ' + esc(s.name) + ' con el emulador de MiVibra' : 'Jugar ' + esc(s.name) + ' con RetroArch') + '</button>' : '') +
      '<button class="btn ghost f" data-act="consoleSys">Cambiar sistema</button></div>');
  }
  if (MV.ACT) {
    MV.ACT.consolePlay = function () { MV.closeModal(true); MV.playRom(MV._consoleRom); };
    MV.ACT.consoleSwap = function () { var s = MV.romSystem(MV._consoleRom); MV.setGameEngine(s.id, MV.gameEngine(s) === 'retroarch' ? 'interno' : 'retroarch'); MV.closeModal(true); render(); };
    MV.ACT.consoleSys = function () { MV.closeModal(true); MV.chooseSystem(MV._consoleRom); };
  }

  // ---------------- Abrir y cerrar ----------------
  function open() {
    if (box) return;
    tab = 'home';
    box = document.createElement('div'); box.id = 'console'; box.setAttribute('role', 'application');
    document.body.appendChild(box);
    document.documentElement.classList.add('console-open');
    render();
    clockT = setInterval(tick, 15000);
    // Buscar juegos, BIOS o cambio de sistema: se actualiza solo cuando cambia la lista
    watchT = setInterval(function () { if (!MV.modalOpen() && roms().length !== lastCount) render(); }, 1200);
  }
  function close(back) {
    if (!box) return;
    clearInterval(clockT); clearInterval(watchT);
    box.remove(); box = null;
    document.documentElement.classList.remove('console-open');
    if (back && MV.onBack) MV.onBack();
  }
  MV.console = { open: open, close: close, isOpen: function () { return !!box; } };

  // Atrás: Biblioteca → Inicio → salir de Juegos
  var origBack = MV.onBack;
  MV.onBack = function () {
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
    if (!box || MV.modalOpen()) return;
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') move(k.replace('Arrow', '').toLowerCase());
    else if ((k === 'Enter' || k === ' ' || k === 'NumpadEnter') && !e.repeat) { var a = document.activeElement; if (a && box.contains(a)) activate(a); }
    else if (k === 'ContextMenu') options(document.activeElement);
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  document.addEventListener('click', function (e) {
    if (!box || !box.contains(e.target)) return;
    var el = e.target.closest('.cf'); if (!el) return;
    e.preventDefault(); e.stopPropagation(); focus(el, true); activate(el);
  }, true);
})();
