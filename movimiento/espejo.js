// MiVibra Movimiento — "Espejo": tu avatar hace lo que tú haces (levantas la mano, la levanta; te mueves, se mueve)
// y baila o celebra contigo. Es liviano a propósito para el TV:
//  · Solo se calcula cuando llega un dato del celular (~25 veces por segundo), no en cada cuadro.
//  · Por cuadro solo se mezclan unos 15 giros de hueso.
//  · El juego decide cuánto manda la cámara (brazos, tronco, piernas), así no pelea con las animaciones.
import * as THREE from 'three';

// Índices del mensaje del celular:
// 0 nariz · 1-2 hombros (izq, der) · 3-4 codos · 5-6 muñecas · 7-8 caderas · 9-10 rodillas · 11-12 tobillos · 13-14 orejas
// 15-16 dedos índice · 17-18 pulgares · 19-20 puntas de los pies   (los celulares viejos mandan solo los 15 primeros)
const NPTS = 21;
const SWAP = [0, 2, 1, 4, 3, 6, 5, 8, 7, 10, 9, 12, 11, 14, 13, 16, 15, 18, 17, 20, 19];

// Filtro "One Euro": quieto no tiembla, rápido no se atrasa
class OneEuro {
  constructor(minCut = 1.4, beta = 0.9, dCut = 1.0) { this.minCut = minCut; this.beta = beta; this.dCut = dCut; this.x = null; this.dx = 0; this.t = 0; }
  static a(cut, dt) { const r = 2 * Math.PI * cut * dt; return r / (r + 1); }
  f(x, t) {
    if (this.x === null) { this.x = x; this.t = t; return x; }
    const dt = Math.max(1e-3, (t - this.t) / 1000); this.t = t;
    const dx = (x - this.x) / dt; this.dx += OneEuro.a(this.dCut, dt) * (dx - this.dx);
    const cut = this.minCut + this.beta * Math.abs(this.dx); this.x += OneEuro.a(cut, dt) * (x - this.x); return this.x;
  }
}
const V = () => new THREE.Vector3();
const REST = {
  leftUpperArm: new THREE.Vector3(1, 0, 0), leftLowerArm: new THREE.Vector3(1, 0, 0), leftHand: new THREE.Vector3(1, 0, 0),
  rightUpperArm: new THREE.Vector3(-1, 0, 0), rightLowerArm: new THREE.Vector3(-1, 0, 0), rightHand: new THREE.Vector3(-1, 0, 0),
  leftUpperLeg: new THREE.Vector3(0, -1, 0), leftLowerLeg: new THREE.Vector3(0, -1, 0), rightUpperLeg: new THREE.Vector3(0, -1, 0), rightLowerLeg: new THREE.Vector3(0, -1, 0),
};
const GROUP = {
  // upperChest, cuello y clavículas quedan rectos: si no, la animación de base los deja torcidos y los brazos no coinciden
  spine: ['spine', 'chest', 'upperChest', 'neck'], head: ['head'],
  arms: ['leftShoulder', 'rightShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand'],
  legs: ['leftUpperLeg', 'leftLowerLeg', 'rightUpperLeg', 'rightLowerLeg'],
  armL: ['leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand'], armR: ['rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand'],
};
const ALL = [].concat(GROUP.spine, GROUP.head, GROUP.arms, GROUP.legs);   // armL/armR son partes de arms
const qI = new THREE.Quaternion();

