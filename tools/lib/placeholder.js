'use strict';
// Dependency-free PNG writer used to give every new app a coloured placeholder icon + splash.
const zlib = require('zlib');
const crypto = require('crypto');
const { writeText, ensureDir } = require('./util');
const fs = require('fs');
const path = require('path');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(w, h, pixel) {
  const row = w * 3 + 1;
  const raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) {
    raw[y * row] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(x, y);
      const o = y * row + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** Disc + ring on a solid background. `scale` keeps the artwork inside the adaptive-icon safe zone. */
function artwork(size, bg, fg, scale) {
  const cx = size / 2, cy = size / 2;
  const rOuter = size * scale, rInner = rOuter * 0.55;
  return (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    if (d <= rInner) return bg;
    if (d <= rOuter) return fg;
    return bg;
  };
}

/** Writes assets/icon.png (1024) and assets/splash.png (2732) into `dir`, colour derived from `seed`. */
function createPlaceholderAssets(dir, seed) {
  ensureDir(dir);
  const hue = parseInt(crypto.createHash('md5').update(seed).digest('hex').slice(0, 4), 16) % 360;
  const bg = hslToRgb(hue, 0.55, 0.42);
  const fg = [255, 255, 255];
  fs.writeFileSync(path.join(dir, 'icon.png'), png(1024, 1024, artwork(1024, bg, fg, 0.26)));
  fs.writeFileSync(path.join(dir, 'splash.png'), png(2732, 2732, artwork(2732, bg, fg, 0.09)));
  const hex = '#' + bg.map((v) => v.toString(16).padStart(2, '0')).join('');
  return hex;
}

module.exports = { createPlaceholderAssets, png };
