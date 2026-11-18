// MiVibra Movimiento — avatares estilo caricatura.
// Se arman por piezas (cabeza/pelo, torso, piernas, pies) a partir de modelos CC0 de Quaternius,
// con colores propios, cara propia (ojos grandes, cejas y sonrisa) y un esqueleto "normalizado"
// que acepta las mismas poses que usábamos con VRM (getNormalizedBoneNode + update).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { build as buildAnimeAvatar } from './anime-avatar.js';

const KIT = new URL('./kit/', import.meta.url).href;

// ---------- Catálogo ----------
export const CATALOG = {
  m: {
    head: [['Casual', 'Rizado corto'], ['Casual2', 'Corto peinado'], ['Beach', 'Despeinado'], ['Adventurer', 'Aventurero'], ['Suit', 'Elegante'], ['Punk', 'Cresta'], ['Farmer', 'Sombrero'], ['Worker', 'Gorra y bigote']],
    body: [['Casual', 'Camiseta'], ['Casual2', 'Camiseta clásica'], ['Beach', 'Esqueleto'], ['Punk', 'Chaqueta'], ['Adventurer', 'Chaleco'], ['Farmer', 'Camisa'], ['Worker', 'Chaleco reflectivo'], ['Suit', 'Saco y corbata']],
    legs: [['Beach', 'Pantaloneta'], ['Casual', 'Bermuda'], ['Casual2', 'Jean'], ['Punk', 'Jean roto'], ['Adventurer', 'Cargo'], ['Worker', 'Pantalón de trabajo'], ['Suit', 'Pantalón de vestir']],
    feet: [['Casual2', 'Tenis'], ['Casual', 'Tenis altos'], ['Beach', 'Chanclas'], ['Adventurer', 'Botas'], ['Punk', 'Botas punk'], ['Suit', 'Zapatos']],
  },
  f: {
    head: [['Casual', 'Cola de caballo'], ['Adventurer', 'Melena'], ['Suit', 'Recogido'], ['Soldier', 'Corto'], ['SciFi', 'Liso negro'], ['Punk', 'Cresta'], ['Formal', 'Sombrero'], ['Worker', 'Gorra']],
    body: [['Casual', 'Camiseta'], ['Punk', 'Top'], ['Adventurer', 'Chaleco'], ['Formal', 'Blusa'], ['Suit', 'Saco'], ['SciFi', 'Deportivo'], ['Worker', 'Chaleco reflectivo']],
    legs: [['Casual', 'Pantalón'], ['Punk', 'Jean roto'], ['Formal', 'Falda'], ['Suit', 'Pantalón de vestir'], ['SciFi', 'Licra'], ['Adventurer', 'Cargo'], ['Worker', 'Pantalón de trabajo']],
    feet: [['Casual', 'Tenis'], ['Punk', 'Botas'], ['Formal', 'Tacones'], ['Suit', 'Zapatos'], ['SciFi', 'Botas deportivas'], ['Adventurer', 'Botas de campo'], ['Worker', 'Botas de trabajo']],
  },
};
export const FACES = { mouth: ['Sonrisa', 'Gran sonrisa', 'Sonrisa pequeña'] };
export const EXTRAS = {
  beard: ['Sin barba', 'Sombra', 'Candado', 'Barba corta', 'Barba completa'],
  makeup: ['Natural', 'Rubor', 'Pecas', 'Labios rojos'],
  extraHair: ['Ninguno', 'Moño alto', 'Trenzas', 'Dos moños'],
  glasses: ['Sin gafas', 'Gafas de sol', 'Gafas de lectura'],
  cap: ['Nada', 'Gorra MiVibra', 'Gorra lisa', 'Gorro de lana'],
  phones: ['Sin audífonos', 'Audífonos'],
  earrings: ['Sin aretes', 'Aretes'],
  print: ['Lisa', 'Logo MV', 'Número 10'],
};
export const STYLES = {   // estilos de ropa con un toque
  'Básico MiVibra': { m: { body: 'Casual', legs: 'Casual2', feet: 'Casual2' }, f: { body: 'Casual', legs: 'Casual', feet: 'Casual' }, top: '#111214', top2: '#F4F5F6', bottom: '#1F2937', bottom2: '#1F2937', shoes: '#F4F5F6', shoes2: '#8E5CF7', print: 1 },
  Deportivo: { m: { body: 'Beach', legs: 'Beach', feet: 'Casual2' }, f: { body: 'Casual', legs: 'Casual', feet: 'Casual' }, top: '#2F7DF6', top2: '#F4F5F6', bottom: '#111214', bottom2: '#F4F5F6', shoes: '#F4F5F6', shoes2: '#2F7DF6', print: 2 },
  Urbano: { m: { body: 'Punk', legs: 'Punk', feet: 'Casual' }, f: { body: 'Punk', legs: 'Punk', feet: 'Punk' }, top: '#111214', top2: '#9CA3AF', bottom: '#2F5FA8', bottom2: '#F4F5F6', shoes: '#F4F5F6', shoes2: '#111214', print: 0 },
  Elegante: { m: { body: 'Suit', legs: 'Suit', feet: 'Suit' }, f: { body: 'Suit', legs: 'Suit', feet: 'Suit' }, top: '#1F2937', top2: '#F4F5F6', bottom: '#1F2937', bottom2: '#1F2937', shoes: '#111214', shoes2: '#111214', print: 0 },
};
export const SWATCH = {
  skin: ['#f6d3b8', '#ecbc96', '#d9a074', '#c58b62', '#a8714a', '#8d5a3b', '#6e432a', '#4f2e1c'],
  hair: ['#141010', '#3a2416', '#6b3a1e', '#a0632f', '#d9a640', '#f0d590', '#b8b8bc', '#c0392b', '#2F7DF6', '#8E5CF7', '#FF6A3D', '#34D399'],
  eyes: ['#3a2416', '#6b3a1e', '#2a6db0', '#2f8f5b', '#6b6f75', '#141010'],
  cloth: ['#FF6A3D', '#FFB13D', '#F43F5E', '#8E5CF7', '#2F7DF6', '#34D399', '#14B8A6', '#F4F5F6', '#9CA3AF', '#1F2937', '#111214', '#7C2D12', '#FDE047', '#EC4899'],
};
export const DEFAULT = { v: 1, g: 'm', name: 'Tú', head: 'Casual', body: 'Casual', legs: 'Beach', feet: 'Casual2', skin: '#c58b62', hair: '#1a120c', eyes: '#3a2416', top: '#FF6A3D', top2: '#F4F5F6', bottom: '#1F2937', bottom2: '#F4F5F6', shoes: '#F4F5F6', shoes2: '#FF6A3D', hat: '#FF6A3D', face: [0, 0, 0], beard: 0, makeup: 0, extraHair: 0, glasses: 0, cap: 0, phones: 0, earrings: 0, print: 0, acc: '#1F2937' };
export const PRESETS = [
  { name: 'Laura', g: 'f', head: 'Adventurer', body: 'Casual', legs: 'Casual', feet: 'Casual', skin: '#f1c7a5', hair: '#c4863f', eyes: '#2a6db0', top: '#F43F5E', top2: '#F4F5F6', bottom: '#1F2937', bottom2: '#F43F5E', shoes: '#F4F5F6', shoes2: '#F43F5E', face: [3, 1, 0] },
  { name: 'Andrés', g: 'm', head: 'Beach', body: 'Beach', legs: 'Beach', feet: 'Casual2', skin: '#8d5a3b', hair: '#1d140e', eyes: '#3a2416', top: '#2F7DF6', top2: '#F4F5F6', bottom: '#1F2937', bottom2: '#F4F5F6', shoes: '#F4F5F6', shoes2: '#2F7DF6', face: [0, 2, 1] },
  { name: 'Valentina', g: 'f', head: 'Casual', body: 'Casual', legs: 'Casual', feet: 'Casual', skin: '#e7b48f', hair: '#6b3a1e', eyes: '#2f8f5b', top: '#8E5CF7', top2: '#F4F5F6', bottom: '#F4F5F6', bottom2: '#8E5CF7', shoes: '#F4F5F6', shoes2: '#8E5CF7', face: [3, 0, 0] },
  { name: 'Camilo', g: 'm', head: 'Casual2', body: 'Casual2', legs: 'Casual', feet: 'Casual', skin: '#c58b62', hair: '#3a2416', eyes: '#3a2416', top: '#34D399', top2: '#F4F5F6', bottom: '#1F2937', bottom2: '#34D399', shoes: '#F4F5F6', shoes2: '#34D399', face: [1, 0, 2] },
  { name: 'Sofía', g: 'f', head: 'Punk', body: 'Punk', legs: 'Punk', feet: 'Casual', skin: '#6e432a', hair: '#8E5CF7', eyes: '#3a2416', top: '#FFB13D', top2: '#1F2937', bottom: '#1F2937', bottom2: '#FFB13D', shoes: '#F4F5F6', shoes2: '#FFB13D', face: [2, 1, 1] },
  { name: 'Mateo', g: 'm', head: 'Suit', body: 'Punk', legs: 'Casual2', feet: 'Casual2', skin: '#f6d3b8', hair: '#d9a640', eyes: '#2a6db0', top: '#14B8A6', top2: '#1F2937', bottom: '#2F7DF6', bottom2: '#F4F5F6', shoes: '#F4F5F6', shoes2: '#14B8A6', face: [0, 1, 0] },
].map((p) => Object.assign({}, DEFAULT, p));