// Resuelve los giros de los huesos a partir de puntos 3D (X izquierda del avatar, Y arriba, Z adelante)
function solve(P, vis, out) {
  const mid = (a, b) => V().addVectors(P[a], P[b]).multiplyScalar(0.5);
  // marco de la cadera: todo se mide respecto a la cadera, así no importa cómo esté puesto el celular
  const hx = V().subVectors(P[7], P[8]).normalize(), up0 = V().subVectors(mid(1, 2), mid(7, 8)).normalize();
  const hz = V().crossVectors(hx, up0).normalize(), hy = V().crossVectors(hz, hx).normalize();
  const Hq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(hx, hy, hz)), Hi = Hq.clone().invert();
  const loc = (v) => v.clone().applyQuaternion(Hi);
  const sx = loc(V().subVectors(P[1], P[2])).normalize(), sup = loc(V().subVectors(mid(1, 2), mid(7, 8))).normalize();
  const sz = V().crossVectors(sx, sup).normalize(), sy = V().crossVectors(sz, sx).normalize();
  const C = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(sx, sy, sz));
  const half = new THREE.Quaternion().slerp(C, 0.5); out.spine.copy(half); out.chest.copy(half);
  // inclinación del cuerpo entero (agacharse hacia un lado) va en la columna también
  const tilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up0.clone().setZ(up0.z * 0.5).normalize());
  out.spine.premultiply(new THREE.Quaternion().slerp(tilt, 0.6));
  const ok = (i) => vis[i] > 0.35;
  const limb = (a, b, c, d, up, low, hand, parentW) => {
    if (!ok(a) || !ok(b)) return;
    const d1 = loc(V().subVectors(P[b], P[a])).normalize().applyQuaternion(parentW.clone().invert());
    const q1 = new THREE.Quaternion().setFromUnitVectors(REST[up], d1); out[up].copy(q1);
    if (!ok(c)) return;
    const w1 = parentW.clone().multiply(q1);
    const d2 = loc(V().subVectors(P[c], P[b])).normalize().applyQuaternion(w1.clone().invert());
    const q2 = new THREE.Quaternion().setFromUnitVectors(REST[low], d2); out[low].copy(q2);
    // mano: hacia dónde apunta el dedo índice (puntos nuevos)
    if (hand && d !== undefined && P[d] && ok(d)) {
      const w2 = w1.clone().multiply(q2);
      const d3 = loc(V().subVectors(P[d], P[c])).normalize().applyQuaternion(w2.invert());
      out[hand].setFromUnitVectors(REST[hand], d3).slerp(qI, 0.35);
    }
  };
  limb(1, 3, 5, 15, 'leftUpperArm', 'leftLowerArm', 'leftHand', C); limb(2, 4, 6, 16, 'rightUpperArm', 'rightLowerArm', 'rightHand', C);
  limb(7, 9, 11, undefined, 'leftUpperLeg', 'leftLowerLeg', null, qI); limb(8, 10, 12, undefined, 'rightUpperLeg', 'rightLowerLeg', null, qI);
  // cabeza: hacia dónde mira la nariz respecto a las orejas
  if (vis[0] > 0.5 && vis[13] > 0.3 && vis[14] > 0.3) {
    const fw = loc(V().subVectors(P[0], mid(13, 14))).normalize().applyQuaternion(C.clone().invert());
    const yaw = Math.atan2(fw.x, fw.z) * 0.8, pitch = Math.asin(Math.max(-1, Math.min(1, -fw.y))) * 0.6 - 0.15;
    out.head.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  }
}

