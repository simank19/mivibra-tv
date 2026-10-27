/* MiVibra TV — núcleo: puente nativo, almacenamiento, navegación con control remoto, modales. */
(function () {
  'use strict';
  var MV = window.MV = window.MV || {};
  var D = window.MVD;

  // ---------- Utilidades ----------
  MV.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
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
    var el = root.querySelector('[data-autofocus].f') || root.querySelector('.f.on') || root.querySelector('.main .f') || root.querySelector('.f');
    if (el) { el.focus({ preventScroll: true }); reveal(el); }
  };
  var fastMove = false;
  function reveal(el) {
    // Al mantener presionada la flecha el desplazamiento es instantáneo (con animación se trababa)
    var b = fastMove || document.documentElement.classList.contains('no-anim') ? 'instant' : 'smooth';
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: b }); } catch (e) { el.scrollIntoView(false); }
  }
  MV.move = function (dir) {
    var root = MV.scope(), cur = document.activeElement;
    var all = Array.prototype.filter.call(root.querySelectorAll('.f'), function (el) { return !el.disabled && visible(el); });
    if (!cur || !root.contains(cur) || all.indexOf(cur) < 0) { if (all[0]) { all[0].focus(); reveal(all[0]); } return; }
    var c = cur.getBoundingClientRect(), cx = c.left + c.width / 2, cy = c.top + c.height / 2;
    var best = null, bestScore = Infinity, vh = window.innerHeight, inSide = !!cur.closest('.side');
    all.forEach(function (el) {
      if (el === cur) return;
      var r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (Math.abs(y - cy) > vh * 1.6) return;                       // solo lo cercano: más rápido con miles de tarjetas
      // Desde el contenido, el menú lateral solo se alcanza con ◀ (no saltando desde un botón a la derecha)
      if (!inSide && dir !== 'left' && el.closest('.side')) return;
      var dx = x - cx, dy = y - cy, primary, secondary, overlap;
      if (dir === 'left') { if (r.right > c.left + 2 && dx >= -2) return; primary = c.left - r.right; secondary = Math.abs(dy); overlap = r.bottom > c.top && r.top < c.bottom; }
      else if (dir === 'right') { if (r.left < c.right - 2 && dx <= 2) return; primary = r.left - c.right; secondary = Math.abs(dy); overlap = r.bottom > c.top && r.top < c.bottom; }
      else if (dir === 'up') { if (r.bottom > c.top + 2 && dy >= -2) return; primary = c.top - r.bottom; secondary = Math.abs(dx); overlap = r.right > c.left && r.left < c.right; }
      else { if (r.top < c.bottom - 2 && dy <= 2) return; primary = r.top - c.bottom; secondary = Math.abs(dx); overlap = r.right > c.left && r.left < c.right; }
      if (primary < -4) return;
      var score = Math.max(primary, 0) + secondary * (overlap ? 0.3 : 2.2);
      if (score < bestScore) { bestScore = score; best = el; }
    });
    if (best) { best.focus({ preventScroll: true }); reveal(best); }
    else if (dir === 'down' || dir === 'up') {
      var main = document.querySelector('.main');
      if (main && !MV.modalOpen()) main.scrollBy({ top: dir === 'down' ? 240 : -240, behavior: 'smooth' });
    }
  };

  document.addEventListener('keydown', function (e) {
    var k = e.key, t = e.target;
    var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    var dirs = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    if (dirs[k]) {
      if (typing && (k === 'ArrowLeft' || k === 'ArrowRight') && t.value && t.selectionStart != null) {
        var atStart = t.selectionStart === 0, atEnd = t.selectionEnd === t.value.length;
        if ((k === 'ArrowLeft' && !atStart) || (k === 'ArrowRight' && !atEnd)) return;
      }
      e.preventDefault();
      if (e.repeat) { var now = Date.now(); if (now - (MV._lastMove || 0) < 70) return; MV._lastMove = now; }
      fastMove = !!e.repeat; MV.move(dirs[k]); fastMove = false; return;
    }
    if (k === 'Enter' && !typing && t && t.classList && t.classList.contains('f') && t.tagName !== 'BUTTON' && t.tagName !== 'A') {
      e.preventDefault(); t.click(); return;
    }
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
