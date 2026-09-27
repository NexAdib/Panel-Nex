#!/usr/bin/env node
// UI screenshots with the preinstalled Chromium.
//   node scripts/screens.mjs <baseUrl> <panelPath> <user> <pass> <outDir> [shot ...]
// shot = name:hash:lang:theme:WIDTHxHEIGHT[:clickSelector]
//   e.g. users-fa:#/users:fa:dark:1366x860   form:#/users:fa:dark:1366x860:button.grad-brand
//   A hash starting with @ is a path from the site root, e.g. portal:@/sub/TOKEN:fa:dark:400x860:nologin
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const [base, panelPath, user, pass, outDir = 'screens', ...specs] = process.argv.slice(2);
const exe = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) =>
  existsSync(p),
);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const errors = [];
const shots = specs.length
  ? specs
  : [
      'login-fa-dark:#/dashboard:fa:dark:420x860:nologin',
      'dash-fa-dark-desktop:#/dashboard:fa:dark:1366x800',
      'dash-en-light-desktop:#/dashboard:en:light:1366x800',
      'dash-fa-dark-mobile:#/dashboard:fa:dark:400x820',
    ];

for (const spec of shots) {
  const [name, hash, lang, theme, dims, click] = spec.split(':');
  const [width, height] = dims.split('x').map(Number);
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.addInitScript(
    ([l, th]) => {
      localStorage.setItem('nx_lang', l);
      localStorage.setItem('nx_theme', th);
    },
    [lang, theme],
  );
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(hash.startsWith('@') ? `${base}${hash.slice(1)}` : `${base}${panelPath}${hash}`);
  if (click !== 'nologin') {
    await page.waitForSelector('input[autocomplete="username"]');
    await page.fill('input[autocomplete="username"]', user);
    await page.fill('input[autocomplete="current-password"]', pass);
    await page.click('button[type="submit"]');
    await page.waitForSelector('main', { timeout: 10000 });
    await page.waitForTimeout(800);
    if (click) {
      await page.click(click);
      await page.waitForTimeout(600);
    }
  } else {
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: `${outDir}/${name}.png` });
  await ctx.close();
}
await browser.close();
if (errors.length) {
  console.log(`console errors:\n${errors.join('\n')}`);
  process.exitCode = 1;
} else console.log(`screens ok (${shots.length})`);
