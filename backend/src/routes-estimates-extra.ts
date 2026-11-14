import { z } from 'zod';
import ExcelJS from 'exceljs';
import { type Endpoint } from './http.js';
import { audit, one, type Db, type Row } from './db.js';
import { dec, money, plannedQuantity } from './money.js';
import { date, estimateHeader, idParams, priceSettings, text, uuid, version } from './schemas.js';
import { actWorkbook, estimateAct, type ActParties } from './estimate-acts.js';
import {
  assertPriceSettings,
  convertedPercent,
  directCostsOf,
  estimatePriceSummary,
  percentLineSql,
  priceChain,
  settingsOf,
  suggestFromExcel,
} from './estimate-price.js';
import { projectScope, allowed, permit } from './permissions.js';
import { invariant } from './errors.js';
import {
  importTarget,
  inspectWorkbook,
  openWorkbook,
  resolveImportNames,
  storeImportPreview,
  commitImportPreview,
  writeEstimate,
  ESTIMATE_FILE_BYTES,
  ESTIMATE_MAX_LINES,
  ESTIMATE_MAX_COLUMNS,
  base64Length,
} from './estimates.js';
import { parseForm5 } from './form5.js';
const kindOrder = ['labor', 'equipment', 'material', 'service'];
/** S3: eksportdagi smeta yakuni yorliqlari (uz / ru). */
const summaryLabels: Record<string, string> = {
  labor: 'Ish haqi / Заработная плата',
  equipment: 'Mashinalar / Эксплуатация машин',
  contractor_materials: 'Pudratchi materiallari / Материалы подрядчика',
  customer_materials: 'Buyurtmachi materiallari / Материалы заказчика',
  services: 'Xizmatlar / Услуги',
  direct_total: 'To‘g‘ridan-to‘g‘ri xarajatlar / Итого прямых затрат',
  other_costs: 'Boshqa xarajatlar (foyda bilan) / Прочие затраты (с прибылью)',
  production_costs: 'Ishlab chiqarish xarajatlari / Производственные расходы',
  total: 'Jami / Итого',
  customer_deduction: 'Buyurtmachi materiallari qaytarilishi / Возврат материалов заказчика',
  total_without_vat: 'QQSsiz jami / Итого без НДС',
  vat: 'QQS / НДС',
  total_with_vat: 'QQS bilan jami / Итого с НДС',
};
/**
 * S2: smetaning resurslar yig'masi (joriy qatorlar): tur + nom (material — katalog nomi) + birlik + resurs kodi bo'yicha
 * Σ hisobiy miqdor va Σ summa. Form 5 ish pozitsiyasi (mehnat, normasiz, narxi 0; guruhida — bir xil kategoriya va zona —
 * resurs yoki material qatori bor) resurs emas, ish hajmi: kirmaydi; summasi 0, shuning uchun yig'ma jami = smeta jami.
 */
