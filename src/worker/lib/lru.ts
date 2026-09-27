/** Small LRU map with per-entry TTL, used for per-isolate caches. */
export class TtlLru<K, V> {
  private map = new Map<K, { v: V; exp: number }>();

  constructor(
    private readonly max: number,
    private readonly ttlMs: number,
  ) {}

  get(key: K): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.exp < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // refresh recency
    this.map.delete(key);
    this.map.set(key, e);
    return e.v;
  }

  set(key: K, value: V, ttlMs = this.ttlMs): void {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.max) {
      const oldest = this.map.keys().next();
      if (!oldest.done) this.map.delete(oldest.value);
    }
    this.map.set(key, { v: value, exp: Date.now() + ttlMs });
  }

  delete(key: K): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
