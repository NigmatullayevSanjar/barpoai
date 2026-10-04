import { z } from 'zod';
import { type Endpoint } from './http.js';
import { one, audit, type Db, type Row } from './db.js';
import { uuid, idParams, pageQuery, positiveQty, reason, version, date } from './schemas.js';
import { projectScope, accountScope, allowed } from './permissions.js';
import { invariant } from './errors.js';
import { createStock } from './inventory.js';
import { notify, projectRecipients } from './notify.js';
import { quantity } from './money.js';

/** Hisoblarni rol doirasiga qarab filtrlovchi umumiy shart. */
const accountFilter = `($3<>'brigadier' OR a.custodian_id=$4) AND ($3<>'warehouse_manager' OR a.warehouse_id IS NULL OR EXISTS(SELECT 1 FROM warehouse_assignments w WHERE w.tenant_id=a.tenant_id AND w.warehouse_id=a.warehouse_id AND w.user_id=$4))`;

async function accountName(db: Db, tenant: string, id: string | null) {
  if (!id) return null;
  const row = (
    await db.query(
      'SELECT coalesce(w.name,u.display_name) name,a.warehouse_id,a.custodian_id FROM stock_accounts a LEFT JOIN warehouses w ON w.id=a.warehouse_id LEFT JOIN users u ON u.id=a.custodian_id WHERE a.tenant_id=$1 AND a.id=$2',
      [tenant, id],
    )
  ).rows[0];
  return row?.name ?? null;
}

