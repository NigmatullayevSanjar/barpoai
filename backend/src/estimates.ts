import { posix } from 'node:path';
import ExcelJS from 'exceljs';
import { type Db, type Row, one, audit } from './db.js';
import { permit, projectScope } from './permissions.js';
import { amount, estimateInput, qty } from './schemas.js';
import { DomainError, invariant } from './errors.js';
import { dec, money, plannedQuantity } from './money.js';
import { digest } from './security.js';
import { form5Summary } from './form5.js';
import { applyPriceSettings } from './estimate-price.js';
/**
 * D27: `l` qatori va oldingi reviziyalardagi «o'sha» qatorlari (bir xil `lineage_id`) — fakt reviziyada yo'qolmaydi.
 * `column` — fakt yozuvidagi smeta qatori ustuni (masalan, `pe.estimate_line_id`).
 */
export const sameWorkSql = (column: string) =>
  `${column} IN (SELECT w.id FROM estimate_lines w WHERE w.tenant_id=l.tenant_id AND w.lineage_id=l.lineage_id)`;
/** Ish qatori fakti (`l` — estimate_lines): qabul qilingan hisobot hajmlari + tuzatishlar. */
export const workFactSql = `(coalesce((SELECT sum(pe.quantity) FROM progress_entries pe WHERE pe.tenant_id=l.tenant_id AND ${sameWorkSql('pe.estimate_line_id')}),0)
  +coalesce((SELECT sum(c.quantity_delta) FROM progress_corrections c JOIN progress_entries pe ON pe.tenant_id=c.tenant_id AND pe.id=c.progress_entry_id WHERE pe.tenant_id=l.tenant_id AND ${sameWorkSql('pe.estimate_line_id')}),0))`;
/**
 * Vazifalar uchun smeta qatori maydonlari (`t` — tasks, `l` — LEFT JOIN estimate_lines). Fakt: material qatorida
 * tasdiqlangan sarf, ish qatorida qabul qilingan hajm. Reviziyadan keyin qator arxivlangan bo'lishi mumkin (`estimate_line_archived`).
 */
export const taskLineSql = `l.description estimate_line_name,l.kind estimate_kind,l.unit_id estimate_unit,l.effective_quantity::text estimate_plan_quantity,
    CASE WHEN l.id IS NULL THEN NULL WHEN l.kind='material'
      THEN (SELECT coalesce(sum(c.accepted_quantity),0) FROM stock_commands c WHERE c.tenant_id=l.tenant_id AND ${sameWorkSql('c.estimate_line_id')} AND c.kind='consumption' AND c.status IN ('posted','partial'))
      ELSE ${workFactSql} END::text estimate_fact_quantity,
    CASE WHEN l.id IS NULL OR l.effective_quantity<=0 THEN NULL ELSE round(100*(CASE WHEN l.kind='material'
      THEN (SELECT coalesce(sum(c.accepted_quantity),0) FROM stock_commands c WHERE c.tenant_id=l.tenant_id AND ${sameWorkSql('c.estimate_line_id')} AND c.kind='consumption' AND c.status IN ('posted','partial'))
      ELSE ${workFactSql} END)/l.effective_quantity,1)::text END estimate_percent,
    (l.archived_at IS NOT NULL) estimate_line_archived`;
export const taskLineJoinSql = `LEFT JOIN estimate_lines l ON l.tenant_id=t.tenant_id AND l.id=t.estimate_line_id`;
/** Obyektning joriy smetasidagi (arxivlanmagan) qator; boshqa obyekt yoki eski reviziya — xato. */
export async function assertEstimateLine(db: Db, tenantId: string, projectId: string, lineId: string) {
  invariant(
    (
      await db.query(
        `SELECT 1 FROM estimate_lines l JOIN estimates e ON e.tenant_id=l.tenant_id AND e.id=l.estimate_id
         WHERE l.tenant_id=$1 AND l.project_id=$2 AND l.id=$3 AND l.archived_at IS NULL AND e.archived_at IS NULL`,
        [tenantId, projectId, lineId],
      )
    ).rowCount,
    'ESTIMATE_LINE_NOT_FOUND',
    400,
  );
}
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
    // S3, D37: «buyurtmachi beradi» faqat material qatorida
    invariant(line.supplied_by !== 'customer' || line.kind === 'material', 'SUPPLIED_BY_MATERIAL_ONLY', 400);
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
/**
 * D26/D27: reviziyada yangi qator mos eski qatorning ish identifikatorini (lineage_id) oladi. Mos — tur, nom, birlik,
 * zona, material va kategoriya bir xil. Bir xil qatorlar bir nechta bo'lsa tartib saqlanadi (diff kabi: eski va yangi
 * ro'yxatning eng uzun umumiy ketma-ketligi), joyi o'zgargan qatorlar keyin kalit bo'yicha; har eski qator bir marta.
 */
