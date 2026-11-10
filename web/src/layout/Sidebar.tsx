import type { View } from '../nav';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { cx } from '../ui/cx';
import { LogoutIcon } from '../ui/icons';
import { Logo } from '../ui/Logo';
import { ProgressBar } from '../ui/ProgressBar';
import { NAV_ITEMS } from './navItems';
import { quotaBarTone, quotaRatio } from './quota';
import type { Quota } from './quota';

interface SidebarProps {
  view: View;
  resultsCount: number;
  quota: Quota | null;
  onLogout: () => void;
}

// Sidebar desktop (lg ke atas). Di bawah lg dipakai MobileNav.
export function Sidebar({ view, resultsCount, quota, onLogout }: SidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
      <div className="flex items-center gap-3 px-5 py-5">
        <Logo size={40} decorative />
        <div className="min-w-0">
          <p className="truncate text-base font-bold leading-tight">OmniVoice</p>
          <p className="text-xs text-muted">Studio suara AI</p>
        </div>
      </div>

      <nav aria-label="Navigasi utama" className="flex-1 space-y-1 px-3 py-2">
        {NAV_ITEMS.map((item) => {
          const active = item.view === view;
          return (
            <a
              key={item.view}
              href={`#/${item.view}`}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                active ? 'bg-brand/15 text-fg ring-1 ring-brand/40' : 'text-muted hover:bg-card hover:text-fg',
              )}
            >
              <span className={active ? 'text-accent' : undefined}>{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.view === 'results' && resultsCount > 0 && <Badge tone="neutral">{resultsCount}</Badge>}
            </a>
          );
        })}
      </nav>

      <div className="space-y-4 border-t border-line p-4">
        {quota && (
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-muted">Kuota hari ini</span>
              <span className="tabular-nums text-fg">
                {quota.used}/{quota.max}
              </span>
            </div>
            <ProgressBar value={quotaRatio(quota) * 100} tone={quotaBarTone(quota)} label="Pemakaian kuota harian" />
          </div>
        )}
        <Button variant="secondary" size="sm" className="w-full" icon={<LogoutIcon size={16} />} onClick={onLogout}>
          Keluar
        </Button>
      </div>
    </aside>
  );
}
