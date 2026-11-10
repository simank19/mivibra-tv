// Servidor local de la app (http://localhost:PUERTO): sirve la interfaz, las páginas propias de PC,
// los archivos del equipo (ROMs, videos) y lo descargado. Con un origen http fijo funcionan YouTube,
// Firebase y el almacenamiento local igual que en un navegador.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8', '.m3u': 'text/plain; charset=utf-8', '.m3u8': 'application/vnd.apple.mpegurl',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf'
};

function sendFile(req, res, file, extraHeaders = {}) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('No encontrado'); return; }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const h = Object.assign({ 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' }, extraHeaders);
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      let start = range[1] ? +range[1] : 0, end = range[2] ? +range[2] : st.size - 1;
      if (!range[1] && range[2]) { start = Math.max(0, st.size - +range[2]); end = st.size - 1; }
      if (start >= st.size) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); res.end(); return; }
      end = Math.min(end, st.size - 1);
      res.writeHead(206, Object.assign(h, { 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 }));
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, Object.assign(h, { 'Content-Length': st.size }));
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

/**
 * dirs: { www, pc, net, sounds } · extra(req, res, url) para rutas propias (devuelve true si respondió).
 */
function start(port, dirs, extra) {
  const server = http.createServer((req, res) => {
    let u;
    try { u = new URL(req.url, 'http://localhost'); } catch (e) { res.writeHead(400); return res.end(); }
    // Solo desde este equipo
    const ra = req.socket.remoteAddress || '';
    if (!/^(::1|127\.|::ffff:127\.)/.test(ra)) { res.writeHead(403); return res.end(); }
    if (extra && extra(req, res, u)) return;
    const p = decodeURIComponent(u.pathname);
    if (p.startsWith('/rom/')) {
      // /rom/<ruta en base64url>/<nombre>: el emulador toma el nombre del archivo de la última parte (kof98.zip)
      const seg = p.split('/')[2] || '';
      let f = ''; try { f = Buffer.from(seg, 'base64url').toString('utf8'); } catch (e) {}
      return sendFile(req, res, f);
    }
    if (p === '/local') {
      // Archivos del equipo (ROMs, videos locales): /local?p=C:\ruta\archivo
      const f = u.searchParams.get('p') || '';
      return sendFile(req, res, f);
    }
    const route = (prefix, dir) => {
      const rel = p.slice(prefix.length);
      const f = path.normalize(path.join(dir, rel));
      if (!f.startsWith(path.normalize(dir))) { res.writeHead(403); res.end(); return true; }
      sendFile(req, res, f, prefix === '/pc/' && /game\.html$/.test(f) ? { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' } : {});
      return true;
    };
    if (p.startsWith('/net/')) return route('/net/', dirs.net);
    if (p.startsWith('/pc/')) return route('/pc/', dirs.pc);
    if (p === '/' ) { res.writeHead(302, { Location: '/index.html' }); return res.end(); }
    route('/', dirs.www);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve(server));   // IPv4 e IPv6 (localhost); solo se aceptan conexiones de este equipo
  });
}

module.exports = { start, sendFile, MIME };
