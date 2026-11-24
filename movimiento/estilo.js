// MiVibra Movimiento — estilo de las maquetas aprobadas: estilo caricatura brillante, pensado para equipos lentos.
// Reglas: sin mapas de sombra (sombras "mancha"), materiales toon/lambert, geometrías fusionadas e instanciadas, pixelRatio 1.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export { THREE, mergeGeometries };

let GRAD = null;
function grad() {
  if (GRAD) return GRAD;
  const d = new Uint8Array([90, 170, 255]);           // 3 tonos: sombra, medio, luz
  GRAD = new THREE.DataTexture(d, 3, 1, THREE.RedFormat); GRAD.minFilter = GRAD.magFilter = THREE.NearestFilter; GRAD.needsUpdate = true;
  return GRAD;
}
const matCache = new Map();
export function mat(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (matCache.has(k)) return matCache.get(k);
  const m = new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: grad() }, o));
  matCache.set(k, m); return m;
}
export function flat(color, o = {}) { return new THREE.MeshBasicMaterial(Object.assign({ color }, o)); }

export function renderer(w, h) {
  const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: true });
  r.setPixelRatio(1); r.setSize(w, h);
  r.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(r.domElement);
  return r;
}

export function lights(scene, o = {}) {
  scene.add(new THREE.HemisphereLight(o.sky || '#dff3ff', o.ground || '#7a9a5a', o.hemi ?? 1.6));
  const d = new THREE.DirectionalLight(o.sun || '#fff4dc', o.sunI ?? 2.2); d.position.set(...(o.dir || [6, 12, 8])); scene.add(d);
}

/** Cielo degradado en una esfera (1 draw call) */
export function sky(scene, top = '#3aa0ff', bottom = '#cfefff', horizon = null) {
  const g = new THREE.SphereGeometry(400, 24, 12);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { t: { value: new THREE.Color(top) }, b: { value: new THREE.Color(bottom) }, h: { value: new THREE.Color(horizon || bottom) } },
    vertexShader: 'varying float y; void main(){ y = normalize(position).y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 t,b,h; varying float y; void main(){ vec3 c = y>0. ? mix(h,t,pow(y,.6)) : b; gl_FragColor=vec4(c,1.); }'
  });
  const s = new THREE.Mesh(g, m); s.renderOrder = -1; scene.add(s); return s;
}

/** Nubes gorditas: una sola malla fusionada */
export function clouds(scene, n = 10, area = 220, y = 60, rnd = Math.random) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const cx = (rnd() - .5) * area * 2, cz = -60 - rnd() * area, cy = y + rnd() * 30, s = 6 + rnd() * 8;
    for (let k = 0; k < 5; k++) {
      const g = new THREE.IcosahedronGeometry(s * (0.6 + rnd() * .5), 1);
      g.translate(cx + (k - 2) * s * .8, cy + (k % 2) * s * .3, cz + rnd() * 4); parts.push(g);
    }
  }
  const m = new THREE.Mesh(mergeGeometries(parts), mat('#ffffff', { emissive: '#dfeeff', emissiveIntensity: .45 }));
  scene.add(m); return m;
}

let BLOB = null;
export function blob(scene, x, z, r = .5, op = .35) {
  if (!BLOB) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x2 = c.getContext('2d');
    const g = x2.createRadialGradient(32, 32, 2, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x2.fillStyle = g; x2.fillRect(0, 0, 64, 64); BLOB = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: BLOB, transparent: true, opacity: op, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, .015, z); scene.add(m); return m;
}

/** Textura de lienzo (líneas de cancha, madera, etc.) */
export function canvasTex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}

/** Público: un aficionado = cuerpo + cabeza + brazos fusionados; todo el público es UNA malla instanciada.
 *  La animación (saltar, ola) va en el vertex shader: cero costo en JS. */
