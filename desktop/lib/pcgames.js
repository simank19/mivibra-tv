// Juegos instalados en el PC: Steam, Epic Games y GOG. Solo se leen los archivos que dejan esas tiendas;
// para jugar se le pide a la tienda que abra el juego (o se abre el .exe que GOG registró).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawn } = require('child_process');
const { shell } = require('electron');

const SKIP = /redistributable|steamworks|proton|steam linux runtime|steamvr|soundtrack|dedicated server|\bsdk\b|benchmark/i;
const exes = new Map();   // id -> .exe permitido (solo los que encontramos al buscar)

function read(f) { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return ''; } }
function reg(key, value) {
  if (process.platform !== 'win32') return '';
  try {
    const out = execFileSync('reg', ['query', key].concat(value ? ['/v', value] : ['/s']), { encoding: 'utf8', windowsHide: true, timeout: 6000 });
    return out;
  } catch (e) { return ''; }
}

function steamRoots() {
  const out = [];
  const r = reg('HKCU\\Software\\Valve\\Steam', 'SteamPath').match(/SteamPath\s+REG_SZ\s+(.+)/);
  if (r) out.push(r[1].trim());
  if (process.platform === 'win32') out.push('C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam');
  else out.push(path.join(os.homedir(), '.steam', 'steam'), path.join(os.homedir(), '.local', 'share', 'Steam'));
  return Array.from(new Set(out.map((p) => path.normalize(p)))).filter((p) => fs.existsSync(p));
}
function steam() {
  const libs = new Set();
  for (const root of steamRoots()) {
    libs.add(path.join(root, 'steamapps'));
    const vdf = read(path.join(root, 'steamapps', 'libraryfolders.vdf'));
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libs.add(path.join(m[1].replace(/\\\\/g, '\\'), 'steamapps'));
  }
  const games = [], seen = new Set();
  for (const lib of libs) {
    let files = [];
    try { files = fs.readdirSync(lib).filter((f) => /^appmanifest_\d+\.acf$/.test(f)); } catch (e) { continue; }
    for (const f of files) {
      const t = read(path.join(lib, f));
      const id = (t.match(/"appid"\s+"(\d+)"/) || [])[1], name = (t.match(/"name"\s+"([^"]+)"/) || [])[1];
      const flags = +((t.match(/"StateFlags"\s+"(\d+)"/) || [])[1] || 4);
      if (!id || !name || seen.has(id) || SKIP.test(name) || !(flags & 4)) continue;
      seen.add(id);
      const cdn = 'https://cdn.cloudflare.steamstatic.com/steam/apps/' + id + '/';
      games.push({ id: 'steam:' + id, name, src: 'Steam', img: cdn + 'library_600x900.jpg', alt: cdn + 'header.jpg', hero: cdn + 'library_hero.jpg', url: 'steam://rungameid/' + id });
    }
  }
  return games;
}
function epic() {
  const dir = process.platform === 'win32' ? path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests') : '';
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.item$/i.test(f)); } catch (e) { return []; }
  const games = [];
  for (const f of files) {
    let j; try { j = JSON.parse(read(path.join(dir, f))); } catch (e) { continue; }
    if (!j || j.bIsIncompleteInstall || !j.LaunchExecutable || !j.DisplayName) continue;
    if (Array.isArray(j.AppCategories) && j.AppCategories.length && j.AppCategories.indexOf('games') < 0) continue;
    if (j.MainGameAppName && j.MainGameAppName !== j.AppName) continue;   // DLC
    const key = encodeURIComponent(j.CatalogNamespace + ':' + j.CatalogItemId + ':' + j.AppName);
    games.push({ id: 'epic:' + j.AppName, name: j.DisplayName, src: 'Epic Games', url: 'com.epicgames.launcher://apps/' + key + '?action=launch&silent=true' });
  }
  return games;
}
function gog() {
  const out = reg('HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games') || reg('HKLM\\SOFTWARE\\GOG.com\\Games');
  if (!out) return [];
  const games = [];
  for (const block of out.split(/\r?\n(?=HKEY_)/)) {
    const v = (k) => ((block.match(new RegExp('\\s' + k + '\\s+REG_SZ\\s+(.+)')) || [])[1] || '').trim();
    const name = v('gameName') || v('GAMENAME'), exe = v('exe') || v('EXE'), id = v('gameID') || v('GAMEID');
    if (!name || !exe || !fs.existsSync(exe)) continue;
    const gid = 'gog:' + (id || name);
    exes.set(gid, exe);
    games.push({ id: gid, name, src: 'GOG', exe: true });
  }
  return games;
}

exports.list = function () {
  let all = [];
  for (const f of [steam, epic, gog]) { try { all = all.concat(f()); } catch (e) {} }
  return all.sort((a, b) => a.name.localeCompare(b.name));
};
exports.launch = function (g) {
  if (!g || !g.id) return false;
  if (exes.has(g.id)) {
    const exe = exes.get(g.id);
    try { spawn(exe, [], { cwd: path.dirname(exe), detached: true, stdio: 'ignore' }).unref(); return true; } catch (e) { return false; }
  }
  if (/^(steam:\/\/rungameid\/\d+|com\.epicgames\.launcher:\/\/apps\/[^\s]+)$/.test(g.url || '')) { shell.openExternal(g.url); return true; }
  return false;
};