async function estimateResources(db: Db, tenantId: string, estimateId: string) {
  const resourceLines = `WITH r AS (
     SELECT l.*,coalesce(m.name,l.description) resource_name
     FROM estimate_lines l LEFT JOIN materials m ON m.id=l.material_id
       LEFT JOIN (SELECT g.category,coalesce(g.zone_id::text,'') zone_key,
                    bool_or(NOT (g.kind='labor' AND g.norm IS NULL)) has_resources FROM estimate_lines g
                  WHERE g.tenant_id=$1 AND g.estimate_id=$2 AND g.archived_at IS NULL AND g.category IS NOT NULL
                  GROUP BY g.category,coalesce(g.zone_id::text,'')) gr
         ON gr.category=l.category AND gr.zone_key=coalesce(l.zone_id::text,'')
     WHERE l.tenant_id=$1 AND l.estimate_id=$2 AND l.archived_at IS NULL
       AND NOT (l.kind='labor' AND l.norm IS NULL AND l.unit_price=0 AND coalesce(gr.has_resources,false)))`;
  const params = [tenantId, estimateId, kindOrder];
  const items = (
    await db.query(
      `${resourceLines}
       SELECT kind,resource_name name,unit_id,resource_code,count(*)::int line_count,
         sum(effective_quantity)::text quantity,sum(total)::numeric(20,2)::text amount
       FROM r GROUP BY kind,coalesce(material_id::text,description),resource_name,unit_id,resource_code
       ORDER BY array_position($3::text[],kind),min(position),name`,
      params,
    )
  ).rows;
  const byKind = (
    await db.query(
      `${resourceLines}
       SELECT kind key,count(*)::int count,sum(total)::numeric(20,2)::text total
       FROM r GROUP BY kind ORDER BY array_position($3::text[],kind)`,
      params,
    )
  ).rows;
  const total = money(byKind.reduce((s, k) => s.plus(k.total), dec('0')));
  return { items, by_kind: byKind, total };
}
/**
 * S4 (D40): dalolatnoma davri — berilmasa joriy oy (Toshkent), `to` berilib `from` berilmasa — `to` oyining boshidan.
 * Narx huquqi (marshrut ruxsati) va smetani ko'rish huquqi kerak; prorab, brigadir, omborchi ololmaydi (D20).
 */