const FAN_COLORS = ['#ff4d6d', '#ffb703', '#3a86ff', '#06d6a0', '#ff7b00', '#8338ec', '#ef476f', '#118ab2', '#ffd166', '#f15bb5', '#00bbf9', '#9ef01a'];
const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a0522d'];
export function crowd(scene, spots, o = {}) {
  const body = new THREE.CylinderGeometry(.2, .26, .62, 7); body.translate(0, .31, 0);
  const head = new THREE.IcosahedronGeometry(.17, 1); head.translate(0, .8, 0);
  const armL = new THREE.CapsuleGeometry(.06, .34, 2, 5); armL.rotateZ(-.5); armL.translate(-.27, .78, 0);
  const armR = armL.clone(); armR.scale(-1, 1, 1);
  // colores por vértice: cabeza piel (se tiñe por instancia aparte), cuerpo camiseta
  const tag = (g, v) => { const a = new Float32Array(g.attributes.position.count).fill(v); g.setAttribute('part', new THREE.BufferAttribute(a, 1)); return g; };
  [body, armL, armR].forEach((g) => tag(g, 0)); tag(head, 1);
  const geo = mergeGeometries([body.toNonIndexed(), head.toNonIndexed(), armL.toNonIndexed(), armR.toNonIndexed()]);
  const n = spots.length, rnd = o.rnd || Math.random;
  const skin = new Float32Array(n * 3), phase = new Float32Array(n);
  const m = mat('#ffffff').clone();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: o.time || 0 };
    m.userData.sh = sh;
    sh.vertexShader = 'attribute float part; attribute vec3 skin; attribute float phase; uniform float uTime; varying vec3 vSkin; varying float vPart;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSkin = skin; vPart = part;
        float j = max(0., sin(uTime*7. + phase*6.2831));
        transformed.y += j * .18;
        // brazos arriba al saltar
        if (part < .5 && position.y > .55 && abs(position.x) > .2) { transformed.y += j * .12; }`);
    sh.fragmentShader = 'varying vec3 vSkin; varying float vPart;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n if (vPart > .5) diffuseColor.rgb = vSkin;');
  };
  const im = new THREE.InstancedMesh(geo, m, n);
  const d = new THREE.Object3D(), c = new THREE.Color();
  spots.forEach((p, i) => {
    d.position.set(p[0], p[1], p[2]); d.rotation.y = p[3] || 0; const s = .9 + rnd() * .25; d.scale.setScalar(s); d.updateMatrix();
    im.setMatrixAt(i, d.matrix);
    im.setColorAt(i, c.set((o.colors || FAN_COLORS)[Math.floor(rnd() * (o.colors || FAN_COLORS).length)]));
    c.set(SKIN[Math.floor(rnd() * SKIN.length)]).convertSRGBToLinear(); skin.set([c.r, c.g, c.b], i * 3);
    phase[i] = o.wave ? (p[0] * .05) % 1 : rnd();
  });
  geo.setAttribute('skin', new THREE.InstancedBufferAttribute(skin, 3));
  geo.setAttribute('phase', new THREE.InstancedBufferAttribute(phase, 1));
  scene.add(im);
  im.tick = (t) => { if (m.userData.sh) m.userData.sh.uniforms.uTime.value = t; };
  return im;
}

/** Gradas rectas: devuelve la malla de escalones y los puestos para el público */
export function stands(scene, { x = 0, z = 0, ry = 0, w = 30, rows = 6, step = .55, rise = .45, color = '#5b6b8c', fill = .85, rnd = Math.random }) {
  const parts = [];
  for (let r = 0; r < rows; r++) { const g = new THREE.BoxGeometry(w, rise * (r + 1), step); g.translate(0, rise * (r + 1) / 2, -r * step); parts.push(g); }
  const mesh = new THREE.Mesh(mergeGeometries(parts), mat(color));
  const grp = new THREE.Group(); grp.add(mesh); grp.position.set(x, 0, z); grp.rotation.y = ry; scene.add(grp);
  const spots = []; const v = new THREE.Vector3();
  for (let r = 0; r < rows; r++) for (let s = -w / 2 + .4; s < w / 2 - .3; s += .62) {
    if (rnd() > fill) continue;
    v.set(s + (rnd() - .5) * .1, rise * (r + 1), -r * step - .1).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    spots.push([v.x + x, v.y, v.z + z, ry]);
  }
  return spots;
}

/** Árboles caricatura instanciados (tronco + copa en una geometría) */
export function trees(scene, pts, kind = 'round', rnd = Math.random) {
  let g;
  if (kind === 'pine') {
    const t = new THREE.CylinderGeometry(.15, .2, .8, 6); t.translate(0, .4, 0);
    const a = new THREE.ConeGeometry(1.1, 1.6, 7); a.translate(0, 1.5, 0);
    const b = new THREE.ConeGeometry(.85, 1.3, 7); b.translate(0, 2.3, 0);
    const c = new THREE.ConeGeometry(.55, 1, 7); c.translate(0, 3, 0);
    g = [t, a, b, c];
  } else if (kind === 'palm') {
    const t = new THREE.CylinderGeometry(.12, .2, 4, 6); t.translate(0, 2, 0); t.rotateZ(.12);
    const leaves = [];
    for (let i = 0; i < 6; i++) { const l = new THREE.BoxGeometry(2.2, .06, .5); l.translate(1.1, 0, 0); l.rotateZ(-.45); l.rotateY(i / 6 * Math.PI * 2); l.translate(.25, 4, 0); leaves.push(l); }
    g = [t, ...leaves];
  } else {
    const t = new THREE.CylinderGeometry(.15, .22, 1.2, 6); t.translate(0, .6, 0);
    const a = new THREE.IcosahedronGeometry(1, 1); a.translate(0, 1.9, 0);
    const b = new THREE.IcosahedronGeometry(.7, 1); b.translate(.6, 1.6, .2);
    g = [t, a, b];
  }
  const colorOf = (i) => (i === 0 ? (kind === 'palm' ? '#a0703c' : '#8a5a33') : (kind === 'pine' ? '#2f9e5b' : kind === 'palm' ? '#3fbf5a' : '#5cc94f'));
  g = g.map((x, i) => { x = x.toNonIndexed(); const c = new THREE.Color(colorOf(i)); const a = new Float32Array(x.attributes.position.count * 3); for (let k = 0; k < a.length; k += 3) { a[k] = c.r; a[k + 1] = c.g; a[k + 2] = c.b; } x.setAttribute('color', new THREE.BufferAttribute(a, 3)); return x; });
  const im = new THREE.InstancedMesh(mergeGeometries(g), mat('#ffffff', { vertexColors: true }), pts.length);
  const d = new THREE.Object3D();
  pts.forEach((p, i) => { d.position.set(p[0], p[1] || 0, p[2]); d.rotation.y = rnd() * 6; d.scale.setScalar(p[3] || 1); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
  scene.add(im); return im;
}

export function fog(scene, color, near, far) { scene.fog = new THREE.Fog(color, near, far); }

export function stats(r, scene) {
  let tris = 0, meshes = 0;
  scene.traverse((o) => { if (o.isMesh) { meshes++; const g = o.geometry; const c = g.index ? g.index.count / 3 : g.attributes.position.count / 3; tris += c * (o.isInstancedMesh ? o.count : 1); } });
  return { calls: r.info.render.calls, tris: Math.round(r.info.render.triangles), meshes };
}

export function seeded(s) { return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

/** Público lejano en "recortes" (2 triángulos por persona): un atlas con 4 poses dibujado en un lienzo,
 *  camiseta y piel se tiñen por instancia. Miles de aficionados en 1 draw call y casi sin triángulos. */
let FANTEX = null;
function fanAtlas() {
  if (FANTEX) return FANTEX;
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
  // canal R = camiseta (con sombreado), canal G = piel, canal B = contorno oscuro; alfa = figura
  const draw = (ox, pose) => {
    const ln = (ax, ay, bx, by, w) => { x.lineCap = 'round'; x.lineWidth = w; x.beginPath(); x.moveTo(ox + ax, ay); x.lineTo(ox + bx, by); x.stroke(); };
    const fig = (col, out) => {
      x.strokeStyle = col; x.fillStyle = col;
      const arms = [[[44, 66, 30, 96], [84, 66, 98, 96]], [[44, 64, 30, 30], [84, 64, 98, 30]], [[44, 66, 30, 96], [84, 64, 100, 28]], [[44, 66, 58, 54], [84, 66, 70, 54]]][pose];
      arms.forEach((a) => ln(a[0], a[1], a[2], a[3], out ? 17 : 11));
      x.beginPath(); x.ellipse(ox + 64, 92, out ? 25 : 21, out ? 36 : 32, 0, 0, 7); x.fill();
    };
    fig('rgb(0,0,255)', true);                  // contorno
    fig('rgb(230,0,0)', false);                 // camiseta
    x.fillStyle = 'rgb(0,0,255)'; x.beginPath(); x.arc(ox + 64, 40, 19, 0, 7); x.fill();
    x.fillStyle = 'rgb(0,235,0)'; x.beginPath(); x.arc(ox + 64, 40, 15.5, 0, 7); x.fill();
    // brillo lateral de la camiseta
    x.fillStyle = 'rgb(255,0,0)'; x.globalAlpha = .7; x.beginPath(); x.ellipse(ox + 56, 84, 7, 18, 0, 0, 7); x.fill(); x.globalAlpha = 1;
  };
  for (let i = 0; i < 4; i++) draw(i * 128, i);
  FANTEX = new THREE.CanvasTexture(c); FANTEX.minFilter = THREE.LinearMipmapLinearFilter; return FANTEX;
}
export function crowdFlat(scene, spots, o = {}) {
  const rnd = o.rnd || Math.random, n = spots.length;
  const g = new THREE.PlaneGeometry(.62, .62); g.translate(0, .31, 0);
  const shirt = new Float32Array(n * 3), skin = new Float32Array(n * 3), data = new Float32Array(n * 2);
  const im = new THREE.InstancedMesh(g, new THREE.ShaderMaterial({
    transparent: false, alphaTest: .5, side: THREE.DoubleSide,
    uniforms: { map: { value: fanAtlas() }, uTime: { value: o.time || 0 }, fogColor: { value: new THREE.Color(o.fog || '#ffffff') }, fogAmt: { value: o.fogAmt || 0 } },
    vertexShader: `attribute vec3 shirt; attribute vec3 skin; attribute vec2 data; uniform float uTime; varying vec2 vUv; varying vec3 vShirt; varying vec3 vSkin; varying float vD;
      void main(){ float j = max(0., sin(uTime*7. + data.y*6.2831)); float pose = data.x; if (j > .6 && pose < .5) pose = 1.;
        vUv = vec2((uv.x + pose) / 4., uv.y); vShirt = shirt; vSkin = skin;
        vec3 p = position; p.y += j * .16;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 fogColor; uniform float fogAmt; varying vec2 vUv; varying vec3 vShirt; varying vec3 vSkin; varying float vD;
      void main(){ vec4 t = texture2D(map, vUv); if (t.a < .5) discard;
        vec3 c = vec3(.1,.1,.16) * t.b + vShirt * (.75 + .35*smoothstep(.9,1.,t.r)) * step(.3,t.r) + vSkin * step(.3,t.g);
        c = mix(c, fogColor, clamp(vD*fogAmt,0.,.6)); gl_FragColor = vec4(c, 1.); }`
  }), n);
  const d = new THREE.Object3D(), c = new THREE.Color();
  spots.forEach((p, i) => {
    d.position.set(p[0], p[1], p[2]); d.rotation.set(0, p[3] || 0, 0); d.scale.setScalar(.95 + rnd() * .2); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
    c.set((o.colors || FAN_COLORS)[Math.floor(rnd() * (o.colors || FAN_COLORS).length)]); shirt.set([c.r, c.g, c.b], i * 3);
    c.set(SKIN[Math.floor(rnd() * SKIN.length)]); skin.set([c.r, c.g, c.b], i * 3);
    data[i * 2] = Math.floor(rnd() * 4); data[i * 2 + 1] = o.wave ? (p[0] * .03 + p[2] * .03) % 1 : rnd();
  });
  g.setAttribute('shirt', new THREE.InstancedBufferAttribute(shirt, 3));
  g.setAttribute('skin', new THREE.InstancedBufferAttribute(skin, 3));
  g.setAttribute('data', new THREE.InstancedBufferAttribute(data, 2));
  scene.add(im);
  im.tick = (t) => { im.material.uniforms.uTime.value = t; };
  return im;
}

// ---- Ayudas de escenario (de las maquetas) ----
// Ayudas comunes de las maquetas
const DOWN = { leftUpperArm: [.25, -1, 0], rightUpperArm: [-.25, -1, 0], leftLowerArm: [.1, -1, .1], rightLowerArm: [-.1, -1, .1] };
export function plane(scene, w, h, matOrColor, y = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), typeof matOrColor === 'string' ? mat(matOrColor) : matOrColor);
  m.rotation.x = -Math.PI / 2; m.position.y = y; scene.add(m); return m;
}
export function box(scene, w, h, d, color, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color)); m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); return m;
}
/** Estadio: gradas en los 4 lados con público (una malla de gradas por lado + un solo InstancedMesh de público) */
export function bowl(scene, { w, d, gap = 3, rows = 7, color = '#4a5a80', fill = .85, rnd, sides = [1, 1, 1, 1], wave = false }) {
  let spots = [];
  const S = [[0, d / 2 + gap, Math.PI, w], [0, -d / 2 - gap, 0, w], [w / 2 + gap, 0, -Math.PI / 2, d], [-w / 2 - gap, 0, Math.PI / 2, d]];
  S.forEach((s, i) => { if (sides[i]) spots = spots.concat(stands(scene, { x: s[0], z: s[1], ry: s[2], w: s[3], rows, color, fill, rnd })); });
  return crowdFlat(scene, spots, { rnd, wave });
}
/** Vallas publicitarias LED configurables: cada espacio muestra el logo de un patrocinador (imagen que sube el administrador).
 *  Todos los logos van en UNA textura (atlas) y la valla entera es una sola pieza; en el juego el atlas se desplaza como LED. */
export const SPONSORS = [
  { name: 'TU LOGO AQUÍ', bg: '#FF6900', fg: '#ffffff' },
  { name: 'PATROCINADOR', bg: '#111111', fg: '#FF9A4D' },
  { name: 'TU MARCA', bg: '#ffffff', fg: '#111111' },
  { name: 'ESPACIO LIBRE', bg: '#1f4fbf', fg: '#ffffff' },
];
export function boards(scene, w, d, rnd, sponsors = SPONSORS, sides = [1, 1, 1, 1]) {
  const n = sponsors.length;
  const tex = canvasTex(256 * n, 64, (c, W, H) => {
    sponsors.forEach((s, i) => { const x = i * 256; c.fillStyle = s.bg; c.fillRect(x, 0, 256, H);
      if (s.img) c.drawImage(s.img, x + 16, 6, 224, 52);
      else { c.fillStyle = s.fg; c.font = '900 30px "Arial Black", Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s.name, x + 128, H / 2 + 2, 236); }
      c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(x + 254, 0, 2, H); });
  });
  tex.wrapS = THREE.RepeatWrapping;
  const m = new THREE.MeshBasicMaterial({ map: tex });
  const mk = (len, x, z) => { const t = tex.clone(); t.needsUpdate = true; t.repeat.set(len / (2.2 * n), 1); const b = new THREE.Mesh(new THREE.PlaneGeometry(len, .9), new THREE.MeshBasicMaterial({ map: t })); b.position.set(x, .45, z); b.lookAt(0, .45, 0); scene.add(b); return b; };
  const out = [];
  if (sides[0]) out.push(mk(w, 0, d / 2 + 1)); if (sides[1]) out.push(mk(w, 0, -d / 2 - 1));
  if (sides[2]) out.push(mk(d, w / 2 + 1, 0)); if (sides[3]) out.push(mk(d, -w / 2 - 1, 0));
  return out;
}

// Patrocinadores: el administrador los configura (lista de {name,bg,fg,img}); se leen de la app o de patrocinadores.json
export async function loadSponsors() {
  try { if (window.MV_SPONSORS) return window.MV_SPONSORS; const r = await fetch(new URL('./patrocinadores.json', import.meta.url)); if (!r.ok) return SPONSORS;
    const list = await r.json(); await Promise.all(list.map((s) => s.logo ? new Promise((ok) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => { s.img = i; ok(); }; i.onerror = ok; i.src = s.logo; }) : 0)); return list.length ? list : SPONSORS; } catch (e) { return SPONSORS; }
}
