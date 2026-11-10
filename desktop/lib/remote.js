// Celular como mando, envío de ROMs/BIOS y de listas desde el celular (igual que RemoteServer.kt).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const { sendFile } = require('./server');

const PORT = 8765;

function localIp() {
  const nets = os.networkInterfaces();
  const cands = [];
  for (const name of Object.keys(nets)) for (const n of nets[name] || []) {
    if (n.family !== 'IPv4' || n.internal) continue;
    if (/^169\.254\./.test(n.address)) continue;
    // Se prefieren las redes de la casa (Wi-Fi / Ethernet) a las virtuales (VirtualBox, VPN…)
    const virt = /vbox|virtual|vmware|hyper-v|vethernet|docker|wsl|tailscale|zerotier|loopback/i.test(name);
    cands.push({ ip: n.address, score: (virt ? 0 : 10) + (/^192\.168\./.test(n.address) ? 3 : /^10\./.test(n.address) ? 2 : 1) });
  }
  cands.sort((a, b) => b.score - a.score);
  return cands.length ? cands[0].ip : null;
}

/**
 * hub: { www, romDir(), importBios(dir), romReceived(info), listReceived(obj), ocrFile(file) -> Promise<text>,
 *        clients(n, names), gameKey(slot,key,down), gameAxis(slot,stick,x,y), gameMenu(), navKey(key), text(v), mode() }
 */
