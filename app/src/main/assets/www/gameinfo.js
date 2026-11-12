/* MiVibra TV — Ficha de cada juego (scraping).
   · Imágenes: base pública de libretro (carátula, pantalla de título y captura del juego).
   · Datos: Wikipedia (resumen en español, o inglés si no hay) + Wikidata (año, género, desarrollador, editor, modos).
   Todo se guarda en el TV para no volver a buscarlo. */
(function () {
  'use strict';
  var MV = window.MV = window.MV || {};
  var esc = function (s) { return MV.esc ? MV.esc(s) : String(s == null ? '' : s); };
  var KEY = 'gameMeta';
  var cache = null;
  function all() { if (!cache) cache = MV.load(KEY, {}) || {}; return cache; }
  var saveT = null;
  function persist() { clearTimeout(saveT); saveT = setTimeout(function () { MV.save(KEY, all()); }, 800); }

  function title(r) {
    var nt = MV.romTitle && MV.romTitle(r); if (nt) return nt;
    return (MV.cleanRomName && MV.cleanRomName(r.name)) || String(r.name || '').replace(/\.[^.]+$/, '').replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '').replace(/_/g, ' ').trim() || r.name;
  }
  MV.gameTitle = title;

  // ---------- Imágenes de libretro ----------
  function shot(r, s, kind) {
    if (!s || !s.thumbs) return '';
    var n = (MV.coverName && MV.coverName(r)) || String(r.name || '').replace(/\.[^.]+$/, '');
    n = n.replace(/[&*\/:`<>?\\|"]/g, '_');
    return 'https://thumbnails.libretro.com/' + encodeURIComponent(s.thumbs) + '/' + kind + '/' + encodeURIComponent(n) + '.png';
  }
  MV.gameShots = function (r, s) {
    return { box: shot(r, s, 'Named_Boxarts'), title: shot(r, s, 'Named_Titles'), snap: shot(r, s, 'Named_Snaps') };
  };

  // ---------- Wikipedia + Wikidata ----------
  function getJSON(url) {
    return fetch(url, { headers: { 'Accept': 'application/json' } }).then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); });
  }
  function wikiSearch(lang, q) {
    return getJSON('https://' + lang + '.wikipedia.org/w/api.php?action=query&list=search&srlimit=5&format=json&origin=*&srsearch=' + encodeURIComponent(q))
      .then(function (j) { return ((j.query || {}).search || []).map(function (x) { return x.title; }); });
  }
  function summary(lang, t) {
    return getJSON('https://' + lang + '.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(t.replace(/ /g, '_')));
  }
  var GAME_TYPES = ['Q7889', 'Q4393107', 'Q21125433', 'Q865493'];   // videojuego, juego de rol, juego de mesa digital, versión
  function entity(id) {
    return getJSON('https://www.wikidata.org/w/api.php?action=wbgetentities&props=claims&format=json&origin=*&ids=' + id)
      .then(function (j) { return (j.entities || {})[id] || null; });
  }
  function labels(ids) {
    if (!ids.length) return Promise.resolve({});
    return getJSON('https://www.wikidata.org/w/api.php?action=wbgetentities&props=labels&languages=es|en&format=json&origin=*&ids=' + ids.slice(0, 40).join('|'))
      .then(function (j) {
        var out = {};
        Object.keys(j.entities || {}).forEach(function (k) { var l = j.entities[k].labels || {}; out[k] = (l.es || l.en || {}).value || ''; });
        return out;
      });
  }
  function claimIds(e, p) {
    return ((e.claims || {})[p] || []).map(function (c) { var v = ((c.mainsnak || {}).datavalue || {}).value; return v && v.id; }).filter(Boolean);
  }
  function claimYear(e) {
    var c = ((e.claims || {}).P577 || [])[0], v = c && ((c.mainsnak || {}).datavalue || {}).value;
    var m = v && /([+-]\d{4})/.exec(v.time || ''); return m ? String(+m[1]) : '';
  }

  // Busca la página del juego: primero en español, luego en inglés
  function findPage(r, s) {
    var t = title(r), sysName = s ? s.name : '';
    var tries = [['es', t + ' videojuego ' + sysName], ['es', t], ['en', t + ' video game ' + sysName], ['en', t + ' video game']];
    // Se parece si comparte la mayoría de las palabras (CTR - Crash Team Racing ≈ Crash Team Racing)
    var words = function (x) { return String(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\(.*?\)/g, ' ').split(/[^a-z0-9]+/).filter(function (w) { return (w.length > 1 || /^\d$/.test(w)) && ['the', 'el', 'la', 'los', 'de', 'and', 'of', 'videojuego', 'video', 'game'].indexOf(w) < 0; }); };
    var mine = words(t);
    var like = function (x) {
      var w = words(x); if (!w.length || !mine.length) return false;
      var common = w.filter(function (a) { return mine.indexOf(a) >= 0; }).length;
      // los números (Mario Bros. 3, FIFA 98) tienen que coincidir
      var nums = function (a) { return a.filter(function (z) { return /^\d+$/.test(z); }).join(','); };
      if (nums(w) !== nums(mine)) return false;
      return common / w.length >= 0.75 && common / mine.length > 0.6;
    };
    function next(i) {
      if (i >= tries.length) return Promise.resolve(null);
      return wikiSearch(tries[i][0], tries[i][1]).then(function (titles) {
        // la primera cuyo título se parezca al nombre del juego
        var hit = titles.find(like);
        if (!hit) return next(i + 1);
        return summary(tries[i][0], hit).then(function (sm) {
          if (!sm || sm.type === 'disambiguation') return next(i + 1);
          return { lang: tries[i][0], sm: sm };
        });
      }).catch(function () { return next(i + 1); });
    }
    return next(0);
  }

  var WIDE = { onOpen: function (d) { d.style.width = '90vw'; d.style.maxWidth = '1100px'; } };
  MV.gameMetaForget = function (path) { var m = all()[path]; if (m && (m.none || m.unsure)) { delete all()[path]; persist(); } };
  MV.gameMeta = function (r) { return all()[r.path] || null; };

  /** Busca y guarda la ficha de un juego. Devuelve la ficha (o {none:true} si no se encontró). */
  MV.scrapeGame = function (r, s, force) {
    var have = all()[r.path];
    if (have && !force) return Promise.resolve(have);
    return findPage(r, s).then(function (p) {
      if (!p) { all()[r.path] = { none: true, at: Date.now() }; persist(); return all()[r.path]; }
      var meta = { name: p.sm.title, desc: p.sm.extract || '', lang: p.lang, url: ((p.sm.content_urls || {}).desktop || {}).page || '', img: (p.sm.thumbnail || {}).source || '', at: Date.now() };
      var q = p.sm.wikibase_item;
      if (!q) { all()[r.path] = meta; persist(); return meta; }
      return entity(q).then(function (e) {
        if (!e) return meta;
        var types = claimIds(e, 'P31');
        if (types.length && !types.some(function (t) { return GAME_TYPES.indexOf(t) >= 0; })) { meta.unsure = true; }
        meta.year = claimYear(e);
        var g = claimIds(e, 'P136').slice(0, 3), d = claimIds(e, 'P178').slice(0, 2), pb = claimIds(e, 'P123').slice(0, 2), md = claimIds(e, 'P404').slice(0, 3);
        return labels(g.concat(d, pb, md)).then(function (L) {
          var f = function (ids) { return ids.map(function (i) { return L[i]; }).filter(Boolean).join(', '); };
          meta.genre = f(g); meta.dev = f(d); meta.pub = f(pb); meta.modes = f(md);
          return meta;
        });
      }).catch(function () { return meta; }).then(function (m) { all()[r.path] = m; persist(); return m; });
    }).catch(function () { return { none: true, offline: true }; });
  };

  /** Busca la ficha de todos los juegos (uno por uno). onProgress(hechos, total) */
  MV.scrapeAll = function (list, sysOf, onProgress, force) {
    var i = 0, found = 0, stop = false;
    var todo = list.filter(function (r) { return force || !all()[r.path]; });
    function step() {
      if (stop || i >= todo.length) return Promise.resolve({ total: todo.length, found: found });
      var r = todo[i++];
      return MV.scrapeGame(r, sysOf(r), force).then(function (m) { if (m && !m.none) found++; onProgress && onProgress(i, todo.length, r); return step(); });
    }
    var p = step(); p.cancel = function () { stop = true; }; return p;
  };

  /** Línea corta: 1998 · Carreras · Naughty Dog */
  MV.gameMetaLine = function (m) {
    if (!m || m.none) return '';
    return [m.year, m.genre && m.genre.split(', ')[0], m.dev && m.dev.split(', ')[0]].filter(Boolean).join(' · ');
  };

  /** Ficha completa en un diálogo */
  MV.gameInfo = function (r, s) {
    var sh = MV.gameShots(r, s);
    function body(m) {
      var rows = m && !m.none ? [['Año', m.year], ['Género', m.genre], ['Desarrollador', m.dev], ['Editor', m.pub], ['Modos', m.modes]].filter(function (x) { return x[1]; }) : [];
      var imgs = [sh.title, sh.snap].filter(Boolean).map(function (u) { return '<img src="' + esc(u) + '" alt="" onerror="this.remove()" style="height:150px;border-radius:10px;background:#151311;image-rendering:pixelated">'; }).join('');
      return '<div style="display:flex;gap:22px;align-items:flex-start">' +
        (sh.box ? '<img src="' + esc(sh.box) + '" alt="" onerror="this.style.display=\'none\'" style="width:190px;border-radius:10px;flex:none">' : '') +
        '<div style="flex:1;min-width:0"><h2 style="margin-top:0">' + esc(title(r)) + '</h2><p class="muted" style="margin:-6px 0 10px">' + esc(s ? s.name : '') + '</p>' +
        (rows.length ? '<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 16px;margin-bottom:12px">' + rows.map(function (x) { return '<b>' + x[0] + '</b><span>' + esc(x[1]) + '</span>'; }).join('') + '</div>' : '') +
        (m && m.desc ? '<p style="line-height:1.55;max-height:9.5em;overflow:auto">' + esc(m.desc) + '</p><p class="muted" style="font-size:12px">Fuente: Wikipedia' + (m.lang === 'en' ? ' (en inglés)' : '') + (m.unsure ? ' · puede no ser el juego exacto' : '') + '</p>' :
          '<p class="muted">' + (m && m.offline ? 'Sin conexión para buscar la información.' : m && m.none ? 'No se encontró información de este juego.' : 'Buscando información…') + '</p>') +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0">' + imgs + '</div>' +
        '<div class="btns"><button class="btn f" data-act="infoPlay" data-autofocus>Jugar</button><button class="btn ghost f" data-act="infoTrailer">Ver video</button>' +
        (m && !m.offline ? '<button class="btn ghost f" data-act="infoRefresh">Volver a buscar</button>' : '') + '</div></div></div>';
    }
    MV._infoRom = r; MV._infoSys = s;
    var m = MV.gameMeta(r);
    MV.modal(body(m), WIDE);
    if (!m || (m.offline)) MV.scrapeGame(r, s, !!m).then(function (mm) { if (MV._infoRom === r && MV.modalOpen()) { MV.closeModal(true); MV.modal(body(mm), WIDE); } });
  };
  if (MV.ACT) {
    MV.ACT.infoPlay = function () { MV.closeModal(true); MV.playRom(MV._infoRom); };
    MV.ACT.infoTrailer = function () {
      var r = MV._infoRom, s = MV._infoSys, q = title(r) + ' ' + (s ? s.name : '') + ' gameplay';
      var A = window.Android;
      if (A && A.openExternal) A.openExternal('https://www.youtube.com/results?search_query=' + encodeURIComponent(q));
      else window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(q));
    };
    MV.ACT.infoRefresh = function () { var r = MV._infoRom, s = MV._infoSys; delete all()[r.path]; persist(); MV.closeModal(true); MV.gameInfo(r, s); };
  }
})();

/* SteamGridDB (opcional, con la clave en Ajustes › Sinopsis y carátulas): fondos grandes y el logo de cada juego para la sección Juegos. */
(function () {
  var MV = window.MV; if (!MV) return;
  var API = 'https://www.steamgriddb.com/api/v2', mem = null, busy = {};
  function P() { return (window.MV && MV.prefs) || (MV.S && MV.S.prefs) || {}; }
  function key() { try { return (MV.load('prefs', {}) || {}).sgdbKey || ''; } catch (e) { return ''; } }
  function store() { if (!mem) mem = MV.load('sgdbArt', {}) || {}; return mem; }
  function name(r) {
    var t = (MV.romTitle && MV.romTitle(r)) || (MV.cleanRomName && MV.cleanRomName(r.name)) || String(r.name || '').replace(/\.[^.]+$/, '');
    return t.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '').replace(/_/g, ' ').trim();
  }
  function ck(r, s) { return (s ? s.id : '?') + '|' + name(r).toLowerCase(); }
  function get(path) {
    return MV.getText(API + path, { Authorization: 'Bearer ' + key() }).then(function (t) { var j = JSON.parse(t); if (!j.success) throw new Error('sgdb'); return j.data || []; });
  }
  MV.gameArtCached = function (r, s) { var c = store()[ck(r, s)]; return c && !c.none ? c : null; };
  MV.gameArt = function (r, s) {
    if (!key()) return Promise.resolve(null);
    var k = ck(r, s), c = store()[k];
    if (c && (c.none ? Date.now() - c.ts < 7 * 864e5 : true)) return Promise.resolve(c.none ? null : c);
    if (busy[k]) return busy[k];
    var q = name(r);
    busy[k] = get('/search/autocomplete/' + encodeURIComponent(q)).then(function (list) {
      var g = list[0]; if (!g) throw new Error('none');
      return Promise.all([
        get('/heroes/game/' + g.id + '?types=static&nsfw=false&humor=false').catch(function () { return []; }),
        get('/logos/game/' + g.id + '?types=static&nsfw=false&humor=false').catch(function () { return []; })
      ]).then(function (x) {
        var heroes = x[0].slice(0, 6).map(function (h) { return h.url; }).filter(Boolean);
        var logo = (x[1][0] || {}).url || '';
        return { id: g.id, heroes: heroes, logo: logo, ts: Date.now(), none: !heroes.length && !logo };
      });
    }).catch(function () { return { none: true, ts: Date.now() }; }).then(function (v) {
      var st = store(); st[k] = v; var ks = Object.keys(st); if (ks.length > 3000) delete st[ks[0]];
      MV.save('sgdbArt', st); delete busy[k];
      return v.none ? null : v;
    });
    return busy[k];
  };
})();
