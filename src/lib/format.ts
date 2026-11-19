const numberFmt = new Intl.NumberFormat('en-US');
const compactFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export const fmtNumber = (n: number | null | undefined): string =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : numberFmt.format(n);

export const fmtCompact = (n: number | null | undefined): string =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : compactFmt.format(n);

export function fmtPrice(n: number | null | undefined, currency?: string | null): string {
  if (n === null || n === undefined) return '—';
  const digits = Math.abs(n) >= 1000 ? 0 : Math.abs(n) >= 1 ? 2 : 4;
  const body = n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return currency && currency.length === 3 ? `${body} ${currency}` : body;
}

export function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export function timeAgo(iso: string | number | Date, now = Date.now()): string {
  const t = typeof iso === 'number' ? iso : new Date(iso).getTime();
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Human-readable population/area etc. */
export function fmtBig(n: number | null | undefined, unit = ''): string {
  if (n === null || n === undefined) return '—';
  return `${compactFmt.format(n)}${unit ? ` ${unit}` : ''}`;
}

/** WMO weather interpretation codes (Open-Meteo). */
export function weatherLabel(code: number | null | undefined): { label: string; icon: string } {
  if (code === null || code === undefined) return { label: 'Unknown', icon: '·' };
  if (code === 0) return { label: 'Clear', icon: '☀' };
  if (code <= 2) return { label: 'Partly cloudy', icon: '⛅' };
  if (code === 3) return { label: 'Overcast', icon: '☁' };
  if (code <= 48) return { label: 'Fog', icon: '🌫' };
  if (code <= 57) return { label: 'Drizzle', icon: '🌦' };
  if (code <= 67) return { label: 'Rain', icon: '🌧' };
  if (code <= 77) return { label: 'Snow', icon: '❄' };
  if (code <= 82) return { label: 'Showers', icon: '🌦' };
  if (code <= 86) return { label: 'Snow showers', icon: '🌨' };
  if (code <= 99) return { label: 'Thunderstorm', icon: '⛈' };
  return { label: 'Unknown', icon: '·' };
}
