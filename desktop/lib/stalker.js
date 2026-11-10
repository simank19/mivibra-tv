// Portales Stalker / Ministra (Portal y MAC): el enlace de cada canal se pide al reproducir (igual que Stalker.kt).
'use strict';
const net = require('./net');

const UA = 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3';
const tokens = new Map();
const enc = encodeURIComponent;

function headers(api, mac, token) {
  const h = {
    'User-Agent': UA,
    'X-User-Agent': 'Model: MAG250; Link: WiFi',
    'Cookie': 'mac=' + enc(mac) + '; stb_lang=es; timezone=America%2FBogota',
    'Referer': api.replace(/(server\/load|portal)\.php.*$/, '')
  };
  if (token) h.Authorization = 'Bearer ' + token;
  return h;
}
function js(txt) { try { return JSON.parse(txt).js; } catch (e) { return null; } }

async function token(api, mac, force) {
  const k = api + '|' + mac, t = tokens.get(k);
  if (!force && t && t.exp > Date.now()) return t.tok;
  const hs = await net.text(api + '?type=stb&action=handshake&token=&prehash=0&JsHttpRequest=1-xml', headers(api, mac));
  const tok = ((js(hs.text) || {}).token) || '';
  if (!tok) throw new Error('El portal no aceptó la conexión');
  const ts = Math.floor(Date.now() / 1000);
  try {
    await net.text(api + '?type=stb&action=get_profile&hd=1&num_banks=2&stb_type=MAG250&client_type=STB&image_version=218&video_out=hdmi&auth_second_step=1&hw_version=1.7-BD-00&not_valid_token=0&timestamp=' + ts + '&api_signature=262&prehash=0&JsHttpRequest=1-xml', headers(api, mac, tok));
  } catch (e) {}
  tokens.set(k, { tok, exp: Date.now() + 20 * 60000 });
  return tok;
}

async function linkWith(stk, mac) {
  const api = stk.api, type = stk.t === 'itv' ? 'itv' : 'vod', series = +stk.series || 0;
  let last = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const tok = await token(api, mac, attempt > 0);
      const url = api + '?type=' + type + '&action=create_link&cmd=' + enc(stk.cmd || '') + '&series=' + (series > 0 ? series : '') +
        '&forced_storage=undefined&disable_ad=0&download=0&JsHttpRequest=1-xml';
      const r = await net.text(url, headers(api, mac, tok));
      const o = js(r.text);
      let out = String((o && o.cmd) || '').trim();
      if (!out) { last = new Error(/uthoriz/.test(r.text) ? 'El portal rechazó la MAC' : 'El portal no dio el enlace'); continue; }
      out = out.replace(/^(ffmpeg|ffrt\d?|auto)\s+/i, '').trim();
      if (/^(http|rtmp|udp)/i.test(out)) return out;
      last = new Error('Enlace no válido del portal');
    } catch (e) { last = e; }
  }
  throw last || new Error('No se pudo obtener el enlace');
}

/** stk: {api, mac, macs?, t, cmd, series?}. Prueba la MAC principal y las de respaldo. */
async function link(stk) {
  const macs = [stk.mac].concat((stk.macs || []).filter((m) => m && m !== stk.mac)).slice(0, 8);
  let last = null;
  for (const m of macs) {
    try { const u = await linkWith(stk, m); stk.mac = m; return u; } catch (e) { last = e; }
  }
  throw last || new Error('No se pudo obtener el enlace');
}

module.exports = { UA, link };
