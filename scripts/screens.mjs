#!/usr/bin/env node
// Takes UI screenshots with the preinstalled Chromium.
//   node scripts/screens.mjs <baseUrl> <panelPath> <user> <pass> <outDir>
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const [base, panelPath, user, pass, outDir = 'screens'] = process.argv.slice(2);
const exe = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) =>
  existsSync(p),
);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const errors = [];

async function shoot(name, { width, height, lang, theme, hash = '#/dashboard', login = true }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
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
  await page.goto(`${base}${panelPath}${hash}`);
  if (login) {
    await page.waitForSelector('input[autocomplete="username"]');
    await page.fill('input[autocomplete="username"]', user);
    await page.fill('input[autocomplete="current-password"]', pass);
    await page.click('button[type="submit"]');
    await page.waitForSelector('main', { timeout: 10000 });
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: false });
  await ctx.close();
}

await shoot('login-fa-dark', { width: 420, height: 860, lang: 'fa', theme: 'dark', login: false });
await shoot('dash-fa-dark-desktop', { width: 1366, height: 800, lang: 'fa', theme: 'dark' });
await shoot('dash-en-light-desktop', { width: 1366, height: 800, lang: 'en', theme: 'light' });
await shoot('dash-fa-dark-mobile', { width: 400, height: 820, lang: 'fa', theme: 'dark' });
await browser.close();
if (errors.length) {
  console.log('console errors:\n' + errors.join('\n'));
  process.exitCode = 1;
} else console.log('screens ok');