export function randomRecipe(rnd = Math.random, base = {}) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const g = base.g || (rnd() < 0.5 ? 'm' : 'f'), C = CATALOG[g];
  return Object.assign({}, DEFAULT, { g, head: pick(C.head)[0], body: pick(C.body)[0], legs: pick(C.legs)[0], feet: pick(C.feet)[0], skin: pick(SWATCH.skin), hair: pick(SWATCH.hair.slice(0, 7)), eyes: pick(SWATCH.eyes),
    top: pick(SWATCH.cloth), top2: pick(['#F4F5F6', '#1F2937']), bottom: pick(['#1F2937', '#F4F5F6', '#2F7DF6', '#111214']), bottom2: pick(SWATCH.cloth), shoes: pick(['#F4F5F6', '#111214']), shoes2: pick(SWATCH.cloth), face: [Math.floor(rnd() * 4), Math.floor(rnd() * 3), Math.floor(rnd() * 3)] }, base);
}
export function fix(r) {   // receta válida siempre
  const o = Object.assign({}, DEFAULT, r || {}); if (o.g !== 'f') o.g = 'm'; const C = CATALOG[o.g];
  ['head', 'body', 'legs', 'feet'].forEach((k) => { if (!C[k].some((x) => x[0] === o[k])) o[k] = C[k][0][0]; });
  if (!Array.isArray(o.face) || o.face.length !== 3) o.face = [0, 0, 0];
  o.name = String(o.name || 'Tú').slice(0, 24); if (!o.hat) o.hat = o.top; return o;
}
// Se guarda como bytes ("MVAV1" + JSON) para usar el mismo canal de guardado que tenía el avatar VRM.
export function encode(r) { const s = 'MVAV1' + JSON.stringify(fix(r)); return new TextEncoder().encode(s).buffer; }
export function decode(buf) {
  try { const u = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer || buf); if (u.length < 6) return null; const s = new TextDecoder().decode(u.slice(0, Math.min(u.length, 8192))); if (!s.startsWith('MVAV1')) return null; return fix(JSON.parse(s.slice(5))); } catch (e) { return null; }
}

// ---------- Carga de piezas (con caché del navegador) ----------
const loader = new GLTFLoader(); const parsed = new Map();
async function fetchBuf(url) {
  try { const c = await caches.open('mv-kit-v1'); const hit = await c.match(url); if (hit) return await hit.arrayBuffer(); const res = await fetch(url); if (res.ok) { c.put(url, res.clone()).catch(() => {}); return await res.arrayBuffer(); } } catch (e) {}
  return await (await fetch(url)).arrayBuffer();
}
function part(g, outfit, p) {
  const url = KIT + g + '_' + outfit + '_' + p + '.glb';
  if (!parsed.has(url)) parsed.set(url, fetchBuf(url).then((b) => new Promise((res, rej) => loader.parse(b, '', res, rej))));
  return parsed.get(url);
}
export function preload(recipes) { recipes.forEach((r) => { r = fix(r); ['head', 'body', 'legs', 'feet'].forEach((k) => part(r.g, r[k], k)); }); }

// ---------- Materiales compartidos por color ----------
const matCache = new Map();
function mat(hex, lite, o = {}) {
  const k = hex + (lite ? 'L' : 'S') + JSON.stringify(o);
  if (!matCache.has(k)) matCache.set(k, lite ? new THREE.MeshLambertMaterial(Object.assign({ color: hex, side: THREE.DoubleSide }, o)) : new THREE.MeshStandardMaterial(Object.assign({ color: hex, roughness: 0.48, metalness: 0, side: THREE.DoubleSide }, o)));
  return matCache.get(k);
}
const shade = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
function roleColor(part, name, r, order) {
  const n = name.toLowerCase();
  if (n.startsWith('skin_darker')) return shade(r.skin, 0.85);
  if (n.startsWith('skin')) return r.skin;
  if (n.startsWith('hair') || n === 'eyebrows' || n === 'moustache') return r.hair;
  if (n === 'earrings' || n === 'gold') return '#E8B84A';
  if (n === 'metal') return '#B9BEC6';
  if (part === 'head') return r.hat || r.top;
  if (part === 'body') return [r.top, r.top2, shade(r.top, 0.7)][Math.min(order, 2)];
  if (part === 'legs') return [r.bottom, r.bottom2, shade(r.bottom, 0.7)][Math.min(order, 2)];
  return [r.shoes, r.shoes2, shade(r.shoes, 0.6)][Math.min(order, 2)];
}

// ---------- Huesos ----------
const HB = { hips: 'Hips', spine: 'Abdomen', chest: 'Torso', upperChest: 'Chest', neck: 'Neck', head: 'Head' };
['L', 'R'].forEach((s) => { const S = s === 'L' ? 'left' : 'right';
  Object.assign(HB, { [S + 'Shoulder']: 'Shoulder' + s, [S + 'UpperArm']: 'UpperArm' + s, [S + 'LowerArm']: 'LowerArm' + s, [S + 'Hand']: 'Hand' + s, [S + 'UpperLeg']: 'UpperLeg' + s, [S + 'LowerLeg']: 'LowerLeg' + s, [S + 'Foot']: 'Foot' + s }); });
