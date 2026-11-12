// Google Drive en el PC: usa el permiso que la cuenta MiVibra comparte desde la TV o el celular
// (se conecta allá con el código QR y aquí aparece solo). Lista la carpeta de juegos y baja el juego al jugarlo.
'use strict';
const fs = require('fs');
const path = require('path');
const { net } = require('electron');

const API = 'https://www.googleapis.com/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';
const SHORTCUT = 'application/vnd.google-apps.shortcut';
let DIR = '', state = { cid: '', csec: '', rt: '', at: '', atExp: 0 };

function file() { return path.join(DIR, 'drive.json'); }
function save() { try { fs.writeFileSync(file(), JSON.stringify(state)); } catch (e) {} }
function init(dataDir) {
  DIR = dataDir;
  try { state = Object.assign(state, JSON.parse(fs.readFileSync(file(), 'utf8'))); } catch (e) {}
}
function connected() { return !!state.rt; }
function setKeys(id, secret) { if (id && secret) { state.cid = String(id).trim(); state.csec = String(secret).trim(); save(); } }
function importRt(rt) { if (rt) { state.rt = String(rt).trim(); state.at = ''; state.atExp = 0; save(); } }
function exportRt() { return state.rt || ''; }
function disconnect() { state.rt = ''; state.at = ''; state.atExp = 0; save(); }
function cacheDir() { const d = path.join(DIR, 'drive-cache'); fs.mkdirSync(d, { recursive: true }); return d; }
function clearCache() { try { fs.rmSync(path.join(DIR, 'drive-cache'), { recursive: true, force: true }); } catch (e) {} }

async function access() {
  if (state.at && Date.now() < state.atExp) return state.at;
  if (!state.rt) throw new Error('Conecta Google Drive desde tu TV o celular con esta misma cuenta: aquí aparece solo');
  if (!state.cid || !state.csec) throw new Error('Faltan las claves de Google Drive de la app (las guarda el administrador)');
  const body = new URLSearchParams({ refresh_token: state.rt, client_id: state.cid, client_secret: state.csec, grant_type: 'refresh_token' });
  const r = await net.fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  const o = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (/invalid_grant|expired|revoked/i.test(o.error || '') ) { disconnect(); throw new Error('El permiso de Google Drive venció: vuelve a conectarlo desde la TV o el celular'); }
    throw new Error('Google: ' + (o.error_description || o.error || r.status));
  }
  state.at = o.access_token; state.atExp = Date.now() + (o.expires_in || 3000) * 1000 - 60000; save();
  return state.at;
}
async function get(url) {
  const t = await access();
  const r = await net.fetch(url, { headers: { Authorization: 'Bearer ' + t } });
  if (r.status === 401) { state.at = ''; state.atExp = 0; throw new Error('Google Drive pidió volver a entrar; intenta otra vez'); }
  if (!r.ok) { const o = await r.json().catch(() => ({})); throw new Error('Drive: ' + ((o.error && o.error.message) || r.status)); }
  return r;
}
async function listAll(query, fields) {
  const out = []; let page = '', n = 0;
  do {
    const u = API + '/files?pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true&q=' + encodeURIComponent(query) +
      '&fields=' + encodeURIComponent('nextPageToken,files(' + fields + ')') + (page ? '&pageToken=' + encodeURIComponent(page) : '');
    const o = await (await get(u)).json();
    out.push(...(o.files || [])); page = o.nextPageToken || '';
  } while (page && ++n < 50);
  return out;
}
async function folders(parent, search) {
  const kinds = `(mimeType='${FOLDER}' or mimeType='${SHORTCUT}') and trashed=false`;
  const q = search ? `${kinds} and name contains '${String(search).replace(/[\\']/g, '')}'` : parent === 'shared' ? `mimeType='${FOLDER}' and sharedWithMe=true and trashed=false` : `${kinds} and '${parent || 'root'}' in parents`;
  const seen = new Set(), res = [];
  for (const f of await listAll(q, 'id,name,mimeType,shortcutDetails')) {
    let id = f.id;
    if (f.mimeType === SHORTCUT) { const d = f.shortcutDetails || {}; if (d.targetMimeType !== FOLDER) continue; id = d.targetId; }
    if (!id || seen.has(id)) continue; seen.add(id); res.push({ id, name: f.name });
  }
  res.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  if (!parent && !search) res.push({ id: 'shared', name: 'Compartidos conmigo' });
  return res;
}
async function games(folder) {
  const out = [], seen = new Set();
  const walk = async (id, sub, depth) => {
    if (seen.has(id)) return; seen.add(id);
    const q = id === 'shared' ? 'sharedWithMe=true and trashed=false' : `'${id}' in parents and trashed=false`;
    for (const f of await listAll(q, 'id,name,size,mimeType,modifiedTime,shortcutDetails')) {
      if (f.mimeType === FOLDER) { if (depth < 4) await walk(f.id, sub + f.name + '/', depth + 1); }
      else if (f.mimeType === SHORTCUT) {
        const d = f.shortcutDetails || {}; if (!d.targetId) continue;
        if (d.targetMimeType === FOLDER) { if (depth < 4) await walk(d.targetId, sub + f.name + '/', depth + 1); }
        else if (!String(d.targetMimeType || '').startsWith('application/vnd.google-apps') && !seen.has(d.targetId)) { seen.add(d.targetId); out.push({ id: d.targetId, name: f.name, size: '0', sub }); }
      } else if (!String(f.mimeType).startsWith('application/vnd.google-apps') && !seen.has(f.id)) { seen.add(f.id); out.push(Object.assign(f, { sub })); }
    }
  };
  await walk(folder || 'root', '', 0);
  return out;
}
/** Baja el juego a la caché del PC (se borra al cerrar el juego). */
async function download(id, name, onPct) {
  const safe = String(name || id).replace(/[\\/:*?"<>|]/g, '_');
  const dest = path.join(cacheDir(), safe);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return dest;
  let r = await get(API + '/files/' + encodeURIComponent(id) + '?alt=media&supportsAllDrives=true&acknowledgeAbuse=true').catch((e) => { throw e; });
  const total = +r.headers.get('content-length') || 0;
  const tmp = dest + '.part'; const w = fs.createWriteStream(tmp); let got = 0, last = -1;
  const reader = r.body.getReader();
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    got += value.length; if (!w.write(Buffer.from(value))) await new Promise((res) => w.once('drain', res));
    const p = total ? Math.floor(got * 100 / total) : -1; if (p !== last) { last = p; onPct(p); }
  }
  await new Promise((res, rej) => w.end((e) => (e ? rej(e) : res())));
  fs.renameSync(tmp, dest);
  return dest;
}
module.exports = { init, connected, setKeys, importRt, exportRt, disconnect, folders, games, download, clearCache };