function create(hub) {
  let server = null, wss = null;
  const pads = new Set();

  function json(res, code, o) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); }
  function readBody(req, max) {
    return new Promise((resolve, reject) => {
      const parts = []; let n = 0;
      req.on('data', (c) => { n += c.length; if (n > max) { reject(new Error('Muy grande')); req.destroy(); } else parts.push(c); });
      req.on('end', () => resolve(Buffer.concat(parts)));
      req.on('error', reject);
    });
  }
  function notify() {
    const open = Array.from(pads).filter((p) => p.ws.readyState === 1).sort((a, b) => a.slot - b.slot);
    hub.clients(open.length, open.map((p) => p.name));
  }
  function freeSlot() { const used = new Set(Array.from(pads).map((p) => p.slot)); let s = 0; while (used.has(s)) s++; return s; }

  // Clave de vinculación: va en el QR (?k=) o en la cabecera X-MV-Key
  function authed(req) {
    const u = new URL(req.url, 'http://x');
    const given = Buffer.from(String(u.searchParams.get('k') || req.headers['x-mv-key'] || ''));
    const want = Buffer.from(String(hub.key()));
    return given.length === want.length && require('crypto').timingSafeEqual(given, want);
  }
  async function handle(req, res) {
    const u = new URL(req.url, 'http://x');
    const p = u.pathname;
    if (p === '/auth') return authed(req) ? json(res, 200, { ok: true }) : json(res, 401, { ok: false, error: 'Clave incorrecta: escribe la clave que aparece en la pantalla' });
    if ((p.startsWith('/roms/') || p.startsWith('/listas/')) && !authed(req)) return json(res, 401, { ok: false, error: 'Clave incorrecta: escribe la clave que aparece en la pantalla' });
    try {
      if (p === '/roms/info') return json(res, 200, { free: (() => { try { const s = fs.statfsSync(hub.romDir()); return s.bavail * s.bsize; } catch (e) { return 0; } })(), dir: hub.romDir() });
      if (p === '/roms/upload' && req.method === 'POST') {
        const name = path.basename(u.searchParams.get('name') || '').trim();
        const sys = String(u.searchParams.get('sys') || '').toLowerCase();
        if (!name || name.startsWith('.')) return json(res, 400, { ok: false, error: 'Nombre no válido' });
        if (!/^[a-z0-9]{1,12}$/.test(sys)) return json(res, 400, { ok: false, error: 'Consola no válida' });
        const isBios = sys === 'bios';
        const dir = path.join(hub.romDir(), isBios ? '_bios' : sys); fs.mkdirSync(dir, { recursive: true });
        const target = path.join(dir, name), part = target + '.part';
        await new Promise((resolve, reject) => { const out = fs.createWriteStream(part); req.pipe(out); out.on('finish', resolve); out.on('error', reject); req.on('error', reject); });
        try { fs.unlinkSync(target); } catch (e) {}
        fs.renameSync(part, target);
        const bios = isBios ? (await hub.importBios(dir)).length : 0;
        hub.romReceived({ name, path: target, ext: (name.split('.').pop() || '').toLowerCase(), size: fs.statSync(target).size, sys, bios: isBios });
        return json(res, 200, { ok: true, bios });
      }
      if (p === '/listas/add' && req.method === 'POST') {
        const o = JSON.parse((await readBody(req, 512 * 1024)).toString('utf8'));
        const clean = {};
        for (const k of ['type', 'name', 'url', 'epg', 'host', 'user', 'pass', 'portal', 'mac']) if (o[k] != null) clean[k] = String(o[k]).slice(0, 2000);
        if (o.text != null) clean.text = String(o.text).slice(0, 200000);
        if (!['url', 'xtream', 'stalker', 'text'].includes(clean.type)) return json(res, 400, { ok: false, error: 'Tipo de lista no válido' });
        hub.listReceived(clean);
        return json(res, 200, { ok: true });
      }
      if (p === '/listas/image' && req.method === 'POST') {
        const buf = await readBody(req, 25 * 1048576);
        const f = path.join(os.tmpdir(), 'mivibra-lista-foto');
        fs.writeFileSync(f, buf);
        try {
          const text = await hub.ocrFile(f);
          if (!text.trim()) return json(res, 400, { ok: false, error: 'No encontré texto en la imagen' });
          hub.listReceived({ type: 'text', text });
          return json(res, 200, { ok: true, chars: text.length });
        } finally { try { fs.unlinkSync(f); } catch (e) {} }
      }
      const map = { '/': 'pad.html', '/index.html': 'pad.html', '/roms': 'roms.html', '/roms/': 'roms.html', '/listas': 'listas.html', '/listas/': 'listas.html', '/isotipo.svg': 'img/isotipo.svg', '/listas/isotipo.svg': 'img/isotipo.svg' };
      if (map[p]) return sendFile(req, res, path.join(hub.www, map[p]), { 'Cache-Control': 'no-store' });
      res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('No encontrado');
    } catch (e) {
      json(res, 400, { ok: false, error: e.message || 'Error' });
    }
  }

  function start() {
    if (server) return Promise.resolve();
    return new Promise((resolve, reject) => {
      server = http.createServer(handle);
      wss = new WebSocketServer({ server, verifyClient: (info) => authed(info.req) });
      wss.on('connection', (ws) => {
        const pad = { ws, slot: freeSlot(), name: '' };
        pad.name = 'Celular ' + (pad.slot + 1);
        pads.add(pad);
        try { ws.send(JSON.stringify({ t: 'hello', slot: pad.slot, mode: hub.mode() })); } catch (e) {}
        notify();
        ws.on('message', (data) => {
          let m; try { m = JSON.parse(String(data)); } catch (e) { return; }
          if (m.t === 'ping') { try { ws.send('{"t":"pong"}'); } catch (e) {} }
          else if (m.t === 'name') { pad.name = String(m.v || pad.name).slice(0, 24); notify(); }
          else if (m.t === 'k') {
            const key = String(m.c || ''), down = (m.d == null ? 1 : +m.d) === 1;
            if (hub.mode() === 'game') { if (key === 'BACK' || key === 'MENU') { if (down) hub.gameMenu(); } else hub.gameKey(pad.slot, key, down); }
            else if (down) hub.navKey(key);
          } else if (m.t === 'a') hub.gameAxis(pad.slot, m.s || 'l', +m.x || 0, +m.y || 0);
          else if (m.t === 'text') hub.text(String(m.v || ''));
        });
        ws.on('close', () => {
          pads.delete(pad);
          for (const k of ['A', 'B', 'X', 'Y', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'START', 'SELECT', 'L1', 'R1', 'L2', 'R2']) hub.gameKey(pad.slot, k, false);
          hub.gameAxis(pad.slot, 'l', 0, 0); hub.gameAxis(pad.slot, 'r', 0, 0);
          notify();
        });
      });
      server.once('error', (e) => { server = null; reject(e); });
      server.listen(PORT, '0.0.0.0', () => resolve());
    });
  }
  function broadcastMode() { const msg = JSON.stringify({ t: 'mode', mode: hub.mode() }); for (const p of pads) { try { p.ws.send(msg); } catch (e) {} } }
  function clientCount() { return Array.from(pads).filter((p) => p.ws.readyState === 1).length; }
  return { start, broadcastMode, clientCount, localIp, PORT };
}

module.exports = { create, localIp, PORT };
