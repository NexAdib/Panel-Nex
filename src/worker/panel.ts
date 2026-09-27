import { Hono } from 'hono';
import type { GeneralSettings } from '../shared/settings';
import { authPrivateRoutes, authPublicRoutes, currentSession } from './api/auth';
import { type AppEnv, onError } from './api/context';
import { registerApi } from './api/index';
import { serveAsset } from './assets';
import type { Env } from './env';
import { isSameOriginMutation } from './lib/request';

const PUBLIC_API = new Set(['/auth/status', '/auth/login', '/auth/sso', '/auth/cloudflare']);

const apps = new Map<string, Hono<AppEnv>>();

function buildApp(base: string): Hono<AppEnv> {
  const app = new Hono<AppEnv>({ strict: false }).basePath(base);
  app.onError(onError);
  app.use('*', async (c, next) => {
    c.set('base', base);
    await next();
  });

  app.get('/', (c) => serveAsset('panel.html', c.req.raw) ?? c.notFound());
  app.get('/assets/:file', (c) => serveAsset(`assets/${c.req.param('file')}`, c.req.raw) ?? c.notFound());
  app.get('/manifest.webmanifest', (c) => {
    return c.json(
      {
        name: 'NexAdib',
        short_name: 'NexAdib',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#0b0d14',
        theme_color: '#0b0d14',
        icons: [{ src: 'assets/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
      200,
      { 'content-type': 'application/manifest+json' },
    );
  });

  const api = new Hono<AppEnv>();
  api.onError(onError);
  // CSRF: every state-changing call must carry the SPA header and a same-origin Origin.
  api.use('*', async (c, next) => {
    const m = c.req.method;
    if (m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS' && !isSameOriginMutation(c.req.raw)) {
      return c.json({ error: 'csrf' }, 403);
    }
    await next();
  });
  api.use('*', async (c, next) => {
    const rel = c.req.path.slice(base.length + '/api'.length);
    if (PUBLIC_API.has(rel)) return next();
    const s = await currentSession(c);
    if (!s) return c.json({ error: 'unauthorized' }, 401);
    c.set('session', s);
    await next();
  });
  authPublicRoutes(api);
  authPrivateRoutes(api);
  registerApi(api);
  api.notFound((c) => c.json({ error: 'not_found' }, 404));
  app.route('/api', api);
  app.notFound((c) => c.text('Not Found', 404));
  return app;
}

export function panelFetch(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  general: GeneralSettings,
): Response | Promise<Response> {
  const base = `/${general.panelPath}`;
  const url = new URL(request.url);
  if (url.pathname === base) {
    return new Response(null, { status: 302, headers: { location: `${base}/${url.search}` } });
  }
  let app = apps.get(base);
  if (!app) {
    app = buildApp(base);
    apps.set(base, app);
  }
  return app.fetch(request, env, ctx);
}
