// Descarga desde enlaces para compartir (Drive, MEGA, MediaFire, Dropbox, OneDrive, GitHub, pixeldrain…), igual que Fetch.kt en Android:
// si el enlace responde con una página (aviso de Drive, botón de MediaFire…) se sigue hasta el archivo, o se explica qué pasa.
'use strict';
const fs = require('fs');
const path = require('path');
const net = require('./net');
const mega = require('./mega');

function direct(u) {
  const d = u.match(/(?:drive|docs)\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([\w-]{10,})/) || u.match(/drive\.usercontent\.google\.com\/[^?]*\?(?:[^#]*&)?id=([\w-]{10,})/);
  if (d) return 'https://drive.usercontent.google.com/download?id=' + d[1] + '&export=download&confirm=t';
  if (/dropbox\.com\//.test(u)) { u = u.replace(/[?&]dl=0/, ''); return u + (u.includes('?') ? '&' : '?') + 'dl=1'; }
  let m = u.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/); if (m) return 'https://raw.githubusercontent.com/' + m[1] + '/' + m[2] + '/' + m[3];
  m = u.match(/pixeldrain\.com\/u\/([\w-]+)/); if (m) return 'https://pixeldrain.com/api/file/' + m[1] + '?download';
  if (/1drv\.ms\/|onedrive\.live\.com\//.test(u) && !/download=1/.test(u)) return u + (u.includes('?') ? '&' : '?') + 'download=1';
  return u;
}
function looksHtml(f) {
  try {
    if (fs.statSync(f).size > 2000000) return false;
    const b = Buffer.alloc(1024), fd = fs.openSync(f, 'r'), n = fs.readSync(fd, b, 0, 1024, 0); fs.closeSync(fd);
    return /<!doctype html|<html|<head/i.test(b.toString('latin1', 0, n));
  } catch (e) { return false; }
}
function driveForm(h) {
  const tag = (h.match(/<form[^>]*(?:download-form|downloadForm)[^>]*>/i) || [])[0];
  if (tag) {
    const act = ((tag.match(/action="([^"]+)"/) || [])[1] || '').replace(/&amp;/g, '&'); if (!act) return null;
    const q = (h.match(/<input[^>]*>/gi) || []).filter((t) => /hidden/i.test(t)).map((t) => { const n = (t.match(/name="([^"]+)"/) || [])[1]; const v = ((t.match(/value="([^"]*)"/) || [])[1] || '').replace(/&amp;/g, '&'); return n ? n + '=' + encodeURIComponent(v) : ''; }).filter(Boolean).join('&');
    return act + (act.includes('?') ? '&' : '?') + q;
  }
  const m = h.match(/href="(\/uc\?export=download[^"]+)"/); return m ? 'https://drive.google.com' + m[1].replace(/&amp;/g, '&') : null;
}
function mediafire(h) {
  if (!/mediafire/i.test(h)) return null;
  const s = h.match(/data-scrambled-url="([A-Za-z0-9+/=]+)"/); if (s) { const u = Buffer.from(s[1], 'base64').toString(); if (/^http/.test(u)) return u; }
  const m = h.match(/href="(https?:\/\/download\d*\.mediafire\.com\/[^"]+)"/); return m ? m[1] : null;
}
const EXT = 'zip|rar|7z|apk|exe|iso|chd|cue|bin|pbp|cso|gba|gbc|gb|nes|sfc|smc|n64|z64|v64|nds|md|gen|smd|sms|gg|pce|a26|lnx|ws|wsc|ngp|epub|pdf|cbz|cbr|cb7|html';
function fileLink(h, base) {
  const m = h.match(new RegExp('href="([^"#]+\\.(?:' + EXT + ')(?:\\?[^"]*)?)"', 'i')); if (!m) return null;
  try { return new URL(m[1].replace(/&amp;/g, '&'), base).toString(); } catch (e) { return null; }
}
function explain(h, url) {
  if (/google/.test(url) && /ServiceLogin|accounts\.google\.com|Iniciar sesión|Sign in/i.test(h)) return 'Google Drive pide iniciar sesión: comparte el archivo como «Cualquier persona con el enlace»';
  if (/quota|Too many users|demasiados usuarios|excedido/i.test(h)) return 'Google Drive bloqueó la descarga por hoy (demasiadas descargas de ese archivo). Prueba más tarde o súbelo a MEGA';
  if (/doesn.t exist|no existe|not found|404/i.test(h)) return 'El archivo ya no existe en ese enlace';
  return 'El enlace abre una página y no el archivo. Usa el enlace para compartir del archivo (Drive, MEGA, MediaFire o Dropbox) y que sea público';
}
/** Baja url a dest. allowHtml: una página .html sola también vale (juegos web). */
async function get(url, dest, { headers = {}, decompress = true, allowHtml = false, progress = () => {} } = {}) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (/drive\.google\.com\/(?:drive\/)?(?:u\/\d+\/)?folders\//.test(url)) throw new Error('Ese enlace es de una carpeta, no de un archivo: usa la opción de publicar carpeta');
  if (/^mega:/.test(url) || mega.parse(url)) { await mega.download(url, dest, progress); return; }
  let u = direct(url);
  for (let hop = 0; hop <= 3; hop++) {
    const code = await net.download(u, dest, headers, progress, decompress);
    if (code >= 400) { try { fs.unlinkSync(dest); } catch (e) {} throw new Error(code === 401 || code === 403 ? 'El archivo no está compartido como público (error ' + code + ')' : code === 404 ? 'El archivo ya no existe en ese enlace (404)' : 'Error ' + code + ' al descargar'); }
    if (!looksHtml(dest)) return;
    const h = fs.readFileSync(dest, 'utf8');
    const next = driveForm(h) || mediafire(h) || (allowHtml ? null : fileLink(h, u));
    if (!next && allowHtml && !/google/.test(u)) return;
    if (!next || next === u || hop === 3) { try { fs.unlinkSync(dest); } catch (e) {} throw new Error(explain(h, url)); }
    u = next;
  }
}
module.exports = { get, direct, looksHtml };
