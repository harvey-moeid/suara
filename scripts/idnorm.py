"""Normalisasi teks Indonesia untuk TTS + pemecah potongan kalimat.

Tanpa dependensi berat agar bisa diuji cepat (scripts/test_normalize.py).
"""
from __future__ import annotations

import re
import unicodedata

CHUNK_MIN = 150
CHUNK_MAX = 250

_SATUAN = ["nol", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"]
_BESAR = [(10**12, "triliun"), (10**9, "miliar"), (10**6, "juta")]
_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]


def terbilang(n: int) -> str:
    """Angka bulat -> kata bahasa Indonesia."""
    if n < 0:
        return "minus " + terbilang(-n)
    if n < 12:
        return _SATUAN[n]
    if n < 20:
        return _SATUAN[n - 10] + " belas"
    if n < 100:
        t, s = divmod(n, 10)
        return _SATUAN[t] + " puluh" + (" " + _SATUAN[s] if s else "")
    if n < 200:
        return "seratus" + (" " + terbilang(n - 100) if n > 100 else "")
    if n < 1000:
        h, r = divmod(n, 100)
        return _SATUAN[h] + " ratus" + (" " + terbilang(r) if r else "")
    if n < 2000:
        return "seribu" + (" " + terbilang(n - 1000) if n > 1000 else "")
    if n < 10**6:
        k, r = divmod(n, 1000)
        return terbilang(k) + " ribu" + (" " + terbilang(r) if r else "")
    if n >= 10**15:
        return _digits(str(n))
    for base, name in _BESAR:
        if n >= base:
            k, r = divmod(n, base)
            return terbilang(k) + " " + name + (" " + terbilang(r) if r else "")
    return str(n)  # tak tercapai


def _digits(s: str) -> str:
    return " ".join(_SATUAN[int(d)] for d in s if d.isdigit())


def _num_words(s: str) -> str:
    """Baca angka gaya Indonesia: titik = pemisah ribuan, koma = desimal.

    Beberapa koma: ribuan gaya Inggris (1,500,000) bila semua kelompok setelah
    yang pertama 3 digit; selain itu dianggap daftar angka (1,2,3).
    """
    s = s.strip()
    if s.isdigit() and len(s) > 1 and s.startswith("0"):
        return _digits(s)
    if "," in s:
        parts = s.split(",")
        if len(parts) == 2:
            ip, fp = parts
            ip = ip.replace(".", "")
            return terbilang(int(ip or "0")) + " koma " + _digits(fp)
        if re.fullmatch(r"\d{1,3}(?:,\d{3})+", s):
            return terbilang(int(s.replace(",", "")))
        return ", ".join(_num_words(p) for p in parts if p)
    if re.fullmatch(r"\d{1,3}(?:\.\d{3})+", s):
        return terbilang(int(s.replace(".", "")))
    if re.fullmatch(r"\d+\.\d{1,2}", s):
        ip, fp = s.split(".")
        return terbilang(int(ip)) + " koma " + _digits(fp)
    return terbilang(int(re.sub(r"\D", "", s) or "0"))


_NUM = r"\d[\d.,]*\d|\d"

_URL = re.compile(r"(?:https?://|www\.)\S+", re.I)
_EMAIL = re.compile(r"\S+@\S+\.\S+")
_EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿⬀-⯿︀-️‍⃣]")

_ABBR = {
    "yg": "yang", "dgn": "dengan", "dg": "dengan", "tdk": "tidak", "utk": "untuk", "dlm": "dalam",
    "krn": "karena", "sdh": "sudah", "blm": "belum", "jgn": "jangan", "spt": "seperti",
    "dll": "dan lain-lain", "dsb": "dan sebagainya", "dst": "dan seterusnya", "tsb": "tersebut",
    "dkk": "dan kawan-kawan", "pd": "pada", "hrs": "harus", "bpk": "bapak", "sdr": "saudara",
    "yth": "yang terhormat", "hlm": "halaman", "tgl": "tanggal", "thn": "tahun", "bln": "bulan",
}
_ABBR_RE = re.compile(r"\b(?:" + "|".join(sorted(_ABBR, key=len, reverse=True)) + r")\b", re.I)

