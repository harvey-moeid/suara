import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthError, getHealth, getMeta, listJobs } from '../api';
import type { AudioLibraryItem, Meta } from '../api';
import { errMsg } from '../format';

export interface HealthState {
  status: 'checking' | 'online' | 'offline';
  latencyMs: number | null;
  checkedAt: number | null; // ms epoch
  error: string;
}

// Data lebih tua dari ini dimuat ulang saat pengguna kembali ke Overview.
// /api/jobs memeriksa R2 per baris, jadi sengaja tidak ada polling otomatis.
const STALE_MS = 60_000;

// Sumber data bersama untuk Overview dan Studio. Hanya memanggil endpoint yang sudah ada.
export function useDashboardData(onLogout: () => void) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaErr, setMetaErr] = useState('');
  const [library, setLibrary] = useState<AudioLibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryErr, setLibraryErr] = useState('');
  const [health, setHealth] = useState<HealthState>({ status: 'checking', latencyMs: null, checkedAt: null, error: '' });
  const [refreshing, setRefreshing] = useState(false);
  const loadedAt = useRef(Date.now());

  const refreshMeta = useCallback(async () => {
    try {
      setMeta(await getMeta());
      setMetaErr('');
    } catch (e) {
      if (e instanceof AuthError) onLogout();
      else setMetaErr(errMsg(e));
    } finally {
      setMetaLoading(false);
    }
  }, [onLogout]);

  const refreshLibrary = useCallback(async () => {
    setLibraryLoading(true);
    setLibraryErr('');
    try {
      setLibrary(await listJobs(100));
      loadedAt.current = Date.now();
    } catch (e) {
      if (e instanceof AuthError) onLogout();
      else setLibraryErr(errMsg(e));
    } finally {
      setLibraryLoading(false);
    }
  }, [onLogout]);

  const refreshHealth = useCallback(async () => {
    try {
      const ms = await getHealth();
      setHealth({ status: 'online', latencyMs: ms, checkedAt: Date.now(), error: '' });
    } catch (e) {
      setHealth({ status: 'offline', latencyMs: null, checkedAt: Date.now(), error: errMsg(e) });
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshHealth(), refreshMeta(), refreshLibrary()]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshHealth, refreshMeta, refreshLibrary]);

  const refreshIfStale = useCallback(() => {
    if (Date.now() - loadedAt.current > STALE_MS) void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  return {
    meta,
    metaLoading,
    metaErr,
    library,
    libraryLoading,
    libraryErr,
    setLibraryError: setLibraryErr,
    health,
    refreshing,
    refreshMeta,
    refreshLibrary,
    refreshAll,
    refreshIfStale,
  };
}
