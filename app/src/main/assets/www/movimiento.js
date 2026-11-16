/* MiVibra TV · MiVibra Movimiento: editor de avatares 3D y juegos con el cuerpo.
   El editor y los juegos viven en GitHub Pages y se abren aquí en pantalla completa (iframe).
   Tu avatar (.vrm) se guarda en tu cuenta de MiVibra (Firestore, en trozos) para que te siga a todos tus equipos:
     avatars/{uid}               → { uid, name, parts, size, at }
     avatars/{uid}/parts/{n}     → { b: bytes, n }
   El iframe pide y entrega el avatar con postMessage; solo se aceptan mensajes del sitio de MiVibra Movimiento. */
(function () {
  'use strict';
  var MV = window.MV;
  if (!MV || !MV.VIEWS) return;
  var ORIGIN = 'https://simank19.github.io';
  var BASE = ORIGIN + '/mivibra-tv/movimiento/';
  var PART = 900 * 1024;   // cada trozo queda bajo el límite de 1 MB de un documento de Firestore
  var esc = MV.esc || function (s) { return String(s); };

  // ---------- Caché local (para no bajar el avatar cada vez) ----------
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var r = indexedDB.open('mivibra-movimiento-app', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('avatar'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { dbp = null; rej(r.error); };
    });
    return dbp;
  }
  function cacheGet(k) { return db().then(function (d) { return new Promise(function (res) { var t = d.transaction('avatar', 'readonly').objectStore('avatar').get(k); t.onsuccess = function () { res(t.result || null); }; t.onerror = function () { res(null); }; }); }).catch(function () { return null; }); }
  function cachePut(k, v) { return db().then(function (d) { return new Promise(function (res) { var t = d.transaction('avatar', 'readwrite'); t.objectStore('avatar').put(v, k); t.oncomplete = res; t.onerror = res; }); }).catch(function () {}); }

  // ---------- Cuenta ----------
  function fs() { return MV.sync && MV.sync.configured() ? MV.sync.load().then(function (f) { return f.firestore(); }) : Promise.reject(new Error('Sin cuenta de MiVibra en este equipo')); }
  function uid() { var u = MV.sync && MV.sync.user; return u ? u.uid : null; }
  var meta = null;   // { name, parts, size, at }
  function loadMeta() {
    if (!uid()) return Promise.resolve(null);
    return fs().then(function (d) { return d.collection('avatars').doc(uid()).get(); }).then(function (s) { meta = s.exists ? s.data() : null; return meta; }).catch(function () { return null; });
  }
  function saveAvatar(buf, name) {
    var id = uid();
    if (!id) return Promise.reject(new Error('Inicia sesión en MiVibra para guardar el avatar en tu cuenta'));
    var u8 = new Uint8Array(buf), n = Math.ceil(u8.length / PART), at = Date.now();
    if (n > 24) return Promise.reject(new Error('El avatar pesa demasiado (' + Math.round(u8.length / 1048576) + ' MB)'));
    return fs().then(function (d) {
      var ref = d.collection('avatars').doc(id), Blob = window.firebase.firestore.Blob, chain = Promise.resolve();
      for (var i = 0; i < n; i++) (function (i) {
        chain = chain.then(function () { return ref.collection('parts').doc(String(i)).set({ n: i, b: Blob.fromUint8Array(u8.subarray(i * PART, Math.min(u8.length, (i + 1) * PART))) }); });
      })(i);
      return chain.then(function () {
        var m = { uid: id, name: String(name || 'Mi avatar').slice(0, 30), parts: n, size: u8.length, at: at };
        var old = meta && meta.parts > n ? meta.parts : 0;
        return ref.set(m).then(function () {
          meta = m;
          for (var k = n; k < old; k++) ref.collection('parts').doc(String(k)).delete().catch(function () {});
          return cachePut(id, { at: at, name: m.name, vrm: buf });
        });
      });
    });
  }
  function getAvatar() {
    var id = uid();
    if (!id) return Promise.resolve(null);
    return loadMeta().then(function (m) {
      if (!m) return null;
      return cacheGet(id).then(function (c) {
        if (c && c.at === m.at && c.vrm) return c;
        return fs().then(function (d) {
          var ref = d.collection('avatars').doc(id), jobs = [];
          for (var i = 0; i < m.parts; i++) jobs.push(ref.collection('parts').doc(String(i)).get());
          return Promise.all(jobs);
        }).then(function (snaps) {
          var parts = snaps.map(function (s) { return s.data().b.toUint8Array(); }), out = new Uint8Array(m.size), o = 0;
          parts.forEach(function (p) { out.set(p, o); o += p.length; });
          var v = { at: m.at, name: m.name, vrm: out.buffer };
          cachePut(id, v);
          return v;
        });
      });
    }).catch(function () { return null; });
  }

  // ---------- Pantalla completa con el editor o un juego ----------
  var box = null;
  MV.mvFrame = {
    open: function () { return !!(box && box.isConnected); },
    close: function () { if (box) { box.remove(); box = null; } loadMeta().then(function () { if (MV.viewName() === 'movimiento') MV.rerender(); }); MV.focusFirst && MV.focusFirst(); }
  };
  function openFrame(path) {
    if (box) box.remove();
    box = document.createElement('div');
    box.className = 'mvframe';
    box.innerHTML = '<iframe src="' + BASE + path + '" allow="autoplay; fullscreen; gamepad; camera" allowfullscreen></iframe>' +
      '<button class="mvframe-x f" data-act="mvClose" aria-label="Volver a MiVibra"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg></button>';
    document.body.appendChild(box);
    var f = box.querySelector('iframe');
    f.onload = function () { try { f.focus(); f.contentWindow.focus(); } catch (e) {} };
  }
  window.addEventListener('message', function (e) {
    if (e.origin !== ORIGIN || !box) return;
    var f = box.querySelector('iframe'), d = e.data || {};
    if (!f || e.source !== f.contentWindow || typeof d !== 'object') return;
    var reply = function (m, tr) { try { f.contentWindow.postMessage(m, ORIGIN, tr || []); } catch (x) {} };
    if (d.mv === 'avatar-save' && d.vrm) {
      saveAvatar(d.vrm, d.name).then(function () {
        reply({ mv: 'avatar-saved', ok: true }); if (MV.ach && MV.ach.add) try { MV.ach.add('avatar'); } catch (x) {}
      }, function (err) { reply({ mv: 'avatar-saved', ok: false, msg: err && err.message || 'No se pudo guardar' }); });
    } else if (d.mv === 'avatar-get') {
      getAvatar().then(function (v) { if (v) { var copy = v.vrm.slice(0); reply({ mv: 'avatar', vrm: copy, name: v.name }, [copy]); } else reply({ mv: 'avatar', vrm: null }); });
    } else if (d.mv === 'close') MV.mvFrame.close();
  });

  // ---------- Sección ----------
  MV.VIEWS.movimiento = function () {
    var m = meta, signed = !!uid();
    var when = m ? new Date(m.at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : '';
    return MV.topHtml('MiVibra Movimiento') +
      '<div class="mvm-hero glass">' +
        '<div class="mvm-txt"><small>JUEGA CON TU CUERPO</small><h2>Deportes con tu avatar</h2>' +
        '<p class="muted">Crea tu avatar en 3D y compite en estadios llenos. El celular hace de cámara: detecta tu cuerpo y el video nunca sale del teléfono.</p>' +
        '<div class="btns"><button class="btn f" data-act="mvPlay" data-arg="vallas/" data-autofocus>Jugar 100 m con vallas</button>' +
        '<button class="btn ghost f" data-act="mvEditor">' + (m ? 'Editar mi avatar' : 'Crear mi avatar') + '</button></div>' +
        '<p class="mvm-st">' + (m ? 'Tu avatar <b>' + esc(m.name) + '</b> está guardado en tu cuenta · ' + when : signed ? 'Aún no has creado tu avatar: mientras tanto corres con uno de ejemplo.' : 'Inicia sesión en MiVibra para que tu avatar te siga a todos tus equipos.') + '</p></div>' +
      '</div>' +
      '<div class="mvm-grid">' + [['100 m con vallas', 'Disponible', 1], ['Bolos', 'Próximamente'], ['Boxeo', 'Próximamente'], ['Tenis de mesa', 'Próximamente'], ['Salto largo', 'Próximamente'], ['Penales', 'Próximamente']].map(function (g) {
        return '<button class="mvm-card glass f' + (g[2] ? '' : ' soon') + '" data-act="' + (g[2] ? 'mvPlay' : 'mvSoon') + '" data-arg="vallas/"><b>' + g[0] + '</b><span>' + g[1] + '</span></button>';
      }).join('') + '</div>';
  };
  MV.VIEWS.movimiento.after = function () { if (meta === null && uid()) loadMeta().then(function (m) { if (m && MV.viewName() === 'movimiento') MV.rerender(); }); };
  Object.assign(MV.ACT, {
    mvEditor: function () { openFrame('editor/'); },
    mvPlay: function (p) { openFrame(p || 'vallas/'); },
    mvSoon: function () { MV.toast('Este deporte llega pronto', 3000); },
    mvClose: function () { MV.mvFrame.close(); }
  });
  MV.on && MV.on('auth', function () { meta = null; if (uid()) loadMeta(); });

  // Estilos
  var css = document.createElement('style');
  css.textContent = '.mvframe{position:fixed;inset:0;z-index:9998;background:#3E4144}.mvframe iframe{width:100%;height:100%;border:0;display:block}' +
    '.mvframe-x{position:fixed;left:14px;bottom:14px;width:46px;height:46px;border-radius:50%;border:1px solid rgba(255,255,255,.3);background:rgba(40,42,46,.55);color:#fff;display:grid;place-items:center;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);z-index:9999;cursor:pointer;opacity:.75}.mvframe-x:focus,.mvframe-x:hover{opacity:1;background:#F4F5F6;color:#2A2C2E}' +
    '.mvm-hero{padding:34px 36px;border-radius:28px;margin-bottom:18px}.mvm-hero small{letter-spacing:.2em;font-weight:800;font-size:12px;opacity:.75}.mvm-hero h2{font-size:34px;margin:6px 0 8px}.mvm-hero p{max-width:640px}.mvm-st{font-size:14px;opacity:.85;margin-top:14px}' +
    '.mvm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}.mvm-card{text-align:left;padding:22px;border-radius:22px;display:flex;flex-direction:column;gap:6px;color:inherit;cursor:pointer}.mvm-card b{font-size:20px}.mvm-card span{font-size:13px;opacity:.75}.mvm-card.soon{opacity:.6}';
  document.head.appendChild(css);
})();
