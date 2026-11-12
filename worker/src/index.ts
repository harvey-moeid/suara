import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

type Env = {
  ASSETS: Fetcher;
  BUCKET: R2Bucket;
  DB: D1Database;
  APP_PASSCODE: string;
  JOB_TOKEN: string;
  GITHUB_DISPATCH_TOKEN: string;
  GITHUB_REPO: string;
  RENDER_EVENT: string;
  MAX_CHARS: string;
  DAILY_QUOTA: string;
  RETENTION_DAYS: string;
};

type C = Context<{ Bindings: Env }>;

type JobRow = {
  id: string;
  status: string;
  mode: string;
  num_step: number;
  chars: number;
  progress_done: number;
  progress_total: number;
  error: string | null;
  audio_sec: number | null;
  elapsed_sec: number | null;
  rtf: number | null;
  created_at: number;
  updated_at: number;
};

type VoiceRow = {
  id: string;
  name: string;
  key: string;
  ref_text: string;
  bytes: number;
  created_at: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MODES = new Set(['auto', 'clone', 'design']);
const STEPS = new Set([8, 16, 32]);
// Atribut voice design yang valid (diverifikasi dari kode omnivoice 0.2.1).
const DESIGN_ATTRS = new Set([
  'male', 'female',
  'child', 'teenager', 'young adult', 'middle-aged', 'elderly',
  'very low pitch', 'low pitch', 'moderate pitch', 'high pitch', 'very high pitch',
  'whisper',
]);
const MAX_REF_BYTES = 10 * 1024 * 1024;
const MAX_RESULT_BYTES = 60 * 1024 * 1024;
// Batas suara tersimpan: menjaga pemakaian R2 free tier (20 x maks 10 MB = maks 200 MB).
const MAX_VOICES = 20;
const MAX_VOICE_NAME = 60;
const WIB_MS = 7 * 3600 * 1000;
const enc = new TextEncoder();

const nowSec = () => Math.floor(Date.now() / 1000);
// Hari kuota dihitung menurut WIB.
const dayKey = (ms: number) => new Date(ms + WIB_MS).toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const bad = (c: C, status: ContentfulStatusCode, error: string) => c.json({ error }, status);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

// Perbandingan waktu-konstan lewat digest SHA-256 agar panjang rahasia tidak bocor.
async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function publicJob(j: JobRow) {
  return {
    id: j.id,
    status: j.status,
    mode: j.mode,
    numStep: j.num_step,
    chars: j.chars,
    progress: { done: j.progress_done, total: j.progress_total },
    error: j.error,
    audioSec: j.audio_sec,
    elapsedSec: j.elapsed_sec,
    rtf: j.rtf,
    createdAt: j.created_at,
  };
}

function publicVoice(v: VoiceRow) {
  return { id: v.id, name: v.name, refText: v.ref_text, bytes: v.bytes, createdAt: v.created_at };
}

function refExt(file: File): string {
  const t = (file.type || '').toLowerCase();
  if (t.includes('webm')) return 'webm';
  if (t.includes('mp4') || t.includes('m4a') || t.includes('aac')) return 'm4a';
  if (t.includes('mpeg') || t.includes('mp3')) return 'mp3';
  if (t.includes('wav')) return 'wav';
  if (t.includes('ogg')) return 'ogg';
  if (t.includes('flac')) return 'flac';
  return 'bin';
}

async function dispatchRender(env: Env, jobId: string): Promise<number> {
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'omnivoice-studio-worker',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ event_type: env.RENDER_EVENT, client_payload: { job_id: jobId } }),
  });
  return res.status;
}

async function failJob(env: Env, id: string, error: string) {
  await env.DB.prepare(
    "UPDATE jobs SET status = 'failed', error = ?, updated_at = ? WHERE id = ? AND status IN ('queued','running')",
  ).bind(error.slice(0, 300), nowSec(), id).run();
}

async function refundQuota(env: Env, day: string) {
  await env.DB.prepare('UPDATE quota SET count = count - 1 WHERE day = ? AND count > 0').bind(day).run();
}

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => c.json({ ok: true }));

