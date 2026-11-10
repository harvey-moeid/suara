import { cx } from './cx';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('animate-pulse rounded-lg bg-line/60 motion-reduce:animate-none', className)} />;
}
