/* MiVibra TV — catálogo: listas M3U y Xtream combinadas, guía EPG, fichas (TMDB/Jikan),
   cine de dominio público, favoritos, historial, progreso y sincronización entre dispositivos. */
(function () {
  'use strict';
  var MV = window.MV, D = window.MVD, RX = D.RX;
  var S = MV.S = {
    prefs: MV.load('prefs', {}),
    lists: MV.load('lists', []),
    profiles: MV.load('profiles', []),
    pid: MV.load('pid', null),
    items: [], byKey: {}, live: [], movies: [], series: [],
    epg: { progs: {}, names: {} },
    loading: false, loadMsg: '',
    adultUntil: 0
  };
  var P = S.prefs;
  var defaults = {
    theme: 'mv', glass: 'mid', anim: true, bgAnim: true, autoTheme: true, audioLang: 'es', subLang: '', xtFormat: 'm3u8',
    tmdbKey: '', ytKey: '', subKey: '', streamKeys: {}, dedupe: true, pruneEmpty: true, latOnly: false, navOrder: [], navHidden: [], covers: {}, kidsLimit: 60, parentPin: '', adult: null, romRoots: [], romSystem: {}, shader: 'default',
    firebase: '', syncLists: true, updatedAt: 0, deviceName: ''
  };
  Object.keys(defaults).forEach(function (k) { if (P[k] === undefined) P[k] = defaults[k]; });
  if (!P.deviceName) P.deviceName = MV.device.tv ? 'TV' : (MV.device.model || 'Celular');

  MV.savePrefs = function (silent) { P.updatedAt = Date.now(); MV.save('prefs', P); if (!silent) MV.sync.later(); if (MV.acct) MV.acct.changed(); };
  MV.saveLists = function () { MV.save('lists', S.lists); MV.sync.later(); if (MV.acct) MV.acct.changed(); };
  MV.saveProfiles = function () { MV.save('profiles', S.profiles); MV.sync.later(); };

  // ---------- Perfiles y datos por perfil ----------
  MV.profile = function () { return S.profiles.find(function (p) { return p.id === S.pid; }) || null; };
  MV.isKids = function () { var p = MV.profile(); return !!(p && p.kids); };
  MV.pdata = function (pid) {
    pid = pid || S.pid || 'default';
    var d = MV.load('pdata:' + pid, null);
    if (!d) d = { favs: {}, history: [], progress: {}, updatedAt: 0 };
    return d;
  };
  MV.savePdata = function (d, pid) { d.updatedAt = Date.now(); MV.save('pdata:' + (pid || S.pid || 'default'), d); MV.sync.later(); };
  MV.adultOk = function () { return !MV.isKids() && S.adultUntil > Date.now(); };

  // Géneros aprendidos de las fichas (TMDB/Jikan), para clasificar mejor la próxima vez
  // Solo los géneros que dice TMDB/MyAnimeList (no los deducidos del nombre de la categoría)
  var GCACHE = MV.load('gcache2', {});
  // Edad recomendada aprendida de TMDB (certificación) o MyAnimeList (rating): 0 = todo público, 7 = niños
  var AGES = MV.load('ages', {});
  var NOT_FOR_KIDS = ['terror', 'suspenso', 'crimen', 'belico'];
  /** ¿Lo puede ver un perfil infantil? Canales: categoría infantil. Películas y series: solo con edad de TMDB de 0 a 7 años
      (y que sean infantiles o familiares). Sin anime. */
  MV.kidsOk = function (i) {
    if (i.adult) return false;
    if (i.type === 'live') return !!i.kids;
    if (i.anime || i.doc) return false;
    if (i.age == null) return false;
    // Animación (no anime) se permite hasta 13 años; lo demás, solo de 0 a 7 años y que sea infantil o familiar
    if (i.animated && i.age <= 13) return true;
    // "Infantil/Familia" tiene que venir de la ficha de TMDB (no del título: "… American Kids" no es infantil)
    return i.age <= 7 && !!(i.kids || i.platform === 'disney' || i.learnedKids);
  };
  var ANIM = MV.load('animated', {});
  MV.hasLearned = function (key) { return !!GCACHE[key]; };
  // Año según TMDB (manda sobre el de la lista)
  var YEARS = MV.load('tmdbYears', {}), DATES = MV.load('tmdbDates', {});
  // Ficha de TMDB de cada título: dos títulos con la misma ficha son la misma película aunque se llamen distinto ("Animales" = "Animals")
  var TIDS = MV.load('tmdbIds', {});
  MV.learnTid = function (item, tid) {
    if (!tid || !item || !item.key || item.type === 'live' || TIDS[item.key] === tid) return;
    TIDS[item.key] = tid; item.tid = tid;
    var tk = Object.keys(TIDS); if (tk.length > 30000) delete TIDS[tk[0]];
    MV.save('tmdbIds', TIDS);
    // Si ya hay otro título con esa ficha, se vuelven a combinar las listas (con calma, sin trabar la navegación)
    if (S.byTid && S.byTid[tid] && S.byTid[tid] !== item && S.byTid[tid].key !== item.key) MV.redupeLater();
  };
  MV.learnGenres = function (item, names, age, year, date) {
    // Fecha de estreno (para ordenar Estrenos del más reciente al más antiguo)
    if (date && item.key && item.type !== 'live' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      item.rdate = date;
      if (DATES[item.key] !== date) { DATES[item.key] = date; var dk = Object.keys(DATES); if (dk.length > 20000) delete DATES[dk[0]]; MV.save('tmdbDates', DATES); }
    }
    if (year && item.key && item.type !== 'live' && +year >= 1900) {
      item.year = String(year);
      if (YEARS[item.key] !== item.year) { YEARS[item.key] = item.year; var yk = Object.keys(YEARS); if (yk.length > 20000) delete YEARS[yk[0]]; MV.save('tmdbYears', YEARS); }
    }
    if (age != null && item.key) {
      item.age = age;
      if (AGES[item.key] !== age) { AGES[item.key] = age; var ak = Object.keys(AGES); if (ak.length > 8000) delete AGES[ak[0]]; MV.save('ages', AGES); }
    }
    if (item.key && /animaci[oó]n|animation/i.test((names || []).join(' ')) && !ANIM[item.key]) {
      item.animated = true; ANIM[item.key] = 1;
      var nk = Object.keys(ANIM); if (nk.length > 8000) delete ANIM[nk[0]];
      MV.save('animated', ANIM);
    }
    // Géneros en el orden de TMDB (el primero es el principal y define la categoría)
    var ids = [];
    (names || []).forEach(function (n) { D.classifyGenres(n).forEach(function (x) { if (ids.indexOf(x) < 0) ids.push(x); }); });
    if (ids.some(function (x) { return NOT_FOR_KIDS.indexOf(x) >= 0; })) item.kids = false;
    if (ids.indexOf('infantil') >= 0) item.learnedKids = true;
    if (ids.indexOf('documental') >= 0) item.kids = false;
    if (!ids.length) return;
    // Estricto: con ficha, los géneros son los de TMDB (no los adivinados por el nombre o la categoría de la lista)
    item.genres = ids.slice(0, 6); item.tmdbG = true;
    GCACHE[item.key] = ids.slice(0, 6);
    if (item.type !== 'live' && ids.indexOf('documental') >= 0) item.doc = true;
    var keys = Object.keys(GCACHE); if (keys.length > 20000) delete GCACHE[keys[0]];
    MV.save('gcache2', GCACHE);
  };
  MV.genresOf = function (arr) {
    var m = {};
    arr.forEach(function (i) { (i.genres || []).forEach(function (g) { m[g] = (m[g] || 0) + 1; }); });
    return Object.keys(m).sort(function (a, b) { return m[b] - m[a]; }).map(function (g) { return { id: g, name: D.genreName(g), count: m[g] }; });
  };

  // ---------- Lectura de listas M3U ----------
  function attr(line, name) {
    var m = line.match(new RegExp(name + '="([^"]*)"', 'i'));
    return m ? m[1].trim() : '';
  }
  function splitHeaders(url) {
    // Formato Kodi: url|User-Agent=xxx&Referer=yyy
    var out = { url: url, ua: '', ref: '' };
    var i = url.indexOf('|');
    if (i > 0) {
      out.url = url.slice(0, i);
      url.slice(i + 1).split('&').forEach(function (kv) {
        var p = kv.split('='); var k = (p[0] || '').toLowerCase(); var v = decodeURIComponent(p.slice(1).join('=') || '');
        if (k === 'user-agent') out.ua = v; if (k === 'referer' || k === 'referrer') out.ref = v;
      });
    }
    return out;
  }
  var VIDEO_EXT = /\.(mp4|mkv|avi|m4v|mov|webm|wmv|flv|mpg|mpeg)(\?|$)/i;

  MV.parseM3U = function (text, list) {
    var lines = text.split(/\r?\n/);
    var out = [], cur = null, group = '', ua = '', ref = '', epgUrl = '';
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].trim();
      if (!l) continue;
      if (l.indexOf('#EXTM3U') === 0) {
        epgUrl = attr(l, 'x-tvg-url') || attr(l, 'url-tvg') || attr(l, 'tvg-url');
        continue;
      }
      if (l.indexOf('#EXTINF') === 0) {
        var comma = l.lastIndexOf('",'), name;
        var c2 = l.indexOf(',', comma > 0 ? comma + 1 : 0);
        name = c2 >= 0 ? l.slice(c2 + 1).trim() : '';
        cur = {
          name: name || attr(l, 'tvg-name') || 'Sin nombre',
          tvg: attr(l, 'tvg-id'), logo: attr(l, 'tvg-logo'), group: attr(l, 'group-title'),
          num: attr(l, 'tvg-chno'), catchup: attr(l, 'catchup'), country: attr(l, 'tvg-country')
        };
        group = ''; ua = ''; ref = '';
        continue;
      }
      if (l.indexOf('#EXTGRP:') === 0) { group = l.slice(8).trim(); continue; }
      if (l.indexOf('#EXTVLCOPT:') === 0) {
        var o = l.slice(11);
        if (/^http-user-agent=/i.test(o)) ua = o.split('=').slice(1).join('=');
        if (/^http-referr?er=/i.test(o)) ref = o.split('=').slice(1).join('=');
        continue;
      }
      if (l[0] === '#') continue;
      if (!cur) cur = { name: l.split('/').pop(), tvg: '', logo: '', group: '' };
      var h = splitHeaders(l);
      cur.url = h.url; cur.ua = h.ua || ua; cur.ref = h.ref || ref;
      if (!cur.group) cur.group = group || 'Sin categoría';
      out.push(cur); cur = null;
    }
    if (list && epgUrl && !list.epg) { list.epg = epgUrl.split(',')[0].trim(); list.epgAuto = true; }
    return out;
  };

  // Pistas de que una entrada es un canal en vivo aunque su enlace termine en .mp4/.flv
  var LIVE_HINT = /\b(live|en vivo|tv|television|televisi[oó]n|channel|canal|news|noticias|radio|web|24\/7|24h|fm)\b|\(\d{3,4}[pi]\)|\[(geo|not 24\/7)/i;
  function classify(e, liveList) {
    var u = e.url || '', g = (e.group || '') + ' ' + e.name;
    if (/\/movie\//i.test(u)) return 'movie';
    if (/\/series\//i.test(u)) return 'episode';
    var isFile = VIDEO_EXT.test(u);
    if (!isFile) return 'live';
    if (RX.episode.test(e.name)) return 'episode';
    var titled = /\((19|20)\d{2}\)/.test(e.name);
    // Canal: tiene id de guía, país o pistas de TV; o la lista es casi toda de canales (ej. iptv-org: "Movies" = canales de cine)
    if (!titled && (e.tvg || e.country || e.num || LIVE_HINT.test(g) || liveList)) return 'live';
    if (RX.series.test(e.group) && !RX.movie.test(e.group)) return 'episode';
    return 'movie';
  }
  // Sin emojis en nombres, categorías y tipos que traen las listas ("⭐Acción ⭐", "🔴 EN VIVO"…)
  var EMOJI = /[\uD83C-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF\u2B50\u2B55\uFE0F\u200D\u20E3]/g;
  MV.noEmoji = function (s) { return String(s == null ? '' : s).replace(EMOJI, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s|·\-–:]+|[\s|·\-–:]+$/g, '').trim(); };
  function tags(o) {
    if (o.name) o.name = MV.noEmoji(o.name) || o.name;
    if (o.group) o.group = MV.noEmoji(o.group);
    if (o.genre) o.genre = MV.noEmoji(o.genre);
    var g = (o.group || '') + ' ' + (o.name || '');
    o.kids = !RX.notKids.test(g) && !RX.adult.test(g) && (RX.kids.test(o.group || '') || RX.kidsName.test(o.name || ''));
    if (AGES[o.key] != null) o.age = AGES[o.key];
    if (ANIM[o.key]) o.animated = true;
    if (TIDS[o.key]) o.tid = TIDS[o.key];
    o.anime = RX.anime.test(g);
    o.kdrama = RX.kdrama.test(g);
    o.platform = D.platformOf(o.group || '') || (o.type !== 'live' ? D.platformOf(o.name || '') : '');
    if (o.platform === 'viki' && !o.anime) o.kdrama = o.kdrama || /drama|corea|korea/i.test(g);
    // Documental solo si la categoría lo dice claramente (no "Ciencia ficción", "Historia" o "Animales fantásticos")
    o.doc = (RX.doc.test(o.group || '') && !RX.notDoc.test(o.group || '')) || /\bdocumental\b|\bdocumentary\b/i.test(o.name || '');
    // +18: en películas y series solo cuenta la CATEGORÍA (títulos como "xXx", "Vida adulta" o "MaXXXine" no son +18)
    o.adult = o.type === 'live' ? RX.adult.test(g) : RX.adult.test(o.group || '');
    if (o.type === 'live') o.country = D.countryOf(o);
    o.lang = o.langFixed || D.langOf(o);
    if (o.type !== 'live' || o.doc || o.kids) {
      var gtxt = g + ' ' + (o.genre || '');
      o.genres = D.classifyGenres(gtxt);
      if (o.kids && o.genres.indexOf('infantil') < 0) o.genres.push('infantil');
      if (o.doc && o.genres.indexOf('documental') < 0) o.genres.push('documental');
      var learned = GCACHE[o.key];
      if (learned && o.type !== 'live') { o.genres = learned.slice(); o.tmdbG = true; }   // TMDB manda
      if (o.type !== 'live' && YEARS[o.key]) o.year = YEARS[o.key];
      if (o.type !== 'live' && DATES[o.key]) o.rdate = DATES[o.key];
      if (learned) {
        // Lo que dice TMDB manda: documental si su género es Documental
        if (o.type !== 'live' && learned.indexOf('documental') >= 0) o.doc = true;
        if (learned.some(function (x) { return NOT_FOR_KIDS.indexOf(x) >= 0; })) o.kids = false;
        if (learned.indexOf('infantil') >= 0) o.learnedKids = true;
      }
    }
    return o;
  }
  function showName(name) {
    return String(name).replace(RX.episode, '').replace(/[-–|:]\s*$/, '').replace(/\s{2,}/g, ' ').trim() || name;
  }

  /** Convierte las entradas de una lista en canales, películas y series. */
  function buildFromM3U(entries, list) {
    var res = [], seriesMap = {};
    var streams = entries.filter(function (e) { return !VIDEO_EXT.test(e.url || '') && !/\/(movie|series)\//i.test(e.url || ''); }).length;
    var liveList = entries.length > 0 && streams / entries.length >= 0.6;
    entries.forEach(function (e) {
      var t = classify(e, liveList);
      if (t === 'episode') {
        var sn = showName(e.name), sk = 'series:' + MV.norm(sn);
        var s = seriesMap[sk];
        if (!s) { s = seriesMap[sk] = tags({ key: sk, type: 'series', name: sn, poster: e.logo, group: e.group, list: list.id, episodes: [] }); res.push(s); }
        var m = e.name.match(RX.episode) || [];
        s.episodes.push({ season: +(m[1] || m[3] || 1), ep: +(m[2] || m[4] || s.episodes.length + 1), title: MV.noEmoji(e.name), url: e.url, ua: e.ua, ref: e.ref });
      } else if (t === 'movie') {
        var y = (e.name.match(/\((19|20)\d{2}\)/) || [''])[0].replace(/[()]/g, '');
        res.push(tags({ key: 'movie:' + MV.norm(e.name), type: 'movie', name: e.name, poster: e.logo, group: e.group, url: e.url, ua: e.ua, ref: e.ref, year: y, list: list.id }));
      } else {
        res.push(tags({ key: 'live:' + (e.tvg ? e.tvg.toLowerCase() : MV.norm(e.name)), type: 'live', name: e.name, logo: e.logo, group: e.group, tvg: e.tvg, tc: e.country, num: e.num, url: e.url, ua: e.ua, ref: e.ref, list: list.id }));
      }
    });
    return res;
  }

  // ---------- Xtream Codes ----------
  /** Solo protocolo, servidor y puerto: acepta que peguen http://srv:8080/get.php?… o …/player_api.php */
  function cleanHost(h) {
    h = String(h || '').trim().replace(/\s+/g, '');
    if (!/^https?:\/\//i.test(h)) h = 'http://' + h;
    return h.replace(/[?#].*$/, '').replace(/\/(get|player_api|xmltv|panel_api)\.php.*$/i, '').replace(/\/c\/?$/i, '').replace(/\/+$/, '');
  }
  /** Servidor sin /get.php ni parámetros (conserva la carpeta si la tiene: http://srv.com/iptv) */
  function xtBase(list) { return cleanHost(list.host); }
  function xtHdr(list) { return list.ua ? { 'User-Agent': list.ua } : null; }
  function xtGet(list, action, extra, big) { return MV.getJSON(xtApi(list, action, extra), xtHdr(list), big); }
  function xtApi(list, action, extra) {
    return xtBase(list) + '/player_api.php?username=' + encodeURIComponent(list.user) + '&password=' + encodeURIComponent(list.pass) + (action ? '&action=' + action : '') + (extra || '');
  }
  /** Inicia sesión probando también como reproductores conocidos (algunos servidores bloquean apps desconocidas). */
  MV.xtLogin = function (list) {
    list.user = String(list.user || '').trim(); list.pass = String(list.pass || '').trim();
    // Direcciones a probar: tal cual (con carpeta), solo servidor:puerto y el otro protocolo (http/https)
    var given = cleanHost(list.host), origin = (given.match(/^(https?:\/\/[^\/]+)/i) || [given])[0];
    var bases = [given, origin, given.replace(/^http:/i, 'https:'), given.replace(/^https:/i, 'http:')].filter(function (b, k, a) { return a.indexOf(b) === k; });
    var agents = ['', 'IPTVSmartersPro', 'VLC/3.0.20 LibVLC/3.0.20'], combos = [];
    bases.forEach(function (b) { agents.forEach(function (a) { combos.push([b, a]); }); });
    var i = 0, lastErr = null, saw404 = false;
    function attempt() {
      if (i >= combos.length) {
        if (saw404) throw new Error('No encontré el servicio Xtream en ese servidor (404). Revisa que sea la dirección y el puerto para apps tipo IPTV Smarters. Si tu proveedor te dio un enlace .m3u, agrégalo en la pestaña Enlace M3U; los portales MAC (Stalker) no son compatibles.');
        throw lastErr || new Error('No se pudo conectar al servidor');
      }
      var ua = combos[i][1]; list.host = combos[i][0]; i++;
      return MV.getText(xtApi(list, ''), ua ? { 'User-Agent': ua } : null).then(function (t) {
        var j; try { j = JSON.parse(t); } catch (e) { lastErr = new Error('El servidor respondió, pero no como Xtream. Revisa la dirección y el puerto.'); return attempt(); }
        if (!j || !j.user_info) { lastErr = new Error('El servidor respondió, pero no como Xtream. Revisa la dirección y el puerto.'); return attempt(); }
        var st = String(j.user_info.status || '').toLowerCase();
        if (+j.user_info.auth !== 1) throw new Error('Usuario o contraseña incorrectos');
        if (st && st !== 'active') throw new Error(st === 'expired' ? 'La cuenta está vencida' : st === 'banned' ? 'La cuenta está bloqueada por el proveedor' : st === 'disabled' ? 'La cuenta está desactivada' : 'Cuenta en estado: ' + j.user_info.status);
        if (ua) list.ua = ua; else delete list.ua;
        return j;
      }, function (e) {
        var m = String(e && e.message || '');
        if (/HTTP 404/.test(m)) saw404 = true;
        lastErr = /40[13]/.test(m) ? new Error('El servidor rechazó la conexión (' + m + '). Puede que tu proveedor solo permita ciertas apps o que la cuenta tenga el máximo de conexiones.')
          : /UnknownHost|resolve|ENOTFOUND/i.test(m) ? new Error('No existe ese servidor. Revisa la dirección.')
          : /timeout|timed out|ConnectException|refused|failed to connect/i.test(m) ? new Error('El servidor no responde. Revisa la dirección, el puerto y tu internet.')
          : new Error('No se pudo conectar: ' + (m || 'error desconocido'));
        if (/Usuario o contraseña|vencida|bloqueada|desactivada|estado/.test(m)) throw e;
        return attempt();
      });
    }
    return Promise.resolve().then(attempt);
  };
  function catMap(arr) { var m = {}; (arr || []).forEach(function (c) { m[c.category_id] = c.category_name; }); return m; }

  function buildFromXtream(list) {
    var base = xtBase(list), u = encodeURIComponent(list.user), p = encodeURIComponent(list.pass);
    var fmt = P.xtFormat === 'ts' ? 'ts' : 'm3u8';
    if (!list.epg) list.epg = base + '/xmltv.php?username=' + u + '&password=' + p;
    function safe(pr) { return pr.catch(function () { return []; }); }
    return Promise.all([
      safe(xtGet(list, 'get_live_categories')),
      safe(xtGet(list, 'get_live_streams', '', true)),
      safe(xtGet(list, 'get_vod_categories')),
      safe(xtGet(list, 'get_vod_streams', '', true)),
      safe(xtGet(list, 'get_series_categories')),
      safe(xtGet(list, 'get_series', '', true))
    ]).then(function (r) {
      var lc = catMap(r[0]), vc = catMap(r[2]), sc = catMap(r[4]), out = [];
      (r[1] || []).forEach(function (c) {
        out.push(tags({ key: 'live:' + (c.epg_channel_id ? String(c.epg_channel_id).toLowerCase() : MV.norm(c.name)), type: 'live', name: c.name, logo: c.stream_icon, group: lc[c.category_id] || 'En vivo', tvg: c.epg_channel_id || '', num: c.num, url: base + '/live/' + u + '/' + p + '/' + c.stream_id + '.' + fmt, ua: list.ua || '', list: list.id }));
      });
      (r[3] || []).forEach(function (m) {
        out.push(tags({ key: 'movie:' + MV.norm(m.name), type: 'movie', name: m.name, poster: m.stream_icon, group: vc[m.category_id] || 'Películas', url: base + '/movie/' + u + '/' + p + '/' + m.stream_id + '.' + (m.container_extension || 'mp4'), ua: list.ua || '', rating: m.rating, added: +m.added || 0, list: list.id }));
      });
      (r[5] || []).forEach(function (s) {
        out.push(tags({ key: 'series:' + MV.norm(s.name), type: 'series', name: s.name, poster: s.cover, group: sc[s.category_id] || 'Series', plot: s.plot, genre: s.genre || '', rating: s.rating, year: (s.releaseDate || s.release_date || '').slice(0, 4), xt: { list: list.id, id: s.series_id }, list: list.id }));
      });
      return out;
    });
  }


  // ---------- Portal + MAC (Stalker / Ministra, tipo MAG) ----------
  var STK_UA = 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3';
  var stkTok = {};
  MV.normMac = function (m) {
    var h = String(m || '').toUpperCase().replace(/[^0-9A-F]/g, '');
    return h.length === 12 ? h.match(/../g).join(':') : '';
  };
  function stkHdr(list, tok) {
    var h = { 'User-Agent': STK_UA, 'X-User-Agent': 'Model: MAG250; Link: WiFi', Cookie: 'mac=' + encodeURIComponent(list.mac) + '; stb_lang=es; timezone=America%2FBogota', Referer: (list.api || '').replace(/(server\/load|portal)\.php.*$/, '') };
    if (tok) h.Authorization = 'Bearer ' + tok;
    return h;
  }
  function stkJs(txt) {
    var j; try { j = JSON.parse(txt); } catch (e) { throw new Error(/authoriz/i.test(txt) ? 'El portal rechazó la MAC' : 'El portal no respondió como se esperaba'); }
    return j && j.js !== undefined ? j.js : j;
  }
  function stkCandidates(portal) {
    var u = String(portal || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
    var origin = (u.match(/^(https?:\/\/[^\/]+)/i) || [u])[0], out = [];
    if (/\.php$/i.test(u)) out.push(u);
    var base = u.replace(/\/c$/i, '').replace(/\/(server\/load|portal)\.php$/i, '');
    if (/stalker_portal/i.test(base)) out.push(base.replace(/(\/stalker_portal).*$/i, '$1') + '/server/load.php');
    out.push(base + '/portal.php', base + '/server/load.php', origin + '/stalker_portal/server/load.php', origin + '/portal.php', origin + '/c/portal.php');
    return out.filter(function (x, i, a) { return a.indexOf(x) === i; });
  }
  function stkSn(mac) { var h = 0, s2 = mac.replace(/:/g, ''); for (var i = 0; i < s2.length; i++) h = (h * 31 + s2.charCodeAt(i)) >>> 0; return ('MV' + h.toString(16).toUpperCase() + s2).slice(0, 13); }
  function stkToken(list, force) {
    var k = list.api + '|' + list.mac, t = stkTok[k];
    if (t && !force && t.exp > Date.now()) return Promise.resolve(t.v);
    return MV.getText(list.api + '?type=stb&action=handshake&token=&prehash=0&JsHttpRequest=1-xml', stkHdr(list)).then(function (txt) {
      var js = stkJs(txt), tok = js && js.token;
      if (!tok) throw new Error('El portal no aceptó la conexión');
      var sn = stkSn(list.mac);
      return MV.getText(list.api + '?type=stb&action=get_profile&hd=1&ver=ImageDescription%3A%200.2.18-r23-250%3B%20ImageDate%3A%20Wed%20Aug%2029%2010%3A49%3A53%20EEST%202018%3B%20PORTAL%20version%3A%205.6.2%3B%20API%20Version%3A%20JS%20API%20version%3A%20343&num_banks=2&sn=' + sn + '&stb_type=MAG250&client_type=STB&image_version=218&video_out=hdmi&device_id=&device_id2=&signature=&auth_second_step=1&hw_version=1.7-BD-00&not_valid_token=0&timestamp=' + Math.floor(Date.now() / 1000) + '&api_signature=262&prehash=0&JsHttpRequest=1-xml', stkHdr(list, tok)).then(function (p) {
        var prof = {}; try { prof = stkJs(p) || {}; } catch (e) {}
        if (prof.status === 2 || prof.blocked === '1') throw new Error('La MAC está bloqueada o vencida en el portal');
        stkTok[k] = { v: tok, exp: Date.now() + 20 * 60e3 };
        return tok;
      });
    });
  }
  function stkGet(list, q, retry) {
    return stkToken(list, false).then(function (tok) {
      return MV.getText(list.api + '?' + q + '&JsHttpRequest=1-xml', stkHdr(list, tok));
    }).then(function (txt) {
      if (/authoriz/i.test(txt) && !retry) { delete stkTok[list.api + '|' + list.mac]; return stkGet(list, q, true); }
      return stkJs(txt);
    });
  }
  /** Texto o .txt con varias cuentas de portal: "Portal: http://…/c/" y debajo una o varias "MAC: 00:1A:79:…".
      Se agrupan por portal: una lista por portal y las demás MAC quedan de respaldo. */
  MV.parseMacList = function (text, backup) {
    var groups = {}, order = [], portal = '', pending = [];
    String(text || '').replace(/\u0000/g, '').split(/\r?\n/).forEach(function (line) {
      var u = line.match(/https?:\/\/[^\s"'<>|,]+/i);
      // Una URL de lista M3U o Xtream no es un portal
      if (u && !/get\.php|\.m3u8?(\?|$)|player_api/i.test(u[0])) {
        portal = u[0].replace(/[).;]+$/, '');
        if (pending.length) { pending.forEach(function (m) { add(portal, m); }); pending = []; }
      }
      (line.match(/\b[0-9A-Fa-f]{2}(?:[:\-][0-9A-Fa-f]{2}){5}\b/g) || []).forEach(function (m) {
        m = MV.normMac(m); if (!m) return;
        if (portal) add(portal, m); else pending.push(m);
      });
    });
    function add(p, m) {
      var k = p.toLowerCase().replace(/\/+$/, '');
      if (!groups[k]) { groups[k] = { type: 'stalker', portal: p, macs: [] }; order.push(k); }
      if (groups[k].macs.indexOf(m) < 0) groups[k].macs.push(m);
    }
    var out = [];
    order.forEach(function (k, i) {
      var g = groups[k], host = (g.portal.match(/^https?:\/\/([^\/:]+)/i) || [])[1] || 'Portal';
      var pre = 'Portal ' + (order.length > 1 ? (i + 1) + ' · ' : '') + host;
      // Con "respaldo": una lista por portal y las demás MAC de reserva. Si no, cada MAC es una lista (cada una con su propio contenido)
      if (backup || g.macs.length === 1) { g.mac = g.macs[0]; g.name = pre; out.push(g); return; }
      g.macs.forEach(function (m, j) { out.push({ type: 'stalker', portal: g.portal, mac: m, macs: [m], name: pre + ' · MAC ' + (j + 1) + ' (' + m.slice(-5) + ')' }); });
    });
    out.groups = order.length;
    return out;
  };
  /** Prueba la dirección del portal y la MAC: encuentra la ruta correcta (portal.php o server/load.php). */
  MV.stkLogin = function (list) {
    var macs = (list.macs && list.macs.length ? list.macs : [list.mac]).map(MV.normMac).filter(Boolean);
    if (!macs.length) return Promise.reject(new Error('La MAC debe tener 12 caracteres, como 00:1A:79:AB:CD:EF'));
    list.macs = macs; list.mac = macs[0];
    // Se prueba cada ruta posible del portal con cada MAC (la primera que conecte queda como principal)
    // La ruta que ya funcionó con otra MAC del mismo portal se prueba primero
    var pk = String(list.portal || '').toLowerCase().replace(/\/+$/, ''), cl = stkCandidates(list.portal);
    if (STK_API[pk]) cl = [STK_API[pk]].concat(cl.filter(function (x) { return x !== STK_API[pk]; }));
    var combos = []; cl.forEach(function (a) { macs.forEach(function (m) { combos.push([a, m]); }); });
    var i = 0, lastErr = null;
    function next() {
      if (i >= combos.length || i >= 40) return Promise.reject(lastErr || new Error('No encontré el portal en esa dirección'));
      list.api = combos[i][0]; list.mac = combos[i][1]; i++;
      return stkToken(list, true).then(function () {
        STK_API[pk] = list.api;
        return stkGet(list, 'type=account_info&action=get_main_info').catch(function () { return {}; });
      }).catch(function (e) { lastErr = e; return next(); });
    }
    return next();
  };
  function stkImg(list, u) {
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    var origin = (list.api.match(/^(https?:\/\/[^\/]+)/i) || [''])[0];
    return origin + (u.charAt(0) === '/' ? '' : '/') + u;
  }
  /** Recorre todas las páginas de un listado del portal (14 por página normalmente), varias a la vez. */
  // Categorías ya descargadas en esta sesión por otra MAC del mismo portal. De cada categoría SIEMPRE se pide la primera página
  // y solo se salta el resto si es idéntica a la de la otra MAC (mismo total de títulos y los mismos títulos en la primera página).
  // Si la categoría se llama igual pero trae otro contenido (otro paquete), se descarga completa.
  var STK_SEEN = {}, STK_API = {};
  function stkPages(list, type, cats, budget) {
    var out = [], jobs = [], portalKey = list.api.toLowerCase();
    cats.forEach(function (c) { jobs.push({ c: c, p: 1 }); });
    var used = 0, skipped = 0, total = cats.length, label = type === 'series' ? 'Series' : 'Películas', lastEmit = 0;
    function worker() {
      var j = jobs.shift(); if (!j || used >= budget) return Promise.resolve();
      used++;
      if (Date.now() - lastEmit > 700) { lastEmit = Date.now(); S.loadMsg = (list.name || 'Portal') + ' · ' + label + ': ' + used + ' de ' + Math.max(total, used) + ' páginas'; MV.emit('catalog'); }
      return stkGet(list, 'type=' + type + '&action=get_ordered_list&category=' + encodeURIComponent(j.c.id) + '&genre=' + encodeURIComponent(j.c.id) + '&p=' + j.p + '&sortby=added&fav=0').then(function (js) {
        var data = (js && js.data) || [];
        data.forEach(function (d) { d._cat = j.c.title; out.push(d); });
        if (j.p === 1) {
          var k = portalKey + '|' + type + '|' + j.c.id + '|' + j.c.title;
          var sig = (+(js && js.total_items) || data.length) + ':' + data.map(function (d) { return d.id; }).join(',');
          var seen = STK_SEEN[k] || (STK_SEEN[k] = {});
          if (seen[sig]) { skipped++; return; }   // idéntica a la de otra MAC: el resto ya está descargado
          seen[sig] = 1;
        }
        if (j.p === 1 && js && +js.total_items > data.length && data.length) {
          var pages = Math.min(Math.ceil(+js.total_items / Math.max(1, +js.max_page_items || data.length)), 80);
          for (var p = 2; p <= pages; p++) jobs.push({ c: j.c, p: p });
          total += Math.max(0, pages - 1);
        }
      }).catch(function () {}).then(worker);
    }
    var w = []; for (var k = 0; k < 8; k++) w.push(worker());
    return Promise.all(w).then(function () { return out; });
  }
  function buildFromStalker(list) {
    function safe(pr, d) { return pr.catch(function () { return d; }); }
    S.loadMsg = 'Cargando el portal…'; MV.emit('catalog');
    var base;
    return (list.api ? stkToken(list, true).catch(function () { return MV.stkLogin(list); }) : MV.stkLogin(list)).then(function () {
      base = { api: list.api, mac: list.mac, macs: list.macs || [list.mac] };
      return Promise.all([
        safe(stkGet(list, 'type=itv&action=get_genres'), []),
        safe(stkGet(list, 'type=itv&action=get_all_channels'), {}),
        safe(stkGet(list, 'type=vod&action=get_categories'), []),
        safe(stkGet(list, 'type=series&action=get_categories'), [])
      ]);
    }).then(function (r) {
      var gm = {}; (Array.isArray(r[0]) ? r[0] : []).forEach(function (g) { gm[g.id] = g.title; });
      var out = [];
      ((r[1] && r[1].data) || []).forEach(function (c) {
        if (!c || !c.cmd) return;
        out.push(tags({ key: 'live:' + (c.xmltv_id ? String(c.xmltv_id).toLowerCase() : MV.norm(c.name)), type: 'live', name: c.name, logo: stkImg(list, c.logo), group: gm[c.tv_genre_id] || 'En vivo', tvg: c.xmltv_id || '', num: c.number, url: 'stalker:itv:' + c.id, ua: STK_UA, stk: Object.assign({ t: 'itv', cmd: c.cmd }, base), list: list.id }));
      });
      var vcats = (Array.isArray(r[2]) ? r[2] : []).filter(function (c) { return c.id !== '*'; });
      var scats = (Array.isArray(r[3]) ? r[3] : []).filter(function (c) { return c.id !== '*'; });
      S.loadMsg = 'Cargando películas y series del portal…'; MV.emit('catalog');
      return Promise.all([stkPages(list, 'vod', vcats, 900), scats.length ? stkPages(list, 'series', scats, 500) : Promise.resolve([])]).then(function (v) {
        function add(d, mod) {
          var series = mod === 'series' || d.is_series === '1' || d.is_series === 1;
          var y = String(d.year || '').match(/(19|20)\d{2}/); y = y ? y[0] : '';
          var common = { name: d.name || d.o_name, poster: stkImg(list, d.screenshot_uri || d.cover_big || d.pic), group: d._cat || (series ? 'Series' : 'Películas'), plot: d.description || '', genre: d.genres_str || '', rating: d.rating_imdb || d.rating_kinopoisk || '', year: y, list: list.id };
          if (!common.name) return;
          if (series) out.push(tags(Object.assign({ key: 'series:' + MV.norm(common.name), type: 'series', stks: Object.assign({ t: mod, id: d.id }, base), episodes: [] }, common)));
          else if (d.cmd) out.push(tags(Object.assign({ key: 'movie:' + MV.norm(common.name), type: 'movie', url: 'stalker:vod:' + d.id, ua: STK_UA, stk: Object.assign({ t: 'vod', cmd: d.cmd }, base), added: d.added ? Date.parse(String(d.added).replace(' ', 'T')) / 1000 || 0 : 0 }, common)));
        }
        v[0].forEach(function (d) { add(d, 'vod'); });
        v[1].forEach(function (d) { add(d, 'series'); });
        return out;
      });
    });
  }
  /** Temporadas y capítulos de una serie del portal: cada temporada trae la lista de capítulos y un "cmd" para pedir el enlace. */
  function stkEpisodes(item) {
    var x = item.stks, list = { api: x.api, mac: x.mac };   // (la MAC principal; el reproductor usa las de respaldo si hace falta)
    return stkGet(list, 'type=' + x.t + '&action=get_ordered_list&movie_id=' + encodeURIComponent(x.id) + '&season_id=0&episode_id=0&p=1').then(function (js) {
      var eps = [];
      ((js && js.data) || []).forEach(function (s, si) {
        var sn = +((String(s.name || '').match(/(\d+)/) || [])[1]) || si + 1;
        var list2 = Array.isArray(s.series) ? s.series : [];
        list2.forEach(function (n) {
          eps.push({ season: sn, ep: +n, title: 'Episodio ' + n, url: 'stalker:ep:' + s.id + ':' + n, ua: STK_UA, stk: { api: x.api, mac: x.mac, macs: x.macs || [x.mac], t: 'vod', cmd: s.cmd, series: +n } });
        });
      });
      eps.sort(function (a, b) { return a.season - b.season || a.ep - b.ep; });
      item.episodes = eps;
      return eps;
    });
  }


  // ---------- Servidor propio: Jellyfin / Emby y Plex ----------
  // Tus archivos (MKV con varios audios y subtítulos) se reproducen tal cual: el reproductor elige audio latino y subtítulos.
  function srvBase(u) { u = String(u || '').trim().replace(/\/+$/, '').replace(/\/web(\/index\.html)?(#.*)?$/i, ''); if (!/^https?:\/\//i.test(u)) u = 'http://' + u; return u; }
  function devId() { var d = MV.load('devId', ''); if (!d) { d = 'mv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); MV.save('devId', d); } return d; }
  function jfAuth(tok) { return 'MediaBrowser Client="MiVibra TV", Device="' + String(MV.device.model || 'Android').replace(/"/g, '') + '", DeviceId="' + devId() + '", Version="1.0"' + (tok ? ', Token="' + tok + '"' : ''); }
  function jfGet(list, path) {
    var sep = path.indexOf('?') >= 0 ? '&' : '?';
    return MV.getText(list.server + path + sep + 'api_key=' + encodeURIComponent(list.token), { 'X-Emby-Authorization': jfAuth(list.token), Accept: 'application/json' }).then(function (t) { return JSON.parse(t); });
  }
  function postJson(url, obj, headers) {
    if (MV.native) return MV.call('httpPost2', [url, JSON.stringify(obj), 'application/json', JSON.stringify(headers || {})]).then(function (d) {
      if (d.status === 401 || d.status === 403) throw new Error('Usuario o contraseña incorrectos');
      if (d.status >= 400) throw new Error('El servidor respondió ' + d.status);
      return JSON.parse(d.text || '{}');
    });
    return fetch(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}), body: JSON.stringify(obj) }).then(function (r) { if (!r.ok) throw new Error(r.status === 401 ? 'Usuario o contraseña incorrectos' : 'El servidor respondió ' + r.status); return r.json(); });
  }
  /** Inicia sesión: Jellyfin/Emby con usuario y contraseña (también prueba la ruta /emby); Plex con su token. */
  MV.mediaLogin = function (list) {
    list.server = srvBase(list.server);
    if (list.type === 'plex') {
      return MV.getText(list.server + '/library/sections?X-Plex-Token=' + encodeURIComponent(list.token), { Accept: 'application/json' }).then(function (t) {
        var j = JSON.parse(t), dirs = (j.MediaContainer && j.MediaContainer.Directory) || [];
        if (!dirs.length) throw new Error('El servidor Plex no tiene bibliotecas de películas o series');
        return { name: (j.MediaContainer && j.MediaContainer.title1) || 'Plex' };
      }).catch(function (e) { throw new Error(/401|unauthor/i.test(e.message) ? 'El token de Plex no es válido' : 'No pude conectar con Plex: ' + e.message); });
    }
    var bases = [list.server]; if (!/\/emby$/i.test(list.server)) bases.push(list.server + '/emby');
    var i = 0, lastErr = null;
    function next() {
      if (i >= bases.length) return Promise.reject(lastErr || new Error('No encontré el servidor'));
      var b = bases[i++];
      return postJson(b + '/Users/AuthenticateByName', { Username: list.user || '', Pw: list.pass || '' }, { 'X-Emby-Authorization': jfAuth(''), Authorization: jfAuth('') }).then(function (j) {
        if (!j.AccessToken) throw new Error('El servidor no aceptó el inicio de sesión');
        list.server = b; list.token = j.AccessToken; list.uid = (j.User && j.User.Id) || '';
        return { name: (j.User && j.User.Name) || list.user };
      }).catch(function (e) { lastErr = /incorrectos/.test(e.message) ? e : (lastErr || e); if (/incorrectos/.test(e.message)) return Promise.reject(e); return next(); });
    }
    return next();
  };
  /** Idioma real según las pistas del archivo: audio en español (latino si la pista lo dice), o solo subtítulos en español. */
  function streamsLang(ms) {
    ms = ms || []; if (!ms.length) return '';
    var spa = function (x) { return /^(spa|es|esl|es-419|es-mx)/i.test(x.Language || '') || /espa[nñ]ol|spanish|latino|castellano/i.test((x.DisplayTitle || '') + ' ' + (x.Title || '')); };
    var aud = ms.filter(function (x) { return x.Type === 'Audio'; }), subs = ms.filter(function (x) { return x.Type === 'Subtitle'; });
    var sa = aud.filter(spa);
    if (sa.length) {
      if (sa.some(function (x) { return /lat|419|mex|am[eé]rica/i.test((x.DisplayTitle || '') + ' ' + (x.Title || '') + ' ' + (x.Language || '')); })) return 'lat';
      if (sa.every(function (x) { return /castellano|espa[nñ]a|spain|es-es|castilian/i.test((x.DisplayTitle || '') + ' ' + (x.Title || '')); })) return 'cast';
      return 'es';
    }
    if (subs.some(spa)) return 'sub';
    return aud.length ? 'otro' : '';
  }
  /** Pistas del archivo para el menú "Audio y subtítulos" (idioma|título). */
  function streamsTracks(ms) {
    var t = { a: [], s: [] };
    (ms || []).forEach(function (x) {
      var v = (x.Language || 'und') + '|' + (x.Title || '');
      if (x.Type === 'Audio' && t.a.indexOf(v) < 0) t.a.push(v);
      if (x.Type === 'Subtitle' && t.s.indexOf(v) < 0) t.s.push(v);
    });
    return t.a.length || t.s.length ? t : undefined;
  }
  function jfItems(list, types) {
    var out = [], start = 0, page = 1500;
    function more() {
      return jfGet(list, '/Users/' + list.uid + '/Items?IncludeItemTypes=' + types + '&Recursive=true&Fields=ProductionYear,Genres,Overview,ProviderIds,DateCreated,MediaStreams,CommunityRating&StartIndex=' + start + '&Limit=' + page + '&SortBy=DateCreated&SortOrder=Descending').then(function (j) {
        var it = j.Items || []; out = out.concat(it); start += it.length;
        S.loadMsg = (list.name || 'Servidor') + ': ' + out.length + ' títulos'; MV.emit('catalog');
        return it.length === page && start < (j.TotalRecordCount || 0) ? more() : out;
      });
    }
    return more();
  }
  function buildFromJellyfin(list) {
    var s = list.server, k = encodeURIComponent(list.token);
    var img = function (id) { return s + '/Items/' + id + '/Images/Primary?maxHeight=450&quality=90&api_key=' + k; };
    var y4 = function (d) { return d.ProductionYear ? String(d.ProductionYear) : ''; };
    var grp = function (kind, d) { return (list.name || 'Mi servidor') + ' · ' + kind + ((d.Genres || [])[0] ? ' · ' + d.Genres[0] : ''); };
    return Promise.all([jfItems(list, 'Movie'), jfItems(list, 'Series')]).then(function (r) {
      var out = [];
      r[0].forEach(function (d) {
        var tm = d.ProviderIds && (d.ProviderIds.Tmdb || d.ProviderIds.tmdb);
        out.push(tags({ key: 'movie:' + MV.norm(d.Name + ' ' + y4(d)), type: 'movie', name: d.Name + (y4(d) ? ' (' + y4(d) + ')' : ''), year: y4(d), poster: img(d.Id), plot: d.Overview || '', genre: (d.Genres || []).join(', '), rating: d.CommunityRating ? String(d.CommunityRating) : '', group: grp('Películas', d), url: s + '/Videos/' + d.Id + '/stream?static=true&api_key=' + k, tid: tm ? 'movie:' + tm : undefined, langFixed: streamsLang(d.MediaStreams), tracks: streamsTracks(d.MediaStreams), added: d.DateCreated ? Date.parse(d.DateCreated) / 1000 : 0, list: list.id }));
      });
      r[1].forEach(function (d) {
        var tm = d.ProviderIds && (d.ProviderIds.Tmdb || d.ProviderIds.tmdb);
        out.push(tags({ key: 'series:' + MV.norm(d.Name), type: 'series', name: d.Name, year: y4(d), poster: img(d.Id), plot: d.Overview || '', genre: (d.Genres || []).join(', '), group: grp('Series', d), jf: { list: list.id, id: d.Id }, tid: tm ? 'tv:' + tm : undefined, added: d.DateCreated ? Date.parse(d.DateCreated) / 1000 : 0, episodes: [], list: list.id }));
      });
      return out;
    });
  }
  function pxGet(list, path) {
    var sep = path.indexOf('?') >= 0 ? '&' : '?';
    return MV.getText(list.server + path + sep + 'X-Plex-Token=' + encodeURIComponent(list.token), { Accept: 'application/json', 'X-Plex-Client-Identifier': devId(), 'X-Plex-Product': 'MiVibra TV' }).then(function (t) { return JSON.parse(t).MediaContainer || {}; });
  }
  function pxTid(m, kind) { var g = (m.Guid || []).map(function (x) { return x.id; }).join(' '); var t = g.match(/tmdb:\/\/(\d+)/); return t ? kind + ':' + t[1] : undefined; }
  function buildFromPlex(list) {
    var s = list.server, k = encodeURIComponent(list.token);
    var img = function (p) { return p ? s + '/photo/:/transcode?width=320&height=480&minSize=1&url=' + encodeURIComponent(p) + '&X-Plex-Token=' + k : ''; };
    return pxGet(list, '/library/sections').then(function (mc) {
      var dirs = (mc.Directory || []).filter(function (d) { return d.type === 'movie' || d.type === 'show'; });
      return Promise.all(dirs.map(function (d) { return pxGet(list, '/library/sections/' + d.key + '/all?includeGuids=1').then(function (x) { return { d: d, items: x.Metadata || [] }; }).catch(function () { return { d: d, items: [] }; }); }));
    }).then(function (secs) {
      var out = [];
      secs.forEach(function (sec) {
        sec.items.forEach(function (m) {
          var y = m.year ? String(m.year) : '', genre = (m.Genre || []).map(function (g) { return g.tag; }).join(', ');
          var group = (list.name || 'Plex') + ' · ' + sec.d.title;
          if (sec.d.type === 'movie') {
            var part = m.Media && m.Media[0] && m.Media[0].Part && m.Media[0].Part[0];
            if (!part) return;
            out.push(tags({ key: 'movie:' + MV.norm(m.title + ' ' + y), type: 'movie', name: m.title + (y ? ' (' + y + ')' : ''), year: y, poster: img(m.thumb), plot: m.summary || '', genre: genre, rating: m.audienceRating ? String(m.audienceRating) : '', group: group, url: s + part.key + '?X-Plex-Token=' + k, tid: pxTid(m, 'movie'), added: m.addedAt || 0, list: list.id }));
          } else {
            out.push(tags({ key: 'series:' + MV.norm(m.title), type: 'series', name: m.title, year: y, poster: img(m.thumb), plot: m.summary || '', genre: genre, group: group, px: { list: list.id, id: m.ratingKey }, tid: pxTid(m, 'tv'), added: m.addedAt || 0, episodes: [], list: list.id }));
          }
        });
      });
      return out;
    });
  }
  function mediaEpisodes(item) {
    var ref = item.jf || item.px, list = S.lists.find(function (l) { return l.id === ref.list; });
    if (!list) return Promise.resolve([]);
    var s = list.server, k = encodeURIComponent(list.token);
    var job = item.jf
      ? jfGet(list, '/Shows/' + ref.id + '/Episodes?UserId=' + list.uid + '&Fields=Overview,MediaStreams').then(function (j) {
          return (j.Items || []).map(function (e) { return { season: e.ParentIndexNumber || 1, ep: e.IndexNumber || 0, title: e.Name || ('Episodio ' + e.IndexNumber), plot: e.Overview || '', url: s + '/Videos/' + e.Id + '/stream?static=true&api_key=' + k, img: s + '/Items/' + e.Id + '/Images/Primary?maxHeight=240&api_key=' + k }; });
        })
      : pxGet(list, '/library/metadata/' + ref.id + '/allLeaves').then(function (mc) {
          return (mc.Metadata || []).map(function (e) { var p = e.Media && e.Media[0] && e.Media[0].Part && e.Media[0].Part[0]; return p ? { season: e.parentIndex || 1, ep: e.index || 0, title: e.title || ('Episodio ' + e.index), plot: e.summary || '', url: s + p.key + '?X-Plex-Token=' + k } : null; }).filter(Boolean);
        });
    return job.then(function (eps) { eps.sort(function (a, b) { return a.season - b.season || a.ep - b.ep; }); item.episodes = eps; return eps; });
  }


  // ---------- Página web: busca los videos de una página y de las páginas enlazadas del mismo sitio ----------
  var VID_EXT = /\.(mp4|m3u8|webm|mkv|mov|m4v)(\?|#|$)/i;
  // Reproductores incrustados que NO son videos: anuncios, mapas, comentarios, redes, formularios, chats
  var EMBED_SKIP = /doubleclick|googlesyndication|googletagmanager|google-analytics|adservice|\/ads?\/|facebook\.com\/plugins|platform\.twitter|instagram\.com\/embed|disqus|recaptcha|hcaptcha|google\.com\/maps|maps\.google|openstreetmap|calendly|typeform|forms\.gle|docs\.google\.com\/forms|tawk\.to|crisp\.chat|intercom|livechat|whatsapp|spotify\.com|soundcloud|paypal|stripe|mercadopago|wompi/i;
  /** Google Drive: el enlace "ver archivo" se convierte en su reproductor ("preview"). */
  function driveEmbed(u) { var m = String(u).match(/drive\.google\.com\/file\/d\/([\w-]+)/); return m ? 'https://drive.google.com/file/d/' + m[1] + '/preview' : u; }
  function absUrl(u, base) { try { return new URL(u, base).href; } catch (e) { return ''; } }
  function ytId(u) { var m = String(u || '').match(/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/); return m ? m[1] : ''; }
  function txt(el) { return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
  function meta(doc, n) { var m = doc.querySelector('meta[property="' + n + '"], meta[name="' + n + '"]'); return m ? (m.getAttribute('content') || '').trim() : ''; }
  /** Videos de un documento HTML: datos estructurados (VideoObject), etiquetas <video>, enlaces a archivos de video y videos de YouTube/Vimeo incrustados. */
  function pageVideos(doc, url) {
    var out = [], seen = {};
    var pTitle = meta(doc, 'og:title') || txt(doc.querySelector('h1')) || txt(doc.querySelector('title'));
    var pImg = absUrl(meta(doc, 'og:image'), url), pDesc = meta(doc, 'og:description') || meta(doc, 'description');
    function add(v) {
      if (!v.src) return;
      var k = v.yt ? 'yt:' + v.yt : v.src; if (seen[k]) return; seen[k] = 1;
      out.push({ src: v.src, yt: v.yt || '', embed: v.embed || '', title: (v.title || pTitle || 'Video').slice(0, 140), img: v.img || (v.yt ? 'https://i.ytimg.com/vi/' + v.yt + '/hqdefault.jpg' : pImg), desc: v.desc || pDesc || '', page: url });
    }
    // 1) Datos estructurados (lo más fiable)
    Array.prototype.forEach.call(doc.querySelectorAll('script[type="application/ld+json"]'), function (sc) {
      var j; try { j = JSON.parse(sc.textContent); } catch (e) { return; }
      var all = [].concat(j['@graph'] || j);
      all.forEach(function walk(o) {
        if (!o || typeof o !== 'object') return;
        if (Array.isArray(o)) return o.forEach(walk);
        if (/VideoObject/i.test([].concat(o['@type'] || []).join(' '))) {
          var c = absUrl(o.contentUrl || '', url), e = absUrl(o.embedUrl || '', url), th = [].concat(o.thumbnailUrl || [])[0];
          var y = ytId(c) || ytId(e);
          add({ src: c || e, yt: y, embed: !c && e && !y ? e : '', title: o.name, img: th ? absUrl(typeof th === 'string' ? th : th.url, url) : '', desc: o.description });
        }
        ['video', 'hasPart', 'itemListElement', 'mainEntity'].forEach(function (k) { if (o[k]) walk(o[k]); });
      });
    });
    // 2) Etiquetas <video>
    Array.prototype.forEach.call(doc.querySelectorAll('video'), function (v) {
      var src = v.getAttribute('src') || ((v.querySelector('source') || {}).getAttribute ? v.querySelector('source').getAttribute('src') : '');
      if (!src) return;
      var box = v.closest('article, section, figure, li, div');
      add({ src: absUrl(src, url), title: v.getAttribute('title') || v.getAttribute('aria-label') || txt(box && box.querySelector('h1, h2, h3, h4, figcaption')), img: absUrl(v.getAttribute('poster') || '', url) });
    });
    // 3) Reproductores incrustados de cualquier sitio (tu video alojado en otro servicio y la página solo lo reproduce).
    //    Se abre con el mismo reproductor que usa tu página. Se ignoran anuncios, mapas, comentarios y botones sociales.
    Array.prototype.forEach.call(doc.querySelectorAll('iframe[src], iframe[data-src], iframe[data-lazy-src], embed[src], object[data]'), function (f) {
      var raw = f.getAttribute('src') || f.getAttribute('data-src') || f.getAttribute('data-lazy-src') || f.getAttribute('data') || '';
      if (!raw || /^(about:|javascript:|data:)/i.test(raw)) return;
      var src = absUrl(raw, url), y = ytId(src);
      if (!y && EMBED_SKIP.test(src)) return;
      var box = f.closest('article, section, figure, li, div');
      var t = f.getAttribute('title') || txt(box && box.querySelector('h1, h2, h3, h4, figcaption'));
      if (y) add({ src: src, yt: y, title: t });
      else if (VID_EXT.test(src)) add({ src: src, title: t });
      else add({ src: src, embed: driveEmbed(src), title: t });
    });
    // 4) Enlaces directos a archivos de video, a YouTube o a Google Drive
    Array.prototype.forEach.call(doc.querySelectorAll('a[href]'), function (a) {
      var h = absUrl(a.getAttribute('href'), url), y = ytId(h);
      if (y) add({ src: h, yt: y, title: txt(a) || a.getAttribute('title') });
      else if (/drive\.google\.com\/file\/d\//i.test(h)) add({ src: h, embed: driveEmbed(h), title: txt(a) || a.getAttribute('title') });
      else if (VID_EXT.test(h)) add({ src: h, title: txt(a) || a.getAttribute('title') || decodeURIComponent(h.split('/').pop().split('?')[0]).replace(/\.\w+$/, '').replace(/[_-]+/g, ' ') });
    });
    // 5) Direcciones de video escritas dentro de los scripts de la página (reproductores tipo JW Player, Video.js, Plyr…)
    var html = doc.documentElement ? doc.documentElement.innerHTML : '';
    (html.match(/https?:(?:\\?\/){2}[^"'\s<>()]+?\.(?:m3u8|mp4|webm)(?:\?[^"'\s<>()]*)?/gi) || []).slice(0, 60).forEach(function (u) {
      u = u.replace(/\\\//g, '/');
      if (!/thumb|preview\.mp4|sprite|banner|ads?[\/_.-]/i.test(u)) add({ src: u, title: pTitle });
    });
    // 6) og:video
    var ov = meta(doc, 'og:video:secure_url') || meta(doc, 'og:video:url') || meta(doc, 'og:video');
    if (ov) { var oy = ytId(ov); add({ src: absUrl(ov, url), yt: oy, title: pTitle }); }
    return out;
  }
  /** Enlaces del mismo sitio que valen la pena revisar (no imágenes, archivos ni cuentas). */
  function siteLinks(doc, url, origin) {
    var out = [];
    Array.prototype.forEach.call(doc.querySelectorAll('a[href]'), function (a) {
      var h = absUrl(a.getAttribute('href'), url).split('#')[0];
      if (!h || h.indexOf(origin) !== 0 || h === url || VID_EXT.test(h)) return;
      if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|rar|css|js|xml|json|txt|docx?|xlsx?|pptx?)(\?|$)/i.test(h)) return;
      if (/\/(login|logout|signin|signup|registro|register|cart|carrito|checkout|wp-admin|wp-login|account|cuenta|feed|author\/)/i.test(h)) return;
      if (out.indexOf(h) < 0) out.push({ url: h, label: txt(a) });
    });
    return out;
  }
  function parseHtml(t) { return new DOMParser().parseFromString(t, 'text/html'); }
  // Enlaces que en la página funcionan como filtro o categoría (/categoria/…, ?tipo=…, etiquetas, listas de reproducción…)
  var CAT_URL = /[\/?&](categor[iy]a?s?|category|categories|genero|g[eé]nero|genre|tipo|type|tag|etiqueta|seccion|secci[oó]n|section|coleccion|colecci[oó]n|collection|materia|tema|temas|filtro|filter)[\/=_-]/i;   // (las páginas de una serie, curso o playlist no son categorías: son series)
  function buildFromWeb(list) {
    var start = list.url.trim(); if (!/^https?:\/\//i.test(start)) start = 'https://' + start;
    var origin = (start.match(/^(https?:\/\/[^\/]+)/i) || [start])[0];
    var rendered = 0, maxPages = list.deep === false ? 1 : 300, pages = {}, queue = [{ url: start, depth: 0, cat: '' }], pageList = [], done = 0, total = 0;
    S.loadMsg = (list.name || 'Página') + ': revisando…'; MV.emit('catalog');
    function worker() {
      var job = queue.shift(); if (!job || done >= maxPages) return Promise.resolve();
      if (pages[job.url]) return worker();
      pages[job.url] = 1; done++;
      return MV.getText(job.url, { 'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36', Accept: 'text/html,application/xhtml+xml' }).then(function (t) {
        var doc = parseHtml(t);
        // Página armada con JavaScript (sin videos en el HTML inicial): se abre en un navegador invisible y se lee ya armada
        if (!pageVideos(doc, job.url).length && MV.native && rendered < 40) {
          rendered++;
          S.loadMsg = (list.name || 'Página') + ': abriendo ' + (job.url.replace(/^https?:\/\//, '').slice(0, 50)) + '…'; MV.emit('catalog');
          return MV.call('renderHtml', [job.url, 5000]).then(function (d) { return d && d.html ? parseHtml(d.html) : doc; }).catch(function () { return doc; });
        }
        return doc;
      }).then(function (doc) {
        // Categoría de la página: la que ella misma declara (WordPress, Blogger…) o la del filtro/menú por el que se llegó
        var own = meta(doc, 'article:section') || txt(doc.querySelector('a[rel~="category"], .cat-links a, .post-categories a, .breadcrumb li:nth-last-child(2) a, nav[aria-label*="breadcrumb" i] li:nth-last-child(2) a'));
        var cat = (own || job.cat || '').slice(0, 40);
        var vs = pageVideos(doc, job.url);
        total += vs.length;
        pageList.push({ url: job.url, depth: job.depth, cat: cat, title: meta(doc, 'og:title') || txt(doc.querySelector('h1')) || txt(doc.querySelector('title')), img: absUrl(meta(doc, 'og:image'), job.url), desc: meta(doc, 'og:description') || meta(doc, 'description'), isCat: CAT_URL.test(job.url) || job.depth === 0, vids: vs });
        if (job.depth < 3) siteLinks(doc, job.url, origin).forEach(function (l) {
          if (pages[l.url] || queue.length >= 3000) return;
          // El filtro o categoría de tu página (por su dirección, o por estar en el menú principal) pasa a ser la categoría en MiVibra
          var c = CAT_URL.test(l.url) && l.label ? l.label : job.depth === 0 ? (l.label || '') : job.cat;
          queue.push({ url: l.url, depth: job.depth + 1, cat: (c || '').slice(0, 40) });
        });
        S.loadMsg = (list.name || 'Página') + ': ' + done + ' páginas revisadas · ' + total + ' videos'; MV.emit('catalog');
      }).catch(function (e) { if (job.depth === 0) throw e; }).then(worker);
    }
    // La primera página va sola (si falla, la lista falla); luego varias a la vez
    return worker().then(function () { var w = []; for (var i = 0; i < 5; i++) w.push(worker()); return Promise.all(w); }).then(function () {
      var claimed = {}, out = [], g = function (c) { return (list.name || 'Mi página') + (c ? ' · ' + c : ''); };
      var vkey = function (v) { return v.yt ? 'yt:' + v.yt : v.src; };
      // 1) Páginas de una serie (una página con varios videos que no es un listado ni una categoría): una "serie" con sus capítulos en orden
      pageList.filter(function (p) { return !p.isCat && p.vids.length >= 2; }).forEach(function (p) {
        var eps = p.vids.filter(function (v) { return !claimed[vkey(v)]; });
        if (eps.length < 2) return;
        eps.forEach(function (v) { claimed[vkey(v)] = 1; });
        out.push(tags({ key: 'video:' + MV.hash('page:' + p.url), type: 'video', name: p.title || eps[0].title, poster: p.img || eps[0].img, plot: p.desc || '', group: g(p.cat), page: p.url, list: list.id,
          eps: eps.map(function (v, n) { return { title: v.title && v.title !== p.title ? v.title : 'Video ' + (n + 1), url: v.yt ? 'yt:' + v.yt : v.src, yt: v.yt || '', embed: v.embed || '', img: v.img || '', desc: v.desc || '' }; }),
          added: Date.now() / 1000 }));
      });
      // 2) Videos sueltos
      pageList.forEach(function (p) {
        p.vids.forEach(function (v) {
          var k = vkey(v); if (claimed[k]) return; claimed[k] = 1;
          out.push(tags({ key: 'video:' + MV.hash(k), type: 'video', name: v.title, poster: v.img, plot: v.desc, group: g(p.cat), url: v.yt ? 'yt:' + v.yt : v.src, yt: v.yt || '', embed: v.embed || '', page: v.page, list: list.id }));
        });
      });
      if (!out.length) throw new Error('No encontré videos en esa página');
      return out;
    });
  }

  /** Episodios de una serie Xtream (se cargan al abrir la ficha). */
  MV.loadEpisodes = function (item) {
    if (item.stks && !(item.episodes || []).length) return stkEpisodes(item);
    if ((item.jf || item.px) && !(item.episodes || []).length) return mediaEpisodes(item);
    if (!item.xt) return Promise.resolve(item.episodes || []);
    var list = S.lists.find(function (l) { return l.id === item.xt.list; });
    if (!list) return Promise.resolve([]);
    var base = xtBase(list), u = encodeURIComponent(list.user), p = encodeURIComponent(list.pass);
    return xtGet(list, 'get_series_info', '&series_id=' + item.xt.id).then(function (j) {
      var eps = [];
      var src = j.episodes || {};
      Object.keys(src).forEach(function (season) {
        (src[season] || []).forEach(function (e) {
          eps.push({ season: +season, ep: +e.episode_num, title: MV.noEmoji(e.title) || ('Episodio ' + e.episode_num), url: base + '/series/' + u + '/' + p + '/' + e.id + '.' + (e.container_extension || 'mp4'), ua: list.ua || '', plot: e.info && e.info.plot, img: e.info && e.info.movie_image });
        });
      });
      if (j.info) { item.plot = item.plot || j.info.plot; item.backdrop = item.backdrop || (j.info.backdrop_path && j.info.backdrop_path[0]); }
      item.episodes = eps;
      return eps;
    });
  };

  // ---------- Carga y combinación de todas las listas ----------
  function retag(o) { try { return tags(o); } catch (e) { return o; } }
  function loadList(list, force) {
    var ck = 'list:' + list.id;
    return MV.idbGet(ck).then(function (cached) {
      // Las páginas web se actualizan cada hora (tus series nuevas aparecen solas); lo demás cada 12 horas
      var fresh = cached && cached.ts > Date.now() - (list.type === 'web' ? 3600e3 : 12 * 3600e3) && cached.v === 6;
      // Lo guardado se vuelve a clasificar con las reglas actuales (+18, infantil, géneros, sin emojis)
      if (cached && !force && fresh) return cached.items.map(retag);
      var job;
      if (list.type === 'xtream') job = buildFromXtream(list);
      else if (list.type === 'stalker') job = buildFromStalker(list);
      else if (list.type === 'jellyfin') job = buildFromJellyfin(list);
      else if (list.type === 'plex') job = buildFromPlex(list);
      else if (list.type === 'web') job = buildFromWeb(list);
      else if (list.type === 'file') job = MV.idbGet('raw:' + list.id).then(function (txt) { return buildFromM3U(MV.parseM3U(txt || '', list), list); });
      else job = MV.getBig(list.url).then(function (txt) {
        if (!/#EXTINF|#EXTM3U/i.test(txt.slice(0, 5000))) throw new Error('No parece una lista M3U');
        return buildFromM3U(MV.parseM3U(txt, list), list);
      });
      return job.then(function (items) {
        list.count = items.length; list.updated = Date.now(); list.error = '';
        // Para borrar listas vacías sin equivocarse: se recuerda si alguna vez trajo contenido y cuántas veces seguidas llegó vacía
        if (items.length) { list.hadItems = true; list.zeroLoads = 0; } else list.zeroLoads = (list.zeroLoads || 0) + 1;
        MV.idbSet(ck, { ts: Date.now(), v: 6, items: items });
        return items;
      }).catch(function (e) {
        list.error = e.message || 'Error';
        if (cached) return cached.items.map(retag); // sin internet: usa lo último que funcionó
        throw e;
      });
    });
  }

  MV.reloadCatalog = function (force) {
    S.loading = true; S.loadMsg = 'Cargando tus listas…'; MV.emit('catalog');
    var lists = S.lists.filter(function (l) { return l.enabled !== false; });
    var failed = [];
    return Promise.all(lists.map(function (l) {
      return loadList(l, force).catch(function (e) { failed.push(l.name + ': ' + e.message); if (!l.count) l.zeroLoads = (l.zeroLoads || 0) + 1; return []; });
    })).then(function (all) {
      // Listas con 0 elementos: se eliminan solas (si nunca trajeron nada, de una; si antes funcionaban, tras 2 cargas vacías seguidas)
      if (P.pruneEmpty !== false && MV.acct && MV.acct.canEdit && MV.acct.canEdit()) {
        var gone = lists.filter(function (l, i) { return !(all[i] || []).length && !l.count && l.zeroLoads >= (l.hadItems ? 2 : 1); });
        if (gone.length) {
          var ids = gone.map(function (l) { return l.id; });
          all = all.filter(function (_, i) { return ids.indexOf(lists[i].id) < 0; });
          S.lists = S.lists.filter(function (l) { return ids.indexOf(l.id) < 0; });
          ids.forEach(function (id) { MV.idbDel('list:' + id); MV.idbDel('raw:' + id); });
          failed = failed.filter(function (f) { return !gone.some(function (l) { return f.indexOf(l.name + ':') === 0; }); });
          MV.toast(gone.length === 1 ? 'Se eliminó “' + gone[0].name + '” porque quedó con 0 elementos' : 'Se eliminaron ' + gone.length + ' listas que quedaron con 0 elementos', 5000);
        }
      }
      // Un solo aviso aunque fallen muchas (con 27 MAC no se llena la pantalla de mensajes)
      if (failed.length === 1) MV.toast('“' + failed[0].replace(': ', '”: '), 4000);
      else if (failed.length > 1) MV.toast(failed.length + ' listas no cargaron. Revísalas en Ajustes › Listas (puedes borrarlas juntas con "Seleccionar varias" › "Las que fallan").', 6000);
      MV.saveLists();
      lastAll = all;
      combine(all);
      S.loading = false; MV.emit('catalog');
      MV.loadEpg(false);
      setTimeout(function () { MV.checkDupes(false); }, 4000);
    });
  };

  // ---------- Canales repetidos: probar todas las señales y quedarse con la que funciona ----------
  var PROBE_TTL = 6 * 3600e3;
  var PROBE = MV.load('probe', {});
  S.dupes = { total: 0, done: 0, fixed: 0, running: false };
  function applyProbe(it) {
    var c = it.cands || [it.url], now = Date.now();
    var r = c.map(function (u) { var p = PROBE[u]; return p && now - p.ts < PROBE_TTL ? p : null; });
    if (r.some(function (x) { return !x; })) return false;
    var good = c.map(function (u, i) { return { u: u, p: r[i] }; }).filter(function (x) { return x.p.ok; })
      .sort(function (a, b) {
        // Primero la mejor calidad (4K, FHD, HD…); entre iguales, la que responde más rápido. Una señal muy lenta (>4 s) pierde.
        var qa = (it.qs && it.qs[a.u]) || 15, qb = (it.qs && it.qs[b.u]) || 15;
        if (a.p.ms > 4000 !== b.p.ms > 4000) return a.p.ms > 4000 ? 1 : -1;
        return qb - qa || a.p.ms - b.p.ms;
      });
    if (good.length) { it.url = good[0].u; it.alts = good.slice(1).map(function (x) { return x.u; }); it.dead = false; }
    else { it.dead = true; }
    return true;
  }
  function saveProbe() {
    var keys = Object.keys(PROBE);
    if (keys.length > 6000) keys.sort(function (a, b) { return PROBE[a].ts - PROBE[b].ts; }).slice(0, keys.length - 5000).forEach(function (k) { delete PROBE[k]; });
    MV.save('probe', PROBE);
  }
  MV.checkDupes = function (force) {
    if (!MV.native || S.dupes.running) return Promise.resolve();
    if (force) PROBE = {};
    var todo = S.live.filter(function (i) { return i.cands && i.cands.length > 1 && !applyProbe(i); });
    var all = S.live.filter(function (i) { return i.cands && i.cands.length > 1; });
    S.dupes = { total: all.length, done: all.length - todo.length, fixed: 0, running: todo.length > 0 };
    if (!todo.length) { MV.emit('dupes'); return Promise.resolve(); }
    var idx = 0;
    function worker() {
      if (idx >= todo.length) return Promise.resolve();
      var it = todo[idx++], c = it.cands.slice(0, 7);
      return MV.call('probe', [JSON.stringify(c.map(function (u) { return { url: u, ua: it.ua || '', ref: it.ref || '' }; }))]).then(function (res) {
        var ts = Date.now();
        c.forEach(function (u, i) { var x = res[i] || {}; PROBE[u] = { ok: !!x.ok, ms: x.ms || 99999, ts: ts }; });
        it.cands = c;
        var before = it.url; applyProbe(it);
        if (it.url !== before) S.dupes.fixed++;
      }).catch(function () {}).then(function () { S.dupes.done++; if (S.dupes.done % 10 === 0) { saveProbe(); MV.emit('dupes'); } return worker(); });
    }
    return Promise.all([worker(), worker(), worker()]).then(function () {
      S.dupes.running = false; saveProbe(); MV.emit('dupes');
    });
  };

  /** Nombre de canal comparable entre listas: sin país, calidad ni notas ("CO: Caracol TV HD (720p)" = "Caracol TV"). */
  function liveName(n) {
    return MV.norm(String(n || '').replace(/^\s*[\[|(]?\s*[a-z]{2,5}\s*[\]|):]\s*/i, '').replace(/\([^)]*\)|\[[^\]]*\]/g, ''));
  }
  // 4K solo gana en pantallas 4K: en TV 1080p y celulares se ve igual que Full HD pero tarda mucho más en arrancar
  var UHD_OK = (function () { try { return !MV.lite && Math.max(screen.width, screen.height) * (window.devicePixelRatio || 1) >= 3000; } catch (e) { return false; } })();
  /** Calidad según el nombre, la categoría y el enlace: 4K > FHD/1080 > HD/720 > SD. Latino/español suma; CAM/TS resta. */
  function qScore(it) {
    var t = (it.name || '') + ' ' + (it.group || '') + ' ' + (it.url || '').split('?')[0];
    var q = /\b(4k|uhd|2160p?)\b/i.test(t) ? (UHD_OK ? 40 : 25) : /\b(fhd|full ?hd|1080p?)\b/i.test(t) ? 30 : /\b(hd|720p?)\b/i.test(t) ? 20 : /\b(sd|480p?|360p?)\b/i.test(t) ? 10 : 15;
    if (/\b(cam|camrip|hdcam|telesync)\b/i.test(t) || /\bTS\b/.test(it.name || '')) q -= 20;
    // Idioma: con "Solo español latino" la versión latina gana siempre; si no, suma un poco
    if (it.lang === 'lat') q += P.latOnly ? 30 : 6; else if (it.lang === 'es' || /\bdual\b/i.test(t)) q += 3; else if (it.lang === 'cast') q += 1;
    if (/\b(sub|subs|subtitulad[ao]|vose|vos)\b/i.test(t)) q -= 3;
    if (/\b(hevc|x265|h265)\b/i.test(t)) q += 1;
    return q;
  }
  var lastAll = null, redupeT = null;
  /** Vuelve a combinar cuando TMDB descubre que dos títulos son la misma película (espera a que no se esté usando el control). */
  MV.redupeLater = function () {
    clearTimeout(redupeT);
    redupeT = setTimeout(function again() {
      if (!lastAll || S.loading) return;
      if (Date.now() - (MV._lastKey || 0) < 4000 || (MV.modalOpen && MV.modalOpen())) { redupeT = setTimeout(again, 3000); return; }
      // Lo aprendido de TMDB en esta sesión (géneros, año, ficha) se aplica también a las copias originales
      lastAll.forEach(function (arr) { arr.forEach(function (o) { if (o.type !== 'live') retag(o); }); });
      combine(lastAll); MV.emit('catalog');
    }, 8000);
  };
  function combine(all) {
    var byKey = {}, byName = {}, byId = {}, byTid = {}, items = [], dedupe = P.dedupe !== false, hidden = {}, pairs = [];
    // Carátulas que se repiten mucho (genéricas del proveedor) no sirven para reconocer duplicados
    var posterUse = {};
    if (dedupe) all.forEach(function (arr) { arr.forEach(function (it) { if (it.type !== 'live' && it.poster) posterUse[it.poster] = (posterUse[it.poster] || 0) + 1; }); });
    function yearOf(it) { return String(it.year || (String(it.name || '').match(/\((19|20)\d{2}\)/) || [''])[0].replace(/[()]/g, '') || ''); }
    function idents(it) {
      if (!dedupe || it.type === 'live' || it.type === 'video') return [];
      var y = yearOf(it), t = MV.norm(MV.cleanTitle(it.name || '').replace(/\((19|20)\d{2}\)/, '')), out = [];
      if (it.tid) out.push('t:' + it.tid);
      if (t) out.push('n:' + it.type + ':' + t + ':' + y);
      if (it.poster && posterUse[it.poster] <= 4) out.push('p:' + it.type + ':' + it.poster.replace(/^https?:\/\//, '') + ':' + y);
      return out;
    }
    function swapIn(ex, it) {
      // El nuevo es de mejor calidad: pasa a ser el principal y el anterior queda de respaldo
      if (ex.url && ex.url !== it.url && !/^stalker:/.test(ex.url)) { ex.alts = [ex.url].concat((ex.alts || []).filter(function (u) { return u !== it.url; })).slice(0, 6); }
      ['url', 'ua', 'ref', 'list', 'lang', 'tracks'].forEach(function (k) { if (it[k] !== undefined) ex[k] = it[k]; });
      ex.stk = it.stk; if (it.stks || ex.stks) { ex.stks = it.stks; if (it.stks) ex.episodes = []; }
      if (it.jf || it.px || ex.jf || ex.px) { ex.jf = it.jf; ex.px = it.px; if (it.jf || it.px) ex.episodes = []; }
      if (it.xt) ex.xt = it.xt;
      if (it.episodes && it.episodes.length) ex.episodes = it.episodes.slice();
      ex.q = qScore(it);
    }
    all.forEach(function (arr) {
      arr.forEach(function (it) {
        var ln = it.type === 'live' ? liveName(it.name) : '', nk = ln ? 'n:' + (it.country || '') + ':' + ln : '';
        var ids = idents(it), q = qScore(it);
        var ex = byKey[it.key] || (nk ? byName[nk] : null);
        for (var k = 0; !ex && k < ids.length; k++) {
          var c = byId[ids[k]];
          // Mismo título y año, misma ficha o misma carátula; si los dos tienen año distinto no se juntan (remakes)
          if (c && c.type === it.type && (!yearOf(c) || !yearOf(it) || Math.abs(+yearOf(c) - +yearOf(it)) <= 1)) ex = c;
        }
        if (ex) {
          pairs.push([it, ex]);
          if (it.type === 'live') {
            if (it.stk || ex.stk) { /* señales del portal: el enlace se pide al reproducir, no se mezclan */ }
            else if (it.url && it.url !== ex.url) { ex.alts = ex.alts || []; if (ex.alts.length < 6 && ex.alts.indexOf(it.url) < 0) ex.alts.push(it.url); }
            if (!it.stk && !ex.stk) { ex.qs = ex.qs || {}; ex.qs[ex.url] = ex.qs[ex.url] || ex.q || 15; if (it.url) ex.qs[it.url] = q; ex.cands = [ex.url].concat(ex.alts || []); }
          } else if (it.type === 'series') {
            var better = q > (ex.q || 15) || (q === (ex.q || 15) && (it.episodes || []).length > (ex.episodes || []).length + 2);
            var other = better ? (ex.episodes || []) : (it.episodes || []);
            if (better) swapIn(ex, it);
            // Capítulos que solo trae la otra lista se agregan (sin repetir temporada y capítulo)
            if (ex.episodes && other.length) {
              var have = {}; ex.episodes.forEach(function (e) { have[e.season + 'x' + e.ep] = 1; });
              other.forEach(function (e) { if (!have[e.season + 'x' + e.ep]) { ex.episodes.push(e); have[e.season + 'x' + e.ep] = 1; } });
            }
          } else {
            if (q > (ex.q || 15)) swapIn(ex, it);
            else if (it.url && it.url !== ex.url && !it.stk) { ex.alts = ex.alts || []; if (ex.alts.length < 6 && ex.alts.indexOf(it.url) < 0) ex.alts.push(it.url); }
          }
          if (!ex.logo && it.logo) ex.logo = it.logo;
          if (!ex.poster && it.poster) ex.poster = it.poster;
          if (!ex.tvg && it.tvg) ex.tvg = it.tvg;
          if (!ex.plot && it.plot) ex.plot = it.plot;
          if (!ex.year && it.year) ex.year = it.year;
          if (!ex.tid && it.tid) ex.tid = it.tid;
          if ((it.added || 0) > (ex.added || 0)) ex.added = it.added;
          byKey[it.key] = ex;   // favoritos e historial guardados con la otra versión siguen funcionando
          ids.forEach(function (x) { if (!byId[x]) byId[x] = ex; });
          if (it.tid && !byTid[it.tid]) byTid[it.tid] = ex;
          return;
        }
        var copy = Object.assign({}, it);
        copy.q = q; pairs.push([it, copy]);
        if (copy.type === 'live') { copy.qs = {}; copy.qs[copy.url] = q; }
        if (copy.episodes) copy.episodes = copy.episodes.slice();
        byKey[it.key] = copy; items.push(copy);
        if (nk && !byName[nk]) byName[nk] = copy;
        ids.forEach(function (x) { if (!byId[x]) byId[x] = copy; });
        if (it.tid) byTid[it.tid] = copy;
      });
    });
    // Cuántos títulos de cada lista quedaron ocultos porque otra lista tiene una versión mejor
    pairs.forEach(function (pr) { if (pr[0].type !== 'live' && (pr[1].url !== pr[0].url || pr[1].list !== pr[0].list) && !(pr[0].type === 'series' && pr[1].list === pr[0].list)) hidden[pr[0].list] = (hidden[pr[0].list] || 0) + 1; });
    S.items = items; S.byKey = byKey; S.byTid = byTid; S.hiddenDupes = hidden;
    S.live = items.filter(function (i) { return i.type === 'live'; });
    S.live.forEach(function (i) { if (i.cands) applyProbe(i); });
    S.movies = items.filter(function (i) { return i.type === 'movie'; }).sort(function (a, b) { return (b.added || 0) - (a.added || 0); });
    S.series = items.filter(function (i) { return i.type === 'series'; });
  }

  /** Lo que el perfil actual puede ver. El +18 nunca sale en las secciones normales:
      solo en Utilidades › +18, desbloqueado con el PIN (MV.adultOnly lo pide esa pantalla). */
  MV.visible = function (arr) {
    var kids = MV.isKids();
    return arr.filter(function (i) {
      if (i.adult) return false;
      if (kids && !MV.kidsOk(i)) return false;
      if (P.latOnly && !D.latOk(i)) return false;
      return true;
    });
  };
  MV.groups = function (arr) {
    var m = {}, order = [];
    arr.forEach(function (i) { var g = i.group || 'Sin categoría'; if (!m[g]) { m[g] = 0; order.push(g); } m[g]++; });
    return order.map(function (g) { return { name: g, count: m[g] }; });
  };

  MV.addList = function (list) {
    list.id = 'l' + Date.now().toString(36);
    list.enabled = true; list.added = Date.now(); list.updatedAt = Date.now();
    S.lists.push(list); MV.saveLists();
    return loadList(list, true).then(function () { MV.saveLists(); return MV.reloadCatalog(false); });
  };
  /** Lee un .txt (o texto pegado) con varias direcciones: una por línea.
      Acepta "url", "Nombre,url", "Nombre | url" o "Nombre url". Los enlaces de Xtream (get.php?username=…&password=…) se agregan como cuenta Xtream. */
  MV.parseUrlList = function (text) {
    text = String(text || '');
    if (/#EXTINF/i.test(text)) return null; // es una lista M3U normal
    var out = [], seen = {};
    text.split(/\r?\n/).forEach(function (line, n) {
      line = line.trim();
      if (!line || line[0] === '#' || line.indexOf('//') === 0) return;
      var m = line.match(/(https?:\/\/\S+)/i);
      if (!m) return;
      var url = m[1].replace(/[",;]+$/, '');
      var name = line.slice(0, m.index).replace(/[,|;:\-–=\t]+\s*$/, '').trim().replace(/^["']|["']$/g, '');
      if (seen[url]) return; seen[url] = 1;
      var x = url.match(/^(https?:\/\/[^\/]+)\/(?:get|player_api)\.php\?(.*)$/i);
      if (x) {
        var q = {}; x[2].split('&').forEach(function (kv) { var a = kv.split('='); q[decodeURIComponent(a[0] || '')] = decodeURIComponent(a[1] || ''); });
        if (q.username && q.password) { out.push({ type: 'xtream', name: name || x[1].replace(/^https?:\/\//, ''), host: x[1], user: q.username, pass: q.password }); return; }
      }
      var auto = url.split('?')[0].split('/').pop().replace(/\.(m3u8?|txt)$/i, '').replace(/[_-]+/g, ' ').trim();
      out.push({ type: 'url', name: name || auto || ('Lista ' + (out.length + 1)), url: url });
    });
    return out;
  };
  /** Agrega varias listas de una vez (sin repetir las que ya tienes) y recarga el catálogo una sola vez. */
  MV.addLists = function (arr, onProgress) {
    var fresh = arr.filter(function (l) {
      return !S.lists.some(function (x) { return (l.url && x.url === l.url) || (l.type === 'stalker' && x.type === 'stalker' && (x.portal || '').toLowerCase().replace(/\/+$/, '') === (l.portal || '').toLowerCase().replace(/\/+$/, '') && (x.macs || [x.mac]).indexOf(l.mac) >= 0) || (l.type === 'xtream' && x.type === 'xtream' && x.host === l.host && x.user === l.user); });
    });
    var base = Date.now();
    fresh.forEach(function (l, i) { l.id = 'l' + (base + i).toString(36); l.enabled = true; l.added = base; l.updatedAt = base; S.lists.push(l); });
    MV.saveLists();
    var done = 0, failed = [];
    return fresh.reduce(function (p, l) {
      return p.then(function () {
        return loadList(l, true).catch(function (e) { l.error = e.message; failed.push(l.name); }).then(function () { done++; if (onProgress) onProgress(done, fresh.length, l.name); });
      });
    }, Promise.resolve()).then(function () {
      MV.saveLists();
      return MV.reloadCatalog(false).then(function () { return { added: fresh.length, skipped: arr.length - fresh.length, failed: failed }; });
    });
  };
  /** Borra varias listas de una vez (una sola recarga del contenido). */
  MV.removeLists = function (ids) {
    S.lists = S.lists.filter(function (l) { return ids.indexOf(l.id) < 0; });
    ids.forEach(function (id) { MV.idbDel('list:' + id); MV.idbDel('raw:' + id); });
    MV.saveLists(); return MV.reloadCatalog(false);
  };
  // Revisión cada hora de las páginas web (sin interrumpir lo que estés viendo)
  setInterval(function () {
    if (S.loading || !S.lists.some(function (l) { return l.type === 'web' && l.enabled !== false; })) return;
    MV.reloadCatalog(false);
  }, 3600e3 + 30e3);
  MV.removeList = function (id) {
    S.lists = S.lists.filter(function (l) { return l.id !== id; });
    MV.idbDel('list:' + id); MV.idbDel('raw:' + id);
    MV.saveLists(); return MV.reloadCatalog(false);
  };

  // ---------- Guía EPG ----------
  MV.loadEpg = function (force) {
    var lists = S.lists.filter(function (l) { return l.enabled !== false && l.epg; });
    if (!lists.length || !MV.native) return Promise.resolve();
    return MV.idbGet('epg').then(function (c) {
      if (c && !force && c.ts > Date.now() - 6 * 3600e3) { S.epg = c.data; MV.emit('epg'); return; }
      var data = { progs: {}, names: {} };
      return Promise.all(lists.map(function (l) {
        var ids = S.live.filter(function (i) { return i.list === l.id && i.tvg; }).map(function (i) { return i.tvg; });
        return MV.call('epg', [l.epg, JSON.stringify(ids.length > 3000 ? [] : ids), 36]).then(function (r) {
          return fetch(r.path).then(function (x) { return x.json(); }).then(function (j) {
            Object.keys(j.progs || {}).forEach(function (k) { data.progs[k.toLowerCase()] = (data.progs[k.toLowerCase()] || []).concat(j.progs[k]); });
            Object.keys(j.channels || {}).forEach(function (k) { data.names[MV.norm(j.channels[k].n)] = k.toLowerCase(); });
          });
        }).catch(function () {});
      })).then(function () {
        Object.keys(data.progs).forEach(function (k) { data.progs[k].sort(function (a, b) { return a.s - b.s; }); });
        S.epg = data; MV.idbSet('epg', { ts: Date.now(), data: data }); MV.emit('epg');
      });
    });
  };
  MV.progsFor = function (item) {
    if (!item) return [];
    var id = item.tvg ? item.tvg.toLowerCase() : S.epg.names[MV.norm(item.name)];
    return (id && S.epg.progs[id]) || [];
  };
  MV.nowNext = function (item) {
    var ps = MV.progsFor(item), now = Date.now();
    for (var i = 0; i < ps.length; i++) if (ps[i].s <= now && ps[i].e > now) return { now: ps[i], next: ps[i + 1] };
    return { now: null, next: ps.find(function (p) { return p.s > now; }) || null };
  };

  // ---------- Fichas: sinopsis y carátulas ----------
  MV.cleanTitle = function (name) {
    return String(name || '')
      .replace(/^[A-Z]{2,3}\s*[|:\-–]\s*/, '')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\((?!(19|20)\d{2}\))[^)]*\)/g, ' ')
      .replace(/\b(4k|uhd|fhd|hd|sd|hevc|x26[45]|h26[45]|1080p|720p|480p|latino|lat|castellano|esp|sub|subtitulado|dual|multi|cam|ts)\b/gi, ' ')
      .replace(RX.episode, ' ')
      .replace(/\s{2,}/g, ' ').replace(/[\s\-–|:.]+$/, '').trim();
  };
  function tmdb(path, params) {
    var key = (P.tmdbKey || '').trim();
    var bearer = key.indexOf('eyJ') === 0;
    var url = 'https://api.themoviedb.org/3' + path + '?language=es-ES' + (params || '') + (bearer ? '' : '&api_key=' + encodeURIComponent(key));
    return MV.getJSON(url, bearer ? { Authorization: 'Bearer ' + key, Accept: 'application/json' } : null);
  }
  var IMG = 'https://image.tmdb.org/t/p/';
  MV.tmdb = tmdb; MV.TMDB_IMG = IMG;
  MV.meta = function (item) {
    var ck = 'meta2:' + item.key;
    return MV.idbGet(ck).then(function (c) {
      // Fichas guardadas antes de saber la edad se vuelven a pedir en perfiles infantiles
      // Fichas guardadas sin fecha de estreno (versiones anteriores) se vuelven a pedir una vez
      var fresh = c && c.ts > Date.now() - 14 * 86400e3 && !(MV.isKids() && c.data && c.data.age === undefined) && !(c.data && c.data.source === 'TMDB' && c.data.date === undefined);
      if (fresh) { if (c.data) { MV.learnGenres(item, c.data.genres, c.data.age, c.data.year, c.data.date); if (c.data.tmdbId) MV.learnTid(item, c.data.kind + ':' + c.data.tmdbId); } return c.data; }
      var title = MV.cleanTitle(item.name);
      var year = (item.year || (item.name.match(/\((19|20)\d{2}\)/) || [''])[0].replace(/[()]/g, ''));
      var job;
      if (item.anime && item.type !== 'live') job = jikan(title);
      else if (P.tmdbKey && item.type !== 'live') job = tmdbMeta(title, year, item.type === 'series' ? 'tv' : 'movie');
      else job = Promise.resolve(null);
      return job.then(function (data) {
        if (!data && item.anime && P.tmdbKey) return tmdbMeta(title, year, item.type === 'series' ? 'tv' : 'movie');
        return data;
      }).then(function (data) {
        if (data) { MV.idbSet(ck, { ts: Date.now(), data: data }); MV.learnGenres(item, data.genres, data.age, data.year, data.date); if (data.tmdbId) MV.learnTid(item, data.kind + ':' + data.tmdbId); }
        return data;
      }).catch(function () { return null; });
    });
  };
  function tmdbMeta(title, year, kind) {
    // Elige el mejor resultado: título igual, año cercano y la más conocida (evita confundir "2012" con otra película parecida)
    function best(results) {
      var want = MV.norm(title);
      // Solo resultados cuyo título se parezca de verdad (evita poner la ficha de otra película)
      var cand = (results || []).slice(0, 10).filter(function (r) {
        var t = MV.norm(r.title || r.name), o = MV.norm(r.original_title || r.original_name);
        return t.indexOf(want) >= 0 || o.indexOf(want) >= 0 || (t.length > 3 && want.indexOf(t) >= 0) || (o.length > 3 && want.indexOf(o) >= 0);
      });
      var scored = cand.map(function (r, i) {
        var t = MV.norm(r.title || r.name), o = MV.norm(r.original_title || r.original_name);
        var y = +((r.release_date || r.first_air_date || '').slice(0, 4)) || 0, sc = 0;
        if (t === want || o === want) sc += 100; else if (t.indexOf(want) === 0 || o.indexOf(want) === 0) sc += 20;
        if (year && y) sc += Math.max(0, 30 - Math.abs(y - +year) * 15);
        sc += Math.log(1 + (r.vote_count || 0)) * 5 - i * 2;
        // Sin año en la lista: un estreno muy reciente o aún sin estrenar es menos probable que la versión conocida
        if (!year) { var rd = Date.parse(r.release_date || r.first_air_date || '') || 0; if (!rd || rd > Date.now() - 150 * 86400e3) sc -= 25; }
        return { r: r, sc: sc };
      }).sort(function (a, b) { return b.sc - a.sc; });
      return scored.length ? scored[0].r : null;
    }
    // El año va como filtro, no dentro del título: "Alchemist (2016)" → "Alchemist" + 2016
    var t0 = String(title || '').replace(/[(\[]\s*(19|20)\d{2}\s*[)\]]/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (t0 && MV.norm(t0) !== String(year)) title = t0.replace(/\s+(19|20)\d{2}$/, '') || t0;
    // Si el "año" es el propio título (película "2012"), no se usa como filtro
    if (year && MV.norm(title) === String(year)) year = '';
    var other = kind === 'tv' ? 'movie' : 'tv';
    function q(t, k, y, lang) {
      return tmdb('/search/' + k, '&query=' + encodeURIComponent(t) + (y ? (k === 'tv' ? '&first_air_date_year=' : '&year=') + y : '') + (lang ? '&language=' + lang : '')).then(function (s) { var r = best(s.results); if (r) r._kind = k; return r; }).catch(function () { return null; });
    }
    // Intentos en orden: con año, sin año, solo la parte antes de ":" o " - ", en inglés y como el otro tipo (serie/película)
    var short = title.split(/\s[-–:|]\s|:\s/)[0].trim();
    var tries = [[title, kind, year], [title, kind, ''], short !== title ? [short, kind, year] : null, [title, kind, '', 'en-US'], [title, other, year], [title, other, '']].filter(Boolean);
    var chain = Promise.resolve(null);
    tries.forEach(function (tr) { chain = chain.then(function (r) { return r || q(tr[0], tr[1], tr[2], tr[3]); }); });
    return chain.then(function (r) {
      if (!r) return null;
      kind = r._kind || kind;
      return tmdb('/' + kind + '/' + r.id, '&append_to_response=credits,images,external_ids,keywords,' + (kind === 'tv' ? 'content_ratings' : 'release_dates') + '&include_image_language=es,en,null').then(function (d) {
        var certs = kind === 'tv'
          ? ((d.content_ratings && d.content_ratings.results) || []).map(function (x) { return { c: x.iso_3166_1, cert: x.rating }; })
          : ((d.release_dates && d.release_dates.results) || []).map(function (x) { var rd = (x.release_dates || []).filter(function (y) { return y.certification; })[0]; return { c: x.iso_3166_1, cert: rd ? rd.certification : '' }; });
        return {
          age: certAge(certs),
          source: 'TMDB', tmdbId: d.id, kind: kind, imdb: (d.external_ids && d.external_ids.imdb_id) || d.imdb_id || '', title: d.title || d.name, overview: d.overview || r.overview || '',
          year: (d.release_date || d.first_air_date || '').slice(0, 4),
          date: d.release_date || d.first_air_date || '',
          runtime: d.runtime ? d.runtime + ' min' : (d.number_of_seasons ? d.number_of_seasons + ' temporadas' : ''),
          rating: d.vote_average ? d.vote_average.toFixed(1) : '',
          genres: (d.genres || []).map(function (g) { return g.name; }).slice(0, 3)
            // Palabras clave de TMDB que definen una categoría propia (TMDB no tiene género "religioso")
            .concat((((d.keywords && (d.keywords.keywords || d.keywords.results)) || []).map(function (k) { return k.name; })
              .filter(function (n) { return /\b(religion|christian|christianity|bible|biblical|jesus christ|faith|gospel|church|catholic|god|saint|apostle|resurrection|moses)\b/i.test(n); }).slice(0, 1).map(function () { return 'religion'; }))),
          cast: ((d.credits && d.credits.cast) || []).slice(0, 5).map(function (c) { return c.name; }),
          poster: d.poster_path ? IMG + 'w500' + d.poster_path : (d.images && d.images.posters && d.images.posters[0] ? IMG + 'w500' + d.images.posters[0].file_path : (r.poster_path ? IMG + 'w500' + r.poster_path : '')),
          backdrop: d.backdrop_path ? IMG + 'w1280' + d.backdrop_path : '',
          posters: ((d.images && d.images.posters) || []).slice(0, 12).map(function (p) { return IMG + 'w342' + p.file_path; })
        };
      });
    });
  }
  function jikanAge(r) {
    r = String(r || '');
    if (!r) return null;
    if (/^G\b/.test(r)) return 0;
    if (/^PG-13/.test(r)) return 13;
    if (/^PG\b/.test(r)) return 7;
    if (/^R\b.*17/.test(r)) return 17;
    return 18;
  }
  /** Certificación (CO, MX, US, ES…) → edad mínima. */
  var CERT = { G: 0, T: 0, TP: 0, AA: 0, A: 0, APT: 0, ATP: 0, L: 0, U: 0, 'TV-Y': 0, 'TV-G': 0, PG: 7, 'TV-Y7': 7, 'TV-Y7-FV': 7, 'TV-PG': 10, 'PG-13': 13, 'TV-14': 14, B: 12, B15: 15, R: 17, 'TV-MA': 17, 'NC-17': 18, C: 18, D: 18 };
  function certAge(list) {
    var by = {};
    (list || []).forEach(function (x) { if (x.cert) by[x.c] = by[x.c] || x.cert; });
    var order = ['CO', 'MX', 'US', 'ES', 'AR', 'CL', 'BR', 'GB', 'DE', 'FR'];
    for (var k = 0; k < order.length; k++) {
      var c = String(by[order[k]] || '').toUpperCase().trim();
      if (!c) continue;
      if (CERT[c] != null) return CERT[c];
      var m = c.match(/\d+/); if (m) return +m[0];
    }
    return null;
  }
  function jikan(title) {
    return MV.getJSON('https://api.jikan.moe/v4/anime?limit=1&sfw=true&q=' + encodeURIComponent(title)).then(function (j) {
      var a = j.data && j.data[0]; if (!a) return null;
      var img = (a.images && (a.images.webp || a.images.jpg)) || {};
      return {
        source: 'MyAnimeList (Jikan)', title: a.title_english || a.title, overview: a.synopsis || '',
        year: a.year || (a.aired && a.aired.from ? String(a.aired.from).slice(0, 4) : ''),
        runtime: a.episodes ? a.episodes + ' episodios' : '', rating: a.score ? String(a.score) : '',
        genres: (a.genres || []).map(function (g) { return g.name; }).slice(0, 3), cast: [], age: jikanAge(a.rating),
        poster: img.large_image_url || img.image_url || '', backdrop: '', posters: [img.large_image_url].filter(Boolean)
      };
    });
  }
  MV.poster = function (item) { return (P.covers && P.covers[item.key]) || item.poster || item.logo || ''; };

  // ---------- Cine de dominio público (Internet Archive) ----------
  MV.archive = function () {
    return MV.idbGet('archive').then(function (c) {
      if (c && c.ts > Date.now() - 3 * 86400e3) return c.items;
      var url = 'https://archive.org/advancedsearch.php?q=collection%3A%28feature_films%29+AND+mediatype%3A%28movies%29&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=year&fl%5B%5D=description&sort%5B%5D=downloads+desc&rows=60&output=json';
      return MV.getJSON(url).then(function (j) {
        var items = ((j.response && j.response.docs) || []).map(function (d) {
          var desc = Array.isArray(d.description) ? d.description[0] : (d.description || '');
          return { key: 'ia:' + d.identifier, type: 'movie', ia: d.identifier, name: d.title, year: d.year || '', group: 'Cine clásico', poster: 'https://archive.org/services/img/' + d.identifier, plot: String(desc).replace(/<[^>]+>/g, '').slice(0, 600) };
        });
        MV.idbSet('archive', { ts: Date.now(), items: items });
        return items;
      });
    }).catch(function () { return []; });
  };
  MV.archiveUrl = function (item) {
    return MV.getJSON('https://archive.org/metadata/' + encodeURIComponent(item.ia)).then(function (j) {
      var files = (j.files || []).filter(function (f) { return /\.mp4$/i.test(f.name); });
      files.sort(function (a, b) { return (+b.size || 0) - (+a.size || 0); });
      var pick = files.find(function (f) { return /h\.?264|512kb|mpeg4/i.test(f.format || '') && +f.size < 2.5e9; }) || files[0];
      if (!pick) throw new Error('Esta película no tiene un video compatible');
      return 'https://archive.org/download/' + encodeURIComponent(item.ia) + '/' + pick.name.split('/').map(encodeURIComponent).join('/');
    });
  };

  // ---------- Favoritos, historial y progreso ----------
  function mini(it) {
    return { key: it.key, type: it.type, name: it.name, logo: it.logo || '', poster: MV.poster(it), url: it.url || '', group: it.group || '', tvg: it.tvg || '', ia: it.ia || '', ep: it.epTitle || '', parent: it.parent || '' };
  }
  MV.isFav = function (key) { var f = MV.pdata().favs[key]; return !!(f && !f.del); };
  MV.toggleFav = function (it) {
    var d = MV.pdata(), f = d.favs[it.key];
    if (f && !f.del) d.favs[it.key] = { key: it.key, del: true, ts: Date.now() };
    else d.favs[it.key] = Object.assign(mini(it), { ts: Date.now() });
    MV.savePdata(d);
    return MV.isFav(it.key);
  };
  MV.favs = function () {
    var f = MV.pdata().favs;
    return Object.keys(f).map(function (k) { return f[k]; }).filter(function (x) { return !x.del; }).sort(function (a, b) { return b.ts - a.ts; });
  };
  MV.resolve = function (m) { return S.byKey[m.key] || m; };
  /** ¿Es contenido +18? (también episodios de una serie +18) */
  function isAdultKey(it) { var b = S.byKey[it.key] || {}, pa = it.parent ? (S.byKey[it.parent] || {}) : {}; return !!(it.adult || b.adult || pa.adult); }
  /** Quita del historial y de "Continuar viendo" lo que sea +18 (de antes de este cambio o de otro equipo). */
  MV.purgeAdult = function () {
    var d = MV.pdata(), changed = false;
    var h = d.history.filter(function (x) { return !isAdultKey(x); }); if (h.length !== d.history.length) { d.history = h; changed = true; }
    Object.keys(d.progress).forEach(function (k) { if (isAdultKey(d.progress[k])) { delete d.progress[k]; changed = true; } });
    if (changed) MV.savePdata(d);
  };
  MV.recordPlay = function (it, res) {
    // Lo que se ve en +18 no queda en el historial, ni en "Continuar viendo", ni en Inicio
    if (isAdultKey(it)) return;
    var d = MV.pdata(), now = Date.now();
    var entry = Object.assign(mini(it), { ts: now, device: P.deviceName });
    d.history = [entry].concat(d.history.filter(function (h) { return h.key !== it.key; })).slice(0, 150);
    if (res && !res.live && res.duration > 0) {
      var pct = res.position / res.duration;
      if (pct > 0.95 || res.position < 20000) delete d.progress[it.key];
      else d.progress[it.key] = Object.assign(entry, { pos: res.position, dur: res.duration });
    }
    MV.savePdata(d);
  };
  MV.progressOf = function (key) { var p = MV.pdata().progress[key]; return p && p.dur ? p : null; };
  MV.continueList = function () {
    var p = MV.pdata().progress;
    return Object.keys(p).map(function (k) { return p[k]; }).sort(function (a, b) { return b.ts - a.ts; }).slice(0, 30);
  };

  // ---------- Tiempo de pantalla para perfiles infantiles ----------
  MV.kidsUsed = function () {
    var u = MV.load('kidsUsage', {}), day = new Date().toDateString();
    if (u.day !== day) u = { day: day, m: {} };
    return u;
  };
  MV.addKidsMinutes = function (n) {
    if (!MV.isKids()) return;
    var u = MV.kidsUsed(); u.m[S.pid] = (u.m[S.pid] || 0) + n; MV.save('kidsUsage', u);
  };
  MV.kidsLeft = function () { var u = MV.kidsUsed(); return Math.max(0, (+P.kidsLimit || 60) - (u.m[S.pid] || 0)); };

  // ---------- Eventos internos ----------
  /** Borra del equipo lo personal de una cuenta (perfiles, historial, favoritos, "continuar viendo", PIN y usuario +18).
      Las listas y claves compartidas se quedan. Cada cuenta recupera lo suyo desde la nube al entrar. */
  MV.resetUserData = function () {
    try {
      Object.keys(localStorage).forEach(function (k) {
        if (/^mv:(pdata:|profiles$|pid$|kidsUsage|recentSearch$|radioFavs$|recentGames$)/.test(k)) localStorage.removeItem(k);
      });
    } catch (e) {}
    S.profiles = []; S.pid = null; S.adultUntil = 0;
    P.parentPin = ''; P.adult = null; P.covers = {}; P.updatedAt = 0;
    MV.save('prefs', P);
  };

  var listeners = {};
  MV.on = function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); };
  MV.emit = function (ev, data) { (listeners[ev] || []).forEach(function (fn) { try { fn(data); } catch (e) { console.error(e); } }); };

  // ---------- Sincronización entre dispositivos (Firebase, opcional) ----------
  var fb = null, unsub = null, pushing = false, applying = false;
  MV.sync = {
    user: null,
    configured: function () { return !!(P.firebase && P.firebase.trim()); },
    load: function () {
      if (fb) return Promise.resolve(fb);
      if (!MV.sync.configured()) return Promise.reject(new Error('Falta la configuración de Firebase'));
      // Acepta el objeto tal como lo copia la consola de Firebase (const firebaseConfig = {...})
      var cfg; try {
        var objText = P.firebase.slice(P.firebase.indexOf('{'), P.firebase.lastIndexOf('}') + 1);
        cfg = (new Function('return (' + objText + ');'))();
        if (!cfg || !cfg.apiKey || !cfg.projectId) throw new Error('incompleta');
      } catch (e) { return Promise.reject(new Error('La configuración de Firebase no es válida')); }
      var v = '10.12.2', base = 'https://www.gstatic.com/firebasejs/' + v + '/';
      function load(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('Sin conexión con Firebase')); }; document.head.appendChild(s); }); }
      return load(base + 'firebase-app-compat.js').then(function () { return Promise.all([load(base + 'firebase-auth-compat.js'), load(base + 'firebase-firestore-compat.js')]); }).then(function () {
        if (!window.firebase.apps.length) window.firebase.initializeApp(cfg);
        fb = window.firebase;
        fb.auth().onAuthStateChanged(function (u) { MV.sync.user = u; if (u) { var last = MV.load('lastUid', null); if (last && last !== u.uid) MV.resetUserData(); MV.save('lastUid', u.uid); MV.sync.listen(); } else if (unsub) { unsub(); unsub = null; } MV.emit('sync'); MV.emit('auth', u); });
        return fb;
      });
    },
    signIn: function (email, pass) {
      return MV.sync.load().then(function (f) {
        return f.auth().signInWithEmailAndPassword(email, pass).catch(function (e) {
          if (/user-not-found|invalid-credential|invalid-login/.test(e.code || '')) return f.auth().createUserWithEmailAndPassword(email, pass);
          throw e;
        });
      }).then(function () { return MV.sync.push(); });
    },
    relisten: function () { if (unsub) { unsub(); unsub = null; } if (MV.sync.user) MV.sync.listen(); },
    signOut: function () { if (unsub) unsub(); unsub = null; return fb ? fb.auth().signOut() : Promise.resolve(); },
    doc: function () { return fb.firestore().collection('mivibra').doc(MV.sync.user.uid); },
    snapshot: function () {
      var pdata = {};
      S.profiles.forEach(function (p) { pdata[p.id] = MV.pdata(p.id); });
      var managed = MV.acct && MV.acct.managed();
      var prefs = { theme: P.theme, autoTheme: P.autoTheme, glass: P.glass, anim: P.anim, bgAnim: P.bgAnim, tmdbKey: managed ? '' : P.tmdbKey, ytKey: managed ? '' : P.ytKey, subKey: managed ? '' : P.subKey, streamKeys: managed ? {} : P.streamKeys, covers: P.covers, kidsLimit: P.kidsLimit, parentPin: P.parentPin, adult: P.adult, audioLang: P.audioLang, subLang: P.subLang, updatedAt: P.updatedAt };
      return { v: 1, updatedAt: Date.now(), device: P.deviceName, profiles: S.profiles, pdata: pdata, prefs: prefs, lists: P.syncLists && !managed ? S.lists.map(function (l) { var c = Object.assign({}, l); delete c.error; return c; }) : null };
    },
    push: function () {
      if (!fb || !MV.sync.user || applying) return Promise.resolve();
      pushing = true;
      return MV.sync.doc().set(JSON.parse(JSON.stringify(MV.sync.snapshot()))).then(function () { pushing = false; }).catch(function (e) { pushing = false; console.warn(e); });
    },
    later: MV.debounce(function () { MV.sync.push(); }, 3000),
    listen: function () {
      if (unsub) return;
      var first = true;
      unsub = MV.sync.doc().onSnapshot(function (snap) {
        if (snap.exists && !pushing && !snap.metadata.hasPendingWrites) merge(snap.data());
        if (first) { first = false; MV.emit('userdoc'); }
      }, function (e) { console.warn(e); MV.emit('userdoc'); });
    }
  };
  function merge(r) {
    if (!r) return;
    applying = true;
    try {
      (r.profiles || []).forEach(function (rp) {
        var lp = S.profiles.find(function (p) { return p.id === rp.id; });
        if (!lp) S.profiles.push(rp); else if ((rp.updatedAt || 0) > (lp.updatedAt || 0)) Object.assign(lp, rp);
      });
      MV.save('profiles', S.profiles);
      Object.keys(r.pdata || {}).forEach(function (pid) {
        var rd = r.pdata[pid], ld = MV.pdata(pid);
        Object.keys(rd.favs || {}).forEach(function (k) { if (!ld.favs[k] || (rd.favs[k].ts || 0) > (ld.favs[k].ts || 0)) ld.favs[k] = rd.favs[k]; });
        var hist = {}; (ld.history || []).concat(rd.history || []).forEach(function (h) { if (!hist[h.key] || hist[h.key].ts < h.ts) hist[h.key] = h; });
        ld.history = Object.keys(hist).map(function (k) { return hist[k]; }).sort(function (a, b) { return b.ts - a.ts; }).slice(0, 150);
        Object.keys(rd.progress || {}).forEach(function (k) { if (!ld.progress[k] || (rd.progress[k].ts || 0) > (ld.progress[k].ts || 0)) ld.progress[k] = rd.progress[k]; });
        MV.save('pdata:' + pid, ld);
      });
      var managed = MV.acct && MV.acct.managed();
      if (managed) { if (r.prefs) { delete r.prefs.tmdbKey; delete r.prefs.ytKey; delete r.prefs.subKey; delete r.prefs.streamKeys; } r.lists = null; }
      if (r.prefs && (r.prefs.updatedAt || 0) > (P.updatedAt || 0)) { Object.assign(P, r.prefs); MV.save('prefs', P); MV.applyLook && MV.applyLook(); }
      var listsChanged = false;
      (r.lists || []).forEach(function (rl) {
        var ll = S.lists.find(function (l) { return l.id === rl.id; });
        if (!ll) { S.lists.push(rl); listsChanged = true; }
        else if ((rl.updatedAt || 0) > (ll.updatedAt || 0)) { Object.assign(ll, rl); listsChanged = true; }
      });
      if (listsChanged) { MV.save('lists', S.lists); MV.reloadCatalog(false); }
    } finally { applying = false; }
    MV.emit('synced');
  }
})();
