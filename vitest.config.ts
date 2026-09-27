import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __NEXADIB_VERSION__: JSON.stringify('test'), __NEXADIB_COMMIT__: JSON.stringify('') },
  test: {
    include: ['test/unit/**/*.test.ts', 'test/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
