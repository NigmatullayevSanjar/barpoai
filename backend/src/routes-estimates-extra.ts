import { z } from 'zod';
import ExcelJS from 'exceljs';
import { type Endpoint } from './http.js';
import { one } from './db.js';
import { idParams, text } from './schemas.js';
import { projectScope, allowed } from './permissions.js';
import { inspectWorkbook } from './estimates.js';
/** Smeta uchun yordamchi endpointlar: Excel inspeksiya, reviziyalar tarixi, Excel eksport. */
export function estimateExtraRoutes(add: (r: Endpoint) => void) {
  add({
    method: 'POST',
    path: '/v1/estimate-imports/inspect',
    summary: 'Excel sarlavhalari va namunaviy qatorlar; hech narsa saqlanmaydi',
    permission: 'estimates.import',
    body: z.strictObject({ file_base64: z.string().max(2800000), name: text.optional() }),
    handler: async ({ body }) => inspectWorkbook(body.file_base64),
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
          total: lines.reduce((s, l) => s + Number(l.total), 0),
        });
        totalRow.font = { bold: true };
      }
      const buffer = Buffer.from(await book.xlsx.writeBuffer());
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
