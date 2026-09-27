import type { GeneralSettings } from '../../shared/settings';
import type { Env } from '../env';

export async function handleProxy(
  _request: Request,
  _env: Env,
  _ctx: ExecutionContext,
  _general: GeneralSettings,
): Promise<Response> {
  return new Response('Not Implemented', { status: 501 });
}
