import { posix } from 'node:path';
import ExcelJS from 'exceljs';
import { type Db, type Row, one, audit } from './db.js';
import { permit, projectScope } from './permissions.js';
import { estimateInput } from './schemas.js';
import { DomainError, invariant } from './errors.js';
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
/** Xavfsiz o'qish: hajm, ZIP kengayishi, makros va qator/ustun cheklovlari; birinchi varaqni qaytaradi. */
export async function loadWorkbook(base64: string) {
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
  // openpyxl va boshqalar bog'lanishni mutlaq yo'l bilan yozadi (Target="/xl/tables/table1.xml");
  // exceljs faqat nisbiy yo'lni topadi va jadvalli varaqda TypeError beradi. Yo'llarni nisbiyga keltiramiz.
  let rewritten = false;
  for (const name of Object.keys(zip.files).filter((n) => n.endsWith('.rels'))) {
    const xml = await zip.file(name)!.async('string');
    const base = posix.dirname(posix.dirname(name)); // xl/worksheets/_rels/x.rels -> xl/worksheets
    const fixed = xml.replace(
      /(<Relationship\b[^>]*?\bTarget=")\/([^"]+)"/g,
      (match, head, target) =>
        /TargetMode="External"/.test(match) ? match : `${head}${posix.relative(base, target)}"`,
    );
    if (fixed !== xml) {
      zip.file(name, fixed);
      rewritten = true;
    }
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(
      (rewritten ? await zip.generateAsync({ type: 'nodebuffer' }) : buffer) as any,
    );
  } catch {
    throw new DomainError('INVALID_XLSX', 400);
  }
  const sheet = workbook.worksheets[0];
  invariant(sheet && sheet.rowCount <= 2001 && sheet.columnCount <= 50, 'WORKBOOK_LIMIT', 400);
  return sheet;
}
type Sheet = Awaited<ReturnType<typeof loadWorkbook>>;
/**
 * Katak qiymati: birlashtirilgan katakning faqat asosiy (chap-yuqori) katagi o'qiladi, qolganlari bo'sh;
 * rich text matnga aylanadi; formula obyekt bo'lib qoladi (chaqiruvchi rad etadi).
 */
function cellValue(sheet: Sheet, row: number, col: number): unknown {
  const cell = sheet.getRow(row).getCell(col);
  if (cell.isMerged && cell.master.address !== cell.address) return null;
  const value = cell.value as any;
  if (value && typeof value === 'object' && Array.isArray(value.richText))
    return value.richText.map((r: { text: string }) => r.text).join('');
  return value ?? null;
}
/**
 * Sarlavha qatori: dastlabki 20 qatordan kamida ikkita matnli katak bo'lgan va son/formula
 * bo'lmagan birinchi qator. Tepadagi birlashtirilgan nom va izoh qatorlari shunday o'tkazib yuboriladi.
 */
function headerRow(sheet: Sheet) {
  for (let r = 1; r <= Math.min(sheet.rowCount, 20); r++) {
    const values: unknown[] = [];
    for (let c = 1; c <= sheet.columnCount; c++) {
      const v = cellValue(sheet, r, c);
      if (v !== null && v !== '') values.push(v);
    }
    if (values.length >= 2 && values.every((v) => typeof v === 'string' && v.trim())) return r;
  }
  return 1;
}
function headerMap(sheet: Sheet, row: number) {
  const headers = new Map<string, number>();
  for (let c = 1; c <= sheet.columnCount; c++) {
    const v = String(cellValue(sheet, row, c) ?? '').trim();
    if (v && !headers.has(v)) headers.set(v, c);
  }
  return headers;
}
/** Har qator Excel'dagi haqiqiy raqami bilan (`_row`), xatolarda shu raqam ko'rsatiladi. */
export async function parseWorkbook(base64: string, mapping: Record<string, string>) {
  const sheet = await loadWorkbook(base64);
  const first = headerRow(sheet);
  const headers = headerMap(sheet, first);
  for (const header of Object.values(mapping))
    invariant(headers.has(header), 'MAPPING_HEADER_NOT_FOUND', 400);
  const lines: Row[] = [];
  for (let i = first + 1; i <= sheet.rowCount; i++) {
    const line: Row = {};
    for (const [field, header] of Object.entries(mapping)) {
      const value = cellValue(sheet, i, headers.get(header)!);
      invariant(
        value === null || ['string', 'number'].includes(typeof value),
        'FORMULAS_NOT_ALLOWED',
        400,
      );
      if (value !== null && String(value).trim() !== '') line[field] = String(value).trim();
    }
    // Bo'sh, bo'lim nomi yoki "JAMI" kabi birlashtirilgan qatorlar: nom, miqdor va narx yo'q.
    if (
      line.description === undefined &&
      line.quantity === undefined &&
      line.unit_price === undefined
    )
      continue;
    lines.push({ ...line, _row: i });
  }
  return lines;
}
/** Excel faylning sarlavhalari va dastlabki qatorlari; hech narsa saqlanmaydi (mapping tanlash uchun). */
export async function inspectWorkbook(base64: string) {
  const sheet = await loadWorkbook(base64);
  const first = headerRow(sheet);
  const columns = [...headerMap(sheet, first)];
  const sample: string[][] = [];
  let rows = 0;
  for (let i = first + 1; i <= sheet.rowCount; i++) {
    const values = columns.map(([, c]) => cellValue(sheet, i, c));
    if (values.every((v) => v === null || v === '')) continue;
    rows++;
    if (sample.length < 5)
      sample.push(
        values.map((v) => (v === null ? '' : typeof v === 'object' ? '[formula]' : String(v))),
      );
  }
  return {
    sheet: sheet.name,
    header_row: first,
    headers: columns.map(([h]) => h),
    rows,
    sample,
  };
}
/** Excel'dagi odatiy birlik yozuvlari → `units.id` (kichik harf, oxiridagi nuqtasiz). */
const unitAliases: Record<string, string> = {
  'm²': 'm2',
  'м²': 'm2',
  м2: 'm2',
  'kv.m': 'm2',
  'кв.м': 'm2',
  'm³': 'm3',
  'м³': 'm3',
  м3: 'm3',
  'kub.m': 'm3',
  'куб.м': 'm3',
  м: 'm',
  metr: 'm',
  метр: 'm',
  'p.m': 'm',
  'п.м': 'm',
  кг: 'kg',
  т: 't',
  tn: 't',
  тн: 't',
  tonna: 't',
  тонна: 't',
  dona: 'pcs',
  шт: 'pcs',
  soat: 'hour',
  час: 'hour',
  ч: 'hour',
  kompl: 'set',
  komplekt: 'set',
  компл: 'set',
  комплект: 'set',
};
/**
 * Importda material va zona nomlarini identifikatorlarga aylantiradi.
 * Topilmagan nomlar xato sifatida qaytadi; yashirincha yangi yozuv yaratilmaydi.
 */
