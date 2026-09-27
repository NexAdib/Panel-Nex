// Response helpers with conservative security headers.

const BASE_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

export function json(data: unknown, status = 200, extra?: HeadersInit): Response {
  const h = new Headers(extra);
  h.set('content-type', 'application/json; charset=utf-8');
  h.set('cache-control', 'no-store');
  for (const [k, v] of Object.entries(BASE_HEADERS)) h.set(k, v);
  return new Response(JSON.stringify(data), { status, headers: h });
}

export function text(body: string, status = 200, extra?: HeadersInit): Response {
  const h = new Headers(extra);
  if (!h.has('content-type')) h.set('content-type', 'text/plain; charset=utf-8');
  for (const [k, v] of Object.entries(BASE_HEADERS)) h.set(k, v);
  return new Response(body, { status, headers: h });
}

export const PANEL_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export function withSecurityHeaders(res: Response, csp = PANEL_CSP): Response {
  const r = new Response(res.body, res);
  r.headers.set('content-security-policy', csp);
  r.headers.set('x-frame-options', 'DENY');
  r.headers.set('x-content-type-options', 'nosniff');
  r.headers.set('referrer-policy', 'no-referrer');
  r.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  return r;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}
