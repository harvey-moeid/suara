# OmniVoice Studio

Web teks ke suara bahasa Indonesia dengan opsi clone suara, memakai [OmniVoice](https://github.com/k2-fsa/OmniVoice) (model `k2-fsa/OmniVoice`).
Hosting gratis: Cloudflare Worker + R2 + D1 dan CPU runner GitHub Actions. Tanpa GPU, jadi render berjalan sebagai **antrean asinkron** (menit, bukan real-time).

## Arsitektur

```
UI (React) -> POST /api/jobs -> Worker (Hono): simpan input ke R2, job "queued" di D1, repository_dispatch
  -> GitHub Actions render.yml (CPU): klaim job via /api/internal/*, render, unggah MP3+WAV
  -> UI polling GET /api/jobs/:id tiap 4 dtk -> putar / unduh
```

- `worker/`: Worker TypeScript (Hono) + Static Assets (SPA di `web/dist`), R2 `BUCKET`, D1 `DB`. Tanpa cron: tidak ada penghapusan otomatis, data hanya terhapus lewat tombol **Hapus** di aplikasi.
- `web/`: React + Vite + Tailwind, mobile-first, bahasa Indonesia.
- `scripts/render.py`: render di runner (model dimuat sekali per run, semua job antre diproses berurutan). `scripts/idnorm.py`: normalisasi teks Indonesia (terbilang, Rp, %, satuan, singkatan) dan pemecah potongan. `scripts/expressive.py`: pembungkus `idnorm` yang mempertahankan tag non-verbal OmniVoice dan elipsis (lihat [Ekspresi](#ekspresi-tag-non-verbal-dan-jeda)).
- `.github/workflows/`: `render.yml` (dipicu repository_dispatch), `deploy.yml` (push ke main), `benchmark.yml` (uji kecepatan CPU tanpa Worker).

Runner tidak memegang kunci R2: semua lewat endpoint internal Worker (Bearer `JOB_TOKEN`).

## Hapus manual

Tidak ada cron. Hasil render dan unggahan referensi tersimpan di R2/D1 sampai Anda menghapusnya.

- **Hasil suara**: halaman Hasil suara punya tombol **Hapus** di tiap item. Menghapus satu job membuang barisnya di D1, teks input, MP3, WAV, dan referensi yang diunggah khusus untuk job itu (`refs/{jobId}/` dan `jobs/{jobId}/`). Suara tersimpan (`voices/`) tidak pernah ikut terhapus.
- Job yang masih antre atau berjalan tidak bisa dihapus (HTTP 409), kecuali sudah lebih dari 8 jam (dianggap macet).
- **Suara tersimpan**: dihapus terpisah lewat tombol **Hapus suara**.
- Pantau pemakaian R2 dan D1 di dashboard Cloudflare agar tidak melewati kuota gratis.

## Suara referensi tersimpan (voice library)

Di mode **Clone suara**, audio referensi bisa disimpan sehingga tidak perlu diunggah ulang.

- Unggah atau rekam referensi, centang izin, isi nama di "Simpan referensi ini sebagai", lalu klik **Simpan suara**.
- Lain kali pilih nama itu dari dropdown **Suara tersimpan**. Transkrip yang disimpan ikut terisi otomatis.
- File disimpan di R2 pada `voices/{id}/ref.{ext}`, metadata di tabel D1 `voices` (migrasi `0002_voices.sql`, otomatis diterapkan oleh `deploy.yml`).
- Hanya terhapus lewat tombol **Hapus suara**.
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
| DELETE | `/api/jobs/:id` | hapus satu hasil suara (job selesai/gagal, atau macet > 8 jam) |

## Ekspresi: tag non-verbal dan jeda

OmniVoice tidak punya parameter intonasi atau emosi untuk mode clone. Intonasi mengikuti gaya audio referensi dan teks, jadi dua hal ini bisa dipakai di dalam teks (berlaku di semua mode):

- **Tag non-verbal**: tulis langsung di teks, mis. `Wah [laughter] lucu sekali.` Tag yang dikenali: `[laughter]`, `[sigh]`, `[sniff]`, `[confirmation-en]`, `[question-en]`, `[question-ah]`, `[question-oh]`, `[question-ei]`, `[question-yi]`, `[surprise-ah]`, `[surprise-oh]`, `[surprise-wa]`, `[surprise-yo]`, `[dissatisfaction-hnn]`. Kurung siku lain tetap dibuang seperti biasa.
- **Elipsis**: `...` (atau `…`) dipertahankan agar nada menggantung dan jeda terjaga. `..` tetap dipadatkan menjadi satu titik.

Tips agar intonasi lebih hidup di mode clone: pakai referensi 3-10 detik dengan gaya bicara ekspresif, isi transkrip referensi dengan akurat, dan pakai tanda baca yang jelas (koma, titik, `?`, `!`).

Catatan: efek tag dan elipsis pada bahasa Indonesia belum diuji dengan audio; dengarkan hasil render uji. Detail dan cara menambah tag ada di [`docs/ekspresi.md`](docs/ekspresi.md).

## Aplikasi Android (PWA)

OmniVoice Studio bisa dipasang di layar utama Android lewat Chrome. Tidak perlu Play Store.

- **Pasang**: buka situs di Chrome Android, lalu ketuk **Pasang** pada banner di atas halaman, atau menu Chrome > **Instal aplikasi**. Aplikasi terbuka layar penuh tanpa bilah alamat. Tekan lama ikonnya untuk pintasan **Buat suara** dan **Hasil suara**.
- **Offline**: cangkang aplikasi tersimpan, jadi aplikasi tetap terbuka tanpa sinyal. Membuat suara dan memutar hasil tetap butuh internet.
- **Pembaruan**: versi baru diunduh di latar belakang. Banner **Versi baru tersedia** muncul, lalu ketuk **Perbarui**. Aplikasi tidak memuat ulang sendiri agar teks atau rekaman yang sedang dikerjakan tidak hilang.
- **Privasi**: service worker tidak pernah menyentuh `/api/*` (passcode, audio, data job). Hanya berkas aplikasi (HTML dan aset build) yang di-cache.

Cara kerja build (`npm run build` di `web/`): setelah `vite build`, `scripts/build-pwa.mjs` membuat ikon PNG (192 dan 512, `any` dan `maskable`) dari `pwa/mascot.png.b64`, lalu menulis `dist/sw.js` dari `pwa/sw.template.js` dengan daftar precache dan versi (hash isi) hasil build. Build gagal bila manifest, ikon, atau aset hilang. Manifest dan header ada di `web/public/` (`manifest.webmanifest`, `_headers`); halaman offline di `web/pwa/offline.html`.

```bash
cd web && npm run test:pwa    # uji perilaku service worker (tanpa browser)
```

Catatan: sumber logo hanya 128 px, jadi ikon 512 px sedikit lembut. Untuk hasil lebih tajam, ganti `pwa/mascot.png.b64` dengan PNG maskot beresolusi lebih tinggi (format 8-bit RGBA atau palet, tanpa interlace).

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
- Tidak ada penghapusan otomatis: hasil render dan referensi yang diunggah langsung (tanpa disimpan sebagai suara) tetap ada di server sampai Anda menekan **Hapus**. Daftar Hasil suara menampilkan 100 pekerjaan terbaru.
- Lisensi: kode OmniVoice berlisensi Apache-2.0 (metadata paket 0.2.1). Lisensi bobot model dan tokenizer audio belum bisa saya pastikan dari satu sumber resmi; ada sumber pihak ketiga yang menyebut CC-BY-NC untuk bobot dan lisensi terpisah untuk tokenizer. Anggap pemakaian non-komersial sampai dicek langsung di halaman model.
- Mode clone: pakai hanya suara yang Anda punya izinnya.
- Data D1 gratis dibagi seluruh akun (batas baca baris harian berlaku untuk semua database di akun yang sama).

## Pengembangan lokal

```bash
cd web && npm install && npm run build      # hasil ke web/dist
cd ../worker && npm install && npx wrangler dev
python scripts/test_normalize.py            # uji normalisasi teks
python scripts/test_expressive.py           # uji tag non-verbal dan elipsis
```
