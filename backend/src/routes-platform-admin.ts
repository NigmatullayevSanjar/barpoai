import { z } from 'zod';
import { type Endpoint } from './http.js';
import { one, audit, type Db, type Row } from './db.js';
import { uuid, reason } from './schemas.js';
import { invariant } from './errors.js';
import { notify } from './notify.js';
import { reverseStock } from './inventory.js';
import { reverseFinance } from './finance.js';
import { correctProgress } from './routes-work-extra.js';
import {
  configurableRoles,
  platformDefaults,
  platformPermissions,
  platformStaff,
  roleMatrix,
} from './platform-permissions.js';
/**
 * Egasi qarori D21 (2026-10-22): platforma ruxsatlari matritsasi, kompaniya foydalanuvchilari va kompaniya
 * xatolarini tuzatish. Super admin kompaniya sahifalariga kirmaydi; tuzatishlar tayyor amallar: storno, ish hajmini
 * tuzatish, foydalanuvchini faolsizlantirish, sessiya va Telegramni uzish, adminlikni o'tkazish. Har biri sabab bilan,
 * kompaniya auditiga bajaruvchi platforma xodimi nomidan yoziladi va kompaniya adminiga bildirishnoma boradi.
 */
const staff = platformStaff;
const tenantParams = z.strictObject({ id: uuid });
const userParams = z.strictObject({ id: uuid, user_id: uuid });
const docParams = z.strictObject({ id: uuid, doc_id: uuid });
const tenantRoleEnum = z.enum([
  'foreman',
  'warehouse_manager',
  'financier',
  'accountant',
  'manager',
]);
/**
 * Kompaniya kontekstida (RLS) ishlash; arxivlangan kompaniyada tuzatish yo'q. Kontekst so'rov tranzaksiyasi oxirigacha
 * qoladi: kechiktirilgan tekshiruvlar (jurnal balansi, ombor proyeksiyasi) COMMIT paytida shu kontekstda ishlaydi.
 */
async function inTenant<T>(db: Db, tenantId: string, run: (tenant: Row) => Promise<T>) {
  const tenant = await one(db, 'SELECT id,legal_name,status FROM tenants WHERE id=$1', [tenantId]);
  invariant(tenant.status !== 'archived', 'TENANT_ARCHIVED', 409);
  await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
  return run(tenant);
}
async function activeAdmin(db: Db, tenantId: string) {
  return (
    await db.query(
      "SELECT id,tenant_id,role,display_name FROM users WHERE tenant_id=$1 AND role='tenant_admin' AND active",
      [tenantId],
    )
  ).rows[0] as Row | undefined;
}
/**
 * Hujjat yozuvchi aktor: hujjatlarning created_by maydoni kompaniya foydalanuvchisiga bog'langan (FK), shuning uchun
 * hujjat kompaniya admini nomidan yoziladi, kompaniya ruxsatlari tekshirilmaydi (`correction`), audit esa platforma
 * xodimiga (`audit_actor_id`). Faol admin bo'lmasa avval adminlikni o'tkazish kerak.
 */
