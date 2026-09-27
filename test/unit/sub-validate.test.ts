// Checks generated configs with the real clients' own validators when they are
// available: set NEXADIB_VALIDATORS to a directory holding `sing-box`, `mihomo`
// and/or `xray` binaries (plus geoip.dat/geosite.dat for mihomo and xray).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/shared/settings';
import { toClash } from '../../src/worker/sub/clash';
import type { FormatOptions } from '../../src/worker/sub/common';
import { buildNodes } from '../../src/worker/sub/nodes';
import { CLIENT_DOH } from '../../src/worker/sub/service';
import { toSingbox } from '../../src/worker/sub/singbox';
import { toXray } from '../../src/worker/sub/xray';

const dir = process.env.NEXADIB_VALIDATORS ?? '';
const bin = (name: string) => (dir && existsSync(join(dir, name)) ? join(dir, name) : null);

function sample() {
  const s = defaultSettings();
  s.general.wsPath = 'wspath123';
  const cred = { uuid: '2f7c6a1e-6c1b-4c5e-9a53-0f6f6f1d2b3c', trojanPassword: 'p@ss:w/rd#1' };
  const nodes = buildNodes({
    user: {
      name: 'علی "test": #1',
      uuid: cred.uuid,
      trojanPassword: cred.trojanPassword,
      allowedExits: ['*'],
      dataLimit: 10 * 1024 ** 3,
      used: 1e9,
      expireAt: Date.now() + 9e8,
      status: 'active',
      durationDays: 30,
    },
    hosts: ['a.example.com', 'b.example.com'],
    general: s.general,
    proxy: s.proxy,
    sub: s.sub,
    exits: s.exits,
    operator: null,
    cleanIps: [
      { address: '104.16.1.1', port: 0 },
      { address: '2606:4700::6810:101', port: 2053 },
    ],
    lang: 'fa',
  });
  const opts: FormatOptions = {
    fingerprint: 'chrome',
    alpn: 'http/1.1',
    earlyData: 2560,
    fragment: { enabled: true, packets: 'tlshello', length: '10-30', interval: '10-20' },
    rules: { iranDirect: true, blockQuic: true, blockAds: true, blockPorn: true },
    dns: CLIENT_DOH,
  };
  return { nodes, cred, opts };
}

function run(file: string, args: string[], env: Record<string, string> = {}): string {
  return execFileSync(file, args, {
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, ...env },
    stdio: 'pipe',
  });
}

describe.skipIf(!dir)('client validators', () => {
  const out = mkdtempSync(join(tmpdir(), 'nexadib-cfg-'));
  const { nodes, cred, opts } = sample();

  it.skipIf(!bin('sing-box'))('sing-box check', () => {
    const f = join(out, 'singbox.json');
    writeFileSync(f, toSingbox(nodes, cred, opts));
    run(bin('sing-box')!, ['check', '-c', f]);
  });

  it.skipIf(!bin('mihomo'))('mihomo -t', () => {
    const f = join(out, 'clash.yaml');
    writeFileSync(f, toClash(nodes, cred, opts));
    expect(run(bin('mihomo')!, ['-t', '-d', dir, '-f', f])).toContain('test is successful');
  });

  it.skipIf(!bin('xray'))('xray -test', () => {
    const list = JSON.parse(toXray(nodes, cred, opts)) as unknown[];
    for (const [i, cfg] of list.slice(0, 4).entries()) {
      const f = join(out, `xray-${i}.json`);
      writeFileSync(f, JSON.stringify(cfg));
      expect(run(bin('xray')!, ['run', '-test', '-c', f], { XRAY_LOCATION_ASSET: dir })).toContain(
        'Configuration OK',
      );
    }
  });
});