async function matchLineage(db: Db, tenantId: string, estimateId: string, lines: Row[]) {
  const old = (
    await db.query(
      'SELECT kind,description,unit_id,zone_id,material_id,category,lineage_id FROM estimate_lines WHERE tenant_id=$1 AND estimate_id=$2 AND archived_at IS NULL ORDER BY position,id',
      [tenantId, estimateId],
    )
  ).rows;
  const id = (v: unknown) => (v ? String(v).toLowerCase() : '');
  const key = (l: Row) =>
    [l.kind, l.description, l.unit_id, id(l.zone_id), id(l.material_id), l.category || ''].join('\u0000');
  const fresh = lines
    .map((l, i) => ({ l, at: l.position ?? i }))
    .sort((a, b) => a.at - b.at)
    .map((x) => x.l);
  const result = new Map<Row, string>();
  for (const [j, i] of alignKeys(old.map(key), fresh.map(key)))
    result.set(fresh[j]!, old[i].lineage_id);
  return result;
}
/**
 * Eski (`a`) va yangi (`b`) qator kalitlarini tartibni saqlab moslaydi; natija: yangi indeks → eski indeks.
 * Umumiy bosh va oxir bevosita; o'rtasi kichik bo'lsa eng uzun umumiy ketma-ketlik (diff kabi), katta bo'lsa har kalit
 * ichida tartib bo'yicha (xotira ≤ 4 mln katak, 20 000 qatorda ham); joyi o'zgarganlar oxirida kalit bo'yicha.
 */