export function stockExtraRoutes(add: (r: Endpoint) => void) {
  add({
    method: 'GET',
    path: '/v1/stock/overview',
    summary: 'Obyekt bo‘yicha hisoblar (ombor va brigadir) va material qoldiqlari',
    permission: 'stock.read',
    query: z.object({ project_id: uuid }),
    sensitive: true,
    handler: async ({ db, actor, query }) => {
      await projectScope(db, actor, query.project_id);
      const accounts = (
        await db.query(
          `SELECT a.id,a.warehouse_id,a.custodian_id,coalesce(w.name,u.display_name) name,CASE WHEN a.warehouse_id IS NULL THEN 'custody' ELSE 'warehouse' END kind,u.role custodian_role
           FROM stock_accounts a LEFT JOIN warehouses w ON w.id=a.warehouse_id LEFT JOIN users u ON u.id=a.custodian_id
           WHERE a.tenant_id=$1 AND a.project_id=$2 AND ${accountFilter} ORDER BY a.warehouse_id NULLS LAST,name`,
          [actor.tenant_id, query.project_id, actor.role, actor.id],
        )
      ).rows;
      const balances = accounts.length
        ? (
            await db.query(
              `SELECT b.account_id,b.material_id,m.name material_name,m.unit_id,b.quantity::text quantity,b.reserved::text reserved,(b.quantity-b.reserved)::text available,
                      b.value::text value,b.minimum_quantity::text minimum_quantity,(b.quantity-b.reserved<b.minimum_quantity AND b.minimum_quantity>0) low
               FROM stock_balances b JOIN materials m ON m.id=b.material_id
               WHERE b.tenant_id=$1 AND b.account_id=ANY($2::uuid[]) AND (b.quantity>0 OR b.reserved>0 OR b.minimum_quantity>0) ORDER BY m.name`,
              [actor.tenant_id, accounts.map((a) => a.id)],
            )
          ).rows
        : [];
      const pending = await one(
        db,
        `SELECT count(*) FILTER(WHERE kind='transfer' AND status IN ('pending','partial','disputed'))::int transfers,
                count(*) FILTER(WHERE kind='consumption' AND status IN ('pending','partial','disputed'))::int consumptions,
                count(*) FILTER(WHERE kind='return' AND status IN ('pending','partial','disputed'))::int returns
         FROM stock_commands WHERE tenant_id=$1 AND project_id=$2`,
        [actor.tenant_id, query.project_id],
      );
      const requests = await one(
        db,
        "SELECT count(*)::int pending FROM material_requests WHERE tenant_id=$1 AND project_id=$2 AND status='pending'",
        [actor.tenant_id, query.project_id],
      );
      return { accounts, balances, pending: { ...pending, requests: requests.pending } };
    },
  });
  add({
    method: 'GET',
    path: '/v1/stock/commands',
    summary: 'Ombor harakatlari: kirim, jo‘natish, sarf, qaytarish, tuzatish, reversal',
    permission: 'stock.read',
    query: pageQuery.extend({
      project_id: uuid,
      status: z.enum(['pending', 'partial', 'posted', 'cancelled', 'disputed', 'open']).optional(),
      kind: z
        .enum(['opening', 'receipt', 'transfer', 'consumption', 'return', 'adjustment', 'reversal'])
        .optional(),
      account_id: uuid.optional(),
      material_id: uuid.optional(),
    }),
    sensitive: true,
    handler: async ({ db, actor, query }) => {
      await projectScope(db, actor, query.project_id);
      return {
        items: (
          await db.query(
            `SELECT c.*,m.name material_name,m.unit_id,
                    coalesce(wf.name,uf.display_name) from_name,coalesce(wt.name,ut.display_name) to_name,
                    cb.display_name created_by_name,rb.display_name reviewed_by_name,l.description estimate_line_name,z.name zone_name,
                    (c.quantity-c.accepted_quantity)::text remaining_quantity
             FROM stock_commands c
             JOIN materials m ON m.id=c.material_id
             LEFT JOIN stock_accounts af ON af.id=c.from_account_id LEFT JOIN warehouses wf ON wf.id=af.warehouse_id LEFT JOIN users uf ON uf.id=af.custodian_id
             LEFT JOIN stock_accounts at ON at.id=c.to_account_id LEFT JOIN warehouses wt ON wt.id=at.warehouse_id LEFT JOIN users ut ON ut.id=at.custodian_id
             LEFT JOIN users cb ON cb.id=c.created_by LEFT JOIN users rb ON rb.id=c.reviewed_by
             LEFT JOIN estimate_lines l ON l.id=c.estimate_line_id LEFT JOIN zones z ON z.id=c.zone_id
             WHERE c.tenant_id=$1 AND c.project_id=$2
               AND ($5::text IS NULL OR ($5='open' AND c.status IN ('pending','partial','disputed')) OR c.status=$5)
               AND ($6::text IS NULL OR c.kind=$6)
               AND ($7::uuid IS NULL OR c.from_account_id=$7 OR c.to_account_id=$7)
               AND ($8::uuid IS NULL OR c.material_id=$8)
               AND ($3<>'brigadier' OR af.custodian_id=$4 OR at.custodian_id=$4)
               AND ($3<>'warehouse_manager' OR EXISTS(SELECT 1 FROM warehouse_assignments w WHERE w.tenant_id=c.tenant_id AND w.user_id=$4 AND (w.warehouse_id=af.warehouse_id OR w.warehouse_id=at.warehouse_id)) OR (af.warehouse_id IS NULL AND at.warehouse_id IS NULL))
             ORDER BY c.created_at DESC,c.id LIMIT $9 OFFSET $10`,
            [
              actor.tenant_id,
              query.project_id,
              actor.role,
              actor.id,
              query.status ?? null,
              query.kind ?? null,
              query.account_id ?? null,
              query.material_id ?? null,
              query.limit,
              query.offset,
            ],
          )
        ).rows,
      };
    },
  });
  add({
    method: 'GET',
    path: '/v1/stock/ledger',
    summary: 'Hisob va material bo‘yicha harakat tarixi (o‘zgarmas ledger)',
    permission: 'stock.read',
    query: pageQuery.extend({ account_id: uuid, material_id: uuid.optional() }),
    sensitive: true,
    handler: async ({ db, actor, query }) => {
      await accountScope(db, actor, query.account_id);
      return {
        items: (
          await db.query(
            `SELECT g.id,g.command_id,g.material_id,m.name material_name,m.unit_id,g.quantity_delta::text quantity_delta,g.value_delta::text value_delta,g.created_at,
                    c.kind,c.reason,u.display_name actor_name,
                    sum(g.quantity_delta) OVER (PARTITION BY g.account_id,g.material_id ORDER BY g.created_at,g.id)::text running_quantity
             FROM stock_ledger g JOIN stock_commands c ON c.id=g.command_id JOIN materials m ON m.id=g.material_id LEFT JOIN users u ON u.id=coalesce(c.reviewed_by,c.created_by)
             WHERE g.tenant_id=$1 AND g.account_id=$2 AND ($3::uuid IS NULL OR g.material_id=$3)
             ORDER BY g.created_at DESC,g.id LIMIT $4 OFFSET $5`,
            [
              actor.tenant_id,
              query.account_id,
              query.material_id ?? null,
              query.limit,
              query.offset,
            ],
          )
        ).rows,
      };
    },
  });

  // ---------------------------------------------------------------- Material so'rovlari
  add({
    method: 'POST',
    path: '/v1/stock/requests',
    summary: 'Material so‘rovi; qoldiqni o‘zgartirmaydi, ombor mudiri jo‘natish bilan bajaradi',
    page: 'stock',
    action: 'create',
    body: z.strictObject({
      project_id: uuid,
      material_id: uuid,
      zone_id: uuid.optional(),
      quantity: positiveQty,
      needed_by: date.optional(),
      note: z.string().trim().max(1000).optional(),
    }),
    idempotent: true,
    handler: async ({ db, actor, body }) => {
      await projectScope(db, actor, body.project_id);
      const material = await one(
        db,
        'SELECT * FROM materials WHERE tenant_id=$1 AND id=$2 AND archived_at IS NULL',
        [actor.tenant_id, body.material_id],
      );
      const row = await one(
        db,
        'INSERT INTO material_requests(tenant_id,project_id,material_id,zone_id,requested_by,quantity,needed_by,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
        [
          actor.tenant_id,
          body.project_id,
          body.material_id,
          body.zone_id ?? null,
          actor.id,
          body.quantity,
          body.needed_by ?? null,
          body.note ?? null,
        ],
      );
      const project = await one(db, 'SELECT name FROM projects WHERE id=$1', [body.project_id]);
      for (const user of await projectRecipients(
        db,
        actor.tenant_id,
        body.project_id,
        ['warehouse_manager'],
        actor.id,
      ))
        await notify(db, {
          tenant_id: actor.tenant_id,
          user_id: user,
          project_id: body.project_id,
          kind: 'stock.request',
          title: '📦 Material so‘rovi',
          body: `Obyekt: ${project.name}\nMaterial: ${material.name}\nMiqdor: ${quantity(body.quantity)} ${material.unit_id}\nSo‘ragan: ${actor.display_name}${body.note ? `\nIzoh: ${body.note}` : ''}`,
          payload: { request_id: row.id },
          dedup_key: `stock.request:${row.id}:${user}`,
        });
      await audit(db, actor, 'stock.request', row.id);
      return row;
    },
  });
  add({
    method: 'GET',
    path: '/v1/stock/requests',
    summary: 'Material so‘rovlari ro‘yxati',
    permission: 'stock.read',
    query: pageQuery.extend({
      project_id: uuid,
      status: z.enum(['pending', 'fulfilled', 'rejected', 'cancelled']).optional(),
    }),
    handler: async ({ db, actor, query }) => {
      await projectScope(db, actor, query.project_id);
      const manage =
        (await allowed(db, actor, 'stock.send')) ||
        actor.role === 'tenant_admin' ||
        (await allowed(db, actor, 'stock.review'));
      return {
        items: (
          await db.query(
            `SELECT r.*,m.name material_name,m.unit_id,u.display_name requested_by_name,rb.display_name reviewed_by_name,z.name zone_name
             FROM material_requests r JOIN materials m ON m.id=r.material_id JOIN users u ON u.id=r.requested_by LEFT JOIN users rb ON rb.id=r.reviewed_by LEFT JOIN zones z ON z.id=r.zone_id
             WHERE r.tenant_id=$1 AND r.project_id=$2 AND ($3::text IS NULL OR r.status=$3) AND ($4 OR r.requested_by=$5)
             ORDER BY (r.status='pending') DESC,r.created_at DESC LIMIT $6 OFFSET $7`,
            [
              actor.tenant_id,
              query.project_id,
              query.status ?? null,
              manage,
              actor.id,
              query.limit,
              query.offset,
            ],
          )
        ).rows,
      };
    },
  });
  add({
    method: 'POST',
    path: '/v1/stock/requests/:id/actions',
    summary: 'So‘rovni bajarish (jo‘natish yaratadi), rad etish yoki bekor qilish',
    page: 'stock',
    action: 'update',
    params: idParams,
    body: z.strictObject({
      version,
      action: z.enum(['fulfill', 'reject', 'cancel']),
      from_account_id: uuid.optional(),
      to_account_id: uuid.optional(),
      quantity: positiveQty.optional(),
      note: z.string().trim().max(1000).optional(),
    }),
    idempotent: true,
    sensitive: true,
    handler: async ({ db, actor, params, body }) => {
      const request: Row = await one(
        db,
        'SELECT * FROM material_requests WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
        [actor.tenant_id, params.id],
      );
      await projectScope(db, actor, request.project_id);
      invariant(request.version === body.version, 'VERSION_CONFLICT');
      invariant(request.status === 'pending', 'INVALID_TRANSITION');
      const material = await one(db, 'SELECT name,unit_id FROM materials WHERE id=$1', [
        request.material_id,
      ]);
      let command: Row | null = null;
      if (body.action === 'cancel') {
        invariant(
          request.requested_by === actor.id || actor.role === 'tenant_admin',
          'FORBIDDEN',
          403,
        );
      } else {
        invariant(
          (await allowed(db, actor, 'stock.send')) || actor.role === 'tenant_admin',
          'FORBIDDEN',
          403,
        );
        if (body.action === 'fulfill') {
          invariant(body.from_account_id, 'FROM_ACCOUNT_REQUIRED', 400);
          let toAccount = body.to_account_id ?? null;
          if (!toAccount) {
            const requester = await one(
              db,
              'SELECT id,role FROM users WHERE tenant_id=$1 AND id=$2 AND active',
              [actor.tenant_id, request.requested_by],
            );
            invariant(requester.role === 'brigadier', 'TO_ACCOUNT_REQUIRED', 400);
            toAccount = (
              await one(
                db,
                'INSERT INTO stock_accounts(tenant_id,project_id,custodian_id) VALUES($1,$2,$3) ON CONFLICT(tenant_id,project_id,custodian_id) DO UPDATE SET custodian_id=excluded.custodian_id RETURNING id',
                [actor.tenant_id, request.project_id, request.requested_by],
              )
            ).id;
          }
          command = await createStock(db, actor, {
            project_id: request.project_id,
            kind: 'transfer',
            material_id: request.material_id,
            from_account_id: body.from_account_id,
            to_account_id: toAccount,
            quantity: body.quantity ?? quantity(request.quantity),
            zone_id: request.zone_id ?? undefined,
            reason: `Material so‘rovi ${String(request.id).slice(0, 8)}: ${body.note ?? request.note ?? material.name}`,
          });
        }
      }
      const status =
        body.action === 'fulfill'
          ? 'fulfilled'
          : body.action === 'reject'
            ? 'rejected'
            : 'cancelled';
      const row = await one(
        db,
        'UPDATE material_requests SET status=$2,fulfilled_command_id=$3,reviewed_by=$4,review_note=$5,reviewed_at=now(),version=version+1 WHERE id=$1 RETURNING *',
        [params.id, status, command?.id ?? null, actor.id, body.note ?? null],
      );
      if (body.action !== 'cancel')
        await notify(db, {
          tenant_id: actor.tenant_id,
          user_id: request.requested_by,
          project_id: request.project_id,
          kind: `stock.request.${status}`,
          title:
            status === 'fulfilled'
              ? '📦 Material so‘rovi bajarildi'
              : '❌ Material so‘rovi rad etildi',
          body: `Material: ${material.name}\nMiqdor: ${quantity(body.quantity ?? request.quantity)} ${material.unit_id}${body.note ? `\nIzoh: ${body.note}` : ''}`,
          payload: { request_id: request.id, command_id: command?.id ?? null },
          dedup_key: `stock.request.${status}:${request.id}`,
        });
      await audit(db, actor, `stock.request.${status}`, params.id, { note: body.note ?? null });
      return {
        ...row,
        command,
        from_name: await accountName(db, actor.tenant_id, body.from_account_id ?? null),
      };
    },
  });
}
