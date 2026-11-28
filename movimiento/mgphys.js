// Minigolf · física de la bola contra triángulos. Es la misma que usa Open Golf (MIT, Michael Gerdes), pasada a JS:
// contactos esfera-triángulo, filtro de bordes repetidos, impulso con rebote y fricción, empuje del agua,
// atracción suave al hoyo y bola quieta tras 0,5 s lenta. Pasos fijos de 1/120 s. Todo en unidades del hoyo.
import * as THREE from 'three';

const EPS = 0.001, CELL = 1;
const V = () => new THREE.Vector3();
const FACE = 0, AB = 1, AC = 2, BC = 3, A_ = 4, B_ = 5, C_ = 6;

// punto más cercano de un triángulo (Ericson, Real-Time Collision Detection) → [punto, tipo]
const _ab = V(), _ac = V(), _ap = V(), _bp = V(), _cp = V();
function closest(p, a, b, c, out) {
  _ab.subVectors(b, a); _ac.subVectors(c, a); _ap.subVectors(p, a);
  const d1 = _ab.dot(_ap), d2 = _ac.dot(_ap); if (d1 <= 0 && d2 <= 0) { out.copy(a); return A_; }
  _bp.subVectors(p, b); const d3 = _ab.dot(_bp), d4 = _ac.dot(_bp); if (d3 >= 0 && d4 <= d3) { out.copy(b); return B_; }
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { out.copy(a).addScaledVector(_ab, d1 / (d1 - d3)); return AB; }
  _cp.subVectors(p, c); const d5 = _ab.dot(_cp), d6 = _ac.dot(_cp); if (d6 >= 0 && d5 <= d6) { out.copy(c); return C_; }
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { out.copy(a).addScaledVector(_ac, d2 / (d2 - d6)); return AC; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); out.copy(b).addScaledVector(_cp.subVectors(c, b), w); return BC; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den; out.copy(a).addScaledVector(_ab, v).addScaledVector(_ac, w); return FACE;
}
const onSeg = (p, a, b) => { const ab = V().subVectors(b, a), l = ab.length(); if (l < EPS) return p.distanceTo(a) < EPS; const t = V().subVectors(p, a).dot(ab) / (l * l); if (t < -EPS || t > 1 + EPS) return false; return V().copy(a).addScaledVector(ab, t).distanceTo(p) < EPS; };
const sameLine = (a, b, e0, e1) => onSeg(e0, a, b) && onSeg(e1, a, b);

function triOf(a, b, c, part, src) {
  const n = V().subVectors(b, a).cross(V().subVectors(c, a)).normalize();
  const d = part.def || {};
  return { a, b, c, n, rest: d.restitution ?? 0.4, fric: d.friction ?? 0.3, vs: d.vel_scale ?? 1, water: !!src.water, wdir: src.wdir, oob: !!src.oob, src,
    min: V().copy(a).min(b).min(c), max: V().copy(a).max(b).max(c) };
}

