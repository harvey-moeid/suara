import { LOGO_SRC } from '../logo';

interface LogoProps {
  size: number;
  decorative?: boolean; // true bila sudah ada teks merek di sebelahnya
}

export function Logo({ size, decorative = false }: LogoProps) {
  return (
    <img
      src={LOGO_SRC}
      alt={decorative ? '' : 'Logo byga'}
      width={size}
      height={size}
      draggable={false}
      className="shrink-0 select-none drop-shadow-[0_0_12px_rgba(56,189,248,0.45)]"
      onError={(e) => {
        e.currentTarget.style.display = 'none';
      }}
    />
  );
}
