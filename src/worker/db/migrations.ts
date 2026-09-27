// Embedded schema migrations. They run automatically on the first request of each
// isolate, so a panel pasted into the Cloudflare dashboard needs no manual SQL.
// Timestamps are milliseconds since the epoch. Byte counters are integers.

export interface Migration {
  version: number;
  statements: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS settings (
        grp TEXT PRIMARY KEY,
        doc TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        pass_hash TEXT NOT NULL,
        pass_salt TEXT NOT NULL,
        pass_iters INTEGER NOT NULL,
        totp_secret TEXT,
        totp_enabled INTEGER NOT NULL DEFAULT 0,
        recovery_codes TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_login_at INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS sessions (
        id_hash TEXT PRIMARY KEY,
        admin_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        ip TEXT,
        ua TEXT,
        via TEXT NOT NULL DEFAULT 'password'
      )`,
      `CREATE INDEX IF NOT EXISTS ix_sessions_exp ON sessions(expires_at)`,
      `CREATE TABLE IF NOT EXISTS sso_tokens (
        token_hash TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        uuid TEXT NOT NULL UNIQUE,
        trojan_password TEXT NOT NULL,
        trojan_hash TEXT NOT NULL UNIQUE,
        sub_token TEXT NOT NULL UNIQUE,
        plan_id INTEGER,
        status TEXT NOT NULL DEFAULT 'active',
        data_limit INTEGER NOT NULL DEFAULT 0,
        used_up INTEGER NOT NULL DEFAULT 0,
        used_down INTEGER NOT NULL DEFAULT 0,
        lifetime_used INTEGER NOT NULL DEFAULT 0,
        expire_at INTEGER,
        duration_days INTEGER,
        reset_strategy TEXT NOT NULL DEFAULT 'none',
        last_reset_at INTEGER NOT NULL,
        device_limit INTEGER NOT NULL DEFAULT 0,
        allowed_exits TEXT NOT NULL DEFAULT '["*"]',
        force_exit INTEGER NOT NULL DEFAULT 0,
        operator TEXT,
        warp_enabled INTEGER NOT NULL DEFAULT 1,
        filter_exempt INTEGER NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        disabled_reason TEXT,
        rev INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        first_used_at INTEGER,
        last_online_at INTEGER,
        sub_updated_at INTEGER,
        sub_last_ua TEXT
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_users_name ON users(name COLLATE NOCASE)`,
      `CREATE INDEX IF NOT EXISTS ix_users_status ON users(status)`,
      `CREATE INDEX IF NOT EXISTS ix_users_expire ON users(expire_at)`,
      `CREATE INDEX IF NOT EXISTS ix_users_created ON users(created_at)`,
      `CREATE TABLE IF NOT EXISTS plans (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        data_limit INTEGER NOT NULL DEFAULT 0,
        duration_days INTEGER NOT NULL DEFAULT 0,
        device_limit INTEGER NOT NULL DEFAULT 0,
        allowed_exits TEXT NOT NULL DEFAULT '["*"]',
        warp_enabled INTEGER NOT NULL DEFAULT 1,
        reset_strategy TEXT NOT NULL DEFAULT 'none',
        on_hold INTEGER NOT NULL DEFAULT 0,
        sort INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS usage_journal (
        id INTEGER PRIMARY KEY,
        created_at INTEGER NOT NULL,
        data TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS usage_daily (
        user_id INTEGER NOT NULL,
        day TEXT NOT NULL,
        up INTEGER NOT NULL DEFAULT 0,
        down INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, day)
      ) WITHOUT ROWID`,
      `CREATE INDEX IF NOT EXISTS ix_usage_daily_day ON usage_daily(day)`,
      `CREATE TABLE IF NOT EXISTS usage_global_daily (
        day TEXT PRIMARY KEY,
        up INTEGER NOT NULL DEFAULT 0,
        down INTEGER NOT NULL DEFAULT 0,
        conns INTEGER NOT NULL DEFAULT 0,
        blocked INTEGER NOT NULL DEFAULT 0
      ) WITHOUT ROWID`,
      `CREATE TABLE IF NOT EXISTS user_ips (
        user_id INTEGER NOT NULL,
        ip TEXT NOT NULL,
        last_seen INTEGER NOT NULL,
        PRIMARY KEY (user_id, ip)
      ) WITHOUT ROWID`,
      `CREATE INDEX IF NOT EXISTS ix_user_ips_seen ON user_ips(last_seen)`,
      `CREATE TABLE IF NOT EXISTS exits (
        id INTEGER PRIMARY KEY,
        country TEXT NOT NULL,
        type TEXT NOT NULL,
        address TEXT NOT NULL,
        port INTEGER NOT NULL DEFAULT 0,
        username TEXT,
        password TEXT,
        label TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        healthy INTEGER NOT NULL DEFAULT 0,
        fail_streak INTEGER NOT NULL DEFAULT 0,
        egress_ip TEXT,
        egress_country TEXT,
        latency_ms INTEGER,
        scope TEXT,
        checked_at INTEGER,
        last_error TEXT,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS ix_exits_country ON exits(country, enabled, healthy)`,
      `CREATE TABLE IF NOT EXISTS operators (
        code TEXT PRIMARY KEY,
        name_fa TEXT NOT NULL,
        name_en TEXT NOT NULL,
        asns TEXT NOT NULL DEFAULT '[]',
        enabled INTEGER NOT NULL DEFAULT 1,
        sort INTEGER NOT NULL DEFAULT 0,
        config TEXT NOT NULL DEFAULT '{}'
      )`,
      `CREATE TABLE IF NOT EXISTS clean_ips (
        id INTEGER PRIMARY KEY,
        operator TEXT NOT NULL,
        address TEXT NOT NULL,
        port INTEGER NOT NULL DEFAULT 0,
        label TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        healthy INTEGER NOT NULL DEFAULT 1,
        latency_ms INTEGER,
        checked_at INTEGER,
        UNIQUE (operator, address, port)
      )`,
      `CREATE INDEX IF NOT EXISTS ix_clean_ips_op ON clean_ips(operator, enabled)`,
      `CREATE TABLE IF NOT EXISTS warp_accounts (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        kind TEXT NOT NULL DEFAULT 'warp',
        private_key TEXT NOT NULL,
        public_key TEXT NOT NULL,
        peer_public_key TEXT NOT NULL,
        address_v4 TEXT,
        address_v6 TEXT,
        reserved TEXT,
        device_id TEXT,
        token TEXT,
        license TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL,
        UNIQUE (user_id, kind)
      )`,
      `CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY,
        created_at INTEGER NOT NULL,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT,
        ip TEXT,
        details TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS ix_audit_created ON audit_log(created_at)`,
      `CREATE TABLE IF NOT EXISTS login_attempts (
        k TEXT PRIMARY KEY,
        fails INTEGER NOT NULL DEFAULT 0,
        first_at INTEGER NOT NULL,
        locked_until INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS locks (
        name TEXT PRIMARY KEY,
        holder TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      )`,
    ],
  },
];

export const LATEST_SCHEMA = MIGRATIONS[MIGRATIONS.length - 1]!.version;
