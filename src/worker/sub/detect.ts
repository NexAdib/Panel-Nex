// Picks the subscription format from ?f= or the client's User-Agent.

export type SubFormat = 'b64' | 'links' | 'clash' | 'singbox' | 'xray';

const ALIASES: Record<string, SubFormat> = {
  b64: 'b64',
  base64: 'b64',
  v2ray: 'b64',
  links: 'links',
  raw: 'links',
  text: 'links',
  clash: 'clash',
  meta: 'clash',
  mihomo: 'clash',
  yaml: 'clash',
  singbox: 'singbox',
  'sing-box': 'singbox',
  sb: 'singbox',
  xray: 'xray',
  json: 'xray',
  fragment: 'xray',
};

export function formatFromParam(v: string | null): SubFormat | null {
  if (!v) return null;
  return ALIASES[v.trim().toLowerCase()] ?? null;
}

/**
 * Clash-family clients get Mihomo YAML and official sing-box clients get JSON.
 * Hiddify is matched first: its UA also mentions ClashMeta and sing-box, yet it
 * works best with plain links (its own grouping, fragment and routing options
 * then apply). Everything else — v2rayNG, v2rayN, NekoBox, Streisand, V2Box,
 * Happ, Shadowrocket, FoXray… — gets base64 share links.
 */
export function formatFromUa(ua: string): SubFormat {
  const s = ua.toLowerCase();
  if (s.includes('hiddify')) return 'b64';
  if (/clash|mihomo|stash|flclash|nyanpasu|karing/.test(s)) return 'clash';
  if (/^(sfa|sfi|sfm|sft)\b|sing-box|singbox/.test(s)) return 'singbox';
  return 'b64';
}

const APP_UA =
  /clash|mihomo|stash|karing|sing-?box|hiddify|v2ray|nekobox|streisand|shadowrocket|happ|v2box|foxray|quantumult|surge|loon/i;

/** A person opening the link in a browser (as opposed to a VPN app updating its subscription). */
export function isBrowser(request: Request): boolean {
  const ua = request.headers.get('user-agent') ?? '';
  const accept = request.headers.get('accept') ?? '';
  return accept.includes('text/html') && /mozilla\//i.test(ua) && !APP_UA.test(ua);
}
