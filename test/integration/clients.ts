// Minimal VLESS/Trojan-over-WebSocket clients for integration tests.
import { sha224Hex } from '../../src/worker/lib/sha224';
import type { TestWorker } from './harness';

export function vlessHeader(uuid: string, host: string, port: number, cmd = 1): Buffer {
  const u = Buffer.from(uuid.replace(/-/g, ''), 'hex');
  const ip = host.split('.').map(Number);
  return Buffer.concat([
    Buffer.from([0]),
    u,
    Buffer.from([0, cmd, port >> 8, port & 0xff, 1]),
    Buffer.from(ip),
  ]);
}

export function trojanHeader(password: string, host: string, port: number): Buffer {
  const ip = host.split('.').map(Number);
  return Buffer.concat([
    Buffer.from(sha224Hex(password)),
    Buffer.from('\r\n'),
    Buffer.from([1, 1]),
    Buffer.from(ip),
    Buffer.from([port >> 8, port & 0xff]),
    Buffer.from('\r\n'),
  ]);
}

export async function openWs(w: TestWorker, path: string, early?: Buffer): Promise<WebSocket> {
  const url = new URL(path, w.url);
  url.protocol = 'ws:';
  const ws = early ? new WebSocket(url, [early.toString('base64url')]) : new WebSocket(url);
  ws.binaryType = 'arraybuffer';
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return ws;
}

/** Collects binary messages until `n` bytes arrived or the socket closed. */
export function collect(
  ws: WebSocket,
  n: number,
  timeoutMs = 5000,
): Promise<{ data: Buffer; closed: boolean; reason?: string }> {
  return new Promise((resolve) => {
    const parts: Buffer[] = [];
    let size = 0;
    const done = (closed: boolean, reason?: string) => {
      clearTimeout(timer);
      resolve({ data: Buffer.concat(parts), closed, reason });
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    ws.addEventListener('message', (e: MessageEvent) => {
      const d = e.data as ArrayBuffer | string;
      const b = typeof d === 'string' ? Buffer.from(d) : Buffer.from(d as ArrayBuffer);
      parts.push(b);
      size += b.length;
      if (size >= n) done(false);
    });
    ws.addEventListener('close', (e: CloseEvent) => done(true, e.reason));
  });
}
