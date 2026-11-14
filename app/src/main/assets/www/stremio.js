/* MiVibra TV · Addons de Stremio y repositorios de plugins (tipo Kodi).
 * Un addon de Stremio es un enlace manifest.json: sus catálogos se vuelven películas y series en MiVibra,
 * y al reproducir se piden los enlaces (streams) a todos los addons instalados que los ofrezcan.
 * Un repositorio es un enlace con una lista de plugins (addons y listas) para instalar desde un menú. */
(function () {
  'use strict';
  var S = MV.S, A = window.Android;
  var esc = MV.esc;
  var CINEMETA = 'https://v3-cinemeta.strem.io/manifest.json';   // catálogo oficial de Stremio (fichas de IMDb)

  function base(url) { return String(url || '').trim().replace(/^stremio:\/\//i, 'https://').replace(/\/manifest\.json(\?.*)?$/i, '').replace(/\/+$/, ''); }
  MV.stremioBase = base;
  function manifestUrl(url) { return base(url) + '/manifest.json'; }
  function lists() { return (S.lists || []).filter(function (l) { return l.type === 'stremio' && l.enabled !== false; }); }
  function res(man, name) {
    return (man.resources || []).some(function (r) { return r === name || (r && r.name === name); });
  }
  function resTypes(man, name) {
    var r = (man.resources || []).filter(function (x) { return x && x.name === name; })[0];
    return r && r.types ? r.types : (man.types || []);
  }
  function prefixOk(man, name, id) {
    var r = (man.resources || []).filter(function (x) { return x && x.name === name; })[0];
    var pre = (r && r.idPrefixes) || man.idPrefixes;
    return !pre || !pre.length || pre.some(function (p) { return String(id).indexOf(p) === 0; });
  }

  /** Lee el manifest de un addon (nombre, catálogos y qué ofrece). */
  MV.stremioManifest = function (url) {
    return MV.getJSON(manifestUrl(url)).then(function (m) {
      if (!m || !m.id || !(m.resources || []).length) throw new Error('Ese enlace no es un addon de Stremio (falta manifest.json)');
      return m;
    });
  };

  /** ID de IMDb buscando por nombre (y año) en Cinemeta, el catálogo público de Stremio. Sirve para pedir subtítulos. */
  var CM = {};
  MV.cinemetaImdb = function (name, year, type) {
    var k = type + '|' + MV.norm(name) + '|' + (year || '');
    if (CM[k] !== undefined) return Promise.resolve(CM[k]);
    return MV.getJSON('https://v3-cinemeta.strem.io/catalog/' + (type === 'series' ? 'series' : 'movie') + '/top/search=' + encodeURIComponent(String(name).replace(/\(\d{4}\)/g, '').trim()) + '.json').then(function (j) {
      var n = MV.norm(String(name).replace(/\(\d{4}\)/g, '')), best = null;
      ((j && j.metas) || []).forEach(function (m) {
        if (best || !m || !/^tt\d+/.test(m.imdb_id || m.id || '')) return;
        var y = parseInt(String(m.releaseInfo || m.year || '').slice(0, 4), 10);
        if (MV.norm(m.name) === n && (!year || !y || Math.abs(y - +year) <= 1)) best = m.imdb_id || m.id;
      });
      CM[k] = best; return best;
    }).catch(function () { return null; });
  };
  /** Addons instalados que dan subtítulos (OpenSubtitles v3, SubDL, SubSource…): el reproductor les pide los del video. */
  MV.stremioSubBases = function () {
    // Si aún no se leyó su manifest (por ejemplo recién abierta la app), igual se le pregunta: el que no tenga subtítulos no responde nada
    return lists().filter(function (l) { return !l.man || !l.man.resources || res(l.man, 'subtitles'); }).map(function (l) { var m = l.man || {}; return { base: base(l.url), name: l.name || m.name || 'Addon', pre: (function () { var r = (m.resources || []).filter(function (x) { return x && x.name === 'subtitles'; })[0]; return (r && r.idPrefixes) || m.idPrefixes || []; })() }; });
  };

  // ---------- Contenido de addons en español y en las categorías de la app ----------
  var ESC = null;
  function ES() { if (!ESC) ESC = MV.load('stEs', {}) || {}; return ESC; }
  var TMDB_G = { 28: 'Acción', 12: 'Aventura', 16: 'Animación', 35: 'Comedia', 80: 'Crimen', 99: 'Documental', 18: 'Drama', 10751: 'Familia', 14: 'Fantasía', 36: 'Historia', 27: 'Terror', 10402: 'Música', 9648: 'Misterio', 10749: 'Romance', 878: 'Ciencia ficción', 53: 'Suspenso', 10752: 'Bélica', 37: 'Western', 10759: 'Acción, Aventura', 10762: 'Infantil', 10764: 'Reality', 10765: 'Ciencia ficción, Fantasía', 10768: 'Bélica', 10766: 'Telenovela, Drama', 10767: 'Talk show' };
  /** Categoría según el género principal (en español). Animación sola no cuenta como infantil. */
  function catFor(gtxt, isAnime, t) {
    var D = window.MVD, ids = D.classifyGenres(String(gtxt || ''));
    if (ids[0] === 'infantil' && (isAnime || !/family|familia|kids|infantil|children/i.test(gtxt))) ids = ids.slice(1);
    var g = ids.length ? D.genreName(ids[0]) : (t === 'series' ? 'Series populares' : 'Películas populares');
    return isAnime ? 'Anime · ' + g : g;
  }
  MV.stCatFor = catFor;
  function isAnimeIt(o) {
    var t = (o.src || '') + ' ' + (o.group || '');
    // Addons de K-Drama/doramas no son anime aunque su catálogo sea de tipo "anime"
    if (/k-?drama|dorama|korea|corea|asian drama|c-?drama/i.test(o.src || '')) return false;
    return /^(kitsu|mal|anilist|anidb)[:_]/i.test(o.st.id) || /anime/i.test(t);
  }
  /** Aplica a un título de addon la traducción guardada y la categoría de la app (también a listas guardadas con versiones anteriores). */
  MV.stFix = function (o) {
    if (o.st.ty && MV._stTyHint) MV._stTyHint[o.st.id] = o.st.ty;
    var an = isAnimeIt(o);
    if (!o.src) o.src = o.group || '';
    if (!o.orig) o.orig = String(o.name || '').replace(/\s*\(\d{4}\)$/, '');
    var d = ES()[o.st.id];
    if (d && d.n) o.name = d.n + (o.year && !/\(\d{4}\)/.test(d.n) ? ' (' + o.year + ')' : '');
    if (d && d.p) o.plot = d.p;
    if (d && d.g) o.genre = d.g;
    if (d && d.ol) o.olang = d.ol;
    o.group = catFor(o.genre || '', an, o.type);
  };
  var trRunning = false;
  /** Traduce en segundo plano (con tu clave de TMDB) los títulos de addons que vienen en inglés. */
  MV.stTranslate = function () {
    if (trRunning || !(S.prefs.tmdbKey || '').trim()) return;
    var es = ES(), seen = {};
    // Las series se revisan otra vez si se guardaron antes de reconocer novelas (v 2)
    var todo = (S.items || []).filter(function (i) { if (!i.st || (es[i.st.id] && es[i.st.id].v === 3) || seen[i.st.id]) return false; seen[i.st.id] = 1; return true; });
    if (!todo.length) return;
    trRunning = true;
    var n = 0, changed = 0;
    function apply(id, d) {
      (S.items || []).forEach(function (it) {
        if (!it.st || it.st.id !== id) return;
        if (d.n) it.name = d.n + (it.year && !/\(\d{4}\)/.test(d.n) && it.type === 'movie' ? ' (' + it.year + ')' : it.year && it.type === 'series' && !/\(\d{4}\)/.test(d.n) ? ' (' + it.year + ')' : '');
        if (d.p) it.plot = d.p;
        if (d.g) { it.genre = d.g; it.group = catFor(d.g, /^Anime/.test(it.group || ''), it.type); }
        if (MV.retag) MV.retag(it);
      });
    }
    function next() {
      var it = todo.shift();
      if (!it) { if (--active === 0) { trRunning = false; MV.save('stEs', es); if (changed && MV.rerender) MV.rerender(); } return; }
      var id = it.st.id;
      // Con id de IMDb se busca exacto; anime (Kitsu, MAL…) y otros se buscan por nombre y año
      var q = /^tt\d+$/.test(id) ? MV.tmdb('/find/' + id, '&external_source=imdb_id&language=es-MX').then(function (r) { return r && ((r.movie_results || [])[0] || (r.tv_results || [])[0]); })
        : MV.tmdb('/search/' + (it.type === 'movie' ? 'movie' : 'tv'), '&language=es-MX&query=' + encodeURIComponent(it.orig || String(it.name).replace(/\s*\(\d{4}\)$/, '')) + (it.year ? (it.type === 'movie' ? '&year=' : '&first_air_date_year=') + it.year : '')).then(function (r) {
          var rs = (r && r.results) || [];
          // En anime se prefiere el resultado japonés o de animación
          return isAnimeIt(it) ? (rs.filter(function (x) { return x.original_language === 'ja' || (x.genre_ids || []).indexOf(16) >= 0; })[0] || null) : rs[0] || null;
        });
      q.then(function (x) {
        var d = x ? { v: 3, ol: x.original_language || '', n: x.title || x.name || '', p: x.overview || '', g: (x.genre_ids || []).map(function (g) { return TMDB_G[g]; }).filter(Boolean).join(', ') } : { v: 3, n: '' };
        // Telenovela solo si TMDB la marca como tal (género "Soap"): nada de adivinar por país
        if (x && it.type === 'series' && (x.genre_ids || []).indexOf(10766) >= 0 && !/telenovela/i.test(d.g)) d.g = 'Telenovela' + (d.g ? ', ' + d.g : '');
        es[id] = d; if (d.n || d.p) { apply(id, d); changed++; }
      }).catch(function () {}).then(function () {
        n++;
        if (n % 40 === 0) {
          var keys = Object.keys(es); if (keys.length > 8000) keys.slice(0, keys.length - 8000).forEach(function (k) { delete es[k]; });
          MV.save('stEs', es);
          // Solo se reorganiza la pantalla si no estás moviéndote con el control
          if (changed && Date.now() - (MV._lastKey || 0) > 4000 && MV.rerender && !(MV.modalOpen && MV.modalOpen())) { changed = 0; MV.rerender(); }
        }
        setTimeout(next, 120);
      });
    }
    var active = 3;
    for (var w = 0; w < 3; w++) next();
  };
  setTimeout(function () { MV.stTranslate(); }, 6000);
  setInterval(function () { MV.stTranslate(); }, 3 * 60e3);

  /** Catálogos del addon → películas y series de MiVibra (hasta 300 por catálogo). */
  var TYH = MV._stTyHint = {};
  MV.buildFromStremio = function (list, deep) {
    // Rápida: ~500 por catálogo. Completa (en segundo plano): sigue pidiendo páginas hasta que el addon no tenga más.
    // Los topes son los mismos en todos los equipos, así el celular y la TV muestran lo mismo.
    var LIM = deep ? { cat: 3000, pages: 160, genres: 60, cats: 160, total: 30000 } : { cat: 500, pages: 25, genres: 12, cats: 90, total: 8000 };
    var b = base(list.url);
    return MV.stremioManifest(list.url).then(function (man) {
      list.man = { name: man.name, resources: man.resources, types: man.types, idPrefixes: man.idPrefixes, logo: man.logo || '' };
      // Catálogos que se pueden listar: cualquier tipo (algunos addons usan tipos propios, como los +18) menos canales en vivo.
      // Si el catálogo exige un género, se piden sus primeros géneros por separado; los que exigen búsqueda no se pueden listar.
      var cats = [], byGenre = [], total = 0;
      (man.catalogs || []).forEach(function (c) {
        if (!c || !c.id || /^(tv|channel|channels|events?|radio)$/i.test(c.type || '')) return;
        var req = (c.extra || []).filter(function (e) { return e && e.isRequired; }).map(function (e) { return e.name; }).concat(c.extraRequired || []);
        if (!req.length) { cats.push(c); return; }
        if (req.length === 1 && req[0] === 'genre') {
          var g = ((c.extra || []).filter(function (e) { return e && e.name === 'genre'; })[0] || {}).options || c.genres || [];
          g.slice(0, LIM.genres).forEach(function (o) { byGenre.push(Object.assign({}, c, { _genre: o, name: (c.name ? c.name + ' · ' : '') + o })); });
        }
      });
      // Primero todos los catálogos normales (Netflix, Apple TV+, populares…) y después los que se piden por género
      cats = cats.concat(byGenre).slice(0, LIM.cats);
      var out = [], seen = {}, perCat = [], failedCats = [];
      // De a 6 catálogos a la vez (con muchos a la vez algunos servidores cortan)
      var queue = cats.map(function (c, i) { return Object.assign({ _i: i }, c); }), workers = [];
      // Una página que falla se pide otra vez (los servidores gratuitos a veces cortan); si vuelve a fallar se avisa
      function getPage(url) { return MV.getJSON(url).catch(function () { return new Promise(function (r) { setTimeout(r, 1500); }).then(function () { return MV.getJSON(url); }); }); }
      function runOne(c) {
        var bad = false;
        // Páginas seguidas según lo que trae cada una (Kitsu da 20 por página, Cinemeta 100); solo si el catálogo acepta "skip"
        var canSkip = (c.extra || []).some(function (e) { return e && e.name === 'skip'; }) || (c.extraSupported || []).indexOf('skip') >= 0;
        var pp = [];
        function page(skip, n) {
          var ex = [c._genre ? 'genre=' + encodeURIComponent(c._genre) : '', skip ? 'skip=' + skip : ''].filter(Boolean).join('&');
          return getPage(b + '/catalog/' + c.type + '/' + encodeURIComponent(c.id) + (ex ? '/' + ex : '') + '.json').then(function (j) { return (j && j.metas) || []; }).catch(function () { bad = true; return []; }).then(function (metas) {
            // Si el addon ignora "skip" y repite la misma página, se para
            var prev = pp[pp.length - 1];
            if (prev && prev.length && metas.length && prev[0].id === metas[0].id) return;
            pp.push(metas);
            // Se siguen pidiendo páginas mientras traigan títulos (hasta unos 1000 por catálogo)
            // Muchos addons (como TMDB) aceptan "skip" aunque no lo declaren: se intenta igual mientras sigan llegando títulos nuevos
            total += metas.length;
            // Tope por catálogo (~500); el mismo en todos los equipos para que se vea igual en el celular y en la TV
            if (metas.length >= (canSkip ? 1 : 10) && n < LIM.pages && skip + metas.length < LIM.cat) return page(skip + metas.length, n + 1);
          });
        }
        return page(0, 1).then(function () {
          if (bad && !pp.some(function (x) { return x.length; })) failedCats.push((list.name || man.name) + ' · ' + (c.name || ''));
          perCat[c._i] = pp;
        });
      }
      // Se arman en el orden del addon (no en el que llegaron): así sale siempre lo mismo y en el mismo orden
      function assemble() {
        cats.forEach(function (c, ci) {
          (perCat[ci] || []).forEach(function (metas) {
            metas.forEach(function (m) {
              if (out.length >= LIM.total) return;
              if (!m || !m.id || seen[c.type + m.id]) return; seen[c.type + m.id] = 1;
              var year = String(m.releaseInfo || m.year || '').slice(0, 4);
              var t = m.type === 'movie' || m.type === 'series' ? m.type : /^(series|anime|tv ?shows?|shows?)$/i.test(c.type) ? 'series' : 'movie';
              // Tipo propio del addon (por ejemplo "Porn"): se recuerda para pedirle los enlaces con ese tipo
              if (c.type !== 'movie' && c.type !== 'series') TYH[m.id] = m.type || c.type;
              var isAnime = c.type === 'anime' || /^(kitsu|mal|anilist|anidb)[:_]/i.test(m.id);
              var es = ES()[m.id];   // título, sinopsis y géneros en español (de TMDB), si ya se tradujo
              var nm = (es && es.n) || m.name;
              var name = nm + (/^\d{4}$/.test(year) && !/\(\d{4}\)/.test(nm) ? ' (' + year + ')' : '');
              var gtxt = (es && es.g) || (m.genres || []).join(', ');
              out.push({
                // La clave sigue siendo la del nombre original: así no se pierde el avance al traducirse
                key: (t === 'series' ? 'series:' : 'movie:') + MV.norm(m.name + (t === 'movie' && year ? ' ' + year : '')),
                type: t, name: name, year: /^\d{4}$/.test(year) ? year : '', orig: m.name,
                rdate: /^\d{4}-\d{2}-\d{2}/.test(String(m.released || '')) ? String(m.released).slice(0, 10) : undefined,
                // Si el addon no trae carátula se usa su fondo o logo
                poster: m.poster || m.background || m.logo || '', plot: (es && es.p) || m.description || '', genre: gtxt, rating: m.imdbRating || '',
                // Se organiza en las categorías de la app (Acción, Comedia, Terror…) en vez de "Cinemeta · Popular"
                group: catFor(gtxt, isAnime, t), src: (list.name || man.name) + ' · ' + (c.name || ''),
                st: TYH[m.id] ? { id: m.id, type: t, list: list.id, ty: TYH[m.id] } : { id: m.id, type: t, list: list.id }, list: list.id, url: ''
              });
            });
          });
        });
      }
      function worker() { var c = queue.shift(); return c ? runOne(c).catch(function () {}).then(worker) : Promise.resolve(); }
      for (var w = 0; w < 6; w++) workers.push(worker());
      return Promise.all(workers).then(function () { assemble(); list._stFailed = failedCats; return out; });
    });
  };

  /** Enlaces para ver: se piden a todos los addons que ofrecen "stream" para ese tipo e id. */
  // Ids alternos: si el catálogo usa ids propios (tmdb:, de AnimeStream, etc.) y los addons de enlaces solo entienden IMDb (tt…)
  var ALT = {};
  MV.stAlt = function (id, alt) { if (id && alt && id !== alt && /^tt\d+/.test(alt)) ALT[id] = alt; };
  function altId(type, id) {
    if (ALT[id]) return Promise.resolve(ALT[id]);
    var m = String(id).match(/^tmdb:(\d+)(?::(\d+):(\d+))?$/);
    if (m && (S.prefs.tmdbKey || '').trim()) {
      return MV.tmdb('/' + (type === 'movie' ? 'movie' : 'tv') + '/' + m[1] + '/external_ids').then(function (r) {
        var a = r && r.imdb_id ? r.imdb_id + (m[2] ? ':' + m[2] + ':' + m[3] : '') : null;
        if (a) ALT[id] = a; return a;
      }).catch(function () { return null; });
    }
    return Promise.resolve(null);
  }
  MV.stremioStreams = function (type, id, only) {
    return rawStreams(type, id, only).then(function (st) {
      if (st.length) return st;
      return altId(type, id).then(function (a) { return a && a !== id ? rawStreams(type, a, only).then(function (r) { if (!r.length) r.failed = (r.failed || 0) + (st.failed || 0); return r; }) : st; });
    });
  };
  /** Un addon que tarda demasiado no frena a los demás: a los 12 s se sigue sin él. */
  function withTimeout(p, ms) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('tardó demasiado')); }, ms); })]); }
  function rawStreams(type, id, only) {
    var ls = lists().filter(function (l) { return !only || l.id === only; });
    var animeId = /^(kitsu|mal|anilist|anidb)[:_]/i.test(id);
    // Tipo que entiende cada addon: algunos de anime solo aceptan "anime"
    var hint = TYH[id] || TYH[String(id).split(':')[0]];
    function tyFor(m) { if (!m.resources) return hint || type; var ts = resTypes(m, 'stream'); return hint && ts.indexOf(hint) >= 0 ? hint : ts.indexOf(type) >= 0 ? type : animeId && ts.indexOf('anime') >= 0 ? 'anime' : ''; }
    var D = MV._stDiag = MV._stDiag || {};
    var ok = ls.filter(function (l) { var m = l.man || {}; return !m.resources || (res(m, 'stream') && tyFor(m) && prefixOk(m, 'stream', id)); });
    // Para explicar el resultado: qué addon respondió qué
    ls.forEach(function (l) { var m = l.man || {}; if (m.resources && res(m, 'stream') && ok.indexOf(l) < 0 && D[l.name] === undefined) D[l.name] = 'no tiene este tipo de contenido'; });
    var failed = 0;   // addons que no respondieron (caídos o lentos): un "sin enlaces" así no es definitivo
    var jobs = ok.map(function (l) {
      return withTimeout(MV.getJSON(base(l.url) + '/stream/' + tyFor(l.man || {}) + '/' + encodeURIComponent(id) + '.json'), 12000).then(function (j) {
        var all = (j && j.streams) || [];
        MV._stTorrents = (MV._stTorrents || 0) + all.filter(function (s) { return s.infoHash && !s.url; }).length;
        var nd = all.filter(function (s) { return s.url && /^https?:/i.test(s.url); }).length, nt = all.length - nd;
        if (typeof D[l.name] !== 'number' || nd > D[l.name]) D[l.name] = nd || (nt ? nt + ' torrents (sin debrid no sirven)' : 0);
        return all.filter(function (s) { return s.url && /^https?:/i.test(s.url); }).map(function (s) {
          var h = (s.behaviorHints && s.behaviorHints.proxyHeaders && s.behaviorHints.proxyHeaders.request) || {};
          return { url: s.url, title: String(s.title || s.description || s.name || '').replace(/\s+/g, ' ').trim(), src: s.name || l.name || '', lid: l.id, ua: h['User-Agent'] || h['user-agent'] || '', ref: h.Referer || h.referer || '' };
        });
      }).catch(function (e) { failed++; if (typeof D[l.name] !== 'number') D[l.name] = 'no respondió' + (e && /40[13]/.test(e.message || '') ? ' (acceso denegado: revisa su configuración)' : ''); return []; });
    });
    // Primero los que se ven como video (mp4, mkv, m3u8…); al final los que pueden ser páginas web
    function score(x) { var u = x.url.toLowerCase().split('?')[0]; return /\.(mp4|mkv|m3u8|webm|avi|mov|ts|mpd)$/.test(u) ? 0 : /\/(hls|stream|video|playlist|manifest)/.test(u) ? 1 : 2; }
    // No se espera al addon más lento: a los 5 s, si ya hay enlaces, se sigue con esos (los que lleguen tarde no frenan el video)
    return new Promise(function (resolve) {
      var got = jobs.map(function () { return null; }), left = jobs.length, sent = false;
      function out() {
        if (sent) return; sent = true; clearTimeout(soft);
        var r = got.filter(Boolean).reduce(function (a, b) { return a.concat(b); }, []).sort(function (a, b) { return score(a) - score(b); });
        r.failed = failed + got.filter(function (g) { return g === null; }).length; resolve(r);
      }
      var soft = setTimeout(function () { if (got.some(function (g) { return g && g.length; })) out(); }, 5000);
      if (!left) out();
      jobs.forEach(function (j, i) { j.then(function (r) { got[i] = r || []; if (--left === 0) out(); }); });
    });
  };

  /** Elige el enlace: si hay varios, se muestra la lista para escoger (calidad, idioma, fuente). */
  /** Idioma de un enlace según lo que dice el addon (nombre, detalle, banderas): lat, cast, es, sub o ''. */
  MV.stLang = function (x) {
    var u = String(x.url || '').split('?')[0]; try { u = decodeURIComponent(u); } catch (e) {}
    var t = (x.src + ' ' + x.title + ' ' + u).toLowerCase();
    if (/latino|latam|\blat\b|\uD83C\uDDF2\uD83C\uDDFD|es[-_ ]?mx|es[-_ ]?419|spanish ?\(?latin/.test(t)) return 'lat';
    if (/castellano|\uD83C\uDDEA\uD83C\uDDF8|espa[nñ]a|\bspain\b|es[-_ ]es\b/.test(t)) return 'cast';
    if (/subtitulad|\bvose\b|\bsub(s|bed)?\b/.test(t)) return 'sub';
    if (/espa[nñ]ol|spanish|\besp\b|\bspa\b/.test(t)) return 'es';
    return '';
  };
  /** ¿Sirve con "Solo español latino"? Latino, o español sin decir cuál; en anime también subtitulado. */
  function latLink(x, anime, spanishOrig) { var l = MV.stLang(x); return l === 'lat' || l === 'es' || (spanishOrig && l === '') || (anime && (l === 'sub' || l === '')); }
  MV.stLatLink = latLink;

  /** Addon preferido para reproducir: se le pregunta primero y, si tiene enlace, se reproduce de una sin esperar a los demás. */
  MV.stPrefList = function () { var id = S.prefs.stPref; return id ? lists().filter(function (l) { return l.id === id; })[0] || null : null; };
  /** ¿El enlace es de este título? Muchos addons buscan por nombre y a veces traen otra película ("Lords of War" → "The Lord of the Rings").
      false = claramente otro título; true = coincide o no se puede saber. */
  var STOP = { the: 1, of: 1, and: 1, a: 1, an: 1, el: 1, la: 1, los: 1, las: 1, de: 1, del: 1, y: 1, en: 1, un: 1, una: 1 };
  function words(t) { return MV.norm(String(t || '').replace(/\(\d{4}\)/g, '')).split(' ').filter(function (w) { return w.length > 1 && !STOP[w] && !/^\d+$/.test(w); }); }
  function titleMatch(x, opts) {
    if (!opts) return true;
    var u = String(x.url || '').split('?')[0]; try { u = decodeURIComponent(u); } catch (e) {}
    var txt = MV.norm((x.title || '') + ' ' + u.split('/').pop().replace(/[._]/g, ' ')), tw = ' ' + txt + ' ';
    var names = [opts.name, opts.alt].filter(Boolean), best = -1;
    names.forEach(function (n) { var w = words(n); if (!w.length) return; var hit = w.filter(function (x) { return tw.indexOf(' ' + x + ' ') >= 0; }).length; best = Math.max(best, hit / w.length); });
    // El enlace no dice ningún nombre reconocible (solo calidad, servidor…): no se puede saber
    var hasWords = words(txt).filter(function (w) { return !/^(1080p|720p|480p|2160p|4k|hdr|web|webrip|bluray|hdtv|x264|x265|h264|hevc|aac|dual|latino|castellano|mkv|mp4|m3u8|sub|esp|eng|multi|hd|fhd|uhd)$/.test(w); }).length;
    if (best >= 0 && hasWords >= 2 && best < 0.5) return false;
    if (opts.year) { var ys = (txt.match(/\b(19|20)\d{2}\b/g) || []).map(Number); if (ys.length && !ys.some(function (y) { return Math.abs(y - +opts.year) <= 1; })) return false; }
    return true;
  }
  MV.stremioPick = function (type, id, title, showAll, skipPref, opts) {
    if (opts && !opts.name) opts.name = title;
    // Por defecto se muestra siempre la lista de enlaces para elegir (Ajustes › Reproductor › Elegir de dónde reproducir)
    var ask = S.prefs.askSource !== false;
    var pref = !ask && !showAll && !skipPref && MV.stPrefList();
    MV.toast(pref ? 'Buscando en ' + (pref.name || 'tu addon preferido') + '…' : 'Buscando enlaces en tus addons…', 3000);
    MV._stTorrents = 0;
    MV._stDiag = {};
    var anime = /^(kitsu|mal|anilist|anidb)[:_]/i.test(id);
    if (pref) {
      return MV.stremioStreams(type, id, pref.id).then(function (st) {
        if (S.prefs.latOnly) st = st.filter(function (x) { return latLink(x, anime, opts && opts.olang === 'es'); });
        // Solo se reproduce de una si el enlace es de este título; si no, se muestra la lista completa
        st = st.filter(function (x) { return titleMatch(x, opts); });
        // Latino primero, luego el orden del addon
        var rank = { lat: 0, es: 1, sub: 2, '': 3, cast: 4 };
        st = st.map(function (x, i) { return { x: x, i: i, r: rank[MV.stLang(x)] }; }).sort(function (a, b) { return a.r - b.r || a.i - b.i; }).map(function (o) { return o.x; });
        if (!st.length) return MV.stremioPick(type, id, title, false, true, opts);
        var x = st[0]; x.rest = st.slice(1).map(function (y) { return y.url; }).slice(0, 8);
        return x;
      });
    }
    return MV.stremioStreams(type, id).then(function (st) {
      // Latino primero; con "Solo español latino" solo se ofrecen enlaces en latino (o español sin especificar)
      var rank = { lat: 0, es: 1, sub: 2, '': 3, cast: 4 };
      st = st.map(function (x, i) { return { x: x, i: i, r: rank[MV.stLang(x)] }; }).sort(function (a, b) { return a.r - b.r || a.i - b.i; }).map(function (o) { return o.x; });
      if (S.prefs.latOnly && !showAll && st.length) {
        var lat = st.filter(function (x) { return latLink(x, anime, opts && opts.olang === 'es'); });
        if (!lat.length) {
          return MV.confirm('Sin enlaces en español latino', 'Tus addons encontraron ' + st.length + (st.length === 1 ? ' enlace' : ' enlaces') + ' para “' + title + '”, pero ninguno dice que sea en latino. Tienes activado “Solo español latino”.', 'Ver todos los enlaces').then(function (y) {
            if (!y) throw new Error('cancelado');
            return MV.stremioPick(type, id, title, true, true, opts);
          });
        }
        st = lat;
      }
      if (!st.length && MV._stTorrents) throw new Error('Tus addons solo encontraron torrents (' + MV._stTorrents + '). MiVibra reproduce enlaces directos: en la configuración de Torrentio agrega un servicio debrid (Real-Debrid, AllDebrid, Premiumize…) y vuelve a instalarlo con el enlace nuevo.');
      if (!st.length) {
        var dg = MV._stDiag || {}, names = Object.keys(dg);
        if (!names.length) throw new Error('No tienes addons que den enlaces para ver (por ejemplo Torrentio con debrid). Instálalo en Plugins.');
        MV.modal('<h2>Sin enlaces para “' + esc(title) + '”</h2><p class="muted">Esto respondió cada addon de enlaces:</p><div class="dlist">' + names.map(function (n) { var v = dg[n]; return '<div class="line"><div class="t"><b>' + esc(n) + '</b><span>' + esc(v === 0 ? 'no encontró nada' : typeof v === 'number' ? v + ' enlaces' : v) + '</span></div></div>'; }).join('') + '</div><p class="muted">Si es un estreno reciente, puede que todavía no haya enlaces. Con “Solo títulos con enlaces” (Ajustes › Listas) estos títulos no te aparecen.</p><div class="btns"><button class="btn f" data-act="closeModal" data-autofocus>Entendido</button></div>');
        throw new Error('cancelado');
      }
      // Los que parecen de otro título van al final, marcados
      st.forEach(function (x) { x._other = !titleMatch(x, opts); });
      st = st.filter(function (x) { return !x._other; }).concat(st.filter(function (x) { return x._other; }));
      // Los demás enlaces quedan de respaldo: si el elegido no es un video, el reproductor prueba el siguiente solo
      function withRest(x) { x.rest = st.filter(function (y) { return y !== x && !y._other; }).map(function (y) { return y.url; }).slice(0, 8); return x; }
      // El addon preferido va primero en la lista
      if (S.prefs.stPref) st = st.filter(function (x) { return x.lid === S.prefs.stPref; }).concat(st.filter(function (x) { return x.lid !== S.prefs.stPref; }));
      if (!ask && st.length === 1 && !st[0]._other) return withRest(st[0]);
      return new Promise(function (resolve, reject) {
        MV._stPick = function (i) { MV.closeModal(true); resolve(withRest(st[+i])); };
        MV.modal('<h2>Elige el enlace</h2><p class="muted">' + st.length + ' opciones de tus addons para “' + esc(title) + '”.</p><div class="stpick">' +
          st.slice(0, 40).map(function (s, i) {
            // Sin direcciones largas: solo el nombre de la fuente, el detalle y etiquetas de calidad e idioma
            var txt = String(s.title || '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
            var all = (s.src + ' ' + s.title + ' ' + s.url).toLowerCase(), tags = [];
            [['2160p|4k|uhd', '4K'], ['1080p', '1080p'], ['720p', '720p'], ['480p', '480p'], ['hdr', 'HDR'], ['latino|lat\\b|\\bmx\\b', 'Latino'], ['castellano|\\bes\\b|spanish|español', 'Español'], ['dub', 'Doblado'], ['sub', 'Subtitulado']].forEach(function (t) { if (new RegExp(t[0]).test(all) && tags.indexOf(t[1]) < 0) tags.push(t[1]); });
            var ext = (s.url.toLowerCase().split('?')[0].match(/\.(mp4|mkv|m3u8|avi|webm)$/) || [])[1];
            if (ext) tags.push(ext.toUpperCase());
            if (s._other) tags.unshift('¿Otro título?');
            return '<button class="stopt f" data-act="stPick" data-arg="' + i + '"' + (i ? '' : ' data-autofocus') + '><b>' + esc(s.src || 'Enlace ' + (i + 1)) + '</b>' + (txt ? '<span>' + esc(txt.slice(0, 140)) + '</span>' : '') + (tags.length ? '<i>' + tags.map(function (t) { return '<em>' + esc(t) + '</em>'; }).join('') + '</i>' : '') + '</button>';
          }).join('') +
          '</div><div class="btns"><button class="btn ghost f" data-act="confirmNo">Cancelar</button></div>', { onClose: function () { reject(new Error('cancelado')); } });
      });
    });
  };
  MV.ACT.stPick = function (i) { if (MV._stPick) MV._stPick(i); };

  // ---------- "Solo con enlaces": se revisa en segundo plano qué títulos de los catálogos tienen enlaces ----------
  var LK = null;
  function lk() { if (!LK) { LK = MV.load('stLinks', {}) || {}; var now = Date.now(); Object.keys(LK).forEach(function (k) { if (now - LK[k].t > 2 * 86400e3) delete LK[k]; }); } return LK; }
  MV.stLinked = function (it) { var c = lk()[it.st.type + ':' + it.st.id]; if (!c || (!c.ok && c.v !== 2)) return undefined; return S.prefs.latOnly && c.lat !== undefined && it.olang !== 'es' ? c.lat : c.ok; };
  var running = false, saveT = 0;
  MV.stCheckLinks = function () {
    if (running || !MV.S.prefs.stOnlyLinked) return;
    var streamers = lists().filter(function (l) { var m = l.man || {}; return !m.resources || res(m, 'stream'); });
    if (!streamers.length) return;
    var todo = (MV.S.items || []).filter(function (i) { return i.st && !i.url && !i.xt && MV.stLinked(i) === undefined; });
    if (!todo.length) return;
    running = true;
    var n = 0, found = 0;
    function next() {
      // Primero los de la sección que estás viendo
      var pr = MV._stPrio, pi = -1;
      if (pr) for (var q = 0; q < todo.length; q++) if (pr[todo[q].key]) { pi = q; break; }
      var it = pi >= 0 ? todo.splice(pi, 1)[0] : todo.shift();
      if (it && MV.stLinked(it) !== undefined) return next();
      if (!it) { if (--active > 0) return; running = false; MV.save('stLinks', lk()); MV._stLinkV = (MV._stLinkV || 0) + 1; if (found && MV.rerender) MV.rerender(); return; }
      MV._stTorrents = 0;
      // Series: se usa el id real del primer capítulo que da el addon (y así se aprende su equivalente en IMDb)
      var idP = it.st.type !== 'series' ? Promise.resolve(it.st.id)
        : (it.episodes && it.episodes.length ? Promise.resolve(it.episodes) : MV.stremioEpisodes(it).then(function (eps) { if (eps.length) it.episodes = eps; return eps; }).catch(function () { return []; })).then(function (eps) {
          var e = (eps || []).filter(function (x) { return x.stId; }).sort(function (a, b) { return a.season - b.season || a.ep - b.ep; })[0];
          return e ? e.stId : it.st.id + (/^(kitsu|mal|anilist|anidb)[:_]/i.test(it.st.id) ? ':1' : ':1:1');
        });
      idP.then(function (sid) { return MV.stremioStreams(it.st.type === 'series' ? 'series' : 'movie', sid); }).then(function (st) {
        var anime = /^(kitsu|mal|anilist|anidb)[:_]/i.test(it.st.id);
        // Se guarda si hay enlaces y si alguno es en latino (para cuando está activo "Solo español latino")
        // Si algún addon no respondió y no hubo enlaces, no se marca "sin enlaces": se vuelve a revisar después
        if (!st.length && st.failed) return;
        lk()[it.st.type + ':' + it.st.id] = { v: 2, ok: st.length > 0, lat: st.some(function (x) { return latLink(x, anime, it.olang === 'es'); }), t: Date.now() };
        if (st.length) found++;
      }).catch(function () {}).then(function () {
        n++;
        // Cada 25 revisados se guarda y se muestra lo nuevo
        if (n % (n < 100 ? 10 : 25) === 0) { MV.save('stLinks', lk()); MV._stLinkV = (MV._stLinkV || 0) + 1; if (found && MV.rerender) { found = 0; MV.rerender(); } }
        setTimeout(next, 150);
      });
    }
    var active = 4;
    for (var w = 0; w < 4; w++) next();
  };
  setTimeout(function () { MV.stCheckLinks(); }, 8000);
  setInterval(function () { MV.stCheckLinks(); }, 5 * 60e3);

  /** Capítulos de una serie de Stremio (del addon que da la ficha o de Cinemeta). */
  MV.stremioEpisodes = function (item) {
    var st = item.st, ls = lists();
    var own = ls.filter(function (l) { return l.id === st.list; })[0];
    var srcs = (own ? [own] : []).concat(ls.filter(function (l) { return l !== own && res(l.man || {}, 'meta') && prefixOk(l.man || {}, 'meta', st.id); }));
    var urls = srcs.filter(function (l) { return !l.man || res(l.man, 'meta'); }).map(function (l) { return base(l.url); });
    if (/^tt\d+/.test(st.id)) urls.push(base(CINEMETA));
    var anim = /^(kitsu|mal|anilist|anidb)[:_]/i.test(st.id);
    var tys = anim ? ['series', 'anime'] : ['series'];
    function fetchMeta(b, ty, id) {
      return withTimeout(MV.getJSON(b + '/meta/' + ty + '/' + encodeURIComponent(id) + '.json'), 12000).then(function (j) { return j && j.meta && (j.meta.videos || []).length ? j.meta : null; }).catch(function () { return null; });
    }
    function eps(meta) {
      return (meta.videos || []).filter(function (v) { return (v.season || 0) > 0 || v.episode || v.number; }).map(function (v) {
        return { season: +v.season || 1, ep: +(v.episode || v.number) || 0, title: v.title || v.name || ('Episodio ' + (v.episode || v.number)), url: '', stId: v.id, img: v.thumbnail || '', plot: v.overview || v.description || '', date: /^\d{4}-\d{2}-\d{2}/.test(String(v.released || v.firstAired || '')) ? String(v.released || v.firstAired).slice(0, 10) : '' };
      });
    }
    // Se le pide la lista de capítulos a todos los que la dan (no solo al primero): algunos addons solo listan los capítulos que tienen
    var jobs = [];
    urls.forEach(function (b) { tys.forEach(function (ty) { jobs.push(fetchMeta(b, ty, st.id)); }); });
    // Plan B: ningún addon dio capítulos con ese id (pasa con catálogos de TMDB o MAL que no tienen "meta").
    // Se busca la serie por nombre en Kitsu (anime) y en Cinemeta, y si el nombre trae "3rd Season" se toma esa temporada.
    function byName() {
      var raw = String(item.name || '').replace(/\(\d{4}\)/g, '').trim();
      var sm = raw.match(/\b(\d+)(?:st|nd|rd|th)\s+season\b|\bseason\s*(\d+)\b|\btemporada\s*(\d+)\b|\b(\d+)\s*(?:ª|a)?\s+temporada\b/i);
      var sn = sm ? +(sm[1] || sm[2] || sm[3] || sm[4]) : 0;
      var clean = raw.replace(/\b\d+(?:st|nd|rd|th)\s+season\b|\bseason\s*\d+\b|\btemporada\s*\d+\b|\b\d+\s*(?:ª|a)?\s+temporada\b|\b(?:part|parte|cour)\s*\d+\b/ig, '').replace(/[\s:–-]+$/, '').trim();
      var KITSU = 'https://anime-kitsu.strem.fun';
      var isAnime = anim || item.anime;
      var seasonRx = sn ? new RegExp('\\b(' + sn + '(st|nd|rd|th)?|' + (['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'][sn] || sn) + ')\\b', 'i') : null;
      function search(b, ty, cat, q) {
        return withTimeout(MV.getJSON(b + '/catalog/' + ty + '/' + cat + '/search=' + encodeURIComponent(q) + '.json'), 12000).then(function (j) { return (j && j.metas) || []; }).catch(function () { return []; });
      }
      function pick(list) {
        if (!list.length) return null;
        var n = MV.norm(clean).split(' ').slice(0, 2).join(' ');
        var ok = list.filter(function (m) { return m && m.id && MV.norm(m.name || '').indexOf(n) >= 0; });
        if (!ok.length) return null;
        return (seasonRx && ok.filter(function (m) { return seasonRx.test(m.name || ''); })[0]) || ok[0];
      }
      var steps = [];
      if (anim) steps.push(function () { return fetchMeta(KITSU, 'anime', st.id).then(function (m) { return m || fetchMeta(KITSU, 'series', st.id); }); });
      if (isAnime) steps.push(function () {
        return search(KITSU, 'anime', 'kitsu-anime-list', raw).then(function (l) { var m = pick(l); return m ? fetchMeta(KITSU, 'anime', m.id) : null; });
      });
      steps.push(function () {
        var q = clean.split(':')[0].trim() === clean ? [clean] : [clean, clean.split(':')[0].trim()];
        return search(base(CINEMETA), 'series', 'top', q[0]).then(function (l) { return l.length || !q[1] ? l : search(base(CINEMETA), 'series', 'top', q[1]); }).then(function (l) {
          var m = l.filter(function (x) { return /^tt\d+/.test(x.imdb_id || x.id || ''); })[0];
          if (!m) return null;
          var tt = m.imdb_id || m.id;
          MV.stAlt(st.id, tt);
          return fetchMeta(base(CINEMETA), 'series', tt).then(function (meta) {
            if (meta && sn && (meta.videos || []).some(function (v) { return +v.season === sn; })) meta = Object.assign({}, meta, { videos: meta.videos.filter(function (v) { return +v.season === sn; }) });
            return meta;
          });
        });
      });
      var i = 0;
      function next() {
        if (i >= steps.length) return Promise.resolve([]);
        return steps[i++]().catch(function () { return null; }).then(function (m) { return m && (m.videos || []).length ? eps(m) : next(); });
      }
      return next();
    }
    return Promise.all(jobs).then(function (metas) {
      metas = metas.filter(Boolean);
      if (!metas.length) return byName();
      var meta = metas[0];
      var imdb = metas.map(function (m) { return m.imdb_id || (/^tt\d+$/.test(m.id) ? m.id : ''); }).filter(Boolean)[0] || (item._meta && item._meta.imdb) || '';
      if (imdb) MV.stAlt(st.id, imdb);
      // Kitsu trae imdbSeason/imdbEpisode: el capítulo equivalente en IMDb (para addons que solo entienden tt…)
      if (imdb) (meta.videos || []).forEach(function (v) { var se = v.imdbSeason || v.season, ep = v.imdbEpisode || v.episode; if (v.id && !/^tt/.test(v.id) && se && ep) MV.stAlt(v.id, (v.imdb_id || imdb) + ':' + se + ':' + ep); });
      // Si el catálogo no es de IMDb (tmdb:, etc.), también se mira la lista completa de Cinemeta
      var extra = !anim && imdb && !/^tt/.test(st.id) ? fetchMeta(base(CINEMETA), 'series', imdb) : Promise.resolve(null);
      return extra.then(function (cm) {
        if (cm) metas.push(cm);
        var out = eps(meta);
        // Anime (numeración propia) no se mezcla con otras listas
        if (anim) return out;
        var have = {}; out.forEach(function (e) { have[e.season + ':' + e.ep] = 1; });
        metas.slice(1).forEach(function (m) { eps(m).forEach(function (e) { var k = e.season + ':' + e.ep; if (!have[k] && e.ep) { have[k] = 1; out.push(e); } }); });
        return out;
      });
    });
  };

  // ---------------- Repositorios (tipo Kodi): un enlace con varios plugins para instalar ----------------
  /**
   * Formatos que se aceptan:
   *  - JSON { "name": "...", "addons": [ { "name", "description", "manifest" | "m3u" | "url", "logo" } ] }
   *  - JSON con una lista de enlaces, o texto con un enlace por línea (manifest.json o .m3u)
   *  - La lista de addons de Stremio (addonCollection: [{ transportUrl, manifest }])
   */
  MV.repoLoad = function (url) {
    return MV.getJSON(url).catch(function () { return MV.getText ? MV.getText(url) : Promise.reject(new Error('No se pudo leer el repositorio')); }).then(function (j) {
      var items = [], name = '';
      function add(o) {
        if (!o) return;
        if (typeof o === 'string') { o = { url: o }; }
        var link = o.manifest || o.transportUrl || o.m3u || o.repo || o.url || '';
        var isMv = /^[\w.-]+\/[\w.-]+$/.test(link) || /mivibra-plugin\.json|github\.com\//i.test(link);
        if (!isMv && !/^(https?|stremio):\/\//i.test(link)) return;
        var kind = isMv ? 'mvplugin' : o.m3u || /\.m3u8?(\?|$)|get\.php\?/i.test(link) ? 'm3u' : 'stremio';
        items.push({ name: o.name || (o.manifest && o.manifest.name) || link.replace(/^\w+:\/\//, '').split('/')[0], desc: o.description || (o.manifest && o.manifest.description) || '', logo: o.logo || (o.manifest && o.manifest.logo) || '', link: link, kind: kind });
      }
      if (typeof j === 'string') j.split(/\r?\n/).map(function (s) { return s.trim(); }).forEach(function (s) { if (s && s[0] !== '#') add(s); });
      else if (Array.isArray(j)) j.forEach(add);
      else if (j) { name = j.name || ''; (j.addons || j.plugins || j.items || j.addonCollection || []).forEach(add); }
      if (!items.length) throw new Error('Ese enlace no tiene plugins que MiVibra pueda usar');
      return { name: name || 'Repositorio', url: url, items: items };
    });
  };
  function repos() { return MV.load('repos', []); }
  MV.repoMenu = function (repo) {
    var installed = {}; (S.lists || []).forEach(function (l) { installed[l.url] = 1; installed[base(l.url)] = 1; });
    MV._repo = repo;
    MV.modal('<h2>' + esc(repo.name) + '</h2><p class="muted">' + repo.items.length + ' plugins. Toca uno para instalarlo en tus listas.</p><div class="stpick">' +
      repo.items.map(function (p, i) {
        var on = installed[p.link] || installed[base(p.link)];
        return '<button class="line f" data-act="repoInstall" data-arg="' + i + '"' + (i ? '' : ' data-autofocus') + ' style="width:100%;text-align:left"' + (on ? ' disabled' : '') + '><div class="t"><b>' + esc(p.name) + (on ? ' · instalado ✓' : '') + '</b><span>' + esc((p.kind === 'm3u' ? 'Lista M3U · ' : p.kind === 'mvplugin' ? 'Plugin de MiVibra · ' : 'Addon de Stremio · ') + (p.desc || p.link).slice(0, 140)) + '</span></div></button>';
      }).join('') + '</div><div class="btns"><button class="btn ghost f" data-act="confirmNo">Cerrar</button></div>');
  };
  MV.ACT.repoInstall = function (i) {
    var p = MV._repo && MV._repo.items[+i]; if (!p) return;
    MV.closeModal(true);
    if (p.kind === 'mvplugin') { MV.installMvPlugin(p.link); return; }
    installPlugin(p.link, p.name, p.kind);
  };
  function installPlugin(link, name, kind) {
    if (kind === 'm3u') { MV.toast('Agregando “' + name + '”…'); return MV.addList({ type: 'url', name: name, url: link }).then(function () { MV.rerender(); }).catch(function (e) { MV.toast(e.message, 6000); }); }
    MV.toast('Instalando “' + name + '”…');
    return MV.stremioManifest(link).then(function (man) {
      var onlyStreams = !(man.catalogs || []).length && res(man, 'stream');
      var onlySubs = !(man.catalogs || []).length && res(man, 'subtitles') && !res(man, 'stream');
      return MV.addList({ type: 'stremio', name: name && !/^[\w.-]+\.\w+$/.test(name) ? name : man.name, url: manifestUrl(link) }).then(function () {
        // Addons como Torrentio no traen películas para mostrar, solo enlaces: hace falta un catálogo (Cinemeta)
        var hasCat = (S.lists || []).some(function (l) { return l.type === 'stremio' && l.count > 0; });
        if (onlySubs) MV.toast('Listo: los subtítulos de “' + man.name + '” saldrán en Audio y subtítulos al reproducir', 6000);
        if (onlyStreams && !hasCat) MV.confirm('“' + man.name + '” solo da enlaces', 'Este addon no trae un catálogo de películas y series: entrega los enlaces cuando reproduces. ¿Instalo el catálogo oficial de Stremio (Cinemeta) para ver las películas y series?', 'Instalar catálogo').then(function (y) { if (y) installPlugin(CINEMETA, 'Cinemeta (catálogo de Stremio)', 'stremio'); });
      });
    }).then(function () { MV.rerender(); }).catch(function (e) { MV.toast(e.message, 6000); });
  }
  MV.installPlugin = installPlugin;

  /** Pantalla de Plugins: addons instalados, repositorios guardados y agregar nuevos. */
  MV.pluginsDialog = function () {
    var ad = (S.lists || []).filter(function (l) { return l.type === 'stremio'; }), rp = repos();
    var mv = (S.lists || []).filter(function (l) { return l.type === 'mvplugin'; });
    MV.modal('<h2>Plugins</h2><p>Pega un <b>plugin de MiVibra</b> (<code>usuario/repositorio</code> de GitHub), un <b>addon de Stremio</b> (enlace que termina en manifest.json) o un <b>repositorio</b> con varios plugins para instalar desde un menú. Solo agrega fuentes legales o que te pertenezcan.</p>' +
      '<label class="field">Plugin, addon o repositorio<input class="in f" id="plUrl" placeholder="usuario/repositorio  ó  https://…/manifest.json" autocomplete="off" inputmode="url" data-autofocus></label>' +
      (mv.length ? '<h3 style="margin:14px 0 6px">Plugins de MiVibra</h3>' + mv.map(function (l) { return '<div class="line"><div class="t"><b>' + esc(l.name) + '</b><span>' + esc(l.ref || '') + ' · ' + (l.count || 0) + ' elementos' + (l.error ? ' · ' + esc(l.error) : '') + '</span></div></div>'; }).join('') : '') +
      '<div class="btns"><button class="btn f" data-act="plAdd">Agregar</button><button class="btn ghost f" data-act="plCinemeta">Catálogo oficial de Stremio</button></div>' +
      (ad.length ? '<h3 style="margin:14px 0 6px">Addons instalados</h3>' + ad.map(function (l) { return '<div class="line"><div class="t"><b>' + esc(l.name) + '</b><span>' + (l.count ? l.count + ' títulos' : l.man && res(l.man, 'subtitles') && !res(l.man, 'stream') ? 'Da subtítulos: aparecen en Audio y subtítulos del reproductor' : 'Solo da enlaces para ver: necesita un addon con catálogo (por ejemplo Cinemeta)') + (l.error ? ' · ' + esc(l.error) : '') + '</span></div></div>'; }).join('') : '') +
      (rp.length ? '<h3 style="margin:14px 0 6px">Repositorios</h3>' + rp.map(function (r, i) { return '<div class="line"><div class="t"><b>' + esc(r.name) + '</b><span>' + esc(r.url) + '</span></div><button class="btn sm f" data-act="repoOpen" data-arg="' + i + '">Abrir</button><button class="iconbtn f" data-act="repoDel" data-arg="' + i + '" aria-label="Quitar">✕</button></div>'; }).join('') : '') +
      '<div class="btns"><button class="btn ghost f" data-act="confirmNo">Cerrar</button></div>');
  };
  MV.ACT.plCinemeta = function () { MV.closeModal(true); installPlugin(CINEMETA, 'Cinemeta (catálogo de Stremio)', 'stremio'); };
  MV.ACT.plAdd = function () {
    var u = (document.getElementById('plUrl') || {}).value || ''; u = u.trim();
    // Plugins de MiVibra: "usuario/repositorio" de GitHub o enlace a mivibra-plugin.json / mivibra-repo.json
    if (MV.isMvPluginRef && MV.isMvPluginRef(u)) { MV.closeModal(true); MV.installMvPlugin(u); return; }
    if (!/^(https?|stremio):\/\//i.test(u)) { MV.toast('Pega usuario/repositorio de GitHub o un enlace que empiece por https://'); return; }
    if (/manifest\.json(\?|$)/i.test(u) || /^stremio:/i.test(u)) { MV.closeModal(true); installPlugin(u, '', 'stremio'); return; }
    MV.toast('Leyendo…');
    // Primero como addon (algunos no terminan en manifest.json); si no, como repositorio
    MV.stremioManifest(u).then(function () { MV.closeModal(true); installPlugin(u, '', 'stremio'); }).catch(function () {
      return MV.repoLoad(u).then(function (repo) {
        var r = repos().filter(function (x) { return x.url !== u; }); r.unshift({ name: repo.name, url: u }); MV.save('repos', r.slice(0, 20));
        MV.closeModal(true); MV.repoMenu(repo);
      });
    }).catch(function (e) { MV.toast(e.message, 6000); });
  };
  MV.ACT.repoOpen = function (i) { var r = repos()[+i]; if (!r) return; MV.closeModal(true); MV.toast('Abriendo repositorio…'); MV.repoLoad(r.url).then(MV.repoMenu).catch(function (e) { MV.toast(e.message, 6000); }); };
  MV.ACT.repoDel = function (i) { var r = repos(); r.splice(+i, 1); MV.save('repos', r); MV.closeModal(true); MV.pluginsDialog(); };
})();

/* ---------------- Plugins de MiVibra ----------------
 * Un plugin es un repositorio de GitHub (usuario/repositorio) o un enlace a un archivo mivibra-plugin.json.
 * No ejecuta código: solo describe contenido, así que es seguro instalarlo. Formato en docs/PLUGINS.md. */
(function () {
  'use strict';
  var S = MV.S, esc = MV.esc;
  var GH = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)((?:\/[A-Za-z0-9_.-]+)*)$/;   // usuario/repo o usuario/repo/carpeta
  var TYPES = { movie: 'movie', pelicula: 'movie', 'película': 'movie', series: 'series', serie: 'series', live: 'live', canal: 'live', video: 'video' };

  /** "usuario/repo" o enlace de GitHub → posibles direcciones del archivo del plugin. */
  function candidates(ref) {
    ref = String(ref || '').trim().replace(/\/+$/, '');
    var m = GH.exec(ref), sub = '';
    if (m) sub = m[3] || '';
    else { m = /^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)(?:\/tree\/[^/]+((?:\/[^/#?]+)*))?/i.exec(ref); if (m) sub = m[3] || ''; }
    if (m) {
      var u = m[1], r = m[2].replace(/\.git$/, ''), d = sub.replace(/\/+$/, '');
      return ['main', 'master'].reduce(function (a, br) { var b = 'https://raw.githubusercontent.com/' + u + '/' + r + '/' + br + d + '/'; return a.concat([b + 'mivibra-plugin.json', b + 'mivibra-repo.json']); }, []);
    }
    if (/^https?:\/\//i.test(ref)) return [ref];
    return [];
  }
  MV.isMvPluginRef = function (ref) { return (GH.test(String(ref || '').trim()) && !/^https?:/i.test(ref)) || /github\.com\/[^/]+\/[^/]+|mivibra-(plugin|repo)\.json/i.test(ref || ''); };

  /** Lee el plugin (o repositorio de plugins) y devuelve { kind: 'plugin'|'repo', url, data }. */
  MV.mvPluginFetch = function (ref) {
    var c = candidates(ref), chain = Promise.reject(new Error('x'));
    c.forEach(function (u) { chain = chain.catch(function () { return MV.getJSON(u).then(function (j) { if (!j || typeof j !== 'object') throw new Error('x'); return { url: u, data: j }; }); }); });
    return chain.then(function (r) {
      var d = r.data;
      if (Array.isArray(d.plugins)) return { kind: 'repo', url: r.url, data: d };
      if (d.mivibra || d.items || d.source || d.catalog) return { kind: 'plugin', url: r.url, data: d };
      throw new Error('x');
    }).catch(function () { throw new Error('Ese repositorio no es un plugin de MiVibra (no tiene mivibra-plugin.json). Los plugins de otras apps, como ZUPER TV, no son compatibles.'); });
  };

  function rel(base, u) { if (!u) return ''; if (/^https?:\/\//i.test(u)) return u; return base.replace(/[^/]*$/, '') + String(u).replace(/^\.\//, ''); }

  /** Convierte el plugin en películas, series, canales o videos de MiVibra. */
  MV.buildFromMvPlugin = function (list) {
    return MV.getJSON(list.url).then(function (p) {
      list.man = { name: p.name || list.name, version: p.version || '', logo: rel(list.url, p.logo || '') };
      var src = p.source || {}, jobs = [];
      // 1) Contenido escrito en el mismo archivo (o en otro archivo JSON del repositorio)
      var itemsJob = p.items ? Promise.resolve(p.items) : p.catalog ? MV.getJSON(rel(list.url, p.catalog)).then(function (j) { return Array.isArray(j) ? j : (j.items || []); }) : Promise.resolve([]);
      jobs.push(itemsJob.then(function (arr) { return arr.map(function (x, i) { return fromItem(x, i, list, p); }).filter(Boolean); }));
      // 2) Una lista M3U
      if (src.type === 'm3u' && src.url) jobs.push(MV.getBig(rel(list.url, src.url)).then(function (txt) { return MV.buildFromM3U(txt, list); }));
      // 3) Una colección de Internet Archive (cine y videos de dominio público)
      if (src.type === 'archive' && src.collection) jobs.push(archive(src, list));
      return Promise.all(jobs).then(function (all) { return all.reduce(function (a, b) { return a.concat(b); }, []); });
    });
  };
  function fromItem(x, i, list, p) {
    if (!x || !x.name) return null;
    var type = TYPES[String(x.type || 'movie').toLowerCase()] || 'movie';
    var year = String(x.year || '').slice(0, 4);
    var it = {
      key: (type === 'live' ? 'live:' : type === 'series' ? 'series:' : type === 'video' ? 'video:' : 'movie:') + MV.norm(x.name + (type === 'movie' && year ? ' ' + year : '')) + (type === 'video' ? ':' + list.id + i : ''),
      type: type, name: x.name + (year && type === 'movie' && !/\(\d{4}\)/.test(x.name) ? ' (' + year + ')' : ''), year: year,
      poster: rel(list.url, x.poster || ''), logo: rel(list.url, x.logo || ''), plot: x.description || x.plot || '', genre: [].concat(x.genres || x.genre || []).join(', '),
      group: (p.name || list.name) + (x.group ? ' · ' + x.group : ''), url: rel(list.url, x.url || ''), ua: x.userAgent || '', ref: x.referer || '', list: list.id
    };
    if (type === 'series') it.episodes = (x.episodes || []).map(function (e, n) { return { season: +e.season || 1, ep: +(e.episode || e.ep) || n + 1, title: e.name || e.title || ('Episodio ' + (n + 1)), url: rel(list.url, e.url || ''), img: rel(list.url, e.thumbnail || e.image || ''), plot: e.description || '' }; }).filter(function (e) { return e.url; });
    // Película de Internet Archive por su identificador (MiVibra busca el archivo de video al reproducir)
    if (x.archive) { it.ia = String(x.archive); it.key = 'ia:' + it.ia; if (!it.poster) it.poster = 'https://archive.org/services/img/' + it.ia; }
    if (type !== 'series' && !it.url && !it.ia) return null;
    return it;
  }
  function archive(src, list) {
    var q = 'collection:(' + src.collection + ') AND mediatype:(movies)';
    return MV.getJSON('https://archive.org/advancedsearch.php?q=' + encodeURIComponent(q) + '&fl[]=identifier&fl[]=title&fl[]=year&fl[]=description&rows=' + Math.min(+src.limit || 200, 500) + '&sort[]=downloads+desc&output=json').then(function (j) {
      return ((j.response && j.response.docs) || []).map(function (d) {
        var desc = Array.isArray(d.description) ? d.description[0] : (d.description || '');
        return { key: 'ia:' + d.identifier, type: 'movie', ia: d.identifier, name: d.title, year: d.year || '', group: (list.name || 'Internet Archive') + (src.group ? ' · ' + src.group : ''), poster: 'https://archive.org/services/img/' + d.identifier, plot: String(desc).replace(/<[^>]+>/g, '').slice(0, 600), list: list.id, url: '' };
      });
    });
  }

  /** Instala un plugin (o abre el menú si es un repositorio de varios). */
  MV.installMvPlugin = function (ref) {
    MV.toast('Leyendo el plugin…');
    return MV.mvPluginFetch(ref).then(function (r) {
      if (r.kind === 'repo') {
        var d = r.data;
        var repo = { name: d.name || 'Repositorio', url: r.url, items: d.plugins.map(function (x) { var link = typeof x === 'string' ? x : (x.repo || x.url || ''); return { name: (x && x.name) || link, desc: (x && x.description) || '', link: link, kind: 'mvplugin' }; }).filter(function (x) { return x.link; }) };
        var rp = MV.load('repos', []).filter(function (x) { return x.url !== r.url; }); rp.unshift({ name: repo.name, url: r.url }); MV.save('repos', rp.slice(0, 20));
        MV.repoMenu(repo);
        return;
      }
      var p = r.data;
      return MV.confirm('Instalar “' + (p.name || 'Plugin') + '”', (p.description || '') + (p.author ? '\nAutor: ' + p.author : '') + (p.version ? ' · versión ' + p.version : ''), 'Instalar').then(function (y) {
        if (!y) return;
        return MV.addList({ type: 'mvplugin', name: p.name || 'Plugin', url: r.url, ref: String(ref).trim() }).then(function () { MV.rerender(); });
      });
    }).catch(function (e) { MV.toast(e.message, 6000); });
  };
})();
