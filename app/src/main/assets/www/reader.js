/* MiVibra TV — Lector de libros, mangas, cómics y revistas (PDF, EPUB, CBZ, CBR, CB7).
   Se maneja con el control (◀ ▶ pasan página, ▲ ▼ desplazan, OK muestra la barra, Atrás sale),
   con el dedo (toques a los lados y desplazamiento) o con teclado y mouse en el PC. Recuerda dónde quedaste. */
(function () {
  'use strict';
  var MV = window.MV, S = MV.S, esc = MV.esc;
  var box = null, st = null, barT = null;
  var PDFJS = 'vendor/pdfjs/';

  function $(sel) { return box && box.querySelector(sel); }
  function positions() { return MV.load('readPos', {}) || {}; }
  function savePos() {
    if (!st || !st.item) return;
    var all = positions(), p = { page: st.page || 0, chap: Math.max(0, (st.chap || 0) - (st.epub && st.epub.spine[0] === '#cover' ? 1 : 0)), y: st.yRatio || 0, mode: st.mode, total: st.total || 0, at: Date.now() };
    all[st.item.key] = p; MV.save('readPos', all);
    // "Seguir leyendo"
    var rec = (MV.load('readRecent', []) || []).filter(function (r) { return r.key !== st.item.key; });
    var it = st.item, pct = st.total ? Math.round(((st.fmt === 'epub' ? st.chap : st.page) + 1) / st.total * 100) : 0;
    rec.unshift({ key: it.key, name: it.name, poster: it.poster || '', url: it.url || '', path: it.path || '', ua: it.ua || '', ref: it.ref || '', kind: it.kind || '', pct: Math.min(100, pct), at: Date.now() });
    MV.save('readRecent', rec.slice(0, 30));
  }
  MV.readRecent = function () { return MV.load('readRecent', []) || []; };
  MV.readProgress = function (key) { return positions()[key] || null; };

  // ---------- Abrir ----------
  MV.openBook = function (item) {
    if (!item || (!item.url && !item.path)) return;
    if (!MV.native) return MV.toast('El lector está disponible en la app instalada');
    closeMb(); close(true);
    var saved = positions()[item.key] || {};
    var manga = item.kind === 'manga';
    st = { item: item, fmt: '', page: saved.page || 0, chap: saved.chap || 0, yRatio: saved.y || 0, total: 0,
      mode: saved.mode || (MV.device.tv || MV.device.desktop ? 'page' : (manga ? 'scroll' : 'page')),
      rtl: MV.load('readRtl:' + item.key, manga), fit: MV.load('readFit', 'height'), font: MV.load('readFont', 20), theme: MV.load('readTheme', 'dark') };
    box = document.createElement('div'); box.id = 'reader'; box.className = 'rd-' + st.theme;
    box.innerHTML =
      '<div class="rdbar"><button class="rdb f" data-r="close" aria-label="Cerrar">✕</button><div class="rdt"><b>' + esc(item.name) + '</b><span id="rdPage"></span></div>' +
      '<div class="rdtools"></div></div>' +
      '<div class="rdbody"><div class="rdload"><div class="spinner"></div><p id="rdMsg">Abriendo…</p></div></div>' +
      '<div class="rdhint"></div>';
    document.body.appendChild(box);
    document.documentElement.classList.add('reader-open');
    showBar();
    MV.call('openBook', [JSON.stringify({ url: item.url || '', path: item.path || '', ua: item.ua || '', ref: item.ref || '' })], function (p) {
      var m = $('#rdMsg'); if (m) m.textContent = p >= 0 ? 'Descargando… ' + p + '%' : 'Descargando…';
    }).then(function (d) {
      if (!box) return;
      st.fmt = d.fmt;
      if (d.fmt === 'comic') { st.pages = d.pages; st.total = d.pages.length; renderComic(); if (d.pages[0]) saveCover(d.pages[0]); }
      else if (d.fmt === 'pdf') loadPdf(d.url);
      else if (d.fmt === 'epub') { if (d.file) openMb(item, d.file); else loadEpub(d.base); }
    }).catch(function (e) {
      if (!box) return;
      $('.rdbody').innerHTML = '<div class="rdload"><b style="color:var(--accent)">No se pudo abrir</b><p>' + esc(e.message || '') + '</p><button class="btn f" data-r="close">Volver</button></div>';
      var b = $('.rdload .btn'); if (b) b.focus();
    });
  };

  // ---------- EPUB con el lector de MiBiblioteca (hoja que se dobla, papel, separadores, notas y voz) ----------
  var mb = null, mbItem = null;
  function openMb(item, file) {
    mbItem = item;
    var fr = document.createElement('iframe');
    fr.id = 'mbr'; fr.src = 'mbreader/index.html'; fr.setAttribute('allow', 'autoplay; fullscreen');
    fr.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:61;background:#0A0908';
    document.body.appendChild(fr); mb = fr;
    var book = { id: item.key, t: item.name, a: item.author || '', cover: item.poster || (MV.bookCover ? MV.bookCover(item.key) : '') || '', file: file, src: 'r' };
    MV._mbOpen = function () { try { fr.contentWindow.postMessage({ mbr: 1, type: 'open', book: book }, '*'); fr.focus(); fr.contentWindow.focus(); } catch (e) {} };
    rememberRecent(item, null);
  }
  /** Mi biblioteca (MiBiblioteca completa): sección privada, solo para el administrador. */
  MV.openLibrary = function () {
    if (!MV.acct || !MV.acct.isAdmin || !MV.acct.isAdmin()) { MV.toast('Esta sección es privada'); return; }
    closeMb(); close(true);
    var fr = document.createElement('iframe');
    fr.id = 'mbr'; fr.src = 'mibiblioteca/index.html'; fr.setAttribute('allow', 'autoplay; fullscreen; clipboard-write');
    fr.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:61;background:#f6f4ef';
    fr.onload = function () { try { fr.focus(); fr.contentWindow.focus(); } catch (e) {} };
    document.body.appendChild(fr); mb = fr; mbItem = null;
    document.documentElement.classList.add('reader-open');
  };
  function rememberRecent(it, pct) {
    var rec = (MV.load('readRecent', []) || []).filter(function (r) { return r.key !== it.key; });
    var old = (MV.load('readRecent', []) || []).filter(function (r) { return r.key === it.key; })[0];
    rec.unshift({ key: it.key, name: it.name, poster: it.poster || '', url: it.url || '', path: it.path || '', ua: it.ua || '', ref: it.ref || '', kind: it.kind || '', pct: pct != null ? Math.round(pct * 100) : (old && old.pct) || 0, at: Date.now() });
    MV.save('readRecent', rec.slice(0, 30));
    if (pct != null) { var all = positions(); all[it.key] = Object.assign({}, all[it.key] || {}, { pct: pct, at: Date.now() }); MV.save('readPos', all); }
  }
  function closeMb() {
    if (!mb) return;
    mb.remove(); mb = null; mbItem = null;
    document.documentElement.classList.remove('reader-open');
    if (MV.rerender) MV.rerender();
  }
  window.addEventListener('message', function (e) {
    var m = e.data || {}; if (!m.mbr || !mb || e.source !== mb.contentWindow) return;
    if (m.type === 'ready') { if (st) st.item = null; close(true); document.documentElement.classList.add('reader-open'); MV._mbOpen && MV._mbOpen(); }
    else if (m.type === 'closed') closeMb();
    else if (m.type === 'progress' && mbItem && m.id === mbItem.key) rememberRecent(mbItem, m.pct);
    else if (m.type === 'cover' && m.id && /^data:image\//.test(m.data || '')) { var all = MV.load('bookCovers', {}) || {}, ks = Object.keys(all); if (ks.length > 80) delete all[ks[0]]; all[m.id] = m.data; MV.save('bookCovers', all); coverMem = null; }
  });
  MV.mbOpen = function () { return !!mb; };

  function close(silent) {
    if (!box) return;
    savePos();
    if (st && st.pdf) { try { st.pdf.destroy(); } catch (e) {} }
    box.remove(); box = null; st = null;
    document.documentElement.classList.remove('reader-open');
    if (!silent && MV.rerender) MV.rerender();
  }
  MV.closeBook = function () { close(); };
  MV.readerOpen = function () { return !!box || !!mb; };

  // ---------- Barra ----------
  function tools() {
    var t = $('.rdtools'); if (!t || !st) return;
    var h = '';
    if (st.fmt === 'comic' || st.fmt === 'pdf') {
      h += '<button class="rdb f" data-r="mode">' + (st.mode === 'page' ? '📄 Página' : '📜 Tira') + '</button>';
      if (st.mode === 'page') h += '<button class="rdb f" data-r="rtl">' + (st.rtl ? '⬅ Manga' : '➡ Occidental') + '</button><button class="rdb f" data-r="fit">' + (st.fit === 'width' ? '↔ Ancho' : '↕ Alto') + '</button>';
    }
    if (st.fmt === 'epub') h += '<button class="rdb f" data-r="font-">A−</button><button class="rdb f" data-r="font+">A+</button><button class="rdb f" data-r="theme">' + ({ dark: '🌙 Oscuro', sepia: '📜 Sepia', light: '☀ Claro' })[st.theme] + '</button><button class="rdb f" data-r="toc">☰ Capítulos</button>';
    if (st.total > 1 && st.fmt !== 'epub') h += '<button class="rdb f" data-r="goto">Ir a…</button>';
    t.innerHTML = h;
  }
  function showBar() {
    if (!box) return;
    box.classList.add('rdshow'); tools();
    clearTimeout(barT); barT = setTimeout(function () { if (box && !box.querySelector('.rdbar :focus')) box.classList.remove('rdshow'); }, 3500);
  }
  function label(t) { var p = $('#rdPage'); if (p) p.textContent = t; }
  function hint(t) { var h = $('.rdhint'); if (!h) return; h.textContent = t; h.classList.add('on'); clearTimeout(hint.t); hint.t = setTimeout(function () { h.classList.remove('on'); }, 1500); }

  // ---------- Cómics y mangas ----------
  function renderComic() {
    var body = $('.rdbody'); if (!body) return;
    st.page = Math.max(0, Math.min(st.total - 1, st.page));
    if (st.mode === 'scroll') {
      body.innerHTML = '<div class="rdstrip">' + st.pages.map(function (u, i) { return '<img loading="lazy" decoding="async" data-i="' + i + '" src="' + esc(u) + '" alt="Página ' + (i + 1) + '">'; }).join('') + '</div>';
      body.scrollTop = 0;
      var target = body.querySelector('[data-i="' + st.page + '"]');
      if (target) setTimeout(function () { target.scrollIntoView(); }, 60);
      body.onscroll = function () {
        var imgs = body.querySelectorAll('.rdstrip img'), mid = body.scrollTop + body.clientHeight / 3, cur = 0;
        for (var i = 0; i < imgs.length; i++) { if (imgs[i].offsetTop <= mid) cur = i; else break; }
        if (cur !== st.page) { st.page = cur; label('Página ' + (cur + 1) + ' de ' + st.total); }
      };
    } else {
      body.onscroll = null;
      body.innerHTML = '<div class="rdpage fit-' + st.fit + '"><img id="rdImg" alt=""></div>';
      showComicPage();
    }
    label('Página ' + (st.page + 1) + ' de ' + st.total);
    tools();
  }
  function showComicPage() {
    var img = $('#rdImg'); if (!img) return;
    img.src = st.pages[st.page];
    var pg = $('.rdpage'); if (pg) pg.scrollTop = 0;
    label('Página ' + (st.page + 1) + ' de ' + st.total);
    // Se adelantan las dos siguientes
    [1, 2].forEach(function (k) { var u = st.pages[st.page + k]; if (u) { var im = new Image(); im.src = u; } });
  }

  // ---------- PDF (pdf.js) ----------
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('No se pudo cargar el lector de PDF')); }; document.head.appendChild(s); }); }
  function loadPdf(url) {
    var m = $('#rdMsg'); if (m) m.textContent = 'Preparando el PDF…';
    (window.pdfjsLib ? Promise.resolve() : loadScript(PDFJS + 'pdf.min.js')).then(function () {
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
      return pdfjsLib.getDocument({ url: url, isEvalSupported: false }).promise;
    }).then(function (pdf) {
      if (!box) { pdf.destroy(); return; }
      st.pdf = pdf; st.total = pdf.numPages;
      renderPdf();
    }).catch(function (e) {
      if (!box) return;
      $('.rdbody').innerHTML = '<div class="rdload"><b style="color:var(--accent)">No se pudo abrir el PDF</b><p>' + esc(e.message || '') + '</p></div>';
    });
  }
  function renderPdf() {
    var body = $('.rdbody'); if (!body) return;
    st.page = Math.max(0, Math.min(st.total - 1, st.page));
    if (st.mode === 'scroll') {
      var h = ''; for (var i = 0; i < st.total; i++) h += '<div class="rdpdfp" data-i="' + i + '"></div>';
      body.innerHTML = '<div class="rdstrip">' + h + '</div>';
      var ob = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting && !e.target.dataset.done) { e.target.dataset.done = '1'; drawPdfPage(+e.target.dataset.i, e.target, body.clientWidth); } });
      }, { root: body, rootMargin: '150% 0px' });
      Array.prototype.forEach.call(body.querySelectorAll('.rdpdfp'), function (d) { d.style.minHeight = Math.round(body.clientWidth * 1.35) + 'px'; ob.observe(d); });
      var t = body.querySelector('[data-i="' + st.page + '"]'); if (t) setTimeout(function () { t.scrollIntoView(); }, 60);
      body.onscroll = function () {
        var ps = body.querySelectorAll('.rdpdfp'), mid = body.scrollTop + body.clientHeight / 3, cur = 0;
        for (var j = 0; j < ps.length; j++) { if (ps[j].offsetTop <= mid) cur = j; else break; }
        if (cur !== st.page) { st.page = cur; label('Página ' + (cur + 1) + ' de ' + st.total); }
      };
    } else {
      body.onscroll = null;
      body.innerHTML = '<div class="rdpage fit-' + st.fit + '"><div id="rdPdf"></div></div>';
      drawPdfCurrent();
    }
    label('Página ' + (st.page + 1) + ' de ' + st.total);
    tools();
  }
  function drawPdfCurrent() {
    var holder = $('#rdPdf'), pg = $('.rdpage'); if (!holder) return;
    var want = st.page; holder.innerHTML = '';
    st.pdf.getPage(want + 1).then(function (page) {
      if (!box || st.page !== want) return;
      var v1 = page.getViewport({ scale: 1 });
      var scale = st.fit === 'width' ? pg.clientWidth / v1.width : Math.min(pg.clientWidth / v1.width, pg.clientHeight / v1.height);
      draw(page, scale, holder);
      pg.scrollTop = 0;
    });
    label('Página ' + (st.page + 1) + ' de ' + st.total);
  }
  function drawPdfPage(i, holder, width) {
    st.pdf.getPage(i + 1).then(function (page) {
      if (!box) return;
      var v1 = page.getViewport({ scale: 1 });
      draw(page, width / v1.width, holder);
      holder.style.minHeight = '';
    });
  }
  function draw(page, scale, holder) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2), vp = page.getViewport({ scale: scale * dpr });
    var c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    c.style.width = Math.round(vp.width / dpr) + 'px'; c.style.height = Math.round(vp.height / dpr) + 'px';
    holder.innerHTML = ''; holder.appendChild(c);
    page.render({ canvasContext: c.getContext('2d'), viewport: vp });
  }

  // ---------- EPUB: páginas como un libro (columnas), con portada ----------
  function txt(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error('Falta ' + decodeURIComponent(u.split('/').pop())); return r.text(); }); }
  function xml(t) { return new DOMParser().parseFromString(t, 'application/xml'); }
  function resolve(rel, base) { try { return new URL(rel, base).href; } catch (e) { return base + rel; } }
  function loadEpub(base) {
    var m = $('#rdMsg'); if (m) m.textContent = 'Preparando el libro…';
    txt(base + 'META-INF/container.xml').then(function (t) {
      var rf = xml(t).getElementsByTagName('rootfile')[0];
      var opf = rf && rf.getAttribute('full-path'); if (!opf) throw new Error('El EPUB no tiene índice');
      var opfUrl = resolve(opf, base);
      return txt(opfUrl).then(function (o) {
        var d = xml(o), man = {}, items = d.getElementsByTagName('item'), cover = '';
        Array.prototype.forEach.call(items, function (it) {
          var href = resolve(it.getAttribute('href') || '', opfUrl);
          man[it.getAttribute('id')] = href;
          if (/cover-image/.test(it.getAttribute('properties') || '')) cover = href;
        });
        if (!cover) { var cm = Array.prototype.filter.call(d.getElementsByTagName('meta'), function (x) { return x.getAttribute('name') === 'cover'; })[0]; if (cm && man[cm.getAttribute('content')]) cover = man[cm.getAttribute('content')]; }
        if (!cover) Array.prototype.forEach.call(items, function (it) { if (!cover && /^image\//.test(it.getAttribute('media-type') || '') && /cover|portada/i.test((it.getAttribute('id') || '') + (it.getAttribute('href') || ''))) cover = man[it.getAttribute('id')]; });
        if (cover && !/\.(jpe?g|png|gif|webp|svg)(\?|$)/i.test(cover)) cover = '';
        var spine = Array.prototype.map.call(d.getElementsByTagName('itemref'), function (r) { return man[r.getAttribute('idref')]; }).filter(Boolean);
        if (!spine.length) throw new Error('El EPUB no trae capítulos');
        // Títulos del índice (toc.ncx o nav.xhtml) para el menú de capítulos
        var names = {};
        var ncxId = (d.getElementsByTagName('spine')[0] || { getAttribute: function () { return ''; } }).getAttribute('toc');
        var navItem = Array.prototype.filter.call(items, function (it) { return /\bnav\b/.test(it.getAttribute('properties') || ''); })[0];
        var tocUrl = navItem ? man[navItem.getAttribute('id')] : ncxId ? man[ncxId] : '';
        var tocJob = tocUrl ? txt(tocUrl).then(function (tt) {
          var td = new DOMParser().parseFromString(tt, /\.ncx$/i.test(tocUrl) ? 'application/xml' : 'text/html');
          if (/\.ncx$/i.test(tocUrl)) Array.prototype.forEach.call(td.getElementsByTagName('navPoint'), function (np) { var c = np.getElementsByTagName('content')[0], l = np.getElementsByTagName('text')[0]; if (c && l) { var h = resolve(c.getAttribute('src') || '', tocUrl).split('#')[0]; if (!names[h]) names[h] = l.textContent.trim(); } });
          else Array.prototype.forEach.call(td.querySelectorAll('nav a[href]'), function (a2) { var h = resolve(a2.getAttribute('href'), tocUrl).split('#')[0]; if (!names[h]) names[h] = a2.textContent.trim(); });
        }).catch(function () {}) : Promise.resolve();
        return tocJob.then(function () {
          // La portada va como primera página si el libro no la trae ya al inicio
          st.epub = { spine: spine, names: names, cover: cover, cache: {} };
          if (cover) { saveCover(cover); }
          return (cover ? txt(spine[0]).catch(function () { return ''; }) : Promise.resolve('')).then(function (first) {
            if (cover && first.indexOf(decodeURIComponent(cover.split('/').pop())) < 0 && first.indexOf(cover.split('/').pop()) < 0) { st.epub.spine.unshift('#cover'); if (st.chap || st.yRatio) st.chap++; }
            st.total = st.epub.spine.length;
            renderEpub(st.yRatio || 0);
          });
        });
      });
    }).catch(function (e) {
      if (!box) return;
      $('.rdbody').innerHTML = '<div class="rdload"><b style="color:var(--accent)">No se pudo abrir el libro</b><p>' + esc(e.message || '') + '</p><button class="btn f" data-r="close">Volver</button></div>';
    });
  }
  // Portada guardada para mostrarla en Lectura (cuando la lista no trae carátula)
  function saveCover(url) {
    if (!st || !st.item || !st.item.key) return;
    var key = st.item.key, all = MV.load('bookCovers', {}) || {};
    if (all[key]) return;
    var im = new Image();
    im.onload = function () {
      try {
        var w = 260, h = Math.round(im.naturalHeight * w / (im.naturalWidth || 1)) || 390, c = document.createElement('canvas');
        c.width = w; c.height = Math.min(h, 520); c.getContext('2d').drawImage(im, 0, 0, w, h);
        var keys = Object.keys(all); if (keys.length > 80) delete all[keys[0]];
        all[key] = c.toDataURL('image/jpeg', 0.78); MV.save('bookCovers', all); coverMem = null;
      } catch (e) {}
    };
    im.src = url;
  }
  // Se lee una sola vez (no en cada tarjeta) y se refresca al guardar una portada nueva
  var coverMem = null;
  MV.bookCover = function (key) { if (!coverMem) coverMem = MV.load('bookCovers', {}) || {}; return coverMem[key] || ''; };
  MV.bookCoverReset = function () { coverMem = null; };

  var THEMES = { dark: ['#141210', '#E9E3DB'], sepia: ['#F4ECD8', '#3B3024'], light: ['#FFFFFF', '#1A1A1A'] };
  function chapterHtml(i) {
    var href = st.epub.spine[i];
    if (href === '#cover') return Promise.resolve('<html><head></head><body class="mv-cover"><img src="' + esc(st.epub.cover) + '" alt=""></body></html>');
    if (st.epub.cache[href]) return Promise.resolve(st.epub.cache[href]);
    return txt(href).then(function (h) { st.epub.cache[href] = h; return h; });
  }
  function epubCss(W, H) {
    var th = THEMES[st.theme] || THEMES.dark, M = Math.max(18, Math.round(W * 0.06)), PT = Math.max(16, Math.round(H * 0.05));
    var cols = W > 900 && W / H > 1.25 ? 2 : 1, g = 2 * M, cw = Math.floor((W - 2 * M - (cols - 1) * g) / cols), ch = H - 2 * PT;
    return '<style id="mvcss">' +
      'html{height:100%!important;overflow:hidden!important;background:' + th[0] + '!important;}' +
      'body{margin:0!important;box-sizing:border-box!important;height:' + H + 'px!important;width:' + W + 'px!important;padding:' + PT + 'px ' + M + 'px!important;column-width:' + cw + 'px!important;column-gap:' + g + 'px!important;column-fill:auto!important;' +
      'background:' + th[0] + '!important;color:' + th[1] + '!important;font-size:' + st.font + 'px!important;line-height:1.6!important;font-family:Georgia,"Noto Serif",serif;overflow:visible!important;-webkit-text-size-adjust:100%;max-width:none!important;}' +
      'body *{color:' + th[1] + '!important;background-color:transparent!important;max-width:100%;}' +
      'p{margin:0 0 .8em!important;text-align:' + (W > 600 ? 'justify' : 'left') + ';hyphens:auto;}a{text-decoration:none!important}' +
      'img,image,video{max-width:100%!important;max-height:' + (ch - 4) + 'px!important;object-fit:contain;break-inside:avoid;}' +
      'svg{max-width:100%!important;max-height:' + (ch - 4) + 'px!important;}' +
      'figure,table,pre{break-inside:avoid;}h1,h2,h3{break-after:avoid;line-height:1.25!important;}' +
      '.mv-cover{display:flex!important;align-items:center;justify-content:center;column-width:auto!important;padding:' + PT + 'px!important;}.mv-cover img{max-height:' + (H - 2 * PT) + 'px!important;max-width:' + (W - 2 * PT) + 'px!important;box-shadow:0 10px 40px rgba(0,0,0,.5)}' +
      '</style>';
  }
  /** pos: número entre 0 y 1 (posición dentro del capítulo), o 'end' para la última página. */
  function renderEpub(pos) {
    var body = $('.rdbody'); if (!body || !st || !st.epub) return;
    st.chap = Math.max(0, Math.min(st.total - 1, st.chap));
    var my = st.renderId = (st.renderId || 0) + 1;
    var href = st.epub.spine[st.chap], baseHref = href === '#cover' ? st.epub.cover.replace(/[^\/]+$/, '') : href.replace(/[^\/]+$/, '');
    chapterHtml(st.chap).then(function (html) {
      if (!box || st.renderId !== my) return;
      var W = body.clientWidth, H = body.clientHeight;
      var head = '<base href="' + baseHref.replace(/"/g, '%22') + '"><meta name="viewport" content="width=device-width,initial-scale=1">' + epubCss(W, H);
      html = html.replace(/<\?xml[^>]*>/i, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<link[^>]+rel=["']?stylesheet[^>]*>/gi, function (l) { return l; });
      html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, function (m) { return m + head; }) : head + html;
      // Lo del libro va primero y nuestro estilo al final (manda sobre el del libro)
      html = html.replace(/<\/head>/i, epubCss(W, H) + '</head>');
      body.onscroll = null;
      var old = body.querySelector('iframe');
      var fr = document.createElement('iframe'); fr.className = 'rdepub'; fr.setAttribute('sandbox', 'allow-same-origin'); fr.title = 'Libro'; fr.style.visibility = 'hidden';
      body.appendChild(fr);
      fr.onload = function () {
        if (st.renderId !== my) return;
        var w, de;
        try { w = fr.contentWindow; de = w.document.scrollingElement || w.document.documentElement; } catch (e) { return; }
        st.ep = { w: w, de: de, W: W, page: 0, pages: 1, body: w.document.body };
        try { w.document.body.style.setProperty('transition', 'none'); } catch (e) {}
        var measure = function () { st.ep.pages = Math.max(1, Math.ceil((Math.max(de.scrollWidth, w.document.body.scrollWidth) - 4) / W)); };
        var place = function () {
          measure();
          var p = pos === 'end' ? st.ep.pages - 1 : Math.round((+pos || 0) * (st.ep.pages - 1));
          goPage(p);
        };
        place();
        fr.style.visibility = ''; if (old && old.parentNode) old.remove();
        Array.prototype.forEach.call(body.querySelectorAll('.rdload'), function (x) { x.remove(); });
        // Las imágenes que cargan tarde cambian el número de páginas
        Array.prototype.forEach.call(w.document.images, function (im) { if (!im.complete) im.addEventListener('load', function () { var r = st.ep && st.ep.pages > 1 ? st.ep.page / (st.ep.pages - 1) : 0; measure(); goPage(Math.round(r * (st.ep.pages - 1))); }); });
        w.document.addEventListener('keydown', function (e) { onKey(e); }, true);
        // Toques: izquierda atrás, derecha adelante, centro muestra la barra. Deslizar pasa página.
        var tx = 0, ty = 0, moved = false;
        w.document.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; ty = e.touches[0].clientY; moved = false; }, { passive: true });
        w.document.addEventListener('touchend', function (e) {
          var dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) { moved = true; turn(dx < 0 ? 1 : -1); }
        }, { passive: true });
        w.document.addEventListener('click', function (e) {
          var a = e.target.closest && e.target.closest('a[href]');
          if (a) { e.preventDefault(); var h = resolve(a.getAttribute('href'), href).split('#')[0], i = st.epub.spine.indexOf(h); if (i >= 0) { st.chap = i; renderEpub(0); } return; }
          if (moved) { moved = false; return; }
          var x = e.clientX / W; if (x < 0.3) turn(-1); else if (x > 0.7) turn(1); else showBar();
        });
        w.addEventListener('wheel', function (e) { e.preventDefault(); if (Math.abs(e.deltaY) > 8 || Math.abs(e.deltaX) > 8) { clearTimeout(st.wt); st.wt = setTimeout(function () { turn((e.deltaY || e.deltaX) > 0 ? 1 : -1); }, 40); } }, { passive: false });
        // Se adelanta el siguiente capítulo
        if (st.chap + 1 < st.total) chapterHtml(st.chap + 1).catch(function () {});
      };
      fr.srcdoc = html;
      tools();
    }).catch(function (e) { if (box) hint(e.message); });
  }
  function goPage(p) {
    var ep = st && st.ep; if (!ep) return;
    ep.page = Math.max(0, Math.min(ep.pages - 1, p));
    try { ep.de.scrollLeft = 0; ep.body.style.setProperty('transform', 'translateX(' + (-ep.page * ep.W) + 'px)', 'important'); } catch (e) {}
    st.yRatio = ep.pages > 1 ? ep.page / (ep.pages - 1) : 0;
    var cname = st.epub.spine[st.chap] === '#cover' ? 'Portada' : 'Capítulo ' + (st.chap + 1) + ' de ' + st.total;
    label(cname + ' · página ' + (ep.page + 1) + ' de ' + ep.pages);
  }
  function epubTurn(d) {
    var ep = st.ep; if (!ep) return;
    var n = ep.page + d;
    if (n >= 0 && n < ep.pages) { goPage(n); return; }
    if (d > 0) { if (st.chap < st.total - 1) { st.chap++; renderEpub(0); } else hint('Fin del libro'); }
    else { if (st.chap > 0) { st.chap--; renderEpub('end'); } else hint('Inicio del libro'); }
  }
  function epubScroll(d) { epubTurn(d > 0 ? 1 : -1); return true; }
  function tocMenu() {
    var items = st.epub.spine.map(function (h, i) {
      var n = h === '#cover' ? 'Portada' : (st.epub.names[h] || decodeURIComponent(h.split('/').pop().replace(/\.x?html?$/i, '').replace(/[_-]+/g, ' ')));
      return '<button class="btn ghost f' + (i === st.chap ? ' on' : '') + '" data-act="readChap" data-arg="' + i + '"' + (i === st.chap ? ' data-autofocus' : '') + '>' + esc(n) + '</button>';
    }).join('');
    MV.modal('<h2>Capítulos</h2><div class="btns" style="flex-direction:column;align-items:stretch;max-height:60vh;overflow:auto">' + items + '</div>');
  }
  if (MV.ACT) MV.ACT.readChap = function (i) { MV.closeModal(true); if (st) { st.chap = +i; renderEpub(0); } };
  window.addEventListener('resize', function () { if (st && st.fmt === 'epub' && st.ep) { clearTimeout(st.rt); st.rt = setTimeout(function () { renderEpub(st.yRatio); }, 250); } });

  // ---------- Pasar página ----------
  function turn(d) {
    if (!st) return;
    if (st.fmt === 'epub') { epubTurn(d); return; }
    var body = $('.rdbody');
    if (st.mode === 'scroll') { body.scrollBy({ top: d * body.clientHeight * 0.85, behavior: 'smooth' }); return; }
    var n = st.page + d;
    if (n < 0) { hint('Primera página'); return; }
    if (n >= st.total) { hint('Última página'); return; }
    st.page = n;
    if (st.fmt === 'comic') showComicPage(); else drawPdfCurrent();
  }
  function pan(d) {
    var el = st && st.mode === 'page' ? $('.rdpage') : $('.rdbody');
    if (st && st.fmt === 'epub') { epubTurn(d > 0 ? 1 : -1); return; }
    if (!el) return;
    var before = el.scrollTop;
    el.scrollBy({ top: d * el.clientHeight * 0.45, behavior: 'smooth' });
    // En modo página, si ya no hay más para bajar, pasa a la siguiente
    if (st.mode === 'page') setTimeout(function () { if (Math.abs(el.scrollTop - before) < 2) turn(d); }, 220);
  }
  function act(r) {
    if (!st) return;
    switch (r) {
      case 'close': close(); break;
      case 'mode': st.mode = st.mode === 'page' ? 'scroll' : 'page'; st.fmt === 'comic' ? renderComic() : renderPdf(); hint(st.mode === 'page' ? 'Página por página' : 'Tira vertical (como webtoon)'); break;
      case 'rtl': st.rtl = !st.rtl; MV.save('readRtl:' + st.item.key, st.rtl); tools(); hint(st.rtl ? 'Lectura de manga: ◀ avanza' : 'Lectura occidental: ▶ avanza'); break;
      case 'fit': st.fit = st.fit === 'width' ? 'height' : 'width'; MV.save('readFit', st.fit); st.fmt === 'comic' ? renderComic() : renderPdf(); break;
      case 'font-': case 'font+': st.font = Math.max(14, Math.min(40, st.font + (r === 'font+' ? 2 : -2))); MV.save('readFont', st.font); renderEpub(st.yRatio); break;
      case 'theme': st.theme = st.theme === 'dark' ? 'sepia' : st.theme === 'sepia' ? 'light' : 'dark'; MV.save('readTheme', st.theme); box.className = 'rd-' + st.theme + ' rdshow'; renderEpub(st.yRatio); break;
      case 'toc': tocMenu(); break;
      case 'goto':
        MV.modal('<h2>Ir a la página</h2><label class="field">Página (1 a ' + st.total + ')<input class="in f" id="rdGo" type="number" min="1" max="' + st.total + '" value="' + (st.page + 1) + '" data-autofocus></label><div class="btns"><button class="btn f" data-act="readGo">Ir</button></div>');
        break;
    }
  }
  if (MV.ACT) MV.ACT.readGo = function () { var v = +(document.getElementById('rdGo') || {}).value; MV.closeModal(true); if (st && v >= 1 && v <= st.total) { st.page = v - 1; st.fmt === 'comic' ? (st.mode === 'page' ? showComicPage() : renderComic()) : (st.mode === 'page' ? drawPdfCurrent() : renderPdf()); } };

  // ---------- Control, teclado, toques ----------
  function onKey(e) {
    if (!box || MV.modalOpen()) return;
    var k = e.key, inBar = document.activeElement && document.activeElement.closest && document.activeElement.closest('.rdbar');
    if (inBar && (k === 'Enter' || k === ' ')) return;              // botones de la barra
    if (inBar && (k === 'ArrowLeft' || k === 'ArrowRight')) return;  // moverse entre botones
    var fwd = st && st.rtl && st.mode === 'page' && st.fmt !== 'epub' ? -1 : 1;
    switch (k) {
      case 'ArrowRight': case 'PageDown': turn(k === 'PageDown' ? 1 : fwd); break;
      case 'ArrowLeft': case 'PageUp': turn(k === 'PageUp' ? -1 : -fwd); break;
      case 'ArrowDown': if (inBar) { document.activeElement.blur(); } else pan(1); break;
      case 'ArrowUp': if (box.classList.contains('rdshow') && !inBar && (st.mode === 'scroll' ? $('.rdbody').scrollTop < 5 : true) && st.fmt !== 'epub') { var b = $('.rdbar .rdb'); if (b) b.focus(); showBar(); } else pan(-1); break;
      case 'Enter': case ' ': case 'MediaPlayPause': showBar(); var first = $('.rdbar .rdtools .rdb') || $('.rdbar .rdb'); if (first && MV.device.tv) first.focus(); break;
      case '+': case '=': if (st.fmt === 'epub') act('font+'); break;
      case '-': if (st.fmt === 'epub') act('font-'); break;
      case 'Home': if (st.fmt !== 'epub') { st.page = 0; turn(0); } break;
      default: return;
    }
    e.preventDefault(); e.stopImmediatePropagation();
  }
  window.addEventListener('keydown', onKey, true);
  document.addEventListener('click', function (e) {
    if (!box || !box.contains(e.target)) return;
    var b = e.target.closest('[data-r]'); if (b) { e.preventDefault(); act(b.getAttribute('data-r')); return; }
    if (e.target.closest('.rdbar')) return;
    if (st && st.mode === 'page' && st.fmt !== 'epub') {
      var x = e.clientX / window.innerWidth, f = st.rtl ? -1 : 1;
      if (x < 0.3) turn(-f); else if (x > 0.7) turn(f); else showBar();
    } else showBar();
  }, true);
  // Deslizar a los lados en modo página
  var sx = 0, sy = 0;
  document.addEventListener('touchstart', function (e) { if (!box) return; sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (!box || !st || st.mode !== 'page' || st.fmt === 'epub') return;
    var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) turn((dx < 0 ? 1 : -1) * (st.rtl ? -1 : 1));
  }, { passive: true });
  window.addEventListener('resize', function () { if (st && st.mode === 'page') { if (st.fmt === 'pdf') drawPdfCurrent(); } });

  // Atrás: cierra el lector (y antes, el menú de la barra)
  var origBack = MV.onBack;
  MV.onBack = function () {
    if (mb) { try { mb.contentWindow.postMessage({ mbr: 1, type: 'back' }, '*'); } catch (e) { closeMb(); } return true; }
    if (box && !MV.modalOpen()) {
      var inBar = document.activeElement && document.activeElement.closest && document.activeElement.closest('.rdbar');
      if (inBar) { document.activeElement.blur(); box.classList.remove('rdshow'); return true; }
      close(); return true;
    }
    return origBack.apply(this, arguments);
  };
  setInterval(function () { if (box) savePos(); }, 15000);
})();
