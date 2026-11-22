// MiVibra Movimiento — cuerpos con esqueleto propio (hecho en Blender con tools/autorig).
// El GLB trae huesos con los nombres del estándar VRM (hips, spine, chest, leftUpperArm…) en pose T,
// mirando a +Z. Aquí se envuelve igual que los avatares de siempre: getNormalizedBoneNode + update(),
// así vallas, bolos, tenis, la copia de movimientos (espejo.js) y las animaciones funcionan sin cambios.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const NAMES = ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes'];

export async function loadCuerpo(url, opts = {}) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const wrap = new THREE.Group(); wrap.name = 'cuerpo';
  const root = gltf.scene; wrap.add(root);
  const raw = {};
  root.traverse((o) => {
    if (o.isBone && NAMES.includes(o.name)) raw[o.name] = o;
    if (o.isMesh) { o.frustumCulled = false; o.castShadow = !opts.lite; if (opts.toon) toonify(o, opts.lite); }
  });
  if (!raw.hips) throw new Error('El cuerpo no trae esqueleto MiVibra');
  wrap.updateMatrixWorld(true);
  const norm = {}, rest = {};
  for (const vn in raw) {
    const b = raw[vn], n = new THREE.Object3D(); n.name = 'N_' + vn; norm[vn] = n;
    const pw = new THREE.Quaternion(); b.parent.getWorldQuaternion(pw);
    rest[vn] = { q: b.quaternion.clone(), pw, ipw: pw.clone().invert(), pos: b.position.clone() };
  }
  const hipsW = new THREE.Vector3(); raw.hips.getWorldPosition(hipsW); wrap.worldToLocal(hipsW); norm.hips.position.copy(hipsW);
  const hipsRest = hipsW.clone(), pScale = new THREE.Vector3(), wScale = new THREE.Vector3();
  raw.hips.parent.getWorldScale(pScale); wrap.getWorldScale(wScale);
  const tq = new THREE.Quaternion(), dv = new THREE.Vector3();
  const em = { v: { blink: 0, happy: 0 }, setValue(k, x) { this.v[k] = x; }, getValue(k) { return this.v[k] || 0; }, update() {} };
  return {
    scene: wrap, recipe: opts.recipe || null, bones: raw,
    humanoid: { getNormalizedBoneNode: (n) => norm[n] || null, getRawBoneNode: (n) => raw[n] || null, normalizedHumanBones: norm },
    expressionManager: em,
    update() {
      for (const vn in norm) { const R0 = rest[vn]; tq.copy(norm[vn].quaternion).multiply(R0.pw).premultiply(R0.ipw).multiply(R0.q); raw[vn].quaternion.copy(tq); }
      dv.copy(norm.hips.position).sub(hipsRest).multiply(wScale).applyQuaternion(rest.hips.ipw).divide(pScale);
      raw.hips.position.copy(rest.hips.pos).add(dv);
    },
    dispose() { wrap.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); },
  };
}

// Sombreado anime: luz en dos tonos y contorno (el contorno se omite en TV livianos)
let RAMP = null;
function ramp() {
  if (RAMP) return RAMP;
  const d = new Uint8Array([90, 90, 90, 255, 200, 200, 200, 255, 255, 255, 255, 255]);
  RAMP = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat); RAMP.minFilter = RAMP.magFilter = THREE.NearestFilter; RAMP.needsUpdate = true;
  return RAMP;
}
function toonify(m, lite) {
  const mats = Array.isArray(m.material) ? m.material : [m.material];
  const out = mats.map((s) => new THREE.MeshToonMaterial({ color: s.color ? s.color.clone() : new THREE.Color('#fff'), map: s.map || null, gradientMap: ramp(), transparent: !!s.transparent, alphaTest: s.alphaTest || 0, side: s.side }));
  m.material = Array.isArray(m.material) ? out : out[0];
  if (lite || !m.isSkinnedMesh) return;
  const line = new THREE.SkinnedMesh(m.geometry, new THREE.MeshBasicMaterial({ color: '#1b1412', side: THREE.BackSide }));
  line.bind(m.skeleton, m.bindMatrix); line.frustumCulled = false;
  line.onBeforeRender = () => {}; line.name = 'contorno';
  line.material.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', 'transformed += normalize(objectNormal) * 0.0035;\n#include <project_vertex>'); };
  m.parent.add(line);
}

