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
  };

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
    if (MV.ytPlayer && MV.ytPlayer.isOpen()) { MV.ytPlayer.close(); return true; }
    if (MV.modalOpen()) { MV.closeModal(); return true; }
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

  function navItems() {
    if (MV.isKids()) return [['kids', 'Inicio', IC.home], ['search', 'Buscar', IC.search], ['youtube', 'YouTube Kids', IC.yt]];
    return [
      ['home', 'Inicio', IC.home], ['search', 'Buscar', IC.search], ['discover', 'Descubrir', IC.compass], ['live', 'En vivo', IC.live], ['youtube', 'YouTube', IC.yt], ['music', 'Música', IC.music], ['radio', 'Radio', IC.radio], ['guide', 'Guía', IC.guide],
      ['movies', 'Películas', IC.movie], ['series', 'Series', IC.series], ['platforms', 'Plataformas', IC.platforms], ['anime', 'Anime', IC.anime], ['kdrama', 'K-Drama', IC.kdrama],
      ['docs', 'Documentales', IC.doc], ['favs', 'Favoritos', IC.star], ['history', 'Historial', IC.history], ['games', 'Juegos', IC.games],
      ['settings', 'Ajustes', IC.settings]
    ];
  }

  // ---------- Render ----------
  var VIEWS = {};
  function render(keepFocus) {
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
          return '<button class="nav f' + (view.name === n[0] ? ' on' : '') + '" data-act="nav" data-arg="' + n[0] + '" data-fid="nav-' + n[0] + '">' + n[2] + n[1] + '</button>';
        }).join('') +
        '<div class="sp" style="flex:1"></div>' +
        (p ? '<button class="nav f" data-act="go" data-arg="profiles" data-fid="nav-prof"><img class="avatar" src="' + esc(p.avatar) + '" alt="">' + esc(p.name) + '</button>' : '') +
        '</nav>';
      app.innerHTML = '<div class="shell">' + side + '<main class="main"><div class="view-in">' + body + '</div></main></div>';
    }
    if (VIEWS[view.name] && VIEWS[view.name].after) VIEWS[view.name].after(view.arg);
    if (!keepFocus) setTimeout(function () { MV.focusFirst(); }, 30);
  }
  MV.render = render;
  MV.rerender = function () { var f = document.activeElement, fid = f && f.dataset && f.dataset.fid; render(true); var el = fid && document.querySelector('[data-fid="' + fid + '"]'); if (el) el.focus({ preventScroll: true }); else MV.focusFirst(); };

  // ---------- Piezas ----------
  function thumbInner(it, big) {
    var img = MV.poster(it);
    var isLogo = it.type === 'live' && !big;
    var mono = '<span class="mono">' + esc(MV.mono(MV.cleanTitle(it.name) || it.name)) + '</span>';
    if (!img) return mono;
    return '<img class="' + (isLogo ? 'logo' : '') + '" loading="lazy" src="' + esc(img) + '" alt="" onerror="this.outerHTML=\'' + mono.replace(/'/g, "\\'").replace(/"/g, '&quot;') + '\'">';
  }
  function card(it, kind, i) {
    reg(it);
    kind = kind || (it.type === 'live' ? 'ch' : 'poster');
    var sub = '';
    if (it.type === 'live') { var nn = MV.nowNext(it); sub = nn.now ? nn.now.t : (it.group || ''); }
    else sub = [it.year, it.type === 'series' ? 'Serie' : '', it.group].filter(Boolean).join(' · ');
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
      '<p class="muted">El administrador aún no ha agregado listas. Cuando lo haga, todo aparecerá aquí automáticamente.</p></div>';
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
      return '<button class="prof f" style="animation-delay:' + i * 0.08 + 's" data-act="pickProfile" data-arg="' + p.id + '" data-fid="p-' + p.id + '"><div class="av"><img src="' + esc(p.avatar) + '" alt="">' +
        (p.pin ? '<span class="lock">' + IC.lock.replace('<svg', '<svg width="18" height="18" style="color:var(--accent)"') + '</span>' : '') +
        (p.kids ? '<span class="kid">NIÑOS</span>' : '') + '</div><b>' + esc(p.name) + '</b></button>';
    }).join('');
    html += '<button class="prof f" data-act="go" data-arg="profileEdit"><div class="add">' + IC.plus.replace('<svg', '<svg width="44" height="44" style="color:var(--accent)"') + '</div><b class="muted">Agregar perfil</b></button></div>';
    if (S.profiles.length) html += '<div class="btns"><button class="btn ghost f" data-act="manageProfiles">Administrar perfiles</button></div>';
    return html;
  };
  var editTab = 'vibrent', editSel = null, editKids = false;
  VIEWS.profileEdit = function (id) {
    var p = S.profiles.find(function (x) { return x.id === id; });
    if (editSel === null) { editSel = p ? p.avatar : D.DEFAULT_AVATARS[S.profiles.length % D.DEFAULT_AVATARS.length]; editKids = !!(p && p.kids); }
    var g = D.AVATAR_GROUPS.find(function (x) { return x.id === editTab; }) || D.AVATAR_GROUPS[0];
    return '<div style="width:min(1100px,100%);display:flex;gap:30px;flex-wrap:wrap;align-items:flex-start">' +
      '<div style="flex:0 0 260px;display:flex;flex-direction:column;gap:14px;align-items:center">' +
      '<div style="width:200px;height:200px;border-radius:50px;overflow:hidden;background:#F3EFEA;box-shadow:0 0 0 4px var(--accent),0 30px 60px rgba(0,0,0,.5);animation:float 4s ease-in-out infinite"><img src="' + esc(editSel) + '" alt="" style="width:100%;height:100%;object-fit:cover"></div>' +
      '<label class="field" style="width:100%">Nombre del perfil<input class="in f" id="profName" value="' + esc(p ? p.name : '') + '" placeholder="Ej: Papá" maxlength="20" data-autofocus></label>' +
      '<div class="line" style="width:100%"><div class="t"><b>Perfil infantil</b><span>Solo contenido para niños y límite de tiempo</span></div><button class="toggle f' + (editKids ? ' on' : '') + '" data-act="editKids" aria-label="Perfil infantil"></button></div>' +
      '<div class="btns" style="width:100%"><button class="btn f" style="flex:1" data-act="saveProfile" data-arg="' + (p ? p.id : '') + '">Guardar perfil</button></div>' +
      (p ? '<div class="btns" style="width:100%"><button class="btn ghost sm f" style="flex:1" data-act="profilePin" data-arg="' + p.id + '">' + (p.pin ? 'Quitar PIN' : 'Proteger con PIN') + '</button><button class="btn danger sm f" data-act="deleteProfile" data-arg="' + p.id + '">' + IC.trash + '</button></div>' : '') +
      '</div><div class="glass" style="flex:1;min-width:280px;border-radius:26px;padding:16px">' +
      chips(D.AVATAR_GROUPS.map(function (x) { return { name: x.id, label: x.name }; }).map(function (x) { return x.name; }), editTab, 'avTab').replace(/>(vibrent|upstream|toon|3d|memo|teams|notion|bluey)</g, function (m, id) { return '>' + D.AVATAR_GROUPS.find(function (x) { return x.id === id; }).name + '<'; }) +
      '<div class="avgrid">' + g.files.map(function (f, i) { return '<button class="avopt f' + (f === editSel ? ' on' : '') + '" style="animation-delay:' + Math.min(i, 20) * 0.02 + 's" data-act="avPick" data-arg="' + f + '" aria-label="Avatar ' + (i + 1) + '"><img loading="lazy" src="' + f + '" alt=""></button>'; }).join('') + '</div>' +
      '<p class="muted" style="font-size:12px;margin:12px 0 0">Avatares de alohe/avatars · Licencia MIT</p></div></div>';
  };

  // ---------- Inicio ----------
  VIEWS.home = function () {
    if (!S.lists.length) return top('Hola' + (MV.profile() ? ', ' + MV.profile().name : '')) + emptyLists();
    var live = MV.visible(S.live), movies = MV.visible(S.movies), series = MV.visible(S.series);
    var favs = MV.favs().map(MV.resolve), cont = MV.continueList();
    var heroIt = favs.find(function (f) { return f.type === 'live'; }) || live[0] || movies[0];
    var html = loadingBlock();
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
        '<div class="prev glass"><div class="in" style="background:linear-gradient(140deg,' + MV.hue(heroIt.name) + ',#17140F 80%)">' + (img ? '<img src="' + esc(img) + '" alt="" style="' + (heroIt.type === 'live' ? 'object-fit:contain;padding:30px' : '') + '">' : '<span class="mono" style="font:800 80px var(--brand)">' + esc(MV.mono(heroIt.name)) + '</span>') + '</div></div></section>';
    }
    html += row('Continuar viendo', cont.map(function (c) { return MV.resolve(c); }), 'wide');
    html += row('Favoritos', favs.slice(0, 30));
    html += row('Canales en vivo', live.slice(0, 30), 'ch', live.length + ' canales', 'live');
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
    MV.archive().then(function (items) {
      var box = document.getElementById('archiveRow'); if (!box || !items.length) return;
      box.innerHTML = row('Cine clásico de dominio público', items.slice(0, 30), 'poster', 'Internet Archive');
    });
  };
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
  var liveCat = 'Todos', liveSec = 'all', liveCountry = 'all';
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
      .sort(function (a, b) { return b.count - a.count; });
    if (out.length && none) out.push({ id: 'none', name: 'Sin país', count: none });
    return out;
  }
  function liveBase() {
    var l = inSection(MV.visible(S.live), liveSec);
    if (liveCountry === 'all') return l;
    return l.filter(function (i) { return liveCountry === 'none' ? !i.country : i.country === liveCountry; });
  }
  function countryChips() {
    var secList = inSection(MV.visible(S.live), liveSec), cs = countriesOf(secList);
    if (!cs.length) { liveCountry = 'all'; return ''; }
    if (liveCountry !== 'all' && !cs.some(function (c) { return c.id === liveCountry; })) liveCountry = 'all';
    return '<div class="chips" aria-label="Países">' + [{ id: 'all', name: '🌐 Todos los países', count: secList.length }].concat(cs).map(function (x) {
      return '<button class="chip f' + (x.id === liveCountry ? ' on' : '') + '" data-act="liveCountry" data-arg="' + esc(x.id) + '">' + esc(x.name) + ' <small>' + x.count + '</small></button>';
    }).join('') + '</div>';
  }
  function secChips() {
    var secs = liveSections(MV.visible(S.live));
    return '<div class="chips" aria-label="Secciones de TV">' + secs.map(function (x) {
      return '<button class="chip f' + (x.id === liveSec ? ' on' : '') + '" data-act="liveSec" data-arg="' + esc(x.id) + '">' + esc(x.name) + ' <small>' + x.count + '</small></button>';
    }).join('') + '</div>';
  }
  VIEWS.live = function () {
    if (!S.lists.length) return top('En vivo') + emptyLists();
    var filt = secChips() + countryChips();
    var all = liveBase();
    var cats = [{ name: 'Todos', count: all.length }].concat(MV.groups(all));
    if (liveCat !== 'Todos' && !cats.some(function (c) { return c.name === liveCat; })) liveCat = 'Todos';
    var list = channelsOf(liveCat, all);
    var lim = limits.live || 150;
    return top('En vivo', '<button class="pill f" data-act="adultToggle">' + IC.lock.replace('<svg', '<svg width="18" height="18"') + (MV.adultOk() ? 'Bloquear +18' : '+18') + '</button>') + loadingBlock() + filt +
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
    return top('Guía de programación', '<button class="pill f" data-act="reloadEpg">' + IC.refresh.replace('<svg', '<svg width="18" height="18"') + 'Actualizar guía</button>') +
      filt + chips(cats, liveCat, 'liveCat') +
      (!anyEpg ? '<div class="panel glass"><p style="margin:0">Aún no hay guía cargada. Si tu lista trae una guía EPG (XMLTV) se carga sola; también puedes poner el enlace en Ajustes › Listas.</p></div>' : '') +
      '<div class="epg glass" style="--slot:' + slot + 'px">' + hdr + '<div style="position:relative">' + rows +
      '<div class="nowline" style="left:calc(var(--c0) + ' + ((Date.now() - start) * pxPerMs) + 'px)"></div></div></div>';
  };

  // ---------- Películas, series, anime, k-drama, documentales ----------
  var catSel = {}, genreSel = {}, platSel = {};
  function genreChips(list, cur, vkey, act) {
    if (!list.length) return '';
    return '<div class="chips" aria-label="Géneros"><span class="muted" style="align-self:center;font:700 12px var(--ui);letter-spacing:1px;padding:0 4px">GÉNERO</span>' +
      [{ id: '', name: 'Todos' }].concat(list).map(function (g) {
        return '<button class="chip f' + ((cur || '') === g.id ? ' on' : '') + '" data-act="' + (act || 'genre') + '" data-arg="' + g.id + '" data-v="' + vkey + '">' + esc(g.name) + (g.count ? ' <small>' + g.count + '</small>' : '') + '</button>';
      }).join('') + '</div>';
  }
  function catalogView(vkey, title, items, kind) {
    if (!S.lists.length) return top(title) + emptyLists();
    var all = MV.visible(items);
    var cats = [{ name: 'Todo', count: all.length }].concat(MV.groups(all).slice(0, 60));
    var cur = catSel[vkey] || 'Todo', gen = genreSel[vkey] || '';
    var list = cur === 'Todo' ? all : all.filter(function (i) { return i.group === cur; });
    var plat = platSel[vkey] || '';
    var pm = {}; list.forEach(function (i) { if (i.platform) pm[i.platform] = (pm[i.platform] || 0) + 1; });
    var plats = vkey.indexOf('pl-') === 0 ? [] : D.PLATFORMS.filter(function (p) { return pm[p.id]; }).map(function (p) { return { id: p.id, name: p.name, count: pm[p.id] }; });
    if (plat) list = list.filter(function (i) { return i.platform === plat; });
    var genres = MV.genresOf(list);
    if (gen) list = list.filter(function (i) { return (i.genres || []).indexOf(gen) >= 0; });
    return top(title, '<span class="muted">' + all.length + ' títulos</span>') + loadingBlock() + chips(cats, cur, 'cat', ' data-v="' + vkey + '"') + (plats.length ? genreChips(plats, plat, vkey, 'plat').replace('>GÉNERO<', '>PLATAFORMA<') : '') + genreChips(genres, gen, vkey) +
      (list.length ? grid(list, kind, vkey) : '<div class="empty glass"><h2>No hay contenido aquí todavía</h2><p class="muted">Se llena con lo que traen tus listas M3U o tu cuenta Xtream.</p></div>');
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
      (list.length ? '<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">' + list.map(function (p, i) { return platformTile(p, i).replace('card wide', 'card wide" style="width:auto'); }).join('') + '</div>'
        : '<div class="empty glass"><h2>No encontramos plataformas en tus listas</h2><p class="muted">Aparecen cuando las categorías de tus listas llevan el nombre del servicio, por ejemplo “Netflix Series” o “Disney+ Películas”.</p></div>');
  };

  VIEWS.movies = function () { return catalogView('movies', 'Películas', S.movies); };
  VIEWS.series = function () { return catalogView('series', 'Series', S.series); };
  VIEWS.anime = function () { return catalogView('anime', 'Anime', S.items.filter(function (i) { return i.anime && i.type !== 'live'; })); };
  VIEWS.kdrama = function () { return catalogView('kdrama', 'K-Drama', S.items.filter(function (i) { return i.kdrama && i.type !== 'live'; })); };
  VIEWS.docs = function () { return catalogView('docs', 'Documentales', S.items.filter(function (i) { return i.doc && i.type !== 'live'; })); };

  // ---------- Ficha ----------
  VIEWS.detail = function (key) {
    var it = S.byKey[key] || MV.reg[key];
    if (!it) return top('Ficha') + '<p class="muted">Este contenido ya no está en tus listas.</p>';
    reg(it);
    var prog = MV.progressOf(it.key), fav = MV.isFav(it.key), img = MV.poster(it);
    var facts = [it.year, it.type === 'series' ? 'Serie' : 'Película', it.group, it.rating ? '★ ' + it.rating : ''].concat((it.genres || []).map(D.genreName)).filter(Boolean);
    return '<div class="detail"><div class="bd" id="bd"></div>' +
      '<div class="ps" style="--h:' + MV.hue(it.name) + '" id="ps">' + (img ? '<img src="' + esc(img) + '" alt="">' : '<span class="mono" style="font:800 30px var(--brand)">' + esc(it.name) + '</span>') + '</div>' +
      '<div class="info"><span class="badge" id="metaSrc">' + (it.ia ? 'DOMINIO PÚBLICO · INTERNET ARCHIVE' : 'BUSCANDO FICHA…') + '</span>' +
      '<h1 id="mtitle">' + esc(MV.cleanTitle(it.name) || it.name) + '</h1>' +
      '<div class="facts" id="facts">' + facts.map(function (f) { return '<span class="pill">' + esc(f) + '</span>'; }).join('') + '</div>' +
      '<p id="plot">' + esc(it.plot || '') + '</p><div class="muted" id="cast"></div>' +
      '<div class="btns">' + (it.type === 'series' ? '' :
        (prog ? '<button class="btn f" data-act="resume" data-key="' + esc(it.key) + '" data-autofocus>' + IC.play + 'Continuar · ' + MV.fmtDur(prog.pos) + '</button><button class="btn ghost f" data-act="play" data-key="' + esc(it.key) + '">Desde el inicio</button>'
          : '<button class="btn f" data-act="play" data-key="' + esc(it.key) + '" data-autofocus>' + IC.play + 'Reproducir</button>')) +
      '<button class="btn ghost f" data-act="fav" data-key="' + esc(it.key) + '">' + (fav ? IC.starFill : IC.star) + (fav ? 'En favoritos' : 'Favorito') + '</button>' +
      '<button class="btn ghost f hidden" id="coverBtn" data-act="covers" data-key="' + esc(it.key) + '">Cambiar carátula</button></div>' +
      (it.type === 'series' ? '<div id="eps" class="eps"><div class="spinner"></div></div>' : '') + '</div></div>';
  };
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
      document.getElementById('mtitle').textContent = m.title || it.name;
      if (m.overview) document.getElementById('plot').textContent = m.overview;
      var facts = [m.year, m.runtime, m.rating ? '★ ' + m.rating : ''].concat(m.genres || []).filter(Boolean);
      document.getElementById('facts').innerHTML = facts.map(function (f) { return '<span class="pill">' + esc(f) + '</span>'; }).join('');
      if (m.cast && m.cast.length) document.getElementById('cast').textContent = 'Reparto: ' + m.cast.join(', ');
      if (m.backdrop) document.getElementById('bd').style.backgroundImage = 'url("' + m.backdrop + '")';
      if (m.poster && !(P.covers && P.covers[it.key]) && !it.poster) document.getElementById('ps').innerHTML = '<img src="' + esc(m.poster) + '" alt="">';
      if (m.poster && !it.poster) it.poster = m.poster;
      if (m.posters && m.posters.length > 1) document.getElementById('coverBtn').classList.remove('hidden');
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

  // ---------- Buscar ----------
  var query = '';
  VIEWS.search = function () {
    var kb = MV.device.tv ? '<div class="kbd glass" style="padding:10px;border-radius:20px">' + 'abcdefghijklmnñopqrstuvwxyz0123456789'.split('').map(function (c) { return '<button class="f" data-act="kb" data-arg="' + c + '">' + c.toUpperCase() + '</button>'; }).join('') +
      '<button class="f wide" data-act="kb" data-arg=" ">Espacio</button><button class="f wide" data-act="kbDel">Borrar</button><button class="f wide" data-act="kbClear">Limpiar</button></div>' : '';
    return top('Buscar') + '<label class="field">Canales, películas, series, anime, k-drama y juegos<input class="in f" id="searchIn" value="' + esc(query) + '" placeholder="Escribe aquí o usa el celular como teclado" autocomplete="off" data-autofocus></label>' + kb + '<div id="results"></div>';
  };
  VIEWS.search.after = function () {
    var inp = document.getElementById('searchIn');
    inp.addEventListener('input', MV.debounce(function () { query = inp.value; showResults(); }, 250));
    showResults();
  };
  function showResults() {
    var box = document.getElementById('results'); if (!box) return;
    var q = MV.norm(query);
    if (q.length < 2) { box.innerHTML = '<p class="muted">Escribe al menos 2 letras.</p>'; return; }
    var words = q.split(' ');
    var hits = MV.visible(S.items).filter(function (i) { var n = MV.norm(i.name + ' ' + (i.group || '')); return words.every(function (w) { return n.indexOf(w) >= 0; }); });
    var roms = (MV.load('roms', []) || []).filter(function (r) { var n = MV.norm(r.name); return words.every(function (w) { return n.indexOf(w) >= 0; }); }).slice(0, 12);
    var live = hits.filter(function (i) { return i.type === 'live'; }).slice(0, 30), vod = hits.filter(function (i) { return i.type !== 'live'; }).slice(0, 60);
    box.innerHTML = (live.length ? row('Canales', live, 'ch', live.length + '') : '') + (vod.length ? row('Películas y series', vod, 'poster', vod.length + '') : '') +
      (roms.length ? '<section class="row"><h3>Juegos</h3><div class="strip">' + roms.map(function (r, i) { return romCard(r, i); }).join('') + '</div></section>' : '') +
      (!live.length && !vod.length && !roms.length ? '<p class="muted">Sin resultados para “' + esc(query) + '”.</p>' : '');
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
    var cats = [['all', 'Todo', '#FF6900', '★'], ['live', 'Canales de TV', '#2F6FEB', 'TV'], ['movie', 'Películas', '#E0447C', '▶'], ['series', 'Series', '#14A38B', '◆'], ['anime', 'Anime', '#D9A20B', '✦']];
    var list = items.filter(function (i) { if (kidCat === 'live') return i.type === 'live'; if (i.type === 'live') return false; return kidCat === 'all' || (kidCat === 'anime' ? i.anime : i.type === kidCat); });
    var p = MV.profile() || {};
    return '<div class="top"><img src="' + esc(p.avatar || '') + '" alt="" style="width:58px;height:58px;border-radius:50%;background:#F3EFEA;box-shadow:0 0 0 4px var(--accent)"><div><h1>¡Hola, ' + esc(p.name || '') + '!</h1><span class="muted">¿Qué quieres ver hoy?</span></div><div class="sp"></div>' +
      '<span class="pill">Te quedan ' + MV.kidsLeft() + ' min</span><button class="pill f" data-act="kidsExit">' + IC.lock.replace('<svg', '<svg width="18" height="18"') + 'Salir</button></div>' +
      '<div class="kidcats">' + cats.map(function (c) { return '<button class="kidcat f' + (kidCat === c[0] ? ' on' : '') + '" data-act="kidCat" data-arg="' + c[0] + '"><span class="bub" style="background:' + c[2] + '">' + c[3] + '</span>' + c[1] + '</button>'; }).join('') + '</div>' +
      (list.length ? grid(list, 'poster', 'kids') : '<div class="empty glass"><h2>Aún no hay contenido infantil</h2><p class="muted">Pide a un adulto que agregue canales infantiles en Ajustes › Listas (hay una lista gratuita de canales para niños).</p></div>');
  };

  // ---------- Juegos y ports ----------
  var sysSel = 'all', gameGenre = '';
  function romGenres(r) { var s = romSystem(r); var g = D.classifyGenres(r.name, D.GAME_GENRES); if (s && s.port && g.indexOf('disparos') < 0 && /doom|quake|wolf/.test(s.id)) g.push('disparos'); if (s && s.id === 'cave' && g.indexOf('aventura') < 0) g.push('aventura'); return g; }
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
    var roms = (MV.load('roms', []) || []).filter(function (r) { return !r.ext || r.ext !== 'exe' || /doukutsu\.exe$/i.test(r.name); }).filter(function (r) { return r.ext !== 'pak' || /^pak0\.pak$/i.test(r.name); });
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
      (shown.length ? '<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))">' + shown.slice(0, limits.games || 120).map(function (r, i) { return romCard(r, i % 12).replace('card wide', 'card wide" style="width:auto'); }).join('') + '</div>' +
        (shown.length > (limits.games || 120) ? '<button class="btn ghost more f" data-act="more" data-arg="games">Ver más</button>' : '')
        : '<div class="empty glass"><h2>' + (roms.length ? 'No hay juegos de este sistema' : 'Aún no hay juegos') + '</h2><p class="muted">Conecta una USB o disco duro con tus ROMs (o cópialas a la memoria) y toca “Buscar juegos”. Los emuladores se descargan solos la primera vez que juegas cada sistema.</p></div>');
  };

  // ---------- Ajustes ----------
  var setTab = 'lists';
  VIEWS.settings = function (tab) {
    if (tab) setTab = tab;
    var tabs = [['lists', 'Listas'], ['profiles', 'Perfiles'], ['look', 'Temas'], ['playback', 'Reproducción'], ['parental', 'Control parental y +18'], ['remote', 'Mando con celular'], ['sync', 'Sincronización'], ['meta', 'Sinopsis y carátulas'], ['about', 'Acerca de']];
    if (MV.acct.managed()) {
      tabs = tabs.map(function (t) { return t[0] === 'sync' ? ['account', 'Cuenta'] : t; });
      if (MV.acct.isAdmin()) tabs.splice(1, 0, ['users', 'Usuarios']);
      if (setTab === 'sync') setTab = 'account';
    }
    var html = top('Ajustes') + '<div class="chips">' + tabs.map(function (t) { return '<button class="chip f' + (setTab === t[0] ? ' on' : '') + '" data-act="setTab" data-arg="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';
    return html + (SETTINGS[setTab] || SETTINGS.lists)();
  };
  var SETTINGS = {};
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
        (S.lists.length ? S.lists.map(function (l) { return '<div class="line"><div class="t"><b>' + esc(l.name) + '</b><span>' + (l.type === 'xtream' ? 'Xtream Codes' : 'Lista M3U') + ' · ' + (l.count || 0) + ' elementos</span></div></div>'; }).join('') : '<p class="muted">Aún no hay listas.</p>') +
        '<div class="btns" style="margin-top:14px"><button class="btn ghost f" data-act="reloadAll">' + IC.refresh + 'Actualizar todo</button></div></div>' + dupesPanel();
    }
    return '<div class="panel glass"><h2>Tus listas</h2><p>Todo el contenido de tus listas se combina: los canales repetidos aparecen una sola vez y se queda la señal que funciona.' + (MV.acct.isAdmin() ? ' <b>Eres superadministrador:</b> lo que cambies aquí llega a todos los usuarios (las listas en archivo solo quedan en este equipo; usa enlaces para compartirlas).' : '') + '</p>' +
      (S.lists.length ? S.lists.map(function (l) {
        return '<div class="line"><div class="t"><b>' + esc(l.name) + '</b><span>' + (l.type === 'xtream' ? 'Xtream Codes · ' + esc(l.host) : l.type === 'file' ? 'Archivo' : esc(l.url)) + ' · ' + (l.count || 0) + ' elementos' + (l.epg ? ' · con guía' : '') + (l.error ? ' · ⚠ ' + esc(l.error) : '') + '</span></div>' +
          '<button class="toggle f' + (l.enabled !== false ? ' on' : '') + '" data-act="listToggle" data-arg="' + l.id + '" aria-label="Activar lista"></button>' +
          '<button class="iconbtn f" data-act="listEpg" data-arg="' + l.id + '" aria-label="Guía EPG">' + IC.guide + '</button>' +
          '<button class="iconbtn f" data-act="listDelete" data-arg="' + l.id + '" aria-label="Eliminar">' + IC.trash + '</button></div>';
      }).join('') : '<p class="muted">No has agregado listas.</p>') +
      '<div class="btns" style="margin-top:14px"><button class="btn f" data-act="addList">' + IC.plus + 'Agregar lista</button><button class="btn ghost f" data-act="presets">Canales gratis</button><button class="btn ghost f" data-act="reloadAll">' + IC.refresh + 'Actualizar todo</button></div></div>' + dupesPanel();
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
      return '<div class="line"><img src="' + esc(p.avatar) + '" alt="" style="width:44px;height:44px;border-radius:14px;background:#F3EFEA"><div class="t"><b>' + esc(p.name) + '</b><span>' + (p.kids ? 'Infantil · ' : '') + (p.pin ? 'Con PIN' : 'Sin PIN') + '</span></div><button class="btn ghost sm f" data-act="editProfile" data-arg="' + p.id + '">Editar</button></div>';
    }).join('') + '<div class="btns" style="margin-top:12px"><button class="btn f" data-act="go" data-arg="profileEdit">' + IC.plus + 'Nuevo perfil</button></div></div>';
  };
  SETTINGS.look = function () {
    return '<div class="panel glass"><h2>Tema</h2><div class="themes">' + D.THEMES.map(function (t) {
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
      '<div class="panel glass"><h2>Contenido +18</h2><p>Las categorías para adultos de tus listas quedan ocultas. Solo se ven después de iniciar sesión con el usuario adulto, nunca en perfiles infantiles, y se bloquean solas a los 30 minutos.</p>' +
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
      '<div class="panel glass"><h2>YouTube dentro de la app</h2><p>Con una clave gratuita de la API de YouTube (Google Cloud › APIs y servicios › YouTube Data API v3) puedes buscar y ver videos sin salir de MiVibra TV. El cupo gratis alcanza para unas 100 búsquedas al día entre todos los usuarios; las tendencias casi no gastan cupo.</p>' +
      (MV.acct.canEdit() ? '<label class="field">Clave de la API de YouTube' + (MV.acct.isAdmin() ? ' · se comparte con todos los usuarios' : '') + '<input class="in f" id="ytKey" value="' + esc(P.ytKey || '') + '" autocomplete="off" placeholder="AIza…"></label><div class="btns"><button class="btn f" data-act="saveYtKey">Guardar</button></div>'
        : '<div class="line"><div class="t"><b>' + (P.ytKey ? 'Clave configurada por el administrador' : 'El administrador aún no ha puesto la clave') + '</b></div></div>') + '</div>';
  };
  SETTINGS.about = function () {
    return '<div class="panel glass"><h2>MiVibra TV</h2><p>Versión ' + esc(MV.device.version || '') + ' · ' + esc(MV.device.model || '') + '</p>' +
      '<div class="btns" style="margin-bottom:12px"><button class="btn f" data-act="checkUpdate">' + IC.refresh + 'Buscar actualizaciones</button></div>' +
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
  var playing = null;
  function q(it, extra) {
    var nn = it.type === 'live' ? MV.nowNext(it) : {};
    return Object.assign({ id: it.key, url: it.url, title: it.name, subtitle: nn.now ? nn.now.t : (it.group || ''), num: it.num || '', ua: it.ua || '', ref: it.ref || '', alts: it.alts || [] }, extra || {});
  }
  function launch(req, ctx) {
    if (MV.isKids() && +P.kidsLimit > 0 && MV.kidsLeft() <= 0) { kidsTimeUp(); return; }
    if (MV.audio && MV.audio.current() && !ctx.noRecord) MV.audio.stop();
    playing = Object.assign({ started: Date.now() }, ctx);
    req.audioLang = P.audioLang; req.subLang = P.subLang;
    if (A) A.play(JSON.stringify(req));
    else { window.open(req.queue[req.index || 0].url, '_blank'); MV.onPlayerClosed({ id: ctx.item.key, position: 0, duration: 0, live: !!req.live }); }
  }
  MV.playItem = function (it, resume) {
    if (!it) return;
    if (it.type === 'series') { MV.go('detail', it.key); return; }
    if (it.type === 'rom') { playRom(it.rom); return; }
    if (it.type === 'live') {
      var list = channelsOf(liveCat, liveBase());
      if (list.indexOf(it) < 0) list = MV.visible(S.live);
      var idx = Math.max(0, list.indexOf(it)), from = Math.max(0, idx - 200), slice = list.slice(from, from + 400);
      launch({ queue: slice.map(function (c) { return q(c); }), index: slice.indexOf(it) < 0 ? 0 : slice.indexOf(it), live: true }, { item: it, list: slice });
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
    var queue = eps.slice(i).map(function (x) { return { id: series.key + '#' + x.season + 'x' + x.ep, url: x.url, title: series.name, subtitle: 'T' + x.season + ' E' + x.ep + ' · ' + x.title, ua: x.ua || '', ref: x.ref || '' }; });
    var k = series.key + '#' + e.season + 'x' + e.ep, prog = resume !== false ? MV.progressOf(k) : null;
    launch({ queue: queue, index: 0, live: false, startMs: prog ? prog.pos : 0 }, { item: series, episodes: eps, start: i });
  };
  MV.onPlayerClosed = function (r) {
    if (!playing) return;
    var ctx = playing; playing = null;
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
    var tabs = [['url', 'Enlace M3U'], ['multi', 'Varias (.txt)'], ['file', 'Archivo'], ['xtream', 'Xtream Codes']];
    var body = tab === 'multi'
      ? '<p>Pega tus direcciones (una por línea) o elige tu archivo .txt. Puedes poner un nombre antes de cada una: <code>Mi lista, https://…</code>. Los enlaces de Xtream (get.php?username=…) se agregan como cuenta Xtream con películas y series.</p>' +
        '<label class="field">Direcciones<textarea class="in f" id="lMulti" rows="6" placeholder="https://…/lista1.m3u&#10;Deportes, https://…/lista2.m3u" data-autofocus></textarea></label><p class="muted" id="lMultiCount" style="font-size:13px;margin:-4px 0 8px"></p>'
      : tab === 'xtream'
      ? '<label class="field">Nombre<input class="in f" id="lName" placeholder="Mi proveedor" data-autofocus></label><label class="field">Servidor<input class="in f" id="lHost" placeholder="http://servidor:puerto" autocomplete="off"></label><label class="field">Usuario<input class="in f" id="lUser" autocomplete="off"></label><label class="field">Contraseña<input class="in f" id="lPass" type="password"></label>'
      : tab === 'file'
        ? '<label class="field">Nombre<input class="in f" id="lName" placeholder="Lista descargada" data-autofocus></label><p>Elige un archivo .m3u del dispositivo, una USB o el administrador de archivos.</p>'
        : '<label class="field">Nombre<input class="in f" id="lName" placeholder="Mi lista" data-autofocus></label><label class="field">Enlace de la lista M3U / M3U8<input class="in f" id="lUrl" placeholder="https://…/lista.m3u" autocomplete="off" inputmode="url"></label><label class="field">Guía EPG XMLTV (opcional)<input class="in f" id="lEpg" placeholder="https://…/guia.xml" autocomplete="off" inputmode="url"></label>';
    MV.modal('<h2>Agregar lista</h2><div class="chips">' + tabs.map(function (t) { return '<button class="chip f' + (t[0] === tab ? ' on' : '') + '" data-act="listTab" data-arg="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>' + body +
      '<div class="btns"><button class="btn f" data-act="listSave" data-arg="' + tab + '">' + (tab === 'xtream' ? 'Iniciar sesión' : tab === 'file' ? 'Elegir archivo' : tab === 'multi' ? 'Importar' : 'Cargar lista') + '</button>' + (tab === 'multi' ? '<button class="btn ghost f" data-act="multiPick">Elegir archivo .txt</button>' : '') + '<button class="btn ghost f" data-act="confirmNo">Cancelar</button></div>',
      { onOpen: function (root) { var ta = root.querySelector('#lMulti'); if (ta) ta.addEventListener('input', multiCount); } });
  }

  function multiCount() {
    var ta = document.getElementById('lMulti'), el = document.getElementById('lMultiCount'); if (!ta || !el) return;
    var r = MV.parseUrlList(ta.value);
    el.textContent = r === null ? 'Esto es una lista M3U: usa la pestaña Archivo o Enlace M3U.' : r.length ? r.length + (r.length === 1 ? ' dirección encontrada' : ' direcciones encontradas') + ' (' + r.filter(function (x) { return x.type === 'xtream'; }).length + ' Xtream)' : '';
  }
  function importMany(arr) {
    if (!arr || !arr.length) { MV.toast('No encontré direcciones http:// o https://'); return; }
    MV.closeModal(true);
    MV.modal('<h2>Importando listas</h2><div style="height:8px;border-radius:8px;background:var(--glass-strong);overflow:hidden;margin:14px 0"><i id="impFill" style="display:block;height:100%;width:0;background:var(--accent);transition:width .3s"></i></div><p class="muted" id="impTxt">Preparando ' + arr.length + ' listas…</p>');
    MV.addLists(arr, function (n, total, name) {
      var f = document.getElementById('impFill'), t = document.getElementById('impTxt');
      if (f) f.style.width = Math.round(n / total * 100) + '%';
      if (t) t.textContent = n + ' de ' + total + ' · ' + name;
    }).then(function (r) {
      MV.closeModal(true);
      MV.toast(r.added + ' listas agregadas' + (r.skipped ? ' · ' + r.skipped + ' ya estaban' : '') + (r.failed.length ? ' · ' + r.failed.length + ' no cargaron' : ''), 5000);
      MV.rerender();
    }).catch(function (e) { MV.closeModal(true); MV.toast(e.message, 4000); MV.rerender(); });
  }

  // ---------- Acciones ----------
  var ACT = {
    multiPick: function () {
      MV.call('pickFile', []).then(function (d) { return fetch(d.path).then(function (r) { return r.text(); }); }).then(function (txt) {
        var ta = document.getElementById('lMulti'); if (ta) { ta.value = txt; multiCount(); }
      }).catch(function (e) { if (e.message !== 'cancel') MV.toast(e.message === 'nopicker' ? 'Este equipo no tiene selector de archivos. Pega el texto.' : e.message); });
    },
    nav: function (a) { stack = []; MV.go(a, null, { replace: true }); },
    go: function (a) { MV.closeModal(true); if (a === 'profileEdit') { editSel = null; } MV.go(a); },
    more: function (k) { limits[k] = (limits[k] || (k === 'live' ? 150 : k === 'games' ? 120 : k === 'music' ? 200 : 60)) + (k === 'live' ? 150 : k === 'music' ? 200 : 60); MV.rerender(); },
    open: function (_, el) { var it = S.byKey[el.dataset.key] || MV.reg[el.dataset.key]; if (!it) return;
      if (it.type === 'tmdb') { if (it.have && S.byKey[it.have]) MV.go('detail', it.have); else tmdbInfo(it); return; }
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
    cat: function (c, el) { catSel[el.dataset.v] = c; genreSel[el.dataset.v] = ''; limits[el.dataset.v] = 60; MV.rerender(); },
    plat: function (p, el) { platSel[el.dataset.v] = p; genreSel[el.dataset.v] = ''; limits[el.dataset.v] = 60; MV.rerender(); },
    platform: function (id) { MV.go('platforms', id); },
    back: function () { MV.onBack(); },
    genre: function (g, el) { genreSel[el.dataset.v] = g; limits[el.dataset.v] = 60; MV.rerender(); },
    gameGenre: function (g) { gameGenre = g; MV.rerender(); },
    kidCat: function (c) { kidCat = c; MV.rerender(); },
    reloadEpg: function () { MV.toast('Actualizando guía…'); MV.loadEpg(true).then(function () { MV.rerender(); MV.toast('Guía actualizada'); }); },
    confirmOk: function () { var r = MV._confirmRes; MV._confirmRes = null; MV.closeModal(true); if (r) r(true); },
    confirmNo: function () { MV.closeModal(); },
    promptOk: function () { var v = document.getElementById('promptIn').value; var r = MV._promptRes; MV._promptRes = null; MV.closeModal(true); if (r) r(v); },
    // Perfiles
    pickProfile: function (id) {
      var p = S.profiles.find(function (x) { return x.id === id; });
      var enter = function () { S.pid = id; MV.save('pid', id); stack = []; MV.applyLook(); MV.go(p.kids ? 'kids' : 'home', null, { replace: true }); };
      if (p.pin) pinPad('PIN de ' + p.name, function (h) { if (h === p.pin) { MV.closeModal(true); enter(); return true; } return false; });
      else enter();
    },
    manageProfiles: function () { MV.go('settings', 'profiles'); },
    editProfile: function (id) { editSel = null; MV.go('profileEdit', id); },
    avTab: function (t) { editTab = D.AVATAR_GROUPS.some(function (g) { return g.id === t; }) ? t : D.AVATAR_GROUPS.find(function (g) { return g.name === t; }).id; keepName(); MV.rerender(); },
    avPick: function (f) { editSel = f; keepName(); MV.rerender(); },
    editKids: function () { editKids = !editKids; keepName(); MV.rerender(); },
    saveProfile: function (id) {
      var name = (document.getElementById('profName').value || '').trim() || 'Perfil';
      var p = S.profiles.find(function (x) { return x.id === id; });
      if (!p) { p = { id: 'p' + Date.now().toString(36) }; S.profiles.push(p); }
      p.name = name; p.avatar = editSel; p.kids = editKids; p.updatedAt = Date.now();
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
    auToggle: function () { AU.toggle(); },
    auNext: function () { AU.next(); },
    auPrev: function () { AU.prev(); },
    auStop: function () { AU.stop(); if (view.name === 'radio' || view.name === 'music') MV.rerender(); },
    openApp: function (k) { openApp(k); },
    ytSearch: function () { var v = ((document.getElementById('ytIn') || {}).value || '').trim(); if (!P.ytKey) { if (v) ytOpen(v); else openApp('youtube'); return; } YT.q = v; YT.list = null; MV.rerender(); },
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
        var url = 'https://www.youtube.com/watch?v=' + v[0].key;
        if (MV.A && MV.A.openExternal) MV.A.openExternal(url); else window.open(url, '_blank');
      }).catch(function () { MV.toast('No se pudo cargar el tráiler'); });
    },
    tmdbSearch: function (key) { var t = MV.reg[key]; if (!t) return; MV.closeModal(true); query = t.name; MV.go('search'); },
    checkUpdate: function () { MV.toast('Buscando actualizaciones…'); MV.checkUpdate(true); },
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
    loginRetry: function () { MV.acct.status = 'pending'; MV.acct.signOut().then(function () { MV.acct.error = 'Vuelve a entrar con tu cuenta.'; MV.go('login', null, { replace: true }); }); },
    loginOut: function () { MV.confirm('¿Cerrar sesión en este equipo?', 'Tus datos quedan guardados en tu cuenta.', 'Cerrar sesión').then(function (y) { if (!y) return; MV.acct.signOut().then(function () { S.pid = null; MV.save('pid', null); MV.go('login', null, { replace: true }); }); }); },
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
      if (tab === 'xtream') {
        var l = { type: 'xtream', name: name || 'Xtream', host: document.getElementById('lHost').value.trim(), user: document.getElementById('lUser').value.trim(), pass: document.getElementById('lPass').value };
        if (!l.host || !l.user) { MV.toast('Completa servidor y usuario'); return; }
        MV.toast('Iniciando sesión…');
        MV.xtLogin(l).then(function (j) {
          MV.closeModal(true);
          var exp = j.user_info.exp_date ? new Date(+j.user_info.exp_date * 1000).toLocaleDateString('es-CO') : '';
          MV.toast('Conectado' + (exp ? ' · vence ' + exp : ''), 3500);
          return MV.addList(l);
        }).then(function () { MV.rerender(); }).catch(function (e) { MV.toast(e.message, 4000); });
      } else if (tab === 'multi') {
        var parsed = MV.parseUrlList(document.getElementById('lMulti').value);
        if (parsed === null) { MV.toast('Eso es una lista M3U completa: usa la pestaña Archivo'); return; }
        importMany(parsed);
      } else if (tab === 'file') {
        MV.call('pickFile', []).then(function (d) {
          return fetch(d.path).then(function (r) { return r.text(); }).then(function (txt) {
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
    listDelete: function (id) {
      if (!MV.acct.canEdit()) return; MV.confirm('¿Eliminar esta lista?', '', 'Eliminar').then(function (y) { if (y) MV.removeList(id).then(MV.rerender); }); },
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
    prefToggle: function (k) { P[k] = P[k] === false ? true : !P[k]; MV.savePrefs(); MV.rerender(); },
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
    saveYtKey: function () { P.ytKey = document.getElementById('ytKey').value.trim(); MV.savePrefs(); YT.key = ''; YT.list = null; MV.toast('Clave de YouTube guardada'); },
    saveTmdb: function () { P.tmdbKey = document.getElementById('tmdbKey').value.trim(); MV.savePrefs(); MV.toast('Clave guardada'); },
    clearMeta: function () { MV.toast('Las fichas se volverán a buscar'); S.items.forEach(function (i) { MV.idbDel('meta:' + i.key); }); },
    // Búsqueda con teclado en pantalla
    kb: function (c) { query += c; var i = document.getElementById('searchIn'); if (i) i.value = query; showResults(); },
    kbDel: function () { query = query.slice(0, -1); var i = document.getElementById('searchIn'); if (i) i.value = query; showResults(); },
    kbClear: function () { query = ''; var i = document.getElementById('searchIn'); if (i) i.value = ''; showResults(); },
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
        MV.save('roms', list); MV.closeModal(true); MV.toast(list.length + ' juegos encontrados'); MV.rerender();
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
  VIEWS.profileEdit.after = function () { var i = document.getElementById('profName'); if (i && pendingName != null) i.value = pendingName; };

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
  function matchHave(t) {
    var idx = haveIndex(), want = t.mtype === 'tv' ? 'series' : 'movie', best = null;
    [t.name, t.original].forEach(function (n) {
      if (best || !n) return;
      (idx[titleKey(n)] || []).forEach(function (i) {
        if (i.type !== want) return;
        if (!best || (t.year && String(i.year || '') === t.year)) best = i;
      });
    });
    return best ? best.key : '';
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
      '<p class="muted" style="font-size:13px">No está en tus listas.</p></div></div>' +
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
    apple: { name: 'Apple Music', pkgs: ['com.apple.android.music'], web: 'https://music.apple.com' }
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
    if (A && A.openApp) A.openApp(JSON.stringify({ pkgs: a.pkgs, url: url || '' }));
    else window.open(url || a.web, '_blank');
  }
  function appTile(k, sub) {
    var a = APPS[k], ok = !A || hasApp(k);
    return '<button class="apptile glass f" data-act="openApp" data-arg="' + k + '"><b>' + esc(a.name) + '</b><span>' + esc(ok ? (sub || 'Abrir') : 'Instalar desde la tienda') + '</span></button>';
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
        '<h3 style="margin:18px 0 10px">Más apps de YouTube</h3><div class="apps">' + appTile('ytkids', 'Para niños') + appTile('ytmusic', 'Música') + '</div>';
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
        load();
      },
      close: close,
      act: act,
      touch: showBar
    };
  })();

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
  var MUSIC = { tab: 'mine', local: null, scanning: false, genre: '', q: '', aud: null, audKey: '', audLoading: false, host: '' };
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
    var tabs = [['mine', 'Mi música'], ['free', 'Música libre'], ['apps', 'Apps de música']];
    var html = top('Música') + '<div class="chips">' + tabs.map(function (t) { return '<button class="chip f' + (MUSIC.tab === t[0] ? ' on' : '') + '" data-act="musicTab" data-arg="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';
    if (MUSIC.tab === 'apps') {
      return html + '<div class="panel glass"><p>Abre tus apps de música con tu cuenta.</p><div class="apps">' + ['ytmusic', 'spotify', 'deezer', 'amazon', 'apple'].map(function (k) { return appTile(k); }).join('') + '</div></div>';
    }
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
  VIEWS.music.after = function () { var i = document.getElementById('musicIn'); if (i) i.addEventListener('keydown', function (e) { if (e.key === 'Enter') ACT.musicSearch(); }); };

  // ---------- Eventos de la app ----------
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
    if (view.name === 'settings') MV.rerender();
  });
  MV.onStorageChanged = function () { if (view.name === 'games') { MV.toast('Unidad conectada: buscando juegos…'); ACT.scanRoms(); } };
  MV.onResume = function () { if (view.name === 'games') MV.rerender(); };
  MV.onOpenFile = function (d) {
    if (!MV.acct.canEdit()) { MV.toast('Solo el administrador puede agregar listas'); return; }
    fetch(d.path).then(function (r) { return r.text(); }).then(function (txt) {
      var l = { id: 'l' + Date.now().toString(36), type: 'file', name: 'Lista abierta', enabled: true, added: Date.now(), updatedAt: Date.now() };
      return MV.idbSet('raw:' + l.id, txt).then(function () { S.lists.push(l); MV.saveLists(); return MV.reloadCatalog(true); });
    }).then(function () { MV.toast('Lista agregada'); MV.rerender(); });
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
    else if (S.profiles.length === 1 && !S.profiles[0].pin) { S.pid = S.profiles[0].id; MV.save('pid', S.pid); MV.go(S.profiles[0].kids ? 'kids' : 'home', null, { replace: true }); }
    else MV.go('profiles', null, { replace: true });
    if (S.lists.length) MV.reloadCatalog(false);
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
