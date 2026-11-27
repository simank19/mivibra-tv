// MiVibra RC — vehículos procedurales: llantas con taco, rines metálicos, pintura con barniz.
// Cada vehículo guarda sus ruedas en userData.wheels ({o, front, r}) para girarlas y doblarlas.
export const LOD = { lugK: 1 };
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const M = {
  paint: (c, o = {}) => new THREE.MeshPhysicalMaterial({ color: c, metalness: o.metal ?? 0.45, roughness: o.rough ?? 0.32, clearcoat: 1, clearcoatRoughness: 0.06, ...o.extra }),
  rubber: new THREE.MeshStandardMaterial({ color: '#0c0c0d', roughness: 0.95, metalness: 0, envMapIntensity: 0.5 }),
  chrome: new THREE.MeshStandardMaterial({ color: '#e8e8ec', roughness: 0.12, metalness: 1 }),
  alu: new THREE.MeshStandardMaterial({ color: '#b9bcc2', roughness: 0.35, metalness: 1 }),
  dark: new THREE.MeshStandardMaterial({ color: '#2a2b30', roughness: 0.55, metalness: 0.3 }),
  glass: new THREE.MeshPhysicalMaterial({ color: '#0d1116', roughness: 0.04, metalness: 0.2, clearcoat: 1, transparent: true, opacity: 0.88 }),
  plastic: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0 }),
  light: (c, i = 3) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i }),
};

function sh(o) { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; }
function reg(g) { g.userData.wheels = g.children.filter((c) => c.name === 'wheel').map((o) => ({ o, front: o.position.x < 0, r: o.userData.r, spin: new THREE.Group() })); return sh(g); }

// Llanta: perfil redondeado (lathe) + tacos + rin de rayos
export function wheel(r = 0.5, w = 0.4, o = {}) {
  const g = new THREE.Group(), lug = o.lug ?? 0.08, rim = o.rim ?? M.chrome;
  const pts = []; const ri = r * (o.rimK ?? 0.62);
  const c = Math.min(w * 0.3, r * 0.3); for (let i = 0; i <= 16; i++) { const a = -Math.PI / 2 + (i / 16) * Math.PI, sa = Math.sin(a); pts.push(new THREE.Vector2(r - lug * 0.5 - c + c * Math.cos(a), Math.sign(sa) * Math.pow(Math.abs(sa), 0.45) * w / 2)); }
  pts.unshift(new THREE.Vector2(ri, -w / 2)); pts.push(new THREE.Vector2(ri, w / 2));
  const tire = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), M.rubber); tire.rotation.x = Math.PI / 2; g.add(tire);
  // tacos (bloques alternados)
  const n = Math.max(8, Math.round((o.lugs ?? Math.round(r * 40)) * LOD.lugK)), lb = new THREE.BoxGeometry(lug, w * 0.42, r * 0.16);
  const inst = new THREE.InstancedMesh(lb, M.rubber, n * 2), d = new THREE.Object3D();
  for (let i = 0; i < n; i++) for (let s = 0; s < 2; s++) {
    const a = (i + s * 0.5) / n * Math.PI * 2; d.position.set(Math.cos(a) * (r - lug * 0.35), Math.sin(a) * (r - lug * 0.35), (s ? 1 : -1) * w * 0.22);
    d.rotation.set(0, 0, a); d.rotation.x = (s ? 0.35 : -0.35); d.updateMatrix(); inst.setMatrixAt(i * 2 + s, d.matrix);
  }
  g.add(inst);
  // rin: disco + rayos + tuerca
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(ri, ri, w * 0.7, 32, 1, true), M.dark); disk.rotation.x = Math.PI / 2; g.add(disk);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(ri * 0.98, ri * 0.98, 0.02, 32), rim); face.rotation.x = Math.PI / 2; face.position.z = w * 0.3; g.add(face);
  const sp = o.spokes ?? 6;
  for (let i = 0; i < sp; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(ri * 0.9, ri * 0.16, w * 0.12), rim); b.rotation.z = i / sp * Math.PI * 2; b.position.z = w * 0.33; b.geometry.translate(ri * 0.45, 0, 0); g.add(b); }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(ri * 0.22, ri * 0.26, w * 0.2, 16), M.alu); hub.rotation.x = Math.PI / 2; hub.position.z = w * 0.38; g.add(hub);
  const holes = new THREE.Mesh(new THREE.CylinderGeometry(ri * 0.7, ri * 0.7, 0.025, 32), M.dark); holes.rotation.x = Math.PI / 2; holes.position.z = w * 0.29; g.add(holes);
  g.name = 'wheel'; g.userData.r = r; return sh(g);
}
const mirrorW = (wh, side) => { if (side < 0) wh.rotation.y = Math.PI; return wh; };

