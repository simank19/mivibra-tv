/**
 * Anime Motion Studio — contrato de datos y compatibilidad de avatares.
 *
 * La receta v2 es independiente del motor 3D. Se guarda como MVAV2 + JSON.
 * Las recetas MVAV1 se migran en memoria; no se modifica el documento Firestore.
 */
export const ANIME_SCHEMA_VERSION = 2;
export const ANIME_STYLE = 'anime-game';

export const ANIME_DEFAULT = Object.freeze({
  version: ANIME_SCHEMA_VERSION,
  style: ANIME_STYLE,
  name: 'Mi personaje',
  body: { type: 'male', height: 1.42, build: 'balanced', skin: '#c58b62' },
  face: {
    shape: 'soft',
    eyes: { style: 'anime-large', color: '#3a2416', pupil: 'round' },
    eyebrows: { style: 'natural', color: '#1a120c' },
    nose: 'small',
    mouth: 'smile',
    expression: 'happy',
    freckles: false,
    makeup: 'none',
  },
  hair: { style: 'Casual', color: '#1a120c', extra: 'none', beard: 'none' },
  outfit: {
    head: 'Casual', upper: 'Casual', lower: 'Casual2', feet: 'Casual2',
    colors: { upper: '#FF6A3D', upperDetail: '#F4F5F6', lower: '#1F2937', lowerDetail: '#F4F5F6', shoes: '#F4F5F6', shoesDetail: '#FF6A3D' },
    print: 'none',
  },
  accessories: { glasses: 'none', headwear: 'none', headphones: false, earrings: false, color: '#1F2937' },
});

const clone = (value) => JSON.parse(JSON.stringify(value));
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const oneOf = (value, values, fallback) => values.includes(value) ? value : fallback;
const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback;

export function normalizeAnimeRecipe(input = {}) {
  const d = clone(ANIME_DEFAULT);
  const src = isObject(input) ? input : {};
  const out = {
    ...d,
    ...src,
    version: ANIME_SCHEMA_VERSION,
    style: ANIME_STYLE,
    name: String(src.name || d.name).trim().slice(0, 24) || d.name,
    body: { ...d.body, ...(isObject(src.body) ? src.body : {}) },
    face: { ...d.face, ...(isObject(src.face) ? src.face : {}) },
    hair: { ...d.hair, ...(isObject(src.hair) ? src.hair : {}) },
    outfit: { ...d.outfit, ...(isObject(src.outfit) ? src.outfit : {}) },
    accessories: { ...d.accessories, ...(isObject(src.accessories) ? src.accessories : {}) },
  };
  out.body.type = oneOf(out.body.type, ['male', 'female'], d.body.type);
  out.body.height = Math.min(1.9, Math.max(1.1, Number(out.body.height) || d.body.height));
  out.body.build = oneOf(out.body.build, ['slim', 'balanced', 'athletic', 'broad'], d.body.build);
  out.body.skin = color(out.body.skin, d.body.skin);
  out.face.shape = oneOf(out.face.shape, ['soft', 'angular', 'round', 'heart'], d.face.shape);
  out.face.eyes = { ...d.face.eyes, ...(isObject(out.face.eyes) ? out.face.eyes : {}) };
  out.face.eyes.style = oneOf(out.face.eyes.style, ['anime-large', 'almond', 'round', 'sharp', 'happy'], d.face.eyes.style);
  out.face.eyes.color = color(out.face.eyes.color, d.face.eyes.color);
  out.face.eyes.pupil = oneOf(out.face.eyes.pupil, ['round', 'star', 'slit'], d.face.eyes.pupil);
  out.face.eyebrows = { ...d.face.eyebrows, ...(isObject(out.face.eyebrows) ? out.face.eyebrows : {}) };
  out.face.eyebrows.color = color(out.face.eyebrows.color, out.hair.color);
  out.face.eyebrows.style = oneOf(out.face.eyebrows.style, ['natural', 'thick', 'arched', 'straight', 'thin'], d.face.eyebrows.style);
  out.face.nose = oneOf(out.face.nose, ['small', 'button', 'defined', 'soft'], d.face.nose);
  out.face.mouth = oneOf(out.face.mouth, ['smile', 'wide-smile', 'neutral', 'open', 'small'], d.face.mouth);
  out.face.expression = oneOf(out.face.expression, ['happy', 'neutral', 'confident', 'surprised', 'serious'], d.face.expression);
  out.face.makeup = oneOf(out.face.makeup, ['none', 'natural', 'blush', 'liner', 'lip-color'], d.face.makeup);
  out.face.freckles = !!out.face.freckles;
  out.hair.style = String(out.hair.style || d.hair.style).slice(0, 40);
  out.hair.color = color(out.hair.color, d.hair.color);
  out.hair.extra = oneOf(out.hair.extra, ['none', 'bun', 'braids', 'twin-buns'], d.hair.extra);
  out.hair.beard = oneOf(out.hair.beard, ['none', 'stubble', 'goatee', 'short', 'full', 'mustache'], d.hair.beard);
  out.outfit.colors = { ...d.outfit.colors, ...(isObject(out.outfit.colors) ? out.outfit.colors : {}) };
  for (const k of Object.keys(d.outfit.colors)) out.outfit.colors[k] = color(out.outfit.colors[k], d.outfit.colors[k]);
  for (const k of ['head', 'upper', 'lower', 'feet']) out.outfit[k] = String(out.outfit[k] || d.outfit[k]).slice(0, 40);
  out.outfit.print = oneOf(out.outfit.print, ['none', 'mv', 'number'], 'none');
  out.accessories.glasses = oneOf(out.accessories.glasses, ['none', 'sunglasses', 'reading'], 'none');
  out.accessories.headwear = oneOf(out.accessories.headwear, ['none', 'mv-cap', 'cap', 'beanie'], 'none');
  out.accessories.headphones = !!out.accessories.headphones;
  out.accessories.earrings = !!out.accessories.earrings;
  out.accessories.color = color(out.accessories.color, d.accessories.color);
  return out;
}

