// Kelas bersama untuk elemen form dan tombol yang dipakai di luar komponen (mis. Studio).
export const CARD = 'rounded-2xl border border-line bg-card p-4 shadow-card sm:p-5';
export const LABEL = 'mb-1.5 block text-sm font-medium text-muted';
export const FIELD =
  'w-full rounded-xl border border-line bg-surface px-3 py-3 text-base text-fg placeholder:text-muted/70 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60';
export const BTN =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';
export const BTN_PRIMARY = `${BTN} bg-brand text-white hover:bg-brand/90`;
export const BTN_SECONDARY = `${BTN} border border-line bg-surface text-fg hover:bg-line/40`;
export const BTN_DANGER = `${BTN} bg-bad text-canvas hover:bg-bad/90`;
export const BTN_WARN = `${BTN} bg-warn text-canvas hover:bg-warn/90`;