// Carrocería por perfil lateral extruido y redondeado
function body(profile, width, mat, bevel = 0.06) {
  const s = new THREE.Shape(); profile.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
  const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 12 });
  g.translate(0, 0, -(width - bevel * 2) / 2); g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}
function smooth(points, n = 40) { return new THREE.SplineCurve(points.map((p) => new THREE.Vector2(p[0], p[1]))).getPoints(n).map((v) => [v.x, v.y]); }

// 1) Coche tipo "Hot Wheels": muscle car bajo con rines grandes cromados, alerón y escapes
export function muscle(color = '#d4161c', stripe = '#f5f5f5') {
  const g = new THREE.Group(), P = M.paint(color);
  const prof = smooth([[-1.55, 0.28], [-1.6, 0.52], [-1.2, 0.62], [-0.45, 0.66], [-0.1, 0.98], [0.55, 1.0], [0.95, 0.7], [1.55, 0.6], [1.62, 0.36], [1.5, 0.22], [-1.5, 0.22]], 60);
  const b = body(prof, 1.5, P, 0.1); g.add(b);
  // ventanas (cabina más angosta y oscura)
  const win = body(smooth([[-0.05, 0.7], [0.08, 0.95], [0.52, 0.97], [0.86, 0.72]], 20).concat([[-0.05, 0.7]]), 1.32, M.glass, 0.04); win.position.y = 0.012; g.add(win);
  // franjas
  for (const z of [-0.13, 0.13]) { const st = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.02, 0.12), M.paint(stripe)); st.position.set(0, 0.66, z); st.visible = false; g.add(st); }
  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.5), M.dark); hood.position.set(-0.9, 0.67, 0); g.add(hood); // toma de aire
  const blower = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.22, 16), M.chrome); blower.position.set(-0.85, 0.82, 0); g.add(blower);
  // alerón
  const wing = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.05, 1.55, 3, 0.02), P); wing.position.set(1.45, 0.92, 0); g.add(wing);
  for (const z of [-0.5, 0.5]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.04), M.dark); p.position.set(1.42, 0.76, z); g.add(p); }
  // escapes laterales
  for (const z of [-0.78, 0.78]) { const e = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 12), M.chrome); e.rotation.z = Math.PI / 2; e.position.set(-0.1, 0.3, z); g.add(e); }
  // luces
  for (const z of [-0.5, 0.5]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.32), M.light('#fff6d8', 2)); l.position.set(-1.6, 0.47, z); g.add(l); const t = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.36), M.light('#ff1a1a', 2.5)); t.position.set(1.62, 0.5, z); g.add(t); }
  // llantas: atrás más grandes (estilo hot rod)
  [[-1.0, 0.34, 0.3], [1.0, 0.42, 0.42]].forEach(([x, r, w]) => [-1, 1].forEach((s) => { const wh = mirrorW(wheel(r, w, { lug: 0.035, lugs: 34, rimK: 0.7, spokes: 5 }), s); wh.position.set(x, r, s * 0.78); g.add(wh); }));
  return reg(g);
}

