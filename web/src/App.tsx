import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthError, checkAuth, clearPass, fetchAudio, getJob, getMeta, getPass, setPass, submitJob } from './api';
import type { Job, Meta, Mode, SubmitPayload } from './api';
import { loadHistory, saveHistory } from './history';
import type { HistoryItem } from './history';

const LANGS: [string, string][] = [['id', 'Indonesia'], ['jv', 'Jawa'], ['ms', 'Melayu'], ['en', 'Inggris']];
const STEPS: [number, string][] = [[8, 'Draf (8)'], [16, 'Standar (16)'], [32, 'Terbaik (32)']];
const GENDER: [string, string][] = [['', 'Bebas'], ['female', 'Perempuan'], ['male', 'Laki-laki']];
const AGE: [string, string][] = [['', 'Bebas'], ['child', 'Anak'], ['teenager', 'Remaja'], ['young adult', 'Dewasa muda'], ['middle-aged', 'Paruh baya'], ['elderly', 'Lansia']];
const PITCH: [string, string][] = [['', 'Bebas'], ['very low pitch', 'Sangat rendah'], ['low pitch', 'Rendah'], ['moderate pitch', 'Sedang'], ['high pitch', 'Tinggi'], ['very high pitch', 'Sangat tinggi']];
const MODES: [Mode, string][] = [['auto', 'Otomatis'], ['clone', 'Clone suara'], ['design', 'Desain suara']];
const CHARS_PER_SEC = 14; // perkiraan kasar bahasa Indonesia
const STARTUP_SEC = 150; // runner menyala + memuat model (perkiraan)

const card = 'rounded-2xl bg-slate-800/70 p-4 ring-1 ring-slate-700';
const label = 'mb-1 block text-sm font-medium text-slate-300';
const field = 'w-full rounded-xl bg-slate-900 px-3 py-3 text-base text-slate-100 ring-1 ring-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500';
const btn = 'rounded-xl px-4 py-3 text-base font-semibold disabled:opacity-50';

function fmtDur(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return s >= 60 ? `${Math.floor(s / 60)} mnt ${s % 60} dtk` : `${s} dtk`;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Terjadi kesalahan';
}

interface RefState {
  blob: Blob;
  name: string;
  url: string;
}

function Gate({ onOk }: { onOk: () => void }) {
  const [value, setValue] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      if (await checkAuth(value)) {
        setPass(value);
        onOk();
      } else setErr('Passcode salah');
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-5">
      <h1 className="text-2xl font-bold">OmniVoice Studio</h1>
      <p className="text-slate-400">Masukkan passcode untuk memakai aplikasi.</p>
      <input
        type="password"
        className={field}
        placeholder="Passcode"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && value && submit()}
        autoFocus
      />
      {err && <p className="text-sm text-red-400">{err}</p>}
      <button className={`${btn} bg-sky-600 text-white`} disabled={busy || !value} onClick={submit}>
        {busy ? 'Memeriksa...' : 'Masuk'}
      </button>
    </div>
  );
}

