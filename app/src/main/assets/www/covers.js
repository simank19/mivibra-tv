/* MiVibra TV — Carátulas y nombres automáticos para los juegos.
   · Busca la carátula en la base pública de libretro aunque el archivo tenga otro nombre
     ("b-ts3u.iso", "Toy_Story_3_USA_PSP-BAHAMUT"): compara palabras con la lista de carátulas de la consola.
   · Si el nombre del archivo es feo, el juego se muestra con su nombre real ("Toy Story 3").
   · También se puede renombrar a mano (solo el nombre que se ve; el archivo no se toca, así no se rompen los arcade). */
(function () {
  'use strict';
  var MV = window.MV = window.MV || {};
  var A = window.Android || null;
  var MAP_KEY = 'coverMap', NAME_KEY = 'romNames';
  var map = null, names = null;
  function M() { if (!map) map = MV.load(MAP_KEY, {}) || {}; return map; }
  function N() { if (!names) names = MV.load(NAME_KEY, {}) || {}; return names; }
  var saveT = null;
  function persist() { clearTimeout(saveT); saveT = setTimeout(function () { MV.save(MAP_KEY, M()); MV.save(NAME_KEY, N()); }, 800); }

  /** Nombre que eligió el usuario o que se encontró automáticamente */
  MV.romCustomName = function (r) { return N()[r.path] || null; };
  MV.setRomName = function (r, name) { if (name) N()[r.path] = name; else delete N()[r.path]; persist(); };
  /** Nombre del archivo de carátula (sin .png) encontrado para este juego */
  MV.coverName = function (r) { var c = M()[r.path]; return c && c.n ? c.n : null; };

  // ---------- Lista de carátulas de cada consola (se baja una vez por sesión) ----------
  var lists = {};
  function thumbList(s) {
    if (!s || !s.thumbs) return Promise.resolve([]);
    if (lists[s.thumbs]) return lists[s.thumbs];
    var url = 'https://thumbnails.libretro.com/' + encodeURIComponent(s.thumbs) + '/Named_Boxarts/';
    lists[s.thumbs] = (A && A.httpGet ? MV.call('httpGet', [url, null, 'text']).then(function (r) { return r.text || ''; })
      : fetch(url).then(function (r) { return r.text(); }))
      .then(function (html) {
        var out = [], re = /href="([^"?]+)\.png"/g, m;
        while ((m = re.exec(html))) { try { out.push(decodeURIComponent(m[1])); } catch (e) {} }
        return out;
      }).catch(function () { delete lists[s.thumbs]; return []; });
    return lists[s.thumbs];
  }

  // ---------- Comparar nombres ----------
  var STOP = ['the', 'of', 'and', 'el', 'la', 'los', 'las', 'de', 'del', 'a', 'an', 'usa', 'eur', 'europe', 'japan', 'jpn', 'jp', 'us', 'en', 'es', 'fr', 'de', 'it',
    'psp', 'ps1', 'psx', 'ps2', 'gba', 'gbc', 'nes', 'snes', 'n64', 'nds', 'iso', 'cso', 'bin', 'cue', 'rom', 'roms', 'disc', 'disk', 'rev', 'v1', 'v2', 'proper', 'repack'];
  // Grupos que firman las copias ("-BAHAMUT", "-PLAYASiA"): no son parte del nombre
  function clean(t) {
    return String(t || '').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/-[A-Z0-9]{4,}$/, ' ')
      .replace(/[\[(][^\])]*[\])]/g, ' ').replace(/[_.]+/g, ' ');
  }
  function words(t) {
    return clean(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ')
      .split(/[^a-z0-9]+/).filter(function (w) { return w && STOP.indexOf(w) < 0; });
  }
  var ROMAN = { '2': 'ii', '3': 'iii', '4': 'iv', '5': 'v', '6': 'vi', ii: '2', iii: '3', iv: '4', v: '5', vi: '6' };
  function same(a, b) { return a === b || ROMAN[a] === b; }
  function score(mine, cand) {
    var w = words(cand); if (!w.length) return 0;
    var hit = mine.filter(function (x) { return w.some(function (y) { return same(x, y); }); }).length;
    // los números (Toy Story 3, FIFA 98) tienen que coincidir
    var num = function (arr) { return arr.filter(function (z) { return /^\d+$/.test(z) || /^(ii|iii|iv|v|vi)$/.test(z); }).map(function (z) { return /^\d+$/.test(z) ? z : ROMAN[z]; }).sort().join(','); };
    if (num(mine) !== num(w)) return 0;
    var s = hit / Math.max(w.length, mine.length);
    if (/\(USA/.test(cand)) s += 0.03; else if (/\(Europe|\(World/.test(cand)) s += 0.02;
    if (/\(Beta|\(Proto|\(Demo|\(Kiosk/.test(cand)) s -= 0.05;
    return s;
  }
  /** Nombre para mostrar a partir del archivo: "Toy_Story_3_USA_PSP-BAHAMUT.cso" → "Toy Story 3" */
  MV.cleanRomName = function (name) {
    var n = String(name || '').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/-[A-Za-z0-9]*[A-Z]{2}[A-Za-z0-9]*$/, function (g) { return /\s/.test(name) && !/[_.]/.test(name.replace(/\.[a-z0-9]{2,4}$/i, '')) && !/^-[A-Z0-9]{4,}$/.test(g) ? g : ' '; }).replace(/[\[(][^\])]*[\])]/g, ' ');
    n = (/\s/.test(n.trim()) ? n.replace(/_+/g, ' ') : n.replace(/[_.]+/g, ' ')).replace(/\s+/g, ' ').trim();
    var m = /\s(USA|EUR|EUROPE|Europe|JPN|JAP|JAPAN|Japan|PAL|NTSC|MULTI\d*|Multi\d+|PSP|PSX|PS1|PS2|NDS|GBA|UMD|ISO|CSO|RIP|PROPER|READNFO|REPACK|iNTERNAL)(\s|$)/.exec(n);
    if (m && m.index > 2) n = n.slice(0, m.index);
    return n.trim();
  };
  /** Mejor carátula para el juego, o null */
  MV.findCover = function (r, s, title) {
    return thumbList(s).then(function (list) {
      if (!list.length) return null;
      var base = String(r.name || '').replace(/\.[^.]+$/, '');
      if (list.indexOf(base) >= 0) return { n: base, s: 1 };
      var mine = words(title || base); if (!mine.length) return null;
      var best = null, bs = 0;
      for (var i = 0; i < list.length; i++) { var sc = score(mine, list[i]); if (sc > bs) { bs = sc; best = list[i]; } }
      return bs >= 0.6 ? { n: best, s: bs } : null;
    });
  };
  /** Nombre limpio para mostrar a partir del nombre de la carátula: "Toy Story 3 (USA)" → "Toy Story 3" */
  function niceName(n) { return String(n).replace(/\s*[\[(].*$/, '').replace(/, The$/i, '').trim(); }
  // ¿El nombre del archivo se ve feo? (b-ts3u, Toy_Story_3_USA_PSP-BAHAMUT, SLUS_012.34)
  function ugly(r) {
    var b = String(r.name || '').replace(/\.[^.]+$/, '');
    return /_/.test(b) || /-[A-Z0-9]{4,}$/.test(b) || !/\s/.test(b) && b.length < 12 || /^[a-z]{1,4}-[a-z0-9]{2,8}$/i.test(b) || /^S[LC][UE]S[-_]/i.test(b);
  }

  /** Busca carátula (y nombre si hace falta) de un juego. Usa también el nombre de la ficha de Wikipedia si existe. */
  MV.scrapeCover = function (r, s, force) {
    var have = M()[r.path];
    // Si antes no se encontró, se vuelve a intentar pasado un día (pudo ser un fallo de internet)
    if (have && !force && !(have.none && Date.now() - (have.at || 0) > 864e5)) return Promise.resolve(have);
    var meta = MV.gameMeta ? MV.gameMeta(r) : null;
    var tryTitle = MV.romCustomName(r) || (meta && meta.name) || (MV.gameTitle ? MV.gameTitle(r) : r.name);
    // Nombres de escena (b-ts3u): la carpeta suele tener el nombre bueno ("Toy_Story_3_USA_PSP-BAHAMUT")
    var folder = String(r.path || '').split('/').slice(-2, -1)[0] || '';
    var titles = [tryTitle]; if (ugly(r) && folder && !/^(roms|psp|psx|gba|nes|snes|_?bios|files|arcade|neogeo)$/i.test(folder)) titles.push(folder);
    function next(i) {
      if (i >= titles.length) return Promise.resolve(null);
      return MV.findCover(r, s, titles[i]).then(function (c) { return c || next(i + 1); });
    }
    return thumbList(s).then(function (tl) {
      // Sin la lista de carátulas (sin internet) no se guarda "no encontrada": se intenta otra vez después
      if (s && s.thumbs && !tl.length) return { none: true, temp: true };
      return next(0).then(done);
    });
    function done(c) {
      var rec = c ? { n: c.n, at: Date.now() } : { none: true, at: Date.now() };
      M()[r.path] = rec;
      if (c && !MV.romCustomName(r) && (ugly(r) || c.s >= 0.9)) { N()[r.path] = niceName(c.n); if (MV.gameMetaForget) MV.gameMetaForget(r.path); }
      persist();
      return rec;
    }
  };

  /** Toda la biblioteca, en segundo plano. onProgress(n, total) */
  var running = false;
  MV.scrapeCoversAll = function (list, sysOf, onProgress, force) {
    if (running && !force) return Promise.resolve(0);
    running = true;
    var todo = list.filter(function (r) { return force || !M()[r.path]; }), i = 0, found = 0;
    function step() {
      if (i >= todo.length) { running = false; return Promise.resolve(found); }
      var r = todo[i++];
      return MV.scrapeCover(r, sysOf(r), force).then(function (c) { if (c && !c.none) found++; onProgress && onProgress(i, todo.length); return step(); }, step);
    }
    return step();
  };

  // ---------- Renombrar a mano ----------
  MV.renameRom = function (r, after) {
    MV._renRom = r; MV._renAfter = after;
    var cur = MV.romCustomName(r) || (MV.gameTitle ? MV.gameTitle(r) : r.name);
    MV.modal('<h2>Renombrar juego</h2><p class="muted">Solo cambia el nombre que se ve en MiVibra; el archivo queda igual.</p>' +
      '<input class="in f" id="renIn" value="' + MV.esc(cur) + '" autocomplete="off" style="width:100%;margin:6px 0 10px">' +
      (MV.tvKbd ? MV.tvKbd('renIn', false) : '') +
      '<div class="btns"><button class="btn f" data-act="renSave">Guardar</button><button class="btn ghost f" data-act="renAuto">Nombre automático</button><button class="btn ghost f" data-act="closeModal">Cancelar</button></div>');
  };
  if (MV.ACT) {
    MV.ACT.renSave = function () {
      var v = (document.getElementById('renIn') || {}).value || '';
      var r = MV._renRom; MV.setRomName(r, v.trim()); MV.closeModal(true);
      delete M()[r.path]; persist();   // con el nombre nuevo se vuelve a buscar la carátula
      var s = MV.romSystem(r);
      MV.scrapeCover(r, s, true).then(function () { if (MV._renAfter) MV._renAfter(); });
      if (MV._renAfter) MV._renAfter();
    };
    MV.ACT.renAuto = function () {
      var r = MV._renRom; MV.setRomName(r, null); delete M()[r.path]; persist(); MV.closeModal(true);
      MV.scrapeCover(r, MV.romSystem(r), true).then(function () { MV.toast(MV.romCustomName(r) ? 'Ahora se llama: ' + MV.romCustomName(r) : 'No encontré un nombre mejor'); if (MV._renAfter) MV._renAfter(); });
    };
  }
})();
