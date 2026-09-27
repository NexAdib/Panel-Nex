import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __NEXADIB_VERSION__: JSON.stringify('test'), __NEXADIB_COMMIT__: JSON.stringify('') },
  resolve: {
    alias: { 'cloudflare:sockets': resolve(import.meta.dirname, 'test/stubs/cloudflare-sockets.ts') },
  },
  test: {
    include: ['test/unit/**/*.test.ts', 'test/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    // Each integration file boots its own workerd; cap parallelism to keep startup reliable.
    maxWorkers: 4,
    hookTimeout: 60_000,
  },
});