// ---- Endpoint internal (runner GitHub Actions): Bearer JOB_TOKEN ----
app.use('/api/internal/*', async (c, next) => {
  const token = c.env.JOB_TOKEN;
  if (!token) return bad(c, 503, 'JOB_TOKEN belum diatur');
  const h = c.req.header('authorization') ?? '';
  const got = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!(await safeEqual(got, token))) return bad(c, 401, 'Tidak diizinkan');
  await next();
});

// ---- Endpoint publik: header x-passcode ----
app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/health' || c.req.path.startsWith('/api/internal/')) return next();
  const pass = c.env.APP_PASSCODE;
  if (!pass) return bad(c, 503, 'APP_PASSCODE belum diatur');
  if (!(await safeEqual(c.req.header('x-passcode') ?? '', pass))) {
    await sleep(400); // perlambat tebak passcode
    return bad(c, 401, 'Passcode salah');
  }
  await next();
});

app.get('/api/auth', (c) => c.json({ ok: true }));

app.get('/api/meta', async (c) => {
  const q = await c.env.DB.prepare('SELECT count FROM quota WHERE day = ?')
    .bind(dayKey(Date.now()))
    .first<{ count: number }>();
  const r = await c.env.DB.prepare(
    "SELECT num_step, AVG(rtf) AS avg_rtf FROM (SELECT num_step, rtf FROM jobs WHERE status = 'done' AND rtf IS NOT NULL ORDER BY created_at DESC LIMIT 30) GROUP BY num_step",
  ).all<{ num_step: number; avg_rtf: number }>();
  const rtfByStep: Record<string, number> = {};
  for (const row of r.results) rtfByStep[String(row.num_step)] = Number(row.avg_rtf.toFixed(3));
  return c.json({
    quotaUsed: q?.count ?? 0,
    quotaMax: Number(c.env.DAILY_QUOTA),
    maxChars: Number(c.env.MAX_CHARS),
    rtfByStep,
  });
});

// ---- Suara tersimpan (voice library) ----
// Audio referensi yang disimpan di sini TIDAK ikut dibersihkan cron retensi; hanya terhapus lewat DELETE.
app.get('/api/voices', async (c) => {
  const r = await c.env.DB.prepare('SELECT * FROM voices ORDER BY created_at DESC').all<VoiceRow>();
  return c.json({ items: r.results.map(publicVoice), max: MAX_VOICES });
});

app.post('/api/voices', async (c) => {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return bad(c, 400, 'Form tidak valid');
  }
  const name = String(form.get('name') ?? '').trim();
  const refText = String(form.get('ref_text') ?? '').trim();
  const consent = form.get('consent') === 'true';
  const ref = form.get('ref');

  if (!name) return bad(c, 400, 'Nama suara wajib diisi');
  if (name.length > MAX_VOICE_NAME) return bad(c, 400, `Nama suara maksimal ${MAX_VOICE_NAME} karakter`);
  if (refText.length > 500) return bad(c, 400, 'Transkrip referensi terlalu panjang');
  if (!consent) return bad(c, 400, 'Centang izin memakai suara referensi');
  if (!(ref instanceof File) || ref.size === 0) return bad(c, 400, 'Audio referensi wajib diisi');
  if (ref.size > MAX_REF_BYTES) return bad(c, 400, 'Audio referensi maksimal 10 MB');

  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM voices').first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_VOICES) {
    return bad(c, 429, `Suara tersimpan penuh (maks ${MAX_VOICES}). Hapus salah satu dulu.`);
  }

  const id = crypto.randomUUID();
  const key = `voices/${id}/ref.${refExt(ref)}`;
  const created = nowSec();
  try {
    await c.env.BUCKET.put(key, await ref.arrayBuffer(), {
      httpMetadata: { contentType: ref.type || 'application/octet-stream' },
    });
    await c.env.DB.prepare(
      'INSERT INTO voices (id, name, key, ref_text, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(id, name, key, refText, ref.size, created).run();
  } catch {
    await c.env.BUCKET.delete(key).catch(() => undefined); // jangan tinggalkan file yatim
    return bad(c, 500, 'Gagal menyimpan suara');
  }
  const row: VoiceRow = { id, name, key, ref_text: refText, bytes: ref.size, created_at: created };
  return c.json({ voice: publicVoice(row) }, 201);
});

