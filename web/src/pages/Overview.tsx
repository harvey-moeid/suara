import type { AudioLibraryItem, Meta } from '../api';
import { fmtLongDur, fmtRelative, MODE_LABEL } from '../format';
import type { HealthState } from '../hooks/useDashboardData';
import { quotaBarTone, quotaRatio } from '../layout/quota';
import type { View } from '../nav';
import { Alert } from '../ui/Alert';
import { Badge } from '../ui/Badge';
import type { BadgeTone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { cx } from '../ui/cx';
import { EmptyState } from '../ui/EmptyState';
import { AlertIcon, AudioIcon, CheckIcon, ClockIcon, ListIcon, PlusIcon } from '../ui/icons';
import { ProgressBar } from '../ui/ProgressBar';
import { Skeleton } from '../ui/Skeleton';
import { StatTile } from '../ui/StatTile';
import { StatusBadge } from '../ui/StatusBadge';

interface OverviewProps {
  meta: Meta | null;
  metaLoading: boolean;
  metaErr: string;
  library: AudioLibraryItem[];
  libraryLoading: boolean;
  libraryErr: string;
  health: HealthState;
  onNavigate: (v: View) => void;
  onRefresh: () => void;
}

type Dot = 'ok' | 'warn' | 'bad' | 'idle';

const DOT: Record<Dot, string> = { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', idle: 'bg-muted' };

const SPEED_STEPS: [number, string][] = [
  [8, 'Draf'],
  [16, 'Standar'],
  [32, 'Terbaik'],
];

interface LibraryStats {
  total: number;
  done: number;
  failed: number;
  queued: number;
  running: number;
  audioSec: number;
}

function summarize(items: AudioLibraryItem[]): LibraryStats {
  const s: LibraryStats = { total: items.length, done: 0, failed: 0, queued: 0, running: 0, audioSec: 0 };
  for (const it of items) {
    if (it.status === 'done') {
      s.done += 1;
      s.audioSec += it.audioSec ?? 0;
    } else if (it.status === 'failed') s.failed += 1;
    else if (it.status === 'running') s.running += 1;
    else s.queued += 1;
  }
  return s;
}

interface StatusRowProps {
  label: string;
  detail: string;
  dot: Dot;
  badge: string;
  badgeTone: BadgeTone;
}

function StatusRow({ label, detail, dot, badge, badgeTone }: StatusRowProps) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span aria-hidden="true" className={cx('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', DOT[dot])} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="break-words text-xs text-muted">{detail}</p>
      </div>
      <Badge tone={badgeTone}>{badge}</Badge>
    </li>
  );
}

