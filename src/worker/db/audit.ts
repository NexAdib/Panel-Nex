/** Records an admin action. Never pass secrets in `details`. */
export function auditStmt(
  db: D1Database,
  actor: string,
  action: string,
  target: string | null,
  ip: string | null,
  details?: Record<string, unknown>,
): D1PreparedStatement {
  return db
    .prepare(
      'INSERT INTO audit_log (created_at, actor, action, target, ip, details) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
    )
    .bind(Date.now(), actor, action, target, ip, details ? JSON.stringify(details).slice(0, 2000) : null);
}

export async function audit(
  db: D1Database,
  actor: string,
  action: string,
  target: string | null,
  ip: string | null,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await auditStmt(db, actor, action, target, ip, details).run();
  } catch {
    // auditing must never break the action itself
  }
}