export class Espejo {
  constructor() {
    this.f = Array.from({ length: NPTS * 3 }, () => new OneEuro());
    this.P = Array.from({ length: NPTS }, V); this.vis = new Float32Array(NPTS); this.at = 0; this.ok = false; this.seq = 0;
    this.T = { 0: {}, 1: {} }; this.solved = { 0: -1, 1: -1 };
    [0, 1].forEach((m) => ALL.forEach((b) => (this.T[m][b] = new THREE.Quaternion())));
    this.cur = new Map();   // por avatar: giros suavizados
    this.cx0 = null; this.cx = 0; this.hip0 = null; this.liftT = 0; this.hands = { l: false, r: false }; this.handsUp = 0;
  }
  // d = mensaje del celular {t:'p', ts, l:[[x,y,vis]...], w:[[x,y,z]...]}
  feed(d) {
    if (!d || !d.l) { this.ok = false; return; }
    const t = d.ts || performance.now(), l = d.l, w = d.w, n = Math.min(NPTS, l.length);
    for (let i = 0; i < n; i++) {
      this.vis[i] = l[i] ? l[i][2] : 0; if (!w || !w[i]) continue;
      // MediaPipe: x hacia la izquierda de la persona (imagen sin espejo), y abajo, z hacia la cámara negativo
      this.P[i].set(this.f[i * 3].f(w[i][0], t), this.f[i * 3 + 1].f(-w[i][1], t), this.f[i * 3 + 2].f(-w[i][2], t));
    }
    for (let i = n; i < NPTS; i++) this.vis[i] = 0;
    // posición en la imagen: moverse a los lados y saltar/agacharse
    if (l[7] && l[8] && l[1] && l[2] && l[7][2] > 0.4 && l[8][2] > 0.4) {
      const hy = (l[7][1] + l[8][1]) / 2, sy = (l[1][1] + l[2][1]) / 2, torso = Math.max(0.05, hy - sy);
      const cx = 0.5 - (l[7][0] + l[8][0]) / 2;   // tu derecha = positivo (como te ves en un espejo)
      if (this.cx0 === null) this.cx0 = cx;
      this.cx = (cx - this.cx0) / torso * 0.55;   // metros aprox. (el torso mide ~0,55 m)
      if (this.hip0 === null) this.hip0 = hy;
      const up = (this.hip0 - hy) / torso; if (Math.abs(up) < 0.08) this.hip0 += (hy - this.hip0) * 0.02;
      this.liftT = up;
      // manos arriba: la muñeca por encima de la nariz
      const nose = l[0] && l[0][2] > 0.4 ? l[0][1] : sy - torso * 0.5;
      this.hands = { l: !!(l[5] && l[5][2] > 0.4 && l[5][1] < nose), r: !!(l[6] && l[6][2] > 0.4 && l[6][1] < nose) };
    }
    this.at = performance.now(); this.seq++;
    this.ok = !!w && this.vis[1] > 0.5 && this.vis[2] > 0.5 && this.vis[7] > 0.4 && this.vis[8] > 0.4;
  }
  fresh() { return this.ok && performance.now() - this.at < 700; }
  recenter() { this.cx0 = null; this.hip0 = null; }
  target(mirror) {
    const m = mirror ? 1 : 0;
    if (this.solved[m] !== this.seq) {
      this.solved[m] = this.seq;
      if (!mirror) solve(this.P, this.vis, this.T[0]);
      else { const P = SWAP.map((j) => this.P[j].clone().setX(-this.P[j].x)), vis = SWAP.map((j) => this.vis[j]); solve(P, vis, this.T[1]); }
    }
    return this.T[m];
  }
  // Aplica tu pose al avatar DESPUÉS de su animación.
  // w: cuánto manda la cámara por grupo, ej. { arms: 1, spine: 0.6, head: 1, legs: 0 }
  // mirror: true si el avatar te mira de frente (como un espejo); false si lo ves de espaldas.
  apply(av, dt, w = {}, mirror = false) {
    if (!av) return false;
    const fresh = this.fresh();
    let st = this.cur.get(av); if (!st) { st = { k: 0, q: {} }; ALL.forEach((b) => (st.q[b] = new THREE.Quaternion())); this.cur.set(av, st); }
    // entra y sale suave: si dejas de verte, el avatar vuelve a su animación sin saltos
    st.k += ((fresh ? 1 : 0) - st.k) * (1 - Math.exp(-dt * 6));
    if (st.k < 0.01) return false;
    const T = fresh ? this.target(mirror) : null, a = 1 - Math.exp(-dt * 14), N = av.humanoid.getNormalizedBoneNode;
    for (const g in GROUP) {
      const k = (w[g] || 0) * st.k; if (k <= 0.001) continue;
      for (const b of GROUP[g]) { const n = N(b); if (!n) continue; if (T) st.q[b].slerp(T[b], a); n.quaternion.slerp(st.q[b], k); }
    }
    return true;
  }
  // desplazamiento lateral (m) y salto/agachada (en torsos) suavizados, para mover el cuerpo entero
  get side() { return this.fresh() ? this.cx : 0; }
  get lift() { return this.fresh() ? this.liftT : 0; }
}

