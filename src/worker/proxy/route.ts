// Routing policy: where each connection goes.
//  • AI domains → the "AI country" exit (sticky IP), so accounts see a stable address.
//  • A country config (/ws/de) → direct first, and the country's exit for
//    Cloudflare-hosted sites (they refuse Workers), or everything when the user
//    has "all traffic via the country" enabled and a full relay exists.
//  • Auto → direct, falling back to an exit and NAT64 when a site refuses Workers.
import '../exits/hops';
import { getSettings } from '../db/settings';
import type { Env } from '../env';
import { countryHops, fallbackHops } from '../exits/select';
import { domainSet } from '../policy/domains';
import type { Hop } from './dial';
import type { RouteDecision, RouteInput } from './session';

function dedupe(hops: Hop[]): Hop[] {
  const seen = new Set<string>();
  return hops.filter((h) => {
    const k =
      h.kind === 'direct'
        ? 'direct'
        : h.kind === 'nat64'
          ? `nat64:${h.prefix}`
          : `${h.kind}:${h.exitId ?? h.host}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function buildRouter(
  env: Env,
  _request: Request,
): Promise<(input: RouteInput) => Promise<RouteDecision>> {
  const [exits, proxy] = await Promise.all([getSettings(env.DB, 'exits'), getSettings(env.DB, 'proxy')]);
  const ai = domainSet(exits.aiDomains);
  const nat64: Hop[] = proxy.nat64Prefixes.map((prefix) => ({ kind: 'nat64', prefix }));
  const direct: Hop = { kind: 'direct' };

  return async ({ user, domain, exit }) => {
    const key = `u${user.id}`;
    const isAi = exits.aiEnabled && !!domain && ai.has(domain);
    const country = exit ?? (isAi && exits.aiCountry ? exits.aiCountry : null);

    if (country) {
      const [full, any] = await Promise.all([
        countryHops(env.DB, country, key, { max: 2, scopeAll: true }),
        countryHops(env.DB, country, key, { max: 2 }),
      ]);
      if (any.length === 0) {
        // No healthy exit in that country right now: keep the connection working.
        return { hops: dedupe([direct, ...(await fallbackHops(env.DB, '', key)), ...nat64]) };
      }
      const forceAll = user.forceExit || isAi;
      if (forceAll && full.length) return { hops: dedupe([...full, direct, ...any]) };
      return { hops: dedupe([direct, ...any, ...nat64]) };
    }

    const fb = await fallbackHops(env.DB, proxy.cfFallbackCountry, key);
    return { hops: dedupe([direct, ...fb, ...nat64]) };
  };
}
