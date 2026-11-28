import { CARD } from './styles';

// Catatan tips menulis narasi di halaman Buat suara.
// Sengaja <details> bawaan browser: tanpa state, tertutup secara default agar tidak memenuhi layar,
// dan isinya mengikuti aturan di docs/tips-narasi.md (ubah keduanya bersamaan).
const TIPS: string[] = [
  'Pakai kalimat pendek, kira-kira satu napas.',
  'Akhiri tiap kalimat dengan tanda baca: koma untuk jeda pendek, titik untuk jeda penuh, "..." untuk jeda menggantung.',
  'Angka, tanggal, harga, dan singkatan ditulis biasa (Rp 1.500.000, 17/08/2026, pukul 17.30). Dibacakan otomatis.',
  'Jangan pakai URL, email, emoji, atau markdown. Semuanya dibuang.',
  'Tag ekspresi dipakai hemat, satu di momen yang tepat: [laughter], [sigh], [sniff], [surprise-ah], [question-ah].',
  'Uji dulu dengan 1-2 kalimat sebelum render panjang.',
];

const EXAMPLE =
  'Pagi itu, kota masih sunyi. Hanya suara hujan yang jatuh pelan di atap seng... dan aroma kopi dari warung di ujung gang. [sigh]\n\n' +
  'Rina berhenti sejenak. Sudah tiga tahun ia pergi, tapi langkah kakinya masih hafal jalan pulang.';

export function NarasiTips() {
  return (
    <details className={`${CARD} group`}>
      <summary className="cursor-pointer select-none text-sm font-semibold">Tips menulis narasi</summary>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted">
        {TIPS.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <p className="mt-3 text-xs font-semibold">Contoh</p>
      <p className="mt-1 whitespace-pre-wrap rounded-xl border border-line bg-surface p-3 text-sm">{EXAMPLE}</p>
    </details>
  );
}
