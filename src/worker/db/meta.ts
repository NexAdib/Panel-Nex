export async function getMeta(db: D1Database, k: string): Promise<string | null> {
  const row = await db.prepare('SELECT v FROM meta WHERE k = ?1').bind(k).first<{ v: string }>();
  return row?.v ?? null;
}

export function setMetaStmt(db: D1Database, k: string, v: string): D1PreparedStatement {
  return db
    .prepare('INSERT INTO meta (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
    .bind(k, v);
}

export async function setMeta(db: D1Database, k: string, v: string): Promise<void> {
  await setMetaStmt(db, k, v).run();
}

let installedCache: { value: boolean; exp: number } | null = null;

/** True once the owner account exists. Cached; once installed it stays installed. */
export async function isInstalled(db: D1Database): Promise<boolean> {
  if (installedCache && (installedCache.value || installedCache.exp > Date.now()))
    return installedCache.value;
  const row = await db.prepare('SELECT 1 AS ok FROM admins LIMIT 1').first<{ ok: number }>();
  installedCache = { value: !!row, exp: Date.now() + 5_000 };
  return !!row;
}

export function markInstalledCache(value: boolean): void {
  installedCache = { value, exp: Date.now() + 5_000 };
}