export function alignKeys(a: string[], b: string[]) {
  const match = new Map<number, number>();
  const used = new Set<number>();
  const pair = (i: number, j: number) => {
    match.set(j, i);
    used.add(i);
  };
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    pair(start, start);
    start++;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
    pair(endA, endB);
  }
  const n = endA - start;
  const m = endB - start;
  if ((n + 1) * (m + 1) <= 4_000_000) {
    const width = m + 1;
    const lcs = new Uint16Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        lcs[i * width + j] =
          a[start + i] === b[start + j]
            ? lcs[(i + 1) * width + j + 1]! + 1
            : Math.max(lcs[(i + 1) * width + j]!, lcs[i * width + j + 1]!);
    for (let i = 0, j = 0; i < n && j < m; )
      if (a[start + i] === b[start + j]) {
        pair(start + i, start + j);
        i++;
        j++;
      } else if (lcs[(i + 1) * width + j]! >= lcs[i * width + j + 1]!) i++;
      else j++;
  }
  // Joyi o'zgargan (yoki katta o'rta qismdagi) qatorlar: har kalit ichida tartib bo'yicha birinchi bo'sh eski qator.
  const free = new Map<string, number[]>();
  a.forEach((k, i) => {
    if (!used.has(i)) (free.get(k) ?? free.set(k, []).get(k)!).push(i);
  });
  b.forEach((k, j) => {
    if (match.has(j)) return;
    const i = free.get(k)?.shift();
    if (i !== undefined) pair(i, j);
  });
  return match;
}
export async function writeEstimate(db: Db, actor: Row, input: Row, existing?: Row): Promise<Row> {
  await permit(db, actor, existing ? 'estimates.edit' : 'estimates.import');
  await validateEstimate(db, actor, input);
  let estimate =
    existing ??
    (await one(
      db,
      'INSERT INTO estimates(tenant_id,project_id,name,created_by) VALUES($1,$2,$3,$4) RETURNING *',
      [actor.tenant_id, input.project_id, input.name, actor.id],
    ));
  const lineage = existing
    ? await matchLineage(db, actor.tenant_id, existing.id, input.lines)
    : new Map<Row, string>();
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
  // S3: sozlamalar (yaratishda — masalan, Form 5 taklifi; reviziyada — berilganlari) snapshot'ga ham tushadi
  if (input.settings) estimate = await applyPriceSettings(db, estimate, input.settings);
  const lines = [];
  for (const line of input.lines) {
    const effective = plannedQuantity(line);
    const position = line.position ?? input.lines.indexOf(line);
    const row = await one(
      db,
      `INSERT INTO estimate_lines(tenant_id,project_id,estimate_id,zone_id,material_id,kind,description,unit_id,quantity,norm,work_quantity,loss_percent,effective_quantity,unit_price,total,category,note,position,labor_rate,lineage_id,norm_code,resource_code,section_name,supplied_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,coalesce($20::uuid,gen_random_uuid()),$21,$22,$23,$24) RETURNING *`,
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
        position,
        line.kind === 'material' ? null : (line.labor_rate ?? null),
        lineage.get(line) ?? null,
        line.norm_code || null,
        line.resource_code || null,
        line.section_name || null,
        line.supplied_by ?? 'contractor',
      ],
    );
    for (const month of line.months ?? [])
      await db.query(
        'INSERT INTO estimate_months(tenant_id,line_id,month,quantity) VALUES($1,$2,$3,$4)',
        [actor.tenant_id, row.id, month.month, month.quantity],
      );
    lines.push({ ...row, months: line.months ?? [] });
  }
  // V-A, D26: reviziyada vazifa yangi reviziyadagi "o'sha" qatorga (bir xil lineage_id) o'tadi. Mos qator bo'lmasa vazifa
  // eski (arxivlangan) qatorda qoladi va kartada belgilanadi.
  if (existing)
    await db.query(
      `UPDATE tasks t SET estimate_line_id=n.id
       FROM estimate_lines o JOIN estimate_lines n ON n.tenant_id=o.tenant_id AND n.estimate_id=o.estimate_id
         AND n.lineage_id=o.lineage_id AND n.archived_at IS NULL
       WHERE t.tenant_id=$1 AND t.archived_at IS NULL AND o.tenant_id=$1 AND o.id=t.estimate_line_id AND o.estimate_id=$2 AND o.archived_at IS NOT NULL`,
      [actor.tenant_id, estimate.id],
    );
  const result = { ...estimate, name: input.name, lines };
  await db.query(
    'INSERT INTO estimate_revisions(tenant_id,estimate_id,revision,snapshot,created_by) VALUES($1,$2,$3,$4,$5)',
    [actor.tenant_id, estimate.id, estimate.revision, JSON.stringify(result), actor.id],
  );
  await audit(db, actor, existing ? 'estimates.revise' : 'estimates.create', estimate.id);
  return result;
}
/** Smeta Excel fayli 10 MB gacha (egasi qarori, 2026-11-03); xonadonlar importi 2 MB da qoladi. */
export const ESTIMATE_FILE_BYTES = 10 * 1024 * 1024;
/** Smeta: bitta varaqda 20 000 qator va 200 ustungacha (D30, 2026-11-03); xonadonlar importi 2 000 / 50 da qoladi. */
export const ESTIMATE_MAX_LINES = 20000;
export const ESTIMATE_MAX_COLUMNS = 200;
/** Shu hajmdagi faylning base64 uzunligi (har 3 bayt — 4 belgi). */
export const base64Length = (bytes: number) => Math.ceil(bytes / 3) * 4;
/**
 * Xavfsiz o'qish: hajm, ZIP kengayishi, makros va qator/ustun cheklovlari; birinchi varaqni qaytaradi.
 * ZIP kengayishi fayl chegarasiga mutanosib: bitta ichki fayl 5×, hammasi 10× (2 MB uchun 10/20 MB).
 */
