/* MiVibra TV — Lectura: estante curvo en vidrio.
   Los libros van de pie sobre un arco que se aleja; el del centro gira y muestra su portada.
   ◀ ▶ (o arrastrar / rueda) recorren el estante, OK abre la ficha, que crece desde la portada. */
(function () {
  'use strict';
  var MV = window.MV, D = window.MVD, IC = D.ICON, esc = MV.esc;
  var KINDS = { manga: 'Manga', comic: 'Cómic', libro: 'Libro', revista: 'Revista' };
  var POOL = 13;   // libros dibujados a cada lado del centro
  var sh = null;   // estado del estante montado

  function clean(t) { return MV.cleanTitle ? (MV.cleanTitle(t) || t) : t; }
  function initial(t) { return (clean(t) || '').replace(/^(el|la|los|las|the|un|una)\s+/i, '').charAt(0).toUpperCase(); }
  function smooth(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
  function hsl(hex, l, a) {
    var n = parseInt(String(hex || '#888888').slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, s = 0, d = mx - mn;
    if (d) { s = d / (1 - Math.abs(mx + mn - 1)); h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return 'hsla(' + Math.round(h) + ',' + Math.round(Math.min(.6, s) * 100) + '%,' + l + '%,' + a + ')';
  }
  function colors(b) { var h = MV.hue(b.name); return [hsl(h, 62, .78), hsl(h, 24, .84)]; }
  function pctOf(b) {
    var p = MV.readProgress ? MV.readProgress(b.key) : null;
    return p && p.pct != null ? Math.round(p.pct * 100) : p && p.total ? Math.round(((b.fmt === 'epub' ? p.chap : p.page) + 1) / p.total * 100) : 0;
  }
  function cover(b) { if (!b.poster && MV.bookCover) b.poster = MV.bookCover(b.key); return b.poster || ''; }
  function coverHtml(b, big) {
    var c = colors(b), img = cover(b);
    return '<div class="bsc' + (big ? ' big' : '') + '" style="--c1:' + c[0] + ';--c2:' + c[1] + '"><span class="k">' + esc((KINDS[b.kind] || 'Libro').toUpperCase()) + '</span><i></i><b>' + esc(clean(b.name)) + '</b><em>' + esc(b.group || '') + '</em>' +
      (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + '</div>';
  }
  function spineHtml(b) {
    var c = colors(b), img = cover(b);
    return '<div class="bss" style="--c1:' + c[0] + ';--c2:' + c[1] + '">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + '<i></i><b>' + esc(clean(b.name)) + '</b><em>' + esc((b.group || KINDS[b.kind] || '').toUpperCase()) + '</em></div>';
  }

  var api = MV.bookShelf = {};
  /** HTML del estante (va dentro de la vista Lectura; lo anima mount()). */
  api.html = function (list) {
    if (!list.length) return '';
    var AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    return '<section class="bshelf" id="bshelf">' +
      '<div class="bsword l" aria-hidden="true">LEER</div><div class="bsword r" aria-hidden="true">IMAGINAR</div>' +
      '<div class="bsfloor" aria-hidden="true"></div>' +
      '<button class="bsstage f" id="bsStage" data-act="bsOpen" aria-label="Estante de libros: usa ◀ ▶ para recorrerlo y OK para abrir"><div class="bscenter" id="bsCenter"></div></button>' +
      '<button class="bsarrow l f" data-act="bsStep" data-arg="-1" aria-label="Anterior"><svg viewBox="0 0 25 12" width="24" height="12" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 1L1 6l5 5M1 6h23"/></svg></button>' +
      '<button class="bsarrow r f" data-act="bsStep" data-arg="1" aria-label="Siguiente"><svg viewBox="0 0 25 12" width="24" height="12" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M19 1l5 5-5 5M24 6H1"/></svg></button>' +
      '<div class="bscap" id="bsCap"><div class="m"><div class="t" id="bsT"></div></div><div class="m"><div class="s" id="bsS"></div></div><span class="rl"></span><div class="m"><div class="y" id="bsY"></div></div></div>' +
      '<div class="bsruler" id="bsRuler"><span class="ln"></span>' + AZ.map(function (ch, j) { return '<span class="tk" style="left:' + (j / 25 * 100) + '%;height:' + (j % 5 ? 7 : 12) + 'px"></span><span class="lt" data-l="' + ch + '" style="left:' + (j / 25 * 100) + '%">' + ch + '</span>'; }).join('') + '<span class="dot" id="bsDot"></span></div>' +
      '</section>';
  };

  /** Pone en marcha el estante con la lista que se ve ahora. */
  api.mount = function (list) {
    var root = document.getElementById('bshelf');
    if (!root) { stop(); sh = null; return; }
    var keep = sh && sh.list.length && sh.list[Math.round(mod(Math.round(sh.T), sh.list.length))] ;
    var start = 0;
    if (keep) { var i = list.indexOf(keep); if (i < 0) i = list.map(function (b) { return b.key; }).indexOf(keep.key); if (i >= 0) start = i; }
    else { var saved = MV.load('bsLast', ''); if (saved) { var k = list.map(function (b) { return b.key; }).indexOf(saved); if (k >= 0) start = k; } }
    stop();
    sh = { root: root, center: root.querySelector('#bsCenter'), list: list, n: list.length, loop: list.length > 9, s: start, T: start, slots: [], act: -1, lastT: 0, raf: 0, drag: null, wheelT: 0 };
    measure();
    for (var j = 0; j < POOL * 2 + 1; j++) {
      var el = document.createElement('div'); el.className = 'bst';
      el.innerHTML = '<div class="face sp"></div><div class="face cv"></div>';
      el.addEventListener('click', onTapeClick);
      sh.center.appendChild(el);
      sh.slots.push({ el: el, sp: el.firstChild, cv: el.lastChild, idx: null });
    }
    bindInput();
    frame(performance.now()); kick();
  };
  function mod(a, n) { return ((a % n) + n) % n; }
  function measure() {
    var r = sh.root.getBoundingClientRect(), phone = window.innerWidth < 768;
    var H = Math.round(Math.min(phone ? window.innerWidth * .62 : r.height * .56, phone ? 330 : 400));
    sh.H = Math.max(160, H); sh.ws = sh.H * .155; sh.d = sh.H * .667; sh.gap = sh.H * .03; sh.U = sh.H * (phone ? 1.05 : 1.3); sh.P = 1400;
    sh.root.style.setProperty('--H', sh.H + 'px'); sh.root.style.setProperty('--ws', sh.ws + 'px'); sh.root.style.setProperty('--d', sh.d + 'px');
    // Integral de la escala: los lomos lejanos se juntan en pantalla
    sh.XS = [0]; var acc = 0; for (var u = 0; u < sh.U * 3; u += 2) { acc += 2 / (1 + Math.pow(u / sh.U, 1.6)); sh.XS.push(acc); }
  }
  function xsc(u) { var i = Math.min(sh.XS.length - 1, Math.floor(Math.abs(u) / 2)); return (u < 0 ? -1 : 1) * sh.XS[i]; }
  function Bf(r) { return Math.abs(r) < 1 ? (r + Math.sin(Math.PI * r) / Math.PI) / 2 : (r > 0 ? .5 : -.5); }
  function F(r) { return r * (sh.ws + sh.gap) + (sh.d - sh.ws + 1.4 * sh.gap) * Bf(r); }
  function scl(u) { return 1 / (1 + Math.pow(Math.abs(u) / sh.U, 1.6)); }

  function frame(now) {
    if (!sh || !sh.root.isConnected) { stop(); return; }
    var dt = Math.min(.05, (now - (sh.lastT || now)) / 1000); sh.lastT = now;
    var k = sh.drag ? 18 : 5.2;
    if (MV.lite || document.documentElement.classList.contains('reduce')) sh.s = sh.T; else sh.s += (sh.T - sh.s) * (1 - Math.exp(-k * dt));
    if (Math.abs(sh.T - sh.s) < .0005) sh.s = sh.T;
    if (!sh.loop) { sh.T = Math.max(0, Math.min(sh.n - 1, sh.T)); }
    var base = Math.round(sh.s), H = sh.H;
    for (var j = 0; j < sh.slots.length; j++) {
      var sl = sh.slots[j], v = base + j - POOL, r = v - sh.s;
      if (!sh.loop && (v < 0 || v >= sh.n)) { sl.el.style.visibility = 'hidden'; continue; }
      var idx = mod(v, sh.n), b = sh.list[idx];
      if (sl.idx !== idx) { sl.idx = idx; sl.sp.innerHTML = spineHtml(b); sl.cv.innerHTML = coverHtml(b); sl.el.setAttribute('data-r', ''); }
      sl.r = r;
      var o = smooth(Math.max(0, 1 - Math.abs(r))), u = F(r);
      if (Math.abs(u) > sh.U * 1.95) { sl.el.style.visibility = 'hidden'; continue; }
      var sc = scl(u), kk = 1 / sc;
      var z = sh.P * (1 - kk) + o * H * .1, x = xsc(u) * kk, y = (H * .5 * (1 - sc) * .42 + o * H * .012) * kk;
      var ry = (u < 0 ? -1 : 1) * Math.min(1, Math.abs(u) / sh.U) * 26 * (1 - o) - 90 * o;
      sl.el.style.visibility = 'visible';
      sl.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,' + z.toFixed(1) + 'px) rotateY(' + ry.toFixed(2) + 'deg)';
      sl.el.style.zIndex = Math.round(3000 + z);
      sl.sp.style.setProperty('--shade', Math.min(.6, o * .55 + (1 - sc) * .32).toFixed(3));
      sl.cv.style.setProperty('--shade', ((1 - o) * .82).toFixed(3));
    }
    var a = mod(Math.round(sh.s), sh.n);
    if (a !== sh.act) caption(a, sh.act < 0 ? 0 : (sh.T > sh.s ? 1 : -1));
    var moving = Math.abs(sh.T - sh.s) > .0005 || sh.drag;
    sh.raf = moving ? requestAnimationFrame(frame) : 0;
  }
  function kick() { if (sh && !sh.raf) { sh.lastT = performance.now(); sh.raf = requestAnimationFrame(frame); } }
  function stop() { if (sh && sh.raf) cancelAnimationFrame(sh.raf); if (sh) sh.raf = 0; }

  function caption(a, dir) {
    sh.act = a; var b = sh.list[a], pct = pctOf(b);
    MV.save('bsLast', b.key);
    var sub = [b.author, b.group].filter(Boolean).join(' / ').toUpperCase() || (KINDS[b.kind] || 'LIBRO').toUpperCase();
    var meta = (KINDS[b.kind] || 'Libro').toUpperCase() + ' — ' + (pct ? (pct >= 99 ? 'TERMINADO' : pct + '% LEÍDO') : 'SIN EMPEZAR');
    swap('bsT', clean(b.name), dir); swap('bsS', sub, dir); swap('bsY', meta, dir);
    var L = initial(b.name), AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', p = AZ.indexOf(L);
    var dot = document.getElementById('bsDot'); if (dot) dot.style.left = (p < 0 ? 0 : p / 25 * 100) + '%';
    [].forEach.call(sh.root.querySelectorAll('.bsruler .lt'), function (e) { e.classList.toggle('on', e.getAttribute('data-l') === L); });
  }
  function swap(id, text, dir) {
    var el = document.getElementById(id); if (!el) return;
    if (!dir || MV.lite) { el.textContent = text; return; }
    var old = el.cloneNode(true); old.removeAttribute('id'); old.classList.add('old');
    el.parentNode.appendChild(old); el.textContent = text;
    try {
      el.animate([{ transform: 'translateY(' + (dir * 105) + '%)' }, { transform: 'none' }], { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
      old.animate([{ transform: 'none' }, { transform: 'translateY(' + (-dir * 105) + '%)' }], { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' }).onfinish = function () { old.remove(); };
    } catch (e) { old.remove(); }
  }
  function step(d) { if (!sh) return; sh.T = Math.round(sh.T) + d; if (!sh.loop) sh.T = Math.max(0, Math.min(sh.n - 1, sh.T)); kick(); }
  function current() { return sh ? sh.list[mod(Math.round(sh.T), sh.n)] : null; }

  // ---------- Entrada ----------
  var moved = false;
  function onTapeClick(e) {
    if (moved) return;
    for (var j = 0; j < sh.slots.length; j++) if (sh.slots[j].el === e.currentTarget) {
      var r = Math.round(sh.slots[j].r);
      e.stopPropagation(); e.preventDefault();
      if (r === 0 && Math.abs(sh.T - sh.s) < .3) openDetail(); else { sh.T = Math.round(sh.T + sh.slots[j].r); kick(); }
      var st = document.getElementById('bsStage'); if (st) st.focus({ preventScroll: true });
      return;
    }
  }
  function bindInput() {
    var st = sh.root.querySelector('#bsStage');
    st.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      moved = false; sh.drag = { x: e.clientX, T0: sh.T, id: e.pointerId };
    });
    window.addEventListener('pointermove', pm, { passive: true });
    window.addEventListener('pointerup', pu);
    st.addEventListener('wheel', function (e) {
      var dlt = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!dlt) return; e.preventDefault();
      sh.T += dlt / (sh.ws + sh.gap) * .5; kick();
      clearTimeout(sh.wheelT); sh.wheelT = setTimeout(function () { if (sh) { sh.T = Math.round(sh.T); kick(); } }, 160);
    }, { passive: false });
  }
  function pm(e) {
    if (!sh || !sh.drag) return;
    var dx = e.clientX - sh.drag.x;
    if (Math.abs(dx) > 5) moved = true;
    if (moved) { sh.T = sh.drag.T0 - dx / (sh.ws + sh.gap); kick(); }
  }
  function pu() {
    if (!sh || !sh.drag) return;
    sh.drag = null; if (moved) { sh.T = Math.round(sh.T); kick(); setTimeout(function () { moved = false; }, 50); }
  }
  // ◀ ▶ con el estante enfocado (antes que la navegación general de la app)
  window.addEventListener('keydown', function (e) {
    if (!sh || !sh.root.isConnected || document.activeElement !== sh.root.querySelector('#bsStage')) return;
    if (MV.modalOpen && MV.modalOpen()) return;
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); step(k === 'ArrowLeft' ? -1 : 1); }
  }, true);
  window.addEventListener('resize', function () { if (sh && sh.root.isConnected) { measure(); kick(); frame(performance.now()); } });

  // ---------- Descripción: Google Books y, si no, Open Library ----------
  var DESC = null;
  function descCache() { if (!DESC) DESC = MV.load('bookDesc', {}) || {}; return DESC; }
  function stripTags(s) { var d = document.createElement('div'); d.innerHTML = String(s || '').replace(/<br\s*\/?>/gi, ' ').replace(/<\/p>/gi, ' '); return (d.textContent || '').replace(/\s+/g, ' ').trim(); }
  function splitTitle(b) {
    var t = clean(b.name || '').replace(/\.(pdf|epub|cbz|cbr|cb7|mobi|azw3?)$/i, '').replace(/[_]+/g, ' ').replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').trim(), a = b.author || '';
    var m = t.split(/\s+[-–—]\s+/);
    if (!a && m.length > 1) { a = m.slice(1).join(' '); t = m[0]; }
    return { t: t.replace(/\s+/g, ' ').trim(), a: a.trim() };
  }
  function getJSON(u) { return fetch(u).then(function (r) { if (!r.ok) throw 0; return r.json(); }); }
  function fetchDesc(b) {
    var c = descCache(), k = b.key;
    if (c[k] != null) return Promise.resolve(c[k]);
    var q = splitTitle(b); if (!q.t) return Promise.resolve('');
    var gq = 'intitle:' + q.t + (q.a ? ' inauthor:' + q.a : '');
    var google = getJSON('https://www.googleapis.com/books/v1/volumes?maxResults=5&printType=books&q=' + encodeURIComponent(gq)).then(function (j) {
      var best = '', es = '';
      (j.items || []).forEach(function (it) { var v = it.volumeInfo || {}, d = stripTags(v.description); if (d.length > 60) { if (!best) best = d; if (!es && v.language === 'es') es = d; } });
      return es || best;
    });
    var openlib = function () {
      return getJSON('https://openlibrary.org/search.json?limit=3&fields=key&title=' + encodeURIComponent(q.t) + (q.a ? '&author=' + encodeURIComponent(q.a) : '')).then(function (j) {
        var w = j.docs && j.docs[0] && j.docs[0].key; if (!w) return '';
        return getJSON('https://openlibrary.org' + w + '.json').then(function (x) { var d = x.description; return stripTags(typeof d === 'string' ? d : d && d.value); });
      });
    };
    return google.catch(function () { return ''; }).then(function (d) { return d || openlib().catch(function () { return ''; }); }).then(function (d) {
      d = (d || '').replace(/\s*\(?(Source|Fuente):.*$/i, '').slice(0, 1200);
      c[k] = d; MV.save('bookDesc', c); return d;
    });
  }
  api.fetchDesc = fetchDesc;

  // ---------- Ficha: crece desde la portada ----------
  function openDetail() {
    var b = current(); if (!b) return;
    sh.T = Math.round(sh.T); kick();
    var slot = sh.slots.filter(function (x) { return x.idx === mod(Math.round(sh.T), sh.n) && Math.abs(x.r) < .5; })[0];
    var rect = slot ? slot.cv.getBoundingClientRect() : null;
    var pct = pctOf(b), sub = [b.author, b.group].filter(Boolean).join(' / ').toUpperCase() || (KINDS[b.kind] || 'LIBRO').toUpperCase();
    MV.reg[b.key] = b;
    var syn = b.plot || b.desc || b.description || (descCache()[b.key] || '');
    var need = !syn && descCache()[b.key] == null;
    var html = '<button class="bsclose f" data-act="closeModal">CERRAR</button>' +
      '<div class="bsdl"><div class="m"><div class="s">' + esc(sub) + '</div></div>' +
      '<div class="m"><h2>' + esc(clean(b.name)) + '</h2></div>' +
      '<div class="m"><div class="y">' + esc((KINDS[b.kind] || 'Libro') + (b.fmt ? ' · ' + String(b.fmt).toUpperCase() : '') + ' · ' + (pct ? (pct >= 99 ? 'Terminado' : pct + '% leído') : 'Sin empezar')) + '</div></div>' +
      (syn ? '<div class="m"><p>' + esc(syn) + '</p></div>' : need ? '<div class="m" id="bsDescM"><p class="bswait">Buscando descripción…</p></div>' : '') +
      (pct ? '<div class="m"><div class="bsbar"><i style="width:' + pct + '%"></i></div></div>' : '') +
      '<div class="m"><div class="btns"><button class="btn f" data-act="openBook" data-arg="' + esc(b.key) + '" data-autofocus>' + IC.play + (pct && pct < 99 ? 'Continuar leyendo · ' + pct + '%' : 'Leer ahora') + '</button>' +
      (pct ? '<button class="btn ghost f" data-act="bookStart" data-arg="' + esc(b.key) + '">Desde el inicio</button>' : '') + '</div></div></div>' +
      '<div class="bsdp">' + coverHtml(b, true) + '</div>';
    MV.modal(html, {
      onOpen: function (d) {
        d.classList.add('bsdlg'); document.getElementById('modal').classList.add('bsm');
        if (rect && d.animate && !MV.lite) {
          var W = window.innerWidth, Hh = window.innerHeight;
          d.animate([{ clipPath: 'inset(' + rect.top + 'px ' + (W - rect.right) + 'px ' + (Hh - rect.bottom) + 'px ' + rect.left + 'px round 8px)' }, { clipPath: 'inset(0 round 0)' }], { duration: 1050, easing: 'cubic-bezier(.76,0,.18,1)' });
          [].forEach.call(d.querySelectorAll('.bsdl .m > *'), function (el, i) { el.animate([{ transform: 'translateY(110%)' }, { transform: 'none' }], { duration: 900, delay: 620 + i * 75, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' }); });
          var p = d.querySelector('.bsdp'); if (p) p.animate([{ transform: 'scale(.86)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 900, delay: 520, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
        }
        if (need) fetchDesc(b).then(function (txt) {
          var m = document.getElementById('bsDescM'); if (!m || !m.isConnected) return;
          if (!txt) { m.remove(); return; }
          m.innerHTML = '<p>' + esc(txt) + '</p>';
          var pp = m.firstChild; if (pp.animate) pp.animate([{ transform: 'translateY(40%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 700, easing: 'cubic-bezier(.2,.8,.2,1)' });
        });
      },
      onClose: function () { document.getElementById('modal').classList.remove('bsm'); var st = document.getElementById('bsStage'); if (st) setTimeout(function () { st.focus({ preventScroll: true }); }, 0); }
    });
  }
  MV.ACT.bsOpen = function () { if (!moved) openDetail(); };
  MV.ACT.bsStep = function (d) { step(+d); };
  MV.ACT.bookStart = function (key) {
    var all = MV.load('readPos', {}) || {}; delete all[key]; MV.save('readPos', all);
    MV.closeModal(true); MV.ACT.openBook(key);
  };
})();
