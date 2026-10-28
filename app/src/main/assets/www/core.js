/* MiVibra TV — núcleo: puente nativo, almacenamiento, navegación con control remoto, modales. */
(function () {
  'use strict';
  var MV = window.MV = window.MV || {};
  var D = window.MVD;

  // ---------- Utilidades ----------
  // Sin emojis en la interfaz (los de las listas como "⭐Acción" también); solo el tema de celebración los usa
  var EMOJI = /[\uD83C-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u2604\u2606-\u2612\u2614-\u262F\u2631-\u2712\u2714\u2716-\u27BF\u2B50\u2B55\uFE0F\u200D\u20E3]/g;
  MV.noEmoji = function (s) { return String(s == null ? '' : s).replace(EMOJI, '').replace(/\s{2,}/g, ' ').trim(); };
  MV.esc = function (s) {
    return MV.noEmoji(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  MV.norm = function (s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\b(hd|fhd|uhd|4k|sd|hevc|h265|1080p?|720p?|backup|alt)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  };
  MV.hash = function (s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  MV.hue = function (s) { return D.HUES[parseInt(MV.hash(s), 36) % D.HUES.length]; };
  MV.mono = function (name) {
    var w = String(name || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
    if (!w.length) return '?';
    if (w.length === 1) return w[0].slice(0, 3).toUpperCase();
    return (w[0][0] + w[1][0] + (w[2] ? w[2][0] : '')).toUpperCase();
  };
  MV.fmtTime = function (ms) { var d = new Date(ms); return d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }); };
  MV.fmtDur = function (ms) { var m = Math.round(ms / 60000); return m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m + ' min'; };
  MV.ago = function (ts) {
    var m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'ahora'; if (m < 60) return 'hace ' + m + ' min';
    var h = Math.round(m / 60); if (h < 24) return 'hace ' + h + ' h';
    return 'hace ' + Math.round(h / 24) + ' d';
  };
  MV.debounce = function (fn, ms) { var t; return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms); }; };
  MV.sha256 = function (txt) {
    if (!window.crypto || !crypto.subtle) return Promise.resolve(MV.hash('mv:' + txt));
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode('mivibra:' + txt)).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    });
  };

  // ---------- Almacenamiento ----------
  MV.load = function (k, def) { try { var v = localStorage.getItem('mv:' + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } };
  MV.save = function (k, v) { try { localStorage.setItem('mv:' + k, JSON.stringify(v)); } catch (e) { console.warn('save', k, e); } };

  // IndexedDB para catálogos grandes (miles de canales)
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var r = indexedDB.open('mivibra', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  MV.idbGet = function (k) {
    return db().then(function (d) { return new Promise(function (res) { var r = d.transaction('kv').objectStore('kv').get(k); r.onsuccess = function () { res(r.result); }; r.onerror = function () { res(undefined); }; }); }).catch(function () { return undefined; });
  };
  MV.idbSet = function (k, v) {
    return db().then(function (d) { return new Promise(function (res) { var t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = res; }); }).catch(function () {});
  };
  MV.idbDel = function (k) {
    return db().then(function (d) { return new Promise(function (res) { var t = d.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = res; t.onerror = res; }); }).catch(function () {});
  };

  // ---------- Puente nativo (window.Android) ----------
  var A = window.Android;
  MV.native = !!A;
  var seq = 0, waiting = {}, progressCb = {};
  MV._cb = function (id, res) {
    var w = waiting[id]; if (!w) { if (id === 'open-intent' && res.ok) MV.onOpenFile && MV.onOpenFile(res.data); return; }
    delete waiting[id]; delete progressCb[id];
    if (res.ok) w.res(res.data); else w.rej(new Error(typeof res.data === 'string' ? res.data : (res.data && res.data.status ? 'HTTP ' + res.data.status : 'Error')));
  };
  MV._progress = function (id, pct) { var f = progressCb[id]; if (f) f(pct); };
  function call(method, args, onProgress) {
    return new Promise(function (res, rej) {
      var id = 'c' + (++seq);
      waiting[id] = { res: res, rej: rej };
      if (onProgress) progressCb[id] = onProgress;
      try { A[method].apply(A, [id].concat(args)); } catch (e) { delete waiting[id]; rej(e); }
    });
  }
  MV.call = call;

  // Navegador de escritorio (para probar la interfaz): fetch directo
  function webFetch(url, headers) {
    return fetch(url, { headers: headers || {} }).then(function (r) {
      return r.text().then(function (t) { if (!r.ok) throw new Error('HTTP ' + r.status); return t; });
    });
  }

  /** Texto corto (APIs JSON). */
  MV.getText = function (url, headers) {
    if (!A) return webFetch(url, headers);
    return call('httpGet', [url, JSON.stringify(headers || {}), 'text']).then(function (d) { return d.text; });
  };
  /** Archivos grandes (listas M3U, JSON de Xtream): se guardan en disco y se leen con fetch. */
  MV.getBig = function (url, headers) {
    if (!A) return webFetch(url, headers);
    return call('httpGet', [url, JSON.stringify(headers || {}), 'file']).then(function (d) {
      return fetch(d.path).then(function (r) { return r.text(); });
    });
  };
  MV.getJSON = function (url, headers, big) {
    return (big ? MV.getBig : MV.getText)(url, headers).then(function (t) { return JSON.parse(t); });
  };
  MV.device = (function () { try { return A ? JSON.parse(A.deviceInfo()) : { tv: false, touch: true, model: 'Navegador', version: 'web' }; } catch (e) { return { tv: false }; } })();
  MV.A = A;
  // En TV la interfaz se compacta (html.tv)
  try { if (MV.device.tv) document.documentElement.classList.add('tv'); } catch (e) {}
  // Equipos modestos (TV box de 2 GB como onn, Chromecast, Fire TV Lite): modo liviano
  MV.lite = !!(MV.device.tv && (MV.device.lowRam || (MV.device.ramMb && MV.device.ramMb < 3000)));
  try { if (MV.lite) document.documentElement.classList.add('lite'); } catch (e) {}

  // ---------- Avisos ----------
  MV.toast = function (msg, ms) {
    var box = document.getElementById('toast'), el = document.createElement('div');
    el.textContent = msg; box.appendChild(el);
    setTimeout(function () { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(function () { el.remove(); }, 450); }, ms || 2600);
  };

  // ---------- Modales ----------
  var modalStack = [];
  MV.modal = function (html, opts) {
    opts = opts || {};
    var m = document.getElementById('modal');
    modalStack.push({ html: html, opts: opts, focus: document.activeElement });
    m.innerHTML = '<div class="dialog glass" role="dialog" aria-modal="true">' + html + '</div>';
    m.classList.add('on');
    if (opts.onOpen) opts.onOpen(m.firstChild);
    MV.focusFirst(m);
    return m.firstChild;
  };
  MV.closeModal = function (silent) {
    var m = document.getElementById('modal');
    var top = modalStack.pop();
    if (!top) return false;
    if (top.opts.onClose && !silent) top.opts.onClose();
    if (modalStack.length) {
      var prev = modalStack[modalStack.length - 1];
      m.innerHTML = '<div class="dialog glass" role="dialog" aria-modal="true">' + prev.html + '</div>';
      if (prev.opts.onOpen) prev.opts.onOpen(m.firstChild);
      MV.focusFirst(m);
    } else {
      m.classList.remove('on'); m.innerHTML = '';
      if (top.focus && document.body.contains(top.focus)) top.focus.focus(); else MV.focusFirst();
    }
    return true;
  };
  MV.modalOpen = function () { return modalStack.length > 0; };
  MV.confirm = function (title, text, okLabel) {
    return new Promise(function (res) {
      MV._confirmRes = res;
      MV.modal('<h2>' + MV.esc(title) + '</h2><p>' + MV.esc(text || '') + '</p><div class="btns"><button class="btn f" data-act="confirmOk" data-autofocus>' + MV.esc(okLabel || 'Aceptar') + '</button><button class="btn ghost f" data-act="confirmNo">Cancelar</button></div>',
        { onClose: function () { if (MV._confirmRes) { MV._confirmRes(false); MV._confirmRes = null; } } });
    });
  };
  MV.prompt = function (title, label, value, type) {
    return new Promise(function (res) {
      MV._promptRes = res;
      MV.modal('<h2>' + MV.esc(title) + '</h2><label class="field">' + MV.esc(label || '') + '<input class="in f" id="promptIn" type="' + (type || 'text') + '" value="' + MV.esc(value || '') + '" data-autofocus></label><div class="btns"><button class="btn f" data-act="promptOk">Aceptar</button><button class="btn ghost f" data-act="confirmNo">Cancelar</button></div>',
        { onClose: function () { if (MV._promptRes) { MV._promptRes(null); MV._promptRes = null; } } });
    });
  };

  // ---------- Navegación espacial (control remoto, mando, teclado) ----------
  function visible(el) {
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  MV.scope = function () { var m = document.getElementById('modal'); return m.classList.contains('on') ? m : document.getElementById('app'); };
  MV.focusFirst = function (root) {
    root = root || MV.scope();
    // Primero el contenido (no el menú lateral): así el menú se cierra al elegir una sección
    var el = root.querySelector('[data-autofocus].f') || root.querySelector('.view-in .f.on') || root.querySelector('.view-in .f') || root.querySelector('.main .f') || root.querySelector('.f');
    if (el) { el.focus({ preventScroll: true }); reveal(el); }
  };
  var fastMove = false;
  function reveal(el) {
    // Al mantener presionada la flecha el desplazamiento es instantáneo (con animación se trababa)
    var b = fastMove || document.documentElement.classList.contains('no-anim') || document.documentElement.classList.contains('tv') ? 'instant' : 'smooth';
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: b }); } catch (e) { el.scrollIntoView(false); }
  }
  /** Contenedor que agrupa tarjetas (fila horizontal, cuadrícula, chips): se mide una vez en vez de medir cada tarjeta. */
  var GROUP = '.strip, .grid, .vgrid, .pgrid, .chips, .apps, .qbar, .side';
  function score(dir, c, cx, cy, r) {
    var x = r.left + r.width / 2, y = r.top + r.height / 2, dx = x - cx, dy = y - cy, primary, secondary, overlap;
    if (dir === 'left') { if (r.right > c.left + 2 && dx >= -2) return -1; primary = c.left - r.right; secondary = Math.abs(dy); overlap = r.bottom > c.top && r.top < c.bottom; }
    else if (dir === 'right') { if (r.left < c.right - 2 && dx <= 2) return -1; primary = r.left - c.right; secondary = Math.abs(dy); overlap = r.bottom > c.top && r.top < c.bottom; }
    else if (dir === 'up') { if (r.bottom > c.top + 2 && dy >= -2) return -1; primary = c.top - r.bottom; secondary = Math.abs(dx); overlap = r.right > c.left && r.left < c.right; }
    else { if (r.top < c.bottom - 2 && dy <= 2) return -1; primary = r.top - c.bottom; secondary = Math.abs(dx); overlap = r.right > c.left && r.left < c.right; }
    if (primary < -4) return -1;
    return Math.max(primary, 0) + secondary * (overlap ? 0.3 : 2.2);
  }
  function usable(el, r) { return !el.disabled && r.width > 0 && r.height > 0; }
  MV.move = function (dir) {
    var root = MV.scope(), cur = document.activeElement;
    if (!cur || !root.contains(cur) || !cur.classList || !cur.classList.contains('f')) {
      var first = Array.prototype.find.call(root.querySelectorAll('.f'), function (el) { return usable(el, el.getBoundingClientRect()); });
      if (first) { first.focus({ preventScroll: true }); reveal(first); }
      return;
    }
    var c = cur.getBoundingClientRect(), cx = c.left + c.width / 2, cy = c.top + c.height / 2;
    var vh = window.innerHeight, inSide = !!cur.closest('.side'), best = null, bestScore = Infinity;
    var myGroup = cur.closest(GROUP);
    function consider(el, clip) {
      if (el === cur) return;
      var r = el.getBoundingClientRect();
      if (!usable(el, r)) return;
      // En otras filas solo cuenta lo que se ve (no tarjetas escondidas por el desplazamiento de esa fila)
      if (clip && (r.right <= clip.left + 4 || r.left >= clip.right - 4)) return;
      var sc = score(dir, c, cx, cy, r);
      if (sc >= 0 && sc < bestScore) { bestScore = sc; best = el; }
    }
    // 1) ◀ ▶ dentro de la misma fila: solo se miran las tarjetas de esa fila
    if (myGroup && (dir === 'left' || dir === 'right')) {
      Array.prototype.forEach.call(myGroup.querySelectorAll('.f'), function (el) { consider(el); });
      if (best) { best.focus({ preventScroll: true }); reveal(best); return; }
    }
    // 2) El resto: se mide cada grupo una sola vez y solo se entra a los que están en esa dirección y cerca
    var groups = [], seen = new Set();
    Array.prototype.forEach.call(root.querySelectorAll('.f'), function (el) {
      var g = el.closest(GROUP);
      if (!g || !root.contains(g)) { consider2(el); return; }
      if (seen.has(g)) return; seen.add(g); groups.push(g);
    });
    function consider2(el) {
      if (!inSide && dir !== 'left' && el.closest('.side')) return;
      var r = el.getBoundingClientRect();
      if (Math.abs(r.top + r.height / 2 - cy) > vh * 1.6) return;
      consider(el);
    }
    groups.forEach(function (g) {
      if (g === myGroup && (dir === 'left' || dir === 'right')) return;
      // Desde el contenido, el menú lateral solo se alcanza con ◀
      if (!inSide && dir !== 'left' && g.classList.contains('side')) return;
      var r = g.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      if (r.top - cy > vh * 1.6 || cy - r.bottom > vh * 1.6) return;
      if (dir === 'down' && r.bottom <= c.bottom - 2 && g !== myGroup) return;
      if (dir === 'up' && r.top >= c.top + 2 && g !== myGroup) return;
      if (dir === 'left' && r.left >= c.left && g !== myGroup) return;
      if (dir === 'right' && r.right <= c.right && g !== myGroup) return;
      if (bestScore < Infinity) {
        // Si el grupo entero está más lejos que lo mejor encontrado, no vale la pena medir sus tarjetas
        var gap = dir === 'down' ? r.top - c.bottom : dir === 'up' ? c.top - r.bottom : dir === 'left' ? c.left - r.right : r.left - c.right;
        if (gap > bestScore) return;
      }
      var clip = g === myGroup ? null : { left: Math.max(r.left, 0), right: Math.min(r.right, window.innerWidth) };
      Array.prototype.forEach.call(g.querySelectorAll('.f'), function (el) { consider(el, clip); });
    });
    if (best) { best.focus({ preventScroll: true }); reveal(best); }
    else if (dir === 'down' || dir === 'up') {
      var main = document.querySelector('.main');
      if (main && !MV.modalOpen()) main.scrollBy({ top: dir === 'down' ? 240 : -240, behavior: fastMove ? 'instant' : 'smooth' });
    }
  };

  document.addEventListener('keydown', function (e) {
    var k = e.key, t = e.target;
    var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    var dirs = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    MV._lastKey = Date.now();
    if (dirs[k]) {
      if (typing && (k === 'ArrowLeft' || k === 'ArrowRight') && t.value && t.selectionStart != null) {
        var atStart = t.selectionStart === 0, atEnd = t.selectionEnd === t.value.length;
        if ((k === 'ArrowLeft' && !atStart) || (k === 'ArrowRight' && !atEnd)) return;
      }
      e.preventDefault();
      // Tecla sostenida: un paso por cuadro como máximo; si la TV va atrasada se descartan las repeticiones
      // (antes se acumulaban y el foco "seguía andando" o se quedaba pegado)
      if (e.repeat) {
        var now = Date.now();
        if (MV._movePending || now - (MV._lastMove || 0) < 85) return;
        MV._lastMove = now;
      }
      fastMove = !!e.repeat; MV.move(dirs[k]); fastMove = false;
      MV._movePending = true;
      requestAnimationFrame(function () { requestAnimationFrame(function () { MV._movePending = false; }); });
      return;
    }
    if (k === 'Enter' && !typing && t && t.classList && t.classList.contains('f') && t.tagName !== 'BUTTON' && t.tagName !== 'A') {
      e.preventDefault(); t.click(); return;
    }
    if (k === 'Enter' && typing) MV._typedAt = Date.now();
    if (k === 'Enter' && typing && t.id === 'searchIn') { e.preventDefault(); t.blur(); MV.move('down'); return; }
    if (k === 'Escape' && !MV.native) { e.preventDefault(); MV.onBack(); }
  });

  // Marca el foco para que se vea también cuando la WebView no aplica :focus-visible
  document.addEventListener('focusin', function (e) {
    var p = document.querySelector('.kf'); if (p) p.classList.remove('kf');
    if (e.target.classList && e.target.classList.contains('f')) e.target.classList.add('kf');
  });
  document.addEventListener('pointerdown', function () { var p = document.querySelector('.kf'); if (p) p.classList.remove('kf'); }, true);
})();
