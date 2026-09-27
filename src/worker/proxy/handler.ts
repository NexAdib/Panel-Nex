import type { GeneralSettings } from '../../shared/settings';
import { getSettings } from '../db/settings';
import type { Env } from '../env';
import { clientIp } from '../lib/request';
import { buildRouter } from './route';
import { runSession } from './session';
import { decodeEarlyData, safeClose } from './ws';

/** `/<wsPath>/<cc>` selects a fixed-IP exit country; anything else means Auto. */
export function exitFromPath(pathname: string, wsPath: string): string | null {
  const rest = pathname.slice(wsPath.length + 1);
  const seg = rest.split('/').find(Boolean);
  return seg && /^[a-z]{2}$/i.test(seg) ? seg.toUpperCase() : null;
}

export async function handleProxy(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  general: GeneralSettings,
): Promise<Response> {
  const url = new URL(request.url);
  const proxy = await getSettings(env.DB, 'proxy');
  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  server.accept();
  const early = decodeEarlyData(request.headers.get('sec-websocket-protocol'));
  const route = await buildRouter(env, request);
  // The session outlives this handler; the runtime keeps it alive while the socket is open.
  runSession(server, early, env, ctx, {
    ip: clientIp(request) ?? '0.0.0.0',
    exit: exitFromPath(url.pathname, general.wsPath),
    connectTimeoutMs: proxy.connectTimeoutMs,
    dnsServer: proxy.dnsServer,
    route,
  }).catch((err) => {
    console.error('session', err instanceof Error ? err.message : err);
    safeClose(server, 1011, 'error');
  });
  // Echo the early-data subprotocol: strict WebSocket clients fail the handshake otherwise.
  const protocol = early ? request.headers.get('sec-websocket-protocol') : null;
  return new Response(null, {
    status: 101,
    webSocket: client,
    headers: protocol ? { 'sec-websocket-protocol': protocol } : undefined,
  });
}
