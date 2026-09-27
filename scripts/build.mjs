#!/usr/bin/env node
// Release build: UI → embedded assets → worker bundle → self-replicating dist/worker.js
//
// dist/worker.js = `const __NEXADIB_SELF__ = "<base64(gzip(core))>";\n` + core
// At runtime a panel can rebuild this exact file from __NEXADIB_SELF__ and deploy
// itself to another Cloudflare account, so no GitHub download is ever needed.
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import * as esbuild from 'esbuild';
import { build as viteBuild } from 'vite';

const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const skipUi = process.argv.includes('--skip-ui');

let commit = '';
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
} catch {}
const version = pkg.version;

if (!skipUi) {
  await viteBuild({ configFile: join(root, 'vite.config.ts'), logLevel: 'warn' });
}
execSync(`node ${join(root, 'scripts', 'embed-assets.mjs')}`, { cwd: root, stdio: 'inherit' });

const result = await esbuild.build({
  entryPoints: [join(root, 'src', 'worker', 'index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  mainFields: ['module', 'main'],
  conditions: ['workerd', 'worker', 'browser', 'import', 'default'],
  external: ['cloudflare:*'],
  minify: true,
  legalComments: 'none',
  charset: 'utf8',
  define: {
    __NEXADIB_VERSION__: JSON.stringify(version),
    __NEXADIB_COMMIT__: JSON.stringify(commit),
  },
  write: false,
  logLevel: 'warning',
});

const core = result.outputFiles[0].text;
const payload = gzipSync(Buffer.from(core, 'utf8'), { level: 9 }).toString('base64');
const worker = `const __NEXADIB_SELF__ = ${JSON.stringify(payload)};\n${core}`;

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'worker.js'), worker);

const raw = Buffer.byteLength(worker);
const gz = gzipSync(Buffer.from(worker)).length;
const kib = (n) => `${(n / 1024).toFixed(1)} KiB`;
console.log(`dist/worker.js  v${version}${commit ? ` (${commit})` : ''}  raw ${kib(raw)}  gzip ${kib(gz)}`);

const LIMIT = 3 * 1024 * 1024; // Workers Free compressed script limit
if (gz > LIMIT) {
  console.error(`bundle too large: ${kib(gz)} gzip > 3 MiB`);
  process.exit(1);
}
if (gz > LIMIT * 0.8) console.warn('warning: bundle above 80% of the free-plan size limit');
