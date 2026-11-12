import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthError, fetchAudio, getJob, submitJob } from './api';
import type { AudioLibraryItem, Job, Meta, Mode, SubmitPayload, Voice } from './api';
import { errMsg, fmtDur, MODE_LABEL } from './format';
import type { View } from './nav';
import { Button } from './ui/Button';
import { cx } from './ui/cx';
import { EmptyState } from './ui/EmptyState';
import { AudioIcon, RefreshIcon } from './ui/icons';
import { ProgressBar } from './ui/ProgressBar';
import { StatusBadge } from './ui/StatusBadge';
import { BTN, BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, BTN_WARN, CARD, FIELD, LABEL } from './ui/styles';
import VoicePicker from './VoicePicker';

const LANGS: [string, string][] = [['id', 'Indonesia'], ['jv', 'Jawa'], ['ms', 'Melayu'], ['en', 'Inggris']];
const STEPS: [number, string][] = [[8, 'Draf (8)'], [16, 'Standar (16)'], [32, 'Terbaik (32)']];
const GENDER: [string, string][] = [['', 'Bebas'], ['female', 'Perempuan'], ['male', 'Laki-laki']];
const AGE: [string, string][] = [['', 'Bebas'], ['child', 'Anak'], ['teenager', 'Remaja'], ['young adult', 'Dewasa muda'], ['middle-aged', 'Paruh baya'], ['elderly', 'Lansia']];
const PITCH: [string, string][] = [['', 'Bebas'], ['very low pitch', 'Sangat rendah'], ['low pitch', 'Rendah'], ['moderate pitch', 'Sedang'], ['high pitch', 'Tinggi'], ['very high pitch', 'Sangat tinggi']];
const MODES: [Mode, string][] = [['auto', 'Otomatis'], ['clone', 'Clone suara'], ['design', 'Desain suara']];
const CHARS_PER_SEC = 14; // perkiraan kasar bahasa Indonesia
const STARTUP_SEC = 150; // runner menyala + memuat model (perkiraan)

interface RefState {
  blob: Blob;
  name: string;
  url: string;
}

interface StudioProps {
  view: 'create' | 'results';
  onNavigate: (v: View) => void;
  onLogout: () => void;
  meta: Meta | null;
  library: AudioLibraryItem[];
  libraryLoading: boolean;
  libraryErr: string;
  onLibraryError: (msg: string) => void;
  refreshMeta: () => Promise<void>;
  refreshLibrary: () => Promise<void>;
}

