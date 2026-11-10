import { cx } from './cx';

type ProgressTone = 'brand' | 'ok' | 'warn' | 'bad';

const FILL: Record<ProgressTone, string> = {
  brand: 'bg-linear-to-r from-brand to-accent',
  ok: 'bg-ok',
  warn: 'bg-warn',
  bad: 'bg-bad',
};

interface ProgressBarProps {
  value: number; // 0-100
  label: string; // dibacakan pembaca layar
  tone?: ProgressTone;
}

export function ProgressBar({ value, label, tone = 'brand' }: ProgressBarProps) {
  const v = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      className="h-2.5 w-full overflow-hidden rounded-full bg-surface"
    >
      <div
        className={cx('h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none', FILL[tone])}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}
