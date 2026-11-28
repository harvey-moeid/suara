# Tips menulis narasi untuk suara

Panduan singkat menulis teks yang enak dibacakan TTS. Aturan teknis diambil dari
`worker/src/index.ts` dan `scripts/` (lihat juga `docs/ekspresi.md` dan
`docs/tanda-baca.md`).

## Batas dan mode

- Teks maksimal 1500 karakter. Tag dan `...` ikut dihitung.
- Mode: `auto`, `clone`, atau `design`.
- `clone`: audio referensi maksimal 10 MB, transkrip referensi maksimal 500 karakter,
  wajib centang izin memakai suara referensi. Suara tersimpan maksimal 20.
- `design`: atribut hanya dari daftar berikut, dipisah koma (contoh: `female, young adult, low pitch`):
  `male`, `female`, `child`, `teenager`, `young adult`, `middle-aged`, `elderly`,
  `very low pitch`, `low pitch`, `moderate pitch`, `high pitch`, `very high pitch`, `whisper`.
- `num_step` hanya 8, 16, atau 32. Kecepatan 0.5 sampai 2. Ada kuota job harian.

## Aturan menulis

1. **Kalimat pendek**, kira-kira satu napas. Teks dipecah per potongan 150 sampai 250 karakter.
2. **Akhiri tiap kalimat dengan tanda baca.** Koma untuk jeda pendek, titik untuk jeda penuh,
   `...` untuk jeda menggantung.
3. **Angka, tanggal, harga, singkatan ditulis biasa**, dibacakan otomatis:
   `Rp 1.500.000`, `17/08/2026`, `pukul 17.30`, `3,5 kg`.
4. **Jangan pakai URL, email, emoji, atau markdown** (`*`, `#`, dan sejenisnya). Semuanya dibuang.
5. **Tag ekspresi dipakai hemat**, satu di momen yang tepat: `[laughter]`, `[sigh]`, `[sniff]`,
   `[surprise-ah]`, `[question-ah]`, dan lainnya (daftar lengkap di `docs/ekspresi.md`).
   Tag berakhiran `-en` dilatih data bahasa lain; dengarkan hasilnya untuk bahasa Indonesia.
6. **Uji dulu** dengan 1 sampai 2 kalimat sebelum render panjang. Efek tag belum diukur otomatis.

## Contoh narasi

> Pagi itu, kota masih sunyi. Hanya suara hujan yang jatuh pelan di atap seng... dan aroma
> kopi dari warung di ujung gang. [sigh]
>
> Rina berhenti sejenak. Sudah tiga tahun ia pergi, tapi langkah kakinya masih hafal jalan
> pulang. Ia membuka pintu, lalu tersenyum. "Aku pulang," katanya lirih.
>
> Ibu menoleh, matanya berkaca-kaca. [surprise-ah] Kamu benar-benar pulang!

Kenapa contoh ini cocok untuk TTS:

- Kalimat pendek dan jelas.
- Variasi jeda: koma, titik, dan `...`.
- Tag hemat, tepat di momen emosi.
- Tidak ada simbol yang membingungkan.