// 2) Monster truck: pickup alto, llantas gigantes, suspensión visible y jaula
export function monster(color = '#1f6fe0') {
  const g = new THREE.Group(), P = M.paint(color, { metal: 0.3 }), H = 1.35;
  const prof = smooth([[-1.75, 0.0], [-1.8, 0.42], [-1.45, 0.55], [-0.55, 0.6], [-0.3, 1.05], [0.45, 1.08], [0.6, 0.62], [1.75, 0.6], [1.8, 0.05]], 50);
  const b = body(prof, 1.9, P, 0.09); b.position.y = H; g.add(b);
  const win = body(smooth([[-0.25, 0.64], [-0.12, 0.98], [0.38, 1.0], [0.48, 0.64]], 16).concat([[-0.25, 0.64]]), 1.72, M.glass, 0.03); win.position.y = H + 0.01; g.add(win);
  // caja de la pickup (hueca)
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.08, 1.6), M.dark); bed.position.set(1.15, H + 0.58, 0); g.add(bed);
  // chasis, ejes y amortiguadores
  const fr = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.18, 0.8), M.dark); fr.position.y = H - 0.15; g.add(fr);
  for (const x of [-1.25, 1.25]) {
    const ax = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 2.5, 12), M.alu); ax.rotation.x = Math.PI / 2; ax.position.set(x, 0.85, 0); g.add(ax);
    const diff = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), M.alu); diff.position.set(x, 0.85, 0); g.add(diff);
    for (const z of [-0.55, 0.55]) for (const dx of [-0.18, 0.18]) {
      const sh1 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.75, 10), M.chrome); sh1.position.set(x + dx, 1.2, z); sh1.rotation.z = dx * 1.2; g.add(sh1);
      const helix = new THREE.Curve(); helix.getPoint = (t, v = new THREE.Vector3()) => v.set(Math.cos(t * 40) * 0.11, t * 0.55 - 0.27, Math.sin(t * 40) * 0.11);
      const sp = new THREE.Mesh(new THREE.TubeGeometry(helix, 160, 0.02, 6), M.paint('#ffcc00', { metal: 0.2 })); sp.position.set(x + dx, 1.25, z); sp.rotation.z = dx * 1.2; g.add(sp);
    }
  }
  // jaula antivuelco + luces en el techo
  const cage = new THREE.CatmullRomCurve3([[-0.3, 1.05], [-0.1, 1.35], [0.45, 1.35], [0.55, 1.05]].map(([x, y]) => new THREE.Vector3(x, H + y - 0.02, 0)));
  for (const z of [-0.75, 0.75]) { const t = new THREE.Mesh(new THREE.TubeGeometry(cage, 30, 0.04, 8), M.dark); t.position.z = z; g.add(t); }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 8), M.dark); bar.rotation.x = Math.PI / 2; bar.position.set(0.17, H + 1.33, 0); g.add(bar);
  for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 16), M.light('#fffbe0', 3)); l.rotation.z = Math.PI / 2; l.position.set(-0.05, H + 1.42, -0.5 + i * 0.33); g.add(l); }
  // llantas gigantes
  for (const x of [-1.25, 1.25]) for (const s of [-1, 1]) { const wh = mirrorW(wheel(0.85, 0.75, { lug: 0.12, lugs: 22, rimK: 0.5, spokes: 8, rim: M.alu }), s); wh.position.set(x, 0.85, s * 1.25); g.add(wh); }
  return reg(g);
}

