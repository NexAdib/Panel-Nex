import type { Hono } from 'hono';
import { z } from 'zod';
import { SETTINGS_GROUPS, type SettingsGroup } from '../../shared/settings';
import { audit } from '../db/audit';
import { getMeta } from '../db/meta';
import { getSettingsWithVersion, saveSettings } from '../db/settings';
import { HttpError } from '../lib/http';
import { runMaintenance } from '../usage/maintenance';
import { type AppEnv, actorOf, ipOf, readBody } from './context';

export function systemRoutes(api: Hono<AppEnv>): void {
  api.get('/system/info', async (c) => {
    const cf = (c.req.raw as { cf?: Record<string, unknown> }).cf ?? {};
    return c.json({
      version: __NEXADIB_VERSION__,
      commit: __NEXADIB_COMMIT__,
      installedAt: Number((await getMeta(c.env.DB, 'installed_at')) ?? 0),
      colo: cf.colo ?? null,
      country: cf.country ?? null,
      host: new URL(c.req.url).host,
      selfDeployable: typeof __NEXADIB_SELF__ !== 'undefined',
    });
  });

  // Runs usage aggregation, resets and expiry now (the cron does this every 5 minutes).
  api.post('/system/maintenance', async (c) => c.json(await runMaintenance(c.env)));

  api.get('/settings/:group', async (c) => {
    const grp = c.req.param('group') as SettingsGroup;
    if (!SETTINGS_GROUPS.includes(grp)) throw new HttpError(404, 'not_found');
    const { value, version } = await getSettingsWithVersion(c.env.DB, grp);
    return c.json({ value, version });
  });

  api.put('/settings/:group', async (c) => {
    const grp = c.req.param('group') as SettingsGroup;
    if (!SETTINGS_GROUPS.includes(grp)) throw new HttpError(404, 'not_found');
    const body = await readBody(
      c,
      z.object({ value: z.record(z.string(), z.unknown()), version: z.number().int().optional() }),
    );
    const saved = await saveSettings(c.env.DB, grp, body.value as never, body.version);
    await audit(c.env.DB, actorOf(c), 'settings_saved', grp, ipOf(c));
    return c.json(saved);
  });
}
