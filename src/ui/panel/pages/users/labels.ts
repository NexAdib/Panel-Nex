import type { UserStatus } from '../../../../shared/constants';
import type { UserDto } from '../../../../shared/types';
import { daysLeft, fmtDate } from '../../../common/format';
import { type TKey, t } from '../../../common/i18n';

export const STATUS_KEY: Record<UserStatus, TKey> = {
  active: 'st_active',
  expired: 'st_expired',
  limited: 'st_limited',
  disabled: 'st_disabled',
  on_hold: 'st_on_hold',
};

export const STATUS_TONE: Record<UserStatus, 'ok' | 'warn' | 'bad' | 'muted' | 'info'> = {
  active: 'ok',
  expired: 'bad',
  limited: 'warn',
  disabled: 'muted',
  on_hold: 'info',
};

export function expiryText(u: Pick<UserDto, 'expireAt' | 'status' | 'durationDays'>): {
  main: string;
  sub: string;
} {
  if (u.status === 'on_hold') return { main: t('on_hold_days', { n: u.durationDays ?? 0 }), sub: '' };
  if (!u.expireAt) return { main: t('no_expiry'), sub: '' };
  const d = daysLeft(u.expireAt) ?? 0;
  if (u.expireAt <= Date.now()) return { main: t('expired_ago'), sub: fmtDate(u.expireAt) };
  return { main: d <= 1 ? t('expires_today') : t('days_left', { n: d }), sub: fmtDate(u.expireAt) };
}

export function usagePercent(u: Pick<UserDto, 'used' | 'dataLimit'>): number {
  return u.dataLimit > 0 ? (u.used / u.dataLimit) * 100 : 0;
}

export function durationLabel(days: number): string {
  if (days === 0) return t('unlimited');
  if (days === 365) return t('year_1');
  if (days % 30 === 0) return days === 30 ? t('month_n', { n: 1 }) : t('months_n', { n: days / 30 });
  return `${days} ${t('days')}`;
}
