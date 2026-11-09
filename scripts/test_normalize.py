"""Uji cepat normalisasi: python scripts/test_normalize.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from idnorm import CHUNK_MAX, normalize_text, split_chunks, terbilang  # noqa: E402

CASES = {
    0: "nol", 7: "tujuh", 10: "sepuluh", 11: "sebelas", 15: "lima belas", 21: "dua puluh satu",
    100: "seratus", 101: "seratus satu", 999: "sembilan ratus sembilan puluh sembilan",
    1000: "seribu", 1999: "seribu sembilan ratus sembilan puluh sembilan",
    2026: "dua ribu dua puluh enam", 100000: "seratus ribu",
    123456: "seratus dua puluh tiga ribu empat ratus lima puluh enam",
    1000000: "satu juta", 1500000: "satu juta lima ratus ribu", 2000000000: "dua miliar",
}
for n, want in CASES.items():
    assert terbilang(n) == want, (n, terbilang(n), want)

TEXTS = {
    "Harga Rp 1.500.000 saja": "satu juta lima ratus ribu rupiah",
    "Diskon 50% hari ini": "lima puluh persen",
    "Berat 3,5 kg": "tiga koma lima kilogram",
    "Tanggal 17/08/2026": "tujuh belas Agustus dua ribu dua puluh enam",
    "Juara ke-3 lomba": "ketiga",
    "Saya tdk tahu yg mana": "Saya tidak tahu yang mana",
    "Pukul 17.30 kita berangkat": "tujuh belas lewat tiga puluh menit",
    "Telp 081234567890": "nol delapan satu dua",
    "Cek https://contoh.com sekarang": "Cek sekarang.",
    "Halo \U0001F600 dunia": "Halo dunia.",
    "Suhu 30°C": "tiga puluh derajat celsius",
    "Rp 5 juta": "lima juta rupiah",
    # Daftar angka tanpa spasi tidak boleh dibaca sebagai desimal.
    "Pilih nomor 1,2,3 saja": "satu, dua, tiga",
    # Ribuan gaya Inggris.
    "Total 1,500,000 pengguna": "satu juta lima ratus ribu",
    # Angka negatif.
    "Suhu -5 derajat": "minus lima",
    "Suhu -5°C": "minus lima derajat celsius",
    # Gelar dan singkatan berimbuhan titik tidak memecah kalimat.
    "Hubungi dr. Budi hari ini": "dokter Budi hari ini",
    "Bpk. Andi hadir": "Bapak Andi hadir",
    "Acara tgl. 5 nanti": "tanggal lima nanti",
    # Kapital awal dipertahankan saat singkatan diperluas.
    "Yg benar saja": "Yang benar saja",
}
for src, frag in TEXTS.items():
    out = normalize_text(src)
    assert frag in out, (src, out, frag)

# Kasus yang tidak boleh kena aturan minus.
for src in ["Telp 0812-3456-7890", "Jangan lupa COVID-19", "Rentang 10-20 saja"]:
    assert "minus" not in normalize_text(src), src
# Tanggal berstrip tetap terbaca sebagai tanggal.
assert "Agustus" in normalize_text("Tanggal 17-08-2026")

# Gelar tidak boleh membuat potongan terpisah di tengah kalimat.
assert len(split_chunks(normalize_text("Hubungi dr. Budi hari ini."))) == 1

assert normalize_text("   \n  ") == ""
assert normalize_text("Satu\nDua") == "Satu. Dua."

long_text = " ".join(["Ini kalimat contoh nomor %d yang cukup panjang untuk menguji pemecahan potongan teks." % i for i in range(40)])
chunks = split_chunks(normalize_text(long_text))
assert chunks and all(len(c) <= CHUNK_MAX for c in chunks), [len(c) for c in chunks]
assert all(len(c) >= 100 for c in chunks[:-1]), [len(c) for c in chunks]

run_on = split_chunks("kata " * 200)
assert all(len(c) <= CHUNK_MAX for c in run_on)
print("OK:", len(chunks), "potongan, uji normalisasi lulus")
