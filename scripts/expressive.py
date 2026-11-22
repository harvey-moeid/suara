"""Pelindung ekspresi untuk normalisasi teks OmniVoice Studio.

Masalah yang diselesaikan (idnorm.normalize_text apa adanya):
  1. clean_text membuang "[" dan "]", sehingga tag non-verbal OmniVoice seperti
     [laughter] terbaca sebagai kata biasa ("laughter") dan efeknya tidak pernah muncul.
  2. Elipsis "..." dipadatkan menjadi "." sehingga nada menggantung dan jeda panjang hilang.

Cara kerja: tag dan elipsis diganti placeholder berhuruf kecil saja (tanpa angka dan
tanda baca) sebelum normalize_text, lalu dipulihkan sesudahnya. Placeholder dipilih agar
tidak tersentuh aturan terbilang, satuan, singkatan, maupun pembersih markdown.

idnorm.py sengaja tidak diubah; render.py memanggil normalize_expressive().
"""
from __future__ import annotations

import re

from idnorm import normalize_text

# Tag non-verbal yang didukung OmniVoice (daftar dari dokumentasi OmniVoice).
# Tag di luar daftar ini diperlakukan seperti teks biasa: tanda kurungnya dibuang
# seperti sebelumnya. Tambahkan di sini bila versi OmniVoice menambah tag baru.
NONVERBAL_TAGS = frozenset({
    "laughter", "sigh", "sniff",
    "confirmation-en",
    "question-en", "question-ah", "question-oh", "question-ei", "question-yi",
    "surprise-ah", "surprise-oh", "surprise-wa", "surprise-yo",
    "dissatisfaction-hnn",
})

_TAG_RE = re.compile(r"\[([A-Za-z]+(?:-[A-Za-z]+)?)\]")
# Tiga titik atau lebih, atau karakter elipsis tunggal (U+2026); spasi sebelumnya ikut dimakan.
_ELLIPSIS_RE = re.compile(r"\s*(?:\.{3,}|\u2026)")

_ELL = "zzellipsiszz"


def _tag_token(name: str) -> str:
    return "zztag" + name.replace("-", "x") + "zz"


_TOKEN_TO_TAG = {_tag_token(n): "[" + n + "]" for n in NONVERBAL_TAGS}
_TOKEN_RE = re.compile("|".join(sorted(map(re.escape, _TOKEN_TO_TAG), key=len, reverse=True)))


def _protect(text: str) -> str:
    def tag(m: re.Match) -> str:
        name = m.group(1).lower()
        return " " + _tag_token(name) + " " if name in NONVERBAL_TAGS else m.group(0)

    t = _TAG_RE.sub(tag, text)
    return _ELLIPSIS_RE.sub(" " + _ELL, t)


def _restore(text: str) -> str:
    t = _TOKEN_RE.sub(lambda m: _TOKEN_TO_TAG[m.group(0)], text)
    t = re.sub(r"\s*" + _ELL, "...", t)
    # normalize_text menambah "." bila baris tidak berakhir tanda baca: "...." -> "..."
    t = re.sub(r"\.{4,}", "...", t)
    # Rapikan spasi ganda akibat placeholder tag.
    return re.sub(r"[ ]{2,}", " ", t).strip()


def normalize_expressive(text: str, indonesian: bool = True) -> str:
    """normalize_text + pertahankan tag non-verbal OmniVoice dan elipsis."""
    return _restore(normalize_text(_protect(text), indonesian=indonesian))
