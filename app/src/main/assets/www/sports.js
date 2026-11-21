/* MiVibra TV — Deportes: partidos de hoy y mañana con marcador, el canal de tus listas que los pasa,
   filtros por deporte, equipos favoritos, orden por tu región y aviso al celular antes de empezar.
   Datos públicos de ESPN; esports con tu clave gratuita de PandaScore. */
(function () {
  var MV = window.MV, S = MV.S, esc = MV.esc;
  var P = function () { return S.prefs || {}; };
  // [deporte ESPN, liga, nombre, categoría, países donde es "local"]
  var LEAGUES = [
    ['soccer', 'col.1', 'Liga BetPlay', 'futbol', ['CO']],
    ['soccer', 'col.copa', 'Copa BetPlay', 'futbol', ['CO']],
    ['soccer', 'fifa.friendly', 'Amistosos de selecciones', 'futbol', []],
    ['soccer', 'conmebol.libertadores', 'Libertadores', 'futbol', ['CO', 'AR', 'BR', 'CL', 'PE', 'EC', 'UY', 'PY', 'BO', 'VE']],
    ['soccer', 'conmebol.sudamericana', 'Sudamericana', 'futbol', ['CO', 'AR', 'BR', 'CL', 'PE', 'EC', 'UY', 'PY', 'BO', 'VE']],
    ['soccer', 'fifa.worldq.conmebol', 'Eliminatorias', 'futbol', ['CO', 'AR', 'BR', 'CL', 'PE', 'EC', 'UY', 'PY', 'BO', 'VE']],
    ['soccer', 'fifa.world', 'Mundial', 'futbol', []],
    ['soccer', 'uefa.champions', 'Champions League', 'futbol', ['ES', 'IT', 'DE', 'FR', 'GB']],
    ['soccer', 'uefa.europa', 'Europa League', 'futbol', ['ES', 'IT', 'DE', 'FR', 'GB']],
    ['soccer', 'esp.1', 'LaLiga', 'futbol', ['ES']],
    ['soccer', 'eng.1', 'Premier League', 'futbol', ['GB']],
    ['soccer', 'ita.1', 'Serie A', 'futbol', ['IT']],
    ['soccer', 'ger.1', 'Bundesliga', 'futbol', ['DE']],
    ['soccer', 'fra.1', 'Ligue 1', 'futbol', ['FR']],
    ['soccer', 'mex.1', 'Liga MX', 'futbol', ['MX', 'US']],
    ['soccer', 'arg.1', 'Liga argentina', 'futbol', ['AR']],
    ['soccer', 'bra.1', 'Brasileirão', 'futbol', ['BR']],
    ['soccer', 'usa.1', 'MLS', 'futbol', ['US']],
    ['soccer', 'concacaf.champions', 'Concacaf Champions', 'futbol', ['MX', 'US']],
    ['football', 'nfl', 'NFL', 'americano', ['US', 'MX']],
    ['football', 'college-football', 'Fútbol americano universitario', 'americano', ['US']],
    ['basketball', 'nba', 'NBA', 'baloncesto', ['US']],
    ['basketball', 'wnba', 'WNBA', 'baloncesto', ['US']],
    ['baseball', 'mlb', 'MLB', 'beisbol', ['US', 'VE', 'DO', 'MX']],
    ['tennis', 'atp', 'ATP', 'tenis', []],
    ['tennis', 'wta', 'WTA', 'tenis', []],
    ['hockey', 'nhl', 'NHL', 'otros', ['US']],
    ['mma', 'ufc', 'UFC', 'otros', []],
    ['racing', 'f1', 'Fórmula 1', 'otros', []]
  ];
  var CATS = [['all', 'Todos'], ['fav', 'Mis equipos'], ['futbol', 'Fútbol'], ['americano', 'Fútbol americano'], ['baloncesto', 'Baloncesto'], ['beisbol', 'Béisbol'], ['tenis', 'Tenis'], ['esports', 'Esports'], ['otros', 'Otros']];
  var DATA = MV._sports = { ts: 0, events: [], loading: false };
  var LIVEPATH = {};   // ligas con partidos en juego (solo esas se actualizan cada minuto)

  // ---------- Región ----------
  var TZC = { Bogota: 'CO', Mexico_City: 'MX', Monterrey: 'MX', Cancun: 'MX', Tijuana: 'MX', Buenos_Aires: 'AR', Cordoba: 'AR', Lima: 'PE', Santiago: 'CL', Caracas: 'VE', Guayaquil: 'EC', Montevideo: 'UY', Asuncion: 'PY', La_Paz: 'BO', Sao_Paulo: 'BR', Madrid: 'ES', London: 'GB', Rome: 'IT', Berlin: 'DE', Paris: 'FR', Santo_Domingo: 'DO', Panama: 'PA', Costa_Rica: 'CR', Guatemala: 'GT', New_York: 'US', Chicago: 'US', Denver: 'US', Los_Angeles: 'US', Phoenix: 'US' };
  function region() {
    var p = P(); if (p.sportRegion) return p.sportRegion;
    try { var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; var c = TZC[tz.split('/').pop()]; if (c) return c; } catch (e) {}
    return (p.saCountry || 'co').toUpperCase();
  }
  function lgScore(e) { if (e.cat === 'esports') return 5; var lg = LEAGUES[e.lgi]; return lg && lg[4].indexOf(region()) >= 0 ? 0 : lg && !lg[4].length ? 3 : 6; }

  // ---------- Favoritos y avisos ----------
  function favs() { return P().sportFavs || []; }
  function isFavTeam(n) { n = MV.norm(n || ''); return !!n && favs().some(function (f) { return MV.norm(f) === n; }); }
  function isFav(e) { return e.teams.some(function (t) { return isFavTeam(t.full) || isFavTeam(t.name); }); }
  function rems() { var p = P(); if (!p.sportRem) p.sportRem = {}; return p.sportRem; }
  var LEAD = 15 * 60e3;   // aviso 15 minutos antes
  function title(e) { return e.teams.length === 2 ? e.teams[0].name + ' vs ' + e.teams[1].name : e.name; }
  function addRem(e, quiet) {
    var r = rems(); if (r[e.uid]) return false;
    var ch = channelName(e);
    r[e.uid] = { at: e.start - LEAD, start: e.start, t: title(e), x: e.lg + ' · empieza a las ' + MV.fmtTime(e.start) + (ch ? ' · ' + ch : '') };
    MV.savePrefs(); scheduleLocal();
    if (!quiet) MV.toast(MV.device.tv ? 'Listo: te avisaremos en el celular (abre MiVibra en el celular una vez para activarlo)' : 'Te avisaremos 15 minutos antes', 4500);
    return true;
  }
  function delRem(uid) { var r = rems(); delete r[uid]; MV.savePrefs(); scheduleLocal(); MV.toast('Aviso quitado'); }
  /** Programa en este equipo los avisos guardados en tu cuenta (solo celular/tablet: el TV no muestra notificaciones). */
  function scheduleLocal() {
    var A = MV.A, r = rems(), now = Date.now(), done = MV.load('remDone', {}) || {}, ch = false;
    Object.keys(r).forEach(function (k) { if (r[k].start < now - 3 * 3600e3) { delete r[k]; ch = true; } });
    if (ch) MV.savePrefs(true);
    if (!A || !A.remindAt || MV.device.tv) return;
    Object.keys(done).forEach(function (k) { if (!r[k]) { try { A.remindCancel(k); } catch (e) {} delete done[k]; } });
    Object.keys(r).forEach(function (k) {
      var x = r[k]; if (done[k] === x.at || x.at < now - 60e3) return;
      try { A.remindAt(k, Math.max(x.at, now + 5000), '⚽ ' + x.t, x.x); done[k] = x.at; } catch (e) {}
    });
    MV.save('remDone', done);
  }

  // ---------- Datos ----------
  function ymd(d) { return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2); }
  function fetchLeague(lg) {
    var t = new Date(Date.now() - 86400e3), m = new Date(Date.now() + 7 * 86400e3);
    return MV.getJSON('https://site.api.espn.com/apis/site/v2/sports/' + lg[0] + '/' + lg[1] + '/scoreboard?lang=es&region=' + region().toLowerCase() + '&dates=' + ymd(t) + '-' + ymd(m)).then(function (j) {
      var out = [];
      ((j && j.events) || []).forEach(function (ev) {
        // Tenis: cada torneo trae muchos partidos dentro
        if (ev.groupings) ev.groupings.forEach(function (g) { (g.competitions || []).forEach(function (c) { var e = parse(ev, c, lg); if (e) out.push(e); }); });
        else { var e = parse(ev, (ev.competitions || [])[0], lg); if (e) out.push(e); }
      });
      // Tenis tiene cientos: solo los en juego y los próximos más cercanos
      if (lg[0] === 'tennis') out = out.filter(function (e) { return e.state === 'in' || (e.state === 'pre' && e.start - Date.now() < 6 * 3600e3); }).slice(0, 12);
      return out;
    }).catch(function () { return null; });
  }
  function parse(ev, c, lg) {
    if (!c) return null;
    var cs = c.competitors || []; if (cs.length < 2) return null;
    var st = (c.status && c.status.type) || (ev.status && ev.status.type) || {};
    function team(x) {
      var tm = x.team || x.athlete || {};
      return { name: tm.shortDisplayName || tm.displayName || tm.shortName || '', full: tm.displayName || tm.fullName || '', logo: tm.logo || (tm.flag && tm.flag.href) || (tm.headshot && tm.headshot.href) || '', score: x.score != null && typeof x.score !== 'object' ? String(x.score) : '' };
    }
    var teams = cs.length === 2 ? cs.slice().sort(function (a) { return a.homeAway === 'home' ? -1 : 1; }).map(team) : [];
    return {
      uid: 'e' + (c.id || ev.id), id: c.id || ev.id, lg: lg[2], lgi: LEAGUES.indexOf(lg), path: lg[0] + '/' + lg[1], cat: lg[3], start: Date.parse(c.date || ev.date) || 0,
      state: st.state || 'pre', detail: st.shortDetail || '', name: ev.shortName || ev.name || '',
      teams: teams, race: cs.length > 2,
      tv: [].concat.apply([], (c.broadcasts || []).map(function (b) { return b.names || []; })).concat((c.geoBroadcasts || []).map(function (g) { return (g.media && g.media.shortName) || ''; })).filter(function (x, i, a) { return x && a.indexOf(x) === i; })
    };
  }
  function fetchEsports() {
    var k = (P().pandaKey || '').trim(); if (!k) return Promise.resolve([]);
    var u = function (w) { return 'https://api.pandascore.co/matches/' + w + '?per_page=25&token=' + encodeURIComponent(k); };
    return Promise.all([MV.getJSON(u('running')).catch(function () { return []; }), MV.getJSON(u('upcoming')).catch(function () { return []; })]).then(function (r) {
      return [].concat(r[0] || [], r[1] || []).map(function (m) {
        var op = (m.opponents || []).map(function (o) { return o.opponent || {}; }); if (op.length < 2) return null;
        var sc = {}; (m.results || []).forEach(function (x) { sc[x.team_id] = x.score; });
        var str = (m.streams_list || []).filter(function (s) { return /twitch\.tv|kick\.com/.test(s.raw_url || ''); }).sort(function (a, b) { return (b.language === 'es') - (a.language === 'es') || (b.main ? 1 : 0) - (a.main ? 1 : 0); })[0];
        var sm = str && String(str.raw_url).match(/(twitch\.tv|kick\.com)\/([^/?#]+)/);
        return {
          uid: 'p' + m.id, id: 'p' + m.id, lg: ((m.videogame && m.videogame.name) || 'Esports') + ' · ' + ((m.league && m.league.name) || ''), lgi: -1, cat: 'esports',
          start: Date.parse(m.begin_at || m.scheduled_at) || 0, state: m.status === 'running' ? 'in' : m.status === 'finished' ? 'post' : 'pre', detail: m.name || '', name: m.name || '',
          teams: op.map(function (o) { return { name: o.acronym || o.name || '', full: o.name || '', logo: o.image_url || '', score: m.status === 'not_started' ? '' : String(sc[o.id] != null ? sc[o.id] : '') }; }),
          tv: [], stream: sm ? { tab: /kick/.test(sm[1]) ? 'kick' : 'twitch', ch: sm[2] } : null
        };
      }).filter(function (e) { return e && e.start - Date.now() < 36 * 3600e3; });
    });
  }
  function keep(e, now) {
    if (e.state === 'in') return true;
    var near = lgScore(e) === 0 || isFav(e);   // ligas de tu país y tus equipos: la semana completa
    if (e.state === 'pre') return e.start - now > -3 * 3600e3 && e.start - now < (near ? 7 * 86400e3 : 36 * 3600e3);
    var today = new Date(e.start).toDateString() === new Date(now).toDateString();
    return now - e.start < (near && today ? 16 * 3600e3 : 5 * 3600e3);
  }
  function order(evs) {
    var rank = { 'in': 0, pre: 1, post: 2 };
    return evs.sort(function (a, b) { return rank[a.state] - rank[b.state] || (isFav(b) - isFav(a)) || (a.state === 'pre' ? a.start - b.start : 0) || lgScore(a) - lgScore(b) || a.start - b.start; });
  }
  var BYPATH = {}, fullAt = 0;
  function fetchAll(force) {
    if (DATA.loading || (!force && Date.now() - DATA.ts < 55e3)) return Promise.resolve(DATA.events);
    DATA.loading = true;
    // Completo cada 10 minutos; entre medio solo las ligas que tienen partidos en juego (menos datos en TV box)
    var full = force || Date.now() - fullAt > 10 * 60e3, todo = LEAGUES.filter(function (lg) { return full || LIVEPATH[lg[0] + '/' + lg[1]]; });
    var jobs = [], k = 0;
    function next() { if (k >= todo.length) return Promise.resolve(); var lg = todo[k++]; return fetchLeague(lg).then(function (r) { if (r) BYPATH[lg[0] + '/' + lg[1]] = r; }).then(next); }
    for (var w = 0; w < (MV.device && MV.device.tv ? 3 : 6); w++) jobs.push(next());
    if (full || LIVEPATH.esports) jobs.push(fetchEsports().then(function (r) { BYPATH.esports = r; }));
    return Promise.all(jobs).then(function () {
      if (full) fullAt = Date.now();
      var now = Date.now(), all = [];
      Object.keys(BYPATH).forEach(function (p) { all = all.concat(BYPATH[p] || []); });
      all = all.filter(function (e) { return keep(e, now); });
      LIVEPATH = {}; all.forEach(function (e) { if (e.state === 'in' || (e.state === 'pre' && e.start - now < 20 * 60e3)) LIVEPATH[e.cat === 'esports' ? 'esports' : e.path] = 1; });
      DATA.events = order(all); DATA.ts = Date.now();
      autoFavRem();
      return DATA.events;
    }).then(function (e) { DATA.loading = false; return e; }, function () { DATA.loading = false; return DATA.events; });
  }
  function autoFavRem() {
    if (!P().sportFavRemind) return;
    var n = 0; DATA.events.forEach(function (e) { if (e.state === 'pre' && isFav(e) && e.start - Date.now() > LEAD && addRem(e, true)) n++; });
  }

  // ---------- ¿Qué canal lo está pasando? ----------
  var SPORT_CH = /(espn|fox ?sports|tyc|d ?sports|directv ?sports|win ?sports|bein|gol ?tv|tudn|claro ?sports|sky ?sports|eurosport|dazn|tnt ?sports|movistar|caracol|rcn|azteca|televisa|tv ?azteca|telemundo|univision|paramount|star|deportes|sports|futbol|fútbol|nba|nfl|mlb|liga|champions|canal\+|f1|ufc)/i;
  function words(n) { return MV.norm(n).split(' ').filter(function (w) { return w.length > 2 && !/^(fc|cf|club|deportivo|atletico|real|cd|sc|ac|as|ud)$/.test(w); }); }
  var CHC = {};
  function channelFor(e) {
    if (e.stream) return null;
    var ck = e.uid + ':' + Math.floor(Date.now() / 120e3); if (CHC[ck] !== undefined) return CHC[ck];
    var live = MV.visible(S.live || []), now = Date.now(), from = e.state === 'pre' ? e.start : now;
    var hw = [], aw = [];
    if (e.teams.length === 2) { hw = words(e.teams[0].name).concat(words(e.teams[0].full)); aw = words(e.teams[1].name).concat(words(e.teams[1].full)); }
    else hw = words(e.lg);
    var best = null, bestSc = 0, cc = region();
    for (var i = 0; i < live.length; i++) {
      var ch = live[i];
      if (!SPORT_CH.test(ch.name + ' ' + (ch.group || ''))) continue;
      var ps = MV.progsFor(ch); if (!ps.length) continue;
      for (var k = 0; k < ps.length; k++) {
        var p = ps[k]; if (p.e <= from || p.s > from + 30 * 60e3) continue;
        var t = ' ' + MV.norm((p.t || '') + ' ' + (p.d || '')) + ' ';
        var sc = (hw.some(function (w) { return t.indexOf(' ' + w + ' ') >= 0; }) ? 1 : 0) + (aw.some(function (w) { return t.indexOf(' ' + w + ' ') >= 0; }) ? 1 : 0);
        if (sc > bestSc || (sc === bestSc && sc && ch.country === cc && best && best.country !== cc)) { best = ch; bestSc = sc; }
        break;
      }
      if (bestSc === 2 && best && best.country === cc) break;
    }
    if (!best) {
      // Sin guía: el canal que nombra el organizador para tu país (ESPN, DSports…) si lo tienes
      for (var j = 0; j < e.tv.length && !best; j++) {
        var n = MV.norm(e.tv[j]); if (n.length < 3) continue;
        best = live.filter(function (ch) { return MV.norm(ch.name).indexOf(n) >= 0; }).sort(function (a, b) { return (b.country === cc) - (a.country === cc); })[0] || null;
      }
    }
    CHC[ck] = best;
    return best;
  }
  function chName(ch) { return MV.cleanTitle ? (MV.cleanTitle(ch.name) || ch.name) : ch.name; }
  function channelName(e) { if (e.stream) return e.stream.ch + ' (' + (e.stream.tab === 'kick' ? 'Kick' : 'Twitch') + ')'; var ch = channelFor(e); return ch ? chName(ch) : e.tv.slice(0, 2).join(', '); }
  function actFor(e) {
    if (e.stream) return 'data-act="streamGo" data-arg="' + esc(e.stream.tab + ':' + e.stream.ch) + '"';
    var ch = channelFor(e); if (ch && MV.reg) MV.reg[ch.key] = ch;
    return ch ? 'data-act="play" data-key="' + esc(ch.key) + '"' : 'data-act="sportFind" data-arg="' + esc(e.teams.length ? e.teams[0].name + ' ' + e.teams[1].name : e.lg) + '"';
  }

  function dayWord(ms) { var d = new Date(ms), t = new Date(); if (d.toDateString() === t.toDateString()) return 'Hoy'; t.setDate(t.getDate() + 1); return d.toDateString() === t.toDateString() ? 'Mañana' : d.toLocaleDateString('es-CO', { weekday: 'long' }); }
  function line(e) {
    if (e.state === 'pre') return dayWord(e.start) + ' ' + MV.fmtTime(e.start);
    if (!e.teams.length || e.cat === 'tenis') return e.state === 'in' ? (e.detail || 'En juego') : 'Final';
    var h = +e.teams[0].score, a = +e.teams[1].score;
    var who = h === a ? (e.state === 'in' ? 'Van empatados' : 'Empataron') : (e.state === 'in' ? (h > a ? e.teams[0].name : e.teams[1].name) + ' gana' : (h > a ? e.teams[0].name : e.teams[1].name) + ' ganó');
    return who + ' ' + Math.max(h, a) + '-' + Math.min(h, a) + (e.state === 'in' ? ' · ' + (e.detail || '') : ' · Final');
  }
  function teamRow(e, t) { return '<div class="sp-t">' + (t.logo ? '<img src="' + esc(t.logo) + '" alt="" loading="lazy" onerror="this.remove()">' : '<i></i>') + '<b>' + (isFavTeam(t.full) || isFavTeam(t.name) ? '★ ' : '') + esc(t.name) + '</b>' + (e.state !== 'pre' ? '<span>' + esc(t.score) + '</span>' : '') + '</div>'; }
  function card(e) {
    var ch = e.stream ? null : channelFor(e);
    var badge = e.state === 'in' ? '<span class="sp-live"><span class="live-dot"></span>EN VIVO</span>' : e.state === 'post' ? '<span class="sp-st">FINAL</span>' : '<span class="sp-st">' + esc(dayWord(e.start).toUpperCase()) + '</span>';
    var chHtml = e.stream ? '<span>En ' + esc(channelName(e)) + '</span>' : ch ? (ch.logo ? '<img src="' + esc(MV.logoUrl ? MV.logoUrl(ch.logo) : ch.logo) + '" alt="" onerror="this.remove()">' : '') + '<span>' + (e.state === 'post' ? 'Lo pasó ' : 'En ') + esc(chName(ch)) + '</span>'
      : e.tv.length ? '<span class="muted">TV: ' + esc(e.tv.slice(0, 3).join(', ')) + '</span>' : '<span class="muted">Buscar en tus canales</span>';
    return '<button class="spcard f" ' + actFor(e) + ' data-fid="sp-' + e.uid + '">' +
      '<div class="sp-h">' + badge + '<small>' + esc(e.lg) + '</small>' + (rems()[e.uid] ? '<em class="sp-bell" title="Aviso activado">🔔</em>' : '') + '</div>' +
      (e.teams.length ? teamRow(e, e.teams[0]) + teamRow(e, e.teams[1]) : '<div class="sp-t"><b>' + esc(e.name) + '</b></div>') +
      '<p>' + esc(line(e)) + '</p><div class="sp-ch">' + chHtml + '</div></button>';
  }
  function homeList() { return DATA.events.filter(function (e) { return e.state !== 'pre' || e.start - Date.now() < 36 * 3600e3; }).slice(0, 16); }
  function rowHtml() {
    var evs = homeList(); if (!evs.length) return '';
    var live = evs.filter(function (e) { return e.state === 'in'; }).length;
    return '<section class="row"><h3>' + (live ? 'Deportes en vivo' : 'Deportes') + ' <small>' + (live ? live + ' en juego' : evs.length + ' partidos') + '</small></h3><div class="strip">' + evs.map(card).join('') +
      '<button class="btn ghost sm f" style="align-self:center;flex:0 0 auto" data-act="nav" data-arg="sports">Ver todos</button></div></section>';
  }
  MV.sportsRow = function () {
    if (MV.isKids && MV.isKids()) return '';
    setTimeout(refresh, 50);
    return '<div id="sportsRow">' + rowHtml() + '</div>';
  };

  // ---------- Widget de Inicio: un partido a la vez ----------
  var SPI = 0;
  function miniHtml() {
    var evs = homeList();
    if (!evs.length) return '<button class="vsm-empty f" data-act="nav" data-arg="sports"><b>Deportes</b><span>' + (DATA.ts ? 'No hay partidos ahora en las ligas que seguimos' : 'Buscando partidos…') + '</span></button>';
    if (SPI >= evs.length) SPI = 0;
    var e = evs[SPI], ch = channelName(e);
    var badge = e.state === 'in' ? '<span class="vsm-b live"><i></i>EN VIVO</span>' : '<span class="vsm-b">' + (e.state === 'post' ? 'FINAL' : esc(dayWord(e.start).toUpperCase())) + '</span>';
    var team = function (t) { return '<span class="vsm-t">' + (t.logo ? '<img src="' + esc(t.logo) + '" alt="" loading="lazy" onerror="this.remove()">' : '<i></i>') + '<b>' + esc(t.name) + '</b>' + (e.state !== 'pre' ? '<em>' + esc(t.score) + '</em>' : '') + '</span>'; };
    return '<button class="vsm-main f" ' + actFor(e) + ' data-fid="vsm-main" aria-label="' + esc(title(e) + ', ' + line(e)) + '">' +
      '<span class="vsm-h">' + badge + '<small>' + esc(e.lg) + '</small></span>' + (e.teams.length ? team(e.teams[0]) + team(e.teams[1]) : '<span class="vsm-t"><b>' + esc(e.name) + '</b></span>') +
      '<span class="vsm-l">' + esc(e.state === 'pre' ? MV.fmtTime(e.start) : line(e)) + (ch ? ' · ' + esc(ch) : '') + '</span></button>' +
      '<span class="vsm-nav"><button class="vsm-arr f" data-act="sportsMini" data-arg="-1" data-fid="vsm-prev" aria-label="Partido anterior"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>' +
      '<button class="vsm-all f" data-act="nav" data-arg="sports" data-fid="vsm-all">' + (SPI + 1) + ' / ' + evs.length + ' · Todos</button>' +
      '<button class="vsm-arr f" data-act="sportsMini" data-arg="1" data-fid="vsm-next" aria-label="Siguiente partido"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button></span>';
  }
  function miniPaint() {
    var box = document.getElementById('sportsMini'); if (!box) return;
    var html = miniHtml(); if (box.innerHTML === html) return;
    var a = document.activeElement, fid = a && box.contains(a) ? a.getAttribute('data-fid') : '';
    box.innerHTML = html;
    if (fid) { var b = box.querySelector('[data-fid="' + fid + '"]'); if (b) b.focus(); }
  }
  MV.sportsMini = function () {
    if (MV.isKids && MV.isKids()) return '';
    setTimeout(refresh, 50);
    return '<section class="vtile vsport" id="sportsMini" aria-label="Deportes">' + miniHtml() + '</section>';
  };
  MV.ACT.sportsMini = function (d) { var n = homeList().length; if (!n) return; SPI = (SPI + (+d || 1) + n) % n; miniPaint(); };

  // ---------- Sección Deportes: filtros por deporte, favoritos y avisos ----------
  var CAT = 'all';
  function inCat(e, c) { return c === 'all' || (c === 'fav' ? isFav(e) : e.cat === c); }
  MV.VIEWS.sports = function () {
    setTimeout(function () { fetchAll(!DATA.ts || Date.now() - fullAt > 10 * 60e3).then(paintView); }, 30);
    return MV.topHtml('Deportes', '<button class="pill f" data-act="sportSettings">Ajustes</button>') + '<div id="sportsView">' + viewHtml() + '</div>';
  };
  function viewHtml() {
    var evs = DATA.events, counts = {};
    evs.forEach(function (e) { counts[e.cat] = (counts[e.cat] || 0) + 1; if (isFav(e)) counts.fav = (counts.fav || 0) + 1; });
    counts.all = evs.length;
    var html = '<div class="chips scrollx">' + CATS.filter(function (c) { return c[0] === 'all' || c[0] === 'fav' || counts[c[0]] || (c[0] === 'esports'); }).map(function (c) {
      return '<button class="chip f' + (CAT === c[0] ? ' on' : '') + '" data-act="sportCat" data-arg="' + c[0] + '" data-fid="spc-' + c[0] + '">' + c[1] + ' <small>' + (counts[c[0]] || 0) + '</small></button>';
    }).join('') + '</div>';
    if (CAT === 'esports' && !(P().pandaKey || '').trim()) return html + '<div class="panel glass"><h2>Esports</h2><p class="muted">Para ver partidos de League of Legends, Valorant, CS2, Dota 2 y más (con el canal oficial de Twitch o Kick), pega tu clave gratuita de PandaScore. Se crea en pandascore.co con tu correo.</p><div class="btns"><button class="btn f" data-act="sportSettings">Agregar clave</button></div></div>';
    var list = evs.filter(function (e) { return inCat(e, CAT); });
    if (!list.length) return html + '<p class="muted" style="margin:18px 4px">' + (DATA.loading || !DATA.ts ? 'Buscando partidos…' : CAT === 'fav' ? (favs().length ? 'Tus equipos no juegan hoy ni mañana.' : 'Marca tus equipos con la estrella ☆ en cualquier partido.') : 'No hay partidos hoy ni mañana.') + '</p>';
    var groups = [['En vivo', list.filter(function (e) { return e.state === 'in'; })], ['Hoy', list.filter(function (e) { return e.state === 'pre' && dayWord(e.start) === 'Hoy'; })], ['Mañana', list.filter(function (e) { return e.state === 'pre' && dayWord(e.start) === 'Mañana'; })], ['Próximos días', list.filter(function (e) { return e.state === 'pre' && dayWord(e.start) !== 'Hoy' && dayWord(e.start) !== 'Mañana'; })], ['Terminados', list.filter(function (e) { return e.state === 'post'; })]];
    groups.forEach(function (g) {
      if (!g[1].length) return;
      html += '<section class="row"><h3>' + g[0] + ' <small>' + g[1].length + '</small></h3><div class="spgrid">' + g[1].slice(0, 60).map(function (e) {
        var favB = e.teams.map(function (t, i) { var on = isFavTeam(t.full) || isFavTeam(t.name); return '<button class="chip sm f' + (on ? ' on' : '') + '" data-act="sportFav" data-arg="' + esc(t.full || t.name) + '" data-fid="spf-' + e.uid + '-' + i + '">' + (on ? '★ ' : '☆ ') + esc(t.name) + '</button>'; }).join('');
        var remB = e.state === 'pre' && e.start - Date.now() > 60e3 ? '<button class="chip sm f' + (rems()[e.uid] ? ' on' : '') + '" data-act="sportRem" data-arg="' + esc(e.uid) + '" data-fid="spr-' + e.uid + '">' + (rems()[e.uid] ? '🔔 Aviso activado' : '🔔 Avisarme') + '</button>' : '';
        return '<div class="spitem">' + card(e) + '<div class="spacts">' + remB + favB + '</div></div>';
      }).join('') + '</div></section>';
    });
    return html;
  }
  function paintView() {
    var box = document.getElementById('sportsView'); if (!box) return;
    var html = viewHtml(); if (box.innerHTML === html) return;
    var a = document.activeElement, fid = a && box.contains(a) ? a.getAttribute('data-fid') : '';
    box.innerHTML = html;
    if (fid) { var b = box.querySelector('[data-fid="' + fid + '"]'); if (b) b.focus(); }
  }
  MV.ACT.sportCat = function (c) { CAT = c; paintView(); };
  MV.ACT.sportFav = function (n) {
    var p = P(), f = (p.sportFavs || []).slice(), i = f.map(MV.norm).indexOf(MV.norm(n));
    if (i >= 0) f.splice(i, 1); else f.push(n);
    p.sportFavs = f; MV.savePrefs();
    MV.toast(i >= 0 ? n + ' ya no está en tus equipos' : n + ' agregado a tus equipos' + (p.sportFavRemind ? '' : ' (en Ajustes puedes recibir aviso de todos sus partidos)'), 3500);
    if (i < 0) autoFavRem();
    order(DATA.events); paintView(); miniPaint();
  };
  MV.ACT.sportRem = function (uid) {
    if (rems()[uid]) delRem(uid);
    else { var e = DATA.events.filter(function (x) { return x.uid === uid; })[0]; if (e) addRem(e); }
    paintView();
  };
  MV.ACT.sportSettings = function () {
    var p = P(), cc = region();
    var opts = [['', 'Automático (' + cc + ')'], ['CO', 'Colombia'], ['MX', 'México'], ['AR', 'Argentina'], ['PE', 'Perú'], ['CL', 'Chile'], ['EC', 'Ecuador'], ['VE', 'Venezuela'], ['ES', 'España'], ['US', 'Estados Unidos']];
    MV.modal('<h2>Ajustes de deportes</h2>' +
      '<h3 style="margin:10px 0 6px">Tu región</h3><p class="muted">Primero aparecen las ligas de tu país y los canales de tu región.</p><div class="chips" style="flex-wrap:wrap">' + opts.map(function (o) { return '<button class="chip f' + ((p.sportRegion || '') === o[0] ? ' on' : '') + '" data-act="sportRegion" data-arg="' + o[0] + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>' +
      '<div class="line" style="margin-top:14px"><div class="t"><b>Avisarme de todos los partidos de mis equipos</b><span>Llega una notificación al celular 15 minutos antes.</span></div><button class="toggle f' + (p.sportFavRemind ? ' on' : '') + '" data-act="sportFavRemind"></button></div>' +
      '<label class="field" style="margin-top:14px">Clave de PandaScore (esports, gratis)<input class="in f" id="pandaKey" value="' + esc(p.pandaKey || '') + '" autocomplete="off"></label>' +
      '<div class="btns"><button class="btn f" data-act="sportSaveKey">Guardar</button><button class="btn ghost f" data-act="closeModal">Cerrar</button></div>');
  };
  MV.ACT.sportRegion = function (c) { P().sportRegion = c || ''; MV.savePrefs(); CHC = {}; MV.closeModal(true); MV.toast('Región: ' + region()); fetchAll(true).then(function () { paintView(); miniPaint(); }); };
  MV.ACT.sportFavRemind = function (_, el) { var p = P(); p.sportFavRemind = !p.sportFavRemind; MV.savePrefs(); if (el) el.classList.toggle('on', p.sportFavRemind); if (p.sportFavRemind) autoFavRem(); MV.toast(p.sportFavRemind ? 'Te avisaremos de los partidos de tus equipos' : 'Avisos automáticos apagados'); };
  MV.ACT.sportSaveKey = function () { var i = document.getElementById('pandaKey'); P().pandaKey = i ? i.value.trim() : ''; MV.savePrefs(); MV.closeModal(true); MV.toast('Clave guardada'); fetchAll(true).then(paintView); };

  function refresh() {
    fetchAll().then(function () {
      miniPaint(); paintView();
      var box = document.getElementById('sportsRow'); if (!box) return;
      var html = rowHtml(); if (box.innerHTML === html) return;
      var a = document.activeElement, fid = a && box.contains(a) ? a.getAttribute('data-fid') : '';
      box.innerHTML = html;
      if (fid) { var b = box.querySelector('[data-fid="' + fid + '"]'); if (b) b.focus(); }
    });
  }
  setInterval(function () { if (document.getElementById('sportsRow') || document.getElementById('sportsMini') || document.getElementById('sportsView')) refresh(); }, 60e3);
  // Los avisos que pusiste en otro equipo (p. ej. en la TV) se programan en este celular al abrir
  setTimeout(scheduleLocal, 8000);
  MV.on && MV.on('synced', scheduleLocal);
  MV.ACT.sportFind = function (q) { if (MV.remoteText) MV.remoteText(q); };
})();
