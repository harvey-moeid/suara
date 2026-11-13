// Uji perilaku service worker tanpa browser: templat dirender, dijalankan di vm dengan mock Cache/fetch.
// Jalankan: npm run test:pwa
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const template = readFileSync(resolve(here, '..', 'pwa', 'sw.template.js'), 'utf8');

assert.equal(template.split('__VERSION__').length - 1, 1, '__VERSION__ harus muncul tepat sekali');
assert.equal(template.split('__PRECACHE__').length - 1, 1, '__PRECACHE__ harus muncul tepat sekali');
assert.equal(template.split('__OFFLINE_HTML__').length - 1, 1, '__OFFLINE_HTML__ harus muncul tepat sekali');

const ORIGIN = 'https://app.test';
const PRECACHE = ['/', '/assets/index-abc.js', '/assets/index-abc.css'];

function render(version = 'vTEST') {
  return template
    .replace('__VERSION__', () => version)
    .replace('__PRECACHE__', () => JSON.stringify(PRECACHE))
    .replace('__OFFLINE_HTML__', () => JSON.stringify('<h1>offline-page</h1>'))
    .replace('const NAV_TIMEOUT_MS = 4000;', 'const NAV_TIMEOUT_MS = 60;');
}

// Mock CacheStorage sederhana, kunci = URL absolut.
function makeCaches() {
  const store = new Map();
  const key = (r) => new URL(typeof r === 'string' ? r : r.url, ORIGIN).href;
  const make = (name) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name);
    return {
      async match(r) {
        const hit = m.get(key(r));
        return hit ? hit.clone() : undefined;
      },
      async put(r, res) {
        m.set(key(r), res);
      },
      async addAll(reqs) {
        const results = await Promise.all(reqs.map((r) => ctx.fetch(r)));
        results.forEach((res) => {
          if (!res.ok) throw new TypeError(`addAll: ${res.status}`);
        });
        reqs.forEach((r, i) => m.set(key(r), results[i]));
      },
      _map: m,
    };
  };
  return {
    open: async (name) => make(name),
    keys: async () => [...store.keys()],
    delete: async (name) => store.delete(name),
    _store: store,
  };
}

// Di browser, URL relatif pada `new Request('/x')` diselesaikan terhadap lokasi SW; Request Node mewajibkan URL absolut.
class SwRequest extends Request {
  constructor(input, init) {
    super(typeof input === 'string' ? new URL(input, ORIGIN).href : input, init);
  }
}

let ctx;
function boot() {
  const handlers = {};
  const calls = { skipWaiting: 0, claim: 0, fetched: [] };
  const caches = makeCaches();
  ctx = {
    fetch: async (req) => {
      calls.fetched.push(req);
      return new Response('net', { status: 200 });
    },
  };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type, fn) => {
      handlers[type] = fn;
    },
    skipWaiting: () => {
      calls.skipWaiting++;
    },
    clients: {
      claim: async () => {
        calls.claim++;
      },
    },
  };
  const sandbox = {
    self,
    caches,
    fetch: (r) => ctx.fetch(r),
    Request: SwRequest,
    Response,
    URL,
    Headers,
    Promise,
    setTimeout,
    clearTimeout,
    console,
  };
  vm.runInNewContext(render(), sandbox, { filename: 'sw.js' });
  return { handlers, calls, caches, ctx, sandbox };
}

const nav = (path = '/') => ({ method: 'GET', url: ORIGIN + path, mode: 'navigate', headers: new Headers() });
const req = (path, { method = 'GET', headers = {}, origin = ORIGIN } = {}) => ({
  method,
  url: origin + path,
  mode: 'cors',
  headers: new Headers(headers),
});

