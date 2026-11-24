// MiVibra Movimiento — motor común de los juegos con el estilo de las maquetas.
// Cada juego solo describe su escenario y sus reglas; aquí va todo lo demás:
//  · interfaz (marcador, avisos, barra de fuerza, código QR para conectar el celular, mano/cursor del menú)
//  · controles: cámara del celular (cuerpo), celular como mando (toques, deslizar, girar), pantalla táctil, control remoto/teclado
//  · avatares de los jugadores (el muñeco de cada uno) con animaciones, copia de movimientos y celebración
//  · efectos (fx.js), sonidos (sfx.js + grabaciones), cámara en tercera persona, pausa, foto final y menú de revancha
import * as THREE from 'three';
import * as E from './estilo.js';
import { loadAnims, Animator } from './anim.js';
import { build as buildAvatar, decode as decodeAvatar, DEFAULT, PRESETS } from './avatar.js';
import { Espejo, celebrate, facesCam, portraitSnap, reachArm, dance, DANCES } from './espejo.js';
import { createFX } from './fx.js';
import { SFX } from './sfx.js';
import { makeSound } from './sonido.js';
import { readSaved, fromApp, bodyReader } from './playa.js';

export { THREE, E, reachArm, dance, DANCES, facesCam };
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), lerp = (a, b, k) => a + (b - a) * k, rnd = (a, b) => a + Math.random() * (b - a);
const $ = (id) => document.getElementById(id);

