import { useCallback, useEffect, useState } from 'react';
import { AuthError, deleteVoice, fetchVoiceAudio, listVoices, saveVoice } from './api';
import type { Voice } from './api';
import { errMsg } from './format';
import { BTN_DANGER, BTN_SECONDARY, FIELD, LABEL } from './ui/styles';

interface VoicePickerProps {
  selectedId: string;
  onSelect: (voice: Voice | null) => void;
  // Referensi baru (unggah/rekam) yang belum disimpan; null bila belum ada.
  newRef: { blob: Blob; name: string } | null;
  refText: string;
  consent: boolean;
  onLogout: () => void;
}

// Daftar suara referensi tersimpan (permanen). Memilih satu suara berarti tidak perlu unggah ulang.
// Suara baru bisa disimpan dari unggahan/rekaman yang sedang aktif.
export default function VoicePicker({ selectedId, onSelect, newRef, refText, consent, onLogout }: VoicePickerProps) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [max, setMax] = useState(20);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');

  const fail = useCallback((e: unknown) => {
    if (e instanceof AuthError) onLogout();
    else setErr(errMsg(e));
  }, [onLogout]);

  useEffect(() => {
    let dead = false;
    listVoices()
      .then((r) => {
        if (dead) return;
        setVoices(r.items);
        setMax(r.max);
      })
      .catch((e) => !dead && fail(e))
      .finally(() => !dead && setLoading(false));
    return () => {
      dead = true;
    };
  }, [fail]);

  // Bebaskan blob URL pratinjau saat diganti/komponen dilepas.
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // Pratinjau hanya relevan untuk suara yang sedang dipilih.
  useEffect(() => {
    setPreviewUrl('');
  }, [selectedId]);

  const selected = voices.find((v) => v.id === selectedId) ?? null;

  const preview = async () => {
    if (!selected) return;
    setErr('');
    try {
      setPreviewUrl(await fetchVoiceAudio(selected.id));
    } catch (e) {
      fail(e);
    }
  };

  const save = async () => {
    if (!newRef) return;
    const n = name.trim();
    if (!n) return setErr('Beri nama suara dulu');
    if (!consent) return setErr('Centang izin memakai suara ini dulu');
    setSaving(true);
    setErr('');
    try {
      const v = await saveVoice(n, newRef.blob, newRef.name, refText.trim());
      setVoices((prev) => [v, ...prev]);
      setName('');
      onSelect(v);
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selected) return;
    if (!window.confirm(`Hapus suara "${selected.name}" secara permanen?`)) return;
    setErr('');
    try {
      await deleteVoice(selected.id);
      setVoices((prev) => prev.filter((v) => v.id !== selected.id));
      onSelect(null);
    } catch (e) {
      fail(e);
    }
  };

  return (
    <div className="space-y-2">
      <label className={LABEL} htmlFor="voice-saved">Suara tersimpan ({voices.length}/{max})</label>
      <select id="voice-saved" className={FIELD} value={selectedId} disabled={loading}
        onChange={(e) => onSelect(voices.find((v) => v.id === e.target.value) ?? null)}>
        <option value="">{loading ? 'Memuat...' : '+ Unggah / rekam suara baru'}</option>
        {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>

      {selected && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={() => void preview()}>Putar referensi</button>
            <button type="button" className={BTN_DANGER} onClick={() => void remove()}>Hapus suara</button>
          </div>
          {previewUrl && <audio controls autoPlay src={previewUrl} className="w-full" />}
          <p className="text-xs text-muted">Tersimpan permanen di server, tidak ikut terhapus masa retensi 7 hari. Tidak perlu unggah ulang.</p>
        </div>
      )}

      {!selected && newRef && (
        <div className="space-y-2 rounded-xl border border-line bg-surface p-3">
          <label className={LABEL} htmlFor="voice-name">Simpan referensi ini sebagai</label>
          <input id="voice-name" className={FIELD} value={name} maxLength={60} placeholder="Contoh: Suara saya"
            onChange={(e) => setName(e.target.value)} />
          <button type="button" className={BTN_SECONDARY} disabled={saving || voices.length >= max} onClick={() => void save()}>
            {saving ? 'Menyimpan...' : 'Simpan suara'}
          </button>
          {voices.length >= max && <p className="text-xs text-bad">Penyimpanan penuh. Hapus salah satu suara dulu.</p>}
        </div>
      )}

      {err && <p role="alert" className="text-sm text-bad">{err}</p>}
    </div>
  );
}