app.get('/api/voices/:id/audio', async (c) => {
  const id = c.req.param('id');
  if (!UUID_RE.test(id)) return bad(c, 404, 'Suara tidak ditemukan');
  const row = await c.env.DB.prepare('SELECT * FROM voices WHERE id = ?').bind(id).first<VoiceRow>();
  if (!row) return bad(c, 404, 'Suara tidak ditemukan');
  const obj = await c.env.BUCKET.get(row.key);
  if (!obj) return bad(c, 404, 'File suara tidak ada di penyimpanan');
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'Content-Length': String(obj.size),
      'Cache-Control': 'private, no-store',
    },
  });
});

app.delete('/api/voices/:id', async (c) => {
  const id = c.req.param('id');
  if (!UUID_RE.test(id)) return bad(c, 404, 'Suara tidak ditemukan');
  const row = await c.env.DB.prepare('SELECT * FROM voices WHERE id = ?').bind(id).first<VoiceRow>();
  if (!row) return bad(c, 404, 'Suara tidak ditemukan');
  await c.env.BUCKET.delete(row.key);
  await c.env.DB.prepare('DELETE FROM voices WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

app.post('/api/jobs', async (c) => {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return bad(c, 400, 'Form tidak valid');
  }
  const text = String(form.get('text') ?? '').trim();
  const mode = String(form.get('mode') ?? 'auto');
  const language = String(form.get('language') ?? 'id').trim();
  const numStep = Number(form.get('num_step') ?? 16);
  const speed = Number(form.get('speed') ?? 1);
  const rawInstruct = String(form.get('instruct') ?? '');
  const refText = String(form.get('ref_text') ?? '').trim();
  const voiceId = String(form.get('voice_id') ?? '').trim();
  const consent = form.get('consent') === 'true';
  const ref = form.get('ref');
  const maxChars = Number(c.env.MAX_CHARS);

  if (!text) return bad(c, 400, 'Teks kosong');
  if (text.length > maxChars) return bad(c, 400, `Teks terlalu panjang (maks ${maxChars} karakter)`);
  if (!MODES.has(mode)) return bad(c, 400, 'Mode tidak dikenal');
  if (!/^[a-z]{2,3}$/.test(language)) return bad(c, 400, 'Kode bahasa tidak valid');
  if (!STEPS.has(numStep)) return bad(c, 400, 'num_step harus 8, 16, atau 32');
  if (!(speed >= 0.5 && speed <= 2)) return bad(c, 400, 'Kecepatan harus 0.5 - 2');
  if (refText.length > 500) return bad(c, 400, 'Transkrip referensi terlalu panjang');

  let instruct = '';
  if (mode === 'design') {
    const parts = rawInstruct.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!parts.length || parts.some((p) => !DESIGN_ATTRS.has(p))) {
      return bad(c, 400, 'Atribut desain suara tidak valid');
    }
    instruct = parts.join(', ');
  }

  let refFile: File | null = null;
  let voice: VoiceRow | null = null;
  if (mode === 'clone') {
    if (voiceId) {
      // Pakai suara tersimpan: izin sudah dicentang saat menyimpan, tidak perlu unggah ulang.
      if (!UUID_RE.test(voiceId)) return bad(c, 400, 'voice_id tidak valid');
      voice = await c.env.DB.prepare('SELECT * FROM voices WHERE id = ?').bind(voiceId).first<VoiceRow>();
      if (!voice) return bad(c, 404, 'Suara tersimpan tidak ditemukan (mungkin sudah dihapus)');
    } else {
      if (!consent) return bad(c, 400, 'Centang izin memakai suara referensi');
      if (!(ref instanceof File) || ref.size === 0) return bad(c, 400, 'Audio referensi wajib diisi');
      if (ref.size > MAX_REF_BYTES) return bad(c, 400, 'Audio referensi maksimal 10 MB');
      refFile = ref;
    }
  }

  if (!c.env.GITHUB_DISPATCH_TOKEN) return bad(c, 503, 'GITHUB_DISPATCH_TOKEN belum diatur');

  // Kuota harian atomik.
  const day = dayKey(Date.now());
  const q = await c.env.DB.prepare(
    'INSERT INTO quota (day, count) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count',
  ).bind(day, Number(c.env.DAILY_QUOTA)).first<{ count: number }>();
  if (!q) return bad(c, 429, `Kuota harian habis (${c.env.DAILY_QUOTA} job/hari)`);

  const id = crypto.randomUUID();
  try {
    // Suara tersimpan memakai key voices/..., bukan salinan per job, jadi tidak ikut terhapus cron.
    let refKey: string | null = voice ? voice.key : null;
    if (refFile) {
      refKey = `refs/${id}/ref.${refExt(refFile)}`;
      await c.env.BUCKET.put(refKey, await refFile.arrayBuffer(), {
        httpMetadata: { contentType: refFile.type || 'application/octet-stream' },
      });
    }
    const input = {
      text, mode, language, num_step: numStep, speed, instruct,
      ref_text: refText || (voice ? voice.ref_text : ''),
      ref_key: refKey,
    };
    await c.env.BUCKET.put(`jobs/${id}/input.json`, JSON.stringify(input), {
      httpMetadata: { contentType: 'application/json' },
    });
    const t = nowSec();
    await c.env.DB.prepare(
      "INSERT INTO jobs (id, status, mode, num_step, chars, progress_done, progress_total, created_at, updated_at) VALUES (?, 'queued', ?, ?, ?, 0, 0, ?, ?)",
    ).bind(id, mode, numStep, text.length, t, t).run();
  } catch {
    await refundQuota(c.env, day);
    return bad(c, 500, 'Gagal menyimpan job');
  }

  let status = 0;
  try {
    status = await dispatchRender(c.env, id);
  } catch {
    status = -1;
  }
  if (status !== 204) {
    const msg = `Gagal memicu render (GitHub HTTP ${status})`;
    await failJob(c.env, id, msg);
    await refundQuota(c.env, day);
    return c.json({ error: msg, job_id: id }, 502);
  }
  return c.json({ job_id: id }, 201);
});

// Daftar hasil suara persisten. Passcode middleware di atas melindungi seluruh data.
app.get('/api/jobs', async (c) => {
  const rawLimit = Number(c.req.query('limit') ?? 50);
  const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, Math.floor(rawLimit))) : 50;
  const rows = await c.env.DB.prepare(
    'SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?',
  ).bind(limit).all<JobRow>();
  const items = await Promise.all(rows.results.map(async (row) => {
    const [input, audio] = await Promise.all([
      readInput(c.env, row.id),
      c.env.BUCKET.head(`jobs/${row.id}/output.mp3`),
    ]);
    const sourceText = typeof input?.text === 'string' ? input.text : '';
    return {
      ...publicJob(row),
      text: sourceText,
      preview: sourceText.slice(0, 140) || (row.status === 'failed' ? 'Render gagal' : 'Teks tidak tersedia'),
      language: typeof input?.language === 'string' ? input.language : 'id',
      speed: typeof input?.speed === 'number' ? input.speed : 1,
      hasAudio: Boolean(audio),
    };
  }));
  return c.json({ items, count: items.length, limit });
});

