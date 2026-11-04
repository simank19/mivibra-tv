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
    var d = { pins: null, interval: 60, blur: false, motion: true, sound: true, yt: true };
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

  // ---------------- Contenido sugerido: MiVibra TV ----------------
  function bg(url) { return url ? 'background-image:url(\'' + esc(url).replace(/'/g, '%27') + '\')' : ''; }
  function renderMiVibra() {
    var list = [];
    try { list = JSON.parse(LB.mivibraRecs()) || []; } catch (e) {}
    var cont = list.filter(function (i) { return i.play; }), recs = list.filter(function (i) { return !i.play; });
    function card(i) {
      return '<button class="f tile mv has-bn" data-mv="' + esc(i.play || i.key) + '" data-play="' + (i.play ? 1 : 0) + '">' +
        '<i class="bn" style="' + bg(i.poster) + '"></i>' +
        (i.pct ? '<span class="prog"><i style="width:' + Math.max(3, +i.pct) + '%"></i></span>' : '') +
        '<span class="lb">' + esc(i.title) + '</span></button>';
    }
    $('#mvc-h').hidden = !cont.length; $('#mvc').innerHTML = cont.map(card).join('');
    $('#mvr-h').hidden = !recs.length; $('#mvr').innerHTML = recs.map(card).join('');
  }

  // ---------------- Contenido sugerido: YouTube ----------------
  // Usa la clave de YouTube que ya tiene MiVibra TV (la pone el superadministrador). Tendencias en Colombia.
  function ytKey() { try { return LB.ytKey() || ''; } catch (e) { return ''; } }
  function ytAcct() { try { return JSON.parse(LB.ytConnected()); } catch (e) { return { on: false }; } }
  function canConnectYT() { return !!(CFG.tvClientId && CFG.tvClientSecret && LB.ytCode); }
  function vidCard(v) {
    return '<button class="f tile vid" data-yt="' + esc(v.id) + '"><i class="bn" style="' + bg(v.thumb) + '"></i><span class="yt">YouTube</span>' +
      '<span class="lb"><span class="tt">' + esc(v.title) + '</span><span class="ch">' + esc(v.channel) + '</span></span></button>';
  }
  function ytRow(row, title, items, cta) {
    var has = P.yt && items && items.length;
    $('#' + row + '-h').hidden = !has; $('#' + row + '-h').textContent = title || '';
    $('#' + row).innerHTML = has ? items.map(vidCard).join('') + (cta || '') : '';
  }
  var CTA = '<button class="f tile cta" data-act="ytconnect"><span class="yt">YouTube</span><b>Conectar mi YouTube</b><span>Tus suscripciones y tus me gusta aquí</span></button>';
  function renderTrends(items) { ytRow('yt', 'Tendencias en YouTube', items, canConnectYT() ? CTA : ''); ytRow('ytl', '', []); }
  function renderMine(d) {
    var who = d.name ? ' · ' + d.name : '';
    ytRow('yt', 'Nuevo de tus suscripciones' + who, d.subs || []);
    ytRow('ytl', 'Tus me gusta en YouTube', d.likes || []);
  }
  function getJSON(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function setJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var ytBusy = false;
  function loadYouTube(force) {
    applyPrefs();
    if (!P.yt || tvOfficial) { ytRow('yt', '', []); ytRow('ytl', '', []); return; }
    var acct = ytAcct();
    if (acct.on && canConnectYT()) {
      var m = getJSON('mvl.ytme');
      if (m && (m.subs || []).length) renderMine(m);
      if (!force && m && m.ts > Date.now() - 60 * 60e3) return;
      if (ytBusy) return; ytBusy = true;
      call('ytFeed', CFG.tvClientId, CFG.tvClientSecret).then(function (d) {
        ytBusy = false; d.ts = Date.now(); setJSON('mvl.ytme', d);
        if ((d.subs || []).length || (d.likes || []).length) renderMine(d); else trends();
      }).catch(function () { ytBusy = false; if (!ytAcct().on) { localStorage.removeItem('mvl.ytme'); trends(); } else if (!m) trends(); });
      return;
    }
    trends();
  }
  function trends() {
    var c = getJSON('mvl.yt');
    if (c && c.items) renderTrends(c.items);
    if (c && c.ts > Date.now() - 60 * 60e3) return;
    var key = ytKey(); if (!key) return;
    fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet&chart=mostPopular&regionCode=CO&hl=es&maxResults=20&key=' + encodeURIComponent(key))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.items) return;
        var items = j.items.map(function (v) {
          var sn = v.snippet || {}, t = sn.thumbnails || {};
          return { id: v.id, title: sn.title || '', channel: sn.channelTitle || '', thumb: (t.maxres || t.high || t.medium || t.default || {}).url || '' };
        });
        setJSON('mvl.yt', { ts: Date.now(), items: items });
        if (!ytAcct().on) renderTrends(items);
      }).catch(function () {});
  }

  // Conectar con código en google.com/device (permiso de solo lectura)
  var ytFlow = 0;
  function connectYT() {
    if (!canConnectYT()) return toast('Falta configurar el inicio de sesión de MiVibra TV');
    var flow = ++ytFlow;
    modal('<h3>Conectar mi YouTube</h3><p>Pidiendo el código a Google…</p><div class="spin"></div>', true);
    call('ytCode', CFG.tvClientId).then(function (d) {
      if (flow !== ytFlow) return;
      var url = d.verification_url || 'https://www.google.com/device';
      modal('<h3>Conectar mi YouTube</h3><div class="qr-wrap"><div class="qr"><img src="' + qrImg(url) + '" alt=""></div><div><p>En tu celular abre <b>' + esc(url.replace('https://', '')) + '</b>, entra con tu cuenta de YouTube y escribe:</p><div class="code">' + esc(d.user_code) + '</div><p style="margin-top:1rem;font-size:.95rem">Solo lectura: MiVibra no puede publicar, comentar ni borrar nada.</p></div></div><div class="acts"><button class="f opt" data-act="close">Cancelar</button></div>');
      var every = Math.max(5, d.interval || 5) * 1000, until = Date.now() + (d.expires_in || 1800) * 1000;
      (function poll() {
        if (flow !== ytFlow) return;
        if (Date.now() > until) return modal('<h3>El código venció</h3><div class="acts"><button class="f opt primary" data-act="ytconnect">Pedir otro</button><button class="f opt" data-act="close">Cerrar</button></div>');
        call('ytPoll', CFG.tvClientId, CFG.tvClientSecret, d.device_code).then(function (ok) {
          if (flow !== ytFlow) return;
          if (ok !== true && ok !== 'true') return setTimeout(poll, every);
          closeModal(); localStorage.removeItem('mvl.ytme');
          var a = ytAcct(); toast('YouTube conectado' + (a.name ? ': ' + a.name : ''));
          applyPrefs(); loadYouTube(true);
        }).catch(function (e) {
          if (flow !== ytFlow) return;
          modal('<h3>No se pudo conectar</h3><p>' + esc(e.message) + '</p><div class="acts"><button class="f opt primary" data-act="ytconnect">Intentar de nuevo</button><button class="f opt" data-act="close">Cerrar</button></div>');
        });
      })();
    }).catch(function (e) {
      if (flow !== ytFlow) return;
      modal('<h3>No se pudo conectar</h3><p>' + esc(e.message) + '</p><p>Revisa que en Google Cloud esté el permiso youtube.readonly (docs/INICIO.md).</p><div class="acts"><button class="f opt" data-act="close">Cerrar</button></div>');
    });
  }

  // ---------------- Filas oficiales de Android TV ----------------
  // Lo mismo que muestra el inicio de Google: "Continuar viendo" de todas las apps y las filas de YouTube
  // (Recomendado, Suscripciones…), publicadas por la app oficial de YouTube.
  var tvOfficial = false;
  function tvCard(v) {
    var isYt = /youtube/.test(v.pkg || '');
    return '<button class="f tile vid" data-tv="' + esc(v.intent) + '"><i class="bn" style="' + bg(v.img) + '"></i>' +
      (isYt ? '<span class="yt">YouTube</span>' : (v.app ? '<span class="app">' + esc(v.app) + '</span>' : '')) +
      (v.pct ? '<span class="prog"><i style="width:' + Math.max(3, +v.pct) + '%"></i></span>' : '') +
      '<span class="lb"><span class="tt">' + esc(v.title) + '</span>' + (v.sub ? '<span class="ch">' + esc(v.sub) + '</span>' : '') + '</span></button>';
  }
  function renderTv(d) {
    var wn = (d.watchNext || []).filter(function (v) { return v.pkg !== 'co.mivibra.tv'; }); // MiVibra ya tiene su fila
    if (d.supported && !d.ok) {
      $('#wn-h').hidden = false;
      $('#wn').innerHTML = '<button class="f tile ask" data-act="tvask"><b>Ver Continuar viendo y lo de YouTube</b><span>Toca para permitir que el inicio lea las filas de tus apps</span></button>';
    } else {
      $('#wn-h').hidden = !wn.length;
      $('#wn').innerHTML = wn.map(tvCard).join('');
    }
    var yt = P.yt ? (d.youtube || []) : [];
    tvOfficial = yt.length > 0;
    $('#ytch').innerHTML = yt.map(function (ch) {
      return '<div class="row-h">YouTube · ' + esc(ch.name) + '</div><div class="row video">' + ch.items.map(tvCard).join('') + '</div>';
    }).join('');
    loadYouTube();
  }
  var tvT = 0;
  function loadTv() {
    if (!LB.tvRows) return;
    call('tvRows').then(function (d) { try { console.log('MVL tvRows ' + d.debug + ' wn=' + (d.watchNext || []).length + ' yt=' + (d.youtube || []).length); } catch (e) {} setJSON('mvl.tv', d); renderTv(d); }).catch(function () {});
  }
  L.onTvRows = loadTv;

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
    $('#o-yt').textContent = P.yt ? 'Sí' : 'No';
    var ya = ytAcct(); $('#o-ytacct').textContent = ya.on ? (ya.name || 'Conectado') : 'Conectar';
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
      modal('<h3>Google Fotos aún no está activado</h3><p>Falta activar Google Fotos para MiVibra en Google Cloud (guía en docs/INICIO.md).</p><p style="font-size:.95rem;opacity:.7">' + esc(e.message) + '</p><p>Mientras tanto puedes subir tus fotos desde el celular: ahí también puedes elegirlas de Google Fotos.</p><div class="acts"><button class="f opt primary" data-act="upload">📱 Subir desde el celular</button><button class="f opt" data-act="close">Cerrar</button></div>');
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
  function cancelFlows() { ytFlow++; photoFlow++; try { LB.photosCancel(); } catch (e) {} stopUpload(); }

  // Acción del menú abierto (se llama con OK del control o con toque)
  var menuAct = null;
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
      menuAct = function (m) {
        closeModal();
        if (m === 'open') openApp(pkg);
        else if (m === 'pin') { if (pinned) P.pins.splice(P.pins.indexOf(pkg), 1); else P.pins.push(pkg); save(); renderPins(); renderAll(); toast(pinned ? 'Quitada de Destacados' : 'Fijada en Destacados'); refocus(pkg); }
        else if (m === 'move') startMove(pkg);
        else if (m === 'info') LB.appInfo(pkg);
      };
    } else if (ph) {
      modal('<h3>Foto</h3><div class="menu"><button class="f opt" data-m="use">Usar ahora de fondo</button><button class="f opt danger" data-m="del">Borrar de la TV</button></div>');
      menuAct = function (m) {
        closeModal();
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
    if (el.getAttribute('data-m')) { var fn = menuAct; menuAct = null; if (fn) fn(el.getAttribute('data-m')); return; }
    var v = el.getAttribute('data-view'), act = el.getAttribute('data-act');
    if (el.getAttribute('data-pkg')) return openApp(el.getAttribute('data-pkg'));
    if (el.getAttribute('data-input')) { blip(980); if (!LB.openInput(el.getAttribute('data-input'))) toast('No se pudo abrir la entrada'); return; }
    if (el.getAttribute('data-photo')) return menuFor(el);
    if (el.getAttribute('data-mv')) { blip(980); return LB.openMiVibraItem(el.getAttribute('data-mv'), el.getAttribute('data-play') === '1'); }
    if (el.getAttribute('data-tv')) { blip(980); if (!LB.tvOpen(el.getAttribute('data-tv'))) toast('No se pudo abrir'); return; }
    if (el.getAttribute('data-yt')) { blip(980); if (!LB.openYouTube(el.getAttribute('data-yt'))) toast('No se pudo abrir YouTube'); return; }
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
      case 'yt': P.yt = !P.yt; save(); applyPrefs(); loadTv(); loadYouTube(); break;
      case 'ytconnect': connectYT(); break;
      case 'tvask': LB.tvAsk(); break;
      case 'ytacct':
        if (!ytAcct().on) return connectYT();
        modal('<h3>Tu YouTube está conectado</h3><p>' + esc(ytAcct().name || '') + '</p><div class="acts"><button class="f opt" data-act="close">Cerrar</button><button class="f opt danger" data-act="ytout">Desconectar</button></div>');
        break;
      case 'ytout': LB.ytSignOut(); localStorage.removeItem('mvl.ytme'); closeModal(); applyPrefs(); loadYouTube(); toast('YouTube desconectado'); break;
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
    var home = el.closest('#v-home');
    if (home) {
      if (!row || row.id === 'pins') home.scrollTop = 0;
      else {
        var h = row.previousElementSibling, ref = (h && h.classList.contains('row-h') ? h : row).getBoundingClientRect().top;
        home.scrollTop += ref - home.getBoundingClientRect().top - 16;
      }
    }
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
    // En una fila, izquierda/derecha no se salen de la fila
    var curRow = cur.closest('.row');
    if (curRow && (dir === 'left' || dir === 'right')) all = all.filter(function (el) { return el.closest('.row') === curRow; });
    var r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    // Arriba/abajo entre filas: siempre a la fila de al lado (aunque esté fuera de la pantalla), nunca saltarla
    if (curRow && (dir === 'up' || dir === 'down') && $('#modal').hidden) {
      var view = curRow.closest('.view');
      var rows = $$('.row', view).filter(function (rw) { return $$('.f', rw).some(visible); });
      var ri = rows.indexOf(curRow) + (dir === 'down' ? 1 : -1);
      if (ri < 0) { var t = $('.tab.cur') || $('.tab'); if (t) { t.focus(); blip(); } return; }
      var target = rows[ri]; if (!target) return;
      var pick = null, pd = 1e9;
      $$('.f', target).filter(visible).forEach(function (el) {
        var q = el.getBoundingClientRect(), d = Math.abs(q.left + q.width / 2 - cx);
        if (d < pd) { pd = d; pick = el; }
      });
      if (pick) { pick.focus(); scrollTo(pick); blip(); }
      return;
    }
    var best = null, bestS = 1e9;
    // Primero el contenido; la barra de arriba solo si no hay nada más en esa dirección
    var noTabs = all.filter(function (el) { return !el.classList.contains('tab'); });
    var pool = cur.classList.contains('tab') ? all : noTabs;
    function scan(list) {
    list.forEach(function (el) {
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
    }
    scan(pool);
    if (!best && pool !== all) scan(all);
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
    var first = $('#pins .f'); if (first) { first.focus(); $('#pins').scrollLeft = 0; $('#v-home').scrollTop = 0; }
  };
  L.onHome = function () {
    cancelFlows(); closeModal(); if (moving) endMove();
    show('home'); var first = $('#pins .f'); $('#pins').scrollLeft = 0; $('#v-home').scrollTop = 0; if (first) first.focus();
  };
  L.onMenu = function () { if ($('#modal').hidden) menuFor(document.activeElement); };
  L.onResume = function () { tick(); status(); renderInputs(); renderMiVibra(); loadTv(); if (!wallT && order.length > 1) nextWall(); if (!document.activeElement || document.activeElement === document.body) focusDefault(); };
  L.onPause = function () { clearTimeout(wallT); wallT = null; };
  L.onAppsChanged = function () { loadApps(); };

  // ---------------- Arranque ----------------
  applyPrefs(); tick(); status(); weather(); renderInputs(); renderMiVibra(); (function () { var t = getJSON('mvl.tv'); if (t) renderTv(t); else loadYouTube(); })(); loadTv(); loadPhotos(); renderPins();
  $('.tab[data-view="home"]').classList.add('cur');
  loadApps().then(function () { focusDefault(); });
  setInterval(tick, 15000);
  setInterval(weather, 30 * 60 * 1000);
  setInterval(status, 20000);
  setInterval(loadTv, 5 * 60e3);

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
      ytKey: function () { return ''; },
      tvRows: function (id) { var w = []; for (var i = 0; i < 4; i++) w.push({ title: 'Video que dejaste a medias ' + i, sub: 'Canal ' + i, img: '', intent: 'x', pkg: i % 2 ? 'com.netflix.ninja' : 'com.google.android.youtube.tv', app: i % 2 ? 'Netflix' : 'YouTube', pct: 20 + i * 15 }); var it = []; for (var j = 0; j < 6; j++) it.push({ title: 'Recomendado para ti ' + j, sub: 'Canal', img: '', intent: 'y', pkg: 'com.google.android.youtube.tv' }); setTimeout(function () { L._r(id, true, { supported: true, ok: true, watchNext: w, youtube: [{ name: 'Recomendado', items: it }] }); }, 100); },
      tvOpen: function () { return true; }, tvAsk: function () {},
      mivibraRecs: function () { var a = []; for (var i = 0; i < 10; i++) a.push({ key: 'k' + i, title: 'Película de ejemplo ' + i, poster: '', play: i < 3 ? 'k' + i : '', pct: i < 3 ? 30 + i * 20 : 0 }); return JSON.stringify(a); },
      openMiVibraItem: function () {}, openYouTube: function () { return true; },
      ytConnected: function () { return '{"on":false}'; }, ytCode: function (id) { setTimeout(function () { L._r(id, true, { user_code: 'ABCD-EFGH', device_code: 'x', verification_url: 'https://www.google.com/device' }); }, 200); },
      ytPoll: function (id) { setTimeout(function () { L._r(id, true, false); }, 200); }, ytSignOut: function () {},
      uploadStart: function () { return '{"url":"http://192.168.0.3:8766/"}'; }, uploadStop: function () {}
    };
  }
})();
