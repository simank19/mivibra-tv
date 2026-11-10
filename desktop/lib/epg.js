// Guía XMLTV (también .gz): igual que Epg.kt, solo la programación cercana en JSON compacto.
'use strict';
const sax = require('sax');
const zlib = require('zlib');
const { PassThrough } = require('stream');

function time(s) {
  if (!s) return 0;
  const t = String(s).trim();
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/.exec(t);
  if (!m) return 0;
  let ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  if (m[7]) { const sign = m[7][0] === '-' ? -1 : 1; ms -= sign * ((+m[7].slice(1, 3)) * 60 + (+m[7].slice(3, 5))) * 60000; }
  return ms;
}

/** stream: respuesta HTTP (ya sin gzip de cabecera). Detecta .gz por firma. */
function parse(stream, wanted, hoursAhead) {
  return new Promise((resolve, reject) => {
    const now = Date.now(), from = now - 3 * 3600e3, to = now + (hoursAhead > 0 ? hoursAhead : 36) * 3600e3;
    const channels = {}, progs = {};
    let count = 0;
    let chId = null, chName = null, chIcon = null, prCh = null, prStart = 0, prStop = 0, prTitle = null, prDesc = null, keep = false, field = null;
    const p = sax.createStream(false, { lowercase: true, trim: false });
    p.on('error', function () { this._parser.error = null; this._parser.resume(); });
    p.on('opentag', (n) => {
      const a = n.attributes || {};
      switch (n.name) {
        case 'channel': chId = a.id; chName = null; chIcon = null; break;
        case 'display-name': field = chId != null && prCh == null && chName == null ? 'cname' : null; break;
        case 'icon': if (chId != null && prCh == null) chIcon = a.src; break;
        case 'programme': {
          prCh = a.channel; const k = prCh ? prCh.toLowerCase() : null;
          prStart = time(a.start); prStop = time(a.stop);
          keep = k != null && prStop > from && prStart < to && (!wanted.size || wanted.has(k)) && count < 200000;
          prTitle = null; prDesc = null; break;
        }
        case 'title': field = keep && prTitle == null ? 'title' : null; break;
        case 'desc': field = keep && prDesc == null ? 'desc' : null; break;
        default: field = null;
      }
    });
    const onText = (t) => {
      if (field === 'cname') chName = (chName || '') + t;
      else if (field === 'title') prTitle = (prTitle || '') + t;
      else if (field === 'desc') prDesc = (prDesc || '') + t;
    };
    p.on('text', onText); p.on('cdata', onText);
    p.on('closetag', (name) => {
      if (name === 'channel') {
        if (chId != null && (!wanted.size || wanted.has(chId.toLowerCase()))) channels[chId] = { n: (chName || chId).trim(), i: chIcon || '' };
        chId = null;
      } else if (name === 'programme') {
        if (keep && prCh != null) {
          const o = { s: prStart, e: prStop, t: (prTitle || '').trim() };
          const d = (prDesc || '').trim(); if (d) o.d = d.length > 400 ? d.slice(0, 400) + '…' : d;
          (progs[prCh] = progs[prCh] || []).push(o); count++;
        }
        prCh = null; keep = false;
      }
      field = null;
    });
    p.on('end', () => resolve({ channels, progs, count }));
    // gzip por firma
    let first = true; const pass = new PassThrough();
    stream.on('data', (c) => {
      if (first) {
        first = false;
        if (c[0] === 0x1f && c[1] === 0x8b) { const gz = zlib.createGunzip(); gz.on('error', reject); pass.pipe(gz).pipe(p); }
        else pass.pipe(p);
      }
      pass.write(c);
    });
    stream.on('end', () => { if (first) return resolve({ channels, progs, count }); pass.end(); });
    stream.on('error', reject);
  });
}

module.exports = { parse };
