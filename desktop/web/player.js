/* MiVibra TV para PC — reproductor: HLS (hls.js), MPEG-TS en vivo (mpegts.js) y archivos (MP4, MKV, WebM).
   Igual que el de Android: prueba versiones de respaldo si una señal no arranca, cambia de canal con ▲▼,
   lista de canales, siguiente capítulo automático y devuelve el avance al cerrar. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var v = $('v'), P = window.mvPlayer;
  var req = null, queue = [], index = 0, live = false;
  var hls = null, ts = null, attempts = [], att = 0, watchdog = null, started = false, closing = false;
  var worked = {}, favToggles = {}, trackLog = {}, startMs = 0;
  var STK_UA = 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3';

  function cur() { return queue[index] || {}; }
  function fmt(s) { s = Math.max(0, Math.floor(s || 0)); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); }
  function osd(t) { var o = $('osd'); o.textContent = t; o.hidden = false; clearTimeout(osd.t); osd.t = setTimeout(function () { o.hidden = true; }, 2200); }
  function spin(on) { $('spin').classList.toggle('off', !on); }
  function err(msg, hint) { spin(false); $('errTxt').textContent = msg || ''; $('errHint').textContent = hint || ''; $('err').hidden = false; }

  // ---------- Intentos (como buildAttempts de Android) ----------
  function isHls(u) { var l = u.toLowerCase().split('?')[0]; return /\.m3u8$/.test(l) || l.indexOf('/hls/') >= 0; }
  function isTs(u) { return /\.ts$/i.test(u.split('?')[0]); }
  function build(item) {
    var url = item.url, urls = [url], low = url.toLowerCase().split('?')[0], out = [], seen = {};
    if (low.indexOf('/live/') >= 0) {
      if (/\.m3u8$/.test(low)) urls.push(url.replace(/\.m3u8/i, '.ts'));
      else if (/\.ts$/.test(low)) urls.push(url.replace(/\.ts/i, '.m3u8'));
    }
    var vod = /(\/(?:movie|series)\/[^?]+\/\d+)\.(\w{2,4})(\?.*)?$/i.exec(url);
    if (vod) ['mp4', 'mkv', 'm3u8', 'ts'].forEach(function (e) { if (e !== vod[2].toLowerCase()) urls.push(url.slice(0, vod.index) + vod[1] + '.' + e + (vod[3] || '')); });
    if (/^https:\/\//i.test(url)) urls.push('http://' + url.slice(8)); else if (/^http:\/\//i.test(url)) urls.push('https://' + url.slice(7));
    var alts = (item.alts || []).filter(function (a) { return a && a !== url; });
    var add = function (u, eng) { var k = eng + '|' + u; if (!seen[k]) { seen[k] = 1; out.push({ url: u, eng: eng }); } };
    var engOf = function (u) { return isHls(u) ? 'hls' : (isTs(u) || (live && !/\.(mp4|mkv|webm|avi|mov)$/i.test(u.split('?')[0]))) ? 'ts' : 'native'; };
    add(url, engOf(url));
    alts.forEach(function (a) { add(a, engOf(a)); });
    urls.concat(alts).forEach(function (u) {
      var e = engOf(u); add(u, e);
      if (live && e !== 'hls') add(u, 'hls');          // HLS sin extensión .m3u8
      if (live && e === 'hls') add(u, 'ts');
      if (!live && e === 'native') add(u, 'hls');
    });
    return out;
  }

  // ---------- Motores ----------
  function stopEngines() {
    clearTimeout(watchdog);
    if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
    if (ts) { try { ts.pause(); ts.unload(); ts.detachMediaElement(); ts.destroy(); } catch (e) {} ts = null; }
    try { v.removeAttribute('src'); v.load(); } catch (e) {}
  }
  var zapAt = 0;
  function next(reason) {
    if (closing) return;
    att++;
    // En vivo no se insiste más de ~40 s (los canales de eventos solo transmiten a su hora)
    var tooLong = live && Date.now() - zapAt > 40000;
    if (att < attempts.length && !tooLong) { if (live) osd('Probando otra forma (' + (att + 1) + ' de ' + attempts.length + ')…'); tryAttempt(); return; }
    stopEngines();
    if (live) err('Este canal no está transmitiendo ahora.', 'Los canales de eventos (los que empiezan con una hora) solo funcionan cuando el evento está en vivo. Prueba otro con ▲ ▼ o la lista.');
    else err(reason || 'La señal no responde.', 'Puede que el enlace haya vencido. Cierra e intenta de nuevo.');
  }
  function arm() { clearTimeout(watchdog); watchdog = setTimeout(function () { if (!started) next('La señal tardó demasiado en arrancar.'); }, live ? (att < 3 ? 9000 : 12000) : (att < 3 ? 12000 : 20000)); }

  function tryAttempt() {
    stopEngines(); started = false; $('err').hidden = true; spin(true);
    var a = attempts[att], item = cur();
    P.setHeaders(item.ua || '', item.ref || '');
    arm();
    if (a.eng === 'hls' && window.Hls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, maxBufferLength: 30, backBufferLength: 30, fragLoadingMaxRetry: 2, manifestLoadingMaxRetry: 1, levelLoadingMaxRetry: 2 });
      hls.on(Hls.Events.ERROR, function (_, d) { if (d.fatal) next(d.details === 'manifestLoadError' ? 'El servidor no respondió.' : 'Error de la señal (' + d.details + ').'); });
      hls.on(Hls.Events.MANIFEST_PARSED, function () { pickHlsAudio(); play(); });
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, pickHlsAudio);
      hls.loadSource(a.url); hls.attachMedia(v);
    } else if (a.eng === 'ts' && window.mpegts && mpegts.getFeatureList().mseLivePlayback) {
      ts = mpegts.createPlayer({ type: 'mpegts', isLive: live, url: a.url }, { enableWorker: true, lazyLoad: false, liveBufferLatencyChasing: true, liveBufferLatencyMaxLatency: 6, liveBufferLatencyMinRemain: 1.5 });
      ts.on(mpegts.Events.ERROR, function (t, d) { next('Error de la señal (' + (d || t) + ').'); });
      ts.attachMediaElement(v); ts.load(); play();
    } else {
      v.src = a.url; play();
    }
  }
  function play() { var p = v.play(); if (p && p.catch) p.catch(function () {}); }

  function playIndex(i, from, announce) {
    index = (i + queue.length) % Math.max(1, queue.length);
    var item = cur(); if (!item.url && !item.stk) return;
    showInfo(item); if (announce) osd((item.num ? item.num + ' · ' : '') + item.title);
    renderListCur();
    startMs = from || 0;
    if (item.stk && !item.stkReady) {
      stopEngines(); spin(true); osd('Conectando con el portal…');
      var want = index;
      P.stalker(item.stk).then(function (u) {
        if (want !== index || closing) return;
        item.url = u; item.ua = STK_UA; item.stkReady = true; playIndex(want, from, false);
      }).catch(function (e) { if (want === index) err('No se pudo abrir desde el portal.', (e && e.message) || ''); });
      return;
    }
    if (item.stk) item.stkReady = false;   // la próxima vez se pide un enlace fresco
    attempts = build(item).slice(0, live ? 8 : 24); att = 0; zapAt = Date.now(); tryAttempt();
  }

  // ---------- Eventos del video ----------
  v.addEventListener('playing', function () {
    spin(false);
    if (!started) {
      started = true; clearTimeout(watchdog);
      if (startMs > 0 && !live && isFinite(v.duration)) { try { v.currentTime = startMs / 1000; } catch (e) {} }
      startMs = 0;
      var item = cur(), a = attempts[att];
      if (att > 0 && item.id) worked[item.id] = { url: a.url, orig: item.url, tries: att };
      buildTracksLater();
    }
    $('bPlay').textContent = '⏸';
  });
  v.addEventListener('waiting', function () { spin(true); });
  v.addEventListener('pause', function () { $('bPlay').textContent = '▶'; wake(); });
  v.addEventListener('error', function () { if (attempts[att] && attempts[att].eng === 'native') next(v.error && v.error.code === 4 ? 'Este formato no se puede reproducir en el PC.' : 'No se pudo abrir el video.'); });
  v.addEventListener('ended', function () {
    if (live) return;
    if (index < queue.length - 1) { osd('Siguiente: ' + (queue[index + 1].title || '')); playIndex(index + 1, 0, false); }
    else close();
  });
  v.addEventListener('timeupdate', function () {
    if (live || !isFinite(v.duration)) return;
    var p = v.duration ? v.currentTime / v.duration * 1000 : 0;
    if (!seeking) { $('seek').value = p; $('seek').style.setProperty('--p', p / 10 + '%'); }
    $('tCur').textContent = fmt(v.currentTime); $('tDur').textContent = fmt(v.duration);
  });

  // ---------- Audio y subtítulos ----------
  function langOk(t, want) { if (!want) return false; var l = String((t && (t.lang || t.language || t.name)) || '').toLowerCase(); return l.indexOf(want.toLowerCase().slice(0, 2)) === 0 || (want === 'es' && /espa|spa|lat/.test(l)); }
  function pickHlsAudio() {
    if (!hls || !req || !req.audioLang || pickHlsAudio.done === hls) return;
    var i = (hls.audioTracks || []).findIndex(function (t) { return langOk(t, req.audioLang); });
    if (i >= 0) { hls.audioTrack = i; pickHlsAudio.done = hls; }
  }
  function buildTracksLater() {
    setTimeout(function () {
      if (hls && req && req.subLang && hls.subtitleTracks && hls.subtitleTracks.length) {
        var si = hls.subtitleTracks.findIndex(function (t) { return langOk(t, req.subLang); });
        if (si >= 0) { hls.subtitleTrack = si; hls.subtitleDisplay = true; }
      }
    }, 800);
  }
  function tracksMenu() {
    var box = $('tracks'); if (!box.hidden) { box.hidden = true; return; }
    var h = '';
    if (hls && hls.audioTracks && hls.audioTracks.length > 1) {
      h += '<h4>Audio</h4>' + hls.audioTracks.map(function (t, i) { return '<button data-a="' + i + '" class="' + (hls.audioTrack === i ? 'on' : '') + '">' + esc(t.name || t.lang || 'Pista ' + (i + 1)) + '</button>'; }).join('');
    }
    if (hls && hls.subtitleTracks && hls.subtitleTracks.length) {
      h += '<h4>Subtítulos</h4><button data-s="-1" class="' + (hls.subtitleTrack < 0 ? 'on' : '') + '">Sin subtítulos</button>' +
        hls.subtitleTracks.map(function (t, i) { return '<button data-s="' + i + '" class="' + (hls.subtitleTrack === i ? 'on' : '') + '">' + esc(t.name || t.lang || 'Subtítulo ' + (i + 1)) + '</button>'; }).join('');
    } else if (v.textTracks && v.textTracks.length) {
      h += '<h4>Subtítulos</h4><button data-t="-1">Sin subtítulos</button>' + Array.prototype.map.call(v.textTracks, function (t, i) { return '<button data-t="' + i + '" class="' + (t.mode === 'showing' ? 'on' : '') + '">' + esc(t.label || t.language || 'Subtítulo ' + (i + 1)) + '</button>'; }).join('');
    }
    if (!h) h = '<h4>Audio y subtítulos</h4><p style="margin:6px 10px;color:#B9B1A8">Este contenido trae un solo audio y no tiene subtítulos.</p>';
    box.innerHTML = h; box.hidden = false;
    var b = box.querySelector('button'); if (b) b.focus();
  }
  $('tracks').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var id = cur().id || '';
    if (b.dataset.a != null) { hls.audioTrack = +b.dataset.a; var t = hls.audioTracks[+b.dataset.a]; trackLog[id] = Object.assign(trackLog[id] || {}, { a: (t && (t.lang || t.name)) || '' }); }
    if (b.dataset.s != null) { var s = +b.dataset.s; hls.subtitleTrack = s; hls.subtitleDisplay = s >= 0; var st = hls.subtitleTracks[s]; trackLog[id] = Object.assign(trackLog[id] || {}, { s: s < 0 ? 'off' : (st && (st.lang || st.name)) || '' }); }
    if (b.dataset.t != null) Array.prototype.forEach.call(v.textTracks, function (t, i) { t.mode = i === +b.dataset.t ? 'showing' : 'disabled'; });
    $('tracks').hidden = true;
  });
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ---------- Lista de canales ----------
  var lf = 'all', lsel = 0, lrows = [];
  function listOpen() { return !$('list').hidden; }
  function renderList() {
    var q = $('lq').value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    lrows = [];
    queue.forEach(function (c, i) {
      if (lf === 'fav' && !c.fav) return;
      if (lf === 'sp' && !c.sp) return;
      if (q && String(c.title || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').indexOf(q) < 0) return;
      lrows.push(i);
    });
    var html = lrows.slice(0, 1500).map(function (i, k) {
      var c = queue[i];
      return '<div class="ch' + (i === index ? ' cur' : '') + (k === lsel ? ' sel' : '') + '" data-i="' + i + '"><i>' + esc(c.num || '') + '</i>' + (c.logo ? '<img src="' + esc(c.logo) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' : '') +
        '<div><b>' + (c.fav ? '★ ' : '') + esc(c.title) + '</b><span>' + esc([c.cn, c.subtitle].filter(Boolean).join(' · ')) + '</span></div></div>';
    }).join('');
    $('lbox').innerHTML = html || '<p style="color:#8E877F;padding:10px">Sin resultados</p>';
  }
  function renderListCur() { if (listOpen()) renderList(); }
  function showList() {
    if (!live || queue.length < 2) return;
    $('list').hidden = false; lsel = Math.max(0, lrows.indexOf(index)); renderList();
    lsel = Math.max(0, lrows.indexOf(index)); renderList(); scrollSel(); $('lq').focus();
  }
  function hideList() { $('list').hidden = true; }
  function scrollSel() { var el = $('lbox').querySelector('.sel'); if (el) el.scrollIntoView({ block: 'nearest' }); }
  $('lq').addEventListener('input', function () { lsel = 0; renderList(); });
  $('lchips').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; lf = b.dataset.f; Array.prototype.forEach.call($('lchips').children, function (x) { x.classList.toggle('on', x === b); }); lsel = 0; renderList(); });
  $('lbox').addEventListener('click', function (e) { var r = e.target.closest('.ch'); if (!r) return; hideList(); playIndex(+r.dataset.i, 0, true); });

  // ---------- Interfaz ----------
  function showInfo(item) {
    $('title').textContent = item.title || '';
    $('sub').textContent = [item.num, item.subtitle].filter(Boolean).join(' · ');
    var lg = $('logo'); if (item.logo) { lg.src = item.logo; lg.style.display = 'block'; } else lg.style.display = 'none';
    $('bFav').textContent = item.fav ? '★' : '☆';
    document.title = (item.title || 'Reproductor') + ' · MiVibra TV';
  }
  var idleT = null;
  function wake() { document.body.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(function () { if (!v.paused && !listOpen() && $('tracks').hidden) document.body.classList.add('idle'); }, 3200); }
  ['mousemove', 'mousedown', 'keydown', 'wheel'].forEach(function (ev) { window.addEventListener(ev, wake, true); });
  function toggle() { if (v.paused) play(); else v.pause(); }
  function seekBy(s) { if (live || !isFinite(v.duration)) return; v.currentTime = Math.max(0, Math.min(v.duration - 1, v.currentTime + s)); osd((s > 0 ? '+' : '') + s + ' s · ' + fmt(v.currentTime)); }
  function chan(d) { if (queue.length > 1) playIndex(index + d, 0, true); }
  function fav() {
    var it = cur(); if (!it.id) return;
    it.fav = !it.fav; favToggles[it.id] = !favToggles[it.id];
    $('bFav').textContent = it.fav ? '★' : '☆'; osd(it.fav ? 'Agregado a favoritos' : 'Quitado de favoritos');
  }
  function fullscreen() { P.fullscreen(); }
  var seeking = false;
  $('seek').addEventListener('input', function () { seeking = true; this.style.setProperty('--p', this.value / 10 + '%'); $('tCur').textContent = fmt(this.value / 1000 * (v.duration || 0)); });
  $('seek').addEventListener('change', function () { seeking = false; if (isFinite(v.duration)) v.currentTime = this.value / 1000 * v.duration; });
  $('vol').addEventListener('input', function () { v.volume = this.value / 100; v.muted = false; this.style.setProperty('--p', this.value + '%'); $('bMute').textContent = v.volume ? '🔊' : '🔇'; });
  $('vol').style.setProperty('--p', '100%');
  $('bPlay').onclick = toggle; $('bBack').onclick = function () { seekBy(-10); }; $('bFwd').onclick = function () { seekBy(10); };
  $('bSkip').onclick = function () { seekBy(90); };
  $('bPrev').onclick = function () { live ? chan(-1) : (index > 0 && playIndex(index - 1, 0, true)); };
  $('bNext').onclick = function () { live ? chan(1) : (index < queue.length - 1 && playIndex(index + 1, 0, true)); };
  $('bMute').onclick = function () { v.muted = !v.muted; $('bMute').textContent = v.muted ? '🔇' : '🔊'; };
  $('bFull').onclick = fullscreen; $('bClose').onclick = close; $('bFav').onclick = fav;
  $('bList').onclick = function () { listOpen() ? hideList() : showList(); };
  $('bTracks').onclick = tracksMenu;
  v.addEventListener('dblclick', fullscreen);
  v.addEventListener('click', function () { if (listOpen()) hideList(); else if (!$('tracks').hidden) $('tracks').hidden = true; else toggle(); });

  window.addEventListener('keydown', function (e) {
    var k = e.key, typing = document.activeElement === $('lq');
    if (listOpen()) {
      if (k === 'Escape' || k === 'BrowserBack') { hideList(); e.preventDefault(); return; }
      if (k === 'ArrowDown' || k === 'ArrowUp') { lsel = Math.max(0, Math.min(lrows.length - 1, lsel + (k === 'ArrowDown' ? 1 : -1))); renderList(); scrollSel(); e.preventDefault(); return; }
      if (k === 'Enter') { var i = lrows[lsel]; if (i != null) { hideList(); playIndex(i, 0, true); } e.preventDefault(); return; }
      if (typing) return;
    }
    if (!$('tracks').hidden && (k === 'Escape' || k === 'BrowserBack')) { $('tracks').hidden = true; e.preventDefault(); return; }
    if (e.target && e.target.tagName === 'BUTTON' && (k === 'Enter' || k === ' ')) return;
    switch (k) {
      case ' ': case 'k': case 'K': case 'Enter': case 'MediaPlayPause': toggle(); break;
      case 'ArrowLeft': if (live) showList(); else seekBy(-10); break;
      case 'ArrowRight': if (live) showList(); else seekBy(10); break;
      case 'ArrowUp': if (live) chan(-1); else { v.volume = Math.min(1, v.volume + 0.1); osd('Volumen ' + Math.round(v.volume * 100) + '%'); } break;
      case 'ArrowDown': if (live) chan(1); else { v.volume = Math.max(0, v.volume - 0.1); osd('Volumen ' + Math.round(v.volume * 100) + '%'); } break;
      case 'PageUp': case 'MediaTrackPrevious': $('bPrev').click(); break;
      case 'PageDown': case 'MediaTrackNext': $('bNext').click(); break;
      case 'm': case 'M': $('bMute').click(); break;
      case 'f': case 'F': case 'F11': fullscreen(); break;
      case 'l': case 'L': $('bList').click(); break;
      case 'a': case 'A': tracksMenu(); break;
      case 'Escape': case 'BrowserBack': case 'Backspace': close(); break;
      default: return;
    }
    e.preventDefault();
  }, true);
  window.addEventListener('mouseup', function (e) { if (e.button === 3) { e.preventDefault(); if (listOpen()) hideList(); else close(); } });

  function close() {
    if (closing) return; closing = true;
    var item = cur();
    var r = {
      id: item.id || '', url: item.url || '', index: index,
      position: Math.round((v.currentTime || 0) * 1000), duration: isFinite(v.duration) ? Math.round(v.duration * 1000) : 0,
      live: live, replaced: false, favToggles: Object.keys(favToggles).filter(function (k) { return favToggles[k]; }), tracks: trackLog, worked: worked
    };
    stopEngines();
    P.close(r);
  }

  P.onRequest(function (r) {
    req = r; queue = r.queue || []; index = r.index || 0; live = !!r.live;
    document.body.classList.toggle('live', live);
    document.body.classList.toggle('single', queue.length < 2);
    playIndex(index, r.startMs || 0, false);
    wake();
  });
})();
