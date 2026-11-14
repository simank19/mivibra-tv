/* MiVibra TV para televisores Samsung (Tizen) y LG (webOS).
   Crea window.Android (el mismo puente que usa la app de Android) con lo que un TV con navegador puede hacer:
   pedir listas y guías a otros servidores (las apps instaladas no tienen el límite CORS), abrir el reproductor
   (hls.js / mpegts.js, el mismo del PC) y las teclas del control remoto. Lo que necesita Android (juegos,
   descargas, archivos del equipo) responde "No disponible en este TV". */
(function () {
  'use strict';
  var isTizen = !!window.tizen, isWebOS = !isTizen && (!!window.webOS || !!window.PalmSystem || /web0s|webos/i.test(navigator.userAgent));
  var PLAT = isTizen ? 'Samsung (Tizen)' : isWebOS ? 'LG (webOS)' : 'TV';
  var VER = window.MVTV_VERSION || '1.0.0';
  function reply(id, ok, data) { setTimeout(function () { if (window.MV && MV._cb) MV._cb(id, { ok: ok, data: data == null ? null : data }); }, 0); }
  function hdr(json) { try { return JSON.parse(json || '{}') || {}; } catch (e) { return {}; } }

  // ---------- Red ----------
  var NOHDR = /^(user-agent|referer|origin|host|cookie|connection|content-length|accept-encoding)$/i;
  function xhr(method, url, headers, body, type, timeout) {
    return new Promise(function (res, rej) {
      var x = new XMLHttpRequest();
      try { x.open(method, url, true); } catch (e) { rej(e); return; }
      x.timeout = timeout || 60000;
      if (type) x.responseType = type;
      Object.keys(headers || {}).forEach(function (k) { if (!NOHDR.test(k)) { try { x.setRequestHeader(k, headers[k]); } catch (e) {} } });
      x.onload = function () { res({ status: x.status || 200, body: type ? x.response : x.responseText }); };
      x.onerror = function () { rej(new Error('Sin conexión con el servidor')); };
      x.ontimeout = function () { rej(new Error('El servidor tardó demasiado')); };
      x.send(body == null ? null : body);
    });
  }
  /** Bytes → texto, descomprimiendo .gz si hace falta (listas y guías comprimidas). */
  function bytesToText(buf) {
    var u = new Uint8Array(buf || new ArrayBuffer(0));
    if (u.length > 2 && u[0] === 0x1f && u[1] === 0x8b && window.pako) { try { return pako.ungzip(u, { to: 'string' }); } catch (e) {} }
    try { return new TextDecoder('utf-8').decode(u); } catch (e) { var s = ''; for (var i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); try { return decodeURIComponent(escape(s)); } catch (x) { return s; } }
  }
  function blobUrl(text, mime) { return URL.createObjectURL(new Blob([text], { type: mime || 'text/plain;charset=utf-8' })); }

  // ---------- Guía XMLTV (como Epg.kt): solo la programación cercana ----------
  function xmlUnesc(s) { return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); }).replace(/&amp;/g, '&'); }
  function attr(a, n) { var m = new RegExp('\\b' + n + '\\s*=\\s*"([^"]*)"').exec(a) || new RegExp('\\b' + n + "\\s*=\\s*'([^']*)'").exec(a); return m ? xmlUnesc(m[1]) : ''; }
  function xtime(s) {
    var m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/.exec(String(s || '').trim()); if (!m) return 0;
    var ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    if (m[7]) { var sg = m[7][0] === '-' ? -1 : 1; ms -= sg * ((+m[7].slice(1, 3)) * 60 + (+m[7].slice(3, 5))) * 60000; }
    return ms;
  }
  function parseEpg(xml, wanted, hours) {
    var now = Date.now(), from = now - 3 * 3600e3, to = now + (hours > 0 ? hours : 36) * 3600e3;
    var channels = {}, progs = {}, count = 0, m;
    var reC = /<channel\b([^>]*)>([\s\S]*?)<\/channel>/g;
    while ((m = reC.exec(xml))) {
      var id = attr(m[1], 'id'); if (!id || (wanted.size && !wanted.has(id.toLowerCase()))) continue;
      var dn = /<display-name[^>]*>([\s\S]*?)<\/display-name>/.exec(m[2]), ic = /<icon\b([^>]*)\/?>/.exec(m[2]);
      channels[id] = { n: (dn ? xmlUnesc(dn[1]) : id).trim(), i: ic ? attr(ic[1], 'src') : '' };
    }
    var reP = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g;
    while ((m = reP.exec(xml)) && count < 200000) {
      var ch = attr(m[1], 'channel'); if (!ch) continue;
      var s = xtime(attr(m[1], 'start')), e = xtime(attr(m[1], 'stop'));
      if (!(e > from && s < to) || (wanted.size && !wanted.has(ch.toLowerCase()))) continue;
      var t = /<title[^>]*>([\s\S]*?)<\/title>/.exec(m[2]), d = /<desc[^>]*>([\s\S]*?)<\/desc>/.exec(m[2]);
      var o = { s: s, e: e, t: t ? xmlUnesc(t[1]).trim() : '' };
      var dd = d ? xmlUnesc(d[1]).trim() : ''; if (dd) o.d = dd.length > 400 ? dd.slice(0, 400) + '…' : dd;
      (progs[ch] = progs[ch] || []).push(o); count++;
    }
    return { channels: channels, progs: progs, count: count };
  }

  // ---------- Reproductor (el del PC dentro de un marco a pantalla completa) ----------
  var playerFrame = null, playerReq = null, closedOnce = true;
  window.MVTV = {
    platform: PLAT,
    playerApi: {
      onRequest: function (f) { setTimeout(function () { f(playerReq); }, 0); },
      setHeaders: function () {},
      stalker: function () { return Promise.reject(new Error('Los portales MAC no se pueden abrir en este TV')); },
      fullscreen: function () {},
      close: function (result) {
        if (!playerFrame && closedOnce) return;
        closedOnce = true;
        if (playerFrame) { var pf = playerFrame; playerFrame = null; try { pf.src = 'about:blank'; } catch (e) {} try { pf.parentNode.removeChild(pf); } catch (e) {} }
        keepAwake(false);
        try { if (window.MV && MV.onPlayerClosed) MV.onPlayerClosed(result || {}); } catch (e) {}
        setTimeout(function () { try { window.focus(); var a = document.activeElement; if (MV.focusFirst && (!a || a === document.body)) MV.focusFirst(); } catch (e) {} }, 60);
      }
    }
  };
  function openPlayer(json) {
    if (playerFrame) { try { playerFrame.contentWindow.mvPlayerReplace && playerFrame.contentWindow.mvPlayerReplace(); } catch (e) {} }
    try { playerReq = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { return; }
    var f = document.createElement('iframe');
    f.src = 'pc/player.html';
    f.setAttribute('allow', 'autoplay; fullscreen');
    f.style.cssText = 'position:fixed;inset:0;left:0;top:0;width:100%;height:100%;border:0;z-index:2147483000;background:#000';
    f.setAttribute('tabindex', '-1');
    document.body.appendChild(f); playerFrame = f; closedOnce = false;
    f.onload = function () {
      // Si el TV no deja que el reproductor hable directo con la app, se usan mensajes
      try { f.contentWindow.postMessage({ mvtv: 'req', req: playerReq }, '*'); } catch (e) {}
      try { f.focus(); f.contentWindow.focus(); } catch (e) {}
    };
    keepAwake(true);
  }
  function keepAwake(on) {
    try { if (isTizen && tizen.power) { if (on) tizen.power.request('SCREEN', 'SCREEN_NORMAL'); else tizen.power.release('SCREEN'); } } catch (e) {}
  }

  /** Cierra el reproductor desde la app (tecla Atrás cuando el foco no está dentro del marco).
      Primero le pide al reproductor que cierre (guarda la posición); si no responde, lo quita igual. */
  function closePlayer() {
    var f = playerFrame; if (!f) return;
    try { var b = f.contentWindow.document.getElementById('bClose'); if (b) b.click(); } catch (e) {}
    try { f.contentWindow.postMessage({ mvtv: 'close' }, '*'); } catch (e) {}
    setTimeout(function () { if (playerFrame === f) window.MVTV.playerApi.close({}); }, 700);
  }
  window.MVTV.closePlayer = closePlayer;
  window.addEventListener('message', function (e) {
    var d = e.data; if (!d || typeof d !== 'object') return;
    if (d.mvtv === 'close') window.MVTV.playerApi.close(d.result || {});
    else if (d.mvtv === 'full') { /* el TV ya está a pantalla completa */ }
  });

  // ---------- El puente ----------
  var NA = 'No disponible en este TV';
  var A = {
    // Con respuesta (id primero)
    httpGet: function (id, url, headersJson, mode) {
      xhr('GET', url, hdr(headersJson), null, 'arraybuffer').then(function (r) {
        var text = bytesToText(r.body);
        if (mode === 'file') reply(id, r.status < 400, { status: r.status, path: blobUrl(text) });
        else reply(id, r.status < 400, { status: r.status, text: text });
      }).catch(function (e) { reply(id, false, e.message); });
    },
    httpPost: function (id, url, body, ct) { xhr('POST', url, { 'Content-Type': ct || 'application/x-www-form-urlencoded' }, body).then(function (r) { reply(id, true, { status: r.status, text: r.body }); }).catch(function (e) { reply(id, false, e.message); }); },
    httpPost2: function (id, url, body, ct, headersJson) { xhr('POST', url, Object.assign({ 'Content-Type': ct || 'application/json', Accept: 'application/json' }, hdr(headersJson)), body).then(function (r) { reply(id, true, { status: r.status, text: r.body }); }).catch(function (e) { reply(id, false, e.message); }); },
    probe: function (id, json) { var a = []; try { a = JSON.parse(json) || []; } catch (e) {} reply(id, true, a.map(function () { return { ok: true, code: 200, ms: 0 }; })); },
    epg: function (id, url, idsJson, hours) {
      var wanted = { size: 0, has: function () { return true; } };
      try { var arr = (JSON.parse(idsJson || '[]') || []).map(function (x) { return String(x).toLowerCase(); }); if (arr.length) { var set = {}; arr.forEach(function (k) { set[k] = 1; }); wanted = { size: arr.length, has: function (k) { return !!set[k]; } }; } } catch (e) {}
      xhr('GET', url, {}, null, 'arraybuffer', 180000).then(function (r) {
        if (r.status >= 400) throw new Error('HTTP ' + r.status);
        var out = parseEpg(bytesToText(r.body), wanted, +hours || 36);
        reply(id, true, { path: blobUrl(JSON.stringify(out), 'application/json'), count: out.count });
      }).catch(function (e) { reply(id, false, e.message || 'No se pudo leer la guía'); });
    },
    googleSignIn: function (id) { reply(id, false, 'En el TV entra con “Entrar con el celular (código)”.'); },
    pickFile: function (id) { reply(id, false, 'Este TV no tiene selector de archivos. Envía la lista desde el celular.'); },
    // Sin respuesta
    play: function (json) { openPlayer(json); },
    deviceInfo: function () { return JSON.stringify({ tv: true, touch: false, ramMb: 2048, lowRam: false, model: PLAT, sdk: 0, abi: 'web', version: VER, versionCode: +(String(VER).split('.').pop()) || 0, webtv: true }); },
    hasStorageAccess: function () { return false; }, requestStorageAccess: function () {},
    storageRoots: function () { return '[]'; }, downloadsDir: function () { return ''; },
    appsInstalled: function () { return '{}'; }, canInstallUpdates: function () { return false; },
    coreInstalled: function () { return false; }, retroArch: function () { return JSON.stringify({ installed: false }); },
    overlay: function () { return -1; }, setOverlay: function () {}, overlayStyles: function () { return '[]'; }, nextOverlay: function () {},
    setPip: function () {}, publishHome: function () {}, setInicio: function () {}, toast: function () {},
    keepAwake: function (on) { keepAwake(!!on); },
    openExternal: function () {}, openBrowser: function () {}, openDiag: function () {},
    deleteFile: function () { return false; }, zipExts: function () { return '[]'; }, archiveNames: function () { return '[]'; }, arcadeId: function () { return 'null'; },
    remoteStart: function () { return JSON.stringify({ ok: false, error: NA }); }, remoteStop: function () {},
    clipText: function () { return ''; }, gamepads: function () { return '[]'; }, introAudio: function () {},
    user: function () { return null; },
    exit: function () {
      try { if (isTizen) { tizen.application.getCurrentApplication().exit(); return; } } catch (e) {}
      try { if (window.webOS && webOS.platformBack) { webOS.platformBack(); return; } } catch (e) {}
      try { window.close(); } catch (e) {}
    }
  };
  // Lo demás de Android (juegos, descargas, Drive…): responde que no se puede aquí
  ['renderHtml', 'ocrImage', 'readLocalFile', 'pickFiles', 'videoFrame', 'openBook', 'pickFolder', 'listDir', 'scanRoms', 'importBios', 'unzip', 'downloadFile', 'unzipRom', 'arcadePrepare', 'downloadCore', 'playGame', 'playRetroArch', 'playPpsspp', 'installUpdate', 'remoteFind', 'remotePairAsk', 'remoteScan'].forEach(function (m) {
    A[m] = function (id) { reply(id, false, NA); };
  });
  window.Android = A;

  // ---------- Control remoto ----------
  if (isTizen) {
    try { ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind', 'ChannelUp', 'ChannelDown', 'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(function (k) { try { tizen.tvinputdevice.registerKey(k); } catch (e) {} }); } catch (e) {}
  }
  window.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    // Con el reproductor abierto, si el foco quedó en la app (pasa en LG) las teclas se le pasan al reproductor
    if (playerFrame && k !== 10009 && k !== 461) {
      e.preventDefault(); e.stopImmediatePropagation();
      var w = playerFrame.contentWindow, done = false;
      try { if (w.mvTvKey) { w.mvTvKey(k); done = true; } } catch (x) {}
      if (!done) { try { w.postMessage({ mvtv: 'key', code: k }, '*'); } catch (x) {} }
      try { playerFrame.focus(); w.focus(); } catch (x) {}
      return;
    }
    // Atrás: 10009 (Samsung), 461 (LG)
    if (k === 10009 || k === 461) {
      e.preventDefault();
      if (playerFrame) { e.stopImmediatePropagation(); closePlayer(); return; }
      var a = document.activeElement;
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) { a.blur(); return; }
      try { if (window.MV && MV.onBack) MV.onBack(); } catch (x) {}
    }
  }, true);
  document.documentElement.classList.add('webtv');
})();
