import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { LogoutIcon } from '../ui/icons';
import { Logo } from '../ui/Logo';
import { quotaBadgeTone } from './quota';
import type { Quota } from './quota';

export type ApiStatus = 'checking' | 'online' | 'offline';

interface TopbarProps {
  sectionLabel: string;
  quota: Quota | null;
  apiStatus: ApiStatus;
  onLogout: () => void;
}

const API_DOT: Record<ApiStatus, string> = { checking: 'bg-muted', online: 'bg-ok', offline: 'bg-bad' };
const API_TEXT: Record<ApiStatus, string> = { checking: 'Memeriksa API', online: 'API online', offline: 'API offline' };

export function Topbar({ sectionLabel, quota, apiStatus, onLogout }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/80 backdrop-blur supports-[backdrop-filter]:bg-canvas/70">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 lg:hidden">
          <Logo size={28} decorative />
          <span className="font-bold">OmniVoice</span>
        </div>
        <p className="hidden text-sm font-medium text-muted lg:block">{sectionLabel}</p>

        <div className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-2 text-xs text-muted" role="status">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${API_DOT[apiStatus]}`} />
            <span className="sr-only sm:not-sr-only">{API_TEXT[apiStatus]}</span>
          </span>
          {quota && (
            <Badge tone={quotaBadgeTone(quota)}>
              Kuota {quota.used}/{quota.max}
            </Badge>
          )}
          <Button variant="ghost" size="sm" className="lg:hidden" aria-label="Keluar" onClick={onLogout}>
            <LogoutIcon size={18} />
          </Button>
        </div>
      </div>
    </header>
  );
}
