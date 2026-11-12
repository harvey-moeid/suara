/*
 * Service worker OmniVoice Studio.
 * Berkas ini adalah templat: scripts/build-pwa.mjs mengisi versi dan daftar precache, lalu menulis dist/sw.js.
 *
 * Aturan keamanan:
 *  - /api/* TIDAK PERNAH disentuh (berisi passcode, audio, dan data privat). Semua permintaan ke sana langsung ke jaringan.
 *  - Hanya permintaan GET same-origin yang ditangani. Selain itu dibiarkan ke browser.
 *  - Versi baru tidak mengambil alih otomatis: menunggu persetujuan pengguna (pesan SKIP_WAITING) agar
 *    teks dan rekaman yang sedang dikerjakan di Studio tidak hilang.
 */
'use strict';

const VERSION = '__VERSION__';
const PREFIX = 'omnivoice-shell-';
const CACHE = PREFIX + VERSION;
const PRECACHE = __PRECACHE__;
const SHELL_URL = '/';
// Halaman offline ditanam langsung (bukan diunduh dari URL): Cloudflare Static Assets mengalihkan /offline.html ke /offline,
// dan respons hasil redirect tidak boleh dipakai untuk menjawab navigasi.
const OFFLINE_HTML = __OFFLINE_HTML__;
const NAV_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  // addAll bersifat atomik: bila satu berkas gagal diunduh, worker ini tidak terpasang dan versi lama tetap berjalan.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith(PREFIX) && name !== CACHE).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (request.headers.has('range')) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  // Aset ber-hash hasil build: cache-first dari precache; bila tidak ada, biarkan ke jaringan.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
  }
});

function timeout(ms) {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

async function cachedShell() {
  const cache = await caches.open(CACHE);
  return cache.match(SHELL_URL, { ignoreVary: true });
}

function offlinePage() {
  return new Response(OFFLINE_HTML, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// Network-first untuk navigasi. Respons jaringan sengaja TIDAK disimpan ke cache supaya cangkang yang tersimpan
// selalu cocok dengan aset di cache yang sama (satu versi, satu cache).
async function handleNavigation(request) {
  const network = fetch(request);
  network.catch(() => undefined); // cegah unhandled rejection bila kalah balapan dengan timeout
  let response = null;
  try {
    response = await Promise.race([network, timeout(NAV_TIMEOUT_MS)]);
  } catch (_) {
    response = null;
  }
  if (response && response.status < 500) return response;

  // Jaringan gagal/lambat/5xx: pakai cangkang dari cache.
  const shell = await cachedShell();
  if (shell) return shell;
  // Tanpa cangkang: server yang menjawab 5xx diteruskan apa adanya (bukan "offline"); halaman offline hanya bila jaringan gagal.
  if (response) return response;
  try {
    return await network;
  } catch (_) {
    return offlinePage();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreVary: true });
  return hit || fetch(request);
}
