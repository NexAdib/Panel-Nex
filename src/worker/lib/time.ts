import { DAY_MS } from '../../shared/constants';

export const nowMs = (): number => Date.now();
export const nowSec = (): number => Math.floor(Date.now() / 1000);

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function dayFormatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      f = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    }
    fmtCache.set(tz, f);
  }
  return f;
}

/** Calendar day (YYYY-MM-DD) of a timestamp in the given IANA time zone. */
export function dayKey(tsMs: number, tz = 'Asia/Tehran'): string {
  return dayFormatter(tz).format(new Date(tsMs));
}

export type ResetPeriod = 'none' | 'daily' | 'weekly' | 'monthly';

/**
 * Whether a periodic usage reset is due. Daily resets follow local midnight;
 * weekly and monthly resets roll 7 and 30 days from the previous reset.
 */
export function isResetDue(period: ResetPeriod, lastResetMs: number, nowTs: number, tz: string): boolean {
  switch (period) {
    case 'daily':
      return dayKey(lastResetMs, tz) !== dayKey(nowTs, tz);
    case 'weekly':
      return nowTs - lastResetMs >= 7 * DAY_MS;
    case 'monthly':
      return nowTs - lastResetMs >= 30 * DAY_MS;
    default:
      return false;
  }
}

const clockCache = new Map<string, Intl.DateTimeFormat>();

/** Timestamp of the most recent local midnight in the given time zone. */
export function startOfDay(tsMs: number, tz = 'Asia/Tehran'): number {
  let f = clockCache.get(tz);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      });
    } catch {
      f = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'UTC',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      });
    }
    clockCache.set(tz, f);
  }
  const parts = Object.fromEntries(f.formatToParts(new Date(tsMs)).map((p) => [p.type, p.value]));
  const secs = Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second);
  return tsMs - secs * 1000 - (tsMs % 1000);
}
