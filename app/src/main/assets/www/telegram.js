/* MiVibra TV · Telegram: Cursos y Mi Telegram.
   - Cursos: el superadministrador publica sus cursos desde su canal público de Telegram (y si quiere, la misma carpeta en
     Google Drive como respaldo). Se guardan en app/config.cursosExtra; las lecciones van por mensaje (canal + número),
     así cada usuario ve el video con su propia sesión de Telegram o, si no quiere iniciarla, desde Drive.
   - Mi Telegram: cada usuario inicia sesión y ve los videos de los canales y grupos que ya sigue, con buscador.
   Usa TDLib (librería oficial de Telegram) desde Tg.kt; la librería se baja la primera vez que se usa. */
(function () {
  'use strict';
  var MV = window.MV;
  if (!MV || !MV.VIEWS) return;
  var A = window.Android, esc = MV.esc || function (s) { return String(s); };
  var C = window.MV_CONFIG || {};
  var HAS = !!(A && typeof A.tgStart === 'function');
  var ST = { state: '', chats: null, items: [], next: '', kind: 'all', chat: '', q: '', busy: false, posters: {}, thumbs: {} };
  function isAdmin() { return !!(MV.acct && MV.acct.isAdmin && MV.acct.isAdmin()); }
  function st() { try { return JSON.parse(A.tgState()); } catch (e) { return { state: 'off' }; } }
  function dur(s) { s = +s || 0; var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? h + ' h ' + m + ' min' : m ? m + ' min' : s ? s + ' s' : ''; }
  function mb(b) { return b ? (b > 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : Math.round(b / 1048576) + ' MB') : ''; }

  // ---------- Iniciar sesión ----------
  var waiters = [];
  /** Deja Telegram listo (baja la librería, sesión). Resuelve true cuando se puede usar. */
  function ready() {
    if (!HAS) { MV.toast('Telegram funciona en la app instalada (TV, celular o tablet Android)', 4500); return Promise.resolve(false); }
    if (!C.tgApiId || !C.tgApiHash) { MV.toast('Falta configurar Telegram en la app (claves de my.telegram.org)', 5000); return Promise.resolve(false); }
    var s = st(); if (s.state === 'ready') return Promise.resolve(true);
    var first = !s.lib;
    if (first) MV.modal('<h2>Preparando Telegram</h2><p class="muted">La primera vez se descarga el componente de Telegram (unos 10 MB). Solo pasa una vez.</p><div class="bar"><i id="tgBar"></i></div><p class="muted" id="tgPct">Conectando…</p>');
    return MV.call('tgStart', [+C.tgApiId, String(C.tgApiHash)], function (p) {
      var b = document.getElementById('tgBar'), t = document.getElementById('tgPct'); if (b && p >= 0) b.style.width = p + '%'; if (t) t.textContent = p >= 0 ? p + '%' : 'Descargando…';
    }).then(function (r) {
      if (first) MV.closeModal(true);
      ST.state = r.state;
      if (r.state === 'ready') return true;
      return login(r);
    }).catch(function (e) { if (first) MV.closeModal(true); MV.toast(e.message || 'No se pudo abrir Telegram', 6000); return false; });
  }
  function login(r) {
    return new Promise(function (done) { waiters.push(done); step(r); });
  }
  function finish(ok) { var w = waiters; waiters = []; w.forEach(function (f) { f(ok); }); }
  function step(r) {
    var s = r.state, inf = r.info || {};
    if (s === 'ready') { MV.closeModal(true); MV.toast('Listo: Telegram conectado', 2500); return finish(true); }
    var tg = '<div style="width:56px;height:56px;border-radius:50%;background:#2AABEE;display:grid;place-items:center;margin:0 auto 10px"><svg width="28" height="28" viewBox="0 0 24 24" fill="#fff"><path d="M21.5 4.5 2.8 11.7c-1 .4-1 1.6 0 1.9l4.7 1.5 1.8 5.6c.2.7 1.1.9 1.6.4l2.6-2.4 4.8 3.5c.6.4 1.4.1 1.6-.6L23 5.8c.2-.9-.7-1.6-1.5-1.3zM9.6 14.6l-.4 4-1.4-4.4 9.6-6.1z"/></svg></div>';
    var box = function (title, sub, input, btn) {
      MV.closeModal(true);
      MV.modal(tg + '<h2 style="text-align:center">' + title + '</h2><p class="muted" style="text-align:center">' + sub + '</p>' + input +
        '<p id="tgErr" style="color:#FF8A80;min-height:20px;margin:8px 0"></p><div class="btns"><button class="btn f" data-act="tgNext">' + btn + '</button><button class="btn ghost f" data-act="tgCancel">Cancelar</button></div>');
      var i = document.querySelector('#modal input'); if (i) setTimeout(function () { i.focus(); }, 60);
    };
    if (s === 'phone') box('Ver con Telegram', 'Inicia sesión con tu número de Telegram. Solo la primera vez en este equipo. MiVibra no lee tus conversaciones: solo muestra videos y archivos de tus canales y grupos.', '<input class="in f" id="tgIn" inputmode="tel" placeholder="+57 300 000 0000" autocomplete="tel">', 'Enviar código');
    else if (s === 'code') box('Escribe el código', 'Te llegó ' + (/Sms/.test(inf.type || '') ? 'por mensaje de texto' : 'en la app de Telegram, en el chat «Telegram»') + (inf.phone ? ' (' + esc(inf.phone) + ')' : '') + '.', '<input class="in f" id="tgIn" inputmode="numeric" placeholder="12345" autocomplete="one-time-code" style="letter-spacing:.3em;text-align:center;font-size:22px">', 'Entrar');
    else if (s === 'password') box('Verificación en dos pasos', 'Tu cuenta tiene contraseña adicional.' + (inf.hint ? ' Pista: ' + esc(inf.hint) : ''), '<input class="in f" id="tgIn" type="password" placeholder="Contraseña de Telegram">', 'Entrar');
    else { MV.closeModal(true); MV.toast((inf && inf.message) || 'Telegram no está disponible ahora', 6000); finish(false); }
    ST.loginState = s;
  }
  function poll(prev, n) {
    var r = st();
    if (r.state !== prev || n > 40) return step(r);
    setTimeout(function () { poll(prev, n + 1); }, 400);
  }
  MV.ACT.tgNext = function () {
    var i = document.getElementById('tgIn'), v = i ? i.value.trim() : '', err = document.getElementById('tgErr');
    if (!v) return;
    var s = ST.loginState, m = s === 'phone' ? 'tgPhone' : s === 'code' ? 'tgCode' : 'tgPassword';
    if (s === 'phone' && v.charAt(0) !== '+') v = '+57' + v.replace(/^0+/, '');   // Colombia si no ponen indicativo
    if (err) err.textContent = 'Un momento…';
    MV.call(m, [v]).then(function () { poll(s, 0); }).catch(function (e) { if (err) err.textContent = e.message || 'No se pudo'; });
  };
  MV.ACT.tgCancel = function () { MV.closeModal(true); finish(false); };
  MV.ACT.tgLogout = function () {
    MV.confirm('¿Cerrar la sesión de Telegram en este equipo?', 'Los cursos de Telegram y Mi Telegram pedirán iniciar sesión otra vez.', 'Cerrar sesión').then(function (ok) {
      if (!ok) return; MV.call('tgLogout', []).then(function () { ST.chats = null; ST.items = []; MV.toast('Sesión de Telegram cerrada', 2500); MV.rerender(); });
    });
  };

  // ---------- Ver un video o abrir un documento ----------
  function titleOf(it) {
    var cap = String(it.caption || '').split('\n')[0].replace(/[#@]\S+/g, '').trim();
    var name = String(it.name || '').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[._]+/g, ' ').trim();
    var t = cap.length >= 3 && cap.length < 90 ? cap : name || cap || 'Video';
    return MV.cleanTitle ? (MV.cleanTitle(t) || t) : t;
  }
  function playTg(it, title, key, poster) {
    var url = A.tgStreamUrl(+it.fileId, it.name || 'video.mp4');
    if (!url) return MV.toast('No se pudo preparar el video');
    var item = { key: key || ('tg:' + it.chatId + ':' + it.msgId), name: title || titleOf(it), url: url, type: 'movie', poster: poster || it.mini || '', group: it.chat || 'Telegram' };
    MV.reg[item.key] = item;
    MV.playItem(item, true);
  }
  function openDoc(it, title) {
    MV.modal('<h2>Descargando…</h2><div class="bar"><i id="tgDl"></i></div><p class="muted" id="tgDlP">Conectando con Telegram…</p>');
    MV.call('tgFetch', [+it.fileId], function (p) { var b = document.getElementById('tgDl'), t = document.getElementById('tgDlP'); if (b && p >= 0) b.style.width = p + '%'; if (t) t.textContent = p + '%'; })
      .then(function (path) { MV.closeModal(true); if (/\.(pdf|epub|cbz|cbr|cb7)$/i.test(it.name || '') && MV.openBook) MV.openBook({ key: 'tgdoc:' + it.chatId + ':' + it.msgId, name: title || it.name, path: path, kind: 'libro', type: 'book' }); else MV.toast('Guardado: ' + (it.name || 'archivo'), 3500); })
      .catch(function (e) { MV.closeModal(true); MV.toast(e.message || 'No se pudo bajar el archivo', 5000); });
  }

  // ---------- Mi Telegram ----------
  var SER = /\b(?:s(\d{1,2})\s*[ex](\d{1,3})|(\d{1,2})x(\d{1,3})|(?:cap[ií]tulo|episodio|ep\.?|cap\.?)\s*(\d{1,3}))\b/i;
  function classify(it) {
    var t = titleOf(it), raw = (it.caption || '') + ' ' + (it.name || ''), m = SER.exec(raw);
    if (m) { var se = +(m[1] || m[3] || 1), ep = +(m[2] || m[4] || m[5]); var show = t.split(SER)[0].replace(/[-–|:·]+\s*$/, '').trim() || t; return { type: 'series', show: show, se: se, ep: ep, title: t }; }
    var y = /\b(19[3-9]\d|20[0-4]\d)\b/.exec(raw); return { type: it.dur && it.dur < 600 ? 'clip' : 'movie', title: t.replace(/\(?\b(19|20)\d{2}\b\)?/, '').trim() || t, year: y ? y[1] : '' };
  }
  function poster(c, cb) {
    var k = (c.show || c.title) + '|' + (c.year || ''); if (ST.posters[k] !== undefined) return ST.posters[k];
    ST.posters[k] = null;
    if (MV.tmdb) MV.tmdb('/search/' + (c.type === 'series' ? 'tv' : 'movie'), '&query=' + encodeURIComponent(c.show || c.title) + (c.year ? '&year=' + c.year : '')).then(function (j) {
      var r = (j.results || [])[0]; if (r && r.poster_path) { ST.posters[k] = (MV.TMDB_IMG || 'https://image.tmdb.org/t/p/') + 'w342' + r.poster_path; cb(); }
    }).catch(function () {});
    return null;
  }
  var posterT = null;
  function repaintSoon() { clearTimeout(posterT); posterT = setTimeout(function () { if (MV.viewName && MV.viewName() === 'telegram' && !MV.modalOpen()) MV.rerender(); }, 600); }

  function loadItems(more) {
    if (ST.busy) return; ST.busy = true;
    var done = function (r) { ST.busy = false; ST.items = (more ? ST.items : []).concat(r.items || []); ST.next = r.next || ''; ST.loaded = true; MV.rerender(); };
    var fail = function (e) { ST.busy = false; ST.loaded = true; MV.toast(e.message || 'No se pudo leer Telegram', 5000); MV.rerender(); };
    var both = function (pv, pd) { return Promise.all([pv, pd.catch(function () { return { items: [] }; })]).then(function (rs) {
      var docs = (rs[1].items || []).filter(function (x) { return x.kind === 'video'; });
      return { items: rs[0].items.concat(docs).sort(function (a, b) { return b.date - a.date; }), next: rs[0].next };
    }); };
    var p = ST.chat ? both(MV.call('tgChatFiles', [String(ST.chat), more ? String(ST.next || 0) : '0', 60, 'video', ST.q]), more ? Promise.resolve({ items: [] }) : MV.call('tgChatFiles', [String(ST.chat), '0', 60, 'doc', ST.q]))
      : both(MV.call('tgSearch', [ST.q, more ? ST.next : '', 'video']), more ? Promise.resolve({ items: [] }) : MV.call('tgSearch', [ST.q, '', 'doc']));
    p.then(done, fail);
  }
  MV.VIEWS.telegram = function () {
    var s = HAS ? st() : { state: 'off' };
    var head = MV.topHtml('Mi Telegram', s.state === 'ready' ? '<button class="btn ghost f sm" data-act="tgLogout">Cerrar sesión</button>' : '');
    if (s.state !== 'ready') return head + '<div class="panel glass" style="max-width:640px"><h2>Tus canales de Telegram en MiVibra</h2><p class="muted">Inicia sesión con tu Telegram y ve aquí los videos de los canales y grupos que ya sigues: películas, series, cursos y más, con buscador y «continuar viendo». Solo aparece lo de tus canales.</p><div class="btns"><button class="btn f" data-act="tgGo">Iniciar sesión con Telegram</button></div></div>';
    if (!ST.chats) { ST.chats = []; MV.call('tgChats', []).then(function (c) { ST.chats = c || []; MV.rerender(); }).catch(function () {}); }
    if (!ST.loaded && !ST.busy) setTimeout(function () { loadItems(false); }, 0);
    var groups = {}, movies = [], clips = [];
    ST.items.forEach(function (it) { var c = classify(it); it._c = c; if (c.type === 'series') (groups[c.show] = groups[c.show] || []).push(it); else if (c.type === 'movie') movies.push(it); else clips.push(it); });
    var tabs = [['all', 'Todo'], ['movies', 'Películas · ' + movies.length], ['series', 'Series · ' + Object.keys(groups).length], ['clips', 'Videos cortos · ' + clips.length]];
    var card = function (it) {
      var c = it._c, p = poster(c, repaintSoon) || it.mini || '', key = 'tg:' + it.chatId + ':' + it.msgId; MV.reg[key] = { key: key };
      return '<button class="tg-card f" data-act="tgPlay" data-arg="' + it.chatId + ':' + it.msgId + '">' + '<span class="tg-po">' + (p ? '<img src="' + esc(p) + '" alt="" loading="lazy">' : '') + '<i>' + esc(dur(it.dur)) + '</i></span><b>' + esc(c.title) + '</b><small>' + esc([c.year, it.chat].filter(Boolean).join(' · ')) + '</small></button>';
    };
    var showCard = function (name) {
      var eps = groups[name].sort(function (a, b) { return (a._c.se - b._c.se) || (a._c.ep - b._c.ep); }), p = poster(eps[0]._c, repaintSoon) || eps[0].mini || '';
      return '<button class="tg-card f" data-act="tgShow" data-arg="' + esc(name) + '"><span class="tg-po">' + (p ? '<img src="' + esc(p) + '" alt="" loading="lazy">' : '') + '<i>' + eps.length + ' cap.</i></span><b>' + esc(name) + '</b><small>' + esc(eps[0].chat || '') + '</small></button>';
    };
    var body = '';
    if (ST.kind === 'all' || ST.kind === 'movies') body += movies.length ? '<h3 class="tg-h">Películas</h3><div class="tg-grid">' + movies.map(card).join('') + '</div>' : '';
    if (ST.kind === 'all' || ST.kind === 'series') body += Object.keys(groups).length ? '<h3 class="tg-h">Series</h3><div class="tg-grid">' + Object.keys(groups).sort().map(showCard).join('') + '</div>' : '';
    if (ST.kind === 'all' || ST.kind === 'clips') body += clips.length ? '<h3 class="tg-h">Videos cortos</h3><div class="tg-grid">' + clips.map(card).join('') + '</div>' : '';
    return head +
      '<div class="booksearch"><input class="in f" id="tgQ" placeholder="Buscar en tus canales: película, serie, curso…" value="' + esc(ST.q) + '" enterkeyhint="search"></div>' +
      '<div class="chips" style="margin:10px 0">' + tabs.map(function (t) { return '<button class="chip f' + (ST.kind === t[0] ? ' on' : '') + '" data-act="tgKind" data-arg="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      ((ST.chats || []).length ? '<div class="chips scrollx" style="margin-bottom:14px"><button class="chip f' + (!ST.chat ? ' on' : '') + '" data-act="tgChat" data-arg="">Todos los canales</button>' + ST.chats.map(function (c) { return '<button class="chip f' + (String(ST.chat) === String(c.id) ? ' on' : '') + '" data-act="tgChat" data-arg="' + c.id + '">' + esc(c.title) + '</button>'; }).join('') + '</div>' : '') +
      (body || (ST.busy || !ST.loaded ? '<p class="muted">Buscando videos en tus canales…</p>' : '<p class="muted">No encontré videos' + (ST.q ? ' con «' + esc(ST.q) + '»' : '') + '. Prueba con otro nombre o elige un canal.</p>')) +
      (ST.next && !ST.busy ? '<div class="btns" style="margin-top:16px"><button class="btn ghost f" data-act="tgMore">Ver más</button></div>' : '');
  };
  MV.VIEWS.telegram.after = function () {
    var q = document.getElementById('tgQ'); if (!q || q._b) return; q._b = 1;
    q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { ST.q = q.value.trim(); ST.loaded = false; ST.items = []; loadItems(false); MV.rerender(); } });
  };
  function findItem(arg) { var p = String(arg).split(':'); return ST.items.filter(function (x) { return String(x.chatId) === p[0] && String(x.msgId) === p[1]; })[0]; }
  Object.assign(MV.ACT, {
    tgGo: function () { ready().then(function (ok) { if (ok) { ST.chats = null; ST.loaded = false; MV.rerender(); } }); },
    tgKind: function (k) { ST.kind = k; MV.rerender(); },
    tgChat: function (id) { ST.chat = id; ST.loaded = false; ST.items = []; loadItems(false); MV.rerender(); },
    tgMore: function () { loadItems(true); },
    tgPlay: function (arg) { var it = findItem(arg); if (it) playTg(it, it._c && it._c.title, null, ST.posters[(it._c.show || it._c.title) + '|' + (it._c.year || '')]); },
    tgShow: function (name) {
      var eps = ST.items.filter(function (x) { return x._c && x._c.type === 'series' && x._c.show === name; }).sort(function (a, b) { return (a._c.se - b._c.se) || (a._c.ep - b._c.ep); });
      MV.modal('<h2>' + esc(name) + '</h2><div class="tg-eps">' + eps.map(function (x) { var pr = MV.progressOf ? MV.progressOf('tg:' + x.chatId + ':' + x.msgId) : null;
        return '<button class="tg-ep f" data-act="tgPlayEp" data-arg="' + x.chatId + ':' + x.msgId + '"><b>T' + x._c.se + ' · E' + x._c.ep + '</b><span>' + esc(x._c.title) + '</span><em>' + (pr && pr.dur ? Math.round(pr.pos / pr.dur * 100) + '% · ' : '') + esc(dur(x.dur)) + '</em></button>'; }).join('') + '</div><div class="btns"><button class="btn ghost f" data-act="closeModal">Cerrar</button></div>');
    },
    tgPlayEp: function (arg) { MV.closeModal(true); MV.ACT.tgPlay(arg); }
  });

  // ---------- Cursos ----------
  function cursos() { var c = MV.acct && MV.acct.config; if (c && c.cursosExtra) { MV.save('cursosExtra', c.cursosExtra); return c.cursosExtra; } return MV.load('cursosExtra', []) || []; }
  function curso(id) { return cursos().filter(function (c) { return c.id === id; })[0]; }
  var GR = ['#ff8a3d,#c2410c', '#3b82f6,#1e3a8a', '#22c55e,#14532d', '#a855f7,#581c87', '#f43f5e,#881337', '#14b8a6,#134e4a'];
  function cover(c, i) { return '<span class="cu-cov" style="background:linear-gradient(135deg,' + GR[(i || 0) % GR.length] + ')">' + (c.portada ? '<img src="' + esc(c.portada) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + '<b>' + esc(c.nombre) + '</b></span>'; }
  function lkey(c, l) { return 'curso:' + c.id + ':' + l.m; }
  function pct(c) { var L = (c.lecciones || []).filter(function (l) { return l.k === 'video'; }); if (!L.length || !MV.progressOf) return 0; var seen = L.filter(function (l) { var p = MV.progressOf(lkey(c, l)); return p && p.dur && p.pos / p.dur > 0.9; }).length; return Math.round(seen / L.length * 100); }
  function nextLesson(c) { var L = c.lecciones || []; for (var i = 0; i < L.length; i++) { if (L[i].k !== 'video') continue; var p = MV.progressOf ? MV.progressOf(lkey(c, L[i])) : null; if (!p || !p.dur || p.pos / p.dur < 0.9) return i; } return 0; }
  MV.VIEWS.cursos = function () {
    var list = cursos();
    var last = MV.load('cursoLast', null), cur = last && curso(last.id);
    return MV.topHtml('Cursos', isAdmin() ? '<button class="btn f sm" data-act="cuNew">Publicar curso</button>' : '') +
      (cur ? '<div class="cu-hero glass">' + cover(cur, list.indexOf(cur)) + '<div class="cu-tx"><small>CONTINUAR</small><b>' + esc((cur.lecciones[nextLesson(cur)] || {}).t || cur.nombre) + '</b><span class="muted">' + esc(cur.nombre) + ' · ' + pct(cur) + '% visto</span><div class="cu-bar"><i style="width:' + pct(cur) + '%"></i></div>' +
        '<div class="btns"><button class="btn f" data-act="cuPlay" data-arg="' + esc(cur.id) + ':' + nextLesson(cur) + '">Seguir viendo</button><button class="btn ghost f" data-act="cuOpen" data-arg="' + esc(cur.id) + '">Ver lecciones</button></div></div></div>' : '') +
      (list.length ? '<div class="cu-grid">' + list.map(function (c, i) { var n = (c.lecciones || []).filter(function (l) { return l.k === 'video'; }).length, p = pct(c);
        return '<div class="cu-wrap"><button class="cu-card glass f" data-act="cuOpen" data-arg="' + esc(c.id) + '">' + cover(c, i) + '<span class="cu-m">' + n + ' lecciones' + (p ? ' · ' + p + '% visto' : '') + '</span></button>' + (isAdmin() ? '<button class="td-del f" data-act="cuDel" data-arg="' + esc(c.id) + '" aria-label="Eliminar curso">✕</button>' : '') + '</div>'; }).join('') + '</div>'
        : '<p class="muted">' + (isAdmin() ? 'Todavía no hay cursos. Toca «Publicar curso» y pega el enlace de tu canal de Telegram.' : 'Pronto habrá cursos aquí.') + '</p>');
  };
  function detail(c) {
    var i0 = nextLesson(c), n = 0;
    MV.modal('<div class="cu-det">' + cover(c, cursos().indexOf(c)) + '<div><h2>' + esc(c.nombre) + '</h2>' + (c.descripcion ? '<p class="muted">' + esc(c.descripcion) + '</p>' : '') +
      '<p class="muted" style="font-size:13px">' + (c.canal ? 'Desde Telegram (t.me/' + esc(c.canal) + ')' : '') + (c.drive ? (c.canal ? ' · ' : '') + 'también en Google Drive' : '') + '</p></div></div>' +
      '<div class="cu-ls">' + (c.lecciones || []).map(function (l, i) {
        if (l.k === 'doc') return '<button class="cu-l f" data-act="cuPlay" data-arg="' + esc(c.id) + ':' + i + '"><span class="n">PDF</span><div><b>' + esc(l.t) + '</b><span>Archivo · se abre en Lectura</span></div><em></em></button>';
        n++; var p = MV.progressOf ? MV.progressOf(lkey(c, l)) : null, d = p && p.dur && p.pos / p.dur > 0.9;
        return '<button class="cu-l f' + (i === i0 ? ' now' : '') + (d ? ' done' : '') + '" data-act="cuPlay" data-arg="' + esc(c.id) + ':' + i + '"><span class="n">' + (d ? '✓' : n) + '</span><div><b>' + esc(l.t) + '</b><span>' + (p && !d && p.pos > 30 ? 'Ibas en el minuto ' + Math.floor(p.pos / 60000) : esc(l.d || '')) + '</span></div><em>' + esc(dur(l.s)) + '</em></button>';
      }).join('') + '</div>' +
      (isAdmin() ? '<div class="btns"><button class="btn ghost f" data-act="cuEdit" data-arg="' + esc(c.id) + '">Editar lecciones</button></div>' : '') +
      '<div class="btns"><button class="btn ghost f" data-act="closeModal">Cerrar</button></div>', { onOpen: function (d) { d.style.maxWidth = '860px'; d.style.width = 'min(860px,94vw)'; var nw = d.querySelector('.cu-l.now'); if (nw) setTimeout(function () { nw.focus(); nw.scrollIntoView({ block: 'center' }); }, 80); } });
  }
  function playLesson(c, i) {
    var l = (c.lecciones || [])[i]; if (!l) return;
    MV.save('cursoLast', { id: c.id, at: Date.now() });
    var viaDrive = function () { var item = { key: lkey(c, l), name: c.nombre + ' · ' + l.t, url: l.g, type: 'movie', poster: c.portada || '', group: c.nombre }; MV.reg[item.key] = item; MV.playItem(item, true); };
    // Sin la app o sin querer iniciar sesión en Telegram: Drive (si el curso lo tiene)
    if (!HAS && l.g) return viaDrive();
    if (!c.canal) return l.g ? viaDrive() : MV.toast('Esta lección no tiene video');
    var go = function () {
      MV.call('tgPublic', [c.canal]).then(function (ch) { return MV.call('tgMessage', [String(ch.id), String(l.m)]); }).then(function (it) {
        if (!it || !it.fileId) throw new Error('No encontré esa lección en el canal (¿la borraron?)');
        if (it.kind === 'doc') return openDoc(it, l.t);
        playTg(it, c.nombre + ' · ' + l.t, lkey(c, l), c.portada || '');
      }).catch(function (e) { if (l.g) viaDrive(); else MV.toast(e.message || 'No se pudo abrir la lección', 5000); });
    };
    var s = HAS ? st() : {};
    if (s.state === 'ready') return go();
    if (l.g) {
      MV.modal('<h2>¿Cómo quieres verlo?</h2><p class="muted">Con Telegram se ve con la mejor calidad (inicias sesión una sola vez). También puedes verlo desde Google Drive.</p><div class="btns" style="flex-direction:column;align-items:stretch"><button class="btn f" data-act="cuViaTg">Iniciar sesión con Telegram</button><button class="btn ghost f" data-act="cuViaDrive">Ver desde Google Drive</button></div>');
      MV.ACT.cuViaTg = function () { MV.closeModal(true); ready().then(function (ok) { if (ok) go(); }); };
      MV.ACT.cuViaDrive = function () { MV.closeModal(true); viaDrive(); };
      return;
    }
    ready().then(function (ok) { if (ok) go(); });
  }

  // ---------- Publicar un curso (superadministrador) ----------
  var CF = null;
  function cuForm() {
    var v = function (k) { return esc(CF[k] || ''); };
    MV.modal('<h2>' + (CF.id ? 'Editar curso' : 'Publicar curso') + '</h2><p class="muted">Pega el enlace de tu canal público de Telegram. MiVibra arma las lecciones con los videos y PDF del canal, en orden. Si también tienes los videos en una carpeta de Google Drive, ponla como respaldo para quien no quiera iniciar sesión en Telegram.</p>' +
      '<label class="muted lab">Nombre del curso</label><input class="in f" id="cuf-nombre" value="' + v('nombre') + '">' +
      '<label class="muted lab">Canal de Telegram</label><input class="in f" id="cuf-canal" value="' + v('canal') + '" placeholder="t.me/micanal">' +
      '<label class="muted lab">Carpeta de Google Drive con los mismos videos (opcional)</label><input class="in f" id="cuf-drive" value="' + v('drive') + '" placeholder="https://drive.google.com/drive/folders/…">' +
      '<label class="muted lab">Portada (enlace a una imagen, opcional)</label><input class="in f" id="cuf-portada" value="' + v('portada') + '">' +
      '<label class="muted lab">Descripción</label><textarea class="in f" id="cuf-descripcion" rows="3">' + v('descripcion') + '</textarea>' +
      '<label class="muted lab">Solo los mensajes con este hashtag (opcional, para partir un canal en varios cursos)</label><input class="in f" id="cuf-tag" value="' + v('tag') + '" placeholder="#reparacion">' +
      '<p id="cuf-msg" class="muted" style="min-height:22px"></p>' +
      (CF.lecciones && CF.lecciones.length ? '<h4 class="hwh">Lecciones (' + CF.lecciones.length + ')</h4>' + CF.lecciones.map(function (l, i) {
        return '<div class="hwrow' + (l.h ? ' cu-hid' : '') + '"><span class="muted" style="min-width:34px">' + (l.k === 'doc' ? 'PDF' : i + 1) + '</span><input class="in f cu-t" data-i="' + i + '" value="' + esc(l.t) + '"><em class="muted" style="font-size:12px">' + esc(dur(l.s)) + '</em>' +
          '<button class="hwb f" data-act="cuMv" data-arg="' + i + ':-1">▲</button><button class="hwb f" data-act="cuMv" data-arg="' + i + ':1">▼</button><button class="hwb f" data-act="cuHide" data-arg="' + i + '">' + (l.h ? '↺' : '✕') + '</button></div>'; }).join('') : '') +
      '<div class="btns" style="margin-top:12px"><button class="btn ' + (CF.lecciones && CF.lecciones.length ? 'ghost ' : '') + 'f" data-act="cuRead">' + (CF.lecciones && CF.lecciones.length ? 'Volver a leer el canal' : 'Leer el canal') + '</button>' + (CF.lecciones && CF.lecciones.length ? '<button class="btn f" data-act="cuSave">Publicar para todos</button>' : '') + '<button class="btn ghost f" data-act="closeModal">Cancelar</button></div>',
      { onOpen: function (d) { d.style.maxWidth = '860px'; d.style.width = 'min(860px,94vw)'; } });
  }
  function cuRead() {
    ['nombre', 'canal', 'drive', 'portada', 'descripcion', 'tag'].forEach(function (k) { var e = document.getElementById('cuf-' + k); if (e) CF[k] = e.value.trim(); });
    [].forEach.call(document.querySelectorAll('.cu-t'), function (e) { var l = CF.lecciones[+e.getAttribute('data-i')]; if (l) l.t = e.value.trim() || l.t; });
  }
  function msg(t) { var e = document.getElementById('cuf-msg'); if (e) e.textContent = t; }
  Object.assign(MV.ACT, {
    cuOpen: function (id) { var c = curso(id); if (c) detail(c); },
    cuPlay: function (a) { var p = String(a).split(':'), c = curso(p[0]); if (!c) return; MV.closeModal(true); playLesson(c, +p[1]); },
    cuNew: function () { CF = { nombre: '', canal: '', lecciones: [] }; cuForm(); },
    cuEdit: function (id) { var c = curso(id); if (!c) return; MV.closeModal(true); CF = JSON.parse(JSON.stringify(c)); cuForm(); },
    cuDel: function (id) { var c = curso(id); if (!c) return; MV.confirm('¿Eliminar el curso «' + c.nombre + '»?', 'Deja de aparecer para todos. Los videos siguen en tu canal.', 'Eliminar').then(function (ok) { if (ok) publish(cursos().filter(function (x) { return x.id !== id; }), 'Curso eliminado'); }); },
    cuMv: function (a) { cuRead(); var p = a.split(':'), i = +p[0], j = i + (+p[1]), L = CF.lecciones; if (j < 0 || j >= L.length) return; var t = L[i]; L[i] = L[j]; L[j] = t; MV.closeModal(true); cuForm(); },
    cuHide: function (i) { cuRead(); CF.lecciones[+i].h = !CF.lecciones[+i].h; MV.closeModal(true); cuForm(); },
    cuRead: function () {
      cuRead();
      if (!CF.canal && !CF.drive) return msg('Pega el enlace del canal o de la carpeta de Drive.');
      var fromTg = CF.canal ? ready().then(function (ok) {
        if (!ok) throw new Error('Inicia sesión en Telegram para leer el canal');
        msg('Leyendo el canal…');
        return MV.call('tgPublic', [CF.canal]).then(function (ch) { CF.canal = ch.username; if (!CF.nombre) CF.nombre = ch.title; return MV.call('tgHistory', [String(ch.id), 3000]); });
      }) : Promise.resolve([]);
      fromTg.then(function (msgs) {
        var tag = (CF.tag || '').toLowerCase();
        var L = (msgs || []).filter(function (m) { return (m.kind === 'video' || m.kind === 'doc') && (!tag || String(m.caption || '').toLowerCase().indexOf(tag) >= 0); }).map(function (m) {
          return { m: m.msgId, k: m.kind, t: titleOf(m), d: String(m.caption || '').split('\n').slice(1).join(' ').slice(0, 120), s: m.dur || 0 };
        });
        if (!CF.drive) return L;
        msg('Leyendo la carpeta de Drive…');
        return (MV.cloudFiles ? MV.cloudFiles(CF.drive, /\.(mp4|mkv|webm|mov|m4v|avi)$/i) : Promise.resolve([])).then(function (files) {
          files.sort(function (a, b) { return String(a.file || a.title).localeCompare(String(b.file || b.title), 'es', { numeric: true }); });
          if (!L.length) return files.map(function (f, i) { return { m: 'd' + i, k: 'video', t: titleOf({ name: f.file || f.title }), g: f.url, s: 0 }; });
          var vids = L.filter(function (l) { return l.k === 'video'; }); files.forEach(function (f, i) { if (vids[i]) vids[i].g = f.url; });
          return L;
        });
      }).then(function (L) {
        // se conservan los nombres y lo oculto de antes
        var old = {}; (CF.lecciones || []).forEach(function (l) { old[l.m] = l; });
        CF.lecciones = L.map(function (l) { var o = old[l.m]; return o ? Object.assign(l, { t: o.t, h: o.h }) : l; });
        MV.closeModal(true); cuForm(); msg(CF.lecciones.length ? 'Encontré ' + CF.lecciones.length + ' lecciones. Revisa los nombres y el orden, y publica.' : 'No encontré videos ni PDF en ese canal.');
      }).catch(function (e) { msg(e.message || 'No se pudo leer el canal'); });
    },
    cuSave: function () {
      cuRead();
      if (!CF.nombre) return msg('Ponle nombre al curso.');
      var out = { id: CF.id || ('c-' + Date.now().toString(36)), nombre: CF.nombre, canal: CF.canal || '', drive: CF.drive || '', portada: CF.portada || '', descripcion: CF.descripcion || '', tag: CF.tag || '',
        lecciones: CF.lecciones.filter(function (l) { return !l.h; }).map(function (l) { var o = { m: l.m, k: l.k, t: l.t, s: l.s || 0 }; if (l.d) o.d = l.d; if (l.g) o.g = l.g; return o; }), at: Date.now() };
      var list = cursos().filter(function (x) { return x.id !== out.id; }); list.unshift(out);
      MV.closeModal(true); publish(list, 'Curso publicado: ' + out.nombre);
    }
  });
  function publish(list, m) {
    if (!MV.acct || !MV.acct.push) return MV.toast('Inicia sesión con la cuenta de superadministrador');
    MV.acct.push({ cursosExtra: list }).then(function () { if (MV.acct.pushError) return; if (MV.acct.config) MV.acct.config.cursosExtra = list; MV.save('cursosExtra', list); MV.toast(m, 3500); MV.rerender(); });
  }
  if (MV.on) MV.on('acct', function () { if (MV.viewName && MV.viewName() === 'cursos' && !MV.modalOpen()) MV.rerender(); });

  var css = document.createElement('style');
  css.textContent =
    '.tg-h{margin:18px 0 10px;font-size:20px}.tg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:16px}' +
    '.tg-card{display:flex;flex-direction:column;gap:6px;padding:0;border:0;background:none;color:inherit;text-align:left;font:inherit;cursor:pointer}' +
    '.tg-po{position:relative;aspect-ratio:2/3;border-radius:14px;overflow:hidden;background:linear-gradient(160deg,var(--glass),rgba(255,255,255,.02));border:1px solid var(--line)}.tg-po img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover}' +
    '.tg-po i{position:absolute;right:6px;bottom:6px;font-style:normal;font-size:11px;font-weight:700;padding:2px 7px;border-radius:999px;background:rgba(0,0,0,.6);color:#fff}' +
    '.tg-card b{font-size:14px;line-height:1.2}.tg-card small{font-size:12px;opacity:.7}.tg-card:focus .tg-po{outline:3px solid var(--accent);outline-offset:2px}' +
    '.tg-eps{display:flex;flex-direction:column;gap:6px;max-height:60vh;overflow:auto}.tg-ep{display:grid;grid-template-columns:90px 1fr auto;gap:10px;align-items:center;padding:10px 12px;border-radius:12px;border:1px solid var(--line);background:var(--glass);color:inherit;text-align:left;font:inherit}.tg-ep em{font-style:normal;font-size:12px;opacity:.7}' +
    '.cu-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}.cu-wrap{position:relative}.cu-wrap .td-del{position:absolute;right:8px;top:8px;width:34px;height:34px;border-radius:50%;border:1px solid var(--line);background:rgba(0,0,0,.55);color:#fff}' +
    '.cu-card{width:100%;padding:0;border-radius:18px;overflow:hidden;display:flex;flex-direction:column;color:inherit;text-align:left;font:inherit;border:1px solid var(--line)}.cu-m{padding:10px 12px;font-size:13px;opacity:.8}' +
    '.cu-cov{position:relative;display:flex;align-items:flex-end;aspect-ratio:16/9;width:100%;padding:12px;color:#fff;overflow:hidden}.cu-cov img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover}.cu-cov b{position:relative;font-size:17px;line-height:1.15;text-shadow:0 2px 8px rgba(0,0,0,.5)}' +
    '.cu-hero{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);border-radius:22px;overflow:hidden;margin-bottom:18px}.cu-hero .cu-cov{aspect-ratio:auto;min-height:200px}.cu-tx{padding:18px 20px;display:flex;flex-direction:column;gap:8px;justify-content:center}.cu-tx small{letter-spacing:.14em;font-weight:800;font-size:11px}.cu-tx b{font-size:22px;line-height:1.15}' +
    '.cu-bar{height:6px;border-radius:9px;background:rgba(255,255,255,.18);overflow:hidden}.cu-bar i{display:block;height:100%;background:var(--accent)}' +
    '.cu-det{display:grid;grid-template-columns:minmax(0,260px) 1fr;gap:18px;align-items:start;margin-bottom:12px}.cu-det .cu-cov{border-radius:14px}' +
    '.cu-ls{display:flex;flex-direction:column;gap:4px;max-height:52vh;overflow:auto}.cu-l{display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px 12px;border-radius:14px;border:1px solid transparent;background:none;color:inherit;text-align:left;font:inherit}' +
    '.cu-l .n{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:12px;background:rgba(255,255,255,.1)}.cu-l.done .n{background:#e9ecef;color:#23262a}.cu-l.now{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.3)}' +
    '.cu-l b{display:block;font-size:15px}.cu-l span{font-size:13px;opacity:.75}.cu-l em{font-style:normal;font-size:13px;opacity:.7;white-space:nowrap}.cu-l:focus{outline:3px solid var(--accent)}' +
    '.lab{display:block;margin:10px 0 4px;font-size:13px}.cu-hid{opacity:.45}' +
    '@media (max-width:760px){.cu-hero,.cu-det{grid-template-columns:1fr}}';
  document.head.appendChild(css);
})();
