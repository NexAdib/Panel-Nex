import { resolve } from 'node:path';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Builds the admin panel and the customer portal as two static pages with
// relative asset URLs, so the worker can serve them under secret paths.
export default defineConfig({
  root: resolve(__dirname, 'src/ui'),
  base: './',
  publicDir: false,
  plugins: [preact(), tailwindcss()],
  build: {
    outDir: resolve(__dirname, 'dist/ui'),
    emptyOutDir: true,
    assetsDir: 'assets',
    target: 'es2020',
    sourcemap: false,
    cssCodeSplit: true,
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        panel: resolve(__dirname, 'src/ui/panel.html'),
        portal: resolve(__dirname, 'src/ui/portal.html'),
      },
    },
  },
});
