import type { Env } from '../env';
import type { RouteDecision, RouteInput } from './session';

/**
 * Routing policy for a connection. This first version dials directly; the exits
 * module (fixed-IP countries, AI routing, Cloudflare fallback) and the site
 * filter plug in here.
 */
export async function buildRouter(
  _env: Env,
  _request: Request,
): Promise<(input: RouteInput) => Promise<RouteDecision>> {
  return async () => ({ hops: [{ kind: 'direct' }] });
}
