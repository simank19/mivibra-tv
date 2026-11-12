/* Reproductor dentro del TV (Samsung / LG): se conecta con la app y traduce las teclas del control. */
(function () {
  try { window.mvPlayer = parent.MVTV.playerApi; } catch (e) {}
  window.mvPlayerReplace = function () { var b = document.getElementById('bClose'); if (b) b.click(); };
  function click(id) { var b = document.getElementById(id); if (b) b.click(); }
  window.addEventListener('keydown', function (e) {
    var k = e.keyCode, map = { 10009: 'bClose', 461: 'bClose', 413: 'bClose', 10252: 'bPlay', 415: 'bPlay', 19: 'bPlay', 417: 'bFwd', 412: 'bBack', 427: 'bPrev', 428: 'bNext', 406: 'bList', 405: 'bTracks' };
    if (map[k]) { e.preventDefault(); e.stopImmediatePropagation(); click(map[k]); }
  }, true);
  document.documentElement.classList.add('webtv');
})();
