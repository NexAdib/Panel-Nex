/** Client IP as seen by Cloudflare. */
export function clientIp(request: Request): string | null {
  return request.headers.get('cf-connecting-ip');
}

export function isWebSocketUpgrade(request: Request): boolean {
  return request.headers.get('upgrade')?.toLowerCase() === 'websocket';
}

/** `/seg` or `/seg/...` */
export function underPath(pathname: string, seg: string): boolean {
  if (!seg) return false;
  const base = `/${seg}`;
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * CSRF guard for state-changing requests: the SPA always sends `x-nexadib: 1`
 * (a custom header forces a CORS preflight we never approve), and when the
 * browser sends Origin it must match the request's own origin.
 */
export function isSameOriginMutation(request: Request): boolean {
  if (request.headers.get('x-nexadib') !== '1') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}
