// Minigolf · arma un hoyo a partir de los datos de Open Golf (MIT, Michael Gerdes) y los modelos
// Nature Kit de Kenney (CC0). Texturas hechas aquí con canvas (sin archivos de terceros).
import * as THREE from 'three';

const TX = {};
function canvasTex(key, draw, size = 256) {
  if (TX[key]) return TX[key];
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (TX[key] = t);
}
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function noise(g, s, base, var_, n = 2600, r = 3) {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) { const v = var_[Math.floor(rnd() * var_.length)]; g.fillStyle = v; g.globalAlpha = 0.25 + rnd() * 0.35; g.fillRect(rnd() * s, rnd() * s, 1 + rnd() * r, 1 + rnd() * r); }
  g.globalAlpha = 1;
}
const TEX = {
  ground: () => canvasTex('ground', (g, s) => { // fieltro de minigolf en cuadros
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? '#1f8f2a' : '#27a233'; g.fillRect(x * s / 2, y * s / 2, s / 2, s / 2); }
    for (let i = 0; i < 9000; i++) { g.fillStyle = rnd() < .5 ? 'rgba(255,255,255,.05)' : 'rgba(0,40,0,.07)'; g.fillRect(rnd() * s, rnd() * s, 1, 2); }
  }),
  wood: () => canvasTex('wood', (g, s) => {
    const w = s / 4;
    for (let i = 0; i < 4; i++) {
      const hue = 26 + rnd() * 6, l = 30 + rnd() * 8; g.fillStyle = `hsl(${hue},38%,${l}%)`; g.fillRect(i * w, 0, w, s);
      for (let k = 0; k < 40; k++) { g.strokeStyle = `hsla(${hue},40%,${l - 8 + rnd() * 14}%,.5)`; g.beginPath(); const x = i * w + rnd() * w; g.moveTo(x, 0); g.bezierCurveTo(x + rnd() * 6 - 3, s / 3, x + rnd() * 6 - 3, s * 2 / 3, x, s); g.stroke(); }
      g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(i * w, 0, 2, s); g.fillRect(i * w, (i * 97 % s), w, 2);
    }
  }),
  grass: () => canvasTex('grass', (g, s) => noise(g, s, '#4f7a1c', ['#6a9a2a', '#3b5f12', '#80ad35', '#2e4d0c'], 6000, 2)),
  dirt: () => canvasTex('dirt', (g, s) => noise(g, s, '#5a3416', ['#6d4221', '#40230b', '#7b5230'], 3000, 3)),
  stone: () => canvasTex('stone', (g, s) => {
    noise(g, s, '#8f7b69', ['#a28f7c', '#7a6655', '#b3a08c'], 2500, 3);
    g.strokeStyle = 'rgba(60,40,30,.7)'; g.lineWidth = 3;
    for (let y = 0; y < 4; y++) { g.beginPath(); g.moveTo(0, y * s / 4); g.lineTo(s, y * s / 4); g.stroke(); for (let x = 0; x < 3; x++) { const xx = ((x + (y % 2) * 0.5) * s / 3) % s; g.beginPath(); g.moveTo(xx, y * s / 4); g.lineTo(xx, (y + 1) * s / 4); g.stroke(); } }
  }),
  water: () => canvasTex('water', (g, s) => {
    const gr = g.createLinearGradient(0, 0, s, s); gr.addColorStop(0, '#1f8a93'); gr.addColorStop(1, '#2aa3ad'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(220,255,255,.35)'; g.lineWidth = 2;
    for (let i = 0; i < 40; i++) { const x = rnd() * s, y = rnd() * s; g.beginPath(); g.arc(x, y, 6 + rnd() * 14, 0.2, 2.2); g.stroke(); }
  }),
  spinner: () => canvasTex('spinner', (g, s) => { g.drawImage(TEX.ground().image, 0, 0, s, s); g.strokeStyle = '#555'; g.lineWidth = s * 0.04; g.beginPath(); g.arc(s / 2, s / 2, s * 0.42, 0, 7); g.stroke(); }),
  mover: () => canvasTex('mover', (g, s) => { g.drawImage(TEX.ground().image, 0, 0, s, s); g.fillStyle = '#555'; g.fillRect(s * 0.47, 0, s * 0.06, s); }),
};
const COLORS = { light_gray: '#b9bcc2', dark_gray: '#4a4d55', red: '#d9362b', black: '#0a0a0a', fallback: '#27a233' };
function texFor(name) {
  switch (name) {
    case 'ground': case 'fallback': return TEX.ground();
    case 'wood': case 'wood_dark': case 'dark_wood': case 'light_wood': return TEX.wood();
    case 'grass_dark': case 'grass': return TEX.grass();
    case 'soil1_dark': case 'soil1': case 'soil2': return TEX.dirt();
    case 'slab': case 'dark_stone': case 'stone': return TEX.stone();
    case 'water': return TEX.water();
    case 'ground_spinner_platform': return TEX.spinner();
    case 'ground_mover_platform': return TEX.mover();
  }
  return null;
}
const MATS = {};
export function material(name, def) {
  if (MATS[name]) return MATS[name];
  const d = def || {}; let m;
  if (d.c) m = new THREE.MeshStandardMaterial({ color: new THREE.Color(d.c[0], d.c[1], d.c[2]), roughness: .8 });
  else if (COLORS[d.tex]) m = new THREE.MeshStandardMaterial({ color: COLORS[d.tex], roughness: .55, metalness: d.tex === 'light_gray' ? .4 : 0 });
  else {
    const t = texFor(d.tex);
    m = new THREE.MeshStandardMaterial({ map: t, roughness: d.tex === 'water' ? .15 : .9, color: /dark/.test(d.tex || '') ? 0xb8b8b8 : 0xffffff });
    if (d.tex === 'water') { m.transparent = true; m.opacity = .88; }
  }
  return (MATS[name] = m);
}

