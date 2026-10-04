import pg from 'pg';
import { digest } from './security.js';
import { DomainError, invariant } from './errors.js';
export type Db = pg.PoolClient & {
  permissionCache?: Map<string, { overrides: Row[]; policies: Row[] }>;
};
export type Row = Record<string, any>;
export const createPool = (url = process.env.DATABASE_URL) =>
  new pg.Pool({
    connectionString: url,
    max: 12,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
export async function one(db: Db, sql: string, args: unknown[] = []): Promise<Row> {
  const row = (await db.query(sql, args)).rows[0];
  invariant(row, 'NOT_FOUND', 404);
  return row;
}
export async function transaction<T>(
  pool: pg.Pool,
  tenant: string | null,
  action: (db: Db) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const db: Db = await pool.connect();
    db.permissionCache = new Map();
    try {
      await db.query('BEGIN');
      await db.query(
        "SELECT set_config('app.tenant_id',$1,true), set_config('statement_timeout','15000',true), set_config('lock_timeout','5000',true)",
        [tenant ?? ''],
      );
      const result = await action(db);
      await db.query('COMMIT');
      return result;
    } catch (error: any) {
      await db.query('ROLLBACK');
      if (!['40001', '40P01'].includes(error.code) || attempt >= 2) throw error;
    } finally {
      db.release();
    }
  }
}
export async function audit(
  db: Db,
  actor: Row,
  action: string,
  resource: string | null,
  details: object = {},
) {
  await db.query(
    'INSERT INTO audit_events(tenant_id,actor_id,action,resource_id,details) VALUES($1,$2,$3,$4,$5)',
    [actor.tenant_id, actor.id, action, resource, details],
  );
}
function canonical(value: any): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export async function idempotent(
  db: Db,
  actor: Row,
  key: string,
  command: unknown,
  action: () => Promise<any>,
) {
  invariant(key.length >= 8 && key.length <= 128, 'IDEMPOTENCY_KEY_REQUIRED', 400);
  const hash = digest(canonical(command));
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    `${actor.tenant_id}:${actor.id}:${key}`,
  ]);
  const previous = (
    await db.query('SELECT * FROM idempotency_keys WHERE tenant_id=$1 AND actor_id=$2 AND key=$3', [
      actor.tenant_id,
      actor.id,
      key,
    ])
  ).rows[0];
  if (previous) {
    invariant(previous.request_hash === hash, 'IDEMPOTENCY_CONFLICT');
    return previous.response;
  }
  const result = await action();
  await db.query(
    'INSERT INTO idempotency_keys(tenant_id,actor_id,key,request_hash,response) VALUES($1,$2,$3,$4,$5)',
    [actor.tenant_id, actor.id, key, hash, JSON.stringify(result)],
  );
  return result;
}
export function mapDatabaseError(error: any) {
  if (error instanceof DomainError) return error;
  const codes: Record<string, string> = {
    '23505': 'ALREADY_EXISTS',
    '23503': 'INVALID_REFERENCE',
    '23514': 'INVARIANT_VIOLATION',
    '22P02': 'INVALID_INPUT',
    '22003': 'DECIMAL_OUT_OF_RANGE',
    '55P03': 'RESOURCE_BUSY',
    '40001': 'RETRY_REQUIRED',
    '40P01': 'RETRY_REQUIRED',
  };
  return codes[error.code]
    ? new DomainError(codes[error.code]!, 409)
    : new DomainError('INTERNAL_ERROR', 500);
}
