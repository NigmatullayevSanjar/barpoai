import { z } from 'zod';
import { type Endpoint } from './http.js';
import { one, audit, type Db, type Row } from './db.js';
import { uuid, pageQuery, date, searchQuery, likePattern, queryBool } from './schemas.js';
import { projectScope, accountScope, allowed } from './permissions.js';
import { invariant } from './errors.js';
import { customerMaterials, customerMaterialsWorkbook } from './customer-materials.js';
import { MAIN_WAREHOUSE_NAME } from './routes-company.js';

/**
 * Ombordagi smeta ma'lumoti (reja, rejadan oshgan, smeta qatorlari): smetani ko'ruvchi (`estimates.read`) yoki
 * sarfni smeta qatoriga yozuvchi prorab (`stock.consume`). Omborchi smetani ko'rmaydi (egasi, 2026-11-23).
 */
async function stockEstimatesVisible(db: Db, actor: Row) {
  return (
    (await allowed(db, actor, 'estimates.read')) || (await allowed(db, actor, 'stock.consume'))
  );
}
/** Hisoblarni rol doirasiga qarab filtrlovchi umumiy shart. */
const accountFilter = `($3<>'foreman' OR a.custodian_id IS NULL OR a.custodian_id=$4) AND ($3<>'warehouse_manager' OR a.warehouse_id IS NULL OR EXISTS(SELECT 1 FROM warehouse_assignments w WHERE w.tenant_id=a.tenant_id AND w.warehouse_id=a.warehouse_id AND w.user_id=$4))`;

/** Obyekt bo'yicha hisoblar va qoldiqlar (rol doirasida); eksport ham shu funksiyadan. */
export async function stockOverview(db: Db, actor: Row, projectId: string) {
  await projectScope(db, actor, projectId);
  const accounts = (
    await db.query(
      `SELECT a.id,a.warehouse_id,a.custodian_id,coalesce(w.name,u.display_name) name,CASE WHEN a.warehouse_id IS NULL THEN 'custody' ELSE 'warehouse' END kind,u.role custodian_role
       FROM stock_accounts a LEFT JOIN warehouses w ON w.id=a.warehouse_id LEFT JOIN users u ON u.id=a.custodian_id
       WHERE a.tenant_id=$1 AND a.project_id=$2 AND ${accountFilter} ORDER BY a.warehouse_id NULLS LAST,name`,
      [actor.tenant_id, projectId, actor.role, actor.id],
    )
  ).rows;
  // D42: smeta rejasi ko'rinadigan asosiy omborda (bo'lmasa birinchi ko'rinadigan omborda) ko'rsatiladi
  const warehouses = accounts.filter((a) => a.kind === 'warehouse');
  const planAccount = (await stockEstimatesVisible(db, actor))
    ? ((warehouses.find((a) => a.name === MAIN_WAREHOUSE_NAME) ?? warehouses[0])?.id ?? null)
    : null;
  /**
   * D42: qatorlar — qoldig'i, rezervi yoki minimumi bor, kirim qilingan (kirim/boshlang'ich qoldiq, storno ayirilgan)
   * yoki obyektning joriy smetalarida bor material; smetadagi, hali omborga kelmagan material 0 qoldiq bilan.
   * `plan_quantity` — joriy smetalardagi material qatorlari hisobiy miqdori (faqat reja omborining qatorida);
   * `received_quantity` — shu hisobga kirim; `over_plan` — obyekt bo'yicha kirim rejadan oshgan. Reja smeta bilan
   * o'zgaradi, kirim va qoldiq (fakt) o'zgarmaydi.
   */
  const balances = accounts.length
    ? (
        await db.query(
          `WITH plan AS (
             SELECT l.material_id,sum(l.effective_quantity) quantity
             FROM estimate_lines l JOIN estimates e ON e.tenant_id=l.tenant_id AND e.id=l.estimate_id
             WHERE l.tenant_id=$1 AND l.project_id=$3 AND l.kind='material' AND l.archived_at IS NULL AND e.archived_at IS NULL
             GROUP BY l.material_id
           ), received AS (
             SELECT s.account_id,s.material_id,sum(s.quantity_delta) quantity
             FROM stock_ledger s JOIN stock_commands c ON c.tenant_id=s.tenant_id AND c.id=s.command_id
               LEFT JOIN stock_commands o ON o.tenant_id=c.tenant_id AND o.id=c.reverses_id
             WHERE s.tenant_id=$1 AND c.project_id=$3 AND (c.kind IN ('opening','receipt') OR o.kind IN ('opening','receipt'))
             GROUP BY s.account_id,s.material_id
           ), rows AS (
             SELECT b.account_id,b.material_id,b.quantity,b.reserved,b.value,b.minimum_quantity
             FROM stock_balances b WHERE b.tenant_id=$1 AND b.account_id=ANY($2::uuid[])
             UNION ALL
             SELECT $4::uuid,p.material_id,0,0,0,0 FROM plan p
             WHERE $4::uuid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM stock_balances b WHERE b.tenant_id=$1 AND b.account_id=$4::uuid AND b.material_id=p.material_id)
           )
           SELECT x.account_id,x.material_id,m.name material_name,m.unit_id,x.quantity::numeric(24,6)::text quantity,x.reserved::numeric(24,6)::text reserved,
                  (x.quantity-x.reserved)::numeric(24,6)::text available,x.value::numeric(20,2)::text value,x.minimum_quantity::numeric(24,6)::text minimum_quantity,
                  (x.quantity-x.reserved<x.minimum_quantity AND x.minimum_quantity>0) low,
                  p.quantity::numeric(24,6)::text plan_quantity,coalesce(r.quantity,0)::numeric(24,6)::text received_quantity,
                  (p.quantity IS NOT NULL AND (SELECT coalesce(sum(t.quantity),0) FROM received t WHERE t.material_id=x.material_id)>p.quantity) over_plan
           FROM rows x JOIN materials m ON m.tenant_id=$1 AND m.id=x.material_id
             LEFT JOIN plan p ON x.account_id=$4::uuid AND p.material_id=x.material_id
             LEFT JOIN received r ON r.account_id=x.account_id AND r.material_id=x.material_id
           WHERE x.quantity>0 OR x.reserved>0 OR x.minimum_quantity>0 OR p.material_id IS NOT NULL OR r.quantity>0
           ORDER BY m.name`,
          [actor.tenant_id, accounts.map((a) => a.id), projectId, planAccount],
        )
      ).rows
    : [];
  const pending = await one(
    db,
    `SELECT count(*) FILTER(WHERE kind='transfer' AND status IN ('pending','partial','disputed'))::int transfers,
            count(*) FILTER(WHERE kind='return' AND status IN ('pending','partial','disputed'))::int returns
     FROM stock_commands WHERE tenant_id=$1 AND project_id=$2`,
    [actor.tenant_id, projectId],
  );
  return { accounts, balances, pending };
}
/**
 * S5: buyurtmachi materiallari hisoboti davri — berilmasa joriy oy (Toshkent); `to` kiradi. Ombor ko'rish huquqi
 * (`stock.read`) va obyekt doirasi; summalar faqat narx huquqi bilan (sensitive / Excel'da ustun bo'sh).
 */