// ---------- Bailes y celebraciones hechos con poses (sin archivos extra) ----------
// Cada paso dice hacia dónde apuntan brazo y antebrazo (X = izquierda del avatar, Y arriba, Z adelante)
const dv = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const STEPS = {
  // brazos arriba con saltitos
  festejo: (u) => { const s = Math.sin(u * Math.PI * 2); return { L: [dv(0.45, 0.9, 0.1), dv(0.2, 1, 0)], R: [dv(-0.45, 0.9, 0.1), dv(-0.2, 1, 0)], bob: Math.abs(s) * 0.06, sway: 0, twist: 0, knee: Math.abs(s) * 0.5 }; },
  // ola de un lado a otro
  ola: (u) => { const s = Math.sin(u * Math.PI * 2); return { L: [dv(0.9, 0.35 + s * 0.4, 0.1), dv(0.6, 0.8 + s * 0.3, 0)], R: [dv(-0.9, 0.35 - s * 0.4, 0.1), dv(-0.6, 0.8 - s * 0.3, 0)], bob: 0.02, sway: s * 0.12, twist: 0, knee: 0.15 + Math.abs(s) * 0.2 }; },
  // disco: un brazo arriba en diagonal y el otro abajo, cambiando
  disco: (u) => { const a = Math.floor(u * 2) % 2 === 0; return { L: a ? [dv(0.6, 0.8, 0.15), dv(0.5, 0.9, 0.1)] : [dv(0.5, -0.6, 0.4), dv(-0.2, -0.6, 0.7)], R: a ? [dv(-0.5, -0.6, 0.4), dv(0.2, -0.6, 0.7)] : [dv(-0.6, 0.8, 0.15), dv(-0.5, 0.9, 0.1)], bob: 0.03, sway: a ? 0.1 : -0.1, twist: a ? 0.2 : -0.2, knee: 0.3 }; },
  // robot
  robot: (u) => { const k = Math.floor(u * 4) % 4, up = k % 2 === 0; return { L: [dv(0.95, 0, up ? 0.3 : -0.1), up ? dv(0, 1, 0.1) : dv(0, -1, 0.3)], R: [dv(-0.95, 0, up ? -0.1 : 0.3), up ? dv(0, -1, 0.3) : dv(0, 1, 0.1)], bob: 0, sway: 0, twist: (k - 1.5) * 0.12, knee: 0.1 }; },
  // salsa: pasito con caderas y brazos doblados
  salsa: (u) => { const s = Math.sin(u * Math.PI * 2), c = Math.cos(u * Math.PI * 2); return { L: [dv(0.7, -0.5, 0.5), dv(0.1, 0.4 + s * 0.3, 0.9)], R: [dv(-0.7, -0.5, 0.5), dv(-0.1, 0.4 - s * 0.3, 0.9)], bob: Math.abs(c) * 0.03, sway: s * 0.16, twist: s * 0.25, knee: 0.25 + Math.abs(s) * 0.25 }; },
  // aplausos encima de la cabeza
  aplauso: (u) => { const o = (Math.sin(u * Math.PI * 8) + 1) * 0.5; return { L: [dv(0.55, 0.8, 0.25), dv(-0.2 - o * 0.4, 0.9, 0.2)], R: [dv(-0.55, 0.8, 0.25), dv(0.2 + o * 0.4, 0.9, 0.2)], bob: o * 0.02, sway: 0, twist: 0, knee: 0.15 }; },
};
export const DANCES = Object.keys(STEPS);
const tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler();
// Pone el paso de baile en el avatar (después de su animación). t en segundos, bpm del ritmo, k = cuánto se mezcla.
export function dance(av, t, style = 'festejo', k = 1, bpm = 116) {
  if (!av || k <= 0) return;
  const N = av.humanoid.getNormalizedBoneNode, beat = t * bpm / 60, step = (STEPS[style] || STEPS.festejo)(beat / 2 % 1);
  const set = (b, q) => { const n = N(b); if (n) n.quaternion.slerp(q, k); };
  const chest = tmpQ.clone().setFromEuler(tmpE.set(0, step.twist, -step.sway * 0.8));
  set('spine', new THREE.Quaternion().setFromEuler(new THREE.Euler(0, step.twist * 0.5, -step.sway * 0.5)));
  set('chest', new THREE.Quaternion().setFromEuler(new THREE.Euler(0, step.twist * 0.5, -step.sway * 0.4)));
  ['upperChest', 'neck', 'leftShoulder', 'rightShoulder'].forEach((b) => set(b, qI));
  set('head', new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.1 + Math.sin(beat * Math.PI) * 0.12, -step.twist * 0.6, step.sway * 0.6)));
  [['L', 'left'], ['R', 'right']].forEach(([s, p]) => {
    const [d1, d2] = step[s], up = p + 'UpperArm', low = p + 'LowerArm';
    const q1 = new THREE.Quaternion().setFromUnitVectors(REST[up], d1.clone().applyQuaternion(chest.clone().invert()));
    const w1 = chest.clone().multiply(q1), q2 = new THREE.Quaternion().setFromUnitVectors(REST[low], d2.clone().applyQuaternion(w1.invert()));
    set(up, q1); set(low, q2);
  });
  // rodillas un poco dobladas al ritmo
  const kb = step.knee || 0;
  ['left', 'right'].forEach((p, i) => { const ph = i === 0 ? step.sway : -step.sway;
    set(p + 'UpperLeg', new THREE.Quaternion().setFromEuler(new THREE.Euler(-kb * 0.55, 0, ph * 0.4)));
    set(p + 'LowerLeg', new THREE.Quaternion().setFromEuler(new THREE.Euler(kb * 1.0, 0, 0))); });
  // la cadera sube y baja con el ritmo (relativo a la animación de base, que la pone en su sitio cada cuadro)
  const h = N('hips'); if (h) h.position.y += (-kb * 0.06 + step.bob) * k;
}
const lerpN = (a, b, k) => a + (b - a) * k;

