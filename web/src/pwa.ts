import { useSyncExternalStore } from 'react';

// Status PWA bersama (install, update, online/offline). Listener dipasang sedini mungkin lewat initPwa() di main.tsx
// karena `beforeinstallprompt` bisa terbit sebelum React selesai render.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface PwaState {
  online: boolean;
  standalone: boolean; // sedang berjalan sebagai aplikasi terpasang
  canInstall: boolean; // Chrome Android siap menampilkan dialog pasang, dan pengguna belum menolak baru-baru ini
  updateReady: boolean; // versi baru sudah diunduh dan menunggu persetujuan
}

const DISMISS_KEY = 'ov_pwa_install_dismissed';
const DISMISS_MS = 7 * 24 * 3600 * 1000;
const UPDATE_CHECK_MS = 15 * 60 * 1000;

let state: PwaState = { online: true, standalone: false, canInstall: false, updateReady: false };
const listeners = new Set<() => void>();

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let waitingWorker: ServiceWorker | null = null;
let installed = false;
let updateRequested = false;
let reloading = false;
let started = false;
let standaloneQuery: MediaQueryList | null = null;

function installDismissed(): boolean {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(t) && t > 0 && Date.now() - t < DISMISS_MS;
  } catch {
    return false;
  }
}

function publish(): void {
  const next: PwaState = {
    online: navigator.onLine,
    standalone: standaloneQuery?.matches === true,
    canInstall: deferredPrompt !== null && !installed && !installDismissed(),
    updateReady: waitingWorker !== null,
  };
  if (
    next.online === state.online &&
    next.standalone === state.standalone &&
    next.canInstall === state.canInstall &&
    next.updateReady === state.updateReady
  ) {
    return;
  }
  state = next; // objek baru hanya bila ada perubahan (syarat useSyncExternalStore)
  listeners.forEach((l) => l());
}

function reloadOnce(): void {
  if (reloading) return;
  reloading = true;
  window.location.reload();
}

function trackRegistration(reg: ServiceWorkerRegistration): void {
  // Hanya dianggap "update" bila sudah ada worker yang mengendalikan halaman; instalasi pertama bukan update.
  const checkWaiting = () => {
    if (reg.waiting && navigator.serviceWorker.controller) {
      waitingWorker = reg.waiting;
      publish();
    }
  };
  checkWaiting();
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    if (!w) return;
    w.addEventListener('statechange', () => {
      if (w.state === 'installed') checkWaiting();
    });
  });

  // Aplikasi terpasang bisa berhari-hari di latar belakang tanpa navigasi baru, jadi periksa saat kembali dibuka.
  let lastCheck = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || Date.now() - lastCheck < UPDATE_CHECK_MS) return;
    lastCheck = Date.now();
    reg.update().catch(() => undefined);
  });
}

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Muat ulang hanya bila pengguna yang meminta pembaruan. Tanpa syarat ini, instalasi pertama
    // (clients.claim) juga akan memicu muat ulang.
    if (updateRequested) reloadOnce();
  });

  const register = async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      trackRegistration(reg);
    } catch (e) {
      console.warn('[pwa] service worker gagal didaftarkan', e);
    }
  };
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => void register(), { once: true });
}

export function initPwa(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  standaloneQuery = window.matchMedia('(display-mode: standalone)');
  standaloneQuery.addEventListener('change', publish);
  window.addEventListener('online', publish);
  window.addEventListener('offline', publish);

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // tahan mini-infobar bawaan; dialog dipicu dari tombol kita
    deferredPrompt = e as BeforeInstallPromptEvent;
    publish();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    publish();
  });

  registerServiceWorker();
  publish();
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const ev = deferredPrompt;
  if (!ev) return 'unavailable';
  deferredPrompt = null; // prompt() hanya boleh dipakai satu kali
  publish();
  try {
    await ev.prompt();
    return (await ev.userChoice).outcome;
  } catch {
    return 'dismissed';
  }
}

export function dismissInstall(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* abaikan */
  }
  publish();
}

export function applyUpdate(): void {
  if (!waitingWorker) {
    reloadOnce();
    return;
  }
  updateRequested = true;
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  // Jaring pengaman bila controllerchange tidak terbit.
  window.setTimeout(reloadOnce, 4000);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): PwaState {
  return state;
}

export function usePwa(): PwaState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