async function correctionActor(db: Db, staffActor: Row, tenantId: string) {
  const admin = await activeAdmin(db, tenantId);
  invariant(admin, 'TENANT_ADMIN_REQUIRED', 409);
  return { ...admin, correction: true, audit_actor_id: staffActor.id };
}
/** Faqat audit uchun aktor (foydalanuvchi amallari): kompaniya auditiga platforma xodimi nomidan. */
const auditActor = (staffActor: Row, tenantId: string) => ({
  id: staffActor.id,
  tenant_id: tenantId,
  audit_actor_id: staffActor.id,
});
const documentReason = (staffActor: Row, text: string) => `BARPO AI (${staffActor.display_name}): ${text}`;
async function tellAdmin(db: Db, tenantId: string, title: string, body: string, payload: Row) {
  const admin = await activeAdmin(db, tenantId);
  if (admin)
    await notify(db, {
      tenant_id: tenantId,
      user_id: admin.id,
      kind: 'platform.correction',
      title,
      body,
      payload,
    });
}
async function tenantUser(db: Db, tenantId: string, userId: string) {
  return one(db, 'SELECT * FROM users WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [userId, tenantId]);
}

export function platformAdminRoutes(add: (r: Endpoint) => void) {
  // ---------------------------------------------------------------- Platforma ruxsatlari matritsasi
  add({
    method: 'GET',
    path: '/v1/platform/permissions',
    summary:
      'Platforma rollari ruxsatlari: super admin va support uchun samarali qiymatlar va standartlar; platforma egasida hammasi doim bor',
    platform: staff,
    platformPermission: 'permissions.manage',
    handler: async ({ db }) => ({
      permissions: platformPermissions,
      roles: await roleMatrix(db),
      defaults: platformDefaults,
    }),
  });
  add({
    method: 'PATCH',
    path: '/v1/platform/permissions',
    summary:
      'Bitta platforma rolining ruxsatlarini saqlash (to‘liq ro‘yxat); super admin qatorini faqat egasi yoki super admin o‘zgartiradi; sessiyalar saqlanadi, ruxsat keyingi so‘rovdan amal qiladi',
    platform: staff,
    platformPermission: 'permissions.manage',
    body: z.strictObject({
      role: z.enum(configurableRoles),
      permissions: z.partialRecord(z.enum(platformPermissions), z.boolean()),
    }),
    handler: async ({ db, actor, body }) => {
      invariant(
        body.role !== 'super_admin' || ['platform_owner', 'super_admin'].includes(actor.role),
        'FORBIDDEN',
        403,
      );
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['platform_permissions']);
      const before = (await roleMatrix(db))[body.role as (typeof configurableRoles)[number]];
      for (const p of platformPermissions)
        if (body.permissions[p] !== undefined)
          await db.query(
            `INSERT INTO platform_role_permissions(role,permission,allowed,updated_by) VALUES($1,$2,$3,$4)
             ON CONFLICT(role,permission) DO UPDATE SET allowed=excluded.allowed,updated_by=excluded.updated_by,updated_at=now()`,
            [body.role, p, body.permissions[p], actor.id],
          );
      const after = (await roleMatrix(db))[body.role as (typeof configurableRoles)[number]];
      await audit(db, actor, 'platform.permissions', null, { role: body.role, before, after });
      return { role: body.role, permissions: after };
    },
  });

  // ---------------------------------------------------------------- Kompaniya foydalanuvchilari
  add({
    method: 'GET',
    path: '/v1/platform/tenants/:id/users',
    summary:
      'Kompaniya foydalanuvchilari (ism, login, rol, holat, Telegram, faol sessiyalar) — parol tiklash va foydalanuvchi tuzatishlari uchun',
    platform: staff,
    params: tenantParams,
    handler: async ({ db, params }) => {
      await one(db, 'SELECT id FROM tenants WHERE id=$1', [params.id]);
      return {
        items: (
          await db.query(
            `SELECT u.id,u.login,u.display_name,u.role,u.active,u.phone,u.position,u.created_at,
                    EXISTS(SELECT 1 FROM telegram_accounts a WHERE a.user_id=u.id) telegram_linked,
                    (SELECT count(*)::int FROM sessions s WHERE s.user_id=u.id AND s.revoked_at IS NULL AND s.expires_at>now()) sessions_active
             FROM users u WHERE u.tenant_id=$1 ORDER BY u.role<>'tenant_admin',u.active DESC,u.display_name,u.id`,
            [params.id],
          )
        ).rows,
      };
    },
  });
  add({
    method: 'PATCH',
    path: '/v1/platform/tenants/:id/users/:user_id',
    summary:
      'Kompaniya xodimini faolsizlantirish yoki qayta faollashtirish (sabab bilan); admin uchun avval adminlikni o‘tkazish; qo‘lidagi material yoki ochiq vazifa bo‘lsa — HANDOVER_REQUIRED',
    platform: staff,
    platformPermission: 'tenants.correct',
    params: userParams,
    body: z.strictObject({ active: z.boolean(), reason }),
    handler: async ({ db, actor, params, body }) =>
      inTenant(db, params.id, async () => {
        const user = await tenantUser(db, params.id, params.user_id);
        invariant(user.role !== 'tenant_admin', 'OWNERSHIP_TRANSFER_REQUIRED');
        if (!body.active) {
          const held = await db.query(
            'SELECT 1 FROM stock_accounts a JOIN stock_balances b ON b.tenant_id=a.tenant_id AND b.account_id=a.id WHERE a.tenant_id=$1 AND a.custodian_id=$2 AND (b.quantity>0 OR b.reserved>0) LIMIT 1',
            [params.id, user.id],
          );
          const tasks = await db.query(
            "SELECT 1 FROM tasks WHERE tenant_id=$1 AND (assignee_id=$2 OR reviewer_id=$2) AND status<>'accepted' LIMIT 1",
            [params.id, user.id],
          );
          invariant(!held.rowCount && !tasks.rowCount, 'HANDOVER_REQUIRED');
        }
        const row = await one(
          db,
          'UPDATE users SET active=$2,version=version+1 WHERE id=$1 RETURNING id,login,display_name,role,active',
          [user.id, body.active],
        );
        if (!body.active)
          await db.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [
            user.id,
          ]);
        await audit(db, auditActor(actor, params.id), 'employee.update', user.id, {
          before: { active: user.active },
          after: { active: row.active },
          reason: body.reason,
        });
        await tellAdmin(
          db,
          params.id,
          'BARPO AI: xodim holati o‘zgardi',
          `${user.display_name} — ${body.active ? 'faollashtirildi' : 'faolsizlantirildi'}\nSabab: ${body.reason}`,
          { user_id: user.id },
        );
        return row;
      }),
  });
  add({
    method: 'POST',
    path: '/v1/platform/tenants/:id/users/:user_id/sessions/revoke',
    summary: 'Kompaniya foydalanuvchisining barcha faol sessiyalarini bekor qilish (sabab bilan)',
    platform: staff,
    platformPermission: 'tenants.correct',
    params: userParams,
    body: z.strictObject({ reason }),
    handler: async ({ db, actor, params, body }) =>
      inTenant(db, params.id, async () => {
        const user = await tenantUser(db, params.id, params.user_id);
        const revoked = await db.query(
          'UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now()',
          [user.id],
        );
        await audit(db, auditActor(actor, params.id), 'platform.sessions_revoke', user.id, {
          sessions: revoked.rowCount,
          reason: body.reason,
        });
        return { ok: true, revoked: revoked.rowCount };
      }),
  });
  add({
    method: 'POST',
    path: '/v1/platform/tenants/:id/users/:user_id/telegram/unlink',
    summary: 'Kompaniya foydalanuvchisining Telegram ulanishini uzish (sabab bilan); ochiq ulash havolalari bekor',
    platform: staff,
    platformPermission: 'tenants.correct',
    params: userParams,
    body: z.strictObject({ reason }),
    handler: async ({ db, actor, params, body }) =>
      inTenant(db, params.id, async () => {
        const user = await tenantUser(db, params.id, params.user_id);
        const removed = (
          await db.query('DELETE FROM telegram_accounts WHERE user_id=$1 RETURNING telegram_user_id', [user.id])
        ).rows[0];
        invariant(removed, 'TELEGRAM_NOT_LINKED', 409);
        await db.query(
          'UPDATE telegram_link_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',
          [user.id],
        );
        await audit(db, auditActor(actor, params.id), 'telegram.unlinked', user.id, {
          telegram_user_id: removed.telegram_user_id,
          reason: body.reason,
        });
        return { ok: true, linked: false };
      }),
  });
  add({
    method: 'POST',
    path: '/v1/platform/tenants/:id/ownership',
    summary:
      'Kompaniya adminligini boshqa faol xodimga o‘tkazish (sabab bilan); amaldagi admin previous_admin_role ga tushadi (admin bo‘lmasa shart emas); ikkalasining sessiyalari bekor',
    platform: staff,
    platformPermission: 'tenants.correct',
    params: tenantParams,
    body: z.strictObject({
      new_admin_id: uuid,
      previous_admin_role: tenantRoleEnum.optional(),
      reason,
    }),
    handler: async ({ db, actor, params, body }) =>
      inTenant(db, params.id, async () => {
        const current = await activeAdmin(db, params.id);
        await db.query(
          'SELECT id FROM users WHERE tenant_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE',
          [params.id, [body.new_admin_id, ...(current ? [current.id] : [])]],
        );
        const next = await one(
          db,
          "SELECT id,display_name FROM users WHERE tenant_id=$1 AND id=$2 AND active AND role<>'tenant_admin'",
          [params.id, body.new_admin_id],
        );
        if (current) {
          invariant(body.previous_admin_role, 'PREVIOUS_ADMIN_ROLE_REQUIRED', 400);
          await db.query('UPDATE users SET role=$2,version=version+1 WHERE id=$1', [
            current.id,
            body.previous_admin_role,
          ]);
        }
        await db.query("UPDATE users SET role='tenant_admin',version=version+1 WHERE id=$1", [next.id]);
        await db.query('DELETE FROM permission_overrides WHERE tenant_id=$1 AND user_id=$2', [
          params.id,
          next.id,
        ]);
        await db.query('UPDATE sessions SET revoked_at=now() WHERE user_id=ANY($1::uuid[])', [
          [next.id, ...(current ? [current.id] : [])],
        ]);
        await audit(db, auditActor(actor, params.id), 'company.ownership', next.id, {
          previous_admin_id: current?.id ?? null,
          previous_admin_role: current ? body.previous_admin_role : null,
          reason: body.reason,
        });
        await notify(db, {
          tenant_id: params.id,
          user_id: next.id,
          kind: 'platform.correction',
          title: 'BARPO AI: siz kompaniya admini etib tayinlandingiz',
          body: `Sabab: ${body.reason}`,
          payload: { previous_admin_id: current?.id ?? null },
        });
        return { ok: true, admin_id: next.id, previous_admin_id: current?.id ?? null };
      }),
  });

  // ---------------------------------------------------------------- Storno va ish hajmini tuzatish
  add({
    method: 'GET',
    path: '/v1/platform/tenants/:id/stock-commands/:doc_id',
    summary: 'Storno oldidan ombor harakati: tur, material, miqdor, holat, obyekt, storno qilinganmi',
    platform: staff,
    platformPermission: 'tenants.correct',
    params: docParams,
    handler: async ({ db, params }) =>
      inTenant(db, params.id, () =>
        one(
          db,
          `SELECT c.id,c.kind,c.status,c.quantity::text,c.reason,c.created_at,m.name material_name,m.unit_id,p.name project_name,
                  u.display_name created_by_name,EXISTS(SELECT 1 FROM stock_commands r WHERE r.tenant_id=c.tenant_id AND r.reverses_id=c.id) reversed
           FROM stock_commands c JOIN materials m ON m.id=c.material_id JOIN projects p ON p.id=c.project_id JOIN users u ON u.id=c.created_by
           WHERE c.tenant_id=$1 AND c.id=$2`,
          [params.id, params.doc_id],
        ),
      ),
  });
  add({
    method: 'POST',
    path: '/v1/platform/tenants/:id/stock-commands/:doc_id/reverse',
    summary:
      'Ombor harakatini teskari yozuv bilan bekor qilish (storno); asl yozuv o‘zgarmaydi; hujjat kompaniya admini nomidan, audit platforma xodimiga',
    platform: staff,
    platformPermission: 'tenants.correct',
    params: docParams,
    body: z.strictObject({ reason }),
    handler: async ({ db, actor, params, body }) =>
      inTenant(db, params.id, async () => {
        const doer = await correctionActor(db, actor, params.id);
        const row = await reverseStock(db, doer, params.doc_id, documentReason(actor, body.reason));
        await tellAdmin(db, params.id, 'BARPO AI: ombor harakati storno qilindi', `Sabab: ${body.reason}`, {
          stock_command_id: params.doc_id,
          reversal_id: row.id,
        });
        return row;
      }),
  });
  add({
    method: 'GET',
    path: '/v1/platform/tenants/:id/finance-documents/:doc_id',
    summary: 'Storno oldidan moliyaviy hujjat: tur, summa, kontragent, sana, izoh, storno qilinganmi',
    platform: staff,
    platformPermission: 'tenants.correct',
    params: docParams,
    handler: async ({ db, params }) =>
      inTenant(db, params.id, () =>
        one(
          db,
          `SELECT f.id,f.kind,f.amount::text,f.description,f.document_date,f.created_at,c.name counterparty_name,p.name project_name,
                  u.display_name created_by_name,EXISTS(SELECT 1 FROM finance_documents r WHERE r.tenant_id=f.tenant_id AND r.reverses_id=f.id) reversed
           FROM finance_documents f JOIN projects p ON p.id=f.project_id JOIN users u ON u.id=f.created_by
           LEFT JOIN counterparties c ON c.id=f.counterparty_id
           WHERE f.tenant_id=$1 AND f.id=$2`,
          [params.id, params.doc_id],
        ),
      ),
  });
  add({
    method: 'POST',
    path: '/v1/platform/tenants/:id/finance-documents/:doc_id/reverse',
    summary:
      'Moliyaviy hujjatni teskari yozuv bilan bekor qilish (storno); unga bog‘langan to‘lovlar avval storno qilinadi (REVERSE_PAYMENTS_FIRST)',
    platform: staff,
    platformPermission: 'tenants.correct',
    params: docParams,
    body: z.strictObject({ reason }),
    handler: async ({ db, actor, params, body }) =>
      inTenant(db, params.id, async () => {
        const doer = await correctionActor(db, actor, params.id);
        const row = await reverseFinance(db, doer, params.doc_id, documentReason(actor, body.reason));
        await tellAdmin(db, params.id, 'BARPO AI: moliyaviy hujjat storno qilindi', `Sabab: ${body.reason}`, {
          finance_document_id: params.doc_id,
          reversal_id: row.id,
        });
        return row;
      }),
  });
  add({
    method: 'GET',
    path: '/v1/platform/tenants/:id/reports/:doc_id/progress',
    summary:
      'Qabul qilingan hisobotdagi bajarilgan ishlar (smeta qatori, birlik, kiritilgan va tuzatilgan hajm) — ish hajmini tuzatish uchun',
    platform: staff,
    platformPermission: 'tenants.correct',
    params: docParams,
    handler: async ({ db, params }) =>
      inTenant(db, params.id, async () => {
        const report = await one(
          db,
          `SELECT r.id,r.kind,r.report_date,r.status,p.name project_name,u.display_name author_name
           FROM reports r JOIN projects p ON p.id=r.project_id JOIN users u ON u.id=r.author_id WHERE r.tenant_id=$1 AND r.id=$2`,
          [params.id, params.doc_id],
        );
        const items = (
          await db.query(
            `SELECT pe.id,l.description,l.unit_id,pe.quantity::text quantity,
                    (pe.quantity+coalesce((SELECT sum(c.quantity_delta) FROM progress_corrections c WHERE c.tenant_id=pe.tenant_id AND c.progress_entry_id=pe.id),0))::text total
             FROM progress_entries pe JOIN estimate_lines l ON l.id=pe.estimate_line_id
             WHERE pe.tenant_id=$1 AND pe.report_id=$2 ORDER BY l.description,pe.id`,
            [params.id, report.id],
          )
        ).rows;
        return { ...report, items };
      }),
  });
  add({
    method: 'POST',
    path: '/v1/platform/tenants/:id/progress-entries/:doc_id/corrections',
    summary:
      'Bajarilgan ish hajmini tuzatish yozuvi bilan to‘g‘rilash (farq, sabab); asl yozuv o‘zgarmaydi, natija manfiy bo‘lmaydi',
    platform: staff,
    platformPermission: 'tenants.correct',
    params: docParams,
    body: z.strictObject({
      quantity_delta: z.string().regex(/^-?(0|[1-9]\d{0,17})(\.\d{1,6})?$/),
      reason,
    }),
    handler: async ({ db, actor, params, body }) =>
      inTenant(db, params.id, async () => {
        const doer = await correctionActor(db, actor, params.id);
        const row = await correctProgress(
          db,
          doer,
          params.doc_id,
          body.quantity_delta,
          documentReason(actor, body.reason),
        );
        await tellAdmin(db, params.id, 'BARPO AI: bajarilgan ish hajmi tuzatildi', `Sabab: ${body.reason}`, {
          progress_entry_id: params.doc_id,
        });
        return row;
      }),
  });
}