const customerQuery = z.strictObject({
  project_id: uuid,
  from: date.optional(),
  to: date.optional(),
});
async function loadCustomerMaterials(db: Db, actor: Row, query: Row) {
  await projectScope(db, actor, query.project_id);
  const today = (await one(db, "SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text d", []))
    .d as string;
  const to = query.to ?? today;
  const from = query.from ?? `${to.slice(0, 7)}-01`;
  invariant(from <= to, 'DATE_RANGE_INVALID', 400);
  return customerMaterials(
    db,
    actor.tenant_id,
    query.project_id,
    from,
    to,
    await allowed(db, actor, 'estimates.read'),
  );
}
export function stockExtraRoutes(add: (r: Endpoint) => void) {
  add({
    method: 'GET',
    path: '/v1/stock/customer-materials',
    summary:
      'Buyurtmachi (bosh pudratchi) materiallari hisoboti (S5): smetada «buyurtmachi beradi» deb belgilangan materiallar bo‘yicha davr boshidagi qoldiq, berilgan, sarflangan, tuzatish, oxirgi qoldiq (ombor yozuvlari, Toshkent sanasi) va ish bo‘yicha normativ sarf bilan solishtiruv; summa faqat narx huquqi bilan',
    permission: 'stock.read',
    query: customerQuery,
    sensitive: true,
    handler: ({ db, actor, query }) => loadCustomerMaterials(db, actor, query),
  });
  add({
    method: 'GET',
    path: '/v1/stock/customer-materials/export',
    summary:
      'Buyurtmachi materiallari hisoboti Excel’da (rus tilida, egasining «отчёт» shakli): «Отчет» va «Нормативный расход» varaqlari; summa ustunlari narx huquqisiz bo‘sh; audit export.customer_materials',
    permission: 'stock.read',
    query: customerQuery,
    handler: async ({ db, actor, query }) => {
      const report = await loadCustomerMaterials(db, actor, query);
      const project = await one(
        db,
        'SELECT name,address FROM projects WHERE tenant_id=$1 AND id=$2',
        [actor.tenant_id, query.project_id],
      );
      const base64 = await customerMaterialsWorkbook(
        report,
        { project: project.name, project_address: project.address },
        await allowed(db, actor, 'prices.read'),
      );
      await audit(db, actor, 'export.customer_materials', query.project_id, report.period);
      return {
        filename: `${`buyurtmachi-materiallari-${project.name}-${report.period.from}-${report.period.to}`.replace(/[^\w.-]+/g, '_')}.xlsx`,
        mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        base64,
      };
    },
  });
  add({
    method: 'GET',
    path: '/v1/stock/overview',
    summary: 'Obyekt bo‘yicha hisoblar (ombor va prorab) va material qoldiqlari',
    permission: 'stock.read',
    query: z.object({ project_id: uuid }),
    sensitive: true,
    handler: ({ db, actor, query }) => stockOverview(db, actor, query.project_id),
  });
  add({
    method: 'GET',
    path: '/v1/stock/estimate-lines',
    summary:
      'Jo‘natish va sarfda tanlash uchun obyektning joriy smetalaridagi shu materialning qatorlari (barcha arxivlanmagan smetalar); narxsiz; `estimates.read` yoki `stock.consume` (prorab) bilan, aks holda (ombor mudiri) bo‘sh ro‘yxat',
    permission: 'stock.read',
    query: z.object({ project_id: uuid, material_id: uuid }),
    handler: async ({ db, actor, query }) => {
      await projectScope(db, actor, query.project_id);
      if (!(await stockEstimatesVisible(db, actor))) return { items: [] };
      return {
        items: (
          await db.query(
            `SELECT l.id,e.name estimate_name,l.description,l.unit_id,l.effective_quantity::text effective_quantity,z.name zone_name
             FROM estimate_lines l JOIN estimates e ON e.tenant_id=l.tenant_id AND e.id=l.estimate_id LEFT JOIN zones z ON z.id=l.zone_id
             WHERE l.tenant_id=$1 AND l.project_id=$2 AND l.material_id=$3 AND l.kind='material' AND l.archived_at IS NULL AND e.archived_at IS NULL
             ORDER BY e.name,l.position,l.id`,
            [actor.tenant_id, query.project_id, query.material_id],
          )
        ).rows,
      };
    },
  });
  add({
    method: 'GET',
    path: '/v1/stock/commands',
    summary:
      'Ombor harakatlari: kirim, jo‘natish, sarf, qaytarish, tuzatish, reversal; q — material nomi; unmatched=true — invoysga bog‘lanmagan',
    permission: 'stock.read',
    query: searchQuery.extend({
      project_id: uuid,
      status: z.enum(['pending', 'partial', 'posted', 'cancelled', 'disputed', 'open']).optional(),
      kind: z
        .enum(['opening', 'receipt', 'transfer', 'consumption', 'return', 'adjustment', 'reversal'])
        .optional(),
      account_id: uuid.optional(),
      material_id: uuid.optional(),
      unmatched: queryBool.optional(),
      /** Figma "Kirim/Chiqim" segmenti: in — opening/receipt/return (omborga kiradi), out — transfer/consumption. */
      direction: z.enum(['in', 'out']).optional(),
    }),
    sensitive: true,
    handler: async ({ db, actor, query }) => {
      await projectScope(db, actor, query.project_id);
      const estimatesVisible = await stockEstimatesVisible(db, actor);
      return {
        items: (
          await db.query(
            `SELECT c.*,m.name material_name,m.unit_id,
                    coalesce(wf.name,uf.display_name) from_name,coalesce(wt.name,ut.display_name) to_name,
                    cb.display_name created_by_name,rb.display_name reviewed_by_name,CASE WHEN $14 THEN l.description END estimate_line_name,z.name zone_name,
                    (c.quantity-c.accepted_quantity)::text remaining_quantity,
                    CASE WHEN c.kind IN ('receipt','opening') THEN (SELECT coalesce(sum(sl.value_delta),0) FROM stock_ledger sl WHERE sl.tenant_id=c.tenant_id AND sl.command_id=c.id)::numeric(20,2)::text END value
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
               AND ($11::text IS NULL OR m.name ILIKE $11 ESCAPE '\\')
               AND ($12::boolean IS NOT TRUE OR NOT EXISTS(SELECT 1 FROM finance_documents f WHERE f.tenant_id=c.tenant_id AND f.matched_receipt_id=c.id))
               AND ($13::text IS NULL OR ($13='in' AND c.kind IN ('opening','receipt','return')) OR ($13='out' AND c.kind IN ('transfer','consumption')))
               AND ($3<>'foreman' OR (af.custodian_id IS NULL AND at.custodian_id IS NULL) OR af.custodian_id=$4 OR at.custodian_id=$4)
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
              query.q ? likePattern(query.q) : null,
              query.unmatched ?? null,
              query.direction ?? null,
              estimatesVisible,
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
}
