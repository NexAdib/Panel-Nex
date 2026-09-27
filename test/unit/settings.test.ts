import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/shared/settings';
import { deepMerge, validateSettings } from '../../src/worker/db/settings';
import { isResetDue } from '../../src/worker/lib/time';

describe('settings', () => {
  it('deep merges objects and replaces arrays', () => {
    const base = defaultSettings().sub;
    const merged = deepMerge(base, { rules: { blockAds: true }, maxNodes: 10 });
    expect(merged.rules).toEqual({ ...base.rules, blockAds: true });
    expect(merged.maxNodes).toBe(10);
    const m2 = deepMerge(defaultSettings().proxy, { tlsPorts: [443] });
    expect(m2.tlsPorts).toEqual([443]);
  });

  it('validates defaults of every group except path-dependent general', () => {
    const d = defaultSettings();
    for (const grp of ['proxy', 'sub', 'exits', 'filter', 'warp', 'security'] as const) {
      expect(() => validateSettings(grp, d[grp])).not.toThrow();
    }
    expect(() =>
      validateSettings('general', {
        ...d.general,
        panelPath: 'abcdef12',
        subPath: 'subpath1',
        wsPath: 'wspath12',
      }),
    ).not.toThrow();
    expect(() => validateSettings('general', { ...d.general, panelPath: '../x' })).toThrow();
  });
});

describe('reset periods', () => {
  const day = 86_400_000;
  it('daily resets at local midnight', () => {
    // 2026-01-01 20:00 UTC = 23:30 Tehran; +1h is past Tehran midnight.
    const t0 = Date.UTC(2026, 0, 1, 20, 0);
    expect(isResetDue('daily', t0, t0 + 20 * 60_000, 'Asia/Tehran')).toBe(false);
    expect(isResetDue('daily', t0, t0 + 60 * 60_000, 'Asia/Tehran')).toBe(true);
  });
  it('weekly and monthly roll from the last reset', () => {
    expect(isResetDue('weekly', 0, 6 * day, 'UTC')).toBe(false);
    expect(isResetDue('weekly', 0, 7 * day, 'UTC')).toBe(true);
    expect(isResetDue('monthly', 0, 29 * day, 'UTC')).toBe(false);
    expect(isResetDue('monthly', 0, 30 * day, 'UTC')).toBe(true);
    expect(isResetDue('none', 0, 999 * day, 'UTC')).toBe(false);
  });
});
