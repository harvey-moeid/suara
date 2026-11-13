// Dijalankan setelah `vite build` (lihat script "build" di package.json).
//   1. Membuat ikon PWA (PNG 192/512, purpose "any" dan "maskable") ke dist/icons.
//   2. Membuat dist/sw.js dari pwa/sw.template.js dengan daftar precache hasil build.
// Hanya memakai modul bawaan Node (tanpa dependensi tambahan).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, '..');
const distDir = resolve(webDir, process.argv[2] ?? 'dist');

function fail(msg) {
  console.error(`[pwa] GAGAL: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------- PNG

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// Dekode PNG 8-bit tanpa interlace: tipe warna 6 (RGBA) atau 3 (palet + tRNS). Hasil: RGBA.
function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('bukan PNG');
  let pos = 8;
  let w = 0;
  let h = 0;
  let depth = 0;
  let ctype = -1;
  let interlace = 0;
  let plte = null;
  let trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      ctype = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || (ctype !== 6 && ctype !== 3)) {
    throw new Error(`format PNG tidak didukung (depth=${depth}, tipe=${ctype}, interlace=${interlace})`);
  }
  const bpp = ctype === 6 ? 4 : 1;
  const stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length !== (stride + 1) * h) throw new Error('ukuran data PNG tidak sesuai');
  const px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= bpp ? px[dst + i - bpp] : 0;
      const b = y > 0 ? px[dst - stride + i] : 0;
      const c = i >= bpp && y > 0 ? px[dst - stride + i - bpp] : 0;
      let v;
      if (f === 0) v = x;
      else if (f === 1) v = x + a;
      else if (f === 2) v = x + b;
      else if (f === 3) v = x + ((a + b) >> 1);
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error(`filter PNG tidak dikenal: ${f}`);
      px[dst + i] = v & 0xff;
    }
  }
  if (ctype === 6) return { w, h, rgba: px };
  if (!plte) throw new Error('PLTE tidak ada');
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const idx = px[i];
    rgba[i * 4] = plte[idx * 3];
    rgba[i * 4 + 1] = plte[idx * 3 + 1];
    rgba[i * 4 + 2] = plte[idx * 3 + 2];
    rgba[i * 4 + 3] = trns && idx < trns.length ? trns[idx] : 255;
  }
  return { w, h, rgba };
}

// Enkode RGB 8-bit (ikon dibuat buram penuh, tanpa alpha).
function encodePngRgb(w, h, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const stride = w * 3;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 1; // filter Sub: memadatkan gradasi halus
    for (let i = 0; i < stride; i++) {
      const left = i >= 3 ? rgb[y * stride + i - 3] : 0;
      raw[y * (stride + 1) + 1 + i] = (rgb[y * stride + i] - left) & 0xff;
    }
  }
  return Buffer.concat([
    PNG_SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- Ikon

const BG = [0x08, 0x0d, 0x19]; // #080d19 (sama dengan theme-color dan background_color)
const GLOW = [0x24, 0x6b, 0xfd]; // #246bfd (warna brand)

// Kernel bikubik Catmull-Rom.
function cubic(t) {
  const a = Math.abs(t);
  if (a < 1) return 1.5 * a ** 3 - 2.5 * a ** 2 + 1;
  if (a < 2) return -0.5 * a ** 3 + 2.5 * a ** 2 - 4 * a + 2;
  return 0;
}

// Contoh piksel maskot pada koordinat (u, v) dalam ruang piksel sumber; hasil RGBA premultiplied (0..1).
function sampleMascot(src, u, v) {
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (let j = -1; j <= 2; j++) {
    const yy = y0 + j;
    if (yy < 0 || yy >= src.h) continue; // di luar gambar = transparan (bukan perpanjangan piksel tepi, yang membuat garis)
    const wy = cubic(v - yy);
    for (let i = -1; i <= 2; i++) {
      const xx = x0 + i;
      if (xx < 0 || xx >= src.w) continue;
      const wx = cubic(u - xx);
      const o = (yy * src.w + xx) * 4;
      const al = src.rgba[o + 3] / 255;
      const wgt = wx * wy;
      r += (src.rgba[o] / 255) * al * wgt;
      g += (src.rgba[o + 1] / 255) * al * wgt;
      b += (src.rgba[o + 2] / 255) * al * wgt;
      a += al * wgt;
    }
  }
  a = Math.min(1, Math.max(0, a));
  return [Math.min(a, Math.max(0, r)), Math.min(a, Math.max(0, g)), Math.min(a, Math.max(0, b)), a];
}

// size: sisi ikon (px). fraction: lebar maskot relatif terhadap ikon.
// Ikon "maskable" memakai fraction kecil agar maskot tetap di zona aman (lingkaran 80% di tengah).
function renderIcon(src, size, fraction) {
  const out = Buffer.alloc(size * size * 3);
  const side = size * fraction;
  const origin = (size - side) / 2;
  const scale = src.w / side;
  const cx = size / 2;
  const maxR = size * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Latar gelap dengan cahaya biru lembut di tengah.
      const d = Math.min(1, Math.hypot(x + 0.5 - cx, y + 0.5 - cx) / maxR);
      const glow = 0.4 * (1 - d) ** 2;
      let r = BG[0] * (1 - glow) + GLOW[0] * glow;
      let g = BG[1] * (1 - glow) + GLOW[1] * glow;
      let b = BG[2] * (1 - glow) + GLOW[2] * glow;
      const u = (x + 0.5 - origin) * scale - 0.5;
      const v = (y + 0.5 - origin) * scale - 0.5;
      if (u > -2 && v > -2 && u < src.w + 1 && v < src.h + 1) {
        const [pr, pg, pb, pa] = sampleMascot(src, u, v);
        r = pr * 255 + r * (1 - pa);
        g = pg * 255 + g * (1 - pa);
        b = pb * 255 + b * (1 - pa);
      }
      const o = (y * size + x) * 3;
      out[o] = Math.round(Math.min(255, Math.max(0, r)));
      out[o + 1] = Math.round(Math.min(255, Math.max(0, g)));
      out[o + 2] = Math.round(Math.min(255, Math.max(0, b)));
    }
  }
  return encodePngRgb(size, size, out);
}

function buildIcons() {
  const mascotPath = join(webDir, 'pwa', 'mascot.png.b64');
  if (!existsSync(mascotPath)) fail(`${relative(webDir, mascotPath)} tidak ditemukan`);
  const src = decodePng(Buffer.from(readFileSync(mascotPath, 'utf8').trim(), 'base64'));
  const dir = join(distDir, 'icons');
  mkdirSync(dir, { recursive: true });
  const specs = [
    ['icon-192.png', 192, 0.74],
    ['icon-512.png', 512, 0.74],
    ['maskable-192.png', 192, 0.56],
    ['maskable-512.png', 512, 0.56],
  ];
  for (const [name, size, fraction] of specs) {
    const png = renderIcon(src, size, fraction);
    writeFileSync(join(dir, name), png);
    console.log(`[pwa] icons/${name} ${size}x${size} (${(png.length / 1024).toFixed(1)} KB)`);
  }
}

// ---------------------------------------------------------------- Service worker

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

function buildServiceWorker() {
  if (!existsSync(join(distDir, 'index.html'))) fail('dist/index.html tidak ada (jalankan vite build lebih dulu)');
  const templatePath = join(webDir, 'pwa', 'sw.template.js');
  const offlinePath = join(webDir, 'pwa', 'offline.html');
  const template = readFileSync(templatePath, 'utf8');
  for (const ph of ['__VERSION__', '__PRECACHE__', '__OFFLINE_HTML__']) {
    if (template.split(ph).length !== 2) fail(`placeholder ${ph} harus muncul tepat sekali di sw.template.js`);
  }
  if (!existsSync(offlinePath)) fail('web/pwa/offline.html tidak ditemukan');
  const offlineHtml = readFileSync(offlinePath, 'utf8');

  const rel = (f) => relative(distDir, f).split(sep).join('/');
  const all = walk(distDir).map((f) => ({ file: f, path: rel(f) }));
  // Precache: cangkang aplikasi (index.html dilayani sebagai "/") dan semua aset ber-hash.
  const entries = all
    .filter((e) => e.path === 'index.html' || (e.path.startsWith('assets/') && !e.path.endsWith('.map')))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
  const assets = entries.filter((e) => e.path.startsWith('assets/'));
  if (assets.length === 0) fail('tidak ada berkas di dist/assets/, daftar precache kosong');

  const hash = createHash('sha256');
  for (const e of entries) {
    hash.update(e.path);
    hash.update('\0');
    hash.update(readFileSync(e.file));
    hash.update('\0');
  }
  hash.update(offlineHtml);
  hash.update(template);
  const version = hash.digest('hex').slice(0, 12);
  const urls = entries.map((e) => (e.path === 'index.html' ? '/' : `/${e.path}`));

  const sw = template
    .replace('__VERSION__', () => version)
    .replace('__PRECACHE__', () => JSON.stringify(urls, null, 2))
    .replace('__OFFLINE_HTML__', () => JSON.stringify(offlineHtml));
  writeFileSync(join(distDir, 'sw.js'), sw);
  console.log(`[pwa] sw.js versi ${version}, ${urls.length} berkas di-precache`);
}

// ---------------------------------------------------------------- Pemeriksaan akhir

function verifyOutput() {
  const manifestPath = join(distDir, 'manifest.webmanifest');
  if (!existsSync(manifestPath)) fail('dist/manifest.webmanifest tidak ada (cek web/public)');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const icon of manifest.icons ?? []) {
    const p = join(distDir, icon.src.replace(/^\//, ''));
    if (!existsSync(p)) fail(`ikon di manifest tidak ada di dist: ${icon.src}`);
  }
  const html = readFileSync(join(distDir, 'index.html'), 'utf8');
  if (!/<link[^>]+rel=["']?manifest["']?/i.test(html)) fail('index.html tidak memuat <link rel="manifest">');
}

buildIcons();
buildServiceWorker();
verifyOutput();
console.log('[pwa] selesai');
