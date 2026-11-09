/* MiVibra TV — Íconos de consolas (dibujos propios, de línea, sin logos de marca).
   MV.sysIcon(id) devuelve un <svg> que toma el color del texto (currentColor). */
(function () {
  'use strict';
  var MV = window.MV = window.MV || {};

  // Piezas reutilizables
  function dpad(x, y, r) {   // cruceta centrada en x,y
    var a = r / 3;
    return '<path d="M' + (x - a) + ' ' + (y - r) + 'h' + 2 * a + 'v' + (r - a) + 'h' + (r - a) + 'v' + 2 * a + 'h-' + (r - a) + 'v' + (r - a) + 'h-' + 2 * a + 'v-' + (r - a) + 'h-' + (r - a) + 'v-' + 2 * a + 'h' + (r - a) + 'z" fill="currentColor" stroke="none"/>';
  }
  function dot(x, y, r) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="currentColor" stroke="none"/>'; }
  function diamond(x, y, d, r) { return dot(x, y - d, r) + dot(x + d, y, r) + dot(x, y + d, r) + dot(x - d, y, r); }

  var I = {
    // Control rectangular de 2 botones (NES)
    nes: '<rect x="4" y="15" width="40" height="18" rx="2"/>' + dpad(13, 24, 5) + dot(31, 26, 2.4) + dot(38, 26, 2.4) + '<path d="M20 25h3M24.5 25h3"/>',
    // Control redondeado de 4 botones (Super Nintendo)
    snes: '<path d="M14 14h20a10 10 0 0 1 0 20H14a10 10 0 0 1 0-20z"/>' + dpad(14, 24, 5) + diamond(34, 24, 4, 2) + '<path d="M21 27l2-2M25 27l2-2"/>',
    // Consola de bolsillo vertical
    gb: '<rect x="12" y="4" width="24" height="40" rx="3" ry="3"/><rect x="16" y="8" width="16" height="13" rx="1"/>' + dpad(19, 31, 3.6) + dot(29, 32, 2) + dot(33, 29, 2) + '<path d="M22 39h2M26 39h2"/>',
    gbc: '<rect x="12" y="4" width="24" height="40" rx="3" ry="5"/><rect x="16" y="8" width="16" height="13" rx="1"/><path d="M19 17l4-4 3 3 3-2" stroke-width="1.6"/>' + dpad(19, 31, 3.6) + dot(29, 32, 2) + dot(33, 29, 2),
    // De bolsillo horizontal con hombros (Game Boy Advance)
    gba: '<path d="M10 13h28c4 0 7 3 7 7v8c0 4-3 7-7 7H10c-4 0-7-3-7-7v-8c0-4 3-7 7-7z"/><rect x="15" y="16" width="18" height="14" rx="1"/>' + dpad(9, 24, 3) + dot(39, 22, 1.8) + dot(41, 27, 1.8),
    // Consola con palanca y cartucho (Nintendo 64)
    n64: '<path d="M6 18c0-3 3-5 6-5h24c3 0 6 2 6 5l-3 12c-1 3-3 4-5 4l-3 8h-4l-2-8h-2l-2 8h-4l-3-8c-2 0-4-1-5-4z"/><circle cx="24" cy="25" r="3"/>' + dpad(13, 21, 3.5) + dot(34, 19, 1.7) + dot(37, 23, 1.7) + dot(32, 23, 1.7),
    // Dos pantallas (Nintendo DS)
    nds: '<rect x="11" y="3" width="26" height="19" rx="2"/><rect x="15" y="6" width="18" height="13" rx="1"/><rect x="11" y="25" width="26" height="20" rx="2"/><rect x="17" y="28" width="14" height="11" rx="1"/>' + dpad(14, 33, 2) + dot(34, 33, 1.3),
    // Control en media luna de 3 botones (Genesis)
    md: '<path d="M8 17c2-3 5-4 9-4h14c4 0 7 1 9 4 3 5 4 12 1 15-2 2-5 1-7-1l-3-3H18l-3 3c-2 2-5 3-7 1-3-3-2-10 0-15z"/>' + dpad(15, 21, 4) + dot(29, 23, 1.9) + dot(33, 21, 1.9) + dot(37, 19, 1.9),
    // Control cuadrado de 2 botones (Master System)
    sms: '<rect x="5" y="14" width="38" height="20" rx="1"/><path d="M5 19h38" stroke-width="1.5"/>' + dpad(14, 26, 5) + '<circle cx="31" cy="27" r="2.6"/><circle cx="38" cy="27" r="2.6"/>',
    // De bolsillo ancho con pantalla al centro (Game Gear)
    gg: '<path d="M4 18c0-3 2-5 5-5h30c3 0 5 2 5 5v12c0 3-2 5-5 5H9c-3 0-5-2-5-5z"/><rect x="16" y="16" width="16" height="13" rx="1"/>' + dpad(10, 24, 3.2) + dot(37, 22, 1.8) + dot(40, 26, 1.8),
    // Control redondo con 4 botones y agarraderas (PlayStation)
    psx: '<path d="M13 14h22c5 0 8 4 9 9l2 11c1 4-3 7-6 4l-6-6H14l-6 6c-3 3-7 0-6-4l2-11c1-5 4-9 9-9z"/>' + dpad(13, 22, 4) + diamond(35, 22, 3.6, 1.8) + '<circle cx="19" cy="29" r="2.3"/><circle cx="29" cy="29" r="2.3"/>',
    // Palanca con botón (Atari)
    a26: '<rect x="9" y="30" width="30" height="12" rx="2"/><path d="M24 30V12"/><circle cx="24" cy="10" r="4"/><circle cx="14" cy="26" r="3"/>',
    a78: '<path d="M8 33h32l-3 9H11z"/><path d="M24 33V13"/><path d="M19 13h10l-2-6h-6z"/><circle cx="14" cy="29" r="2.5"/><circle cx="34" cy="29" r="2.5"/>',
    // Portátil muy ancha (Lynx)
    lynx: '<rect x="2" y="13" width="44" height="22" rx="5"/><rect x="15" y="17" width="18" height="14" rx="1"/>' + dpad(8, 24, 3.2) + dot(39, 21, 1.8) + dot(41, 27, 1.8),
    // Consola cuadrada pequeña con tarjeta (PC Engine)
    pce: '<rect x="8" y="12" width="32" height="26" rx="3"/><rect x="14" y="8" width="20" height="8" rx="1"/><path d="M14 30h20M14 34h20"/><circle cx="34" cy="22" r="2"/>',
    // De bolsillo con palanquita (Neo Geo Pocket)
    ngp: '<path d="M6 16c0-2 2-4 4-4h28c2 0 4 2 4 4v16c0 2-2 4-4 4H10c-2 0-4-2-4-4z"/><rect x="17" y="15" width="16" height="14" rx="1"/><circle cx="11" cy="24" r="3.5"/><circle cx="11" cy="24" r="1.2" fill="currentColor"/>' + dot(37, 22, 1.8) + dot(39, 27, 1.8),
    // De bolsillo vertical alargada (WonderSwan)
    ws: '<rect x="4" y="12" width="40" height="24" rx="4"/><rect x="14" y="16" width="20" height="14" rx="1"/>' + diamond(9, 24, 2.6, 1.2) + dot(38, 22, 1.7) + dot(40, 27, 1.7),
    // Máquina de arcade
    arcade: '<path d="M14 4h20v6l3 4v30H11V14l3-4z"/><rect x="15" y="14" width="18" height="12" rx="1"/><path d="M11 30h26"/><path d="M18 30v-3" /><circle cx="18" cy="26" r="1.8" fill="currentColor"/>' + dot(26, 34, 1.6) + dot(30, 34, 1.6) + '<path d="M17 40h14"/>',
    // Portátil ancha con palanquita (PSP)
    psp: '<path d="M8 14h32c4 0 6 3 6 6v8c0 3-2 6-6 6H8c-4 0-6-3-6-6v-8c0-3 2-6 6-6z"/><rect x="13" y="17" width="22" height="14" rx="1"/>' + dpad(7.6, 21, 2.6) + '<circle cx="7.5" cy="29" r="1.6"/>' + diamond(40.5, 24, 2.6, 1.1),
    // Control con ranura de memoria (Dreamcast)
    dc: '<path d="M14 10h20c4 0 7 3 7 7v9c0 6-3 14-8 14-3 0-4-3-5-6h-8c-1 3-2 6-5 6-5 0-8-8-8-14v-9c0-4 3-7 7-7z"/><rect x="19" y="13" width="10" height="9" rx="1"/><circle cx="14" cy="27" r="3"/>' + diamond(34, 26, 3, 1.4),
    // Control con botón grande (GameCube)
    gc: '<path d="M12 12h24c5 0 8 4 8 9 0 6-2 15-6 18-3 2-6 0-7-3l-1-4H18l-1 4c-1 3-4 5-7 3-4-3-6-12-6-18 0-5 3-9 8-9z"/><circle cx="13" cy="21" r="3.5"/><circle cx="34" cy="21" r="3.6" fill="currentColor" stroke="none"/><circle cx="39" cy="26" r="1.6"/><circle cx="29" cy="17" r="1.4"/><circle cx="20" cy="29" r="2.4"/>' + dpad(28, 30, 2.6),
    // Juegos de PC en primera persona: mira
    doom: '<circle cx="24" cy="24" r="14"/><circle cx="24" cy="24" r="4"/><path d="M24 4v10M24 34v10M4 24h10M34 24h10"/>',
    quake: '<path d="M24 4l16 9v22l-16 9-16-9V13z"/><path d="M24 14l-6 14h12z"/>',
    wolf: '<rect x="5" y="7" width="38" height="26" rx="2"/><path d="M16 41h16M24 33v8"/><path d="M15 26l6-11 4 6 3-4 5 9z"/>',
    cave: '<path d="M4 40c3-14 9-26 20-26s17 12 20 26z"/><path d="M24 22l2.5 5 5.5.8-4 3.8 1 5.4-5-2.6-5 2.6 1-5.4-4-3.8 5.5-.8z"/>',
    '?': '<rect x="6" y="14" width="36" height="20" rx="10"/><path d="M21 21c0-2 1.5-3 3-3s3 1 3 3c0 2.5-3 2.5-3 5"/>' + dot(24, 30, 1.4)
  };

  // Íconos a color de KyleBing/retro-game-console-icons (CC BY 4.0); los demás usan el dibujo de línea
  var PNG = ['nes', 'snes', 'gb', 'gbc', 'gba', 'n64', 'nds', 'md', 'sms', 'gg', 'psx', 'a26', 'a78', 'lynx', 'pce', 'ngp', 'ws', 'arcade', 'neogeo', 'psp', 'dc', 'doom', 'quake', 'cave'];
  MV.sysIcon = function (id) {
    if (PNG.indexOf(id) >= 0) return '<img class="sysic sysimg" src="img/consoles/' + id + '.png" alt="" loading="lazy">';
    var body = I[id] || I['?'];
    return '<svg class="sysic" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  };
  MV.sysIconIds = Object.keys(I);
})();