// 3) Buggy RC: chasis abierto, alerón alto y llantas de clavos
export function buggy(color = '#ff7a00') {
  const g = new THREE.Group(), P = M.paint(color, { metal: 0.2, rough: 0.35 });
  const prof = smooth([[-1.5, 0.45], [-1.35, 0.62], [-0.4, 0.75], [0.15, 0.95], [0.85, 0.9], [1.3, 0.7], [1.35, 0.42], [-1.4, 0.4]], 50);
  const b = body(prof, 1.0, P, 0.08); g.add(b);
  const cock = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.glass); cock.scale.set(1.3, 0.7, 0.9); cock.position.set(0.15, 0.88, 0); g.add(cock);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.06, 1.15), M.dark); plate.position.y = 0.36; g.add(plate);
  const wing = new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.04, 1.6, 3, 0.02), M.paint('#111', { metal: 0.1 })); wing.position.set(1.15, 1.45, 0); wing.rotation.z = -0.18; g.add(wing);
  for (const z of [-0.35, 0.35]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.04), M.alu); p.position.set(1.1, 1.12, z); g.add(p); }
  for (const z of [-0.8, 0.8]) for (const x of [-0.95, 0.95]) { const a = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.6), M.dark); a.position.set(x, 0.45, z * 0.62); g.add(a); }
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.015, 1.2, 6), M.dark); ant.position.set(0.9, 1.3, -0.35); g.add(ant);
  for (const x of [-0.95, 0.95]) for (const s of [-1, 1]) { const wh = mirrorW(wheel(0.45, 0.42, { lug: 0.08, lugs: 18, rimK: 0.58, spokes: 6, rim: M.paint('#ffd400', { metal: 0.4 }) }), s); wh.position.set(x, 0.45, s * 0.85); g.add(wh); }
  return reg(g);
}

// 4) Moto de motocross RC con piloto
export function moto(color = '#2ac940') {
  const g = new THREE.Group(), P = M.paint(color, { metal: 0.2 }), tube = (pts, r = 0.035, m = M.alu) => g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 30, r, 8), m));
  for (const x of [-0.95, 0.95]) { const wh = wheel(0.42, 0.18, { lug: 0.07, lugs: 20, rimK: 0.8, spokes: 14, rim: M.alu }); wh.position.set(x, 0.42, 0); g.add(wh); }
  tube([[-0.95, 0.42, 0.1], [-0.72, 0.95, 0.1], [-0.6, 1.25, 0.1]], 0.04, M.chrome); tube([[-0.95, 0.42, -0.1], [-0.72, 0.95, -0.1], [-0.6, 1.25, -0.1]], 0.04, M.chrome);
  tube([[0.95, 0.42, 0.08], [0.45, 0.62, 0.08], [0.0, 0.55, 0]], 0.035); tube([[0.95, 0.42, -0.08], [0.45, 0.62, -0.08], [0.0, 0.55, 0]], 0.035);
  tube([[-0.6, 1.2, 0], [-0.2, 0.9, 0], [0.0, 0.55, 0]], 0.045, M.dark); tube([[-0.6, 1.2, 0], [0.3, 1.0, 0], [0.7, 1.0, 0]], 0.04, M.dark);
  const eng = new THREE.Mesh(new RoundedBoxGeometry(0.45, 0.38, 0.3, 3, 0.05), M.alu); eng.position.set(-0.15, 0.68, 0); g.add(eng);
  const tank = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), P); tank.scale.set(1.3, 0.75, 0.8); tank.position.set(-0.3, 1.1, 0); g.add(tank);
  const seat = new THREE.Mesh(new RoundedBoxGeometry(0.85, 0.1, 0.24, 3, 0.04), M.dark); seat.position.set(0.3, 1.08, 0); seat.rotation.z = -0.08; g.add(seat);
  const fend = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.03, 0.2), P); fend.position.set(0.9, 1.0, 0); fend.rotation.z = -0.35; g.add(fend);
  const fend2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.2), P); fend2.position.set(-1.0, 0.95, 0); fend2.rotation.z = 0.2; g.add(fend2);
  const plateN = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.25, 0.3), M.plastic('#fff')); plateN.position.set(-0.68, 1.2, 0); g.add(plateN);
  const bars = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.75, 8), M.dark); bars.rotation.x = Math.PI / 2; bars.position.set(-0.55, 1.35, 0); g.add(bars);
  const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.6, 12), M.chrome); ex.rotation.z = Math.PI / 2 - 0.25; ex.position.set(0.55, 0.85, 0.18); g.add(ex);
  // piloto
  const suit = M.plastic(color === '#2ac940' ? '#111' : '#222'), R = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.4, 6, 12), M.paint(color, { metal: 0.1, rough: 0.5 })); torso.position.set(0.05, 1.55, 0); torso.rotation.z = 0.75; R.add(torso);
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 16), M.paint('#f2f2f2', { metal: 0.2 })); helm.position.set(-0.25, 1.82, 0); R.add(helm);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.22), M.glass); visor.position.set(-0.38, 1.8, 0); R.add(visor);
  for (const z of [-0.14, 0.14]) {
    tube([[0.2, 1.42, z], [-0.05, 1.05, z * 1.6], [-0.15, 0.8, z * 1.6]], 0.07, suit);
    tube([[-0.05, 1.68, z], [-0.35, 1.5, z * 2], [-0.5, 1.36, z * 2.6]], 0.055, suit);
  }
  g.add(R);
  return reg(g);
}

