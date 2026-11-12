import { useCallback, useEffect, useState } from 'react';
import { checkAuth, clearPass, getPass } from './api';
import Dashboard from './Dashboard';
import Gate from './Gate';
import { SpinnerIcon } from './ui/icons';

export default function App() {
  const [state, setState] = useState<'loading' | 'gate' | 'ok'>('loading');
  const logout = useCallback(() => {
    clearPass();
    setState('gate');
  }, []);

  useEffect(() => {
    const p = getPass();
    if (!p) {
      setState('gate');
      return;
    }
    // Offline (mis. aplikasi terpasang dibuka tanpa sinyal): passcode tersimpan tetap dipakai dan dashboard dibuka,
    // jangan lempar ke layar passcode. Passcode salah tetap terdeteksi (401) begitu data dimuat saat online.
    checkAuth(p)
      .then((ok) => setState(ok ? 'ok' : 'gate'))
      .catch(() => setState(navigator.onLine ? 'gate' : 'ok'));
  }, []);

  if (state === 'loading') {
    return (
      <div role="status" className="flex min-h-dvh items-center justify-center gap-3 text-muted">
        <SpinnerIcon className="animate-spin motion-reduce:animate-none" />
        Memuat...
      </div>
    );
  }
  if (state === 'gate') return <Gate onOk={() => setState('ok')} />;
  return <Dashboard onLogout={logout} />;
}
