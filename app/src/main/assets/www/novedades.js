/* MiVibra TV · Novedades: cuando el superadministrador publica algo en la Tienda, la Librería o Cursos, a cada usuario
   le aparece un aviso (una sola vez) con lo nuevo y un botón para verlo. Nada se descarga solo: cada quien baja lo que quiera. */
(function () {
  'use strict';
  var MV = window.MV;
  if (!MV || !MV.on) return;
  var esc = MV.esc || function (s) { return String(s); };
  var SRC = [['tiendaExtra', 'Tienda', 'hwOpen', 'tienda', 'nombre'], ['librosExtra', 'Librería', 'lbGo', '', 'nombre'], ['cursosExtra', 'Cursos', 'nav', 'cursos', 'nombre']];
  var shown = false;
  function check() {
    var c = MV.acct && MV.acct.config;
    if (!c || (MV.acct.isAdmin && MV.acct.isAdmin())) return;
    var seen = MV.load('pubSeen', null), first = !seen; seen = seen || {};
    var fresh = [];
    SRC.forEach(function (s) {
      (c[s[0]] || []).forEach(function (x) {
        var k = s[0] + ':' + x.id; if (seen[k]) return;
        seen[k] = 1; if (!first) fresh.push({ src: s, name: x[s[4]] || x.nombre || x.titulo || 'Nuevo' });
      });
    });
    MV.save('pubSeen', seen);
    if (!fresh.length || shown) return;
    shown = true;
    setTimeout(function () {
      if (MV.modalOpen && MV.modalOpen()) { shown = false; return; }
      var by = {}; fresh.forEach(function (f) { (by[f.src[1]] = by[f.src[1]] || { src: f.src, names: [] }).names.push(f.name); });
      MV.modal('<h2>Nuevo en MiVibra</h2><p class="muted">Se publicó contenido nuevo. Descarga o mira lo que quieras: nada se baja solo.</p>' +
        Object.keys(by).map(function (k) { var g = by[k];
          return '<div class="hwrow" style="align-items:flex-start;gap:12px"><div style="flex:1"><b>' + esc(k) + '</b><p class="muted" style="margin:4px 0 0">' + g.names.slice(0, 5).map(esc).join(' · ') + (g.names.length > 5 ? ' y ' + (g.names.length - 5) + ' más' : '') + '</p></div>' +
            '<button class="btn sm f" data-act="pubGo" data-arg="' + g.src[2] + '|' + g.src[3] + '">Ver</button></div>'; }).join('') +
        '<div class="btns" style="margin-top:12px"><button class="btn ghost f" data-act="closeModal">Ahora no</button></div>');
    }, 2500);
  }
  MV.ACT.pubGo = function (a) {
    var p = String(a).split('|'); MV.closeModal(true);
    if (MV.ACT[p[0]]) MV.ACT[p[0]](p[1]);
  };
  MV.on('acct', check);
})();
