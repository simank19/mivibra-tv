/* Reproductor dentro del TV (Samsung / LG): se conecta con la app y traduce las teclas del control. */
(function () {
  var api = null;
  try { api = parent.MVTV.playerApi; if (!api || !api.onRequest) api = null; } catch (e) { api = null; }
  // Algunos TV (LG) no dejan que el marco toque la app: entonces se habla por mensajes
  var reqCb = null, gotReq = null;
  window.addEventListener('message', function (e) {
    var d = e.data; if (!d || typeof d !== 'object') return;
    if (d.mvtv === 'req' && !api) { gotReq = d.req; if (reqCb) { var f = reqCb; reqCb = null; f(gotReq); } }
    else if (d.mvtv === 'close') { closeNow(); }
    else if (d.mvtv === 'key') { tvKey(d.code); }
  });
  function toParent(msg) { try { parent.postMessage(msg, '*'); } catch (e) {} }
  window.mvPlayer = {
    onRequest: function (f) { if (api) api.onRequest(f); else if (gotReq) setTimeout(function () { f(gotReq); }, 0); else reqCb = f; },
    setHeaders: function () { if (api) try { api.setHeaders.apply(api, arguments); } catch (e) {} },
    stalker: function () { return api ? api.stalker.apply(api, arguments) : Promise.reject(new Error('Los portales MAC no se pueden abrir en este TV')); },
    fullscreen: function () {},
    close: function (r) {
      sent = true;
      var ok = false;
      if (api) { try { api.close(r); ok = true; } catch (e) {} }
      if (!ok) toParent({ mvtv: 'close', result: r });
    }
  };
  var sent = false;
  /** Cierra sí o sí: primero el botón (guarda dónde ibas); si algo falla, avisa a la app directamente. */
  function closeNow() {
    var b = document.getElementById('bClose');
    try { if (b) b.click(); } catch (e) {}
    setTimeout(function () { if (!sent) window.mvPlayer.close({}); }, 500);
  }
  window.mvPlayerReplace = function () { closeNow(); };
  function click(id) { var b = document.getElementById(id); if (b) b.click(); }
  var MAP = { 10252: 'bPlay', 415: 'bPlay', 19: 'bPlay', 417: 'bFwd', 412: 'bBack', 427: 'bPrev', 428: 'bNext', 406: 'bList', 405: 'bTracks' };
  var KN = { 13: 'Enter', 33: 'PageUp', 34: 'PageDown', 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown' };
  /** Una tecla del control (también la que manda la app cuando el foco quedó afuera del reproductor). */
  function tvKey(k) {
    if (k === 10009 || k === 461 || k === 413 || k === 8 || k === 27) {
      var l = document.getElementById('list'), t = document.getElementById('tracks');
      if (t && !t.hidden) { t.hidden = true; return true; }
      if (l && !l.hidden && k !== 413) { l.hidden = true; return true; }
      closeNow(); return true;
    }
    if (MAP[k]) { click(MAP[k]); return true; }
    if (KN[k] && window.mvPlayerKey) { wake(); return window.mvPlayerKey(KN[k]); }
    return false;
  }
  function wake() { try { document.dispatchEvent(new Event('mousemove')); window.dispatchEvent(new Event('mousemove')); } catch (e) {} }
  window.mvTvKey = function (k) { try { return tvKey(k); } catch (e) { return false; } };
  window.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if (k === 10009 || k === 461 || k === 413 || k === 8 || k === 27 || MAP[k]) {
      if (k === 8 && document.activeElement && document.activeElement.tagName === 'INPUT') return;
      e.preventDefault(); e.stopImmediatePropagation(); tvKey(k);
    }
  }, true);
  // Botón X: si el cierre normal no responde, se fuerza
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('#bClose');
    if (b) setTimeout(function () { if (!sent) window.mvPlayer.close({}); }, 600);
  }, true);
  document.documentElement.classList.add('webtv');
})();
