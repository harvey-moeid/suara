export interface HistoryItem {
  id: string;
  createdAt: number; // ms
  preview: string;
  mode: string;
  status: string;
}

const KEY = 'ov_history';

export function loadHistory(): HistoryItem[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? (v as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

export function saveHistory(items: HistoryItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, 20)));
  } catch {
    /* abaikan */
  }
}
