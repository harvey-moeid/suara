import type { Mode } from './api';

export const MODE_LABEL: Record<Mode, string> = {
  auto: 'Otomatis',
  clone: 'Clone suara',
  design: 'Desain suara',
};

export function fmtDur(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return s >= 60 ? `${Math.floor(s / 60)} mnt ${s % 60} dtk` : `${s} dtk`;
}

// Durasi ringkas untuk total yang bisa mencapai jam.
export function fmtLongDur(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} dtk`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} mnt`;
  return `${Math.floor(m / 60)} j ${m % 60} mnt`;
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Terjadi kesalahan';
}

// tsSec = detik epoch (format createdAt dari API).
export function fmtRelative(tsSec: number, nowMs: number = Date.now()): string {
  const diff = Math.max(0, Math.floor(nowMs / 1000 - tsSec));
  if (diff < 60) return 'baru saja';
  if (diff < 3600) return `${Math.floor(diff / 60)} mnt lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  return `${Math.floor(diff / 86400)} hari lalu`;
}
