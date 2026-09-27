// NexAdib worker entry: routes each request to the proxy data plane, the admin
// panel, the subscription service, the first-run installer, or the decoy.
import { runCron } from './cron';
import { isInstalled } from './db/meta';
import { ensureSchema } from './db/migrate';
import { getSettings } from './db/settings';
import { decoy } from './decoy';
import type { Env } from './env';
import { handleInstall } from './install';
import { isWebSocketUpgrade, underPath } from './lib/request';
import { panelFetch } from './panel';
import { handleProxy } from './proxy/handler';
import { handleSub } from './sub/handler';

export default {
  async fetch(request, env, ctx): Promise<Response> {
    try {
      await ensureSchema(env.DB);
      if (!(await isInstalled(env.DB))) return await handleInstall(request, env, ctx);

      const general = await getSettings(env.DB, 'general');
      const { pathname } = new URL(request.url);

      if (isWebSocketUpgrade(request)) {
        if (underPath(pathname, general.wsPath)) return await handleProxy(request, env, ctx, general);
      } else if (underPath(pathname, general.panelPath)) {
        return await panelFetch(request, env, ctx, general);
      } else if (underPath(pathname, general.subPath)) {
        return await handleSub(request, env, ctx, general);
      }
      const security = await getSettings(env.DB, 'security');
      return decoy(request, security.decoy);
    } catch (err) {
      console.error('unhandled', err instanceof Error ? err.message : String(err));
      return new Response('Internal Server Error', { status: 500 });
    }
  },

  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(runCron(env, ctx));
  },
} satisfies ExportedHandler<Env>;
