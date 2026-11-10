import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import { SpinnerIcon } from './icons';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand/90 active:bg-brand/80',
  secondary: 'border border-line bg-surface text-fg hover:bg-line/40',
  ghost: 'text-muted hover:bg-card hover:text-fg',
  danger: 'bg-bad text-canvas hover:bg-bad/90',
};

const SIZE: Record<Size, string> = {
  md: 'min-h-11 px-4 text-base',
  sm: 'min-h-10 px-3 text-sm',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
}

// Tombol hanya ikon wajib diberi aria-label oleh pemanggil.
export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? <SpinnerIcon size={16} className="animate-spin motion-reduce:animate-none" /> : icon}
      {children}
    </button>
  );
}
