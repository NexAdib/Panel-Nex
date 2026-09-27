import type { Hono } from 'hono';
import type { AppEnv } from './context';
import { exitRoutes } from './exits';
import { planRoutes } from './plans';
import { systemRoutes } from './system';
import { userRoutes } from './users';

/** Registers all authenticated API routes. */
export function registerApi(api: Hono<AppEnv>): void {
  systemRoutes(api);
  userRoutes(api);
  planRoutes(api);
  exitRoutes(api);
}
