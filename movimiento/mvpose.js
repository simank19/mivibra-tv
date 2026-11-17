// MiVibra Movimiento — tu avatar copia tus movimientos (captura de movimiento con la cámara del celular).
// El celular manda los puntos del cuerpo en 3D (metros, centrados en la cadera). Aquí se suavizan
// (filtro "One Euro": quieto no tiembla, rápido no se atrasa) y se convierten en giros de huesos.
import * as THREE from 'three';

// Índices del mensaje: 0 nariz, 1-2 hombros (izq, der), 3-4 codos, 5-6 muñecas, 7-8 caderas, 9-10 rodillas, 11-12 tobillos, 13-14 orejas
class OneEuro {
  constructor(minCut = 1.6, beta = 0.6, dCut = 1.0) { this.minCut = minCut; this.beta = beta; this.dCut = dCut; this.x = null; this.dx = 0; this.t = 0; }
  static a(cut, dt) { const r = 2 * Math.PI * cut * dt; return r / (r + 1); }
  f(x, t) {
    if (this.x === null) { this.x = x; this.t = t; return x; }
    const dt = Math.max(1e-3, (t - this.t) / 1000); this.t = t;
    const dx = (x - this.x) / dt; this.dx += OneEuro.a(this.dCut, dt) * (dx - this.dx);
    const cut = this.minCut + this.beta * Math.abs(this.dx); this.x += OneEuro.a(cut, dt) * (x - this.x); return this.x;
  }
}
const V = () => new THREE.Vector3();
const REST = { leftUpperArm: new THREE.Vector3(1, 0, 0), leftLowerArm: new THREE.Vector3(1, 0, 0), rightUpperArm: new THREE.Vector3(-1, 0, 0), rightLowerArm: new THREE.Vector3(-1, 0, 0),
  leftUpperLeg: new THREE.Vector3(0, -1, 0), leftLowerLeg: new THREE.Vector3(0, -1, 0), rightUpperLeg: new THREE.Vector3(0, -1, 0), rightLowerLeg: new THREE.Vector3(0, -1, 0) };
const BONES = ['spine', 'chest', 'head', 'leftUpperArm', 'leftLowerArm', 'rightUpperArm', 'rightLowerArm', 'leftUpperLeg', 'leftLowerLeg', 'rightUpperLeg', 'rightLowerLeg'];

