// MiVibra Movimiento — playa compartida (voleibol y fútbol de playa): arena, mar con olas, palmeras,
// sombrillas y público en la arena. Liviana para el TV: pocas piezas, el mar se mueve en la tarjeta gráfica.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

export function buildBeach(S, Q, opts = {}) {
  const M = (c, o = {}) => (Q === 0 ? new THREE.MeshLambertMaterial(Object.assign({ color: c }, o)) : new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.85 }, o)));
  const statics = [];
  const add = (m) => { S.add(m); statics.push(m); return m; };
  // cielo
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, map: tex(8, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2f7df6'); gr.addColorStop(0.42, '#8fc4ff'); gr.addColorStop(0.5, '#ffe2b8'); gr.addColorStop(1, '#ffd29a'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }) }));
  S.add(sky);
  S.fog = new THREE.Fog('#bfdcff', 60, 180);
  // arena con huellas
  const sandTex = tex(512, 512, (g, w, h) => { g.fillStyle = '#EED4A0'; g.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(170,130,70,.12)' : 'rgba(255,248,225,.28)'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(150,110,60,.12)'; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 6, 10, Math.random() * 3, 0, 7); g.fill(); } });
  sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping; sandTex.repeat.set(10, 10);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(160, 120), M('#ffffff', { map: sandTex })); sand.rotation.x = -Math.PI / 2; sand.position.z = -10; sand.receiveShadow = Q > 0; S.add(sand);
  // mar: el oleaje se mueve en la tarjeta gráfica (sin trabajo del procesador)
  const seaU = { uT: { value: 0 } };
  const seaMat = new THREE.MeshBasicMaterial({ color: '#1fa3c9', transparent: false });
  seaMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, seaU);
    sh.vertexShader = 'uniform float uT;\nvarying float vW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float w = sin(position.x * 0.15 + uT * 1.3) * 0.25 + sin(position.y * 0.22 - uT * 1.7) * 0.18; transformed.z += w; vW = w;');
    sh.fragmentShader = 'varying float vW;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75, 0.95, 1.0), smoothstep(0.2, 0.42, vW));');
  };
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 150, Q === 0 ? 40 : 90, Q === 0 ? 16 : 32), seaMat); sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.15, -(opts.seaZ || 70) - 75); S.add(sea);
  // espuma en la orilla
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(400, 3), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, depthWrite: false })); foam.rotation.x = -Math.PI / 2; foam.position.set(0, 0.02, -(opts.seaZ || 70)); S.add(foam);
  // palmeras
  const trunkM = M('#9a6b3e'), leafM = M('#2fa24f', { side: THREE.DoubleSide }), coco = M('#5b3a1e');
  const palmGeo = [], leafGeo = [], cocoGeo = [];
  const palm = (x, z, h = 6, lean = 0.25) => {
    const segs = 7; for (let i = 0; i < segs; i++) { const g = new THREE.CylinderGeometry(0.17 - i * 0.012, 0.2 - i * 0.012, h / segs, 7); const y = (i + 0.5) * h / segs; g.translate(x + Math.pow(y / h, 2) * lean * h * 0.3, y, z); palmGeo.push(g); }
    const tx = x + lean * h * 0.3, ty = h;
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; const g = new THREE.PlaneGeometry(0.7, 3.2, 1, 4); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const yy = p.getY(i) + 1.6; p.setZ(i, -yy * yy * 0.09); } g.translate(0, 1.6, 0); g.rotateX(-Math.PI / 2 + 0.5); g.rotateY(a); g.translate(tx, ty, z); leafGeo.push(g); }
    for (let k = 0; k < 3; k++) { const g = new THREE.SphereGeometry(0.16, 6, 5); g.translate(tx + Math.cos(k * 2) * 0.22, ty - 0.2, z + Math.sin(k * 2) * 0.22); cocoGeo.push(g); }
  };
  (opts.palms || [[-16, -6], [-19, 4], [-14, 14], [17, -8], [20, 3], [15, 15], [-24, -18], [25, -20], [-30, 8], [30, 10]]).forEach(([x, z], i) => palm(x, z, 5.5 + (i % 3), i % 2 ? 0.3 : -0.25));
  const mrg = (gs, m) => { if (!gs.length) return; const g = mergeGeometries(gs.map((x) => x.toNonIndexed ? (x.index ? x.toNonIndexed() : x) : x)); if (g) { const mm = new THREE.Mesh(g, m); mm.castShadow = Q > 0; add(mm); } };
  mrg(palmGeo, trunkM); mrg(leafGeo, leafM); mrg(cocoGeo, coco);
  // sombrillas de colores MiVibra
  const umbCols = ['#FF6A3D', '#8E5CF7', '#2F7DF6', '#FFB13D', '#34D399', '#F43F5E'];
  (opts.umbrellas || [[-12, -14], [12, -15], [-22, 12], [23, 13], [-9, 20], [10, 21]]).forEach(([x, z], i) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), M('#f4f5f6')); pole.position.set(x, 1.2, z); add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.6, 10, 1, true), M(umbCols[i % umbCols.length], { side: THREE.DoubleSide })); top.position.set(x, 2.5, z); add(top);
    const towel = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.8), M(umbCols[(i + 2) % umbCols.length])); towel.rotation.x = -Math.PI / 2; towel.position.set(x + 1.1, 0.01, z + 0.3); add(towel);
  });
  // vallas publicitarias bajas alrededor de la cancha
  const adTex = tex(1024, 96, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#8E5CF7'); gr.addColorStop(0.5, '#FF6A3D'); gr.addColorStop(1, '#FFB13D'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '900 54px Manrope,Inter,sans-serif'; g.textBaseline = 'middle'; for (let i = 0; i < 3; i++) g.fillText('MiVibra · Playa', 30 + i * 340, h / 2); });
  adTex.wrapS = THREE.RepeatWrapping;
  const adMat = new THREE.MeshBasicMaterial({ map: adTex, side: THREE.DoubleSide });
  (opts.ads || []).forEach(([x, z, w, ry]) => { const a = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.7), adMat.clone()); a.material.map = adTex.clone(); a.material.map.repeat.set(w / 10, 1); a.material.map.needsUpdate = true; a.position.set(x, 0.35, z); a.rotation.y = ry || 0; add(a); });
  // público sentado en la arena (pequeñas figuras de colores, una sola pieza)
  const crowdG = []; const bodyCols = ['#FF6A3D', '#2F7DF6', '#34D399', '#FFB13D', '#8E5CF7', '#F43F5E', '#ffffff'], skins = ['#F6D3B8', '#E9B48F', '#C98E66', '#A06A45', '#7A4E30'];
  const col = new THREE.Color();
  (opts.crowd || []).forEach(([x0, z0, x1, z1, n]) => {
    for (let i = 0; i < n; i++) {
      const x = x0 + Math.random() * (x1 - x0), z = z0 + Math.random() * (z1 - z0);
      const b = new THREE.CapsuleGeometry(0.2, 0.35, 2, 6); b.translate(x, 0.45, z); col.set(bodyCols[i % bodyCols.length]); paint(b, col); crowdG.push(b);
      const h = new THREE.SphereGeometry(0.15, 6, 5); h.translate(x, 0.95, z); col.set(skins[i % skins.length]); paint(h, col); crowdG.push(h);
    }
  });
  if (crowdG.length) { const g = mergeGeometries(crowdG.map((x) => (x.index ? x.toNonIndexed() : x))); add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }))); }
  // luz de tarde
  S.add(new THREE.HemisphereLight('#fff6e6', '#d9b98a', 1.6));
  const sun = new THREE.DirectionalLight('#fff1d8', 2.0); sun.position.set(-12, 22, 10); sun.castShadow = Q > 0;
  if (Q > 0) { sun.shadow.mapSize.set(Q === 2 ? 2048 : 1024, Q === 2 ? 2048 : 1024); Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 }); sun.shadow.bias = -0.0005; }
  S.add(sun);
  return { M, sun, update(t) { seaU.uT.value = t; foam.material.opacity = 0.55 + Math.sin(t * 1.3) * 0.2; } };
}
function paint(g, c) { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g.computeVertexNormals(); }