# Gelar/singkatan berimbuhan titik yang diikuti kata ("dr. Budi", "tgl. 5"): titiknya bukan akhir kalimat.
_TITLES = {
    "dr": "dokter", "prof": "profesor", "ir": "insinyur", "drs": "doktorandus",
    "bpk": "bapak", "sdr": "saudara", "yth": "yang terhormat", "hlm": "halaman", "tgl": "tanggal",
}
_TITLE_RE = re.compile(r"(?i)\b(" + "|".join(sorted(_TITLES, key=len, reverse=True)) + r")\.\s*(?=\w)")

# Singkatan yang dieja per huruf.
_LETTERS = ["PT", "CV", "RT", "RW", "KTP", "WIB", "WITA", "WIT", "HP", "WA", "TV", "SMS", "ATM", "BPJS",
            "NIK", "NPWP", "PLN", "BBM", "UMKM", "DKI", "RI", "TNI", "SD", "SMP", "SMA", "IPK"]
_LETTERS_RE = re.compile(r"\b(?:" + "|".join(_LETTERS) + r")\b")

_UNITS = {
    "kwh": "kilowatt jam", "kg": "kilogram", "km": "kilometer", "cm": "sentimeter", "mm": "milimeter",
    "ml": "mililiter", "mg": "miligram", "gr": "gram", "gb": "gigabita", "mb": "megabita", "kb": "kilobita",
    "jt": "juta", "rb": "ribu", "m": "meter", "g": "gram", "l": "liter",
}
_UNIT_RE = re.compile(r"(?i)(?<![\w.,])(" + _NUM + r")\s?(" + "|".join(sorted(_UNITS, key=len, reverse=True)) + r")(?!\w)")
_RP_RE = re.compile(r"(?i)\brp\.?\s*(" + _NUM + r")(\s*(?:ribu|juta|miliar|triliun|rb|jt))?")
_PCT_RE = re.compile(r"(" + _NUM + r")\s?%")
_CELS_RE = re.compile(r"(?i)(" + _NUM + r")\s?°\s?c\b")
_DATE_RE = re.compile(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b")
_JAM_RE = re.compile(r"(?i)\b(pukul|jam)\s*(\d{1,2})[.:](\d{2})\b")
_TIME_RE = re.compile(r"\b([01]?\d|2[0-3]):([0-5]\d)\b")
_ORD_RE = re.compile(r"(?i)\bke-(\d+)\b")
_KALI_RE = re.compile(r"(?i)\b(\d+)\s?x\b")
_LONG1_RE = re.compile(r"\b0\d{7,}\b")
_LONG2_RE = re.compile(r"\b\d{9,}\b")
_NUM_RE = re.compile(_NUM)
# Tanda minus: "-5" yang tidak menempel pada kata/angka ("COVID-19", "10-20", "0812-3456" tidak kena).
_NEG_RE = re.compile(r"(?<![\w)\]])-(?=\d)")


def _cap_like(src: str, out: str) -> str:
    """Pertahankan huruf kapital awal dari bentuk singkatan pada hasil perluasan."""
    return out[:1].upper() + out[1:] if src[:1].isupper() else out


def clean_text(text: str) -> str:
    """Pembersihan umum (semua bahasa): URL, email, emoji, markdown, spasi."""
    t = unicodedata.normalize("NFKC", text).replace("\r", "\n")
    t = _URL.sub(" ", t)
    t = _EMAIL.sub(" ", t)
    t = _EMOJI.sub(" ", t)
    t = t.translate({0x201C: '"', 0x201D: '"', 0x2018: "'", 0x2019: "'", 0x2013: "-", 0x2014: ", "})
    t = re.sub(r"[*_`~^|<>\[\]{}]", " ", t)
    t = re.sub(r"#(\w)", r"\1", t)
    t = re.sub(r"[ \t ]+", " ", t)
    return t


def _id_rules(t: str) -> str:
    t = re.sub(r"(?i)\bkm\s*/\s*jam\b", "kilometer per jam", t)
    t = _TITLE_RE.sub(lambda m: _cap_like(m.group(1), _TITLES[m.group(1).lower()]) + " ", t)
    t = _ABBR_RE.sub(lambda m: _cap_like(m.group(0), _ABBR[m.group(0).lower()]), t)
    t = re.sub(r"(?i)\bno\.?\s*(?=\d)", "nomor ", t)
    t = re.sub(r"(?i)\bjln?\.?\s+(?=\w)", "jalan ", t)
    t = _LETTERS_RE.sub(lambda m: " ".join(m.group(0)), t)

    def date(m: re.Match) -> str:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= mo <= 12 and 1 <= d <= 31:
            return f"{terbilang(d)} {_BULAN[mo - 1]} {terbilang(y)}"
        return m.group(0)

    t = _DATE_RE.sub(date, t)

    def jam(m: re.Match) -> str:
        h, mi = int(m.group(2)), int(m.group(3))
        return f"{m.group(1)} {terbilang(h)}" + (f" lewat {terbilang(mi)} menit" if mi else "")

    t = _JAM_RE.sub(jam, t)
    t = _TIME_RE.sub(
        lambda m: terbilang(int(m.group(1))) + (f" lewat {terbilang(int(m.group(2)))} menit" if int(m.group(2)) else ""), t
    )
    t = _NEG_RE.sub(" minus ", t)

    def rp(m: re.Match) -> str:
        scale = (m.group(2) or "").strip().lower()
        scale = {"rb": "ribu", "jt": "juta"}.get(scale, scale)
        return _num_words(m.group(1)) + (" " + scale if scale else "") + " rupiah"

    t = _RP_RE.sub(rp, t)
    t = _PCT_RE.sub(lambda m: _num_words(m.group(1)) + " persen", t)
    t = _CELS_RE.sub(lambda m: _num_words(m.group(1)) + " derajat celsius", t)
    t = re.sub(r"\+(?=\d)", " plus ", t)
    t = _LONG1_RE.sub(lambda m: _digits(m.group(0)), t)
    t = _LONG2_RE.sub(lambda m: _digits(m.group(0)), t)
    t = _UNIT_RE.sub(lambda m: _num_words(m.group(1)) + " " + _UNITS[m.group(2).lower()], t)
    t = _ORD_RE.sub(lambda m: "pertama" if int(m.group(1)) == 1 else "ke" + terbilang(int(m.group(1))), t)
    t = _KALI_RE.sub(lambda m: terbilang(int(m.group(1))) + " kali", t)
    t = _NUM_RE.sub(lambda m: _num_words(m.group(0)), t)
    t = t.replace("&", " dan ").replace("%", " persen ").replace("+", " tambah ").replace("=", " sama dengan ")
    t = t.replace("@", " ").replace("/", " ")
    return t


def normalize_text(text: str, indonesian: bool = True) -> str:
    """Teks mentah -> teks siap render (satu baris, tiap kalimat berakhir tanda baca)."""
    t = clean_text(text)
    if indonesian:
        t = _id_rules(t)
    t = re.sub(r"\.{2,}", ".", t)
    t = re.sub(r"!{2,}", "!", t)
    t = re.sub(r"\?{2,}", "?", t)
    lines: list[str] = []
    for line in t.split("\n"):
        line = re.sub(r"\s+", " ", line).strip(" -")
        if not re.search(r"\w", line):
            continue
        if line[-1] not in ".!?":
            line += "."
        lines.append(line)
    return " ".join(lines)


def _split_long(sentence: str) -> list[str]:
    """Pecah kalimat > CHUNK_MAX di koma/titik koma, lalu di spasi."""
    parts = [p.strip() for p in re.split(r"(?<=[,;:])\s+", sentence) if p.strip()]
    out: list[str] = []
    cur = ""
    for p in parts:
        if len(p) > CHUNK_MAX:
            if cur:
                out.append(cur)
                cur = ""
            words = p.split()
            buf = ""
            for w in words:
                if buf and len(buf) + 1 + len(w) > CHUNK_MAX:
                    out.append(buf)
                    buf = w
                else:
                    buf = (buf + " " + w).strip()
            if buf:
                out.append(buf)
        elif cur and len(cur) + 1 + len(p) > CHUNK_MAX:
            out.append(cur)
            cur = p
        else:
            cur = (cur + " " + p).strip()
    if cur:
        out.append(cur)
    return out


def split_chunks(text: str) -> list[str]:
    """Pecah per kalimat lalu gabung jadi potongan ~150-250 karakter."""
    sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
    pieces: list[str] = []
    for s in sents:
        pieces.extend([s] if len(s) <= CHUNK_MAX else _split_long(s))
    chunks: list[str] = []
    cur = ""
    for p in pieces:
        if not cur:
            cur = p
        elif len(cur) < CHUNK_MIN and len(cur) + 1 + len(p) <= CHUNK_MAX:
            cur += " " + p
        else:
            chunks.append(cur)
            cur = p
    if cur:
        chunks.append(cur)
    return chunks
