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
    theme: 'mv', glass: 'mid', anim: true, bgAnim: true, audioLang: 'es', subLang: '', xtFormat: 'm3u8',
    tmdbKey: '', covers: {}, kidsLimit: 60, parentPin: '', adult: null, romRoots: [], romSystem: {}, shader: 'default',
    firebase: '', syncLists: true, updatedAt: 0, deviceName: ''
  };
  Object.keys(defaults).forEach(function (k) { if (P[k] === undefined) P[k] = defaults[k]; });
  if (!P.deviceName) P.deviceName = MV.device.tv ? 'TV' : (MV.device.model || 'Celular');

  MV.savePrefs = function (silent) { P.updatedAt = Date.now(); MV.save('prefs', P); if (!silent) MV.sync.later(); };
  MV.saveLists = function () { MV.save('lists', S.lists); MV.sync.later(); };
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
  var GCACHE = MV.load('gcache', {});
  MV.learnGenres = function (item, names) {
    var ids = D.classifyGenres((names || []).join(' '));
    if (!ids.length) return;
    item.genres = item.genres || [];
    ids.forEach(function (x) { if (item.genres.indexOf(x) < 0) item.genres.push(x); });
    GCACHE[item.key] = item.genres.slice(0, 6);
    var keys = Object.keys(GCACHE); if (keys.length > 5000) delete GCACHE[keys[0]];
    MV.save('gcache', GCACHE);
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
          num: attr(l, 'tvg-chno'), catchup: attr(l, 'catchup')
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

  function classify(e) {
    var u = e.url || '', g = e.group + ' ' + e.name;
    if (/\/movie\//i.test(u)) return 'movie';
    if (/\/series\//i.test(u)) return 'episode';
    var isFile = VIDEO_EXT.test(u);
    if (isFile && RX.episode.test(e.name)) return 'episode';
    if (isFile && RX.series.test(e.group) && !RX.movie.test(e.group)) return 'episode';
    if (isFile) return 'movie';
    return 'live';
  }
  function tags(o) {
    var g = (o.group || '') + ' ' + (o.name || '');
    o.kids = RX.kids.test(g);
    o.anime = RX.anime.test(g);
    o.kdrama = RX.kdrama.test(g);
    o.platform = D.platformOf(o.group || '') || (o.type !== 'live' ? D.platformOf(o.name || '') : '');
    if (o.platform === 'viki' && !o.anime) o.kdrama = o.kdrama || /drama|corea|korea/i.test(g);
    o.doc = RX.doc.test(o.group || '') || /document/i.test(o.name || '');
    o.adult = RX.adult.test(g);
    if (o.type !== 'live' || o.doc || o.kids) {
      var gtxt = g + ' ' + (o.genre || '');
      o.genres = D.classifyGenres(gtxt);
      if (o.kids && o.genres.indexOf('infantil') < 0) o.genres.push('infantil');
      if (o.doc && o.genres.indexOf('documental') < 0) o.genres.push('documental');
      var learned = GCACHE[o.key];
      if (learned) learned.forEach(function (x) { if (o.genres.indexOf(x) < 0) o.genres.push(x); });
    }
    return o;
  }
  function showName(name) {
    return String(name).replace(RX.episode, '').replace(/[-–|:]\s*$/, '').replace(/\s{2,}/g, ' ').trim() || name;
  }

  /** Convierte las entradas de una lista en canales, películas y series. */
  function buildFromM3U(entries, list) {
    var res = [], seriesMap = {};
    entries.forEach(function (e) {
      var t = classify(e);
      if (t === 'episode') {
        var sn = showName(e.name), sk = 'series:' + MV.norm(sn);
        var s = seriesMap[sk];
        if (!s) { s = seriesMap[sk] = tags({ key: sk, type: 'series', name: sn, poster: e.logo, group: e.group, list: list.id, episodes: [] }); res.push(s); }
        var m = e.name.match(RX.episode) || [];
        s.episodes.push({ season: +(m[1] || m[3] || 1), ep: +(m[2] || m[4] || s.episodes.length + 1), title: e.name, url: e.url, ua: e.ua, ref: e.ref });
      } else if (t === 'movie') {
        var y = (e.name.match(/\((19|20)\d{2}\)/) || [''])[0].replace(/[()]/g, '');
        res.push(tags({ key: 'movie:' + MV.norm(e.name), type: 'movie', name: e.name, poster: e.logo, group: e.group, url: e.url, ua: e.ua, ref: e.ref, year: y, list: list.id }));
      } else {
        res.push(tags({ key: 'live:' + (e.tvg ? e.tvg.toLowerCase() : MV.norm(e.name)), type: 'live', name: e.name, logo: e.logo, group: e.group, tvg: e.tvg, num: e.num, url: e.url, ua: e.ua, ref: e.ref, list: list.id }));
      }
    });
    return res;
  }

  // ---------- Xtream Codes ----------
  function xtBase(list) {
    var h = String(list.host || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(h)) h = 'http://' + h;
    return h;
  }
  function xtApi(list, action, extra) {
    return xtBase(list) + '/player_api.php?username=' + encodeURIComponent(list.user) + '&password=' + encodeURIComponent(list.pass) + (action ? '&action=' + action : '') + (extra || '');
  }
  MV.xtLogin = function (list) {
    return MV.getJSON(xtApi(list, '')).then(function (j) {
      if (!j || !j.user_info || +j.user_info.auth !== 1) throw new Error('Usuario o contraseña incorrectos');
      return j;
    });
  };
  function catMap(arr) { var m = {}; (arr || []).forEach(function (c) { m[c.category_id] = c.category_name; }); return m; }

  function buildFromXtream(list) {
    var base = xtBase(list), u = encodeURIComponent(list.user), p = encodeURIComponent(list.pass);
    var fmt = P.xtFormat === 'ts' ? 'ts' : 'm3u8';
    if (!list.epg) list.epg = base + '/xmltv.php?username=' + u + '&password=' + p;
    function safe(pr) { return pr.catch(function () { return []; }); }
    return Promise.all([
      safe(MV.getJSON(xtApi(list, 'get_live_categories'))),
      safe(MV.getJSON(xtApi(list, 'get_live_streams'), null, true)),
      safe(MV.getJSON(xtApi(list, 'get_vod_categories'))),
      safe(MV.getJSON(xtApi(list, 'get_vod_streams'), null, true)),
      safe(MV.getJSON(xtApi(list, 'get_series_categories'))),
      safe(MV.getJSON(xtApi(list, 'get_series'), null, true))
    ]).then(function (r) {
      var lc = catMap(r[0]), vc = catMap(r[2]), sc = catMap(r[4]), out = [];
      (r[1] || []).forEach(function (c) {
        out.push(tags({ key: 'live:' + (c.epg_channel_id ? String(c.epg_channel_id).toLowerCase() : MV.norm(c.name)), type: 'live', name: c.name, logo: c.stream_icon, group: lc[c.category_id] || 'En vivo', tvg: c.epg_channel_id || '', num: c.num, url: base + '/live/' + u + '/' + p + '/' + c.stream_id + '.' + fmt, list: list.id }));
      });
      (r[3] || []).forEach(function (m) {
        out.push(tags({ key: 'movie:' + MV.norm(m.name), type: 'movie', name: m.name, poster: m.stream_icon, group: vc[m.category_id] || 'Películas', url: base + '/movie/' + u + '/' + p + '/' + m.stream_id + '.' + (m.container_extension || 'mp4'), rating: m.rating, added: +m.added || 0, list: list.id }));
      });
      (r[5] || []).forEach(function (s) {
        out.push(tags({ key: 'series:' + MV.norm(s.name), type: 'series', name: s.name, poster: s.cover, group: sc[s.category_id] || 'Series', plot: s.plot, genre: s.genre || '', rating: s.rating, year: (s.releaseDate || s.release_date || '').slice(0, 4), xt: { list: list.id, id: s.series_id }, list: list.id }));
      });
      return out;
    });
  }

  /** Episodios de una serie Xtream (se cargan al abrir la ficha). */
  MV.loadEpisodes = function (item) {
    if (!item.xt) return Promise.resolve(item.episodes || []);
    var list = S.lists.find(function (l) { return l.id === item.xt.list; });
    if (!list) return Promise.resolve([]);
    var base = xtBase(list), u = encodeURIComponent(list.user), p = encodeURIComponent(list.pass);
    return MV.getJSON(xtApi(list, 'get_series_info', '&series_id=' + item.xt.id)).then(function (j) {
      var eps = [];
      var src = j.episodes || {};
      Object.keys(src).forEach(function (season) {
        (src[season] || []).forEach(function (e) {
          eps.push({ season: +season, ep: +e.episode_num, title: e.title || ('Episodio ' + e.episode_num), url: base + '/series/' + u + '/' + p + '/' + e.id + '.' + (e.container_extension || 'mp4'), plot: e.info && e.info.plot, img: e.info && e.info.movie_image });
        });
      });
      if (j.info) { item.plot = item.plot || j.info.plot; item.backdrop = item.backdrop || (j.info.backdrop_path && j.info.backdrop_path[0]); }
      item.episodes = eps;
      return eps;
    });
  };

  // ---------- Carga y combinación de todas las listas ----------
  function loadList(list, force) {
    var ck = 'list:' + list.id;
    return MV.idbGet(ck).then(function (cached) {
      var fresh = cached && cached.ts > Date.now() - 12 * 3600e3 && cached.v === 3;
      if (cached && !force && fresh) return cached.items;
      var job;
      if (list.type === 'xtream') job = buildFromXtream(list);
      else if (list.type === 'file') job = MV.idbGet('raw:' + list.id).then(function (txt) { return buildFromM3U(MV.parseM3U(txt || '', list), list); });
      else job = MV.getBig(list.url).then(function (txt) {
        if (!/#EXTINF|#EXTM3U/i.test(txt.slice(0, 5000))) throw new Error('No parece una lista M3U');
        return buildFromM3U(MV.parseM3U(txt, list), list);
      });
      return job.then(function (items) {
        list.count = items.length; list.updated = Date.now(); list.error = '';
        MV.idbSet(ck, { ts: Date.now(), v: 3, items: items });
        return items;
      }).catch(function (e) {
        list.error = e.message || 'Error';
        if (cached) return cached.items; // sin internet: usa lo último que funcionó
        throw e;
      });
    });
  }

  MV.reloadCatalog = function (force) {
    S.loading = true; S.loadMsg = 'Cargando tus listas…'; MV.emit('catalog');
    var lists = S.lists.filter(function (l) { return l.enabled !== false; });
    return Promise.all(lists.map(function (l) {
      return loadList(l, force).catch(function (e) { MV.toast('“' + l.name + '”: ' + e.message, 4000); return []; });
    })).then(function (all) {
      MV.saveLists();
      combine(all);
      S.loading = false; MV.emit('catalog');
      MV.loadEpg(false);
    });
  };

  function combine(all) {
    var byKey = {}, items = [];
    all.forEach(function (arr) {
      arr.forEach(function (it) {
        var ex = byKey[it.key];
        if (ex) {
          // Mismo contenido en otra lista: guardar como señal alternativa
          if (it.url && it.url !== ex.url) { ex.alts = ex.alts || []; if (ex.alts.length < 6 && ex.alts.indexOf(it.url) < 0) ex.alts.push(it.url); }
          if (!ex.logo && it.logo) ex.logo = it.logo;
          if (!ex.poster && it.poster) ex.poster = it.poster;
          if (!ex.tvg && it.tvg) ex.tvg = it.tvg;
          if (it.episodes && ex.episodes) ex.episodes = ex.episodes.concat(it.episodes.filter(function (e) { return !ex.episodes.some(function (x) { return x.url === e.url; }); }));
          return;
        }
        var copy = Object.assign({}, it);
        byKey[it.key] = copy; items.push(copy);
      });
    });
    S.items = items; S.byKey = byKey;
    S.live = items.filter(function (i) { return i.type === 'live'; });
    S.movies = items.filter(function (i) { return i.type === 'movie'; }).sort(function (a, b) { return (b.added || 0) - (a.added || 0); });
    S.series = items.filter(function (i) { return i.type === 'series'; });
  }

  /** Lo que el perfil actual puede ver (+18 oculto salvo desbloqueo; perfiles infantiles solo contenido infantil). */
  MV.visible = function (arr) {
    var kids = MV.isKids(), adult = MV.adultOk();
    return arr.filter(function (i) {
      if (i.adult && !adult) return false;
      if (kids && !(i.kids || (i.anime && !i.adult))) return false;
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
  MV.meta = function (item) {
    var ck = 'meta:' + item.key;
    return MV.idbGet(ck).then(function (c) {
      if (c && c.ts > Date.now() - 14 * 86400e3) { if (c.data) MV.learnGenres(item, c.data.genres); return c.data; }
      var title = MV.cleanTitle(item.name);
      var year = (item.year || (item.name.match(/\b(19|20)\d{2}\b/) || [''])[0]);
      var job;
      if (item.anime && item.type !== 'live') job = jikan(title);
      else if (P.tmdbKey && item.type !== 'live') job = tmdbMeta(title, year, item.type === 'series' ? 'tv' : 'movie');
      else job = Promise.resolve(null);
      return job.then(function (data) {
        if (!data && item.anime && P.tmdbKey) return tmdbMeta(title, year, item.type === 'series' ? 'tv' : 'movie');
        return data;
      }).then(function (data) {
        if (data) { MV.idbSet(ck, { ts: Date.now(), data: data }); MV.learnGenres(item, data.genres); }
        return data;
      }).catch(function () { return null; });
    });
  };
  function tmdbMeta(title, year, kind) {
    return tmdb('/search/' + kind, '&query=' + encodeURIComponent(title) + (year ? (kind === 'tv' ? '&first_air_date_year=' : '&year=') + year : '')).then(function (s) {
      var r = s.results && s.results[0];
      if (!r && year) return tmdb('/search/' + kind, '&query=' + encodeURIComponent(title)).then(function (s2) { return s2.results && s2.results[0]; });
      return r;
    }).then(function (r) {
      if (!r) return null;
      return tmdb('/' + kind + '/' + r.id, '&append_to_response=credits,images&include_image_language=es,en,null').then(function (d) {
        return {
          source: 'TMDB', title: d.title || d.name, overview: d.overview || r.overview || '',
          year: (d.release_date || d.first_air_date || '').slice(0, 4),
          runtime: d.runtime ? d.runtime + ' min' : (d.number_of_seasons ? d.number_of_seasons + ' temporadas' : ''),
          rating: d.vote_average ? d.vote_average.toFixed(1) : '',
          genres: (d.genres || []).map(function (g) { return g.name; }).slice(0, 3),
          cast: ((d.credits && d.credits.cast) || []).slice(0, 5).map(function (c) { return c.name; }),
          poster: d.poster_path ? IMG + 'w500' + d.poster_path : '',
          backdrop: d.backdrop_path ? IMG + 'w1280' + d.backdrop_path : '',
          posters: ((d.images && d.images.posters) || []).slice(0, 12).map(function (p) { return IMG + 'w342' + p.file_path; })
        };
      });
    });
  }
  function jikan(title) {
    return MV.getJSON('https://api.jikan.moe/v4/anime?limit=1&sfw=true&q=' + encodeURIComponent(title)).then(function (j) {
      var a = j.data && j.data[0]; if (!a) return null;
      var img = (a.images && (a.images.webp || a.images.jpg)) || {};
      return {
        source: 'MyAnimeList (Jikan)', title: a.title_english || a.title, overview: a.synopsis || '',
        year: a.year || (a.aired && a.aired.from ? String(a.aired.from).slice(0, 4) : ''),
        runtime: a.episodes ? a.episodes + ' episodios' : '', rating: a.score ? String(a.score) : '',
        genres: (a.genres || []).map(function (g) { return g.name; }).slice(0, 3), cast: [],
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
  MV.recordPlay = function (it, res) {
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
        fb.auth().onAuthStateChanged(function (u) { MV.sync.user = u; if (u) MV.sync.listen(); MV.emit('sync'); });
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
    signOut: function () { if (unsub) unsub(); unsub = null; return fb ? fb.auth().signOut() : Promise.resolve(); },
    doc: function () { return fb.firestore().collection('mivibra').doc(MV.sync.user.uid); },
    snapshot: function () {
      var pdata = {};
      S.profiles.forEach(function (p) { pdata[p.id] = MV.pdata(p.id); });
      var prefs = { theme: P.theme, glass: P.glass, anim: P.anim, bgAnim: P.bgAnim, tmdbKey: P.tmdbKey, covers: P.covers, kidsLimit: P.kidsLimit, parentPin: P.parentPin, adult: P.adult, audioLang: P.audioLang, subLang: P.subLang, updatedAt: P.updatedAt };
      return { v: 1, updatedAt: Date.now(), device: P.deviceName, profiles: S.profiles, pdata: pdata, prefs: prefs, lists: P.syncLists ? S.lists.map(function (l) { var c = Object.assign({}, l); delete c.error; return c; }) : null };
    },
    push: function () {
      if (!fb || !MV.sync.user || applying) return Promise.resolve();
      pushing = true;
      return MV.sync.doc().set(JSON.parse(JSON.stringify(MV.sync.snapshot()))).then(function () { pushing = false; }).catch(function (e) { pushing = false; console.warn(e); });
    },
    later: MV.debounce(function () { MV.sync.push(); }, 3000),
    listen: function () {
      if (unsub) return;
      unsub = MV.sync.doc().onSnapshot(function (snap) {
        if (!snap.exists || pushing || snap.metadata.hasPendingWrites) return;
        merge(snap.data());
      });
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
