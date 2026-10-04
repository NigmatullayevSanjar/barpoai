import ExcelJS from 'exceljs';
import { type Db, type Row, one, audit } from './db.js';
import { permit, projectScope } from './permissions.js';
import { estimateInput } from './schemas.js';
import { invariant } from './errors.js';
import { dec, money, plannedQuantity } from './money.js';
export async function validateEstimate(db: Db, actor: Row, input: Row) {
  estimateInput.parse(input);
  await projectScope(db, actor, input.project_id);
  for (const line of input.lines) {
    invariant(
      (line.norm === undefined) === (line.work_quantity === undefined),
      'NORM_WORK_QUANTITY_PAIR_REQUIRED',
      400,
    );
    invariant(
      (line.kind === 'material') === !!line.material_id,
      'MATERIAL_LINE_REFERENCE_REQUIRED',
      400,
    );
    if (line.material_id) {
      const material = await one(
        db,
        'SELECT * FROM materials WHERE tenant_id=$1 AND id=$2 AND archived_at IS NULL',
        [actor.tenant_id, line.material_id],
      );
      invariant(material.unit_id === line.unit_id, 'UNIT_CONVERSION_REQUIRED');
    }
    if (line.zone_id)
      await one(db, 'SELECT 1 FROM zones WHERE tenant_id=$1 AND project_id=$2 AND id=$3', [
        actor.tenant_id,
        input.project_id,
        line.zone_id,
      ]);
    await one(db, 'SELECT 1 FROM units WHERE id=$1', [line.unit_id]);
    const effective = plannedQuantity(line);
    if (line.months?.length) {
      invariant(
        new Set(line.months.map((m: Row) => m.month)).size === line.months.length,
        'DUPLICATE_MONTH',
        400,
      );
      invariant(
        line.months.every((m: Row) => m.month.endsWith('-01')),
        'MONTH_FIRST_DAY_REQUIRED',
        400,
      );
      invariant(
        line.months.reduce((sum: any, m: Row) => sum.add(m.quantity), dec('0')).eq(effective),
        'MONTH_QUANTITY_MISMATCH',
        400,
      );
    }
  }
}
export async function writeEstimate(db: Db, actor: Row, input: Row, existing?: Row): Promise<Row> {
  await permit(db, actor, existing ? 'estimates.edit' : 'estimates.import');
  await validateEstimate(db, actor, input);
  const estimate =
    existing ??
    (await one(
      db,
      'INSERT INTO estimates(tenant_id,project_id,name,created_by) VALUES($1,$2,$3,$4) RETURNING *',
      [actor.tenant_id, input.project_id, input.name, actor.id],
    ));
  if (existing) {
    invariant(existing.project_id === input.project_id, 'PROJECT_IMMUTABLE');
    await db.query(
      'UPDATE estimate_lines SET archived_at=now() WHERE tenant_id=$1 AND estimate_id=$2 AND archived_at IS NULL',
      [actor.tenant_id, estimate.id],
    );
    await db.query('UPDATE estimates SET revision=revision+1,name=$2 WHERE id=$1', [
      estimate.id,
      input.name,
    ]);
    estimate.revision++;
  }
  const lines = [];
  for (const line of input.lines) {
    const effective = plannedQuantity(line);
    const row = await one(
      db,
      `INSERT INTO estimate_lines(tenant_id,project_id,estimate_id,zone_id,material_id,kind,description,unit_id,quantity,norm,work_quantity,loss_percent,effective_quantity,unit_price,total,category,note,position)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [
        actor.tenant_id,
        input.project_id,
        estimate.id,
        line.zone_id ?? null,
        line.material_id ?? null,
        line.kind,
        line.description,
        line.unit_id,
        line.quantity,
        line.norm ?? null,
        line.work_quantity ?? null,
        line.loss_percent ?? '0',
        effective,
        line.unit_price,
        money(dec(effective).mul(line.unit_price)),
        line.category || null,
        line.note || null,
        line.position ?? input.lines.indexOf(line),
      ],
    );
    for (const month of line.months ?? [])
      await db.query(
        'INSERT INTO estimate_months(tenant_id,line_id,month,quantity) VALUES($1,$2,$3,$4)',
        [actor.tenant_id, row.id, month.month, month.quantity],
      );
    lines.push({ ...row, months: line.months ?? [] });
  }
  const result = { ...estimate, name: input.name, lines };
  await db.query(
    'INSERT INTO estimate_revisions(tenant_id,estimate_id,revision,snapshot,created_by) VALUES($1,$2,$3,$4,$5)',
    [actor.tenant_id, estimate.id, estimate.revision, JSON.stringify(result), actor.id],
  );
  await audit(db, actor, existing ? 'estimates.revise' : 'estimates.create', estimate.id);
  return result;
}
export async function parseWorkbook(base64: string, mapping: Record<string, string>) {
  const buffer = Buffer.from(base64, 'base64');
  invariant(
    buffer.length <= 2 * 1024 * 1024 && buffer.subarray(0, 2).toString() === 'PK',
    'INVALID_XLSX',
    400,
  );
  // Inspect ZIP metadata before decompression; reject excessive expansion and macros.
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buffer);
  let expanded = 0;
  for (const entry of Object.values(zip.files)) {
    const size = (entry as any)._data?.uncompressedSize ?? 0;
    expanded += size;
    invariant(
      size <= 10 * 1024 * 1024 &&
        expanded <= 20 * 1024 * 1024 &&
        !/vbaProject|externalLinks/i.test(entry.name),
      'UNSAFE_WORKBOOK',
      400,
    );
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  invariant(sheet && sheet.rowCount <= 2001 && sheet.columnCount <= 50, 'WORKBOOK_LIMIT', 400);
  const headers = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, n) => headers.set(String(cell.value ?? '').trim(), n));
  const lines: Row[] = [];
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    if (row.actualCellCount === 0) continue;
    const line: Row = {};
    for (const [field, header] of Object.entries(mapping)) {
      invariant(headers.has(header), 'MAPPING_HEADER_NOT_FOUND', 400);
      const value = row.getCell(headers.get(header)!).value;
      invariant(
        value === null || ['string', 'number'].includes(typeof value),
        'FORMULAS_NOT_ALLOWED',
        400,
      );
      if (value !== null && value !== '') line[field] = String(value);
    }
    lines.push(line);
  }
  return lines;
}
/** Excel faylning sarlavhalari va dastlabki qatorlari; hech narsa saqlanmaydi (mapping tanlash uchun). */
export async function inspectWorkbook(base64: string) {
  const buffer = Buffer.from(base64, 'base64');
  invariant(
    buffer.length <= 2 * 1024 * 1024 && buffer.subarray(0, 2).toString() === 'PK',
    'INVALID_XLSX',
    400,
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  invariant(sheet && sheet.rowCount <= 2001 && sheet.columnCount <= 50, 'WORKBOOK_LIMIT', 400);
  const headers: string[] = [];
  sheet.getRow(1).eachCell((cell, n) => {
    headers[n - 1] = String(cell.value ?? '').trim();
  });
  const sample: string[][] = [];
  for (let i = 2; i <= Math.min(sheet.rowCount, 6); i++) {
    const row = sheet.getRow(i);
    sample.push(
      headers.map((_, idx) => {
        const value = row.getCell(idx + 1).value;
        return value === null || value === undefined
          ? ''
          : typeof value === 'object'
            ? '[formula]'
            : String(value);
      }),
    );
  }
  return { sheet: sheet.name, headers: headers.filter(Boolean), rows: sheet.rowCount - 1, sample };
}
/**
 * Importda material va zona nomlarini identifikatorlarga aylantiradi.
 * Topilmagan nomlar xato sifatida qaytadi; yashirincha yangi yozuv yaratilmaydi.
 */
export async function resolveImportNames(db: Db, actor: Row, projectId: string, lines: Row[]) {
  const materials = (
    await db.query(
      'SELECT id,name,unit_id FROM materials WHERE tenant_id=$1 AND archived_at IS NULL',
      [actor.tenant_id],
    )
  ).rows;
  const zones = (
    await db.query('SELECT id,name FROM zones WHERE tenant_id=$1 AND project_id=$2', [
      actor.tenant_id,
      projectId,
    ])
  ).rows;
  const kinds: Record<string, string> = {
    material: 'material',
    xomashyo: 'material',
    материал: 'material',
    labor: 'labor',
    ish: 'labor',
    'ish haqi': 'labor',
    работа: 'labor',
    труд: 'labor',
    equipment: 'equipment',
    texnika: 'equipment',
    техника: 'equipment',
    service: 'service',
    xizmat: 'service',
    услуга: 'service',
  };
  const errors: { row: number; field: string; message: string }[] = [];
  const out = lines.map((line, index) => {
    const next: Row = { ...line };
    if (next.kind) next.kind = kinds[String(next.kind).trim().toLowerCase()] ?? next.kind;
    if (next.material_name !== undefined) {
      const name = String(next.material_name).trim().toLowerCase();
      const found = materials.find((m) => m.name.toLowerCase() === name);
      if (!found)
        errors.push({
          row: index + 2,
          field: 'material_name',
          message: String(next.material_name),
        });
      else {
        next.material_id = found.id;
        next.unit_id ??= found.unit_id;
      }
      delete next.material_name;
    }
    if (next.zone_name !== undefined) {
      const name = String(next.zone_name).trim().toLowerCase();
      const found = zones.find((z) => z.name.toLowerCase() === name);
      if (!found)
        errors.push({ row: index + 2, field: 'zone_name', message: String(next.zone_name) });
      else next.zone_id = found.id;
      delete next.zone_name;
    }
    if (next.unit_id) next.unit_id = String(next.unit_id).trim().toLowerCase();
    for (const key of ['quantity', 'unit_price', 'norm', 'work_quantity', 'loss_percent'])
      if (typeof next[key] === 'string') next[key] = next[key].replace(/\s/g, '').replace(',', '.');
    next.position = index;
    return next;
  });
  return { lines: out, errors };
}
