/* Celular como control por internet (Samsung, LG y cualquier equipo sin el servidor del mando).
   El celular abre la página del mando en GitHub Pages y deja cada tecla en Firebase (rc/<código>/e);
   la TV la lee, la borra y la ejecuta. Solo se aceptan teclas con la clave de esta TV. */
(function () {
  var MV = window.MV; if (!MV) return;
  var MANDO_URL = 'https://simank19.github.io/mivibra-tv/mando/';
  var unsub = null, last = 0;

  function key() {
    var k = MV.load('rcKey', '');
    if (!/^\d{6}$/.test(k)) {
      var a = new Uint32Array(1); try { crypto.getRandomValues(a); } catch (e) { a[0] = Math.random() * 1e9; }
      k = String(a[0] % 1000000); while (k.length < 6) k = '0' + k;
      MV.save('rcKey', k);
    }
    return k;
  }
  function webtv() { return document.documentElement.classList.contains('webtv'); }

  MV.cloudRemote = {
    /** Se puede usar si la app tiene Firebase configurado. */
    ok: function () { return !!(MV.sync && MV.sync.configured && MV.sync.configured() && MV.deviceCode); },
    link: function () { return MANDO_URL + '?c=' + MV.deviceCode() + '&k=' + key(); },
    key: key,
    start: start,
    run: function (d) { run(d); }
  };

  // ---------- Teclas ----------
  var KEYS = { UP: 'ArrowUp', DOWN: 'ArrowDown', LEFT: 'ArrowLeft', RIGHT: 'ArrowRight', OK: 'Enter', MENU: 'ContextMenu', PLAYPAUSE: 'MediaPlayPause', CHUP: 'MediaTrackNext', CHDOWN: 'MediaTrackPrevious' };
  function playerWin() {
    var f = document.querySelector('iframe[src$="player.html"]');
    try { return f && f.contentWindow && f.contentWindow.document ? f.contentWindow : null; } catch (e) { return null; }
  }
  function fire(w, k) {
    var d = w.document, t = d.activeElement || d.body;
    var ev; try { ev = new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }); } catch (e) { return; }
    var passed = t.dispatchEvent(ev);
    try { t.dispatchEvent(new w.KeyboardEvent('keyup', { key: k, bubbles: true, cancelable: true })); } catch (e) {}
    // Un Enter "simulado" no pulsa botones ni enlaces por sí solo: se hace el clic
    if (k === 'Enter' && passed && t && t !== d.body && (t.tagName === 'BUTTON' || t.tagName === 'A' || (t.classList && t.classList.contains('f')) || t.getAttribute('data-act'))) {
      if (!(t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) t.click();
    }
  }
  function nav(name) {
    if (MV.webEmu && MV.webEmu.isOpen() && MV.webEmu.nav(name)) return;
    var pw = playerWin();
    if (name === 'HOME') { if (pw) fire(pw, 'Escape'); setTimeout(function () { if (MV.modalOpen && MV.modalOpen()) MV.closeModal(true); MV.go && MV.go('home'); }, pw ? 400 : 0); return; }
    if (name === 'BACK') {
      if (pw) { fire(pw, 'Escape'); return; }
      var a = document.activeElement;
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) { a.blur(); return; }
      if (MV.onBack) MV.onBack();
      return;
    }
    var k = KEYS[name]; if (!k) return;
    fire(pw || window, k);
  }
  function run(d) {
    if (d.t === 'k') nav(String(d.c || ''));
    else if (d.t === 'go' && /^[a-z]{2,20}$/.test(d.v || '') && MV.remoteGo) MV.remoteGo(d.v);
    else if (d.t === 'text' && MV.remoteText) MV.remoteText(String(d.v || '').slice(0, 200));
    else if (d.t === 'hello') {
      if (Date.now() - last > 20000) MV.toast('Celular conectado como control', 3000);
      last = Date.now();
      var el = document.getElementById('remoteCount'); if (el) el.textContent = 'Celular conectado';
    }
  }

  // ---------- Escuchar el buzón de teclas ----------
  function start() {
    if (unsub || !MV.cloudRemote.ok()) return;
    var k = key();
    MV.sync.load().then(function (fb) {
      var col = fb.firestore().collection('rc').doc(MV.deviceCode()).collection('e');
      var t0 = Date.now();
      unsub = col.onSnapshot(function (snap) {
        var list = [];
        snap.docChanges().forEach(function (ch) {
          if (ch.type !== 'added') return;
          var d = ch.doc.data() || {};
          ch.doc.ref.delete().catch(function () {});
          // Teclas viejas (de antes de abrir la app) o con otra clave: se ignoran
          if (d.k !== k || (+d.at || 0) < t0 - 5000 || Date.now() - (+d.at || 0) > 30000) return;
          list.push(d);
        });
        list.sort(function (a, b) { return (a.at || 0) - (b.at || 0) || (a.n || 0) - (b.n || 0); }).forEach(run);
      }, function () { unsub = null; setTimeout(start, 15000); });
    }).catch(function () { setTimeout(start, 30000); });
  }

  // En Samsung y LG (no tienen servidor del mando) se escucha siempre
  function boot() { if (webtv()) setTimeout(start, 3000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
