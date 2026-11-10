import { z } from 'zod';
import ExcelJS from 'exceljs';
import { type Endpoint } from './http.js';
import { audit, one, type Row } from './db.js';
import { dec, money, plannedQuantity } from './money.js';
import { idParams, text, uuid } from './schemas.js';
import { projectScope, allowed } from './permissions.js';
import { invariant } from './errors.js';
import {
  importTarget,
  inspectWorkbook,
  openWorkbook,
  resolveImportNames,
  storeImportPreview,
  commitImportPreview,
  ESTIMATE_FILE_BYTES,
  ESTIMATE_MAX_LINES,
  ESTIMATE_MAX_COLUMNS,
  base64Length,
} from './estimates.js';
import { parseForm5 } from './form5.js';
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
      'Form 5 (ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ) varaqlari: har biri alohida smeta previewi va «Excel jami»',
    permission: 'estimates.import',
    body: z.strictObject({
      project_id: uuid,
      file_base64: z.string().max(base64Length(ESTIMATE_FILE_BYTES)),
      sheets: z
        .array(
          z.strictObject({
            sheet: z.string().min(1).max(200),
            name: text,
            // «Excel jami» blokidagi ulushli qatorlar (masalan, 21 %) — xizmat qatori bo'lib qo'shiladi
            add_rows: z.array(z.number().int().positive()).max(20).optional(),
            // D35: berilsa — shu smetaning yangi reviziyasi; bir smetaga bitta varaq
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
      const picks: { sheet: string; name: string; add_rows?: number[]; estimate_id?: string }[] =
        body.sheets;
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
        return { pick, ...form5 };
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
        const added = p.pick.add_rows ?? [];
        // Ulush Excel summasidan emas, platforma jamidan olinadi (Excel formulasi xatosi o'tmaydi)
        const extras = added.map((row, k) => {
          const share = p.excel.rows.find((x) => x.row === row && x.addable);
          invariant(share, 'EXCEL_ROW_NOT_ADDABLE', 400);
          return {
            kind: 'service',
            description: `${share.label} (${share.percent} %)`.slice(0, 500),
            unit_id: 'set',
            quantity: '1',
            unit_price: money(direct.mul(share.rate!)),
            position: lines.length + k,
          };
        });
        const input = {
          project_id: body.project_id,
          name: p.pick.name,
          lines: [...lines, ...extras],
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
          excel_rows: p.excel.rows.map((x) => ({ ...x, added: added.includes(x.row) })),
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
      'Form 5 previewlari bitta amalda smeta (yoki tanlangan smetaning yangi reviziyasi, D35) bo‘ladi; biri xato bo‘lsa hech biri saqlanmaydi',
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
        { header: 'Kategoriya', key: 'category', width: 18 },
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
          category: l.category ?? '',
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
      }
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
