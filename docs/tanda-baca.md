# Aturan tanda baca koma dan titik

Dokumen ini menjelaskan bagaimana `scripts/idnorm.py` memperlakukan koma dan titik
sebelum teks dikirim ke TTS. Tanda baca memengaruhi jeda dan intonasi, jadi
tanda yang ganda atau salah tempat terdengar sebagai jeda aneh.

## Aturan

| Masukan | Hasil | Alasan |
|---|---|---|
| `Halo,` | `Halo.` | Baris berakhir `, ; :` diganti titik. Sebelumnya menjadi `Halo,.` |
| `Dia berkata "pergi."` | tetap | Penutup kutip/kurung dilewati saat memeriksa akhir kalimat. Sebelumnya menjadi `"pergi.".` |
| `Kata ini , dan` | `Kata ini, dan` | Spasi sebelum `, ; : . ! ?` dibuang |
| `Aku — kamu` | `Aku, kamu` | Tanda pisah diubah ke koma, lalu spasinya dirapikan |
| `Wah,, serius` / `Ya , , tidak` | `Wah, serius` / `Ya, tidak` | Koma/titik dua/titik koma ganda dipadatkan |
| `Satu. . Dua` | `Satu. Dua.` | Titik terpisah spasi dipadatkan |
| `Rp5.000,-` | `lima ribu rupiah` | `,-` / `,=` setelah angka hanya hiasan harga |
| `1.5.0` | `satu titik lima titik nol` | Penomoran versi, bukan ribuan |
| `2024,2025` | `dua ribu dua puluh empat, dua ribu dua puluh lima` | Dua tahun rapat dianggap daftar, bukan desimal |

Tetap seperti semula: titik ribuan (`1.500.000`), koma desimal (`3,5`), elipsis `...`
dan tag `[laughter]` (dilindungi `scripts/expressive.py`).

## Keputusan desain

- `tidy_punct` memakai `[ \t]`, bukan `\s`, agar batas baris tidak ikut tergabung.
  `normalize_text` memproses tiap baris sendiri-sendiri.
- `tidy_punct` jalan **sebelum** pemadatan `..` dan sesudah aturan Indonesia,
  sehingga `Satu. . Dua` bisa dipadatkan jadi satu titik.
- Elipsis aman karena `expressive.py` menggantinya dengan placeholder huruf
  sebelum `normalize_text`; placeholder bukan tanda baca sehingga tidak tersentuh.
- Heuristik dua tahun (`19xx`/`20xx` dipisah koma tanpa spasi) sengaja sempit
  supaya desimal asli seperti `1999,2025` tidak tertukar. Angka seperti `2024,5`
  tetap dibaca desimal.
- Karakter tak terlihat di `idnorm.py` (ZWJ, NBSP) ditulis sebagai escape
  (`\u200d`, `\xa0`) agar aman saat disunting; perilakunya tidak berubah.

## Belum diubah

- `10.30` tanpa kata `pukul`/`jam` tetap dibaca desimal ("sepuluh koma tiga nol"),
  karena ambigu dengan angka desimal biasa.

## Menjalankan tes

```
python scripts/test_normalize.py
python scripts/test_expressive.py
```