// Sonido de playa: olas (hechas a 44,1 kHz) + aves + público que aplaude (grabaciones reales)
export const BEACH_FX = {
  olas: [8, (c, H) => { for (let i = 0; i < 4; i++) H.nz(c, i * 2, 2.6, 'lowpass', 700, 0.5, 0.9, 0.4, 1600); H.nz(c, 0, 8, 'lowpass', 300, 0.18, 1, 0.3); }],
  pito: [0.7, (c, H) => { H.tn(c, 0, 2950, 0.55, 'sine', 0.25); H.tn(c, 0, 3050, 0.55, 'sine', 0.12); }],
  toque: [0.2, (c, H) => { H.tn(c, 0, 180, 0.12, 'sine', 0.8, 90); H.nz(c, 0, 0.06, 'bandpass', 1200, 0.5, 0.002, 1); }],
  patada: [0.3, (c, H) => { H.tn(c, 0, 120, 0.2, 'sine', 1, 60); H.nz(c, 0, 0.08, 'bandpass', 900, 0.6, 0.002, 1); }],
  arena: [0.4, (c, H) => H.nz(c, 0, 0.35, 'bandpass', 2500, 0.35, 0.01, 0.7)],
  red: [0.5, (c, H) => { H.nz(c, 0, 0.4, 'bandpass', 600, 0.5, 0.005, 1.2); H.tn(c, 0, 90, 0.3, 'sine', 0.3, 60); }],
};

