import { z } from 'zod';
import { defaultSettings, type SettingsGroup, type SettingsMap } from '../../shared/settings';
import { HttpError } from '../lib/http';

const pathSeg = z.string().regex(/^[a-z0-9][a-z0-9_-]{5,63}$/, 'path');
const host = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^(?=.{1,253}$)([a-z0-9*]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/,
    'host',
  );
const port = z.number().int().min(1).max(65535);
const country = z
  .string()
  .regex(/^[A-Za-z]{2}$/)
  .transform((s) => s.toUpperCase());
const domainRule = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9.*_-]{1,253}$/);

const schemas: { [K in SettingsGroup]: z.ZodType<SettingsMap[K]> } = {
  general: z.object({
    panelPath: pathSeg,
    subPath: pathSeg,
    wsPath: pathSeg,
    domains: z.array(host).max(50),
    subHost: z.union([host, z.literal('')]),
    brandTitle: z.string().trim().min(1).max(40),
    supportUrl: z.string().trim().max(200),
    announcement: z.string().max(1000),
    timezone: z.string().min(1).max(64),
    language: z.enum(['fa', 'en']),
  }),
  proxy: z.object({
    vless: z.boolean(),
    trojan: z.boolean(),
    tlsPorts: z.array(port).max(12),
    plainPorts: z.array(port).max(12),
    fingerprint: z.string().max(20),
    alpn: z.string().max(40),
    earlyData: z.number().int().min(0).max(8192),
    dnsServer: z.string().regex(/^\d{1,3}(\.\d{1,3}){3}$/),
    nat64Prefixes: z
      .array(
        z
          .string()
          .regex(/^[0-9a-f:]+$/i)
          .max(40),
      )
      .max(8),
    connectTimeoutMs: z.number().int().min(1000).max(30_000),
    cfFallbackCountry: z.union([country, z.literal('')]),
  }),
  sub: z.object({
    updateIntervalHours: z.number().int().min(1).max(168),
    profileTitle: z.string().trim().min(1).max(60),
    nameTemplate: z.string().max(120),
    infoNodes: z.boolean(),
    maxNodes: z.number().int().min(1).max(300),
    ipsPerOperator: z.number().int().min(1).max(30),
    includeAuto: z.boolean(),
    includeCountries: z.boolean(),
    fragment: z.object({
      enabled: z.boolean(),
      packets: z.string().max(20),
      length: z.string().regex(/^\d{1,4}(-\d{1,4})?$/),
      interval: z.string().regex(/^\d{1,4}(-\d{1,4})?$/),
    }),
    rules: z.object({
      iranDirect: z.boolean(),
      blockQuic: z.boolean(),
      blockAds: z.boolean(),
      blockPorn: z.boolean(),
    }),
  }),
  exits: z.object({
    countries: z.array(country).max(60),
    aiEnabled: z.boolean(),
    aiCountry: z.union([country, z.literal('')]),
    aiDomains: z.array(domainRule).max(500),
    forceAllDefault: z.boolean(),
  }),
  filter: z.object({
    adult: z.boolean(),
    malware: z.boolean(),
    ads: z.boolean(),
    gambling: z.boolean(),
    customDomains: z.array(domainRule).max(5000),
    customKeywords: z.array(z.string().trim().toLowerCase().min(3).max(40)).max(500),
  }),
  warp: z.object({
    enabled: z.boolean(),
    endpoints: z
      .array(z.string().regex(/^[a-z0-9.:[\]-]+:\d{1,5}$/i))
      .min(1)
      .max(50),
    amnezia: z.enum(['off', 'light', 'medium', 'heavy', 'custom']),
    custom: z.object({
      jc: z.number().int().min(0).max(128),
      jmin: z.number().int().min(0).max(1280),
      jmax: z.number().int().min(0).max(1280),
    }),
    mtu: z.number().int().min(1000).max(1500),
    keepalive: z.number().int().min(0).max(120),
    dns: z.string().max(100),
    wow: z.boolean(),
    license: z.string().max(64),
  }),
  security: z.object({
    sessionHours: z
      .number()
      .int()
      .min(1)
      .max(24 * 90),
    idleMinutes: z
      .number()
      .int()
      .min(5)
      .max(60 * 24 * 30),
    loginMaxFails: z.number().int().min(3).max(50),
    lockMinutes: z
      .number()
      .int()
      .min(1)
      .max(24 * 60),
    pbkdf2Iterations: z.number().int().min(10_000).max(100_000),
    decoy: z.enum(['blank', 'nginx', 'site']),
  }),
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep merge: objects merge recursively, everything else (including arrays) is replaced. */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = k in base ? deepMerge((base as Record<string, unknown>)[k], v) : v;
  }
  return out as T;
}

