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
  line.material.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', 'transformed += normalize(objectNormal) * 0.006;\n#include <project_vertex>'); };
  m.parent.add(line);
}
