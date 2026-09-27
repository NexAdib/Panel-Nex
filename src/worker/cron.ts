import { isInstalled } from './db/meta';
import { ensureSchema } from './db/migrate';
import type { Env } from './env';

/** Periodic maintenance. Extended by later milestones (usage, resets, health, WARP). */
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
}
