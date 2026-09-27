/** Bindings and variables available to the worker. */
export interface Env {
  /** Primary database: settings, users, usage, logs, sessions. */
  DB: D1Database;
  /** Optional cold storage. Nothing hot depends on it. */
  KV?: KVNamespace;
  /** Optional token required by /install when set. */
  SETUP_TOKEN?: string;
  /** Test hook: usage flush interval in ms (default 60000). */
  USAGE_FLUSH_MS?: string;
}

/** Build-time constants injected by the bundler. */
declare global {
  const __NEXADIB_VERSION__: string;
  const __NEXADIB_COMMIT__: string;
  /** Base64 of the gzipped core bundle, present only in the single-file release build. */
  const __NEXADIB_SELF__: string | undefined;
}