// Celebrar: si el celular te ve, el avatar copia tu celebración; si no, baila solo.
// state: objeto que guarda el baile elegido y el tiempo. mirror: si el avatar te mira de frente.
export function celebrate(av, dt, E, state, mirror = true) {
  state.t = (state.t || 0) + dt;
  if (!state.style || state.t > (state.next || 0)) { state.style = DANCES[(DANCES.indexOf(state.style) + 1 + Math.floor(Math.random() * (DANCES.length - 1))) % DANCES.length]; state.next = state.t + 4.5; }
  const live = E && E.fresh();
  state.k = (state.k || 0) + ((live ? 1 : 0) - (state.k || 0)) * (1 - Math.exp(-dt * 4));
  if (state.k < 0.98) dance(av, state.t, state.style, 1);
  if (E) E.apply(av, dt, { arms: 1, spine: 1, head: 1, legs: 0.8 }, mirror);
  if (E && live) { const h = av.humanoid.getNormalizedBoneNode('hips'); if (h) h.position.y += Math.max(-0.3, Math.min(0.5, E.lift)) * 0.35 * state.k; }
}

// ¿El avatar te mira de frente en pantalla? (entonces se mueve como un espejo)
const _f = new THREE.Vector3(), _c = new THREE.Vector3(), _p = new THREE.Vector3();
export function facesCam(obj, cam) {
  obj.getWorldPosition(_p); _c.copy(cam.position).sub(_p); _c.y = 0;
  const q = new THREE.Quaternion(); obj.getWorldQuaternion(q); _f.set(0, 0, 1).applyQuaternion(q); _f.y = 0;
  return _f.dot(_c) > 0;
}
// Foto del juego tal como se ve (hay que dibujar y leer en el mismo momento)
export function snapCanvas(R, draw, w = 520) {
  draw(); const src = R.domElement, k = Math.min(1, w / src.width), c = document.createElement('canvas');
  c.width = Math.round(src.width * k); c.height = Math.round(src.height * k); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

// Foto de la cara: una cámara aparte, de frente al avatar a la altura de la cabeza (para las fotos de celebración)
const _h = new THREE.Vector3(), _fw = new THREE.Vector3(), _q = new THREE.Quaternion();
export function portraitCam(av, aspect = 0.8, dist = 1.75) {
  const cam = new THREE.PerspectiveCamera(32, aspect, 0.05, 200);
  const head = av.humanoid.getRawBoneNode('head') || av.scene; head.getWorldPosition(_h);
  av.scene.getWorldQuaternion(_q); _fw.set(0, 0, 1).applyQuaternion(_q); _fw.y = 0; _fw.normalize();
  cam.position.copy(_h).addScaledVector(_fw, dist); cam.position.y += 0.05;
  const look = _h.clone(); look.y -= 0.32; cam.lookAt(look);   // cara y medio cuerpo (brazos arriba)
  return cam;
}
// Dibuja la escena con esa cámara en un lienzo vertical y la devuelve como imagen
export function portraitSnap(R, S, av, opts = {}) {
  if (!av) return '';
  const W = opts.w || 360, Hh = opts.h || 450, cam = portraitCam(av, W / Hh, opts.dist || 1.75);
  const old = new THREE.Vector2(); R.getSize(old); const pr = R.getPixelRatio();
  R.setPixelRatio(1); R.setSize(W, Hh, false); R.render(S, cam);
  const c = document.createElement('canvas'); c.width = W; c.height = Hh; c.getContext('2d').drawImage(R.domElement, 0, 0, W, Hh, 0, 0, W, Hh);
  R.setPixelRatio(pr); R.setSize(old.x, old.y, false);
  return c.toDataURL('image/jpeg', 0.85);
}

// Brazo que alcanza un punto (para sostener la raqueta, recibir la bola, etc.): IK de dos huesos.
// side: 'left' | 'right'. target: punto en el mundo. k: cuánto manda (0..1). El codo cae hacia abajo y afuera.
const _s = new THREE.Vector3(), _e = new THREE.Vector3(), _hd = new THREE.Vector3(), _qa = new THREE.Quaternion();
export function reachArm(av, side, target, k = 1, poleY = -1) {
  const N = av.humanoid.getNormalizedBoneNode, Rw = av.humanoid.getRawBoneNode, p = side === 'left' ? 'left' : 'right';
  const sh = Rw(p + 'UpperArm'), el = Rw(p + 'LowerArm'), ha = Rw(p + 'Hand'); if (!sh || !el || !ha) return;
  av._arm = av._arm || {};
  av.update(); av.scene.updateMatrixWorld(true);
  let L = av._arm[p]; if (!L) { sh.getWorldPosition(_s); el.getWorldPosition(_e); ha.getWorldPosition(_hd); L = av._arm[p] = { l1: _s.distanceTo(_e), l2: _e.distanceTo(_hd) }; }
  sh.getWorldPosition(_s);
  const d = target.clone().sub(_s); const dist = Math.max(0.05, Math.min(d.length(), (L.l1 + L.l2) * 0.995));
  av.scene.getWorldQuaternion(_qa); const qi = _qa.clone().invert();
  const dl = d.applyQuaternion(qi).normalize();
  const pole = new THREE.Vector3(p === 'right' ? -0.5 : 0.5, poleY, -0.25).normalize();
  const a1 = Math.acos(Math.max(-1, Math.min(1, (L.l1 * L.l1 + dist * dist - L.l2 * L.l2) / (2 * L.l1 * dist))));
  let axis = new THREE.Vector3().crossVectors(dl, pole); if (axis.lengthSq() < 1e-6) axis.set(0, 0, 1); axis.normalize();
  const upDir = dl.clone().applyAxisAngle(axis, a1);
  const lowDir = dl.clone().multiplyScalar(dist).sub(upDir.clone().multiplyScalar(L.l1)).normalize();
  const PW = new THREE.Quaternion(); ['hips', 'spine', 'chest', 'upperChest', p + 'Shoulder'].forEach((n) => { const b = N(n); if (b) PW.multiply(b.quaternion); });
  const q1 = new THREE.Quaternion().setFromUnitVectors(REST[p + 'UpperArm'], upDir.applyQuaternion(PW.clone().invert()));
  const W1 = PW.clone().multiply(q1);
  const q2 = new THREE.Quaternion().setFromUnitVectors(REST[p + 'LowerArm'], lowDir.applyQuaternion(W1.invert()));
  N(p + 'UpperArm').quaternion.slerp(q1, k); N(p + 'LowerArm').quaternion.slerp(q2, k);
  const hn = N(p + 'Hand'); if (hn) hn.quaternion.slerp(qI, k * 0.7);
}
