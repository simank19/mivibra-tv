/* Arranque en Samsung / LG: si hay internet usa la versión más nueva publicada (se actualiza sola, sin reinstalar);
   si no, la que viene instalada. La configuración de la cuenta (config.js) siempre es la instalada. */
(function () {
  var REMOTE = 'https://simank19.github.io/mivibra-tv/tv/';
  var LOCAL_TS = window.MVTV_BUILD || 0, FILES = window.MVTV_FILES || { css: [], js: [] };
  function load(base, list, done) {
    var css = list.css || [], js = list.js || [];
    css.forEach(function (f) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = (/^https?:/.test(f) ? '' : base) + f; document.head.appendChild(l); });
    var i = 0;
    (function next() {
      if (i >= js.length) { done(); return; }
      var f = js[i++], s = document.createElement('script');
      // config.js (datos de la cuenta) siempre del TV
      s.src = (f === 'config.js' || /^https?:/.test(f) ? '' : base) + f;
      s.onload = next;
      s.onerror = function () { if (base) { console.warn('Falló ' + f + ', uso la copia del TV'); var t = document.createElement('script'); t.src = f; t.onload = t.onerror = next; document.head.appendChild(t); } else next(); };
      document.head.appendChild(s);
    })();
  }
  function start(base, list) {
    load(base, list, function () {
      // Los archivos se cargaron después de que la página estaba lista: se avisa de nuevo para que arranque la app
      if (document.readyState !== 'loading') { try { document.dispatchEvent(new Event('DOMContentLoaded')); } catch (e) { var ev = document.createEvent('Event'); ev.initEvent('DOMContentLoaded', true, true); document.dispatchEvent(ev); } }
    });
  }
  var decided = false;
  function local() { if (decided) return; decided = true; start('', FILES); }
  var x = new XMLHttpRequest();
  try {
    x.open('GET', REMOTE + 'manifest.json?t=' + Date.now(), true); x.timeout = 4000;
    x.onload = function () {
      if (decided) return;
      var m = null; try { m = JSON.parse(x.responseText); } catch (e) {}
      if (x.status === 200 && m && m.ts >= LOCAL_TS && m.files && m.files.js && m.files.js.length) {
        decided = true; window.MVTV_REMOTE = m;
        var q = '?v=' + m.ts;
        start(REMOTE, { css: m.files.css.map(function (f) { return f + q; }), js: m.files.js.map(function (f) { return f === 'config.js' ? f : f + q; }) });
      } else local();
    };
    x.onerror = x.ontimeout = local;
    x.send();
  } catch (e) { local(); }
  setTimeout(local, 5000);
})();
