// Standard subscription response headers understood by most clients (usage bar,
// expiry, profile name, refresh interval, support and home-page buttons).
import { b64Utf8 } from '../lib/bytes';

export interface SubHeaderInput {
  up: number;
  down: number;
  total: number;
  expireAt: number | null;
  title: string;
  updateHours: number;
  supportUrl: string;
  pageUrl: string;
  filename: string;
}

export function subscriptionUserinfo(i: Pick<SubHeaderInput, 'up' | 'down' | 'total' | 'expireAt'>): string {
  const expire = i.expireAt ? Math.floor(i.expireAt / 1000) : 0;
  return `upload=${Math.max(0, i.up)}; download=${Math.max(0, i.down)}; total=${Math.max(0, i.total)}; expire=${expire}`;
}

export function subHeaders(i: SubHeaderInput, contentType: string): Headers {
  const h = new Headers();
  h.set('content-type', contentType);
  h.set('cache-control', 'no-store');
  h.set('x-content-type-options', 'nosniff');
  h.set('referrer-policy', 'no-referrer');
  h.set('subscription-userinfo', subscriptionUserinfo(i));
  h.set('profile-title', `base64:${b64Utf8(i.title)}`);
  h.set('profile-update-interval', String(Math.max(1, Math.round(i.updateHours))));
  h.set('profile-web-page-url', i.pageUrl);
  if (/^https?:\/\//i.test(i.supportUrl)) h.set('support-url', i.supportUrl);
  const ascii = i.filename.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[_.-]+|[_.-]+$/g, '') || 'nexadib';
  h.set(
    'content-disposition',
    `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(i.filename)}`,
  );
  return h;
}
