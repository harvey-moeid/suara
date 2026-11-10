export type Mode = 'auto' | 'clone' | 'design';
export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

export interface Job {
  id: string;
  status: JobStatus;
  mode: Mode;
  numStep: number;
  chars: number;
  progress: { done: number; total: number };
  error: string | null;
  audioSec: number | null;
  elapsedSec: number | null;
  rtf: number | null;
  createdAt: number;
}

export interface AudioLibraryItem extends Job {
  text: string;
  preview: string;
  language: string;
  speed: number;
  hasAudio: boolean;
}

export interface Meta {
  quotaUsed: number;
  quotaMax: number;
  maxChars: number;
  rtfByStep: Record<string, number>;
}

export interface SubmitPayload {
  text: string;
  mode: Mode;
  language: string;
  numStep: number;
  speed: number;
  instruct: string;
  refText: string;
  consent: boolean;
  ref: Blob | null;
  refName: string;
}

export class AuthError extends Error {}

const KEY = 'ov_passcode';

export function getPass(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}
export function setPass(p: string): void {
  try {
    localStorage.setItem(KEY, p);
  } catch {
    /* abaikan */
  }
}
export function clearPass(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* abaikan */
  }
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('x-passcode', getPass());
  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) throw new AuthError('Passcode salah');
  return res;
}

async function parse<T>(res: Response): Promise<T> {
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string }).error;
    throw new Error(msg ?? `Kesalahan server (${res.status})`);
  }
  return data as T;
}

export async function checkAuth(pass: string): Promise<boolean> {
  const res = await fetch('/api/auth', { headers: { 'x-passcode': pass } });
  if (res.status === 401) return false;
  if (!res.ok) throw new Error(`Server belum siap (${res.status})`);
  return true;
}

// Cek ringan ke endpoint yang sudah ada (/api/health, tanpa passcode).
// Mengembalikan waktu respons (ms) yang diukur dari browser.
export async function getHealth(): Promise<number> {
  const t0 = performance.now();
  const res = await fetch('/api/health', { cache: 'no-store' }).catch(() => null);
  if (!res) throw new Error('Tidak dapat terhubung ke server');
  if (!res.ok) throw new Error(`Server menjawab ${res.status}`);
  return Math.round(performance.now() - t0);
}

export async function getMeta(): Promise<Meta> {
  return parse<Meta>(await call('/api/meta'));
}

export async function getJob(id: string): Promise<Job> {
  return parse<Job>(await call(`/api/jobs/${id}`));
}

export async function submitJob(p: SubmitPayload): Promise<{ job_id: string }> {
  const fd = new FormData();
  fd.set('text', p.text);
  fd.set('mode', p.mode);
  fd.set('language', p.language);
  fd.set('num_step', String(p.numStep));
  fd.set('speed', String(p.speed));
  fd.set('instruct', p.instruct);
  fd.set('ref_text', p.refText);
  fd.set('consent', p.consent ? 'true' : 'false');
  if (p.ref) fd.set('ref', p.ref, p.refName);
  return parse<{ job_id: string }>(await call('/api/jobs', { method: 'POST', body: fd }));
}

// Audio diambil lewat fetch berheader passcode, lalu dijadikan blob URL.
export async function fetchAudio(id: string, fmt: 'mp3' | 'wav'): Promise<string> {
  const res = await call(`/api/jobs/${id}/audio?fmt=${fmt}`);
  if (!res.ok) {
    const data: unknown = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? 'Audio tidak tersedia');
  }
  return URL.createObjectURL(await res.blob());
}

export async function listJobs(limit = 50): Promise<AudioLibraryItem[]> {
  const data = await parse<{ items: AudioLibraryItem[] }>(await call(`/api/jobs?limit=${limit}`));
  return data.items;
}
