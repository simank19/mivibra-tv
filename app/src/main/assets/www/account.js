/* Cuenta MiVibra: inicio de sesión con Google, superadministrador y configuración compartida.
   - El superadministrador (correo de MV_CONFIG.admin) agrega listas M3U, cuentas Xtream y claves de API.
   - Los demás usuarios entran con Google y reciben todo ya cargado; no pueden cambiar listas ni claves.
   - Perfiles, favoritos, historial y "continuar viendo" se sincronizan por usuario (MV.sync). */
(function () {
  'use strict';
  var C = window.MV_CONFIG || {}, S = MV.S, P = S.prefs;
  var cfgUnsub = null, applying = false, lastPushed = '';

  function lower(x) { return String(x || '').trim().toLowerCase(); }
  function cfgText() { return typeof C.firebase === 'string' ? C.firebase : JSON.stringify(C.firebase); }

  var acct = MV.acct = {
    status: 'off',        // off | checking | out | pending | ok | denied
    config: null,         // documento compartido: { lists, tmdbKey, allowed, open, updatedAt }
    error: '',
    managed: function () { return !!(C.firebase && C.admin); },
    user: function () { return MV.sync.user; },
    isAdmin: function () { var u = MV.sync.user; return !!(u && acct.managed() && lower(u.email) === lower(C.admin)); },
    /** ¿Puede este dispositivo cambiar listas y claves? (sin cuenta administrada: sí) */
    canEdit: function () { return !acct.managed() || acct.isAdmin(); },
    hasGoogleButton: function () { return !!(C.webClientId && MV.native); },
    hasCode: function () { return !!(C.tvClientId && C.tvClientSecret); }
  };
  // Sin cuenta configurada: la app funciona sola, como antes
  acct.changed = function () {};
  acct.start = function () { return Promise.resolve(null); };
  if (!acct.managed()) return;

  // La configuración de Firebase viene incluida en la app
  P.firebase = cfgText();
  acct.status = 'checking';

  function doc() { return firebase.firestore().collection('app').doc('config'); }
  function sharedLists() {
    return S.lists.filter(function (l) { return l.type !== 'file'; }).map(function (l) {
      var c = Object.assign({}, l); delete c.error; delete c.count; delete c.epgAuto; return c;
    });
  }
  function payload() {
    var cur = acct.config || {};
    return { lists: sharedLists(), tmdbKey: P.tmdbKey || '', ytKey: P.ytKey || '', subKey: P.subKey || '', allowed: cur.allowed || [], open: !!cur.open };
  }

  /** Guarda en la nube los cambios del superadministrador. */
  acct.push = function (extra) {
    if (!acct.isAdmin() || applying) return Promise.resolve();
    var data = Object.assign(payload(), extra || {});
    var text = JSON.stringify(data);
    if (text === lastPushed && !extra) return Promise.resolve();
    lastPushed = text;
    data.updatedAt = Date.now(); data.by = MV.sync.user.email;
    return doc().set(JSON.parse(JSON.stringify(data))).catch(function (e) { MV.toast('No se pudo guardar la configuración: ' + (e.message || e.code), 5000); });
  };
  acct.changed = MV.debounce(function () { acct.push(); }, 1500);

  function apply(cfg) {
    acct.config = cfg;
    applying = true;
    try {
      var keyChanged = (cfg.tmdbKey || '') !== (P.tmdbKey || '');
      if (keyChanged) { P.tmdbKey = cfg.tmdbKey || ''; MV.save('prefs', P); }
      if ((cfg.ytKey || '') !== (P.ytKey || '')) { P.ytKey = cfg.ytKey || ''; MV.save('prefs', P); }
      if ((cfg.subKey || '') !== (P.subKey || '')) { P.subKey = cfg.subKey || ''; MV.save('prefs', P); }
      var mine = acct.isAdmin() ? S.lists.filter(function (l) { return l.type === 'file'; }) : [];
      var remote = (cfg.lists || []).map(function (rl) {
        var ll = S.lists.find(function (l) { return l.id === rl.id; });
        return ll ? Object.assign({}, ll, rl) : rl;
      });
      var next = remote.concat(mine);
      var sig = function (arr) { return JSON.stringify(arr.map(function (l) { return [l.id, l.url, l.host, l.user, l.pass, l.enabled, l.epg]; })); };
      var listsChanged = sig(next) !== sig(S.lists);
      if (listsChanged) { S.lists = next; MV.save('lists', S.lists); }
      lastPushed = JSON.stringify(payload());
      if (listsChanged) MV.reloadCatalog(false);
    } finally { applying = false; }
    MV.emit('acct');
  }

  function listenConfig() {
    if (cfgUnsub) return;
    acct.status = 'pending';
    cfgUnsub = doc().onSnapshot(function (snap) {
      if (!snap.exists) {
        acct.status = 'ok';
        // Primera vez del superadministrador: sube lo que ya tiene en este equipo
        if (acct.isAdmin()) acct.push({});
        else acct.config = { lists: [] };
        MV.emit('acct');
        return;
      }
      acct.status = 'ok';
      apply(snap.data());
    }, function (e) {
      cfgUnsub = null;
      acct.status = /permission/i.test(e.code || e.message) ? 'denied' : 'out';
      acct.error = e.message || '';
      MV.emit('acct');
    });
  }

  MV.on('auth', function (u) {
    if (u) listenConfig();
    else {
      if (cfgUnsub) { cfgUnsub(); cfgUnsub = null; }
      acct.status = 'out'; acct.config = null;
    }
    MV.emit('acct');
  });

  /** Arranca Firebase y espera a saber si hay sesión guardada en este equipo. */
  acct.start = function () {
    return MV.sync.load().then(function () {
      return new Promise(function (res) {
        var done = false;
        var off = firebase.auth().onAuthStateChanged(function (u) { if (done) return; done = true; off(); if (!u) acct.status = 'out'; res(u); });
      });
    }).catch(function (e) { acct.status = 'out'; acct.error = e.message; return null; });
  };

  /** Espera los datos del usuario (perfiles, favoritos) después de entrar. */
  acct.waitUserData = function () {
    return new Promise(function (res) {
      var t = setTimeout(res, 5000);
      MV.on('userdoc', function () { clearTimeout(t); res(); });
    });
  };

  function withToken(idToken, accessToken) {
    var cred = firebase.auth.GoogleAuthProvider.credential(idToken || null, accessToken || null);
    return firebase.auth().signInWithCredential(cred);
  }

  /** Selector de cuentas de Google del equipo (celular, tablet y Google TV). */
  acct.signInGoogle = function () {
    return MV.sync.load().then(function () {
      if (!MV.native) return firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());
      return MV.call('googleSignIn', [C.webClientId]).then(function (d) { return withToken(d.idToken); });
    });
  };

  function post(url, form) {
    var body = Object.keys(form).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(form[k]); }).join('&');
    if (MV.native) return MV.call('httpPost', [url, body, 'application/x-www-form-urlencoded']).then(function (d) { return JSON.parse(d.text || '{}'); });
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body }).then(function (r) { return r.json(); });
  }

  /** Inicio con código (para TV): se aprueba desde el celular en google.com/device. */
  var polling = null;
  acct.startCode = function (onCode) {
    acct.stopCode();
    return post('https://oauth2.googleapis.com/device/code', { client_id: C.tvClientId, scope: 'openid email profile' }).then(function (d) {
      if (!d.device_code) throw new Error(d.error_description || d.error || 'Google no entregó el código');
      onCode({ code: d.user_code, url: d.verification_url || 'https://www.google.com/device', expires: Date.now() + (d.expires_in || 1800) * 1000 });
      var wait = Math.max(5, d.interval || 5) * 1000;
      return new Promise(function (res, rej) {
        function tick() {
          polling = setTimeout(function () {
            post('https://oauth2.googleapis.com/token', {
              client_id: C.tvClientId, client_secret: C.tvClientSecret, device_code: d.device_code,
              grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
            }).then(function (t) {
              if (t.id_token) { polling = null; return withToken(t.id_token, t.access_token).then(res, rej); }
              if (t.error === 'authorization_pending') return tick();
              if (t.error === 'slow_down') { wait += 5000; return tick(); }
              polling = null;
              rej(new Error(t.error === 'access_denied' ? 'Se canceló el inicio de sesión' : t.error === 'expired_token' ? 'El código venció, pide uno nuevo' : (t.error_description || t.error || 'No se pudo iniciar sesión')));
            }).catch(function () { tick(); });
          }, wait);
        }
        tick();
      });
    });
  };
  acct.stopCode = function () { if (polling) { clearTimeout(polling); polling = null; } };

  acct.signOut = function () {
    acct.stopCode();
    // Al salir, el equipo queda limpio para la siguiente cuenta (lo tuyo sigue guardado en la nube)
    return MV.sync.push().catch(function () {}).then(function () { return MV.sync.signOut(); }).then(function () {
      MV.resetUserData(); MV.save('lastUid', null);
    });
  };

  // ---------- Usuarios permitidos (solo superadministrador) ----------
  acct.allow = function (email) {
    email = lower(email);
    var list = ((acct.config && acct.config.allowed) || []).filter(function (e) { return e !== email; });
    list.push(email);
    if (acct.config) acct.config.allowed = list;
    return acct.push({ allowed: list });
  };
  acct.revoke = function (email) {
    var list = ((acct.config && acct.config.allowed) || []).filter(function (e) { return e !== lower(email); });
    if (acct.config) acct.config.allowed = list;
    return acct.push({ allowed: list });
  };
  acct.setOpen = function (open) {
    if (acct.config) acct.config.open = !!open;
    return acct.push({ open: !!open });
  };
})();
