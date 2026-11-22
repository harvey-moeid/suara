# Ekspresi: tag non-verbal dan jeda

Teks yang dikirim ke OmniVoice melewati `scripts/idnorm.py` (normalisasi) lalu
`scripts/expressive.py` (pelindung ekspresi). Dua hal berikut dipertahankan
agar bisa dipakai untuk membuat suara lebih hidup, termasuk di mode **Clone suara**.

## Tag non-verbal

Tulis tag di dalam teks, mis. `Wah [laughter] lucu sekali.`

Tag yang dikenali (sesuai dokumentasi OmniVoice):

| Jenis | Tag |
| --- | --- |
| Tawa, napas | `[laughter]`, `[sigh]`, `[sniff]` |
| Pertanyaan | `[question-en]`, `[question-ah]`, `[question-oh]`, `[question-ei]`, `[question-yi]` |
| Kejutan | `[surprise-ah]`, `[surprise-oh]`, `[surprise-wa]`, `[surprise-yo]` |
| Lainnya | `[confirmation-en]`, `[dissatisfaction-hnn]` |

- Huruf besar dinormalkan ke huruf kecil (`[Sigh]` menjadi `[sigh]`).
- Kurung siku lain (mis. `[catatan]`) tetap dibuang seperti sebelumnya, isinya tetap terbaca.
- Daftar tag ada di `NONVERBAL_TAGS` pada `scripts/expressive.py`. Tambahkan di sana bila OmniVoice menambah tag baru.
- Beberapa tag berakhiran `-en`, `-ah`, dan sebagainya dilatih dengan data bahasa lain. Efeknya pada bahasa Indonesia perlu didengarkan langsung.

## Elipsis (`...`)

Tiga titik atau lebih (juga karakter `…`) dipertahankan sebagai `...` agar nada menggantung
dan jeda terjaga. Dua titik (`..`) tetap dipadatkan menjadi satu titik seperti sebelumnya.

## Catatan

- Perubahan ini hanya menjaga teks agar sampai ke model apa adanya. Pengaruhnya pada suara
  belum diukur otomatis; dengarkan hasilnya dengan satu atau dua kalimat uji.
- Tag dan elipsis ikut dihitung dalam batas 1500 karakter.
- Uji: `python scripts/test_expressive.py` (dan `python scripts/test_normalize.py` untuk normalisasi dasar).

## Mengapa modul terpisah

`idnorm.py` berisi regex dengan karakter khusus (variation selector, spasi non-standar), jadi
perubahan dibuat sebagai pembungkus (`normalize_expressive`) agar `idnorm.py` tidak tersentuh.
