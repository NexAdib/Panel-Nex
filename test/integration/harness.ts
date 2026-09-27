import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as esbuild from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

const root = resolve(import.meta.dirname, '..', '..');
const outDir = join(root, 'dist', 'test');

let built: Promise<string> | null = null;

/** Bundles the worker once per test process. */
export function buildWorker(): Promise<string> {
  if (!built) {
    built = (async () => {
      mkdirSync(outDir, { recursive: true });
      const outfile = join(outDir, 'worker.js');
      await esbuild.build({
        entryPoints: [join(root, 'src', 'worker', 'index.ts')],
        bundle: true,
        format: 'esm',
        platform: 'neutral',
        target: 'es2022',
        mainFields: ['module', 'main'],
        conditions: ['workerd', 'worker', 'browser', 'import', 'default'],
        external: ['cloudflare:*'],
        define: { __NEXADIB_VERSION__: '"test"', __NEXADIB_COMMIT__: '""' },
        outfile,
        logLevel: 'error',
      });
      return outfile;
    })();
  }
  return built;
}

export interface TestWorker {
  mf: Miniflare;
  /** Real HTTP origin of the local workerd, e.g. http://127.0.0.1:43123 */
  url: URL;
  fetch(path: string, init?: RequestInit & { cookie?: string }): Promise<Response>;
  dispose(): Promise<void>;
}

export async function startWorker(bindings: Record<string, string> = {}): Promise<TestWorker> {
  const scriptPath = await buildWorker();
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath,
      compatibilityDate: '2026-09-01',
      d1Databases: { DB: `test-${Math.random().toString(36).slice(2)}` },
      bindings,
    }),
  );
  const url = await mf.ready;
  return {
    mf,
    url,
    async fetch(path, init = {}) {
      const headers = new Headers(init.headers);
      if (!headers.has('cf-connecting-ip')) headers.set('cf-connecting-ip', '203.0.113.7');
      if (init.cookie) headers.set('cookie', `nx_s=${init.cookie}`);
      if (init.method && init.method !== 'GET') {
        headers.set('x-nexadib', '1');
        if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
      }
      const res = await mf.dispatchFetch(`https://panel.example.com${path}`, { ...init, headers } as never);
      return res as unknown as Response;
    },
    dispose: () => mf.dispose(),
  };
}

export interface Installed {
  w: TestWorker;
  panel: string; // like "/abcd.../"
  subPath: string;
  cookie: string;
  api<T = Record<string, unknown>>(
    path: string,
    method?: string,
    body?: unknown,
  ): Promise<{ status: number; data: T }>;
}

export async function installAndLogin(
  w: TestWorker,
  username = 'owner',
  password = 'correct-horse-9',
): Promise<Installed> {
  const res = await w.fetch('/api/install', { method: 'POST', body: JSON.stringify({ username, password }) });
  if (res.status !== 200) throw new Error(`install failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { panelPath: string; subPath: string };
  const cookie = /nx_s=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? '';
  const inst: Installed = {
    w,
    panel: data.panelPath,
    subPath: data.subPath,
    cookie,
    async api(path, method = 'GET', body) {
      const r = await w.fetch(`${data.panelPath}api/${path}`, {
        method,
        cookie,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await r.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {}
      return { status: r.status, data: parsed as never };
    },
  };
  return inst;
}