export async function loadWorkbook(
  base64: string,
  maxBytes = 2 * 1024 * 1024,
  maxRows = 2001,
  maxColumns = 50,
) {
  const sheet = (await openWorkbook(base64, maxBytes)).worksheets[0];
  invariant(
    sheet && sheet.rowCount <= maxRows && sheet.columnCount <= maxColumns,
    'WORKBOOK_LIMIT',
    400,
  );
  return sheet;
}
/** Xavfsiz ochish (hajm, ZIP, makros va tashqi havolalar tekshiruvi); hamma varaqlar (Form 5 uchun). */
export async function openWorkbook(base64: string, maxBytes: number) {
  const buffer = Buffer.from(base64, 'base64');
  invariant(
    buffer.length <= maxBytes && buffer.subarray(0, 2).toString() === 'PK',
    'INVALID_XLSX',
    400,
  );
  // Inspect ZIP metadata before decompression; reject excessive expansion and macros.
  // D33: tashqi havolalar (externalLinks) rad etilmaydi — fayl saqlanmaydi, server havolani ochmaydi,
  // faqat Excel saqlagan qiymatlar o'qiladi.
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buffer);
  let expanded = 0;
  for (const entry of Object.values(zip.files)) {
    const size = (entry as any)._data?.uncompressedSize ?? 0;
    expanded += size;
    invariant(
      size <= 5 * maxBytes && expanded <= 10 * maxBytes && !/vbaProject/i.test(entry.name),
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
  return workbook;
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
  const sheet = await loadWorkbook(
    base64,
    ESTIMATE_FILE_BYTES,
    ESTIMATE_MAX_LINES + 1,
    ESTIMATE_MAX_COLUMNS,
  );
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
    // Bo'sh, bo'lim nomi yoki "JAMI" kabi qatorlar (platforma eksportidagi jami qatori ham): miqdor, norma, ish hajmi
    // va narx yo'q — smeta qatori emas, o'tkaziladi. Nomi bor-u, faqat narxi yoki miqdori yo'q qator — xato bo'lib qoladi.
    if (
      line.quantity === undefined &&
      line.unit_price === undefined &&
      line.norm === undefined &&
      line.work_quantity === undefined
    )
      continue;
    lines.push({ ...line, _row: i });
  }
  return lines;
}
/** Excel faylning sarlavhalari va dastlabki qatorlari; hech narsa saqlanmaydi (mapping tanlash uchun). */
export async function inspectWorkbook(base64: string) {
  const workbook = await openWorkbook(base64, ESTIMATE_FILE_BYTES);
  // D29: Form 5 varag'i bor fayl — ustunlarni moslash o'rniga varaqlar ro'yxati
  const sheets = workbook.worksheets.map((s) =>
    form5Summary(s, ESTIMATE_MAX_LINES + 1, ESTIMATE_MAX_COLUMNS),
  );
  if (sheets.some((s) => s.form5)) return { format: 'form5' as const, sheets };
  const sheet = workbook.worksheets[0];
  invariant(
    sheet && sheet.rowCount <= ESTIMATE_MAX_LINES + 1 && sheet.columnCount <= ESTIMATE_MAX_COLUMNS,
    'WORKBOOK_LIMIT',
    400,
  );
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
    format: 'table' as const,
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
  // D32: Form 5 smetalaridan qo'shilgan birliklar
  л: 'l',
  литр: 'l',
  litr: 'l',
  секция: 'section',
  seksiya: 'section',
  котел: 'boiler',
  котёл: 'boiler',
  qozon: 'boiler',
  цикл: 'cycle',
  sikl: 'cycle',
  конец: 'end',
  uchi: 'end',
};
const massFactor: Record<string, string> = { 'kg>t': '0.001', 't>kg': '1000' };
/**
 * D31: bir material Excelda t va kg da — qator material birligiga o'tkaziladi (miqdor va norma × f, narx ÷ f).
 * Aniq o'tkazib bo'lmasa (miqdorda 6 dan, narxda 2 dan ortiq kasr yoki qator jami o'zgarsa) null — birlik xatosi qoladi.
 */