/**
 * Excel nomlarini bazadagi material va zonalarga bog'laydi. Topilmagan nomlar (material, zona) avtomatik yaratiladi:
 * obyekt ochilgach smetani darhol yuklash mumkin (egasi qarori, 2026-10-22). Material birligi qatordagi birlikdan
 * (yo'q bo'lsa "dona"). Yaratilganlar soni `created` da qaytadi.
 */
export async function resolveImportNames(db: Db, actor: Row, projectId: string, lines: Row[]) {
  await projectScope(db, actor, projectId);
  const created = { materials: 0, zones: 0 };
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
  const out: Row[] = [];
  for (const [index, line] of lines.entries()) {
    const { _row, ...next }: Row = { ...line };
    const row = (_row as number | undefined) ?? index + 2;
    if (next.kind) next.kind = kinds[String(next.kind).trim().toLowerCase()] ?? next.kind;
    if (next.material_name !== undefined) {
      const name = String(next.material_name).trim().toLowerCase();
      const found = materials.find((m) => m.name.toLowerCase() === name);
      if (!found) {
        const unitRaw = String(next.unit_id ?? 'pcs').trim().toLowerCase().replace(/\.$/, '');
        const unit = unitAliases[unitRaw] ?? unitRaw;
        const known = (await db.query('SELECT 1 FROM units WHERE id=$1', [unit])).rowCount;
        if (!known) errors.push({ row, field: 'unit_id', message: String(next.unit_id ?? '') });
        else {
          const made = await one(
            db,
            'INSERT INTO materials(tenant_id,name,unit_id) VALUES($1,$2,$3) RETURNING id,name,unit_id',
            [actor.tenant_id, String(next.material_name).trim(), unit],
          );
          materials.push(made);
          created.materials++;
          next.material_id = made.id;
          next.unit_id ??= made.unit_id;
        }
      } else {
        next.material_id = found.id;
        next.unit_id ??= found.unit_id;
      }
      delete next.material_name;
    }
    if (next.zone_name !== undefined) {
      const name = String(next.zone_name).trim().toLowerCase();
      const found = zones.find((z) => z.name.toLowerCase() === name);
      if (!found) {
        const made = await one(
          db,
          'INSERT INTO zones(tenant_id,project_id,name) VALUES($1,$2,$3) RETURNING id,name',
          [actor.tenant_id, projectId, String(next.zone_name).trim()],
        );
        zones.push(made);
        created.zones++;
        next.zone_id = made.id;
      } else next.zone_id = found.id;
      delete next.zone_name;
    }
    if (next.unit_id) {
      const unit = String(next.unit_id).trim().toLowerCase().replace(/\.$/, '');
      next.unit_id = unitAliases[unit] ?? unit;
    }
    for (const key of ['quantity', 'unit_price', 'norm', 'work_quantity', 'loss_percent'])
      if (typeof next[key] === 'string') next[key] = next[key].replace(/\s/g, '').replace(',', '.');
    next.position = index;
    out.push(next);
  }
  return { lines: out, errors, created };
}