function fingerMap(bones, s) {
  const S = s === 'L' ? 'left' : 'right', out = {};
  const has1 = !!bones['Index1' + s];   // las mujeres tienen 3 falanges numeradas 1-3; los hombres 2-4
  [['Index', 'Index'], ['Middle', 'Middle'], ['Ring', 'Ring'], ['Pinky', 'Little']].forEach(([q, v]) => {
    const n = has1 ? [1, 2, 3] : [2, 3, 4];
    out[S + v + 'Proximal'] = q + n[0] + s; out[S + v + 'Intermediate'] = q + n[1] + s; out[S + v + 'Distal'] = q + n[2] + s; });
  const t = has1 ? [1, 2, 3] : [null, 2, 3];
  if (t[0]) out[S + 'ThumbMetacarpal'] = 'Thumb' + t[0] + s; out[S + 'ThumbProximal'] = 'Thumb' + t[1] + s; out[S + 'ThumbDistal'] = 'Thumb' + t[2] + s;
  return out;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion();
function aim(bone, child, dir) {
  bone.updateWorldMatrix(true, true); bone.getWorldPosition(_a); child.getWorldPosition(_b);
  _q.setFromUnitVectors(_b.sub(_a).normalize(), dir.clone().normalize());
  bone.getWorldQuaternion(_qw); _qw.premultiply(_q); bone.parent.getWorldQuaternion(_qp); bone.quaternion.copy(_qp.invert().multiply(_qw)); bone.updateWorldMatrix(false, true);
}

// ---------- Cara propia ----------
function vertsWorld(mesh) {   // vértices en el mundo (con la pose actual)
  const pos = mesh.geometry.attributes.position, out = [], v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { mesh.getVertexPosition(i, v); out.push(v.clone().applyMatrix4(mesh.matrixWorld)); }
  return out;
}
function eyeCenters(pts) {
  const L = pts.filter((p) => p.x > 0), R = pts.filter((p) => p.x <= 0);
  const c = (a) => a.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, a.length));
  // si los ojos vienen junto con las cejas, quedarse con el grupo de abajo
  const low = (a) => { if (a.length < 6) return a; const ys = a.map((p) => p.y).sort((x, y) => x - y); let gap = 0, cut = null; for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] > gap) { gap = ys[i] - ys[i - 1]; cut = (ys[i] + ys[i - 1]) / 2; } const rng = ys[ys.length - 1] - ys[0]; return gap > rng * 0.18 ? a.filter((p) => p.y < cut) : a; };
  return [c(low(L)), c(low(R))];
}
function makeFace(r, lite, eL, eR) {
  const g = new THREE.Group(), d = eL.distanceTo(eR), mid = eL.clone().add(eR).multiplyScalar(0.5);
  const M = (c, o) => mat(c, lite, o);
  const [ei, bi, mi] = r.face; const ST = (makeFace.style || 'grandes');
  const eyeR = d * [0.27, 0.25, 0.27, 0.27][ei] * (ST === 'naturales' ? 0.8 : ST === 'punto' ? 0.72 : 1);
  [eL, eR].forEach((e, k) => {
    const s = k ? -1 : 1, eg = new THREE.Group(); eg.position.copy(e).sub(mid); eg.position.z -= eyeR * 0.08; eg.position.x += s * d * 0.04;
    if (ST === 'punto') {   // ojo de caricatura: óvalo oscuro con brillo
      const dot = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 16, 12), M('#17110d', { roughness: 0.2 })); dot.scale.set(0.78, 1.12, 0.3); eg.add(dot);
      const h2 = new THREE.Mesh(new THREE.CircleGeometry(eyeR * 0.25, 10), new THREE.MeshBasicMaterial({ color: '#ffffff' })); h2.position.set(eyeR * 0.2, eyeR * 0.35, eyeR * 0.36); eg.add(h2);
      eg.userData.sclera = dot; g.add(eg); g.userData['eye' + k] = eg;
      const brow = new THREE.Mesh(new THREE.CapsuleGeometry(eyeR * 0.2, eyeR * 1.6, 4, 8), M(r.hair)); brow.rotation.z = Math.PI / 2 + s * 0.08; brow.scale.z = 0.5; brow.position.set(eg.position.x, eg.position.y + eyeR * 1.75, eg.position.z + eyeR * 0.1); g.add(brow);
      return;
    }
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 18, 12), M('#ffffff', { roughness: 0.25 }));
    sclera.scale.set(ei === 1 ? 0.85 : 1, (ei === 1 ? 1.35 : 1.18) * (ST === 'naturales' ? 0.82 : 1), ST === 'naturales' ? 0.24 : 0.3); eg.add(sclera);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(eyeR * 0.58, 20), M(r.eyes, { roughness: 0.3 })); iris.position.z = eyeR * 0.31; eg.add(iris);
    const pup = new THREE.Mesh(new THREE.CircleGeometry(eyeR * 0.3, 16), M('#0b0b0d')); pup.position.z = eyeR * 0.315; eg.add(pup);
    const hl = new THREE.Mesh(new THREE.CircleGeometry(eyeR * 0.14, 12), new THREE.MeshBasicMaterial({ color: '#ffffff' })); hl.position.set(eyeR * 0.2, eyeR * 0.22, eyeR * 0.32); eg.add(hl);
    if (ei === 2) {   // ojos alegres: párpado inferior curvo de color piel
      const lid = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 1.05, 16, 10, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), M(r.skin)); lid.scale.set(1.02, 1.2, 0.34); lid.position.z = 0.002; eg.add(lid);
    }
    if (ei === 3) {   // pestañas
      for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(eyeR * 0.12, eyeR * 0.42, eyeR * 0.05), M('#141010')); const a = (i - 1) * 0.5 + s * 0.4; l.position.set(Math.sin(a) * eyeR * 1.0 + s * eyeR * 0.15, Math.cos(a) * eyeR * 1.12, eyeR * 0.18); l.rotation.z = -a; eg.add(l); }
    }
    eg.userData.sclera = sclera; g.add(eg); g.userData['eye' + k] = eg;
    // ceja
    const bw = eyeR * [1.5, 1.6, 1.7][bi] * (ST === 'naturales' ? 1.2 : 1), bh = eyeR * [0.22, 0.24, 0.42][bi] * (ST === 'naturales' ? 1.15 : 1);
    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(bh / 2, bw, 4, 8), M(r.hair)); brow.rotation.z = Math.PI / 2 + s * [0.08, -0.18, 0.05][bi];
    brow.scale.z = 0.5; brow.position.set(eg.position.x + s * eyeR * 0.1, eg.position.y + eyeR * (ST === 'naturales' ? 1.8 : ei === 1 ? 1.75 : 1.55) + (bi === 1 ? eyeR * 0.12 : 0), eg.position.z + eyeR * 0.1); g.add(brow);
  });
  // boca
  const mw = d * [0.36, 0.46, 0.24][mi], mouth = new THREE.Group();
  if (mi === 1) {   // gran sonrisa abierta
    const sh = new THREE.Shape(); sh.moveTo(-mw / 2, 0); sh.quadraticCurveTo(0, -mw * 0.85, mw / 2, 0); sh.quadraticCurveTo(0, -mw * 0.12, -mw / 2, 0);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh, 12), M('#5a1a1a')); mouth.add(m);
    const tsh = new THREE.Shape(); tsh.moveTo(-mw * 0.4, -mw * 0.035); tsh.quadraticCurveTo(0, -mw * 0.13, mw * 0.4, -mw * 0.035); tsh.lineTo(mw * 0.36, -mw * 0.1); tsh.quadraticCurveTo(0, -mw * 0.26, -mw * 0.36, -mw * 0.1); tsh.lineTo(-mw * 0.4, -mw * 0.035);
    const teeth = new THREE.Mesh(new THREE.ShapeGeometry(tsh, 8), M('#ffffff')); teeth.position.z = 0.0005; mouth.add(teeth);
  } else {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(mw / 2, d * 0.035, 6, 16, Math.PI * 0.8), M('#5a1a1a')); arc.rotation.z = Math.PI + Math.PI * 0.1; mouth.add(arc);
  }
  mouth.position.set(0, -d * 0.62, d * 0.12); g.add(mouth); g.userData.mouth = mouth;
  return g;
}