export class Phys {
  /** H = resultado de loadHole (con root sin escalar o escalado: se usa la matriz relativa al root). */
  constructor(H, ballR = 0.12) {
    this.H = H; this.r = ballR; this.grid = new Map(); this.dyn = []; this.t = 0;
    const root = H.root; root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    this.toLocal = (o) => new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const isMov = (o) => { for (let p = o; p && p !== root; p = p.parent) if (p.userData.mv) return true; return false; };
    for (const s of H.solids) {
      const M = this.toLocal(s.obj), mov = isMov(s.obj);
      const src = { water: s.water, wdir: null, oob: s.oob, obj: s.obj };
      if (mov) { this.dyn.push({ s, src, M0: M.clone(), M1: M.clone(), tris: [] }); continue; }
      for (const part of s.parts) {
        if (part.water && part.wdir) src.wdir = V().fromArray(part.wdir).transformDirection(M);
        const T = part.tris; for (let i = 0; i < T.length; i += 3) this.add(triOf(T[i].clone().applyMatrix4(M), T[i + 1].clone().applyMatrix4(M), T[i + 2].clone().applyMatrix4(M), part, Object.assign({}, src, part.water ? { water: true } : {})));
      }
    }
    // copa del hoyo (sólo se usa cuando la bola está encima del hoyo)
    this.hp = V().fromArray(H.hole.p); this.hs = H.hole.s[0]; this.cup = [];
    const cm = new THREE.Matrix4().compose(this.hp, new THREE.Quaternion(), V().fromArray(H.hole.s));
    for (const part of H.cup.phys) { const T = part.tris; for (let i = 0; i < T.length; i += 3) this.cup.push(triOf(T[i].clone().applyMatrix4(cm), T[i + 1].clone().applyMatrix4(cm), T[i + 2].clone().applyMatrix4(cm), part, {})); }
    this.updateDyn(0);
  }
  key(x, y, z) { return x + ',' + y + ',' + z; }
  add(t) {
    const x0 = Math.floor(t.min.x / CELL), x1 = Math.floor(t.max.x / CELL), y0 = Math.floor(t.min.y / CELL), y1 = Math.floor(t.max.y / CELL), z0 = Math.floor(t.min.z / CELL), z1 = Math.floor(t.max.z / CELL);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) { const k = this.key(x, y, z); let c = this.grid.get(k); if (!c) this.grid.set(k, (c = [])); c.push(t); }
  }
  /** Mueve las plataformas al tiempo t (las mallas ya se animaron con animateMovers). */
  updateDyn(dt) {
    for (const d of this.dyn) {
      d.M0.copy(d.M1); d.M1 = this.toLocal(d.s.obj); d.tris = []; d.dt = dt;
      d.inv1 = d.M1.clone().invert();
      for (const part of d.s.parts) { const T = part.tris; for (let i = 0; i < T.length; i += 3) d.tris.push(triOf(T[i].clone().applyMatrix4(d.M1), T[i + 1].clone().applyMatrix4(d.M1), T[i + 2].clone().applyMatrix4(d.M1), part, d.src)); }
    }
  }
  // velocidad de un punto de una plataforma que se mueve
  velAt(d, p) { if (!d || !d.dt) return V(); const prev = p.clone().applyMatrix4(d.inv1).applyMatrix4(d.M0); return p.clone().sub(prev).divideScalar(d.dt); }

  contacts(bp, br, onlyStatic) {
    const out = [], cp = V();
    const test = (t, d) => {
      if (bp.x + br < t.min.x || bp.x - br > t.max.x || bp.y + br < t.min.y || bp.y - br > t.max.y || bp.z + br < t.min.z || bp.z - br > t.max.z) return;
      const type = closest(bp, t.a, t.b, t.c, cp), dist = bp.distanceTo(cp); if (dist >= br) return;
      const n = type === FACE ? t.n.clone() : V().subVectors(bp, cp).normalize();
      out.push({ t, type, n, p: cp.clone(), dist, pen: br - dist, vel: d ? this.velAt(d, cp) : V(), rest: t.rest, fric: t.fric, vs: t.vs, water: t.water, oob: t.oob, wdir: t.wdir });
    };
    if (bp.distanceTo(this.hp) <= this.hs) { for (const t of this.cup) { const c0 = out.length; test(t); if (out.length > c0) { const c = out[out.length - 1]; if (c.type >= AB && c.type <= BC) { c.rest = 0.4; c.fric = 0; c.vs = 1; } else if (c.type === FACE) { c.rest = 0.5; c.fric = 0.5; c.vs = 1; } } } return out; }
    const seen = new Set();
    const x0 = Math.floor((bp.x - br) / CELL), x1 = Math.floor((bp.x + br) / CELL), y0 = Math.floor((bp.y - br) / CELL), y1 = Math.floor((bp.y + br) / CELL), z0 = Math.floor((bp.z - br) / CELL), z1 = Math.floor((bp.z + br) / CELL);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) { const c = this.grid.get(this.key(x, y, z)); if (c) for (const t of c) if (!seen.has(t)) { seen.add(t); test(t); } }
    // en la vista previa las plataformas cuentan quietas (como están ahora)
    for (const d of this.dyn) for (const t of d.tris) test(t, onlyStatic ? null : d);
    return out;
  }

  /** Un paso de física. B = { p, v, moving, slow, inHole, oob, water }. Devuelve los contactos usados. */
  step(B, dt, opt = {}) {
    const br = this.r; let bp = B.p.clone(), bv = B.v.clone(); const bp0 = bp.clone();
    const dh = this.hp.distanceTo(bp), dirH = V().subVectors(this.hp, bp).normalize();
    const cs = this.contacts(bp, br, opt.preview).sort((a, b) => a.dist - b.dist);
    if (dh < 0.5 && cs.length) bv.addScaledVector(dirH, 0.05);
    // filtro de contactos (como Open Golf): todas las caras; bordes y puntas que ya cubre otra cara se ignoran
    const proc = [];
    for (const c of cs) if (c.type === FACE) proc.push(c.t.a, c.t.b, c.t.c);
    for (const c of cs) { if (c.type < AB || c.type > BC) continue; const [e0, e1] = c.type === AB ? [c.t.a, c.t.b] : c.type === AC ? [c.t.a, c.t.c] : [c.t.b, c.t.c];
      for (let j = 0; j + 2 < proc.length; j += 3) { const a = proc[j], b = proc[j + 1], cc = proc[j + 2]; if (sameLine(a, b, e0, e1) || sameLine(a, cc, e0, e1) || sameLine(b, cc, e0, e1)) { c.ign = true; break; } }
      proc.push(c.t.a, c.t.b, c.t.c); }
    for (const c of cs) { if (c.type < A_) continue; const p = c.type === A_ ? c.t.a : c.type === B_ ? c.t.b : c.t.c;
      for (let j = 0; j + 2 < proc.length; j++) if (onSeg(p, proc[j], proc[j + 1]) || onSeg(p, proc[j], proc[j + 2]) || onSeg(p, proc[j + 1], proc[j + 2])) { c.ign = true; break; }
      proc.push(c.t.a, c.t.b, c.t.c); }
    let hit = 0;
    for (const c of cs) {
      if (c.ign || c.water) continue;
      const vr = V().subVectors(bv, c.vel), sp = vr.length(); if (sp < 1e-9) { c.ign = true; continue; }
      const cull = c.n.dot(vr.clone().divideScalar(sp)); if (cull > EPS) { c.ign = true; continue; }
      const imp = -(1 + c.rest) * vr.dot(c.n);
      bv.addScaledVector(c.n, imp).multiplyScalar(c.vs);
      const t = V().copy(bv).addScaledVector(c.n, -bv.dot(c.n));
      if (t.length() > EPS) { t.normalize(); let jt = -vr.dot(t); if (Math.abs(jt) > EPS) { jt = Math.max(-imp * c.fric, Math.min(imp * c.fric, jt)); bv.addScaledVector(t, jt); } }
      if (imp > 1 && cull < -0.15) hit = Math.max(hit, imp);
    }
    bv.y -= 9.8 * dt; bp.addScaledVector(bv, dt);
    for (const c of cs) if (!c.ign && !c.water) bp.addScaledVector(c.n, Math.max(c.pen, 0) * 0.5);
    B.water = false;
    for (const c of cs) if (!c.ign && c.water) { const wd = c.wdir || V(); bv.add(V().copy(wd).multiplyScalar(4).sub(bv).multiplyScalar(2.5 * dt)); B.water = true; }
    if (bv.length() < 0.1) B.slow = (B.slow || 0) + dt; else B.slow = 0;
    if (!B.moving && bv.length() > 0.1) B.moving = true;
    if (B.moving) { B.p.copy(bp); B.v.copy(bv); if (B.slow > 0.5) { B.moving = false; B.v.set(0, 0, 0); } }
    if (V().copy(this.hp).add(V(0, -0.65, 0)).distanceTo(bp) < 0.5) B.inHole = true;
    if (cs.some((c) => !c.ign && c.oob) || bp.y < this.hp.y - 10) B.oob = true;
    B.hit = hit; B.rolling = cs.length > 0; B.d = bp0.distanceTo(bp);
    return cs;
  }
}

/** Velocidad de salida según la fuerza (0–1), con los mismos tramos que Open Golf. */
export function speedOf(p) {
  if (p < 0.4) return 2 + 6 * (p / 0.4);
  if (p < 0.65) return 8 + 8 * ((p - 0.4) / 0.25);
  if (p < 0.9) return 16 + 4 * ((p - 0.65) / 0.25);
  return 20;
}