// ---------- Avatar anime completo (cuerpo + peinado + accesorios) ----------
// Receta: { anime: 1, cuerpo: 'hombre'|'mujer', pelo: id|'', peloColor: '#hex'|'', acc: [ids], tenis: id|'', alto: 1, ancho: 1, name }
const BASE = new URL('./cuerpos/', import.meta.url).href;
export const ANIME_DEFAULT = { anime: 1, cuerpo: 'hombre', pelo: 'pelo_puntas', peloColor: '', acc: [], tenis: '', alto: 1, ancho: 1, name: 'Tú' };
export function fixAnime(r) {
  const o = Object.assign({}, ANIME_DEFAULT, r || {});
  if (o.cuerpo !== 'mujer') o.cuerpo = 'hombre';
  o.acc = Array.isArray(o.acc) ? o.acc.filter((x) => typeof x === 'string').slice(0, 6) : [];
  o.alto = Math.max(0.9, Math.min(1.1, +o.alto || 1)); o.ancho = Math.max(0.88, Math.min(1.15, +o.ancho || 1));
  if (!/^#[0-9a-f]{6}$/i.test(o.peloColor || '')) o.peloColor = '';
  o.name = String(o.name || 'Tú').slice(0, 24);
  return o;
}
export function encodeAnime(r) { return new TextEncoder().encode('MVAN1' + JSON.stringify(fixAnime(r))).buffer; }
export function decodeAnime(buf) {
  try { const u = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer || buf); const s = new TextDecoder().decode(u.slice(0, 8192)); return s.startsWith('MVAN1') ? fixAnime(JSON.parse(s.slice(5))) : null; } catch (e) { return null; }
}
const IDX = {};
export function animeIndex(cuerpo) { if (!IDX[cuerpo]) IDX[cuerpo] = fetch(BASE + cuerpo + '/indice.json').then((r) => r.json()).catch(() => []); return IDX[cuerpo]; }
const GL = {};
function glb(url) { if (!GL[url]) GL[url] = new GLTFLoader().loadAsync(url); return GL[url]; }
// Color del pelo: se toma el brillo de la textura y se pinta con el color elegido (sirve aunque el pelo venga negro)
function tintHair(m, hex) {
  const c = new THREE.Color(hex);
  m.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((mt) => {
      mt.userData.tint = { value: c };
      mt.onBeforeCompile = (sh) => {
        sh.uniforms.uTint = mt.userData.tint;
        sh.fragmentShader = 'uniform vec3 uTint;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n{ float l = dot(diffuseColor.rgb, vec3(.3,.59,.11)); diffuseColor.rgb = uTint * clamp(.42 + l * 2.6, 0., 1.6); }');
      };
      mt.customProgramCacheKey = () => 'tint'; mt.needsUpdate = true;
    });
  });
}
export async function buildAnime(recipe, opts = {}) {
  const r = fixAnime(recipe), dir = BASE + r.cuerpo + '/';
  const [av, idx] = await Promise.all([loadCuerpo(BASE + r.cuerpo + '.glb', { toon: true, lite: opts.lite, recipe: r }), animeIndex(r.cuerpo)]);
  const want = [r.pelo, r.tenis].concat(r.acc).filter(Boolean);
  const items = idx.filter((it) => want.includes(it.id));
  const scenes = await Promise.all(items.map((it) => Promise.all(it.archivos.map((a) => glb(dir + a.f).then((g) => ({ it, a, scene: g.scene.clone(true) }))))));
  av.scene.updateMatrixWorld(true);
  // el moño propio del cuerpo se esconde si lleva otro peinado
  if (r.pelo) av.scene.traverse((o) => { if (o.isMesh && /^mono/.test(o.name)) o.visible = false; });
  scenes.flat().forEach(({ it, a, scene }) => {
    scene.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = !opts.lite; toonify(o, true); } });
    if (it.tipo === 'pelo' && r.peloColor) tintHair(scene, r.peloColor);
    av.scene.add(scene); scene.updateMatrixWorld(true);
    const bone = av.bones[a.hueso] || av.bones.head; bone.attach(scene);
  });
  av.scene.scale.set(r.alto * r.ancho, r.alto, r.alto * r.ancho);
  // en los juegos los personajes miden ~1,4 (los estadios se hicieron con ese tamaño)
  if (opts.escala) av.scene.scale.multiplyScalar(opts.escala);
  return av;
}

// ---------- Muñeco MiVibra (cuerpo liso de una pieza, sin cara; solo se elige el color) ----------
// Receta: { muneco: 1, color: '#hex', name }. Se guarda como "MVMU1" + JSON por el mismo canal de siempre.
export const MUNECO_COLORS = ['#f4f4f2', '#f5c84c', '#ff6b6b', '#4dabf7', '#51cf66', '#cc5de8', '#ff922b', '#20c997', '#f06595', '#8d6e63', '#495057', '#1e1e24'];
export const MUNECO_DEFAULT = { muneco: 1, color: '#f4f4f2', name: 'Tú' };
export function fixMuneco(r) {
  const o = { muneco: 1, color: MUNECO_DEFAULT.color, name: 'Tú' };
  if (r) {
    // recetas viejas (editor anterior): se toma el color de la camiseta como color del muñeco
    const c = r.color || r.top || r.peloColor || '';
    if (/^#[0-9a-f]{6}$/i.test(c)) o.color = c.toLowerCase();
    o.name = String(r.name || 'Tú').slice(0, 24);
  }
  return o;
}
export function encodeMuneco(r) { return new TextEncoder().encode('MVMU1' + JSON.stringify(fixMuneco(r))).buffer; }
export function decodeMuneco(buf) {
  try { const u = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer || buf); const s = new TextDecoder().decode(u.slice(0, 4096)); return s.startsWith('MVMU1') ? fixMuneco(JSON.parse(s.slice(5))) : null; } catch (e) { return null; }
}
const MUNECO_URL = BASE + 'muneco.glb';
export function preloadMuneco() { return glb(MUNECO_URL).catch(() => null); }
export async function buildMuneco(recipe, opts = {}) {
  const r = fixMuneco(recipe);
  const av = await loadCuerpo(MUNECO_URL, { lite: opts.lite, recipe: r });
  const col = new THREE.Color(r.color);
  // Mate y suave como la referencia; en equipos livianos, Lambert (más barato)
  const m = opts.lite ? new THREE.MeshLambertMaterial({ color: col }) : new THREE.MeshPhongMaterial({ color: col, shininess: 18, specular: new THREE.Color('#222222') });
  av.scene.traverse((o) => { if (o.isMesh) { o.material = m; o.castShadow = !opts.lite; } });
  av.setColor = (hex) => m.color.set(hex);
  if (opts.escala) av.scene.scale.setScalar(opts.escala);
  return av;
}
