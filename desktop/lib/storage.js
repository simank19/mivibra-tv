// Discos, carpetas, búsqueda de ROMs, BIOS y descompresión (igual que Storage.kt y NeoGeo.kt).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const arc = require('./archives');

let D = null;   // carpetas de la app: { roms, system, unzip, arcade, neogeoJson }
function init(dirs) { D = dirs; for (const k of ['roms', 'system', 'unzip', 'arcade']) fs.mkdirSync(D[k], { recursive: true }); }

function exists(p) { try { fs.accessSync(p); return true; } catch (e) { return false; } }

/** Unidades del equipo (C:, D:, USB…) y carpetas útiles. */
function roots() {
  const out = [], seen = new Set();
  const add = (name, p, removable) => {
    if (!p || seen.has(p.toLowerCase()) || !exists(p)) return;
    seen.add(p.toLowerCase());
    out.push({ name, path: p, removable: !!removable, readable: true });
  };
  if (process.platform === 'win32') {
    for (let c = 67; c <= 90; c++) {   // C: a Z:
      const d = String.fromCharCode(c) + ':\\';
      if (exists(d)) add((c === 67 ? 'Disco local' : 'Unidad') + ' (' + d.slice(0, 2) + ')', d, c > 67);
    }
  } else {
    add('Carpeta personal', os.homedir(), false);
    for (const base of ['/media', '/mnt', '/run/media/' + os.userInfo().username, '/Volumes']) {
      try { for (const f of fs.readdirSync(base)) add('Unidad (' + f + ')', path.join(base, f), true); } catch (e) {}
    }
  }
  const home = os.homedir();
  add('Descargas', path.join(home, 'Downloads'), false);
  add('Documentos', path.join(home, 'Documents'), false);
  add('Escritorio', path.join(home, 'Desktop'), false);
  add('Descargas de MiVibra', D.roms, false);
  return out;
}

function listDir(p) {
  const out = [];
  let names = [];
  try { names = fs.readdirSync(p, { withFileTypes: true }); } catch (e) { return out; }
  names = names.filter((d) => !d.name.startsWith('.') && !/^(\$RECYCLE\.BIN|System Volume Information)$/i.test(d.name));
  names.sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.toLowerCase().localeCompare(b.name.toLowerCase()) : a.isDirectory() ? -1 : 1));
  for (const d of names.slice(0, 2000)) {
    const fp = path.join(p, d.name);
    let size = 0; if (!d.isDirectory()) { try { size = fs.statSync(fp).size; } catch (e) {} }
    out.push({ name: d.name, path: fp, dir: d.isDirectory(), size });
  }
  return out;
}

const SKIP = /^(\$RECYCLE\.BIN|System Volume Information|Windows|Program Files|Program Files \(x86\)|ProgramData|AppData|node_modules|\$WinREAgent|Recovery|PerfLogs)$/i;

/** Busca ROMs (hasta 6 niveles) sin bloquear la ventana. */
async function scan(rootsList, exts, limit = 8000) {
  const out = [], all = exts.has('*');
  let n = 0, visited = 0;
  const walk = async (dir, depth) => {
    if (depth > 6 || n >= limit) return;
    let ents; try { ents = await fs.promises.readdir(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const d of ents) {
      if (n >= limit) return;
      if (d.name.startsWith('.')) continue;
      const fp = path.join(dir, d.name);
      if (d.isDirectory()) { if (!SKIP.test(d.name)) await walk(fp, depth + 1); continue; }
      const ext = (d.name.includes('.') ? d.name.split('.').pop() : '').toLowerCase();
      if ((exts.has(ext) || (all && ext !== 'part'))) {
        let size = 0; try { size = (await fs.promises.stat(fp)).size; } catch (e) {}
        out.push({ name: d.name, path: fp, size, ext }); n++;
      }
      if (++visited % 500 === 0) await new Promise((r) => setImmediate(r));
    }
  };
  for (const r of rootsList) await walk(r, 0);
  return out;
}

async function zipExts(p) {
  try {
    const e = (await arc.list(p)).filter((x) => !x.name.includes('__MACOSX')).sort((a, b) => b.size - a.size).slice(0, 8);
    return e.map((x) => (x.name.includes('.') ? x.name.split('.').pop() : '').toLowerCase());
  } catch (e) { return []; }
}

function hashDir(p) {
  let st = { size: 0, mtimeMs: 0 }; try { st = fs.statSync(p); } catch (e) {}
  return crypto.createHash('md5').update(p + st.size + st.mtimeMs).digest('hex').slice(0, 12);
}
function freeSpace(dir) { try { const s = fs.statfsSync(dir); return s.bavail * s.bsize; } catch (e) { return Infinity; } }
function rmrf(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) {} }
const ext = (n) => (n.includes('.') ? n.split('.').pop() : '').toLowerCase();

