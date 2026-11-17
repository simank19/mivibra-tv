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
  // Juegos: filtro por consola ('all', 'fav' o el id de la consola) · Ficha: el juego abierto
  var sysFilter = 'all', detailRom = null, detailFrom = 'games';
  function favs() { return MV.load('gameFavs', []) || []; }
  function isFav(r) { return favs().indexOf(r.path) >= 0; }
  function toggleFav(r) { var f = favs(), i = f.indexOf(r.path); if (i >= 0) f.splice(i, 1); else f.unshift(r.path); MV.save('gameFavs', f); return i < 0; }
  function systems() { return (window.MVD || {}).SYSTEMS || []; }

  // ---------------- Datos ----------------
  // Con miles de juegos (Google Drive) leer y ordenar la lista es pesado: se guarda el resultado mientras la lista no cambie
  var romsCache = { raw: null, list: [] };
  function roms() {
    var raw = null; try { raw = localStorage.getItem('mv:roms'); } catch (e) {}
    if (raw !== null && raw === romsCache.raw) return romsCache.list;
    var list = (MV.load('roms', []) || []).filter(function (r) { return MV.isGame ? MV.isGame(r) : true; });
    list = list.filter(function (r) { return r.ext !== 'exe' || /doukutsu\.exe$/i.test(r.name); }).filter(function (r) { return r.ext !== 'pak' || /^pak0\.pak$/i.test(r.name); });
    // El mismo juego repetido (enviado dos veces, o en .zip y suelto) sale una sola vez
    var seen = {};
    list = list.filter(function (r) {
      var s = MV.romSystem(r), k = title(r).toLowerCase() + '|' + (s ? s.id : '?');
      if (seen[k]) return false; seen[k] = 1; return true;
    });
    var hv = MV.load('gamesHiddenView', []) || [];
    romsCache = { raw: raw, list: list.filter(function (r) { return hv.indexOf(r.path) < 0; }), hidden: list.filter(function (r) { return hv.indexOf(r.path) >= 0; }) };
    return romsCache.list;
  }
  // ---------------- Juegos instalados en el equipo (Android: apps de juegos; PC: Steam, Epic y GOG) ----------------
  var NATIVE = null;
  function nativeLabel() { return MV.device && MV.device.desktop ? 'PC' : 'Android'; }
  function canNative() { return !!(A && A.installedGames) && !(MV.webSystems); }
  function nativeAll(force) {
    if (!canNative()) return [];
    if (NATIVE && !force) return NATIVE;
    var extra = MV.load('nativeExtra', []) || [], arr = [];
    try { arr = JSON.parse(A.installedGames(extra.length > 0) || '[]') || []; } catch (e) { arr = []; }
    NATIVE = arr.filter(function (g) { return g.game !== false || extra.indexOf(g.pkg) >= 0; }).map(function (g) {
      if (!g.id) g.id = 'android:' + g.pkg;
      if (!g.src) g.src = 'Android';
      return { path: 'native:' + g.id, name: g.name, ext: '', native: g };
    });
    return NATIVE;
  }
  function natives() { var hv = MV.load('gamesHiddenView', []) || []; return nativeAll().filter(function (r) { return hv.indexOf(r.path) < 0; }); }
  // Información de los juegos instalados: ficha pública de Google Play (Android) o de la tienda de Steam (PC). Se guarda 30 días.
  var NI = null, niBusy = {};
  function niCache() { if (!NI) { try { NI = JSON.parse(localStorage.getItem('mv:natInfo') || '{}'); } catch (e) { NI = {}; } } return NI; }
  var PLAYCAT = { ACTION: 'Acción', ADVENTURE: 'Aventura', ARCADE: 'Arcade', BOARD: 'Mesa', CARD: 'Cartas', CASINO: 'Casino', CASUAL: 'Casual', EDUCATIONAL: 'Educativo', MUSIC: 'Música', PUZZLE: 'Rompecabezas', RACING: 'Carreras', ROLE_PLAYING: 'Rol', SIMULATION: 'Simulación', SPORTS: 'Deportes', STRATEGY: 'Estrategia', TRIVIA: 'Preguntas', WORD: 'Palabras' };
  function unesc(t) { var d = document.createElement('textarea'); d.innerHTML = String(t || ''); return d.value; }
  function playInfo(g) {
    return MV.getText('https://play.google.com/store/apps/details?id=' + encodeURIComponent(g.pkg) + '&hl=es_419&gl=CO').then(function (h) {
      var o = { shots: [] }, ld = null;
      var m = h.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g) || [];
      m.forEach(function (b) { try { var j = JSON.parse(b.replace(/^<script[^>]*>|<\/script>$/g, '')); if (j && /SoftwareApplication|VideoGame/.test(j['@type'])) ld = j; } catch (e) {} });
      if (ld) {
        o.name = ld.name; o.desc = ld.description; o.dev = ld.author && ld.author.name; o.icon = ld.image;
        var cat = String(ld.applicationCategory || '').replace(/^GAME_/, ''); o.genre = PLAYCAT[cat] || '';
        if (ld.aggregateRating) o.rating = (+ld.aggregateRating.ratingValue).toFixed(1).replace('.', ',') + ' ★' + (ld.aggregateRating.ratingCount ? ' · ' + (+ld.aggregateRating.ratingCount).toLocaleString('es-CO') + ' opiniones' : '');
        o.age = ld.contentRating || '';
      }
      if (!o.desc) { var d = h.match(/<meta name="description" content="([^"]*)"/); if (d) o.desc = d[1]; }
      if (!o.name) { var t = h.match(/<meta property="og:title" content="([^"]*)"/); if (t) o.name = t[1].replace(/\s+-\s+Apps en Google Play.*$/i, ''); }
      var re = /<img[^>]+src="(https:\/\/play-lh\.googleusercontent\.com\/[^"=]+)(?:=[^"]*)?"[^>]*alt="([^"]*)"/g, x;
      while ((x = re.exec(h)) && o.shots.length < 10) { if (/captura|screenshot|imagen/i.test(x[2]) && o.shots.indexOf(x[1] + '=w1280') < 0) o.shots.push(x[1] + '=w1280'); }
      ['name', 'desc', 'dev'].forEach(function (k) { if (o[k]) o[k] = unesc(o[k]); });
      return o;
    });
  }
  function steamInfo(g) {
    var id = g.id.split(':')[1];
    return MV.getJSON('https://store.steampowered.com/api/appdetails?appids=' + id + '&l=spanish&cc=co').then(function (j) {
      var d = j && j[id] && j[id].data; if (!d) return {};
      return { name: d.name, desc: unesc(String(d.short_description || '').replace(/<[^>]+>/g, '')), dev: (d.developers || []).join(', '), pub: (d.publishers || []).join(', '),
        genre: (d.genres || []).map(function (x) { return x.description; }).slice(0, 3).join(' · '), date: d.release_date && d.release_date.date, age: d.required_age ? '+' + d.required_age : '',
        shots: (d.screenshots || []).map(function (x) { return x.path_full; }).slice(0, 10), hero: d.background_raw || '' };
    });
  }
  function nativeInfo(r, cb) {
    var g = r.native, c = niCache()[g.id];
    if (c && Date.now() - c.t < 30 * 86400000) return c;
    if (niBusy[g.id]) return c || null;
    var job = g.pkg ? playInfo(g) : /^steam:/.test(g.id) ? steamInfo(g) : null;
    if (!job) return null;
    niBusy[g.id] = true;
    job.then(function (o) { o = o || {}; o.t = Date.now(); niCache()[g.id] = o; try { localStorage.setItem('mv:natInfo', JSON.stringify(NI)); } catch (e) {} niBusy[g.id] = false; cb && cb(o); },
      function () { niBusy[g.id] = false; });
    return c || null;
  }
  function launchNative(r) {
    var ok = false; try { ok = A.launchGame(JSON.stringify(r.native)); } catch (e) {}
    if (!ok) MV.toast('No se pudo abrir ' + r.native.name);
    return ok;
  }
  function romsRaw() { try { return localStorage.getItem('mv:roms') || ''; } catch (e) { return ''; } }
  var titles = {};
  function title(r) { var c = titles[r.path]; if (c) return c; return (titles[r.path] = title0(r)); }
  function title0(r) { if (r.native) return r.native.name; var nt = MV.romTitle && MV.romTitle(r); if (nt) return nt;
    return (MV.cleanRomName && MV.cleanRomName(r.name)) || String(r.name || '').replace(/\.[^.]+$/, '').replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '').replace(/_/g, ' ').trim() || r.name; }
  // Portadas de la base pública de libretro (por nombre No-Intro / Redump del archivo)
  function thumb(r, s) {
    if (!s || !s.thumbs) return '';
    var n = ((MV.coverName && MV.coverName(r)) || String(r.name || '').replace(/\.[^.]+$/, '')).replace(/[&*\/:`<>?\\|"]/g, '_');
    return 'https://thumbnails.libretro.com/' + encodeURIComponent(s.thumbs) + '/Named_Boxarts/' + encodeURIComponent(n) + '.png';
  }
  function cover(r, s, cls) {
    if (r.native) {
      var g = r.native, im = g.img || '';
      return '<span class="cv gx-nat ' + (g.banner ? 'gx-ban ' : g.src === 'Android' ? 'gx-ico ' : '') + (cls || '') + '" style="--c:#2E7DD7"><b class="nm">' + esc(g.name) + '</b>' +
        (im ? '<img loading="lazy" src="' + esc(im) + '"' + (g.alt ? ' data-alt="' + esc(g.alt) + '"' : '') + ' alt="" onload="this.parentNode.classList.add(\'art\')" onerror="var a=this.getAttribute(\'data-alt\');if(a){this.removeAttribute(\'data-alt\');this.src=a}else this.remove()">' : '') +
        '<i class="gx-src">' + esc(g.src) + '</i></span>';
    }
    var c = s ? s.color : '#6B7280', t = thumb(r, s);
    // Si la base de carátulas no tiene el juego, se usa la imagen de su ficha (Wikipedia)
    var gm = MV.gameMeta ? MV.gameMeta(r) : null, alt = gm && gm.img && !gm.unsure ? gm.img : '';
    return '<span class="cv ' + (cls || '') + '" style="--c:' + c + '"><i class="mono">' + (MV.sysIcon ? MV.sysIcon(s ? s.id : '?') : esc(s ? s.mono : '?')) + '</i><b class="nm">' + esc(title(r)) + '</b>' +
      (t || alt ? '<img loading="lazy" src="' + esc(t || alt) + '"' + (t && alt ? ' data-alt="' + esc(alt) + '"' : '') + ' alt="" onload="this.parentNode.classList.add(\'art\')" onerror="var a=this.getAttribute(\'data-alt\');if(a){this.removeAttribute(\'data-alt\');this.src=a}else this.remove()">' : '') + '</span>';
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
      '<nav class="crow ctabs">' + [['home', 'Consolas'], ['games', 'Juegos'], ['opts', 'Opciones']].map(function (t) { return '<button class="cf ctab' + ((tab === t[0] || (tab === 'detail' && t[0] === 'games')) ? ' on' : '') + '" data-act="tab" data-arg="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</nav>' +
      '<div class="cstat"><span class="cver">v' + esc((MV.device && MV.device.versionCode) || '') + '</span><span class="cpad" title="Mandos">' + PAD + (pads.length || '') + '</span><span id="cclock"></span></div></header>';
  }
  var PAD = '<svg viewBox="0 0 24 24" width="1.3em" height="1.3em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M7 8h10a4 4 0 0 1 4 4v2.5a2.5 2.5 0 0 1-4.6 1.4L15 14H9l-1.4 1.9A2.5 2.5 0 0 1 3 14.5V12a4 4 0 0 1 4-4z"/><path d="M8 11v3M6.5 12.5h3"/></svg>';
  var IC = {
    cloud: '<path d="M7 18a5 5 0 1 1 .9-9.92A6 6 0 0 1 19 10a4 4 0 0 1-1 7.87V18H7z"/>',
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
  function swapTxt() { try { return A && A.padSwap && A.padSwap('get') ? 'Activado: A elige y B vuelve en mandos tipo Nintendo' : 'Si en tu mando A y B están al revés'; } catch (e) { return ''; } }
  function opt(act, icon, label, desc) { return '<button class="cf copt" data-act="' + act + '"><span>' + ic(icon) + '</span><b>' + esc(label) + '</b><small>' + esc(desc) + '</small></button>'; }
  var HINT_TABS = '<span><i>L</i><i>R</i>Cambiar pestaña</span>';
  function hints(back) {
    return delMode ? '<footer class="chint del"><span><i>OK</i>Borrar el juego elegido</span><span><i>⟵</i>Terminar de borrar</span></footer>' :
      editMode ? '<footer class="chint edit"><span><i>OK</i>Renombrar, carátula y más</span><span><i>⟵</i>Terminar de editar</span></footer>' :
      '<footer class="chint"><span><i>OK</i>' + (tab === 'home' ? 'Abrir' : 'Ver ficha') + '</span><span><i>OK</i>Mantener: opciones del juego</span>' + HINT_TABS + '<span><i>⟵</i>' + back + '</span></footer>';
  }
  function optsHtml() {
    var rows = [
      [opt('scan', 'usb', 'Buscar juegos', 'En tu USB, memoria o carpetas'), opt('send', 'send', 'Enviar desde el celular', 'Pasa juegos por WiFi'), opt('scrape', 'info', 'Buscar información', 'Carátulas, año y descripción'), opt('bios', 'bios', 'Importar BIOS', 'Para PlayStation y otras')],
      [opt('drive', 'cloud', 'Google Drive', MV.driveStatus ? MV.driveStatus() : 'Tus juegos y partidas en la nube'), opt('swapab', 'phone', 'Intercambiar A y B', swapTxt())],
      [opt('edit', 'edit', 'Editar juegos', 'Nombre, carátula y consola'), opt('del', 'trash', 'Borrar juegos', 'Quita los que ya no quieras'), opt('engine', 'engine', 'Emuladores', 'Motor y marco de cada consola'), opt('phone', 'phone', 'Celular como mando', 'Juega con el teléfono')],
      [].concat(canNative() && !(MV.device && MV.device.desktop) ? [opt('natApps', 'lib', 'Apps como juegos', 'Agrega apps que no aparecen solas')] : [], canNative() ? [opt('natScan', 'usb', 'Buscar instalados', 'Vuelve a buscar los juegos del ' + (nativeLabel() === 'PC' ? 'PC' : 'equipo'))] : []),
      [opt('classic', 'list', 'Vista clásica', 'La lista sencilla de antes'), opt('exit', 'exit', 'Salir de Juegos', 'Volver a MiVibra TV')]
    ];
    return topBar() + '<section class="copts"><h2>Opciones</h2>' + rows.map(function (r) { return '<div class="crow coptrow">' + r.join('') + '</div>'; }).join('') + '</section>' +
      '<footer class="chint"><span><i>OK</i>Elegir</span>' + HINT_TABS + '<span><i>⟵</i>Inicio</span></footer>';
  }
  function round(act, icon, label) { return '<button class="cf cround" data-act="' + act + '" data-title="' + esc(label) + '"><span>' + ic(icon) + '</span><em>' + esc(label) + '</em></button>'; }

  // ---------- Consolas: carrusel de tarjetas grandes; el fondo toma el color y el ícono de la consola elegida ----------
  function bySystem() { var by = {}; roms().forEach(function (r) { var s = MV.romSystem(r); var id = s ? s.id : '?'; (by[id] = by[id] || []).push(r); }); return by; }
  function sysIcon(id, mono) { return MV.sysIcon ? MV.sysIcon(id) : esc(mono || '?'); }
  // Logo de cada consola (colección "Console Logos" de Dan Patrick en Internet Archive, versión para fondo oscuro)
  var CLOGO = ['nes', 'snes', 'gb', 'gbc', 'gba', 'n64', 'nds', 'md', 'sms', 'gg', 'psx', 'a26', 'a78', 'lynx', 'pce', 'ngp', 'ws', 'arcade', 'neogeo', 'psp', 'dc', 'gc', 'sg1000',
    '32x', 'segacd', 'saturn', '3do', 'vb', 'a52', 'jaguar', 'coleco', 'c64', 'amiga', 'cpc', 'zx', 'ps2', 'ps3', 'ps4', 'vita', 'xbox', 'x360', 'wii', 'wiiu', '3ds'];
  function sysLogo(id) { return CLOGO.indexOf(id) >= 0 ? '<img class="gx-clogo clr" src="img/consolelogos/c-' + id + '.webp" alt="">' : ''; }
  function homeHtml() {
    var all = roms(), by = bySystem();
    // Todas las consolas: primero las que tienen juegos y después las demás (atenuadas, con 0), para saber qué se puede jugar.
    // En Samsung/LG solo las que ese TV puede mover.
    var canHere = function (s) {
      if (MV.webSystems) return MV.webSystems.indexOf(s.id) >= 0;
      if (s.extern && !(MV.device && MV.device.desktop) && !(s.android && s.android.length)) return false;   // PS4 y Xbox: solo en el PC
      return true;
    };
    var withG = systems().filter(function (s) { return by[s.id]; });
    var noG = systems().filter(function (s) { return !by[s.id] && !s.port && canHere(s); });
    var cards = withG.concat(noG).map(function (s) {
      var n = by[s.id] ? by[s.id].length : 0;
      return '<button class="cf gx-card' + (n ? '' : ' gx-empty') + (sysLogo(s.id) ? ' gx-haslogo' : '') + '" data-act="sys" data-arg="' + s.id + '" data-title="' + esc(s.name) + '" data-sys="' + (n ? n + (n === 1 ? ' juego' : ' juegos') : 'Sin juegos todavía · agrégalos desde el USB o el celular') + '" style="--c:' + s.color + '">' +
        '<i class="gx-n">' + n + '</i>' + (sysLogo(s.id) ? '<span class="gx-ic gx-lg">' + sysLogo(s.id) + '</span><b class="gx-small">' : '<span class="gx-ic">' + sysIcon(s.id, s.mono) + '</span><b>') + esc(s.name) + '</b></button>';
    });
    if (by['?']) cards.push('<button class="cf gx-card" data-act="sys" data-arg="?" data-title="Sin sistema" data-sys="' + by['?'].length + ' por elegir" style="--c:#6B7280"><i class="gx-n">' + by['?'].length + '</i><span class="gx-ic">?</span><b>Sin sistema</b></button>');
    if (all.length) cards.unshift('<button class="cf gx-card gx-all" data-act="sys" data-arg="all" data-title="Todos tus juegos" data-sys="' + all.length + ' juegos" style="--c:#FF6900"><i class="gx-n">' + all.length + '</i><span class="gx-ic">' + ic('lib') + '</span><b>Todos</b></button>');
    if (favs().length) cards.splice(all.length ? 1 : 0, 0, '<button class="cf gx-card" data-act="sys" data-arg="fav" data-title="Favoritos" data-sys="' + favs().length + (favs().length === 1 ? ' juego' : ' juegos') + '" style="--c:#E0447C"><i class="gx-n">★</i><span class="gx-ic">★</span><b>Favoritos</b></button>');
    var nat = natives();
    if (nat.length) cards.splice(Math.min(cards.length, (all.length ? 1 : 0) + (favs().length ? 1 : 0)), 0, '<button class="cf gx-card" data-act="sys" data-arg="native" data-title="Instalados en ' + (nativeLabel() === 'PC' ? 'el PC' : 'este equipo') + '" data-sys="' + nat.length + (nat.length === 1 ? ' juego' : ' juegos') + '" style="--c:#2E7DD7"><i class="gx-n">' + nat.length + '</i><span class="gx-ic">' + PAD + '</span><b>' + nativeLabel() + '</b></button>');
    if (MV.VIEWS && MV.VIEWS.movimiento) cards.unshift('<button class="cf gx-card" data-act="mvm" data-title="MiVibra Movimiento" data-sys="Juegos de MiVibra · vallas, bolos y tenis de mesa" style="--c:#8E5CF7"><i class="gx-n">2</i><span class="gx-ic">' + ic('lib') + '</span><b>MiVibra Movimiento</b></button>');
    var rec = (MV.load('recentGames', []) || []).filter(function (r) { return all.some(function (x) { return x.path === r.path; }); }).slice(0, 14);
    return topBar() +
      '<section class="gx-home">' +

      (all.length || nat.length ? '<div class="crow gx-cards">' + cards.join('') + '</div><div class="gx-dots" id="gxDots"></div><div class="gx-sysname"><span class="gx-sysic" id="gxSysIc"></span><b id="ctitle"></b><span id="csys"></span></div>'
        : '<div class="crow gx-cards">' + (MV.VIEWS && MV.VIEWS.movimiento ? '<button class="cf gx-card" data-act="mvm" data-title="MiVibra Movimiento" data-sys="Juegos de MiVibra · vallas, bolos y tenis de mesa" style="--c:#8E5CF7"><span class="gx-ic">' + ic('lib') + '</span><b>MiVibra Movimiento</b></button>' : '') + '<button class="cf gx-card" data-act="scan" data-title="Buscar juegos" data-sys="Conecta tu USB y presiona OK" style="--c:#FF6900"><span class="gx-ic">' + ic('usb') + '</span><b>Buscar juegos</b></button><button class="cf gx-card" data-act="send" data-title="Enviar desde el celular" data-sys="Pasa juegos por WiFi" style="--c:#4C8DFF"><span class="gx-ic">' + ic('send') + '</span><b>Desde el celular</b></button></div><div class="gx-sysname"><b id="ctitle"></b><span id="csys"></span></div>') +
      (rec.length ? '<h4 class="clabel">Jugados recientemente</h4><div class="crow gx-recent">' + rec.map(function (r) { return tile(r, false); }).join('') + '</div>' : '') +
      '</section><p id="cdesc" hidden></p>' + hints('Salir');
  }

  // ---------- Juegos: carátulas en fila, el juego elegido llena el fondo; abajo su nombre y capturas ----------
  function filtered() {
    var all = roms();
    if (sysFilter === 'native') return natives().slice().sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
    var list = sysFilter === 'all' ? all : sysFilter === 'hidden' ? (roms(), (romsCache.hidden || []).concat(nativeAll().filter(function (r) { return (MV.load('gamesHiddenView', []) || []).indexOf(r.path) >= 0; }))) : sysFilter === 'fav' ? all.filter(isFav) : all.filter(function (r) { var s = MV.romSystem(r); return (s ? s.id : '?') === sysFilter; });
    if (sysFilter === 'fav') { var f = favs(); list.sort(function (a, b) { return f.indexOf(a.path) - f.indexOf(b.path); }); }
    else list = list.map(function (r) { return [title(r).toLowerCase(), r]; }).sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; }).map(function (x) { return x[1]; });
    return list;
  }
  function gamesHtml() {
    var by = bySystem(), list = filtered();
    var chip = function (id, label, n) { return '<button class="cf gx-chip' + (sysFilter === id ? ' on' : '') + '" data-act="filter" data-arg="' + id + '" data-title="' + esc(label) + '" data-sys="' + n + (n === 1 ? ' juego' : ' juegos') + '">' + esc(label) + '</button>'; };
    var chips = [chip('all', 'Todo', roms().length)];
    if (favs().length) chips.push(chip('fav', '★ Favoritos', roms().filter(isFav).length));
    systems().forEach(function (s) { if (by[s.id] || sysFilter === s.id) chips.push(chip(s.id, s.mono && s.mono.length <= 4 ? s.mono : s.name, by[s.id] ? by[s.id].length : 0)); });
    if (by['?']) chips.push(chip('?', 'Sin sistema', by['?'].length));
    if (natives().length) chips.splice(favs().length ? 2 : 1, 0, chip('native', nativeLabel(), natives().length));
    if ((romsCache.hidden || []).length || sysFilter === 'hidden') chips.push(chip('hidden', 'Ocultos', (romsCache.hidden || []).length));
    return topBar() +
      '<div class="crow gx-chips">' + chips.join('') + '</div>' +
      '<section class="gx-games">' +
      (function () {
        // Biblioteca de una consola: su logo arriba, al centro
        var sy = systems().find(function (x) { return x.id === sysFilter; });
        if (!sy) return '';
        var lg = sysLogo(sy.id);
        return '<div class="gx-libhead">' + (lg || '<span class="gx-libic">' + sysIcon(sy.id, sy.mono) + '</span>') + '<b>' + esc(sy.name) + '</b></div>';
      })() +
      (list.length ? '<div class="crow gx-covers">' + list.slice(0, 400).map(function (r) { return tile(r, false); }).join('') + '</div>'
        : '<div class="cnone"><h2>' + (sysFilter === 'fav' ? 'Aún no tienes favoritos' : 'Aún no hay juegos') + '</h2><p>' + (sysFilter === 'fav' ? 'Abre un juego y toca “Favorito”.' : 'Conecta tu USB y usa “Buscar juegos”, o “Enviar desde el celular” en Opciones.') + '</p></div>') +
      '<div class="gx-info"><div class="gx-logo" id="gxLogo"></div><b id="ctitle"></b><span id="csys"></span><p id="cdesc"></p></div>' +
      '<div class="gx-strip" id="gxStrip"></div>' +
      '</section>' + hints(delMode || editMode ? 'Terminar' : 'Consolas');
  }

  // ---------- Ficha del juego (estilo lista de consola): carátula y nombre arriba, acciones a la izquierda, datos a la derecha ----------
  var STATUS = ['Sin estado', 'Por jugar', 'Jugando', 'Terminado', 'Completado al 100%', 'Abandonado'];
  function gStatus(r) { return (MV.load('gameStatus', {}) || {})[r.path] || 0; }
  function setStatus(r, n) { var o = MV.load('gameStatus', {}) || {}; if (n) o[r.path] = n; else delete o[r.path]; MV.save('gameStatus', o); }
  function gTime(r) { return (MV.load('gameTime', {}) || {})[r.path] || { ms: 0, n: 0, last: 0 }; }
  function isHidden(r) { return (MV.load('gamesHiddenView', []) || []).indexOf(r.path) >= 0; }
  function setHidden(r, on) { var h = (MV.load('gamesHiddenView', []) || []).filter(function (x) { return x !== r.path; }); if (on) h.push(r.path); MV.save('gamesHiddenView', h); romsCache.raw = null; }
  function fmtTime(ms) { var m = Math.round(ms / 60000); if (m < 1) return 'Menos de 1 min'; var h = Math.floor(m / 60); return h ? h + ' h ' + (m % 60) + ' min' : m + ' min'; }
  function ago(ts) {
    if (!ts) return ''; var d = Math.floor((Date.now() - ts) / 86400000);
    if (d <= 0) { var h = Math.floor((Date.now() - ts) / 3600000); return h <= 0 ? 'Hace un momento' : 'Hace ' + h + (h === 1 ? ' hora' : ' horas'); }
    return d === 1 ? 'Ayer' : d < 30 ? 'Hace ' + d + ' días' : new Date(ts).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  // Tiempo jugado: se cuenta desde que se abre el juego hasta que la app vuelve a verse
  var playing = null;
  function startPlay(r) { playing = { path: r.path, t: Date.now() }; var o = MV.load('gameTime', {}) || {}, g = o[r.path] || { ms: 0, n: 0 }; g.last = Date.now(); o[r.path] = g; MV.save('gameTime', o); }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden || !playing) return;
    var dt = Date.now() - playing.t, path = playing.path; playing = null;
    if (dt < 20000) return;   // abrió y salió enseguida
    if (MV.ach) try { MV.ach.onGame(Math.min(dt, 8 * 3600000)); } catch (e) {}
    var o = MV.load('gameTime', {}) || {}, g = o[path] || { ms: 0, n: 0 };
    g.ms += Math.min(dt, 8 * 3600000); g.n++; g.last = Date.now(); o[path] = g; MV.save('gameTime', o);
    if (gStatus({ path: path }) === 0 || gStatus({ path: path }) === 1) setStatus({ path: path }, 2);
    if (box && tab === 'detail') render('.gx-play');
  });
  var CHEV = '<svg class="gx-chev" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>';
  var DI = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg>',
    flag: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 3h2v18H5zM8 4h11l-2.5 4L19 12H8z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.4-9.3-9C1 8.6 3.2 5 6.6 5c2 0 3.4 1.1 4.1 2.3h2.6C14 6.1 15.4 5 17.4 5 20.8 5 23 8.6 21.3 12 19 16.6 12 21 12 21z"/></svg>',
    tune: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
    pad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="6" width="18" height="12" rx="3"/><path d="M8 10v4M6 12h4M16 11h.01M18 13h.01"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-2.6 3.2M6.5 7.4A16.7 16.7 0 0 0 3 12s4 6 9 6a9 9 0 0 0 4-1"/></svg>'
  };
  function drow(act, icon, label, right, extra) {
    return '<div class="crow gx-drow"><button class="cf gx-di' + (extra || '') + '" data-act="' + act + '"><i class="gx-dic">' + DI[icon] + '</i><span class="gx-dl">' + label + '</span>' + (right || '') + '</button></div>';
  }
  function sw(on) { return '<span class="gx-sw' + (on ? ' on' : '') + '"><i></i></span>'; }
  function detailHtml() {
    var r = detailRom, s = MV.romSystem(r), k = 'g' + Object.keys(reg).length; reg[k] = r;
    var m = MV.gameMeta ? MV.gameMeta(r) : null; if (m && m.none) m = null;
    if (r.native) return nativeDetail(r, k);
    var where = r.drive ? 'Google Drive' : /^content:|\/storage\/(?!emulated)/.test(r.path || '') ? 'USB / carpeta' : 'En este equipo';
    var eng = s ? (MV.gameEngine(s) === 'retroarch' ? 'RetroArch' : 'Emulador de MiVibra') : '';
    var gt = gTime(r), st = gStatus(r);
    var sub = [where, eng, gt.ms ? fmtTime(gt.ms) + ' jugadas' : ''].filter(Boolean).join(' · ');
    var line2 = m ? [m.year, m.genre, m.modes].filter(Boolean).join(' · ') : '';
    var rows = [['Estado', STATUS[st]], ['Sistema', s ? s.name : 'Sin elegir'], ['Año', m && m.year], ['Género', m && m.genre], ['Desarrollador', m && m.dev], ['Editor', m && m.pub], ['Modos', m && m.modes],
      ['Última vez', ago(gt.last)], ['Tiempo jugado', gt.ms ? fmtTime(gt.ms) + (gt.n ? ' · ' + gt.n + (gt.n === 1 ? ' sesión' : ' sesiones') : '') : ''], ['Archivo', (r.name || '') + (r.size ? ' · ' + (r.size > 1048576 ? (r.size / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(r.size / 1024)) + ' KB') : '')]].filter(function (x) { return x[1]; });
    return topBar() +
      '<section class="gx-detail gx-d2">' +
      '<header class="gx-dhead"><div class="gx-dcover">' + cover(r, s) + '</div><div class="gx-dtt">' +
      '<small>JUEGO' + (s ? ' · ' + esc(s.name.toUpperCase()) : '') + '</small><div class="gx-logo" id="gxLogo"></div><h1 id="ctitle">' + esc(title(r)) + '</h1>' +
      '<p class="gx-dsub">' + esc(sub) + '</p>' + (line2 ? '<p class="gx-dsub2">' + esc(line2) + '</p>' : '') + '</div></header>' +
      '<div class="gx-dbody"><div class="gx-dlist">' +
      drow('dplay', 'play', 'Jugar', (gt.last ? '<span class="gx-dr gx-acc">' + esc(ago(gt.last)) + '</span>' : '') + CHEV, ' gx-play" data-rom="' + k + '" data-title="' + esc(title(r))) +
      drow('dstatus', 'flag', 'Estado', '<span class="gx-dsel"><i>‹</i><b>' + STATUS[st] + '</b><i>›</i></span>') +
      drow('dfav', 'heart', 'Favorito', sw(isFav(r)), isFav(r) ? ' gx-favon' : '') +
      drow('dopts', 'tune', 'Ajustes del juego', '<span class="gx-dr">Nombre, carátula, emulador</span>' + CHEV) +
      drow('dinfo', 'info', 'Ficha completa', CHEV) +
      '<div class="gx-dsec">GESTIONAR</div>' +
      drow('dsys', 'pad', 'Cambiar sistema', '<span class="gx-dr">' + esc(s ? s.name : 'Sin elegir') + '</span>' + CHEV) +
      drow('dhide', 'eye', 'Ocultar de la biblioteca', sw(isHidden(r))) +
      '</div><aside class="gx-dpanel"><div class="gx-dgrid">' + rows.map(function (x) { return '<span>' + x[0] + '</span><b>' + esc(x[1]) + '</b>'; }).join('') + '</div>' +
      '<p class="gx-desc" id="cdesc">' + esc(m && m.desc ? m.desc : '') + '</p>' +
      '<div class="gx-dsec">IMÁGENES</div><div class="crow gx-dshots" id="gxShots"></div></aside></div>' +
      '</section>' +
      '<footer class="chint gx-dhint"><span><i>OK</i>Elegir</span><span><i>‹ ›</i>Cambiar</span><span><i>☰</i>Opciones</span><span><i>⟵</i>Volver</span></footer>';
  }
  function nativeDetail(r, k) {
    var g = r.native, gt = gTime(r), st = gStatus(r);
    var inf = nativeInfo(r, function () { if (box && tab === 'detail' && detailRom === r) { var a = document.activeElement, act = a && a.getAttribute && a.getAttribute('data-act'); heroRom = null; render(act ? '[data-act="' + act + '"]' : '.gx-play'); } }) || {};
    var name = inf.name || g.name;
    var sub = ['Instalado', g.src, inf.dev, gt.ms ? fmtTime(gt.ms) + ' jugadas' : ''].filter(Boolean).join(' · ');
    var rows = [['Estado', STATUS[st]], ['Plataforma', g.src === 'Android' ? 'Android' : 'PC · ' + g.src], ['Género', inf.genre], ['Desarrollador', inf.dev], ['Editor', inf.pub && inf.pub !== inf.dev ? inf.pub : ''],
      ['Lanzamiento', inf.date], ['Valoración', inf.rating], ['Clasificación', inf.age], ['Última vez', ago(gt.last)],
      ['Tiempo jugado', gt.ms ? fmtTime(gt.ms) + (gt.n ? ' · ' + gt.n + (gt.n === 1 ? ' sesión' : ' sesiones') : '') : ''], ['Instalado', g.installed ? ago(g.installed) : '']].filter(function (x) { return x[1]; });
    var shots = (inf.shots || []).map(function (u, i) { return '<button class="cf gx-shot" data-act="shot" data-arg="' + i + '" data-title="Imagen ' + (i + 1) + '"><img loading="lazy" src="' + esc(u) + '" alt="" onerror="this.closest(\'.gx-shot\').remove()"></button>'; }).join('');
    var loading = !inf.t && (g.pkg || /^steam:/.test(g.id));
    return topBar() +
      '<section class="gx-detail gx-d2">' +
      '<header class="gx-dhead"><div class="gx-dcover">' + cover(r, null) + '</div><div class="gx-dtt">' +
      '<small>JUEGO · ' + esc(g.src.toUpperCase()) + '</small><h1 id="ctitle">' + esc(name) + '</h1><p class="gx-dsub">' + esc(sub) + '</p>' + (inf.genre ? '<p class="gx-dsub2">' + esc(inf.genre) + '</p>' : '') + '</div></header>' +
      '<div class="gx-dbody"><div class="gx-dlist">' +
      drow('dplay', 'play', 'Jugar', (gt.last ? '<span class="gx-dr gx-acc">' + esc(ago(gt.last)) + '</span>' : '') + CHEV, ' gx-play" data-rom="' + k + '" data-title="' + esc(name)) +
      drow('dstatus', 'flag', 'Estado', '<span class="gx-dsel"><i>‹</i><b>' + STATUS[st] + '</b><i>›</i></span>') +
      drow('dfav', 'heart', 'Favorito', sw(isFav(r)), isFav(r) ? ' gx-favon' : '') +
      '<div class="gx-dsec">GESTIONAR</div>' +
      drow('dhide', 'eye', 'Ocultar de la biblioteca', sw(isHidden(r))) +
      '</div><aside class="gx-dpanel"><div class="gx-dgrid">' + rows.map(function (x) { return '<span>' + x[0] + '</span><b>' + esc(x[1]) + '</b>'; }).join('') + '</div>' +
      '<p class="gx-desc" id="cdesc">' + esc(inf.desc || (loading ? 'Buscando información del juego…' : '')) + '</p>' +
      (shots ? '<div class="gx-dsec">IMÁGENES</div><div class="crow gx-dshots">' + shots + '</div>' : '') + '</aside></div></section>' +
      '<footer class="chint gx-dhint"><span><i>OK</i>Elegir</span><span><i>‹ ›</i>Cambiar</span><span><i>⟵</i>Volver</span></footer>';
  }
  function dStatus(dir) {
    var r = detailRom; if (!r) return;
    var n = (gStatus(r) + (dir === 'left' ? STATUS.length - 1 : 1)) % STATUS.length;
    setStatus(r, n); blip(700);
    var b = $('[data-act="dstatus"] .gx-dsel b', box); if (b) b.textContent = STATUS[n];
    var g = $$('.gx-dgrid b', box)[0]; if (g) g.textContent = STATUS[n];
  }

  function render(focusSel) {
    reg = {}; titles = {};
    if (tab === 'lib') tab = 'games';
    if (tab === 'detail' && !detailRom) tab = 'games';
    box.innerHTML = tab === 'home' ? homeHtml() : tab === 'games' ? gamesHtml() : tab === 'detail' ? detailHtml() : optsHtml();
    box.className = 'gxv-' + tab;
    lastCount = romsRaw().length;
    tick();
    var f = (focusSel && $(focusSel, box)) || $('.gx-cards .cf, .gx-covers .cf, .gx-play, .coptrow .cf', box) || $('.ctab.on', box);
    if (tab === 'detail') { heroRom = null; hero(detailRom); }
    if (f) focus(f, true);
  }
  function tick() {
    var c = $('#cclock', box); if (c) c.textContent = new Date().toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  }

  // ---------------- Foco y navegación ----------------
  function focus(el, quiet) {
    el.focus({ preventScroll: true });
    var row = el.closest('.crow');
    // Algunos WebView de TV ignoran preventScroll y bajan la fila: la tarjeta agrandada quedaba cortada arriba
    if (row) { row.scrollTop = 0; }
    if (row) {
      var r = el.getBoundingClientRect(), b = row.getBoundingClientRect(), pad = b.width * 0.12;
      if (r.left < b.left + pad) row.scrollLeft -= (b.left + pad - r.left);
      else if (r.right > b.right - pad) row.scrollLeft += (r.right - (b.right - pad));
    }
    var home = el.closest('.chome') || el.closest('.gx-home');
    if (home && row) { var hr = row.getBoundingClientRect(), hb = home.getBoundingClientRect(); if (hr.bottom > hb.bottom) home.scrollTop += hr.bottom - hb.bottom + 20; else if (hr.top < hb.top + 120) home.scrollTop -= (hb.top + 120 - hr.top); }
    var lib = el.closest('.clib');
    if (lib) { var sh = el.closest('.cshelf'); if (sh) lib.scrollTop += sh.getBoundingClientRect().top - lib.getBoundingClientRect().top - lib.clientHeight * 0.18; }
    var t = $('#ctitle', box), s = $('#csys', box);
    if (t && s && tab !== 'detail' && !el.classList.contains('ctab')) { t.textContent = el.getAttribute('data-title') || ''; s.textContent = (el.getAttribute('data-sys') || ''); }
    if (!quiet) blip(el.classList.contains('ctab') || el.classList.contains('copt') ? 620 : 760);
    if (el.classList.contains('gx-card')) { sysBg(el); clearTimeout(heroT); clearInterval(heroCycle); heroRom = null; return; }
    var k = el.getAttribute('data-rom');
    if (tab === 'detail') return;
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
    // La imagen del juego llena el fondo, oscurecida para que las carátulas y el texto se lean bien
    box.style.backgroundImage = 'linear-gradient(0deg, #0E0D0C 0%, rgba(14,13,12,.92) 26%, rgba(14,13,12,.55) 60%, rgba(14,13,12,.72) 100%), url("' + url.replace(/"/g, '%22') + '")';
    box.style.backgroundSize = '100% 100%, cover';
    box.style.backgroundPosition = '0 0, center top';
    box.style.backgroundRepeat = 'no-repeat';
  }
  /** Fondo de la consola elegida: su color, su ícono enorme y su nombre de marca de agua (diseño propio, sin cajas de juegos). */
  function sysBg(el) {
    if (!box || tab !== 'home') return;
    var id = el.getAttribute('data-arg'), s = systems().find(function (x) { return x.id === id; });
    var c = el.style.getPropertyValue('--c') || '#FF6900';
    box.style.backgroundImage = 'radial-gradient(90% 120% at 80% 0%, ' + c + '38, transparent 60%), radial-gradient(70% 90% at 0% 100%, ' + c + '18, transparent 60%)';
    box.style.backgroundSize = ''; box.style.backgroundPosition = ''; box.style.backgroundRepeat = '';
    var mk = $('#gxMark', box); if (mk) { mk.innerHTML = '<span class="gx-markic">' + (s ? sysIcon(s.id, s.mono) : el.querySelector('.gx-ic').innerHTML) + '</span><b>' + esc(s ? s.name : el.getAttribute('data-title')) + '</b>'; mk.style.setProperty('--c', c); }
    var si = $('#gxSysIc', box); if (si) { var lg = s ? sysLogo(s.id) : ''; si.classList.toggle('haslogo', !!lg); si.innerHTML = lg || (s ? sysIcon(s.id, s.mono) : ''); }
    var cards = $$('.gx-cards .cf', box), d = $('#gxDots', box);
    if (d && cards.length > 1) d.innerHTML = cards.map(function (x) { return '<i' + (x === el ? ' class="on"' : '') + '></i>'; }).join('');
  }
  /** Imágenes de cada juego: libretro (captura y pantalla de título) y, con clave de SteamGridDB, fondos grandes y logo. */
  function images(r, s, art) {
    var sh = MV.gameShots ? MV.gameShots(r, s) : {}, out = [];
    ((art && art.heroes) || []).forEach(function (u) { out.push(u); });
    [sh.snap, sh.title].forEach(function (u) { if (u) out.push(u); });
    return out;
  }
  function strip(r, s, art) {
    var el = $('#gxStrip', box) || $('#gxShots', box); if (!el || heroRom !== r) return;
    var imgs = images(r, s, art), det = el.id === 'gxShots';
    el.innerHTML = imgs.map(function (u, i) { return (det ? '<button class="cf gx-shot" data-act="shot" data-arg="' + i + '" data-title="Imagen ' + (i + 1) + '">' : '<span class="gx-shot">') + '<img loading="lazy" src="' + esc(u) + '" alt="" onerror="(this.closest(\'.gx-shot\')||this).remove()">' + (det ? '</button>' : '</span>'); }).join('');
    var lg = $('#gxLogo', box);
    if (lg) { lg.innerHTML = art && art.logo ? '<img src="' + esc(art.logo) + '" alt="" onload="this.parentNode.classList.add(\'on\')" onerror="this.remove()">' : ''; lg.classList.remove('on'); }
  }
  function hero(r) {
    if (!box) return;
    clearInterval(heroCycle);
    if (!r) { setHeroBg(null); heroRom = null; var d0 = $('#cdesc', box); if (d0) d0.textContent = ''; var st = $('#gxStrip', box); if (st) st.innerHTML = ''; return; }
    if (heroRom === r) return;
    heroRom = r;
    if (r.native) {
      var g = r.native, d1 = $('#cdesc', box), c1 = $('#csys', box), st1 = $('#gxStrip', box); if (st1) st1.innerHTML = '';
      if (c1) c1.textContent = 'Instalado · ' + g.src;
      var ic = niCache()[g.id] || {}, bg = ic.hero || (ic.shots && ic.shots[0]) || g.hero || (g.banner ? g.img : '');
      if (!bg) { setHeroBg(null); return; }
      var im0 = new Image(); im0.onload = function () { if (heroRom === r) setHeroBg(bg); }; im0.onerror = function () { if (heroRom === r) setHeroBg(null); }; im0.src = bg;
      return;
    }
    var s = MV.romSystem(r), sh = MV.gameShots ? MV.gameShots(r, s) : {}, ok = [sh.snap, sh.title].filter(Boolean);
    var art0 = MV.gameArtCached ? MV.gameArtCached(r, s) : null;
    if (art0 && art0.heroes && art0.heroes.length) ok = art0.heroes.slice(0, 3).concat(ok);
    strip(r, s, art0);
    if (!art0 && MV.gameArt) MV.gameArt(r, s).then(function (art) {
      if (!art || heroRom !== r || !box) return;
      strip(r, s, art);
      if (art.heroes && art.heroes.length) { ok = art.heroes.slice(0, 3).concat(ok.filter(function (u) { return art.heroes.indexOf(u) < 0; })); show(ok[0]); }
    });
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
    if ((dir === 'left' || dir === 'right') && cur.getAttribute('data-act') === 'dstatus') { dStatus(dir); return; }
    if ((dir === 'left' || dir === 'right') && tab === 'detail' && cur.closest('.gx-dlist')) { if (dir === 'right') { var sh = $('.gx-dshots .cf', box); if (sh) focus(sh); } return; }
    if (dir === 'left' && tab === 'detail' && cur.closest('.gx-dshots') && i === 0) { var pl = $('.gx-play', box); if (pl) focus(pl); return; }
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
    if (k && reg[k] && el.getAttribute('data-act') !== 'dplay') {
      if (delMode) { askDelete(reg[k]); return; } if (editMode) { options(el); return; }
      // OK abre la ficha del juego (Jugar está ahí mismo, ya enfocado)
      blip(880); detailFrom = tab; detailRom = reg[k]; tab = 'detail'; render(); return;
    }
    switch (el.getAttribute('data-act')) {
      case 'dplay': blip(990); startPlay(detailRom); if (detailRom.native) launchNative(detailRom); else MV.playRom(detailRom); break;
      case 'dfav': var on = toggleFav(detailRom); var w = el.querySelector('.gx-sw'); if (w) w.classList.toggle('on', on); el.classList.toggle('gx-favon', on); MV.toast(on ? 'Agregado a favoritos' : 'Quitado de favoritos'); break;
      case 'dstatus': dStatus('right'); break;
      case 'dopts': var pb = $('.gx-play', box); if (pb) options(pb); break;
      case 'dinfo': MV.gameInfo(detailRom, MV.romSystem(detailRom)); break;
      case 'dsys': MV.chooseSystem(detailRom); break;
      case 'dhide': var hd = !isHidden(detailRom); setHidden(detailRom, hd); var w2 = el.querySelector('.gx-sw'); if (w2) w2.classList.toggle('on', hd); MV.toast(hd ? 'Oculto: lo ves en Juegos › Ocultos' : 'Visible otra vez en la biblioteca'); break;
      case 'shot': var im = el.querySelector('img'); if (im) setHeroBg(im.src); break;
      case 'filter': sysFilter = el.getAttribute('data-arg'); render('.gx-chip.on'); break;
      case 'tab': if (tab !== el.getAttribute('data-arg')) { tab = el.getAttribute('data-arg'); editMode = delMode = false; render('.ctab.on'); } break;
      case 'sys': sysFilter = el.getAttribute('data-arg'); tab = 'games'; render(); break;
      case 'scan': (MV.ACT.scanChooser || MV.ACT.scanRoms)(); break;
      case 'mvm': close(); MV.go('movimiento'); break;
      case 'bios': MV.ACT.importBios(); break;
      case 'drive': MV.ACT.driveMenu(); break;
      case 'swapab': if (A && A.padSwap) { var on = A.padSwap(A.padSwap('get') ? 'off' : 'on'); MV.toast(on ? 'A y B intercambiados en los menús' : 'A y B como vienen de fábrica'); var sm = el.querySelector('small'); if (sm) sm.textContent = swapTxt(); } break;
      case 'engine': engines(); break;
      case 'phone': MV.ACT.remoteQR(); break;
      case 'send': MV.ACT.romsFromPhone(); break;
      case 'classic': MV.save('gamesClassic', true); close(); if (MV.rerender) MV.rerender(); break;
      case 'scrape': scrapeAll(); break;
      case 'natScan': MV.toast('Buscando juegos instalados…'); setTimeout(function () { var n = nativeAll(true).length; MV.toast(n ? n + (n === 1 ? ' juego instalado' : ' juegos instalados') : 'No encontré juegos instalados'); if (box) render(); }, 60); break;
      case 'natApps': natPicker(); break;
      case 'edit': editMode = true; delMode = false; tab = 'games'; sysFilter = 'all'; render(); if (editMode) MV.toast('Elige con OK el juego que quieres editar'); break;
      case 'del': delMode = true; editMode = false; tab = 'games'; sysFilter = 'all'; render(); if (delMode) MV.toast('Elige con OK el juego que quieres borrar'); break;
      case 'exit': close(true); break;
    }
  }

  // Android: apps que no vienen marcadas como juego (algunas tiendas no lo hacen) se pueden agregar a mano
  function natPicker() {
    var list = []; try { list = JSON.parse(A.installedGames(true) || '[]') || []; } catch (e) {}
    var extra = MV.load('nativeExtra', []) || [];
    list = list.filter(function (g) { return !g.game; }).sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
    MV._natList = list;
    MV.modal('<h2>Apps como juegos</h2><p class="muted">Marca las apps que quieres ver en Juegos. Los juegos de la tienda ya aparecen solos.</p><div class="natlist" style="max-height:55vh;overflow:auto;display:flex;flex-direction:column;gap:6px">' +
      list.map(function (g, i) { var on = extra.indexOf(g.pkg) >= 0; return '<button class="btn ghost f" style="justify-content:flex-start;gap:12px" data-act="natToggle" data-arg="' + i + '">' + (g.img ? '<img src="' + esc(g.img) + '" alt="" style="width:32px;height:32px;border-radius:8px;object-fit:cover">' : '') + '<span style="flex:1;text-align:left">' + esc(g.name) + '</span><b>' + (on ? '✓' : '') + '</b></button>'; }).join('') +
      '</div><div class="btns"><button class="btn f" data-act="natDone">Listo</button></div>');
  }
  if (MV.ACT) {
    MV.ACT.natToggle = function (i, el) {
      var g = (MV._natList || [])[+i]; if (!g) return;
      var extra = MV.load('nativeExtra', []) || [], on = extra.indexOf(g.pkg) < 0;
      extra = extra.filter(function (p) { return p !== g.pkg; }); if (on) extra.push(g.pkg); MV.save('nativeExtra', extra);
      var b = el && el.querySelector('b'); if (b) b.textContent = on ? '✓' : '';
    };
    MV.ACT.natDone = function () { MV.closeModal(true); NATIVE = null; if (box) render(); };
  }

  // Elegir con qué se juega cada consola
  function engines() {
    var ra = {}; try { ra = A ? JSON.parse(A.retroArch()) : {}; } catch (e) {}
    var have = {}; roms().forEach(function (r) { var s = MV.romSystem(r); if (s) have[s.id] = 1; });
    var list = systems().filter(function (s) { return have[s.id] || s.ra; });
    MV.modal('<h2>Emuladores</h2><p class="muted">' + (ra.installed ? 'RetroArch está instalado.' : 'RetroArch no está instalado (gratis en Play Store).') +
      ' Con RetroArch, descarga cada núcleo en RetroArch → Actualizador en línea → Descargar núcleos. Sus BIOS se copian a ' + esc(ra.bios || 'RetroArch/system') + ' al usar “Importar BIOS”.</p>' +
      list.map(function (s) {
        var e = MV.gameEngine(s), psp = s.id === 'psp', pe = psp && MV.pspEngine ? MV.pspEngine() : '';
        if (pe === 'ppsspp') e = 'ppsspp';
        var ov = A && A.overlay ? A.overlay(s.id) : -1, ovs = null;
        if (ov >= 0 && A.overlayStyles) { try { ovs = JSON.parse(A.overlayStyles(s.id)); } catch (e) {} }
        var ovName = ovs ? (ovs.cur >= ovs.n ? 'sin marco' : 'Marco ' + (ovs.cur + 1) + ' de ' + ovs.n) : (ov ? 'puesto' : 'quitado');
        return '<div class="line"><div class="t"><b>' + esc(s.name) + '</b><span>' + (e === 'ppsspp' ? 'App PPSSPP · sin marco ni menú de MiVibra' : e === 'retroarch' ? 'RetroArch · núcleo ' + esc(s.raCore || s.core) : 'Emulador de MiVibra') + (s.ra && !psp ? ' (solo RetroArch)' : '') + (ov >= 0 && e !== 'ppsspp' ? ' · ' + ovName : '') + '</span></div>' +
          (ov === 1 && e === 'retroarch' && A.raFrameAdjust ? '<button class="btn ghost sm f" data-act="raFit" data-arg="' + s.id + '">Ajustar al marco</button>' : '') +
          (ov >= 0 && e !== 'ppsspp' ? '<button class="btn ghost sm f" data-act="consoleFrame" data-arg="' + s.id + '">Cambiar marco</button>' : '') +
          (psp && A && A.ppssppInstalled && A.ppssppInstalled() ? '<button class="btn ghost sm f" data-act="consolePsp">' + (pe === 'ppsspp' ? 'Dejar la app PPSSPP' : 'Usar la app PPSSPP') + '</button>' : '') +
          (s.ra || pe === 'ppsspp' ? '' : '<button class="btn ghost sm f" data-act="consoleEngine" data-arg="' + s.id + '">' + (e === 'retroarch' ? 'Usar MiVibra' : 'Usar RetroArch') + '</button>') + '</div>';
      }).join('') + (ra.installed ? '' : '<div class="btns"><button class="btn f" data-act="consoleGetRA">Instalar RetroArch</button></div>'));
  }
  if (MV.ACT) {
    MV.ACT.consoleEngine = function (id) {
      var s = systems().find(function (x) { return x.id === id; }); if (!s) return;
      MV.setGameEngine(id, MV.gameEngine(s) === 'retroarch' ? 'interno' : 'retroarch');
      MV.closeModal(true); engines();
    };
    MV.ACT.raFit = function () {
      var st = JSON.parse(A.raFrameAdjust('get'));
      var b = function (w, l) { return '<button class="btn ghost f" data-act="raFitDo" data-arg="' + w + '">' + l + '</button>'; };
      MV.modal('<h2>Ajustar el juego al marco</h2><p class="muted">Para juegos con RetroArch. Cada toque cambia un poco; abre el juego para ver cómo quedó. Tamaño actual: ' + Math.round(st.k * 100) + '%</p>' +
        '<div class="btns" style="flex-wrap:wrap">' + b('bigger', '＋ Más grande') + b('smaller', '－ Más pequeño') + '</div>' +
        '<div class="btns" style="flex-wrap:wrap">' + b('left', '◀ Izquierda') + b('right', 'Derecha ▶') + b('up', '▲ Arriba') + b('down', 'Abajo ▼') + '</div>' +
        '<div class="btns">' + b('reset', 'Volver al ajuste automático') + '<button class="btn f" data-act="confirmNo" data-autofocus>Listo</button></div>');
    };
    MV.ACT.raFitDo = function (w) { var st = JSON.parse(A.raFrameAdjust(w)); MV.toast(w === 'reset' ? 'Ajuste automático' : 'Tamaño ' + Math.round(st.k * 100) + '% · posición ' + Math.round(st.x * 100) + ', ' + Math.round(st.y * 100)); };
    MV.ACT.consolePsp = function () { MV.setPspEngine(MV.pspEngine() === 'ppsspp' ? '' : 'ppsspp'); MV.closeModal(true); engines(); setTimeout(function () { var b = document.querySelector('[data-act="consolePsp"]'); if (b) b.focus(); }, 60); };
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
    if (r.native) {
      MV.modal('<h2>' + esc(r.native.name) + '</h2><p class="muted">Instalado · ' + esc(r.native.src) + '</p><div class="btns" style="flex-direction:column;align-items:stretch">' +
        '<button class="btn f" data-act="consolePlay">Jugar</button>' +
        '<button class="btn ghost f" data-act="consoleHide">' + (isHidden(r) ? 'Mostrar en la biblioteca' : 'Ocultar de la biblioteca') + '</button></div>');
      return;
    }
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
      if (tab === 'detail') { detailRom = null; tab = 'games'; }
      if (box) render(delMode || editMode ? '.cf.ctile' : null);
    });
  }
  if (MV.ACT) {
    MV.ACT.consolePlay = function () { MV.closeModal(true); startPlay(MV._consoleRom); if (MV._consoleRom.native) launchNative(MV._consoleRom); else MV.playRom(MV._consoleRom); };
    MV.ACT.consoleHide = function () { var r = MV._consoleRom, h = !isHidden(r); setHidden(r, h); MV.closeModal(true); MV.toast(h ? 'Oculto' : 'Visible otra vez'); render(); };
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
    tab = 'home'; delMode = false; editMode = false; detailRom = null; sysFilter = 'all'; NATIVE = null;
    box = document.createElement('div'); box.id = 'console'; box.setAttribute('role', 'application');
    document.body.appendChild(box);
    document.documentElement.classList.add('console-open');
    render();
    if (MV.driveAuto) setTimeout(MV.driveAuto, 1500);
    if (MV.syncOwnRoms) MV.syncOwnRoms();
    // Carátulas y nombres automáticos de lo nuevo, en segundo plano
    setTimeout(autoCovers, 1500);
    // Tutorial de esta pantalla (una vez por perfil; los botones nuevos salen como "Novedad")
    setTimeout(function () { if (box && !MV.modalOpen() && MV.tourRun) MV.tourRun('console'); }, 1200);
    clockT = setInterval(tick, 15000);
    // Buscar juegos, BIOS o cambio de sistema: se actualiza solo cuando cambia la lista
    watchT = setInterval(function () { if (!MV.modalOpen() && !(MV.tourOpen && MV.tourOpen()) && romsRaw().length !== lastCount) render(); }, 1500);
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
    sysFilter = 'all'; tab = 'games'; render();
    var el = $$('.gx-covers .cf', box).filter(function (e) { return reg[e.getAttribute('data-rom')] === hit.r; })[0];
    if (el) focus(el);
    MV.toast('🎤 ' + title(hit.r));
  }
  MV.console = { open: open, close: close, isOpen: function () { return !!box; }, search: voiceFind, refresh: function () { if (box && !MV.modalOpen()) render(); } };

  // Atrás: Biblioteca → Inicio → salir de Juegos
  var origBack = MV.onBack;
  MV.onBack = function () {
    if (box && !MV.modalOpen() && delMode) { delMode = false; tab = 'opts'; render('[data-act="del"]'); return true; }
    if (box && !MV.modalOpen() && editMode) { editMode = false; tab = 'opts'; render('[data-act="edit"]'); return true; }
    if (box && !MV.modalOpen() && tab === 'detail') { var dr = detailRom; tab = detailFrom === 'home' ? 'home' : 'games'; detailRom = null; render(); var t0 = $$('.ctile', box).filter(function (e) { return reg[e.getAttribute('data-rom')] === dr; })[0]; if (t0) focus(t0, true); return true; }
    if (box && !MV.modalOpen()) { if (tab !== 'home') { tab = 'home'; render(); } else close(true); return true; }
    return origBack.apply(this, arguments);
  };
  var origKey = MV.onKey;
  MV.onKey = function (k) {
    if (box && !MV.modalOpen()) {
      if (k === 'menu') { var ae = document.activeElement; if (ae && ae.getAttribute('data-rom')) options(ae); else { tab = 'opts'; render(); } return; }
      if (k === 'prevTab' || k === 'nextTab') { var T = ['home', 'games', 'opts']; tab = T[(Math.max(0, T.indexOf(tab === 'detail' ? 'games' : tab)) + (k === 'nextTab' ? 1 : 2)) % 3]; editMode = delMode = false; blip(620); render(); return; }
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
        if (a && a.getAttribute('data-rom')) okT = setTimeout(function () { if (okEl === a && !okHeld && document.activeElement === a && !MV.modalOpen()) { okHeld = true; blip(660); options(a); } }, 480);
      }
      else if (!okHeld && okEl === a && Date.now() - okAt > 600 && a && a.getAttribute('data-rom')) { okHeld = true; clearTimeout(okT); options(a); }
    }
    else if (k === 'ContextMenu') options(document.activeElement);
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  var okAt = 0, okEl = null, okHeld = false, okT = null;
  // La app avisa cuando OK lleva presionado medio segundo (hay controles de TV con los que el navegador no se entera)
  MV.okLong = function () { var a = document.activeElement; if (!box || MV.modalOpen() || okHeld || !a || !a.getAttribute('data-rom')) return; okHeld = true; okEl = a; clearTimeout(okT); blip(660); options(a); };
  // Si al soltar ya pasó el tiempo, también cuenta como mantener presionado
  function heldLong() { return okAt && Date.now() - okAt > 480; }
  window.addEventListener('keyup', function (e) {
    if (!box || (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'NumpadEnter')) return;
    clearTimeout(okT);
    // Al soltar OK después de abrir las opciones no se debe elegir nada en el menú
    if (MV.modalOpen()) { if (okHeld) { e.preventDefault(); e.stopImmediatePropagation(); } okEl = null; okHeld = false; return; }
    e.preventDefault(); e.stopImmediatePropagation();
    var a = document.activeElement;
    if (!okHeld && okEl && a === okEl && box.contains(a)) { if (heldLong() && a.getAttribute('data-rom')) { okAt = 0; options(a); } else activate(a); }
    okEl = null; okHeld = false;
  }, true);
  document.addEventListener('click', function (e) {
    if (!box || !box.contains(e.target)) return;
    var el = e.target.closest('.cf'); if (!el) return;
    e.preventDefault(); e.stopPropagation(); focus(el, true); activate(el);
  }, true);
})();
