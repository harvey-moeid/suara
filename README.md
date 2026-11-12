# OmniVoice Studio

Web teks ke suara bahasa Indonesia dengan opsi clone suara, memakai [OmniVoice](https://github.com/k2-fsa/OmniVoice) (model `k2-fsa/OmniVoice`).
Hosting gratis: Cloudflare Worker + R2 + D1 dan CPU runner GitHub Actions. Tanpa GPU, jadi render berjalan sebagai **antrean asinkron** (menit, bukan real-time).

## Arsitektur

```
UI (React) -> POST /api/jobs -> Worker (Hono): simpan input ke R2, job "queued" di D1, repository_dispatch
  -> GitHub Actions render.yml (CPU): klaim job via /api/internal/*, render, unggah MP3+WAV
  -> UI polling GET /api/jobs/:id tiap 4 dtk -> putar / unduh
```

- `worker/`: Worker TypeScript (Hono) + Static Assets (SPA di `web/dist`), R2 `BUCKET`, D1 `DB`, Cron harian pembersihan (data > 7 hari).
- `web/`: React + Vite + Tailwind, mobile-first, bahasa Indonesia.
- `scripts/render.py`: render di runner (model dimuat sekali per run, semua job antre diproses berurutan). `scripts/idnorm.py`: normalisasi teks Indonesia (terbilang, Rp, %, satuan, singkatan) dan pemecah potongan.
- `.github/workflows/`: `render.yml` (dipicu repository_dispatch), `deploy.yml` (push ke main), `benchmark.yml` (uji kecepatan CPU tanpa Worker).

Runner tidak memegang kunci R2: semua lewat endpoint internal Worker (Bearer `JOB_TOKEN`).

## Suara referensi tersimpan (voice library)

Di mode **Clone suara**, audio referensi bisa disimpan permanen sehingga tidak perlu diunggah ulang.

- Unggah atau rekam referensi, centang izin, isi nama di "Simpan referensi ini sebagai", lalu klik **Simpan suara**.
- Lain kali pilih nama itu dari dropdown **Suara tersimpan**. Transkrip yang disimpan ikut terisi otomatis.
- File disimpan di R2 pada `voices/{id}/ref.{ext}`, metadata di tabel D1 `voices` (migrasi `0002_voices.sql`, otomatis diterapkan oleh `deploy.yml`).
- Cron retensi hanya membersihkan `refs/{jobId}/` dan `jobs/{jobId}/`, jadi `voices/` **tidak ikut terhapus**. Hapus manual lewat tombol **Hapus suara**.
- Batas: 20 suara (konstanta `MAX_VOICES` di `worker/src/index.ts`), tiap file maks 10 MB.
- Job yang dibuat dengan suara tersimpan memakai file yang sama (tidak disalin per job). Bila suara dihapus saat job masih antre, job itu gagal.

Endpoint (semua butuh header `x-passcode`):

| Metode | Path | Fungsi |
| --- | --- | --- |
| GET | `/api/voices` | daftar suara tersimpan |
| POST | `/api/voices` | simpan suara (form: `name`, `ref`, `ref_text`, `consent=true`) |
| GET | `/api/voices/:id/audio` | putar file referensi |
| DELETE | `/api/voices/:id` | hapus suara |
| POST | `/api/jobs` | tambah field `voice_id` (mode clone) untuk memakai suara tersimpan |

## Secret yang harus diisi

**GitHub Secrets** (repo > Settings > Secrets and variables > Actions):

| Nama | Isi |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | API token Cloudflare: Account > Workers Scripts: Edit, Account > D1: Edit (tambah Workers R2 Storage: Edit atau Account Settings: Read bila wrangler meminta) |
| `CLOUDFLARE_ACCOUNT_ID` | ID akun Cloudflare |
| `JOB_TOKEN` | string acak panjang (sama dengan Worker secret) |

Opsional: repository **variable** `WORKER_URL` bila domain Worker berbeda dari `https://omnivoice-studio.harveymoeid.workers.dev`.

**Worker secrets** (dashboard Workers > omnivoice-studio > Settings > Variables and Secrets, atau `wrangler secret put`):

| Nama | Isi |
| --- | --- |
| `JOB_TOKEN` | sama persis dengan GitHub Secret |
| `GITHUB_DISPATCH_TOKEN` | fine-grained PAT khusus repo ini, izin Repository permissions: Contents = Read and write (untuk `repository_dispatch`) |
| `APP_PASSCODE` | passcode untuk masuk aplikasi |

Urutan: deploy dulu (push ke `main` setelah `CLOUDFLARE_*` terisi), baru isi Worker secrets.

## Batas yang perlu diketahui

- Render CPU jauh lebih lambat dari real-time; lihat hasil `benchmark.yml` untuk RTF terukur. Perkiraan waktu di UI memakai RTF job sebelumnya.
- Teks maks 1500 karakter, referensi maks 10 MB dan 30 detik, kuota 20 job per hari (hari WIB), satu render berjalan sekaligus.
- Referensi yang diunggah langsung (tanpa disimpan sebagai suara) dan hasil render tetap dihapus setelah 7 hari. Simpan sebagai suara bila ingin permanen.
- Lisensi: kode OmniVoice berlisensi Apache-2.0 (metadata paket 0.2.1). Lisensi bobot model dan tokenizer audio belum bisa saya pastikan dari satu sumber resmi; ada sumber pihak ketiga yang menyebut CC-BY-NC untuk bobot dan lisensi terpisah untuk tokenizer. Anggap pemakaian non-komersial sampai dicek langsung di halaman model.
- Mode clone: pakai hanya suara yang Anda punya izinnya.
- Data D1 gratis dibagi seluruh akun (batas baca baris harian berlaku untuk semua database di akun yang sama).

## Pengembangan lokal

```bash
cd web && npm install && npm run build      # hasil ke web/dist
cd ../worker && npm install && npx wrangler dev
python scripts/test_normalize.py            # uji normalisasi teks
```
