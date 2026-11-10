export type View = 'overview' | 'create' | 'results';

export const VIEWS: readonly View[] = ['overview', 'create', 'results'];

export function isView(v: string): v is View {
  return (VIEWS as readonly string[]).includes(v);
}

export const PAGE_COPY: Record<View, { title: string; subtitle: string }> = {
  overview: {
    title: 'Ringkasan',
    subtitle: 'Pantau status layanan, kuota harian, dan hasil suara terbaru.',
  },
  create: {
    title: 'Buat suara',
    subtitle: 'Teks ke suara bahasa Indonesia. Dirender di CPU lewat antrean, jadi butuh beberapa menit.',
  },
  results: {
    title: 'Hasil suara',
    subtitle: 'Tersimpan di server dan dapat dibuka kembali dari perangkat lain.',
  },
};
