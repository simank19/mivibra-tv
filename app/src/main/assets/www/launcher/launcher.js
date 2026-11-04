/* Inicio MiVibra — launcher estilo consola para Android TV.
   Habla con Android por window.Launcher (LauncherBridge.kt). Sin Android (vista previa en el PC) usa datos de prueba. */
(function () {
  'use strict';

  var LB = window.Launcher || mock();
  var CFG = window.MV_CONFIG || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ---------------- Preferencias ----------------
  var KEY = 'mvl.prefs';
  var P = load();
  function load() {
    var d = { pins: null, interval: 60, blur: false, motion: true, sound: true };
    try { var s = JSON.parse(localStorage.getItem(KEY) || '{}'); for (var k in s) d[k] = s[k]; } catch (e) {}
    return d;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} }

  // Apps que se fijan solas la primera vez (si están instaladas)
  var DEFAULT_PINS = [
    'com.google.android.youtube.tv', 'com.google.android.youtube.googletv', 'com.netflix.ninja',
    'com.disney.disneyplus', 'com.amazon.amazonvideo.livingroom', 'com.hbo.hbonow', 'com.wbd.stream',
    'com.spotify.tv.android', 'com.google.android.apps.youtube.music', 'com.android.vending'
  ];

  // ---------------- Llamadas a Android ----------------
  var seq = 0, waits = {};
  function call(method) {
    var args = Array.prototype.slice.call(arguments, 1);
    return new Promise(function (ok, fail) {
      var id = 'c' + (++seq);
      waits[id] = { ok: ok, fail: fail };
      try { LB[method].apply(LB, [id].concat(args)); } catch (e) { delete waits[id]; fail(e); }
    });
  }

  var L = window.L = {
    _r: function (id, ok, data) {
      var w = waits[id]; if (!w) return; delete waits[id];
      if (ok) w.ok(data); else w.fail(new Error(String(data)));
    }
  };

  // ---------------- Estado ----------------
  var apps = [], byPkg = {}, view = 'home', moving = null, photos = [], lastFocus = {};

  // ---------------- Utilidades ----------------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var toastT;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 2600);
  }

  // Sonido corto al moverse (WebAudio, sin archivos)
  var ac = null;
  function blip(f) {
    if (!P.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      var o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      o.type = 'sine'; o.frequency.setValueAtTime(f || 740, t);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.08);
    } catch (e) {}
  }

  // ---------------- Reloj, saludo, clima, red ----------------
  function tick() {
    var d = new Date(), h = d.getHours();
    $('#clock').textContent = d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
    $('#greet').textContent = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    var ds = d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
    $('#date').textContent = ds.charAt(0).toUpperCase() + ds.slice(1);
  }

  // TODO Brandon: ciudad del clima fija en Bogotá; se puede volver un ajuste.
  var CITY = { lat: 4.711, lon: -74.072 };
  function weather() {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=' + CITY.lat + '&longitude=' + CITY.lon + '&current=temperature_2m,weather_code&timezone=auto')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var c = j.current || {}, w = c.weather_code;
        var ic = w === 0 ? '☀️' : w <= 3 ? '⛅' : w <= 48 ? '🌫️' : w <= 67 ? '🌧️' : w <= 77 ? '❄️' : w <= 82 ? '🌦️' : '⛈️';
        if (c.temperature_2m != null) $('#weather').textContent = ic + ' ' + Math.round(c.temperature_2m) + '°';
      }).catch(function () {});
  }

  function status() {
    try {
      var s = JSON.parse(LB.status());
      var n = $('#net'); n.className = 'net ' + (s.net === 'ethernet' ? 'ethernet' : s.net === 'none' ? 'none' : 'wifi');
    } catch (e) {}
  }

  // ---------------- Apps ----------------
  function loadApps() {
    return call('apps').then(function (list) {
      apps = list || []; byPkg = {};
      apps.forEach(function (a) { byPkg[a.pkg] = a; });
      if (!P.pins) {
        P.pins = DEFAULT_PINS.filter(function (p) { return byPkg[p]; });
        if (P.pins.length < 4) apps.filter(function (a) { return a.tv && P.pins.indexOf(a.pkg) < 0; }).slice(0, 6 - P.pins.length).forEach(function (a) { P.pins.push(a.pkg); });
        save();
      }
      P.pins = P.pins.filter(function (p) { return byPkg[p]; });
      renderPins(); renderAll();
    }).catch(function (e) { toast('No se pudieron leer las apps: ' + e.message); });
  }

  function tileHtml(a, extra) {
    var bn = a.banner ? '<i class="bn" style="background-image:url(\'' + a.banner + '\')"></i>' : '<i class="ic" style="background-image:url(\'' + (a.icon || '') + '\')"></i>';
    var pin = extra && P.pins && P.pins.indexOf(a.pkg) >= 0 ? '<i class="pin">★</i>' : '';
    return '<button class="f tile app' + (a.banner ? ' has-bn' : '') + '" data-pkg="' + esc(a.pkg) + '">' + bn + pin + '<span class="lb">' + esc(a.label) + '</span></button>';
  }

  function renderPins() {
    var h = '<button class="f tile hero" data-act="mivibra"><img src="../img/isotipo.svg" alt=""><span class="hx"><b>MiVibra TV</b><span>Películas, series y en vivo</span></span></button>';
    (P.pins || []).forEach(function (p) { if (byPkg[p]) h += tileHtml(byPkg[p]); });
    h += '<button class="f tile add" data-view="apps"><i class="ic" style="background-image:url(&quot;data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'%23F3EFEA\'%3E%3Cpath d=\'M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm11 0h2v3h3v2h-3v3h-2v-3h-3v-2h3z\'/%3E%3C/svg%3E&quot;)"></i><span class="lb">Todas las apps</span></button>';
    $('#pins').innerHTML = h;
  }

  function renderAll() {
    var g = $('#all');
    g.innerHTML = apps.length ? apps.map(function (a) { return tileHtml(a, true); }).join('') : '<div class="empty">Cargando apps…</div>';
  }

  // ---------------- Entradas HDMI ----------------
  function renderInputs() {
    var list = [];
    try { list = JSON.parse(LB.inputs()); } catch (e) {}
    list.sort(function (a, b) { return a.label.localeCompare(b.label, 'es', { numeric: true }); });
    $('#inputs-h').hidden = !list.length;
    $('#inputs').innerHTML = list.map(function (i) {
      var t = i.type === 'hdmi' ? 'HDMI' : i.type === 'av' ? 'AV' : i.type === 'pc' ? 'PC' : 'Entrada';
      return '<button class="f tile input" data-input="' + esc(i.id) + '"><span class="it">' + esc(i.label) + '</span>' + (i.label.toUpperCase().indexOf(t) === 0 ? '' : '<span class="st">' + t + '</span>') + '</button>';
    }).join('');
  }

  // ---------------- Fondos ----------------
  var wallIdx = -1, wallLayer = 0, wallT = null, order = [];
  function loadPhotos() {
    try { photos = JSON.parse(LB.photos()) || []; } catch (e) { photos = []; }
    document.documentElement.classList.toggle('has-photos', photos.length > 0);
    $('#photos-sub').textContent = photos.length
      ? photos.length + (photos.length === 1 ? ' foto' : ' fotos') + ' en la TV · se van turnando como fondo'
      : 'Sube fotos desde tu celular (galería o Google Fotos) y se van turnando como fondo';
    $('#thumbs').innerHTML = photos.length ? photos.map(function (p) {
      return '<button class="f tile photo" data-photo="' + esc(p) + '"><i class="bn" style="background-image:url(\'' + esc(p) + '\')"></i></button>';
    }).join('') : '<div class="empty">Todavía no hay fotos. Usa “Subir desde el celular”.</div>';
    order = shuffle(photos.slice()); wallIdx = -1;
    if (!photos.length) { $('#ph0').classList.remove('on'); $('#ph1').classList.remove('on'); }
    nextWall();
  }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function nextWall(force) {
    clearTimeout(wallT);
    if (!order.length) return;
    wallIdx = (wallIdx + 1) % order.length;
    showWall(force || order[wallIdx]);
    if (order.length > 1) wallT = setTimeout(function () { nextWall(); }, Math.max(15, P.interval) * 1000);
  }
  function showWall(src) {
    var img = new Image();
    img.onload = function () {
      var next = $('#ph' + (1 - wallLayer)), cur = $('#ph' + wallLayer);
      next.style.backgroundImage = 'url("' + src + '")';
      next.classList.add('on'); cur.classList.remove('on');
      wallLayer = 1 - wallLayer;
    };
    img.src = src;
  }

  function applyPrefs() {
    var h = document.documentElement;
    h.classList.toggle('blur', !!P.blur);
    h.classList.toggle('motion', !!P.motion);
    $('#o-int').textContent = P.interval >= 60 ? (P.interval / 60) + ' min' : P.interval + ' s';
    $('#o-blur').textContent = P.blur ? 'Sí' : 'No';
    $('#o-motion').textContent = P.motion ? 'Sí' : 'No';
    $('#o-sound').textContent = P.sound ? 'Sí' : 'No';
  }

  // ---------------- Google Fotos ----------------
  var photoFlow = 0;
  function qrImg(text) {
    try { var q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createDataURL(6, 0); } catch (e) { return ''; }
  }

  function connectPhotos() {
    var flow = ++photoFlow;
    modal('<h3>Google Fotos</h3><p>Pidiendo permiso a la cuenta de Google de la TV…</p><div class="spin"></div>', true);
    call('photosAuth').then(function (token) {
      if (flow !== photoFlow) return;
      return pick(flow, token);
    }).catch(function (e) {
      if (flow !== photoFlow || /cancel/i.test(e.message)) return;
      modal('<h3>Google Fotos aún no está activado</h3><p>Falta activar Google Fotos para MiVibra en Google Cloud (guía en docs/LAUNCHER.md).</p><p style="font-size:.95rem;opacity:.7">' + esc(e.message) + '</p><p>Mientras tanto puedes subir tus fotos desde el celular: ahí también puedes elegirlas de Google Fotos.</p><div class="acts"><button class="f opt primary" data-act="upload">📱 Subir desde el celular</button><button class="f opt" data-act="close">Cerrar</button></div>');
    });
  }

  // Subir desde el celular: QR a un servidor en la TV, sin cuentas ni configuración
  var uploading = false, upCount = 0, upT = null;
  function startUpload() {
    var r = {};
    try { r = JSON.parse(LB.uploadStart()); } catch (e) { r = { error: e.message }; }
    if (!r.url) return modal('<h3>No se pudo abrir la subida</h3><p>' + esc(r.error || '') + '</p><div class="acts"><button class="f opt" data-act="close">Cerrar</button></div>');
    uploading = true; upCount = 0;
    modal('<h3>Sube fotos desde tu celular</h3><div class="qr-wrap"><div class="qr"><img src="' + qrImg(r.url) + '" alt=""></div><div><p>Con el celular en el mismo Wi-Fi, escanea el código o abre:</p><div class="code" style="font-size:1.5rem;letter-spacing:0">' + esc(r.url.replace('http://', '').replace(/\/$/, '')) + '</div><p style="margin-top:1rem">Elige fotos de tu galería o de Google Fotos.</p></div></div><p id="upst">Esperando fotos…</p><div class="acts"><button class="f opt primary" data-act="close">Listo</button></div>');
  }
  L.onPhotoUploaded = function (n) {
    upCount = n;
    var st = $('#upst'); if (st) st.textContent = n + (n === 1 ? ' foto recibida' : ' fotos recibidas') + ' ✓';
    clearTimeout(upT); upT = setTimeout(function () { var had = photos.length; loadPhotos(); if (!had) nextWall(); }, 1200);
  };
  function stopUpload() {
    if (!uploading) return;
    uploading = false; try { LB.uploadStop(); } catch (e) {}
    if (upCount) { loadPhotos(); toast(upCount + (upCount === 1 ? ' foto lista' : ' fotos listas') + ' como fondo'); }
  }

  function pick(flow, token) {
    return call('photosSession', token).then(function (s) {
      if (flow !== photoFlow) return;
      var poll = parseFloat(((s.pollingConfig || {}).pollInterval || '5s')) * 1000 || 5000;
      modal('<h3>Elige tus fotos</h3><div class="qr-wrap"><div class="qr"><img src="' + qrImg(s.pickerUri) + '" alt=""></div><div><p>Escanea este código con tu celular para abrir <b>Google Fotos</b> y elegir las fotos del fondo.</p><p>Cuando termines, toca <b>Listo</b> en el celular.</p></div></div><div id="pg"></div><div class="acts"><button class="f opt" data-act="close">Cancelar</button></div>');
      return call('photosWait', token, s.id, poll);
    }).then(function (n) {
      if (flow !== photoFlow) return;
      closeModal(); loadPhotos();
      toast(+n ? n + ' fotos listas como fondo' : 'No se agregaron fotos');
      if (+n) { nextWall(); }
    });
  }

  L.onPhotosProgress = function (done, total) {
    var pg = $('#pg'); if (!pg) return;
    pg.innerHTML = '<p>' + (total ? 'Descargando ' + done + ' de ' + total + '…' : 'Preparando las fotos…') + '</p><div class="bar"><i style="width:' + (total ? Math.round(done * 100 / total) : 5) + '%"></i></div>';
    var c = $('[data-act="close"]', $('#modal')); if (c) c.parentNode.hidden = true;
  };

  // ---------------- Modal ----------------
  var modalPrev = null;
  function modal(html, noFocus) {
    var m = $('#modal');
    if (m.hidden) modalPrev = document.activeElement;
    m.innerHTML = '<div class="box">' + html + '</div>'; m.hidden = false;
    var f = $('.f', m); if (f && !noFocus) f.focus(); else document.activeElement && document.activeElement.blur && document.activeElement.blur();
  }
  function closeModal() {
    var m = $('#modal'); if (m.hidden) return;
    m.hidden = true; m.innerHTML = '';
    if (modalPrev && document.body.contains(modalPrev)) modalPrev.focus(); else focusDefault();
  }
  function cancelFlows() { photoFlow++; try { LB.photosCancel(); } catch (e) {} stopUpload(); }

  function menuFor(el) {
    if (!el) return;
    var pkg = el.getAttribute('data-pkg'), ph = el.getAttribute('data-photo');
    if (pkg) {
      var pinned = P.pins.indexOf(pkg) >= 0, a = byPkg[pkg] || { label: pkg };
      modal('<h3>' + esc(a.label) + '</h3><div class="menu">' +
        '<button class="f opt" data-m="open">Abrir</button>' +
        '<button class="f opt" data-m="pin">' + (pinned ? 'Quitar de Destacados' : 'Fijar en Destacados') + '</button>' +
        (pinned ? '<button class="f opt" data-m="move">Mover en Destacados</button>' : '') +
        '<button class="f opt" data-m="info">Información de la app</button></div>');
      $('#modal').onclick = function (ev) {
        var b = ev.target.closest('[data-m]'); if (!b) return;
        var m = b.getAttribute('data-m'); closeModal();
        if (m === 'open') openApp(pkg);
        else if (m === 'pin') { if (pinned) P.pins.splice(P.pins.indexOf(pkg), 1); else P.pins.push(pkg); save(); renderPins(); renderAll(); toast(pinned ? 'Quitada de Destacados' : 'Fijada en Destacados'); refocus(pkg); }
        else if (m === 'move') startMove(pkg);
        else if (m === 'info') LB.appInfo(pkg);
      };
    } else if (ph) {
      modal('<h3>Foto</h3><div class="menu"><button class="f opt" data-m="use">Usar ahora de fondo</button><button class="f opt danger" data-m="del">Borrar de la TV</button></div>');
      $('#modal').onclick = function (ev) {
        var b = ev.target.closest('[data-m]'); if (!b) return;
        var m = b.getAttribute('data-m'); closeModal();
        if (m === 'use') { showWall(ph); toast('Fondo cambiado'); }
        else if (m === 'del') { LB.deletePhoto(ph); loadPhotos(); focusDefault(); }
      };
    }
  }

  function refocus(pkg) {
    var sel = '[data-pkg="' + pkg + '"]';
    var el = view === 'home' ? $('#pins ' + sel) : $('#all ' + sel);
    (el || $('.f', $('#v-' + view)) || $('.tab')).focus();
  }

  // Mover una app fijada con izquierda/derecha
  function startMove(pkg) {
    show('home'); moving = pkg;
    var el = $('#pins [data-pkg="' + pkg + '"]'); if (!el) return;
    el.classList.add('moving'); el.focus(); toast('Mueve con ← → y presiona OK');
  }
  function moveBy(d) {
    var i = P.pins.indexOf(moving), j = i + d;
    if (i < 0 || j < 0 || j >= P.pins.length) return;
    P.pins.splice(i, 1); P.pins.splice(j, 0, moving); save(); renderPins();
    var el = $('#pins [data-pkg="' + moving + '"]'); el.classList.add('moving'); el.focus(); scrollTo(el); blip(520);
  }
  function endMove() { moving = null; renderPins(); renderAll(); var p = P.pins; refocus(p[0] || ''); }

  // ---------------- Vistas ----------------
  function show(v) {
    if (v === view) return;
    if (document.activeElement && document.activeElement.classList.contains('f')) lastFocus[view] = document.activeElement;
    view = v;
    $$('.view').forEach(function (s) { s.hidden = s.id !== 'v-' + v; });
    $$('.tab').forEach(function (t) { t.classList.toggle('cur', t.getAttribute('data-view') === v); });
  }
  function focusDefault() {
    var prev = lastFocus[view];
    if (prev && document.body.contains(prev) && prev.offsetParent) return prev.focus();
    var el = view === 'home' ? $('#pins .f') : $('.f', $('#v-' + view));
    (el || $('.tab')).focus();
  }

  function openApp(pkg) {
    blip(980);
    if (!LB.launch(pkg)) toast('No se pudo abrir la app');
  }

  function activate(el) {
    if (!el) return;
    if (moving) return endMove();
    var v = el.getAttribute('data-view'), act = el.getAttribute('data-act');
    if (el.getAttribute('data-pkg')) return openApp(el.getAttribute('data-pkg'));
    if (el.getAttribute('data-input')) { blip(980); if (!LB.openInput(el.getAttribute('data-input'))) toast('No se pudo abrir la entrada'); return; }
    if (el.getAttribute('data-photo')) return menuFor(el);
    if (v) { show(v); return focusDefault(); }
    switch (act) {
      case 'mivibra': blip(980); LB.openMiVibra(); break;
      case 'settings': LB.openSettings(''); break;
      case 'gphotos': connectPhotos(); break;
      case 'upload': photoFlow++; startUpload(); break;
      case 'close': cancelFlows(); closeModal(); break;
      case 'interval': var steps = [15, 30, 60, 300, 900]; P.interval = steps[(steps.indexOf(P.interval) + 1) % steps.length]; save(); applyPrefs(); nextWall(); break;
      case 'blur': P.blur = !P.blur; save(); applyPrefs(); break;
      case 'motion': P.motion = !P.motion; save(); applyPrefs(); break;
      case 'sound': P.sound = !P.sound; save(); applyPrefs(); blip(); break;
      case 'clearphotos':
        if (!photos.length) return toast('No hay fotos');
        modal('<h3>¿Borrar todas las fotos?</h3><p>Se borran de la TV, no de tu Google Fotos.</p><div class="acts"><button class="f opt" data-act="close">No</button><button class="f opt danger" data-act="clearyes">Sí, borrar</button></div>');
        break;
      case 'clearyes': LB.clearPhotos(); closeModal(); loadPhotos(); toast('Fotos borradas'); break;
    }
  }

  // ---------------- Navegación con el control ----------------
  function scope() { var m = $('#modal'); return m.hidden ? document.body : m; }
  function visible(el) { return el.offsetParent !== null && !el.closest('[hidden]'); }
  function scrollTo(el) {
    var row = el.closest('.row, .grid');
    if (!row) return;
    var r = el.getBoundingClientRect(), b = row.getBoundingClientRect(), pad = el.offsetWidth * 0.3;
    if (row.classList.contains('row')) {
      if (r.left < b.left + pad) row.scrollLeft -= (b.left + pad - r.left) + 40;
      else if (r.right > b.right - pad) row.scrollLeft += (r.right - (b.right - pad)) + 40;
    } else {
      if (r.top < b.top + 20) row.scrollTop -= (b.top + 20 - r.top);
      else if (r.bottom > b.bottom - 40) row.scrollTop += (r.bottom - (b.bottom - 40));
    }
  }
  function move(dir) {
    var cur = document.activeElement, sc = scope();
    var all = $$('.f', sc).filter(visible);
    if (!cur || !sc.contains(cur) || !cur.classList.contains('f')) { if (all[0]) { all[0].focus(); } return; }
    var r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var best = null, bestS = 1e9;
    all.forEach(function (el) {
      if (el === cur) return;
      var q = el.getBoundingClientRect(), x = q.left + q.width / 2, y = q.top + q.height / 2, dx = x - cx, dy = y - cy, p, s;
      if (dir === 'right') { if (q.left < r.right - r.width * 0.3 || dx <= 1) return; p = dx; s = Math.abs(dy); }
      else if (dir === 'left') { if (q.right > r.left + r.width * 0.3 || dx >= -1) return; p = -dx; s = Math.abs(dy); }
      else if (dir === 'down') { if (q.top < r.bottom - r.height * 0.3 || dy <= 1) return; p = dy; s = Math.abs(dx); }
      else { if (q.bottom > r.top + r.height * 0.3 || dy >= -1) return; p = -dy; s = Math.abs(dx); }
      // En la misma fila pesa mucho no cambiar de fila; entre filas, ir a la más cercana
      var sc2 = (dir === 'left' || dir === 'right') ? p + s * 4 : p + s * 0.6;
      if (sc2 < bestS) { bestS = sc2; best = el; }
    });
    // Subir a la barra: ir a la pestaña actual
    if (best && best.classList.contains('tab') && !cur.classList.contains('tab')) best = $('.tab.cur') || best;
    if (best) { best.focus(); scrollTo(best); blip(); }
  }

  var enterAt = 0, enterEl = null, held = false;
  document.addEventListener('keydown', function (e) {
    var k = e.key;
    if (moving && (k === 'ArrowLeft' || k === 'ArrowRight')) { e.preventDefault(); return moveBy(k === 'ArrowLeft' ? -1 : 1); }
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault(); move(k.replace('Arrow', '').toLowerCase()); return;
    }
    if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      if (!e.repeat) { enterAt = Date.now(); enterEl = document.activeElement; held = false; }
      else if (!held && Date.now() - enterAt > 650 && enterEl && enterEl.closest('#pins, #all, #thumbs')) { held = true; menuFor(enterEl); }
      return;
    }
    if (k === 'ContextMenu') { e.preventDefault(); L.onMenu(); }
  });
  document.addEventListener('keyup', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (held) { held = false; return; }
    if (enterEl && enterEl === document.activeElement) activate(enterEl);
    enterEl = null;
  });
  // Toque o mouse (celular, tablet o vista previa)
  document.addEventListener('click', function (e) {
    if (e.detail === 0) return; // los "click" del teclado ya se manejan arriba
    var el = e.target.closest('.f'); if (el) { el.focus(); activate(el); }
  });
  document.addEventListener('focusin', function (e) {
    if (view === 'home' && e.target.closest && e.target.closest('#pins')) lastFocus.home = e.target;
  });

  // ---------------- Eventos desde Android ----------------
  L.onBack = function () {
    if (!$('#modal').hidden) { cancelFlows(); return closeModal(); }
    if (moving) return endMove();
    if (view !== 'home') { show('home'); return focusDefault(); }
    var first = $('#pins .f'); if (first) { first.focus(); $('#pins').scrollLeft = 0; }
  };
  L.onHome = function () {
    cancelFlows(); closeModal(); if (moving) endMove();
    show('home'); var first = $('#pins .f'); $('#pins').scrollLeft = 0; if (first) first.focus();
  };
  L.onMenu = function () { if ($('#modal').hidden) menuFor(document.activeElement); };
  L.onResume = function () { tick(); status(); renderInputs(); if (!wallT && order.length > 1) nextWall(); if (!document.activeElement || document.activeElement === document.body) focusDefault(); };
  L.onPause = function () { clearTimeout(wallT); wallT = null; };
  L.onAppsChanged = function () { loadApps(); };

  // ---------------- Arranque ----------------
  applyPrefs(); tick(); status(); weather(); renderInputs(); loadPhotos(); renderPins();
  $('.tab[data-view="home"]').classList.add('cur');
  loadApps().then(function () { focusDefault(); });
  setInterval(tick, 15000);
  setInterval(weather, 30 * 60 * 1000);
  setInterval(status, 20000);

  // ---------------- Vista previa sin Android ----------------
  function mock() {
    var names = ['YouTube', 'Netflix', 'Disney+', 'Prime Video', 'Max', 'Spotify', 'Play Store', 'Ajustes', 'Navegador', 'Archivos', 'Twitch', 'Kick'];
    var list = names.map(function (n, i) { return { pkg: 'demo.' + i, label: n, banner: '', icon: '', tv: true }; });
    return {
      apps: function (id) { setTimeout(function () { L._r(id, true, list); }, 50); },
      launch: function () { return true; }, appInfo: function () {}, inputs: function () { return JSON.stringify([{ id: 'h1', label: 'HDMI 1', type: 'hdmi' }, { id: 'h2', label: 'HDMI 2', type: 'hdmi' }, { id: 'av', label: 'AV', type: 'av' }]); },
      openInput: function () { return true; }, openMiVibra: function () {}, openSettings: function () {},
      status: function () { return '{"net":"wifi"}'; }, toast: function () {},
      photos: function () { return '[]'; }, deletePhoto: function () {}, clearPhotos: function () {},
      photosAuth: function (id) { setTimeout(function () { L._r(id, false, '"Vista previa"'); }, 300); },
      photosCancel: function () {},
      uploadStart: function () { return '{"url":"http://192.168.0.3:8766/"}'; }, uploadStop: function () {}
    };
  }
})();
