import { lang, locale } from './lang';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

export function fmtNumber(n: number, maxFrac = 0): string {
  return new Intl.NumberFormat(locale.value, { maximumFractionDigits: maxFrac }).format(n);
}

/** 1536 → "1.5 KB" (Persian digits in fa). Uses binary units like the rest of the panel. */
export function fmtBytes(n: number, frac = 1): string {
  if (!Number.isFinite(n) || n <= 0) return `${fmtNumber(0)} ${UNITS[0]}`;
  const i = Math.max(0, Math.min(UNITS.length - 1, Math.floor(Math.log(n) / Math.log(1024))));
  const v = n / 1024 ** i;
  return `${fmtNumber(v, v >= 100 || i === 0 ? 0 : frac)} ${UNITS[i]}`;
}

export function fmtGb(bytes: number): string {
  return fmtNumber(bytes / 1024 ** 3, 2);
}

/** Calendar date; Persian (Jalali) calendar in fa. */
export function fmtDate(ms: number | null | undefined, withTime = false): string {
  if (!ms) return '—';
  const loc = lang.value === 'fa' ? 'fa-IR-u-ca-persian' : 'en-GB';
  return new Intl.DateTimeFormat(loc, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(ms));
}

export function fmtRelative(ms: number | null | undefined): string {
  if (!ms) return '—';
  const diff = ms - Date.now();
  const rtf = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60_000) return rtf.format(Math.round(diff / 1000), 'second');
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  if (abs < 30 * 86_400_000) return rtf.format(Math.round(diff / 86_400_000), 'day');
  if (abs < 365 * 86_400_000) return rtf.format(Math.round(diff / (30 * 86_400_000)), 'month');
  return rtf.format(Math.round(diff / (365 * 86_400_000)), 'year');
}

export function daysLeft(expireAt: number | null | undefined): number | null {
  if (!expireAt) return null;
  return Math.max(0, Math.ceil((expireAt - Date.now()) / 86_400_000));
}