export class LivePose {
  // mirror: true cuando el avatar te mira de frente (como un espejo); false cuando lo ves de espaldas
  constructor(opts = {}) {
    this.mirror = !!opts.mirror;
    this.f = Array.from({ length: 15 * 3 }, () => new OneEuro());
    this.P = Array.from({ length: 15 }, V); this.vis = new Float32Array(15); this.at = 0; this.ok = false;
    this.target = {}; this.cur = {}; BONES.forEach((b) => { this.target[b] = new THREE.Quaternion(); this.cur[b] = new THREE.Quaternion(); });
    this.hipBase = null; this.lift = 0; this.liftT = 0; this.y2 = null;
  }
  // d = mensaje del celular {t:'p', ts, l:[[x,y,vis]...], w:[[x,y,z]...]}
  feed(d) {
    if (!d || !d.w || !d.l) return;
    const t = d.ts || performance.now();
    const SW = [0, 2, 1, 4, 3, 6, 5, 8, 7, 10, 9, 12, 11, 14, 13], sx = this.mirror ? -1 : 1;
    for (let i = 0; i < 15 && i < d.w.length; i++) {
      const j = this.mirror ? SW[i] : i; if (!d.w[j]) continue;
      const w = d.w[j], vis = d.l[j] ? d.l[j][2] : 0; this.vis[i] = vis;
      // MediaPipe: x a la izquierda de la persona (imagen sin espejo), y hacia abajo, z hacia la cámara negativo → avatar: X izquierda, Y arriba, Z adelante
      this.P[i].set(this.f[i * 3].f(sx * w[0], t), this.f[i * 3 + 1].f(-w[1], t), this.f[i * 3 + 2].f(-w[2], t));
    }
    // altura de la cadera en la imagen (para agacharse y saltar)
    if (d.l[7] && d.l[8] && d.l[1] && d.l[2]) {
      const hy = (d.l[7][1] + d.l[8][1]) / 2, sy = (d.l[1][1] + d.l[2][1]) / 2, torso = Math.max(0.05, hy - sy);
      if (this.hipBase === null) this.hipBase = hy;
      const up = (this.hipBase - hy) / torso; if (Math.abs(up) < 0.08) this.hipBase += (hy - this.hipBase) * 0.02;
      this.liftT = up;
    }
    this.at = performance.now(); this.ok = this.vis[1] > 0.5 && this.vis[2] > 0.5 && this.vis[7] > 0.4 && this.vis[8] > 0.4;
    if (this.ok) this.solve();
  }
  fresh() { return this.ok && performance.now() - this.at < 700; }
  solve() {
    const P = this.P, mid = (a, b) => V().addVectors(P[a], P[b]).multiplyScalar(0.5);
    // marco de la cadera: todo se mide relativo a la cadera, así no importa cómo esté puesto el celular
    const hx = V().subVectors(P[7], P[8]).normalize(), up0 = V().subVectors(mid(1, 2), mid(7, 8)).normalize();
    const hz = V().crossVectors(hx, up0).normalize(), hy = V().crossVectors(hz, hx).normalize();
    const H = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(hx, hy, hz)), Hi = H.clone().invert();
    const loc = (v) => v.clone().applyQuaternion(Hi);
    // columna: el pecho sigue la línea de los hombros
    const sx = loc(V().subVectors(P[1], P[2])).normalize(), sup = loc(V().subVectors(mid(1, 2), mid(7, 8))).normalize();
    const sz = V().crossVectors(sx, sup).normalize(), sy = V().crossVectors(sz, sx).normalize();
    const C = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(sx, sy, sz));
    const half = new THREE.Quaternion().slerp(C, 0.5); this.target.spine.copy(half); this.target.chest.copy(half);
    const chestW = C;   // giro total del pecho respecto a la cadera
    const limb = (a, b, c, up, low, parentW) => {
      if (this.vis[a] < 0.35 || this.vis[b] < 0.35) return;
      const d1 = loc(V().subVectors(P[b], P[a])).normalize().applyQuaternion(parentW.clone().invert());
      const q1 = new THREE.Quaternion().setFromUnitVectors(REST[up], d1); this.target[up].copy(q1);
      if (this.vis[c] < 0.35) return;
      const w1 = parentW.clone().multiply(q1);
      const d2 = loc(V().subVectors(P[c], P[b])).normalize().applyQuaternion(w1.invert());
      this.target[low].setFromUnitVectors(REST[low], d2);
    };
    limb(1, 3, 5, 'leftUpperArm', 'leftLowerArm', chestW); limb(2, 4, 6, 'rightUpperArm', 'rightLowerArm', chestW);
    const I = new THREE.Quaternion(); limb(7, 9, 11, 'leftUpperLeg', 'leftLowerLeg', I); limb(8, 10, 12, 'rightUpperLeg', 'rightLowerLeg', I);
    // cabeza: hacia dónde mira la nariz respecto a las orejas
    if (this.vis[0] > 0.5 && this.vis[13] > 0.3 && this.vis[14] > 0.3) {
      const fw = loc(V().subVectors(P[0], mid(13, 14))).normalize().applyQuaternion(chestW.clone().invert());
      const yaw = Math.atan2(fw.x, fw.z) * 0.8, pitch = Math.asin(Math.max(-1, Math.min(1, -fw.y))) * 0.6 - 0.15;
      this.target.head.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    }
  }
  // Aplica la pose al avatar (k = cuánto manda la cámara: 1 todo, 0 nada). dt para suavizar entre muestras.
  apply(av, dt, k = 1, opts = {}) {
    if (!av || !this.fresh()) return false;
    const N = av.humanoid.getNormalizedBoneNode, a = 1 - Math.exp(-dt * (opts.speed || 16));
    BONES.forEach((b) => {
      if (opts.skip && opts.skip.includes(b)) return;
      const n = N(b); if (!n) return;
      this.cur[b].slerp(this.target[b], a);
      if (k >= 1) n.quaternion.copy(this.cur[b]); else n.quaternion.slerp(this.cur[b], k);
    });
    this.lift += (this.liftT - this.lift) * a;
    return true;
  }
}
