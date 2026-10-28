/* MiVibra TV — pantallas, acciones y arranque. */
(function () {
  'use strict';
  var MV = window.MV, D = window.MVD, S = MV.S, P = S.prefs, IC = D.ICON, esc = MV.esc, A = MV.A;

  var view = { name: 'boot', arg: null };
  var stack = [];
  var limits = {};
  MV.reg = {};
  var reg = function (it) { MV.reg[it.key] = it; return it.key; };

  // ---------- Apariencia ----------
  MV.applyLook = function () {
    var h = document.documentElement;
    h.dataset.theme = P.theme || 'mv';
    h.dataset.glass = P.glass || 'mid';
    h.classList.toggle('no-anim', P.anim === false);
    h.classList.toggle('no-bg', P.bgAnim === false);
    h.classList.toggle('kids', MV.isKids());
    applySeason();
  };
  /** Tema de la celebración del día (Halloween, Amor y Amistad, Navidad…): colores y adornos. Se puede apagar en Ajustes › Temas. */
  MV.season = function () { return P.autoTheme === false ? null : D.seasonFor(new Date()); };
  var VARS = ['--accent', '--accent-soft', '--accent-text', '--base', '--glow', '--glow2'];
  function hexA(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }
  function applySeason() {
    var h = document.documentElement, s = MV.season();
    var deco = document.getElementById('deco');
    if (!s) {
      VARS.forEach(function (v) { h.style.removeProperty(v); });
      delete h.dataset.season; if (deco) deco.remove();
      return;
    }
    if (h.dataset.season === s.id && deco) return;
    h.dataset.season = s.id;
    h.style.setProperty('--accent', s.a); h.style.setProperty('--accent-soft', hexA(s.a, .2)); h.style.setProperty('--accent-text', s.text);
    h.style.setProperty('--base', s.base); h.style.setProperty('--glow', s.glow); h.style.setProperty('--glow2', s.glow2);
    if (!deco) { deco = document.createElement('div'); deco.id = 'deco'; deco.setAttribute('aria-hidden', 'true'); document.body.insertBefore(deco, document.body.firstChild.nextSibling); }
    // Pocos adornos y lentos (en TV quietos) para no gastar rendimiento
    var n = MV.device.tv ? 7 : 10, html = '';
    for (var i = 0; i < n; i++) {
      var x = (i * 97 + 13) % 100, y = (i * 53 + 7) % 92, sz = 18 + (i * 7) % 22, dl = (i * 1.7) % 9;
      html += '<span style="left:' + x + '%;top:' + y + '%;font-size:' + sz + 'px;animation-delay:-' + dl + 's">' + s.deco[i % s.deco.length] + '</span>';
    }
    deco.innerHTML = html;
  }
  /** Saludo de la celebración arriba en Inicio. */
  function seasonBanner() {
    var s = MV.season(); if (!s) return '';
    return '<div class="seasonbar"><span class="em">' + s.deco[0] + '</span><b>' + esc(s.greet) + '</b><span class="muted">Tema de ' + esc(s.name) + '</span></div>';
  }

  // ---------- Navegación entre pantallas ----------
  MV.go = function (name, arg, opts) {
    opts = opts || {};
    if (!opts.replace && view.name !== 'boot' && !(view.name === name && view.arg === arg)) {
      var f = document.activeElement;
      stack.push({ name: view.name, arg: view.arg, focus: f && f.id ? f.id : (f && f.dataset ? f.dataset.fid : null), scroll: (document.querySelector('.main') || {}).scrollTop || 0 });
      if (stack.length > 30) stack.shift();
    }
    view = { name: name, arg: arg };
    render(opts.keepFocus);
  };
  MV.onBack = function () {
    // Atrás mientras se escribe solo cierra el teclado; y justo después de buscar se ignora (el teclado de la TV manda un Atrás extra al cerrarse)
    var ae = document.activeElement;
    // Con el cursor en una caja de texto: se suelta la caja y Atrás sigue normal (antes volvía a enfocarla y el teclado se abría y cerraba sin salir)
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) ae.blur();
    if (Date.now() - (MV._typedAt || 0) < 900) return true;
    if (MV.tourOpen && MV.tourOpen()) { MV.tourClose(); return true; }
    if (MV.ytPlayer && MV.ytPlayer.isOpen()) { MV.ytPlayer.close(); return true; }
    if (MV.streamOpen && MV.streamOpen()) { MV.streamClose(); return true; }
    if (MV.modalOpen()) { MV.closeModal(); return true; }
    if (yearSel[view.name]) { yearSel[view.name] = ''; MV.rerender(); return true; }   // salir de "Ver todo" de un año
    if (stack.length) {
      var prev = stack.pop();
      view = { name: prev.name, arg: prev.arg };
      render();
      var main = document.querySelector('.main'); if (main) main.scrollTop = prev.scroll || 0;
      if (prev.focus) { var el = document.querySelector('[data-fid="' + prev.focus + '"]') || document.getElementById(prev.focus); if (el) { el.focus({ preventScroll: true }); } }
      return true;
    }
    var home = MV.isKids() ? 'kids' : 'home';
    if (view.name !== home && view.name !== 'profiles') { MV.go(home, null, { replace: true }); return true; }
    if (MV.isKids()) { askParentPin().then(function (ok) { if (ok) MV.go('profiles', null, { replace: true }); }); return true; }
    MV.confirm('¿Salir de MiVibra TV?', '', 'Salir').then(function (y) { if (y) { if (A) A.exit(); } });
    return true;
  };
  MV.onKey = function (k) {
    if (k === 'menu') {
      var el = document.activeElement, key = el && el.dataset && el.dataset.key;
      var it = key && (S.byKey[key] || MV.reg[key]);
      if (it) { var on = MV.toggleFav(it); MV.toast(on ? 'Agregado a favoritos' : 'Quitado de favoritos'); }
    } else if (k === 'prevTab' || k === 'nextTab') {
      var ids = navItems().map(function (n) { return n[0]; }), i = ids.indexOf(view.name);
      if (i >= 0) MV.go(ids[(i + (k === 'nextTab' ? 1 : -1) + ids.length) % ids.length], null, { replace: true });
    }
  };

  /** Qué botón del menú se ilumina: la Guía es parte de En vivo y YouTube, Música, Radio, Navegador y Juegos de Utilidades. */
  var UTILS = [['youtube', 'YouTube', 'yt', 'Videos, tendencias y búsqueda'], ['music', 'Música', 'music', 'Tu música y música libre'], ['radio', 'Radio', 'radio', 'Emisoras de Colombia y el mundo'], ['browser', 'Navegador', 'globe', 'Con bloqueador de anuncios'], ['games', 'Juegos', 'games', 'Consolas clásicas y ports']];
  function navOwner(name) {
    if (name === 'guide') return 'live';
    if (name === 'adult' || name === 'streams') return 'utils';
    if (UTILS.some(function (u) { return u[0] === name; })) return 'utils';
    return name;
  }
  function allNavItems() {
    return [
      ['home', 'Inicio', IC.home], ['live', 'En vivo', IC.live],
      ['movies', 'Películas', IC.movie], ['series', 'Series', IC.series], ['platforms', 'Plataformas', IC.platforms], ['anime', 'Anime', IC.anime], ['kdrama', 'K-Drama', IC.kdrama], ['infantil', 'Infantil', IC.kids],
      ['docs', 'Documentales', IC.doc],
      ['settings', 'Ajustes', IC.settings]
    ];
  }
  /** Menú en el orden que eligió el superadministrador (Inicio siempre primero y Ajustes siempre al final). */
  function navItems() {
    if (MV.isKids()) return [['kids', 'Inicio', IC.home], ['youtube', 'YouTube Kids', IC.yt]];
    var all = allNavItems(), order = P.navOrder || [], hidden = P.navHidden || [];
    var mid = all.filter(function (n) { return n[0] !== 'home' && n[0] !== 'settings'; });
    mid.sort(function (a, b) {
      var ia = order.indexOf(a[0]), ib = order.indexOf(b[0]);
      if (ia < 0) ia = 1000 + all.indexOf(a); if (ib < 0) ib = 1000 + all.indexOf(b);
      return ia - ib;
    });
    mid = mid.filter(function (n) { return hidden.indexOf(n[0]) < 0; });
    return [all[0]].concat(mid);   // Ajustes ya no va en el menú: está arriba, en el botón del perfil
  }
  function navOrderIds() { return navItems().map(function (n) { return n[0]; }).filter(function (id) { return id !== 'home' && id !== 'settings'; }); }

  // ---------- Render ----------
  var VIEWS = {};
  function render(keepFocus) {
    if (MV.stopHeroPreview) MV.stopHeroPreview();
    MV.applyLook();
    var app = document.getElementById('app');
    var full = view.name === 'profiles' || view.name === 'profileEdit' || view.name === 'boot' || view.name === 'login';
    var body = (VIEWS[view.name] || VIEWS.home)(view.arg);
    if (full) {
      app.innerHTML = '<div class="who-screen view-in">' + body + '</div>';
    } else {
      var p = MV.profile();
      var side = '<nav class="side glass" aria-label="Menú">' +
        '<img class="logo" src="img/isotipo.svg" alt="MiVibra TV">' +
        navItems().map(function (n) {
          return '<button class="nav f' + (navOwner(view.name) === n[0] ? ' on' : '') + '" data-act="nav" data-arg="' + n[0] + '" data-fid="nav-' + n[0] + '">' + n[2] + '<span>' + n[1] + '</span></button>';
        }).join('') +
        '</nav>';
      // Botones flotantes arriba en todas las pestañas: Buscar, Favoritos, Historial y Perfil
      var q = function (id, icon, label) { return '<button class="qbtn f' + (navOwner(view.name) === id ? ' on' : '') + '" data-act="nav" data-arg="' + id + '" data-fid="q-' + id + '" aria-label="' + label + '" title="' + label + '">' + icon + '</button>'; };
      var quick = '<div class="qbar">' + (MV.isKids() ? '' : q('utils', IC.grid, 'Utilidades') + q('discover', IC.compass, 'Descubrir')) + q('search', IC.search, 'Buscar') + (MV.isKids() ? '' : q('favs', IC.star, 'Favoritos') + q('history', IC.history, 'Historial')) +
        (p ? '<button class="qprof f' + (view.name === 'settings' ? ' on' : '') + '" data-act="' + (MV.isKids() ? 'go' : 'profMenu') + '" data-arg="profiles" data-fid="q-prof" aria-label="Perfil y ajustes"><img class="avatar" src="' + esc(MV.avatarOf(p.avatar)) + '" alt=""><span>' + esc(p.name) + '</span></button>' : '') + '</div>';
      app.innerHTML = '<div class="shell">' + side + '<main class="main">' + quick + '<div class="view-in' + (still ? ' still' : '') + '">' + body + '</div></main></div>';
    }
    if (VIEWS[view.name] && VIEWS[view.name].after) VIEWS[view.name].after(view.arg);
    if (!keepFocus) setTimeout(function () { MV.focusFirst(); }, 30);
    tourCheck();
  }
  MV.render = render;
  /** "Ver más": vuelve a dibujar sin perder el lugar; el foco queda en el primer elemento nuevo (donde estaba el botón). */
  function keepPlace() {
    var main = document.querySelector('.main'), top = main ? main.scrollTop : 0;
    var all = Array.prototype.slice.call(document.querySelectorAll('.view-in .f')), idx = all.indexOf(document.activeElement);
    render(true);
    var m2 = document.querySelector('.main'); if (m2) { m2.style.scrollBehavior = 'auto'; m2.scrollTop = top; m2.style.scrollBehavior = ''; }
    var el = idx >= 0 ? document.querySelectorAll('.view-in .f')[idx] : null;
    if (el) { el.focus({ preventScroll: true }); try { el.scrollIntoView({ block: 'nearest', behavior: 'instant' }); } catch (e) {} }
  }
  /** Vuelve a dibujar la pantalla actual sin animación de entrada y en el mismo lugar (sin saltar arriba ni parpadear). */
  MV.rerender = function () {
    var f = document.activeElement, fid = f && f.dataset && f.dataset.fid, act = f && f.dataset && f.dataset.act, arg = f && f.dataset && f.dataset.arg;
    // Posición del foco entre los botones de la pantalla: si ese botón desaparece (lista eliminada), se queda en el vecino y no salta arriba
    var allF = Array.prototype.slice.call(document.querySelectorAll('.view-in .f')), fIdx = allF.indexOf(f);
    if (fIdx < 0 && MV._lastFocusIdx != null) fIdx = MV._lastFocusIdx;
    var main = document.querySelector('.main'), top = main ? main.scrollTop : 0;
    var strips = Array.prototype.map.call(document.querySelectorAll('.strip'), function (x) { return x.scrollLeft; });
    still = true; render(true); still = false;
    var m2 = document.querySelector('.main'); if (m2) { m2.style.scrollBehavior = 'auto'; m2.scrollTop = top; m2.style.scrollBehavior = ''; }
    Array.prototype.forEach.call(document.querySelectorAll('.strip'), function (x, i) { if (strips[i]) x.scrollLeft = strips[i]; });
    var el = (fid && document.querySelector('[data-fid="' + fid + '"]')) ||
      (act && document.querySelector('[data-act="' + act + '"]' + (arg != null ? '[data-arg="' + String(arg).replace(/"/g, '\\"') + '"]' : '')));
    if (!el && fIdx >= 0) { var nf = document.querySelectorAll('.view-in .f'); el = nf[Math.min(fIdx, nf.length - 1)] || null; }
    MV._lastFocusIdx = null;
    if (el && !MV.modalOpen()) el.focus({ preventScroll: true }); else if (!MV.modalOpen()) MV.focusFirst();
  };
  var still = false;

  // ---------- Piezas ----------
  /** Imagen con respaldos: si una dirección falla, prueba la siguiente; si ninguna carga, muestra el nombre. */
  function posterImg(urls, name) {
    var list = (urls || []).filter(function (u, i, a) { return u && a.indexOf(u) === i; });
    var mono = '<span class="mono" style="font:800 30px var(--brand)">' + esc(name) + '</span>';
    if (!list.length) return mono;
    return '<img src="' + esc(list[0]) + '" alt="" data-alt="' + esc(list.slice(1).join('|')) + '" data-name="' + esc(name) + '" onerror="MV.imgNext(this)">';
  }
  MV.imgNext = function (el) {
    var alt = (el.getAttribute('data-alt') || '').split('|').filter(Boolean);
    if (alt.length) { el.setAttribute('data-alt', alt.slice(1).join('|')); el.src = alt[0]; return; }
    var sp = document.createElement('span'); sp.className = 'mono'; sp.style.font = '800 30px var(--brand)'; sp.textContent = el.getAttribute('data-name') || '';
    el.replaceWith(sp);
  };
  function thumbInner(it, big) {
    var img = MV.poster(it);
    var isLogo = it.type === 'live' && !big;
    var mono = '<span class="mono">' + esc(MV.mono(MV.cleanTitle(it.name) || it.name)) + '</span>';
    if (!img) return mono;
    // En tarjetas basta una carátula pequeña de TMDB (carga y decodifica mucho más rápido en TV box)
    if (!big) img = img.replace(/(image\.tmdb\.org\/t\/p\/)(w\d+|original)\//, '$1' + (MV.lite ? 'w154' : 'w185') + '/');
    return '<img class="' + (isLogo ? 'logo' : '') + '" loading="lazy" decoding="async" src="' + esc(img) + '" alt=""" onerror="this.outerHTML=\'' + mono.replace(/'/g, "\\'").replace(/"/g, '&quot;') + '\'">';
  }
  function card(it, kind, i) {
    reg(it);
    kind = kind || (it.type === 'live' ? 'ch' : 'poster');
    var sub = '';
    if (it.type === 'live') { var nn = MV.nowNext(it); sub = nn.now ? nn.now.t : (it.group || ''); }
    else sub = [it.year, it.type === 'series' ? 'Serie' : '', it.type === 'tmdb' ? it.group : catOf(it)].filter(Boolean).join(' · ');
    var prog = MV.progressOf(it.key), tag = it.type === 'tmdb' ? (it.have ? 'EN TUS LISTAS' : '') : it.platform ? D.platformName(it.platform).toUpperCase() : it.kdrama ? 'K-DRAMA' : it.anime ? 'ANIME' : it.ia ? 'CLÁSICO' : '';
    return '<button class="card ' + kind + ' f" style="--h:' + MV.hue(it.name) + ';animation-delay:' + Math.min(i || 0, 12) * 0.04 + 's" data-act="open" data-key="' + esc(it.key) + '" data-fid="c-' + MV.hash(it.key) + '">' +
      '<div class="th">' + thumbInner(it) + (it.num ? '<span class="num">' + esc(it.num) + '</span>' : '') + (tag ? '<span class="tag">' + tag + '</span>' : '') + '<div class="shine"></div></div>' +
      '<div class="meta"><b>' + esc(it.name) + '</b><span>' + esc(sub) + '</span>' + (prog ? '<div class="prog"><i style="width:' + Math.round(prog.pos / prog.dur * 100) + '%"></i></div>' : '') + '</div></button>';
  }
  function row(title, items, kind, sub, more) {
    if (!items || !items.length) return '';
    return '<section class="row"><h3>' + esc(title) + (sub ? ' <small>' + esc(sub) + '</small>' : '') + '</h3><div class="strip">' +
      items.map(function (it, i) { return card(it, kind, i); }).join('') +
      (more ? '<button class="btn ghost sm f" style="align-self:center;flex:0 0 auto" data-act="nav" data-arg="' + more + '">Ver todo</button>' : '') + '</div></section>';
  }
  function grid(items, kind, vkey) {
    var lim = limits[vkey] || 60;
    var html = '<div class="grid' + (kind === 'ch' ? ' ch' : '') + '">' + items.slice(0, lim).map(function (it, i) { return card(it, kind, i % 12); }).join('') + '</div>';
    if (items.length > lim) html += '<button class="btn ghost more f" data-act="more" data-arg="' + vkey + '">Ver más (' + (items.length - lim) + ')</button>';
    return html;
  }
  function chips(list, cur, act, extra) {
    return '<div class="chips">' + list.map(function (c) {
      var id = typeof c === 'string' ? c : c.name, label = typeof c === 'string' ? c : c.name;
      return '<button class="chip f' + (cur === id ? ' on' : '') + '" data-act="' + act + '" data-arg="' + esc(id) + '"' + (extra || '') + '>' + esc(label) + (c.count != null ? ' <small>' + c.count + '</small>' : '') + '</button>';
    }).join('') + '</div>';
  }
  function top(title, right) {
    return '<div class="top"><h1>' + esc(title) + '</h1><div class="sp"></div>' + (right || '') + '</div>';
  }
  function loadingBlock() {
    return S.loading ? '<div class="panel glass" style="display:flex;align-items:center;gap:14px"><div class="spinner"></div><b>' + esc(S.loadMsg || 'Cargando…') + '</b></div>' : '';
  }
  function emptyLists() {
    if (!MV.acct.canEdit()) return '<div class="empty glass"><img src="img/isotipo.svg" alt="" style="width:64px;height:64px"><h2>Preparando tu contenido</h2>' +
      '<p class="muted">El administrador aún no ha enviado listas a tu cuenta' + (MV.acct.user() ? ' (' + esc(MV.acct.user().email) + ')' : '') + '. Cuando lo haga, todo aparecerá aquí automáticamente.</p>' +
      '<div class="btns" style="justify-content:center"><button class="btn f" data-act="recheck" data-autofocus>' + IC.refresh + 'Revisar de nuevo</button></div></div>';
    return '<div class="empty glass"><img src="img/isotipo.svg" alt="" style="width:64px;height:64px"><h2>Agrega tu primera lista</h2>' +
      '<p class="muted">Pega el enlace de tu lista M3U, inicia sesión con Xtream Codes o empieza con canales gratuitos.</p>' +
      '<div class="btns" style="justify-content:center"><button class="btn f" data-act="addList" data-autofocus>' + IC.plus + 'Agregar lista</button><button class="btn ghost f" data-act="presets">Canales gratis</button></div></div>';
  }

  // ---------- Perfiles ----------
  VIEWS.boot = function () { return '<div class="spinner"></div>'; };

  // ---------- Inicio de sesión con Google ----------
  var loginCode = null, loginBusy = false;
  VIEWS.login = function () {
    var A = MV.acct, st = A.status;
    var head = '<img src="img/logo-corto-oscuro.svg" alt="MiVibra TV" style="height:54px;margin-bottom:18px"><h1>Inicia sesión</h1>';
    if (st === 'denied') {
      return head + '<p class="muted" style="max-width:520px;text-align:center">Tu cuenta <b>' + esc((A.user() || {}).email || '') + '</b> todavía no tiene acceso. Pídele al administrador que la agregue en Ajustes › Usuarios.</p>' +
        '<div class="btns" style="justify-content:center"><button class="btn f" data-act="loginRetry" data-autofocus>' + IC.refresh + 'Volver a intentar</button><button class="btn ghost f" data-act="loginOut">Usar otra cuenta</button></div>';
    }
    if (loginCode) {
      var qr = window.qrcode(0, 'M'); qr.addData(loginCode.url); qr.make();
      return head + '<div class="panel glass" style="display:flex;gap:28px;align-items:center;flex-wrap:wrap;justify-content:center;max-width:760px">' +
        '<div class="qr">' + qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true }) + '</div>' +
        '<div style="max-width:380px"><p style="margin:0 0 6px">En tu celular abre</p><h2 style="font:800 24px var(--brand);margin:0 0 12px">' + esc(loginCode.url.replace(/^https?:\/\//, '')) + '</h2>' +
        '<p style="margin:0 0 6px">y escribe este código:</p><h2 style="font:800 40px var(--brand);letter-spacing:4px;margin:0 0 12px;color:var(--accent)">' + esc(loginCode.code) + '</h2>' +
        '<p class="muted" style="font-size:13px">Elige tu cuenta de Google y acepta. Esta pantalla entra sola.</p></div></div>' +
        '<div class="btns" style="justify-content:center"><button class="btn ghost f" data-act="loginCancel" data-autofocus>Cancelar</button></div>';
    }
    var tv = MV.device.tv, btns = [];
    var g = A.hasGoogleButton() ? '<button class="btn f" data-act="loginGoogle"' + (tv ? '' : ' data-autofocus') + '>' + IC.user + 'Continuar con Google</button>' : '';
    var c = A.hasCode() ? '<button class="btn' + (tv ? '' : ' ghost') + ' f" data-act="loginCode"' + (tv ? ' data-autofocus' : '') + '>' + IC.phone + 'Entrar con el celular (código)</button>' : '';
    if (tv) btns.push(c, g); else btns.push(g, c);
    return head + '<p class="muted" style="max-width:520px;text-align:center">Entra con tu cuenta de Google para ver tu contenido, tus perfiles y seguir viendo donde lo dejaste en cualquier equipo.</p>' +
      (loginBusy ? '<div class="spinner"></div>' : '<div class="btns" style="justify-content:center;flex-direction:column;align-items:stretch;min-width:300px">' + btns.join('') + '</div>') +
      (A.error ? '<p class="muted" style="font-size:13px;margin-top:14px;max-width:520px;text-align:center">' + esc(A.error) + '</p>' : '');
  };
  function afterLogin() {
    loginCode = null; loginBusy = false; MV.acct.error = '';
    MV.go('boot', null, { replace: true });
    MV.acct.waitUserData().then(function () { continueBoot(); });
  }
  function loginFail(e) {
    loginBusy = false;
    var m = e && (e.message || e.code) || 'No se pudo iniciar sesión';
    if (m !== 'cancelado') MV.acct.error = m;
    MV.rerender();
  }
  VIEWS.profiles = function () {
    var html = '<img src="img/logo-corto-oscuro.svg" alt="MiVibra" style="height:36px"><h1>¿Quién está viendo?</h1><div class="profiles">';
    html += S.profiles.map(function (p, i) {
      return '<button class="prof f" style="animation-delay:' + i * 0.08 + 's" data-act="pickProfile" data-arg="' + p.id + '" data-fid="p-' + p.id + '"><div class="av"><img src="' + esc(MV.avatarOf(p.avatar)) + '" alt="">' +
        (p.pin ? '<span class="lock">' + IC.lock.replace('<svg', '<svg width="18" height="18" style="color:var(--accent)"') + '</span>' : '') +
        (p.kids ? '<span class="kid">NIÑOS</span>' : '') + '</div><b>' + esc(p.name) + '</b></button>';
    }).join('');
    html += '<button class="prof f" data-act="go" data-arg="profileEdit"><div class="add">' + IC.plus.replace('<svg', '<svg width="44" height="44" style="color:var(--accent)"') + '</div><b class="muted">Agregar perfil</b></button></div>';
    if (S.profiles.length) html += '<div class="btns"><button class="btn ghost f" data-act="manageProfiles">Administrar perfiles</button></div>';
    return html;
  };
  /** Avatares viejos (sets quitados) se muestran como un personaje 3D fijo. */
  MV.avatarOf = function (a) {
    a = String(a || '');
    if (!a) return D.DEFAULT_AVATARS[0];
    if (/^avatars\/(?!fluent\/)[^/]+\.png$/.test(a)) {
      var h = 0; for (var i = 0; i < a.length; i++) h = (h * 31 + a.charCodeAt(i)) >>> 0;
      return D.DEFAULT_AVATARS[h % D.DEFAULT_AVATARS.length];
    }
    return a;
  };

  // ---------- Estudio de avatares 3D ----------
  // "Crear": persona + tono de piel + color de cabello + lentes + accesorio (se combina en una imagen).
  // "Colección": toda la colección 3D de Microsoft Fluent Emoji (personas por género, caras, animales, plantas, comida, objetos…).
  var FL_REPO = 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/1ffb34c752ecf5d402f04cfb4b392c77f57c54bc/assets/';
  var TONE_DIR = { 'default': 'Default', light: 'Light', 'medium-light': 'Medium-Light', medium: 'Medium', 'medium-dark': 'Medium-Dark', dark: 'Dark' };
  var editTab = 'crear', editSel = null, editKids = false, AV = null, colCat = 'mujer', colLim = 60, FL_ALL = null, avBusy = false;
  function avDefault() { return { t: 'woman', h: 'woman', tone: 'light', hair: '', gl: '', acc: '' }; }
  function isRole(t) { var x = D.FLUENT.find(function (f) { return f[0] === t; }); return !!(x && x[2] === 'r'); }
  function avFile(c) { return 'avatars/fluent/' + c.t + '_' + c.tone + '.webp'; }
  function loadImg(src, cors) {
    return new Promise(function (res, rej) { var i = new Image(); if (cors) i.crossOrigin = 'anonymous'; i.onload = function () { res(i); }; i.onerror = rej; i.src = src; });
  }
  /** Dibuja el avatar con cabello recoloreado, lentes y accesorio; devuelve una imagen (data URL). */
  function avCompose(c, size) {
    // Profesión con TU cara: la cabeza que creaste (peinado, barba, color de cabello y lentes) va sobre el cuerpo del oficio
    if (c.h && c.h !== c.t && isRole(c.t) && D.FACE[c.t] && D.FACE[c.h]) return avRole(c, size);
    var face = D.FACE[c.t];
    if (!(c.hair && D.HAIR_MASKS.indexOf(c.t) >= 0) && !((c.gl || c.acc) && face)) return Promise.resolve(avFile(c));
    // Con sombrero, gorra, corona o birrete la cara se achica un poco para que quepa lo de arriba
    var hat = ['cap', 'tophat', 'crown', 'grad'].indexOf(c.acc) >= 0 && face;
    var S2 = size || 240, sc = hat ? 0.8 : 1, bw = S2 * sc, ox = (S2 - bw) / 2, oy = S2 - bw, k = bw / 160;
    var jobs = [loadImg(avFile(c))];
    jobs.push(c.hair && D.HAIR_MASKS.indexOf(c.t) >= 0 ? loadImg('avatars/fluent/mask/' + c.t + '.png') : null);
    jobs.push(c.gl && face ? loadImg('avatars/fluent/acc/' + c.gl + '.webp') : null);
    jobs.push(c.acc && face ? loadImg('avatars/fluent/acc/' + c.acc + '.webp') : null);
    return Promise.all(jobs).then(function (im) {
      var cv = document.createElement('canvas'); cv.width = cv.height = S2;
      var x = cv.getContext('2d');
      x.drawImage(im[0], ox, oy, bw, bw);
      if (im[1]) {
        var mc = document.createElement('canvas'); mc.width = mc.height = S2; var mx = mc.getContext('2d'); mx.drawImage(im[1], ox, oy, bw, bw);
        var md = mx.getImageData(0, 0, S2, S2).data, img = x.getImageData(0, 0, S2, S2), d = img.data, sum = 0, n = 0, i;
        for (i = 0; i < d.length; i += 4) if (md[i] > 128) { sum += 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; n++; }
        var mean = n ? sum / n : 1, hc = c.hair, tr = parseInt(hc.slice(0, 2), 16), tg = parseInt(hc.slice(2, 4), 16), tb = parseInt(hc.slice(4, 6), 16);
        for (i = 0; i < d.length; i += 4) {
          var a = md[i] / 255; if (a <= 0) continue;
          var L = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2], sh = Math.max(0.35, Math.min(1.8, L / mean));
          d[i] += (Math.min(255, tr * sh) - d[i]) * a; d[i + 1] += (Math.min(255, tg * sh) - d[i + 1]) * a; d[i + 2] += (Math.min(255, tb * sh) - d[i + 2]) * a;
        }
        x.putImageData(img, 0, 0);
      }
      if (face) {
        var lx = ox + face.l[0] * k, ly = oy + face.l[1] * k, rx = ox + face.r[0] * k, ry = oy + face.r[1] * k, top = oy + face.top * k;
        var ed = rx - lx, cx = (lx + rx) / 2, cy = (ly + ry) / 2, headW = ed * 2.05;
        var put = function (img, w, centerX, bottomOrCenterY, anchor) {
          var h = w * img.height / img.width, y = anchor === 'bottom' ? bottomOrCenterY - h : bottomOrCenterY - h / 2;
          x.drawImage(img, centerX - w / 2, y, w, h);
        };
        if (im[3]) {
          var acc = c.acc;
          if (acc === 'headphone') put(im[3], headW * 1.3, cx, cy - ed * 0.1, 'center');
          else if (acc === 'ribbon') put(im[3], ed * 0.85, rx + ed * 0.25, top + ed * 0.45, 'center');
          else if (acc === 'flower') put(im[3], ed * 0.8, lx - ed * 0.3, top + ed * 0.55, 'center');
          else if (acc === 'cap') put(im[3], headW * 1.08, cx + ed * 0.12, top + (cy - top) * 0.62, 'bottom');
          else if (acc === 'crown') put(im[3], headW * 0.8, cx, top + (cy - top) * 0.38, 'bottom');
          else put(im[3], headW * (acc === 'tophat' ? 0.95 : 1.1), cx, top + (cy - top) * 0.5, 'bottom');
        }
        if (im[2]) put(im[2], ed * 1.95, cx, cy + ed * 0.04, 'center');
      }
      try { return cv.toDataURL('image/webp', 0.9); } catch (e) { return avFile(c); }
    }).catch(function () { return avFile(c); });
  }
  function avRole(c, size) {
    var S2 = size || 240, k = S2 / 160, fr = D.FACE[c.t], fh = D.FACE[c.h];
    return Promise.all([
      loadImg(avFile(c)),
      avCompose({ t: c.h, tone: c.tone, hair: c.hair, gl: c.gl, acc: '' }, 160).then(function (src) { return loadImg(src); }),
      D.HAT_MASKS.indexOf(c.t) >= 0 ? loadImg('avatars/fluent/mask/hat-' + c.t + '.png') : null
    ]).then(function (im) {
      var cv = document.createElement('canvas'); cv.width = cv.height = S2; var x = cv.getContext('2d');
      x.drawImage(im[0], 0, 0, S2, S2);
      var sr = (fr.r[0] - fr.l[0]) / (fh.r[0] - fh.l[0]);
      x.drawImage(im[1], (fr.l[0] - fh.l[0] * sr) * k, (fr.l[1] - fh.l[1] * sr) * k, 160 * sr * k, 160 * sr * k);
      if (im[2]) {   // el gorro, casco o sombrero del oficio vuelve a quedar encima
        var hc = document.createElement('canvas'); hc.width = hc.height = S2; var hx = hc.getContext('2d');
        hx.drawImage(im[2], 0, 0, S2, S2); hx.globalCompositeOperation = 'source-in'; hx.drawImage(im[0], 0, 0, S2, S2);
        x.drawImage(hc, 0, 0);
      }
      try { return cv.toDataURL('image/webp', 0.9); } catch (e) { return avFile(c); }
    }).catch(function () { return avFile(c); });
  }
  // Miniaturas con el color de cabello y los lentes que estás eligiendo (así ves cada profesión con tu avatar)
  var thumbCache = {};
  function thumbKey(t) { return [t, AV.tone, AV.hair, AV.gl, isRole(t) ? AV.h : ''].join('|'); }
  function avThumbs() {
    if (!AV) return;
    var imgs = Array.prototype.slice.call(document.querySelectorAll('img[data-avt]')), i = 0;
    (function next() {
      if (i >= imgs.length || view.name !== 'profileEdit') return;
      var el = imgs[i++], t = el.getAttribute('data-avt'), key = thumbKey(t);
      if (thumbCache[key]) { el.src = thumbCache[key]; return next(); }
      if (!isRole(t) && !AV.hair && !AV.gl) return next();
      avCompose({ t: t, h: AV.h, tone: AV.tone, hair: AV.hair, gl: AV.gl, acc: '' }, 160).then(function (src) {
        thumbCache[key] = src; if (el.isConnected) el.src = src; setTimeout(next, 0);
      });
    })();
  }
  var avAgain = false;
  function avUpdate() {
    // Si llega otro cambio mientras se dibuja, se vuelve a dibujar al terminar (no se pierde ningún toque)
    if (avBusy) { avAgain = true; return; }
    avBusy = true; AV.custom = null;
    avCompose(AV).then(function (src) {
      avBusy = false;
      if (avAgain) { avAgain = false; return avUpdate(); }
      editSel = src; keepName(); MV.rerender();
    });
  }
  function avCreator() {
    var c = AV, people = D.FLUENT;
    var chipsRow = function (title, list, act, cur, swatch) {
      return '<div class="avrow"><b>' + title + '</b><div class="chips">' + list.map(function (o) {
        return '<button class="chip f' + (cur === o[0] ? ' on' : '') + '" data-act="' + act + '" data-arg="' + o[0] + '">' + (swatch && o[0] ? '<i class="sw" style="background:#' + o[0] + '"></i>' : '') + esc(o[1]) + '</button>';
      }).join('') + '</div></div>';
    };
    var tones = '<div class="avrow"><b>Tono de piel</b><div class="tones">' + D.FLUENT_TONES.map(function (t) {
      return '<button class="tone f' + (c.tone === t[0] ? ' on' : '') + '" data-act="avTone" data-arg="' + t[0] + '" aria-label="' + t[2] + '" title="' + t[2] + '" style="background:' + t[1] + '"></button>'; }).join('') + '</div></div>';
    var role = isRole(c.t), head = role ? c.h : c.t;
    var canHair = D.HAIR_MASKS.indexOf(head) >= 0, face = !!D.FACE[head];
    var sec = function (filter, title) {
      var list = people.filter(filter);
      return '<h3 class="avh">' + title + '</h3><div class="avgrid">' + list.map(function (x) {
        var f = 'avatars/fluent/' + x[0] + '_' + c.tone + '.webp';
        return '<button class="avopt av3d f' + (x[0] === c.t ? ' on' : '') + '" data-act="avType" data-arg="' + x[0] + '" title="' + esc(x[1]) + '"><img loading="lazy" src="' + (thumbCache[thumbKey(x[0])] || f) + '" data-avt="' + x[0] + '" alt=""><span class="avname">' + esc(x[1]) + '</span></button>';
      }).join('') + '</div>';
    };
    var isW = function (x) { return /^(woman|girl|old-woman|princess|mrs-claus)/.test(x[0]); };
    var isM = function (x) { return /^(man|boy|old-man|prince|santa-claus)/.test(x[0]); };
    return tones +
      (canHair ? chipsRow('Color de cabello', D.HAIR_COLORS, 'avHair', c.hair, true) : '<p class="muted avnote">Este personaje no permite cambiar el color de cabello (tiene un color o un casco propio).</p>') +
      (face ? chipsRow('Lentes', D.GLASSES, 'avGl', c.gl) + (role ? '<p class="muted avnote">Las profesiones usan tu cara (peinado, barba, cabello y lentes); el gorro o casco es el del oficio.</p>' : chipsRow('Accesorio', D.ACCS, 'avAcc', c.acc)) : '<p class="muted avnote">Lentes y accesorios: disponibles en las personas y peinados.</p>') +
      sec(function (x) { return x[2] === 'p' && isW(x); }, 'Mujeres') + sec(function (x) { return x[2] === 'p' && isM(x); }, 'Hombres') +
      sec(function (x) { return x[2] === 'p' && !isW(x) && !isM(x); }, 'Personas') +
      sec(function (x) { return x[2] === 'h'; }, 'Peinados y barba') +
      sec(function (x) { return x[2] === 'r' && isW(x); }, 'Profesiones y personajes · Mujer') +
      sec(function (x) { return x[2] === 'r' && isM(x); }, 'Profesiones y personajes · Hombre') +
      sec(function (x) { return x[2] === 'r' && !isW(x) && !isM(x); }, 'Otros personajes');
  }
  var COL_CATS = [['mujer', 'Mujeres'], ['hombre', 'Hombres'], ['persona', 'Personas'], ['caras', 'Caras'], ['animales', 'Animales y plantas'], ['comida', 'Comida'], ['actividades', 'Deportes y actividades'], ['objetos', 'Objetos'], ['lugares', 'Lugares y viajes'], ['simbolos', 'Símbolos'], ['banderas', 'Banderas']];
  function colUrl(e, tone) {
    var p = e[0];
    if (e[2] && tone && tone !== 'default') p = p.replace('/Default/', '/' + TONE_DIR[tone] + '/').replace(/_default\.png$/, '_' + tone + '.png');
    return FL_REPO + p.split('/').map(encodeURIComponent).join('/');
  }
  function colList() {
    if (!FL_ALL) return [];
    var sub = { mujer: 'w', hombre: 'm', persona: 'p' }[colCat];
    return FL_ALL.filter(function (e) { return sub ? e[1] === 'personas' && e[4] === sub : e[1] === colCat; });
  }
  function avCollection() {
    if (!FL_ALL) {
      MV.getJSON('avatars/fluent-all.json').catch(function () { return fetch('avatars/fluent-all.json').then(function (r) { return r.json(); }); })
        .then(function (j) { FL_ALL = j; if (view.name === 'profileEdit') MV.rerender(); }).catch(function () {});
      return '<div class="panel glass" style="display:flex;gap:14px;align-items:center"><div class="spinner"></div><b>Cargando la colección…</b></div>';
    }
    var list = colList(), tone = AV.tone;
    return '<div class="chips">' + COL_CATS.map(function (c) { return '<button class="chip f' + (colCat === c[0] ? ' on' : '') + '" data-act="colCat" data-arg="' + c[0] + '">' + c[1] + '</button>'; }).join('') + '</div>' +
      (['mujer', 'hombre', 'persona'].indexOf(colCat) >= 0 ? '<div class="avrow"><b>Tono de piel</b><div class="tones">' + D.FLUENT_TONES.map(function (t) { return '<button class="tone f' + (tone === t[0] ? ' on' : '') + '" data-act="colTone" data-arg="' + t[0] + '" title="' + t[2] + '" style="background:' + t[1] + '"></button>'; }).join('') + '</div></div>' : '') +
      '<div class="avgrid">' + list.slice(0, colLim).map(function (e, i) {
        var u = colUrl(e, tone);
        return '<button class="avopt av3d f" data-act="colPick" data-arg="' + esc(u) + '" title="' + esc(e[3]) + '"><img loading="lazy" src="' + esc(u) + '" alt=""></button>';
      }).join('') + '</div>' +
      (list.length > colLim ? '<div class="btns"><button class="btn ghost f" data-act="colMore">Ver más (' + (list.length - colLim) + ')</button></div>' : '') +
      '<p class="muted" style="font-size:12px;margin:12px 0 0">Se necesita internet para ver la colección; el avatar elegido queda guardado en el perfil.</p>';
  }
  VIEWS.profileEdit = function (id) {
    var p = S.profiles.find(function (x) { return x.id === id; });
    if (editSel === null) {
      editSel = p ? MV.avatarOf(p.avatar) : D.DEFAULT_AVATARS[S.profiles.length % D.DEFAULT_AVATARS.length]; editKids = !!(p && p.kids);
      AV = (p && p.avatarCfg) ? Object.assign(avDefault(), p.avatarCfg) : avDefault();
      var m = String(editSel).match(/^avatars\/fluent\/([a-z-]+)_([a-z-]+)\.webp$/); if (m && !(p && p.avatarCfg)) { AV.t = m[1]; AV.tone = m[2]; if (!isRole(m[1])) AV.h = m[1]; }
      if (!AV.h || isRole(AV.h)) AV.h = isRole(AV.t) ? 'person' : AV.t;
    }
    return '<div style="width:min(1100px,100%);display:flex;gap:30px;flex-wrap:wrap;align-items:flex-start">' +
      '<div style="flex:0 0 260px;display:flex;flex-direction:column;gap:14px;align-items:center">' +
      '<div style="width:200px;height:200px;border-radius:50px;overflow:hidden;background:#F3EFEA;box-shadow:0 0 0 4px var(--accent),0 30px 60px rgba(0,0,0,.5);animation:float 4s ease-in-out infinite"><img src="' + esc(editSel) + '" alt="" style="width:100%;height:100%;object-fit:contain"></div>' +
      '<label class="field" style="width:100%">Nombre del perfil<input class="in f" id="profName" value="' + esc(pendingName != null ? pendingName : (p ? p.name : '')) + '" placeholder="Ej: Papá" maxlength="20" data-autofocus></label>' +
      '<div class="line" style="width:100%"><div class="t"><b>Perfil infantil</b><span>Solo contenido para niños y límite de tiempo</span></div><button class="toggle f' + (editKids ? ' on' : '') + '" data-act="editKids" aria-label="Perfil infantil"></button></div>' +
      '<div class="btns" style="width:100%"><button class="btn f" style="flex:1" data-act="saveProfile" data-arg="' + (p ? p.id : '') + '">Guardar perfil</button></div>' +
      (p ? '<div class="btns" style="width:100%"><button class="btn ghost sm f" style="flex:1" data-act="profilePin" data-arg="' + p.id + '">' + (p.pin ? 'Quitar PIN' : 'Proteger con PIN') + '</button><button class="btn danger sm f" data-act="deleteProfile" data-arg="' + p.id + '">' + IC.trash + '</button></div>' : '') +
      '</div><div class="glass" style="flex:1;min-width:280px;border-radius:26px;padding:16px">' +
      '<div class="chips">' + [['crear', 'Crear mi avatar 3D'], ['coleccion', 'Colección completa']].map(function (t) { return '<button class="chip f' + (editTab === t[0] ? ' on' : '') + '" data-act="avTab" data-arg="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      (editTab === 'coleccion' ? avCollection() : avCreator()) +
      '<p class="muted" style="font-size:12px;margin:12px 0 0">Personajes 3D: Microsoft Fluent Emoji · Licencia MIT</p></div></div>';
  };

  // ---------- Inicio ----------
  VIEWS.home = function () {
    if (!S.lists.length) return top('Hola' + (MV.profile() ? ', ' + MV.profile().name : '')) + emptyLists();
    var live = MV.visible(S.live), movies = MV.visible(S.movies), series = MV.visible(S.series);
    var favs = MV.favs().map(MV.resolve), cont = MV.continueList();
    // Recuadro principal: el último canal que abriste; si no, un favorito; si no, uno de Colombia
    var hist = MV.pdata().history || [], lastLive = null;
    for (var hi = 0; hi < hist.length && !lastLive; hi++) {
      if (hist[hi].type !== 'live') continue;
      var cand = S.byKey[hist[hi].key];
      if (cand && live.indexOf(cand) >= 0) lastLive = cand;
    }
    var heroIt = lastLive || favs.find(function (f) { return f.type === 'live' && live.indexOf(f) >= 0; }) ||
      live.find(function (c) { return c.country === 'CO'; }) || live[0] || movies[0];
    MV._heroIt = heroIt;
    var html = seasonBanner() + loadingBlock();
    // Continuar desde otro dispositivo
    var other = cont.find(function (c) { return c.device && c.device !== P.deviceName && Date.now() - c.ts < 3 * 86400e3; });
    if (other) {
      reg(other);
      html += '<div class="banner glass"><div class="t"><span class="badge">CONTINÚA DONDE LO DEJASTE</span><h3 style="margin:8px 0 2px;font:800 22px var(--brand)">' + esc(other.name) + '</h3><span class="muted">Lo estabas viendo en ' + esc(other.device) + ' ' + MV.ago(other.ts) + ' · ' + MV.fmtDur(other.pos) + ' de ' + MV.fmtDur(other.dur) + '</span></div>' +
        '<button class="btn f" data-act="resume" data-key="' + esc(other.key) + '">Continuar aquí</button></div>';
    }
    if (heroIt) {
      reg(heroIt);
      var nn = heroIt.type === 'live' ? MV.nowNext(heroIt) : {};
      var img = MV.poster(heroIt);
      html += '<section class="hero"><div class="txt">' +
        (heroIt.type === 'live' ? '<div style="display:flex;gap:10px;align-items:center"><span class="badge"><span class="live-dot"></span>EN VIVO</span><span class="muted">' + esc(heroIt.group || '') + '</span></div>' : '<span class="badge">DESTACADO</span>') +
        '<h2>' + esc(heroIt.name) + '</h2><p>' + esc(nn.now ? nn.now.t + (nn.now.d ? ' — ' + nn.now.d : '') : (heroIt.plot || '')) + '</p>' +
        (nn.now ? '<div style="display:flex;gap:12px;align-items:center" class="muted"><span>' + MV.fmtTime(nn.now.s) + ' – ' + MV.fmtTime(nn.now.e) + '</span><div class="prog" style="width:200px"><i style="width:' + Math.round((Date.now() - nn.now.s) / (nn.now.e - nn.now.s) * 100) + '%"></i></div>' + (nn.next ? '<span>Después: ' + esc(nn.next.t) + '</span>' : '') + '</div>' : '') +
        '<div class="btns" style="margin-top:6px"><button class="btn f" data-act="play" data-key="' + esc(heroIt.key) + '" data-autofocus>' + IC.play + 'Ver en pantalla completa</button>' +
        (heroIt.type === 'live' ? '<button class="btn ghost f" data-act="nav" data-arg="guide">Guía</button>' : '<button class="btn ghost f" data-act="open" data-key="' + esc(heroIt.key) + '">Ficha</button>') + '</div></div>' +
        '<div class="prev glass"><div class="in" style="background:linear-gradient(140deg,' + MV.hue(heroIt.name) + ',#17140F 80%)">' + (img ? '<img src="' + esc(img) + '" alt="" style="' + (heroIt.type === 'live' ? 'object-fit:contain;padding:30px' : '') + '">' : '<span class="mono" style="font:800 80px var(--brand)">' + esc(MV.mono(heroIt.name)) + '</span>') +
        (heroIt.type === 'live' ? '<video id="heroVid" muted playsinline preload="none"></video><span class="herolive" id="heroLive"><span class="live-dot"></span>EN VIVO · sin sonido</span>' : '') + '</div></div></section>';
    }
    html += row('Continuar viendo', cont.map(function (c) { return MV.resolve(c); }), 'wide');
    html += row('Favoritos', favs.slice(0, 30));
    html += row('Canales en vivo', coFirst(live).slice(0, 30), 'ch', live.length + ' canales', 'live');
    html += row('Sugerido para ti', suggested(), 'poster', 'Según lo que ves en este perfil');
    var trendHave = (DISC.rows.trend || []).filter(function (t) { return t.have; });
    if (trendHave.length) html += row('Tendencia esta semana', trendHave.slice(0, 20), 'poster', 'Lo más visto en el mundo que ya tienes', 'discover');
    var pls = platformCounts();
    if (pls.length) html += '<section class="row"><h3>Plataformas</h3><div class="strip">' + pls.map(platformTile).join('') + '</div></section>';
    html += row('Películas', movies.slice(0, 30), 'poster', '', 'movies');
    html += row('Series', series.slice(0, 30), 'poster', '', 'series');
    var anime = MV.visible(S.items.filter(function (i) { return i.anime && i.type !== 'live'; }));
    html += row('Anime', anime.slice(0, 30), 'poster', '', 'anime');
    var kd = MV.visible(S.items.filter(function (i) { return i.kdrama && i.type !== 'live'; }));
    html += row('K-Drama', kd.slice(0, 30), 'poster', '', 'kdrama');
    var docs = MV.visible(S.items.filter(function (i) { return i.doc && i.type !== 'live'; }));
    html += row('Documentales', docs.slice(0, 30), 'poster', '', 'docs');
    html += '<div id="archiveRow"></div>';
    return html;
  };
  VIEWS.home.after = function () {
    if (MV.isKids()) return;
    setTimeout(heroPreview, 600);
    MV.archive().then(function (items) {
      var box = document.getElementById('archiveRow'); if (!box || !items.length) return;
      box.innerHTML = row('Cine clásico de dominio público', items.slice(0, 30), 'poster', 'Internet Archive');
    });
  };
  /** Vista previa en vivo (sin sonido) del canal del recuadro principal. Si el canal no abre en vista previa, queda el logo. */
  function heroPreview() {
    var v = document.getElementById('heroVid'), it = MV._heroIt;
    if (!v || !it || it.type !== 'live' || !it.url || it.stk || document.hidden) return;
    if (MV.lite) { v.remove(); return; }   // en equipos modestos sin vista previa en vivo (se nota más fluido)
    var done = false;
    v.muted = true;
    v.addEventListener('playing', function () { done = true; v.classList.add('on'); var l = document.getElementById('heroLive'); if (l) l.classList.add('on'); });
    v.addEventListener('error', function () { v.remove(); });
    setTimeout(function () { if (!done && v.isConnected) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {} v.remove(); } }, 12000);
    v.src = it.url;
    var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
  }
  // Al salir de Inicio o abrir el reproductor se corta la vista previa
  function stopHeroPreview() { var v = document.getElementById('heroVid'); if (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {} } }
  MV.stopHeroPreview = stopHeroPreview;
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopHeroPreview(); });
  function suggested() {
    var hist = MV.pdata().history, seen = {}, groups = {};
    hist.forEach(function (h) { seen[h.key] = 1; if (h.group) groups[h.group] = (groups[h.group] || 0) + 1; });
    var top3 = Object.keys(groups).sort(function (a, b) { return groups[b] - groups[a]; }).slice(0, 3);
    var pool = MV.visible(S.items.filter(function (i) { return i.type !== 'live' && !seen[i.key]; }));
    var out = pool.filter(function (i) { return top3.indexOf(i.group) >= 0; }).slice(0, 14);
    var seed = new Date().getDate();
    for (var k = 0; out.length < 20 && k < pool.length; k++) {
      var it = pool[(k * 37 + seed * 11) % pool.length];
      if (out.indexOf(it) < 0) out.push(it);
      if (k > 200) break;
    }
    return out;
  }

  // ---------- En vivo ----------
  // País: por defecto Colombia (si tus listas tienen canales colombianos), igual que en Radio
  var liveCat = 'Todos', liveSec = 'all', liveCountry = 'auto';
  function liveSections(all) {
    var out = [{ id: 'all', name: 'Todos', count: all.length }];
    var fcount = MV.favs().filter(function (f) { return f.type === 'live'; }).length;
    if (fcount) out.push({ id: 'fav', name: 'Favoritos', count: fcount });
    var matched = {};
    D.TV_SECTIONS.forEach(function (sec) {
      var n = all.filter(function (i) { var ok = sec.test(i, (i.group || '') + ' ' + i.name); if (ok) matched[i.key] = 1; return ok; }).length;
      if (n) out.push({ id: sec.id, name: sec.name, count: n });
    });
    var pm = {}; all.forEach(function (i) { if (i.platform) { pm[i.platform] = (pm[i.platform] || 0) + 1; matched[i.key] = 1; } });
    D.PLATFORMS.forEach(function (p) { if (pm[p.id]) out.push({ id: 'pl:' + p.id, name: p.name, count: pm[p.id] }); });
    var other = all.filter(function (i) { return !matched[i.key]; }).length;
    if (other && other < all.length) out.push({ id: 'other', name: 'Otros', count: other });
    return out;
  }
  function inSection(all, sec) {
    if (sec === 'all') return all;
    if (sec === 'fav') { var f = {}; MV.favs().forEach(function (x) { f[x.key] = 1; }); return all.filter(function (i) { return f[i.key]; }); }
    if (sec.indexOf('pl:') === 0) { var pid = sec.slice(3); return all.filter(function (i) { return i.platform === pid; }); }
    if (sec === 'other') return all.filter(function (i) { return !i.platform && !D.TV_SECTIONS.some(function (x) { return x.test(i, (i.group || '') + ' ' + i.name); }); });
    var def = D.TV_SECTIONS.find(function (x) { return x.id === sec; });
    return def ? all.filter(function (i) { return def.test(i, (i.group || '') + ' ' + i.name); }) : all;
  }
  function countriesOf(list) {
    var m = {}, none = 0;
    list.forEach(function (i) { if (i.country) m[i.country] = (m[i.country] || 0) + 1; else none++; });
    var out = Object.keys(m).map(function (k) { return { id: k, name: D.countryFlag(k) + ' ' + D.countryName(k), count: m[k] }; })
      .sort(function (a, b) { return (b.id === 'co') - (a.id === 'co') || (b.id === 'latam') - (a.id === 'latam') || b.count - a.count; });
    if (out.length && none) out.push({ id: 'none', name: 'Sin país', count: none });
    return out;
  }
  /** Colombia primero en cualquier lista de canales. */
  function coFirst(l) { var co = [], rest = []; l.forEach(function (i) { (i.country === 'co' ? co : rest).push(i); }); return co.concat(rest); }
  function effCountry(list) {
    if (liveCountry !== 'auto') return liveCountry;
    return (list || MV.visible(S.live)).some(function (i) { return i.country === 'co'; }) ? 'co' : 'all';
  }
  function liveBase() {
    var l = coFirst(inSection(MV.visible(S.live), liveSec));
    var lc = effCountry(l);
    if (lc === 'all') return l;
    if (liveCountry === 'auto' && !l.some(function (i) { return i.country === 'co'; })) return l;
    return l.filter(function (i) { return lc === 'none' ? !i.country : i.country === lc; });
  }
  function countryChips() {
    var secList = inSection(MV.visible(S.live), liveSec), cs = countriesOf(secList);
    if (!cs.length) return '';
    if (liveCountry !== 'all' && liveCountry !== 'auto' && !cs.some(function (c) { return c.id === liveCountry; })) liveCountry = 'all';
    var cur = liveCountry === 'auto' ? (cs.some(function (c) { return c.id === 'co'; }) ? 'co' : 'all') : liveCountry;
    return '<div class="chips" aria-label="Países">' + [{ id: 'all', name: 'Todos los países', count: secList.length }].concat(cs).map(function (x) {
      return '<button class="chip f' + (x.id === cur ? ' on' : '') + '" data-act="liveCountry" data-arg="' + esc(x.id) + '">' + esc(x.name) + ' <small>' + x.count + '</small></button>';
    }).join('') + '</div>';
  }
  function secChips() {
    var secs = liveSections(MV.visible(S.live));
    return '<div class="chips" aria-label="Secciones de TV">' + secs.map(function (x) {
      return '<button class="chip f' + (x.id === liveSec ? ' on' : '') + '" data-act="liveSec" data-arg="' + esc(x.id) + '">' + esc(x.name) + ' <small>' + x.count + '</small></button>';
    }).join('') + '</div>';
  }
  VIEWS.live = function () {
    if (!S.lists.length) return top('En vivo', tvTabs('live')) + emptyLists();
    var filt = secChips() + countryChips();
    var all = liveBase();
    var cats = [{ name: 'Todos', count: all.length }].concat(MV.groups(all));
    if (liveCat !== 'Todos' && !cats.some(function (c) { return c.name === liveCat; })) liveCat = 'Todos';
    var list = channelsOf(liveCat, all);
    var lim = limits.live || 150;
    return top('En vivo', tvTabs('live')) + loadingBlock() + filt +
      '<div class="live"><div class="cats glass">' + cats.map(function (c) {
        return '<button class="cat f' + (c.name === liveCat ? ' on' : '') + '" data-act="liveCat" data-arg="' + esc(c.name) + '" data-fid="cat-' + MV.hash(c.name) + '"><span>' + esc(c.name) + '</span><small>' + c.count + '</small></button>';
      }).join('') + '</div><div class="chlist glass">' +
      (list.length ? list.slice(0, lim).map(function (it, i) {
        reg(it); var nn = MV.nowNext(it), fav = MV.isFav(it.key);
        return '<button class="chrow f" style="--h:' + MV.hue(it.name) + ';animation-delay:' + Math.min(i, 15) * 0.03 + 's" data-act="playLive" data-key="' + esc(it.key) + '" data-fid="ch-' + MV.hash(it.key) + '">' +
          '<div class="lg">' + (it.logo ? '<img loading="lazy" src="' + esc(it.logo) + '" alt="" onerror="this.remove()">' : esc(MV.mono(it.name))) + '</div>' +
          '<div class="tx"><b>' + (it.num ? esc(it.num) + ' · ' : '') + esc(it.name) + '</b><span>' + esc(nn.now ? 'Ahora: ' + nn.now.t + (nn.next ? ' · Después: ' + nn.next.t : '') : (it.group || '')) + '</span>' +
          (nn.now ? '<div class="prog"><i style="width:' + Math.round((Date.now() - nn.now.s) / (nn.now.e - nn.now.s) * 100) + '%"></i></div>' : '') + '</div>' +
          (fav ? '<span class="fav">' + IC.starFill.replace('<svg', '<svg width="18" height="18"') + '</span>' : '') + '</button>';
      }).join('') + (list.length > lim ? '<button class="btn ghost more f" data-act="more" data-arg="live">Ver más (' + (list.length - lim) + ')</button>' : '') : '<p class="muted" style="padding:20px">No hay canales en esta categoría.</p>') +
      '</div></div><p class="muted" style="margin-top:10px;font-size:13px">Consejo: con el botón Menú del control (o Y en el mando) agregas el canal enfocado a favoritos.</p>';
  };
  function channelsOf(cat, all) {
    if (cat === 'Todos') return all;
    if (cat === 'Favoritos') { var f = {}; MV.favs().forEach(function (x) { f[x.key] = 1; }); return all.filter(function (i) { return f[i.key]; }); }
    return all.filter(function (i) { return (i.group || 'Sin categoría') === cat; });
  }

  // ---------- Guía ----------
  VIEWS.guide = function () {
    if (!S.lists.length) return top('Guía') + emptyLists();
    var filt = secChips() + countryChips();
    var all = liveBase();
    if (liveCat !== 'Todos' && !all.some(function (i) { return i.group === liveCat; })) liveCat = 'Todos';
    var list = channelsOf(liveCat, all).slice(0, 80);
    var cats = ['Todos'].concat(MV.groups(all).map(function (g) { return g.name; }));
    var start = Math.floor((Date.now() - 30 * 60e3) / (30 * 60e3)) * 30 * 60e3, hours = 4, slot = 220, end = start + hours * 3600e3;
    var pxPerMs = slot / (30 * 60e3), width = hours * 2 * slot;
    var hdr = '<div class="hdr"><div class="c0"></div>';
    for (var t = start; t < end; t += 30 * 60e3) hdr += '<div class="t">' + MV.fmtTime(t) + '</div>';
    hdr += '</div>';
    var anyEpg = Object.keys(S.epg.progs).length > 0;
    var rows = list.map(function (it) {
      reg(it);
      var ps = MV.progsFor(it).filter(function (p) { return p.e > start && p.s < end; });
      var cells = ps.length ? ps.map(function (p) {
        var l = Math.max(p.s, start), r = Math.min(p.e, end), now = p.s <= Date.now() && p.e > Date.now();
        return '<button class="pr f' + (now ? ' now' : '') + '" style="left:' + ((l - start) * pxPerMs) + 'px;width:' + ((r - l) * pxPerMs) + 'px" data-act="playLive" data-key="' + esc(it.key) + '" title="' + esc(p.t) + '"><div class="in"><b>' + esc(p.t) + '</b><span>' + MV.fmtTime(p.s) + ' – ' + MV.fmtTime(p.e) + '</span></div></button>';
      }).join('') : '<button class="pr f" style="left:0;width:' + width + 'px" data-act="playLive" data-key="' + esc(it.key) + '"><div class="in"><b>' + esc(it.name) + '</b><span>Sin guía para este canal</span></div></button>';
      return '<div class="ln"><div class="who glass">' + (it.logo ? '<img loading="lazy" src="' + esc(it.logo) + '" alt="" onerror="this.remove()">' : '') + '<span>' + esc(it.name) + '</span></div><div class="tl" style="width:' + width + 'px">' + cells + '</div></div>';
    }).join('');
    return top('Guía de programación', tvTabs('guide') + '<button class="pill f" data-act="reloadEpg">' + IC.refresh.replace('<svg', '<svg width="18" height="18"') + 'Actualizar guía</button>') +
      filt + chips(cats, liveCat, 'liveCat') +
      (!anyEpg ? '<div class="panel glass"><p style="margin:0">Aún no hay guía cargada. Si tu lista trae una guía EPG (XMLTV) se carga sola; también puedes poner el enlace en Ajustes › Listas.</p></div>' : '') +
      '<div class="epg glass" style="--slot:' + slot + 'px">' + hdr + '<div style="position:relative">' + rows +
      '<div class="nowline" style="left:calc(var(--c0) + ' + ((Date.now() - start) * pxPerMs) + 'px)"></div></div></div>';
  };

  // ---------- Películas, series, anime, k-drama, documentales ----------
  var catSel = {}, genreSel = {}, platSel = {}, sortSel = MV.load('sortSel', {});
  /** Nombre de categoría limpio: "|ES| ACCION 4K" → "Acción"; agrupa variantes del mismo nombre. */
  var GROUP_CACHE = {};
  function cleanGroup(g) {
    g = String(g || '').trim();
    if (GROUP_CACHE[g] !== undefined) return GROUP_CACHE[g];
    var c = g.replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, ' ')
      .replace(/^\s*[\[|(]?\s*[A-Za-z]{2,5}\s*[\]|):]\s*/, '')
      .replace(/^\s*(vod|movies?|pel[ií]culas?|series?)\s*[-|:]\s*/i, '')
      .replace(/\b(4k|uhd|fhd|hd|sd|hevc|h265|x265|1080p?|720p?)\b/gi, ' ')
      .replace(/[|_]+/g, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s\-–:.]+|[\s\-–:.]+$/g, '').trim();
    if (!c) c = g || 'Sin categoría';
    if (c === c.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{3}/.test(c)) c = c.toLowerCase().replace(/(^|\s)(\S)/g, function (m, a, b) { return a + b.toUpperCase(); });
    c = c.replace(/\bAccion\b/g, 'Acción').replace(/\bAnimacion\b/g, 'Animación').replace(/\bCiencia Ficcion\b/gi, 'Ciencia ficción').replace(/\bComedia\b/g, 'Comedia').replace(/\bInfantil(es)?\b/g, 'Infantil');
    GROUP_CACHE[g] = c;
    return c;
  }
  /** Categoría de un título para filtros y filas: sin categorías genéricas ("Películas", "VOD", "Series 2024"…)
      y uniendo las repetidas ("ACCION", "Acción HD", "Películas - Acción" → "Acción"). Las genéricas usan el género. */
  var GENERIC_W = /^(peliculas?|pelis?|movies?|cine|films?|vod|series?|shows?|tv|anime|animes?|estrenos?|latino|latinos|latam|castellano|espanol|subtitulad[oa]s?|sub|dual|audio|internet|todas?|todos?|todo|varias?|varios?|otras?|otros?|mix|full|general|coleccion|completas?|completos?|nuevas?|nuevos?|y|de|del|la|las|los|el|en|para|con|hd|online|lat|esp|eng|vose|multi|ultimas?|ultimos?|recientes?|agregad[oa]s?|top|\d{2,4})$/;
  var CAT_KEY = {}, CAT_NAME = {};
  function catKey(c) {
    return MV.norm(c).split(' ').filter(function (w) { return w && !GENERIC_W.test(w); })
      .map(function (w) { return w.length > 4 ? w.replace(/(es|s)$/, '') : w; }).join(' ');
  }
  function catOf(i) {
    if ((i.genres || []).indexOf('religiosa') >= 0) return 'Religiosas';   // clasificadas por TMDB o por su categoría
    // Con ficha de TMDB, la categoría es su género principal (más estricto que la categoría de la lista)
    if (i.tmdbG && i.genres && i.genres.length) return D.genreName(i.genres[0]);
    var g = i.group || '', c = cleanGroup(g), k = CAT_KEY[g];
    if (k === undefined) { k = CAT_KEY[g] = catKey(c); if (k && !CAT_NAME[k]) CAT_NAME[k] = c; }
    if (k) return CAT_NAME[k];
    var gen = (i.genres || []).filter(function (x) { return x !== 'infantil' || i.kids; })[0];
    return gen ? D.genreName(gen) : 'Otras';
  }
  function groupsClean(list) {
    var m = {};
    list.forEach(function (i) { var c = catOf(i); m[c] = (m[c] || 0) + 1; });
    return Object.keys(m).map(function (k) { return { name: k, count: m[k] }; }).sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
  }
  var SORTS = [['rec', 'Recientes'], ['az', 'A-Z'], ['year', 'Año'], ['rating', 'Calificación']];
  function sortList(list, how) {
    if (!how || how === 'rec') return list;
    var l = list.slice();
    if (how === 'az') l.sort(function (a, b) { return MV.cleanTitle(a.name).localeCompare(MV.cleanTitle(b.name), 'es'); });
    if (how === 'year') l.sort(function (a, b) { return (+b.year || 0) - (+a.year || 0); });
    if (how === 'rating') l.sort(function (a, b) { return (+b.rating || 0) - (+a.rating || 0); });
    return l;
  }
  function genreChips(list, cur, vkey, act, label) {
    if (!list.length) return '';
    return '<div class="chips filt" aria-label="' + (label || 'Género') + '"><span class="flabel">' + (label || 'GÉNERO') + '</span>' +
      [{ id: '', name: 'Todos' }].concat(list).map(function (g) {
        return '<button class="chip f' + ((cur || '') === g.id ? ' on' : '') + '" data-act="' + (act || 'genre') + '" data-arg="' + esc(g.id) + '" data-v="' + vkey + '">' + esc(g.name) + (g.count ? ' <small>' + g.count + '</small>' : '') + '</button>';
      }).join('') + '</div>';
  }
  var CAT_TOP = 10, viewMode = MV.load('viewMode', {}), rowLimit = {};
  /** Vista por filas: una fila por categoría (como Inicio), con "Ver todo" que abre la categoría completa. */
  function catRows(vkey, list, kind) {
    var by = {}, order = [];
    list.forEach(function (i) { var c = catOf(i); if (!by[c]) { by[c] = []; order.push(c); } by[c].push(i); });
    order.sort(function (a, b) { return by[b].length - by[a].length; });
    if (by['Otras']) { order.splice(order.indexOf('Otras'), 1); order.push('Otras'); }   // "Otras" al final
    var html = '', K = kind || 'poster';
    // Estrenos siempre primero (se actualiza solo: lo del año actual y el anterior, lo más nuevo arriba)
    if (vkey !== 'anime') {
      var est = list.filter(isEstreno).sort(byRelease);
      if (est.length >= 3) html += '<section class="row"><h3>Estrenos <small>' + est.length + '</small></h3><div class="strip">' +
        est.slice(0, 24).map(function (it, i) { return card(it, K, i); }).join('') +
        (est.length > 24 ? '<button class="card poster f seeall" data-act="cat" data-arg="Estrenos" data-v="' + vkey + '"><div class="th"><b>Ver todo ›</b><span>' + est.length + ' títulos</span></div></button>' : '') + '</div></section>';
    }
    // Anime: primero lo que está en emisión esta temporada
    if (vkey === 'anime') {
      loadAiring();
      var air = airingMatches(list);
      if (air.length) html += row('En emisión', air.slice(0, 24), K, air.length + '');
    }
    // Lo más nuevo arriba: agregados recientemente y luego una fila por año (2026, 2025, 2024…)
    var recent = list.filter(function (i) { return i.added; }).sort(function (a, b) { return (b.added || 0) - (a.added || 0); }).slice(0, 20);
    if (recent.length >= 6) html += row('Agregados recientemente', recent, K);
    var yr = {}, thisYear = new Date().getFullYear();
    list.forEach(function (i) { var y = +itemYear(i); if (y >= 1900 && y <= thisYear + 1) (yr[y] = yr[y] || []).push(i); });
    var years = Object.keys(yr).map(Number).filter(function (y) { return yr[y].length >= 3; }).sort(function (a, b) { return b - a; });
    var ylim = rowLimit[vkey + ':y'] || 6;
    var ylabel = vkey === 'movies' ? 'Películas ' : vkey === 'series' ? 'Series ' : vkey === 'anime' ? 'Anime ' : '';
    years.slice(0, ylim).forEach(function (y) {
      var items = yr[y];
      html += '<section class="row"><h3>' + (ylabel ? ylabel : 'Del ') + y + ' <small>' + items.length + '</small></h3><div class="strip">' +
        items.slice(0, 20).map(function (it, i) { return card(it, K, i); }).join('') +
        (items.length > 20 ? '<button class="card poster f seeall" data-act="yearAll" data-arg="' + y + '" data-v="' + vkey + '"><div class="th"><b>Ver todo ›</b><span>' + items.length + ' títulos</span></div></button>' : '') + '</div></section>';
    });
    if (years.length > ylim) html += '<button class="btn ghost more f" data-act="moreRows" data-arg="' + vkey + ':y">Ver más años (' + (years.length - ylim) + ')</button>';
    // Ganadoras del Óscar (solo películas), una fila por premio
    var oscBy = { p: [], a: [], i: [], o: [] };
    list.forEach(function (i) { if (i.type !== 'movie') return; var c = isOscar(i); if (c) oscBy[c].push(i); });
    [['p', 'Óscar a Mejor película'], ['a', 'Óscar a Mejor película animada'], ['i', 'Óscar a Mejor película internacional'], ['o', 'Otras ganadoras del Óscar']].forEach(function (r) {
      var arr = oscBy[r[0]].sort(function (a, b) { return (+itemYear(b) || 0) - (+itemYear(a) || 0); });
      if (arr.length) html += row(r[1], arr.slice(0, 30), K, arr.length + '');
    });
    var top = list.filter(function (i) { return +i.rating >= 7; }).sort(function (a, b) { return (+b.rating || 0) - (+a.rating || 0); }).slice(0, 20);
    if (top.length >= 6) html += row('Mejor calificadas', top, K);
    var lim = rowLimit[vkey] || 14;
    order.slice(0, lim).forEach(function (c) {
      var items = by[c];
      html += '<section class="row"><h3>' + (items.length > 20 ? '<button class="rowtitle" data-act="cat" data-arg="' + esc(c) + '" data-v="' + vkey + '">' + esc(c) + ' <small>' + items.length + ' · Ver todo ›</small></button>' : esc(c) + ' <small>' + items.length + '</small>') + '</h3><div class="strip">' +
        items.slice(0, 20).map(function (it, i) { return card(it, kind || 'poster', i); }).join('') +
        (items.length > 20 ? '<button class="card poster f seeall" data-act="cat" data-arg="' + esc(c) + '" data-v="' + vkey + '"><div class="th"><b>Ver todo ›</b><span>' + items.length + ' títulos</span></div></button>' : '') + '</div></section>';
    });
    if (order.length > lim) html += '<button class="btn ghost more f" data-act="moreRows" data-arg="' + vkey + '">Ver más categorías (' + (order.length - lim) + ')</button>';
    return html;
  }
  /** ¿Ganó el Óscar? Compara el título (sin año ni calidad) con la lista; si la película trae año, debe coincidir (±1). */
  var OSC_IDX = null;
  function isOscar(i) {
    if (!OSC_IDX) {
      OSC_IDX = {};
      D.OSCARS.forEach(function (o) { o[1].split('|').forEach(function (t) { var k = MV.norm(t); if (k) (OSC_IDX[k] = OSC_IDX[k] || []).push(o); }); });
    }
    var k = MV.norm(MV.cleanTitle(i.name)), os = OSC_IDX[k];
    if (!os) return '';
    var y = +itemYear(i);
    if (!y) return k.length >= 6 ? os[0][2] : '';        // sin año: solo títulos largos (evita "Up", "Soul"…)
    var hit = os.find(function (o) { return Math.abs(o[0] - y) <= 1; });
    return hit ? hit[2] : '';
  }
  var yearSel = {};
  // Estreno: del año actual o del anterior (con año confirmado); "Estrenos" en la categoría solo cuenta si no se sabe el año
  /** Del estreno más reciente al más antiguo: fecha de TMDB; si no hay, el año; después lo agregado a la lista. */
  function byRelease(a, b) {
    var da = a.rdate || (itemYear(a) ? itemYear(a) + '-00-00' : ''), db = b.rdate || (itemYear(b) ? itemYear(b) + '-00-00' : '');
    if (da !== db) return da < db ? 1 : -1;
    return (b.added || 0) - (a.added || 0);
  }
  function isEstreno(i) {
    var y = +itemYear(i), now = new Date().getFullYear();
    if (y) return y >= now - 1;
    return /\bestrenos?\b/i.test(i.group || '');
  }
  /** Del oeste / vaqueros / western: por género (categoría o ficha de TMDB) o por el nombre. */
  var WEST_RX = /\b(western|westerns|wéstern|vaqueros?|cowboys?|del oeste|lejano oeste|far west|pistoleros?)\b/i;
  function isWestern(i) { return (i.genres || []).indexOf('western') >= 0 || WEST_RX.test(i.group || '') || WEST_RX.test(i.name || ''); }
  function catalogView(vkey, title, items, kind) {
    if (!S.lists.length) return top(title) + emptyLists();
    var all = MV.visible(items);
    var cats = groupsClean(all);
    var nEst = vkey === 'anime' ? 0 : all.filter(isEstreno).length;
    if (nEst) cats = [{ name: 'Estrenos', count: nEst }].concat(cats.filter(function (c) { return c.name !== 'Estrenos'; }));
    var cur = catSel[vkey] || '', gen = genreSel[vkey] || '', plat = platSel[vkey] || '', sort = sortSel[vkey] || 'rec';
    if (cur && !cats.some(function (c) { return c.name === cur; })) cur = catSel[vkey] = '';
    var list = cur === 'Estrenos' ? all.filter(isEstreno).sort(byRelease) : cur ? all.filter(function (i) { return catOf(i) === cur; }) : all;
    var pm = {}; list.forEach(function (i) { if (i.platform) pm[i.platform] = (pm[i.platform] || 0) + 1; });
    var plats = vkey.indexOf('pl-') === 0 ? [] : D.PLATFORMS.filter(function (p) { return pm[p.id]; }).map(function (p) { return { id: p.id, name: p.name, count: pm[p.id] }; });
    if (plat) list = list.filter(function (i) { return i.platform === plat; });
    var genres = MV.genresOf(list);
    if (gen) list = list.filter(function (i) { return gen === 'western' ? isWestern(i) : (i.genres || []).indexOf(gen) >= 0; });
    var ysel = yearSel[vkey] || '';
    if (ysel) list = list.filter(function (i) { return itemYear(i) === ysel; });
    list = sortList(list, sort);
    MV._catAll = MV._catAll || {}; MV._catAll[vkey] = cats;

    // Categorías: las más grandes a la vista; el resto en "Más categorías"
    var shown = cats.slice(0, CAT_TOP);
    if (cur && !shown.some(function (c) { return c.name === cur; })) shown = [cats.find(function (c) { return c.name === cur; })].concat(shown.slice(0, CAT_TOP - 1));
    var catRow = '<div class="chips filt"><span class="flabel">CATEGORÍA</span><button class="chip f' + (!cur ? ' on' : '') + '" data-act="cat" data-arg="" data-v="' + vkey + '">Todas <small>' + all.length + '</small></button>' +
      shown.map(function (c) { return '<button class="chip f' + (cur === c.name ? ' on' : '') + '" data-act="cat" data-arg="' + esc(c.name) + '" data-v="' + vkey + '">' + esc(c.name) + ' <small>' + c.count + '</small></button>'; }).join('') +
      (cats.length > CAT_TOP ? '<button class="chip more f" data-act="catMore" data-arg="' + vkey + '">Más categorías (' + (cats.length - CAT_TOP) + ') ▾</button>' : '') + '</div>';
    var mode = viewMode[vkey] || 'rows';
    var sortSeg = '<div class="seg sortseg">' + (!cur ? '<button class="chip f" data-act="viewMode" data-arg="' + (mode === 'rows' ? 'grid' : 'rows') + '" data-v="' + vkey + '">' + (mode === 'rows' ? '▦ Cuadrícula' : '☰ Filas') + '</button>' : '') + SORTS.map(function (s) { return '<button class="chip f' + (sort === s[0] ? ' on' : '') + '" data-act="sortBy" data-arg="' + s[0] + '" data-v="' + vkey + '">' + s[1] + '</button>'; }).join('') + '</div>';
    var active = [cur, plat ? D.platformName(plat) : '', gen ? D.genreName(gen) : '', ysel ? 'Año ' + ysel : ''].filter(Boolean);
    var summary = '<div class="fsum"><b>' + list.length + '</b> <span>' + (list.length === 1 ? 'título' : 'títulos') + (active.length ? ' · ' + esc(active.join(' · ')) : '') + '</span>' +
      (active.length ? '<button class="btn ghost sm f" data-act="clearFilters" data-arg="' + vkey + '">' + IC.close.replace('<svg', '<svg width="16" height="16"') + 'Limpiar filtros</button>' : '') + '</div>';
    // Filtros compactos en una sola línea; cada botón abre su selector
    MV._pick = MV._pick || {};
    MV._pick[vkey] = { cats: [{ id: '', name: 'Todas', count: all.length }].concat(cats.map(function (c) { return { id: c.name, name: c.name, count: c.count }; })), plats: [{ id: '', name: 'Todas' }].concat(plats), genres: [{ id: '', name: 'Todos' }].concat(genres), sort: SORTS.map(function (x) { return { id: x[0], name: x[1] }; }) };
    var fb = function (kind, label, val, on) { return '<button class="fbtn f' + (on ? ' on' : '') + '" data-act="pick" data-arg="' + kind + '" data-v="' + vkey + '"><small>' + label + '</small> ' + esc(val) + ' ▾</button>'; };
    var bar = '<div class="fbar">' + (MV._fbarPre || '') +
      fb('cats', 'Categoría', cur || 'Todas', !!cur) +
      (plats.length ? fb('plats', 'Plataforma', plat ? D.platformName(plat) : 'Todas', !!plat) : '') +
      (genres.length ? fb('genres', 'Género', gen ? D.genreName(gen) : 'Todos', !!gen) : '') +
      fb('sort', 'Orden', (SORTS.find(function (x) { return x[0] === sort; }) || SORTS[0])[1], false) +
      // Filtro rápido: Western (del oeste, vaqueros) en Películas y Series
      ((vkey === 'movies' || vkey === 'series') && (gen === 'western' || all.some(isWestern)) ? '<button class="fbtn f' + (gen === 'western' ? ' on' : '') + '" data-act="westernToggle" data-v="' + vkey + '">Western</button>' : '') +
      (!cur ? '<button class="fbtn f" data-act="viewMode" data-arg="' + (mode === 'rows' ? 'grid' : 'rows') + '" data-v="' + vkey + '">' + (mode === 'rows' ? '▦ Cuadrícula' : '☰ Filas') + '</button>' : '') +
      (active.length ? '<button class="fbtn f" data-act="clearFilters" data-arg="' + vkey + '">✕ Limpiar</button>' : '') + '</div>';
    MV._fbarPre = '';
    return top(title) + loadingBlock() + bar + (active.length || cur || mode !== 'rows' ? summary : '') +
      (list.length ? (mode === 'rows' && !cur && !ysel ? catRows(vkey, list, kind) : grid(list, kind, vkey)) : '<div class="empty glass"><h2>' + (active.length ? 'Nada con esos filtros' : 'No hay contenido aquí todavía') + '</h2><p class="muted">' + (active.length ? 'Prueba quitando algún filtro.' : 'Se llena con lo que traen tus listas M3U o tu cuenta Xtream.') + '</p>' + (active.length ? '<div class="btns" style="justify-content:center"><button class="btn f" data-act="clearFilters" data-arg="' + vkey + '">Limpiar filtros</button></div>' : '') + '</div>');
  }
  function catMoreModal(vkey, filter) {
    var cats = (MV._catAll || {})[vkey] || [], q = MV.norm(filter || '');
    var shown = q ? cats.filter(function (c) { return MV.norm(c.name).indexOf(q) >= 0; }) : cats;
    return '<h2>Categorías</h2><input class="in f" id="catFind" placeholder="Buscar categoría" value="' + esc(filter || '') + '" autocomplete="off" style="margin:8px 0 12px">' +
      '<div class="catgrid" id="catGrid">' + shown.map(function (c) { return '<button class="chip f' + ((catSel[vkey] || '') === c.name ? ' on' : '') + '" data-act="catPick" data-arg="' + esc(c.name) + '" data-v="' + vkey + '">' + esc(c.name) + ' <small>' + c.count + '</small></button>'; }).join('') +
      (shown.length ? '' : '<p class="muted">No hay categorías con ese nombre.</p>') + '</div>';
  }
  // ---------- Plataformas (separadores por servicio, según las categorías de tus listas) ----------
  function platformCounts() {
    var m = {};
    MV.visible(S.items).forEach(function (i) { if (i.platform && i.type !== 'live') m[i.platform] = (m[i.platform] || 0) + 1; });
    return D.PLATFORMS.filter(function (p) { return m[p.id]; }).map(function (p) { return { id: p.id, name: p.name, count: m[p.id] }; });
  }
  function platformTile(p, i) {
    return '<button class="card wide f" style="--h:' + MV.hue(p.id + 'mv') + ';animation-delay:' + Math.min(i, 12) * 0.04 + 's" data-act="platform" data-arg="' + p.id + '" data-fid="pl-' + p.id + '">' +
      '<div class="th" style="height:120px"><span class="mono" style="font-size:30px;letter-spacing:-.5px">' + esc(p.name) + '</span></div>' +
      '<div class="meta"><b>' + esc(p.name) + '</b><span>' + p.count + ' títulos</span></div></button>';
  }
  VIEWS.platforms = function (id) {
    if (!S.lists.length) return top('Plataformas') + emptyLists();
    if (id) {
      var items = S.items.filter(function (i) { return i.platform === id && i.type !== 'live'; });
      return '<div class="top"><button class="iconbtn f" data-act="back" aria-label="Volver">' + IC.back + '</button></div>' + catalogView('pl-' + id, D.platformName(id), items);
    }
    var list = platformCounts();
    return top('Plataformas', '<span class="muted">Según las categorías de tus listas</span>') + loadingBlock() +
      (list.length ? '<div class="pgrid">' + list.map(function (p, i) { return platformTile(p, i); }).join('') + '</div>'
        : '<div class="empty glass"><h2>No encontramos plataformas en tus listas</h2><p class="muted">Aparecen cuando las categorías de tus listas llevan el nombre del servicio, por ejemplo “Netflix Series” o “Disney+ Películas”.</p></div>');
  };

  VIEWS.movies = function () { return catalogView('movies', 'Películas', S.movies); };
  VIEWS.series = function () { return catalogView('series', 'Series', S.series); };
  /** TMDB va clasificando en segundo plano (géneros, religiosas…) lo que todavía no tiene ficha. */
  var tmdbTried = {}, tmdbRunning = false;
  function tmdbClassify(list) {
    if (tmdbRunning || !P.tmdbKey || MV.isKids()) return;
    // Primero lo que no tiene ficha; luego lo que falta por fecha de estreno (lo más nuevo primero)
    var todo = MV.visible(list).filter(function (i) { return !tmdbTried[i.key] && !i.anime && (!MV.hasLearned(i.key) || !i.rdate); })
      .sort(function (a, b) { return (MV.hasLearned(a.key) ? 1 : 0) - (MV.hasLearned(b.key) ? 1 : 0) || (+itemYear(b) || 0) - (+itemYear(a) || 0); });
    if (!todo.length) return;
    tmdbRunning = true;
    var here = view.name, n = 0, changed = 0;
    (function next() {
      if (view.name !== here || n >= todo.length) { tmdbRunning = false; if (changed && view.name === here && !MV.modalOpen()) MV.rerender(); return; }
      var it = todo[n++]; tmdbTried[it.key] = 1;
      MV.meta(it).then(function (m) {
        if (m) changed++;
        // Solo se reorganiza cuando no estás moviéndote con el control (así no se traba)
        var idle = Date.now() - (MV._lastKey || 0) > 4000;
        if (changed >= 40 && idle && view.name === here && !MV.modalOpen() && !(document.activeElement && document.activeElement.tagName === 'INPUT')) { changed = 0; MV.rerender(); }
        setTimeout(next, MV.lite ? 900 : MV.device.tv ? 500 : 250);
      });
    })();
  }
  VIEWS.movies.after = function () { setTimeout(function () { tmdbClassify(S.movies); }, 1500); };
  VIEWS.series.after = function () { setTimeout(function () { tmdbClassify(S.series); }, 1500); };
  // ---------- Anime: Todo · En emisión · Por año ----------
  var animeMode = 'all', animeYear = '', AIRING = { list: null, loading: false, ts: 0, error: '' };
  /** Año del título: el de la lista o el de la ficha; del nombre solo "(2024)" o "2024" al final (no "2097" o "2067" del título). */
  function itemYear(i) {
    var now = new Date().getFullYear(), ok = function (y) { y = +y; return y >= 1900 && y <= now + 1 ? String(y) : ''; };
    var y = ok(i.year) || ok(i._meta && i._meta.year);
    if (y) return y;
    var n = String(i.name || ''), m = n.match(/[([]\s*((?:19|20)\d{2})\s*[)\]]/) || n.match(/[\s\-–]((?:19|20)\d{2})\s*$/);
    return m ? ok(m[1]) : '';
  }
  /** Anime que se está emitiendo esta temporada (MyAnimeList vía Jikan), cruzado con tus listas. */
  function loadAiring() {
    if (AIRING.loading || (AIRING.list && AIRING.ts > Date.now() - 12 * 3600e3)) return;
    var cached = MV.load('airingNow', null);
    if (cached && cached.ts > Date.now() - 12 * 3600e3) { AIRING.list = cached.titles; AIRING.ts = cached.ts; return; }
    AIRING.loading = true; AIRING.error = '';
    var titles = [];
    function page(n) {
      return MV.getJSON('https://api.jikan.moe/v4/seasons/now?sfw=true&page=' + n).then(function (j) {
        (j.data || []).forEach(function (a) {
          var names = [a.title, a.title_english, a.title_japanese].concat((a.titles || []).map(function (t) { return t.title; })).filter(Boolean);
          titles.push({ keys: names.map(titleKey).filter(Boolean), title: a.title_english || a.title, eps: a.episodes, score: a.score });
        });
        if (j.pagination && j.pagination.has_next_page && n < 4) return new Promise(function (r) { setTimeout(r, 450); }).then(function () { return page(n + 1); });
      });
    }
    page(1).then(function () { AIRING.list = titles; AIRING.ts = Date.now(); MV.save('airingNow', { ts: AIRING.ts, titles: titles }); })
      .catch(function (e) { AIRING.list = AIRING.list || []; AIRING.error = e.message; })
      .then(function () { AIRING.loading = false; if (view.name === 'anime') MV.rerender(); });
  }
  function airingMatches(items) {
    var idx = {};
    (AIRING.list || []).forEach(function (a) { a.keys.forEach(function (k) { idx[k] = a; }); });
    return items.filter(function (i) {
      var k = titleKey(i.name); if (idx[k]) return true;
      // "Nombre Temporada 2" / "Nombre 2nd Season": compara sin la parte de temporada
      var base = k.replace(/\b(temporada|season|part|parte|cour)\b.*$/, '').replace(/\b\d+(st|nd|rd|th)\b.*$/, '').trim();
      return base.length > 3 && !!idx[base];
    });
  }
  VIEWS.anime = function () {
    var items = S.items.filter(function (i) { return i.anime && i.type !== 'live'; });
    var modes = '<div class="chips filt" style="margin-bottom:10px"><span class="flabel">VER</span>' + [['all', 'Todo'], ['airing', 'En emisión'], ['year', 'Por año']].map(function (m) {
      return '<button class="chip f' + (animeMode === m[0] ? ' on' : '') + '" data-act="animeMode" data-arg="' + m[0] + '">' + m[1] + '</button>'; }).join('') + '</div>';
    if (animeMode === 'all' || !S.lists.length) {
      MV._fbarPre = [['all', 'Todo'], ['airing', 'En emisión'], ['year', 'Por año']].map(function (m) { return '<button class="fbtn f' + (animeMode === m[0] ? ' on' : '') + '" data-act="animeMode" data-arg="' + m[0] + '">' + m[1] + '</button>'; }).join('');
      return catalogView('anime', 'Anime', items);
    }
    var vis = MV.visible(items);
    if (animeMode === 'airing') {
      loadAiring();
      var head = top('Anime') + modes + '<p class="muted" style="margin:0 0 12px">Lo que se está emitiendo esta temporada (según MyAnimeList) y ya está en tus listas.</p>';
      if (!AIRING.list) return head + '<div class="panel glass" style="display:flex;gap:14px;align-items:center"><div class="spinner"></div><b>Revisando la temporada actual…</b></div>';
      var m = airingMatches(vis);
      if (!m.length) return head + '<div class="empty glass"><h2>Nada en emisión en tus listas</h2><p class="muted">' + (AIRING.error ? 'No se pudo consultar la temporada: ' + esc(AIRING.error) : 'Ninguno de los ' + AIRING.list.length + ' anime de esta temporada está en tus listas todavía.') + '</p></div>';
      return head + '<div class="fsum"><b>' + m.length + '</b> <span>en emisión</span></div>' + grid(m, 'poster', 'anime-air');
    }
    // Por año
    var by = {}; vis.forEach(function (i) { var y = itemYear(i) || 'Sin año'; (by[y] = by[y] || []).push(i); });
    var years = Object.keys(by).sort(function (a, b) { return a === 'Sin año' ? 1 : b === 'Sin año' ? -1 : b - a; });
    var chipsY = '<div class="chips filt"><span class="flabel">AÑO</span><button class="chip f' + (!animeYear ? ' on' : '') + '" data-act="animeYear" data-arg="">Todos</button>' +
      years.map(function (y) { return '<button class="chip f' + (animeYear === y ? ' on' : '') + '" data-act="animeYear" data-arg="' + esc(y) + '">' + esc(y) + ' <small>' + by[y].length + '</small></button>'; }).join('') + '</div>';
    var html = top('Anime') + modes + '<div class="filters glass">' + chipsY + '</div>';
    if (animeYear && by[animeYear]) return html + '<div class="fsum"><b>' + by[animeYear].length + '</b> <span>de ' + esc(animeYear) + '</span></div>' + grid(by[animeYear], 'poster', 'anime-y');
    var lim = rowLimit['anime-y'] || 14;
    years.slice(0, lim).forEach(function (y) {
      var list = by[y];
      html += '<section class="row"><h3>' + esc(y) + ' <small>' + list.length + '</small>' + (list.length > 20 ? '<button class="btn ghost sm rowall" data-act="animeYear" data-arg="' + esc(y) + '">Ver todo ›</button>' : '') + '</h3><div class="strip">' +
        list.slice(0, 20).map(function (it, i) { return card(it, 'poster', i); }).join('') +
        (list.length > 20 ? '<button class="card poster f seeall" data-act="animeYear" data-arg="' + esc(y) + '"><div class="th"><b>Ver todo ›</b><span>' + list.length + ' títulos</span></div></button>' : '') + '</div></section>';
    });
    if (years.length > lim) html += '<button class="btn ghost more f" data-act="moreRows" data-arg="anime-y">Ver más años (' + (years.length - lim) + ')</button>';
    return html;
  };
  VIEWS.kdrama = function () { return catalogView('kdrama', 'K-Drama', S.items.filter(function (i) { return i.kdrama && i.type !== 'live'; })); };
  /** Infantil (perfiles de adultos): películas y series para niños, sin anime. */
  VIEWS.infantil = function () {
    return catalogView('infantil', 'Infantil', S.items.filter(function (i) {
      if (i.type === 'live' || i.anime || i.adult || i.doc) return false;
      return !!(i.kids || (i.age != null && i.age <= 7 && i.learnedKids) || (i.animated && i.age != null && i.age <= 13));
    }));
  };
  /** Contenido +18 (solo desde Utilidades, con PIN). */
  function adultItems() { return MV.adultOk() ? S.items.filter(function (i) { return i.adult; }) : []; }
  VIEWS.adult = function () {
    if (!MV.adultOk()) return top('+18') + '<div class="empty glass"><h2>Contenido bloqueado</h2><p class="muted">Ábrelo desde Utilidades con el PIN.</p><div class="btns" style="justify-content:center"><button class="btn f" data-act="adultOpen" data-autofocus>Ingresar PIN</button></div></div>';
    var all = adultItems(), live = all.filter(function (i) { return i.type === 'live'; }), vod = all.filter(function (i) { return i.type !== 'live'; });
    var head = top('+18', '<button class="pill f" data-act="adultLock">' + IC.lock.replace('<svg', '<svg width="18" height="18"') + 'Bloquear</button>') +
      '<p class="muted" style="margin:0 0 12px">Se bloquea solo a los 30 minutos o al tocar Bloquear.</p>';
    if (!all.length) return head + '<div class="empty glass"><h2>No hay contenido +18 en tus listas</h2></div>';
    return head + (live.length ? '<h3 style="margin:8px 0">Canales <small class="muted">' + live.length + '</small></h3>' + grid(live, 'ch', 'adult-live') : '') +
      (vod.length ? '<h3 style="margin:18px 0 8px">Películas y series <small class="muted">' + vod.length + '</small></h3>' + grid(vod, 'poster', 'adult-vod') : '');
  };
  VIEWS.docs = function () { return catalogView('docs', 'Documentales', S.items.filter(function (i) { return i.doc && i.type !== 'live'; })); };

  // ---------- Ficha ----------
  VIEWS.detail = function (key) {
    var it = S.byKey[key] || MV.reg[key];
    if (!it) return top('Ficha') + '<p class="muted">Este contenido ya no está en tus listas.</p>';
    if (MV.isKids() && !MV.kidsOk(it)) return top('No disponible') + '<div class="empty glass"><h2>Esto no es para niños</h2><p class="muted">Pide a un adulto que cambie de perfil.</p><div class="btns" style="justify-content:center"><button class="btn f" data-act="nav" data-arg="kids" data-autofocus>Volver al inicio</button></div></div>';
    reg(it);
    var prog = MV.progressOf(it.key), fav = MV.isFav(it.key), img = MV.poster(it);
    var facts = [it.year, it.type === 'series' ? 'Serie' : 'Película', it.group, it.rating ? '★ ' + it.rating : ''].concat((it.genres || []).map(D.genreName)).filter(Boolean);
    return '<div class="detail"><div class="bd" id="bd"></div>' +
      '<div class="ps" style="--h:' + MV.hue(it.name) + '" id="ps">' + posterImg([img], it.name) + '</div>' +
      '<div class="info"><span class="badge" id="metaSrc">' + (it.ia ? 'DOMINIO PÚBLICO · INTERNET ARCHIVE' : 'BUSCANDO FICHA…') + '</span>' +
      '<h1 id="mtitle">' + esc(MV.cleanTitle(it.name) || it.name) + '</h1>' +
      '<div class="facts" id="facts">' + facts.map(function (f) { return '<span class="pill">' + esc(f) + '</span>'; }).join('') + '</div>' +
      '<p id="plot">' + esc(it.plot || '') + '</p><div class="muted" id="cast"></div>' +
      '<div class="btns">' + (it.type === 'series' ? '' :
        (prog ? '<button class="btn f" data-act="resume" data-key="' + esc(it.key) + '" data-autofocus>' + IC.play + 'Continuar · ' + MV.fmtDur(prog.pos) + '</button><button class="btn ghost f" data-act="play" data-key="' + esc(it.key) + '">Desde el inicio</button>'
          : '<button class="btn f" data-act="play" data-key="' + esc(it.key) + '" data-autofocus>' + IC.play + 'Reproducir</button>')) +
      '<button class="btn ghost f" data-act="fav" data-key="' + esc(it.key) + '">' + (fav ? IC.starFill : IC.star) + (fav ? 'En favoritos' : 'Favorito') + '</button>' +
      '<button class="btn ghost f" data-act="langMenu">Audio y subtítulos</button>' +
      '</div>' +
      (it.type === 'series' ? '<div id="eps" class="eps"><div class="spinner"></div></div>' : '') + '</div></div>' +
      '<div id="related">' + relatedHtml(it) + '</div>';
  };
  /** Relacionadas: misma saga, mismos géneros (de la ficha), misma categoría o plataforma y años cercanos. */
  function relatedOf(it) {
    var pool = MV.visible(it.type === 'series' ? S.series : S.movies);
    var g = it.genres || [], grp = catOf(it), y = +itemYear(it) || 0;
    var me = MV.norm(MV.cleanTitle(it.name)), w = me.split(' ').filter(function (x) { return x.length > 2; }).slice(0, 2).join(' ');
    var scored = [];
    pool.forEach(function (o) {
      if (o.key === it.key) return;
      var on = MV.norm(MV.cleanTitle(o.name)); if (on === me) return;
      var sc = 0;
      if (w.length > 4 && on.indexOf(w) === 0) sc += 8;                        // misma saga: "Toy Story", "Rápidos y furiosos"…
      var shared = (o.genres || []).filter(function (x) { return g.indexOf(x) >= 0; }).length; sc += shared * 3;
      if (grp && grp !== 'Otras' && catOf(o) === grp) sc += 2;
      if (it.platform && o.platform === it.platform) sc += 2;
      if (it.anime && o.anime) sc += 4; if (it.kdrama && o.kdrama) sc += 4; if (it.doc && o.doc) sc += 4;
      var oy = +itemYear(o) || 0; if (y && oy && Math.abs(oy - y) <= 3) sc += 1;
      if (+o.rating >= 7) sc += 0.5;
      if (sc >= 3) scored.push({ o: o, sc: sc + ((o.key.length * 7) % 10) / 100 });
    });
    return scored.sort(function (a, b) { return b.sc - a.sc; }).slice(0, 20).map(function (x) { return x.o; });
  }
  function relatedHtml(it) {
    var rel = relatedOf(it);
    return rel.length ? row(it.type === 'series' ? 'Series relacionadas' : 'Películas relacionadas', rel, 'poster') : '';
  }
  VIEWS.detail.after = function (key) {
    var it = S.byKey[key] || MV.reg[key]; if (!it) return;
    MV.meta(it).then(function (m) {
      var src = document.getElementById('metaSrc'); if (!src) return;
      if (!m) {
        src.textContent = it.ia ? 'DOMINIO PÚBLICO · INTERNET ARCHIVE' : (S.prefs.tmdbKey || it.anime ? 'SIN FICHA EN LÍNEA' : 'AGREGA TU CLAVE DE TMDB EN AJUSTES PARA VER SINOPSIS');
        return;
      }
      it._meta = m;
      src.textContent = 'FICHA: ' + m.source;
      // Con los géneros de la ficha, las relacionadas salen más precisas
      var rb = document.getElementById('related'); if (rb) rb.innerHTML = relatedHtml(it);
      document.getElementById('mtitle').textContent = m.title || it.name;
      if (m.overview) document.getElementById('plot').textContent = m.overview;
      var facts = [m.year, m.runtime, m.rating ? '★ ' + m.rating : ''].concat(m.genres || []).filter(Boolean);
      document.getElementById('facts').innerHTML = facts.map(function (f) { return '<span class="pill">' + esc(f) + '</span>'; }).join('');
      if (m.cast && m.cast.length) document.getElementById('cast').textContent = 'Reparto: ' + m.cast.join(', ');
      if (m.backdrop) document.getElementById('bd').style.backgroundImage = 'url("' + m.backdrop + '")';
      // Carátula: la elegida por ti, luego la de TMDB y luego la de la lista (si alguna no carga, pasa a la siguiente)
      if (!(P.covers && P.covers[it.key])) { var ps = document.getElementById('ps'); if (ps) ps.innerHTML = posterImg([m.poster, it.poster, m.posters && m.posters[0]], it.name); }
      if (m.poster && !it.poster) it.poster = m.poster;
    });
    if (it.type === 'series') {
      MV.loadEpisodes(it).then(function (eps) {
        var box = document.getElementById('eps'); if (!box) return;
        if (!eps.length) { box.innerHTML = '<p class="muted">No se encontraron episodios.</p>'; return; }
        eps.sort(function (a, b) { return a.season - b.season || a.ep - b.ep; });
        var seasons = {}; eps.forEach(function (e) { (seasons[e.season] = seasons[e.season] || []).push(e); });
        var html = '';
        Object.keys(seasons).forEach(function (s) {
          html += '<h3 style="margin:10px 0 4px">Temporada ' + s + '</h3>';
          seasons[s].forEach(function (e) {
            var k = it.key + '#' + e.season + 'x' + e.ep, pr = MV.progressOf(k);
            html += '<button class="ep f" data-act="playEp" data-key="' + esc(it.key) + '" data-arg="' + eps.indexOf(e) + '"><span class="badge">' + e.season + 'x' + e.ep + '</span><b>' + esc(e.title) + '</b>' + (pr ? '<span class="muted">' + Math.round(pr.pos / pr.dur * 100) + '%</span>' : '') + IC.play.replace('<svg', '<svg width="16" height="16"') + '</button>';
          });
        });
        box.innerHTML = html;
        MV.focusFirst(document.querySelector('.main'));
      }).catch(function (e) { var box = document.getElementById('eps'); if (box) box.innerHTML = '<p class="muted">' + esc(e.message) + '</p>'; });
    }
  };

  // ---------- Teclado en pantalla para TV (QWERTY compacto) ----------
  /** Teclado pequeño para el control remoto. "target" es el id de la caja de texto que escribe. */
  // Teclado en pantalla: se pliega al bajar a los resultados y vuelve al enfocar la caja de texto
  document.addEventListener('focusin', function (e) {
    var t = e.target, kb = document.querySelector('.kbd2'); if (!kb || !t) return;
    if (kb.contains(t)) return;
    if (t.id && t.id === kb.dataset.v) kb.classList.remove('fold');
    else kb.classList.add('fold');
  });
  function tvKbd(target, first) {
    var rows = ['1234567890', 'qwertyuiop', 'asdfghjklñ', 'zxcvbnm'];
    var k = function (c, n) { return '<button class="f"' + (first !== false && n === 'q' ? ' data-autofocus' : '') + ' data-act="kb" data-arg="' + esc(c) + '" data-v="' + target + '">' + esc(c.toUpperCase()) + '</button>'; };
    return '<div class="kbd2 glass" data-v="' + target + '">' + rows.map(function (r, ri) {
      return '<div class="kr">' + r.split('').map(function (c) { return k(c, c); }).join('') +
        (ri === 3 ? '<button class="f w2" data-act="kbDel" data-v="' + target + '" aria-label="Borrar letra">⌫</button>' : '') + '</div>';
    }).join('') +
      '<div class="kr"><button class="f w3" data-act="kbClear" data-v="' + target + '">Limpiar</button><button class="f w5" data-act="kb" data-arg=" " data-v="' + target + '">Espacio</button><button class="f w3 go" data-act="kbGo" data-v="' + target + '">Listo</button></div></div>';
  }
  /** Escribe en la caja indicada (el buscador general busca mientras escribes). */
  function kbSet(target, fn) {
    var i = document.getElementById(target); if (!i) return;
    i.value = fn(i.value || '');
    if (target === 'searchIn') { query = i.value; showResults(); }
    else if (target === 'ytmIn' || target === 'ytIn' || target === 'musicIn') { /* se busca con Listo */ }
  }

  // ---------- Buscar ----------
  var query = '';
  // ---------- Buscador: relevancia, tolerante a errores y por tipo ----------
  var SIDX = { size: -1, rows: [] }, searchType = 'all', SEARCH_LIM = 60;
  function searchIndex() {
    if (SIDX.size === S.items.length && SIDX.ref === S.items) return SIDX.rows;
    SIDX.rows = S.items.map(function (i) {
      var title = MV.norm(MV.cleanTitle(i.name) || i.name);
      return { it: i, title: title, words: title.split(' '), extra: MV.norm([i.name, i.group, i.year, (i.genres || []).map(D.genreName).join(' '), i.platform ? D.platformName(i.platform) : ''].join(' ')) };
    });
    SIDX.size = S.items.length; SIDX.ref = S.items;
    return SIDX.rows;
  }
  /** ¿Se parecen dos palabras con un error de tipeo? (una letra de más, de menos o cambiada) */
  function near(a, b) {
    // Distancia de edición ≤ 1 (incluye dos letras invertidas: "jhon" ↔ "john")
    if (a.length < 3 || Math.abs(a.length - b.length) > 1) return false;
    if (a === b) return true;
    var la = a.length, lb = b.length, prev2 = null, prev = [], cur;
    for (var j = 0; j <= lb; j++) prev[j] = j;
    for (var i = 1; i <= la; i++) {
      cur = [i]; var rowMin = i;
      for (var k = 1; k <= lb; k++) {
        var c = a[i - 1] === b[k - 1] ? 0 : 1;
        var v = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + c);
        if (prev2 && i > 1 && k > 1 && a[i - 1] === b[k - 2] && a[i - 2] === b[k - 1]) v = Math.min(v, prev2[k - 2] + 1);
        cur[k] = v; if (v < rowMin) rowMin = v;
      }
      if (rowMin > 1) return false;
      prev2 = prev; prev = cur;
    }
    return prev[lb] <= 1;
  }
  function scoreRow(r, q, qw) {
    var t = r.title, sc = 0;
    if (t === q) sc = 1000;
    else if (t.indexOf(q) === 0) sc = 700;
    else if ((' ' + t).indexOf(' ' + q) >= 0) sc = 500;
    else if (t.indexOf(q) >= 0) sc = 300;
    var all = true;
    for (var k = 0; k < qw.length; k++) {
      var w = qw[k], hit = 0;
      for (var m = 0; m < r.words.length; m++) {
        var rw = r.words[m];
        if (rw === w) { hit = 60; break; }
        if (rw.indexOf(w) === 0) hit = Math.max(hit, 45);
        else if (w.length >= 3 && hit < 25 && (near(w, rw) || (rw.length > w.length && (near(w, rw.slice(0, w.length)) || near(w, rw.slice(0, w.length + 1)))))) hit = 25;
        else if (rw.indexOf(w) >= 0) hit = Math.max(hit, 20);
      }
      if (!hit && r.extra.indexOf(w) >= 0) hit = 10;
      if (!hit) { all = false; break; }
      sc += hit;
    }
    if (!all && sc < 300) return 0;
    if (r.it.type !== 'live' && r.it.poster) sc += 3;
    return sc;
  }
  var STYPES = [['all', 'Todo'], ['live', 'Canales'], ['movie', 'Películas'], ['series', 'Series'], ['anime', 'Anime'], ['kdrama', 'K-Drama'], ['games', 'Juegos']];
  function typeOk(i, t) {
    if (t === 'all') return true;
    if (t === 'anime') return i.anime && i.type !== 'live';
    if (t === 'kdrama') return i.kdrama && i.type !== 'live';
    return i.type === t;
  }
  function recentSearches() { return MV.load('recentSearch', []); }
  function saveRecent(q) {
    q = String(q || '').trim(); if (q.length < 2) return;
    var r = recentSearches().filter(function (x) { return MV.norm(x) !== MV.norm(q); }); r.unshift(q);
    MV.save('recentSearch', r.slice(0, 8));
  }
  var saveRecentLater = MV.debounce(saveRecent, 2500);
  VIEWS.search = function () {
    var kb = MV.device.tv ? tvKbd('searchIn') : '';
    return top('Buscar') + '<div class="searchbar glass">' + IC.search + '<input class="in f" id="searchIn" value="' + esc(query) + '" placeholder="' + (MV.isKids() ? 'Busca tus dibujos, películas y canales…' : 'Título, canal, actor del título, género, año…') + '" autocomplete="off" enterkeyhint="search"' + (MV.device.tv ? ' inputmode="none"' : ' data-autofocus') + '>' +
      '<button class="iconbtn f" data-act="kbClear" aria-label="Borrar búsqueda">' + IC.close + '</button></div>' + kb +
      '<div class="chips" id="stypes"></div><div id="results"></div>';
  };
  VIEWS.search.after = function () {
    var inp = document.getElementById('searchIn');
    inp.addEventListener('input', MV.debounce(function () { query = inp.value; showResults(); saveRecentLater(query); }, 180));
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { saveRecent(query); var f = document.querySelector('#results .card, #results .f'); if (f) f.focus(); } });
    showResults();
  };
  function showResults() {
    var box = document.getElementById('results'), tbox = document.getElementById('stypes'); if (!box) return;
    var q = MV.norm(query);
    if (q.length < 2) {
      tbox.innerHTML = '';
      var rec = recentSearches();
      var gens = MV.genresOf(MV.visible(S.items.filter(function (i) { return i.type !== 'live'; }))).slice(0, 10);
      box.innerHTML = (rec.length ? '<section class="row"><h3>Búsquedas recientes <button class="btn ghost sm f" data-act="clearRecent" style="margin-left:8px">Borrar</button></h3><div class="chips">' + rec.map(function (r) { return '<button class="chip f" data-act="searchFor" data-arg="' + esc(r) + '">' + IC.history.replace('<svg', '<svg width="15" height="15"') + ' ' + esc(r) + '</button>'; }).join('') + '</div></section>' : '') +
        (gens.length ? '<section class="row"><h3>Explora por género</h3><div class="chips">' + gens.map(function (g) { return '<button class="chip f" data-act="searchFor" data-arg="' + esc(g.name) + '">' + esc(g.name) + ' <small>' + g.count + '</small></button>'; }).join('') + '</div></section>' : '') +
        '<p class="muted">Escribe al menos 2 letras. No importan las tildes ni las mayúsculas, y entiende pequeños errores de escritura.</p>';
      return;
    }
    var qw = q.split(' ').filter(Boolean), vis = {};
    MV.visible(S.items).forEach(function (i) { vis[i.key] = 1; });
    var scored = [];
    searchIndex().forEach(function (r) { if (!vis[r.it.key]) return; var sc = scoreRow(r, q, qw); if (sc > 0) scored.push({ it: r.it, sc: sc }); });
    scored.sort(function (a, b) { return b.sc - a.sc; });
    var roms = MV.isKids() ? [] : (MV.load('roms', []) || []).filter(isGame).filter(function (r) { var n = MV.norm(r.name); return qw.every(function (w) { return n.indexOf(w) >= 0 || n.split(' ').some(function (x) { return near(w, x); }); }); }).slice(0, 30);
    var counts = {}; STYPES.forEach(function (t) { counts[t[0]] = t[0] === 'games' ? roms.length : t[0] === 'all' ? scored.length + roms.length : scored.filter(function (x) { return typeOk(x.it, t[0]); }).length; });
    if (searchType !== 'all' && !counts[searchType]) searchType = 'all';
    tbox.innerHTML = STYPES.filter(function (t) { return t[0] === 'all' || counts[t[0]]; }).map(function (t) { return '<button class="chip f' + (searchType === t[0] ? ' on' : '') + '" data-act="stype" data-arg="' + t[0] + '">' + t[1] + ' <small>' + counts[t[0]] + '</small></button>'; }).join('');
    if (!scored.length && !roms.length) { box.innerHTML = '<div class="empty glass"><h2>Sin resultados para “' + esc(query) + '”</h2><p class="muted">Revisa la escritura o prueba con menos palabras.' + (P.tmdbKey ? ' También puedes buscarlo en Descubrir.' : '') + '</p></div>'; return; }
    var html = '';
    if (searchType === 'all') {
      var best = scored.filter(function (x) { return x.sc >= 700; }).slice(0, 12).map(function (x) { return x.it; });
      var live = scored.filter(function (x) { return x.it.type === 'live'; }).map(function (x) { return x.it; });
      var vod = scored.filter(function (x) { return x.it.type !== 'live'; }).map(function (x) { return x.it; });
      if (best.length && scored.length > best.length) html += row('Mejores coincidencias', best, best.every(function (b) { return b.type === 'live'; }) ? 'ch' : 'poster');
      if (live.length) html += row('Canales', live.slice(0, 30), 'ch', live.length + '');
      if (vod.length) html += row('Películas y series', vod.slice(0, 40), 'poster', vod.length + '');
      if (roms.length) html += '<section class="row"><h3>Juegos</h3><div class="strip">' + roms.slice(0, 12).map(function (r, i) { return romCard(r, i); }).join('') + '</div></section>';
    } else if (searchType === 'games') {
      html = '<div class="grid">' + roms.map(function (r, i) { return romCard(r, i); }).join('') + '</div>';
    } else {
      var items = scored.filter(function (x) { return typeOk(x.it, searchType); }).map(function (x) { return x.it; });
      html = grid(items, searchType === 'live' ? 'ch' : 'poster', 'search');
    }
    box.innerHTML = html;
  }
  MV.remoteText = function (v) {
    var el = document.activeElement;
    if (view.name !== 'search') { query = v; MV.go('search'); return; }
    var inp = document.getElementById('searchIn');
    if (el && el.tagName === 'INPUT' && el !== inp) { el.value = v; el.dispatchEvent(new Event('input')); return; }
    query = v; if (inp) inp.value = v; showResults();
  };

  // ---------- Favoritos e historial ----------
  VIEWS.favs = function () {
    var f = MV.favs().map(MV.resolve);
    return top('Favoritos') + (f.length ? grid(f, 'poster', 'favs') : '<div class="empty glass"><h2>Aún no tienes favoritos</h2><p class="muted">Abre un canal o película y toca “Favorito”, o presiona Menú en el control sobre cualquier tarjeta.</p></div>');
  };
  VIEWS.history = function () {
    var h = MV.pdata().history;
    if (!h.length) return top('Historial') + '<div class="empty glass"><h2>Tu historial está vacío</h2><p class="muted">Aquí verás lo último que reprodujiste en cualquiera de tus dispositivos.</p></div>';
    var groups = {};
    h.forEach(function (x) { var d = new Date(x.ts).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }); (groups[d] = groups[d] || []).push(x); });
    return top('Historial', '<button class="pill f" data-act="clearHistory">' + IC.trash.replace('<svg', '<svg width="18" height="18"') + 'Borrar historial</button>') +
      Object.keys(groups).map(function (d) {
        return '<section class="row"><h3>' + esc(d) + '</h3>' + groups[d].map(function (x) {
          var it = MV.resolve(x); reg(it);
          return '<div class="line"><div class="t"><b>' + esc(x.name) + '</b><span>' + MV.fmtTime(x.ts) + ' · ' + esc(x.device || '') + ' · ' + esc(x.group || '') + '</span></div><button class="btn sm f" data-act="' + (x.type === 'live' ? 'playLive' : 'play') + '" data-key="' + esc(x.key) + '">' + IC.play + 'Ver</button></div>';
        }).join('') + '</section>';
      }).join('');
  };

  // ---------- Infantil ----------
  var kidCat = 'all';
  VIEWS.kids = function () {
    var items = MV.visible(S.items);
    var cats = [['all', 'Todo', '#FF6900', '★'], ['live', 'Canales de TV', '#2F6FEB', 'TV'], ['movie', 'Películas', '#E0447C', '▶'], ['series', 'Series', '#14A38B', '◆']];
    var list = items.filter(function (i) { if (kidCat === 'live') return i.type === 'live'; if (i.type === 'live') return false; return kidCat === 'all' || i.type === kidCat; });
    var p = MV.profile() || {};
    return '<div class="top"><img src="' + esc(MV.avatarOf(p.avatar)) + '" alt="" style="width:58px;height:58px;border-radius:50%;background:#F3EFEA;box-shadow:0 0 0 4px var(--accent)"><div><h1>¡Hola, ' + esc(p.name || '') + '!</h1><span class="muted">¿Qué quieres ver hoy?</span></div><div class="sp"></div>' +
      '<span class="pill">Te quedan ' + MV.kidsLeft() + ' min</span><button class="pill f" data-act="kidsExit">' + IC.lock.replace('<svg', '<svg width="18" height="18"') + 'Salir</button></div>' +
      '<div class="kidcats">' + cats.map(function (c) { return '<button class="kidcat f' + (kidCat === c[0] ? ' on' : '') + '" data-act="kidCat" data-arg="' + c[0] + '"><span class="bub" style="background:' + c[2] + '">' + c[3] + '</span>' + c[1] + '</button>'; }).join('') + '</div>' +
      seasonBanner() + '<button class="kidsearch f" data-act="nav" data-arg="search">' + IC.search + '<span>Buscar dibujos, películas o canales</span></button>' +
      (!list.length ? '<div class="empty glass"><h2>' + (kidsChecking ? 'Buscando contenido para tu edad…' : 'Aún no hay contenido infantil') + '</h2><p class="muted">' + (kidsChecking ? 'Estamos revisando en TMDB qué películas y series son para niños (0 a 7 años, y animación hasta 13).' : 'Pide a un adulto que agregue canales infantiles en Ajustes › Listas (hay una lista gratuita de canales para niños).') + '</p></div>'
        : kidCat === 'all' ? kidsRows(items) : grid(list, kidCat === 'live' ? 'ch' : 'poster', 'kids'));
  };
  /** "Todo" en filas: lo que estaba viendo, canales, películas, series y anime. */
  function kidsRows(items) {
    var cont = (MV.continueList ? MV.continueList() : []).filter(function (i) { return MV.kidsOk(i); });
    var live = items.filter(function (i) { return i.type === 'live'; });
    var mov = items.filter(function (i) { return i.type === 'movie' && !i.anime; });
    var ser = items.filter(function (i) { return i.type === 'series' && !i.anime; });

    var r = function (t, arr, kind) { return arr.length ? row(t, arr.slice(0, 24), kind, arr.length + '') : ''; };
    return r('Seguir viendo', cont, 'poster') + r('Canales infantiles', live, 'ch') + r('Películas', mov, 'poster') + r('Series', ser, 'poster') +
      (kidsChecking ? '<p class="muted" style="margin-top:8px">Buscando más películas y series para tu edad…</p>' : '') +
      (!P.tmdbKey ? '<p class="muted" style="margin-top:8px">Para mostrar películas y series hace falta la clave de TMDB (la configura un adulto).</p>' : '');
  }
  /** Revisa en segundo plano la edad recomendada (TMDB / MyAnimeList) para dejar solo lo apto para niños. */
  var kidsChecked = {}, kidsChecking = false;
  function kidsVerify() {
    if (kidsChecking || !MV.isKids()) return;
    var todo = S.items.filter(function (i) {
      return i.type !== 'live' && !i.anime && i.age == null && !kidsChecked[i.key] && !i.adult &&
        (i.kids || i.platform === 'disney' || (i.genres || []).indexOf('infantil') >= 0) && P.tmdbKey;
    }).slice(0, 400);
    if (!todo.length) return;
    kidsChecking = true;
    if (view.name === 'kids') MV.rerender();
    var n = 0, changed = 0;
    (function next() {
      if (!MV.isKids() || n >= todo.length) {
        kidsChecking = false;
        if (view.name === 'kids') MV.rerender();
        return;
      }
      var it = todo[n++]; kidsChecked[it.key] = 1;
      var before = MV.kidsOk(it);
      MV.meta(it).then(function () {
        if (MV.kidsOk(it) !== before) changed++;
        if (changed >= 8 && view.name === 'kids') { changed = 0; MV.rerender(); }
        setTimeout(next, 120);
      });
    })();
  }
  VIEWS.kids.after = function () { setTimeout(kidsVerify, 800); };

  // ---------- Juegos y ports ----------
  var sysSel = 'all', gameGenre = '';
  function romGenres(r) { var s = romSystem(r); var g = D.classifyGenres(r.name, D.GAME_GENRES); if (s && s.port && g.indexOf('disparos') < 0 && /doom|quake|wolf/.test(s.id)) g.push('disparos'); if (s && s.id === 'cave' && g.indexOf('aventura') < 0) g.push('aventura'); return g; }
  /** ¿Es de verdad un juego? Descarta APK, documentos (README.md), listas .m3u y .zip/.iso que no son de juegos. */
  var ROM_DIR = /\/(roms?|juegos|games|emuladore?s?|emulators?|emulation|retro\w*|arcade|mame|fbneo|fba|neogeo|cps\d?|snes|nes|sfc|genesis|megadrive|mega drive|gba|gbc|gb|n64|nds|psx|ps1|playstation|sega|nintendo|atari|pce|ports?|doom|quake)\//i;
  function isGame(r) {
    var name = String(r.name || ''), low = name.toLowerCase(), path = String(r.path || '').toLowerCase(), size = +r.size || 0, ext = r.ext;
    if (/\.apk|\.xapk|\.apks/i.test(low) || /\/android\/(data|obb)\//.test(path)) return false;
    if (/^(readme|license|licence|changelog|copying|authors|contributing|notice|history|install)\b/i.test(low)) return false;
    var mine = path.indexOf('/co.mivibra.tv/') >= 0 || ROM_DIR.test(path + '/');
    if (ext === 'zip') return mine;                                 // .zip solo en carpetas de juegos (roms, arcade…)
    if (ext === 'm3u') return /psx|ps1|playstation/.test(path);      // .m3u también son listas de TV
    if (ext === 'iso') return size > 30e6 && (mine || /psx|ps1|playstation/.test(path));
    if (ext === 'exe' || ext === 'pak') return true;                 // ya filtrados por nombre (Doukutsu.exe, pak0.pak)
    if (['md', 'gen', 'smd', '32x'].indexOf(ext) >= 0 && size && size < 65536) return false; // un .md de 5 KB es un documento
    if (size && size < 1024) return false;
    return true;
  }
  MV.isGame = isGame;
  function romSystem(r) {
    var ov = P.romSystem[r.path]; if (ov) return D.SYSTEMS.find(function (s) { return s.id === ov; });
    var name = (r.name || '').toLowerCase(), path = (r.path || '').toLowerCase();
    if (r.ext === 'zip') return /arcade|mame|fbneo|fba|neogeo|cps/.test(path) ? D.SYSTEMS.find(function (s) { return s.id === 'arcade'; }) : null;
    return D.SYSTEMS.find(function (s) { return s.exts.indexOf(r.ext) >= 0 && (!s.match || s.match.test(name)); }) || null;
  }
  function romCard(r, i) {
    var s = romSystem(r); var k = 'rom:' + r.path; MV.reg[k] = { key: k, rom: r, name: r.name, type: 'rom' };
    return '<button class="card wide f" style="--h:' + (s ? s.color : '#6B7280') + ';animation-delay:' + Math.min(i, 12) * 0.04 + 's" data-act="playRom" data-key="' + esc(k) + '"><div class="th"><span class="mono">' + esc(s ? s.mono : '?') + '</span><span class="tag">' + esc(s ? s.name : 'Elegir sistema') + '</span></div><div class="meta"><b>' + esc(r.name.replace(/\.[^.]+$/, '')) + '</b><span>' + esc(r.path.split('/').slice(-2, -1)[0] || '') + '</span></div></button>';
  }
  VIEWS.games = function () {
    var roms = (MV.load('roms', []) || []).filter(function (r) { return !r.ext || r.ext !== 'exe' || /doukutsu\.exe$/i.test(r.name); }).filter(function (r) { return r.ext !== 'pak' || /^pak0\.pak$/i.test(r.name); }).filter(isGame);
    var counts = {}; roms.forEach(function (r) { var s = romSystem(r); var id = s ? s.id : 'unknown'; counts[id] = (counts[id] || 0) + 1; });
    var bySys = roms.filter(function (r) { var s = romSystem(r); if (sysSel === 'all') return true; if (sysSel === 'ports') return s && s.port; return s && s.id === sysSel; });
    var gcount = {}; bySys.forEach(function (r) { romGenres(r).forEach(function (g) { gcount[g] = (gcount[g] || 0) + 1; }); });
    var ggList = D.GAME_GENRES.filter(function (g) { return gcount[g.id]; }).map(function (g) { return { id: g.id, name: g.name, count: gcount[g.id] }; });
    var shown = gameGenre ? bySys.filter(function (r) { return romGenres(r).indexOf(gameGenre) >= 0; }) : bySys;
    var recent = (MV.load('recentGames', []) || []).filter(function (r) { return roms.some(function (x) { return x.path === r.path; }); });
    var access = A ? A.hasStorageAccess() : true;
    var pads = A ? JSON.parse(A.gamepads()) : [];
    return top('Juegos', '<button class="pill f" data-act="remoteQR">' + IC.phone.replace('<svg', '<svg width="18" height="18"') + 'Celular como mando</button>') +
      (!access ? '<div class="banner glass"><div class="t"><b>Permite el acceso a la memoria, USB y discos duros</b><br><span class="muted">Así MiVibra TV encuentra tus ROMs en cualquier unidad conectada.</span></div><button class="btn f" data-act="storageAccess">Permitir acceso</button></div>' : '') +
      '<div class="btns" style="margin-bottom:16px"><button class="btn f" data-act="scanRoms">' + IC.refresh + 'Buscar juegos</button><button class="btn ghost f" data-act="romRoots">' + IC.usb + 'Carpetas y unidades</button><button class="btn ghost f" data-act="romDownload">' + IC.download + 'Descargar desde enlace</button><button class="btn ghost f" data-act="importBios">Importar BIOS</button></div>' +
      '<p class="muted" style="margin:-6px 0 14px">' + (pads.length ? 'Mandos conectados: ' + pads.map(function (p) { return esc(p.name); }).join(', ') : 'Sin mandos físicos conectados. Usa un mando Bluetooth/USB o tu celular.') + '</p>' +
      chips([{ name: 'all', label: 'Todo' }, { name: 'ports', label: 'Ports' }].concat(D.SYSTEMS.map(function (s) { return { name: s.id, label: s.name }; })).map(function (s) { return s.name; }), sysSel, 'sysSel')
        .replace(/data-arg="([^"]+)">([^<]+)</g, function (m, id) {
          var label = id === 'all' ? 'Todo' : id === 'ports' ? 'Ports' : D.SYSTEMS.find(function (s) { return s.id === id; }).name;
          var n = id === 'all' ? roms.length : id === 'ports' ? D.SYSTEMS.filter(function (s) { return s.port; }).reduce(function (a, s) { return a + (counts[s.id] || 0); }, 0) : (counts[id] || 0);
          return 'data-arg="' + id + '">' + label + ' <small>' + n + '</small><';
        }) +
      genreChips(ggList, gameGenre, 'games', 'gameGenre') +
      (sysSel === 'ports' ? '<div class="panel glass"><h2>Ports</h2><p>Juegos de PC que corren con motores libres: Doom (archivos .wad), Quake (pak0.pak), Wolfenstein 3D (.wl6) y Cave Story (Doukutsu.exe). Usa tus propios archivos del juego o empieza con Freedoom, que es libre y gratuito.</p><button class="btn f" data-act="getFreedoom">' + IC.download + 'Descargar Freedoom</button></div>' : '') +
      (recent.length && sysSel === 'all' ? '<section class="row"><h3>Jugados recientemente</h3><div class="strip">' + recent.slice(0, 12).map(function (r, i) { return romCard(r, i); }).join('') + '</div></section>' : '') +
      (shown.length ? '<div class="pgrid">' + shown.slice(0, limits.games || 120).map(function (r, i) { return romCard(r, i % 12); }).join('') + '</div>' +
        (shown.length > (limits.games || 120) ? '<button class="btn ghost more f" data-act="more" data-arg="games">Ver más</button>' : '')
        : '<div class="empty glass"><h2>' + (roms.length ? 'No hay juegos de este sistema' : 'Aún no hay juegos') + '</h2><p class="muted">Conecta una USB o disco duro con tus ROMs (o cópialas a la memoria) y toca “Buscar juegos”. Los emuladores se descargan solos la primera vez que juegas cada sistema.</p></div>');
  };

  // ---------- Ajustes ----------
  var setTab = 'lists';
  VIEWS.settings = function (tab) {
    if (tab) setTab = tab;
    var tabs = [['lists', 'Listas'], ['profiles', 'Perfiles'], ['look', 'Temas'], ['playback', 'Reproducción'], ['parental', 'Control parental y +18'], ['remote', 'Mando con celular'], ['sync', 'Sincronización'], ['meta', 'Sinopsis y carátulas'], ['about', 'Acerca de']];
    if (!MV.acct.managed()) tabs.splice(1, 0, ['menu', 'Menú']);
    if (MV.acct.managed()) {
      tabs = tabs.map(function (t) { return t[0] === 'sync' ? ['account', 'Cuenta'] : t; });
      if (MV.acct.isAdmin()) tabs.splice(1, 0, ['users', 'Usuarios'], ['menu', 'Menú']);
      // Las listas solo las ve y maneja el superadministrador
      else { tabs = tabs.filter(function (t) { return t[0] !== 'lists' && t[0] !== 'meta'; }); if (setTab === 'lists' || setTab === 'users' || setTab === 'meta') setTab = 'profiles'; }
      if (setTab === 'sync') setTab = 'account';
    }
    var html = top('Ajustes') + '<div class="chips">' + tabs.map(function (t) { return '<button class="chip f' + (setTab === t[0] ? ' on' : '') + '" data-act="setTab" data-arg="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';
    return html + (SETTINGS[setTab] || SETTINGS.lists)();
  };
  var SETTINGS = {};
  VIEWS.settings.after = function () { var x = SETTINGS[setTab]; if (x && x.after) x.after(); };
  function dupesPanel() {
    var d = S.dupes || {};
    var txt = !MV.native ? 'Disponible en la app instalada.' : d.running ? 'Probando señales… ' + d.done + ' de ' + d.total :
      d.total ? d.total + ' canales repetidos revisados · se dejó la señal que funciona' + (d.fixed ? ' (' + d.fixed + ' cambiadas)' : '') : 'No hay canales repetidos entre tus listas.';
    return '<div class="panel glass"><h2>Canales repetidos</h2><p>Si un canal está en varias listas, la app prueba todas sus señales y se queda con la que responde más rápido. Las que no funcionan se descartan; las demás quedan de respaldo por si la principal se cae.</p>' +
      '<div class="line"><div class="t"><b id="dupesTxt">' + esc(txt) + '</b><span>Se vuelve a revisar cada 6 horas</span></div><button class="btn ghost sm f" data-act="checkDupes"' + (d.running ? ' disabled' : '') + '>' + IC.refresh + 'Verificar ahora</button></div></div>';
  }
  SETTINGS.lists = function () {
    if (!MV.acct.canEdit()) {
      return '<div class="panel glass"><h2>Listas</h2><p>Las listas y claves las administra ' + esc((window.MV_CONFIG || {}).admin ? 'el superadministrador' : 'el administrador') + '. Se cargan solas en este equipo.</p>' +
        (S.lists.length ? S.lists.map(function (l) { return '<div class="line"><div class="t"><b>' + esc(l.name) + '</b><span>' + (l.type === 'xtream' ? 'Xtream Codes' : l.type === 'stalker' ? 'Portal MAC' : 'Lista M3U') + ' · ' + (l.count || 0) + ' elementos</span></div></div>'; }).join('') : '<p class="muted">Aún no hay listas.</p>') +
        '<div class="btns" style="margin-top:14px"><button class="btn ghost f" data-act="reloadAll">' + IC.refresh + 'Actualizar todo</button></div></div>' + dupesPanel();
    }
    var share = '';
    if (MV.acct.isAdmin()) {
      var cl = ((MV.acct.config || {}).lists || []).length, mineN = S.lists.filter(function (l) { return l.type !== 'file'; }).length;
      share = '<div class="panel glass"><h2>Compartidas con tus usuarios</h2>' +
        '<div class="line"><div class="t"><b>' + (MV.acct.pushing ? 'Enviando…' : MV.acct.pushError ? 'No se pudo enviar' : cl === mineN ? '✓ ' + cl + (cl === 1 ? ' lista en la nube' : ' listas en la nube') : 'En la nube hay ' + cl + ' de ' + mineN + ' listas') + '</b><span>' + esc(MV.acct.pushError || (MV.acct.pushedAt ? 'Último envío: ' + MV.fmtTime(MV.acct.pushedAt) : 'Tus usuarios reciben estas listas, las claves y el orden del menú')) + '</span></div>' +
        '<button class="btn sm f" data-act="pushNow">' + IC.refresh + 'Enviar a todos ahora</button></div></div>';
    }
    return share + '<div class="panel glass"><h2>Tus listas</h2><p>Todo el contenido de tus listas se combina: los canales repetidos aparecen una sola vez y se queda la señal que funciona.' + (MV.acct.isAdmin() ? ' <b>Eres superadministrador:</b> lo que cambies aquí llega a todos los usuarios (las listas en archivo solo quedan en este equipo; usa enlaces para compartirlas).' : '') + '</p>' +
      (S.lists.length ? S.lists.map(function (l) {
        return '<div class="line"><div class="t"><b>' + esc(l.name) + '</b><span>' + (l.type === 'xtream' ? 'Xtream Codes · ' + esc(l.host) : l.type === 'stalker' ? 'Portal MAC · ' + esc(l.mac) + ((l.macs || []).length > 1 ? ' (+' + (l.macs.length - 1) + ' de respaldo)' : '') : l.type === 'file' ? 'Archivo' : esc(l.url)) + ' · ' + (l.count || 0) + ' elementos' + ((S.hiddenDupes || {})[l.id] ? ' · ' + S.hiddenDupes[l.id] + ' repetidos ocultos' : '') + (l.epg ? ' · con guía' : '') + (l.error ? ' · ' + esc(l.error) : '') + '</span></div>' +
          '<button class="toggle f' + (l.enabled !== false ? ' on' : '') + '" data-act="listToggle" data-arg="' + l.id + '" aria-label="Activar lista"></button>' +
          '<button class="iconbtn f" data-act="listEpg" data-arg="' + l.id + '" aria-label="Guía EPG">' + IC.guide + '</button>' +
          '<button class="iconbtn f" data-act="listDelete" data-arg="' + l.id + '" aria-label="Eliminar">' + IC.trash + '</button></div>';
      }).join('') : '<p class="muted">No has agregado listas.</p>') +
      '<div class="line"><div class="t"><b>Ocultar contenido repetido</b><span>Si una película, serie o canal está en varias listas (aunque se llame distinto, como "Animales" y "Animals"), se muestra una sola vez con la versión de mejor calidad: 4K, luego Full HD, HD y SD; latino primero. Las otras quedan de respaldo por si la principal falla.</span></div><button class="toggle f' + (P.dedupe !== false ? ' on' : '') + '" data-act="dedupeToggle" aria-label="Ocultar repetidos"></button></div>' +
      '<div class="btns" style="margin-top:14px"><button class="btn f" data-act="addList">' + IC.plus + 'Agregar lista</button><button class="btn ghost f" data-act="presets">Canales gratis</button><button class="btn ghost f" data-act="reloadAll">' + IC.refresh + 'Actualizar todo</button></div></div>' + dupesPanel();
  };
  SETTINGS.menu = function () {
    var all = allNavItems().filter(function (n) { return n[0] !== 'home' && n[0] !== 'settings'; });
    var hidden = P.navHidden || [];
    var visible = navOrderIds(), off = all.filter(function (n) { return visible.indexOf(n[0]) < 0; }).map(function (n) { return n[0]; });
    var ids = visible.concat(off), byId = {}; all.forEach(function (n) { byId[n[0]] = n; });
    return '<div class="panel glass"><h2>Orden del menú</h2><p>Elige qué botón va después de Inicio y en qué orden' + (MV.acct.managed() ? '. Se aplica para todos los usuarios.' : '.') + ' Inicio va siempre primero. Ajustes está arriba, en el botón del perfil.</p>' +
      '<div class="line"><div class="t"><b>1. Inicio</b><span>Fijo</span></div></div>' +
      ids.map(function (id, i) {
        var n = byId[id], hid = hidden.indexOf(id) >= 0;
        return '<div class="line navline' + (hid ? ' off' : '') + '" data-fid="nav-' + id + '"><span class="navic">' + n[2] + '</span><div class="t"><b>' + (hid ? '' : (i + 2) + '. ') + esc(n[1]) + '</b><span>' + (hid ? 'Oculto' : 'Visible') + '</span></div>' +
          '<button class="iconbtn f" data-act="navMove" data-arg="' + id + ':-1" aria-label="Subir"' + (i === 0 || hid ? ' disabled' : '') + '>▲</button>' +
          '<button class="iconbtn f" data-act="navMove" data-arg="' + id + ':1" aria-label="Bajar"' + (i >= visible.length - 1 || hid ? ' disabled' : '') + '>▼</button>' +
          '<button class="toggle f' + (hid ? '' : ' on') + '" data-act="navToggle" data-arg="' + id + '" aria-label="Mostrar"></button></div>';
      }).join('') +
      '<div class="line"><div class="t"><b>Ajustes</b><span>Arriba, en el botón del perfil</span></div></div>' +
      '<div class="btns" style="margin-top:12px"><button class="btn ghost f" data-act="navReset">Restablecer el orden original</button></div></div>';
  };
  SETTINGS.users = function () {
    var cfg = MV.acct.config || {}, list = cfg.allowed || [];
    return '<div class="panel glass"><h2>Usuarios</h2><p>Quienes estén en esta lista entran con su cuenta de Google y ven todo tu contenido ya cargado. No pueden cambiar listas ni claves.</p>' +
      '<div class="line"><div class="t"><b>Cualquier cuenta de Google puede entrar</b><span>Si lo activas, no hace falta agregar correos (cualquiera con la app vería tus listas)</span></div><button class="toggle f' + (cfg.open ? ' on' : '') + '" data-act="acctOpen"></button></div>' +
      (list.length ? list.map(function (e) { return '<div class="line"><div class="t"><b>' + esc(e) + '</b><span>Usuario</span></div><button class="iconbtn f" data-act="acctRevoke" data-arg="' + esc(e) + '" aria-label="Quitar">' + IC.trash + '</button></div>'; }).join('') : '<p class="muted">Aún no has agregado usuarios.</p>') +
      '<label class="field">Correo de Gmail del nuevo usuario<input class="in f" id="acctMail" type="email" autocomplete="off" placeholder="nombre@gmail.com"></label><div class="btns"><button class="btn f" data-act="acctAllow">' + IC.plus + 'Agregar usuario</button></div></div>';
  };
  SETTINGS.account = function () {
    var u = MV.acct.user();
    return '<div class="panel glass"><h2>Cuenta</h2>' +
      (u ? '<div class="line"><div class="t"><b>' + esc(u.email || '') + '</b><span>' + (MV.acct.isAdmin() ? 'Superadministrador · puedes cambiar listas, claves y usuarios' : 'Usuario · el contenido lo administra el superadministrador') + '</span></div><button class="btn ghost sm f" data-act="loginOut">Cerrar sesión</button></div>' +
        '<p>Perfiles, favoritos, historial y “continuar viendo” se sincronizan con esta cuenta en la TV, el celular y la tablet.</p>' +
        '<div class="line"><div class="t"><b>Nombre de este dispositivo</b></div><button class="btn ghost sm f" data-act="deviceName">' + esc(P.deviceName) + '</button><button class="btn sm f" data-act="syncNow">Sincronizar ahora</button></div>'
        : '<p>No has iniciado sesión.</p>') + '</div>';
  };
  SETTINGS.profiles = function () {
    return '<div class="panel glass"><h2>Perfiles</h2>' + S.profiles.map(function (p) {
      return '<div class="line"><img src="' + esc(MV.avatarOf(p.avatar)) + '" alt="" style="width:44px;height:44px;border-radius:14px;background:#F3EFEA"><div class="t"><b>' + esc(p.name) + '</b><span>' + (p.kids ? 'Infantil · ' : '') + (p.pin ? 'Con PIN' : 'Sin PIN') + '</span></div><button class="btn ghost sm f" data-act="editProfile" data-arg="' + p.id + '">Editar</button></div>';
    }).join('') + '<div class="btns" style="margin-top:12px"><button class="btn f" data-act="go" data-arg="profileEdit">' + IC.plus + 'Nuevo perfil</button></div></div>';
  };
  SETTINGS.look = function () {
    var ss = D.seasonFor(new Date());
    return '<div class="panel glass"><h2>Tutorial</h2><div class="line"><div class="t"><b>Volver a ver el tutorial</b><span>Explica de nuevo cada botón la próxima vez que entres a cada sección</span></div><button class="btn sm f" data-act="tourAgain">Ver de nuevo</button></div></div>' +
      '<div class="panel glass"><h2>Temas por celebración</h2>' +
      '<div class="line"><div class="t"><b>Cambiar el tema solo en fechas especiales</b><span>Halloween, Navidad, Amor y Amistad, Día de la Madre, del Padre, del Niño, 20 de julio, Año Nuevo…' + (ss ? ' Hoy: ' + esc(ss.name) + ' ' + ss.deco[0] : '') + '</span></div><button class="toggle f' + (P.autoTheme !== false ? ' on' : '') + '" data-act="prefToggle" data-arg="autoTheme"></button></div></div>' +
      '<div class="panel glass"><h2>Tema</h2>' + (ss && P.autoTheme !== false ? '<p class="muted">Ahora se ve el tema de ' + esc(ss.name) + '; el que elijas aquí vuelve cuando termine la celebración.</p>' : '') + '<div class="themes">' + D.THEMES.map(function (t) {
      return '<button class="theme f' + (P.theme === t.id ? ' on' : '') + '" data-act="theme" data-arg="' + t.id + '"><i style="background:linear-gradient(135deg,' + t.a + ',' + t.b + ')"></i>' + t.name + '</button>';
    }).join('') + '</div></div><div class="panel glass"><h2>Efecto vidrio y animaciones</h2>' +
      '<div class="line"><div class="t"><b>Intensidad del vidrio</b></div><div class="seg">' + [['low', 'Suave'], ['mid', 'Media'], ['high', 'Intensa']].map(function (g) { return '<button class="chip f' + (P.glass === g[0] ? ' on' : '') + '" data-act="glass" data-arg="' + g[0] + '">' + g[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="line"><div class="t"><b>Animaciones y transiciones</b><span>Apágalas en TV box lentos</span></div><button class="toggle f' + (P.anim !== false ? ' on' : '') + '" data-act="prefToggle" data-arg="anim"></button></div>' +
      '<div class="line"><div class="t"><b>Fondo con luces en movimiento</b></div><button class="toggle f' + (P.bgAnim !== false ? ' on' : '') + '" data-act="prefToggle" data-arg="bgAnim"></button></div></div>';
  };
  SETTINGS.playback = function () {
    var langs = [['es', 'Español'], ['en', 'Inglés'], ['pt', 'Portugués'], ['ja', 'Japonés'], ['ko', 'Coreano']];
    return '<div class="panel glass"><h2>Idioma y subtítulos</h2><p>El reproductor elige estas pistas cuando el contenido las trae. Durante la reproducción puedes cambiarlas con el botón de subtítulos y el de ajustes.</p>' +
      '<div class="line"><div class="t"><b>Audio preferido</b></div><div class="seg">' + langs.map(function (l) { return '<button class="chip f' + (P.audioLang === l[0] ? ' on' : '') + '" data-act="pref" data-arg="audioLang:' + l[0] + '">' + l[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="line"><div class="t"><b>Subtítulos</b></div><div class="seg">' + [['', 'Desactivados']].concat(langs).map(function (l) { return '<button class="chip f' + (P.subLang === l[0] ? ' on' : '') + '" data-act="pref" data-arg="subLang:' + l[0] + '">' + l[1] + '</button>'; }).join('') + '</div></div></div>' +
      '<div class="panel glass"><h2>Xtream Codes</h2><div class="line"><div class="t"><b>Formato de los canales</b><span>Si un canal no carga, prueba el otro formato</span></div><div class="seg">' + [['m3u8', 'HLS (m3u8)'], ['ts', 'MPEG-TS (ts)']].map(function (f) { return '<button class="chip f' + (P.xtFormat === f[0] ? ' on' : '') + '" data-act="pref" data-arg="xtFormat:' + f[0] + '">' + f[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="line"><div class="t"><b>Nombre de este dispositivo</b><span>Se muestra en “Continúa donde lo dejaste”</span></div><button class="btn ghost sm f" data-act="deviceName">' + esc(P.deviceName) + '</button></div></div>';
  };
  SETTINGS.parental = function () {
    var a = P.adult;
    return '<div class="panel glass"><h2>PIN de control parental</h2><p>Se pide para salir de un perfil infantil o darle más tiempo.</p><div class="btns"><button class="btn f" data-act="setParentPin">' + (P.parentPin ? 'Cambiar PIN' : 'Crear PIN') + '</button></div>' +
      '<div class="line"><div class="t"><b>Tiempo diario para perfiles infantiles</b></div><div class="seg">' + [30, 60, 90, 120, 0].map(function (m) { return '<button class="chip f' + (+P.kidsLimit === m ? ' on' : '') + '" data-act="pref" data-arg="kidsLimit:' + m + '">' + (m ? m + ' min' : 'Sin límite') + '</button>'; }).join('') + '</div></div></div>' +
      '<div class="panel glass"><h2>Contenido +18</h2><p>Las categorías para adultos de tus listas nunca aparecen en las secciones normales. Están solo en Utilidades › +18, se abren con el PIN, nunca en perfiles infantiles, y se bloquean solas a los 30 minutos.</p>' +
      (a ? '<div class="line"><div class="t"><b>Usuario: ' + esc(a.user) + '</b><span>' + (MV.adultOk() ? 'Desbloqueado' : 'Bloqueado') + '</span></div><button class="btn f sm" data-act="adultToggle">' + (MV.adultOk() ? 'Bloquear ahora' : 'Desbloquear') + '</button><button class="btn danger sm f" data-act="adultDelete">Eliminar</button></div>'
        : '<label class="field">Usuario<input class="in f" id="adUser" autocomplete="off"></label><label class="field">Contraseña (mínimo 8)<input class="in f" id="adPass" type="password"></label><label class="field">PIN rápido para el control (4 dígitos)<input class="in f" id="adPin" type="password" inputmode="numeric" maxlength="4"></label><button class="btn f" data-act="adultCreate">Crear usuario protegido</button>') + '</div>';
  };
  SETTINGS.remote = function () {
    return '<div class="panel glass"><h2>Usa tu celular como control o mando</h2><p>Conecta el celular a la misma red Wi-Fi que este equipo y escanea el código. Funciona como control remoto, teclado para el buscador y mando de juego con joysticks (cada celular es un jugador).</p><div id="qrBox" style="display:flex;gap:24px;align-items:center;flex-wrap:wrap"><div class="spinner"></div></div></div>';
  };
  SETTINGS.remote.after = function () { showQR(document.getElementById('qrBox')); };
  SETTINGS.sync = function () {
    var u = MV.sync.user;
    return '<div class="panel glass"><h2>Sincronización entre dispositivos</h2><p>Perfiles, favoritos, historial, “continuar viendo” y tus listas se guardan en tu propio proyecto de Firebase (gratis) para seguir viendo desde la TV, el celular o la tablet.</p>' +
      (u ? '<div class="line"><div class="t"><b>Conectado como ' + esc(u.email) + '</b><span>Este dispositivo: ' + esc(P.deviceName) + '</span></div><button class="btn sm f" data-act="syncNow">Sincronizar ahora</button><button class="btn ghost sm f" data-act="syncOut">Cerrar sesión</button></div>' +
        '<div class="line"><div class="t"><b>Sincronizar también las listas</b><span>Incluye enlaces y cuentas Xtream</span></div><button class="toggle f' + (P.syncLists ? ' on' : '') + '" data-act="prefToggle" data-arg="syncLists"></button></div>'
        : '<label class="field">Configuración de Firebase (pega el objeto firebaseConfig de tu proyecto)<textarea class="in f" id="fbCfg" placeholder="{ apiKey: &quot;…&quot;, authDomain: &quot;…&quot;, projectId: &quot;…&quot;, appId: &quot;…&quot; }">' + esc(P.firebase || '') + '</textarea></label>' +
        '<label class="field">Correo<input class="in f" id="fbMail" type="email" autocomplete="off"></label><label class="field">Contraseña<input class="in f" id="fbPass" type="password"></label>' +
        '<button class="btn f" data-act="syncIn">' + IC.cloud + 'Iniciar sesión o crear cuenta</button><p style="margin-top:12px;font-size:13px">En Firebase activa Authentication (correo y contraseña) y Firestore. Usa la misma cuenta en todos tus dispositivos.</p>') + '</div>';
  };
  SETTINGS.meta = function () {
    return '<div class="panel glass"><h2>Sinopsis y carátulas automáticas</h2><p>Para películas y series se usa TMDB (gratis para uso personal; crea tu clave en themoviedb.org › Ajustes › API). Para anime se usa MyAnimeList a través de Jikan, sin clave.</p>' +
      (MV.acct.canEdit() ? '<label class="field">Clave de TMDB (API Key o token de lectura)' + (MV.acct.isAdmin() ? ' · se comparte con todos los usuarios' : '') + '<input class="in f" id="tmdbKey" value="' + esc(P.tmdbKey || '') + '" autocomplete="off"></label><div class="btns"><button class="btn f" data-act="saveTmdb">Guardar</button><button class="btn ghost f" data-act="clearMeta">Volver a buscar todas las fichas</button></div>'
        : '<div class="line"><div class="t"><b>' + (P.tmdbKey ? 'Clave configurada por el administrador' : 'El administrador aún no ha puesto la clave') + '</b></div><button class="btn ghost sm f" data-act="clearMeta">Volver a buscar las fichas</button></div>') +
      '<p style="margin-top:14px;font-size:12px">Este producto usa la API de TMDB pero no está respaldado ni certificado por TMDB.</p></div>' +
      '<div class="panel glass"><h2>Subtítulos externos</h2><p>Con una clave gratuita de subdl.com (crea tu cuenta y copia tu API Key en tu panel) el reproductor busca subtítulos en español para cada película o episodio, desde el menú Audio y subtítulos.</p>' +
      (MV.acct.canEdit() ? '<label class="field">Clave de SubDL' + (MV.acct.isAdmin() ? ' · se comparte con todos los usuarios' : '') + '<input class="in f" id="subKey" value="' + esc(P.subKey || '') + '" autocomplete="off"></label><div class="btns"><button class="btn f" data-act="saveSubKey">Guardar</button></div>'
        : '<div class="line"><div class="t"><b>' + (P.subKey ? 'Clave configurada por el administrador' : 'El administrador aún no ha puesto la clave') + '</b></div></div>') + '</div>' +
      '<div class="panel glass"><h2>YouTube dentro de la app</h2><p>Con una clave gratuita de la API de YouTube (Google Cloud › APIs y servicios › YouTube Data API v3) puedes buscar y ver videos sin salir de MiVibra TV. El cupo gratis alcanza para unas 100 búsquedas al día entre todos los usuarios; las tendencias casi no gastan cupo.</p>' +
      (MV.acct.canEdit() ? '<label class="field">Clave de la API de YouTube' + (MV.acct.isAdmin() ? ' · se comparte con todos los usuarios' : '') + '<input class="in f" id="ytKey" value="' + esc(P.ytKey || '') + '" autocomplete="off" placeholder="AIza…"></label><div class="btns"><button class="btn f" data-act="saveYtKey">Guardar</button></div>'
        : '<div class="line"><div class="t"><b>' + (P.ytKey ? 'Clave configurada por el administrador' : 'El administrador aún no ha puesto la clave') + '</b></div></div>') + '</div>' +
      (function () {
        var k = P.streamKeys || {}, fld = function (id, label, v) { return '<label class="field">' + label + '<input class="in f" id="' + id + '" value="' + esc(v || '') + '" autocomplete="off"></label>'; };
        return '<div class="panel glass"><h2>Canales en vivo de Twitch y Kick</h2><p>Para ver la lista de canales que están transmitiendo ahora, registra una aplicación gratis: en dev.twitch.tv › Console › Register Your Application (URL de redirección: http://localhost), y en kick.com › Ajustes › Developer › Crear aplicación. Copia aquí el Client ID y el Client Secret de cada una.' + (MV.acct.isAdmin() ? ' Se comparten con todos los usuarios.' : '') + '</p>' +
          (MV.acct.canEdit() ? fld('twId', 'Twitch · Client ID', k.twitchId) + fld('twSec', 'Twitch · Client Secret', k.twitchSecret) + fld('kkId', 'Kick · Client ID', k.kickId) + fld('kkSec', 'Kick · Client Secret', k.kickSecret) + '<div class="btns"><button class="btn f" data-act="saveStreamKeys">Guardar</button></div>'
            : '<div class="line"><div class="t"><b>' + (k.twitchId || k.kickId ? 'Configurado por el administrador' : 'El administrador aún no lo ha configurado') + '</b></div></div>') + '</div>';
      })();
  };
  SETTINGS.about = function () {
    return '<div class="panel glass"><h2>MiVibra TV</h2><p>Versión ' + esc(MV.device.version || '') + ' · ' + esc(MV.device.model || '') + '</p>' +
      '<div class="line"><div class="t"><b>Versión instalada: ' + esc(MV.device.versionCode || '—') + '</b><span>' + (MV.latestVersion ? (MV.latestVersion > (MV.device.versionCode || 0) ? 'Hay una versión nueva: ' + MV.latestVersion : 'Estás al día (última publicada: ' + MV.latestVersion + ')') : 'Toca Buscar para comparar con la última publicada') + '</span></div>' +
      '<button class="btn f" data-act="checkUpdate">' + IC.refresh + (MV.pendingUpdate ? 'Actualizar ahora' : 'Buscar actualizaciones') + '</button></div>' +
      '<p>Reproductor de listas IPTV para Android TV, celular y tablet. MiVibra TV no incluye ni vende contenido: reproduce las listas que tú agregas y canales gratuitos públicos.</p>' +
      '<h3>Licencias y créditos</h3><p style="font-size:13px;line-height:1.6">Código de MiVibra TV: GPL-3.0 · Emulación: LibretroDroid y núcleos libretro (GPL; algunos núcleos solo permiten uso no comercial) · Avatares: alohe/avatars (MIT) · Reproductor: AndroidX Media3 (Apache 2.0) · Servidor del mando: NanoHTTPD (BSD) · Código QR: qrcode-generator (MIT) · Canales gratis: Free-TV/IPTV e iptv-org · Fichas: TMDB y MyAnimeList (Jikan) · Cine clásico: Internet Archive · Freedoom (BSD).</p>' +
      '<p style="font-size:12px">Este producto usa la API de TMDB pero no está respaldado ni certificado por TMDB.</p></div>';
  };

  // ---------- Celular como mando (QR) ----------
  var remoteClients = 0;
  function showQR(box) {
    if (!box) return;
    if (!A) { box.innerHTML = '<p class="muted">Disponible en la app instalada.</p>'; return; }
    var r = JSON.parse(A.remoteStart());
    if (!r.ok || !r.url) { box.innerHTML = '<p>Conecta este equipo a una red Wi-Fi para usar el celular como mando.</p>'; return; }
    var qr = window.qrcode(0, 'M'); qr.addData(r.url); qr.make();
    box.innerHTML = '<div class="qr">' + qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true }) + '</div><div><p style="margin:0 0 6px">O abre en el navegador del celular:</p><h2 style="font:800 26px var(--brand);margin:0 0 10px">' + esc(r.url.replace(/^http:\/\//, '').replace(/\/$/, '')) + '</h2><p class="muted" id="remoteCount">' + countText(remoteClients) + '</p></div>';
  }
  function countText(n) { return n ? n + (n === 1 ? ' celular conectado' : ' celulares conectados') : 'Esperando celulares…'; }
  MV.onRemoteClients = function (n, names) {
    if (n > remoteClients) MV.toast((names[n - 1] || 'Celular') + ' conectado como mando');
    remoteClients = n;
    var el = document.getElementById('remoteCount'); if (el) el.textContent = countText(n);
  };

  // ---------- Reproducción ----------
  var playing = null, replaced = null;
  /** Datos para buscar subtítulos externos de una película o episodio. */
  function subInfo(it, season, ep) {
    var m = it._meta || {};
    return { sTitle: MV.cleanTitle(it.name), sYear: String(it.year || m.year || ''), sTmdb: m.tmdbId || '', sImdb: m.imdb || '', sKind: it.type === 'series' || season ? 'tv' : 'movie', sSeason: season || 0, sEpisode: ep || 0 };
  }
  function q(it, extra) {
    var nn = it.type === 'live' ? MV.nowNext(it) : {};
    return Object.assign({ id: it.key, url: it.url, title: it.name, subtitle: nn.now ? nn.now.t : (it.group || ''), num: it.num || '', ua: it.ua || '', ref: it.ref || '', alts: it.alts || [], poster: it.type === 'live' ? '' : MV.poster(it), logo: it.type === 'live' ? (it.logo || '') : '', cn: it.type === 'live' && it.country ? D.countryName(it.country) : '', sp: it.type === 'live' && (D.RX.sports.test(it.group || '') || /\b(espn|fox sports|tyc|dsports|directv sports|win sports|bein|gol ?tv|tudn|claro sports|sky sports|eurosport|dazn|nba|nfl|f1)\b/i.test(it.name || '')), fav: MV.isFav(it.key), private: !!it.adult, stk: it.stk || null }, it.type === 'live' ? {} : subInfo(it), extra || {});
  }
  function launch(req, ctx) {
    if (!ctx.hinted && A && !(ctx.item && ctx.item.type === 'rom')) { ctx.hinted = true; return playerHint(!!req.live, function () { launch(req, ctx); }); }
    stopHeroPreview();
    if (MV.isKids() && +P.kidsLimit > 0 && MV.kidsLeft() <= 0) { kidsTimeUp(); return; }
    if (MV.audio && MV.audio.current() && !ctx.noRecord) MV.audio.stop();
    // Si había otro video abierto (por ejemplo en la ventana flotante), se cierra y su avance se guarda aparte
    if (playing) replaced = playing;
    playing = Object.assign({ started: Date.now() }, ctx);
    req.audioLang = P.audioLang; req.subLang = P.subLang; req.subKey = P.subKey || '';
    if (A) A.play(JSON.stringify(req));
    else { window.open(req.queue[req.index || 0].url, '_blank'); MV.onPlayerClosed({ id: ctx.item.key, position: 0, duration: 0, live: !!req.live }); }
  }
  MV.playItem = function (it, resume) {
    if (!it) return;
    if (it.type === 'series') { MV.go('detail', it.key); return; }
    if (it.type === 'rom') { playRom(it.rom); return; }
    if (it.type === 'live') {
      // En el reproductor van todos los canales (con su país y si son de deportes) para la lista lateral
      var list = it.adult ? adultItems().filter(function (i) { return i.type === 'live'; }) : MV.visible(S.live);
      var idx = Math.max(0, list.indexOf(it)), from = Math.max(0, Math.min(idx - 1500, list.length - 3000)), slice = list.slice(from, from + 3000);
      // Recientes para la lista de canales del reproductor
      var recent = (MV.pdata().history || []).filter(function (h) { return h.type === 'live'; }).slice(0, 30).map(function (h) { return h.key; });
      launch({ queue: slice.map(function (c) { return q(c); }), index: slice.indexOf(it) < 0 ? 0 : slice.indexOf(it), live: true, recent: recent }, { item: it, list: slice });
      return;
    }
    var prog = resume ? MV.progressOf(it.key) : null;
    var go = function (url) { launch({ queue: [q(it, { url: url })], index: 0, live: false, startMs: prog ? prog.pos : 0 }, { item: it }); };
    if (it.ia) { MV.toast('Preparando película…'); MV.archiveUrl(it).then(go).catch(function (e) { MV.toast(e.message); }); }
    else if (it.url) go(it.url);
    else MV.toast('Este contenido ya no está disponible en tus listas');
  };
  MV.playEpisode = function (series, i, resume) {
    var eps = series.episodes || []; var e = eps[i]; if (!e) return;
    var poster = MV.poster(series);
    var queue = eps.slice(i).map(function (x) { return Object.assign({ id: series.key + '#' + x.season + 'x' + x.ep, url: x.url, title: series.name, subtitle: 'T' + x.season + ' E' + x.ep + ' · ' + x.title, ua: x.ua || '', ref: x.ref || '', poster: poster, stk: x.stk || null }, subInfo(series, x.season, x.ep)); });
    var k = series.key + '#' + e.season + 'x' + e.ep, prog = resume !== false ? MV.progressOf(k) : null;
    launch({ queue: queue, index: 0, live: false, startMs: prog ? prog.pos : 0 }, { item: series, episodes: eps, start: i });
  };
  /** Desde "Continuar viendo" del inicio de Android TV: sigue donde iba (espera a que cargue el catálogo). */
  MV.openFromHome = function (id, tries, detail) {
    tries = tries || 0;
    var base = String(id).split('#')[0], it = S.byKey[base] || (MV.reg && MV.reg[base]);
    if (!it || !MV.profile()) { if (tries < 60) setTimeout(function () { MV.openFromHome(id, tries + 1, detail); }, 500); return; }
    if (MV.isKids() && !MV.kidsOk(it)) return;
    if (detail) { MV.go('detail', it.key); return; }
    var m = String(id).match(/#(\d+)x(\d+)$/);
    if (it.type === 'series' && m) {
      MV.loadEpisodes(it).then(function (eps) {
        eps.sort(function (a, b) { return a.season - b.season || a.ep - b.ep; });
        it.episodes = eps;
        var i = eps.findIndex(function (e) { return +e.season === +m[1] && +e.ep === +m[2]; });
        if (i >= 0) MV.playEpisode(it, i, true); else MV.go('detail', it.key);
      }).catch(function () { MV.go('detail', it.key); });
      return;
    }
    MV.playItem(it, true);
  };
  MV.onPlayerClosed = function (r) {
    var ctx;
    // Favoritos marcados desde el reproductor
    if (r && r.favToggles && r.favToggles.length) r.favToggles.forEach(function (id) {
      var it = S.byKey[id] || (MV.reg && MV.reg[id]) || (id.indexOf('#') > 0 ? S.byKey[id.split('#')[0]] : null);
      if (it) MV.toggleFav(it);
    });
    if (r && r.replaced) { ctx = replaced; replaced = null; if (!ctx) return; }
    else { if (!playing) return; ctx = playing; playing = null; }
    var mins = Math.round((Date.now() - ctx.started) / 60000);
    if (mins > 0) MV.addKidsMinutes(mins);
    if (ctx.noRecord) { MV.rerender(); return; }
    if (ctx.list && r.index != null && ctx.list[r.index]) { MV.recordPlay(ctx.list[r.index], r); }
    else if (ctx.episodes) {
      var e = ctx.episodes[ctx.start + (r.index || 0)];
      if (e) MV.recordPlay({ key: ctx.item.key + '#' + e.season + 'x' + e.ep, type: 'episode', name: ctx.item.name + ' · T' + e.season + ' E' + e.ep, poster: MV.poster(ctx.item), url: e.url, group: ctx.item.group, parent: ctx.item.key }, r);
      MV.recordPlay(ctx.item, null);
    } else MV.recordPlay(ctx.item, r);
    if (r.live && ctx.list && ctx.list[r.index]) { var ch = ctx.list[r.index]; var el = document.querySelector('[data-key="' + ch.key.replace(/"/g, '\\"') + '"]'); }
    MV.rerender();
  };

  // ---------- Juegos: abrir ROM ----------
  function playRom(r) {
    var s = romSystem(r);
    if (!s) { chooseSystem(r); return; }
    var start = function () {
      MV.call('playGame', [JSON.stringify({ rom: r.path, core: s.core, title: r.name, shader: P.shader })]).then(function () {
        var rec = (MV.load('recentGames', []) || []).filter(function (x) { return x.path !== r.path; });
        rec.unshift(r); MV.save('recentGames', rec.slice(0, 30));
      }).catch(function (e) { MV.toast(e.message, 4000); });
    };
    if (!A) { MV.toast('Los juegos funcionan en la app instalada'); return; }
    if (A.coreInstalled(s.core)) { start(); return; }
    var dlg = MV.modal('<h2>Preparando ' + esc(s.name) + '</h2><p>Descargando el emulador (solo la primera vez)…</p><div class="bar"><i id="coreBar"></i></div><p class="muted" id="corePct">0%</p>');
    MV.call('downloadCore', [s.core, s.src || ''], function (pct) {
      var b = document.getElementById('coreBar'), t = document.getElementById('corePct');
      if (b && pct >= 0) b.style.width = pct + '%'; if (t) t.textContent = pct >= 0 ? pct + '%' : 'Descargando…';
    }).then(function () { MV.closeModal(true); start(); }).catch(function (e) { MV.closeModal(true); MV.toast(e.message, 5000); });
  }
  function chooseSystem(r) {
    MV._romPending = r;
    MV.modal('<h2>¿De qué sistema es “' + esc(r.name) + '”?</h2><p class="muted">Los .zip pueden ser de varios sistemas. Lo recordaremos para la próxima vez.</p><div class="sys">' +
      D.SYSTEMS.map(function (s) { return '<button class="sysb f" data-act="romSys" data-arg="' + s.id + '"><i style="background:' + s.color + '">' + s.mono + '</i><b>' + s.name + '</b></button>'; }).join('') + '</div>');
  }

  // ---------- Diálogos ----------
  function pinPad(title, onDone) {
    var pin = '';
    MV._pin = function (d) {
      if (d === 'del') pin = pin.slice(0, -1); else if (d === 'x') { MV.closeModal(); return; } else if (pin.length < 4) pin += d;
      var dots = document.getElementById('pinDots'); if (dots) dots.innerHTML = [0, 1, 2, 3].map(function (i) { return '<i class="' + (i < pin.length ? 'on' : '') + '"></i>'; }).join('');
      if (pin.length === 4) {
        var v = pin; pin = '';
        MV.sha256(v).then(function (h) {
          if (onDone(h, v)) return;
          var dd = document.getElementById('pinDots'); if (dd) { dd.classList.add('shake'); setTimeout(function () { dd.classList.remove('shake'); MV._pin('none'); }, 420); }
        });
      }
    };
    MV.modal('<h2 style="text-align:center">' + esc(title) + '</h2><div class="dots" id="pinDots"><i></i><i></i><i></i><i></i></div><div class="pinpad">' +
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'x', '0', 'del'].map(function (k) { return '<button class="f" data-act="pin" data-arg="' + k + '"' + (k === '5' ? ' data-autofocus' : '') + '>' + (k === 'x' ? '✕' : k === 'del' ? '⌫' : k) + '</button>'; }).join('') + '</div>');
  }
  function askParentPin() {
    return new Promise(function (res) {
      if (!P.parentPin) { res(true); return; }
      pinPad('PIN de control parental', function (h) { if (h === P.parentPin) { MV.closeModal(true); res(true); return true; } return false; });
    });
  }
  function kidsTimeUp() {
    MV.modal('<h2>¡Se acabó el tiempo por hoy!</h2><p>Pide a un adulto que ingrese el PIN para darte 30 minutos más.</p><div class="btns"><button class="btn f" data-act="kidsMore" data-autofocus>Más tiempo (PIN)</button><button class="btn ghost f" data-act="go" data-arg="profiles">Cambiar de perfil</button></div>');
  }
  function addListDialog(tab) {
    tab = tab || 'url';
    var tabs = [['url', 'Enlace M3U'], ['multi', 'Varias (.txt)'], ['file', 'Archivo'], ['xtream', 'Xtream Codes'], ['stalker', 'Portal y MAC']];
    var body = tab === 'multi'
      ? '<p>Pega tus direcciones (una por línea) o elige tu archivo .txt. Puedes poner un nombre antes de cada una: <code>Mi lista, https://…</code>. Los enlaces de Xtream (get.php?username=…) se agregan como cuenta Xtream con películas y series. También acepta cuentas de <b>Portal y MAC</b> (la URL del portal y debajo sus MAC).</p>' +
        '<label class="field">Direcciones<textarea class="in f" id="lMulti" rows="6" placeholder="https://…/lista1.m3u&#10;Deportes, https://…/lista2.m3u" data-autofocus></textarea></label><p class="muted" id="lMultiCount" style="font-size:13px;margin:-4px 0 8px"></p>' +
        '<label class="line" id="lMacOpt" hidden style="cursor:pointer"><input type="checkbox" class="f" id="lMacBk" style="width:22px;height:22px;accent-color:var(--accent)"><div class="t"><b>Las MAC de un mismo portal tienen el mismo contenido</b><span>Márcalo solo si son copias de la misma suscripción: se agrega una lista por portal y las otras MAC quedan de respaldo. Si cada MAC trae contenido distinto, déjalo sin marcar.</span></div></label>'
      : tab === 'stalker'
      ? '<label class="field">Nombre<input class="in f" id="lName" placeholder="Mi proveedor" data-autofocus></label><label class="field">URL del portal<input class="in f" id="lPortal" placeholder="http://servidor:puerto/c/" autocomplete="off" inputmode="url"></label><label class="field">Dirección MAC<input class="in f" id="lMac" placeholder="00:1A:79:XX:XX:XX" autocomplete="off" style="text-transform:uppercase"></label><p class="muted" style="font-size:13px;margin:-4px 0 8px">Copia la URL y la MAC tal como te las envió tu proveedor (tipo MAG / Stalker). Cargar películas y series del portal puede tardar uno o dos minutos la primera vez.</p><div class="btns" style="margin:0 0 8px"><button class="btn ghost sm f" data-act="listTab" data-arg="multi">¿Tienes varias en un .txt? Impórtalas aquí</button></div><p id="lErr" style="color:#FF8A80;font-size:14px;margin:0 0 8px"></p>'
      : tab === 'xtream'
      ? '<label class="field">Nombre<input class="in f" id="lName" placeholder="Mi proveedor" data-autofocus></label><label class="field">Servidor<input class="in f" id="lHost" placeholder="http://servidor:puerto" autocomplete="off"></label><label class="field">Usuario<input class="in f" id="lUser" autocomplete="off"></label><label class="field">Contraseña<input class="in f" id="lPass" type="password"></label><p class="muted" style="font-size:13px;margin:-4px 0 8px">Servidor: solo la dirección y el puerto, por ejemplo http://servidor.com:8080</p><p id="lErr" style="color:#FF8A80;font-size:14px;margin:0 0 8px"></p>'
      : tab === 'file'
        ? '<label class="field">Nombre<input class="in f" id="lName" placeholder="Lista descargada" data-autofocus></label><p>Elige un archivo .m3u del dispositivo, una USB o el administrador de archivos.</p>'
        : '<label class="field">Nombre<input class="in f" id="lName" placeholder="Mi lista" data-autofocus></label><label class="field">Enlace de la lista M3U / M3U8<input class="in f" id="lUrl" placeholder="https://…/lista.m3u" autocomplete="off" inputmode="url"></label><label class="field">Guía EPG XMLTV (opcional)<input class="in f" id="lEpg" placeholder="https://…/guia.xml" autocomplete="off" inputmode="url"></label>';
    MV.modal('<h2>Agregar lista</h2><div class="chips">' + tabs.map(function (t) { return '<button class="chip f' + (t[0] === tab ? ' on' : '') + '" data-act="listTab" data-arg="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' + body +
      '<div class="btns"><button class="btn f" data-act="listSave" data-arg="' + tab + '">' + (tab === 'xtream' || tab === 'stalker' ? 'Iniciar sesión' : tab === 'file' ? 'Elegir archivo' : tab === 'multi' ? 'Importar' : 'Cargar lista') + '</button>' + (tab === 'multi' ? '<button class="btn ghost f" data-act="multiPick">Elegir archivo .txt</button>' : '') + '<button class="btn ghost f" data-act="confirmNo">Cancelar</button></div>',
      { onOpen: function (root) { var ta = root.querySelector('#lMulti'); if (ta) ta.addEventListener('input', multiCount); var cb = root.querySelector('#lMacBk'); if (cb) cb.addEventListener('change', multiCount); } });
  }

  /** Muestra la pestaña "Varias" con el texto del archivo elegido (si al volver del selector la ventana se cerró, se vuelve a abrir). */
  function multiWith(txt) {
    var ta = document.getElementById('lMulti');
    if (!ta) { while (MV.modalOpen()) MV.closeModal(true); addListDialog('multi'); ta = document.getElementById('lMulti'); }
    if (!ta) return;
    ta.value = String(txt || '').replace(/\u0000/g, '').replace(/^\uFEFF/, '');
    multiCount();
    var n = document.getElementById('lMultiCount');
    if (n && !n.textContent) n.textContent = 'No encontré direcciones de listas ni cuentas de Portal y MAC en el archivo.';
    var go = document.querySelector('#modal [data-act="listSave"]'); if (go) go.focus();
  }
  MV.multiWith = multiWith;
  function multiCount() {
    var ta = document.getElementById('lMulti'), el = document.getElementById('lMultiCount'); if (!ta || !el) return;
    var bk = !!(document.getElementById('lMacBk') || {}).checked, mc = MV.parseMacList(ta.value, bk);
    var box = document.getElementById('lMacOpt'); if (box) box.hidden = !mc.length;
    if (mc.length) {
      var nm = mc.reduce(function (a, g) { return a + g.macs.length; }, 0);
      el.textContent = mc.groups + (mc.groups === 1 ? ' portal' : ' portales') + ' con ' + nm + ' MAC' + (nm === 1 ? '' : 's') + ' → se agregarán ' + mc.length + (mc.length === 1 ? ' lista' : ' listas') + (bk ? ' (las demás MAC de respaldo)' : ' (una por MAC)');
      return;
    }
    var r = MV.parseUrlList(ta.value);
    el.textContent = r === null ? 'Esto es una lista M3U: usa la pestaña Archivo o Enlace M3U.' : r.length ? r.length + (r.length === 1 ? ' dirección encontrada' : ' direcciones encontradas') + ' (' + r.filter(function (x) { return x.type === 'xtream'; }).length + ' Xtream)' : '';
  }
  function importMany(arr) {
    if (!arr || !arr.length) { MV.toast('No encontré direcciones http:// o https://'); return; }
    MV.closeModal(true);
    MV.modal('<h2>Importando listas</h2><div style="height:8px;border-radius:8px;background:var(--glass-strong);overflow:hidden;margin:14px 0"><i id="impFill" style="display:block;height:100%;width:0;background:var(--accent);transition:width .3s"></i></div><p class="muted" id="impTxt">Preparando ' + arr.length + ' listas…</p>');
    // Detalle de lo que se está cargando ahora (páginas de películas del portal, etc.) y opción de seguir en segundo plano
    var box = document.querySelector('#modal .dialog');
    if (box) box.insertAdjacentHTML('beforeend', '<p class="muted" id="impSub" style="font-size:13px;margin:-6px 0 12px"></p><div class="btns"><button class="btn ghost f" data-act="closeModal" data-autofocus>Seguir en segundo plano</button></div>');
    var subT = setInterval(function () { var x = document.getElementById('impSub'); if (!x) return; x.textContent = S.loadMsg || ''; }, 600);
    MV.addLists(arr, function (n, total, name) {
      var f = document.getElementById('impFill'), t = document.getElementById('impTxt');
      if (f) f.style.width = Math.round(n / total * 100) + '%';
      if (t) t.textContent = 'Listas listas: ' + n + ' de ' + total + ' · última: ' + name;
    }).then(function (r) {
      clearInterval(subT);
      if (document.getElementById('impFill')) MV.closeModal(true);
      MV.toast(r.added + ' listas agregadas' + (r.skipped ? ' · ' + r.skipped + ' ya estaban' : '') + (r.failed.length ? ' · ' + r.failed.length + ' no cargaron' : ''), 5000);
      MV.rerender();
    }).catch(function (e) { clearInterval(subT); if (document.getElementById('impFill')) MV.closeModal(true); MV.toast(e.message, 4000); MV.rerender(); });
  }

  // ---------- Acciones ----------
  var ACT = {
    multiPick: function () {
      MV.call('pickFile', []).then(function (d) { return fetch(d.path).then(function (r) { return r.text(); }); }).then(function (txt) {
        multiWith(txt);
      }).catch(function (e) { if (e.message !== 'cancel') MV.toast(e.message === 'nopicker' ? 'Este equipo no tiene selector de archivos. Pega el texto.' : e.message); });
    },
    nav: function (a) { stack = []; MV.go(a, null, { replace: true }); },
    /** Botón del perfil arriba: Ajustes, cambiar de perfil y cuenta. */
    profMenu: function () {
      var p = MV.profile() || {}, u = MV.acct && MV.acct.user ? MV.acct.user() : null;
      MV.modal('<div style="display:flex;gap:14px;align-items:center;margin-bottom:14px"><img class="avatar" src="' + esc(MV.avatarOf(p.avatar)) + '" alt="" style="width:54px;height:54px;border-radius:50%"><div><h2 style="margin:0">' + esc(p.name || 'Perfil') + '</h2>' + (u && u.email ? '<span class="muted" style="font-size:13px">' + esc(u.email) + '</span>' : '') + '</div></div>' +
        '<div class="menulist">' +
        '<button class="line f" data-act="go" data-arg="settings" data-autofocus>' + IC.settings + '<div class="t"><b>Ajustes</b><span>Tema, reproducción, listas, cuenta…</span></div></button>' +
        '<button class="line f" data-act="go" data-arg="profiles">' + IC.user + '<div class="t"><b>Cambiar de perfil</b><span>Elige otro perfil de esta cuenta</span></div></button>' +
        (u ? '<button class="line f" data-act="loginOut">' + IC.lock + '<div class="t"><b>Cerrar sesión</b><span>Salir de ' + esc(u.email || 'tu cuenta') + ' en este equipo</span></div></button>' : '') +
        '</div><div class="btns"><button class="btn ghost f" data-act="closeModal">Cerrar</button></div>');
    },
    hintGo: function () { MV.closeModal(); },
    dedupeToggle: function () { P.dedupe = P.dedupe === false; MV.savePrefs(); MV.toast(P.dedupe ? 'Mostrando solo la mejor versión de cada título' : 'Mostrando todas las versiones'); MV.reloadCatalog(false).then(MV.rerender); },
    tourAgain: function () { MV.tourReset(); MV.toast('Listo: el tutorial aparecerá otra vez en cada sección'); MV.go('home'); },
    go: function (a) { MV.closeModal(true); if (a === 'profileEdit') { editSel = null; pendingName = null; } MV.go(a); },
    more: function (k) { limits[k] = (limits[k] || (k === 'live' ? 150 : k === 'games' ? 120 : k === 'music' ? 200 : 60)) + (k === 'live' ? 150 : k === 'music' ? 200 : 60); keepPlace(); },
    open: function (_, el) { var it = S.byKey[el.dataset.key] || MV.reg[el.dataset.key]; if (!it) return;
      if (it.type === 'tmdb') {
        var mine = it.have && S.byKey[it.have];
        if (!mine) { tmdbInfo(it); return; }
        if (!it.haveUnsure) { MV.go('detail', it.have); return; }
        // Tu lista no dice el año: confirma con TMDB que sea la misma película antes de abrirla
        MV.toast('Verificando que sea la misma versión…');
        MV.meta(mine).then(function (m) {
          if (m && m.tmdbId && String(m.tmdbId) === String(it.id)) { it.haveUnsure = false; MV.go('detail', it.have); }
          else { it.have = ''; it.other = mine.key; it.otherYear = (m && m.year) || ''; tmdbInfo(it); MV.rerender(); }
        });
        return;
      }
      if (it.type === 'live' || it.type === 'rom') MV.playItem(it); else MV.go('detail', it.key); },
    play: function (_, el) { MV.playItem(S.byKey[el.dataset.key] || MV.reg[el.dataset.key], false); },
    resume: function (_, el) {
      var k = el.dataset.key, it = S.byKey[k] || MV.reg[k];
      if (it && it.type === 'episode' && it.parent) { var s = S.byKey[it.parent]; if (s) { MV.loadEpisodes(s).then(function (eps) { var m = k.split('#')[1].split('x'); var i = eps.findIndex(function (e) { return e.season === +m[0] && e.ep === +m[1]; }); MV.playEpisode(s, Math.max(0, i), true); }); return; } }
      MV.playItem(it, true);
    },
    playLive: function (_, el) { MV.playItem(S.byKey[el.dataset.key] || MV.reg[el.dataset.key]); },
    playEp: function (i, el) { var s = S.byKey[el.dataset.key] || MV.reg[el.dataset.key]; MV.playEpisode(s, +i); },
    fav: function (_, el) { var it = S.byKey[el.dataset.key] || MV.reg[el.dataset.key]; var on = MV.toggleFav(it); MV.toast(on ? 'Agregado a favoritos' : 'Quitado de favoritos'); MV.rerender(); },
    covers: function (_, el) {
      var it = S.byKey[el.dataset.key] || MV.reg[el.dataset.key]; var m = it && it._meta; if (!m) return;
      MV._coverItem = it;
      MV.modal('<h2>Elige la carátula</h2><div class="covers">' + m.posters.map(function (p) { return '<button class="card poster f" style="width:auto" data-act="coverPick" data-arg="' + esc(p) + '"><div class="th"><img loading="lazy" src="' + esc(p) + '" alt=""></div></button>'; }).join('') + '</div>');
    },
    coverPick: function (url) { P.covers[MV._coverItem.key] = url; MV.savePrefs(); MV.closeModal(true); MV.toast('Carátula actualizada'); MV.rerender(); },
    liveCat: function (c) { liveCat = c; limits.live = 150; MV.rerender(); },
    liveSec: function (x) { liveSec = x; liveCat = 'Todos'; limits.live = 150; MV.rerender(); },
    liveCountry: function (x) { liveCountry = x; liveCat = 'Todos'; limits.live = 150; MV.rerender(); },
    cat: function (c, el) { MV.closeModal(true); catSel[el.dataset.v] = c; genreSel[el.dataset.v] = ''; platSel[el.dataset.v] = ''; limits[el.dataset.v] = 60; MV.rerender(); },
    catMore: function (vkey) {
      MV.modal(catMoreModal(vkey, ''), { onOpen: function (root) {
        var inp = root.querySelector('#catFind');
        inp.addEventListener('input', MV.debounce(function () { var g = document.getElementById('catGrid'); var tmp = document.createElement('div'); tmp.innerHTML = catMoreModal(vkey, inp.value); g.innerHTML = tmp.querySelector('#catGrid').innerHTML; }, 150));
      } });
    },
    catPick: function (c, el) { var v = el.dataset.v; MV.closeModal(true); catSel[v] = c; genreSel[v] = ''; platSel[v] = ''; limits[v] = 60; MV.rerender(); },
    sortBy: function (s2, el) { MV.closeModal(true); sortSel[el.dataset.v] = s2; MV.save('sortSel', sortSel); MV.rerender(); },
    animeMode: function (m) { animeMode = m; animeYear = ''; MV.rerender(); },
    animeYear: function (y) { animeYear = y; MV.rerender(); },
    viewMode: function (m, el) { viewMode[el.dataset.v] = m; MV.save('viewMode', viewMode); MV.rerender(); },
    moreRows: function (v) { rowLimit[v] = (rowLimit[v] || 14) + 14; keepPlace(); },
    clearFilters: function (v) { catSel[v] = ''; genreSel[v] = ''; platSel[v] = ''; yearSel[v] = ''; limits[v] = 60; MV.rerender(); },
    westernToggle: function (_, el) { var v = el.dataset.v; genreSel[v] = genreSel[v] === 'western' ? '' : 'western'; limits[v] = 60; MV.rerender(); },
    yearAll: function (y, el) { var v = el.dataset.v; yearSel[v] = String(y); limits[v] = 60; MV.go(view.name, view.arg, { replace: true }); },
    plat: function (p, el) { MV.closeModal(true); platSel[el.dataset.v] = p; genreSel[el.dataset.v] = ''; limits[el.dataset.v] = 60; MV.rerender(); },
    platform: function (id) { MV.go('platforms', id); },
    back: function () { MV.onBack(); },
    genre: function (g, el) { MV.closeModal(true); genreSel[el.dataset.v] = g; limits[el.dataset.v] = 60; MV.rerender(); },
    gameGenre: function (g) { gameGenre = g; MV.rerender(); },
    kidCat: function (c) { kidCat = c; MV.rerender(); },
    reloadEpg: function () { MV.toast('Actualizando guía…'); MV.loadEpg(true).then(function () { MV.rerender(); MV.toast('Guía actualizada'); }); },
    confirmOk: function () { var r = MV._confirmRes; MV._confirmRes = null; MV.closeModal(true); if (r) r(true); },
    confirmNo: function () { MV.closeModal(); },
    promptOk: function () { var v = document.getElementById('promptIn').value; var r = MV._promptRes; MV._promptRes = null; MV.closeModal(true); if (r) r(v); },
    // Perfiles
    pickProfile: function (id) {
      var p = S.profiles.find(function (x) { return x.id === id; });
      var enter = function () { S.pid = id; MV.save('pid', id); stack = []; MV.applyLook(); MV.go(p.kids ? 'kids' : 'home', null, { replace: true }); MV.emit('profile'); };
      if (p.pin) pinPad('PIN de ' + p.name, function (h) { if (h === p.pin) { MV.closeModal(true); enter(); return true; } return false; });
      else enter();
    },
    manageProfiles: function () { MV.go('settings', 'profiles'); },
    editProfile: function (id) { editSel = null; pendingName = null; MV.go('profileEdit', id); },
    avTab: function (t) { editTab = t === 'coleccion' ? 'coleccion' : 'crear'; keepName(); MV.rerender(); },
    avTone: function (t) { AV.tone = t; avUpdate(); },
    avType: function (t) { AV.t = t; if (!isRole(t)) AV.h = t; if (isRole(t)) AV.acc = ''; avUpdate(); },
    avHair: function (h) { AV.hair = h; avUpdate(); },
    avGl: function (g) { AV.gl = g; avUpdate(); },
    avAcc: function (a) { AV.acc = a; avUpdate(); },
    colCat: function (c) { colCat = c; colLim = 60; keepName(); MV.rerender(); },
    colTone: function (t) { AV.tone = t; keepName(); MV.rerender(); },
    colMore: function () { colLim += 60; keepName(); MV.rerender(); },
    colPick: function (u) {
      keepName(); AV.custom = 'col';
      // Se guarda como imagen dentro del perfil (así funciona sin internet)
      loadImg(u, true).then(function (img) {
        var cv = document.createElement('canvas'); cv.width = cv.height = 240; cv.getContext('2d').drawImage(img, 0, 0, 240, 240);
        try { editSel = cv.toDataURL('image/webp', 0.9); } catch (e) { editSel = u; }
      }).catch(function () { editSel = u; }).then(function () { MV.rerender(); });
    },
    avPick: function (f) { editSel = f; keepName(); MV.rerender(); },
    editKids: function () { editKids = !editKids; keepName(); MV.rerender(); },
    saveProfile: function (id) {
      var name = (document.getElementById('profName').value || '').trim() || 'Perfil';
      var p = S.profiles.find(function (x) { return x.id === id; });
      if (!p) { p = { id: 'p' + Date.now().toString(36) }; S.profiles.push(p); }
      p.name = name; p.avatar = editSel; p.kids = editKids; p.updatedAt = Date.now();
      p.avatarCfg = AV && !AV.custom && /^avatars\/fluent\/|^data:image/.test(editSel) ? { t: AV.t, h: AV.h, tone: AV.tone, hair: AV.hair, gl: AV.gl, acc: AV.acc } : null;
      MV.saveProfiles(); editSel = null; pendingName = null;
      if (!S.pid) { S.pid = p.id; MV.save('pid', p.id); }
      stack = []; MV.go(S.profiles.length > 1 ? 'profiles' : (p.kids ? 'kids' : 'home'), null, { replace: true });
    },
    profilePin: function (id) {
      var p = S.profiles.find(function (x) { return x.id === id; });
      if (p.pin) { p.pin = ''; p.updatedAt = Date.now(); MV.saveProfiles(); MV.rerender(); MV.toast('PIN eliminado'); return; }
      pinPad('Nuevo PIN para ' + p.name, function (h) { p.pin = h; p.updatedAt = Date.now(); MV.saveProfiles(); MV.closeModal(true); MV.rerender(); MV.toast('PIN guardado'); return true; });
    },
    deleteProfile: function (id) {
      MV.confirm('¿Eliminar este perfil?', 'Se borran sus favoritos e historial en este dispositivo.', 'Eliminar').then(function (y) {
        if (!y) return;
        S.profiles = S.profiles.filter(function (x) { return x.id !== id; }); MV.saveProfiles();
        localStorage.removeItem('mv:pdata:' + id);
        if (S.pid === id) { S.pid = null; MV.save('pid', null); }
        stack = []; MV.go('profiles', null, { replace: true });
      });
    },
    kidsExit: function () { askParentPin().then(function (ok) { if (ok) { stack = []; MV.go('profiles', null, { replace: true }); } }); },
    kidsMore: function () {
      askParentPin().then(function (ok) {
        if (!ok) return; var u = MV.kidsUsed(); u.m[S.pid] = Math.max(0, (u.m[S.pid] || 0) - 30); MV.save('kidsUsage', u);
        MV.closeModal(true); MV.toast('30 minutos más'); MV.rerender();
      });
    },
    pin: function (d) { MV._pin && MV._pin(d); },
    // Listas
    addList: function () { if (!MV.acct.canEdit()) return MV.toast('Solo el administrador puede agregar listas'); addListDialog('url'); },
    closeModal: function () { MV.closeModal(); },
    pick: function (kind, el) {
      var v = el.dataset.v, d = (MV._pick || {})[v]; if (!d) return;
      var cur = kind === 'cats' ? (catSel[v] || '') : kind === 'plats' ? (platSel[v] || '') : kind === 'genres' ? (genreSel[v] || '') : (sortSel[v] || 'rec');
      var act = { cats: 'cat', plats: 'plat', genres: 'genre', sort: 'sortBy' }[kind];
      var title = { cats: 'Categoría', plats: 'Plataforma', genres: 'Género', sort: 'Ordenar por' }[kind];
      MV.modal('<h2>' + title + '</h2>' + (d[kind].length > 14 ? '<input class="in f" id="pickFind" placeholder="Buscar" autocomplete="off" style="margin:6px 0 12px">' : '') +
        '<div class="catgrid" id="pickGrid">' + d[kind].map(function (o) { return '<button class="chip f' + (String(cur) === String(o.id) ? ' on' : '') + '" data-act="' + act + '" data-arg="' + esc(o.id) + '" data-v="' + v + '" data-n="' + esc(MV.norm(o.name)) + '"' + (String(cur) === String(o.id) ? ' data-autofocus' : '') + '>' + esc(o.name) + (o.count != null ? ' <small>' + o.count + '</small>' : '') + '</button>'; }).join('') + '</div>',
        { onOpen: function (root) { var f = root.querySelector('#pickFind'); if (f) f.addEventListener('input', function () { var q = MV.norm(f.value); root.querySelectorAll('#pickGrid .chip').forEach(function (b) { b.style.display = !q || b.dataset.n.indexOf(q) >= 0 ? '' : 'none'; }); }); } });
    },
    pushNow: function () { MV.toast('Enviando listas y claves a tus usuarios…'); MV.acct.push({ forced: Date.now() }).then(function () { if (!MV.acct.pushError) MV.toast('Listo: tus usuarios ya tienen todo'); MV.rerender(); }); },
    recheck: function () { MV.toast('Revisando…'); MV.acct.retry().then(function () { MV.rerender(); MV.toast(S.lists.length ? 'Listas recibidas' : 'El administrador aún no ha enviado listas', 3500); }); },
    navMove: function (v) {
      var id = v.split(':')[0], d = +v.split(':')[1], ids = navOrderIds(), i = ids.indexOf(id), j = i + d;
      if (i < 0 || j < 0 || j >= ids.length) return;
      ids.splice(i, 1); ids.splice(j, 0, id);
      P.navOrder = ids; MV.savePrefs(); MV.rerender();
      setTimeout(function () { var el = document.querySelector('[data-act="navMove"][data-arg="' + id + ':' + d + '"]'); if (el && !el.disabled) el.focus(); else { el = document.querySelector('[data-act="navMove"][data-arg="' + id + ':' + (-d) + '"]'); if (el) el.focus(); } }, 40);
    },
    navToggle: function (id) {
      var h = (P.navHidden || []).slice(), i = h.indexOf(id);
      if (i >= 0) h.splice(i, 1); else h.push(id);
      P.navHidden = h; MV.savePrefs(); MV.rerender();
    },
    navReset: function () { P.navOrder = []; P.navHidden = []; MV.savePrefs(); MV.rerender(); MV.toast('Menú restablecido'); },
    webGo: function () { var v = ((document.getElementById('webIn') || {}).value || '').trim(); openBrowser(v); },
    webOpen: function (u) { openBrowser(u); },
    stype: function (t) { searchType = t; showResults(); var el = document.querySelector('[data-act="stype"][data-arg="' + t + '"]'); if (el) el.focus(); },
    searchFor: function (q) { query = q; var i = document.getElementById('searchIn'); if (i) i.value = q; saveRecent(q); showResults(); },
    clearRecent: function () { MV.save('recentSearch', []); showResults(); },
    langMenu: function () {
      var aud = [['es', 'Español'], ['en', 'Inglés'], ['pt', 'Portugués'], ['ja', 'Japonés'], ['ko', 'Coreano'], ['fr', 'Francés']];
      var sub = [['', 'Desactivados'], ['es', 'Español'], ['en', 'Inglés'], ['pt', 'Portugués']];
      MV.modal('<h2>Audio y subtítulos</h2><p class="muted">Se aplica al reproducir, si el video trae ese idioma. Durante la película puedes cambiarlo con el botón de subtítulos o el de ajustes del reproductor (en el control remoto, tecla Menú).</p>' +
        '<h3 style="margin:14px 0 8px">Idioma del audio</h3><div class="chips">' + aud.map(function (a) { return '<button class="chip f' + (P.audioLang === a[0] ? ' on' : '') + '" data-act="langSet" data-arg="audioLang:' + a[0] + '">' + a[1] + '</button>'; }).join('') + '</div>' +
        '<h3 style="margin:14px 0 8px">Subtítulos</h3><div class="chips">' + sub.map(function (a) { return '<button class="chip f' + ((P.subLang || '') === a[0] ? ' on' : '') + '" data-act="langSet" data-arg="subLang:' + a[0] + '">' + a[1] + '</button>'; }).join('') + '</div>' +
        '<div class="btns"><button class="btn f" data-act="closeModal" data-autofocus>Listo</button></div>');
    },
    langSet: function (v) {
      var k = v.split(':')[0], val = v.split(':')[1] || '';
      P[k] = val; MV.savePrefs();
      MV.closeModal(true); ACT.langMenu();
      MV.toast(k === 'audioLang' ? 'Audio preferido guardado' : (val ? 'Subtítulos activados' : 'Subtítulos desactivados'));
    },
    auToggle: function () { AU.toggle(); },
    auNext: function () { AU.next(); },
    auPrev: function () { AU.prev(); },
    auStop: function () { AU.stop(); if (view.name === 'radio' || view.name === 'music') MV.rerender(); },
    openApp: function (k) { openApp(k); },
    openDiag: function () { if (AU.current()) AU.stop(); if (A && A.openDiag) A.openDiag(); else MV.toast('Disponible en la app instalada'); },
    ytSearch: function () { MV._typedAt = Date.now(); var v = ((document.getElementById('ytIn') || {}).value || '').trim(); if (!P.ytKey) { if (v) ytOpen(v); else openApp('youtube'); return; } YT.q = v; YT.list = null; MV.rerender(); },
    ytCat: function (c) { YT.cat = c; YT.q = ''; YT.list = null; MV.rerender(); },
    ytPlay: function (i) { YTP.play(MV._ytList || [], +i); },
    ytKeySetup: function () { setTab = 'meta'; MV.go('settings'); },
    radioScope: function (c) { RADIO.scope = c; RADIO.list = null; limits.radio = 60; MV.rerender(); },
    radioTag: function (t) { RADIO.tag = t; RADIO.list = null; limits.radio = 60; MV.rerender(); },
    radioSearch: function () { RADIO.q = ((document.getElementById('radioIn') || {}).value || '').trim(); RADIO.list = null; MV.rerender(); },
    radioPlay: function (i) { var l = MV._radioList || []; AU.play(l, +i); setTimeout(MV.rerender, 50); },
    radioFav: function (i) {
      var s = (MV._radioList || [])[+i]; if (!s) return;
      var f = radioFavs(), at = f.findIndex(function (x) { return x.url === s.url; });
      if (at >= 0) { f.splice(at, 1); MV.toast('Quitada de favoritas'); } else { f.unshift(s); MV.toast('Agregada a favoritas'); }
      MV.save('radioFavs', f.slice(0, 100)); if (RADIO.scope === 'fav') RADIO.key = ''; MV.rerender();
    },
    musicTab: function (t) { MUSIC.tab = t; MV.rerender(); },
    streamTab: function (t) { STREAM.tab = t; MV.rerender(); },
    liveLang: function (a) { LIVE.lang = a; MV.rerender(); },
    streamGo: function (a) { var i = a.indexOf(':'); streamPlay(a.slice(0, i), a.slice(i + 1)); },
    streamOpenIn: function () { var v = ((document.getElementById('streamIn') || {}).value || '').trim(); if (!v) { MV.toast('Escribe el nombre del canal'); return; } streamPlay(STREAM.tab, v); },
    streamClose: function () { MV.streamClose(); },
    streamFav: function (a) { var i = a.indexOf(':'), t = a.slice(0, i), c = a.slice(i + 1).toLowerCase(), f = streamFavs(); f[t] = (f[t] || []).filter(function (x) { return x !== c; }); f[t].unshift(c); MV.save('streamFavs', f); MV.toast('Canal guardado'); },
    streamUnfav: function (a) { var i = a.indexOf(':'), t = a.slice(0, i), c = a.slice(i + 1), f = streamFavs(); f[t] = (f[t] || []).filter(function (x) { return x !== c; }); MV.save('streamFavs', f); MV.rerender(); },
    streamBrowse: function () { openBrowser(STREAM.tab === 'kick' ? 'https://kick.com/browse' : 'https://www.twitch.tv/directory'); },
    ytmCat: function (c) { YTM.cat = c; YTM.q = ''; YTM.list = null; MV.rerender(); },
    ytmSearch: function () { MV._typedAt = Date.now(); YTM.q = ((document.getElementById('ytmIn') || {}).value || '').trim(); YTM.list = null; MV.rerender(); },
    ytmPlay: function (i) { if (AU.current()) AU.stop(); YTP.play(MV._ytmList || [], +i); },
    musicScan: function () { scanMusic(); },
    musicShuffle: function () { var l = (MUSIC.local || []).slice(); for (var i = l.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = l[i]; l[i] = l[j]; l[j] = t; } AU.play(l, 0); setTimeout(MV.rerender, 50); },
    localPlay: function (i) { AU.play(MUSIC.local || [], +i); setTimeout(MV.rerender, 50); },
    audPlay: function (i) { AU.play(MUSIC.aud || [], +i); setTimeout(MV.rerender, 50); },
    musicGenre: function (g) { MUSIC.genre = g; MUSIC.q = ''; MUSIC.aud = null; MV.rerender(); },
    musicSearch: function () { MUSIC.q = ((document.getElementById('musicIn') || {}).value || '').trim(); MUSIC.aud = null; MV.rerender(); },
    discOnly: function () { DISC.onlyHave = !DISC.onlyHave; MV.rerender(); },
    discReload: function () { DISC.error = ''; loadDiscover(true); MV.rerender(); },
    tmdbTrailer: function (key) {
      var t = MV.reg[key]; if (!t) return;
      MV.tmdb('/' + t.mtype + '/' + t.id + '/videos', '&include_video_language=es,en').then(function (j) {
        var v = (j.results || []).filter(function (x) { return x.site === 'YouTube'; });
        v.sort(function (a, b) { return (b.type === 'Trailer') - (a.type === 'Trailer') || (b.iso_639_1 === 'es') - (a.iso_639_1 === 'es'); });
        if (!v.length) return MV.tmdb('/' + t.mtype + '/' + t.id + '/videos', '&language=en-US').then(function (j2) { return (j2.results || []).filter(function (x) { return x.site === 'YouTube'; }); });
        return v;
      }).then(function (v) {
        if (!v || !v.length) return MV.toast('No hay tráiler disponible');
        MV.closeModal(true);
        // Se ve dentro de la app; con ▲ ▼ pasas entre los demás videos (teasers, clips)
        YTP.play(v.slice(0, 8).map(function (x) { return { id: x.key, title: t.name + ' · ' + (x.name || 'Tráiler'), channel: (x.type === 'Trailer' ? 'Tráiler' : x.type || 'Video') + (x.iso_639_1 === 'es' ? ' · Español' : '') }; }), 0);
      }).catch(function () { MV.toast('No se pudo cargar el tráiler'); });
    },
    tmdbSearch: function (key) { var t = MV.reg[key]; if (!t) return; MV.closeModal(true); query = t.name; MV.go('search'); },
    checkUpdate: function () { if (MV.pendingUpdate) { MV.showUpdate(); return; } MV.toast('Buscando actualizaciones…'); MV.checkUpdate(true).then(function () { if (view.name === 'settings') MV.rerender(); }); },
    checkDupes: function () { MV.checkDupes(true); MV.toast('Probando las señales de los canales repetidos…'); setTimeout(MV.rerender, 300); },
    loginGoogle: function () {
      loginBusy = true; MV.acct.error = ''; MV.rerender();
      MV.acct.signInGoogle().then(afterLogin).catch(loginFail);
    },
    loginCode: function () {
      MV.acct.error = '';
      MV.acct.startCode(function (c) { loginCode = c; MV.rerender(); }).then(afterLogin).catch(function (e) { loginCode = null; loginFail(e); });
    },
    loginCancel: function () { MV.acct.stopCode(); loginCode = null; MV.rerender(); },
    loginRetry: function () {
      MV.toast('Revisando acceso…');
      MV.acct.retry().then(function (ok) {
        if (ok) { MV.toast('¡Listo, ya tienes acceso!'); afterLogin(); }
        else { MV.toast('Todavía sin acceso. Pídele al administrador que agregue tu correo.', 4000); MV.rerender(); }
      });
    },
    loginOut: function () { while (MV.modalOpen()) MV.closeModal(true); MV.confirm('¿Cerrar sesión en este equipo?', 'Tus datos quedan guardados en tu cuenta.', 'Cerrar sesión').then(function (y) { if (!y) return; MV.acct.signOut().then(function () { S.pid = null; MV.save('pid', null); MV.go('login', null, { replace: true }); }); }); },
    acctAllow: function () {
      var m = (document.getElementById('acctMail').value || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(m)) return MV.toast('Escribe un correo válido');
      MV.acct.allow(m).then(function () { MV.toast('Usuario agregado'); MV.rerender(); });
    },
    acctRevoke: function (e) { MV.confirm('¿Quitar el acceso a ' + e + '?', '', 'Quitar').then(function (y) { if (y) MV.acct.revoke(e).then(MV.rerender); }); },
    acctOpen: function () { var c = MV.acct.config || {}; MV.acct.setOpen(!c.open).then(MV.rerender); },
    listTab: function (t) { MV.closeModal(true); addListDialog(t); },
    listSave: function (tab) {
      var name = (document.getElementById('lName') || {}).value;
      if (tab === 'stalker') {
        var sl = { type: 'stalker', name: name || 'Portal', portal: document.getElementById('lPortal').value.trim(), mac: document.getElementById('lMac').value.trim() };
        if (!sl.portal || !sl.mac) { MV.toast('Completa la URL del portal y la MAC'); return; }
        var se = document.getElementById('lErr'); if (se) se.textContent = '';
        MV.toast('Conectando con el portal…');
        MV.stkLogin(sl).then(function (info) {
          MV.closeModal(true);
          MV.toast('Conectado' + (info && (info.phone || info.end_date) ? ' · vence ' + (info.phone || info.end_date) : '') + '. Cargando canales, películas y series…', 5000);
          return MV.addList(sl);
        }).then(function () { MV.rerender(); }).catch(function (e) { var el = document.getElementById('lErr'); if (el) el.textContent = '' + e.message; MV.toast(e.message, 6000); });
        return;
      }
      if (tab === 'xtream') {
        var l = { type: 'xtream', name: name || 'Xtream', host: document.getElementById('lHost').value.trim(), user: document.getElementById('lUser').value.trim(), pass: document.getElementById('lPass').value };
        if (!l.host || !l.user) { MV.toast('Completa servidor y usuario'); return; }
        MV.toast('Iniciando sesión…');
        var errEl = document.getElementById('lErr'); if (errEl) errEl.textContent = '';
        MV.xtLogin(l).then(function (j) {
          MV.closeModal(true);
          var exp = j.user_info.exp_date ? new Date(+j.user_info.exp_date * 1000).toLocaleDateString('es-CO') : '';
          MV.toast('Conectado' + (exp ? ' · vence ' + exp : ''), 3500);
          return MV.addList(l);
        }).then(function () { MV.rerender(); }).catch(function (e) { var el = document.getElementById('lErr'); if (el) el.textContent = '' + e.message; MV.toast(e.message, 6000); });
      } else if (tab === 'multi') {
        var txtAll = document.getElementById('lMulti').value, macs = MV.parseMacList(txtAll, !!(document.getElementById('lMacBk') || {}).checked);
        if (macs.length) { importMany(macs); return; }
        var parsed = MV.parseUrlList(txtAll);
        if (parsed === null) { MV.toast('Eso es una lista M3U completa: usa la pestaña Archivo'); return; }
        importMany(parsed);
      } else if (tab === 'file') {
        MV.call('pickFile', []).then(function (d) {
          return fetch(d.path).then(function (r) { return r.text(); }).then(function (txt) {
            // Un .txt con cuentas de Portal y MAC: se muestra en "Varias" para revisar antes de importar
            if (!/#EXTINF/i.test(txt.slice(0, 20000)) && MV.parseMacList(txt).length) { multiWith(txt); return; }
            // Un .txt con direcciones (no una lista M3U): se importa como varias listas
            var many = MV.parseUrlList(txt);
            if (many && many.length) { importMany(many); return; }
            var l = { type: 'file', name: name || (d.name || 'Lista').replace(/\.[^.]+$/, '') };
            MV.closeModal(true); MV.toast('Cargando lista…');
            l.id = 'l' + Date.now().toString(36);
            return MV.idbSet('raw:' + l.id, txt).then(function () { l.enabled = true; l.added = Date.now(); l.updatedAt = Date.now(); S.lists.push(l); MV.saveLists(); return MV.reloadCatalog(true); });
          });
        }).then(function () { MV.rerender(); }).catch(function (e) { if (e.message !== 'cancel') MV.toast(e.message === 'nopicker' ? 'Este equipo no tiene selector de archivos. Usa un enlace.' : e.message); });
      } else {
        var url = document.getElementById('lUrl').value.trim();
        if (!/^https?:\/\//i.test(url)) { MV.toast('El enlace debe empezar con http:// o https://'); return; }
        var epg = document.getElementById('lEpg').value.trim();
        MV.closeModal(true); MV.toast('Cargando lista…');
        MV.addList({ type: 'url', name: name || 'Mi lista', url: url, epg: epg }).then(function () { MV.rerender(); MV.toast('Lista agregada'); }).catch(function (e) { MV.toast(e.message, 4000); MV.rerender(); });
      }
    },
    presets: function () {
      if (!MV.acct.canEdit()) return MV.toast('Solo el administrador puede agregar listas');
      MV.modal('<h2>Canales gratis</h2><p>Listas públicas de canales que se emiten gratis de forma legal.</p>' + D.PRESETS.map(function (p, i) {
        var has = S.lists.some(function (l) { return l.url === p.url; });
        return '<div class="line"><div class="t"><b>' + esc(p.name) + '</b><span>' + esc(p.note) + '</span></div><button class="btn sm f" data-act="presetAdd" data-arg="' + i + '"' + (has ? ' disabled' : '') + '>' + (has ? 'Agregada' : 'Agregar') + '</button></div>';
      }).join(''));
    },
    presetAdd: function (i) {
      var p = D.PRESETS[+i]; MV.closeModal(true); MV.toast('Agregando “' + p.name + '”…');
      MV.addList({ type: 'url', name: p.name, url: p.url, preset: true }).then(function () { MV.rerender(); MV.toast('Lista agregada'); }).catch(function (e) { MV.toast(e.message); });
    },
    listToggle: function (id) {
      if (!MV.acct.canEdit()) return; var l = S.lists.find(function (x) { return x.id === id; }); l.enabled = l.enabled === false; l.updatedAt = Date.now(); MV.saveLists(); MV.reloadCatalog(false).then(MV.rerender); MV.rerender(); },
    listDelete: function (id, btn) {
      if (!MV.acct.canEdit()) return;
      var row = btn && btn.closest ? btn.closest('.line') : null;
      MV.confirm('¿Eliminar esta lista?', '', 'Eliminar').then(function (y) {
        if (!y) return;
        // Se quita la fila de inmediato (sin redibujar todo ni volver arriba) y el foco pasa a la lista de abajo
        var fs = Array.prototype.slice.call(document.querySelectorAll('.view-in .f'));
        var idx = row ? fs.indexOf(row.querySelector('.f')) : -1;
        if (row && row.isConnected) { row.style.transition = 'opacity .25s'; row.style.opacity = '0'; setTimeout(function () { if (row.isConnected) row.remove(); var nf = document.querySelectorAll('.view-in .f'); var n = idx >= 0 ? nf[Math.min(idx, nf.length - 1)] : null; if (n && !MV.modalOpen()) n.focus({ preventScroll: true }); }, 250); }
        MV._lastFocusIdx = idx;
        MV.toast('Lista eliminada');
        MV.removeList(id).then(function () { if (view.name === 'settings') MV.rerender(); });
      });
    },
    listEpg: function (id) {
      var l = S.lists.find(function (x) { return x.id === id; });
      MV.prompt('Guía EPG de “' + l.name + '”', 'Enlace XMLTV (.xml o .xml.gz)', l.epg || '', 'url').then(function (v) {
        if (v == null) return; l.epg = v.trim(); l.updatedAt = Date.now(); MV.saveLists(); MV.loadEpg(true).then(MV.rerender);
      });
    },
    reloadAll: function () { MV.toast('Actualizando listas…'); MV.reloadCatalog(true).then(function () { MV.rerender(); MV.toast('Listas actualizadas'); }); },
    // Ajustes
    setTab: function (t) { setTab = t; MV.rerender(); var s = SETTINGS[t]; if (s && s.after) s.after(); },
    theme: function (t) { P.theme = t; MV.savePrefs(); MV.rerender(); },
    glass: function (g) { P.glass = g; MV.savePrefs(); MV.rerender(); },
    prefToggle: function (k, el) {
      P[k] = P[k] === false ? true : !P[k]; MV.savePrefs();
      if (el) el.classList.toggle('on', P[k] !== false);
      MV.applyLook();
      if (k === 'autoTheme') MV.rerender();
    },
    pref: function (kv) { var i = kv.indexOf(':'), k = kv.slice(0, i), v = kv.slice(i + 1); P[k] = k === 'kidsLimit' ? +v : v; MV.savePrefs(); MV.rerender(); if (k === 'xtFormat') MV.reloadCatalog(true); },
    deviceName: function () { MV.prompt('Nombre de este dispositivo', 'Ej: TV de la sala', P.deviceName).then(function (v) { if (v) { P.deviceName = v.trim().slice(0, 30); MV.savePrefs(); MV.rerender(); } }); },
    setParentPin: function () { pinPad('Nuevo PIN parental', function (h) { P.parentPin = h; MV.savePrefs(); MV.closeModal(true); MV.toast('PIN guardado'); MV.rerender(); return true; }); },
    adultCreate: function () {
      var u = document.getElementById('adUser').value.trim(), p = document.getElementById('adPass').value, pin = document.getElementById('adPin').value;
      if (!u || p.length < 8 || !/^\d{4}$/.test(pin)) { MV.toast('Usuario, contraseña de 8+ caracteres y PIN de 4 números'); return; }
      Promise.all([MV.sha256(p), MV.sha256(pin)]).then(function (h) { P.adult = { user: u, pass: h[0], pin: h[1] }; MV.savePrefs(); MV.toast('Usuario +18 creado'); MV.rerender(); });
    },
    adultDelete: function () {
      MV.prompt('Confirma la contraseña', 'Contraseña del usuario +18', '', 'password').then(function (v) {
        if (v == null) return; MV.sha256(v).then(function (h) { if (h !== P.adult.pass) { MV.toast('Contraseña incorrecta'); return; } P.adult = null; S.adultUntil = 0; MV.savePrefs(); MV.rerender(); });
      });
    },
    adultToggle: function () {
      if (MV.isKids()) { MV.toast('No disponible en perfiles infantiles'); return; }
      if (!P.adult) { MV.toast('Primero crea el usuario +18 en Ajustes › Control parental'); MV.go('settings', 'parental'); return; }
      if (MV.adultOk()) { S.adultUntil = 0; MV.toast('Contenido +18 bloqueado'); MV.rerender(); return; }
      var unlock = function () { S.adultUntil = Date.now() + 30 * 60e3; MV.closeModal(true); MV.toast('Desbloqueado por 30 minutos'); MV.rerender(); };
      MV.modal('<h2>Contenido +18</h2><p>Ingresa con el usuario adulto o usa el PIN rápido.</p><label class="field">Contraseña de ' + esc(P.adult.user) + '<input class="in f" id="adIn" type="password" data-autofocus></label><div class="btns"><button class="btn f" data-act="adultPass">Entrar</button><button class="btn ghost f" data-act="adultPin">Usar PIN</button></div>');
      MV._adultUnlock = unlock;
    },
    /** Utilidades › +18: solo con el PIN del usuario adulto. */
    adultOpen: function () {
      if (MV.isKids()) { MV.toast('No disponible en perfiles infantiles'); return; }
      if (!P.adult) { MV.toast('Primero crea el usuario +18 y su PIN en Ajustes › Control parental'); MV.go('settings', 'parental'); return; }
      if (MV.adultOk()) { MV.go('adult'); return; }
      pinPad('PIN +18', function (h) {
        if (h !== P.adult.pin) return false;
        S.adultUntil = Date.now() + 30 * 60e3; MV.closeModal(true); MV.go('adult'); return true;
      });
    },
    adultLock: function () { S.adultUntil = 0; MV.toast('Contenido +18 bloqueado'); MV.go('utils', null, { replace: true }); },
    adultPass: function () { var v = document.getElementById('adIn').value; MV.sha256(v).then(function (h) { if (h === P.adult.pass) MV._adultUnlock(); else MV.toast('Contraseña incorrecta'); }); },
    adultPin: function () { MV.closeModal(true); pinPad('PIN +18', function (h) { if (h === P.adult.pin) { MV._adultUnlock(); return true; } return false; }); },
    syncIn: function () {
      P.firebase = document.getElementById('fbCfg').value.trim(); MV.savePrefs(true);
      var mail = document.getElementById('fbMail').value.trim(), pass = document.getElementById('fbPass').value;
      if (!mail || pass.length < 6) { MV.toast('Correo y contraseña de al menos 6 caracteres'); return; }
      MV.toast('Conectando…');
      MV.sync.signIn(mail, pass).then(function () { MV.toast('Sincronización activa'); MV.rerender(); }).catch(function (e) { MV.toast(e.message || 'No se pudo iniciar sesión', 5000); });
    },
    syncNow: function () { MV.sync.push().then(function () { MV.toast('Sincronizado'); }); },
    syncOut: function () { MV.sync.signOut().then(MV.rerender); },
    saveSubKey: function () { P.subKey = document.getElementById('subKey').value.trim(); MV.savePrefs(); MV.toast('Clave de subtítulos guardada'); },
    saveStreamKeys: function () {
      var g = function (id) { return ((document.getElementById(id) || {}).value || '').trim(); };
      P.streamKeys = { twitchId: g('twId'), twitchSecret: g('twSec'), kickId: g('kkId'), kickSecret: g('kkSec') };
      MV.savePrefs(); MV.streamReset(); MV.toast('Claves de Twitch y Kick guardadas');
    },
    saveYtKey: function () { P.ytKey = document.getElementById('ytKey').value.trim(); MV.savePrefs(); YT.key = ''; YT.list = null; MV.toast('Clave de YouTube guardada'); },
    saveTmdb: function () { P.tmdbKey = document.getElementById('tmdbKey').value.trim(); MV.savePrefs(); MV.toast('Clave guardada'); },
    clearMeta: function () { MV.toast('Las fichas se volverán a buscar'); S.items.forEach(function (i) { MV.idbDel('meta2:' + i.key); }); },
    // Búsqueda con teclado en pantalla
    kb: function (c, el) { kbSet((el && el.dataset.v) || 'searchIn', function (v) { return v + c; }); },
    kbDel: function (_, el) { kbSet((el && el.dataset.v) || 'searchIn', function (v) { return v.slice(0, -1); }); },
    kbClear: function (_, el) { kbSet((el && el.dataset.v) || 'searchIn', function () { return ''; }); },
    kbGo: function (_, el) {
      var t = (el && el.dataset.v) || 'searchIn';
      if (t === 'searchIn') { saveRecent(query); var f = document.querySelector('#results .card, #results .f'); if (f) f.focus(); }
      else if (t === 'streamIn') ACT.streamOpenIn();
      else if (t === 'ytmIn') ACT.ytmSearch();
    },
    clearHistory: function () { MV.confirm('¿Borrar el historial?', 'También se borra “Continuar viendo” de este perfil.', 'Borrar').then(function (y) { if (!y) return; var d = MV.pdata(); d.history = []; d.progress = {}; MV.savePdata(d); MV.rerender(); }); },
    // Juegos
    sysSel: function (s) { sysSel = s; MV.rerender(); },
    playRom: function (_, el) { var it = MV.reg[el.dataset.key]; if (it) playRom(it.rom); },
    romSys: function (id) { var r = MV._romPending; P.romSystem[r.path] = id; MV.savePrefs(); MV.closeModal(true); MV.rerender(); playRom(r); },
    storageAccess: function () { A && A.requestStorageAccess(); },
    romRoots: function () {
      var roots = A ? JSON.parse(A.storageRoots()) : [];
      MV.modal('<h2>Carpetas y unidades</h2><p>Marca dónde buscar juegos: memoria interna, USB o disco duro. También puedes elegir una carpeta con el selector de Android.</p>' +
        roots.map(function (r, i) { var on = P.romRoots.indexOf(r.path) >= 0; return '<div class="line"><div class="t"><b>' + esc(r.name) + '</b><span>' + esc(r.path) + (r.readable ? '' : ' · sin permiso') + '</span></div><button class="toggle f' + (on ? ' on' : '') + '" data-act="rootToggle" data-arg="' + esc(r.path) + '"></button></div>'; }).join('') +
        P.romRoots.filter(function (p) { return p.indexOf('content://') === 0; }).map(function (p) { return '<div class="line"><div class="t"><b>Carpeta elegida</b><span>' + esc(decodeURIComponent(p.split('/tree/')[1] || p)) + '</span></div><button class="toggle on f" data-act="rootToggle" data-arg="' + esc(p) + '"></button></div>'; }).join('') +
        '<div class="btns" style="margin-top:12px"><button class="btn f" data-act="pickRomFolder">Elegir carpeta…</button><button class="btn ghost f" data-act="scanRoms">Buscar juegos ahora</button></div>');
    },
    rootToggle: function (p) {
      var i = P.romRoots.indexOf(p); if (i >= 0) P.romRoots.splice(i, 1); else P.romRoots.push(p);
      MV.savePrefs(); MV.closeModal(true); ACT.romRoots();
    },
    pickRomFolder: function () {
      MV.call('pickFolder', []).then(function (uri) { if (P.romRoots.indexOf(uri) < 0) P.romRoots.push(uri); MV.savePrefs(); MV.closeModal(true); ACT.romRoots(); })
        .catch(function (e) { if (e.message !== 'cancel') MV.toast(e.message === 'nopicker' ? 'Este equipo no tiene selector de carpetas: usa la lista de unidades y permite el acceso.' : e.message, 4500); });
    },
    scanRoms: function () {
      if (!A) return;
      var roots = P.romRoots.slice();
      if (!roots.length) roots = JSON.parse(A.storageRoots()).filter(function (r) { return r.readable; }).map(function (r) { return r.path; });
      var dl = A.downloadsDir(); if (roots.indexOf(dl) < 0) roots.push(dl);
      MV.closeModal(true);
      MV.modal('<h2>Buscando juegos…</h2><div class="spinner" style="margin:20px auto"></div><p class="muted">Revisando ' + roots.length + ' ubicaciones (memoria, USB y discos).</p>');
      MV.call('scanRoms', [JSON.stringify(roots), JSON.stringify(D.ROM_EXTS)]).then(function (list) {
        list = list.filter(isGame); MV.save('roms', list); MV.closeModal(true); MV.toast(list.length + ' juegos encontrados'); MV.rerender();
      }).catch(function (e) { MV.closeModal(true); MV.toast(e.message); });
    },
    romDownload: function () {
      MV.modal('<h2>Descargar desde enlace</h2><p>Pega el enlace directo de un juego que te pertenezca o que sea libre (homebrew, juegos de dominio público, tus propias copias de seguridad). Se guarda en “Descargas de MiVibra” y aparece en tu biblioteca.</p>' +
        '<label class="field">Enlace<input class="in f" id="dlUrl" placeholder="https://…/juego.zip" inputmode="url" autocomplete="off" data-autofocus></label><label class="field">Nombre del archivo (opcional)<input class="in f" id="dlName" autocomplete="off"></label>' +
        '<div class="line"><div class="t"><b>Descomprimir si es .zip</b><span>Desactívalo para juegos de arcade (van en .zip)</span></div><button class="toggle on f" id="dlUnzip" data-act="dlToggle"></button></div>' +
        '<div class="btns"><button class="btn f" data-act="dlStart">' + IC.download + 'Descargar</button></div>');
    },
    dlToggle: function (_, el) { el.classList.toggle('on'); },
    dlStart: function () {
      var url = document.getElementById('dlUrl').value.trim(), name = document.getElementById('dlName').value.trim(), unzip = document.getElementById('dlUnzip').classList.contains('on');
      if (!/^https?:\/\//i.test(url)) { MV.toast('El enlace debe empezar con http:// o https://'); return; }
      downloadGame(url, name, unzip);
    },
    getFreedoom: function () { downloadGame(D.FREEDOOM.url, D.FREEDOOM.file, true); },
    importBios: function () {
      if (!A) return;
      var roots = P.romRoots.slice(); if (!roots.length) roots = JSON.parse(A.storageRoots()).filter(function (r) { return r.readable; }).map(function (r) { return r.path; });
      MV.call('importBios', [JSON.stringify(roots)]).then(function (arr) { MV.toast(arr.length ? 'BIOS importadas: ' + arr.join(', ') : 'No se encontraron archivos BIOS conocidos', 4500); });
    },
    remoteQR: function () { MV.modal('<h2>Celular como mando</h2><p>Mismo Wi-Fi, escanea el código y elige “Mando de juego”. Cada celular es un jugador; el joystick sirve para N64, PlayStation y los ports.</p><div id="qrBox2" style="display:flex;gap:20px;align-items:center;flex-wrap:wrap"></div>', { onOpen: function () { showQR(document.getElementById('qrBox2')); } }); }
  };
  var pendingName = null;
  function keepName() { var i = document.getElementById('profName'); if (i) pendingName = i.value; }
  VIEWS.profileEdit.after = function () {
    var i = document.getElementById('profName'); if (i && pendingName != null) i.value = pendingName;
    if (editTab === 'crear') setTimeout(avThumbs, 50);   // profesiones con tu color de cabello y lentes
  };

  function downloadGame(url, name, unzip) {
    MV.closeModal(true);
    MV.modal('<h2>Descargando…</h2><div class="bar"><i id="dlBar"></i></div><p class="muted" id="dlPct">Conectando…</p>');
    MV.call('downloadFile', [url, name || ''], function (pct) {
      var b = document.getElementById('dlBar'), t = document.getElementById('dlPct');
      if (b && pct >= 0) b.style.width = pct + '%'; if (t) t.textContent = pct >= 0 ? pct + '%' : 'Descargando…';
    }).then(function (f) {
      if (unzip && /\.zip$/i.test(f.name)) return MV.call('unzip', [f.path]).then(function () { return f; });
      return f;
    }).then(function (f) { MV.closeModal(true); MV.toast('Descargado: ' + f.name); ACT.scanRoms(); })
      .catch(function (e) { MV.closeModal(true); MV.toast(e.message, 4500); });
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
    var fn = ACT[el.dataset.act]; if (!fn) return;
    e.preventDefault(); fn(el.dataset.arg, el);
  });

  // ---------- Descubrir (TMDB) ----------
  var DISC = { rows: {}, loading: false, ts: 0, onlyHave: false, idx: null, idxSize: -1 };
  var DISC_ROWS = [
    ['trend', 'Tendencias de la semana', '/trending/all/week', ''],
    ['now', 'Estrenos en cines', '/movie/now_playing', '&region=CO'],
    ['popm', 'Películas populares', '/movie/popular', '&region=CO'],
    ['popt', 'Series populares', '/tv/popular', ''],
    ['topm', 'Películas mejor valoradas', '/movie/top_rated', ''],
    ['topt', 'Series mejor valoradas', '/tv/top_rated', ''],
    ['anime', 'Anime popular', '/discover/tv', '&with_genres=16&with_original_language=ja&sort_by=popularity.desc'],
    ['kd', 'K-Drama popular', '/discover/tv', '&with_original_language=ko&with_genres=18&sort_by=popularity.desc'],
    ['doc', 'Documentales', '/discover/movie', '&with_genres=99&sort_by=popularity.desc'],
    ['kids', 'Para niños', '/discover/movie', '&with_genres=16,10751&sort_by=popularity.desc&certification_country=US&certification.lte=PG']
  ];
  /** Índice de títulos de tus listas para saber qué ya tienes. */
  function titleKey(n) { return MV.norm(MV.cleanTitle(String(n || '')).replace(/[(\[]?\b(19|20)\d{2}\b[)\]]?/g, ' ')); }
  function haveIndex() {
    var vod = S.items.filter(function (i) { return i.type === 'movie' || i.type === 'series'; });
    if (DISC.idx && DISC.idxSize === vod.length) return DISC.idx;
    var idx = {};
    vod.forEach(function (i) {
      var k = titleKey(i.name); if (!k) return;
      (idx[k] = idx[k] || []).push(i);
    });
    DISC.idx = idx; DISC.idxSize = vod.length;
    return idx;
  }
  /** ¿Tienes ESTE título? Mismo nombre, mismo tipo y año compatible (no confunde un remake con la original). */
  function itemYearOf(i) { return String(i.year || ((i.name || '').match(/\b(19|20)\d{2}\b/) || [''])[0] || ''); }
  function matchHave(t) {
    var idx = haveIndex(), want = t.mtype === 'tv' ? 'series' : 'movie', exact = null, unsure = null;
    [t.name, t.original].forEach(function (n) {
      if (exact || !n) return;
      (idx[titleKey(n)] || []).forEach(function (i) {
        if (i.type !== want || exact) return;
        var iy = itemYearOf(i);
        if (t.year && iy) { if (Math.abs(+iy - +t.year) <= 1) exact = i; return; }   // año distinto = otra película
        if (!unsure) unsure = i;                                                       // sin año: se verifica al abrir
      });
    });
    t.haveUnsure = !exact && !!unsure;
    return exact ? exact.key : unsure ? unsure.key : '';
  }

  function toItem(r, forced) {
    var mtype = forced || r.media_type || (r.title ? 'movie' : 'tv');
    if (mtype !== 'movie' && mtype !== 'tv') return null;
    var it = {
      key: 'tmdb:' + mtype + ':' + r.id, type: 'tmdb', mtype: mtype, id: r.id,
      name: r.title || r.name || '', original: r.original_title || r.original_name || '',
      year: (r.release_date || r.first_air_date || '').slice(0, 4),
      poster: r.poster_path ? MV.TMDB_IMG + 'w342' + r.poster_path : '',
      backdrop: r.backdrop_path ? MV.TMDB_IMG + 'w1280' + r.backdrop_path : '',
      overview: r.overview || '', rating: r.vote_average ? r.vote_average.toFixed(1) : ''
    };
    it.group = (mtype === 'tv' ? 'Serie' : 'Película') + (it.rating ? ' · ★ ' + it.rating : '');
    it.have = matchHave(it);
    return it;
  }
  function loadDiscover(force) {
    if (!P.tmdbKey || DISC.loading) return;
    if (!force && DISC.ts > Date.now() - 3 * 3600e3) return;
    DISC.loading = true;
    Promise.all(DISC_ROWS.map(function (r) {
      var forced = r[2].indexOf('/tv') >= 0 ? 'tv' : r[2].indexOf('/movie') >= 0 ? 'movie' : '';
      return MV.tmdb(r[2], r[3]).then(function (j) {
        DISC.rows[r[0]] = (j.results || []).map(function (x) { return toItem(x, forced); }).filter(function (x) { return x && x.name && x.poster; });
      }).catch(function (e) { DISC.error = e.message; });
    })).then(function () {
      DISC.loading = false; DISC.ts = Date.now();
      if (view.name === 'discover' || view.name === 'home') MV.rerender();
    });
  }
  MV.on('catalog', function () {
    // Al cambiar tus listas, recalcula qué títulos ya tienes
    Object.keys(DISC.rows).forEach(function (k) { DISC.rows[k].forEach(function (t) { t.have = matchHave(t); }); });
  });
  VIEWS.discover = function () {
    var head = top('Descubrir', '<button class="pill f" data-act="discOnly">' + (DISC.onlyHave ? '✓ ' : '') + 'Solo lo que tengo</button>');
    if (!P.tmdbKey) {
      return head + '<div class="empty glass"><h2>Falta la clave de TMDB</h2><p class="muted">' +
        (MV.acct.canEdit() ? 'Pon tu clave gratuita de themoviedb.org en Ajustes › Sinopsis y carátulas para ver tendencias, estrenos y lo más popular.' : 'El administrador aún no ha configurado esta sección.') + '</p>' +
        (MV.acct.canEdit() ? '<div class="btns" style="justify-content:center"><button class="btn f" data-act="go" data-arg="settings" data-autofocus>Ir a Ajustes</button></div>' : '') + '</div>';
    }
    loadDiscover(false);
    var any = Object.keys(DISC.rows).length;
    if (!any) return head + (DISC.error ? '<div class="panel glass"><p>No se pudo conectar con TMDB: ' + esc(DISC.error) + '</p><div class="btns"><button class="btn f" data-act="discReload">Reintentar</button></div></div>' : '<div class="panel glass" style="display:flex;gap:14px;align-items:center"><div class="spinner"></div><b>Buscando lo más popular…</b></div>');
    var kids = MV.isKids(), html = head + '<p class="muted" style="margin:-6px 0 14px">Lo más visto según TMDB. Las marcadas <b style="color:var(--accent-text)">EN TUS LISTAS</b> se pueden ver ya.</p>';
    DISC_ROWS.forEach(function (r) {
      if (kids && r[0] !== 'kids' && r[0] !== 'anime') return;
      var items = DISC.rows[r[0]] || [];
      if (DISC.onlyHave) items = items.filter(function (t) { return t.have; });
      var n = items.filter(function (t) { return t.have; }).length;
      html += row(r[1], items, 'poster', n ? n + ' en tus listas' : '');
    });
    if (DISC.onlyHave && !html.match(/class="row"/)) html += '<div class="empty glass"><p class="muted">Ninguno de los títulos populares está en tus listas todavía.</p></div>';
    return html + '<p class="muted" style="font-size:12px;margin-top:18px">Datos de TMDB. Este producto usa la API de TMDB pero no está respaldado ni certificado por TMDB.</p>';
  };
  function tmdbInfo(t) {
    MV.modal('<div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">' +
      (t.poster ? '<img src="' + esc(t.poster) + '" alt="" style="width:130px;border-radius:14px;flex:0 0 auto">' : '') +
      '<div style="flex:1;min-width:200px"><h2 style="margin:0 0 4px">' + esc(t.name) + '</h2><p class="muted" style="margin:0 0 10px">' + esc([t.year, t.mtype === 'tv' ? 'Serie' : 'Película', t.rating ? '★ ' + t.rating : ''].filter(Boolean).join(' · ')) + '</p>' +
      '<p style="max-height:32vh;overflow:auto;font-size:14px;line-height:1.5">' + esc(t.overview || 'Sin sinopsis en español.') + '</p>' +
      '<p class="muted" style="font-size:13px">' + (t.other ? 'Esta versión no está en tus listas. Tienes otra con el mismo nombre' + (t.otherYear ? ' (' + esc(t.otherYear) + ')' : '') + '.' : 'No está en tus listas.') + '</p></div></div>' +
      (t.other ? '<div class="btns" style="margin-bottom:0"><button class="btn ghost f" data-key2="' + esc(t.other) + '" onclick="MV.closeModal(true);MV.go(\'detail\',this.dataset.key2);event.stopPropagation()">Ver la versión que tienes' + (t.otherYear ? ' (' + esc(t.otherYear) + ')' : '') + '</button></div>' : '') +
      '<div class="btns"><button class="btn f" data-act="tmdbTrailer" data-arg="' + esc(t.key) + '" data-autofocus>' + IC.play + 'Ver tráiler</button><button class="btn ghost f" data-act="tmdbSearch" data-arg="' + esc(t.key) + '">' + IC.search + 'Buscar parecidos</button><button class="btn ghost f" data-act="closeModal">Cerrar</button></div>');
  }

  // ---------- Reproductor de audio (radio y música) ----------
  var AU = MV.audio = (function () {
    var el = new Audio(), queue = [], idx = -1, cur = null, triedNative = false;
    el.preload = 'none';
    function box() { return document.getElementById('mini'); }
    function draw() {
      var b = box(); if (!b) return;
      if (!cur) { b.hidden = true; b.innerHTML = ''; document.body.classList.remove('has-mini'); return; }
      b.hidden = false; document.body.classList.add('has-mini');
      var playingNow = !el.paused;
      b.innerHTML = '<div class="art">' + (cur.art ? '<img src="' + esc(cur.art) + '" alt="" onerror="this.remove()">' : '') + '<span>' + (cur.kind === 'radio' ? IC.radio : IC.music) + '</span></div>' +
        '<div class="t"><b>' + esc(cur.title) + '</b><span id="miniSub">' + esc(AU.status || cur.sub || '') + '</span></div>' +
        (queue.length > 1 ? '<button class="iconbtn f" data-act="auPrev" aria-label="Anterior">' + IC.prev + '</button>' : '') +
        '<button class="iconbtn f on" data-act="auToggle" aria-label="' + (playingNow ? 'Pausa' : 'Reproducir') + '">' + (playingNow ? IC.pause : IC.play) + '</button>' +
        (queue.length > 1 ? '<button class="iconbtn f" data-act="auNext" aria-label="Siguiente">' + IC.next + '</button>' : '') +
        '<button class="iconbtn f" data-act="auStop" aria-label="Cerrar">' + IC.close + '</button>';
    }
    function setStatus(t) { AU.status = t; var s = document.getElementById('miniSub'); if (s) s.textContent = t || (cur && cur.sub) || ''; }
    function start() {
      cur = queue[idx]; triedNative = false; if (!cur) return;
      setStatus('Conectando…'); draw();
      el.src = cur.url;
      var p = el.play(); if (p && p.catch) p.catch(function () {});
      if (cur.kind === 'radio' && cur.uuid) MV.getText(RB() + '/url/' + cur.uuid).catch(function () {});
    }
    el.addEventListener('playing', function () { setStatus(''); draw(); });
    el.addEventListener('pause', draw);
    el.addEventListener('waiting', function () { setStatus('Cargando…'); });
    el.addEventListener('ended', function () { if (idx < queue.length - 1) { idx++; start(); } else draw(); });
    el.addEventListener('error', function () {
      if (!cur) return;
      // Emisoras HLS o formatos que el navegador no abre: se pasan al reproductor del equipo
      if (cur.kind === 'radio' && !triedNative && A) {
        triedNative = true; var c = cur; AU.stop();
        launch({ queue: [{ id: 'radio:' + (c.uuid || c.url), url: c.url, title: c.title, subtitle: c.sub || 'Radio', alts: [] }], index: 0, live: true }, { item: { key: 'radio:' + c.url, name: c.title }, noRecord: true });
        return;
      }
      setStatus('No se pudo reproducir');
      if (cur.kind !== 'radio' && idx < queue.length - 1) setTimeout(function () { idx++; start(); }, 1200);
    });
    return {
      status: '',
      play: function (list, i) { queue = list; idx = i || 0; start(); },
      toggle: function () { if (!cur) return; if (el.paused) el.play(); else el.pause(); draw(); },
      next: function () { if (idx < queue.length - 1) { idx++; start(); } },
      prev: function () { if (el.currentTime > 5) el.currentTime = 0; else if (idx > 0) { idx--; start(); } },
      stop: function () { el.pause(); el.removeAttribute('src'); el.load(); cur = null; queue = []; draw(); },
      current: function () { return cur; },
      draw: draw
    };
  })();

  // ---------- Otras apps ----------
  var APPS = {
    youtube: { name: 'YouTube', pkgs: ['com.google.android.youtube.tv', 'com.google.android.youtube.googletv', 'com.google.android.youtube'], web: 'https://www.youtube.com' },
    ytkids: { name: 'YouTube Kids', pkgs: ['com.google.android.youtube.tvkids', 'com.google.android.apps.youtube.kids'], web: 'https://www.youtubekids.com' },
    ytmusic: { name: 'YouTube Music', pkgs: ['com.google.android.apps.youtube.music'], web: 'https://music.youtube.com' },
    spotify: { name: 'Spotify', pkgs: ['com.spotify.tv.android', 'com.spotify.music'], web: 'https://open.spotify.com' },
    deezer: { name: 'Deezer', pkgs: ['deezer.android.tv', 'deezer.android.app'], web: 'https://www.deezer.com' },
    amazon: { name: 'Amazon Music', pkgs: ['com.amazon.mp3'], web: 'https://music.amazon.com' },
    apple: { name: 'Apple Music', pkgs: ['com.apple.android.music'], web: 'https://music.apple.com' },
    brave: { name: 'Brave', pkgs: ['com.brave.browser'], web: 'https://brave.com/download/' },
    kick: { name: 'Kick', pkgs: ['com.kick.mobile'], web: 'https://kick.com' },
    twitch: { name: 'Twitch', pkgs: ['tv.twitch.android.viewer', 'tv.twitch.android.app'], web: 'https://www.twitch.tv' }
  };
  var installed = null;
  function appsInstalled() {
    if (installed || !A || !A.appsInstalled) return installed || {};
    var all = []; Object.keys(APPS).forEach(function (k) { all = all.concat(APPS[k].pkgs); });
    try { installed = JSON.parse(A.appsInstalled(JSON.stringify(all))); } catch (e) { installed = {}; }
    return installed;
  }
  function hasApp(k) { var m = appsInstalled(); return APPS[k].pkgs.some(function (p) { return m[p]; }); }
  function openApp(k, url) {
    if (AU.current()) AU.stop();
    var a = APPS[k];
    // Apps que no están en la tienda: si no está instalada, abre su página de descargas
    if (a.noStore && A && !hasApp(k)) {
      if (a.web) A.openExternal(a.web);
      else MV.toast('La app ' + a.name + ' no está instalada en este equipo. Instala su APK y vuelve a intentar.', 5000);
      return;
    }
    if (A && A.openApp) A.openApp(JSON.stringify({ pkgs: a.pkgs, url: url || '' }));
    else window.open(url || a.web, '_blank');
  }
  function appTile(k, sub) {
    var a = APPS[k], ok = !A || hasApp(k);
    return '<button class="apptile glass f" data-act="openApp" data-arg="' + k + '"><b>' + esc(a.name) + '</b><span>' + esc(ok ? (sub || 'Abrir') : a.noStore ? 'Descargar desde GitHub' : 'Instalar desde la tienda') + '</span></button>';
  }

  // ---------- YouTube dentro de la app (reproductor oficial incrustado + YouTube Data API) ----------
  var YT = { cat: 'trend', q: '', list: null, loading: false, key: '', error: '', cache: {} };
  var YT_CATS = [['trend', 'Tendencias', ''], ['10', 'Música', ''], ['17', 'Deportes', ''], ['24', 'Entretenimiento', ''], ['23', 'Comedia', ''], ['20', 'Videojuegos', ''], ['25', 'Noticias', 's'], ['27', 'Educación', 's'], ['s:recetas fáciles', 'Recetas', 's'], ['s:documental completo', 'Documentales', 's'], ['s:podcast en español', 'Podcasts', 's']];
  function ytApi(path) {
    var url = 'https://www.googleapis.com/youtube/v3/' + path + '&key=' + encodeURIComponent(P.ytKey);
    var c = YT.cache[url]; if (c && c.ts > Date.now() - 30 * 60e3) return Promise.resolve(c.data);
    return MV.getText(url).then(function (t) {
      var j = JSON.parse(t);
      if (j.error) throw new Error(j.error.message || 'Error de YouTube');
      YT.cache[url] = { ts: Date.now(), data: j }; return j;
    });
  }
  function ytItem(v) {
    var id = typeof v.id === 'string' ? v.id : (v.id && v.id.videoId); var sn = v.snippet || {};
    if (!id) return null;
    var th = sn.thumbnails || {};
    return { id: id, title: (sn.title || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'), channel: sn.channelTitle || '', thumb: (th.high || th.medium || th.default || {}).url || '', live: sn.liveBroadcastContent === 'live' };
  }
  function loadYT() {
    var key = YT.cat + '|' + YT.q;
    if (YT.key === key || YT.loading || !P.ytKey) return;
    YT.loading = true; YT.error = '';
    var safe = MV.isKids() ? 'strict' : 'moderate', job;
    if (YT.q || YT.cat.indexOf('s:') === 0 || ['25', '27'].indexOf(YT.cat) >= 0) {
      var q = YT.q || (YT.cat.indexOf('s:') === 0 ? YT.cat.slice(2) : YT.cat === '25' ? 'noticias en vivo' : 'clase explicada');
      job = ytApi('search?part=snippet&type=video&maxResults=40&regionCode=CO&relevanceLanguage=es&safeSearch=' + safe + '&q=' + encodeURIComponent(q));
    } else {
      job = ytApi('videos?part=snippet&chart=mostPopular&maxResults=40&regionCode=CO&hl=es' + (YT.cat !== 'trend' ? '&videoCategoryId=' + YT.cat : ''));
    }
    job.then(function (j) { YT.list = (j.items || []).map(ytItem).filter(Boolean); })
      .catch(function (e) { YT.list = []; YT.error = e.message; })
      .then(function () { YT.loading = false; YT.key = key; if (view.name === 'youtube') MV.rerender(); });
  }
  VIEWS.youtube = function () {
    var kids = MV.isKids();
    if (kids) return top('YouTube Kids') + '<div class="panel glass"><p>Videos para niños en la app oficial de YouTube Kids.</p><div class="apps">' + appTile('ytkids', 'Abrir YouTube Kids') + '</div></div>';
    var html = top('YouTube', '<button class="pill f" data-act="openApp" data-arg="youtube">' + IC.yt.replace('<svg', '<svg width="18" height="18"') + 'Abrir app de YouTube</button>');
    if (!P.ytKey) {
      return html + '<div class="empty glass"><h2>Ver YouTube aquí mismo</h2><p class="muted">Para buscar y ver videos dentro de MiVibra TV hace falta una clave gratuita de la API de YouTube. ' +
        (MV.acct.canEdit() ? 'Ponla en Ajustes › Sinopsis y carátulas.' : 'El administrador aún no la ha configurado.') + ' Mientras tanto puedes usar la app oficial.</p>' +
        '<div class="btns" style="justify-content:center">' + (MV.acct.canEdit() ? '<button class="btn f" data-act="ytKeySetup" data-autofocus>Configurar clave</button>' : '') + '<button class="btn ghost f" data-act="openApp" data-arg="youtube">Abrir app de YouTube</button></div></div>' +
        '<h3 style="margin:18px 0 10px">Más apps de YouTube</h3><div class="apps">' + appTile('ytkids', 'Para niños') + '</div>';
    }
    loadYT();
    html += '<div style="display:flex;gap:10px;margin:0 0 12px;flex-wrap:wrap"><input class="in f" id="ytIn" value="' + esc(YT.q) + '" placeholder="Buscar en YouTube" style="flex:1;min-width:220px" autocomplete="off" enterkeyhint="search"><button class="btn f" data-act="ytSearch">' + IC.search + 'Buscar</button></div>' +
      '<div class="chips">' + YT_CATS.map(function (c) { return '<button class="chip f' + (!YT.q && YT.cat === c[0] ? ' on' : '') + '" data-act="ytCat" data-arg="' + esc(c[0]) + '">' + esc(c[1]) + '</button>'; }).join('') + '</div>';
    if (YT.loading && !YT.list) return html + '<div class="panel glass" style="display:flex;gap:14px;align-items:center"><div class="spinner"></div><b>Cargando videos…</b></div>';
    if (YT.error) return html + '<div class="panel glass"><p>YouTube respondió: ' + esc(YT.error) + '</p><p class="muted" style="font-size:13px">Si dice "quota", se acabó el cupo gratis del día (se renueva a medianoche, hora del Pacífico). Puedes usar la app oficial mientras tanto.</p></div>';
    var list = YT.list || [];
    if (!list.length) return html + '<div class="empty glass"><p class="muted">No encontré videos.</p></div>';
    MV._ytList = list;
    return html + '<div class="vgrid">' + list.map(function (v, i) {
      return '<button class="vcard f" data-act="ytPlay" data-arg="' + i + '" data-fid="y-' + v.id + '" style="animation-delay:' + Math.min(i, 12) * 0.03 + 's"><div class="th"><img loading="lazy" src="' + esc(v.thumb) + '" alt="" onerror="this.remove()">' + (v.live ? '<span class="tag">EN VIVO</span>' : '') + '</div><b>' + esc(v.title) + '</b><span>' + esc(v.channel) + '</span></button>';
    }).join('') + '</div>';
  };
  VIEWS.youtube.after = function () { var i = document.getElementById('ytIn'); if (i) i.addEventListener('keydown', function (e) { if (e.key === 'Enter') ACT.ytSearch(); }); };
  function ytOpen(q) { openApp('youtube', 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q)); }

  // Reproductor a pantalla completa con controles para control remoto
  // Ventana flotante: mientras haya un video de YouTube, Twitch o Kick abierto, al salir con Inicio sigue visible en una ventanita
  function pipSet() {
    var on = !!((MV.ytPlayer && MV.ytPlayer.isOpen()) || (MV.streamOpen && MV.streamOpen()));
    try { if (A && A.setPip) A.setPip(on); } catch (e) {}
  }
  MV.onPip = function (on) {
    document.documentElement.classList.toggle('pip', !!on);
    if (!on && MV.ytPlayer && MV.ytPlayer.isOpen()) MV.ytPlayer.touch();
  };
  // La app dejó de verse (pantalla apagada, ventana flotante cerrada): YouTube se pausa
  MV.onHidden = function () { if (MV.ytPlayer && MV.ytPlayer.isOpen()) MV.ytPlayer.pause(); };
  var YTP = MV.ytPlayer = (function () {
    var player = null, list = [], idx = 0, apiReady = null, hideT = null, open = false;
    function api() {
      if (apiReady) return apiReady;
      apiReady = new Promise(function (res, rej) {
        if (window.YT && window.YT.Player) return res();
        window.onYouTubeIframeAPIReady = function () { res(); };
        var s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.onerror = function () { apiReady = null; rej(new Error('Sin conexión con YouTube')); };
        document.head.appendChild(s);
      });
      return apiReady;
    }
    function box() { return document.getElementById('ytp'); }
    function showBar() {
      var b = box(); if (!b) return; b.classList.add('ui');
      clearTimeout(hideT); hideT = setTimeout(function () { b.classList.remove('ui'); }, 4000);
    }
    function frame() {
      var v = list[idx] || {};
      var b = box();
      b.innerHTML = '<div id="ytFrame"></div><button class="iconbtn x" data-yt="close" aria-label="Cerrar video">' + IC.close + '</button><div class="bar"><div class="t"><b>' + esc(v.title || '') + '</b><span>' + esc(v.channel || '') + (list.length > 1 ? ' · ' + (idx + 1) + ' de ' + list.length : '') + '</span></div>' +
        '<div class="ctl"><button class="iconbtn" data-yt="prev" aria-label="Anterior">' + IC.prev + '</button><button class="iconbtn" data-yt="back10" aria-label="Atrás 10 s">−10</button><button class="iconbtn on" data-yt="toggle" aria-label="Pausa">' + IC.pause + '</button><button class="iconbtn" data-yt="fwd10" aria-label="Adelante 10 s">+10</button><button class="iconbtn" data-yt="next" aria-label="Siguiente">' + IC.next + '</button><button class="iconbtn" data-yt="close" aria-label="Cerrar">' + IC.close + '</button></div></div>';
      b.querySelectorAll('[data-yt]').forEach(function (btn) { btn.onclick = function (e) { e.stopPropagation(); act(btn.dataset.yt); }; });
    }
    function load() {
      var v = list[idx]; if (!v) return;
      frame(); showBar();
      api().then(function () {
        if (player && player.destroy) { try { player.destroy(); } catch (e) {} }
        player = new window.YT.Player('ytFrame', {
          width: '100%', height: '100%', videoId: v.id,
          playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, fs: 0, hl: 'es', cc_lang_pref: 'es', origin: location.origin },
          events: {
            onReady: function (e) { try { e.target.playVideo(); } catch (x) {} },
            onStateChange: function (e) {
              var t = box().querySelector('[data-yt="toggle"]');
              if (t) t.innerHTML = e.data === 1 ? IC.pause : IC.play;
              if (e.data === 0) act('next');
            },
            onError: function (e) {
              var m = { 2: 'Video no válido', 5: 'No se puede reproducir aquí', 100: 'El video ya no existe', 101: 'El dueño no permite verlo fuera de YouTube', 150: 'El dueño no permite verlo fuera de YouTube', 152: 'YouTube bloqueó la reproducción aquí', 153: 'YouTube bloqueó la reproducción aquí' }[e.data] || 'Error ' + e.data;
              MV.toast(m + '. Abriéndolo en la app de YouTube…', 4000);
              openApp('youtube', 'https://www.youtube.com/watch?v=' + v.id); close();
            }
          }
        });
        var f = box().querySelector('iframe'); if (f) { f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture'); f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin'); }
      }).catch(function (e) { MV.toast(e.message); close(); });
    }
    function act(a) {
      showBar();
      if (a === 'close') return close();
      if (a === 'next') { if (idx < list.length - 1) { idx++; load(); } else close(); return; }
      if (a === 'prev') { if (idx > 0) { idx--; load(); } return; }
      if (!player || !player.getPlayerState) return;
      if (a === 'toggle') { if (player.getPlayerState() === 1) player.pauseVideo(); else player.playVideo(); }
      if (a === 'back10' || a === 'fwd10') player.seekTo(Math.max(0, player.getCurrentTime() + (a === 'fwd10' ? 10 : -10)), true);
    }
    function close() {
      open = false;
      pipSet();
      if (player && player.destroy) { try { player.destroy(); } catch (e) {} }
      player = null;
      var b = box(); b.hidden = true; b.innerHTML = ''; b.classList.remove('ui');
      document.body.classList.remove('yt-open');
      setTimeout(function () { var el = document.querySelector('[data-fid="y-' + ((list[idx] || {}).id || '') + '"]'); if (el) el.focus(); else MV.focusFirst(); }, 50);
    }
    // Control remoto mientras el video está abierto: OK pausa, ◀ ▶ adelanta/atrasa, ▲ ▼ anterior/siguiente
    document.addEventListener('keydown', function (e) {
      if (!open) return;
      var k = e.key, map = { Enter: 'toggle', ' ': 'toggle', MediaPlayPause: 'toggle', ArrowLeft: 'back10', ArrowRight: 'fwd10', ArrowUp: 'prev', ArrowDown: 'next', MediaTrackNext: 'next', MediaTrackPrevious: 'prev', Escape: 'close' };
      if (map[k]) { e.preventDefault(); e.stopImmediatePropagation(); act(map[k]); }
    }, true);
    window.addEventListener('blur', function () { if (open) setTimeout(function () { if (document.activeElement && document.activeElement.tagName === 'IFRAME') window.focus(); }, 0); });
    return {
      isOpen: function () { return open; },
      play: function (l, i) {
        if (AU.current()) AU.stop();
        list = l; idx = i || 0; open = true;
        var b = box(); b.hidden = false; b.classList.toggle('tv', !!MV.device.tv); document.body.classList.add('yt-open');
        load(); pipSet();
      },
      pause: function () { try { if (player && player.pauseVideo) player.pauseVideo(); } catch (e) {} },
      close: close,
      act: act,
      touch: showBar
    };
  })();

  function tvTabs(cur) {
    return '<div class="seg sortseg">' + [['live', 'Canales'], ['guide', 'Guía']].map(function (t) { return '<button class="chip f' + (cur === t[0] ? ' on' : '') + '" data-act="nav" data-arg="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';
  }
  // ---------- Utilidades ----------
  MV.remoteTab = function () { setTab = 'remote'; };
  VIEWS.utils = function () {
    return top('Utilidades') + '<div class="utilgrid">' + UTILS.map(function (u, i) {
      return '<button class="utile glass f" data-act="nav" data-arg="' + u[0] + '" data-fid="u-' + u[0] + '" style="animation-delay:' + i * 0.05 + 's"><span class="uic">' + IC[u[2]] + '</span><b>' + u[1] + '</b><span>' + u[3] + '</span></button>';
    }).join('') +
      '<button class="utile glass f" data-act="nav" data-arg="streams" data-fid="u-streams"><span class="uic">' + IC.play + '</span><b>Twitch y Kick</b><span>Transmisiones en vivo aquí mismo</span></button>' +
      '<button class="utile glass f" data-act="openDiag" data-fid="u-diag"><span class="uic">' + IC.settings + '</span><b>Diagnóstico MiVibra</b><span>Revisa y optimiza este equipo</span></button>' +
      '<button class="utile glass f" data-act="adultOpen" data-fid="u-adult"><span class="uic">' + IC.lock + '</span><b>+18</b><span>' + (MV.adultOk() ? 'Desbloqueado' : 'Protegido con PIN') + '</span></button>' +
      '<button class="utile glass f" data-act="go" data-arg="settings" data-fid="u-remote" onclick="MV.remoteTab&&MV.remoteTab()"><span class="uic">' + IC.phone + '</span><b>Celular como control</b><span>Control remoto y mando de juegos</span></button></div>';
  };

  // ---------- Twitch y Kick dentro de MiVibra (reproductores oficiales incrustados) ----------
  var STREAM = { tab: 'twitch' };
  var STREAM_SUGGEST = {
    twitch: [['ibai', 'Ibai'], ['auronplay', 'AuronPlay'], ['elmariana', 'El Mariana'], ['rubius', 'Rubius'], ['juansguarnizo', 'JuanSGuarnizo'], ['illojuan', 'IlloJuan'], ['thegrefg', 'TheGrefg'], ['spreen', 'Spreen'], ['elxokas', 'ElXokas'], ['quackity', 'Quackity'], ['rivers_gg', 'Rivers'], ['moistcr1tikal', 'MoistCr1TiKaL']],
    kick: [['westcol', 'Westcol'], ['elzeein', 'ElZeein'], ['coscu', 'Coscu'], ['roshtein', 'Roshtein'], ['adinross', 'Adin Ross'], ['xqc', 'xQc'], ['amouranth', 'Amouranth'], ['trainwreckstv', 'Trainwreck']]
  };
  function streamFavs() { return MV.load('streamFavs', { twitch: [], kick: [] }); }
  function streamUrl(tab, ch) {
    ch = encodeURIComponent(String(ch).trim().toLowerCase().replace(/^@/, '').replace(/^https?:\/\/(www\.)?(twitch\.tv|kick\.com)\//, '').split(/[/?#]/)[0]);
    return tab === 'kick' ? 'https://player.kick.com/' + ch + '?autoplay=true&muted=false'
      : 'https://player.twitch.tv/?channel=' + ch + '&parent=' + location.hostname + '&autoplay=true&muted=false';
  }
  var streamBox = null;
  MV.streamOpen = function () { return !!(streamBox && streamBox.isConnected); };
  var barT = null;
  function streamBarShow() {
    if (!streamBox) return;
    streamBox.classList.remove('hidebar');
    clearTimeout(barT);
    barT = setTimeout(function () { if (streamBox) streamBox.classList.add('hidebar'); }, 3500);
  }
  MV.streamKey = function () { if (!MV.streamOpen()) return false; var hidden = streamBox.classList.contains('hidebar'); streamBarShow(); return hidden; };
  MV.streamClose = function () { clearTimeout(barT); if (streamBox) { streamBox.remove(); streamBox = null; } pipSet(); MV.focusFirst(); };
  function streamPlay(tab, ch) {
    if (!ch) return;
    if (AU.current()) AU.stop();
    if (streamBox) streamBox.remove();
    streamBox = document.createElement('div');
    streamBox.className = 'streambox';
    streamBox.innerHTML = '<iframe src="' + esc(streamUrl(tab, ch)) + '" allow="autoplay; fullscreen; encrypted-media" allowfullscreen></iframe>' +
      '<div class="streambar"><b>' + esc(ch) + ' · ' + (tab === 'kick' ? 'Kick' : 'Twitch') + '</b><button class="btn ghost sm f" data-act="streamFav" data-arg="' + esc(tab + ':' + ch) + '">' + IC.star + 'Guardar canal</button><button class="btn sm f" data-act="streamClose" data-autofocus>' + IC.close + 'Cerrar</button></div>';
    document.body.appendChild(streamBox);
    var b = streamBox.querySelector('[data-autofocus]'); if (b) b.focus();
    ['mousemove', 'touchstart', 'pointerdown'].forEach(function (ev) { streamBox.addEventListener(ev, streamBarShow, { passive: true }); });
    streamBarShow(); pipSet();
  }
  // Canales en vivo ahora (APIs oficiales con las claves del administrador)
  var LIVE = { tok: {}, data: {}, at: {}, loading: {}, err: {}, lang: 'es' };
  MV.streamReset = function () { LIVE.tok = {}; LIVE.data = {}; LIVE.at = {}; LIVE.err = {}; };
  function postForm(url, body) {
    if (MV.native) return MV.call('httpPost', [url, body, 'application/x-www-form-urlencoded']).then(function (d) { return JSON.parse(d.text || '{}'); });
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body }).then(function (r) { return r.json(); });
  }
  function liveToken(tab) {
    var k = P.streamKeys || {}, id = tab === 'kick' ? k.kickId : k.twitchId, sec = tab === 'kick' ? k.kickSecret : k.twitchSecret;
    if (!id || !sec) return Promise.reject(new Error('nokey'));
    var t = LIVE.tok[tab]; if (t && t.exp > Date.now()) return Promise.resolve(t.v);
    var url = tab === 'kick' ? 'https://id.kick.com/oauth/token' : 'https://id.twitch.tv/oauth2/token';
    return postForm(url, 'grant_type=client_credentials&client_id=' + encodeURIComponent(id) + '&client_secret=' + encodeURIComponent(sec)).then(function (j) {
      if (!j.access_token) throw new Error(j.message || j.error_description || j.error || 'Clave rechazada');
      LIVE.tok[tab] = { v: j.access_token, exp: Date.now() + Math.max(60, (j.expires_in || 3600) - 120) * 1000 };
      return j.access_token;
    });
  }
  function liveHasKey(tab) { var k = P.streamKeys || {}; return tab === 'kick' ? !!(k.kickId && k.kickSecret) : !!(k.twitchId && k.twitchSecret); }
  function loadLive(tab) {
    var key = tab + '|' + LIVE.lang;
    if (LIVE.loading[key] || (LIVE.data[key] && Date.now() - LIVE.at[key] < 120000) || !liveHasKey(tab)) return;
    LIVE.loading[key] = true; delete LIVE.err[key];
    var k = P.streamKeys || {}, es = LIVE.lang === 'es';
    liveToken(tab).then(function (tok) {
      if (tab === 'kick') {
        return MV.getText('https://api.kick.com/public/v1/livestreams?limit=60&sort=viewer_count' + (es ? '&language=es' : ''), { Authorization: 'Bearer ' + tok, Accept: 'application/json' }).then(function (t) {
          return (JSON.parse(t).data || []).map(function (s) {
            var ch = s.slug || (s.channel && s.channel.slug) || '';
            return ch ? { ch: ch, name: s.username || s.slug, title: s.stream_title || s.title || '', viewers: s.viewer_count || 0, thumb: typeof s.thumbnail === 'string' ? s.thumbnail : (s.thumbnail && s.thumbnail.url) || s.profile_picture || '', game: (s.category && s.category.name) || '' } : null;
          }).filter(Boolean);
        });
      }
      return MV.getText('https://api.twitch.tv/helix/streams?first=60' + (es ? '&language=es' : ''), { 'Client-Id': k.twitchId, Authorization: 'Bearer ' + tok }).then(function (t) {
        return (JSON.parse(t).data || []).map(function (s) {
          return { ch: s.user_login, name: s.user_name || s.user_login, title: s.title || '', viewers: s.viewer_count || 0, thumb: (s.thumbnail_url || '').replace('{width}', '440').replace('{height}', '248'), game: s.game_name || '' };
        });
      });
    }).then(function (list) {
      list.sort(function (a, b) { return b.viewers - a.viewers; });
      LIVE.data[key] = list; LIVE.at[key] = Date.now();
    }).catch(function (e) { LIVE.err[key] = e.message === 'nokey' ? '' : (e.message || 'Error'); LIVE.data[key] = LIVE.data[key] || []; LIVE.at[key] = Date.now(); })
      .then(function () { LIVE.loading[key] = false; if (view.name === 'streams' && !MV.streamOpen()) MV.rerender(); });
  }
  function fmtViewers(n) { return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '') + ' mil' : String(n); }
  function liveHtml(tab) {
    var name = tab === 'kick' ? 'Kick' : 'Twitch';
    var head = '<div style="display:flex;align-items:center;gap:12px;margin:14px 0 8px;flex-wrap:wrap"><h3 style="margin:0">En vivo ahora en ' + name + '</h3><div class="chips" style="margin:0">' +
      [['es', 'Español'], ['all', 'Todos']].map(function (l) { return '<button class="chip f' + (LIVE.lang === l[0] ? ' on' : '') + '" data-act="liveLang" data-arg="' + l[0] + '">' + l[1] + '</button>'; }).join('') + '</div></div>';
    if (!liveHasKey(tab)) {
      return '<h3 style="margin:14px 0 8px">En vivo ahora</h3><div class="panel glass"><p class="muted" style="margin:0">Para ver aquí los canales que están transmitiendo ahora, el administrador debe poner las claves gratuitas de ' + name + ' en Ajustes › Sinopsis y carátulas.</p>' +
        (MV.acct.canEdit() ? '<div class="btns"><button class="btn ghost sm f" data-act="ytKeySetup">Configurar claves</button></div>' : '') + '</div>';
    }
    var key = tab + '|' + LIVE.lang, list = LIVE.data[key];
    loadLive(tab);
    if (!list) return head + '<div class="panel glass" style="display:flex;gap:14px;align-items:center"><div class="spinner"></div><b>Buscando canales en vivo…</b></div>';
    if (LIVE.err[key]) return head + '<div class="panel glass"><p>' + name + ' respondió: ' + esc(LIVE.err[key]) + '</p><p class="muted" style="font-size:13px">Revisa el Client ID y el Client Secret en Ajustes.</p></div>';
    if (!list.length) return head + '<div class="empty glass"><p class="muted">No hay canales en vivo con este filtro.</p></div>';
    return head + '<div class="vgrid">' + list.map(function (v, i) {
      return '<button class="vcard f" data-act="streamGo" data-arg="' + esc(tab + ':' + v.ch) + '" data-fid="lv-' + esc(v.ch) + '" style="animation-delay:' + Math.min(i, 12) * 0.03 + 's"><div class="th">' + (v.thumb ? '<img loading="lazy" src="' + esc(v.thumb) + '" alt="" onerror="this.remove()">' : '') +
        '<span class="tag">EN VIVO · ' + fmtViewers(v.viewers) + '</span></div><b>' + esc(v.title || v.name) + '</b><span>' + esc(v.name) + (v.game ? ' · ' + esc(v.game) : '') + '</span></button>';
    }).join('') + '</div>';
  }
  VIEWS.streams = function () {
    var tab = STREAM.tab, favs = streamFavs()[tab] || [];
    var chip = function (ch, label) { return '<button class="chip f" data-act="streamGo" data-arg="' + esc(tab + ':' + ch) + '">' + esc(label || ch) + '</button>'; };
    return top('Twitch y Kick') + '<div class="chips">' + [['twitch', 'Twitch'], ['kick', 'Kick']].map(function (t) { return '<button class="chip f' + (tab === t[0] ? ' on' : '') + '" data-act="streamTab" data-arg="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div style="display:flex;gap:10px;margin:6px 0 10px;flex-wrap:wrap"><input class="in f" id="streamIn" placeholder="Nombre del canal (ej: ' + (tab === 'kick' ? 'westcol' : 'ibai') + ')" style="flex:1;min-width:220px" autocomplete="off" enterkeyhint="go"' + (MV.device.tv ? ' inputmode="none"' : '') + '><button class="btn f" data-act="streamOpenIn">' + IC.play + 'Ver en vivo</button></div>' +
      (MV.device.tv ? tvKbd('streamIn', false) : '') +
      (favs.length ? '<h3 style="margin:8px 0">Tus canales</h3><div class="chips">' + favs.map(function (c) { return chip(c) + '<button class="chip f" data-act="streamUnfav" data-arg="' + esc(tab + ':' + c) + '" aria-label="Quitar">' + IC.close + '</button>'; }).join('') + '</div>' : '') +
      liveHtml(tab) +
      '<h3 style="margin:14px 0 8px">Canales populares</h3><div class="chips">' + STREAM_SUGGEST[tab].map(function (c) { return chip(c[0], c[1]); }).join('') + '</div>' +
      '<p class="muted" style="font-size:13px;margin-top:16px">Se ve con el reproductor oficial de ' + (tab === 'kick' ? 'Kick' : 'Twitch') + ' dentro de MiVibra. Si el canal no está en vivo, aparece su pantalla de "desconectado". Atrás o Cerrar vuelve aquí.</p>' +
      '<div class="btns"><button class="btn ghost f" data-act="streamBrowse">Explorar ' + (tab === 'kick' ? 'Kick' : 'Twitch') + ' en el navegador de la app</button></div>';
  };
  VIEWS.streams.after = function () { var i = document.getElementById('streamIn'); if (i) i.addEventListener('keydown', function (e) { if (e.key === 'Enter') { MV._typedAt = Date.now(); ACT.streamOpenIn(); } }); };

  // ---------- Navegador ----------
  var BROWSER_SITES = [['Google', 'https://www.google.com'], ['YouTube', 'https://m.youtube.com'], ['Wikipedia', 'https://es.wikipedia.org'], ['Noticias', 'https://news.google.com/?hl=es-419&gl=CO&ceid=CO:es-419'], ['El Tiempo', 'https://www.eltiempo.com'], ['Clima', 'https://www.google.com/search?q=clima'], ['Mapas', 'https://www.google.com/maps'], ['Fútbol', 'https://www.google.com/search?q=resultados+futbol']];
  function openBrowser(url) {
    if (AU.current()) AU.stop();
    if (A && A.openBrowser) A.openBrowser(url || ''); else window.open(url || 'https://www.google.com', '_blank');
  }
  VIEWS.browser = function () {
    var brave = !A || hasApp('brave');
    return top('Navegador') +
      '<div class="searchbar glass">' + IC.search + '<input class="in f" id="webIn" placeholder="Buscar en Google o escribir una dirección" autocomplete="off" enterkeyhint="go" inputmode="url" data-autofocus><button class="btn f" data-act="webGo">Ir</button></div>' +
      '<div class="apps" style="margin-bottom:18px"><button class="apptile glass f" data-act="webOpen" data-arg=""><b>Navegador MiVibra</b><span>Pantalla completa · bloqueador de anuncios · cursor con el control</span></button>' +
      '<button class="apptile glass f" data-act="openApp" data-arg="brave"><b>Brave</b><span>' + (brave ? 'Abrir Brave' : 'Instalar Brave desde la tienda') + '</span></button></div>' +
      '<h3 style="margin:6px 0 10px">Accesos rápidos</h3><div class="apps">' + BROWSER_SITES.map(function (x) { return '<button class="apptile glass f" data-act="webOpen" data-arg="' + esc(x[1]) + '"><b>' + esc(x[0]) + '</b><span>' + esc(x[1].replace(/^https?:\/\/(www\.|m\.)?/, '').split('/')[0]) + '</span></button>'; }).join('') + '</div>' +
      '<p class="muted" style="margin-top:16px;font-size:13px">' + (MV.device.tv ? 'En la TV: las flechas mueven el cursor y OK hace clic. MENÚ muestra la barra (dirección, favoritos, bloqueador , modo escritorio y cursor ). Atrás vuelve a la página anterior.' : 'Toca para ver cuántos anuncios se bloquearon o desactivar el bloqueador en una página que no cargue bien.') + '</p>';
  };
  VIEWS.browser.after = function () { var i = document.getElementById('webIn'); if (i) i.addEventListener('keydown', function (e) { if (e.key === 'Enter') ACT.webGo(); }); };

  // ---------- Radio (directorio abierto Radio Browser) ----------
  var RB_HOSTS = ['https://de1.api.radio-browser.info', 'https://de2.api.radio-browser.info', 'https://fi1.api.radio-browser.info', 'https://nl1.api.radio-browser.info'], rbI = 0;
  function RB() { return RB_HOSTS[rbI % RB_HOSTS.length] + '/json'; }
  function rbGet(path) {
    var tries = 0;
    function go() {
      return MV.getText(RB() + path).then(function (t) { return JSON.parse(t); }).catch(function (e) { if (++tries < RB_HOSTS.length) { rbI++; return go(); } throw e; });
    }
    return go();
  }
  var RADIO = { scope: 'CO', tag: '', q: '', list: null, loading: false, key: '', error: '' };
  var RADIO_SCOPES = [['CO', 'Colombia'], ['MX', 'México'], ['AR', 'Argentina'], ['ES', 'España'], ['US', 'Estados Unidos'], ['VE', 'Venezuela'], ['PE', 'Perú'], ['CL', 'Chile'], ['EC', 'Ecuador'], ['', 'Todo el mundo'], ['fav', '★ Favoritas']];
  var RADIO_TAGS = [['', 'Todas'], ['news', 'Noticias'], ['salsa', 'Salsa'], ['vallenato', 'Vallenato'], ['reggaeton', 'Reggaetón'], ['tropical', 'Tropical'], ['pop', 'Pop'], ['rock', 'Rock'], ['romantic', 'Románticas'], ['christian', 'Cristianas'], ['classical', 'Clásica'], ['jazz', 'Jazz'], ['electronic', 'Electrónica'], ['sports', 'Deportes'], ['talk', 'Hablada']];
  function radioFavs() { return MV.load('radioFavs', []); }
  function stToItem(s) {
    return { kind: 'radio', uuid: s.stationuuid, title: (s.name || '').trim(), url: s.url_resolved || s.url, art: s.favicon || '', sub: [s.country, (s.tags || '').split(',').slice(0, 2).join(', ')].filter(Boolean).join(' · '), hls: !!s.hls };
  }
  function loadRadio() {
    var key = RADIO.scope + '|' + RADIO.tag + '|' + RADIO.q;
    if (RADIO.scope === 'fav') { RADIO.list = radioFavs(); RADIO.key = key; return; }
    if (RADIO.key === key || RADIO.loading) return;
    RADIO.loading = true; RADIO.error = '';
    var qs = '/stations/search?hidebroken=true&order=clickcount&reverse=true&limit=120' + (RADIO.scope ? '&countrycode=' + RADIO.scope : '') + (RADIO.tag ? '&tag=' + encodeURIComponent(RADIO.tag) : '') + (RADIO.q ? '&name=' + encodeURIComponent(RADIO.q) : '');
    rbGet(qs).then(function (arr) {
      var seen = {};
      RADIO.list = arr.filter(function (s) { var k = (s.name || '').trim().toLowerCase(); if (!k || seen[k] || !(s.url_resolved || s.url)) return false; seen[k] = 1; return true; }).map(stToItem);
    }).catch(function (e) { RADIO.list = []; RADIO.error = e.message; }).then(function () {
      RADIO.loading = false; RADIO.key = key;
      if (view.name === 'radio') MV.rerender();
    });
  }
  VIEWS.radio = function () {
    loadRadio();
    var favSet = {}; radioFavs().forEach(function (f) { favSet[f.url] = 1; });
    var cur = AU.current();
    var html = top('Radio') + '<div class="chips">' + RADIO_SCOPES.map(function (c) { return '<button class="chip f' + (RADIO.scope === c[0] ? ' on' : '') + '" data-act="radioScope" data-arg="' + c[0] + '">' + esc(c[1]) + '</button>'; }).join('') + '</div>' +
      (RADIO.scope !== 'fav' ? '<div class="chips">' + RADIO_TAGS.map(function (c) { return '<button class="chip f' + (RADIO.tag === c[0] ? ' on' : '') + '" data-act="radioTag" data-arg="' + c[0] + '">' + esc(c[1]) + '</button>'; }).join('') + '</div>' +
        '<div style="display:flex;gap:10px;margin:4px 0 16px;flex-wrap:wrap"><input class="in f" id="radioIn" value="' + esc(RADIO.q) + '" placeholder="Buscar emisora (ej. Caracol, Tropicana, La Mega)" style="flex:1;min-width:220px" autocomplete="off" enterkeyhint="search"><button class="btn f" data-act="radioSearch">' + IC.search + 'Buscar</button></div>' : '');
    if (RADIO.loading && !RADIO.list) return html + '<div class="panel glass" style="display:flex;gap:14px;align-items:center"><div class="spinner"></div><b>Buscando emisoras…</b></div>';
    var list = RADIO.list || [];
    if (!list.length) return html + '<div class="empty glass"><p class="muted">' + (RADIO.error ? 'No se pudo conectar con el directorio de radios.' : RADIO.scope === 'fav' ? 'Aún no tienes emisoras favoritas. Mantén presionada una emisora o usa la estrella.' : 'No encontré emisoras con ese filtro.') + '</p></div>';
    MV._radioList = list;
    return html + '<div class="stations">' + list.slice(0, limits.radio || 60).map(function (s, i) {
      var on = cur && cur.url === s.url;
      return '<div class="station glass' + (on ? ' on' : '') + '"><button class="f play" data-act="radioPlay" data-arg="' + i + '" data-fid="r-' + MV.hash(s.url) + '"><div class="logo" style="--h:' + MV.hue(s.title) + '">' + (s.art ? '<img loading="lazy" src="' + esc(s.art) + '" alt="" onerror="this.remove()">' : '') + '<i>' + esc(MV.mono(s.title)) + '</i></div><div class="t"><b>' + esc(s.title) + '</b><span>' + esc(s.sub) + '</span></div></button>' +
        '<button class="iconbtn f' + (favSet[s.url] ? ' on' : '') + '" data-act="radioFav" data-arg="' + i + '" aria-label="Favorita">' + IC.star + '</button></div>';
    }).join('') + '</div>' + (list.length > (limits.radio || 60) ? '<button class="btn ghost more f" data-act="more" data-arg="radio">Ver más (' + (list.length - (limits.radio || 60)) + ')</button>' : '') +
      '<p class="muted" style="font-size:12px;margin-top:16px">Emisoras del directorio abierto radio-browser.info. Las transmiten las propias emisoras.</p>';
  };
  VIEWS.radio.after = function () { var i = document.getElementById('radioIn'); if (i) i.addEventListener('keydown', function (e) { if (e.key === 'Enter') ACT.radioSearch(); }); };

  // ---------- Música ----------
  var MUSIC = { tab: 'ytm', local: null, scanning: false, genre: '', q: '', aud: null, audKey: '', audLoading: false, host: '' };
  var AUD_GENRES = [['', 'Tendencias'], ['Latin', 'Latina'], ['Electronic', 'Electrónica'], ['Hip-Hop/Rap', 'Hip-Hop'], ['Pop', 'Pop'], ['Rock', 'Rock'], ['Lo-Fi', 'Lo-Fi'], ['R&B/Soul', 'R&B'], ['Reggae', 'Reggae'], ['Acoustic', 'Acústica'], ['Jazz', 'Jazz'], ['Classical', 'Clásica'], ['Ambient', 'Relajante']];
  var MUSIC_EXT = ['mp3', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wav'];
  function mediaUrl(path, ext) {
    var b = btoa(unescape(encodeURIComponent(path))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return 'https://appassets.androidplatform.net/media/' + b + '.' + ext;
  }
  function scanMusic() {
    if (!A) { MV.toast('Disponible en la app instalada'); return; }
    if (!A.hasStorageAccess()) { MV.toast('Dale permiso a MiVibra TV para ver tus archivos y vuelve'); A.requestStorageAccess(); return; }
    var roots = JSON.parse(A.storageRoots()).filter(function (r) { return r.readable; }).map(function (r) { return r.path; }).concat((P.romRoots || []).filter(function (p) { return p.indexOf('content://') === 0; }));
    MUSIC.scanning = true; MV.rerender();
    MV.call('scanRoms', [JSON.stringify(roots), JSON.stringify(MUSIC_EXT)]).then(function (arr) {
      MUSIC.local = arr.map(function (f) {
        var parts = f.path.split('/'), folder = decodeURIComponent(parts[parts.length - 2] || 'Música');
        return { kind: 'music', title: f.name.replace(/\.[^.]+$/, '').replace(/_/g, ' '), sub: folder, folder: folder, url: mediaUrl(f.path, f.ext) };
      }).sort(function (a, b) { return a.folder.localeCompare(b.folder) || a.title.localeCompare(b.title); });
      MV.save('musicCache', MUSIC.local.slice(0, 3000));
    }).catch(function (e) { MV.toast(e.message); }).then(function () { MUSIC.scanning = false; if (view.name === 'music') MV.rerender(); });
  }
  function audHost() {
    if (MUSIC.host) return Promise.resolve(MUSIC.host);
    return MV.getText('https://api.audius.co').then(function (t) { var d = []; try { d = JSON.parse(t).data || []; } catch (e) {} MUSIC.host = (Array.isArray(d) && d[0]) || 'https://api.audius.co'; return MUSIC.host; })
      .catch(function () { MUSIC.host = 'https://api.audius.co'; return MUSIC.host; });
  }
  function loadAudius() {
    var key = MUSIC.genre + '|' + MUSIC.q;
    if (MUSIC.audKey === key || MUSIC.audLoading) return;
    MUSIC.audLoading = true;
    audHost().then(function (h) {
      var path = MUSIC.q ? '/v1/tracks/search?query=' + encodeURIComponent(MUSIC.q) : '/v1/tracks/trending?time=week' + (MUSIC.genre ? '&genre=' + encodeURIComponent(MUSIC.genre) : '');
      return MV.getText(h + path + (path.indexOf('?') > 0 ? '&' : '?') + 'app_name=MiVibraTV').then(function (t) {
        MUSIC.aud = (JSON.parse(t).data || []).filter(function (x) { return x.is_streamable !== false; }).slice(0, 60).map(function (x) {
          return { kind: 'music', title: x.title, sub: (x.user && x.user.name) || '', art: (x.artwork && (x.artwork['480x480'] || x.artwork['150x150'])) || '', url: h + '/v1/tracks/' + x.id + '/stream?app_name=MiVibraTV', dur: x.duration };
        });
      });
    }).catch(function () { MUSIC.aud = []; MUSIC.host = ''; }).then(function () { MUSIC.audLoading = false; MUSIC.audKey = key; if (view.name === 'music') MV.rerender(); });
  }
  function trackRows(list, act) {
    var cur = AU.current();
    return '<div class="tracks">' + list.map(function (t, i) {
      var on = cur && cur.url === t.url;
      return '<button class="track f' + (on ? ' on' : '') + '" data-act="' + act + '" data-arg="' + i + '" data-fid="t-' + MV.hash(t.url) + '"><div class="art" style="--h:' + MV.hue(t.title) + '">' + (t.art ? '<img loading="lazy" src="' + esc(t.art) + '" alt="" onerror="this.remove()">' : '') + IC.music + '</div><div class="t"><b>' + esc(t.title) + '</b><span>' + esc(t.sub) + (t.dur ? ' · ' + Math.floor(t.dur / 60) + ':' + ('0' + t.dur % 60).slice(-2) : '') + '</span></div>' + (on ? '<i class="eq"></i>' : '') + '</button>';
    }).join('') + '</div>';
  }
  VIEWS.music = function () {
    var tabs = [['ytm', 'YouTube Music'], ['mine', 'Mi música'], ['free', 'Música libre']];
    var html = top('Música') + '<div class="chips">' + tabs.map(function (t) { return '<button class="chip f' + (MUSIC.tab === t[0] ? ' on' : '') + '" data-act="musicTab" data-arg="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';
    if (MUSIC.tab === 'apps') MUSIC.tab = 'mine';
    if (MUSIC.tab === 'ytm') return html + ytMusic();
    if (MUSIC.tab === 'free') {
      loadAudius();
      html += '<div class="chips">' + AUD_GENRES.map(function (g) { return '<button class="chip f' + (!MUSIC.q && MUSIC.genre === g[0] ? ' on' : '') + '" data-act="musicGenre" data-arg="' + esc(g[0]) + '">' + esc(g[1]) + '</button>'; }).join('') + '</div>' +
        '<div style="display:flex;gap:10px;margin:4px 0 16px;flex-wrap:wrap"><input class="in f" id="musicIn" value="' + esc(MUSIC.q) + '" placeholder="Buscar canción o artista" style="flex:1;min-width:220px" autocomplete="off" enterkeyhint="search"><button class="btn f" data-act="musicSearch">' + IC.search + 'Buscar</button></div>';
      if (MUSIC.audLoading && !MUSIC.aud) return html + '<div class="panel glass" style="display:flex;gap:14px;align-items:center"><div class="spinner"></div><b>Cargando canciones…</b></div>';
      if (!MUSIC.aud || !MUSIC.aud.length) return html + '<div class="empty glass"><p class="muted">No encontré canciones. Prueba otro género o búsqueda.</p></div>';
      return html + trackRows(MUSIC.aud, 'audPlay') + '<p class="muted" style="font-size:12px;margin-top:16px">Música publicada gratis por sus propios artistas en Audius.</p>';
    }
    if (!MUSIC.local) MUSIC.local = MV.load('musicCache', null);
    html += '<div class="btns" style="margin-bottom:14px"><button class="btn f" data-act="musicScan">' + IC.refresh + (MUSIC.local ? 'Volver a buscar' : 'Buscar mi música') + '</button><button class="btn ghost f" data-act="romRoots">' + IC.usb + 'Carpetas y unidades</button>' + (MUSIC.local && MUSIC.local.length ? '<button class="btn ghost f" data-act="musicShuffle">Aleatorio</button>' : '') + '</div>';
    if (MUSIC.scanning) return html + '<div class="panel glass" style="display:flex;gap:14px;align-items:center"><div class="spinner"></div><b>Buscando canciones en el equipo y las USB…</b></div>';
    if (!MUSIC.local) return html + '<div class="empty glass"><h2>Tu música, aquí</h2><p class="muted">Busca canciones (MP3, M4A, FLAC, OGG, WAV) en la memoria del equipo y en memorias USB o discos conectados.</p></div>';
    if (!MUSIC.local.length) return html + '<div class="empty glass"><p class="muted">No encontré canciones. Conecta una USB o elige una carpeta en "Carpetas y unidades".</p></div>';
    return html + '<p class="muted" style="margin:0 0 10px">' + MUSIC.local.length + ' canciones</p>' + trackRows(MUSIC.local.slice(0, limits.music || 200), 'localPlay') +
      (MUSIC.local.length > (limits.music || 200) ? '<button class="btn ghost more f" data-act="more" data-arg="music">Ver más</button>' : '');
  };
  VIEWS.music.after = function () {
    var i = document.getElementById('musicIn'); if (i) i.addEventListener('keydown', function (e) { if (e.key === 'Enter') ACT.musicSearch(); });
    var y = document.getElementById('ytmIn'); if (y) y.addEventListener('keydown', function (e) { if (e.key === 'Enter') { MV._typedAt = Date.now(); ACT.ytmSearch(); } });
  };
  /** YouTube Music dentro de MiVibra: canciones y videos musicales de YouTube con el reproductor de la app (en cola, una tras otra). */
  var YTM = { cat: 'top', q: '', list: null, loading: false, key: '', error: '' };
  var YTM_CATS = [['top', 'Lo más escuchado'], ['reggaeton', 'Reggaetón'], ['vallenato', 'Vallenato'], ['salsa', 'Salsa'], ['bachata', 'Bachata'], ['pop latino', 'Pop latino'], ['rock en español', 'Rock en español'], ['regional mexicano', 'Regional mexicano'], ['electronica', 'Electrónica'], ['baladas', 'Baladas'], ['cristiana', 'Cristiana'], ['lofi para estudiar', 'Lo-fi'], ['infantil canciones', 'Infantil']];
  function loadYTM() {
    var key = YTM.cat + '|' + YTM.q;
    if (YTM.key === key || YTM.loading || !P.ytKey) return;
    YTM.loading = true; YTM.error = '';
    var job = (!YTM.q && YTM.cat === 'top')
      ? ytApi('videos?part=snippet&chart=mostPopular&maxResults=50&regionCode=CO&hl=es&videoCategoryId=10')
      : ytApi('search?part=snippet&type=video&videoCategoryId=10&maxResults=40&regionCode=CO&relevanceLanguage=es&safeSearch=' + (MV.isKids() ? 'strict' : 'moderate') + '&q=' + encodeURIComponent((YTM.q || YTM.cat) + (YTM.q ? '' : ' 2026')));
    job.then(function (j) { YTM.list = (j.items || []).map(ytItem).filter(Boolean); })
      .catch(function (e) { YTM.list = []; YTM.error = e.message; })
      .then(function () { YTM.loading = false; YTM.key = key; if (view.name === 'music') MV.rerender(); });
  }
  function ytMusic() {
    if (!P.ytKey) return '<div class="empty glass"><h2>YouTube Music aquí mismo</h2><p class="muted">Hace falta la clave gratuita de la API de YouTube (la misma de YouTube). ' + (MV.acct.canEdit() ? 'Ponla en Ajustes › Sinopsis y carátulas.' : 'El administrador aún no la ha configurado.') + '</p></div>';
    loadYTM();
    var html = '<div class="chips">' + YTM_CATS.map(function (c) { return '<button class="chip f' + (!YTM.q && YTM.cat === c[0] ? ' on' : '') + '" data-act="ytmCat" data-arg="' + esc(c[0]) + '">' + esc(c[1]) + '</button>'; }).join('') + '</div>' +
      '<div style="display:flex;gap:10px;margin:4px 0 16px;flex-wrap:wrap"><input class="in f" id="ytmIn" value="' + esc(YTM.q) + '" placeholder="Buscar canción, artista o álbum" style="flex:1;min-width:220px" autocomplete="off" enterkeyhint="search"' + (MV.device.tv ? ' inputmode="none"' : '') + '><button class="btn f" data-act="ytmSearch">' + IC.search + 'Buscar</button></div>';
    if (YTM.loading && !YTM.list) return html + '<div class="panel glass" style="display:flex;gap:14px;align-items:center"><div class="spinner"></div><b>Cargando música…</b></div>';
    if (YTM.error) return html + '<div class="panel glass"><p>YouTube respondió: ' + esc(YTM.error) + '</p></div>';
    var list = YTM.list || [];
    if (!list.length) return html + '<div class="empty glass"><p class="muted">No encontré canciones.</p></div>';
    MV._ytmList = list;
    return html + '<div class="btns" style="margin:0 0 12px"><button class="btn f" data-act="ytmPlay" data-arg="0">' + IC.play + 'Reproducir todo</button></div>' +
      '<div class="vgrid">' + list.map(function (v, i) {
        return '<button class="vcard f" data-act="ytmPlay" data-arg="' + i + '" data-fid="ym-' + v.id + '"><div class="th"><img loading="lazy" src="' + esc(v.thumb) + '" alt="" onerror="this.remove()"></div><b>' + esc(v.title) + '</b><span>' + esc(v.channel) + '</span></button>';
      }).join('') + '</div>' +
      '<p class="muted" style="font-size:12px;margin-top:14px">Se reproduce en el reproductor de YouTube dentro de MiVibra, una canción tras otra.</p>';
  }

  // ---------- Eventos de la app ----------
  /** Fila "MiVibra · Recomendado" en el inicio de Android TV: seguir viendo + sugeridos del perfil (con carátula). */
  var homeSig = '';
  var publishHome = MV.debounce(function () {
    if (!A || !A.publishHome || !MV.device.tv || !MV.profile() || S.loading) return;
    var kids = MV.isKids(), seen = {}, out = [];
    var cont = (MV.continueList ? MV.continueList() : []).filter(function (i) { return i.type !== 'live' && (!kids || MV.kidsOk(i)); });
    var pool = cont.concat(kids ? MV.visible(S.items).filter(function (i) { return i.type !== 'live'; }) : suggested());
    pool.forEach(function (i) {
      if (out.length >= 20) return;
      var key = i.parent || i.key, base = S.byKey[key] || i, poster = MV.poster(base);
      if (seen[key] || !/^https?:/.test(poster || '')) return;
      seen[key] = 1;
      out.push({ key: key, title: base.name, desc: base.plot || base.group || '', poster: poster, type: base.type });
    });
    var sig = JSON.stringify(out.map(function (x) { return x.key; }));
    if (!out.length || sig === homeSig) return;
    homeSig = sig;
    try { A.publishHome(JSON.stringify(out)); } catch (e) {}
  }, 4000);
  MV.on('catalog', publishHome);
  MV.on('profile', publishHome);
  MV.on('catalog', function () { if (!S.loading && MV.purgeAdult) MV.purgeAdult(); });
  MV.on('catalog', function () { if (['boot', 'profiles', 'profileEdit', 'settings', 'games'].indexOf(view.name) < 0) MV.rerender(); });
  MV.on('epg', function () { if (view.name === 'guide' || view.name === 'live' || view.name === 'home') MV.rerender(); });
  MV.on('synced', function () { if (view.name === 'home' || view.name === 'history' || view.name === 'favs') MV.rerender(); });
  MV.on('sync', function () { if (view.name === 'settings') MV.rerender(); });
  MV.on('dupes', function () {
    var el = document.getElementById('dupesTxt');
    if (el && view.name === 'settings') { var d = S.dupes; el.textContent = d.running ? 'Probando señales… ' + d.done + ' de ' + d.total : d.total + ' canales repetidos revisados · se dejó la señal que funciona' + (d.fixed ? ' (' + d.fixed + ' cambiadas)' : ''); }
  });
  MV.on('acct', function () {
    if (view.name === 'login' && MV.acct.status === 'denied') MV.rerender();
    if (view.name !== 'login' && MV.acct.status === 'denied') MV.go('login', null, { replace: true });
    // Solo las pestañas que muestran el estado de la cuenta o del envío a la nube se redibujan (y una sola vez)
    if (view.name === 'settings' && ['lists', 'users', 'account', 'menu', 'sync'].indexOf(setTab) >= 0 && !acctRedraw) {
      acctRedraw = setTimeout(function () { acctRedraw = null; if (view.name === 'settings' && !MV.modalOpen()) MV.rerender(); }, 250);
    }
  });
  var acctRedraw = null;
  MV.onStorageChanged = function () { if (view.name === 'games') { MV.toast('Unidad conectada: buscando juegos…'); ACT.scanRoms(); } };
  MV.onResume = function () { if (view.name === 'games') MV.rerender(); };
  MV.onOpenFile = function (d) {
    if (!MV.acct.canEdit()) { MV.toast('Solo el administrador puede agregar listas'); return; }
    fetch(d.path).then(function (r) { return r.text(); }).then(function (txt) {
      if (!/#EXTINF/i.test(txt.slice(0, 20000)) && (MV.parseMacList(txt).length || (MV.parseUrlList(txt) || []).length)) { MV.go('settings'); setTimeout(function () { multiWith(txt); }, 300); return 'multi'; }
      var l = { id: 'l' + Date.now().toString(36), type: 'file', name: 'Lista abierta', enabled: true, added: Date.now(), updatedAt: Date.now() };
      return MV.idbSet('raw:' + l.id, txt).then(function () { S.lists.push(l); MV.saveLists(); return MV.reloadCatalog(true); });
    }).then(function (r) { if (r === 'multi') return; MV.toast('Lista agregada'); MV.rerender(); });
  };

  // Tiempo de pantalla de perfiles infantiles (también cuenta en los menús)
  setInterval(function () {
    if (!MV.isKids() || document.hidden || +P.kidsLimit <= 0) return;
    MV.addKidsMinutes(1);
    if (MV.kidsLeft() <= 0 && !MV.modalOpen()) kidsTimeUp();
  }, 60000);

  // ---------- Arranque ----------
  function boot() {
    MV.applyLook();
    render();
    if (MV.acct.managed()) {
      MV.acct.start().then(function (u) {
        if (!u) { MV.go('login', null, { replace: true }); return; }
        continueBoot();
      });
      return;
    }
    if (MV.sync.configured()) MV.sync.load().catch(function () {});
    continueBoot();
  }
  function continueBoot() {
    if (!S.profiles.length) { editSel = null; MV.go('profileEdit', null, { replace: true }); }
    // Siempre se empieza eligiendo perfil (la cuenta de Google se pide antes, si no hay sesión)
    else MV.go('profiles', null, { replace: true });
    if (S.lists.length) MV.reloadCatalog(false);
  }

  // ---------- Tutorial guiado (una sola vez por sección y por perfil) ----------
  // Cada paso resalta un botón real de la pantalla y explica para qué sirve. Si el botón no existe, el paso se salta.
  var TV = MV.device.tv, PRESS = TV ? 'Presiona' : 'Toca';
  var TOUR = {
    shell: [
      ['.side', 'Menú principal', TV ? 'Con la flecha izquierda abres el menú: Inicio, En vivo, Películas, Series, Plataformas, Anime, K-Drama, Infantil y Documentales.' : 'Aquí cambias de sección: Inicio, En vivo, Películas, Series, Plataformas, Anime, K-Drama, Infantil y Documentales.'],
      ['[data-fid="q-utils"]', 'Utilidades', 'YouTube, música, radio, navegador, juegos, Twitch y Kick, el diagnóstico de la app y el contenido +18 protegido con PIN.'],
      ['[data-fid="q-discover"]', 'Descubrir', 'Estrenos y tendencias del momento. Te marca cuáles ya están en tus listas para verlos al instante.'],
      ['[data-fid="q-search"]', 'Buscar', 'Busca en canales, películas, series y anime a la vez. No importan las tildes y entiende pequeños errores.'],
      ['[data-fid="q-favs"]', 'Favoritos', 'Todo lo que marques con la estrella queda guardado aquí.'],
      ['[data-fid="q-history"]', 'Historial', 'Lo último que viste, para retomarlo donde lo dejaste.'],
      ['[data-fid="q-prof"]', 'Tu perfil', 'Ajustes, cambiar de perfil y cerrar sesión. Desde Ajustes puedes volver a ver este tutorial.']
    ],
    home: [
      ['.hero', 'Recuadro principal', 'Muestra el último canal que viste (o uno recomendado) con vista previa. ' + PRESS + ' para abrirlo de una.'],
      ['.view-in .row', 'Filas de contenido', 'Continuar viendo, tus favoritos y recomendaciones. Muévete a los lados para ver más.']
    ],
    live: [
      ['.sortseg', 'Canales y Guía', 'Cambia entre la lista de canales y la guía de programación (qué están dando ahora y después).'],
      ['.view-in .chips', 'Secciones y países', 'Filtra por tipo de canal (noticias, deportes, infantiles…) y por país.'],
      ['.cats', 'Categorías', 'Las categorías de tu lista. Elige una para ver solo esos canales.'],
      ['.chlist', 'Canales', PRESS + ' un canal para verlo. Dentro del reproductor ' + (TV ? 'la flecha izquierda o OK abre la lista de canales; arriba y abajo cambian de canal.' : 'el botón de lista abre todos los canales, con filtros de países y deportes.')]
    ],
    catalog: [
      ['.fbar', 'Filtros', 'Filtra por categoría, plataforma o género, y cambia el orden. "Western" muestra solo películas del oeste.'],
      ['[data-act="viewMode"]', 'Filas o cuadrícula', 'Cambia entre ver el contenido por filas (Estrenos, por año, Oscar, géneros…) o todo en cuadrícula.'],
      ['.view-in .row', 'Estrenos primero', 'Lo más nuevo aparece arriba y se actualiza solo. Más abajo: por año, ganadoras del Oscar y por género.']
    ],
    detail: [
      ['.detail [data-act="resume"], .detail [data-act="play"]', 'Reproducir', 'Empieza a ver o continúa donde quedaste. En series, al terminar un capítulo el siguiente arranca solo.'],
      ['.detail [data-act="fav"]', 'Favorito', 'Guárdalo en tus favoritos para encontrarlo rápido.'],
      ['.detail [data-act="langMenu"]', 'Audio y subtítulos', 'Elige el idioma del audio y los subtítulos antes de empezar.'],
      ['#eps', 'Temporadas y capítulos', 'Elige la temporada y el capítulo que quieras ver.'],
      ['#related', 'Relacionadas', 'Más títulos parecidos a este.']
    ],
    search: [
      ['#searchIn', 'Escribe lo que buscas', TV ? 'Usa el teclado de la pantalla. Al bajar a los resultados el teclado se esconde; vuelve a la caja para que aparezca.' : 'Los resultados aparecen mientras escribes.'],
      ['#stypes', 'Tipo de contenido', 'Filtra los resultados: todo, canales, películas, series…']
    ],
    utils: [
      ['.utilgrid', 'Herramientas', 'Cada recuadro abre una herramienta. El contenido +18 pide el PIN de control parental y no aparece en Inicio ni en el historial.']
    ],
    streams: [
      ['[data-act="streamTab"]', 'Twitch o Kick', 'Elige la plataforma.'],
      ['#streamIn', 'Buscar un canal', 'Escribe el nombre del canal y presiona "Ver en vivo" o "Listo".'],
      ['.view-in .vgrid', 'En vivo ahora', 'Canales transmitiendo en este momento, ordenados por espectadores. ' + PRESS + ' uno para verlo.'],
      ['[data-act="streamFav"], .view-in h3', 'Tus canales', 'Al ver un canal puedes guardarlo para tenerlo siempre a mano.']
    ],
    youtube: [
      ['#ytIn', 'Buscar en YouTube', 'Busca videos y míralos sin salir de MiVibra.'],
      ['.view-in .chips', 'Categorías', 'Tendencias, música, noticias, deportes y más.']
    ],
    music: [
      ['.view-in .chips', 'Fuentes de música', 'YouTube Music, tu música guardada en el equipo y música libre.'],
      ['#musicIn', 'Buscar', 'Busca canciones o artistas.']
    ],
    radio: [
      ['#radioIn', 'Buscar emisoras', 'Busca por nombre o ciudad.'],
      ['.view-in .chips', 'Filtros', 'Colombia o el mundo, y por género musical. La estrella guarda tus emisoras.']
    ],
    games: [
      ['[data-act="remoteQR"]', 'Celular como mando', 'Escanea el código con tu celular y úsalo como control para jugar.'],
      ['.view-in .pgrid, .view-in .row', 'Tus juegos', 'Los juegos encontrados en el equipo, por consola.']
    ],
    discover: [
      ['[data-act="discOnly"]', 'Solo lo que tienes', 'Muestra únicamente títulos que están en tus listas.'],
      ['.view-in .row', 'Tendencias y estrenos', 'Lo más visto de la semana. ' + PRESS + ' un título para ver su ficha.']
    ],
    favs: [['.view-in .row, .view-in .grid', 'Tus favoritos', 'Todo lo que marcaste con la estrella, separado por tipo.']],
    history: [['.view-in .row, .view-in .line', 'Tu historial', 'Lo último que viste. El botón de la papelera, arriba, lo borra.']],
    settings: [
      ['.view-in .chips', 'Secciones de ajustes', 'Listas, apariencia, reproducción, control parental, perfiles, cuenta y más.']
    ],
    profiles: [
      ['.profiles', '¿Quién está viendo?', 'Cada perfil tiene sus favoritos, historial y avatar. Los perfiles infantiles solo muestran contenido para niños.'],
      ['[data-act="manageProfiles"]', 'Administrar perfiles', 'Crea perfiles, cambia nombres y diseña tu avatar 3D.']
    ],
    kids: [
      ['.view-in .row', 'Para niños', 'Solo contenido infantil animado y seguro.']
    ]
  };
  ['movies', 'series', 'anime', 'kdrama', 'infantil', 'docs', 'platforms'].forEach(function (k) { TOUR[k] = TOUR.catalog; });
  var TOUR_KEY = { movies: 'catalog', series: 'catalog', anime: 'catalog', kdrama: 'catalog', infantil: 'catalog', docs: 'catalog', platforms: 'catalog' };
  function tourSeen() { return MV.load('tour:' + (S.pid || 'default'), {}); }
  function tourMark(k) { var t = tourSeen(); t[k] = 1; MV.save('tour:' + (S.pid || 'default'), t); }
  MV.tourReset = function () { MV.save('tour:' + (S.pid || 'default'), {}); };
  var tour = null, tourT = null;
  MV.tourOpen = function () { return !!tour; };
  function tourCheck() {
    clearTimeout(tourT);
    if (tour) { if (tour.view !== view.name) tourEnd(false); else { setTimeout(tourShow, 60); return; } }
    var name = view.name, seen = tourSeen();
    if (seen._off || !TOUR[name] || !S.pid && name !== 'profiles') return;
    var keys = [];
    if (name !== 'profiles' && !MV.isKids() && !seen.shell) keys.push('shell');
    var k = TOUR_KEY[name] || name;
    if (!seen[k]) keys.push(k);
    if (!keys.length) return;
    tourT = setTimeout(function () {
      if (view.name !== name || MV.modalOpen() || (MV.streamOpen && MV.streamOpen()) || (MV.ytPlayer && MV.ytPlayer.isOpen())) return;
      var steps = [];
      keys.forEach(function (kk) { (kk === 'shell' ? TOUR.shell : TOUR[name]).forEach(function (st) { if (document.querySelector(st[0])) steps.push(st); }); });
      keys.forEach(tourMark);
      if (!steps.length) return;
      tour = { view: name, steps: steps, i: 0, back: document.activeElement };
      tourShow();
    }, 900);
  }
  function tourShow() {
    if (!tour) return;
    var st = tour.steps[tour.i], el = document.querySelector(st[0]);
    if (!el) { if (tour.i < tour.steps.length - 1) { tour.i++; return tourShow(); } return tourEnd(true); }
    try { el.scrollIntoView({ block: 'nearest', behavior: 'instant' }); } catch (e) {}
    var box = document.getElementById('tour');
    if (!box) { box = document.createElement('div'); box.id = 'tour'; document.body.appendChild(box); }
    var last = tour.i === tour.steps.length - 1;
    box.innerHTML = '<div class="tour-hole"></div><div class="tour-tip glass" role="dialog" aria-live="polite"><small>' + (tour.i + 1) + ' de ' + tour.steps.length + '</small><h3>' + esc(st[1]) + '</h3><p>' + esc(st[2]) + '</p>' +
      '<div class="btns"><button class="btn f tour-b" data-t="next">' + (last ? 'Entendido' : 'Siguiente') + '</button>' + (tour.i ? '<button class="btn ghost f tour-b" data-t="prev">Atrás</button>' : '') +
      (!last ? '<button class="btn ghost f tour-b" data-t="skip">Saltar</button>' : '') + '</div>' +
      (tour.i === 0 ? '<button class="tour-off tour-b f" data-t="off">No volver a mostrar tutoriales</button>' : '') + '</div>';
    Array.prototype.forEach.call(box.querySelectorAll('.tour-b'), function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); tourBtn(b.dataset.t); }); });
    requestAnimationFrame(function () { tourPlace(el, box); box.querySelector('.tour-b').focus({ preventScroll: true }); });
  }
  function tourPlace(el, box) {
    var r = el.getBoundingClientRect(), W = innerWidth, H = innerHeight, pad = 6;
    var x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad), w = Math.min(W - 8, r.width + pad * 2), h = Math.min(H - 8, r.height + pad * 2);
    if (y + h > H - 4) h = H - 4 - y;
    var hole = box.querySelector('.tour-hole'), tip = box.querySelector('.tour-tip');
    hole.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px';
    var tw = Math.min(360, W - 24), th = tip.offsetHeight || 170, tx, ty;
    if (r.right + 16 + tw < W && h > H * 0.45) { tx = r.right + 16; ty = Math.min(Math.max(12, r.top), H - th - 12); }   // elemento alto (menú lateral, listas): al lado
    else {
      tx = Math.min(Math.max(12, r.left), W - tw - 12);
      ty = y + h + 12 + th < H ? y + h + 12 : y - th - 12 >= 8 ? y - th - 12 : Math.max(12, H - th - 12);
    }
    tip.style.cssText = 'left:' + tx + 'px;top:' + ty + 'px;width:' + tw + 'px';
  }
  function tourBtn(t) {
    if (!tour) return;
    if (t === 'next') { if (tour.i < tour.steps.length - 1) { tour.i++; tourShow(); } else tourEnd(true); }
    else if (t === 'prev') { tour.i = Math.max(0, tour.i - 1); tourShow(); }
    else if (t === 'skip') tourEnd(true);
    else if (t === 'off') { var s2 = tourSeen(); s2._off = 1; MV.save('tour:' + (S.pid || 'default'), s2); tourEnd(true); MV.toast('Puedes volver a verlo en Ajustes › Temas'); }
  }
  function tourEnd(refocus) {
    var box = document.getElementById('tour'); if (box) box.remove();
    var back = tour && tour.back; tour = null;
    if (refocus) { if (back && document.body.contains(back)) back.focus({ preventScroll: true }); else MV.focusFirst(); }
  }
  MV.tourClose = function () { if (tour) tourEnd(true); };
  // Mientras está abierto, el control solo maneja los botones del tutorial
  window.addEventListener('keydown', function (e) {
    if (!tour) return;
    var bs = Array.prototype.slice.call(document.querySelectorAll('#tour .tour-b')), i = bs.indexOf(document.activeElement), k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
      var d = k === 'ArrowRight' || k === 'ArrowDown' ? 1 : -1;
      (bs[(Math.max(i, 0) + d + bs.length) % bs.length] || bs[0]).focus({ preventScroll: true });
    } else if (k === 'Enter' || k === ' ' || k === 'NumpadEnter') { (bs[i] || bs[0]).click(); }
    else if (k === 'Escape' || k === 'GoBack' || k === 'BrowserBack') tourEnd(true);
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  window.addEventListener('resize', function () { if (tour) tourShow(); });
  // Primera vez que se abre el reproductor: cómo se maneja (el reproductor es nativo y no se puede señalar)
  function playerHint(isLive, go) {
    var seen = tourSeen();
    if (seen._off || seen.player) return go();
    tourMark('player');
    var li = TV ? [
      'OK muestra u oculta los controles; se esconden solos.',
      isLive ? 'Flecha izquierda u OK abre la lista de canales, con buscador, favoritos, países y deportes.' : 'Izquierda y derecha retroceden o adelantan; el botón +1:30 salta la intro.',
      isLive ? 'Arriba y abajo cambian de canal.' : 'En series, el siguiente capítulo empieza solo al terminar.',
      'Inicio te deja seguir viendo en ventana flotante. Atrás cierra el reproductor.'
    ] : [
      'Toca la pantalla para ver los controles; se esconden solos.',
      isLive ? 'El botón de lista abre todos los canales, con buscador, favoritos, países y deportes. En vertical, la lista queda debajo del video.' : 'Los botones de los lados retroceden o adelantan; +1:30 salta la intro.',
      'La estrella guarda el canal o título en favoritos y el altavoz silencia.',
      'Gira el celular para pantalla completa. Al salir de la app sigue en ventana flotante.'
    ];
    MV._hintGo = go;
    MV.modal('<h2>Cómo usar el reproductor</h2><ul class="hintlist">' + li.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul><div class="btns"><button class="btn f" data-act="hintGo" data-autofocus>' + IC.play + 'Entendido, reproducir</button></div>',
      { onClose: function () { var g = MV._hintGo; MV._hintGo = null; if (g) setTimeout(g, 50); } });
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