/** Convierte la receta plana del motor actual al esquema estructurado v2. */
export function legacyToAnimeRecipe(legacy = {}) {
  const l = isObject(legacy) ? legacy : {};
  if (isObject(l.animeRecipe)) return normalizeAnimeRecipe(l.animeRecipe);
  const skin = color(l.skin, ANIME_DEFAULT.body.skin);
  const hair = color(l.hair, ANIME_DEFAULT.hair.color);
  const eye = color(l.eyes, ANIME_DEFAULT.face.eyes.color);
  const cloth = (k, fallback) => color(l[k], fallback);
  const face = Array.isArray(l.face) ? l.face : [0, 0, 0];
  return normalizeAnimeRecipe({
    name: l.name,
    body: { type: l.g === 'f' ? 'female' : 'male', skin, height: Number(l.animeHeight) || ANIME_DEFAULT.body.height, build: l.animeBuild || ANIME_DEFAULT.body.build },
    face: {
      eyes: { style: ['anime-large', 'almond', 'round', 'happy'][face[0] || 0] || 'anime-large', color: eye },
      eyebrows: { style: ['natural', 'arched', 'thick'][face[1] || 0] || 'natural', color: hair },
      mouth: ['smile', 'wide-smile', 'small'][face[2] || 0] || 'smile',
      makeup: ['none', 'blush', 'natural', 'lip-color'][l.makeup || 0] || 'none',
      freckles: l.makeup === 2,
    },
    hair: {
      style: l.head || ANIME_DEFAULT.hair.style, color: hair,
      extra: ['none', 'bun', 'braids', 'twin-buns'][l.extraHair || 0] || 'none',
      beard: ['none', 'stubble', 'goatee', 'short', 'full'][l.beard || 0] || 'none',
    },
    outfit: {
      head: l.head || 'Casual', upper: l.body || 'Casual', lower: l.legs || 'Casual2', feet: l.feet || 'Casual2',
      colors: {
        upper: cloth('top', '#FF6A3D'), upperDetail: cloth('top2', '#F4F5F6'),
        lower: cloth('bottom', '#1F2937'), lowerDetail: cloth('bottom2', '#F4F5F6'),
        shoes: cloth('shoes', '#F4F5F6'), shoesDetail: cloth('shoes2', '#FF6A3D'),
      },
      print: l.print === 1 ? 'mv' : l.print === 2 ? 'number' : 'none',
    },
    accessories: {
      glasses: l.glasses === 1 ? 'sunglasses' : l.glasses === 2 ? 'reading' : 'none',
      headwear: l.cap === 1 ? 'mv-cap' : l.cap === 2 ? 'cap' : l.cap === 3 ? 'beanie' : 'none',
      headphones: !!l.phones, earrings: !!l.earrings, color: color(l.acc, '#1F2937'),
    },
  });
}