// ---------- Cara pintada (calcomanía sobre la cabeza) ----------
// Plano de la cara: origen entre los ojos, unidades = distancia entre ojos (d). Cubre x∈[-FW/2,FW/2], y∈[FY0,FY1].
const FW = 2.3, FY0 = -1.45, FY1 = 0.85;
function faceCanvas(r, eyesX) {
  const S = 512, c = document.createElement('canvas'); c.width = S; c.height = Math.round(S * (FY1 - FY0) / FW); const g = c.getContext('2d');
  const X = (x) => (x / FW + 0.5) * S, Y = (y) => (FY1 - y) / FW * S, U = S / FW;   // U = píxeles por "d"
  const fem = r.g === 'f', mi = r.face[2];
  // ojos
  [-1, 1].forEach((sd) => {
    const cx = X(sd * eyesX), cy = Y(0.02), w = U * 0.27, h = U * 0.15;
    const almond = () => { g.beginPath(); g.moveTo(cx - w, cy + h * 0.15); g.bezierCurveTo(cx - w * 0.55, cy - h * 1.25, cx + w * 0.55, cy - h * 1.3, cx + w, cy - h * 0.05); g.bezierCurveTo(cx + w * 0.5, cy + h * 1.05, cx - w * 0.55, cy + h * 1.05, cx - w, cy + h * 0.15); g.closePath(); };
    g.save(); if (sd < 0) { g.translate(cx * 2, 0); g.scale(-1, 1); }   // el ojo izquierdo es espejo del derecho
    almond(); g.fillStyle = '#fbfaf7'; g.fill();
    g.save(); almond(); g.clip();
    const ir = h * 1.12, ix = cx - w * 0.05, iy = cy - h * 0.02;
    const gr = g.createRadialGradient(ix, iy - ir * 0.3, ir * 0.1, ix, iy, ir); gr.addColorStop(0, r.eyes); gr.addColorStop(1, '#' + new THREE.Color(r.eyes).multiplyScalar(0.45).getHexString());
    g.fillStyle = gr; g.beginPath(); g.arc(ix, iy, ir, 0, 7); g.fill();
    g.fillStyle = '#0d0907'; g.beginPath(); g.arc(ix, iy, ir * 0.5, 0, 7); g.fill();
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(cx - w, cy - h * 1.4, w * 2, h * 0.55);   // sombra del párpado
    g.restore();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(ix + ir * 0.32, iy - ir * 0.32, ir * 0.22, 0, 7); g.fill();
    // delineado superior (con colita en mujeres) y línea inferior suave
    g.strokeStyle = '#1a1210'; g.lineCap = 'round'; g.lineWidth = U * (fem ? 0.045 : 0.032);
    g.beginPath(); g.moveTo(cx - w * 1.02, cy + h * 0.12); g.bezierCurveTo(cx - w * 0.55, cy - h * 1.28, cx + w * 0.55, cy - h * 1.33, cx + w * 1.02, cy - h * 0.08);
    if (fem) g.quadraticCurveTo(cx + w * 1.22, cy - h * 0.38, cx + w * 1.32, cy - h * 0.62);
    g.stroke();
    g.strokeStyle = 'rgba(60,35,25,.45)'; g.lineWidth = U * 0.014; g.beginPath(); g.moveTo(cx - w * 0.75, cy + h * 0.75); g.quadraticCurveTo(cx, cy + h * 1.2, cx + w * 0.85, cy + h * 0.3); g.stroke();
    // ceja arqueada
    const bc = '#' + new THREE.Color(r.hair).multiplyScalar(fem ? 0.85 : 0.7).getHexString();
    g.fillStyle = bc; g.beginPath();
    const by = cy - h * 2.3, bw = w * 1.18, th = U * (fem ? 0.05 : 0.075);
    g.moveTo(cx - bw, by + th * 0.6); g.quadraticCurveTo(cx - bw * 0.1, by - th * 1.6, cx + bw * 0.55, by - th * 0.9); g.quadraticCurveTo(cx + bw * 0.95, by - th * 0.4, cx + bw * 1.05, by + th * 0.5);
    g.quadraticCurveTo(cx + bw * 0.6, by + th * 0.1, cx + bw * 0.4, by + th * 0.15); g.quadraticCurveTo(cx - bw * 0.15, by - th * 0.1, cx - bw * 0.98, by + th * 1.3); g.closePath(); g.fill();
    g.restore();
  });
  // maquillaje: rubor y pecas
  if (r.makeup === 1 || r.makeup === 2) [-1, 1].forEach((sd) => { const gx = X(sd * 0.62), gy = Y(-0.42); const gr = g.createRadialGradient(gx, gy, 0, gx, gy, U * 0.22); gr.addColorStop(0, 'rgba(240,110,110,' + (r.makeup === 1 ? '.38' : '.18') + ')'); gr.addColorStop(1, 'rgba(240,110,110,0)'); g.fillStyle = gr; g.fillRect(gx - U * 0.3, gy - U * 0.3, U * 0.6, U * 0.6); });
  if (r.makeup === 2) { g.fillStyle = 'rgba(120,60,30,.55)'; for (let k = 0; k < 18; k++) { const sd = k % 2 ? 1 : -1, a = k * 2.4; g.beginPath(); g.arc(X(sd * (0.35 + (Math.sin(a) * 0.5 + 0.5) * 0.4)), Y(-0.3 - (Math.cos(a * 1.3) * 0.5 + 0.5) * 0.25), U * 0.012, 0, 7); g.fill(); } }
  // barba (sombra, candado, corta, completa) con el color del pelo
  if (r.beard) {
    const bc = new THREE.Color(r.hair), rgba = (a) => `rgba(${Math.round(bc.r * 255)},${Math.round(bc.g * 255)},${Math.round(bc.b * 255)},${a})`;
    g.save();
    if (r.beard === 1) { g.fillStyle = rgba(0.28); g.beginPath(); g.moveTo(X(-0.95), Y(-0.35)); g.quadraticCurveTo(X(-0.9), Y(-1.35), X(0), Y(-1.42)); g.quadraticCurveTo(X(0.9), Y(-1.35), X(0.95), Y(-0.35)); g.lineTo(X(0.7), Y(-0.45)); g.quadraticCurveTo(X(0), Y(-0.62), X(-0.7), Y(-0.45)); g.closePath(); g.fill(); }
    if (r.beard === 2) { g.fillStyle = rgba(0.85); g.beginPath(); g.ellipse(X(0), Y(-0.72), U * 0.32, U * 0.07, 0, 0, 7); g.fill(); g.beginPath(); g.moveTo(X(-0.3), Y(-0.98)); g.quadraticCurveTo(X(0), Y(-1.3), X(0.3), Y(-0.98)); g.quadraticCurveTo(X(0), Y(-1.08), X(-0.3), Y(-0.98)); g.fill(); g.fillRect(X(-0.38), Y(-0.75), U * 0.08, U * 0.25); g.fillRect(X(0.3), Y(-0.75), U * 0.08, U * 0.25); }
    if (r.beard >= 3) { g.fillStyle = rgba(r.beard === 3 ? 0.75 : 0.95); g.beginPath(); g.moveTo(X(-1.0), Y(-0.15)); g.lineTo(X(-0.85), Y(-0.15)); g.quadraticCurveTo(X(-0.7), Y(-0.55), X(-0.35), Y(-0.62)); g.quadraticCurveTo(X(0), Y(-0.68), X(0.35), Y(-0.62)); g.quadraticCurveTo(X(0.7), Y(-0.55), X(0.85), Y(-0.15)); g.lineTo(X(1.0), Y(-0.15));
      g.quadraticCurveTo(X(0.95), Y(r.beard === 3 ? -1.25 : -1.42), X(0), Y(r.beard === 3 ? -1.38 : -1.55)); g.quadraticCurveTo(X(-0.95), Y(r.beard === 3 ? -1.25 : -1.42), X(-1.0), Y(-0.15)); g.closePath(); g.fill();
      g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.ellipse(X(0), Y(-0.86), U * 0.3, U * 0.1, 0, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over'; }
    g.restore();
  }
  // nariz: sombra suave bajo la punta
  g.fillStyle = 'rgba(90,45,25,.18)'; g.beginPath(); g.ellipse(X(0), Y(-0.52), U * 0.11, U * 0.035, 0, 0, 7); g.fill();
  // boca: labios con sonrisa (0 sonrisa con dientes, 1 gran sonrisa, 2 sonrisa cerrada)
  const my = Y(-0.86), mw = U * [0.33, 0.38, 0.26][mi], lip = r.makeup === 3 ? '#c8102e' : fem ? '#b84a45' : '#9e5045', cu = U * 0.05, open = mi === 2 ? 0 : U * (0.09 + mi * 0.03);
  g.save(); g.translate(X(0), my);
  // labio de arriba: comisuras levantadas (sonrisa)
  g.fillStyle = lip; g.beginPath(); g.moveTo(-mw, -cu); g.bezierCurveTo(-mw * 0.55, -U * 0.04, -mw * 0.15, -U * 0.045, 0, -U * 0.025); g.bezierCurveTo(mw * 0.15, -U * 0.045, mw * 0.55, -U * 0.04, mw, -cu);
  g.quadraticCurveTo(0, U * 0.035, -mw, -cu); g.closePath(); g.fill();
  // labio de abajo
  g.beginPath(); g.moveTo(-mw * 0.92, -cu * 0.7); g.quadraticCurveTo(0, U * 0.03 + open * 1.6, mw * 0.92, -cu * 0.7); g.quadraticCurveTo(0, U * 0.15 + open * 1.4, -mw * 0.92, -cu * 0.7); g.fill();
  if (open) {   // abertura con dientes
    g.fillStyle = '#5b2420'; g.beginPath(); g.moveTo(-mw * 0.9, -cu * 0.8); g.quadraticCurveTo(0, U * 0.035, mw * 0.9, -cu * 0.8); g.quadraticCurveTo(0, U * 0.035 + open * 1.5, -mw * 0.9, -cu * 0.8); g.fill();
    g.fillStyle = '#fbf9f4'; g.beginPath(); g.moveTo(-mw * 0.78, -cu * 0.6); g.quadraticCurveTo(0, U * 0.04, mw * 0.78, -cu * 0.6); g.quadraticCurveTo(0, U * 0.035 + open * 0.75, -mw * 0.78, -cu * 0.6); g.fill();
  } else { g.strokeStyle = 'rgba(70,25,20,.85)'; g.lineWidth = U * 0.014; g.beginPath(); g.moveTo(-mw * 0.98, -cu); g.quadraticCurveTo(0, U * 0.035, mw * 0.98, -cu); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.ellipse(0, U * 0.085 + open, mw * 0.3, U * 0.012, 0, 0, 7); g.fill();   // brillo del labio
  g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function faceDecal(r, lite, skinMesh, eL, eR, head, tex) {
  const d = eL.distanceTo(eR), mid = eL.clone().add(eR).multiplyScalar(0.5);
  const pos = skinMesh.geometry.attributes.position, idx = skinMesh.geometry.index;
  const W = [], v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { skinMesh.getVertexPosition(i, v); W.push(v.clone().applyMatrix4(skinMesh.matrixWorld)); }
  const P = [], UV = [], n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const inBox = (p) => Math.abs(p.x - mid.x) / d < FW / 2 + 0.05 && (p.y - mid.y) / d > FY0 - 0.05 && (p.y - mid.y) / d < FY1 + 0.05 && p.z > mid.z - d * 0.9;
  const tri = idx ? idx.count / 3 : pos.count / 3;
  for (let t = 0; t < tri; t++) {
    const a = W[idx ? idx.getX(t * 3) : t * 3], b = W[idx ? idx.getX(t * 3 + 1) : t * 3 + 1], c = W[idx ? idx.getX(t * 3 + 2) : t * 3 + 2];
    if (!(inBox(a) || inBox(b) || inBox(c))) continue;
    n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a)).normalize(); if (n.z < 0.15) continue;
    [a, b, c].forEach((p) => { const q = p.clone().addScaledVector(n, d * 0.004); P.push(q.x, q.y, q.z); UV.push((p.x - mid.x) / d / FW + 0.5, ((p.y - mid.y) / d - FY0) / (FY1 - FY0)); });
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.computeVertexNormals();
  const ex = Math.abs(eL.x - mid.x) / d;
  const mm = new (lite ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial)(Object.assign({ map: tex || faceCanvas(r, ex), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }, lite ? {} : { roughness: 0.55 }));
  const mesh = new THREE.Mesh(g, mm); mesh.renderOrder = 2; mesh.frustumCulled = false;
  head.attach(mesh); return mesh;
}

// ---------- Accesorios (gafas, gorras, audífonos, aretes) y peinados extra ----------
function extras(r, lite, hbAll, eyes, skins, sb) {
  const hb = sb || hbAll, g = new THREE.Group(), c = hb.getCenter(new THREE.Vector3()), sz = hb.getSize(new THREE.Vector3());
  const ey0 = eyes ? (eyes[0].y + eyes[1].y) / 2 : c.y, ed0 = eyes ? eyes[0].distanceTo(eyes[1]) : sz.x * 0.4;
  // tamaño del gorro: en hombres, el cráneo; en mujeres, el pelo (se queda puesto) sin pasarse de una cabeza normal
  const cap = (() => { const B = r.g === 'f' ? hbAll : hb, bc = B.getCenter(new THREE.Vector3()), bs = B.getSize(new THREE.Vector3());
    const w = Math.max(Math.min(bs.x, ed0 * 3.4), ed0 * 2.5), d = Math.max(Math.min(bs.z, w * 1.1), ed0 * 2.5), top = r.g === 'f' ? Math.max(Math.min(B.max.y, ey0 + ed0 * 1.75), ey0 + ed0 * 1.3) : Math.max(hb.max.y, ey0 + ed0 * 1.25);
    return { x: bc.x, z: bc.z, w, d, top }; })();
  const M = (col, o) => mat(col, lite, o); const hairM = M(r.hair), accM = M(r.acc || '#1F2937');
  const top = hb.max.y, front = hb.max.z, R = Math.max(sz.x, sz.z) / 2;
  const eyeY = eyes ? (eyes[0].y + eyes[1].y) / 2 : c.y + sz.y * 0.08, ed = eyes ? eyes[0].distanceTo(eyes[1]) : sz.x * 0.4;
  const add = (m, x, y, z) => { m.position.set(x, y, z); g.add(m); return m; };
  // peinados extra
  if (r.extraHair === 1) { const b = add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.42, 20, 14), hairM), c.x, top + R * 0.12, c.z - R * 0.15); b.scale.set(1, 0.85, 1); add(new THREE.Mesh(new THREE.TorusGeometry(R * 0.2, R * 0.05, 8, 16), M(r.acc || '#8E5CF7')), c.x, top - R * 0.08, c.z - R * 0.15).rotation.x = Math.PI / 2; }
  if (r.extraHair === 3) [-1, 1].forEach((s) => add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.3, 16, 12), hairM), c.x + s * R * 0.62, top - R * 0.05, c.z - R * 0.1));
  if (r.extraHair === 2) [-1, 1].forEach((s) => { for (let k = 0; k < 6; k++) { const b = add(new THREE.Mesh(new THREE.SphereGeometry(R * (0.16 - k * 0.008), 10, 8), hairM), c.x + s * R * 0.78, hb.min.y + sz.y * 0.35 - k * R * 0.22, c.z - R * 0.35); b.scale.set(1, 1.25, 1); } add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.06, 8, 6), M(r.acc || '#8E5CF7')), c.x + s * R * 0.78, hb.min.y + sz.y * 0.35 - 6 * R * 0.22, c.z - R * 0.35); });
  // gorra o gorro
  if (r.cap === 1 || r.cap === 2) {
    const capM = M(r.hat || r.top), dome = add(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), capM), cap.x, eyeY + ed * 0.42, cap.z); dome.scale.set(cap.w * 0.56, (cap.top - eyeY - ed * 0.42) * 1.12, cap.d * 0.56);
    const brim = add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.75, R * 0.75, R * 0.05, 24, 1, false, -Math.PI / 2, Math.PI), capM), cap.x, eyeY + ed * 0.44, cap.z + cap.d * 0.4); brim.scale.set(cap.w * 0.75 / R, 1, 1.05); brim.rotation.x = 0.1;
    add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.07, 8, 6), capM), cap.x, eyeY + ed * 0.42 + (cap.top - eyeY - ed * 0.42) * 1.12, cap.z);
    if (r.cap === 1) { const t = logoTex(), lg = add(new THREE.Mesh(new THREE.PlaneGeometry(cap.w * 0.42, cap.w * 0.21), new THREE.MeshBasicMaterial({ map: t, transparent: true })), cap.x, eyeY + ed * 0.42 + (cap.top - eyeY - ed * 0.42) * 0.55, cap.z + cap.d * 0.48); lg.rotation.x = -0.5; }
  }
  if (r.cap === 3) { const capM = M(r.hat || r.top); const d = add(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), capM), cap.x, eyeY + ed * 0.4, cap.z); d.scale.set(cap.w * 0.57, (cap.top - eyeY - ed * 0.4) * 1.2, cap.d * 0.57);
    const band = add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1.02, 1, 24, 1, true), M('#' + new THREE.Color(r.hat || r.top).multiplyScalar(0.8).getHexString(), { side: THREE.DoubleSide })), cap.x, eyeY + ed * 0.52, cap.z); band.scale.set(cap.w * 0.585, ed * 0.3, cap.d * 0.585);
    add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.16, 12, 10), M('#F4F5F6')), cap.x, eyeY + ed * 0.4 + (cap.top - eyeY - ed * 0.4) * 1.2, cap.z); }
  // gafas
  if (r.glasses && eyes) {
    const frameM = r.glasses === 1 ? M('#111214') : M('#3a2a20'), lensM = r.glasses === 1 ? new THREE.MeshStandardMaterial({ color: '#1b2430', roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.88 }) : new THREE.MeshStandardMaterial({ color: '#dfefff', roughness: 0.05, transparent: true, opacity: 0.22 });
    const z = Math.max(eyes[0].z, eyes[1].z) + ed * 0.12;
    eyes.forEach((e) => { const fr = add(new THREE.Mesh(new THREE.TorusGeometry(ed * 0.27, ed * 0.04, 8, 24), frameM), e.x, e.y, z); fr.scale.set(1.15, r.glasses === 1 ? 0.85 : 0.75, 1); const ln = add(new THREE.Mesh(new THREE.CircleGeometry(ed * 0.27, 24), lensM), e.x, e.y, z - 0.001); ln.scale.copy(fr.scale); });
    add(new THREE.Mesh(new THREE.BoxGeometry(ed * 0.22, ed * 0.05, ed * 0.04), frameM), (eyes[0].x + eyes[1].x) / 2, eyeY + ed * 0.05, z);
    [-1, 1].forEach((s) => { const len = Math.max(0.01, z - c.z); add(new THREE.Mesh(new THREE.BoxGeometry(ed * 0.04, ed * 0.04, len), frameM), c.x + s * (sz.x / 2 + ed * 0.015), eyeY + ed * 0.03, z - len / 2); [eyes[0], eyes[1]].forEach(() => {}); });
    eyes.forEach((e) => { const s = Math.sign(e.x - c.x) || 1, x0 = e.x + s * ed * 0.31, x1 = c.x + s * (sz.x / 2 + ed * 0.015); add(new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0) + ed * 0.04, ed * 0.04, ed * 0.04), frameM), (x0 + x1) / 2, eyeY + ed * 0.03, z - ed * 0.02); });
  }
  // audífonos
  if (r.phones) {
    const topAll = hbAll.max.y, pm = M(r.acc || '#111214'), band = add(new THREE.Mesh(new THREE.TorusGeometry(sz.x * 0.6, R * 0.06, 8, 24, Math.PI), pm), c.x, eyeY - ed * 0.2, c.z); band.scale.y = (topAll - eyeY + ed * 0.2 + R * 0.06) / (sz.x * 0.6);
    [-1, 1].forEach((s) => { const cup = add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.3, R * 0.3, R * 0.2, 18), pm), c.x + s * (sz.x * 0.56), eyeY - ed * 0.25, c.z); cup.rotation.z = Math.PI / 2;
      add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.19, R * 0.19, R * 0.04, 16), M('#FF6A3D')), c.x + s * (sz.x * 0.56 + R * 0.11), eyeY - ed * 0.25, c.z).rotation.z = Math.PI / 2; });
  }
  // aretes
  if (r.earrings) {
    const pts = (skins || []).flatMap((m) => vertsWorld(m)), yLo = eyeY - ed * 0.75, yHi = eyeY - ed * 0.05;
    [-1, 1].forEach((s) => {
      let best = null; pts.forEach((p) => { if (p.y > yLo && p.y < yHi && p.z < c.z + R * 0.3 && (best === null || s * p.x > s * best.x)) best = p; });
      const ear = best ? best.clone() : new THREE.Vector3(c.x + s * sz.x * 0.45, eyeY - ed * 0.4, c.z);
      const ring = add(new THREE.Mesh(new THREE.TorusGeometry(R * 0.07, R * 0.018, 6, 16), M('#E8B84A', { metalness: 0.6, roughness: 0.3 })), ear.x + s * R * 0.02, Math.min(ear.y, eyeY - ed * 0.45) - R * 0.08, ear.z); ring.rotation.y = Math.PI / 2;
    });
  }
  return g.children.length ? g : null;
}
let _logo = null;
function logoTex() { if (_logo) return _logo; const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.font = '900 96px Manrope,Inter,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('MV', 128, 70); _logo = new THREE.CanvasTexture(c); _logo.colorSpace = THREE.SRGBColorSpace; return _logo; }
// Estampado en el pecho (logo MV o número), pintado como calcomanía sobre la camiseta
function chestPrint(r, lite, tops, bones, wrap) {
  const ch = bones.Chest || bones.Torso; if (!ch) return; const cw = new THREE.Vector3(); ch.getWorldPosition(cw);
  const W = 0.13, H = 0.1, cv = document.createElement('canvas'); cv.width = 256; cv.height = 196; const g = cv.getContext('2d');
  const light = new THREE.Color(r.top).getHSL({}).l < 0.55; g.fillStyle = light ? '#ffffff' : '#111214'; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (r.print === 1) { g.font = '900 120px Manrope,Inter,sans-serif'; g.fillText('MV', 128, 104); } else { g.font = '900 150px Manrope,Inter,sans-serif'; g.fillText('10', 128, 108); }
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
  const cy = cw.y + (r.print === 1 ? 0.03 : 0.0), cx = cw.x;
  tops.forEach((m) => {
    const pos = m.geometry.attributes.position, idx = m.geometry.index, P = [], UV = [], v = new THREE.Vector3(), Wp = [];
    for (let i = 0; i < pos.count; i++) { m.getVertexPosition(i, v); Wp.push(v.clone().applyMatrix4(m.matrixWorld)); }
    const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (let t = 0; t < idx.count / 3; t++) {
      const a = Wp[idx.getX(t * 3)], b = Wp[idx.getX(t * 3 + 1)], c = Wp[idx.getX(t * 3 + 2)];
      const inb = (p) => Math.abs(p.x - cx) < W && Math.abs(p.y - cy) < H && p.z > cw.z; if (!(inb(a) || inb(b) || inb(c))) continue;
      n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a)).normalize(); if (n.z < 0.2) continue;
      [a, b, c].forEach((p) => { const q = p.clone().addScaledVector(n, 0.004); P.push(q.x, q.y, q.z); UV.push((p.x - cx) / W + 0.5, (p.y - cy) / H + 0.5); });
    }
    if (!P.length) return;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); geo.computeVertexNormals();
    // el estampado sigue al pecho (se pega al hueso, como la cara a la cabeza)
    const mm = new (lite ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial)({ map: tx, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const mesh = new THREE.Mesh(geo, mm); mesh.renderOrder = 2; mesh.frustumCulled = false; wrap.add(mesh); ch.attach(mesh);
  });
}