// ---------- Lectura del cuerpo para los gestos de cada deporte ----------
// l: 21 puntos [x, y, visibilidad] (0 nariz, 1-2 hombros, 3-4 codos, 5-6 muñecas, 7-8 caderas, 9-10 rodillas, 11-12 tobillos)
// w: los mismos en metros (z negativo = hacia el celular). "Derecha" es la derecha de la persona.
export class Cuerpo {
  constructor() { this.reset(); }
  reset() {
    Object.assign(this, { ok: false, ts: 0, sw: 0.2, x: 0, lean: 0, crouch: 0, armsUp: false, oneUp: false, jumpAt: -1e9, hist: [], x0: null, hip0: null,
      wr: { l: { x: 0, y: 0, vx: 0, vy: 0, vz: 0, sp: 0 }, r: { x: 0, y: 0, vx: 0, vy: 0, vz: 0, sp: 0 } },
      punch: { l: -1e9, r: -1e9, pow: 0 }, swingAt: -1e9, swing: { dir: 0, pow: 0, vy: 0 }, throwAt: -1e9, throw: { pow: 0, dx: 0, dy: 0, side: 'r' },
      steps: 0, stepRate: 0, stepT: [], lastKnee: 0, kneeAt: -1e9, clapAt: -1e9, handsGap: 9 });
  }
  recenter() { this.x0 = null; this.hip0 = null; }
  feed(l, ts, w) {
    const v = (i) => l[i] && l[i][2] > 0.45; if (!(v(1) && v(2))) { this.ok = false; return; }
    this.ok = true; const now = performance.now();
    const sx = (l[1][0] + l[2][0]) / 2, sy = (l[1][1] + l[2][1]) / 2, sw = Math.max(0.05, Math.abs(l[1][0] - l[2][0])); this.sw = sw;
    if (this.x0 === null) this.x0 = sx; this.x = (this.x0 - sx) / sw;
    const nose = v(0) ? l[0][1] : sy - sw * 0.6, up = (i) => v(i) && l[i][1] < nose;
    this.armsUp = up(5) && up(6); this.oneUp = up(5) || up(6);
    let torso = sw * 1.4;
    if (v(7) && v(8)) { const hx = (l[7][0] + l[8][0]) / 2, hy = (l[7][1] + l[8][1]) / 2; torso = Math.max(0.05, hy - sy); this.lean = (hx - sx) / sw;
      if (this.hip0 === null) this.hip0 = hy; this.hip0 = this.hip0 * 0.995 + hy * 0.005;
      const rise = (this.hip0 - hy) / torso; this.crouch = clamp(-rise * 2.2, 0, 1);
      if (rise > 0.22 && now - this.jumpAt > 600) this.jumpAt = now; }
    // muñecas: posición relativa al centro de los hombros (en anchos de hombro; x+ = derecha de la persona, y+ = arriba)
    const pt = { ts, l: v(5) ? [(sx - l[5][0]) / sw, (sy - l[5][1]) / sw] : null, r: v(6) ? [(sx - l[6][0]) / sw, (sy - l[6][1]) / sw] : null,
      zl: w && w[5] ? w[5][2] : null, zr: w && w[6] ? w[6][2] : null, kl: v(9) ? l[9][1] / sw : null, kr: v(10) ? l[10][1] / sw : null };
    this.hist.push(pt); this.hist = this.hist.filter((h) => ts - h.ts < 220);
    const o = this.hist.find((h) => ts - h.ts >= 90) || this.hist[0], dt = Math.max(0.03, (ts - o.ts) / 1000);
    ['l', 'r'].forEach((s) => { const W = this.wr[s], p = pt[s], q = o[s]; if (!p) return; W.x = p[0]; W.y = p[1];
      if (q) { W.vx = (p[0] - q[0]) / dt; W.vy = (p[1] - q[1]) / dt; } const zz = pt['z' + s], zq = o['z' + s]; W.vz = zz !== null && zq !== null && zz !== undefined && zq !== undefined ? (zq - zz) / dt : 0; W.sp = Math.hypot(W.vx, W.vy); });
    const L = this.wr.l, R = this.wr.r;
    this.handsGap = pt.l && pt.r ? Math.hypot(L.x - R.x, L.y - R.y) : 9;
    // golpe recto (hacia el celular): la muñeca avanza rápido en profundidad o se estira hacia el centro
    ['l', 'r'].forEach((s) => { const W = this.wr[s], fwd = W.vz > 1.6 || (W.vz === 0 && W.sp > 5 && Math.abs(W.y) < 0.9);
      if (fwd && now - this.punch[s] > 280) { this.punch[s] = now; this.punch.pow = clamp(Math.max(W.vz / 4, W.sp / 10), 0.3, 1); this.punch.side = s; this.punch.y = W.y; } });
    // swing (raqueta, bate, palo): muñeca más rápida que cruza de lado a lado
    const F = L.sp > R.sp ? L : R;
    if (Math.abs(F.vx) > 4 && now - this.swingAt > 450) { this.swingAt = now; this.swing = { dir: Math.sign(F.vx), pow: clamp((Math.abs(F.vx) - 4) / 7 + 0.35, 0.2, 1), vy: F.vy, hi: F.y }; }
    // lanzamiento (dardo, pelota, bola): la mano va de atrás/arriba hacia adelante; dirección por el movimiento lateral
    const T = R.sp + Math.max(0, R.vz) * 2 > L.sp + Math.max(0, L.vz) * 2 ? R : L, tp = Math.max(T.vz, 0) * 1.6 + Math.max(0, -T.vy) * 0.4 + T.sp * 0.25;
    if (tp > 3.4 && now - this.throwAt > 700) { this.throwAt = now; this.throw = { pow: clamp((tp - 3.4) / 6 + 0.35, 0.2, 1), dx: clamp(T.vx / 6, -1, 1), dy: clamp(T.vy / 8, -1, 1), side: T === R ? 'r' : 'l' }; }
    // palmas: las manos se juntan rápido
    if (this.handsGap < 0.5 && this.prevGap > 1.1 && now - this.clapAt > 300) this.clapAt = now; this.prevGap = this.handsGap;
    // trote en el sitio: rodillas que se alternan (cada cruce es un paso)
    if (pt.kl !== null && pt.kr !== null) { const d = Math.sign(pt.kl - pt.kr); if (d && d !== this.lastKnee && Math.abs(pt.kl - pt.kr) > 0.18) { this.lastKnee = d; this.steps++; this.stepT.push(now); this.kneeAt = now; } }
    this.stepT = this.stepT.filter((t) => now - t < 1500); this.stepRate = this.stepT.length / 1.5;
  }
  // brazo de arco: uno estirado hacia un lado a la altura del hombro, el otro tira hacia la cara
  get bow() { const L = this.wr.l, R = this.wr.r, ext = Math.abs(L.x) > Math.abs(R.x) ? L : R, pull = ext === L ? R : L;
    return { up: Math.abs(ext.x) > 1.3 && Math.abs(ext.y) < 1.1, aimY: clamp(ext.y / 1.2, -1, 1), draw: clamp(Math.hypot(ext.x - pull.x, ext.y - pull.y) / 2.6, 0, 1), pullSp: pull.sp, side: ext === L ? 'l' : 'r' }; }
  // dirección de cada brazo (para el baile): ángulo del hombro a la muñeca, en grados (0 = derecha, 90 = arriba)
  arm(s) { const W = this.wr[s], bx = W.x - (s === 'r' ? 0.5 : -0.5); return Math.atan2(W.y, bx) * 180 / Math.PI; }
}