export function convertMass(line: Row, to: string): Row | null {
  const factor = massFactor[`${line.unit_id}>${to}`];
  if (!factor) return null;
  const next: Row = {
    ...line,
    unit_id: to,
    quantity: dec(line.quantity).mul(factor).toFixed(),
    unit_price: dec(line.unit_price).div(factor).toFixed(),
  };
  if (line.norm !== undefined) next.norm = dec(line.norm).mul(factor).toFixed();
  const total = (l: Row) => money(dec(plannedQuantity(l as any)).mul(l.unit_price));
  const exact =
    dec(next.quantity).dp() <= 6 &&
    (next.norm === undefined || dec(next.norm).dp() <= 6) &&
    dec(next.unit_price).dp() <= 2;
  return exact && total(next) === total(line) ? next : null;
}
/**
 * Importda material va zona nomlarini identifikatorlarga aylantiradi.
 * Topilmagan nomlar xato sifatida qaytadi; yashirincha yangi yozuv yaratilmaydi.
 */
/**
 * Excel nomlarini bazadagi material va zonalarga bog'laydi (material — nomi yoki muqobil nomi bo'yicha, D42; mavjud
 * material o'zgartirilmaydi). Topilmagan nomlar (material, zona) avtomatik yaratiladi:
 * obyekt ochilgach smetani darhol yuklash mumkin (egasi qarori, 2026-10-22). Material birligi qatordagi birlikdan
 * (yo'q bo'lsa "dona"). Yaratilganlar soni `created` da qaytadi. Birlik xatolari — platformada yo'q birlik yoki mavjud
 * materialning boshqa birligi — Excel qator raqami bilan `errors` da (tekshiruvda yiqilmasdan oldin). t ↔ kg qatorlari
 * material birligiga o'tkaziladi (D31, `convertMass`), ular `converted` da. Form 5 bo'lim qavatlari `zoneKind='floor'`
 * bilan yaratiladi (qavat matritsasida ko'rinadi).
 */
