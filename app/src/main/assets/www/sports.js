/* MiVibra TV — Deportes en vivo en Inicio: partidos de ahora (y los que empiezan pronto) con marcador,
   y el canal de tus listas que los está pasando (según la guía de programación). Datos públicos de ESPN. */
(function () {
  var MV = window.MV, D = window.MVD, S = MV.S, esc = MV.esc;
  var LEAGUES = [
    ['soccer', 'uefa.champions', 'Champions League'], ['soccer', 'uefa.europa', 'Europa League'], ['soccer', 'conmebol.libertadores', 'Libertadores'],
    ['soccer', 'conmebol.sudamericana', 'Sudamericana'], ['soccer', 'col.1', 'Liga colombiana'], ['soccer', 'esp.1', 'LaLiga'],
    ['soccer', 'eng.1', 'Premier League'], ['soccer', 'ita.1', 'Serie A'], ['soccer', 'ger.1', 'Bundesliga'], ['soccer', 'fra.1', 'Ligue 1'],
    ['soccer', 'mex.1', 'Liga MX'], ['soccer', 'arg.1', 'Liga argentina'], ['soccer', 'fifa.world', 'Mundial'], ['soccer', 'fifa.worldq.conmebol', 'Eliminatorias'],
    ['basketball', 'nba', 'NBA']
  ];
  var DATA = { ts: 0, events: [], loading: false };

  function fetchAll() {
    if (DATA.loading || Date.now() - DATA.ts < 60e3) return Promise.resolve(DATA.events);
    DATA.loading = true;
    return Promise.all(LEAGUES.map(function (lg) {
      return MV.getJSON('https://site.api.espn.com/apis/site/v2/sports/' + lg[0] + '/' + lg[1] + '/scoreboard?lang=es&region=co').then(function (j) {
        return ((j && j.events) || []).map(function (ev) { return parse(ev, lg); }).filter(Boolean);
      }).catch(function () { return []; });
    })).then(function (all) {
      var now = Date.now();
      var evs = all.reduce(function (a, b) { return a.concat(b); }, []).filter(function (e) {
        // En juego, por empezar en las próximas 4 horas o terminados hace menos de 90 minutos
        return e.state === 'in' || (e.state === 'pre' && e.start - now < 4 * 3600e3 && e.start - now > -3600e3) || (e.state === 'post' && now - e.start < 4 * 3600e3);
      });
      var rank = { 'in': 0, pre: 1, post: 2 };
      evs.sort(function (a, b) { return rank[a.state] - rank[b.state] || a.lgi - b.lgi || a.start - b.start; });
      DATA.events = evs.slice(0, 16); DATA.ts = Date.now();
      return DATA.events;
    }).then(function (e) { DATA.loading = false; return e; }, function () { DATA.loading = false; return DATA.events; });
  }
  function parse(ev, lg) {
    var c = (ev.competitions || [])[0]; if (!c) return null;
    var t = (c.competitors || []).slice().sort(function (a) { return a.homeAway === 'home' ? -1 : 1; });
    if (t.length < 2) return null;
    var st = (ev.status && ev.status.type) || {};
    function team(x) { var tm = x.team || {}; return { name: tm.shortDisplayName || tm.displayName || '', full: tm.displayName || '', logo: tm.logo || '', score: x.score != null ? String(x.score) : '' }; }
    return {
      id: ev.id, lg: lg[2], lgi: LEAGUES.indexOf(lg), sport: lg[0], start: Date.parse(ev.date) || 0,
      state: st.state || 'pre', detail: st.shortDetail || '', clock: (ev.status && ev.status.displayClock) || '',
      home: team(t[0]), away: team(t[1]),
      tv: [].concat.apply([], (c.broadcasts || []).map(function (b) { return b.names || []; })).concat((c.geoBroadcasts || []).map(function (g) { return (g.media && g.media.shortName) || ''; })).filter(Boolean)
    };
  }

  // ---------- ¿Qué canal de tus listas lo está pasando? ----------
  var SPORT_CH = /(espn|fox ?sports|tyc|d ?sports|directv ?sports|win ?sports|bein|gol ?tv|tudn|claro ?sports|sky ?sports|eurosport|dazn|tnt ?sports|movistar|caracol|rcn|azteca|televisa|tv ?azteca|telemundo|univision|paramount|star|deportes|sports|futbol|fútbol|nba|liga|champions|canal\+)/i;
  function words(n) { return MV.norm(n).split(' ').filter(function (w) { return w.length > 2 && !/^(fc|cf|club|deportivo|atletico|real|cd|sc|ac|as|ud|cf)$/.test(w); }); }
  function channelFor(e) {
    var live = MV.visible(S.live || []), now = Date.now(), from = e.state === 'pre' ? e.start : now;
    var hw = words(e.home.name).concat(words(e.home.full)), aw = words(e.away.name).concat(words(e.away.full));
    var best = null, bestSc = 0;
    for (var i = 0; i < live.length; i++) {
      var ch = live[i];
      if (!SPORT_CH.test(ch.name + ' ' + (ch.group || ''))) continue;
      var ps = MV.progsFor(ch); if (!ps.length) continue;
      for (var k = 0; k < ps.length; k++) {
        var p = ps[k]; if (p.e <= from || p.s > from + 30 * 60e3) continue;
        var t = ' ' + MV.norm((p.t || '') + ' ' + (p.d || '')) + ' ';
        var sc = (hw.some(function (w) { return t.indexOf(' ' + w + ' ') >= 0; }) ? 1 : 0) + (aw.some(function (w) { return t.indexOf(' ' + w + ' ') >= 0; }) ? 1 : 0);
        // Los dos equipos en el programa: seguro; uno solo, también vale si es un canal de deportes
        if (sc > bestSc || (sc === bestSc && sc && ch.country === 'CO' && best && best.country !== 'CO')) { best = ch; bestSc = sc; }
        break;
      }
      if (bestSc === 2 && best && best.country === 'CO') break;
    }
    if (best) return best;
    // Sin guía: el canal que nombra el organizador (ESPN, DSports…) si lo tienes
    for (var j = 0; j < e.tv.length; j++) {
      var n = MV.norm(e.tv[j]); if (n.length < 3) continue;
      var m = live.filter(function (ch) { return MV.norm(ch.name).indexOf(n) >= 0; }).sort(function (a, b) { return (b.country === 'CO') - (a.country === 'CO'); })[0];
      if (m) return m;
    }
    return null;
  }

  function line(e) {
    var h = +e.home.score, a = +e.away.score;
    if (e.state === 'pre') return 'Empieza ' + (MV.fmtTime ? MV.fmtTime(e.start) : new Date(e.start).toLocaleTimeString());
    var who = h === a ? (e.state === 'in' ? 'Van empatados' : 'Empataron') : (e.state === 'in' ? (h > a ? e.home.name : e.away.name) + ' gana' : (h > a ? e.home.name : e.away.name) + ' ganó');
    return who + ' ' + Math.max(h, a) + '-' + Math.min(h, a) + (e.state === 'in' ? ' · ' + (e.detail || e.clock) : ' · Final');
  }
  function card(e) {
    var ch = channelFor(e);
    if (ch && MV.reg) MV.reg[ch.key] = ch;
    var badge = e.state === 'in' ? '<span class="sp-live"><span class="live-dot"></span>EN VIVO</span>' : e.state === 'post' ? '<span class="sp-st">FINAL</span>' : '<span class="sp-st">HOY</span>';
    var team = function (t) { return '<div class="sp-t">' + (t.logo ? '<img src="' + esc(t.logo) + '" alt="" loading="lazy" onerror="this.remove()">' : '<i></i>') + '<b>' + esc(t.name) + '</b>' + (e.state !== 'pre' ? '<span>' + esc(t.score) + '</span>' : '') + '</div>'; };
    var act = ch ? 'data-act="play" data-key="' + esc(ch.key) + '"' : 'data-act="sportFind" data-arg="' + esc(e.home.name + ' ' + e.away.name) + '"';
    return '<button class="spcard f" ' + act + ' data-fid="sp-' + e.id + '">' +
      '<div class="sp-h">' + badge + '<small>' + esc(e.lg) + '</small></div>' + team(e.home) + team(e.away) +
      '<p>' + esc(line(e)) + '</p>' +
      '<div class="sp-ch">' + (ch ? (ch.logo ? '<img src="' + esc(MV.logoUrl ? MV.logoUrl(ch.logo) : ch.logo) + '" alt="" onerror="this.remove()">' : '') + '<span>' + (e.state === 'post' ? 'Lo pasó ' : 'En ') + esc(MV.cleanTitle ? (MV.cleanTitle(ch.name) || ch.name) : ch.name) + '</span>' : '<span class="muted">Buscar en tus canales</span>') + '</div></button>';
  }
  function rowHtml() {
    var evs = DATA.events;
    if (!evs.length) return '';
    var live = evs.filter(function (e) { return e.state === 'in'; }).length;
    return '<section class="row"><h3>' + (live ? 'Deportes en vivo' : 'Deportes de hoy') + ' <small>' + (live ? live + ' en juego' : evs.length + ' partidos') + '</small></h3><div class="strip">' + evs.map(card).join('') + '</div></section>';
  }
  /** Fila de Inicio: se dibuja con lo que haya y se actualiza sola cada minuto sin mover el foco. */
  MV.sportsRow = function () {
    if (MV.isKids && MV.isKids()) return '';
    setTimeout(refresh, 50);
    return '<div id="sportsRow">' + rowHtml() + '</div>';
  };
  function refresh() {
    fetchAll().then(function () {
      var box = document.getElementById('sportsRow'); if (!box) return;
      var html = rowHtml(); if (box.innerHTML === html) return;
      var a = document.activeElement, fid = a && box.contains(a) ? a.getAttribute('data-fid') : '';
      box.innerHTML = html;
      if (fid) { var b = box.querySelector('[data-fid="' + fid + '"]'); if (b) b.focus(); }
    });
  }
  setInterval(function () { if (document.getElementById('sportsRow')) { DATA.ts = 0; refresh(); } }, 60e3);
  MV.ACT.sportFind = function (q) { if (MV.remoteText) MV.remoteText(q); };
})();
