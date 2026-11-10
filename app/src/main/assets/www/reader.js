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
    var all = positions(), p = { page: st.page || 0, chap: st.chap || 0, y: st.yRatio || 0, mode: st.mode, total: st.total || 0, at: Date.now() };
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
    close(true);
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
      if (d.fmt === 'comic') { st.pages = d.pages; st.total = d.pages.length; renderComic(); }
      else if (d.fmt === 'pdf') loadPdf(d.url);
      else if (d.fmt === 'epub') loadEpub(d.base);
    }).catch(function (e) {
      if (!box) return;
      $('.rdbody').innerHTML = '<div class="rdload"><b style="color:var(--accent)">No se pudo abrir</b><p>' + esc(e.message || '') + '</p><button class="btn f" data-r="close">Volver</button></div>';
      var b = $('.rdload .btn'); if (b) b.focus();
    });
  };

  function close(silent) {
    if (!box) return;
    savePos();
    if (st && st.pdf) { try { st.pdf.destroy(); } catch (e) {} }
    box.remove(); box = null; st = null;
    document.documentElement.classList.remove('reader-open');
    if (!silent && MV.rerender) MV.rerender();
  }
  MV.closeBook = function () { close(); };
  MV.readerOpen = function () { return !!box; };

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

  // ---------- EPUB ----------
  function txt(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error('Falta ' + u.split('/').pop()); return r.text(); }); }
  function xml(t) { return new DOMParser().parseFromString(t, 'application/xml'); }
  function loadEpub(base) {
    var m = $('#rdMsg'); if (m) m.textContent = 'Preparando el libro…';
    txt(base + 'META-INF/container.xml').then(function (t) {
      var rf = xml(t).getElementsByTagName('rootfile')[0];
      var opf = rf && rf.getAttribute('full-path'); if (!opf) throw new Error('El EPUB no tiene índice');
      var dir = opf.indexOf('/') >= 0 ? opf.replace(/[^\/]+$/, '') : '';
      return txt(base + opf).then(function (o) {
        var d = xml(o), man = {}, toc = [];
        Array.prototype.forEach.call(d.getElementsByTagName('item'), function (it) { man[it.getAttribute('id')] = it.getAttribute('href'); });
        var spine = Array.prototype.map.call(d.getElementsByTagName('itemref'), function (r) { return man[r.getAttribute('idref')]; }).filter(Boolean);
        if (!spine.length) throw new Error('El EPUB no trae capítulos');
        st.epub = { base: base + dir, spine: spine.map(function (h) { return decodeURIComponent(h); }) };
        st.total = spine.length;
        renderEpub(true);
      });
    }).catch(function (e) {
      if (!box) return;
      $('.rdbody').innerHTML = '<div class="rdload"><b style="color:var(--accent)">No se pudo abrir el libro</b><p>' + esc(e.message || '') + '</p></div>';
    });
  }
  var THEMES = { dark: ['#141210', '#E9E3DB'], sepia: ['#F4ECD8', '#3B3024'], light: ['#FFFFFF', '#1A1A1A'] };
  function renderEpub(restore) {
    var body = $('.rdbody'); if (!body || !st.epub) return;
    st.chap = Math.max(0, Math.min(st.total - 1, st.chap));
    var href = st.epub.spine[st.chap], url = st.epub.base + href;
    var baseHref = url.replace(/[^\/]+$/, '');
    txt(url).then(function (html) {
      if (!box) return;
      var th = THEMES[st.theme] || THEMES.dark;
      var css = '<base href="' + baseHref.replace(/"/g, '%22') + '"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
        'html{background:' + th[0] + ';}body{background:' + th[0] + '!important;color:' + th[1] + '!important;font-size:' + st.font + 'px!important;line-height:1.65!important;max-width:44em;margin:0 auto!important;padding:5vh 6vw 30vh!important;font-family:Georgia,"Noto Serif",serif;}' +
        'p,div,span,li,h1,h2,h3,h4,a{color:' + th[1] + '!important;background:transparent!important;}img,svg,image{max-width:100%!important;height:auto!important;}a{text-decoration:none}' +
        '</style>';
      // Sin scripts del libro
      html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
      html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, function (m) { return m + css; }) : css + html;
      body.onscroll = null;
      body.innerHTML = '<iframe class="rdepub" sandbox="allow-same-origin" title="Libro"></iframe>';
      var fr = body.querySelector('iframe');
      fr.onload = function () {
        try {
          var w = fr.contentWindow, de = w.document.scrollingElement || w.document.documentElement;
          if (restore && st.yRatio) de.scrollTop = st.yRatio * (de.scrollHeight - w.innerHeight);
          w.addEventListener('scroll', function () { var max = de.scrollHeight - w.innerHeight; st.yRatio = max > 0 ? de.scrollTop / max : 0; label('Capítulo ' + (st.chap + 1) + ' de ' + st.total + ' · ' + Math.round(st.yRatio * 100) + '%'); });
          w.document.addEventListener('keydown', function (e) { onKey(e); }, true);
          w.document.addEventListener('click', function (e) { var x = e.clientX / w.innerWidth; if (x < 0.25) turn(-1); else if (x > 0.75) turn(1); else showBar(); });
        } catch (e) {}
      };
      fr.srcdoc = html;
      label('Capítulo ' + (st.chap + 1) + ' de ' + st.total);
      tools();
    }).catch(function (e) { if (box) hint(e.message); });
  }
  function epubScroll(dir, page) {
    var fr = $('.rdepub'); if (!fr) return false;
    try {
      var w = fr.contentWindow, de = w.document.scrollingElement || w.document.documentElement, max = de.scrollHeight - w.innerHeight;
      if (dir > 0 && de.scrollTop >= max - 4) { if (st.chap < st.total - 1) { st.chap++; st.yRatio = 0; renderEpub(false); } else hint('Fin del libro'); return true; }
      if (dir < 0 && de.scrollTop <= 4) { if (st.chap > 0) { st.chap--; st.yRatio = 1; renderEpub(true); } return true; }
      de.scrollTop += dir * (page ? w.innerHeight * 0.9 : 90);
    } catch (e) {}
    return true;
  }
  function tocMenu() {
    var items = st.epub.spine.map(function (h, i) { return '<button class="btn ghost f' + (i === st.chap ? ' on' : '') + '" data-act="readChap" data-arg="' + i + '">' + (i + 1) + '. ' + esc(decodeURIComponent(h.split('/').pop().replace(/\.x?html?$/i, '').replace(/[_-]+/g, ' '))) + '</button>'; }).join('');
    MV.modal('<h2>Capítulos</h2><div class="btns" style="flex-direction:column;align-items:stretch;max-height:60vh;overflow:auto">' + items + '</div>');
  }
  if (MV.ACT) MV.ACT.readChap = function (i) { MV.closeModal(true); if (st) { st.chap = +i; st.yRatio = 0; renderEpub(false); } };

  // ---------- Pasar página ----------
  function turn(d) {
    if (!st) return;
    if (st.fmt === 'epub') { epubScroll(d, true); return; }
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
    if (st && st.fmt === 'epub') { epubScroll(d, false); return; }
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
      case 'font-': case 'font+': st.font = Math.max(14, Math.min(40, st.font + (r === 'font+' ? 2 : -2))); MV.save('readFont', st.font); renderEpub(true); break;
      case 'theme': st.theme = st.theme === 'dark' ? 'sepia' : st.theme === 'sepia' ? 'light' : 'dark'; MV.save('readTheme', st.theme); box.className = 'rd-' + st.theme + ' bar'; renderEpub(true); break;
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
    if (box && !MV.modalOpen()) {
      var inBar = document.activeElement && document.activeElement.closest && document.activeElement.closest('.rdbar');
      if (inBar) { document.activeElement.blur(); box.classList.remove('rdshow'); return true; }
      close(); return true;
    }
    return origBack.apply(this, arguments);
  };
  setInterval(function () { if (box) savePos(); }, 15000);
})();
