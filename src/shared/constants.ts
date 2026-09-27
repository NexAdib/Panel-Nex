// Shared constants used by the worker, the admin panel and the customer portal.

export const APP_NAME = 'NexAdib';

export const GB = 1024 ** 3;
export const DAY_MS = 86_400_000;

/** Data-limit presets in GB. 0 means unlimited. */
export const DATA_PRESETS_GB = [
  1, 2, 3, 5, 10, 15, 20, 30, 40, 50, 75, 100, 150, 200, 300, 500, 1000, 0,
] as const;

/** Duration presets in days (30 days per month). 0 means unlimited. */
export const DURATION_PRESETS_DAYS = [30, 60, 90, 180, 365, 0] as const;

/** Device (distinct IP) limit presets. 0 means unlimited. */
export const DEVICE_PRESETS = [1, 2, 3, 4, 5, 10, 0] as const;

export const RESET_STRATEGIES = ['none', 'daily', 'weekly', 'monthly'] as const;
export type ResetStrategy = (typeof RESET_STRATEGIES)[number];

export const USER_STATUSES = ['active', 'disabled', 'expired', 'limited', 'on_hold'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** Cloudflare ports that terminate TLS and their plain-HTTP counterparts. */
export const TLS_PORTS = [443, 8443, 2053, 2083, 2087, 2096] as const;
export const PLAIN_PORTS = [80, 8080, 8880, 2052, 2082, 2086, 2095] as const;

export const FINGERPRINTS = [
  'chrome',
  'firefox',
  'safari',
  'ios',
  'android',
  'edge',
  'random',
  'randomized',
] as const;
export type Fingerprint = (typeof FINGERPRINTS)[number];

export interface CountryPreset {
  code: string;
  fa: string;
  en: string;
  /** Suggested public ProxyIP hosts. They are verified by the health check before use. */
  suggested: string[];
}

/** Fixed-IP exit countries enabled by default. Admins can add any ISO-3166 country. */
export const DEFAULT_EXIT_COUNTRIES: CountryPreset[] = [
  { code: 'TR', fa: 'ترکیه', en: 'Turkey', suggested: ['ProxyIP.TR.CMLiussss.net'] },
  { code: 'DE', fa: 'آلمان', en: 'Germany', suggested: ['ProxyIP.DE.CMLiussss.net'] },
  { code: 'FI', fa: 'فنلاند', en: 'Finland', suggested: ['ProxyIP.FI.CMLiussss.net'] },
  { code: 'IT', fa: 'ایتالیا', en: 'Italy', suggested: ['ProxyIP.IT.CMLiussss.net'] },
  { code: 'FR', fa: 'فرانسه', en: 'France', suggested: ['ProxyIP.FR.CMLiussss.net'] },
  { code: 'US', fa: 'آمریکا', en: 'United States', suggested: ['ProxyIP.US.CMLiussss.net'] },
  { code: 'BG', fa: 'بلغارستان', en: 'Bulgaria', suggested: ['ProxyIP.BG.CMLiussss.net'] },
];

/** Converts an ISO-3166 alpha-2 code to its flag emoji. */
export function flagEmoji(code: string): string {
  const cc = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '🏳️';
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export interface OperatorPreset {
  code: string;
  fa: string;
  en: string;
  /** Autonomous system numbers used to auto-detect the subscriber's ISP. Editable in the panel. */
  asns: number[];
}

/** Iranian operators. `all` is the generic fallback list. */
export const DEFAULT_OPERATORS: OperatorPreset[] = [
  { code: 'all', fa: 'همه‌ی اپراتورها', en: 'All operators', asns: [] },
  { code: 'mci', fa: 'همراه اول', en: 'MCI (Hamrah-e Aval)', asns: [197207] },
  { code: 'irancell', fa: 'ایرانسل', en: 'Irancell (MTN)', asns: [44244] },
  { code: 'rightel', fa: 'رایتل', en: 'Rightel', asns: [57218] },
  { code: 'tci', fa: 'مخابرات', en: 'TCI (Mokhaberat)', asns: [58224] },
  { code: 'shatel', fa: 'شاتل', en: 'Shatel', asns: [31549] },
  { code: 'parsonline', fa: 'پارس‌آنلاین', en: 'ParsOnline', asns: [16322] },
  { code: 'asiatech', fa: 'آسیاتک', en: 'Asiatech', asns: [43343] },
  { code: 'mobinnet', fa: 'مبین‌نت', en: 'MobinNet', asns: [50810] },
  { code: 'hiweb', fa: 'های‌وب', en: 'HiWeb', asns: [56402] },
  { code: 'respina', fa: 'رسپینا', en: 'Respina', asns: [42337] },
  { code: 'afranet', fa: 'افرانت', en: 'Afranet', asns: [25184] },
  { code: 'pishgaman', fa: 'پیشگامان', en: 'Pishgaman', asns: [44889] },
  { code: 'sabanet', fa: 'صبانت', en: 'Sabanet', asns: [39501] },
  { code: 'fanava', fa: 'فن‌آوا', en: 'Fanava', asns: [24631] },
  { code: 'zitel', fa: 'زی‌تل', en: 'Zitel', asns: [] },
];

/** AI services routed through the fixed-IP "AI country" exit. Editable in the panel. */
export const DEFAULT_AI_DOMAINS = [
  'openai.com',
  'chatgpt.com',
  'oaistatic.com',
  'oaiusercontent.com',
  'sora.com',
  'anthropic.com',
  'claude.ai',
  'claude.com',
  'claudeusercontent.com',
  'gemini.google.com',
  'aistudio.google.com',
  'generativelanguage.googleapis.com',
  'notebooklm.google.com',
  'labs.google',
  'ai.google.dev',
  'deepmind.google',
  'copilot.microsoft.com',
  'githubcopilot.com',
  'copilot-proxy.githubusercontent.com',
  'perplexity.ai',
  'grok.com',
  'x.ai',
  'poe.com',
  'midjourney.com',
  'huggingface.co',
  'cursor.com',
  'cursor.sh',
  'cursorapi.com',
  'mistral.ai',
  'character.ai',
  'meta.ai',
  'openrouter.ai',
  'groq.com',
  'elevenlabs.io',
  'suno.com',
  'runwayml.com',
  'leonardo.ai',
  'stability.ai',
  'windsurf.com',
  'codeium.com',
];

/** Built-in gambling/betting blocklist (domain suffixes) used when the category is enabled. */
export const GAMBLING_DOMAINS = [
  'bet365.com',
  '1xbet.com',
  'melbet.com',
  'mostbet.com',
  'betwinner.com',
  'betforward.com',
  'stake.com',
  'pinnacle.com',
  'williamhill.com',
  'betway.com',
  'pokerstars.com',
  'ggpoker.com',
  '888casino.com',
  'unibet.com',
  'bwin.com',
  'betfair.com',
  'parimatch.com',
  '22bet.com',
  'dafabet.com',
  'betano.com',
];

/** Label keywords that mark a domain as gambling (matched per DNS label, not as substrings of words). */
export const GAMBLING_KEYWORDS = [
  'casino',
  'poker',
  'betting',
  'sportsbook',
  'gambling',
  'roulette',
  'blackjack',
];

export const WARP_DEFAULT_ENDPOINT = 'engage.cloudflareclient.com:2408';

export const AMNEZIA_PRESETS = {
  off: { jc: 0, jmin: 0, jmax: 0 },
  light: { jc: 2, jmin: 20, jmax: 40 },
  medium: { jc: 4, jmin: 40, jmax: 70 },
  heavy: { jc: 8, jmin: 100, jmax: 200 },
} as const;
export type AmneziaPreset = keyof typeof AMNEZIA_PRESETS | 'custom';