// Poderes y trampas
export function powerBox() {
  const g = new THREE.Group();
  const m = new THREE.MeshPhysicalMaterial({ color: '#7fe8ff', roughness: 0.05, transmission: 0.6, thickness: 0.5, transparent: true, opacity: 0.75, emissive: '#1aa6ff', emissiveIntensity: 0.6, clearcoat: 1 });
  const b = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.9, 0.9, 4, 0.12), m); g.add(b);
  const bolt = new THREE.Shape([[0.05, 0.32], [-0.18, -0.02], [-0.02, -0.02], [-0.08, -0.32], [0.18, 0.06], [0.02, 0.06], [0.1, 0.32]].map(([x, y]) => new THREE.Vector2(x, y)));
  const bm = new THREE.Mesh(new THREE.ExtrudeGeometry(bolt, { depth: 0.12, bevelEnabled: false }), M.light('#ffe600', 2)); bm.position.z = -0.06; g.add(bm);
  const bm2 = bm.clone(); bm2.rotation.y = Math.PI / 2; g.add(bm2);
  return g;
}
export function missile() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.7, 6, 14), M.paint('#e8e8e8')); b.rotation.z = Math.PI / 2; g.add(b);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 14), M.paint('#e01010')); tip.rotation.z = Math.PI / 2; tip.position.x = 0.55; g.add(tip);
  for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.22), M.paint('#e01010')); f.rotation.x = i * Math.PI / 2; f.position.x = -0.38; g.add(f); }
  const fl = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.6, 14), new THREE.MeshBasicMaterial({ color: '#ffb02e', transparent: true, opacity: 0.9 })); fl.rotation.z = Math.PI / 2; fl.position.x = -0.75; g.add(fl);
  return sh(g);
}
export function smoke(scene, from, to, n = 26, col = '#d9d9d9') {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  for (let i = 0; i < n; i++) { const t = i / n, s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col, transparent: true, opacity: 0.55 * (1 - t), depthWrite: false })); s.position.lerpVectors(from, to, t).add(new THREE.Vector3((Math.random() - 0.5) * t, (Math.random() - 0.5) * t, (Math.random() - 0.5) * t)); s.scale.setScalar(0.3 + t * 1.4); scene.add(s); }
}
export function shield(r = 2.2) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), new THREE.MeshPhysicalMaterial({ color: '#58c7ff', transparent: true, opacity: 0.22, roughness: 0, metalness: 0, clearcoat: 1, emissive: '#2a9bff', emissiveIntensity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
}
export function oil(r = 1.2) {
  const s = new THREE.Shape(); for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2, rr = r * (0.75 + 0.25 * Math.sin(a * 3 + 1) * Math.cos(a * 2)); i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  const m = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshPhysicalMaterial({ color: '#050507', roughness: 0.02, metalness: 0.1, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.6 })); m.rotation.x = -Math.PI / 2; m.receiveShadow = true; return m;
}
export function cone(h = 0.9) {
  const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.ConeGeometry(h * 0.33, h, 24), M.plastic('#ff5a0a')); c.position.y = h / 2 + 0.04; g.add(c);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.2, h * 0.24, h * 0.14, 24), M.plastic('#f4f4f4')); band.position.y = h * 0.5; g.add(band);
  const base = new THREE.Mesh(new THREE.BoxGeometry(h * 0.8, 0.06, h * 0.8), M.plastic('#ff5a0a')); base.position.y = 0.03; g.add(base); return sh(g);
}
