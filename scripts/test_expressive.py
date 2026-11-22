"""Uji tag non-verbal dan elipsis: python scripts/test_expressive.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from expressive import NONVERBAL_TAGS, normalize_expressive  # noqa: E402
from idnorm import normalize_text, split_chunks  # noqa: E402

# Teks tanpa tag/elipsis harus identik dengan normalize_text biasa.
for src in ["Harga Rp 1.500.000 saja", "Hubungi dr. Budi hari ini", "Satu\nDua", "Suhu -5°C", "Yg benar saja"]:
    assert normalize_expressive(src) == normalize_text(src), src

# Tag non-verbal dipertahankan, huruf besar dinormalkan ke huruf kecil.
assert "[laughter]" in normalize_expressive("Wah [laughter] lucu sekali")
assert "[sigh]" in normalize_expressive("[Sigh] capek sekali")
assert "[confirmation-en]" in normalize_expressive("Oke [confirmation-en] siap")
assert "[question-ah]" in normalize_expressive("Benarkah [question-ah]")
assert normalize_expressive("Harga 5 [laughter]").count("[laughter]") == 1
assert "lima" in normalize_expressive("Harga 5 [laughter]")
assert normalize_expressive("Wah [laughter] lucu") == "Wah [laughter] lucu."
assert all(("[" + t + "]") in normalize_expressive("a [" + t + "] b") for t in NONVERBAL_TAGS)

# Tag tak dikenal diperlakukan seperti sebelumnya: kurung dibuang, isi tetap terbaca.
out = normalize_expressive("Lihat [catatan] ini")
assert "[" not in out and "catatan" in out, out

# Elipsis dipertahankan; dua titik tetap dipadatkan seperti sebelumnya.
assert normalize_expressive("Tunggu... lalu") == "Tunggu... lalu."
assert normalize_expressive("Tunggu...") == "Tunggu..."
assert normalize_expressive("Tunggu....") == "Tunggu..."
assert normalize_expressive("Tunggu\u2026 lalu") == "Tunggu... lalu."
assert normalize_expressive("Siapa...?") == "Siapa...?"
assert "..." not in normalize_expressive("Hmm.. oke")
# Aturan Indonesia tetap berlaku di sebelah elipsis.
assert normalize_expressive("yg... benar") == "yang... benar."
assert normalize_expressive("Total 5... oke") == "Total lima... oke."

# Tag dan elipsis selamat sampai ke potongan.
chunks = split_chunks(normalize_expressive("Wah [laughter] lucu sekali... ya sudah. Lanjut [sigh] saja."))
joined = " ".join(chunks)
assert "[laughter]" in joined and "[sigh]" in joined and "..." in joined, chunks

print("OK: uji ekspresi lulus")
