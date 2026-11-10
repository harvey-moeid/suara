import type { ReactNode } from 'react';
import { cx } from './cx';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-line/60 text-fg',
  info: 'bg-accent/15 text-accent',
  success: 'bg-ok/15 text-ok',
  warning: 'bg-warn/15 text-warn',
  danger: 'bg-bad/15 text-bad',
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={cx('inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', TONE[tone])}>
      {children}
    </span>
  );
}
