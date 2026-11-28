/* MiVibra TV · Librería: libros, mangas, cómics y revistas que publica el superadministrador para todos.
   Se guardan en la configuración de la cuenta (app/config.librosExtra), cada uno con su enlace (Google Drive, MEGA,
   MediaFire, Dropbox o directo), portada y descripción. Cada usuario los lee al momento o los guarda en su Lectura. */
(function () {
  'use strict';
  var MV = window.MV;
  if (!MV || !MV.VIEWS) return;
  var esc = MV.esc || function (s) { return String(s); };
  var KIND = { libro: 'Libro', manga: 'Manga', comic: 'Cómic', revista: 'Revista' };
  var cat = 'Todas', F = null;

  function isAdmin() { return !!(MV.acct && MV.acct.isAdmin && MV.acct.isAdmin()); }
  function raw() { var c = MV.acct && MV.acct.config; if (c && c.librosExtra) { MV.save('librosExtra', c.librosExtra); return c.librosExtra; } return MV.load('librosExtra', []) || []; }
  function byId(id) { return raw().filter(function (b) { return b.id === id; })[0]; }
  function saved() { return MV.load('libreriaSaved', {}) || {}; }
  function img(p) {
    p = p || ''; var m = p.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=download&)?id=)([\w-]{10,})/);
    if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w800';
    if (/dropbox\.com\//.test(p)) return p.replace(/[?&](dl|raw)=\d/, '') + (p.indexOf('?') < 0 ? '?' : '&') + 'raw=1';
    return p;
  }
  function item(b) { return { key: 'lib:' + b.id, name: b.nombre, url: b.entry ? '' : b.url, entry: b.entry || undefined, packUrl: b.entry ? b.url : undefined, kind: b.tipo || 'libro', type: 'book', group: 'Librería MiVibra', poster: img(b.portada), author: b.autor || '', fromStore: 1 }; }
  /** Los que el usuario guardó: aparecen en Lectura como cualquier otro libro. */
  MV.libreriaSaved = function () { var s = saved(); return raw().filter(function (b) { return s[b.id]; }).map(item); };

  function cover(b) {
    return '<div class="lb-cover">' + (b.portada ? '<img src="' + esc(img(b.portada)) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + '<b>' + esc(b.nombre) + '</b>' + (saved()[b.id] ? '<em class="td-tag ok">En tu Lectura</em>' : (b.fecha && Date.now() - Date.parse(b.fecha) < 21 * 864e5 ? '<em class="td-tag nw">Nuevo</em>' : '')) + '</div>';
  }
  MV.VIEWS.libreria = function () {
    var all = raw(), cats = ['Todas'].concat(all.map(function (b) { return b.categoria; }).filter(function (c, i, a) { return c && a.indexOf(c) === i; }));
    if (cats.indexOf(cat) < 0) cat = 'Todas';
    var list = all.filter(function (b) { return cat === 'Todas' || b.categoria === cat; });
    return MV.topHtml('Librería', (isAdmin() ? '<button class="btn f sm" data-act="lbFolder" style="margin:0 8px 0 0">Publicar carpeta</button><button class="btn ghost f sm" data-act="lbNew" style="margin:0 12px 0 0">Publicar libro</button>' : '') + '<span class="muted">Libros gratis para leer en MiVibra</span>') +
      (cats.length > 2 ? '<div class="chips" style="margin-bottom:16px">' + cats.map(function (c) { return '<button class="chip f' + (cat === c ? ' on' : '') + '" data-act="lbCat" data-arg="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div>' : '') +
      (list.length ? '<div class="lb-grid">' + list.map(function (b) { return '<div class="lb-wrap"><button class="lb-card f" data-act="lbOpen" data-arg="' + esc(b.id) + '">' + cover(b) + '<span>' + esc(b.autor || KIND[b.tipo] || '') + '</span></button>' + (isAdmin() ? '<button class="td-del lb-del f" data-act="lbRemove" data-arg="' + esc(b.id) + '" aria-label="Eliminar de la Librería">✕</button>' : '') + '</div>'; }).join('') + '</div>'
        : '<p class="muted">' + (isAdmin() ? 'Todavía no hay libros. Toca «Publicar libro» para agregar el primero: lo verán todos tus usuarios.' : 'Pronto habrá libros aquí.') + '</p>');
  };

  function detail(b) {
    var s = saved()[b.id];
    MV.modal('<div class="td-det lb-det"><div>' + cover(b) + '</div><div class="td-det-txt"><h2>' + esc(b.nombre) + '</h2>' + (b.autor ? '<p style="margin:0">' + esc(b.autor) + '</p>' : '') +
      '<p class="muted">' + esc(b.descripcion || '') + '</p>' +
      '<div class="btns"><button class="btn f" data-act="lbRead" data-arg="' + esc(b.id) + '">Leer ahora</button><button class="btn ghost f" data-act="lbSave" data-arg="' + esc(b.id) + '">' + (s ? 'Quitar de mi Lectura' : 'Guardar en mi Lectura') + '</button></div>' +
      '<div class="td-facts">' + [['Tipo', KIND[b.tipo] || 'Libro'], ['Categoría', b.categoria], ['Páginas', b.paginas], ['Idioma', b.idioma], ['Precio', 'Gratis']].filter(function (x) { return x[1]; }).map(function (x) { return '<div><span class="muted">' + x[0] + '</span><b>' + esc(x[1]) + '</b></div>'; }).join('') + '</div>' +
      (b.creditos ? '<p class="muted" style="font-size:13px;margin:0">' + esc(b.creditos) + '</p>' : '') +
      (isAdmin() ? '<div class="btns"><button class="btn ghost f" data-act="lbEdit" data-arg="' + esc(b.id) + '">Editar</button><button class="btn ghost f" data-act="lbRemove" data-arg="' + esc(b.id) + '">Quitar de la Librería</button></div>' : '') +
      '<div class="btns"><button class="btn ghost f" data-act="closeModal">Cerrar</button></div></div></div>');
  }

  // ---------- Publicar (superadministrador) ----------
  var FIELDS = [['nombre', 'Título', ''], ['autor', 'Autor', ''], ['url', 'Enlace del archivo (EPUB, PDF, CBZ, CBR…)', 'Google Drive, MEGA, MediaFire, Dropbox o enlace directo'], ['portada', 'Enlace de la portada (imagen)', 'Opcional: si no, se toma del libro'],
    ['descripcion', 'Descripción', ''], ['categoria', 'Categoría', 'Ej: Novela, Infantil, Educación'], ['paginas', 'Páginas (opcional)', ''], ['idioma', 'Idioma (opcional)', 'Español'], ['creditos', 'Créditos y licencia', 'Ej: Dominio público']];
  function readForm() { FIELDS.forEach(function (f) { var el = document.getElementById('lbf-' + f[0]); if (el) F[f[0]] = el.value.trim(); }); }
  function form(b) {
    if (b !== undefined) F = b ? JSON.parse(JSON.stringify(b)) : { tipo: 'libro', idioma: 'Español' };
    MV.modal('<h2>' + (F.id ? 'Editar libro' : 'Publicar libro en la Librería') + '</h2><p class="muted">Lo verán todos los usuarios. Comparte el archivo como público (cualquiera con el enlace).</p>' +
      '<div class="chips">' + Object.keys(KIND).map(function (k) { return '<button class="chip f' + (F.tipo === k ? ' on' : '') + '" data-act="lbKind" data-arg="' + k + '">' + KIND[k] + '</button>'; }).join('') + '</div>' +
      FIELDS.map(function (f) { var v = esc(F[f[0]] || ''); return '<label class="muted" style="display:block;margin:10px 0 4px;font-size:13px">' + f[1] + '</label>' + (f[0] === 'descripcion' ? '<textarea class="in f" id="lbf-' + f[0] + '" rows="3">' + v + '</textarea>' : '<input class="in f" id="lbf-' + f[0] + '" value="' + v + '" placeholder="' + esc(f[2]) + '">'); }).join('') +
      '<div class="btns" style="margin-top:14px"><button class="btn f" data-act="lbSaveForm">' + (F.id ? 'Guardar cambios' : 'Publicar') + '</button><button class="btn ghost f" data-act="closeModal">Cancelar</button></div>');
  }
  function publish(list, msg) {
    if (!MV.acct || !MV.acct.push) { MV.toast('Inicia sesión con la cuenta de superadministrador'); return; }
    MV.acct.push({ librosExtra: list }).then(function () { if (MV.acct.pushError) return; if (MV.acct.config) MV.acct.config.librosExtra = list; MV.save('librosExtra', list); MV.toast(msg, 3500); MV.rerender(); });
  }

  // ---------- Publicar una carpeta entera (Google Drive, MEGA o MediaFire): cada libro con su información buscada sola ----------
  function folderForm() {
    MV.modal('<h2>Publicar una carpeta</h2><p class="muted">Pega el enlace de una carpeta compartida como pública. MiVibra trae todos los libros de adentro (también de las subcarpetas) y busca solo la portada, el autor y la sinopsis de cada uno.</p>' +
      '<label class="muted" style="display:block;margin:10px 0 4px;font-size:13px">Enlace de la carpeta</label><input class="in f" id="lbfd-url" placeholder="https://drive.google.com/drive/folders/…">' +
      '<label class="muted" style="display:block;margin:10px 0 4px;font-size:13px">Categoría (opcional: si la dejas vacía se usa el nombre de cada subcarpeta)</label><input class="in f" id="lbfd-cat" placeholder="Ej: Clásicos de dominio público">' +
      '<label class="muted" style="display:block;margin:10px 0 4px;font-size:13px">Créditos y licencia</label><input class="in f" id="lbfd-cred" value="Dominio público">' +
      '<div class="chips" style="margin-top:10px">' + Object.keys(KIND).map(function (k) { return '<button class="chip f' + (k === 'libro' ? ' on' : '') + '" data-act="lbFdKind" data-arg="' + k + '">' + KIND[k] + '</button>'; }).join('') + '</div>' +
      '<p id="lbfd-msg" class="muted" style="min-height:22px;margin:12px 0 0"></p>' +
      '<div class="btns"><button class="btn f" data-act="lbFdGo" id="lbfd-go">Buscar libros y publicar</button><button class="btn ghost f" data-act="closeModal">Cancelar</button></div>');
  }
  var fdKind = 'libro', fdBusy = false;
  function folderGo() {
    if (fdBusy) return;
    var v = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; }, msg = function (t) { var e = document.getElementById('lbfd-msg'); if (e) e.textContent = t; };
    var url = v('lbfd-url'), cat = v('lbfd-cat'), cred = v('lbfd-cred');
    if (!/^https?:\/\//.test(url)) return msg('Pega el enlace de la carpeta (empieza por https://).');
    if (!MV.cloudBooks) return msg('Actualiza la app para usar esta opción.');
    fdBusy = true; var go = document.getElementById('lbfd-go'); if (go) go.disabled = true;
    msg('Leyendo la carpeta…');
    MV.cloudBooks(url).then(function (files) {
      files = (files || []).filter(function (f) { return f.url; });
      if (!files.length) throw new Error('No encontré libros en esa carpeta (¿está compartida como pública?)');
      // Los comprimidos (.zip, .rar, .7z) se abren para ver qué libros traen; cada libro se publica por separado
      var packs = files.filter(function (f) { return f.pack; }), loose = files.filter(function (f) { return !f.pack; }), pi = 0;
      function nextPack() {
        var pk = packs[pi++]; if (!pk) return Promise.resolve();
        if (!(window.Android && window.Android.bookPack)) throw new Error('Para abrir los comprimidos publica la carpeta desde la app instalada (TV, celular o PC)');
        msg('Abriendo ' + (pk.file || pk.title) + ' (' + pi + ' de ' + packs.length + ')…');
        var src = MV.bookSrc ? MV.bookSrc({ url: pk.url }) : Promise.resolve(pk.url);
        return src.then(function (u) { return MV.call('bookPack', [JSON.stringify({ url: u })], function (p) { if (p >= 0) msg('Abriendo ' + (pk.file || pk.title) + ': ' + p + '%'); }); }).then(function (d) {
          (d.entries || []).forEach(function (e) { if (/\.(pdf|epub|cbz|cbr|cb7)$/i.test(e.name)) loose.push({ url: pk.url, entry: e.name, title: String(e.name).split('/').pop(), path: (pk.path ? pk.path + ' / ' : '') + (pk.title || '') }); });
        }).catch(function (e) { msg('No pude abrir ' + (pk.file || pk.title) + ': ' + (e.message || '')); }).then(nextPack);
      }
      return nextPack().then(function () { return loose; });
    }).then(function (files) {
      if (!files.length) throw new Error('No encontré libros en esa carpeta ni dentro de sus comprimidos');
      var have = {}; raw().forEach(function (b) { have[b.url + '|' + (b.entry || '')] = 1; });
      files = files.filter(function (f) { return !have[f.url + '|' + (f.entry || '')]; });
      if (files.length > 600) { msg('Son ' + files.length + ' libros: publico los primeros 600 y luego vuelves a publicar la carpeta para el resto.'); files = files.slice(0, 600); }
      if (!files.length) throw new Error('Todos los libros de esa carpeta ya están en la Librería');
      var out = [], i = 0, done = 0, stamp = Date.now();
      var fm = MV.bookShelf && MV.bookShelf.fetchMeta;
      function one() {
        var f = files[i++]; if (!f) return Promise.resolve();
        var title = String(f.title || 'Libro').replace(/\.(pdf|epub|cbz|cbr|cb7|mobi|azw3?)$/i, '').replace(/_+/g, ' ').trim();
        var m0 = title.split(/\s+[-–—]\s+/), name = m0[0], auth = m0.length > 1 ? m0.slice(1).join(' ') : '';
        var meta = fm ? fm({ key: 'libpub:' + f.url + (f.entry || ''), name: title }).catch(function () { return {}; }) : Promise.resolve({});
        return meta.then(function (m) {
          m = m || {};
          var grp = String(f.path || '').split(' / ').pop();
          out.push({ id: 'l-' + (stamp + out.length).toString(36), tipo: fdKind, nombre: name, autor: m.a || auth, url: f.url, entry: f.entry || undefined, portada: m.c || '', descripcion: String(m.d || '').slice(0, 300),
            categoria: cat || grp || (m.g && m.g[0]) || '', paginas: '', idioma: '', creditos: cred, fecha: new Date().toISOString().slice(0, 10), at: Date.now() });
          done++; msg('Buscando información: ' + done + ' de ' + files.length + '…');
        }).then(one);
      }
      return Promise.all([one(), one(), one()]).then(function () { return out; });
    }).then(function (out) {
      var list = out.concat(raw()), size = JSON.stringify(list).length;
      if (size > 700000) throw new Error('Son demasiados libros para guardarlos juntos (' + list.length + '). Publica carpetas más pequeñas.');
      fdBusy = false; MV.closeModal(true); publish(list, out.length + (out.length === 1 ? ' libro publicado' : ' libros publicados') + ' en la Librería');
    }).catch(function (e) { fdBusy = false; if (go) go.disabled = false; msg(e.message || 'No se pudo leer la carpeta'); });
  }

  Object.assign(MV.ACT, {
    lbFolder: function () { fdKind = 'libro'; folderForm(); },
    lbFdKind: function (k, el) { fdKind = k; var p = el && el.parentNode; if (p) [].forEach.call(p.children, function (c) { c.classList.toggle('on', c === el); }); },
    lbFdGo: function () { folderGo(); },
    lbGo: function () { MV.go('libreria'); },
    lbCat: function (c) { cat = c; MV.rerender(); },
    lbOpen: function (id) { var b = byId(id); if (b) detail(b); },
    lbRead: function (id) { var b = byId(id); if (!b) return; MV.closeModal(true); if (MV.openBook) MV.openBook(item(b)); },
    lbSave: function (id) { var s = saved(); if (s[id]) delete s[id]; else s[id] = Date.now(); MV.save('libreriaSaved', s); var b = byId(id); MV.toast(s[id] ? 'Guardado en tu Lectura' : 'Se quitó de tu Lectura', 2500); if (b) { MV.closeModal(true); detail(b); } },
    lbNew: function () { form(null); },
    lbEdit: function (id) { var b = byId(id); if (b) { MV.closeModal(true); form(b); } },
    lbKind: function (k) { readForm(); F.tipo = k; MV.closeModal(true); form(); },
    lbRemove: function (id) { var b = byId(id); if (!b) return; MV.confirm('¿Eliminar «' + b.nombre + '» de la Librería?', 'Deja de aparecer para todos.', 'Eliminar').then(function (ok) { if (ok) { MV.closeModal(true); publish(raw().filter(function (x) { return x.id !== id; }), 'Se eliminó de la Librería'); } }); },
    lbSaveForm: function () {
      readForm(); var b = F;
      if (!b.nombre || !/^https?:\/\//.test(b.url || '')) return MV.toast('Escribe el título y un enlace que empiece por https://', 4000);
      var slug = String(b.nombre).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 30);
      var out = { id: b.id || ('l-' + slug + '-' + Date.now().toString(36)), tipo: b.tipo || 'libro' };
      FIELDS.forEach(function (f) { out[f[0]] = b[f[0]] || ''; });
      out.fecha = b.fecha || new Date().toISOString().slice(0, 10); out.at = Date.now();
      var list = raw().filter(function (x) { return x.id !== out.id; }); list.unshift(out);
      MV.closeModal(true); publish(list, (b.id ? 'Cambios publicados: ' : 'Publicado en la Librería: ') + out.nombre);
    }
  });
  if (MV.on) MV.on('acct', function () { if (MV.viewName && (MV.viewName() === 'libreria' || MV.viewName() === 'books') && !MV.modalOpen()) MV.rerender(); });

  var css = document.createElement('style');
  css.textContent =
    '.lb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:18px}' +
    '.lb-wrap{position:relative}.lb-del{position:absolute;right:8px;top:8px;width:34px;height:34px;border-radius:50%;border:1px solid var(--line);background:rgba(0,0,0,.55);color:#fff}' +
    '.lb-card{width:100%;display:flex;flex-direction:column;gap:8px;padding:0;border:0;background:none;color:inherit;text-align:left;cursor:pointer;font:inherit}' +
    '.lb-card>span{font-size:13px;opacity:.7;padding:0 4px}' +
    '.lb-cover{position:relative;width:100%;aspect-ratio:2/3;border-radius:14px;overflow:hidden;background:linear-gradient(160deg,var(--glass),rgba(255,255,255,.02));border:1px solid var(--line);display:flex;align-items:flex-end;padding:12px}' +
    '.lb-cover b{font-size:15px;line-height:1.2}.lb-cover img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover}' +
    '.lb-card:focus .lb-cover{outline:3px solid var(--accent);outline-offset:2px}' +
    '.lb-det{grid-template-columns:minmax(0,260px) 1fr!important}.lb-det .lb-cover{width:100%}' +
    '@media (max-width:820px){.lb-det{grid-template-columns:1fr!important}.lb-det .lb-cover{max-width:220px}}';
  document.head.appendChild(css);
})();
