import { useCallback, useEffect, useState } from 'react';
import { isView } from '../nav';
import type { View } from '../nav';

// Navigasi berbasis hash (#/overview, #/create, #/results): mendukung tombol Back dan muat ulang halaman.
function readHash(): View | null {
  const h = window.location.hash.replace(/^#\/?/, '');
  return isView(h) ? h : null;
}

export function useView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>(() => readHash() ?? 'overview');

  useEffect(() => {
    const onHash = () => {
      const v = readHash();
      if (v) setView(v);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((v: View) => {
    setView(v);
    if (window.location.hash !== `#/${v}`) window.location.hash = `#/${v}`;
  }, []);

  return [view, go];
}