/** Saca la ROM del comprimido (una vez) y devuelve la ruta del archivo a jugar. */
async function unzipRom(p, exts, onPct = () => {}, baseDir = D.unzip, keep = 6) {
  fs.mkdirSync(baseDir, { recursive: true });
  const dir = path.join(baseDir, hashDir(p));
  const all = (await arc.list(p)).filter((e) => !e.name.includes('__MACOSX'));
  const main = all.filter((e) => exts.includes(ext(e.name))).sort((a, b) => b.size - a.size)[0];
  if (!main) return nested(p, all, exts, onPct, baseDir, keep);
  const target = path.join(dir, path.basename(main.name));
  try { if (fs.statSync(target).size === main.size) { fs.utimesSync(dir, new Date(), new Date()); return target; } } catch (e) {}
  rmrf(dir); fs.mkdirSync(dir, { recursive: true });
  const parent = path.posix.dirname(main.name);
  const need = all.filter((e) => e === main || (path.posix.dirname(e.name) === parent && ['bin', 'img', 'sub', 'ccd', 'iso', 'cue', 'm3u'].includes(ext(e.name)))).map((e) => e.name);
  const total = all.filter((e) => need.includes(e.name)).reduce((s, e) => s + Math.max(0, e.size), 0);
  if (total > freeSpace(baseDir) - 100 * 1048576) throw new Error('No hay espacio para descomprimir el juego');
  try { await arc.extract(p, need, dir, onPct); } catch (e) { rmrf(dir); throw e; }
  if (!exists(target)) throw new Error('No se encontró el juego dentro del comprimido');
  // Deja solo los más recientes
  try {
    const dirs = fs.readdirSync(baseDir).map((n) => path.join(baseDir, n)).filter((x) => x !== dir && fs.statSync(x).isDirectory() && !path.basename(x).startsWith('partes_'))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    dirs.slice(keep - 1).forEach(rmrf);
  } catch (e) {}
  return target;
}

/** Comprimido dentro de comprimido (por ejemplo un .rar en partes dentro de un .zip). */
async function nested(p, all, exts, onPct, baseDir, keep) {
  const low = (e) => e.name.toLowerCase();
  const first = /(\.part0*1\.rar|\.rar|\.zip|\.7z)$/;
  const inner = all.filter((e) => first.test(low(e)) && !/\.part(?!0*1\.)\d+\.rar$/.test(low(e))).sort((a, b) => a.name.length - b.name.length)[0];
  if (!inner) throw new Error(all.some((e) => /\.r\d\d$/.test(low(e))) ? 'Falta la primera parte (.rar) del juego' : 'El comprimido no trae un juego de esta consola');
  const tmp = path.join(baseDir, 'partes_' + hashDir(p));
  const dirOf = (n) => path.posix.dirname(n);
  const parts = all.filter((e) => dirOf(e.name) === dirOf(inner.name) && /\.(rar|r\d\d|zip|7z|z\d\d|\d{3})$/.test(low(e))).map((e) => e.name);
  const innerFile = path.join(tmp, path.basename(inner.name));
  if (!exists(innerFile)) {
    rmrf(tmp); fs.mkdirSync(tmp, { recursive: true });
    await arc.extract(p, parts, tmp, (v) => onPct(Math.floor(v / 2)));
  }
  return unzipRom(innerFile, exts, (v) => onPct(50 + Math.floor(v / 2)), baseDir, keep);
}

// ---------------- BIOS ----------------
const BIOS_NAMES = new Set([
  'scph5500.bin', 'scph5501.bin', 'scph5502.bin', 'scph1001.bin', 'scph7001.bin', 'scph101.bin', 'psxonpsp660.bin',
  'lynxboot.img', 'bios_cd_u.bin', 'bios_cd_e.bin', 'bios_cd_j.bin', 'bios7.bin', 'bios9.bin', 'firmware.bin',
  'neogeo.zip', 'syscard3.pce', '7800 bios (u).rom', 'gba_bios.bin', 'gb_bios.bin', 'gbc_bios.bin',
  'dc_boot.bin', 'dc_flash.bin', 'sega_101.bin', 'mpr-17933.bin', 'saturn_bios.bin'
]);

