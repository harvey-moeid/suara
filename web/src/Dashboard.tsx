import { useEffect } from 'react';
import { useDashboardData } from './hooks/useDashboardData';
import { useView } from './hooks/useView';
import { AppShell } from './layout/AppShell';
import { PAGE_COPY } from './nav';
import Overview from './pages/Overview';
import Studio from './Studio';
import { Button } from './ui/Button';
import { PlusIcon, RefreshIcon } from './ui/icons';

// Root area setelah login: menyediakan shell (sidebar/topbar/bottom nav) dan data bersama.
export default function Dashboard({ onLogout }: { onLogout: () => void }) {
  const data = useDashboardData(onLogout);
  const [view, go] = useView();
  const { refreshIfStale, refreshAll } = data;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);

  useEffect(() => {
    if (view === 'overview') refreshIfStale();
  }, [view, refreshIfStale]);

  const copy = PAGE_COPY[view];
  const quota = data.meta ? { used: data.meta.quotaUsed, max: data.meta.quotaMax } : null;

  const actions =
    view === 'overview' ? (
      <>
        <Button variant="secondary" size="sm" icon={<RefreshIcon size={16} />} loading={data.refreshing} onClick={() => void refreshAll()}>
          Segarkan
        </Button>
        <Button size="sm" icon={<PlusIcon size={16} />} onClick={() => go('create')}>
          Buat suara
        </Button>
      </>
    ) : undefined;

  return (
    <AppShell
      view={view}
      title={copy.title}
      subtitle={copy.subtitle}
      actions={actions}
      quota={quota}
      apiStatus={data.health.status}
      resultsCount={data.library.length}
      wide={view === 'overview'}
      onLogout={onLogout}
    >
      {view === 'overview' && (
        <Overview
          meta={data.meta}
          metaLoading={data.metaLoading}
          metaErr={data.metaErr}
          library={data.library}
          libraryLoading={data.libraryLoading}
          libraryErr={data.libraryErr}
          health={data.health}
          onNavigate={go}
          onRefresh={() => void refreshAll()}
        />
      )}
      {/* Studio tetap ter-mount agar teks, rekaman, dan polling job tidak hilang saat pindah ke Ringkasan. */}
      <div hidden={view === 'overview'}>
        <Studio
          view={view === 'results' ? 'results' : 'create'}
          onNavigate={go}
          onLogout={onLogout}
          meta={data.meta}
          library={data.library}
          libraryLoading={data.libraryLoading}
          libraryErr={data.libraryErr}
          onLibraryError={data.setLibraryError}
          refreshMeta={data.refreshMeta}
          refreshLibrary={data.refreshLibrary}
        />
      </div>
    </AppShell>
  );
}
