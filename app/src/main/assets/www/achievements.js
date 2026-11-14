/* MiVibra TV — Logros y niveles, tráileres dentro de la app y comentarios de los usuarios.
   - Logros: cada perfil gana experiencia (XP) por películas y capítulos terminados, series completas, minutos de juego
     y tiempo usando la app. Se guarda en los datos del perfil, así que viaja con la cuenta a todos los equipos.
   - Tráiler: se busca en TMDB (si hay clave) o en Cinemeta, y se ve con el reproductor oficial de YouTube dentro de MiVibra.
   - Comentarios: cualquier usuario los envía desde Ajustes; el superadministrador los lee en Ajustes › Comentarios de usuarios. */
(function () {
  'use strict';
  var MV = window.MV, D = window.MVD, S = MV.S, P = S.prefs, IC = D.ICON, esc = MV.esc, A = MV.A;

  // ================= Logros y niveles =================
  var XP = { movie: 100, episode: 30, series: 300, game5: 15, app5: 5, day: 20, trailer: 5, feedback: 50, badge: 50 };
  var APP_DAY_CAP = 60;   // XP máxima por día solo por tener la app abierta
  var TITLES = [[1, 'Novato'], [3, 'Espectador'], [6, 'Cinéfilo'], [10, 'Maratonista'], [15, 'Experto'], [20, 'Leyenda'], [30, 'Leyenda MiVibra']];
  var BADGES = [
    ['movie1', 'Primera función', 'Termina tu primera película', 'movies', 1, 'movie'],
    ['movie10', 'Cinéfilo', 'Termina 10 películas', 'movies', 10, 'movie'],
    ['movie50', 'Butaca de oro', 'Termina 50 películas', 'movies', 50, 'movie'],
    ['movie100', 'Crítico de cine', 'Termina 100 películas', 'movies', 100, 'movie'],
    ['ep1', 'Primer capítulo', 'Termina tu primer capítulo', 'episodes', 1, 'series'],
    ['ep25', 'Maratón', 'Termina 25 capítulos', 'episodes', 25, 'series'],
    ['ep100', 'Sin dormir', 'Termina 100 capítulos', 'episodes', 100, 'series'],
    ['ep500', 'Adicto a las series', 'Termina 500 capítulos', 'episodes', 500, 'series'],
    ['ser1', 'Final de temporada', 'Termina una serie completa', 'seriesDone', 1, 'trophy'],
    ['ser5', 'Coleccionista', 'Termina 5 series completas', 'seriesDone', 5, 'trophy'],
    ['ser20', 'Leyenda de las series', 'Termina 20 series completas', 'seriesDone', 20, 'trophy'],
    ['game15', 'Calentando', 'Juega 15 minutos', 'gameMin', 15, 'games'],
    ['game60', 'Jugador', 'Juega 1 hora', 'gameMin', 60, 'games'],
    ['game600', 'Gamer de verdad', 'Juega 10 horas', 'gameMin', 600, 'games'],
    ['game3000', 'Maestro del control', 'Juega 50 horas', 'gameMin', 3000, 'games'],
    ['app60', 'Bienvenido a casa', 'Usa MiVibra 1 hora', 'appMin', 60, 'home'],
    ['app600', 'Habitual', 'Usa MiVibra 10 horas', 'appMin', 600, 'home'],
    ['app3000', 'De la casa', 'Usa MiVibra 50 horas', 'appMin', 3000, 'home'],
    ['streak3', 'Constante', 'Entra 3 días seguidos', 'bestStreak', 3, 'star'],
    ['streak7', 'Semana completa', 'Entra 7 días seguidos', 'bestStreak', 7, 'star'],
    ['streak30', 'Mes de película', 'Entra 30 días seguidos', 'bestStreak', 30, 'star'],
    ['trailer1', 'Avance', 'Mira tu primer tráiler', 'trailers', 1, 'trailer'],
    ['trailer20', 'Antes de decidir', 'Mira 20 tráileres', 'trailers', 20, 'trailer'],
    ['fb1', 'Tu voz cuenta', 'Envía un comentario desde Ajustes', 'feedback', 1, 'chat'],
    ['lvl5', 'Nivel 5', 'Llega al nivel 5', 'level', 5, 'trophy'],
    ['lvl10', 'Nivel 10', 'Llega al nivel 10', 'level', 10, 'trophy'],
    ['lvl20', 'Nivel 20', 'Llega al nivel 20', 'level', 20, 'trophy']
  ];
  function need(n) { return 50 * (n - 1) * n; }   // XP total para llegar al nivel n (2: 100, 3: 300, 5: 1000, 10: 4500)
  function lvlOf(xp) { var n = 1; while (xp >= need(n + 1)) n++; return n; }
  function titleOf(n) { var t = TITLES[0][1]; TITLES.forEach(function (x) { if (n >= x[0]) t = x[1]; }); return t; }
  function today() { return new Date().toDateString(); }

  function state(d) {
    d = d || MV.pdata();
    var a = d.ach || (d.ach = {});
    a.xp = a.xp || 0; a.st = a.st || {}; a.got = a.got || {}; a.seen = a.seen || {};
    ['movies', 'episodes', 'seriesDone', 'gameMin', 'appMin', 'trailers', 'feedback', 'streak', 'bestStreak'].forEach(function (k) { a.st[k] = a.st[k] || 0; });
    return { d: d, a: a };
  }
  function save(x) {
    var keys = Object.keys(x.a.seen); if (keys.length > 3000) keys.slice(0, keys.length - 2500).forEach(function (k) { delete x.a.seen[k]; });
    MV.savePdata(x.d);
  }
  var pending = [];
  /** Suma XP y revisa logros. why: texto corto del aviso ("+100 XP · Película terminada"). */
  function gain(x, n, why) {
    if (!n) return;
    var before = lvlOf(x.a.xp);
    x.a.xp += n;
    if (why) pending.push({ k: 'xp', t: '+' + n + ' XP', s: why });
    var after = lvlOf(x.a.xp);
    if (after > before) pending.push({ k: 'lvl', t: '¡Subiste a nivel ' + after + '!', s: titleOf(after) });
  }
  function check(x) {
    var lv = lvlOf(x.a.xp), loop = true;
    while (loop) {
      loop = false;
      BADGES.forEach(function (b) {
        if (x.a.got[b[0]]) return;
        var v = b[3] === 'level' ? lv : x.a.st[b[3]] || 0;
        if (v >= b[4]) { x.a.got[b[0]] = Date.now(); pending.push({ k: 'badge', t: '¡Logro desbloqueado!', s: b[1], ic: b[5] }); gain(x, XP.badge, ''); lv = lvlOf(x.a.xp); loop = true; }
      });
    }
  }
  function commit(x) { check(x); save(x); flush(); }
  function touchDay(x) {
    var t = today();
    if (x.a.day === t) return;
    var y = new Date(Date.now() - 86400000).toDateString();
    x.a.st.streak = x.a.day === y ? x.a.st.streak + 1 : 1;
    x.a.st.bestStreak = Math.max(x.a.st.bestStreak, x.a.st.streak);
    x.a.day = t;
    gain(x, XP.day, x.a.st.streak > 1 ? 'Racha de ' + x.a.st.streak + ' días' : 'Visita del día');
  }

  // ---- Avisos (vidrio arriba, uno tras otro) ----
  var showing = false;
  function flush() {
    if (showing || !pending.length) return;
    // Los +XP seguidos se juntan en un solo aviso
    var it = pending.shift();
    if (it.k === 'xp') { var sum = parseInt(it.t.slice(1), 10), why = it.s; while (pending.length && pending[0].k === 'xp') { var n = pending.shift(); sum += parseInt(n.t.slice(1), 10); why = n.s || why; } it.t = '+' + sum + ' XP'; it.s = why; }
    showing = true;
    var el = document.createElement('div');
    el.className = 'achtoast ' + it.k;
    el.innerHTML = '<span class="achic">' + (it.k === 'xp' ? '<b>XP</b>' : IC[it.ic || 'trophy'] || IC.trophy) + '</span><div><b>' + esc(it.t) + '</b><span>' + esc(it.s || '') + '</span></div>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('on'); });
    setTimeout(function () { el.classList.remove('on'); setTimeout(function () { el.remove(); showing = false; flush(); }, 400); }, it.k === 'xp' ? 2200 : 3800);
  }

  // ---- Lo que da XP ----
  function finished(r) { return r && r.duration > 0 && (r.position / r.duration >= 0.9 || r.duration - r.position < 240000); }
  var ach = MV.ach = {
    level: function () { var x = state(); var n = lvlOf(x.a.xp); return { n: n, title: titleOf(n), xp: x.a.xp, from: need(n), to: need(n + 1) }; },
    /** Al cerrar el reproductor: películas y capítulos terminados (los capítulos que pasaron solos en la misma sesión también cuentan). */
    onWatched: function (ctx, r) {
      if (!ctx || ctx.noRecord || r.live || !ctx.item || ctx.item.adult) return;
      var x = state(), it = ctx.item, got = false;
      if (ctx.episodes && ctx.episodes.length) {
        var idx = r.index || 0, start = ctx.start || 0, last = ctx.episodes.length - 1;
        for (var i = 0; i <= idx; i++) {
          if (i === idx && !finished(r)) break;
          var e = ctx.episodes[start + i]; if (!e) continue;
          var k = it.key + '#' + e.season + 'x' + e.ep;
          if (x.a.seen[k]) continue;
          x.a.seen[k] = 1; x.a.st.episodes++; gain(x, XP.episode, 'Capítulo terminado'); got = true;
          if (start + i === last && !x.a.seen['S:' + it.key]) { x.a.seen['S:' + it.key] = 1; x.a.st.seriesDone++; gain(x, XP.series, 'Serie terminada: ' + (MV.cleanTitle ? MV.cleanTitle(it.name) : it.name)); }
        }
      } else if (ctx.list && ctx.list.length) {
        return;   // listas de canales o música: cuenta como tiempo en la app
      } else if (it.type !== 'live' && finished(r)) {
        if (!x.a.seen[it.key]) { x.a.seen[it.key] = 1; x.a.st.movies++; gain(x, XP.movie, 'Película terminada'); got = true; }
      }
      if (got) { touchDay(x); commit(x); }
    },
    /** Minutos de juego (cada 5 minutos da XP). */
    onGame: function (ms) {
      var m = Math.floor((ms || 0) / 60000); if (m < 1) return;
      var x = state(), old = x.a.st.gameMin;
      x.a.st.gameMin += m;
      var blocks = Math.floor(x.a.st.gameMin / 5) - Math.floor(old / 5);
      touchDay(x);
      if (blocks > 0) gain(x, blocks * XP.game5, m + ' min jugando');
      commit(x);
    },
    onTrailer: function (key) { var x = state(); x.a.st.trailers++; if (!x.a.seen['T:' + key]) { x.a.seen['T:' + key] = 1; gain(x, XP.trailer, 'Tráiler'); } commit(x); },
    onFeedback: function () { var x = state(); x.a.st.feedback++; if (x.a.st.feedback === 1) gain(x, XP.feedback, 'Gracias por tu comentario'); commit(x); },
    badges: BADGES
  };

  // Tiempo usando la app: cada minuto con la app a la vista y alguien usándola (tocó algo en los últimos 10 minutos)
  var lastInput = Date.now();
  ['keydown', 'pointerdown', 'touchstart', 'wheel'].forEach(function (ev) { window.addEventListener(ev, function () { lastInput = Date.now(); }, { passive: true, capture: true }); });
  setInterval(function () {
    if (document.hidden || Date.now() - lastInput > 600000 || !S.pid || (MV.introShowing && MV.introShowing())) return;
    var x = state();
    x.a.st.appMin++;
    touchDay(x);
    if (x.a.st.appMin % 5 === 0) {
      var t = today(); if (!x.a.appDay || x.a.appDay.d !== t) x.a.appDay = { d: t, xp: 0 };
      if (x.a.appDay.xp < APP_DAY_CAP) { x.a.appDay.xp += XP.app5; gain(x, XP.app5, ''); }
    }
    check(x); save(x); flush();
  }, 60000);

  // ---- Pantalla de Logros ----
  var STAT = [['movies', 'Películas', 'movie'], ['episodes', 'Capítulos', 'series'], ['seriesDone', 'Series completas', 'trophy'], ['gameMin', 'Minutos jugando', 'games'], ['appMin', 'Minutos en MiVibra', 'home'], ['bestStreak', 'Mejor racha (días)', 'star']];
  MV.VIEWS.achievements = function () {
    var x = state(), L = ach.level(), pct = Math.min(100, Math.round((L.xp - L.from) / Math.max(1, L.to - L.from) * 100));
    var got = BADGES.filter(function (b) { return x.a.got[b[0]]; }).length;
    var R = 52, C = 2 * Math.PI * R;
    return MV.topHtml('Logros') +
      '<div class="achhead glass"><div class="achring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="' + R + '" class="bg"/><circle cx="60" cy="60" r="' + R + '" class="fg" style="stroke-dasharray:' + C.toFixed(1) + ';stroke-dashoffset:' + (C * (1 - pct / 100)).toFixed(1) + '"/></svg><div><small>NIVEL</small><b>' + L.n + '</b></div></div>' +
      '<div class="achinfo"><h2>' + esc(L.title) + '</h2><p>' + L.xp.toLocaleString('es-CO') + ' XP · faltan ' + (L.to - L.xp).toLocaleString('es-CO') + ' para el nivel ' + (L.n + 1) + '</p><div class="achbar"><i style="width:' + pct + '%"></i></div>' +
      '<p class="muted">' + got + ' de ' + BADGES.length + ' logros · racha actual: ' + x.a.st.streak + (x.a.st.streak === 1 ? ' día' : ' días') + '</p></div></div>' +
      '<div class="achstats">' + STAT.map(function (s) { return '<div class="achstat glass"><span class="achsi">' + (IC[s[2]] || '') + '</span><b>' + (x.a.st[s[0]] || 0).toLocaleString('es-CO') + '</b><span>' + s[1] + '</span></div>'; }).join('') + '</div>' +
      '<h2 class="rowh">Medallas</h2><div class="achgrid">' + BADGES.map(function (b) {
        var on = !!x.a.got[b[0]], v = b[3] === 'level' ? L.n : x.a.st[b[3]] || 0, p = Math.min(100, Math.round(v / b[4] * 100));
        return '<button class="achb glass f' + (on ? ' on' : '') + '" data-act="achInfo" data-arg="' + b[0] + '"><span class="achmed">' + (IC[b[5]] || IC.trophy) + '</span><b>' + esc(b[1]) + '</b><span>' + esc(b[2]) + '</span>' +
          (on ? '<em>Desbloqueado</em>' : '<i class="achp"><i style="width:' + p + '%"></i></i><em>' + Math.min(v, b[4]).toLocaleString('es-CO') + ' / ' + b[4].toLocaleString('es-CO') + '</em>') + '</button>';
      }).join('') + '</div>' +
      '<div class="panel glass"><h2>¿Cómo se gana XP?</h2><p>Película terminada +' + XP.movie + ' · capítulo +' + XP.episode + ' · serie completa +' + XP.series + ' · cada 5 minutos jugando +' + XP.game5 + ' · cada 5 minutos usando la app +' + XP.app5 + ' (hasta ' + APP_DAY_CAP + ' al día) · visita diaria +' + XP.day + ' · cada medalla +' + XP.badge + '.</p></div>';
  };
  MV.ACT.achInfo = function (id) {
    var b = BADGES.find(function (x) { return x[0] === id; }); if (!b) return;
    var x = state(), at = x.a.got[id];
    MV.toast(b[1] + ': ' + (at ? 'desbloqueado el ' + new Date(at).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : b[2]), 3500);
  };

  // ================= Tráileres =================
  function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function fromTmdb(type, id) {
    if (!P.tmdbKey || !id) return Promise.reject();
    return MV.tmdb('/' + type + '/' + id + '/videos', '&include_video_language=es,en,null').then(function (j) {
      var v = (j.results || []).filter(function (x) { return x.site === 'YouTube' && /Trailer|Teaser/.test(x.type); });
      v.sort(function (a, b) { return (b.iso_639_1 === 'es') - (a.iso_639_1 === 'es') || (b.type === 'Trailer') - (a.type === 'Trailer') || (b.official === true) - (a.official === true); });
      if (!v.length) throw new Error('none');
      return v[0].key;
    });
  }
  function cineMeta(type, id) {
    return MV.getJSON('https://v3-cinemeta.strem.io/meta/' + type + '/' + id + '.json').then(function (j) {
      var m = j && j.meta || {}, t = (m.trailerStreams || [])[0];
      var yt = t && t.ytId || ((m.trailers || []).filter(function (x) { return !x.type || /trailer/i.test(x.type); })[0] || {}).source;
      if (!yt) throw new Error('none');
      return yt;
    });
  }
  function fromCinemeta(it) {
    var type = it.type === 'series' ? 'series' : 'movie';
    var imdb = ((it.st && it.st.id) || it.imdb || '').match(/tt\d+/);
    if (imdb) return cineMeta(type, imdb[0]);
    var name = MV.cleanTitle ? MV.cleanTitle(it.name) : it.name;
    return MV.getJSON('https://v3-cinemeta.strem.io/catalog/' + type + '/top/search=' + encodeURIComponent(name) + '.json').then(function (j) {
      var ms = (j && j.metas) || [], n = norm(name);
      var m = ms.filter(function (x) { return norm(x.name) === n && (!it.year || !x.releaseInfo || String(x.releaseInfo).indexOf(String(it.year)) === 0); })[0] || ms.filter(function (x) { return norm(x.name) === n; })[0] || ms[0];
      if (!m || !m.id) throw new Error('none');
      return cineMeta(type, m.id);
    });
  }
  function findTrailer(it) {
    var type = it.type === 'series' ? 'tv' : 'movie', tid = String(it.tid || '').split(':');
    var first = tid[1] ? fromTmdb(tid[0] === 'tv' ? 'tv' : 'movie', tid[1]) : MV.idbGet('meta2:' + it.key).then(function (c) { var m = c && c.data; if (!m || !m.tmdbId) throw new Error('none'); return fromTmdb(type, m.tmdbId); });
    return first.catch(function () { return fromCinemeta(it); });
  }
  var tr = null;
  function ytCmd(f) { if (!tr) return; try { tr.d.querySelector('iframe').contentWindow.postMessage(JSON.stringify({ event: 'command', func: f, args: [] }), '*'); } catch (e) {} }
  function openTrailer(id, it) {
    var origin = /^https?:/.test(location.protocol) ? '&origin=' + encodeURIComponent(location.origin) : '';
    var html = '<div class="trwrap"><iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&enablejsapi=1&hl=es&cc_lang_pref=es' + origin + '" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen tabindex="-1" title="Tráiler"></iframe></div>' +
      '<div class="trbar"><div class="trt"><small>TRÁILER</small><b>' + esc(MV.cleanTitle ? MV.cleanTitle(it.name) : it.name) + '</b></div>' +
      '<button class="btn ghost f" data-act="trPause">Pausa</button>' + (it.type !== 'series' ? '<button class="btn f" data-act="trPlay">' + IC.play + 'Ver película</button>' : '') + '<button class="btn ghost f" data-act="closeModal" data-autofocus>Cerrar</button></div>';
    MV.modal(html, {
      onOpen: function (d) { tr = { d: d, it: it, paused: false }; d.classList.add('trdlg'); document.getElementById('modal').classList.add('trm'); var c = d.querySelector('[data-autofocus]'); if (c) setTimeout(function () { c.focus(); }, 0); },
      onClose: function () { tr = null; document.getElementById('modal').classList.remove('trm'); }
    });
    ach.onTrailer(it.key);
  }
  MV.ACT.trPause = function (_, el) { if (!tr) return; tr.paused = !tr.paused; ytCmd(tr.paused ? 'pauseVideo' : 'playVideo'); if (el) el.textContent = tr.paused ? 'Reanudar' : 'Pausa'; };
  MV.ACT.trPlay = function () { if (!tr) return; var x = tr.it; MV.closeModal(); MV.playItem(x); };
  MV.ACT.trailer = function (key) {
    var it = S.byKey[key] || (MV.reg && MV.reg[key]); if (!it) return;
    MV.toast('Buscando el tráiler…', 1800);
    findTrailer(it).then(function (id) { openTrailer(id, it); }, function () { MV.toast('No encontré el tráiler de ' + (MV.cleanTitle ? MV.cleanTitle(it.name) : it.name), 4000); });
  };

  // ================= Comentarios (feedback) =================
  var FB_TYPES = [['idea', 'Sugerencia'], ['bug', 'Algo no funciona'], ['love', 'Me gusta'], ['other', 'Otro']];
  var fbType = 'idea', fbList = null, fbBusy = false, fbErr = '';
  function db() { try { return window.firebase && firebase.apps && firebase.apps.length ? firebase.firestore() : null; } catch (e) { return null; } }
  function devName() { var d = MV.device || {}; return d.desktop ? 'PC' : d.webtv ? (window.tizen ? 'Samsung' : 'LG') : d.tv ? 'Android TV' : 'Celular / tablet'; }
  function queue() { return MV.load('fbQueue', []) || []; }
  function sendOne(f) {
    var u = MV.acct && MV.acct.user && MV.acct.user(), base = db();
    if (!base || !u) return Promise.reject(new Error('Inicia sesión con tu cuenta para enviar comentarios.'));
    f.uid = u.uid; f.email = String(u.email || '').slice(0, 200); f.name = String(u.displayName || (MV.profile() || {}).name || '').slice(0, 100);
    return base.collection('feedback').add(f);
  }
  function retryQueue() {
    var q = queue(); if (!q.length) return;
    var f = q[0];
    sendOne(Object.assign({}, f)).then(function () { MV.save('fbQueue', queue().slice(1)); retryQueue(); }, function () {});
  }
  setTimeout(retryQueue, 20000);
  MV.SETTINGS.feedback = function () {
    var admin = MV.acct && MV.acct.isAdmin && MV.acct.isAdmin();
    var form = '<div class="panel glass"><h2>Enviar comentarios</h2><p>Cuéntanos qué mejorar, qué falla o qué te gusta. Lo lee directamente el creador de MiVibra.</p>' +
      '<div class="chips">' + FB_TYPES.map(function (t) { return '<button class="chip f' + (fbType === t[0] ? ' on' : '') + '" data-act="fbType" data-arg="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<label class="field">Tu comentario<textarea class="in f" id="fbText" rows="4" maxlength="2000" placeholder="Escribe aquí… (en la TV puedes dictarlo desde el celular como control)"></textarea></label>' +
      (fbErr ? '<p style="color:#FF8A80">' + esc(fbErr) + '</p>' : '') +
      '<div class="btns"><button class="btn f" data-act="fbSend"' + (fbBusy ? ' disabled' : '') + '>' + (IC.chat || '') + (fbBusy ? 'Enviando…' : 'Enviar') + '</button></div>' +
      (queue().length ? '<p class="muted">' + queue().length + ' comentario(s) esperando conexión para enviarse.</p>' : '') + '</div>';
    if (!admin) return form;
    if (!fbList && !fbBusy) setTimeout(loadFeedback, 0);
    var list = fbList == null ? '<div class="spinner"></div>' : fbList.error ? '<p style="color:#FF8A80">' + esc(fbList.error) + '</p>' : !fbList.length ? '<p class="muted">Todavía no hay comentarios.</p>' :
      fbList.map(function (f) {
        var t = (FB_TYPES.find(function (x) { return x[0] === f.type; }) || [0, 'Comentario'])[1];
        return '<div class="fbitem glass' + (f.read ? '' : ' new') + '"><div class="fbh"><b>' + esc(t) + '</b><span>' + esc(f.name || 'Sin nombre') + (f.email ? ' · ' + esc(f.email) : '') + ' · ' + esc(f.device || '') + (f.ver ? ' · v' + esc(f.ver) : '') + ' · ' + new Date(f.at || 0).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) + '</span></div>' +
          '<p>' + esc(f.text || '') + '</p><div class="btns">' + (f.read ? '' : '<button class="btn ghost sm f" data-act="fbRead" data-arg="' + esc(f.id) + '">Marcar como leído</button>') + '<button class="btn ghost sm f" data-act="fbDel" data-arg="' + esc(f.id) + '">Borrar</button></div></div>';
      }).join('');
    var unread = fbList && fbList.length ? fbList.filter(function (f) { return !f.read; }).length : 0;
    return '<div class="panel glass"><h2>Comentarios de usuarios' + (unread ? ' · ' + unread + ' sin leer' : '') + '</h2><div class="btns" style="margin-bottom:10px"><button class="btn ghost sm f" data-act="fbReload">' + (IC.refresh || '') + 'Actualizar</button></div>' + list + '</div>' + form;
  };
  function loadFeedback() {
    var base = db(); if (!base) { fbList = { error: 'Sin conexión con la cuenta.' }; MV.rerender(); return; }
    base.collection('feedback').orderBy('at', 'desc').limit(200).get().then(function (s) {
      fbList = []; s.forEach(function (d) { fbList.push(Object.assign({ id: d.id }, d.data())); }); MV.rerender();
    }, function (e) { fbList = { error: 'No se pudieron leer los comentarios (' + (e && e.code || e) + '). Revisa que publicaste las reglas nuevas de Firestore.' }; MV.rerender(); });
  }
  Object.assign(MV.ACT, {
    fbType: function (t) { fbType = t; var tx = document.getElementById('fbText'), keep = tx ? tx.value : ''; MV.rerender(); var t2 = document.getElementById('fbText'); if (t2) t2.value = keep; },
    fbSend: function () {
      var tx = document.getElementById('fbText'), text = (tx && tx.value || '').trim();
      if (text.length < 3) { MV.toast('Escribe tu comentario primero'); if (tx) tx.focus(); return; }
      var f = { type: fbType, text: text.slice(0, 2000), device: devName(), ver: String((MV.device && MV.device.versionCode) || ''), at: Date.now() };
      fbBusy = true; fbErr = ''; MV.rerender();
      sendOne(Object.assign({}, f)).then(function () {
        fbBusy = false; MV.toast('¡Gracias! Tu comentario llegó.', 3500); ach.onFeedback(); fbList = null; MV.rerender();
      }, function (e) {
        fbBusy = false;
        var q = queue(); q.push(f); MV.save('fbQueue', q.slice(-20));
        fbErr = (e && /sesión/.test(e.message) ? e.message : 'No se pudo enviar ahora') + ' Lo guardé y se enviará solo cuando sea posible.';
        MV.rerender();
      });
    },
    fbReload: function () { fbList = null; MV.rerender(); },
    fbRead: function (id) { var base = db(); if (!base) return; base.collection('feedback').doc(id).update({ read: true }).then(function () { (fbList || []).forEach(function (f) { if (f.id === id) f.read = true; }); MV.rerender(); }, function () { MV.toast('No se pudo marcar'); }); },
    fbDel: function (id) { MV.confirm('Borrar comentario', '¿Borrar este comentario?', 'Borrar').then(function (y) { if (!y) return; var base = db(); if (!base) return; base.collection('feedback').doc(id).delete().then(function () { fbList = (fbList || []).filter(function (f) { return f.id !== id; }); MV.rerender(); }, function () { MV.toast('No se pudo borrar'); }); }); }
  });
})();
