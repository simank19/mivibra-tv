// Descarga EmulatorJS y solo los núcleos que usa MiVibra (desde npm) a build/ejs, para incluirlos en el instalador.
// Así los juegos funcionan sin depender de internet ni de servidores externos.
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const VER = '4.2.3';
const CORES = ['fceumm', 'snes9x', 'gambatte', 'mgba', 'mupen64plus_next', 'melonds', 'genesis_plus_gx', 'pcsx_rearmed', 'stella2014',
  'prosystem', 'handy', 'mednafen_pce', 'mednafen_ngp', 'mednafen_wswan', 'fbneo', 'ppsspp', 'prboom'];
const THREADED = ['ppsspp'];
const out = path.join(__dirname, '..', 'build', 'ejs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ejs-'));

function pack(name) {
  const file = execSync(`npm pack ${name}@${VER} --silent --pack-destination "${tmp}"`, { encoding: 'utf8' }).trim().split(/\r?\n/).pop();
  const dir = path.join(tmp, path.basename(file, '.tgz'));
  fs.mkdirSync(dir, { recursive: true });
  execSync(`tar -xzf "${path.join(tmp, file)}" -C "${dir}"`);
  return path.join(dir, 'package');
}
function copyDir(a, b) { fs.cpSync(a, b, { recursive: true }); }

fs.rmSync(out, { recursive: true, force: true });
const base = pack('@emulatorjs/emulatorjs');
copyDir(path.join(base, 'data'), out);
fs.mkdirSync(path.join(out, 'cores', 'reports'), { recursive: true });
for (const c of CORES) {
  const p = pack('@emulatorjs/core-' + c);
  // Normal (WebGL2) y "legacy" (PCs con tarjeta de video vieja); con hilos solo los que lo necesitan
  const want = [c + '-wasm.data', c + '-legacy-wasm.data'].concat(THREADED.includes(c) ? [c + '-thread-wasm.data', c + '-thread-legacy-wasm.data'] : []);
  for (const f of want) if (fs.existsSync(path.join(p, f))) fs.copyFileSync(path.join(p, f), path.join(out, 'cores', f));
  const rep = path.join(p, 'reports', c + '.json');
  if (fs.existsSync(rep)) fs.copyFileSync(rep, path.join(out, 'cores', 'reports', c + '.json'));
  console.log('núcleo', c, 'listo');
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('EmulatorJS en', out);