// mismos ejes que Open Golf para las texturas de muros
function wallDirs(p0, p1, p2) {
  const d0 = p1.clone().sub(p0), d1 = p2.clone().sub(p0), d2 = p2.clone().sub(p1);
  const l0 = d0.length(), l1 = d1.length(), l2 = d2.length(); d0.normalize(); d1.normalize(); d2.normalize();
  const a = Math.abs(d0.dot(d1)), b = Math.abs(d0.dot(d2)), c = Math.abs(d1.dot(d2));
  if (a <= b && a <= c) return l0 <= l1 ? [d1, d0] : [d0, d1];
  if (b <= a && b <= c) return l0 <= l2 ? [d2, d0] : [d0, d2];
  return l1 <= l2 ? [d2, d1] : [d1, d2];
}

/** Geometría de una entidad "geo": un grupo por material. Devuelve también los triángulos para la física. */
export function buildGeo(e, mats) {
  const P = []; for (let i = 0; i < e.pts.length; i += 3) P.push(new THREE.Vector3(e.pts[i], e.pts[i + 1], e.pts[i + 2]));
  const by = {};
  for (const [mat, idx, uvg, uvs, wd] of e.f) {
    const b = (by[mat] ||= { pos: [], uv: [], tris: [], water: [] });
    for (let i = 1; i < idx.length - 1; i++) {
      const ks = [0, i, i + 1], p = ks.map(k => P[idx[k]]);
      let tc = ks.map(k => [uvs[2 * k] || 0, uvs[2 * k + 1] || 0]);
      if (uvg === 'ground') tc = p.map(q => [0.5 * q.x, 0.5 * q.z]);
      else if (uvg === 'wall-side' || uvg === 'wall-top') { const [L, S] = wallDirs(p[0], p[1], p[2]); tc = p.map(q => [q.dot(S), 0.5 * q.dot(L)]); }
      p.forEach((q, j) => { b.pos.push(q.x, q.y, q.z); b.uv.push(tc[j][0], tc[j][1]); });
      b.tris.push(p[0], p[1], p[2]); if (wd) b.water.push(wd);
    }
  }
  const g = new THREE.Group(), phys = [];
  for (const [mat, b] of Object.entries(by)) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    geo.computeVertexNormals();
    const def = mats[mat] || {};
    const m = new THREE.Mesh(geo, material(mat, def)); m.castShadow = m.receiveShadow = true; m.userData.mat = mat; g.add(m);
    phys.push({ mat, def, tris: b.tris, water: mat === 'water' || b.water.length > 0, wdir: b.water[0] });
  }
  return { obj: g, phys };
}

const MODELS = {};
export async function loadModel(base, name) {
  if (!MODELS[name]) MODELS[name] = fetch(base + 'm/' + name + '.json').then(r => r.json());
  return MODELS[name];
}
export function buildModel(md, mats) {
  const g = new THREE.Group(), phys = [];
  for (const [mat, arr] of Object.entries(md.g)) {
    const geo = new THREE.BufferGeometry(), pos = [], nor = [];
    for (let i = 0; i < arr.length; i += 6) { pos.push(arr[i], arr[i + 1], arr[i + 2]); nor.push(arr[i + 3], arr[i + 4], arr[i + 5]); }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    let m;
    const kd = md.kd[mat];
    if (/^leafs/.test(mat)) m = MATS[mat] ||= new THREE.MeshStandardMaterial({ color: mat === 'leafsFall' ? '#e0902f' : mat === 'leafsDark' ? '#3f9a45' : '#5cb84a', roughness: .9, flatShading: true });
    else if (mats[mat] && mats[mat].tex) m = material(mat, mats[mat]);
    else if (kd) m = MATS['kd:' + kd.join()] ||= new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(kd[0], kd[1], kd[2], THREE.SRGBColorSpace), roughness: .85, flatShading: true });
    else m = material(mat, mats[mat]);
    const mesh = new THREE.Mesh(geo, m); mesh.castShadow = mesh.receiveShadow = true; g.add(mesh);
    const tris = []; for (let i = 0; i < pos.length; i += 9) tris.push(new THREE.Vector3(pos[i], pos[i + 1], pos[i + 2]), new THREE.Vector3(pos[i + 3], pos[i + 4], pos[i + 5]), new THREE.Vector3(pos[i + 6], pos[i + 7], pos[i + 8]));
    phys.push({ mat, def: mats[mat] || { friction: .3, restitution: .4, vel_scale: 1 }, tris });
  }
  return { obj: g, phys };
}