app.get('/api/jobs/:id', async (c) => {
  const id = c.req.param('id');
  if (!UUID_RE.test(id)) return bad(c, 404, 'Job tidak ditemukan');
  const row = await c.env.DB.prepare('SELECT * FROM jobs WHERE id = ?').bind(id).first<JobRow>();
  if (!row) return bad(c, 404, 'Job tidak ditemukan (mungkin sudah dihapus)');
  return c.json(publicJob(row));
});

app.get('/api/jobs/:id/audio', async (c) => {
  const id = c.req.param('id');
  if (!UUID_RE.test(id)) return bad(c, 404, 'Tidak ditemukan');
  const fmt = c.req.query('fmt') === 'wav' ? 'wav' : 'mp3';
  const obj = await c.env.BUCKET.get(`jobs/${id}/output.${fmt}`);
  if (!obj) return bad(c, 404, 'Audio belum tersedia atau sudah dihapus');
  return new Response(obj.body, {
    headers: {
      'Content-Type': fmt === 'mp3' ? 'audio/mpeg' : 'audio/wav',
      'Content-Length': String(obj.size),
      'Cache-Control': 'private, no-store',
    },
  });
});

// ---- Internal ----
async function readInput(env: Env, id: string): Promise<Record<string, unknown> | null> {
  const obj = await env.BUCKET.get(`jobs/${id}/input.json`);
  return obj ? await obj.json<Record<string, unknown>>() : null;
}

