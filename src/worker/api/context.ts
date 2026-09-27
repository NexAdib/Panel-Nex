import type { Context, MiddlewareHandler } from 'hono';
import type { z } from 'zod';
import type { SessionInfo } from '../auth/session';
import type { Env } from '../env';
import { HttpError } from '../lib/http';
import { clientIp } from '../lib/request';

export type AppEnv = {
  Bindings: Env;
  Variables: { session: SessionInfo; base: string };
};

export type Ctx = Context<AppEnv>;

export async function readBody<T>(c: Ctx, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HttpError(400, 'bad_json');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const where = parsed.error.issues
      .slice(0, 5)
      .map((i) => i.path.join('.') || 'body')
      .join(', ');
    throw new HttpError(400, 'invalid_input', where);
  }
  return parsed.data;
}

export const ipOf = (c: Ctx): string | null => clientIp(c.req.raw);
export const actorOf = (c: Ctx): string => c.get('session')?.username ?? 'system';

export const onError = (err: Error, c: Ctx): Response => {
  if (err instanceof HttpError) {
    return c.json(
      { error: err.code, message: err.message === err.code ? undefined : err.message },
      err.status as 400,
    );
  }
  console.error('api error', err.message);
  return c.json({ error: 'internal' }, 500);
};

export type Mw = MiddlewareHandler<AppEnv>;