/** Carga el hoyo n. Devuelve { root, start, hole, zones, movers, phys:[{obj, parts}] } */
export async function loadHole(base, n) {
  const L = await (await fetch(base + 'h' + n + '.json')).json();
  const root = new THREE.Group(), nodes = [], out = { root, zones: [], movers: [], solids: [], start: null, hole: null, data: L };
  await Promise.all(L.e.filter(e => e.t === 'model').map(e => loadModel(base, e.m)));
  for (const e of L.e) {
    let o;
    if (e.t === 'geo') { const b = buildGeo(e, L.mats); o = b.obj; out.solids.push({ obj: o, parts: b.phys, mv: e.mv, water: !!e.w, oob: e.pa >= 0 }); if (e.w) o.traverse((m) => { if (m.isMesh) m.material = material('water', { tex: 'water' }); }); }
    else if (e.t === 'model') {
      const b = buildModel(await loadModel(base, e.m), L.mats); o = b.obj;
      if (e.m === 'flag_red') o.userData.flag = true;
      if (!e.ip) out.solids.push({ obj: o, parts: b.phys, mv: e.mv, oob: e.pa >= 0 });
      if (e.pa >= 0) o.userData.decor = e.m;
    } else o = new THREE.Group();
    o.position.fromArray(e.p); o.scale.fromArray(e.s); o.quaternion.fromArray(e.q);
    o.userData.base = { p: o.position.clone(), q: o.quaternion.clone() }; o.userData.mv = e.mv;
    nodes.push(o);
    if (e.mv) out.movers.push(o);
    if (e.t === 'ball-start') out.start = e; else if (e.t === 'hole') out.hole = e; else if (e.t === 'camera_zone') out.zones.push({ e, o }); else if (e.t === 'begin_animation') out.begin = e;
  }
  L.e.forEach((e, i) => { (e.pa >= 0 ? nodes[e.pa] : root).add(nodes[i]); });
  // el hoyo: copa (modelo hole) en su sitio
  const hm = buildModel(await loadModel(base, 'hole'), { hole: { friction: .5, restitution: .5, vel_scale: 1 } });
  hm.obj.traverse(c => { if (c.isMesh) c.material = MATS.cup ||= new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1, side: THREE.DoubleSide }); });
  hm.obj.position.fromArray(out.hole.p); hm.obj.scale.fromArray(out.hole.s); root.add(hm.obj); out.cup = hm;
  return out;
}

/** Aplica el movimiento de las plataformas (mismo cálculo que Open Golf). */
export function animateMovers(movers, t) {
  for (const o of movers) {
    const m = o.userData.mv, b = o.userData.base, l = m.length, tt = ((m.t0 + t) % l + l) % l;
    if (m.type === 'linear') {
      const a = tt < l / 2 ? tt / (l / 2) : (l - tt) / (l / 2);
      o.position.copy(b.p).add(new THREE.Vector3().fromArray(m.p0).lerp(new THREE.Vector3().fromArray(m.p1), a));
    } else if (m.type === 'spinner') {
      o.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 2 * Math.PI * tt / l).multiply(b.q);
    } else if (m.type === 'pendulum') {
      let a = 2 * tt / l; if (a >= 1) a = 2 - a;
      o.quaternion.setFromAxisAngle(new THREE.Vector3().fromArray(m.axis).normalize(), m.theta0 * Math.cos(Math.PI * a)).multiply(b.q);
    } else if (m.type === 'ramp') {
      const t0 = m.theta0 * Math.PI / 180, t1 = m.theta1 * Math.PI / 180, tl = m.transition_length;
      const s1 = tl, s2 = l / 2 - tl, s3 = l / 2 + tl, s4 = l - tl;
      const th = tt < s1 ? t0 : tt < s2 ? t0 + (tt - s1) / (s2 - s1) * (t1 - t0) : tt < s3 ? t1 : tt < s4 ? t1 + (tt - s3) / (s4 - s3) * (t0 - t1) : t0;
      o.quaternion.setFromAxisAngle(new THREE.Vector3().fromArray(m.axis).normalize(), th).multiply(b.q);
    }
  }
}