// Logika generator tidak diubah dari versi sebelumnya. Perbedaan Phase 1:
// meta/library kini datang dari props (hook bersama), tab dikendalikan shell, dan kelas visual memakai design tokens.
// Suara tersimpan: di mode clone, pengguna bisa memilih suara tersimpan (voiceId) alih-alih unggah ulang referensi.
export default function Studio({
  view,
  onNavigate,
  onLogout,
  meta,
  library,
  libraryLoading,
  libraryErr,
  onLibraryError,
  refreshMeta,
  refreshLibrary,
}: StudioProps) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<Mode>('auto');
  const [language, setLanguage] = useState('id');
  const [numStep, setNumStep] = useState(16);
  const [speed, setSpeed] = useState(1);
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [pitch, setPitch] = useState('');
  const [whisper, setWhisper] = useState(false);
  const [refText, setRefText] = useState('');
  const [consent, setConsent] = useState(false);
  const [ref, setRef] = useState<RefState | null>(null);
  const [voiceId, setVoiceId] = useState('');
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [formErr, setFormErr] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [activeId, setActiveId] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [jobErr, setJobErr] = useState('');
  const [mp3Url, setMp3Url] = useState('');

  const lastPayload = useRef<SubmitPayload | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const recChunks = useRef<Blob[]>([]);
  const recTimer = useRef<number | undefined>(undefined);
  const recStart = useRef(0);

  const maxChars = meta?.maxChars ?? 1500;

  useEffect(() => {
    if (view === 'results') void refreshLibrary();
  }, [view, refreshLibrary]);

  // Polling status job tiap 4 detik sampai done/failed.
  useEffect(() => {
    if (!activeId) return;
    let stop = false;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const j = await getJob(activeId);
        if (stop) return;
        setJob(j);
        setJobErr('');
        if (j.status === 'done' || j.status === 'failed') {
          void refreshMeta();
          void refreshLibrary();
          return;
        }
      } catch (e) {
        if (stop) return;
        if (e instanceof AuthError) {
          onLogout();
          return;
        }
        setJobErr(errMsg(e));
        if (errMsg(e).includes('tidak ditemukan')) return;
      }
      timer = window.setTimeout(tick, 4000);
    };
    void tick();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [activeId, onLogout, refreshLibrary, refreshMeta]);

  // Muat MP3 untuk pemutar saat selesai.
  useEffect(() => {
    if (!job || job.status !== 'done') return;
    let url = '';
    let dead = false;
    fetchAudio(job.id, 'mp3')
      .then((u) => {
        if (dead) URL.revokeObjectURL(u);
        else {
          url = u;
          setMp3Url(u);
        }
      })
      .catch((e) => !dead && setJobErr(errMsg(e)));
    return () => {
      dead = true;
      if (url) URL.revokeObjectURL(url);
      setMp3Url('');
    };
  }, [job?.id, job?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Referensi baru (unggah/rekam) otomatis melepas pilihan suara tersimpan.
  const acceptRef = (blob: Blob, name: string) => {
    setVoiceId('');
    setRef((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { blob, name, url: URL.createObjectURL(blob) };
    });
  };

  const onSelectVoice = (v: Voice | null) => {
    setVoiceId(v ? v.id : '');
    setFormErr('');
    if (v && v.refText) setRefText(v.refText);
  };

  const onPickFile = (f: File | null) => {
    if (!f) return;
    setFormErr('');
    if (f.size > 10 * 1024 * 1024) {
      setFormErr('Audio referensi maksimal 10 MB');
      return;
    }
    const probe = URL.createObjectURL(f);
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => {
      URL.revokeObjectURL(probe);
      if (Number.isFinite(a.duration) && a.duration > 30) setFormErr('Audio referensi maksimal 30 detik');
      else acceptRef(f, f.name);
    };
    a.onerror = () => {
      URL.revokeObjectURL(probe);
      acceptRef(f, f.name); // browser tak bisa membaca; biarkan server yang memeriksa
    };
    a.src = probe;
  };

  const stopRec = useCallback(() => {
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
  }, []);

  const startRec = async () => {
    setFormErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      recChunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) recChunks.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        window.clearInterval(recTimer.current);
        setRecording(false);
        const dur = (Date.now() - recStart.current) / 1000;
        if (dur < 2) {
          setFormErr('Rekaman terlalu pendek. Ulangi (ideal 3-10 detik).');
          return;
        }
        acceptRef(new Blob(recChunks.current, { type: rec.mimeType || 'audio/webm' }), 'rekaman');
      };
      recRef.current = rec;
      recStart.current = Date.now();
      setRecSec(0);
      rec.start();
      setRecording(true);
      recTimer.current = window.setInterval(() => {
        const s = (Date.now() - recStart.current) / 1000;
        setRecSec(Math.floor(s));
        if (s >= 15) stopRec();
      }, 250);
    } catch {
      setFormErr('Mikrofon tidak bisa diakses. Izinkan akses mikrofon atau unggah file audio.');
    }
  };

  const instruct = [gender, age, pitch, whisper ? 'whisper' : ''].filter(Boolean).join(', ');

  const estimate = (): string => {
    const audioSec = text.trim().length / CHARS_PER_SEC / speed;
    const rtf = meta?.rtfByStep[String(numStep)];
    if (!text.trim()) return '';
    if (!rtf) return 'Belum ada data kecepatan untuk setelan ini; render pertama akan mengukurnya. CPU jauh lebih lambat dari real-time.';
    const total = audioSec * rtf + STARTUP_SEC;
    return `Perkiraan: sekitar ${Math.max(1, Math.ceil(total / 60))} menit (audio ~${fmtDur(audioSec)}, RTF terakhir ${rtf}).`;
  };

  const doSubmit = async (p: SubmitPayload) => {
    setSubmitting(true);
    setJobErr('');
    setJob(null);
    try {
      lastPayload.current = p;
      const r = await submitJob(p);
      setActiveId(r.job_id);
      onNavigate('results');
      void refreshMeta();
      void refreshLibrary();
    } catch (e) {
      if (e instanceof AuthError) onLogout();
      else setJobErr(errMsg(e));
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = () => {
    setFormErr('');
    const t = text.trim();
    if (!t) return setFormErr('Teks masih kosong');
    if (t.length > maxChars) return setFormErr(`Teks terlalu panjang (maks ${maxChars} karakter)`);
    if (mode === 'clone' && !voiceId) {
      if (!ref) return setFormErr('Pilih suara tersimpan, atau unggah/rekam audio referensi dulu');
      if (!consent) return setFormErr('Centang izin memakai suara ini');
    }
    if (mode === 'design' && !instruct) return setFormErr('Pilih minimal satu atribut suara');
    void doSubmit({
      text: t, mode, language, numStep, speed, instruct: mode === 'design' ? instruct : '',
      refText: mode === 'clone' ? refText.trim() : '', consent,
      ref: mode === 'clone' && !voiceId && ref ? ref.blob : null,
      refName: ref?.name ?? 'ref',
      voiceId: mode === 'clone' ? voiceId : '',
    });
  };

  const downloadWav = async () => {
    if (!job) return;
    try {
      const url = await fetchAudio(job.id, 'wav');
      const a = document.createElement('a');
      a.href = url;
      a.download = `omnivoice-${job.id.slice(0, 8)}.wav`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setJobErr(errMsg(e));
    }
  };

  const pct = job && job.progress.total > 0 ? Math.round((job.progress.done / job.progress.total) * 100) : 0;
  const busy = submitting || (!!job && (job.status === 'queued' || job.status === 'running'));

  return (
    <div className="space-y-4">
      {view === 'create' && <section className={CARD}>
        <div role="group" aria-label="Mode suara" className="mb-4 grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface p-1">
          {MODES.map(([m, l]) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
              className={cx('min-h-10 rounded-lg px-2 text-sm font-semibold transition-colors', mode === m ? 'bg-brand text-white' : 'text-muted hover:text-fg')}>
              {l}
            </button>
          ))}
        </div>

        <label className={LABEL} htmlFor="teks">Teks</label>
        <textarea id="teks" className={`${FIELD} min-h-40`} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Tulis teks yang ingin diubah jadi suara..." />
        <div className={`mt-1 text-right text-xs ${text.length > maxChars ? 'text-bad' : 'text-muted'}`}>{text.length}/{maxChars}</div>

        {mode === 'clone' && (
          <div className="mt-3 space-y-3">
            <VoicePicker
              selectedId={voiceId}
              onSelect={onSelectVoice}
              newRef={ref ? { blob: ref.blob, name: ref.name } : null}
              refText={refText}
              consent={consent}
              onLogout={onLogout}
            />
            {!voiceId && (
              <div>
                <span className={LABEL}>Suara referensi (3-10 detik, maks 30 detik / 10 MB)</span>
                <div className="flex flex-wrap gap-2">
                  <label className={`${BTN_SECONDARY} cursor-pointer`}>
                    Unggah audio
                    <input type="file" accept="audio/*" className="hidden" onChange={(e) => { onPickFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
                  </label>
                  {recording ? (
                    <button type="button" className={BTN_DANGER} onClick={stopRec}>Berhenti ({recSec} dtk)</button>
                  ) : (
                    <button type="button" className={BTN_SECONDARY} onClick={() => void startRec()}>Rekam suara</button>
                  )}
                </div>
                {ref && (
                  <div className="mt-2 space-y-1">
                    <audio controls src={ref.url} className="w-full" />
                    <p className="truncate text-xs text-muted">{ref.name}</p>
                  </div>
                )}
              </div>
            )}
            <div>
              <label className={LABEL} htmlFor="reftext">Transkrip referensi (opsional)</label>
              <textarea id="reftext" className={`${FIELD} min-h-20`} value={refText} onChange={(e) => setRefText(e.target.value)}
                placeholder="Apa yang diucapkan di audio referensi" maxLength={500} />
              <p className="mt-1 text-xs text-muted">Kosong = model Whisper menstranskripsi otomatis di runner. Itu menambah unduhan (~1,6 GB, hanya sekali lalu di-cache) dan waktu. Isi transkrip agar lebih cepat dan akurat.</p>
            </div>
            {!voiceId && (
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-1 h-5 w-5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>Saya memiliki izin memakai suara ini.</span>
              </label>
            )}
          </div>
        )}

        {mode === 'design' && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            {([['Gender', gender, setGender, GENDER], ['Usia', age, setAge, AGE], ['Nada', pitch, setPitch, PITCH]] as const).map(([l, v, set, opts]) => (
              <div key={l}>
                <label className={LABEL} htmlFor={`attr-${l}`}>{l}</label>
                <select id={`attr-${l}`} className={FIELD} value={v} onChange={(e) => set(e.target.value)}>
                  {opts.map(([val, name]) => <option key={val} value={val}>{name}</option>)}
                </select>
              </div>
            ))}
            <label className="flex items-center gap-3 self-end pb-3 text-sm">
              <input type="checkbox" className="h-5 w-5" checked={whisper} onChange={(e) => setWhisper(e.target.checked)} />
              Berbisik
            </label>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL} htmlFor="bahasa">Bahasa</label>
            <select id="bahasa" className={FIELD} value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="kualitas">Kualitas</label>
            <select id="kualitas" className={FIELD} value={numStep} onChange={(e) => setNumStep(Number(e.target.value))}>
              {STEPS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-3">
          <label className={LABEL} htmlFor="speed">Kecepatan bicara: {speed.toFixed(2)}x</label>
          <input id="speed" type="range" min={0.7} max={1.3} step={0.05} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-full" />
        </div>

        {estimate() && <p className="mt-3 text-xs text-muted">{estimate()}</p>}
        {meta && <p className="mt-1 text-xs text-muted">Kuota hari ini: {meta.quotaUsed}/{meta.quotaMax} job</p>}
        {formErr && <p role="alert" className="mt-3 text-sm text-bad">{formErr}</p>}

        <button type="button" className={`${BTN_PRIMARY} mt-4 w-full`} disabled={busy || recording} onClick={onSubmit}>
          {submitting ? 'Mengirim...' : 'Buat suara'}
        </button>
      </section>}

      {(job || jobErr) && (
        <section className={CARD} aria-live="polite">
          <h2 className="mb-2 text-lg font-semibold">Status</h2>
          {job?.status === 'queued' && <p>Antre. Menunggu runner GitHub Actions menyala (biasanya 1-3 menit, lebih lama bila ada job lain).</p>}
          {job?.status === 'running' && (
            <div className="space-y-2">
              <p>{job.progress.total > 0 ? `Merender potongan ${Math.min(job.progress.done + 1, job.progress.total)} dari ${job.progress.total}` : 'Memuat model...'}</p>
              <ProgressBar value={pct} label="Progres render" />
            </div>
          )}
          {job?.status === 'done' && (
            <div className="space-y-3">
              <p className="text-ok">Selesai. Audio {job.audioSec ? fmtDur(job.audioSec) : ''}, render {job.elapsedSec ? fmtDur(job.elapsedSec) : ''}{job.rtf ? ` (RTF ${job.rtf})` : ''}.</p>
              {mp3Url ? <audio controls src={mp3Url} className="w-full" /> : <p className="text-sm text-muted">Memuat audio...</p>}
              <div className="flex gap-2">
                {mp3Url && <a className={`${BTN_SECONDARY} text-center`} href={mp3Url} download={`omnivoice-${job.id.slice(0, 8)}.mp3`}>Unduh MP3</a>}
                <button type="button" className={BTN_SECONDARY} onClick={() => void downloadWav()}>Unduh WAV</button>
              </div>
            </div>
          )}
          {job?.status === 'failed' && (
            <div className="space-y-3">
              <p className="text-bad">Gagal: {job.error ?? 'Render gagal'}</p>
              {lastPayload.current && <button type="button" className={BTN_WARN} disabled={busy} onClick={() => void doSubmit(lastPayload.current as SubmitPayload)}>Coba lagi</button>}
            </div>
          )}
          {jobErr && <p className="mt-2 text-sm text-bad">{jobErr}</p>}
          {!job && jobErr && lastPayload.current && (
            <button type="button" className={`${BTN_WARN} mt-3`} disabled={busy} onClick={() => void doSubmit(lastPayload.current as SubmitPayload)}>Coba lagi</button>
          )}
        </section>
      )}

      {view === 'results' && (
        <section className={CARD}>
          <div className="mb-3 flex items-center justify-end">
            <Button variant="ghost" size="sm" icon={<RefreshIcon size={16} />} onClick={() => void refreshLibrary()} loading={libraryLoading}>
              {libraryLoading ? 'Memuat...' : 'Segarkan'}
            </Button>
          </div>
          {libraryErr && <p role="alert" className="mb-3 text-sm text-bad">{libraryErr}</p>}
          {libraryLoading && library.length === 0 && <p className="text-sm text-muted">Memuat daftar hasil...</p>}
          {!libraryLoading && library.length === 0 && !libraryErr && (
            <EmptyState
              icon={<AudioIcon size={28} />}
              title="Belum ada hasil suara"
              description="Buat suara pertama. Hasil render akan otomatis muncul di sini."
              action={<button type="button" className={BTN_PRIMARY} onClick={() => onNavigate('create')}>Mulai buat suara</button>}
            />
          )}
          <ul className="space-y-3">
            {library.map((item) => (
              <li key={item.id} className="rounded-xl border border-line bg-surface p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 whitespace-pre-wrap break-words text-sm">{item.preview}</p>
                  <StatusBadge status={item.status} />
                </div>
                <p className="mt-2 text-xs text-muted">{new Date(item.createdAt * 1000).toLocaleString('id-ID')} · {MODE_LABEL[item.mode]} · {item.language.toUpperCase()} · {item.chars} karakter</p>
                {item.status === 'done' && item.hasAudio ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className={BTN_PRIMARY} onClick={() => { setJob(null); setJobErr(''); setActiveId(item.id); }}>Putar / buka</button>
                    <button type="button" className={BTN_SECONDARY} onClick={async () => {
                      try {
                        const url = await fetchAudio(item.id, 'mp3');
                        const a = document.createElement('a'); a.href = url; a.download = `suara-${item.id.slice(0, 8)}.mp3`; a.click();
                        window.setTimeout(() => URL.revokeObjectURL(url), 10000);
                      } catch (e) { onLibraryError(errMsg(e)); }
                    }}>Unduh MP3</button>
                    <button type="button" className={BTN_SECONDARY} onClick={async () => {
                      try {
                        const url = await fetchAudio(item.id, 'wav');
                        const a = document.createElement('a'); a.href = url; a.download = `suara-${item.id.slice(0, 8)}.wav`; a.click();
                        window.setTimeout(() => URL.revokeObjectURL(url), 10000);
                      } catch (e) { onLibraryError(errMsg(e)); }
                    }}>Unduh WAV</button>
                  </div>
                ) : item.status === 'failed' ? (
                  <p className="mt-2 text-xs text-bad">{item.error || 'Render gagal'}</p>
                ) : (
                  <button type="button" className="mt-3 text-sm text-accent underline" onClick={() => { setJob(null); setJobErr(''); setActiveId(item.id); }}>Lihat progres</button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Maksimal 100 pekerjaan terbaru. Data dan file audio hasil di server mengikuti masa retensi 7 hari. Suara referensi yang disimpan (Clone suara) tidak ikut terhapus.</p>
        </section>
      )}
    </div>
  );
}
