import { z } from 'zod';
import { type Endpoint } from './http.js';
import { one, audit } from './db.js';
import { uuid, idParams, pageQuery } from './schemas.js';
import { projectScope, permissions, allowed } from './permissions.js';
import { invariant } from './errors.js';
import { workFactSql } from './routes-dashboard.js';
import { dec, quantity } from './money.js';
/** Obyekt kartasi, xodim kartasi, biriktirishni olib tashlash va omborlar ro'yxati. */
export function companyExtraRoutes(add: (r: Endpoint) => void) {
  add({
    method: 'GET',
    path: '/v1/projects/:id',
    summary: 'Obyekt kartasi: zonalar, biriktirilgan xodimlar, omborlar va hisoblagichlar',
    permission: 'projects.read',
    params: idParams,
    handler: async ({ db, actor, params }) => {
      const project = await projectScope(db, actor, params.id);
      // Holat sanalardan: fakt tugagan → completed; reja tugash o'tgan → delayed; fakt boshlangan → active; aks holda waiting.
      // Smeta jami: arxivlanmagan smetalarning joriy qatorlari, zonasi shu blok yoki uning ichidagi zona (eng yaqin blok).
      const prices = await allowed(db, actor, 'prices.read');
      const zones = (
        await db.query(
          `SELECT z.*,
             CASE WHEN z.actual_end IS NOT NULL THEN 'completed'
                  WHEN z.planned_end < current_date THEN 'delayed'
                  WHEN z.actual_start IS NOT NULL THEN 'active'
                  ELSE 'waiting' END status,
             coalesce((SELECT json_agg(json_build_object('id',u.id,'display_name',u.display_name) ORDER BY u.display_name)
               FROM zone_responsibles r JOIN users u ON u.tenant_id=r.tenant_id AND u.id=r.user_id
               WHERE r.tenant_id=z.tenant_id AND r.zone_id=z.id),'[]') responsibles,
             CASE WHEN $3 AND z.kind='block' THEN coalesce(t.total,0)::text END estimate_total
           FROM zones z
           LEFT JOIN (SELECT premise_block(l.tenant_id,l.zone_id) block_id,sum(l.total) total
                      FROM estimate_lines l JOIN estimates e ON e.tenant_id=l.tenant_id AND e.id=l.estimate_id
                      WHERE l.tenant_id=$1 AND e.project_id=$2 AND e.archived_at IS NULL AND l.archived_at IS NULL AND l.zone_id IS NOT NULL
                      GROUP BY 1) t ON t.block_id=z.id
           WHERE z.tenant_id=$1 AND z.project_id=$2 ORDER BY z.name,z.id`,
          [actor.tenant_id, params.id, prices],
        )
      ).rows;
      const members = (
        await db.query(
          `SELECT u.id,u.display_name,u.role,u.phone,u.active,
                  coalesce((SELECT json_agg(json_build_object('id',w.id,'name',w.name)) FROM warehouse_assignments wa JOIN warehouses w ON w.id=wa.warehouse_id WHERE wa.tenant_id=u.tenant_id AND wa.user_id=u.id AND w.project_id=$2),'[]') warehouses
           FROM project_assignments a JOIN users u ON u.tenant_id=a.tenant_id AND u.id=a.user_id
           WHERE a.tenant_id=$1 AND a.project_id=$2 ORDER BY u.role,u.display_name`,
          [actor.tenant_id, params.id],
        )
      ).rows;
      const warehouses = (
        await db.query(
          'SELECT w.*,a.id account_id FROM warehouses w LEFT JOIN stock_accounts a ON a.tenant_id=w.tenant_id AND a.warehouse_id=w.id WHERE w.tenant_id=$1 AND w.project_id=$2 ORDER BY w.name',
          [actor.tenant_id, params.id],
        )
      ).rows;
      const counters = await one(
        db,
        `SELECT
           (SELECT count(*)::int FROM tasks t WHERE t.tenant_id=$1 AND t.project_id=$2 AND t.archived_at IS NULL AND t.status<>'accepted') open_tasks,
           (SELECT count(*)::int FROM tasks t WHERE t.tenant_id=$1 AND t.project_id=$2 AND t.archived_at IS NULL AND t.status<>'accepted' AND t.deadline<now()) overdue_tasks,
           (SELECT count(*)::int FROM estimates e WHERE e.tenant_id=$1 AND e.project_id=$2 AND e.archived_at IS NULL) estimates,
           (SELECT count(*)::int FROM reports r WHERE r.tenant_id=$1 AND r.project_id=$2 AND r.archived_at IS NULL AND r.status='submitted') pending_reports`,
        [actor.tenant_id, params.id],
      );
      // Obyekt moliya kartasi (D23/D, 2026-10-28): faqat narx huquqi bilan, hamma raqam serverda. To'langan —
      // kontragentlarga to'lov va avans (storno asl hujjat turi bilan netto), kassalar aro o'tkazma kirmaydi.
      const finance = prices
        ? await one(
            db,
            `WITH je AS (
               SELECT j.account,j.amount,coalesce(o.kind,f.kind) kind
               FROM journal_entries j LEFT JOIN finance_documents f ON f.tenant_id=j.tenant_id AND f.id=j.finance_document_id
                    LEFT JOIN finance_documents o ON o.tenant_id=f.tenant_id AND o.id=f.reverses_id
               WHERE j.tenant_id=$1 AND j.project_id=$2),
             t AS (
               SELECT (SELECT coalesce(sum(l.total),0) FROM estimate_lines l JOIN estimates e ON e.tenant_id=l.tenant_id AND e.id=l.estimate_id
                        WHERE l.tenant_id=$1 AND l.project_id=$2 AND l.archived_at IS NULL AND e.archived_at IS NULL) plan,
                      coalesce(sum(amount) FILTER(WHERE account='expense'),0) fact,
                      -coalesce(sum(amount) FILTER(WHERE account='cash' AND kind IN ('payment','advance')),0) paid,
                      -coalesce(sum(amount) FILTER(WHERE account='payable'),0) debt,
                      coalesce(sum(amount) FILTER(WHERE account='advance'),0) advances,
                      -coalesce(sum(amount) FILTER(WHERE account='income'),0) income
               FROM je)
             SELECT plan::numeric(20,2)::text plan_total,fact::numeric(20,2)::text fact_total,(plan-fact)::numeric(20,2)::text remaining_plan,
                    CASE WHEN plan>0 THEN round(100*fact/plan,1)::text END fact_percent,
                    paid::numeric(20,2)::text paid,debt::numeric(20,2)::text debt,advances::numeric(20,2)::text advances,income::numeric(20,2)::text income,
                    (SELECT avg(least(100,100*${workFactSql}/l.effective_quantity))::numeric(5,1)::text FROM estimate_lines l JOIN estimates e ON e.id=l.estimate_id
                      WHERE l.tenant_id=$1 AND l.project_id=$2 AND l.kind<>'material' AND l.archived_at IS NULL AND e.archived_at IS NULL AND l.effective_quantity>0) progress_percent
             FROM t`,
            [actor.tenant_id, params.id],
          )
        : null;
      // V-C: brigada foizi — pul ko'rsatkichi, faqat narx huquqi bilan (prorab ko'rmaydi, D20)
      return {
        ...project,
        brigade_percent: prices ? project.brigade_percent : undefined,
        zones,
        members,
        warehouses,
        counters,
        finance,
      };
    },
  });
  // V-E (D23): qavat × ish progress matritsasi. Qavat — kind='floor' zona, ichidagi zonalar o'sha qavatga yig'iladi
  // (boshqa qavatga kirmaydi). Reja — qavatga biriktirilgan ish qatorlari; fakt — qabul qilingan hisobot progressi
  // (+tuzatishlar), qavati hisobot zonasidan, zonasiz hisobotda qator zonasidan. Narx yo'q — hajmlar hamma rolga.
  // D28: ish = kategoriya (ish kodi) + nom + birlik — bir xil nomli resurslar har ish ostida alohida satr.
  add({
    method: 'GET',
    path: '/v1/projects/:id/floor-progress',
    summary:
      'Qavat × ish progress matritsasi: qavat zonalari bo‘yicha ish qatorlarining reja va qabul qilingan hajmi (narxsiz)',
    permission: 'projects.read',
    action: 'read',
    params: idParams,
    handler: async ({ db, actor, params }) => {
      await projectScope(db, actor, params.id);
      const args = [actor.tenant_id, params.id];
      const workFrom = `estimate_lines l JOIN estimates e ON e.tenant_id=l.tenant_id AND e.id=l.estimate_id`;
      const workWhere = `WHERE l.tenant_id=$1 AND l.project_id=$2 AND l.kind<>'material' AND l.archived_at IS NULL AND e.archived_at IS NULL`;
      const progressFrom = `progress_entries pe JOIN reports r ON r.tenant_id=pe.tenant_id AND r.id=pe.report_id
           JOIN estimate_lines l ON l.tenant_id=pe.tenant_id AND l.id=pe.estimate_line_id
           LEFT JOIN (SELECT progress_entry_id,sum(quantity_delta) delta FROM progress_corrections WHERE tenant_id=$1 GROUP BY 1) c ON c.progress_entry_id=pe.id`;
      const progressWhere = `WHERE pe.tenant_id=$1 AND l.project_id=$2`;
      const floors = (
        await db.query(
          `SELECT z.id,z.name,p.name parent_name FROM zones z LEFT JOIN zones p ON p.tenant_id=z.tenant_id AND p.id=z.parent_id
           WHERE z.tenant_id=$1 AND z.project_id=$2 AND z.kind='floor'`,
          args,
        )
      ).rows;
      const works = (
        await db.query(
          `WITH cur AS (SELECT coalesce(l.category,'') category,l.description,l.unit_id,sum(l.effective_quantity) plan,min(e.name) est,min(l.position) pos FROM ${workFrom} ${workWhere} GROUP BY 1,2,3),
                f AS (SELECT coalesce(l.category,'') category,l.description,l.unit_id,sum(pe.quantity+coalesce(c.delta,0)) fact FROM ${progressFrom} ${progressWhere} GROUP BY 1,2,3)
           SELECT coalesce(cur.category,f.category) category,coalesce(cur.description,f.description) description,coalesce(cur.unit_id,f.unit_id) unit_id,cur.plan::text plan,
                  coalesce(f.fact,0)::text fact,CASE WHEN cur.plan>0 THEN round(100*coalesce(f.fact,0)/cur.plan,1)::text END percent
           FROM cur FULL JOIN f ON f.category=cur.category AND f.description=cur.description AND f.unit_id=cur.unit_id
           ORDER BY cur.est NULLS LAST,cur.pos NULLS LAST,1,2`,
          args,
        )
      ).rows;
      const cells = (
        await db.query(
          `WITH RECURSIVE tree AS (
             SELECT id floor_id,id zone_id FROM zones WHERE tenant_id=$1 AND project_id=$2 AND kind='floor'
             UNION
             SELECT t.floor_id,z.id FROM tree t JOIN zones z ON z.tenant_id=$1 AND z.parent_id=t.zone_id AND z.kind<>'floor'),
           p AS (SELECT t.floor_id,coalesce(l.category,'') category,l.description,l.unit_id,sum(l.effective_quantity) plan FROM ${workFrom} JOIN tree t ON t.zone_id=l.zone_id ${workWhere} GROUP BY 1,2,3,4),
           f AS (SELECT t.floor_id,coalesce(l.category,'') category,l.description,l.unit_id,sum(pe.quantity+coalesce(c.delta,0)) fact
                 FROM ${progressFrom} JOIN tree t ON t.zone_id=coalesce(r.zone_id,l.zone_id) ${progressWhere} GROUP BY 1,2,3,4)
           SELECT coalesce(p.floor_id,f.floor_id) zone_id,coalesce(p.category,f.category) category,coalesce(p.description,f.description) description,coalesce(p.unit_id,f.unit_id) unit_id,
                  p.plan::text plan,coalesce(f.fact,0)::text fact,CASE WHEN p.plan>0 THEN round(100*coalesce(f.fact,0)/p.plan,1)::text END percent
           FROM p FULL JOIN f ON f.floor_id=p.floor_id AND f.category=p.category AND f.description=p.description AND f.unit_id=p.unit_id`,
          args,
        )
      ).rows;
      const byFloor = (zoneId: string) => cells.filter((c) => c.zone_id === zoneId);
      const total = (rows: { plan: string | null; fact: string }[]) => {
        const planned = rows.filter((c) => c.plan !== null);
        const plan = planned.length
          ? planned.reduce((a, c) => a.plus(c.plan as string), dec('0'))
          : null;
        const fact = rows.reduce((a, c) => a.plus(c.fact), dec('0'));
        return {
          plan: plan ? quantity(plan) : null,
          fact: quantity(fact),
          percent: plan && plan.gt(0) ? fact.times(100).div(plan).toFixed(1) : null,
        };
      };
      const compare = (a: string | null, b: string | null) =>
        (a ?? '').localeCompare(b ?? '', undefined, { numeric: true });
      return {
        floors: floors
          .sort((a, b) => compare(a.parent_name, b.parent_name) || compare(a.name, b.name))
          .map((f) => ({ ...f, ...total(byFloor(f.id)) })),
        works,
        cells,
      };
    },
  });
  add({
    method: 'GET',
    path: '/v1/warehouses',
    summary: 'Obyekt omborlari va ularning stock hisoblari',
    permission: 'stock.read',
    query: pageQuery.extend({ project_id: uuid }),
    handler: async ({ db, actor, query }) => {
      await projectScope(db, actor, query.project_id);
      return {
        items: (
          await db.query(
            `SELECT w.*,a.id account_id FROM warehouses w LEFT JOIN stock_accounts a ON a.tenant_id=w.tenant_id AND a.warehouse_id=w.id
             WHERE w.tenant_id=$1 AND w.project_id=$2 AND ($3<>'warehouse_manager' OR EXISTS(SELECT 1 FROM warehouse_assignments x WHERE x.tenant_id=w.tenant_id AND x.warehouse_id=w.id AND x.user_id=$4))
             ORDER BY w.name LIMIT $5 OFFSET $6`,
            [actor.tenant_id, query.project_id, actor.role, actor.id, query.limit, query.offset],
          )
        ).rows,
      };
    },
  });
  add({
    method: 'GET',
    path: '/v1/employees/:id',
    summary: 'Xodim kartasi: biriktirishlar, individual ruxsatlar va Telegram holati',
    permission: 'employees.read',
    action: 'read',
    params: idParams,
    handler: async ({ db, actor, params }) => {
      const user = await one(
        db,
        'SELECT id,login,display_name,phone,role,active,must_change_password,position,hired_at,version,created_at FROM users WHERE tenant_id=$1 AND id=$2',
        [actor.tenant_id, params.id],
      );
      const projects = (
        await db.query(
          `SELECT p.id,p.name,p.code,p.status,
                  coalesce((SELECT json_agg(json_build_object('id',w.id,'name',w.name)) FROM warehouse_assignments wa JOIN warehouses w ON w.id=wa.warehouse_id WHERE wa.tenant_id=a.tenant_id AND wa.user_id=a.user_id AND w.project_id=p.id),'[]') warehouses
           FROM project_assignments a JOIN projects p ON p.tenant_id=a.tenant_id AND p.id=a.project_id
           WHERE a.tenant_id=$1 AND a.user_id=$2 AND p.archived_at IS NULL ORDER BY p.name`,
          [actor.tenant_id, params.id],
        )
      ).rows;
      const overrides = (
        await db.query(
          'SELECT permission,effect FROM permission_overrides WHERE tenant_id=$1 AND user_id=$2',
          [actor.tenant_id, params.id],
        )
      ).rows;
      const telegram = (
        await db.query(
          'SELECT telegram_username,linked_at FROM telegram_accounts WHERE user_id=$1',
          [params.id],
        )
      ).rows[0];
      const effective: string[] = [];
      for (const p of permissions)
        if (await allowed(db, { ...user, tenant_id: actor.tenant_id }, p)) effective.push(p);
      return {
        ...user,
        projects,
        overrides,
        effective_permissions: effective,
        telegram: telegram
          ? { username: telegram.telegram_username, linked_at: telegram.linked_at }
          : null,
      };
    },
  });
  add({
    method: 'DELETE',
    path: '/v1/employees/:id/assignments',
    summary: 'Obyekt yoki ombor biriktirishini olib tashlash',
    permission: 'employees.manage',
    action: 'update',
    params: idParams,
    body: z.strictObject({ project_id: uuid, warehouse_id: uuid.optional() }),
    idempotent: true,
    handler: async ({ db, actor, params, body }) => {
      await projectScope(db, actor, body.project_id);
      if (body.warehouse_id) {
        await db.query(
          'DELETE FROM warehouse_assignments WHERE tenant_id=$1 AND warehouse_id=$2 AND user_id=$3',
          [actor.tenant_id, body.warehouse_id, params.id],
        );
      } else {
        const open = await db.query(
          "SELECT 1 FROM tasks WHERE tenant_id=$1 AND project_id=$2 AND (assignee_id=$3 OR reviewer_id=$3) AND status<>'accepted' AND archived_at IS NULL LIMIT 1",
          [actor.tenant_id, body.project_id, params.id],
        );
        const custody = await db.query(
          'SELECT 1 FROM stock_accounts a JOIN stock_balances b ON b.tenant_id=a.tenant_id AND b.account_id=a.id WHERE a.tenant_id=$1 AND a.project_id=$2 AND a.custodian_id=$3 AND (b.quantity>0 OR b.reserved>0) LIMIT 1',
          [actor.tenant_id, body.project_id, params.id],
        );
        invariant(!open.rowCount && !custody.rowCount, 'HANDOVER_REQUIRED');
        await db.query(
          'DELETE FROM warehouse_assignments wa USING warehouses w WHERE wa.tenant_id=$1 AND wa.user_id=$3 AND w.id=wa.warehouse_id AND w.project_id=$2',
          [actor.tenant_id, body.project_id, params.id],
        );
        await db.query(
          'DELETE FROM project_assignments WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3',
          [actor.tenant_id, body.project_id, params.id],
        );
      }
      await audit(db, actor, 'employee.unassign', params.id, body);
      return { ok: true };
    },
  });
}
