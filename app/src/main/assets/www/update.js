/* Actualizaciones: al publicar una versión nueva en GitHub (Releases), la app avisa con un popup
   y la descarga e instala con un toque. Si el mensaje del cambio incluye [obligatoria], no se puede posponer. */
(function () {
  'use strict';
  var REPO = 'simank19/mivibra-tv';
  var checking = false, shownFor = 0, lastCheck = 0;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function current() { return +(MV.device.versionCode || 0); }

  /** Plan B si la API de GitHub falla o llega al límite: la página de novedades (releases.atom). */
  function fetchFromFeed() {
    return MV.getText('https://github.com/' + REPO + '/releases.atom').then(function (t) {
      var m = t.match(/releases\/tag\/build-(\d+)/);
      if (!m) throw new Error('Sin versiones publicadas');
      var n = +m[1];
      var notes = ((t.split('<entry>')[1] || '').match(/<content[^>]*>([\s\S]*?)<\/content>/) || ['', ''])[1]
        .replace(/&lt;[^&]*&gt;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s{2,}/g, ' ').trim();
      return { version: n, url: 'https://github.com/' + REPO + '/releases/download/build-' + n + '/MiVibraTV-' + n + '.apk', size: 0, notes: notes, mandatory: /\[obligatoria\]/i.test(notes) };
    });
  }
  function fetchLatest() {
    return fetchApi().catch(function () { return fetchFromFeed(); });
  }
  function fetchApi() {
    return MV.getText('https://api.github.com/repos/' + REPO + '/releases/latest', { Accept: 'application/vnd.github+json' }).then(function (t) {
      var r = JSON.parse(t);
      var n = +(String(r.tag_name || '').replace(/\D+/g, '')) || 0;
      var apk = (r.assets || []).find(function (a) { return /\.apk$/i.test(a.name); });
      if (!n || !apk) throw new Error('No hay APK publicada');
      var notes = String(r.body || '').replace(/Co-Authored-By:.*$/gim, '').replace(/Claude-Session:.*$/gim, '').trim();
      return { version: n, url: apk.browser_download_url, size: apk.size || 0, notes: notes, mandatory: /\[obligatoria\]/i.test(notes), date: r.published_at };
    });
  }

  /** manual = true cuando se pulsa "Buscar actualizaciones" en Ajustes */
  MV.checkUpdate = function (manual) {
    if (!MV.native || !current()) { if (manual) MV.toast('Disponible en la app instalada'); return Promise.resolve(null); }
    if (checking) return Promise.resolve(null);
    checking = true; lastCheck = Date.now();
    return fetchLatest().then(function (u) {
      checking = false;
      MV.latestVersion = u.version;
      if (u.version > current()) {
        MV.pendingUpdate = u; pill(u);
        if (manual || shownFor !== u.version) { shownFor = u.version; showPopup(u); }
      } else { MV.pendingUpdate = null; pill(null); if (manual) MV.toast('Ya tienes la versión más reciente (' + current() + ')'); }
      return u;
    }).catch(function (e) {
      checking = false;
      if (manual) MV.toast('No se pudo buscar actualizaciones: ' + e.message, 4000);
      return null;
    });
  };

  /** Botón fijo "Actualizar" mientras haya una versión nueva sin instalar (aunque cierres el aviso). */
  // Ahora es una campana en la barra de arriba (antes era un botón flotante que en TV tapaba los demás y no se podía elegir)
  function pill(u) {
    var old = document.getElementById('updPill'); if (old && !old.closest('.qbar')) old.remove();
    var bell = document.querySelector('.qbar [data-fid="q-upd"]');
    // La campana siempre está: se reemplaza para poner o quitar el punto rojo (conservando el foco si lo tenía)
    if (MV.updBell) {
      var had = bell && document.activeElement === bell;
      if (bell) bell.outerHTML = MV.updBell(); else { var bar = document.querySelector('.qbar'); if (bar) bar.insertAdjacentHTML('afterbegin', MV.updBell()); }
      var nb = document.querySelector('.qbar [data-fid="q-upd"]'); if (had && nb) nb.focus();
    }
    if (!u) return;
    // La primera vez que aparece la campana se explica para qué es
    try { if (!localStorage.getItem('mv:bellTip')) { localStorage.setItem('mv:bellTip', '1'); setTimeout(function () { MV.toast('Hay una versión nueva: la campana de arriba la instala cuando quieras', 5000); }, 800); } } catch (e) {}
  }
  MV.showUpdate = function () { if (MV.pendingUpdate) showPopup(MV.pendingUpdate); else MV.checkUpdate(true); };

  function showPopup(u) {
    var notes = u.notes.replace(/\[obligatoria\]/ig, '').trim();
    var mb = u.size ? ' · ' + (u.size / 1048576).toFixed(1) + ' MB' : '';
    MV.modal('<div style="display:flex;gap:14px;align-items:center;margin-bottom:10px"><img src="img/isotipo.svg" alt="" style="width:46px;height:46px"><div><h2 style="margin:0">Nueva versión disponible</h2><p class="muted" style="margin:2px 0 0">MiVibra TV ' + u.version + mb + ' · tienes la ' + current() + '</p></div></div>' +
      (notes ? '<div class="panel" style="max-height:30vh;overflow:auto;white-space:pre-wrap;font-size:14px;margin:10px 0">' + esc(notes) + '</div>' : '') +
      (u.mandatory ? '<p style="color:var(--accent-text);font-size:13px">Esta actualización es obligatoria para seguir usando la app.</p>' : '') +
      '<div id="updBar" style="display:none;margin:12px 0"><div style="height:8px;border-radius:8px;background:var(--glass-strong);overflow:hidden"><i id="updFill" style="display:block;height:100%;width:0;background:var(--accent);transition:width .3s"></i></div><p class="muted" id="updTxt" style="font-size:13px;margin:6px 0 0">Descargando…</p></div>' +
      '<div class="btns"><button class="btn f" id="updGo" data-autofocus>Actualizar ahora</button>' + (u.mandatory ? '' : '<button class="btn ghost f" id="updLater">Más tarde</button>') + '</div>',
      {
        onOpen: function (root) {
          var go = root.querySelector('#updGo'), later = root.querySelector('#updLater');
          if (later) later.onclick = function () { MV.closeModal(); };
          go.onclick = function () { start(u, root); };
        },
        onClose: function () { if (u.mandatory) setTimeout(function () { showPopup(u); }, 300); }
      });
  }

  function start(u, root) {
    var go = root.querySelector('#updGo'), bar = root.querySelector('#updBar'), fill = root.querySelector('#updFill'), txt = root.querySelector('#updTxt');
    go.disabled = true; go.textContent = 'Descargando…';
    bar.style.display = 'block';
    MV.call('installUpdate', [u.url], function (p) {
      if (p >= 0) { fill.style.width = p + '%'; txt.textContent = 'Descargando… ' + p + '%'; }
    }).then(function (r) {
      if (r && r.needPermission) {
        go.disabled = false; go.textContent = 'Ya lo activé, actualizar';
        bar.style.display = 'block'; fill.style.width = '0';
        txt.innerHTML = 'Activa <b>Permitir de esta fuente</b> para MiVibra TV en la pantalla que se abrió, vuelve aquí y pulsa el botón otra vez.';
        return;
      }
      fill.style.width = '100%';
      txt.textContent = 'Listo. Confirma la instalación en la ventana de Android.';
      go.disabled = false; go.textContent = 'Abrir instalador otra vez';
    }).catch(function (e) {
      go.disabled = false; go.textContent = 'Reintentar';
      txt.textContent = 'No se pudo descargar: ' + e.message;
    });
  }

  // Revisa al abrir la app y cada 6 horas mientras está abierta (también al volver a ella)
  document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { MV.checkUpdate(false); }, 2500); });
  setInterval(function () { MV.checkUpdate(false); }, 6 * 3600e3);
  // Al volver a la app (después de un rato fuera) también se revisa, para que la versión nueva llegue rápido
  document.addEventListener('visibilitychange', function () { if (!document.hidden && Date.now() - lastCheck > 20 * 60e3) MV.checkUpdate(false); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && Date.now() - lastCheck > 10 * 60e3) { shownFor = 0; MV.checkUpdate(false); }
  });
})();