function fire(handlers, type, event) {
  handlers[type](event);
  return event;
}
function fetchEvent(h, request) {
  const ev = { request, responded: null, respondWith(p) { this.responded = Promise.resolve(p); } };
  fire(h, 'fetch', ev);
  return ev;
}
async function lifecycle(h, type) {
  let p;
  fire(h, type, { waitUntil: (x) => (p = x) });
  return p;
}

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n     ${e.stack ?? e}`);
    process.exitCode = 1;
  }
}

await test('install: precache semua URL dengan cache:reload, tanpa skipWaiting otomatis', async () => {
  const { handlers, calls, caches } = boot();
  await lifecycle(handlers, 'install');
  assert.equal(calls.fetched.length, PRECACHE.length);
  assert.ok(calls.fetched.every((r) => r.cache === 'reload'));
  const c = await caches.open('omnivoice-shell-vTEST');
  for (const u of PRECACHE) assert.ok(await c.match(u), `${u} harus ada di cache`);
  assert.equal(calls.skipWaiting, 0);
});

await test('install: gagal (atomik) bila satu berkas precache tidak bisa diunduh', async () => {
  const { handlers, ctx: c } = boot();
  c.fetch = async (r) => new Response('x', { status: r.url.endsWith('.css') ? 404 : 200 });
  await assert.rejects(lifecycle(handlers, 'install'));
});

await test('activate: hapus cache versi lama milik sendiri, biarkan cache lain, lalu claim', async () => {
  const { handlers, calls, caches } = boot();
  await caches.open('omnivoice-shell-vOLD');
  await caches.open('omnivoice-shell-vTEST');
  await caches.open('cache-lain');
  await lifecycle(handlers, 'activate');
  const names = await caches.keys();
  assert.deepEqual(names.sort(), ['cache-lain', 'omnivoice-shell-vTEST']);
  assert.equal(calls.claim, 1);
});

await test('fetch: /api, non-GET, Range, lintas-origin, dan non-aset TIDAK ditangani', async () => {
  const { handlers } = boot();
  const ignored = [
    req('/api/jobs'),
    req('/api/voices/abc/audio'),
    req('/api/health'),
    req('/api'),
    req('/api/jobs', { method: 'POST' }),
    req('/assets/a.js', { headers: { range: 'bytes=0-10' } }),
    req('/assets/a.js', { origin: 'https://cdn.test' }),
    req('/icons/icon-192.png'),
    req('/manifest.webmanifest'),
    req('/sw.js'),
  ];
  for (const r of ignored) assert.equal(fetchEvent(handlers, r).responded, null, `${r.method} ${r.url} harus diabaikan`);
  // Navigasi ke /api juga tidak boleh diambil alih (mis. membuka /api/health di tab).
  assert.equal(fetchEvent(handlers, nav('/api/health')).responded, null);
});

await test('navigasi online: respons jaringan dikembalikan dan TIDAK disimpan ke cache', async () => {
  const { handlers, caches, ctx: c } = boot();
  await lifecycle(handlers, 'install');
  c.fetch = async () => new Response('fresh', { status: 200 });
  const res = await fetchEvent(handlers, nav('/?source=pwa')).responded;
  assert.equal(await res.text(), 'fresh');
  const cache = await caches.open('omnivoice-shell-vTEST');
  assert.equal(await (await cache.match('/')).text(), 'net', 'cangkang di cache tidak boleh tertimpa');
});

await test('navigasi offline: layani cangkang "/" dari cache', async () => {
  const { handlers, ctx: c } = boot();
  await lifecycle(handlers, 'install');
  c.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  const res = await fetchEvent(handlers, nav('/apa-saja?x=1')).responded;
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'net');
});

await test('navigasi offline tanpa cangkang di cache: halaman offline tertanam (200, text/html, bukan redirect)', async () => {
  const { handlers, ctx: c } = boot();
  c.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  const res = await fetchEvent(handlers, nav()).responded;
  assert.equal(res.status, 200);
  assert.equal(res.redirected, false);
  assert.match(res.headers.get('content-type'), /^text\/html/);
  assert.equal(await res.text(), '<h1>offline-page</h1>');
});

await test('navigasi: server 5xx jatuh ke cangkang; tanpa cache, respons 5xx diteruskan', async () => {
  const { handlers, ctx: c } = boot();
  await lifecycle(handlers, 'install');
  c.fetch = async () => new Response('boom', { status: 503 });
  const res = await fetchEvent(handlers, nav()).responded;
  assert.equal(res.status, 200);

  const b = boot();
  b.ctx.fetch = async () => new Response('boom', { status: 503 });
  const res2 = await fetchEvent(b.handlers, nav()).responded;
  assert.equal(res2.status, 503);
});

await test('navigasi: 4xx (mis. 404) diteruskan apa adanya', async () => {
  const { handlers, ctx: c } = boot();
  await lifecycle(handlers, 'install');
  c.fetch = async () => new Response('nf', { status: 404 });
  const res = await fetchEvent(handlers, nav()).responded;
  assert.equal(res.status, 404);
});

await test('navigasi: jaringan terlalu lambat -> cangkang dari cache (timeout)', async () => {
  const { handlers, ctx: c } = boot();
  await lifecycle(handlers, 'install');
  c.fetch = () => new Promise(() => {}); // menggantung selamanya
  const res = await fetchEvent(handlers, nav()).responded;
  assert.equal(res.status, 200);
});

await test('navigasi: lambat lalu gagal tanpa cangkang di cache -> halaman offline tertanam', async () => {
  const { handlers, ctx: c } = boot();
  c.fetch = () => new Promise((_, reject) => setTimeout(() => reject(new TypeError('Failed to fetch')), 150));
  const res = await fetchEvent(handlers, nav()).responded;
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '<h1>offline-page</h1>');
});

await test('aset /assets/: cache-first; bila tak ada di cache, ke jaringan', async () => {
  const { handlers, calls, ctx: c } = boot();
  await lifecycle(handlers, 'install');
  calls.fetched.length = 0;
  const hit = await fetchEvent(handlers, req('/assets/index-abc.js')).responded;
  assert.equal(await hit.text(), 'net');
  assert.equal(calls.fetched.length, 0, 'tidak boleh ke jaringan bila ada di cache');

  c.fetch = async (r) => {
    calls.fetched.push(r);
    return new Response('dari-jaringan');
  };
  const miss = await fetchEvent(handlers, req('/assets/tidak-ada.js')).responded;
  assert.equal(await miss.text(), 'dari-jaringan');
  assert.equal(calls.fetched.length, 1);
});

await test('pesan SKIP_WAITING memanggil skipWaiting; pesan lain diabaikan', async () => {
  const { handlers, calls } = boot();
  handlers.message({ data: { type: 'LAIN' } });
  handlers.message({ data: null });
  assert.equal(calls.skipWaiting, 0);
  handlers.message({ data: { type: 'SKIP_WAITING' } });
  assert.equal(calls.skipWaiting, 1);
});

console.log(`\n${passed} uji lolos${process.exitCode ? ', ADA YANG GAGAL' : ''}`);