export async function resolveImportNames(
  db: Db,
  actor: Row,
  projectId: string,
  lines: Row[],
  zoneKind = 'other',
) {
  await projectScope(db, actor, projectId);
  const created = { materials: 0, zones: 0 };
  // D42: material nomi yoki muqobil nomi (material_aliases) bo'yicha topiladi; nom muqobil nomdan ustun
  const materials = new Map<string, Row>();
  for (const m of (
    await db.query(
      `SELECT m.id,m.name,m.unit_id,m.name key,0 o FROM materials m WHERE m.tenant_id=$1 AND m.archived_at IS NULL
       UNION ALL
       SELECT m.id,m.name,m.unit_id,a.name,1 FROM material_aliases a JOIN materials m ON m.tenant_id=a.tenant_id AND m.id=a.material_id
       WHERE a.tenant_id=$1 AND m.archived_at IS NULL ORDER BY o`,
      [actor.tenant_id],
    )
  ).rows) {
    const key = String(m.key).toLowerCase();
    if (!materials.has(key)) materials.set(key, { id: m.id, name: m.name, unit_id: m.unit_id });
  }
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
  const suppliers: Record<string, string> = {
    contractor: 'contractor',
    pudratchi: 'contractor',
    subpudratchi: 'contractor',
    подрядчик: 'contractor',
    субподрядчик: 'contractor',
    customer: 'customer',
    buyurtmachi: 'customer',
    'bosh pudratchi': 'customer',
    заказчик: 'customer',
    генподрядчик: 'customer',
  };
  const units = new Set((await db.query('SELECT id FROM units')).rows.map((u) => u.id as string));
  const errors: { row: number; field: string; message: string }[] = [];
  const converted: { row: number; from: string; to: string }[] = [];
  const out: Row[] = [];
  for (const [index, line] of lines.entries()) {
    const { _row, ...next }: Row = { ...line };
    const row = (_row as number | undefined) ?? index + 2;
    let massTo: string | undefined;
    if (next.kind) next.kind = kinds[String(next.kind).trim().toLowerCase()] ?? next.kind;
    // S3, D37: «Kim beradi» ustuni (subpudratchi nuqtai nazaridan bosh pudratchi materiali — buyurtmachiniki)
    if (next.supplied_by !== undefined)
      next.supplied_by = suppliers[String(next.supplied_by).trim().toLowerCase()] ?? next.supplied_by;
    // «buyurtmachi» faqat material qatorida — xato Excel qatori bilan (umumiy 400 emas)
    if (next.supplied_by === 'customer' && next.kind && next.kind !== 'material')
      errors.push({ row, field: 'supplied_by', message: String(line.supplied_by) });
    const unitRaw = String(next.unit_id ?? '');
    if (next.unit_id) {
      const unit = String(next.unit_id).trim().toLowerCase().replace(/\.$/, '');
      next.unit_id = unitAliases[unit] ?? unit;
    }
    const unitKnown = !next.unit_id || units.has(next.unit_id);
    if (!unitKnown) errors.push({ row, field: 'unit_id', message: unitRaw });
    if (next.material_name !== undefined) {
      const name = String(next.material_name).trim().toLowerCase();
      const found = materials.get(name);
      if (!found) {
        if (unitKnown) {
          const made = await one(
            db,
            'INSERT INTO materials(tenant_id,name,unit_id) VALUES($1,$2,$3) RETURNING id,name,unit_id',
            [actor.tenant_id, String(next.material_name).trim(), next.unit_id ?? 'pcs'],
          );
          materials.set(name, made);
          created.materials++;
          next.material_id = made.id;
          next.unit_id ??= made.unit_id;
        }
      } else {
        next.material_id = found.id;
        if (unitKnown && next.unit_id && next.unit_id !== found.unit_id) {
          if (massFactor[`${next.unit_id}>${found.unit_id}`]) massTo = found.unit_id;
          else errors.push({ row, field: 'unit_id', message: `${unitRaw} ≠ ${found.unit_id}` });
        }
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
          'INSERT INTO zones(tenant_id,project_id,name,kind) VALUES($1,$2,$3,$4) RETURNING id,name',
          [actor.tenant_id, projectId, String(next.zone_name).trim(), zoneKind],
        );
        zones.push(made);
        created.zones++;
        next.zone_id = made.id;
      } else next.zone_id = found.id;
      delete next.zone_name;
    }
    for (const key of ['quantity', 'unit_price', 'norm', 'work_quantity', 'loss_percent'])
      if (typeof next[key] === 'string') next[key] = next[key].replace(/\s/g, '').replace(',', '.');
    if (massTo) {
      const numeric =
        qty.safeParse(next.quantity).success &&
        amount.safeParse(next.unit_price).success &&
        (next.norm === undefined) === (next.work_quantity === undefined) &&
        ['norm', 'work_quantity', 'loss_percent'].every(
          (k) => next[k] === undefined || qty.safeParse(next[k]).success,
        );
      const done = numeric ? convertMass(next, massTo) : null;
      // Son noto'g'ri yoki norma juftsiz bo'lsa o'tkazilmaydi — xatoni qiymat tekshiruvi ko'rsatadi, birlik xatosi emas.
      if (!numeric) next.unit_id = massTo;
      else if (done) {
        converted.push({ row, from: next.unit_id, to: massTo });
        Object.assign(next, done);
      } else errors.push({ row, field: 'unit_id', message: `${unitRaw} ≠ ${massTo}` });
    }
    next.position = index;
    out.push(next);
  }
  return { lines: out, errors, created, converted };
}
/**
 * D42: import qaysi mavjud smetaga yangi reviziya bo'lib tushadi — o'sha obyektning arxivlanmagan smetasi; reviziya
 * huquqi (`estimates.edit`) previewdayoq tekshiriladi.
 */
