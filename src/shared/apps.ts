// Client apps shown on the subscriber portal: which subscription format each
// app handles best, its one-tap import link (when the app has one) and where to
// get it. Copy and QR are always offered as a fallback.

export type Platform = 'android' | 'ios' | 'windows' | 'macos' | 'linux';
export type AppFormat = 'b64' | 'clash' | 'singbox';

export interface ClientApp {
  id: string;
  name: string;
  /** Subscription flavour this app gets (appended as ?f=… to the link). */
  format: AppFormat;
  platforms: Platform[];
  /** Apps listed first on a platform. */
  recommended?: Platform[];
  deeplink?: (url: string, name: string) => string;
  download: Partial<Record<Platform, string>>;
}

const enc = encodeURIComponent;
const gh = (repo: string) => `https://github.com/${repo}/releases/latest`;
const appStore = (id: string) => `https://apps.apple.com/app/id${id}`;
const play = (id: string) => `https://play.google.com/store/apps/details?id=${id}`;

function b64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export const PLATFORMS: Platform[] = ['android', 'ios', 'windows', 'macos', 'linux'];

export const CLIENT_APPS: ClientApp[] = [
  {
    id: 'hiddify',
    name: 'Hiddify',
    format: 'b64',
    platforms: ['android', 'ios', 'windows', 'macos', 'linux'],
    recommended: ['android', 'ios', 'windows', 'macos', 'linux'],
    deeplink: (url, name) => `hiddify://import/${url}#${enc(name)}`,
    download: {
      android: play('app.hiddify.com'),
      ios: appStore('6596777532'),
      windows: gh('hiddify/hiddify-app'),
      macos: gh('hiddify/hiddify-app'),
      linux: gh('hiddify/hiddify-app'),
    },
  },
  {
    id: 'v2rayng',
    name: 'v2rayNG',
    format: 'b64',
    platforms: ['android'],
    recommended: ['android'],
    deeplink: (url, name) => `v2rayng://install-sub?url=${enc(url)}&name=${enc(name)}`,
    download: { android: gh('2dust/v2rayNG') },
  },
  {
    id: 'happ',
    name: 'Happ',
    format: 'b64',
    platforms: ['android', 'ios', 'windows', 'macos'],
    recommended: ['ios'],
    deeplink: (url) => `happ://add/${url}`,
    download: {
      android: play('com.happproxy'),
      ios: appStore('6504287215'),
      windows: 'https://www.happ.su/main',
      macos: appStore('6504287215'),
    },
  },
  {
    id: 'streisand',
    name: 'Streisand',
    format: 'b64',
    platforms: ['ios', 'macos'],
    recommended: ['ios'],
    deeplink: (url, name) => `streisand://import/${url}#${enc(name)}`,
    download: { ios: appStore('6450534064'), macos: appStore('6450534064') },
  },
  {
    id: 'v2box',
    name: 'V2Box',
    format: 'b64',
    platforms: ['android', 'ios', 'macos'],
    deeplink: (url, name) => `v2box://install-sub?url=${enc(url)}&name=${enc(name)}`,
    download: {
      android: play('dev.hexasoftware.v2box'),
      ios: appStore('6446814690'),
      macos: appStore('6446814690'),
    },
  },
  {
    id: 'shadowrocket',
    name: 'Shadowrocket',
    format: 'b64',
    platforms: ['ios', 'macos'],
    deeplink: (url, name) => `sub://${b64(url)}#${enc(name)}`,
    download: { ios: appStore('932747118'), macos: appStore('932747118') },
  },
  {
    id: 'karing',
    name: 'Karing',
    format: 'clash',
    platforms: ['android', 'ios', 'windows', 'macos', 'linux'],
    deeplink: (url, name) => `karing://install-config?url=${enc(url)}&name=${enc(name)}`,
    download: {
      android: gh('KaringX/karing'),
      ios: appStore('6472431552'),
      windows: gh('KaringX/karing'),
      macos: appStore('6472431552'),
      linux: gh('KaringX/karing'),
    },
  },
  {
    id: 'clash-verge',
    name: 'Clash Verge Rev',
    format: 'clash',
    platforms: ['windows', 'macos', 'linux'],
    recommended: ['windows', 'macos', 'linux'],
    deeplink: (url, name) => `clash://install-config?url=${enc(url)}&name=${enc(name)}`,
    download: {
      windows: gh('clash-verge-rev/clash-verge-rev'),
      macos: gh('clash-verge-rev/clash-verge-rev'),
      linux: gh('clash-verge-rev/clash-verge-rev'),
    },
  },
  {
    id: 'flclash',
    name: 'FlClash',
    format: 'clash',
    platforms: ['android', 'windows', 'macos', 'linux'],
    deeplink: (url, name) => `clash://install-config?url=${enc(url)}&name=${enc(name)}`,
    download: {
      android: gh('chen08209/FlClash'),
      windows: gh('chen08209/FlClash'),
      macos: gh('chen08209/FlClash'),
      linux: gh('chen08209/FlClash'),
    },
  },
  {
    id: 'clash-meta',
    name: 'Clash Meta',
    format: 'clash',
    platforms: ['android'],
    deeplink: (url, name) => `clash://install-config?url=${enc(url)}&name=${enc(name)}`,
    download: { android: gh('MetaCubeX/ClashMetaForAndroid') },
  },
  {
    id: 'sing-box',
    name: 'sing-box',
    format: 'singbox',
    platforms: ['android', 'ios', 'macos'],
    deeplink: (url, name) => `sing-box://import-remote-profile?url=${enc(url)}#${enc(name)}`,
    download: {
      android: gh('SagerNet/sing-box'),
      ios: 'https://sing-box.sagernet.org/clients/apple/',
      macos: 'https://sing-box.sagernet.org/clients/apple/',
    },
  },
  {
    id: 'v2rayn',
    name: 'v2rayN',
    format: 'b64',
    platforms: ['windows', 'linux', 'macos'],
    download: { windows: gh('2dust/v2rayN'), linux: gh('2dust/v2rayN'), macos: gh('2dust/v2rayN') },
  },
  {
    id: 'nekobox',
    name: 'NekoBox',
    format: 'b64',
    platforms: ['android'],
    download: { android: gh('MatsuriDayo/NekoBoxForAndroid') },
  },
];

/** Apps for a platform, recommended first. */
export function appsFor(p: Platform): ClientApp[] {
  const list = CLIENT_APPS.filter((a) => a.platforms.includes(p));
  return [
    ...list.filter((a) => a.recommended?.includes(p)),
    ...list.filter((a) => !a.recommended?.includes(p)),
  ];
}

/** Best guess of the visitor's platform from the user agent. */
export function detectPlatform(ua: string): Platform {
  const s = ua.toLowerCase();
  if (/iphone|ipad|ipod/.test(s)) return 'ios';
  if (s.includes('android')) return 'android';
  if (s.includes('mac os x') || s.includes('macintosh')) {
    // iPadOS reports itself as a Mac; touch support gives it away.
    const nav = (globalThis as { navigator?: { maxTouchPoints?: number } }).navigator;
    return (nav?.maxTouchPoints ?? 0) > 1 ? 'ios' : 'macos';
  }
  if (s.includes('windows')) return 'windows';
  if (s.includes('linux') || s.includes('x11')) return 'linux';
  return 'android';
}

/** Subscription URL for an app's preferred format. */
export function subUrlFor(base: string, format: AppFormat): string {
  return format === 'b64' ? base : `${base}?f=${format}`;
}
