/* MiVibra Movimiento — control con la mano (estilo Kinect) y conexión con la cámara del celular.
   - MVLink: conexión directa con el celular (PeerJS). El celular manda los puntos del cuerpo; el video no sale del teléfono.
   - MVHand: cursor con la mano, menús que se eligen deslizando la mano por la flecha, y pausa con el brazo izquierdo en diagonal.
   Puntos que llegan del celular: 0 nariz, 1-2 hombros (izq, der), 3-4 codos, 5-6 muñecas, 7-8 caderas, 9-10 rodillas, 11-12 tobillos.
   Todo funciona también con el control remoto: flechas y OK. */
(function () {
  'use strict';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // ---------------- Conexión con el celular ----------------
  const COLORS = ['#FF6A3D', '#2F7DF6', '#34D399', '#F43F5E'];
  const MVLink = {
    peer: null, code: '', url: '', on: false, lm: null, ts: 0, rx: 0, paused: false,
    players: [null, null, null, null],   // hasta 4 celulares: cada uno es un jugador
    listeners: [], status: () => {}, onChange: null,
    get conn() { const p = this.players.find(Boolean); return p ? p.conn : null; },
    COLORS,
    onPose(fn) { this.listeners.push(fn); },
    count() { return this.players.filter(Boolean).length; },
    open(status) {
      if (status) this.status = status;
      if (this.peer) return;
      if (!window.Peer) { this.status('No se pudo cargar la conexión. Revisa internet.', false); return; }
      this.code = String(Math.floor(100000 + Math.random() * 900000));
      const peer = new Peer('mivibra-mv-' + this.code); this.peer = peer;
      this.url = new URL('../camara/?c=' + this.code, location.href).href;
      this.status('Esperando el celular…', false);
      peer.on('error', (e) => { if (e.type === 'unavailable-id') { peer.destroy(); this.peer = null; this.open(); } else this.status('Error de conexión (' + e.type + ')', false); });
      peer.on('connection', (c) => {
        c.on('open', () => {
          const slot = this.players.findIndex((p) => !p);
          if (slot < 0) { try { c.send({ t: 'full' }); } catch (e) {} setTimeout(() => c.close(), 500); return; }
          const P = { conn: c, slot, lm: null, ts: 0, rx: 0, paused: false, color: COLORS[slot] }; this.players[slot] = P;
          try { c.send({ t: 'slot', n: slot + 1, color: COLORS[slot] }); } catch (e) {}
          this.on = true; this.status(this.count() === 1 ? '¡Celular conectado! Levanta la mano para usar el menú' : this.count() + ' celulares conectados', true);
          if (this.onChange) this.onChange();
          c.on('data', (d) => this.data(d, P));
          c.on('close', () => { if (this.players[slot] === P) this.players[slot] = null; this.on = this.count() > 0; this.lm = this.on ? this.lm : null; this.status(this.on ? this.count() + ' celulares conectados' : 'Se desconectó el celular', this.on); if (this.onChange) this.onChange(); });
        });
      });
    },
    qr(size) { try { const q = qrcode(0, 'M'); q.addData(this.url); q.make(); return q.createDataURL(size || 6, 2); } catch (e) { return ''; } },
    say(text, ok, slot) { this.players.forEach((p) => { if (p && (slot === undefined || p.slot === slot)) try { if (p.conn.open) p.conn.send({ t: 'say', text, ok: !!ok }); } catch (e) {} }); },
    data(d, P) {
      if (!d) return;
      if (d.t === 'pause') { P.paused = !!d.on; this.paused = this.players.some((p) => p && p.paused); return; }
      if (d.t !== 'p' || !d.l) return;
      P.lm = d.l; P.rx = performance.now(); P.ts = typeof d.ts === 'number' ? d.ts : P.rx;
      this.lm = d.l; this.rx = P.rx; this.ts = P.ts;
      for (const f of this.listeners) try { f(d.l, P.ts, d, P.slot); } catch (e) { console.error(e); }
    },
    fresh(slot) { const now = performance.now(); if (slot !== undefined) { const p = this.players[slot]; return !!(p && !p.paused && p.lm && now - p.rx < 800); } return this.players.some((p) => p && !p.paused && p.lm && now - p.rx < 800); },
  };

  // ---------------- Estilos y piezas de pantalla ----------------
  const css = `
.mvh-dim{position:fixed;inset:0;z-index:40;background:rgba(8,9,12,.55);display:none}
html:not(.q0) .mvh-dim{backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.mvh-dim.on{display:block}
.mvh-menu{position:fixed;z-index:41;left:8vw;top:50%;transform:translateY(-50%);width:min(470px,42vw);padding:24px 24px 20px;display:none;
  background:rgba(30,32,36,.78);border:1px solid rgba(255,255,255,.22);border-radius:24px;box-shadow:inset 0 1px 0 rgba(255,255,255,.2),0 20px 50px -20px rgba(0,0,0,.7);color:#fff;font-family:Manrope,Inter,system-ui,sans-serif}
.mvh-menu.on{display:block}
.mvh-menu small{display:block;font-size:12px;letter-spacing:.24em;font-weight:800;color:#D6D9DC}
.mvh-menu h2{margin:6px 0 4px;font-size:36px;letter-spacing:-.02em}
.mvh-menu .sub{margin:0 0 6px;color:#E4E6E8;font-size:15px;line-height:1.4}
.mvh-opt{position:relative;display:flex;align-items:center;gap:16px;height:66px;margin-top:12px;padding:0 20px;border-radius:18px;background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.12);font-size:22px;font-weight:800}
.mvh-opt .ic{width:36px;height:36px;border-radius:11px;background:rgba(255,255,255,.12);display:grid;place-items:center;font-size:17px;flex:none}
.mvh-opt.hov,.mvh-opt.kbd{background:rgba(255,106,61,.22);border-color:#FF6A3D}
.mvh-opt.go{background:#FF6A3D;border-color:#FFB13D}
.mvh-rail{position:absolute;left:calc(100% + 14px);top:50%;transform:translateY(-50%);width:250px;height:54px;border-radius:99px;background:rgba(24,26,30,.85);border:2px solid rgba(255,255,255,.28);overflow:hidden;display:none}
.mvh-opt.hov .mvh-rail{display:block}
.mvh-rail i{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,rgba(255,106,61,.35),#FF6A3D);border-radius:99px}
.mvh-rail span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:6px;font-size:17px;font-weight:800}
.mvh-rail b{font-size:21px;color:#FFB13D}
.mvh-help{margin-top:14px;font-size:13px;color:#C9CED6;line-height:1.45}
.mvh-cur{position:fixed;z-index:60;left:0;top:0;width:72px;height:72px;margin:-36px 0 0 -36px;display:none;pointer-events:none;filter:drop-shadow(0 0 12px rgba(255,106,61,.85)) drop-shadow(0 6px 10px rgba(0,0,0,.5))}
.mvh-cur.on{display:block}
.mvh-ring{position:fixed;z-index:55;left:5vw;bottom:9vh;width:130px;height:130px;display:none;color:#fff;font:900 34px Manrope,Inter,sans-serif}
.mvh-ring.on{display:block}
.mvh-ring div{position:absolute;inset:0;display:grid;place-items:center}
`;
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; }
  let dim, box, cur, ring, ringArc, built = false;
  function build() {
    if (built) return; built = true;
    const st = el('style'); st.textContent = css; document.head.appendChild(st);
    dim = el('div', 'mvh-dim'); box = el('div', 'mvh-menu');
    cur = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); cur.setAttribute('viewBox', '0 0 100 100'); cur.setAttribute('class', 'mvh-cur');
    cur.innerHTML = '<g fill="#fff" stroke="#FF6A3D" stroke-width="4" stroke-linejoin="round"><path d="M30 88 C20 78 16 66 16 56 L16 44 C16 39 25 39 25 44 L25 54 L28 54 L28 20 C28 14 37 14 37 20 L37 50 L40 50 L40 14 C40 8 49 8 49 14 L49 50 L52 50 L52 18 C52 12 61 12 61 18 L61 52 L64 52 L64 28 C64 22 73 22 73 28 L73 62 C73 76 66 88 54 92 Z"/></g>';
    ring = el('div', 'mvh-ring', '<svg width="130" height="130" viewBox="0 0 130 130"><circle cx="65" cy="65" r="54" stroke="rgba(255,255,255,.25)" stroke-width="11" fill="rgba(24,26,30,.7)"/><circle class="arc" cx="65" cy="65" r="54" stroke="#FF6A3D" stroke-width="11" fill="none" stroke-linecap="round" stroke-dasharray="0 400" transform="rotate(-90 65 65)"/></svg><div>❚❚</div>');
    ringArc = ring.querySelector('.arc');
    document.body.append(dim, box, ring, cur);
  }

  // ---------------- Sonidos cortos del menú ----------------
  let ac = null;
  function beep(f, d, g) {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), v = ac.createGain(), t = ac.currentTime;
      o.frequency.value = f; v.gain.setValueAtTime(0, t); v.gain.linearRampToValueAtTime(g || 0.12, t + 0.008); v.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(v); v.connect(ac.destination); o.start(t); o.stop(t + d + 0.02);
    } catch (e) {}
  }

  // ---------------- Mano: cursor, menú y pausa ----------------
  const MVHand = {
    open: false, items: [], hov: -1, kbd: 0, prog: 0, x: -1, y: -1, active: false, pickT: 0,
    onPause: null, pauseEnabled: false, pauseHold: 0, lastTs: 0, cb: null,
    menu(opt) {
      build();
      this.cb = opt.onPick; this.backId = opt.back || null;
      box.innerHTML = (opt.kicker ? '<small>' + opt.kicker + '</small>' : '') + '<h2>' + opt.title + '</h2>' + (opt.sub ? '<p class="sub">' + opt.sub + '</p>' : '') +
        opt.items.map((it, i) => '<div class="mvh-opt" data-i="' + i + '"><span class="ic">' + (it.icon || '›') + '</span>' + it.label + '<div class="mvh-rail"><i></i><span>Desliza <b>›››</b></span></div></div>').join('') +
        '<div class="mvh-help">' + (opt.help || 'Con la cámara: levanta la mano, pásala por una opción y desliza por la flecha.<br>Con el control: flechas y OK.') + '</div>';
      this.items = opt.items; this.hov = -1; this.prog = 0; this.kbd = opt.focus || 0; this.pickT = 0;
      box.classList.add('on'); dim.classList.toggle('on', opt.dim !== false); this.open = true; this.paint();
    },
    close() { if (!built) return; box.classList.remove('on'); dim.classList.remove('on'); cur.classList.remove('on'); this.open = false; this.hov = -1; },
    opts() { return [...box.querySelectorAll('.mvh-opt')]; },
    paint() {
      this.opts().forEach((o, i) => {
        o.classList.toggle('hov', i === this.hov); o.classList.toggle('kbd', i === this.kbd && this.hov < 0 && !this.active);
        const bar = o.querySelector('.mvh-rail i'); bar.style.width = (i === this.hov ? this.prog * 100 : 0).toFixed(1) + '%';
      });
    },
    pick(i) {
      if (this.pickT) return; this.pickT = 1;
      const o = this.opts()[i]; if (o) { o.classList.add('go'); o.classList.remove('hov'); }
      beep(659, 0.25); setTimeout(() => beep(988, 0.3), 80);
      const it = this.items[i]; setTimeout(() => { this.close(); if (this.cb) this.cb(it.id); }, 260);
    },
    key(e) {   // control remoto / teclado; devuelve true si lo usó
      if (!this.open) return false;
      const n = this.items.length, k = e.key;
      if (k === 'ArrowDown') { this.kbd = (this.kbd + 1) % n; beep(1300, 0.05, 0.06); this.paint(); return true; }
      if (k === 'ArrowUp') { this.kbd = (this.kbd + n - 1) % n; beep(1300, 0.05, 0.06); this.paint(); return true; }
      if (k === 'Enter' || k === ' ' || k === 'OK' || e.keyCode === 23) { this.pick(this.kbd); return true; }
      if ((k === 'Escape' || k === 'Backspace') && this.backId) { const i = this.items.findIndex((x) => x.id === this.backId); if (i >= 0) this.pick(i); return true; }
      return false;
    },
    // Llega una pose del celular
    feed(l, ts, slot) {
      if (this.owner !== undefined && this.owner !== slot && performance.now() - this.ownerT < 1500) return;
      const dt = this.lastTs ? clamp((ts - this.lastTs) / 1000, 0, 0.2) : 0.03; this.lastTs = ts;
      const v = (i) => l[i] && l[i][2] > 0.45;
      if (!(v(1) && v(2) && v(7) && v(8))) { this.active = false; if (built) cur.classList.remove('on'); this.ringSet(0); return; }
      const shY = (l[1][1] + l[2][1]) / 2, hipY = (l[7][1] + l[8][1]) / 2, torso = Math.max(0.06, hipY - shY);
      const midX = 1 - (l[1][0] + l[2][0]) / 2;   // en espejo, como frente a un espejo
      const up = (w, e) => v(w) && l[w][1] < hipY - 0.2 * torso && (!v(e) || l[w][1] < l[e][1] + 0.08 * torso);
      // ¿qué mano manda? la derecha (6); si no está arriba, la izquierda (5)
      let w = up(6, 4) ? 6 : up(5, 3) ? 5 : -1;
      if (w >= 0) { this.owner = slot; this.ownerT = performance.now(); }
      if (this.open && w >= 0) {
        const sx = 1 - l[w][0], side = w === 6 ? 1 : -1;
        const tx = clamp(0.5 + (sx - midX - side * 0.35 * torso) / (torso * 1.5), 0, 1), ty = clamp(0.5 + (l[w][1] - (shY - 0.05 * torso)) / (torso * 1.15), 0, 1);
        const W = innerWidth, H = innerHeight, k = this.active ? 0.35 : 1;
        this.x = this.x < 0 || !this.active ? tx * W : this.x + (tx * W - this.x) * k; this.y = this.y < 0 || !this.active ? ty * H : this.y + (ty * H - this.y) * k;
        this.active = true; build(); cur.classList.add('on'); cur.style.transform = `translate(${this.x.toFixed(1)}px,${this.y.toFixed(1)}px)`;
        this.hover();
      } else { this.active = false; if (built) cur.classList.remove('on'); }
      // Pausa: brazo izquierdo estirado hacia abajo y afuera, en diagonal, unos 1,6 s
      if (!this.open && this.pauseEnabled && this.onPause) {
        const sx = l[1][0], wx = v(5) ? l[5][0] : null, wy = v(5) ? l[5][1] : null;
        const out = wx !== null ? Math.abs(wx - sx) / torso : 0;   // qué tan afuera del hombro
        const ok = wx !== null && wy > shY + 0.3 * torso && wy < hipY + 0.45 * torso && out > 0.45 && !up(6, 4);
        this.pauseHold = ok ? this.pauseHold + dt : Math.max(0, this.pauseHold - dt * 2);
        this.ringSet(this.pauseHold / 1.6);
        if (this.pauseHold >= 1.6) { this.pauseHold = 0; this.ringSet(0); beep(523, 0.35); setTimeout(() => beep(392, 0.4), 120); this.onPause(); }
      } else { this.pauseHold = 0; this.ringSet(0); }
    },
    ringSet(k) { if (!built) return; ring.classList.toggle('on', k > 0.05); ringArc.setAttribute('stroke-dasharray', (clamp(k, 0, 1) * 339.3).toFixed(1) + ' 400'); },
    hover() {
      if (this.pickT) return;
      const o = this.opts(); let hit = -1;
      o.forEach((e, i) => { const r = e.getBoundingClientRect(); if (this.x >= r.left && this.x <= r.right && this.y >= r.top - 6 && this.y <= r.bottom + 6) hit = i; });
      if (this.hov >= 0) {   // ¿sigue en la opción o en su flecha?
        const rail = o[this.hov].querySelector('.mvh-rail').getBoundingClientRect(), ro = o[this.hov].getBoundingClientRect();
        const inBand = this.y >= rail.top - rail.height * 0.9 && this.y <= rail.bottom + rail.height * 0.9 && this.x >= ro.left && this.x <= rail.right + 60;
        if (inBand) {
          this.prog = clamp((this.x - rail.left - 20) / (rail.width - 40), 0, 1);
          this.paint();
          if (this.prog >= 0.94) this.pick(this.hov);
          return;
        }
        this.hov = -1; this.prog = 0;
      }
      if (hit >= 0 && hit !== this.hov) { this.hov = hit; this.kbd = hit; this.prog = 0; beep(1400, 0.06, 0.07); }
      this.paint();
    },
  };
  MVLink.onPose((l, ts, d, slot) => MVHand.feed(l, ts, slot));
  window.MVLink = MVLink; window.MVHand = MVHand;
})();
