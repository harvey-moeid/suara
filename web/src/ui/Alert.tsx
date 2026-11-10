import type { ReactNode } from 'react';
import { cx } from './cx';
import { AlertIcon } from './icons';

type AlertTone = 'error' | 'warning' | 'info';

const BOX: Record<AlertTone, string> = {
  error: 'border-bad/30 bg-bad/10',
  warning: 'border-warn/30 bg-warn/10',
  info: 'border-accent/30 bg-accent/10',
};

const ICON: Record<AlertTone, string> = {
  error: 'text-bad',
  warning: 'text-warn',
  info: 'text-accent',
};

interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}

export function Alert({ tone = 'error', title, children, action }: AlertProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('flex flex-wrap items-start gap-3 rounded-xl border p-3 text-sm text-fg', BOX[tone])}
    >
      <AlertIcon size={18} className={cx('mt-0.5 shrink-0', ICON[tone])} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx('break-words', title && 'mt-0.5 text-muted')}>{children}</div>}
      </div>
      {action}
    </div>
  );
}
