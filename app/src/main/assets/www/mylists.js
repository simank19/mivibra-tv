/* MiVibra TV — Cada cliente monta su propia lista.
   Tres formas de agregarla:
   1) En la TV: asistente paso a paso (Enlace M3U, Xtream, Portal y MAC, archivo…).
   2) Desde el celular: código QR → página en la red de la casa (sin escribir en la TV).
   3) Panel web: el cliente entra a la página de MiVibra, escribe el CÓDIGO de su TV y pega la lista;
      la TV la recibe sola por internet (Firebase), aunque esté en otra casa.
   MiVibra TV no incluye ni vende contenido: solo reproduce las listas que cada usuario agrega. */
(function () {
  'use strict';
  var MV = window.MV, S = MV.S, A = window.Android || null;
  var PANEL_URL = 'https://simank19.github.io/mivibra-tv/panel/';

  // ---------- Código del dispositivo (8 caracteres, sin letras que se confundan) ----------
  var ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  MV.deviceCode = function () {
    var c = MV.load('deviceCode', '');
    if (!c) {
      var arr = new Uint32Array(8); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(arr) : arr.forEach(function (_, i) { arr[i] = Math.random() * 1e9; });
      c = Array.prototype.map.call(arr, function (n) { return ALPH[n % ALPH.length]; }).join('');
      MV.save('deviceCode', c);
    }
    return c;
  };
  MV.deviceCodePretty = function () { var c = MV.deviceCode(); return c.slice(0, 4) + '-' + c.slice(4); };
  MV.panelUrl = function () { return PANEL_URL; };

  // ---------- Agregar una lista que llega del celular o del panel ----------
  // { type: 'url', name, url } · { type: 'xtream', name, host, user, pass } · { type: 'stalker', name, portal, mac }
  MV.importList = function (o, from) {
    o = o || {};
    var type = o.type === 'm3u' ? 'url' : o.type, name = String(o.name || '').trim().slice(0, 60);
    var dup = function (pred) { return S.lists.some(pred); };
    var done = function (msg) { MV.toast(msg, 5000); MV.rerender(); };
    var fail = function (e) { MV.toast('No se pudo agregar la lista' + (from ? ' (' + from + ')' : '') + ': ' + (e && e.message || e), 7000); };
    if (type === 'url') {
      var url = String(o.url || '').trim();
      if (!/^https?:\/\//i.test(url)) return Promise.reject(new Error('El enlace debe empezar con http:// o https://'));
      if (dup(function (l) { return l.url === url; })) { MV.toast('Esa lista ya estaba agregada'); return Promise.resolve(); }
      MV.toast('Llegó una lista' + (from ? ' desde ' + from : '') + ': cargando…', 4000);
      return MV.addList({ type: 'url', name: name || 'Mi lista', url: url, epg: String(o.epg || '').trim() || undefined }).then(function () { done('Lista agregada: ' + (name || 'Mi lista')); }, fail);
    }
    if (type === 'xtream') {
      var l = { type: 'xtream', name: name || 'Xtream', host: String(o.host || '').trim().replace(/\/+$/, ''), user: String(o.user || '').trim(), pass: String(o.pass || '') };
      if (!/^https?:\/\//i.test(l.host) || !l.user) return Promise.reject(new Error('Falta el servidor (http://…) o el usuario'));
      if (dup(function (x) { return x.type === 'xtream' && x.host === l.host && x.user === l.user; })) { MV.toast('Esa cuenta ya estaba agregada'); return Promise.resolve(); }
      MV.toast('Llegó una cuenta Xtream' + (from ? ' desde ' + from : '') + ': iniciando sesión…', 4000);
      return MV.xtLogin(l).then(function () { return MV.addList(l); }).then(function () { done('Cuenta agregada: ' + l.name); }, fail);
    }
    if (type === 'stalker') {
      var sl = { type: 'stalker', name: name || 'Portal', portal: String(o.portal || '').trim(), mac: String(o.mac || '').trim().toUpperCase() };
      if (!sl.portal || !/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(sl.mac)) return Promise.reject(new Error('Revisa la URL del portal y la MAC (00:1A:79:…)'));
      if (dup(function (x) { return x.type === 'stalker' && x.portal === sl.portal && x.mac === sl.mac; })) { MV.toast('Ese portal ya estaba agregado'); return Promise.resolve(); }
      MV.toast('Llegó un portal' + (from ? ' desde ' + from : '') + ': conectando…', 4000);
      return MV.stkLogin(sl).then(function () { return MV.addList(sl); }).then(function () { done('Portal agregado: ' + sl.name); }, fail);
    }
    if (type === 'text') {
      // Varias listas pegadas (o leídas de una foto): se abren en "Varias" para revisarlas y confirmar en la TV
      var t = String(o.text || '').slice(0, 200000);
      if (!t.trim()) return Promise.reject(new Error('El texto llegó vacío'));
      MV.toast('Llegaron listas' + (from ? ' desde ' + from : '') + ': revisa y toca Importar', 6000);
      MV.multiWith(t); return Promise.resolve();
    }
    return Promise.reject(new Error('Tipo de lista no reconocido'));
  };
  // Desde la página del celular (servidor de la TV)
  MV.onListReceived = function (o) { MV.importList(o, 'el celular').catch(function (e) { MV.toast(e.message, 6000); }); };

  // ---------- Panel web: buzón en Firebase (inbox/<código>/lists) ----------
  var inboxUnsub = null;
  MV.inboxStart = function () {
    if (inboxUnsub || !MV.sync || !MV.sync.configured()) return;
    MV.sync.load().then(function (fb) {
      var col = fb.firestore().collection('inbox').doc(MV.deviceCode()).collection('lists');
      inboxUnsub = col.onSnapshot(function (snap) {
        snap.docChanges().forEach(function (ch) {
          if (ch.type !== 'added') return;
          var d = ch.doc.data() || {};
          // Se borra del buzón apenas llega (así no se repite ni queda guardada en la nube)
          ch.doc.ref.delete().catch(function () {});
          if (Date.now() - (+d.at || 0) > 7 * 864e5) return;   // vencida
          MV.importList(d, 'el panel web').catch(function (e) { MV.toast(e.message, 6000); });
        });
      }, function () { inboxUnsub = null; });
    }).catch(function () {});
  };

  // ---------- Pantalla "Agregar mi lista" (bienvenida y desde Ajustes) ----------
  MV.listsWelcome = function () {
    var phone = ''; try { var r = A ? JSON.parse(A.remoteStart()) : null; if (r && r.ok && r.url) phone = r.url.replace(/\/?$/, '/') + 'listas'; } catch (e) {}
    MV.modal('<h2>Agrega tu lista de TV</h2><p class="muted">MiVibra TV no incluye canales: usa la lista que te dio tu proveedor (enlace M3U, cuenta Xtream o Portal y MAC). Elige cómo agregarla:</p>' +
      '<div class="wz">' +
      '<div class="wzc"><b>1 · Desde tu celular</b><span>Escanea el código con la cámara (mismo Wi-Fi que la TV) y pega la lista desde el celular.</span>' +
      (phone ? '<div class="wzqr" id="wzQr"></div><small>' + MV.esc(phone) + '</small>' : '<small>Conecta la TV a una red Wi-Fi para usar esta opción.</small>') + '</div>' +
      '<div class="wzc"><b>2 · Desde el panel web</b><span>En cualquier computador o celular, aunque no estés en casa, entra a:</span><small class="big">' + MV.esc(PANEL_URL.replace(/^https?:\/\//, '')) + '</small><span>y escribe el código de esta TV:</span><div class="wzcode">' + MV.deviceCodePretty() + '</div></div>' +
      '<div class="wzc"><b>3 · Aquí en la TV</b><span>Escribe el enlace o los datos de tu cuenta con el control.</span><button class="btn f" data-act="addList" data-autofocus>Escribir en la TV</button></div>' +
      '</div><p class="muted" style="font-size:13px">La lista llega sola a la TV en unos segundos. MiVibra TV es solo un reproductor: no vende ni incluye contenido.</p>',
      { onOpen: function () {
        var box = document.getElementById('wzQr');
        if (box && window.qrcode && phone) { try { var q = qrcode(0, 'M'); q.addData(phone); q.make(); box.innerHTML = '<div class="qr">' + q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }) + '</div>'; } catch (e) {} }
      } });
  };
  if (MV.ACT) MV.ACT.listsWelcome = function () { if (MV.modalOpen()) MV.closeModal(true); MV.listsWelcome(); };

  // Al abrir: escuchar el buzón; si no hay ninguna lista, mostrar la bienvenida (después de la intro)
  function boot() {
    MV.inboxStart();
    setTimeout(function () {
      // Con servicio administrado las listas incluidas llegan solas: la bienvenida es solo para quien empieza sin nada
      // Espera a que haya un perfil elegido y nada abierto encima (creación del perfil, tutorial…)
      var go = function () {
        if (MV.acct && MV.acct.managed()) return;
        if (S.lists.length || MV.load('listsWelcomeSeen', false)) return;
        var busy = !S.pid || MV.modalOpen() || (MV.tourOpen && MV.tourOpen()) || /profile/i.test(location.hash) || document.querySelector('.profiles, #pname, [data-act="saveProfile"]');
        if (busy) { setTimeout(go, 2000); return; }
        MV.save('listsWelcomeSeen', true); MV.listsWelcome();
      };
      if (MV.introShowing && MV.introShowing()) { var t = setInterval(function () { if (!MV.introShowing()) { clearInterval(t); setTimeout(go, 600); } }, 400); } else go();
    }, 2500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