// ---------- Interfaz ----------
const CSS = `*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden;background:#14102a;color:#fff;font-family:'DM Sans',Manrope,system-ui,sans-serif;-webkit-user-select:none;user-select:none}
canvas{display:block;touch-action:none}
.glass{background:rgba(28,18,56,.62);border:1px solid rgba(255,255,255,.24);border-radius:20px;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 14px 34px -14px rgba(0,0,0,.6)}
html:not(.q0) .glass{backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}html.q0 .glass{background:rgba(28,18,56,.86)}
.ui{position:fixed;z-index:5}small{display:block;font-size:11px;letter-spacing:.2em;font-weight:800;color:#E7DDFF}
#hud{left:18px;top:16px;padding:9px 15px}#hud b{font:800 19px 'Bricolage Grotesque',sans-serif}
#score{left:50%;top:14px;transform:translateX(-50%);padding:9px 16px;display:none;align-items:center;gap:14px;font-weight:800;white-space:nowrap}#score.on{display:flex}
#score .pl{display:flex;align-items:center;gap:8px;font-size:15px}#score .pl i{width:11px;height:11px;border-radius:50%}#score .n{font:900 30px 'Bricolage Grotesque',sans-serif;min-width:36px;text-align:center}
#score .sep{opacity:.5}#score .tag{font-size:12px;padding:3px 9px;border-radius:99px;background:rgba(255,255,255,.14)}
#cue{left:50%;top:96px;transform:translateX(-50%);padding:11px 22px;font-size:21px;font-weight:800;white-space:nowrap;display:none;max-width:94vw;overflow:hidden;text-overflow:ellipsis}
#cue.on{display:block}#cue.hot{background:rgba(255,46,168,.9);border-color:#FFB3E2}
#big{left:0;right:0;top:22%;text-align:center;display:none;pointer-events:none}#big.on{display:block;animation:pop .45s cubic-bezier(.2,1.6,.4,1)}
@keyframes pop{0%{transform:scale(.4);opacity:0}100%{transform:scale(1);opacity:1}}
#big b{display:block;font:900 min(104px,16vw)/1.05 'Bricolage Grotesque',sans-serif;text-shadow:0 6px 0 #FF2EA8,0 16px 46px rgba(0,0,0,.6)}
#big span{display:inline-block;margin-top:8px;font-size:22px;font-weight:800;padding:8px 18px;border-radius:99px;background:rgba(28,18,56,.72)}
#meter{left:18px;bottom:18px;width:280px;padding:11px 15px;display:none}#meter.on{display:block}
#meter .bar{height:14px;border-radius:99px;background:rgba(255,255,255,.14);margin-top:8px;overflow:hidden}#meter .bar i{display:block;height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,#00E5FF,#FFE600,#FF2EA8)}
#meter .v{display:flex;justify-content:space-between;margin-top:6px;font-weight:800;font-size:14px}
#phone{right:18px;bottom:18px;width:150px;padding:9px 11px;display:none}#phone.on{display:block}
#phone svg{display:block;margin:4px auto 0}#phone path{stroke:#7CFF4D;stroke-width:6;stroke-linecap:round;fill:none}
#connect{right:18px;top:96px;width:290px;padding:14px;display:none;text-align:center}#connect.on{display:block}
#connect img{width:150px;height:150px;border-radius:14px;background:#fff;padding:6px;display:block;margin:8px auto}
#connect .code{font:900 30px 'Bricolage Grotesque',sans-serif;letter-spacing:.16em}#connect .st{font-size:14px;margin-top:6px;color:#EEE8FF}#connect .st.ok{color:#7CFF4D;font-weight:800}
#connect i{display:block;font-size:12px;color:#D8CFF2;margin-top:8px;font-style:normal;line-height:1.45}
#loading{left:50%;top:50%;transform:translate(-50%,-50%);padding:18px 26px;font-weight:800;font-size:18px}
#keys{left:50%;bottom:20px;transform:translateX(-50%);padding:8px 14px;font-size:13px;color:#EEE8FF;display:none;white-space:nowrap}#keys.on{display:block}
#touchbar{position:fixed;left:50%;bottom:58px;transform:translateX(-50%);display:none;gap:10px;z-index:6}#touchbar.on{display:flex}
#touchbar button{min-width:64px;height:58px;border-radius:18px;border:1px solid rgba(255,255,255,.3);background:rgba(28,18,56,.7);color:#fff;font:900 20px sans-serif;padding:0 14px}
#touchbar button.ok{background:#FF2EA8;border-color:#FF2EA8}
#credit{position:fixed;left:50%;bottom:4px;transform:translateX(-50%);font-size:10.5px;color:rgba(255,255,255,.7);z-index:5;white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,.6)}
@media (max-width:1100px){body.sc #hud{display:none}}
#pauseBtn{position:fixed;right:16px;top:16px;z-index:6;width:48px;height:48px;border-radius:16px;font:900 18px sans-serif;color:#fff;display:none}#pauseBtn.on{display:block}`;

function buildUI(cfg) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const fl = document.createElement('link'); fl.rel = 'stylesheet'; fl.href = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=DM+Sans:wght@500;700;800&display=swap'; document.head.appendChild(fl);
  const d = document.createElement('div');
  d.innerHTML = `<div id="hud" class="ui glass"><small>${cfg.kicker || 'MIVIBRA MOVIMIENTO'}</small><b>${cfg.title}</b></div>
<div id="score" class="ui glass"></div><div id="cue" class="ui glass"></div>
<div id="big" class="ui"><b id="bigT"></b><span id="bigS"></span></div>
<div id="meter" class="ui glass"><small id="mt">FUERZA</small><div class="bar"><i id="mbar"></i></div><div class="v"><span id="mv1"></span><span id="mv2"></span></div></div>
<div id="phone" class="ui glass"><small>CÁMARA DEL CELULAR</small><svg width="126" height="150" viewBox="0 0 150 176"><g id="stick"></g></svg></div>
<div id="connect" class="ui glass"><small>JUEGA CON TU CUERPO · HASTA ${cfg.maxPlayers || 2}</small><img id="qr" alt="Código QR para conectar el celular"><div class="code" id="code">······</div><div class="st" id="cst">Preparando…</div><i>${cfg.how || ''}<br>O usa el celular como mando, la pantalla táctil o el control.</i></div>
<div id="keys" class="ui glass"></div><div id="touchbar"></div><button id="pauseBtn" class="glass" aria-label="Pausa">❚❚</button>
<div id="loading" class="ui glass">${cfg.loading || 'Preparando…'}</div>
<div id="credit">${cfg.credit || 'Avatares MiVibra · sonidos generados en vivo'}</div>`;
  document.body.appendChild(d);
}

