import type { ReactNode } from 'react';
import { Skeleton } from './Skeleton';

interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  loading?: boolean;
}

export function StatTile({ label, value, hint, icon, loading = false }: StatTileProps) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4 shadow-card" aria-busy={loading || undefined}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">{label}</p>
        {icon && <span className="shrink-0 text-accent">{icon}</span>}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-20" />
      ) : (
        <p className="mt-2 text-2xl font-bold tabular-nums sm:text-3xl">{value}</p>
      )}
      {hint && !loading && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
