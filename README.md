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
- Lisensi: kode OmniVoice berlisensi Apache-2.0 (metadata paket 0.2.1). Lisensi bobot model dan tokenizer audio belum bisa saya pastikan dari satu sumber resmi; ada sumber pihak ketiga yang menyebut CC-BY-NC untuk bobot dan lisensi terpisah untuk tokenizer. Anggap pemakaian non-komersial sampai dicek langsung di halaman model.
- Mode clone: pakai hanya suara yang Anda punya izinnya.
- Data D1 gratis dibagi seluruh akun (batas baca baris harian berlaku untuk semua database di akun yang sama).

## Pengembangan lokal

```bash
cd web && npm install && npm run build      # hasil ke web/dist
cd ../worker && npm install && npx wrangler dev
python scripts/test_normalize.py            # uji normalisasi teks
```
