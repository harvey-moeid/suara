import type { ReactNode } from 'react';
import type { View } from '../nav';
import { AudioIcon, DashboardIcon, MicIcon } from '../ui/icons';

export interface NavItem {
  view: View;
  label: string;
  shortLabel: string;
  icon: ReactNode;
}

export const NAV_ITEMS: NavItem[] = [
  { view: 'overview', label: 'Ringkasan', shortLabel: 'Ringkasan', icon: <DashboardIcon /> },
  { view: 'create', label: 'Buat suara', shortLabel: 'Buat', icon: <MicIcon /> },
  { view: 'results', label: 'Hasil suara', shortLabel: 'Hasil', icon: <AudioIcon /> },
];
