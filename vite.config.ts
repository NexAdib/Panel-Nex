import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8'));

// Builds the admin panel and the customer portal as two static pages with
// relative asset URLs, so the worker can serve them under secret paths.
export default defineConfig({
  root: resolve(import.meta.dirname, 'src/ui'),
  base: './',
  publicDir: false,
  plugins: [preact(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    outDir: resolve(import.meta.dirname, 'dist/ui'),
    emptyOutDir: true,
    assetsDir: 'assets',
    target: 'es2020',
    sourcemap: false,
    cssCodeSplit: true,
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        panel: resolve(import.meta.dirname, 'src/ui/panel.html'),
        portal: resolve(import.meta.dirname, 'src/ui/portal.html'),
      },
    },
  },
});