// Avatares compartidos: el tuyo y los de la máquina
export function readSaved() { return new Promise((res) => { try { const r = indexedDB.open('mivibra-movimiento', 1); r.onupgradeneeded = () => r.result.createObjectStore('avatar'); r.onerror = () => res(null); r.onsuccess = () => { try { const t = r.result.transaction('avatar', 'readonly').objectStore('avatar').get('me'); t.onsuccess = () => res(t.result || null); t.onerror = () => res(null); } catch (e) { res(null); } }; } catch (e) { res(null); } }); }
export function fromApp() { if (window.parent === window) return Promise.resolve(null); return new Promise((res) => { const t = setTimeout(() => { removeEventListener('message', on); res(null); }, 20000); function on(e) { if (e.source !== window.parent || !e.data || e.data.mv !== 'avatar') return; clearTimeout(t); removeEventListener('message', on); res(e.data.vrm ? e.data : null); } addEventListener('message', on); window.parent.postMessage({ mv: 'avatar-get' }, '*'); }); }

// Lectura del cuerpo para estos juegos (los momentos de golpe, patada y salto quedan en la hora del TV): posición a los lados, brazos arriba, golpe con el brazo, patada y salto
export function bodyReader() {
  const B = { x: 0, sh0: null, armsUp: false, actAt: -1e9, kickAt: -1e9, kickSide: 0, kickPow: 0, jumpAt: -1e9, hip0: null, hist: [], dive: 0, lean: 0, ts: 0 };
  B.feed = (l, ts) => {
    const v = (i) => l[i] && l[i][2] > 0.45; if (!(v(1) && v(2))) return;
    const shX = (l[1][0] + l[2][0]) / 2, shY = (l[1][1] + l[2][1]) / 2, sw = Math.max(0.06, Math.abs(l[1][0] - l[2][0]));
    if (B.sh0 === null) B.sh0 = shX;
    B.x = (B.sh0 - shX) / sw;           // en anchos de hombro; positivo = tu derecha
    B.ts = ts;
    const nose = v(0) ? l[0][1] : shY - sw * 0.6;
    const up = (i) => v(i) && l[i][1] < nose;
    B.armsUp = up(5) && up(6); B.oneUp = up(5) || up(6);
    // inclinación (para estirarse o tirarse): hombros respecto a la cadera
    if (v(7) && v(8)) { const hx = (l[7][0] + l[8][0]) / 2; B.lean = (hx - shX) / sw; const hy = (l[7][1] + l[8][1]) / 2, torso = Math.max(0.05, hy - shY); if (B.hip0 === null) B.hip0 = hy; const upv = (B.hip0 - hy) / torso; if (upv > 0.2 && performance.now() - B.jumpAt > 600) B.jumpAt = performance.now(); if (Math.abs(upv) < 0.08) B.hip0 += (hy - B.hip0) * 0.03; }
    // golpe con los brazos (cualquier movimiento rápido de las muñecas) y patada (tobillo que sube rápido)
    const pt = { ts, w5: v(5) ? [l[5][0] / sw, l[5][1] / sw] : null, w6: v(6) ? [l[6][0] / sw, l[6][1] / sw] : null, a11: v(11) ? [l[11][0], l[11][1] / sw] : null, a12: v(12) ? [l[12][0], l[12][1] / sw] : null };
    B.hist.push(pt); B.hist = B.hist.filter((h) => ts - h.ts < 300);
    const o = B.hist[0]; if (!o || ts - o.ts < 80) return; const dt = (ts - o.ts) / 1000;
    const sp = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) / dt : 0);
    if (Math.max(sp(pt.w5, o.w5), sp(pt.w6, o.w6)) > 3.2) B.actAt = performance.now();
    const k11 = pt.a11 && o.a11 ? (o.a11[1] - pt.a11[1]) / dt : 0, k12 = pt.a12 && o.a12 ? (o.a12[1] - pt.a12[1]) / dt : 0;
    const kk = Math.max(k11, k12);
    if (kk > 2.2 && performance.now() - B.kickAt > 700) { B.kickAt = performance.now(); B.kickPow = Math.min(1, (kk - 2.2) / 4 + 0.35); const f = k11 > k12 ? pt.a11 : pt.a12, of = k11 > k12 ? o.a11 : o.a12; // dirección: hacia dónde va el pie (movimiento lateral en anchos de hombro) + cuánto cruza el pie respecto a la cadera + la inclinación
      const hx = v(7) && v(8) ? (l[7][0] + l[8][0]) / 2 : shX, foot0 = k11 > k12 ? -0.35 : 0.35, across = (hx - f[0]) / sw - foot0;
      B.kickSide = Math.max(-1.8, Math.min(1.8, ((of[0] - f[0]) / sw) * 1.4 + across * 0.9 + B.lean * 0.6)); }
  };
  B.recenter = () => { B.sh0 = null; B.hip0 = null; };
  return B;
}
