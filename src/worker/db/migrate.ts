import { MIGRATIONS } from './migrations';

let ready: Promise<void> | null = null;

/**
 * Applies pending migrations once per isolate. Each migration runs as a single
 * D1 batch (a transaction). If two cold isolates race, the loser's batch fails
 * or no-ops and it re-reads the version instead of failing the request.
 */
export function ensureSchema(db: D1Database): Promise<void> {
  if (!ready) {
    ready = migrate(db).catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

/** For tests: forget that this isolate already migrated. */
export function resetSchemaFlag(): void {
  ready = null;
}

async function currentVersion(db: D1Database): Promise<number> {
  try {
    const row = await db.prepare(`SELECT v FROM meta WHERE k = 'schema_version'`).first<{ v: string }>();
    return row ? Number(row.v) || 0 : 0;
  } catch {
    return 0; // meta table does not exist yet
  }
}

async function migrate(db: D1Database): Promise<void> {
  let version = await currentVersion(db);
  for (const m of MIGRATIONS) {
    if (m.version <= version) continue;
    const stmts = m.statements.map((sql) => db.prepare(sql));
    stmts.push(
      db
        .prepare(
          `INSERT INTO meta (k, v) VALUES ('schema_version', ?1)
           ON CONFLICT(k) DO UPDATE SET v = excluded.v WHERE CAST(meta.v AS INTEGER) < CAST(excluded.v AS INTEGER)`,
        )
        .bind(String(m.version)),
    );
    try {
      await db.batch(stmts);
    } catch (err) {
      const now = await currentVersion(db);
      if (now < m.version) throw err;
    }
    version = m.version;
  }
}
