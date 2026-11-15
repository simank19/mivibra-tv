// Enlaces públicos de MEGA (carpetas y archivos compartidos). La clave viene en el enlace que compartió el dueño:
// con ella se leen los nombres y se descifra el archivo, igual que la web de MEGA. Libro de carpeta: mega:CARPETA:NODO:CLAVE
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

const API = 'https://g.api.mega.co.nz/cs';
let seq = Math.floor(Math.random() * 1e9);
const b64 = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/').replace(/,/g, ''), 'base64');
const b64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function api(body, folder) {
  for (let tries = 0; ; tries++) {
    const r = await fetch(API + '?id=' + (seq++) + (folder ? '&n=' + folder : ''), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    const v = Array.isArray(j) ? j[0] : j;
    if (v === -3 && tries < 4) { await new Promise((ok) => setTimeout(ok, 800 * (tries + 1))); continue; }
    if (typeof v === 'number' && v < 0) throw new Error(v === -9 ? 'El enlace de MEGA no existe o fue borrado' : v === -11 || v === -16 ? 'MEGA bloqueó el acceso a ese enlace' : v === -17 ? 'Se superó el límite de descargas de MEGA, intenta más tarde' : 'MEGA respondió con error ' + v);
    return v;
  }
}
const ecb = (key, data) => { const d = crypto.createDecipheriv('aes-128-ecb', key, null); d.setAutoPadding(false); return Buffer.concat([d.update(data), d.final()]); };
const aesKey = (k) => (k.length >= 32 ? Buffer.from(k.subarray(0, 16).map((x, i) => x ^ k[i + 16])) : k.subarray(0, 16));
function attrs(a, k) {
  try {
    const d = crypto.createDecipheriv('aes-128-cbc', aesKey(k), Buffer.alloc(16)); d.setAutoPadding(false);
    const s = Buffer.concat([d.update(b64(a)), d.final()]).toString('utf8').replace(/\0+$/, '');
    return s.startsWith('MEGA{') ? JSON.parse(s.slice(4, s.lastIndexOf('}') + 1)) : null;
  } catch (e) { return null; }
}
function parse(u) {
  let m = String(u).match(/mega(?:\.co)?\.nz\/(folder|file)\/([\w-]+)#([\w-]+)/);
  if (m) return { folder: m[1] === 'folder', id: m[2], key: m[3] };
  m = String(u).match(/mega(?:\.co)?\.nz\/#(F?)!([\w-]+)!([\w-]+)/);
  return m ? { folder: m[1] === 'F', id: m[2], key: m[3] } : null;
}

async function list(link) {
  const l = parse(link); if (!l) throw new Error('No es un enlace de MEGA');
  if (!l.folder) {
    const r = await api([{ a: 'g', p: l.id }]);
    const at = attrs(r.at, b64(l.key));
    return [{ name: (at && at.n) || 'Libro', size: r.s, url: link, path: '' }];
  }
  const master = b64(l.key);
  const r = await api([{ a: 'f', c: 1, ca: 1, r: 1 }], l.id);
  const names = {}, parent = {}, files = [];
  for (const n of r.f || []) {
    const kk = String(n.k || '').split('/')[0].split(':')[1]; if (!kk) continue;
    let key; try { key = ecb(master, b64(kk)); } catch (e) { continue; }
    const at = attrs(n.a, key); if (!at) continue;
    names[n.h] = at.n; parent[n.h] = n.p;
    if (n.t === 0) files.push({ n, key, name: at.n });
  }
  return files.map(({ n, key, name }) => {
    const p = []; let q = parent[n.h], g = 0;
    while (q && names[q] && parent[q] && names[parent[q]] && g++ < 10) { p.unshift(names[q]); q = parent[q]; }
    return { name, size: n.s, url: 'mega:' + l.id + ':' + n.h + ':' + b64url(key), path: p.join(' / ') };
  });
}

async function download(src, dest, onPct) {
  let key, r;
  if (src.startsWith('mega:')) { const p = src.split(':'); key = b64(p[3]); r = await api([{ a: 'g', g: 1, ssl: 1, n: p[2] }], p[1]); }
  else { const l = parse(src); if (!l || l.folder) throw new Error('Enlace de MEGA no válido'); key = b64(l.key); r = await api([{ a: 'g', g: 1, ssl: 1, p: l.id }]); }
  if (!r.g) throw new Error('MEGA no dio el archivo');
  const iv = Buffer.alloc(16); key.copy(iv, 0, 16, 24);
  const dec = crypto.createDecipheriv('aes-128-ctr', aesKey(key), iv);
  const tmp = dest + '.part';
  await new Promise((ok, fail) => {
    https.get(r.g, (res) => {
      if (res.statusCode >= 400) return fail(new Error('MEGA respondió con error ' + res.statusCode));
      let done = 0, last = -1; const out = fs.createWriteStream(tmp);
      res.on('data', (c) => { done += c.length; const pct = r.s ? Math.floor(done * 100 / r.s) : -1; if (pct !== last) { last = pct; if (onPct) onPct(pct); } });
      res.pipe(dec).pipe(out);
      out.on('finish', ok); out.on('error', fail); res.on('error', fail);
    }).on('error', fail);
  });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try { fs.unlinkSync(dest); } catch (e) {}
  fs.renameSync(tmp, dest);
}

module.exports = { parse, list, download };
