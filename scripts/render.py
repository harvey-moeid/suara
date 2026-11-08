#!/usr/bin/env python3
"""OmniVoice Studio - render TTS di CPU runner GitHub Actions.

Mode Worker (default): klaim job dari Worker, render, unggah hasil.
   env: WORKER_URL, JOB_TOKEN, JOB_ID (opsional), HF_REV (opsional)
Mode lokal (uji/benchmark tanpa Worker):
   python scripts/render.py --local input.json --out out/
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from idnorm import normalize_text, split_chunks  # noqa: E402

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
MODEL_ID = "k2-fsa/OmniVoice"
PAUSE_SEC = 0.25
MAX_REF_SEC = 30.0
UA = "omnivoice-studio-runner/1.0"


class JobError(Exception):
    """Kesalahan yang pesannya aman ditampilkan ke pengguna."""


def log(msg: str) -> None:
    print(msg, flush=True)


def mask(value: object) -> None:
    """Daftarkan nilai sensitif ke ::add-mask:: (per baris) agar tak muncul di log."""
    if not value:
        return
    for line in str(value).splitlines():
        line = line.strip()
        if len(line) >= 4:
            print(f"::add-mask::{line}", flush=True)


# ------------------------------------------------------------------ Worker API
class Api:
    def __init__(self, base: str, token: str):
        self.base = base.rstrip("/")
        self.token = token

    def _headers(self, extra: dict | None = None) -> dict:
        h = {"Authorization": f"Bearer {self.token}", "User-Agent": UA}
        if extra:
            h.update(extra)
        return h

    def _retry(self, fn, tries: int = 4):
        for attempt in range(tries):
            try:
                return fn()
            except urllib.error.HTTPError as e:
                if e.code < 500 or attempt == tries - 1:
                    raise
            except urllib.error.URLError:
                if attempt == tries - 1:
                    raise
            time.sleep(2 * (attempt + 1))

    def json(self, method: str, path: str, obj: dict | None = None) -> dict:
        data = json.dumps(obj).encode() if obj is not None else None

        def go():
            req = urllib.request.Request(
                self.base + path, data=data, method=method,
                headers=self._headers({"Content-Type": "application/json"}),
            )
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read() or b"{}")

        return self._retry(go)

    def download(self, path: str, dest: Path) -> None:
        def go():
            req = urllib.request.Request(self.base + path, headers=self._headers())
            with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
                shutil.copyfileobj(r, f)

        self._retry(go)

    def upload(self, path: str, file: Path) -> None:
        size = file.stat().st_size

        def go():
            with open(file, "rb") as f:
                req = urllib.request.Request(
                    self.base + path, data=f, method="PUT",
                    headers=self._headers({"Content-Type": "application/octet-stream", "Content-Length": str(size)}),
                )
                with urllib.request.urlopen(req, timeout=300) as r:
                    r.read()

        self._retry(go)


# ------------------------------------------------------------------ audio util
def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True)


def probe_duration(path: Path) -> float:
    r = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)])
    try:
        return float(r.stdout.strip())
    except ValueError:
        raise JobError("File audio tidak bisa dibaca")


def prep_ref(raw: Path, wav: Path) -> Path:
    """Ubah referensi ke WAV mono 24 kHz. Dekode dulu agar durasi akurat (webm rekaman tanpa header durasi)."""
    r = run(["ffmpeg", "-nostdin", "-y", "-v", "error", "-t", "60", "-i", str(raw), "-vn",
             "-ac", "1", "-ar", "24000", "-sample_fmt", "s16", str(wav)])
    if r.returncode != 0 or not wav.exists():
        raise JobError("Audio referensi tidak bisa dibaca (format tidak didukung?)")
    dur = probe_duration(wav)
    if dur > MAX_REF_SEC + 0.5:
        raise JobError(f"Audio referensi lebih dari {int(MAX_REF_SEC)} detik")
    if dur < 1.0:
        raise JobError("Audio referensi terlalu pendek (minimal 1 detik, ideal 3-10 detik)")
    return wav


# ------------------------------------------------------------------ model
_MODEL = None
_LOAD_SEC = 0.0


def get_model():
    global _MODEL, _LOAD_SEC
    if _MODEL is None:
        import torch
        from omnivoice import OmniVoice

        torch.set_num_threads(os.cpu_count() or 4)
        t0 = time.time()
        path = MODEL_ID
        try:
            from huggingface_hub import snapshot_download

            path = snapshot_download(MODEL_ID, revision=os.environ.get("HF_REV") or None)
        except Exception as e:  # noqa: BLE001
            log(f"snapshot_download gagal ({type(e).__name__}); pakai from_pretrained langsung")
        _MODEL = OmniVoice.from_pretrained(path, device_map="cpu", dtype=torch.float32)
        _LOAD_SEC = time.time() - t0
        log(f"Model dimuat dalam {_LOAD_SEC:.1f} dtk (threads={torch.get_num_threads()})")
    return _MODEL


# ------------------------------------------------------------------ render
def render_job(inp: dict, work: Path, ref_wav: Path | None, progress) -> dict:
    text = str(inp.get("text") or "")
    mode = str(inp.get("mode") or "auto")
    lang = str(inp.get("language") or "id")
    num_step = int(inp.get("num_step") or 16)
    speed = float(inp.get("speed") or 1.0)
    instruct = str(inp.get("instruct") or "").strip()
    ref_text = str(inp.get("ref_text") or "").strip()

    if not text.strip():
        raise JobError("Teks kosong")
    if mode not in ("auto", "clone", "design"):
        raise JobError("Mode tidak dikenal")
    if mode == "clone" and ref_wav is None:
        raise JobError("Audio referensi tidak tersedia")
    if mode == "design" and not instruct:
        raise JobError("Atribut desain suara kosong")

    chunks = split_chunks(normalize_text(text, indonesian=(lang == "id")))
    if not chunks:
        raise JobError("Teks kosong setelah dibersihkan")
    total = len(chunks)
    progress(0, total)

    model = get_model()
    import numpy as np
    import soundfile as sf

    ids = model.supported_language_ids()
    if lang not in ids:
        raise JobError(f"Bahasa tidak didukung: {lang}")
    sr = int(model.sampling_rate)

    kwargs: dict = {"num_step": num_step}
    if abs(speed - 1.0) > 1e-6:
        kwargs["speed"] = speed

    prompt = None
    if mode == "clone":
        t0 = time.time()
        if not ref_text:
            log("ref_text kosong -> Whisper ASR (large-v3-turbo) memuat dan menstranskripsi referensi")
        prompt = model.create_voice_clone_prompt(ref_audio=str(ref_wav), ref_text=ref_text or None)
        log(f"Prompt kloning siap dalam {time.time() - t0:.1f} dtk")

    parts: list[Path] = []
    t_gen = time.time()
    for i, chunk in enumerate(chunks):
        t0 = time.time()
        gk = dict(kwargs)
        if prompt is not None:
            gk["voice_clone_prompt"] = prompt
        elif mode == "design":
            gk["instruct"] = instruct
        wav = np.ascontiguousarray(model.generate(text=chunk, language=lang, **gk)[0], dtype=np.float32)
        # Auto/design: pakai potongan pertama sebagai referensi suara agar konsisten antarpotongan.
        if prompt is None and total > 1 and i == 0:
            try:
                prompt = model.create_voice_clone_prompt(ref_audio=(wav, sr), ref_text=chunk)
            except Exception as e:  # noqa: BLE001
                log(f"Gagal membuat prompt konsistensi ({type(e).__name__}); suara bisa bervariasi antarpotongan")
        p = work / f"c{i:04d}.wav"
        sf.write(str(p), wav, sr, subtype="PCM_16")
        parts.append(p)
        log(f"potongan {i + 1}/{total}: {time.time() - t0:.1f} dtk -> audio {len(wav) / sr:.1f} dtk")
        progress(i + 1, total)
    elapsed = time.time() - t_gen

    silence = work / "silence.wav"
    sf.write(str(silence), np.zeros(int(sr * PAUSE_SEC), dtype=np.float32), sr, subtype="PCM_16")
    lst = work / "list.txt"
    with open(lst, "w") as f:
        for i, p in enumerate(parts):
            if i:
                f.write(f"file '{silence}'\n")
            f.write(f"file '{p}'\n")
    out_wav, out_mp3 = work / "output.wav", work / "output.mp3"
    r = run(["ffmpeg", "-nostdin", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
             "-af", "loudnorm=I=-18:TP=-1.5:LRA=11", "-ar", str(sr), "-ac", "1", "-c:a", "pcm_s16le", str(out_wav)])
    if r.returncode != 0:
        raise JobError("Gagal menggabungkan audio (ffmpeg)")
    r = run(["ffmpeg", "-nostdin", "-y", "-v", "error", "-i", str(out_wav), "-c:a", "libmp3lame", "-b:a", "128k", str(out_mp3)])
    if r.returncode != 0:
        raise JobError("Gagal membuat MP3 (ffmpeg)")

    audio_sec = probe_duration(out_wav)
    rtf = elapsed / audio_sec if audio_sec > 0 else 0.0
    return {"wav": out_wav, "mp3": out_mp3, "audio_sec": audio_sec, "elapsed_sec": elapsed, "rtf": rtf,
            "chunks": total, "load_sec": _LOAD_SEC}


# ------------------------------------------------------------------ mode Worker
def report_failed(api: Api, jid: str, msg: str) -> None:
    try:
        api.json("POST", f"/api/internal/jobs/{jid}/status", {"status": "failed", "error": msg[:300]})
    except Exception as e:  # noqa: BLE001
        log(f"Gagal melapor status failed ({type(e).__name__})")


def process_remote(api: Api, jid: str, inp: object) -> None:
    work = Path(tempfile.mkdtemp(prefix="job-"))
    try:
        if not isinstance(inp, dict):
            raise JobError("Input job tidak ditemukan")
        for k in ("text", "ref_text", "ref_key", "instruct"):
            mask(inp.get(k))
        log(f"Memproses job {jid[:8]} mode={inp.get('mode')} num_step={inp.get('num_step')} chars={len(str(inp.get('text') or ''))}")

        def progress(done: int, total: int) -> None:
            try:
                api.json("POST", f"/api/internal/jobs/{jid}/progress", {"done": done, "total": total})
            except Exception as e:  # noqa: BLE001
                log(f"progress gagal terkirim ({type(e).__name__})")

        ref_wav = None
        if inp.get("mode") == "clone":
            raw = work / "ref.raw"
            api.download(f"/api/internal/jobs/{jid}/ref", raw)
            ref_wav = prep_ref(raw, work / "ref.wav")
        res = render_job(inp, work, ref_wav, progress)
        api.upload(f"/api/internal/jobs/{jid}/result?fmt=wav", res["wav"])
        api.upload(f"/api/internal/jobs/{jid}/result?fmt=mp3", res["mp3"])
        api.json("POST", f"/api/internal/jobs/{jid}/status", {
            "status": "done", "audio_sec": round(res["audio_sec"], 3),
            "elapsed_sec": round(res["elapsed_sec"], 3), "rtf": round(res["rtf"], 4),
        })
        log(f"Job {jid[:8]} selesai: audio {res['audio_sec']:.1f} dtk, render {res['elapsed_sec']:.1f} dtk, RTF {res['rtf']:.2f}")
    except JobError as e:
        log(f"Job {jid[:8]} gagal: {e}")
        report_failed(api, jid, str(e))
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()  # teks job sudah di-mask di log
        report_failed(api, jid, f"Kesalahan internal render ({type(e).__name__})")
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main_remote() -> int:
    base, token = os.environ.get("WORKER_URL", ""), os.environ.get("JOB_TOKEN", "")
    if not base or not token:
        log("WORKER_URL/JOB_TOKEN belum diatur")
        return 2
    api = Api(base, token)
    targets: list[str] = []
    jid_env = os.environ.get("JOB_ID", "").strip()
    if jid_env:
        if not UUID_RE.match(jid_env):
            log("JOB_ID tidak valid")
            return 2
        targets.append(jid_env)
    done = 0
    while True:
        if targets:
            claim = api.json("POST", "/api/internal/claim", {"job_id": targets.pop(0)})
            if not claim.get("job_id"):
                continue  # sudah diambil/selesai; lanjut ke antrean umum
        else:
            claim = api.json("POST", "/api/internal/claim", {})
            if not claim.get("job_id"):
                break
        process_remote(api, claim["job_id"], claim.get("input"))
        done += 1
    log(f"Selesai. Job diproses di run ini: {done}")
    return 0


# ------------------------------------------------------------------ mode lokal
def main_local(inp_path: str, out_dir: str) -> int:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    inp = json.loads(Path(inp_path).read_text())
    work = Path(tempfile.mkdtemp(prefix="local-"))
    summary: dict = {"status": "failed"}
    code = 1
    try:
        ref_wav = None
        if inp.get("mode") == "clone":
            if not inp.get("ref_path"):
                raise JobError("ref_path wajib untuk mode clone lokal")
            ref_wav = prep_ref(Path(inp["ref_path"]), work / "ref.wav")
        t0 = time.time()
        res = render_job(inp, work, ref_wav, lambda d, t: log(f"progress {d}/{t}"))
        shutil.copy(res["wav"], out / "output.wav")
        shutil.copy(res["mp3"], out / "output.mp3")
        summary = {
            "status": "done", "mode": inp.get("mode"), "num_step": inp.get("num_step"),
            "chars": len(str(inp.get("text") or "")), "chunks": res["chunks"],
            "audio_sec": round(res["audio_sec"], 2), "gen_sec": round(res["elapsed_sec"], 2),
            "rtf": round(res["rtf"], 3), "model_load_sec": round(res["load_sec"], 1),
            "total_sec": round(time.time() - t0, 1),
        }
        code = 0
    except JobError as e:
        summary = {"status": "failed", "error": str(e)}
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        summary = {"status": "failed", "error": f"Kesalahan internal render ({type(e).__name__})"}
    finally:
        shutil.rmtree(work, ignore_errors=True)
    (out / "summary.json").write_text(json.dumps(summary, indent=2))
    log("RINGKASAN: " + json.dumps(summary))
    gh = os.environ.get("GITHUB_STEP_SUMMARY")
    if gh:
        with open(gh, "a") as f:
            f.write("### Hasil render lokal\n\n```json\n" + json.dumps(summary, indent=2) + "\n```\n")
    return code


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--local", metavar="INPUT_JSON", help="jalankan tanpa Worker (uji/benchmark)")
    ap.add_argument("--out", default="out", help="folder keluaran untuk mode lokal")
    a = ap.parse_args()
    sys.exit(main_local(a.local, a.out) if a.local else main_remote())