/** Convierte v2 al formato que consume hoy avatar.js, conservando el rig compartido. */
export function animeToLegacyRecipe(input = {}) {
  const a = normalizeAnimeRecipe(input);
  const eyeStyles = ['anime-large', 'almond', 'round', 'happy'];
  const browStyles = ['natural', 'arched', 'thick'];
  const mouths = ['smile', 'wide-smile', 'small'];
  const extras = ['none', 'bun', 'braids', 'twin-buns'];
  const beard = ['none', 'stubble', 'goatee', 'short', 'full'];
  const headwear = { none: 0, 'mv-cap': 1, cap: 2, beanie: 3 };
  return {
    v: 1, mvStyle: 'anime-game', animeRecipe: a, animeHeight: a.body.height, animeBuild: a.body.build, name: a.name, g: a.body.type === 'female' ? 'f' : 'm',
    skin: a.body.skin, hair: a.hair.color, eyes: a.face.eyes.color,
    head: a.hair.style, body: a.outfit.upper, legs: a.outfit.lower, feet: a.outfit.feet,
    face: [Math.max(0, eyeStyles.indexOf(a.face.eyes.style)), Math.max(0, browStyles.indexOf(a.face.eyebrows.style)), Math.max(0, mouths.indexOf(a.face.mouth))],
    beard: Math.max(0, beard.indexOf(a.hair.beard)),
    makeup: ({ none: 0, natural: 1, blush: 1, liner: 0, 'lip-color': 3 })[a.face.makeup] || 0,
    extraHair: Math.max(0, extras.indexOf(a.hair.extra)),
    glasses: a.accessories.glasses === 'sunglasses' ? 1 : a.accessories.glasses === 'reading' ? 2 : 0,
    cap: headwear[a.accessories.headwear] || 0, phones: a.accessories.headphones ? 1 : 0,
    earrings: a.accessories.earrings ? 1 : 0, acc: a.accessories.color,
    top: a.outfit.colors.upper, top2: a.outfit.colors.upperDetail,
    bottom: a.outfit.colors.lower, bottom2: a.outfit.colors.lowerDetail,
    shoes: a.outfit.colors.shoes, shoes2: a.outfit.colors.shoesDetail,
    print: a.outfit.print === 'mv' ? 1 : a.outfit.print === 'number' ? 2 : 0,
  };
}

export function encodeAnimeRecipe(input) {
  const json = JSON.stringify(normalizeAnimeRecipe(input));
  const bytes = new TextEncoder().encode('MVAV2' + json);
  return bytes.buffer;
}

/** Devuelve una receta v2 tanto si recibe bytes MVAV2 como una receta antigua MVAV1. */
export function decodeAnimeRecipe(buffer) {
  try {
    const bytes = new Uint8Array(buffer instanceof ArrayBuffer ? buffer : buffer.buffer || buffer);
    const raw = new TextDecoder().decode(bytes);
    if (raw.startsWith('MVAV2')) return normalizeAnimeRecipe(JSON.parse(raw.slice(5)));
    if (raw.startsWith('MVAV1')) return legacyToAnimeRecipe(JSON.parse(raw.slice(5)));
  } catch (_) { /* un archivo inválido no debe romper el editor */ }
  return null;
}
