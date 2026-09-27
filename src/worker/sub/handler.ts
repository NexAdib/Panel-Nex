import type { GeneralSettings } from '../../shared/settings';
import type { Env } from '../env';

export async function handleSub(
  _request: Request,
  _env: Env,
  _ctx: ExecutionContext,
  _general: GeneralSettings,
): Promise<Response> {
  return new Response('Not Found', { status: 404 });
}