// ---------- Motor ----------
export async function startGame(cfg) {
  buildUI(cfg);
  const UA = navigator.userAgent;
  const IS_TV = /Tizen|Web0S|webOS|SMART-TV|SmartTV|NetCast|HbbTV|BRAVIA|AFT[A-Z]|Android TV|GoogleTV|MiTV|Mi TV|TCL|Hisense|CrKey/i.test(UA) || (/Android/i.test(UA) && !/Mobile/i.test(UA) && !('ontouchstart' in window) && screen.width >= 1280);
  const TOUCH = !IS_TV && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  const QP = new URLSearchParams(location.search).get('q');
  const Q = QP !== null ? clamp(+QP | 0, 0, 2) : IS_TV ? 0 : (navigator.hardwareConcurrency || 4) <= 4 ? 1 : 2;
  document.documentElement.classList.toggle('q0', Q === 0);
  const R = new THREE.WebGLRenderer({ antialias: Q === 2, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  R.setPixelRatio(Math.min(devicePixelRatio, Q === 2 ? 1.5 : 1, (Q === 0 ? 960 : 2000) / innerWidth)); R.setSize(innerWidth, innerHeight);
  R.outputColorSpace = THREE.SRGBColorSpace;
  document.body.prepend(R.domElement);
  const S = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(cfg.fov || 50, innerWidth / innerHeight, 0.05, 900);
  addEventListener('resize', () => { R.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });
  const FX = createFX(THREE, S, cam, Q), sfx = new SFX();
  const REC = makeSound({ files: cfg.ambient || ['ovacion', 'aplausos', 'estadio-ambiente'] });
  let sndOn = false;
  const LVL = cfg.levels || [{ name: 'Fácil', k: 0.55 }, { name: 'Normal', k: 0.78 }, { name: 'Difícil', k: 1 }];

  const ui = {
    cue(t, hot, ms) { $('cue').textContent = t; $('cue').classList.toggle('hot', !!hot); $('cue').classList.add('on'); clearTimeout(ui.cue.h); ui.cue.h = setTimeout(() => $('cue').classList.remove('on'), ms || 3200); },
    big(t, s, ms) { const b = $('big'); $('bigT').textContent = t; $('bigS').textContent = s || ''; $('bigS').style.display = s ? '' : 'none'; b.classList.remove('on'); void b.offsetWidth; b.classList.add('on'); clearTimeout(ui.big.h); ui.big.h = setTimeout(() => b.classList.remove('on'), ms || 2000); },
    keys(t) { $('keys').textContent = t || ''; $('keys').classList.toggle('on', !!t && !TOUCH); },
    meter(v, label, a, b) { const m = $('meter'); if (v === null || v === undefined) { m.classList.remove('on'); return; } m.classList.add('on'); $('mbar').style.width = Math.round(clamp(v, 0, 1) * 100) + '%'; if (label) $('mt').textContent = label; $('mv1').textContent = a || ''; $('mv2').textContent = b || ''; },
    score(html) { $('score').innerHTML = html; $('score').classList.toggle('on', !!html); document.body.classList.toggle('sc', !!html); },
    // botones en pantalla para celular o tableta (sin control remoto)
    touch(list) { const tb = $('touchbar'); if (!TOUCH || !list || !list.length) { tb.classList.remove('on'); tb.innerHTML = ''; return; }
      tb.innerHTML = list.map((b, i) => `<button data-i="${i}" class="${b.ok ? 'ok' : ''}">${b.label}</button>`).join(''); tb.classList.add('on');
      tb.querySelectorAll('button').forEach((el) => { const b = list[+el.dataset.i]; el.onpointerdown = (e) => { e.preventDefault(); e.stopPropagation(); fireKey(b.key, true); }; el.onpointerup = (e) => { e.stopPropagation(); fireKey(b.key, false); }; }); },
    pl(k, n) { return `<span class="pl"><i style="background:${P[k] ? P[k].color : '#fff'}"></i>${P[k] ? P[k].name : ''}</span><span class="n" id="sc${k}">${n}</span>`; },
  };
  function fireKey(key, down) { const ev = new KeyboardEvent(down ? 'keydown' : 'keyup', { key, bubbles: true }); dispatchEvent(ev); }

  // ---------- Jugadores ----------
  const NP = cfg.players || 2;
  const P = Array.from({ length: NP }, (_, k) => ({ k, name: k ? 'MiVibra' : 'Tú', av: null, slot: k, cpu: k > 0, color: MVLink.COLORS[k] || '#fff', cel: {} }));
  const BODY = [0, 1, 2, 3].map(() => new Cuerpo()), OLD = [0, 1, 2, 3].map(() => bodyReader()), EJ = [0, 1, 2, 3].map(() => new Espejo());
  MVLink.onPose((l, ts, d, slot) => { if (slot < 4 && l) { BODY[slot].feed(l, ts, d.w); OLD[slot].feed(l, ts); EJ[slot].feed(d); } });
  let ANIMS = null, myRec = null;
  async function makeAv(rec) { const a = await buildAvatar(rec, { lite: Q === 0 }); a.scene.traverse((o) => { if (o.isMesh) o.castShadow = false; }); S.add(a.scene); if (ANIMS) a.anim = new Animator(a, ANIMS); a.blob = E.blob(S, 0, 0, 0.55, 0.35); return a; }
  async function loadAvatars() {
    const acc = await fromApp(); myRec = acc && acc.vrm ? decodeAvatar(acc.vrm) : null;
    if (!myRec) { const s = await readSaved(); myRec = s && s.vrm ? decodeAvatar(s.vrm) : null; }
    if (!myRec) myRec = Object.assign({}, DEFAULT, { name: 'Tú' });
    ANIMS = await loadAnims().catch(() => null);
    for (let k = 0; k < NP; k++) { const rec = k === 0 ? myRec : PRESETS[(k + 3) % PRESETS.length]; P[k].av = await makeAv(rec); P[k].rec = rec; if (k === 0) P[0].name = myRec.name || 'Tú'; if (rec.color) P[k].color = rec.color; }
  }

  // ---------- Contexto que recibe cada juego ----------
  const ctx = {
    THREE, E, R, S, cam, Q, FX, sfx, ui, P, LVL, IS_TV, TOUCH, BODY, clamp, lerp, rnd,
    state: 'load', mode: 'cpu', lvl: 1, t: 0, paused: false, win: -1, data: {},
    rec: REC,
    amb(name, vol) { if (!sndOn) return; if (REC.has(name) || true) REC.loop(name, vol); },
    crowd(kind = 'ole') { if (kind === 'ole') { if (REC.has('ovacion')) REC.play('ovacion', 0.8); else sfx.play('ovacion'); } else if (kind === 'aplausos') { if (REC.has('aplausos')) REC.play('aplausos', 0.7); else sfx.play('aplausos'); } else sfx.play(kind); },
    human: (k) => !P[k].cpu,
    camOf: (k) => !P[k].cpu && MVLink.fresh(P[k].slot) && !(MVLink.players[P[k].slot] || {}).mando,
    body: (k) => BODY[P[k].slot], old: (k) => OLD[P[k].slot], espejo: (k) => EJ[P[k].slot],
    tilt: (k) => { const p = MVLink.players[P[k].slot]; return p && p.tilt ? p.tilt : null; },
    say: (k, txt, ok) => MVLink.say(txt, ok, P[k].slot),
    lvlK: () => LVL[ctx.lvl].k,
    clip(k, name, o) { const a = P[k].av; if (a && a.anim) a.anim.play(name, o || {}); },
    mirror(k, o) { const a = P[k].av; if (a && ctx.camOf(k)) EJ[P[k].slot].apply(a, ctx.dt, o || { arms: 1, spine: 0.6, head: 1 }, facesCam(a.scene, cam)); },
    reach(k, side, target, kk = 1, pole) { const a = P[k].av; if (a) reachArm(a, side, target, kk, pole); },
    // apunta el brazo en una dirección del cuerpo (x = izquierda del muñeco, y arriba, z al frente), usando el IK
    arm(k, side, dir, len = 0.62) { const a = P[k].av; if (!a) return; const sh = a.humanoid.getRawBoneNode(side + 'UpperArm'); if (!sh) return; a.scene.updateMatrixWorld(true); const p = new THREE.Vector3(); sh.getWorldPosition(p);
      const q = new THREE.Quaternion(); a.scene.getWorldQuaternion(q); const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize().applyQuaternion(q); reachArm(a, side, p.addScaledVector(d, len), 1); },
    // punto en el espacio del avatar (x = su izquierda, y arriba, z al frente) → mundo
    at(k, x, y, z) { const a = P[k].av; const v = new THREE.Vector3(x, y, z); if (!a) return v; a.scene.updateMatrixWorld(true); return v.applyMatrix4(a.scene.matrixWorld); },
    // hombro en el mundo (para poner las manos relativas al cuerpo del muñeco, que mide ~1,2 m)
    sh(k, side) { const a = P[k].av; const p = new THREE.Vector3(); if (!a) return p; const b = a.humanoid.getRawBoneNode(side + 'UpperArm'); a.scene.updateMatrixWorld(true); if (b) b.getWorldPosition(p); return p; },
    bone(k, name) { const a = P[k].av; return a ? a.humanoid.getNormalizedBoneNode(name) : null; },
    rot(k, name, x, y, z, kk = 1) { const b = ctx.bone(k, name); if (!b) return; const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)); b.quaternion.slerp(q, kk); },
    hand(k, side) { const a = P[k].av; const p = new THREE.Vector3(); if (!a) return p; const h = a.humanoid.getRawBoneNode(side + 'Hand'); a.scene.updateMatrixWorld(true); if (h) h.getWorldPosition(p); return p; },
    // pega un objeto a la mano (raqueta, bate, arco, palo, dardo…)
    hold(k, side, obj) { const a = P[k].av; if (!a) return; const h = a.humanoid.getRawBoneNode(side + 'Hand'); if (h) h.add(obj); },
    end(w, title, sub) { endGame(w, title, sub); },
    start: () => begin(),
    menu: () => startMenu(),
  };
  window.MVG = ctx;

  // ---------- Escenario ----------
  ctx.sponsors = await E.loadSponsors();
  const env = (await cfg.scene(ctx)) || {};
  ctx.env = env;

  // ---------- Fin, foto y menús ----------
  function endGame(w, title, sub) {
    if (ctx.state === 'end') return;
    ctx.state = 'end'; ctx.win = w; ctx.t = 0; MVHand.pauseEnabled = false; ui.meter(null); ui.keys(''); ui.touch([]);
    P.forEach((p, k) => { p.cel = {}; if (k !== w && p.av && p.av.anim && !(cfg.noDefeat || []).includes(k)) p.av.anim.play('Defeat', { loop: false, fade: 0.25 }); });
    ui.big(title, sub || '¡Celebra! Tu avatar baila contigo', 2600);
    ctx.crowd('ole'); setTimeout(() => ctx.crowd('aplausos'), 600);
    const W = w >= 0 ? P[w] : P[0], a = W.av ? W.av.scene.position : new THREE.Vector3();
    FX.party([a.x, a.y + 0.3, a.z], cfg.partyWord ? cfg.partyWord(w) : (w >= 0 && P[w].cpu ? '¡BIEN!' : '¡CAMPEÓN!'), '#FFE600');
    setTimeout(() => FX.fireworks([a.x, a.y, a.z - 6], 6, 5, 5), 900);
    P.forEach((p) => { if (!p.cpu && MVLink.players[p.slot]) MVLink.say(p === W ? '¡Ganaste! Celebra para la foto' : 'Buen juego. ¡La revancha!', p === W, p.slot); });
    const slots = P.filter((p) => !p.cpu && MVLink.players[p.slot]).map((p) => p.slot);
    setTimeout(() => MVPhoto.take({ title, sub: cfg.title + (cfg.photoSub ? ' · ' + cfg.photoSub(ctx) : ''), slots: !W.cpu && MVLink.players[W.slot] ? [W.slot] : slots.slice(0, 1), snap: () => portraitSnap(R, S, W.av), done: endMenu }), 1900);
  }
  function endMenu() {
    MVHand.menu({ kicker: 'FIN DEL JUEGO', title: cfg.endTitle ? cfg.endTitle(ctx) : (ctx.win >= 0 ? P[ctx.win].name + ' gana' : '¡Buen juego!'), dim: 0.25,
      items: [{ id: 'again', label: 'Revancha', icon: '↻' }, { id: 'menu', label: 'Menú principal', icon: '☰' }, { id: 'edit', label: 'Cambiar mi avatar', icon: '☺' }, { id: 'exit', label: 'Salir', icon: '✕' }], back: 'menu', onPick: menuPick });
  }
  const MODES = cfg.modes || [{ id: 'cpu', label: 'Contra MiVibra', icon: '▶' }, { id: 'two', label: '2 jugadores', icon: '⚔', two: true }];
  function startMenu() {
    ctx.state = 'menu'; MVHand.pauseEnabled = false; $('connect').classList.add('on'); ui.keys(''); ui.touch([]); ui.meter(null); $('pauseBtn').classList.remove('on');
    const n = MVLink.count();
    MVHand.menu({ kicker: cfg.kicker || 'MIVIBRA MOVIMIENTO', title: cfg.title, sub: (cfg.sub || '') + ' ' + (n ? 'Celular conectado.' : 'Conecta el celular, usa la pantalla o el control.'),
      items: MODES.concat(cfg.lvl === false ? [] : [{ id: 'lvl', label: 'Dificultad: ' + LVL[ctx.lvl].name, icon: '★' }], [{ id: 'exit', label: 'Salir', icon: '✕' }]), back: 'exit', onPick: menuPick });
  }
  function pause() {
    if (ctx.state === 'menu' || ctx.state === 'end' || ctx.state === 'load' || MVHand.open) return; ctx.paused = true;
    MVHand.menu({ kicker: 'EN PAUSA', title: 'Pausa', items: [{ id: 'resume', label: 'Continuar', icon: '▶' }, { id: 'again', label: 'Reiniciar', icon: '↻' }, { id: 'menu', label: 'Menú principal', icon: '☰' }, { id: 'exit', label: 'Salir', icon: '✕' }], back: 'resume', onPick: menuPick });
  }
  async function setMode(id) {
    const m = MODES.find((x) => x.id === id) || MODES[0]; ctx.mode = m.id; ctx.modeInfo = m;
    P.forEach((p, k) => { if (k === 0) return; p.cpu = !(m.two && k < (m.n || 2)); p.name = p.cpu ? (cfg.cpuName ? cfg.cpuName(k) : 'MiVibra') : 'Jugador ' + (k + 1); });
    P[0].name = m.two ? 'Jugador 1' : myRec.name || 'Tú';
  }
  function begin() {
    if (!sndOn) { sndOn = true; REC.init(); sfx.ac(); if (cfg.onSound) cfg.onSound(ctx); }
    $('connect').classList.remove('on'); $('pauseBtn').classList.toggle('on', TOUCH);
    BODY.forEach((b) => b.recenter()); OLD.forEach((b) => b.recenter()); P.forEach((p) => { p.cel = {}; });
    ctx.win = -1; ctx.t = 0; ctx.state = 'play'; MVHand.pauseEnabled = true; sfx.play(cfg.startSound || 'silbato');
    cfg.start(ctx, ctx.mode);
  }
  function menuPick(id) {
    ctx.paused = false;
    if (id === 'resume') return;
    if (id === 'lvl') { ctx.lvl = (ctx.lvl + 1) % LVL.length; return startMenu(); }
    if (id === 'menu') return startMenu();
    if (id === 'edit') { location.href = '../muneco/' + location.search; return; }
    if (id === 'exit') { if (window.parent !== window) window.parent.postMessage({ mv: 'close' }, '*'); else history.back(); return; }
    const m = MODES.find((x) => x.id === id);
    if (m && m.two && !cfg.shareController && MVLink.count() < (m.n || 2) && !TOUCH && !cfg.turns) { ui.cue('Para ' + (m.n || 2) + ' jugadores conecta ' + (m.n || 2) + ' celulares con el mismo código', true); return startMenu(); }
    if (m || id === 'again') { setMode(id === 'again' ? ctx.mode : id); begin(); }
  }
  MVHand.onPause = () => pause();
  $('pauseBtn').onclick = () => pause();

  // ---------- Controles ----------
  const held = new Set(); ctx.held = held;
  addEventListener('keydown', (e) => {
    if (MVHand.key(e)) { e.preventDefault(); return; }
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'MediaPlayPause' || e.key === 'Backspace') { pause(); e.preventDefault(); return; }
    const ok = e.key === 'Enter' || e.key === ' ' || e.keyCode === 23;
    if (!held.has(e.key) && ctx.state === 'play' && !ctx.paused && cfg.key) cfg.key(ctx, e.key, ok, e.mvSlot);
    held.add(e.key); if (e.mvSlot !== undefined) setTimeout(() => held.delete(e.key), 140);
    e.preventDefault();
  });
  addEventListener('keyup', (e) => { held.delete(e.key); if (cfg.keyUp && ctx.state === 'play') cfg.keyUp(ctx, e.key); });
  // pantalla táctil y ratón: toque, arrastre y deslizar (rápido = más fuerte)
  (() => { let st = null, pts = [];
    const pos = (e) => [e.clientX / innerWidth, e.clientY / innerHeight];
    R.domElement.addEventListener('pointerdown', (e) => { if (MVHand.open) return; const p = pos(e); st = { p, t: performance.now() }; pts = [[p[0], p[1], st.t]]; if (ctx.state === 'play' && !ctx.paused && cfg.touch) cfg.touch(ctx, { s: 'down', x: p[0], y: p[1] }, 0); });
    R.domElement.addEventListener('pointermove', (e) => { if (!st) return; const p = pos(e), now = performance.now(); pts.push([p[0], p[1], now]); pts = pts.filter((q) => now - q[2] < 160); if (ctx.state === 'play' && !ctx.paused && cfg.touch) cfg.touch(ctx, { s: 'move', x: p[0], y: p[1], dx: p[0] - st.p[0], dy: p[1] - st.p[1] }, 0); });
    R.domElement.addEventListener('pointerup', (e) => { if (!st) return; const p = pos(e), now = performance.now(), o = pts[0] || [p[0], p[1], st.t], dt = Math.max(16, now - o[2]) / 1000;
      const dx = p[0] - st.p[0], dy = p[1] - st.p[1], vx = (p[0] - o[0]) / dt, vy = (p[1] - o[1]) / dt, tap = Math.hypot(dx, dy) < 0.03 && now - st.t < 350; st = null;
      if (ctx.state !== 'play' || ctx.paused || !cfg.touch) return;
      cfg.touch(ctx, tap ? { s: 'tap', x: p[0], y: p[1] } : { s: 'swipe', x: p[0], y: p[1], dx, dy, vx, vy, sp: Math.hypot(vx, vy) }, 0); cfg.touch(ctx, { s: 'up', x: p[0], y: p[1] }, 0); });
  })();
  // celular como mando: el deslizar llega igual que en la pantalla táctil (con el número de jugador)
  MVLink.onPad((d, slot) => { if (ctx.state !== 'play' || ctx.paused || !cfg.touch) return; const k = Math.max(0, P.findIndex((p) => !p.cpu && p.slot === slot));
    if (d.t === 'sw') cfg.touch(ctx, { s: 'swipe', x: d.x, y: d.y, dx: d.dx, dy: d.dy, vx: d.vx, vy: d.vy, sp: d.sp, mando: true }, k);
    else if (d.t === 'tp') cfg.touch(ctx, { s: d.s, x: d.x, y: d.y, mando: true }, k); });

  // ---------- Muñequito del celular ----------
  function stickDraw() {
    const p = MVLink.players[0], l = p && p.lm; $('phone').classList.toggle('on', !!l && ctx.state === 'play' && !p.mando); if (!l) return;
    const Pt = (i) => [15 + (1 - l[i][0]) * 120, 10 + l[i][1] * 160], Bn = [[1, 2], [1, 3], [3, 5], [2, 4], [4, 6], [1, 7], [2, 8], [7, 8], [7, 9], [9, 11], [8, 10], [10, 12]];
    $('stick').innerHTML = Bn.filter(([a, b]) => l[a] && l[b] && l[a][2] > 0.4 && l[b][2] > 0.4).map(([a, b]) => { const q = Pt(a), r = Pt(b); return `<path d="M${q[0].toFixed(0)} ${q[1].toFixed(0)}L${r[0].toFixed(0)} ${r[1].toFixed(0)}"/>`; }).join('');
  }

  // ---------- Cámara ----------
  const camL = new THREE.Vector3(); let camInit = false;
  function camera(dt) {
    let p, l, k = 3;
    if (ctx.state === 'menu' || ctx.state === 'load') { const o = cfg.orbit || { c: [0, 1, 0], r: 9, y: 3.5 }, a = performance.now() / 8000; p = new THREE.Vector3(o.c[0] + Math.sin(a) * o.r, o.y, o.c[2] + Math.cos(a) * o.r); l = new THREE.Vector3(...o.c); k = 2; }
    else if (ctx.state === 'end' && ctx.t > 0.6) { const W = P[Math.max(0, ctx.win)].av; if (W) { const s = W.scene.position, f = new THREE.Vector3(0, 0, 1).applyQuaternion(W.scene.quaternion); p = s.clone().addScaledVector(f, 3.2).add(new THREE.Vector3(0.6, 1.5, 0)); l = s.clone().add(new THREE.Vector3(0, 1.0, 0)); k = 2.5; } }
    if (!p) { const c = cfg.camera ? cfg.camera(ctx, dt) : null; if (c) { p = c[0]; l = c[1]; k = c[2] || 3; } }
    if (!p) return;
    if (!camInit) { cam.position.copy(p); camL.copy(l); camInit = true; }
    const a = 1 - Math.exp(-dt * k); cam.position.lerp(p, a); camL.lerp(l, a); cam.lookAt(camL);
  }

  // ---------- Bucle ----------
  let last = performance.now(), sN = 0;
  const tmpV = new THREE.Vector3();
  function loop(now) {
    requestAnimationFrame(loop);
    let rdt = Math.min(0.05, (now - last) / 1000); last = now; if (ctx.paused) rdt = 0;
    const dt = FX.time(rdt); ctx.dt = dt; ctx.t += dt; ctx.now = now;
    if (ctx.state === 'play' && cfg.update) cfg.update(ctx, dt);
    // avatares: animación → pose del juego → celebración → actualizar
    P.forEach((p, k) => { const a = p.av; if (!a) return;
      if (a.anim) a.anim.update(dt);
      if (ctx.state === 'end' && k === ctx.win) celebrate(a, dt, ctx.camOf(k) ? EJ[p.slot] : null, p.cel, facesCam(a.scene, cam));
      else if (cfg.pose && ctx.state !== 'load' && (ctx.state !== 'menu' || cfg.poseInMenu)) cfg.pose(ctx, k, a, dt);
      a.update(dt);
      if (a.blob) { a.scene.getWorldPosition(tmpV); a.blob.position.set(tmpV.x, (cfg.floorY ? cfg.floorY(tmpV) : 0) + 0.015, tmpV.z); a.blob.visible = a.scene.visible; } });
    if (cfg.frame) cfg.frame(ctx, dt, now / 1000);
    if (env.tick) env.tick(now / 1000);
    if ((sN++ % (Q === 0 ? 4 : 2)) === 0) stickDraw();
    camera(rdt || 0.016);
    FX.render(R, S, cam, rdt);
  }
  MVLink.open((txt, ok) => { $('cst').textContent = txt; $('cst').classList.toggle('ok', !!ok); if (MVLink.code) { $('code').textContent = MVLink.code; if (!$('qr').src) $('qr').src = MVLink.qr(5); } });
  MVLink.onChange = () => { if (ctx.state === 'menu' && MVHand.open) startMenu(); };
  setTimeout(() => { if (MVLink.code) { $('code').textContent = MVLink.code; const q = MVLink.qr(5); if (q) $('qr').src = q; } }, 400);
  requestAnimationFrame(loop);
  try { await loadAvatars(); } catch (e) { console.error(e); $('loading').textContent = 'No se pudo cargar el avatar'; return ctx; }
  if (cfg.setup) await cfg.setup(ctx);
  $('loading').style.display = 'none';
  startMenu();
  ctx.pick = (id) => { MVHand.close(); menuPick(id); };
  return ctx;
}

// Página mínima de cada juego: <script type="module">import { startGame } from '../juego.js'; startGame({...})</script>
