import type { BadgeTone } from '../ui/Badge';

export interface Quota {
  used: number;
  max: number;
}

export function quotaRatio(q: Quota): number {
  return q.max > 0 ? q.used / q.max : 0;
}

export function quotaBarTone(q: Quota): 'brand' | 'warn' | 'bad' {
  const r = quotaRatio(q);
  return r >= 1 ? 'bad' : r >= 0.8 ? 'warn' : 'brand';
}

export function quotaBadgeTone(q: Quota): BadgeTone {
  const r = quotaRatio(q);
  return r >= 1 ? 'danger' : r >= 0.8 ? 'warning' : 'info';
}