interface CacheEntry {
  value: unknown;
  version: number;
  exp: number;
}
const cache = new Map<SettingsGroup, CacheEntry>();
const TTL_MS = 20_000;

export function clearSettingsCache(): void {
  cache.clear();
}

export async function getSettingsWithVersion<K extends SettingsGroup>(
  db: D1Database,
  grp: K,
): Promise<{ value: SettingsMap[K]; version: number }> {
  const hit = cache.get(grp);
  if (hit && hit.exp > Date.now()) return { value: hit.value as SettingsMap[K], version: hit.version };
  const row = await db
    .prepare('SELECT doc, version FROM settings WHERE grp = ?1')
    .bind(grp)
    .first<{ doc: string; version: number }>();
  const defaults = defaultSettings()[grp];
  let value = defaults;
  if (row) {
    try {
      const merged = deepMerge(defaults, JSON.parse(row.doc));
      const parsed = schemas[grp].safeParse(merged);
      value = parsed.success ? parsed.data : merged;
    } catch {
      value = defaults;
    }
  }
  const version = row?.version ?? 0;
  cache.set(grp, { value, version, exp: Date.now() + TTL_MS });
  return { value, version };
}

export async function getSettings<K extends SettingsGroup>(db: D1Database, grp: K): Promise<SettingsMap[K]> {
  return (await getSettingsWithVersion(db, grp)).value;
}

/**
 * Validates and stores a settings group. With `expectedVersion`, the write only
 * succeeds if nobody changed the group in between (optimistic concurrency).
 */
export async function saveSettings<K extends SettingsGroup>(
  db: D1Database,
  grp: K,
  patch: Partial<SettingsMap[K]>,
  expectedVersion?: number,
): Promise<{ value: SettingsMap[K]; version: number }> {
  cache.delete(grp); // always merge onto the stored document, never a stale cached copy
  const current = await getSettingsWithVersion(db, grp);
  if (expectedVersion !== undefined && expectedVersion !== current.version) {
    throw new HttpError(409, 'version_conflict');
  }
  const merged = deepMerge(current.value, patch);
  const parsed = schemas[grp].safeParse(merged);
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_settings', parsed.error.issues.map((i) => i.path.join('.')).join(', '));
  }
  const now = Date.now();
  const res = await db
    .prepare(
      `INSERT INTO settings (grp, doc, version, updated_at) VALUES (?1, ?2, 1, ?3)
       ON CONFLICT(grp) DO UPDATE SET doc = excluded.doc, version = settings.version + 1, updated_at = excluded.updated_at
       WHERE settings.version = ?4`,
    )
    .bind(grp, JSON.stringify(parsed.data), now, current.version)
    .run();
  if (!res.meta.changes) throw new HttpError(409, 'version_conflict');
  const next = { value: parsed.data, version: current.version + 1 };
  cache.set(grp, { ...next, exp: Date.now() + TTL_MS });
  return next;
}

export function validateSettings<K extends SettingsGroup>(grp: K, value: unknown): SettingsMap[K] {
  const parsed = schemas[grp].safeParse(value);
  if (!parsed.success) throw new HttpError(400, 'invalid_settings');
  return parsed.data;
}
