import { getMeta, isInstalled, setMeta } from './db/meta';
import { ensureSchema } from './db/migrate';
import type { Env } from './env';
import { runHealthChecks } from './exits/health';

const HEALTH_EVERY_MS = 9 * 60_000;

/** Periodic maintenance: cleanup, exit health (usage aggregation and WARP join later). */
export async function runCron(env: Env, _ctx: ExecutionContext): Promise<void> {
  await ensureSchema(env.DB);
  if (!(await isInstalled(env.DB))) return;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?1').bind(now),
    env.DB.prepare('DELETE FROM sso_tokens WHERE expires_at < ?1').bind(now),
    env.DB.prepare('DELETE FROM login_attempts WHERE locked_until < ?1 AND first_at < ?2').bind(
      now,
      now - 86_400_000,
    ),
  ]);

  // Exit health: roughly every ten minutes, a bounded batch of the stalest endpoints.
  const lastCheck = Number((await getMeta(env.DB, 'exits_checked_at')) ?? 0);
  if (now - lastCheck >= HEALTH_EVERY_MS) {
    await setMeta(env.DB, 'exits_checked_at', String(now));
    await runHealthChecks(env, { limit: 8 }).catch((err) =>
      console.error('exit health', err instanceof Error ? err.message : err),
    );
  }
}
