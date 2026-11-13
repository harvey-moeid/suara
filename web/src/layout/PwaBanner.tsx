import { useState } from 'react';
import { applyUpdate, dismissInstall, promptInstall, usePwa } from '../pwa';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';

// Pemberitahuan PWA: offline, versi baru, dan ajakan memasang aplikasi. Tidak merender apa pun bila tidak ada yang perlu ditampilkan.
export function PwaBanner() {
  const pwa = usePwa();
  const [updating, setUpdating] = useState(false);

  if (pwa.online && !pwa.updateReady && !pwa.canInstall) return null;

  return (
    <div className="mb-6 space-y-3">
      {!pwa.online && (
        <Alert tone="warning" title="Anda sedang offline">
          Membuat suara dan membuka hasil butuh koneksi internet. Aplikasi tetap bisa dibuka.
        </Alert>
      )}
      {pwa.updateReady && (
        <Alert
          tone="info"
          title="Versi baru tersedia"
          action={
            <Button
              size="sm"
              loading={updating}
              onClick={() => {
                setUpdating(true);
                applyUpdate();
              }}
            >
              Perbarui
            </Button>
          }
        >
          Teks atau rekaman yang belum dikirim akan hilang saat aplikasi dimuat ulang.
        </Alert>
      )}
      {pwa.canInstall && (
        <Alert
          tone="info"
          title="Pasang OmniVoice di Android"
          action={
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={dismissInstall}>
                Nanti
              </Button>
              <Button size="sm" onClick={() => void promptInstall()}>
                Pasang
              </Button>
            </div>
          }
        >
          Buka dari layar utama tanpa bilah alamat browser.
        </Alert>
      )}
    </div>
  );
}
