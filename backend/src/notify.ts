import { type Db, type Row } from './db.js';
/**
 * Ilova ichidagi bildirishnoma + Telegram yetkazish uchun outbox vazifasi.
 * Bir xil dedup kaliti takror yozmaydi. Telegram ulanmagan bo'lsa worker vazifani jimgina yopadi.
 */
export async function notify(
  db: Db,
  input: {
    tenant_id: string | null;
    user_id: string;
    project_id?: string | null;
    kind: string;
    title: string;
    body: string;
    payload?: Record<string, unknown>;
    dedup_key?: string;
  },
) {
  const dedup = input.dedup_key ?? `${input.kind}:${input.user_id}:${crypto.randomUUID()}`;
  const existing = (
    await db.query(
      "SELECT id FROM outbox WHERE coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce($1,'00000000-0000-0000-0000-000000000000'::uuid) AND dedup_key=$2",
      [input.tenant_id, dedup],
    )
  ).rows[0];
  if (existing) return null;
  const row: Row = (
    await db.query(
      'INSERT INTO notifications(tenant_id,user_id,project_id,kind,title,body,payload) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [
        input.tenant_id,
        input.user_id,
        input.project_id ?? null,
        input.kind,
        input.title,
        input.body,
        input.payload ?? {},
      ],
    )
  ).rows[0];
  await db.query(
    "INSERT INTO outbox(tenant_id,project_id,recipient_id,kind,payload,dedup_key) VALUES($1,$2,$3,'notification',$4,$5)",
    [
      input.tenant_id,
      input.project_id ?? null,
      input.user_id,
      { notification_id: row.id, title: input.title, body: input.body },
      dedup,
    ],
  );
  return row;
}
/** Obyektga biriktirilgan va berilgan rollardagi faol xodimlar (tenant admin har doim kiradi). */
export async function projectRecipients(
  db: Db,
  tenant: string,
  project: string,
  roles: string[],
  exclude?: string,
) {
  return (
    await db.query(
      `SELECT u.id FROM users u WHERE u.tenant_id=$1 AND u.active AND u.id IS DISTINCT FROM $4 AND (
        u.role='tenant_admin' OR (u.role=ANY($3::text[]) AND EXISTS(SELECT 1 FROM project_assignments a WHERE a.tenant_id=u.tenant_id AND a.project_id=$2 AND a.user_id=u.id)))`,
      [tenant, project, roles, exclude ?? null],
    )
  ).rows.map((r) => r.id as string);
}
