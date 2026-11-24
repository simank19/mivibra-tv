/* MiVibra TV · Fotos: widget de marco en el Inicio, sección Fotos y visor a pantalla completa.
   De dónde salen: la galería del equipo (no se copian), carpetas del equipo o USB, carpetas compartidas de
   Google Drive o MEGA (por enlace) y fotos enviadas desde el celular a la TV. */
(function () {
  'use strict';
  var MV = window.MV, S = MV.S, A = MV.A, esc = MV.esc;
  var IMG_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif', 'avif'];
  var IMG_RE = /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i;
  var ALBUM = 'all', SEL = null;

  // ---------- Guardado ----------
  function mine() { return MV.load('photos', []) || []; }
  function saveMine(a) { MV.save('photos', a.slice(0, 5000)); }
  function albums() { return MV.load('photoAlbums', []) || []; }
  function saveAlbums(a) { try { MV.save('photoAlbums', a); } catch (e) { MV.toast('Hay demasiadas fotos de carpetas guardadas'); } }
  function hash(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function ext(n) { var m = String(n || '').toLowerCase().match(/\.([a-z0-9]{2,5})$/); return m ? m[1] : 'jpg'; }

  /** Dirección que la interfaz puede mostrar */
  function mediaUrl(path, e) {
    var b = btoa(unescape(encodeURIComponent(path))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return 'https://appassets.androidplatform.net/media/' + b + '.' + (e === 'jpeg' ? 'jpg' : e);
  }
  function localUrl(p, name) { if (MV.device.desktop && A && A.fileUrl) return A.fileUrl(p); return mediaUrl(p, ext(name || p)); }
  var megaMem = MV.load('megaPhotoUrl', {}) || {}, megaBusy = {};
  function srcOf(p, big) {
    if (p.url) return p.url;
    if (p.uri || p.path) return localUrl(p.uri || p.path, p.name);
    if (p.drive) return 'https://drive.google.com/thumbnail?id=' + p.drive + '&sz=' + (big ? 'w2400' : 'w600');
    if (p.mega) return megaMem[p.mega] || '';
    return '';
  }
  /** Fotos de MEGA: se descargan y descifran la primera vez (después quedan en caché). */
  // De a una a la vez (las demás esperan en fila), para no ocupar la conexión de la app
  var megaQ = [], megaRun = 0;
  function needMega(p, cb) {
    if (!p.mega || megaMem[p.mega] || megaBusy[p.mega] || !A || !A.megaPhoto) return;
    megaBusy[p.mega] = 1; megaQ.push([p, cb]); megaNext();
  }
  function megaNext() {
    if (megaRun || !megaQ.length) return;
    var job = megaQ.shift(), p = job[0], cb = job[1]; megaRun = 1;
    MV.call('megaPhoto', [p.mega]).then(function (r) {
      megaMem[p.mega] = r.url; var ks = Object.keys(megaMem); if (ks.length > 300) delete megaMem[ks[0]];
      MV.save('megaPhotoUrl', megaMem); if (cb) cb(r.url);
    }).catch(function () {}).then(function () { delete megaBusy[p.mega]; megaRun = 0; megaNext(); });
  }

  /** Todas las fotos, las más nuevas primero. */
  function allPhotos() {
    var out = mine().map(function (p) { return Object.assign({ album: p.src === 'phone' ? 'phone' : p.src === 'scan' ? 'scan' : 'dev' }, p); });
    albums().forEach(function (a) { (a.items || []).forEach(function (it) { out.push(Object.assign({ album: a.id, at: a.at || 0 }, it)); }); });
    out.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    return out;
  }
  MV.photos = { all: allPhotos };
  function albumName(id) {
    if (id === 'dev') return 'Galería del equipo'; if (id === 'phone') return 'Desde el celular'; if (id === 'scan') return 'Carpetas y USB';
    var a = albums().filter(function (x) { return x.id === id; })[0]; return a ? a.name : 'Fotos';
  }

  // ---------- Agregar ----------
  function addLocal(arr, src) {
    var cur = mine(), have = {}; cur.forEach(function (p) { have[p.k] = 1; });
    var n = 0, now = Date.now();
    arr.forEach(function (x, i) {
      var k = hash((x.uri || x.path || x.url) + ''); if (have[k]) return;
      have[k] = 1; n++;
      cur.unshift(Object.assign({ k: k, name: x.name || 'Foto', src: src, at: now - i }, x.uri ? { uri: x.uri } : x.path ? { path: x.path } : { url: x.url, file: x.file }));
    });
    saveMine(cur);
    return n;
  }
  function pickDevice() {
    MV.closeModal(true);
    if (!A) return MV.toast('Disponible en la app instalada');
    if (MV.device.desktop) {
      return MV.call('pickFiles', ['photos']).then(function (items) {
        var n = addLocal((items || []).filter(function (x) { return IMG_RE.test(x.name); }).map(function (x) { return { path: x.path, name: x.name }; }), 'dev');
        MV.toast(n ? n + (n === 1 ? ' foto agregada' : ' fotos agregadas') : 'Ya estaban todas', 4000); ALBUM = 'all'; MV.go('photos');
      }).catch(function (e) { if (e.message !== 'cancel') MV.toast(e.message, 5000); });
    }
    if (!A.pickPhotos) return MV.toast('Actualiza MiVibra TV para elegir fotos de la galería', 5000);
    MV.call('pickPhotos', []).then(function (arr) {
      var n = addLocal((arr || []).map(function (x) { return { uri: x.uri, name: /\./.test(x.name) ? x.name : x.name + '.' + (String(x.mime).split('/')[1] || 'jpg') }; }), 'dev');
      MV.toast(n ? n + (n === 1 ? ' foto agregada' : ' fotos agregadas') : 'Ya estaban todas', 4000); ALBUM = 'all'; MV.go('photos');
    }).catch(function (e) { if (e.message === 'nopicker') MV.toast('Este equipo no tiene galería: usa "Carpetas del equipo o USB" o envíalas desde el celular', 6000); else if (e.message !== 'cancel') MV.toast(e.message, 5000); });
  }
  function scanFolders() {
    MV.closeModal(true);
    if (!A || !A.scanRoms) return MV.toast('Disponible en la app instalada');
    if (A.hasStorageAccess && !A.hasStorageAccess()) { MV.toast('Dale permiso a MiVibra TV para ver tus archivos y vuelve'); A.requestStorageAccess(); return; }
    var roots = []; try { roots = JSON.parse(A.storageRoots()).filter(function (r) { return r.readable; }).map(function (r) { return r.path; }); } catch (e) {}
    MV.toast('Buscando fotos en el equipo y en la USB…', 4000);
    MV.call('scanRoms', [JSON.stringify(roots), JSON.stringify(IMG_EXT)]).then(function (arr) {
      // Sin miniaturas de apps ni carpetas ocultas
      var ok = (arr || []).filter(function (f) { var p = f.path || f; return IMG_RE.test(p) && !/\/\.|\/Android\/|thumbnail|\.thumb|cache/i.test(p); });
      var n = addLocal(ok.slice(0, 3000).map(function (f) { var p = f.path || f; return { path: p, name: String(p).split('/').pop() }; }), 'scan');
      MV.toast(n ? n + ' fotos encontradas' : 'No encontré fotos nuevas', 4500); ALBUM = 'scan'; MV.go('photos');
    }).catch(function (e) { MV.toast(e.message, 5000); });
  }
  function driveId(u) { var m = String(u).match(/\/(?:file\/d|folders)\/([\w-]{10,})/) || String(u).match(/[?&]id=([\w-]{10,})/); return m ? m[1] : ''; }
  function drivePhotos(u, depth, out) {
    out = out || []; depth = depth || 0;
    var id = driveId(u); if (!id) return Promise.resolve(out);
    if (/\/file\/d\//.test(u)) { out.push({ drive: id, name: 'Foto' }); return Promise.resolve(out); }
    return MV.getText('https://drive.google.com/embeddedfolderview?id=' + id).then(function (h) {
      var re = /<a href="([^"]+)"[^>]*>[\s\S]*?<div class="flip-entry-title">([^<]+)<\/div>/g, m, subs = [];
      while ((m = re.exec(h))) {
        var href = m[1].replace(/&amp;/g, '&'), name = m[2].replace(/&amp;/g, '&').trim();
        if (/\/folders\//.test(href)) { if (depth < 2) subs.push(href); }
        else if (IMG_RE.test(name)) { var fid = driveId(href); if (fid) out.push({ drive: fid, name: name }); }
      }
      return subs.reduce(function (pr, sb) { return pr.then(function () { return drivePhotos(sb, depth + 1, out); }); }, Promise.resolve()).then(function () { return out; });
    });
  }
  function megaPhotos(u) {
    if (!A || !A.megaList) return Promise.reject(new Error('Las carpetas de MEGA se ven en la app de Android o PC'));
    return MV.call('megaList', [u]).then(function (arr) { return (arr || []).filter(function (f) { return IMG_RE.test(f.name || ''); }).map(function (f) { return { mega: f.url, name: f.name }; }); });
  }
  function linkAsk() {
    MV.closeModal(true);
    MV.modal('<h2>Fotos por enlace</h2><p class="muted">Pega el enlace de una carpeta compartida de <b>Google Drive</b> ("Cualquier persona con el enlace") o de <b>MEGA</b>. Las fotos se ven desde ahí, sin ocupar espacio.</p>' +
      '<label class="field">Nombre del álbum<input class="in f" id="phName" placeholder="Vacaciones 2025" autocomplete="off" data-autofocus></label>' +
      '<label class="field">Enlace<input class="in f" id="phUrl" placeholder="https://drive.google.com/drive/folders/…" inputmode="url" autocomplete="off"></label>' +
      '<p id="phErr" style="color:#FF8A80;font-size:14px;margin:0 0 8px"></p>' +
      '<div class="btns"><button class="btn f" data-act="photoLinkSave">Traer fotos</button><button class="btn ghost f" data-act="confirmNo">Cancelar</button></div>');
  }
  function loadAlbum(a) {
    var u = a.url;
    var job = /mega(\.co)?\.nz\//i.test(u) ? megaPhotos(u) : /drive\.google\.com|docs\.google\.com/i.test(u) ? drivePhotos(u) : Promise.reject(new Error('Por ahora: carpetas de Google Drive o MEGA'));
    return job.then(function (items) {
      if (!items.length) throw new Error('No encontré fotos en ese enlace (¿está compartido como público?)');
      a.items = items.slice(0, 3000).map(function (x, i) { return Object.assign({ k: a.id + ':' + hash(x.drive || x.mega), at: (a.at || Date.now()) - i }, x); });
      return a;
    });
  }
  function linkSave() {
    var u = (document.getElementById('phUrl') || {}).value || '', nm = (document.getElementById('phName') || {}).value || '', err = document.getElementById('phErr');
    u = u.trim(); if (!u) { if (err) err.textContent = 'Pega el enlace de la carpeta.'; return; }
    var a = { id: 'al' + Date.now().toString(36), name: nm.trim() || (/mega/i.test(u) ? 'MEGA' : 'Google Drive'), url: u, at: Date.now() };
    if (err) err.textContent = 'Buscando fotos…';
    loadAlbum(a).then(function () {
      var all = albums(); all.unshift(a); saveAlbums(all);
      MV.closeModal(true); MV.toast(a.items.length + ' fotos en «' + a.name + '»', 4000); ALBUM = a.id; MV.go('photos');
    }).catch(function (e) { if (err) err.textContent = e.message || 'No se pudo leer el enlace'; });
  }
  function fromPhone() {
    MV.closeModal(true);
    var r = null; try { r = A && A.remoteStart ? JSON.parse(A.remoteStart()) : null; } catch (e) {}
    if (!r || !r.ok || !r.url) return MV.toast(A ? 'Conecta la TV a una red Wi-Fi para recibir fotos del celular' : 'Recibir fotos del celular funciona en la app de Android TV', 6000);
    var link = MV.remoteLink ? MV.remoteLink(r, 'fotos') : r.url.replace(/\/?$/, '/') + 'fotos';
    MV.modal('<h2>Enviar fotos desde el celular</h2><div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap"><div id="phQr" style="width:190px;background:#fff;border-radius:14px;padding:8px"></div>' +
      '<div style="flex:1;min-width:220px"><p>Escanea el código con la cámara del celular (mismo Wi-Fi que la TV), elige tus fotos y llegan aquí solas.</p><p class="muted" style="font-size:13px">' + esc(link.split('?')[0]) + (r.key ? ' · clave <b>' + esc(r.key) + '</b>' : '') + '</p></div></div>' +
      '<div class="btns"><button class="btn f" data-act="closeModal" data-autofocus>Listo</button></div>', {
      onOpen: function () { var b = document.getElementById('phQr'); if (b && window.qrcode) { try { var q = qrcode(0, 'M'); q.addData(link); q.make(); b.innerHTML = q.createSvgTag({ cellSize: 5, margin: 1, scalable: true }); } catch (e) {} } }
    });
  }
  MV.onPhotoReceived = function (info) {
    addLocal([{ url: info.url, file: info.file, name: info.name }], 'phone');
    var cnt = (MV._phRecv = (MV._phRecv || 0) + 1);
    clearTimeout(MV._phRecvT);
    MV._phRecvT = setTimeout(function () { MV.toast((cnt === 1 ? 'Llegó una foto' : 'Llegaron ' + cnt + ' fotos') + ' del celular', 4000); MV._phRecv = 0; var v = MV.viewName && MV.viewName(); if (!MV.modalOpen() && (v === 'photos' || v === 'home')) MV.rerender(); }, 900);
  };
  function addMenu() {
    var tv = MV.device.tv, pc = MV.device.desktop;
    MV.modal('<h2>Agregar fotos</h2><div class="btns" style="flex-direction:column;align-items:stretch">' +
      (!tv ? '<button class="btn f" data-act="photoPick" data-autofocus>' + (pc ? 'Elegir fotos del PC' : 'Elegir de la galería') + '</button>' : '') +
      (A && !pc ? '<button class="btn ' + (tv ? '' : 'ghost ') + 'f" data-act="photoScan"' + (tv ? ' data-autofocus' : '') + '>Buscar en carpetas del equipo o USB</button>' : '') +
      (A && !pc ? '<button class="btn ghost f" data-act="photoPhone">Enviar desde el celular a la TV</button>' : '') +
      '<button class="btn ghost f" data-act="photoLink">Carpeta de Google Drive o MEGA</button>' +
      '<button class="btn ghost f" data-act="confirmNo">Cancelar</button></div>');
  }

  // ---------- Visor ----------
  var VW = null;
  function viewer(list, i) {
    closeViewer();
    if (!list.length) return;
    var box = document.createElement('div'); box.className = 'phv'; box.tabIndex = -1;
    box.innerHTML = '<img class="a" alt=""><img class="b" alt=""><div class="phvbar"><button class="f" data-v="prev" aria-label="Anterior">‹</button><span class="t"></span><button class="f" data-v="play" aria-label="Presentación">▶</button><button class="f" data-v="next" aria-label="Siguiente">›</button><button class="f" data-v="close" aria-label="Cerrar">✕</button></div>';
    document.body.appendChild(box);
    VW = { box: box, list: list, i: i, front: 'a', play: false, t: null, hide: null };
    var show = function (n, dir) {
      VW.i = (n + list.length) % list.length;
      var p = list[VW.i], back = VW.front === 'a' ? 'b' : 'a', im = box.querySelector('img.' + back), fr = box.querySelector('img.' + VW.front);
      var set = function (u) { im.src = u; };
      var u = srcOf(p, true); if (u) set(u); else needMega(p, function (x) { if (VW && VW.list[VW.i] === p) set(x); });
      im.onload = function () { im.classList.add('on'); fr.classList.remove('on'); VW.front = back; };
      im.onerror = function () { im.classList.add('on'); fr.classList.remove('on'); VW.front = back; };
      box.querySelector('.t').textContent = (VW.i + 1) + ' / ' + list.length + ' · ' + String(p.name || '').replace(/\.[a-z0-9]+$/i, '');
      // La siguiente se pide antes (más fluido)
      var nx = list[(VW.i + 1) % list.length]; if (nx) { var nu = srcOf(nx, true); if (nu) { var pre = new Image(); pre.src = nu; } else needMega(nx); }
    };
    VW.show = show;
    var bar = function () { box.classList.add('ui'); clearTimeout(VW.hide); VW.hide = setTimeout(function () { if (VW) box.classList.remove('ui'); }, 3500); };
    var toggle = function () { VW.play = !VW.play; box.querySelector('[data-v="play"]').textContent = VW.play ? '❚❚' : '▶'; clearInterval(VW.t); if (VW.play) VW.t = setInterval(function () { show(VW.i + 1); }, 6000); };
    VW.toggle = toggle; VW.bar = bar;
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-v]'); bar();
      if (!b) return;
      var v = b.getAttribute('data-v');
      if (v === 'prev') show(VW.i - 1); else if (v === 'next') show(VW.i + 1); else if (v === 'play') toggle(); else closeViewer();
    });
    var x0 = null;
    box.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', function (e) { if (x0 == null) return; var dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) show(VW.i + (dx < 0 ? 1 : -1)); });
    show(i); bar();
    var pb = box.querySelector('[data-v="play"]'); if (pb) pb.focus();
  }
  function closeViewer() { if (!VW) return; clearInterval(VW.t); clearTimeout(VW.hide); VW.box.remove(); VW = null; }
  MV.photoViewerOpen = function () { return !!VW; };
  MV.photoViewerClose = closeViewer;
  // Teclas del control en el visor (antes que la navegación de la app)
  window.addEventListener('keydown', function (e) {
    if (!VW) return;
    var k = e.key;
    if (k === 'ArrowRight' || k === 'MediaTrackNext') { VW.show(VW.i + 1); VW.bar(); }
    else if (k === 'ArrowLeft' || k === 'MediaTrackPrevious') { VW.show(VW.i - 1); VW.bar(); }
    else if (k === 'Enter' || k === ' ' || k === 'MediaPlayPause') { var ae = document.activeElement, v = ae && ae.getAttribute && ae.getAttribute('data-v'); if (v === 'prev') VW.show(VW.i - 1); else if (v === 'next') VW.show(VW.i + 1); else if (v === 'close') closeViewer(); else VW.toggle(); VW.bar(); }
    else if (k === 'Escape' || k === 'Backspace' || k === 'GoBack' || k === 'BrowserBack') closeViewer();
    else if (k === 'ArrowUp' || k === 'ArrowDown') { VW.bar(); return; }
    else return;
    e.preventDefault(); e.stopPropagation();
  }, true);

  // ---------- Widget del Inicio ----------
  var wT = null;
  MV.photoWidget = function () {
    var list = allPhotos();
    if (!list.length) {
      return '<section class="phw empty glass" aria-label="Fotos"><div class="phwt"><b>Tus fotos</b><span>Mira tus fotos en grande: de la galería, de una USB, de Google Drive o MEGA, o enviadas desde el celular.</span></div>' +
        '<button class="btn sm f" data-act="photoAdd">' + (MV.icon ? '' : '') + 'Agregar fotos</button></section>';
    }
    setTimeout(widgetStart, 50);
    return '<section class="phw glass" aria-label="Fotos"><button class="phwf f" data-act="photoView" data-arg="0" aria-label="Ver fotos en pantalla completa"><img class="a on" alt=""><img class="b" alt=""><span class="cap"></span></button>' +
      '<div class="phwt"><b>Tus fotos</b><span>' + list.length.toLocaleString('es-CO') + (list.length === 1 ? ' foto' : ' fotos') + '</span>' +
      '<div class="btns"><button class="btn ghost sm f" data-act="nav" data-arg="photos">Ver todas</button><button class="btn ghost sm f" data-act="photoAdd">Agregar</button></div></div></section>';
  };
  // Recuadro pequeño junto a deportes y la hora (la foto se ve grande y va cambiando)
  MV.photoTile = function () {
    var list = allPhotos();
    if (!list.length) return '<section class="vtile vphoto empty" aria-label="Fotos"><b>Tus fotos</b><span>De la galería, una USB, Drive, MEGA o el celular</span><button class="btn sm f" data-act="photoAdd">Agregar fotos</button></section>';
    setTimeout(widgetStart, 50);
    return '<section class="vtile vphoto" aria-label="Fotos"><button class="phwf f" data-act="photoView" data-arg="0" aria-label="Ver fotos en pantalla completa"><img class="a on" alt=""><img class="b" alt=""><span class="cap"></span></button>' +
      '<div class="vph-b"><b>Tus fotos</b><span>' + list.length.toLocaleString('es-CO') + (list.length === 1 ? ' foto' : ' fotos') + '</span><button class="vph-all f" data-act="nav" data-arg="photos" aria-label="Ver todas las fotos">Ver todas</button></div></section>';
  };
  function widgetStart() {
    clearInterval(wT);
    var fr = document.querySelector('.phwf'); if (!fr) return;
    var list = allPhotos().slice(0, 60), i = 0, front = 'a';
    var put = function () {
      var el = document.querySelector('.phwf'); if (!el) { clearInterval(wT); return; }
      var p = list[i % list.length], back = front === 'a' ? 'b' : 'a', im = el.querySelector('img.' + back), cur = el.querySelector('img.' + front);
      var u = srcOf(p, false);
      if (!u) { needMega(p); i++; return; }
      im.onload = function () { im.classList.add('on'); cur.classList.remove('on'); front = back; };
      im.src = u; el.setAttribute('data-arg', String(i % list.length));
      var c = el.querySelector('.cap'); if (c) c.textContent = albumName(p.album);
      i++;
    };
    put(); wT = setInterval(put, 7000);
  }

  // ---------- Sección Fotos ----------
  MV.VIEWS.photos = function () {
    var all = allPhotos(), counts = {};
    all.forEach(function (p) { counts[p.album] = (counts[p.album] || 0) + 1; });
    var ids = Object.keys(counts);
    if (ALBUM !== 'all' && !counts[ALBUM]) ALBUM = 'all';
    var list = ALBUM === 'all' ? all : all.filter(function (p) { return p.album === ALBUM; });
    MV._phList = list;
    var html = MV.topHtml('Fotos', '<button class="pill f" data-act="photoAdd">Agregar fotos</button>');
    if (!all.length) return html + '<div class="panel glass" style="text-align:center;padding:40px 24px"><h2>Tus fotos en grande</h2><p class="muted">Agrega fotos de la galería, de una carpeta o USB, de una carpeta compartida de Google Drive o MEGA, o envíalas desde el celular a la TV.</p><div class="btns" style="justify-content:center"><button class="btn f" data-act="photoAdd" data-autofocus>Agregar fotos</button></div></div>';
    html += '<div class="chips"><button class="chip f' + (ALBUM === 'all' ? ' on' : '') + '" data-act="photoAlbum" data-arg="all">Todas <small>' + all.length + '</small></button>' +
      ids.map(function (id) { return '<button class="chip f' + (ALBUM === id ? ' on' : '') + '" data-act="photoAlbum" data-arg="' + esc(id) + '">' + esc(albumName(id)) + ' <small>' + counts[id] + '</small></button>'; }).join('') +
      '<button class="chip f' + (SEL ? ' on' : '') + '" data-act="photoSelMode">' + (SEL ? 'Cancelar selección' : 'Seleccionar para quitar') + '</button></div>';
    var alb = albums().filter(function (a) { return a.id === ALBUM; })[0];
    html += '<div class="btns" style="margin:0 0 12px"><button class="btn sm f" data-act="photoView" data-arg="0" data-autofocus>▶ Presentación</button>' +
      (alb ? '<button class="btn ghost sm f" data-act="photoAlbumRefresh" data-arg="' + esc(alb.id) + '">Actualizar álbum</button><button class="btn ghost sm f" data-act="photoAlbumDel" data-arg="' + esc(alb.id) + '">Quitar álbum</button>' : '') +
      (SEL ? '<button class="btn danger sm f" data-act="photoSelDel">Quitar seleccionadas (' + Object.keys(SEL).length + ')</button>' : '') + '</div>';
    html += '<div class="phgrid' + (SEL ? ' selmode' : '') + '">' + list.slice(0, 600).map(function (p, i) {
      var u = srcOf(p, false);
      return '<button class="pht f' + (SEL && SEL[p.k] ? ' sel' : '') + '" data-act="' + (SEL ? 'photoSel' : 'photoView') + '" data-arg="' + (SEL ? esc(p.k) : i) + '" data-k="' + esc(p.k) + '">' + (u ? '<img loading="lazy" src="' + esc(u) + '" alt="" onerror="this.remove()">' : '<i class="ld"></i>') + (SEL ? '<i class="chk">' + (SEL[p.k] ? '✓' : '') + '</i>' : '') + '</button>';
    }).join('') + '</div>' + (list.length > 600 ? '<p class="muted">Se muestran las primeras 600; la presentación recorre todas.</p>' : '');
    return html;
  };
  MV.VIEWS.photos.after = function () {
    // Las de MEGA se traen de a pocas al mostrarse
    var list = MV._phList || [];
    list.slice(0, 40).forEach(function (p) {
      if (!p.mega || megaMem[p.mega]) return;
      needMega(p, function (u) { var b = document.querySelector('.pht[data-k="' + p.k + '"]'); if (b && !b.querySelector('img')) { var ld = b.querySelector('.ld'); if (ld) ld.remove(); var im = document.createElement('img'); im.src = u; im.alt = ''; b.insertBefore(im, b.firstChild); } });
    });
  };

  // ---------- Acciones ----------
  var ACT = MV.ACT;
  ACT.photoAdd = addMenu;
  ACT.photoPick = pickDevice;
  ACT.photoScan = scanFolders;
  ACT.photoPhone = fromPhone;
  ACT.photoLink = linkAsk;
  ACT.photoLinkSave = linkSave;
  ACT.photoAlbum = function (id) { ALBUM = id; SEL = null; MV.rerender(); };
  ACT.photoView = function (i) {
    var list = MV.viewName && MV.viewName() === 'photos' && MV._phList ? MV._phList : allPhotos();
    viewer(list, +i || 0);
  };
  ACT.photoSelMode = function () { SEL = SEL ? null : {}; MV.rerender(); };
  ACT.photoSel = function (k) { if (!SEL) return; if (SEL[k]) delete SEL[k]; else SEL[k] = 1; MV.rerender(); };
  ACT.photoSelDel = function () {
    var ks = Object.keys(SEL || {}); if (!ks.length) return;
    MV.confirm('¿Quitar ' + ks.length + (ks.length === 1 ? ' foto?' : ' fotos?'), 'Se quitan de MiVibra. Las fotos de tu galería y de la nube no se borran; las que llegaron del celular sí se borran de la TV.', 'Quitar').then(function (ok) {
      if (!ok) return;
      var set = {}; ks.forEach(function (k) { set[k] = 1; });
      saveMine(mine().filter(function (p) { if (!set[p.k]) return true; if (p.file && A && A.deletePhoto) A.deletePhoto(p.file); return false; }));
      saveAlbums(albums().map(function (a) { a.items = (a.items || []).filter(function (p) { return !set[p.k]; }); return a; }).filter(function (a) { return a.items.length; }));
      SEL = null; MV.toast(ks.length + (ks.length === 1 ? ' foto quitada' : ' fotos quitadas')); MV.rerender();
    });
  };
  ACT.photoAlbumDel = function (id) {
    MV.confirm('¿Quitar el álbum «' + albumName(id) + '»?', 'Las fotos siguen en la nube; solo se quitan de MiVibra.', 'Quitar').then(function (ok) { if (!ok) return; saveAlbums(albums().filter(function (a) { return a.id !== id; })); ALBUM = 'all'; MV.rerender(); });
  };
  ACT.photoAlbumRefresh = function (id) {
    var all = albums(), a = all.filter(function (x) { return x.id === id; })[0]; if (!a) return;
    MV.toast('Actualizando «' + a.name + '»…', 3000);
    loadAlbum(a).then(function () { saveAlbums(all); MV.toast(a.items.length + ' fotos en «' + a.name + '»'); MV.rerender(); }).catch(function (e) { MV.toast(e.message, 5000); });
  };
})();