// Klaim job: spesifik (job_id) atau yang tertua di antrean.
app.post('/api/internal/claim', async (c) => {
  const body = await c.req.json<{ job_id?: string }>().catch((): { job_id?: string } => ({}));
  const t = nowSec();
  let row: { id: string } | null;
  if (body.job_id) {
    if (!UUID_RE.test(body.job_id)) return bad(c, 400, 'job_id tidak valid');
    row = await c.env.DB.prepare(
      "UPDATE jobs SET status = 'running', updated_at = ? WHERE id = ? AND status = 'queued' RETURNING id",
    ).bind(t, body.job_id).first<{ id: string }>();
  } else {
    row = await c.env.DB.prepare(
      "UPDATE jobs SET status = 'running', updated_at = ? WHERE id = (SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1) RETURNING id",
    ).bind(t).first<{ id: string }>();
  }
  if (!row) return c.json({ job_id: null });
  return c.json({ job_id: row.id, input: await readInput(c.env, row.id) });
});

app.get('/api/internal/jobs/:id/input', async (c) => {
  const id = c.req.param('id');
  if (!UUID_RE.test(id)) return bad(c, 404, 'Tidak ditemukan');
  const input = await readInput(c.env, id);
  return input ? c.json(input) : bad(c, 404, 'Input tidak ditemukan');
});

app.get('/api/internal/jobs/:id/ref', async (c) => {
  const id = c.req.param('id');
  if (!UUID_RE.test(id)) return bad(c, 404, 'Tidak ditemukan');
  const input = await readInput(c.env, id);
  const key = input?.ref_key;
  // refs/{id}/ = unggahan milik job ini; voices/ = suara tersimpan (key ditulis server saat job dibuat).
  if (typeof key !== 'string' || !(key.startsWith(`refs/${id}/`) || key.startsWith('voices/'))) {
    return bad(c, 404, 'Referensi tidak ada');
  }
  const obj = await c.env.BUCKET.get(key);
  if (!obj) return bad(c, 404, 'Referensi tidak ada');
  return new Response(obj.body, {
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(obj.size) },
  });
});

app.post('/api/internal/jobs/:id/progress', async (c) => {
  const id = c.req.param('id');
  if (!UUID_RE.test(id)) return bad(c, 404, 'Tidak ditemukan');
  const b = await c.req.json<{ done?: number; total?: number }>().catch((): { done?: number; total?: number } => ({}));
  const done = num(b.done);
  const total = num(b.total);
  if (done === null || total === null || done < 0 || total < 0) return bad(c, 400, 'Progress tidak valid');
  await c.env.DB.prepare(
    "UPDATE jobs SET progress_done = ?, progress_total = ?, updated_at = ? WHERE id = ? AND status = 'running'",
  ).bind(Math.floor(done), Math.floor(total), nowSec(), id).run();
  return c.json({ ok: true });
});

app.put('/api/internal/jobs/:id/result', async (c) => {
  const id = c.req.param('id');
  if (!UUID_RE.test(id)) return bad(c, 404, 'Tidak ditemukan');
  const fmt = c.req.query('fmt');
  if (fmt !== 'mp3' && fmt !== 'wav') return bad(c, 400, 'fmt harus mp3 atau wav');
  const len = Number(c.req.header('content-length') ?? 0);
  if (!c.req.raw.body || !(len > 0)) return bad(c, 400, 'Body kosong atau tanpa Content-Length');
  if (len > MAX_RESULT_BYTES) return bad(c, 413, 'Hasil terlalu besar');
  await c.env.BUCKET.put(`jobs/${id}/output.${fmt}`, c.req.raw.body, {
    httpMetadata: { contentType: fmt === 'mp3' ? 'audio/mpeg' : 'audio/wav' },
  });
  return c.json({ ok: true, bytes: len });
});

