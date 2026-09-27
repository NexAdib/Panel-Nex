import { ASSETS, type EmbeddedAsset } from './assets.gen';
import { fromBase64 } from './lib/bytes';
import { PANEL_CSP, withSecurityHeaders } from './lib/http';

const decoded = new Map<string, Uint8Array>();

function bodyOf(name: string, asset: EmbeddedAsset): BodyInit {
  if (!asset.b64) return asset.body;
  let bytes = decoded.get(name);
  if (!bytes) {
    bytes = fromBase64(asset.body);
    decoded.set(name, bytes);
  }
  return bytes;
}

export function hasAsset(name: string): boolean {
  return Object.hasOwn(ASSETS, name);
}

/** Serves an embedded UI file with caching headers. Returns null when unknown. */
export function serveAsset(name: string, request: Request, csp: string = PANEL_CSP): Response | null {
  if (!Object.hasOwn(ASSETS, name)) return null;
  const asset = ASSETS[name]!;
  const headers = new Headers({
    'content-type': asset.type,
    etag: asset.etag,
    'cache-control': asset.immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (request.headers.get('if-none-match') === asset.etag) {
    return new Response(null, { status: 304, headers });
  }
  const res = new Response(request.method === 'HEAD' ? null : bodyOf(name, asset), { headers });
  return asset.type.startsWith('text/html') ? withSecurityHeaders(res, csp) : res;
}
