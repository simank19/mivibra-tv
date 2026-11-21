/* MiVibra TV — compatibilidad con TV box de WebView viejo (Android 7–9 sin actualizar).
 * Ahí no existen clamp()/min()/max() en CSS ni el "gap" de flexbox: la pantalla salía corrida,
 * cortada y sin centrar. Este archivo detecta lo que falta y lo reemplaza por valores fijos. */
(function () {
  'use strict';
  var root = document.documentElement;
  function sup(p, v) { try { return !!(window.CSS && CSS.supports && CSS.supports(p, v)); } catch (e) { return false; } }

  // Flex "gap" (Chrome 84+): se mide de verdad, CSS.supports no lo distingue
  try {
    var d = document.createElement('div');
    d.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden';
    d.appendChild(document.createElement('div')); d.appendChild(document.createElement('div'));
    root.appendChild(d);
    if (d.scrollHeight !== 1) root.classList.add('nogap');
    root.removeChild(d);
  } catch (e) {}

  if (sup('width', 'clamp(1px, 2px, 3px)') && sup('width', 'min(1px, 2px)')) return;
  root.classList.add('oldwv');

  // Toma los argumentos de una función CSS respetando paréntesis anidados (calc(), var()…)
  function args(s, i) {
    var depth = 0, out = [], cur = '';
    for (; i < s.length; i++) {
      var c = s[i];
      if (c === '(') { depth++; cur += c; }
      else if (c === ')') { if (!depth) { out.push(cur.trim()); return { a: out, end: i }; } depth--; cur += c; }
      else if (c === ',' && !depth) { out.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    return null;
  }
  // Valor fijo (px/rem/em) si hay uno: es el que mejor aguanta sin la función
  function fixed(list) { for (var k = 0; k < list.length; k++) if (/^-?[\d.]+(px|rem|em)$/.test(list[k])) return list[k]; return list[0]; }
  function fix(css) {
    var rx = /(^|[^a-z-])(clamp|min|max)\(/gi, m, guard = 0;
    while ((m = rx.exec(css)) && guard++ < 5000) {
      var start = m.index + m[1].length, r = args(css, rx.lastIndex);
      if (!r) break;
      var fn = m[2].toLowerCase(), v;
      // clamp(mín, ideal, máx) → el máximo (pantallas de TV); min/max → el valor fijo
      v = fn === 'clamp' ? (r.a[2] || r.a[1]) : fixed(r.a);
      if (/^(clamp|min|max)\(/i.test(v) === false && /[+\-*/]\s/.test(v) && !/^calc\(/i.test(v)) v = 'calc(' + v + ')';
      css = css.slice(0, start) + v + css.slice(r.end + 1);
      rx.lastIndex = start;
    }
    return css;
  }
  var links = document.querySelectorAll('link[rel=stylesheet]');
  for (var i = 0; i < links.length; i++) {
    var l = links[i], href = l.getAttribute('href') || '';
    if (/^https?:/.test(href)) continue;
    try {
      var x = new XMLHttpRequest(); x.open('GET', href, false); x.send();
      if (!x.responseText) continue;
      var st = document.createElement('style'); st.setAttribute('data-from', href);
      st.textContent = fix(x.responseText);
      l.parentNode.insertBefore(st, l.nextSibling); l.disabled = true;
    } catch (e) {}
  }
})();