export async function importTarget(db: Db, actor: Row, projectId: string, estimateId: string) {
  await permit(db, actor, 'estimates.edit');
  return one(
    db,
    'SELECT id,name,revision FROM estimates WHERE tenant_id=$1 AND project_id=$2 AND id=$3 AND archived_at IS NULL',
    [actor.tenant_id, projectId, estimateId],
  );
}
/**
 * Import tekshiruvi (preview): qator qiymatlari sxemasi — xato Excel qatori bilan (`rowOf`, Form 5 da `sheet` ham),
 * domen tekshiruvi, `import_previews` ga yozuv va server jamlari (O3). Smeta saqlanmaydi.
 */
export async function storeImportPreview(
  db: Db,
  actor: Row,
  input: Row,
  rowOf: (n: number) => number,
  sheet?: string,
  target?: Row,
) {
  const shape = estimateInput.safeParse(input);
  if (!shape.success) {
    const rows = shape.error.issues
      .filter((i) => i.path[0] === 'lines' && typeof i.path[1] === 'number')
      .map((i) => {
        const n = i.path[1] as number;
        const field = String(i.path[2] ?? '');
        return {
          ...(sheet ? { sheet } : {}),
          row: rowOf(n),
          field,
          message: String(input.lines[n]?.[field] ?? ''),
        };
      });
    invariant(rows.length === 0, 'IMPORT_ROWS_INVALID', 400, rows.slice(0, 200));
    // Qatorlardan tashqari xato (masalan, S3 sozlamasi) — umumiy validatsiya xatosi
    throw shape.error;
  }
  await validateEstimate(db, actor, input);
  const row = await one(
    db,
    "INSERT INTO import_previews(tenant_id,project_id,created_by,payload,digest,expires_at,target_estimate_id,target_revision) VALUES($1,$2,$3,$4,$5,now()+interval '1 hour',$6,$7) RETURNING id,digest,expires_at",
    [
      actor.tenant_id,
      input.project_id,
      actor.id,
      JSON.stringify(input),
      digest(JSON.stringify(input)),
      target?.id ?? null,
      target?.revision ?? null,
    ],
  );
  // Qator jami = hisobiy miqdor × narx — saqlashdagi formula; frontend qo'shmaydi.
  const lines = input.lines.map((l: Row) => ({
    ...l,
    total: money(dec(plannedQuantity(l as any)).mul(l.unit_price)),
  }));
  const total = money(lines.reduce((s: any, l: Row) => s.add(l.total), dec('0')));
  return { row, lines, total };
}
/**
 * Previewdan smeta: digest mos, muddati o'tmagan; qayta chaqirilsa o'sha smeta qaytadi (idempotent). D42: preview
 * mavjud smetaga tayyorlangan bo'lsa — uning yangi reviziyasi (reja almashadi, fakt `lineage_id` bo'yicha qoladi);
 * smeta shu orada o'zgargan yoki arxivlangan bo'lsa yozilmaydi.
 */
export async function commitImportPreview(db: Db, actor: Row, id: string, expected: string) {
  const preview = await one(
    db,
    "SELECT * FROM import_previews WHERE tenant_id=$1 AND id=$2 AND kind='estimate' FOR UPDATE",
    [actor.tenant_id, id],
  );
  await projectScope(db, actor, preview.project_id);
  invariant(preview.created_by === actor.id || actor.role === 'tenant_admin', 'FORBIDDEN', 403);
  invariant(expected === preview.digest, 'PREVIEW_CHANGED');
  if (preview.committed_estimate_id) return { id: preview.committed_estimate_id };
  invariant(new Date(preview.expires_at).getTime() > Date.now(), 'PREVIEW_EXPIRED', 410);
  let existing: Row | undefined;
  if (preview.target_estimate_id) {
    existing = (
      await db.query(
        'SELECT * FROM estimates WHERE tenant_id=$1 AND id=$2 AND archived_at IS NULL FOR UPDATE',
        [actor.tenant_id, preview.target_estimate_id],
      )
    ).rows[0];
    invariant(existing?.revision === preview.target_revision, 'IMPORT_TARGET_CHANGED');
  }
  const estimate = await writeEstimate(db, actor, preview.payload, existing);
  await db.query('UPDATE import_previews SET committed_estimate_id=$2 WHERE id=$1', [
    id,
    estimate.id,
  ]);
  return estimate;
}
