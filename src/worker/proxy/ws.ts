import { fromBase64Url } from '../lib/bytes';

/** Clients put the first bytes in Sec-WebSocket-Protocol (base64url) when `?ed=` is used. */
export function decodeEarlyData(header: string | null): Uint8Array | null {
  if (!header || header.length > 12_000 || header.includes(',')) return null;
  try {
    const bytes = fromBase64Url(header.trim());
    return bytes.byteLength >= 18 ? bytes : null;
  } catch {
    return null;
  }
}

const WS_OPEN = 1;
const WS_CLOSING = 2;

export function safeClose(ws: WebSocket, code = 1000, reason = ''): void {
  try {
    if (ws.readyState === WS_OPEN || ws.readyState === WS_CLOSING) ws.close(code, reason);
  } catch {
    // already closed
  }
}

export function wsSend(ws: WebSocket, data: Uint8Array): boolean {
  if (ws.readyState !== WS_OPEN) return false;
  try {
    ws.send(data);
    return true;
  } catch {
    return false;
  }
}

/**
 * Turns WebSocket messages into a pull-based byte source. WebSockets cannot be
 * paused, so the queue is bounded: a client that outruns its destination by more
 * than `maxBuffered` bytes is disconnected instead of exhausting memory.
 */
export class WsSource {
  private queue: Uint8Array[] = [];
  private waiter: ((v: Uint8Array | null) => void) | null = null;
  private done = false;
  private buffered = 0;

  constructor(
    ws: WebSocket,
    early: Uint8Array | null,
    private readonly maxBuffered = 16 * 1024 * 1024,
    private readonly onOverflow?: () => void,
  ) {
    if (early?.byteLength) this.push(early);
    // Recent compatibility dates deliver binary frames as Blob unless asked otherwise.
    try {
      ws.binaryType = 'arraybuffer';
    } catch {}
    let order: Promise<void> = Promise.resolve();
    ws.addEventListener('message', (e: MessageEvent) => {
      const d = e.data as unknown;
      if (typeof d === 'string') return; // protocol traffic is always binary
      if (d instanceof ArrayBuffer) {
        this.push(new Uint8Array(d));
      } else if (ArrayBuffer.isView(d)) {
        this.push(new Uint8Array(d.buffer, d.byteOffset, d.byteLength));
      } else if (typeof Blob !== 'undefined' && d instanceof Blob) {
        // Keep ordering while the Blob is read asynchronously.
        order = order.then(async () => this.push(new Uint8Array(await d.arrayBuffer())));
      }
    });
    ws.addEventListener('close', () => this.end());
    ws.addEventListener('error', () => this.end());
  }

  private push(chunk: Uint8Array): void {
    if (this.done || chunk.byteLength === 0) return;
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w(chunk);
      return;
    }
    this.buffered += chunk.byteLength;
    if (this.buffered > this.maxBuffered) {
      this.end();
      this.onOverflow?.();
      return;
    }
    this.queue.push(chunk);
  }

  end(): void {
    if (this.done) return;
    this.done = true;
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w(null);
    }
  }

  /** Next chunk, or null at end of stream. */
  read(): Promise<Uint8Array | null> {
    const next = this.queue.shift();
    if (next) {
      this.buffered -= next.byteLength;
      return Promise.resolve(next);
    }
    if (this.done) return Promise.resolve(null);
    return new Promise((resolve) => {
      this.waiter = resolve;
    });
  }

  get ended(): boolean {
    return this.done && this.queue.length === 0;
  }
}
