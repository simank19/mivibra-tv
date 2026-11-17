// MiVibra Movimiento — animaciones hechas a mano (CC0, Quaternius) pasadas al esqueleto de nuestros avatares.
// animaciones.json trae, por animación, el giro de cada hueso cuadro a cuadro (30 por segundo) y la altura de la cadera.
// Uso: const A = await loadAnims(); const p = new Animator(av, A); p.play('Run'); cada cuadro: p.update(dt) y luego av.update().
import * as THREE from 'three';

let cache = null;
export function loadAnims() {
  if (!cache) cache = fetch(new URL('./animaciones.json', import.meta.url)).then((r) => r.json());
  return cache;
}
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
function sample(clip, bone, t, out) {
  const tr = clip.b[bone]; if (!tr) return false;
  const f = Math.min(clip.n - 1, Math.max(0, t * clip.fps)), i = Math.floor(f), j = Math.min(clip.n - 1, i + 1), k = f - i;
  qa.fromArray(tr, i * 4); qb.fromArray(tr, j * 4); out.copy(qa).slerp(qb, k); return true;
}
function sampleY(clip, t) { const f = Math.min(clip.n - 1, Math.max(0, t * clip.fps)), i = Math.floor(f), j = Math.min(clip.n - 1, i + 1); return clip.hy[i] + (clip.hy[j] - clip.hy[i]) * (f - i); }

export class Animator {
  constructor(av, data) {
    this.av = av; this.data = data; this.cur = null; this.prev = null; this.fade = 0; this.fadeDur = 0.25;
    this.hy0 = av.humanoid.getNormalizedBoneNode('hips').position.y; this.q = new THREE.Quaternion(); this.q2 = new THREE.Quaternion();
  }
  // opts: { loop, speed, fade, time (fija el tiempo, p. ej. para sincronizar el salto con la valla) }
  play(name, opts = {}) {
    const clip = this.data[name]; if (!clip) return;
    if (this.cur && this.cur.name === name && !this.stopped) { Object.assign(this.cur, { loop: opts.loop !== false, speed: opts.speed ?? this.cur.speed }); return; }
    // si venía de una pose hecha a mano (sin animación), se mezcla desde esa pose
    if (!this.cur || this.stopped) { const N = this.av.humanoid.getNormalizedBoneNode, snap = {}; for (const b in clip.b) { const n = N(b); if (n) snap[b] = n.quaternion.clone(); } this.prev = { snap, hy: N('hips').position.y / this.hy0 - 1 }; }
    else this.prev = this.cur;
    this.stopped = false; this.fade = 0; this.fadeDur = opts.fade ?? 0.25;
    this.cur = { name, clip, t: opts.start || 0, loop: opts.loop !== false, speed: opts.speed ?? 1 };
  }
  stop() { this.stopped = true; }
  setSpeed(s) { if (this.cur) this.cur.speed = s; }
  setTime(t) { if (this.cur) this.cur.t = t; }
  get name() { return this.cur ? this.cur.name : null; }
  get done() { return this.cur && !this.cur.loop && this.cur.t >= this.cur.clip.dur; }
  step(s, dt) { s.t += dt * s.speed; if (s.loop) s.t %= s.clip.dur; else s.t = Math.min(s.t, s.clip.dur); }
  update(dt) {
    if (!this.cur || this.stopped) return;
    this.step(this.cur, dt); if (this.prev && !this.prev.snap) this.step(this.prev, dt);
    this.fade = Math.min(1, this.fade + dt / Math.max(0.01, this.fadeDur)); const w = this.prev ? this.fade * this.fade * (3 - 2 * this.fade) : 1;
    const N = this.av.humanoid.getNormalizedBoneNode;
    for (const bone in this.cur.clip.b) {
      if (bone === 'leftFoot' || bone === 'rightFoot') continue;   // los pies del original vienen de un control aparte y quedan torcidos
      const n = N(bone); if (!n) continue;
      sample(this.cur.clip, bone, this.cur.t, this.q);
      if (this.prev && w < 1) { if (this.prev.snap) { if (this.prev.snap[bone]) this.q.copy(this.q2.copy(this.prev.snap[bone]).slerp(this.q, w)); } else if (sample(this.prev.clip, bone, this.prev.t, this.q2)) this.q.copy(this.q2.slerp(this.q, w)); }
      n.quaternion.copy(this.q);
    }
    let y = sampleY(this.cur.clip, this.cur.t) * (this.cur.name === 'Jump' ? 0.45 : 1); if (this.prev && w < 1) y = (this.prev.snap ? this.prev.hy : sampleY(this.prev.clip, this.prev.t)) * (1 - w) + y * w;
    N('hips').position.y = this.hy0 * (1 + y);
    if (w >= 1) this.prev = null;
  }
}