// ---------- Armar avatar ----------
export function setEyeStyle(st) { makeFace.style = st; }
makeFace.style = 'pintada';   // elegido: ojos almendrados con delineado, cejas arqueadas y labios (cara pintada)
async function buildLegacy(recipe, opts = {}) {
  const r = fix(recipe), lite = !!opts.lite;
  const parts = await Promise.all(['body', 'head', 'legs', 'feet'].map((k) => part(r.g, r[k], k)));
  const root = skClone(parts[0].scene);           // el torso trae el esqueleto principal
  const bones = {}; root.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const meshes = [];
  const take = (scene, pname) => {
    scene.traverse((o) => { if (o.isSkinnedMesh) meshes.push([o, pname]); });
  };
  take(root, 'body');
  ['head', 'legs', 'feet'].forEach((pn, i) => {
    const sc = skClone(parts[i + 1].scene);
    const found = []; sc.traverse((o) => { if (o.isSkinnedMesh) found.push(o); });
    found.forEach((o) => {
      const sk = new THREE.Skeleton(o.skeleton.bones.map((b) => bones[b.name]), o.skeleton.boneInverses);
      const holder = root.getObjectByName(o.parent.name) || root;
      holder.add(o); o.bind(sk, o.bindMatrix); meshes.push([o, pn]);
    });
  });
  // colores por papel de cada material
  const eyeMeshes = [], headSkin = [], ownEarrings = [];
  const order = { body: [], legs: [], feet: [], head: [] };
  meshes.forEach(([m, pn]) => {
    const name = m.material.name || '';
    const isEye = pn === 'head' && (name === 'Eye' || name === 'Eyebrows' || (r.g === 'f' && name === 'Brown'));
    if (isEye) { eyeMeshes.push([m, name]); return; }
    const n = name.toLowerCase(); let k = 0;
    if (!/^(skin|hair|eyebrows|moustache|earrings|gold|metal)/.test(n)) { if (!order[pn].includes(name)) order[pn].push(name); k = order[pn].indexOf(name); }
    m.userData.mvName = name;
    if (pn === 'head' && /^skin/i.test(name)) headSkin.push(m);
    if (/^earrings/i.test(name)) { ownEarrings.push(m); m.visible = !!r.earrings; }
    m.material = mat(roleColor(pn, name, r, k), lite);
    m.geometry = m.geometry.clone(); m.geometry.computeVertexNormals();
    m.castShadow = true; m.frustumCulled = false;
  });
  // orientación y tamaño: de frente a +Z, pies en el piso, ~1,6 m
  const wrap = new THREE.Group(); wrap.add(root); wrap.updateMatrixWorld(true);
  // T-pose para que las poses tipo VRM funcionen igual
  const B = (n) => bones[n];
  ['L', 'R'].forEach((s) => { const x = s === 'L' ? 1 : -1;
    if (B('UpperArm' + s) && B('LowerArm' + s)) aim(B('UpperArm' + s), B('LowerArm' + s), new THREE.Vector3(x, 0, 0));
    if (B('LowerArm' + s) && B('Hand' + s)) aim(B('LowerArm' + s), B('Hand' + s), new THREE.Vector3(x, 0, 0));
    if (B('UpperLeg' + s) && B('LowerLeg' + s)) aim(B('UpperLeg' + s), B('LowerLeg' + s), new THREE.Vector3(0, -1, 0));
    if (B('LowerLeg' + s) && B('Foot' + s)) aim(B('LowerLeg' + s), B('Foot' + s), new THREE.Vector3(0, -1, 0));
  });
  wrap.updateMatrixWorld(true);
  // ¿hacia dónde mira? (los ojos están adelante): si mira a -Z, girar
  const eyePts = eyeMeshes.filter(([, n]) => n !== 'Eyebrows').flatMap(([m]) => vertsWorld(m));
  const box = new THREE.Box3(); meshes.forEach(([m]) => { m.geometry.computeBoundingBox(); }); root.traverse((o) => { if (o.isSkinnedMesh && o.visible) { o.computeBoundingBox(); box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
  const center = box.getCenter(new THREE.Vector3());
  if (eyePts.length) { const ez = eyePts.reduce((s, p) => s + p.z, 0) / eyePts.length; if (ez < center.z) { root.rotation.y += Math.PI; wrap.updateMatrixWorld(true); } }
  const box2 = new THREE.Box3(); root.traverse((o) => { if (o.isSkinnedMesh) { o.computeBoundingBox(); box2.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
  const h = box2.max.y - box2.min.y, sc = (opts.height || 1.42) / h;
  root.scale.multiplyScalar(sc); root.position.y -= box2.min.y * sc; wrap.updateMatrixWorld(true);
  // cara: ojos, cejas y boca propios, pegados a la cabeza
  const head = B('Head');
  const eyeW = eyeMeshes.filter(([, n]) => n !== 'Eyebrows').flatMap(([m]) => vertsWorld(m));
  const painted = makeFace.style === 'pintada';
  const keepEyes = makeFace.style === 'originales';
  if (!keepEyes) eyeMeshes.forEach(([m]) => { m.visible = false; });
  if (painted) eyeMeshes.forEach(([m]) => { m.visible = false; }); else eyeMeshes.forEach(([m, n]) => { m.material = mat(n === 'Eyebrows' || (r.g === 'f' && n === 'Brown') ? r.hair : shade(r.eyes, 0.55), lite); });
  let face = null;
  if (eyeW.length && head) {
    let [eL, eR] = eyeCenters(eyeW);
    const mid = eL.clone().add(eR).multiplyScalar(0.5);
    if (painted && headSkin.length) { const tx = faceCanvas(r, Math.abs(eL.x - mid.x) / eL.distanceTo(eR)); headSkin.forEach((m) => faceDecal(r, lite, m, eL, eR, head, tx)); face = null; }
    else { face = makeFace(r, lite, eL, eR); }
    if (face) { if (keepEyes) face.children.filter((c) => c !== face.userData.mouth).forEach((c) => (c.visible = false)); face.position.copy(mid); wrap.add(face); face.updateMatrixWorld(true); head.attach(face); }
  }
  // proporciones caricatura: cabeza grande, cuerpo algo más ancho
  if (head && headSkin.length) {
    const sb = new THREE.Box3(); headSkin.forEach((m) => vertsWorld(m).forEach((p) => sb.expandByPoint(p)));
    const hb = sb.clone();
    // con gorra o gorro: los hombres se quedan sin el pelo de arriba y sin el sombrero del modelo (la gorra lo reemplaza)
    if (r.cap) meshes.forEach(([m, pn]) => { if (pn !== 'head' || !m.visible || eyeMeshes.some(([e]) => e === m)) return; const n = (m.userData.mvName || '').toLowerCase(); const isHair = /^hair/.test(n), isSkin = /^skin/.test(n), keep = isSkin || /^(earrings|eyebrows|moustache)/.test(n);
      if (!keep && !isHair) m.visible = false; if (isHair && (r.g === 'm' || /punk/i.test(r.head))) m.visible = false; });
    root.traverse((o) => { if (o.isSkinnedMesh && meshes.some(([mm, pn]) => mm === o && pn === 'head') && o.visible) vertsWorld(o).forEach((p) => hb.expandByPoint(p)); });
    const acc = extras(Object.assign({}, r, { earrings: ownEarrings.length ? 0 : r.earrings }), lite, hb, eyeW.length ? eyeCenters(eyeW) : null, headSkin, sb); if (acc) { wrap.add(acc); acc.updateMatrixWorld(true); head.attach(acc); }
  }
  if (r.print && head) { const top = meshes.filter(([m, pn]) => pn === 'body' && m.material === mat(r.top, lite)).map(([m]) => m); if (top.length) chestPrint(r, lite, top, bones, wrap); }
  if (head) head.scale.multiplyScalar(opts.headScale || 1.42);
  wrap.scale.set(1.1, 1, 1.1);
  wrap.updateMatrixWorld(true);

  // ---------- Esqueleto normalizado (como VRM) ----------
  const map = Object.assign({}, HB, fingerMap(bones, 'L'), fingerMap(bones, 'R'));
  const norm = {}, raw = {}, rest = {};
  Object.entries(map).forEach(([vn, qn]) => {
    const b = bones[qn]; if (!b) return;
    raw[vn] = b; const n = new THREE.Object3D(); n.name = 'N_' + vn; norm[vn] = n;
    const pw = new THREE.Quaternion(); b.parent.getWorldQuaternion(pw);
    rest[vn] = { q: b.quaternion.clone(), pw, ipw: pw.clone().invert(), pos: b.position.clone() };
  });
  // la posición de la cadera en el "espacio normalizado" (para subir/bajar el cuerpo)
  const hipsW = new THREE.Vector3(); raw.hips.getWorldPosition(hipsW); wrap.worldToLocal(hipsW); norm.hips.position.copy(hipsW);
  const hipsRest = hipsW.clone(); const pScale = new THREE.Vector3(); raw.hips.parent.getWorldScale(pScale); const wScale = new THREE.Vector3(); wrap.getWorldScale(wScale);
  const tq = new THREE.Quaternion(), dv = new THREE.Vector3();
  const em = { v: { blink: 0, happy: 0 }, setValue(k, x) { this.v[k] = x; }, getValue(k) { return this.v[k] || 0; }, update() {} };
  const av = {
    scene: wrap, recipe: r, face, bones,
    humanoid: { getNormalizedBoneNode: (n) => norm[n] || null, getRawBoneNode: (n) => raw[n] || null, normalizedHumanBones: norm },
    expressionManager: face ? em : undefined,
    update() {
      for (const vn in norm) { const R0 = rest[vn]; tq.copy(norm[vn].quaternion).multiply(R0.pw).premultiply(R0.ipw).multiply(R0.q); raw[vn].quaternion.copy(tq); }
      // cadera: el desplazamiento en el espacio del avatar pasa al espacio del padre del hueso
      dv.copy(norm.hips.position).sub(hipsRest).multiply(wScale).applyQuaternion(rest.hips.ipw).divide(pScale);
      raw.hips.position.copy(rest.hips.pos).add(dv);
      if (face) {
        const b = em.v.blink; [face.userData.eye0, face.userData.eye1].forEach((e) => { if (e) e.scale.y = Math.max(0.08, 1 - b); });
        const hp = em.v.happy; face.userData.mouth.scale.set(1 + hp * 0.25, 1 + hp * 0.4, 1);
      }
    },
    dispose() { wrap.traverse((o) => { if (o.geometry && o.isSkinnedMesh) o.geometry.dispose(); }); },
  };
  return av;
}

// Los avatares Anime Motion Studio usan el mismo contrato de rig que los juegos.
export async function build(recipe, opts = {}) {
  const r = fix(recipe);
  if (r.mvStyle === 'anime-game') return buildAnimeAvatar(r, opts);
  return buildLegacy(r, opts);
}
