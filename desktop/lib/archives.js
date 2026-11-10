// Comprimidos (zip, 7z, rar, rar en partes) con 7-Zip, que viene dentro del instalador.
'use strict';
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let BIN = null;
function bin() {
  if (BIN) return BIN;
  const cands = [];
  if (process.resourcesPath) cands.push(path.join(process.resourcesPath, '7z', '7z.exe'));
  cands.push(path.join(__dirname, '..', 'build', '7z', '7z.exe'), 'C:\\Program Files\\7-Zip\\7z.exe');
  for (const c of cands) if (fs.existsSync(c)) return (BIN = c);
  for (const c of ['7z', '7za', '7zz']) { try { if (spawnSync(c, ['i'], { timeout: 4000 }).status === 0) return (BIN = c); } catch (e) {} }
  return (BIN = '7z');
}

function supported(name) { return /\.(zip|7z|rar)$/i.test(name); }

/** Entradas: [{name, size, crc}] (crc como número o null). */
function list(file) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin(), ['l', '-slt', '-ba', '-sccUTF-8', '--', file], { windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => reject(new Error('No se pudo abrir el comprimido (7-Zip): ' + e.message)));
    p.on('close', (code) => {
      const items = [];
      for (const block of out.split(/\r?\n\r?\n/)) {
        const g = (k) => { const m = new RegExp('^' + k + ' = (.*)$', 'm').exec(block); return m ? m[1].trim() : null; };
        const name = g('Path'); if (!name) continue;
        if (g('Folder') === '+' || /^D/.test(g('Attributes') || '')) continue;
        const crc = g('CRC');
        items.push({ name: name.replace(/\\/g, '/'), size: +(g('Size') || 0), crc: crc ? parseInt(crc, 16) : null });
      }
      if (!items.length && code !== 0) return reject(new Error((err || out).split(/\r?\n/).filter(Boolean).pop() || 'Comprimido dañado'));
      resolve(items);
    });
  });
}

/** Extrae solo los archivos pedidos (sin carpetas) en outDir. onPct(0-100). */
function extract(file, names, outDir, onPct) {
  fs.mkdirSync(outDir, { recursive: true });
  const lst = path.join(os.tmpdir(), 'mv7z-' + Date.now() + '.txt');
  fs.writeFileSync(lst, Array.from(names).map((n) => n.replace(/\//g, path.sep)).join('\n'), 'utf8');
  return new Promise((resolve, reject) => {
    const p = spawn(bin(), ['e', '-y', '-bsp1', '-bb0', '-sccUTF-8', '-o' + outDir, file, '@' + lst], { windowsHide: true });
    let err = '', last = -1;
    p.stdout.on('data', (d) => {
      const m = String(d).match(/(\d{1,3})%/g);
      if (m && onPct) { const v = parseInt(m[m.length - 1], 10); if (v !== last) { last = v; onPct(v); } }
    });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { try { fs.unlinkSync(lst); } catch (x) {} reject(e); });
    p.on('close', (code) => {
      try { fs.unlinkSync(lst); } catch (x) {}
      if (code > 1) return reject(new Error(err.split(/\r?\n/).filter(Boolean).pop() || 'No se pudo descomprimir'));
      resolve();
    });
  });
}

/** Descomprime todo conservando las carpetas (libros EPUB y cómics). */
function extractAll(file, outDir, onPct) {
  fs.mkdirSync(outDir, { recursive: true });
  return new Promise((resolve, reject) => {
    const p = spawn(bin(), ['x', '-y', '-bsp1', '-bb0', '-sccUTF-8', '-o' + outDir, file], { windowsHide: true });
    let err = '';
    p.stdout.on('data', (d) => { const m = String(d).match(/(\d{1,3})%/g); if (m && onPct) onPct(parseInt(m[m.length - 1], 10)); });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code > 1 ? reject(new Error(err.split(/\r?\n/).filter(Boolean).pop() || 'No se pudo abrir')) : resolve()));
  });
}

module.exports = { bin, supported, list, extract, extractAll };