app.post('/api/internal/jobs/:id/status', async (c) => {
  const id = c.req.param('id');
  if (!UUID_RE.test(id)) return bad(c, 404, 'Tidak ditemukan');
  const b = await c.req
    .json<{ status?: string; error?: string; audio_sec?: number; elapsed_sec?: number; rtf?: number }>()
    .catch(() => null);
  if (!b) return bad(c, 400, 'JSON tidak valid');
  if (b.status === 'done') {
    const head = await c.env.BUCKET.head(`jobs/${id}/output.mp3`);
    if (!head) {
      await failJob(c.env, id, 'Hasil audio tidak ditemukan setelah render');
      return bad(c, 409, 'MP3 belum diunggah');
    }
    await c.env.DB.prepare(
      "UPDATE jobs SET status = 'done', progress_done = progress_total, error = NULL, audio_sec = ?, elapsed_sec = ?, rtf = ?, updated_at = ? WHERE id = ? AND status = 'running'",
    ).bind(num(b.audio_sec), num(b.elapsed_sec), num(b.rtf), nowSec(), id).run();
    return c.json({ ok: true });
  }
  if (b.status === 'failed') {
    await failJob(c.env, id, String(b.error ?? 'Render gagal'));
    return c.json({ ok: true });
  }
  return bad(c, 400, 'status harus done atau failed');
});

// Dipanggil workflow bila runner mati/dibatalkan: gagalkan job yang sedang running (dan job_id yang belum sempat diklaim).
app.post('/api/internal/fail-running', async (c) => {
  const b = await c.req.json<{ error?: string; job_id?: string }>().catch((): { error?: string; job_id?: string } => ({}));
  const msg = String(b.error ?? 'Render gagal atau dibatalkan').slice(0, 300);
  const t = nowSec();
  await c.env.DB.prepare("UPDATE jobs SET status = 'failed', error = ?, updated_at = ? WHERE status = 'running'")
    .bind(msg, t).run();
  if (b.job_id && UUID_RE.test(b.job_id)) await failJob(c.env, b.job_id, msg);
  return c.json({ ok: true });
});

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) return c.json({ error: 'Tidak ditemukan' }, 404);
  return c.env.ASSETS.fetch(c.req.raw);
});

// ---- Cron: bersihkan data lama (privasi suara referensi) ----
// Hanya menyentuh refs/{jobId}/ dan jobs/{jobId}/. Suara tersimpan (voices/) sengaja tidak dihapus.
async function cleanup(env: Env) {
  const t = nowSec();
  const cutoff = t - Number(env.RETENTION_DAYS) * 86400;
  await env.DB.prepare(
    "UPDATE jobs SET status = 'failed', error = 'Kedaluwarsa: render tidak selesai', updated_at = ? WHERE status IN ('queued','running') AND created_at < ?",
  ).bind(t, t - 8 * 3600).run();

  for (let round = 0; round < 20; round++) {
    const r = await env.DB.prepare('SELECT id FROM jobs WHERE created_at < ? LIMIT 100').bind(cutoff).all<{ id: string }>();
    const ids = r.results.map((x) => x.id);
    if (!ids.length) break;
    for (const id of ids) {
      for (const prefix of [`refs/${id}/`, `jobs/${id}/`]) {
        const l = await env.BUCKET.list({ prefix });
        if (l.objects.length) await env.BUCKET.delete(l.objects.map((o) => o.key));
      }
    }
    await env.DB.prepare(`DELETE FROM jobs WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).run();
  }
  await env.DB.prepare('DELETE FROM quota WHERE day < ?').bind(dayKey(cutoff * 1000)).run();
}

export default {
  fetch: app.fetch,
  scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(cleanup(env));
  },
};
