import type { JobStatus } from '../api';
import { Badge } from './Badge';
import type { BadgeTone } from './Badge';

const MAP: Record<JobStatus, { label: string; tone: BadgeTone }> = {
  done: { label: 'Selesai', tone: 'success' },
  failed: { label: 'Gagal', tone: 'danger' },
  running: { label: 'Merender', tone: 'info' },
  queued: { label: 'Antre', tone: 'warning' },
};

export function StatusBadge({ status }: { status: JobStatus }) {
  const m = MAP[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}
