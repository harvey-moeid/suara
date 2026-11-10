import type { ReactNode } from 'react';
import type { View } from '../nav';
import { cx } from '../ui/cx';
import { MobileNav } from './MobileNav';
import type { Quota } from './quota';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import type { ApiStatus } from './Topbar';

interface AppShellProps {
  view: View;
  title: string;
  subtitle: string;
  actions?: ReactNode;
  quota: Quota | null;
  apiStatus: ApiStatus;
  resultsCount: number;
  wide: boolean; // Overview memakai lebar penuh; halaman form lebih sempit
  onLogout: () => void;
  children: ReactNode;
}

export function AppShell({ view, title, subtitle, actions, quota, apiStatus, resultsCount, wide, onLogout, children }: AppShellProps) {
  return (
    <div className="min-h-dvh bg-canvas text-fg">
      <a
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-white"
      >
        Lewati ke konten
      </a>

      <Sidebar view={view} resultsCount={resultsCount} quota={quota} onLogout={onLogout} />

      <div className="lg:pl-64">
        <Topbar sectionLabel={title} quota={quota} apiStatus={apiStatus} onLogout={onLogout} />
        <main
          id="main"
          tabIndex={-1}
          className={cx(
            'mx-auto w-full px-4 pb-28 pt-6 outline-none sm:px-6 lg:px-8 lg:pb-12',
            wide ? 'max-w-6xl' : 'max-w-3xl',
          )}
        >
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted sm:text-base">{subtitle}</p>
            </div>
            {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
          </div>
          {children}
        </main>
      </div>

      <MobileNav view={view} />
    </div>
  );
}