async function importBios(rootsList) {
  const copied = [];
  const walk = async (dir, depth) => {
    if (depth > 5) return;
    let ents; try { ents = await fs.promises.readdir(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const d of ents) {
      if (d.name.startsWith('.')) continue;
      const fp = path.join(dir, d.name);
      if (d.isDirectory()) { if (!SKIP.test(d.name) && path.resolve(fp) !== path.resolve(D.system)) await walk(fp, depth + 1); continue; }
      if (BIOS_NAMES.has(d.name.toLowerCase())) {
        try { fs.copyFileSync(fp, path.join(D.system, d.name.toLowerCase())); copied.push(d.name); } catch (e) {}
      }
    }
  };
  for (const r of rootsList) await walk(r, 0);
  return copied;
}
function biosPath(name) { const f = path.join(D.system, name); return exists(f) ? f : null; }

// ---------------- Neo Geo ----------------
let NG = null;
function ngLoad() {
  if (NG) return NG;
  const o = JSON.parse(fs.readFileSync(D.neogeoJson, 'utf8'));
  NG = Object.keys(o).map((k) => {
    const g = o[k];
    return { name: k, title: String(g.t || '').split(' / ')[0].trim(), parent: g.p && g.p !== 'null' ? g.p : null, crcs: new Set((g.c || []).map((x) => parseInt(x, 16))), files: new Set(g.n || []) };
  });
  return NG;
}
async function entryNames(p) { try { return (await arc.list(p)).map((e) => e.name); } catch (e) { return []; } }
async function innerArchive(p) {
  try {
    const names = (await arc.list(p)).map((e) => e.name);
    const a = names.filter(arc.supported);
    const other = names.filter((n) => !a.includes(n) && !/\.(txt|nfo|url|htm|html|jpg|png|diz)$/i.test(n));
    return a.length === 1 && !other.length ? a[0] : null;
  } catch (e) { return null; }
}
async function identify(p) {
  if (!arc.supported(p)) return null;
  const base = path.parse(p).name.toLowerCase(), sets = ngLoad();
  const res = (s, how) => ({ set: s.name, title: s.title, parent: s.parent || '', how });
  let s = sets.find((x) => x.name === base); if (s) return res(s, 'name');
  const inner = await innerArchive(p);
  if (inner) { const ib = path.parse(inner).name.toLowerCase(); s = sets.find((x) => x.name === ib); if (s) return Object.assign(res(s, 'inner'), { inner }); }
  let entries; try { entries = await arc.list(p); } catch (e) { return null; }
  const have = new Set(entries.map((e) => e.crc).filter((x) => x != null));
  let best = null, bestScore = 0;
  if (have.size) for (const x of sets) {
    if (!x.crcs.size) continue;
    let hit = 0; for (const c of x.crcs) if (have.has(c)) hit++;
    if (!hit) continue;
    const sc = hit / x.crcs.size + hit * 1e-4; if (sc > bestScore) { bestScore = sc; best = x; }
  }
  if (best && bestScore >= 0.6) return res(best, 'crc');
  const names = new Set(entries.map((e) => path.posix.basename(e.name).toLowerCase()));
  let bn = null, bnScore = 0;
  for (const x of sets) {
    if (!x.files.size) continue;
    let hit = 0; for (const f of x.files) if (names.has(f)) hit++;
    if (!hit) continue;
    const sc = hit / x.files.size + hit * 1e-4; if (sc > bnScore) { bnScore = sc; bn = x; }
  }
  if (bn && bnScore >= 0.5) return res(bn, 'names');
  const cnt = {}; for (const n of names) { const m = /^(\d{3})-/.exec(n); if (m) cnt[m[1]] = (cnt[m[1]] || 0) + 1; }
  const ngh = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
  if (ngh) {
    const fam = sets.filter((x) => { let h = 0; for (const f of x.files) if (f.startsWith(ngh + '-')) h++; return h * 2 >= x.files.size && x.files.size; });
    const f = fam.find((x) => !x.parent) || fam[0]; if (f) return res(f, 'ngh');
  }
  if (best && bestScore >= 0.3) return res(best, 'crc-low');
  return null;
}
/** Deja el juego con su nombre corto (kof98.zip) y la BIOS neogeo.zip al lado. */
async function arcadePrepare(p, set) {
  let src = p;
  const own = path.resolve(p).toLowerCase().startsWith(path.resolve(D.roms).toLowerCase());
  const outDir = own ? path.dirname(p) : D.arcade;
  const inner = await innerArchive(p);
  if (inner) {
    const name = set ? set + path.extname(inner).toLowerCase() : path.basename(inner);
    const target = path.join(outDir, name);
    if (!exists(target)) {
      await arc.extract(p, [inner], outDir);
      const f = path.join(outDir, path.basename(inner)); if (f !== target && exists(f)) fs.renameSync(f, target);
    }
    if (own && exists(target)) try { fs.unlinkSync(src); } catch (e) {}
    src = target;
  }
  let game = src;
  if (set && path.parse(src).name.toLowerCase() !== set) {
    const target = path.join(outDir, set + path.extname(src).toLowerCase());
    if (own && !exists(target)) { try { fs.renameSync(src, target); game = target; } catch (e) { fs.copyFileSync(src, target); game = target; } }
    else { if (!exists(target) || fs.statSync(target).size !== fs.statSync(src).size) fs.copyFileSync(src, target); game = target; }
  }
  const bios = path.join(path.dirname(game), 'neogeo.zip');
  if (!exists(bios)) { const from = [path.join(D.system, 'neogeo.zip'), path.join(D.roms, '_bios', 'neogeo.zip')].find(exists); if (from) try { fs.copyFileSync(from, bios); } catch (e) {} }
  return { path: game, bios: exists(bios), renamed: path.resolve(game) !== path.resolve(p) };
}

module.exports = { init, roots, listDir, scan, zipExts, unzipRom, importBios, biosPath, identify, arcadePrepare, entryNames, exists, BIOS_NAMES };