function Studio({ onLogout }: { onLogout: () => void }) {
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
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [formErr, setFormErr] = useState('');

  const [meta, setMeta] = useState<Meta | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeId, setActiveId] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [jobErr, setJobErr] = useState('');
  const [mp3Url, setMp3Url] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);

  const lastPayload = useRef<SubmitPayload | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const recChunks = useRef<Blob[]>([]);
  const recTimer = useRef<number | undefined>(undefined);
  const recStart = useRef(0);

  const maxChars = meta?.maxChars ?? 1500;

  const refreshMeta = useCallback(async () => {
    try {
      setMeta(await getMeta());
    } catch (e) {
      if (e instanceof AuthError) onLogout();
    }
  }, [onLogout]);

  useEffect(() => {
    void refreshMeta();
  }, [refreshMeta]);

  const patchHistory = useCallback((id: string, patch: Partial<HistoryItem>) => {
    setHistory((prev) => {
      const next = prev.map((h) => (h.id === id ? { ...h, ...patch } : h));
      saveHistory(next);
      return next;
    });
  }, []);

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
        patchHistory(activeId, { status: j.status });
        if (j.status === 'done' || j.status === 'failed') {
          void refreshMeta();
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
  }, [activeId, onLogout, patchHistory, refreshMeta]);

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

  const acceptRef = (blob: Blob, name: string) => {
    setRef((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { blob, name, url: URL.createObjectURL(blob) };
    });
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
      const item: HistoryItem = { id: r.job_id, createdAt: Date.now(), preview: p.text.slice(0, 60), mode: p.mode, status: 'queued' };
      setHistory((prev) => {
        const next = [item, ...prev];
        saveHistory(next);
        return next;
      });
      setActiveId(r.job_id);
      void refreshMeta();
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
    if (mode === 'clone') {
      if (!ref) return setFormErr('Unggah atau rekam audio referensi dulu');
      if (!consent) return setFormErr('Centang izin memakai suara ini');
    }
    if (mode === 'design' && !instruct) return setFormErr('Pilih minimal satu atribut suara');
    void doSubmit({
      text: t, mode, language, numStep, speed, instruct: mode === 'design' ? instruct : '',
      refText: mode === 'clone' ? refText.trim() : '', consent, ref: mode === 'clone' && ref ? ref.blob : null,
      refName: ref?.name ?? 'ref',
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
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-24">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">OmniVoice Studio</h1>
          <p className="text-sm text-slate-400">Teks ke suara bahasa Indonesia. Dirender di CPU lewat antrean, jadi butuh beberapa menit.</p>
        </div>
        <button className="shrink-0 text-sm text-slate-400 underline" onClick={onLogout}>Keluar</button>
      </header>

      <section className={card}>
        <div className="mb-3 grid grid-cols-3 gap-2">
          {MODES.map(([m, l]) => (
            <button key={m} onClick={() => setMode(m)}
              className={`rounded-xl px-2 py-2 text-sm font-semibold ${mode === m ? 'bg-sky-600 text-white' : 'bg-slate-900 text-slate-300 ring-1 ring-slate-600'}`}>
              {l}
            </button>
          ))}
        </div>

        <label className={label} htmlFor="teks">Teks</label>
        <textarea id="teks" className={`${field} min-h-40`} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Tulis teks yang ingin diubah jadi suara..." />
        <div className={`mt-1 text-right text-xs ${text.length > maxChars ? 'text-red-400' : 'text-slate-400'}`}>{text.length}/{maxChars}</div>

        {mode === 'clone' && (
          <div className="mt-3 space-y-3">
            <div>
              <span className={label}>Suara referensi (3-10 detik, maks 30 detik / 10 MB)</span>
              <div className="flex flex-wrap gap-2">
                <label className={`${btn} cursor-pointer bg-slate-900 text-slate-200 ring-1 ring-slate-600`}>
                  Unggah audio
                  <input type="file" accept="audio/*" className="hidden" onChange={(e) => { onPickFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
                </label>
                {recording ? (
                  <button className={`${btn} bg-red-600 text-white`} onClick={stopRec}>Berhenti ({recSec} dtk)</button>
                ) : (
                  <button className={`${btn} bg-slate-900 text-slate-200 ring-1 ring-slate-600`} onClick={() => void startRec()}>Rekam suara</button>
                )}
              </div>
              {ref && (
                <div className="mt-2 space-y-1">
                  <audio controls src={ref.url} className="w-full" />
                  <p className="truncate text-xs text-slate-400">{ref.name}</p>
                </div>
              )}
            </div>
            <div>
              <label className={label} htmlFor="reftext">Transkrip referensi (opsional)</label>
              <textarea id="reftext" className={`${field} min-h-20`} value={refText} onChange={(e) => setRefText(e.target.value)}
                placeholder="Apa yang diucapkan di audio referensi" maxLength={500} />
              <p className="mt-1 text-xs text-slate-400">Kosong = model Whisper menstranskripsi otomatis di runner. Itu menambah unduhan (~1,6 GB, hanya sekali lalu di-cache) dan waktu. Isi transkrip agar lebih cepat dan akurat.</p>
            </div>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 h-5 w-5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>Saya memiliki izin memakai suara ini.</span>
            </label>
          </div>
        )}

        {mode === 'design' && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            {([['Gender', gender, setGender, GENDER], ['Usia', age, setAge, AGE], ['Nada', pitch, setPitch, PITCH]] as const).map(([l, v, set, opts]) => (
              <div key={l}>
                <label className={label}>{l}</label>
                <select className={field} value={v} onChange={(e) => set(e.target.value)}>
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
            <label className={label} htmlFor="bahasa">Bahasa</label>
            <select id="bahasa" className={field} value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="kualitas">Kualitas</label>
            <select id="kualitas" className={field} value={numStep} onChange={(e) => setNumStep(Number(e.target.value))}>
              {STEPS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-3">
          <label className={label} htmlFor="speed">Kecepatan bicara: {speed.toFixed(2)}x</label>
          <input id="speed" type="range" min={0.7} max={1.3} step={0.05} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-full" />
        </div>

        {estimate() && <p className="mt-3 text-xs text-slate-400">{estimate()}</p>}
        {meta && <p className="mt-1 text-xs text-slate-500">Kuota hari ini: {meta.quotaUsed}/{meta.quotaMax} job</p>}
        {formErr && <p className="mt-3 text-sm text-red-400">{formErr}</p>}

        <button className={`${btn} mt-4 w-full bg-sky-600 text-white`} disabled={busy || recording} onClick={onSubmit}>
          {submitting ? 'Mengirim...' : 'Buat suara'}
        </button>
      </section>

      {(job || jobErr) && (
        <section className={card} aria-live="polite">
          <h2 className="mb-2 text-lg font-semibold">Status</h2>
          {job?.status === 'queued' && <p>Antre. Menunggu runner GitHub Actions menyala (biasanya 1-3 menit, lebih lama bila ada job lain).</p>}
          {job?.status === 'running' && (
            <div className="space-y-2">
              <p>{job.progress.total > 0 ? `Merender potongan ${Math.min(job.progress.done + 1, job.progress.total)} dari ${job.progress.total}` : 'Memuat model...'}</p>
              <div className="h-3 overflow-hidden rounded-full bg-slate-900"><div className="h-full bg-sky-500 transition-all" style={{ width: `${pct}%` }} /></div>
            </div>
          )}
          {job?.status === 'done' && (
            <div className="space-y-3">
              <p className="text-emerald-400">Selesai. Audio {job.audioSec ? fmtDur(job.audioSec) : ''}, render {job.elapsedSec ? fmtDur(job.elapsedSec) : ''}{job.rtf ? ` (RTF ${job.rtf})` : ''}.</p>
              {mp3Url ? <audio controls src={mp3Url} className="w-full" /> : <p className="text-sm text-slate-400">Memuat audio...</p>}
              <div className="flex gap-2">
                {mp3Url && <a className={`${btn} bg-slate-900 text-center text-slate-200 ring-1 ring-slate-600`} href={mp3Url} download={`omnivoice-${job.id.slice(0, 8)}.mp3`}>Unduh MP3</a>}
                <button className={`${btn} bg-slate-900 text-slate-200 ring-1 ring-slate-600`} onClick={() => void downloadWav()}>Unduh WAV</button>
              </div>
            </div>
          )}
          {job?.status === 'failed' && (
            <div className="space-y-3">
              <p className="text-red-400">Gagal: {job.error ?? 'Render gagal'}</p>
              {lastPayload.current && lastPayload.current && <button className={`${btn} bg-amber-600 text-white`} disabled={busy} onClick={() => void doSubmit(lastPayload.current as SubmitPayload)}>Coba lagi</button>}
            </div>
          )}
          {jobErr && <p className="mt-2 text-sm text-red-400">{jobErr}</p>}
          {!job && jobErr && lastPayload.current && (
            <button className={`${btn} mt-3 bg-amber-600 text-white`} disabled={busy} onClick={() => void doSubmit(lastPayload.current as SubmitPayload)}>Coba lagi</button>
          )}
        </section>
      )}

      {history.length > 0 && (
        <section className={card}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Riwayat</h2>
            <button className="text-sm text-slate-400 underline" onClick={() => { setHistory([]); saveHistory([]); }}>Hapus riwayat</button>
          </div>
          <ul className="space-y-2">
            {history.map((h) => (
              <li key={h.id}>
                <button className="w-full rounded-xl bg-slate-900 p-3 text-left ring-1 ring-slate-700" onClick={() => { setJob(null); setJobErr(''); setActiveId(h.id); }}>
                  <span className="block truncate text-sm">{h.preview || '(tanpa teks)'}</span>
                  <span className="text-xs text-slate-400">{new Date(h.createdAt).toLocaleString('id-ID')} | {h.mode} | {h.status}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Server menghapus hasil dan referensi setelah 7 hari.</p>
        </section>
      )}
    </div>
  );
}

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
    checkAuth(p).then((ok) => setState(ok ? 'ok' : 'gate')).catch(() => setState('gate'));
  }, []);
  if (state === 'loading') return <p className="p-6 text-slate-400">Memuat...</p>;
  if (state === 'gate') return <Gate onOk={() => setState('ok')} />;
  return <Studio onLogout={logout} />;
}
