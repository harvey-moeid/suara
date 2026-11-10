import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import { CARD } from './styles';

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <section className={cx(CARD, className)} {...rest}>
      {children}
    </section>
  );
}

interface CardHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function CardHeader({ title, description, action }: CardHeaderProps) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
