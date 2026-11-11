// Red para la versión de PC: igual que Net.kt (descargas con cabeceras, gzip, redirecciones, progreso).
'use strict';
const http = require('http');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const fs = require('fs');
const { URL } = require('url');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/** Abre una URL siguiendo redirecciones. Devuelve la respuesta (stream) o lanza error. */
function open(url, headers = {}, timeout = 20000, method = 'GET', body = null, hops = 0) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch (e) { return reject(new Error('Dirección no válida')); }
    const lib = u.protocol === 'https:' ? https : http;
    const h = Object.assign({ 'User-Agent': UA, 'Accept': '*/*', 'Accept-Encoding': 'gzip, deflate' }, headers);
    for (const k of Object.keys(h)) if (h[k] == null || h[k] === '') delete h[k];
    if (body != null) h['Content-Length'] = Buffer.byteLength(body);
    const req = lib.request(u, { method, headers: h, timeout, rejectUnauthorized: false }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && hops < 8) {
        res.resume();
        const next = new URL(res.headers.location, u).toString();
        const m = res.statusCode === 303 ? 'GET' : method;
        return resolve(open(next, headers, timeout, m, m === 'GET' ? null : body, hops + 1));
      }
      resolve(res);
    });
    req.on('timeout', () => req.destroy(new Error('Tiempo de espera agotado')));
    req.on('error', reject);
    if (body != null) req.write(body);
    req.end();
  });
}

/** Cuerpo descomprimido (gzip/deflate por cabecera o por firma, como las listas .gz). */
function bodyStream(res) {
  const enc = String(res.headers['content-encoding'] || '').toLowerCase();
  if (enc.includes('gzip')) return res.pipe(zlib.createGunzip());
  if (enc.includes('deflate')) return res.pipe(zlib.createInflate());
  return res;
}

function readAll(stream) {
  return new Promise((resolve, reject) => {
    const parts = [];
    stream.on('data', (c) => parts.push(c));
    stream.on('end', () => resolve(Buffer.concat(parts)));
    stream.on('error', reject);
  });
}

function maybeGunzip(buf) {
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) { try { return zlib.gunzipSync(buf); } catch (e) {} }
  return buf;
}

async function text(url, headers = {}, timeout = 20000) {
  const res = await open(url, headers, timeout);
  const buf = maybeGunzip(await readAll(bodyStream(res)));
  return { status: res.statusCode, text: buf.toString('utf8') };
}

async function post(url, body, contentType, headers = {}) {
  const res = await open(url, Object.assign({ 'Content-Type': contentType || 'application/x-www-form-urlencoded' }, headers), 30000, 'POST', body);
  const buf = await readAll(bodyStream(res));
  return { status: res.statusCode, text: buf.toString('utf8') };
}

/** Descarga a un archivo con progreso (0-100, o -1 si no se sabe el tamaño). */
async function download(url, dest, headers = {}, onPct = null, decompress = true) {
  const res = await open(url, headers, 60000);
  if (res.statusCode >= 400) { res.resume(); return res.statusCode; }
  const total = +res.headers['content-length'] || 0;
  let done = 0, last = -2;
  const src = decompress ? bodyStream(res) : res;
  res.on('data', (c) => {
    done += c.length;
    const p = total ? Math.floor(done * 100 / total) : -1;
    if (onPct && p !== last) { last = p; onPct(p); }
  });
  // Nombre temporal único: si la misma lista se pide dos veces a la vez, cada descarga usa su propio archivo
  const tmp = dest + '.' + process.pid + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + '.part';
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmp);
    src.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    src.on('error', reject);
  });
  if (decompress) {
    // Listas .gz sin cabecera de compresión
    const fd = fs.openSync(tmp, 'r'); const b = Buffer.alloc(2); fs.readSync(fd, b, 0, 2, 0); fs.closeSync(fd);
    if (b[0] === 0x1f && b[1] === 0x8b) {
      await new Promise((resolve, reject) => {
        const gz = fs.createReadStream(tmp).pipe(zlib.createGunzip());
        const out = fs.createWriteStream(tmp + '2');
        gz.pipe(out); out.on('finish', resolve); gz.on('error', reject);
      });
      fs.renameSync(tmp + '2', tmp);
    }
  }
  try { fs.renameSync(tmp, dest); } catch (e) { try { fs.copyFileSync(tmp, dest); fs.unlinkSync(tmp); } catch (_) { if (!fs.existsSync(dest)) throw e; } }
  return res.statusCode;
}

module.exports = { UA, open, bodyStream, readAll, text, post, download, maybeGunzip };
