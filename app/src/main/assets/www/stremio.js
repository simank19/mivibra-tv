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

  /** Catálogos del addon → películas y series de MiVibra (hasta 300 por catálogo). */
  MV.buildFromStremio = function (list) {
    var b = base(list.url);
    return MV.stremioManifest(list.url).then(function (man) {
      list.man = { name: man.name, resources: man.resources, types: man.types, idPrefixes: man.idPrefixes, logo: man.logo || '' };
      var cats = (man.catalogs || []).filter(function (c) {
        if (c.type !== 'movie' && c.type !== 'series') return false;
        // Catálogos que exigen búsqueda o género obligatorio no se pueden listar completos
        return !(c.extra || []).some(function (e) { return e.isRequired; }) && !(c.extraRequired || []).length;
      }).slice(0, 12);
      var out = [], seen = {};
      return Promise.all(cats.map(function (c) {
        var pages = [0, 100, 200];
        return Promise.all(pages.map(function (skip) {
          return MV.getJSON(b + '/catalog/' + c.type + '/' + encodeURIComponent(c.id) + (skip ? '/skip=' + skip : '') + '.json').then(function (j) { return (j && j.metas) || []; }).catch(function () { return []; });
        })).then(function (pp) {
          pp.forEach(function (metas) {
            metas.forEach(function (m) {
              if (!m || !m.id || seen[c.type + m.id]) return; seen[c.type + m.id] = 1;
              var year = String(m.releaseInfo || m.year || '').slice(0, 4);
              var name = m.name + (/^\d{4}$/.test(year) && !/\(\d{4}\)/.test(m.name) ? ' (' + year + ')' : '');
              out.push({
                key: (c.type === 'series' ? 'series:' : 'movie:') + MV.norm(m.name + (c.type === 'movie' && year ? ' ' + year : '')),
                type: c.type === 'series' ? 'series' : 'movie', name: name, year: /^\d{4}$/.test(year) ? year : '',
                poster: m.poster || '', plot: m.description || '', genre: (m.genres || []).join(', '), rating: m.imdbRating || '',
                group: (list.name || man.name) + ' · ' + (c.name || (c.type === 'series' ? 'Series' : 'Películas')),
                st: { id: m.id, type: c.type, list: list.id }, list: list.id, url: ''
              });
            });
          });
        });
      })).then(function () { return out; });
    });
  };

  /** Enlaces para ver: se piden a todos los addons que ofrecen "stream" para ese tipo e id. */
  MV.stremioStreams = function (type, id) {
    var ls = lists();
    var jobs = ls.filter(function (l) { var m = l.man || {}; return !m.resources || (res(m, 'stream') && resTypes(m, 'stream').indexOf(type) >= 0 && prefixOk(m, 'stream', id)); }).map(function (l) {
      return MV.getJSON(base(l.url) + '/stream/' + type + '/' + encodeURIComponent(id) + '.json').then(function (j) {
        return ((j && j.streams) || []).filter(function (s) { return s.url && /^https?:/i.test(s.url); }).map(function (s) {
          var h = (s.behaviorHints && s.behaviorHints.proxyHeaders && s.behaviorHints.proxyHeaders.request) || {};
          return { url: s.url, title: String(s.title || s.description || s.name || '').replace(/\s+/g, ' ').trim(), src: s.name || l.name || '', ua: h['User-Agent'] || h['user-agent'] || '', ref: h.Referer || h.referer || '' };
        });
      }).catch(function () { return []; });
    });
    // Primero los que se ven como video (mp4, mkv, m3u8…); al final los que pueden ser páginas web
    function score(x) { var u = x.url.toLowerCase().split('?')[0]; return /\.(mp4|mkv|m3u8|webm|avi|mov|ts|mpd)$/.test(u) ? 0 : /\/(hls|stream|video|playlist|manifest)/.test(u) ? 1 : 2; }
    return Promise.all(jobs).then(function (all) { return all.reduce(function (a, b) { return a.concat(b); }, []).sort(function (a, b) { return score(a) - score(b); }); });
  };

  /** Elige el enlace: si hay varios, se muestra la lista para escoger (calidad, idioma, fuente). */
  MV.stremioPick = function (type, id, title) {
    MV.toast('Buscando enlaces en tus addons…', 3000);
    return MV.stremioStreams(type, id).then(function (st) {
      if (!st.length) throw new Error('Ningún addon instalado tiene enlaces directos para “' + title + '”');
      // Los demás enlaces quedan de respaldo: si el elegido no es un video, el reproductor prueba el siguiente solo
      function withRest(x) { x.rest = st.filter(function (y) { return y !== x; }).map(function (y) { return y.url; }).slice(0, 8); return x; }
      if (st.length === 1) return withRest(st[0]);
      return new Promise(function (resolve, reject) {
        MV._stPick = function (i) { MV.closeModal(true); resolve(withRest(st[+i])); };
        MV.modal('<h2>Elige el enlace</h2><p class="muted">' + st.length + ' opciones de tus addons para “' + esc(title) + '”.</p><div class="stpick">' +
          st.slice(0, 40).map(function (s, i) { return '<button class="line f" data-act="stPick" data-arg="' + i + '"' + (i ? '' : ' data-autofocus') + ' style="width:100%;text-align:left"><div class="t"><b>' + esc(s.src) + '</b><span style="white-space:pre-line">' + esc(s.title.slice(0, 160)) + '</span></div></button>'; }).join('') +
          '</div><div class="btns"><button class="btn ghost f" data-act="confirmNo">Cancelar</button></div>', { onClose: function () { reject(new Error('cancelado')); } });
      });
    });
  };
  MV.ACT.stPick = function (i) { if (MV._stPick) MV._stPick(i); };

  /** Capítulos de una serie de Stremio (del addon que da la ficha o de Cinemeta). */
  MV.stremioEpisodes = function (item) {
    var st = item.st, ls = lists();
    var own = ls.filter(function (l) { return l.id === st.list; })[0];
    var srcs = (own ? [own] : []).concat(ls.filter(function (l) { return l !== own && res(l.man || {}, 'meta') && prefixOk(l.man || {}, 'meta', st.id); }));
    var urls = srcs.filter(function (l) { return !l.man || res(l.man, 'meta'); }).map(function (l) { return base(l.url); });
    if (/^tt\d+/.test(st.id)) urls.push(base(CINEMETA));
    var chain = Promise.resolve(null);
    urls.forEach(function (b) { chain = chain.then(function (m) { return m || MV.getJSON(b + '/meta/series/' + encodeURIComponent(st.id) + '.json').then(function (j) { return j && j.meta && (j.meta.videos || []).length ? j.meta : null; }).catch(function () { return null; }); }); });
    return chain.then(function (meta) {
      if (!meta) return [];
      return (meta.videos || []).filter(function (v) { return (v.season || 0) > 0 || v.episode || v.number; }).map(function (v) {
        return { season: +v.season || 1, ep: +(v.episode || v.number) || 0, title: v.title || v.name || ('Episodio ' + (v.episode || v.number)), url: '', stId: v.id, img: v.thumbnail || '', plot: v.overview || v.description || '' };
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
        var link = o.manifest || o.transportUrl || o.m3u || o.url || '';
        if (!/^(https?|stremio):\/\//i.test(link)) return;
        var kind = o.m3u || /\.m3u8?(\?|$)|get\.php\?/i.test(link) ? 'm3u' : 'stremio';
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
        return '<button class="line f" data-act="repoInstall" data-arg="' + i + '"' + (i ? '' : ' data-autofocus') + ' style="width:100%;text-align:left"' + (on ? ' disabled' : '') + '><div class="t"><b>' + esc(p.name) + (on ? ' · instalado ✓' : '') + '</b><span>' + esc((p.kind === 'm3u' ? 'Lista M3U · ' : 'Addon de Stremio · ') + (p.desc || p.link).slice(0, 140)) + '</span></div></button>';
      }).join('') + '</div><div class="btns"><button class="btn ghost f" data-act="confirmNo">Cerrar</button></div>');
  };
  MV.ACT.repoInstall = function (i) {
    var p = MV._repo && MV._repo.items[+i]; if (!p) return;
    MV.closeModal(true);
    installPlugin(p.link, p.name, p.kind);
  };
  function installPlugin(link, name, kind) {
    if (kind === 'm3u') { MV.toast('Agregando “' + name + '”…'); return MV.addList({ type: 'url', name: name, url: link }).then(function () { MV.rerender(); }).catch(function (e) { MV.toast(e.message, 6000); }); }
    MV.toast('Instalando “' + name + '”…');
    return MV.stremioManifest(link).then(function (man) {
      return MV.addList({ type: 'stremio', name: name && !/^[\w.-]+\.\w+$/.test(name) ? name : man.name, url: manifestUrl(link) });
    }).then(function () { MV.rerender(); }).catch(function (e) { MV.toast(e.message, 6000); });
  }
  MV.installPlugin = installPlugin;

  /** Pantalla de Plugins: addons instalados, repositorios guardados y agregar nuevos. */
  MV.pluginsDialog = function () {
    var ad = (S.lists || []).filter(function (l) { return l.type === 'stremio'; }), rp = repos();
    MV.modal('<h2>Plugins</h2><p>Agrega <b>addons de Stremio</b> (enlace que termina en manifest.json) o <b>repositorios</b> con varios plugins para instalar desde un menú, como en Kodi. Solo agrega fuentes legales o que te pertenezcan.</p>' +
      '<label class="field">Enlace del addon o del repositorio<input class="in f" id="plUrl" placeholder="https://…/manifest.json  ó  https://…/repo.json" autocomplete="off" inputmode="url" data-autofocus></label>' +
      '<div class="btns"><button class="btn f" data-act="plAdd">Agregar</button><button class="btn ghost f" data-act="plCinemeta">Catálogo oficial de Stremio</button></div>' +
      (ad.length ? '<h3 style="margin:14px 0 6px">Addons instalados</h3>' + ad.map(function (l) { return '<div class="line"><div class="t"><b>' + esc(l.name) + '</b><span>' + (l.count || 0) + ' títulos' + (l.error ? ' · ' + esc(l.error) : '') + '</span></div></div>'; }).join('') : '') +
      (rp.length ? '<h3 style="margin:14px 0 6px">Repositorios</h3>' + rp.map(function (r, i) { return '<div class="line"><div class="t"><b>' + esc(r.name) + '</b><span>' + esc(r.url) + '</span></div><button class="btn sm f" data-act="repoOpen" data-arg="' + i + '">Abrir</button><button class="iconbtn f" data-act="repoDel" data-arg="' + i + '" aria-label="Quitar">✕</button></div>'; }).join('') : '') +
      '<div class="btns"><button class="btn ghost f" data-act="confirmNo">Cerrar</button></div>');
  };
  MV.ACT.plCinemeta = function () { MV.closeModal(true); installPlugin(CINEMETA, 'Cinemeta (catálogo de Stremio)', 'stremio'); };
  MV.ACT.plAdd = function () {
    var u = (document.getElementById('plUrl') || {}).value || ''; u = u.trim();
    if (!/^(https?|stremio):\/\//i.test(u)) { MV.toast('Pega un enlace que empiece por https://'); return; }
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