export default function Overview({
  meta,
  metaLoading,
  metaErr,
  library,
  libraryLoading,
  libraryErr,
  health,
  onNavigate,
  onRefresh,
}: OverviewProps) {
  const stats = summarize(library);
  const statsLoading = libraryLoading && library.length === 0 && !libraryErr;
  const statsUnknown = libraryErr !== '' && library.length === 0;
  const metaPending = metaLoading && !meta;
  const recent = library.slice(0, 5);
  const judged = stats.done + stats.failed;

  const val = (n: string) => (statsUnknown ? '–' : n);

  // Status layanan: hanya dari pengukuran nyata (health ping, /api/meta, /api/jobs).
  const apiRow: StatusRowProps =
    health.status === 'online'
      ? { label: 'API Worker', detail: `Respons ${health.latencyMs ?? 0} ms`, dot: 'ok', badge: 'Online', badgeTone: 'success' }
      : health.status === 'offline'
        ? { label: 'API Worker', detail: health.error || 'Tidak dapat dijangkau', dot: 'bad', badge: 'Offline', badgeTone: 'danger' }
        : { label: 'API Worker', detail: 'Menghubungi server...', dot: 'idle', badge: 'Memeriksa', badgeTone: 'neutral' };

  const dataRow: StatusRowProps = meta
    ? { label: 'Basis data', detail: 'Kuota dan statistik kecepatan terbaca', dot: 'ok', badge: 'Siap', badgeTone: 'success' }
    : metaErr
      ? { label: 'Basis data', detail: metaErr, dot: 'bad', badge: 'Gagal', badgeTone: 'danger' }
      : { label: 'Basis data', detail: 'Memuat...', dot: 'idle', badge: 'Memuat', badgeTone: 'neutral' };

  let queueRow: StatusRowProps;
  if (statsUnknown) {
    queueRow = { label: 'Antrean render', detail: libraryErr, dot: 'idle', badge: 'Tidak diketahui', badgeTone: 'neutral' };
  } else if (statsLoading) {
    queueRow = { label: 'Antrean render', detail: 'Memuat...', dot: 'idle', badge: 'Memuat', badgeTone: 'neutral' };
  } else if (stats.running > 0) {
    queueRow = {
      label: 'Antrean render',
      detail: `${stats.running} sedang merender${stats.queued > 0 ? `, ${stats.queued} antre` : ''}`,
      dot: 'ok',
      badge: 'Merender',
      badgeTone: 'info',
    };
  } else if (stats.queued > 0) {
    queueRow = { label: 'Antrean render', detail: `${stats.queued} menunggu runner`, dot: 'warn', badge: 'Antre', badgeTone: 'warning' };
  } else {
    queueRow = { label: 'Antrean render', detail: 'Tidak ada pekerjaan aktif', dot: 'ok', badge: 'Kosong', badgeTone: 'success' };
  }

  const checkedAt = health.checkedAt ? new Date(health.checkedAt).toLocaleTimeString('id-ID') : null;
  const quota = meta ? { used: meta.quotaUsed, max: meta.quotaMax } : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatTile
          label="Total pekerjaan"
          value={val(String(stats.total))}
          hint={statsUnknown ? undefined : library.length >= 100 ? 'Dibatasi 100 terbaru' : 'Dalam masa penyimpanan'}
          icon={<ListIcon size={18} />}
          loading={statsLoading}
        />
        <StatTile
          label="Selesai"
          value={val(String(stats.done))}
          hint={!statsUnknown && judged > 0 ? `${Math.round((stats.done / judged) * 100)}% dari yang terproses` : undefined}
          icon={<CheckIcon size={18} />}
          loading={statsLoading}
        />
        <StatTile
          label="Gagal"
          value={val(String(stats.failed))}
          hint={statsUnknown || stats.total === 0 ? undefined : stats.failed > 0 ? 'Alasan ada di Hasil suara' : 'Tidak ada kegagalan'}
          icon={<AlertIcon size={18} />}
          loading={statsLoading}
        />
        <StatTile
          label="Total audio"
          value={val(fmtLongDur(stats.audioSec))}
          hint={statsUnknown ? undefined : 'Dari pekerjaan selesai'}
          icon={<ClockIcon size={18} />}
          loading={statsLoading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="order-2 space-y-4 lg:order-1 lg:col-span-2">
          <Card>
            <CardHeader
              title="Aktivitas terbaru"
              description="Lima pekerjaan terakhir."
              action={
                library.length > 0 ? (
                  <Button variant="ghost" size="sm" onClick={() => onNavigate('results')}>
                    Lihat semua
                  </Button>
                ) : undefined
              }
            />
            {libraryErr && (
              <div className="mb-3">
                <Alert
                  title="Gagal memuat daftar pekerjaan"
                  action={
                    <Button variant="secondary" size="sm" onClick={onRefresh}>
                      Coba lagi
                    </Button>
                  }
                >
                  {libraryErr}
                </Alert>
              </div>
            )}
            {statsLoading ? (
              <ul className="space-y-4" aria-busy="true" aria-label="Memuat aktivitas">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </li>
                ))}
              </ul>
            ) : recent.length > 0 ? (
              <ul className="divide-y divide-line">
                {recent.map((item) => (
                  <li key={item.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 break-words text-sm">{item.preview}</p>
                      <p className="mt-1 text-xs text-muted">
                        {fmtRelative(item.createdAt)} · {MODE_LABEL[item.mode]} · {item.language.toUpperCase()} · {item.chars} karakter
                      </p>
                    </div>
                    <StatusBadge status={item.status} />
                  </li>
                ))}
              </ul>
            ) : !libraryErr ? (
              <EmptyState
                icon={<AudioIcon size={28} />}
                title="Belum ada hasil suara"
                description="Buat suara pertama Anda. Hasil render akan otomatis muncul di sini."
                action={
                  <Button icon={<PlusIcon size={16} />} onClick={() => onNavigate('create')}>
                    Mulai buat suara
                  </Button>
                }
              />
            ) : null}
          </Card>

          <Card>
            <CardHeader
              title="Kecepatan render"
              description="RTF = waktu render dibanding durasi audio; makin kecil makin cepat. Rata-rata dari hingga 30 render selesai terakhir."
            />
            {metaPending ? (
              <div className="space-y-3" aria-busy="true">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {SPEED_STEPS.map(([step, name]) => {
                  const rtf = meta?.rtfByStep[String(step)];
                  return (
                    <li key={step} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                      <span>
                        {name} <span className="text-muted">({step} langkah)</span>
                      </span>
                      <span className={cx('tabular-nums', typeof rtf !== 'number' && 'text-muted')}>
                        {typeof rtf === 'number' ? `RTF ${rtf}` : 'Belum ada data'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="order-1 space-y-4 lg:order-2">
          <Card aria-labelledby="status-layanan">
            <div className="mb-1 flex items-start justify-between gap-3">
              <h2 id="status-layanan" className="text-base font-semibold">
                Status layanan
              </h2>
            </div>
            <ul className="divide-y divide-line">
              <StatusRow {...apiRow} />
              <StatusRow {...dataRow} />
              <StatusRow {...queueRow} />
            </ul>
            {checkedAt && <p className="mt-2 text-xs text-muted">Diperiksa pukul {checkedAt}</p>}
          </Card>

          <Card aria-labelledby="kuota-harian">
            <h2 id="kuota-harian" className="mb-3 text-base font-semibold">
              Kuota harian
            </h2>
            {metaPending ? (
              <div className="space-y-3" aria-busy="true">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-2.5 w-full" />
              </div>
            ) : quota ? (
              <div className="space-y-3">
                <p className="text-3xl font-bold tabular-nums">
                  {quota.used}
                  <span className="text-lg font-medium text-muted"> / {quota.max} job</span>
                </p>
                <ProgressBar value={quotaRatio(quota) * 100} tone={quotaBarTone(quota)} label="Pemakaian kuota harian" />
                <p className="text-xs text-muted">
                  {quota.used >= quota.max
                    ? 'Kuota hari ini habis. Dihitung per hari WIB.'
                    : `Sisa ${quota.max - quota.used} job hari ini. Dihitung per hari WIB.`}
                </p>
                <p className="text-xs text-muted">Maksimal {meta?.maxChars ?? 0} karakter per job.</p>
              </div>
            ) : (
              <Alert
                title="Kuota tidak dapat dimuat"
                action={
                  <Button variant="secondary" size="sm" onClick={onRefresh}>
                    Coba lagi
                  </Button>
                }
              >
                {metaErr || 'Terjadi kesalahan'}
              </Alert>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