const actQuery = z.strictObject({ from: date.optional(), to: date.optional() });
async function loadAct(db: Db, actor: Row, id: string, query: { from?: string; to?: string }) {
  const estimate = await one(db, 'SELECT * FROM estimates WHERE tenant_id=$1 AND id=$2', [
    actor.tenant_id,
    id,
  ]);
  await projectScope(db, actor, estimate.project_id);
  await permit(db, actor, 'estimates.read');
  const today = (await one(db, "SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text d", []))
    .d as string;
  const to = query.to ?? today;
  const from = query.from ?? `${to.slice(0, 7)}-01`;
  invariant(from <= to, 'DATE_RANGE_INVALID', 400);
  // F-3 dagi «yil boshidan» `to` yilidan olinadi — davr bitta yil ichida bo'lsin
  invariant(from.slice(0, 4) === to.slice(0, 4), 'ACT_PERIOD_CROSSES_YEAR', 400);
  const parties = await one(
    db,
    `SELECT t.legal_name contractor,t.address contractor_address,t.phone contractor_phone,p.customer_name customer,
       p.name project,p.address project_address
     FROM projects p JOIN tenants t ON t.id=p.tenant_id WHERE p.tenant_id=$1 AND p.id=$2`,
    [actor.tenant_id, estimate.project_id],
  );
  return {
    estimate,
    parties: { ...parties, estimate: estimate.name, revision: estimate.revision } as ActParties,
    act: await estimateAct(db, actor.tenant_id, estimate, from, to),
  };
}
/** Smeta uchun yordamchi endpointlar: Excel inspeksiya, reviziyalar tarixi, Excel eksport. */
export function estimateExtraRoutes(add: (r: Endpoint) => void) {
  add({
    method: 'POST',
    path: '/v1/estimate-imports/inspect',
    summary: 'Excel sarlavhalari va namunaviy qatorlar; hech narsa saqlanmaydi',
    permission: 'estimates.import',
    body: z.strictObject({
      file_base64: z.string().max(base64Length(ESTIMATE_FILE_BYTES)),
      name: text.optional(),
    }),
    bodyLimit: 16 * 1024 * 1024,
    handler: async ({ body }) => inspectWorkbook(body.file_base64),
  });
  // D29: Form 5 — har tanlangan varaq alohida smeta previewi; xatolar varaq nomi va Excel qatori bilan.
  add({
    method: 'POST',
    path: '/v1/estimate-imports/form5/preview',
    summary:
      'Form 5 (ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ) varaqlari: har biri alohida smeta previewi, «Excel jami» va smeta narxi zanjiri bilan qatorma-qator solishtiruv; sozlamalar (boshqa xarajatlar %, QQS) Excel jamlar blokidan taklif qilinadi (S3)',
    permission: 'estimates.import',
    body: z.strictObject({
      project_id: uuid,
      file_base64: z.string().max(base64Length(ESTIMATE_FILE_BYTES)),
      sheets: z
        .array(
          z.strictObject({
            sheet: z.string().min(1).max(200),
            name: text,
            // S3: smeta sozlamalari (berilmasa — Excel jamlar blokidan taklif) va bosh pudratchi materiallarini kim beradi
            settings: priceSettings.optional(),
            gc_supplied_by: z.enum(['contractor', 'customer']).optional(),
            // D42: berilsa — shu smetaning yangi reviziyasi; bir smetaga bitta varaq
            estimate_id: uuid.optional(),
          }),
        )
        .min(1)
        .max(50),
    }),
    bodyLimit: 16 * 1024 * 1024,
    idempotent: true,
    sensitive: true,
    handler: async ({ db, actor, body }) => {
      const picks: {
        sheet: string;
        name: string;
        settings?: Record<string, unknown>;
        gc_supplied_by?: 'contractor' | 'customer';
        estimate_id?: string;
      }[] = body.sheets;
      const targetIds = picks.flatMap((p) => (p.estimate_id ? [p.estimate_id] : []));
      invariant(new Set(targetIds).size === targetIds.length, 'DUPLICATE_TARGET', 400);
      const targets = new Map<string, Row>();
      for (const id of targetIds)
        targets.set(id, await importTarget(db, actor, body.project_id, id));
      const workbook = await openWorkbook(body.file_base64, ESTIMATE_FILE_BYTES);
      const parsed = picks.map((pick) => {
        const sheet = workbook.getWorksheet(pick.sheet);
        invariant(sheet, 'SHEET_NOT_FOUND', 400);
        invariant(
          sheet.rowCount <= ESTIMATE_MAX_LINES + 1 && sheet.columnCount <= ESTIMATE_MAX_COLUMNS,
          'WORKBOOK_LIMIT',
          400,
        );
        const form5 = parseForm5(sheet);
        invariant(form5, 'FORM5_NOT_RECOGNIZED', 400);
        // S3, D37: taklif Excel jamlar blokidan; foydalanuvchi tanlovi ustun
        const suggested = suggestFromExcel(form5.excel.rows);
        const settings = { ...suggested.settings, ...pick.settings };
        assertPriceSettings(settings);
        const supplied = pick.gc_supplied_by ?? suggested.gc_supplied_by;
        const gc = new Set(form5.gcRows);
        for (const line of form5.lines)
          if (gc.has(line._row as number)) line.supplied_by = supplied;
        return { pick, ...form5, suggested, settings, supplied };
      });
      const rowErrors = parsed.flatMap((p) => p.errors.map((e) => ({ sheet: p.pick.sheet, ...e })));
      invariant(rowErrors.length === 0, 'IMPORT_ROWS_INVALID', 400, rowErrors.slice(0, 200));
      const resolved = [];
      for (const p of parsed)
        resolved.push(await resolveImportNames(db, actor, body.project_id, p.lines, 'floor'));
      const nameErrors = resolved.flatMap((r, i) =>
        r.errors.map((e) => ({ sheet: parsed[i]!.pick.sheet, ...e })),
      );
      invariant(nameErrors.length === 0, 'IMPORT_NAMES_UNRESOLVED', 400, nameErrors.slice(0, 200));
      const sheets = [];
      for (const [i, p] of parsed.entries()) {
        const lines = resolved[i]!.lines;
        const direct = lines.reduce<ReturnType<typeof dec>>(
          (s, l) => s.add(money(dec(plannedQuantity(l as any)).mul(l.unit_price))),
          dec('0'),
        );
        // S3 (D39): 21 % endi xizmat qatori emas — smeta sozlamasi; zanjir platforma jamidan, Excel bilan qatorma-qator
        const chain = priceChain(directCostsOf(lines), p.settings);
        const amountOf = (key: string | null) =>
          chain.lines.find((l) => l.key === key)?.amount ?? null;
        const input = {
          project_id: body.project_id,
          name: p.pick.name,
          lines,
          settings: p.settings,
        };
        const target = p.pick.estimate_id ? targets.get(p.pick.estimate_id) : undefined;
        const stored = await storeImportPreview(
          db,
          actor,
          input,
          (n) => p.lines[n]?._row ?? 0,
          p.pick.sheet,
          target,
        );
        sheets.push({
          ...stored.row,
          sheet: p.pick.sheet,
          name: p.pick.name,
          target: target ?? null,
          lines: input.lines.length,
          total: stored.total,
          direct_total: money(direct),
          excel_total: p.excel.total,
          excel_difference: p.excel.total ? money(direct.minus(p.excel.total)) : null,
          excel_rows: p.excel.rows.map((x) => {
            // «ВОЗВРАТ» Excel'da musbat, zanjirda chegirma (manfiy) — solishtirish moduli bo'yicha
            const platform = amountOf(x.key);
            const deduction = x.key === 'customer_deduction';
            const value = platform && deduction ? money(dec(platform).abs()) : platform;
            const excel = x.amount && deduction ? dec(x.amount).abs() : x.amount;
            return {
              ...x,
              platform_amount: value === null ? null : money(value),
              difference: value === null || excel === null ? null : money(dec(value).minus(excel)),
            };
          }),
          suggested: { ...p.suggested.settings, gc_supplied_by: p.suggested.gc_supplied_by },
          settings: p.settings,
          gc_supplied_by: p.supplied,
          gc_materials: p.gcRows.length,
          price_summary: chain,
          zones: [...new Set(p.lines.map((l) => l.zone_name).filter(Boolean))],
          counts: p.counts,
          created: resolved[i]!.created,
          converted: resolved[i]!.converted,
          warnings: p.warnings,
        });
      }
      return { sheets };
    },
  });
  add({
    method: 'POST',
    path: '/v1/estimate-imports/form5/commit',
    summary:
      'Form 5 previewlari bitta amalda smeta (yoki tanlangan smetaning yangi reviziyasi, D42) bo‘ladi; biri xato bo‘lsa hech biri saqlanmaydi',
    permission: 'estimates.import',
    body: z.strictObject({
      items: z
        .array(z.strictObject({ id: uuid, digest: z.string().length(64) }))
        .min(1)
        .max(50),
    }),
    idempotent: true,
    sensitive: true,
    handler: async ({ db, actor, body }) => {
      const estimates = [];
      for (const item of body.items)
        estimates.push(await commitImportPreview(db, actor, item.id, item.digest));
      return { estimates: estimates.map((e) => ({ id: e.id })) };
    },
  });
  add({
    method: 'GET',
    path: '/v1/estimates/:id/revisions',
    summary: 'Smeta reviziyalari tarixi (snapshot jami va muallif)',
    permission: 'estimates.read',
    params: idParams,
    sensitive: true,
    handler: async ({ db, actor, params }) => {
      const estimate = await one(db, 'SELECT * FROM estimates WHERE tenant_id=$1 AND id=$2', [
        actor.tenant_id,
        params.id,
      ]);
      await projectScope(db, actor, estimate.project_id);
      const rows = (
        await db.query(
          `SELECT r.revision,r.created_at,u.display_name created_by_name,
             jsonb_array_length(r.snapshot->'lines') line_count,
             (SELECT coalesce(sum((x->>'total')::numeric),0)::text FROM jsonb_array_elements(r.snapshot->'lines') x) total,
             r.snapshot->>'name' name
           FROM estimate_revisions r LEFT JOIN users u ON u.id=r.created_by
           WHERE r.tenant_id=$1 AND r.estimate_id=$2 ORDER BY r.revision DESC`,
          [actor.tenant_id, params.id],
        )
      ).rows;
      return { items: rows };
    },
  });
  add({
    method: 'GET',
    path: '/v1/estimates/:id/revisions/:revision',
    summary: 'Muayyan reviziya qatorlari (snapshot)',
    permission: 'estimates.read',
    params: z.strictObject({ id: idParams.shape.id, revision: z.coerce.number().int().positive() }),
    sensitive: true,
    handler: async ({ db, actor, params }) => {
      const estimate = await one(db, 'SELECT * FROM estimates WHERE tenant_id=$1 AND id=$2', [
        actor.tenant_id,
        params.id,
      ]);
      await projectScope(db, actor, estimate.project_id);
      const row = await one(
        db,
        'SELECT revision,snapshot,created_at FROM estimate_revisions WHERE tenant_id=$1 AND estimate_id=$2 AND revision=$3',
        [actor.tenant_id, params.id, params.revision],
      );
      return { revision: row.revision, created_at: row.created_at, ...row.snapshot };
    },
  });
  add({
    method: 'PATCH',
    path: '/v1/estimates/:id/header',
    summary:
      'Smeta sarlavhasi: asos, narx darajasi sanasi, ish haqi stavkasi manbai, pudrat shartnomasi (raqam, sana, summa QQS bilan — D41) va smeta narxi sozlamalari (rejim, boshqa xarajatlar, foyda, ishlab chiqarish, buyurtmachi materiallari chegirmasi, QQS — S3); reviziya yaratmaydi, audit eski va yangi qiymat bilan',
    permission: 'estimates.edit',
    params: idParams,
    body: estimateHeader,
    idempotent: true,
    sensitive: true,
    handler: async ({ db, actor, params, body }) => {
      const existing = await one(
        db,
        'SELECT * FROM estimates WHERE tenant_id=$1 AND id=$2 AND archived_at IS NULL FOR UPDATE',
        [actor.tenant_id, params.id],
      );
      await projectScope(db, actor, existing.project_id);
      // Berilmagan maydon o'zgarmaydi; null yoki bo'sh matn tozalaydi. Kalitlar zod strictObject dan — SQL ga xavfsiz.
      const changes = Object.entries(body).map(([key, value]) => [
        key,
        value === '' ? null : value,
      ]);
      if (!changes.length) return existing;
      // S3: sozlamalar ham shu yerda — VMQ 583 da foyda 7 %, ishlab chiqarish 2,5 % yoki 5 %
      assertPriceSettings(settingsOf({ ...existing, ...Object.fromEntries(changes) }));
      const updated = await one(
        db,
        `UPDATE estimates SET ${changes.map(([key], i) => `${key}=$${i + 2}`).join(',')} WHERE id=$1 RETURNING *`,
        [params.id, ...changes.map(([, value]) => value)],
      );
      await audit(db, actor, 'estimates.header', params.id, {
        before: Object.fromEntries(changes.map(([key]) => [key, existing[key as string]])),
        after: Object.fromEntries(changes),
      });
      return updated;
    },
  });
  add({
    method: 'POST',
    path: '/v1/estimates/:id/percent-lines/convert',
    summary:
      'D29 bilan qo‘shilgan foizli «xizmat» qatorlarini (masalan, «… (21 %)») yangi reviziyada olib tashlab, foizini «boshqa xarajatlar» sozlamasiga qo‘shadi (D39, S3)',
    permission: 'estimates.edit',
    params: idParams,
    body: z.strictObject({ version }),
    idempotent: true,
    sensitive: true,
    handler: async ({ db, actor, params, body }) => {
      const existing = await one(
        db,
        'SELECT * FROM estimates WHERE tenant_id=$1 AND id=$2 AND archived_at IS NULL FOR UPDATE',
        [actor.tenant_id, params.id],
      );
      await projectScope(db, actor, existing.project_id);
      invariant(existing.revision === body.version, 'VERSION_CONFLICT');
      const rows = (
        await db.query(
          `SELECT l.*,${percentLineSql} is_percent,
             coalesce((SELECT jsonb_agg(jsonb_build_object('month',mo.month,'quantity',mo.quantity::text) ORDER BY mo.month)
                       FROM estimate_months mo WHERE mo.tenant_id=l.tenant_id AND mo.line_id=l.id),'[]') months
           FROM estimate_lines l WHERE l.tenant_id=$1 AND l.estimate_id=$2 AND l.archived_at IS NULL ORDER BY l.position,l.id`,
          [actor.tenant_id, params.id],
        )
      ).rows;
      const percentLines = rows.filter((r) => r.is_percent);
      invariant(percentLines.length > 0, 'NO_PERCENT_LINES', 400);
      // Qolgan qatorlar o'zgarishsiz qayta yoziladi (reviziya — lineage, vazifa va fakt o'sha qatorlarda qoladi)
      const lines = rows
        .filter((r) => !r.is_percent)
        .map((l, i) => ({
          kind: l.kind,
          description: l.description,
          unit_id: l.unit_id,
          quantity: l.quantity,
          unit_price: l.unit_price,
          loss_percent: l.loss_percent,
          ...(l.zone_id ? { zone_id: l.zone_id } : {}),
          ...(l.material_id ? { material_id: l.material_id } : {}),
          ...(l.norm !== null ? { norm: l.norm, work_quantity: l.work_quantity } : {}),
          ...(l.labor_rate !== null ? { labor_rate: l.labor_rate } : {}),
          category: l.category,
          note: l.note,
          norm_code: l.norm_code,
          resource_code: l.resource_code,
          section_name: l.section_name,
          supplied_by: l.supplied_by,
          position: i,
          ...(l.months.length ? { months: l.months } : {}),
        }));
      const other = convertedPercent(settingsOf(existing), percentLines);
      // Natija 100 % dan oshsa — aniq xato (bazaning CHECK xatosi emas)
      invariant(dec(other).lte(100), 'PERCENT_OUT_OF_RANGE', 400);
      const estimate = await writeEstimate(
        db,
        actor,
        {
          project_id: existing.project_id,
          name: existing.name,
          lines,
          settings: { other_costs_percent: other },
        },
        existing,
      );
      await audit(db, actor, 'estimates.percent_lines', params.id, {
        removed: percentLines.length,
        other_costs_percent: { before: dec(existing.other_costs_percent).toFixed(), after: other },
      });
      return { id: estimate.id, revision: estimate.revision, other_costs_percent: other };
    },
  });
  add({
    method: 'GET',
    path: '/v1/estimates/:id/resources',
    summary:
      'Resurslar yig‘masi (joriy qatorlar): tur, nom, birlik, resurs kodi bo‘yicha jami miqdor va summa; Form 5 ish pozitsiyalari kirmaydi; summa faqat narx huquqi bilan',
    permission: 'estimates.read',
    params: idParams,
    sensitive: true,
    handler: async ({ db, actor, params }) => {
      const estimate = await one(db, 'SELECT * FROM estimates WHERE tenant_id=$1 AND id=$2', [
        actor.tenant_id,
        params.id,
      ]);
      await projectScope(db, actor, estimate.project_id);
      return {
        estimate_id: estimate.id,
        revision: estimate.revision,
        ...(await estimateResources(db, actor.tenant_id, estimate.id)),
      };
    },
  });
  add({
    method: 'GET',
    path: '/v1/estimates/:id/acts',
    summary:
      'Dalolatnoma (S4, D40): davr (from…to, standart — joriy oy) bo‘yicha qabul qilingan ish hajmi va ombor sarfidan F-2 qatorlari, smeta narxi zanjiri uch jamg‘arma bilan (qurilish boshidan, yil boshidan, davr) va shartnomaga nisbatan foiz (F-3); holat saqlanmaydi',
    permission: 'prices.read',
    params: idParams,
    query: actQuery,
    sensitive: true,
    handler: async ({ db, actor, params, query }) => {
      const { estimate, parties, act } = await loadAct(db, actor, params.id, query);
      return {
        estimate: {
          id: estimate.id,
          name: estimate.name,
          revision: estimate.revision,
          project_id: estimate.project_id,
        },
        parties,
        ...act,
      };
    },
  });
  add({
    method: 'GET',
    path: '/v1/estimates/:id/acts/export',
    summary:
      'Dalolatnoma Excel’da: F-2 (АКТ ВЫПОЛНЕННЫХ РАБОТ, lokal resurs smeta) va F-3 (СПРАВКА-СЧЕТ-ФАКТУРА, 16 ustun) varaqlari; qiymatlar, formula emas; audit export.estimate_act',
    permission: 'prices.read',
    params: idParams,
    query: actQuery,
    handler: async ({ db, actor, params, query }) => {
      const { estimate, parties, act } = await loadAct(db, actor, params.id, query);
      const base64 = await actWorkbook(act, parties);
      await audit(db, actor, 'export.estimate_act', params.id, {
        revision: estimate.revision,
        from: act.period.from,
        to: act.period.to,
      });
      return {
        filename: `${`akt-${estimate.name}-${act.period.from}-${act.period.to}`.replace(/[^\w.-]+/g, '_')}.xlsx`,
        mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        base64,
      };
    },
  });
  add({
    method: 'GET',
    path: '/v1/estimates/:id/export',
    summary:
      'Smetani Excel (xlsx) ko‘rinishida eksport qilish; narx huquqi bo‘lmasa narx ustunlari yo‘q',
    permission: 'estimates.read',
    params: idParams,
    handler: async ({ db, actor, params }) => {
      const estimate = await one(db, 'SELECT * FROM estimates WHERE tenant_id=$1 AND id=$2', [
        actor.tenant_id,
        params.id,
      ]);
      const project = await projectScope(db, actor, estimate.project_id);
      const prices = await allowed(db, actor, 'prices.read');
      const lines = (
        await db.query(
          `SELECT l.*,m.name material_name,z.name zone_name FROM estimate_lines l LEFT JOIN materials m ON m.id=l.material_id LEFT JOIN zones z ON z.id=l.zone_id
           WHERE l.tenant_id=$1 AND l.estimate_id=$2 AND l.archived_at IS NULL ORDER BY l.position,l.id`,
          [actor.tenant_id, params.id],
        )
      ).rows;
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet('Smeta');
      const columns = [
        { header: '№', key: 'n', width: 6 },
        { header: 'Turi', key: 'kind', width: 12 },
        // S2: bo'lim va kodlar — import shu sarlavhalarni taniydi (eksport → import aylanmasi)
        { header: 'Bo‘lim', key: 'section_name', width: 24 },
        { header: 'Norma kodi', key: 'norm_code', width: 18 },
        { header: 'Resurs kodi', key: 'resource_code', width: 12 },
        { header: 'Kategoriya', key: 'category', width: 18 },
        // S3, D37: materialni kim beradi (import shu sarlavhani taniydi)
        { header: 'Kim beradi', key: 'supplied_by', width: 12 },
        { header: 'Nomi', key: 'description', width: 42 },
        { header: 'Material', key: 'material_name', width: 24 },
        { header: 'Zona', key: 'zone_name', width: 16 },
        { header: 'Birlik', key: 'unit_id', width: 8 },
        { header: 'Miqdor', key: 'quantity', width: 12 },
        { header: 'Norma', key: 'norm', width: 10 },
        { header: 'Ish hajmi', key: 'work_quantity', width: 12 },
        { header: 'Yo‘qotish %', key: 'loss_percent', width: 10 },
        { header: 'Hisobiy miqdor', key: 'effective_quantity', width: 14 },
        ...(prices
          ? [
              { header: 'Birlik narxi', key: 'unit_price', width: 14 },
              { header: 'Jami', key: 'total', width: 16 },
            ]
          : []),
        { header: 'Izoh', key: 'note', width: 30 },
      ];
      sheet.columns = columns;
      sheet.getRow(1).font = { bold: true };
      lines.forEach((l, i) =>
        sheet.addRow({
          n: i + 1,
          kind: l.kind,
          section_name: l.section_name ?? '',
          norm_code: l.norm_code ?? '',
          resource_code: l.resource_code ?? '',
          category: l.category ?? '',
          supplied_by:
            l.kind !== 'material' ? '' : l.supplied_by === 'customer' ? 'buyurtmachi' : 'pudratchi',
          description: l.description,
          material_name: l.material_name ?? '',
          zone_name: l.zone_name ?? '',
          unit_id: l.unit_id,
          quantity: Number(l.quantity),
          norm: l.norm === null ? '' : Number(l.norm),
          work_quantity: l.work_quantity === null ? '' : Number(l.work_quantity),
          loss_percent: Number(l.loss_percent),
          effective_quantity: Number(l.effective_quantity),
          ...(prices ? { unit_price: Number(l.unit_price), total: Number(l.total) } : {}),
          note: l.note ?? '',
        }),
      );
      if (prices && lines.length) {
        const totalRow = sheet.addRow({
          description: 'JAMI',
          total: Number(money(lines.reduce((s, l) => s.plus(l.total), dec('0')))),
        });
        totalRow.font = { bold: true };
        // S3: smeta yakuni (egasining `локалка` tartibi): nom — «Nomi», foiz — «Izoh», summa — «Jami» ustunida.
        // Importda bu qatorlar o'tkaziladi (miqdor, norma, narx yo'q).
        const priceSummary = await estimatePriceSummary(db, actor.tenant_id, estimate);
        sheet.addRow({});
        for (const line of priceSummary.lines) {
          const row = sheet.addRow({
            description: summaryLabels[line.key] ?? line.key,
            note: line.percent !== undefined ? `${line.percent} %` : '',
            total: Number(line.amount),
          });
          if (['direct_total', 'total', 'total_without_vat', 'total_with_vat'].includes(line.key))
            row.font = { bold: true };
        }
      }
      // S2: «Resurslar yig'masi» varag'i — mehnat, mashinalar, materiallar, xizmatlar (narx huquqisiz summasiz)
      const resources = await estimateResources(db, actor.tenant_id, estimate.id);
      const summary = book.addWorksheet('Resurslar yig‘masi');
      summary.columns = [
        { header: 'Turi', key: 'kind', width: 12 },
        { header: 'Resurs kodi', key: 'resource_code', width: 12 },
        { header: 'Nomi', key: 'name', width: 48 },
        { header: 'Birlik', key: 'unit_id', width: 8 },
        { header: 'Miqdor', key: 'quantity', width: 14 },
        ...(prices ? [{ header: 'Summa', key: 'amount', width: 16 }] : []),
      ];
      summary.getRow(1).font = { bold: true };
      for (const r of resources.items)
        summary.addRow({
          kind: r.kind,
          resource_code: r.resource_code ?? '',
          name: r.name,
          unit_id: r.unit_id,
          quantity: Number(r.quantity),
          ...(prices ? { amount: Number(r.amount) } : {}),
        });
      if (prices && resources.items.length)
        summary.addRow({ name: 'JAMI', amount: Number(resources.total) }).font = { bold: true };
      const buffer = Buffer.from(await book.xlsx.writeBuffer());
      await audit(db, actor, 'export.estimate', params.id, { revision: estimate.revision });
      const safe =
        `${project.code ?? project.name}-${estimate.name}-rev${estimate.revision}`.replace(
          /[^\w.-]+/g,
          '_',
        );
      return {
        filename: `${safe}.xlsx`,
        mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        base64: buffer.toString('base64'),
      };
    },
  });
}
