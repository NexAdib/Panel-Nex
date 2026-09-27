import type { Hono } from 'hono';
import type { AppEnv } from './context';
import { systemRoutes } from './system';

/** Registers all authenticated API routes. */
export function registerApi(api: Hono<AppEnv>): void {
  systemRoutes(api);
}
