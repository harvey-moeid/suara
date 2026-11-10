import type { View } from '../nav';
import { cx } from '../ui/cx';
import { NAV_ITEMS } from './navItems';

// Bottom navigation untuk layar di bawah lg. Tiga tujuan utama, target sentuh min. 56px.
export function MobileNav({ view }: { view: View }) {
  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-3 gap-1 p-1.5">
        {NAV_ITEMS.map((item) => {
          const active = item.view === view;
          return (
            <li key={item.view}>
              <a
                href={`#/${item.view}`}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium transition-colors',
                  active ? 'bg-brand/15 text-fg' : 'text-muted hover:text-fg',
                )}
              >
                <span className={active ? 'text-accent' : undefined}>{item.icon}</span>
                {item.shortLabel}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
