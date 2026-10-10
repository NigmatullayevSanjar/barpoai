import type ExcelJS from 'exceljs';
import { type Db, type Row } from './db.js';
import { invariant } from './errors.js';
import { dec } from './money.js';
import { area } from './schemas.js';
import { loadWorkbook } from './estimates.js';
import { digest } from './security.js';

export const premiseKinds = ['apartment', 'commercial', 'parking', 'storage'] as const;
export type PremiseKind = (typeof premiseKinds)[number];
/** Shablon sarlavhalari: qat'iy tartib, uz yoki ru. */
export const templateHeaders = {
  uz: ['Blok', 'Kirish', 'Qavat', 'Raqam', 'Tur', 'Xonalar', 'Maydon, m²'],
  ru: ['Блок', 'Подъезд', 'Этаж', 'Номер', 'Тип', 'Комнаты', 'Площадь, м²'],
} as const;
export const kindLabels: Record<'uz' | 'ru', Record<PremiseKind, string>> = {
  uz: { apartment: 'Kvartira', commercial: 'Tijorat', parking: 'Parking', storage: 'Ombor' },
  ru: { apartment: 'Квартира', commercial: 'Коммерция', parking: 'Паркинг', storage: 'Кладовая' },
};
const kindNames: Record<string, PremiseKind> = {
  apartment: 'apartment',
  kvartira: 'apartment',
  xonadon: 'apartment',
  квартира: 'apartment',
  commercial: 'commercial',
  tijorat: 'commercial',
  коммерция: 'commercial',
  коммерческое: 'commercial',
  parking: 'parking',
  паркинг: 'parking',
  машиноместо: 'parking',
  storage: 'storage',
  ombor: 'storage',
  кладовая: 'storage',
};
export const premiseKind = (value: string) => kindNames[value.trim().toLowerCase()];

/** Excel qatori: maydonlar matn yoki null; `row` — varaqdagi haqiqiy qator raqami. */
export type RawPremise = {
  row: number;
  block: string | null;
  entrance: string | null;
  floor: string | null;
  number: string | null;
  kind: string | null;
  rooms: string | null;
  area: string | null;
};
type FieldError = { field: string; code: string };
const fields = ['block', 'entrance', 'floor', 'number', 'kind', 'rooms', 'area'] as const;
const normalizeHeader = (h: string) =>
  h.trim().toLowerCase().replace(/²/g, '2').replace(/\s+/g, '');

function cellText(value: ExcelJS.CellValue): { text: string | null; error?: string } {
  if (value === null || value === undefined) return { text: null };
  if (typeof value === 'string') return { text: value.trim() || null };
  if (typeof value === 'number') return { text: String(value) };
  if (typeof value === 'object' && 'richText' in value)
    return {
      text:
        value.richText
          .map((p) => p.text)
          .join('')
          .trim() || null,
    };
  if (typeof value === 'object' && ('formula' in value || 'sharedFormula' in value))
    return { text: null, error: 'FORMULA_NOT_ALLOWED' };
  return { text: null, error: 'INVALID_CELL' };
}

/** Qat'iy shablon: birinchi varaq, sarlavhalar aynan uz yoki ru tartibida. Bo'sh qatorlar o'tkaziladi, raqam siljimaydi. */
export async function readPremisesWorkbook(base64: string) {
  const sheet = await loadWorkbook(base64);
  const header = fields.map((_, i) =>
    normalizeHeader(String(sheet.getRow(1).getCell(i + 1).value ?? '')),
  );
  invariant(
    Object.values(templateHeaders).some((set) =>
      set.every((h, i) => normalizeHeader(h) === header[i]),
    ),
    'TEMPLATE_MISMATCH',
    400,
  );
  const rows: { raw: RawPremise; errors: FieldError[] }[] = [];
  for (let i = 2; i <= sheet.rowCount; i++) {
    const excelRow = sheet.getRow(i);
    const raw = { row: i } as RawPremise;
    const errors: FieldError[] = [];
    fields.forEach((field, n) => {
      const cell = cellText(excelRow.getCell(n + 1).value);
      raw[field] = cell.text;
      if (cell.error) errors.push({ field, code: cell.error });
    });
    if (errors.length === 0 && fields.every((f) => raw[f] === null)) continue;
    rows.push({ raw, errors });
  }
  invariant(rows.length > 0, 'IMPORT_EMPTY', 400);
  return rows;
}

export type PremiseValues = {
  number: string;
  kind: PremiseKind;
  floor: number | null;
  rooms: number | null;
  area_m2: string;
};
const intIn = (value: string | null, min: number, max: number) =>
  value !== null && /^-?\d+$/.test(value) && +value >= min && +value <= max;

/** Bitta qatorning shakl tekshiruvi (bazasiz). */
export function validatePremiseRow(raw: RawPremise) {
  const errors: FieldError[] = [];
  if (!raw.number) errors.push({ field: 'number', code: 'REQUIRED' });
  else if (raw.number.length > 20) errors.push({ field: 'number', code: 'TOO_LONG' });
  const kind = raw.kind ? premiseKind(raw.kind) : undefined;
  if (!raw.kind) errors.push({ field: 'kind', code: 'REQUIRED' });
  else if (!kind) errors.push({ field: 'kind', code: 'INVALID_KIND' });
  if (raw.floor !== null && !intIn(raw.floor, -10, 500))
    errors.push({ field: 'floor', code: 'INVALID_FLOOR' });
  if (raw.rooms !== null && !intIn(raw.rooms, 0, 50))
    errors.push({ field: 'rooms', code: 'INVALID_ROOMS' });
  const areaText = raw.area?.replace(',', '.') ?? null;
  if (areaText === null) errors.push({ field: 'area', code: 'REQUIRED' });
  else if (!area.safeParse(areaText).success) errors.push({ field: 'area', code: 'INVALID_AREA' });
  if ((raw.block?.length ?? 0) > 500) errors.push({ field: 'block', code: 'TOO_LONG' });
  if ((raw.entrance?.length ?? 0) > 500) errors.push({ field: 'entrance', code: 'TOO_LONG' });
  const values: PremiseValues | null = errors.length
    ? null
    : {
        number: raw.number!,
        kind: kind!,
        floor: raw.floor === null ? null : +raw.floor,
        rooms: raw.rooms === null ? null : +raw.rooms,
        area_m2: dec(areaText!).toFixed(2),
      };
  return { values, errors };
}

type ZoneInfo = Row & { block_id: string | null };
/** Obyekt zonalari va har birining eng yaqin bloki (zonaning o'zi ham bo'lishi mumkin). */
export async function projectZones(db: Db, actor: Row, projectId: string) {
  const rows = (
    await db.query(
      'SELECT id,parent_id,name,kind,floors_count FROM zones WHERE tenant_id=$1 AND project_id=$2',
      [actor.tenant_id, projectId],
    )
  ).rows;
  const byId = new Map(rows.map((z) => [z.id, z]));
  const blockOf = (id: string | null): string | null => {
    for (let z = id ? byId.get(id) : undefined, guard = 0; z && guard < 1000; guard++) {
      if (z.kind === 'block') return z.id;
      z = z.parent_id ? byId.get(z.parent_id) : undefined;
    }
    return null;
  };
  return rows.map((z) => ({ ...z, block_id: blockOf(z.id) })) as ZoneInfo[];
}

/** Qavat blokning qavatlar sonidan oshmasligi (blokda floors_count bo'lsa). */
export function floorAllowed(zones: ZoneInfo[], zoneId: string | null, floor: number | null) {
  if (zoneId === null || floor === null) return true;
  const blockId = zones.find((z) => z.id === zoneId)?.block_id;
  const block = zones.find((z) => z.id === blockId);
  return !block?.floors_count || floor <= block.floors_count;
}

export type PlanRow = {
  row: number;
  block: string | null;
  entrance: string | null;
  floor: number | null;
  number: string | null;
  kind: string | null;
  rooms: number | null;
  area_m2: string | null;
  zone_id: string | null;
  action: 'create' | 'update' | 'unchanged' | 'error';
  premise_id: string | null;
  version: number | null;
  errors: FieldError[];
};

/**
 * Import rejasi: zonalarni nom bo'yicha topadi, R2 kaliti (blok, raqam) bo'yicha mavjud faol xonadonga moslaydi.
 * Yangi zona yaratilmaydi; blok yoki kirish topilmasa qator xato.
 */
export async function planPremisesImport(
  db: Db,
  actor: Row,
  projectId: string,
  parsed: { raw: RawPremise; errors: FieldError[] }[],
) {
  const zones = await projectZones(db, actor, projectId);
  const existing = (
    await db.query(
      'SELECT id,zone_id,block_zone_id,number,kind,floor,rooms,area_m2,version FROM premises WHERE tenant_id=$1 AND project_id=$2 AND archived_at IS NULL',
      [actor.tenant_id, projectId],
    )
  ).rows;
  const key = (blockId: string | null, number: string) =>
    `${blockId ?? ''}|${number.toLowerCase()}`;
  const existingByKey = new Map(existing.map((p) => [key(p.block_zone_id, p.number), p]));
  const seen = new Set<string>();
  const find = (candidates: ZoneInfo[], name: string) =>
    candidates.filter((z) => z.name.trim().toLowerCase() === name.toLowerCase());
  const rows: PlanRow[] = parsed.map(({ raw, errors: cellErrors }) => {
    const { values, errors: shapeErrors } = validatePremiseRow(raw);
    const errors = [...cellErrors, ...shapeErrors];
    let blockId: string | null = null,
      zoneId: string | null = null;
    if (raw.block) {
      const found = find(
        zones.filter((z) => z.kind === 'block'),
        raw.block,
      );
      if (found.length === 1) blockId = zoneId = found[0]!.id;
      else
        errors.push({ field: 'block', code: found.length ? 'AMBIGUOUS_BLOCK' : 'BLOCK_NOT_FOUND' });
    }
    if (raw.entrance && !errors.some((e) => e.field === 'block')) {
      const found = find(
        zones.filter((z) => z.kind === 'entrance' && z.block_id === blockId),
        raw.entrance,
      );
      if (found.length === 1) zoneId = found[0]!.id;
      else
        errors.push({
          field: 'entrance',
          code: found.length ? 'AMBIGUOUS_ENTRANCE' : 'ENTRANCE_NOT_FOUND',
        });
    }
    if (values && !floorAllowed(zones, zoneId, values.floor))
      errors.push({ field: 'floor', code: 'FLOOR_ABOVE_BLOCK' });
    let action: PlanRow['action'] = 'error',
      match: Row | undefined;
    if (values) {
      const k = key(blockId, values.number);
      if (seen.has(k)) errors.push({ field: 'number', code: 'DUPLICATE_IN_FILE' });
      seen.add(k);
      match = existingByKey.get(k);
    }
    if (values && errors.length === 0)
      action = !match
        ? 'create'
        : match.zone_id === zoneId &&
            match.kind === values.kind &&
            match.floor === values.floor &&
            match.rooms === values.rooms &&
            dec(match.area_m2).eq(values.area_m2)
          ? 'unchanged'
          : 'update';
    return {
      row: raw.row,
      block: raw.block,
      entrance: raw.entrance,
      floor: values?.floor ?? null,
      number: values?.number ?? raw.number,
      kind: values?.kind ?? raw.kind,
      rooms: values?.rooms ?? null,
      area_m2: values?.area_m2 ?? raw.area,
      zone_id: zoneId,
      action,
      premise_id: match?.id ?? null,
      version: match?.version ?? null,
      errors,
    };
  });
  const count = (a: PlanRow['action']) => rows.filter((r) => r.action === a).length;
  const summary = {
    create: count('create'),
    update: count('update'),
    unchanged: count('unchanged'),
    error: count('error'),
  };
  return { rows, summary, digest: digest(JSON.stringify(rows)) };
}

/** Rejani yozadi; har bir yangilash versiya bilan (oraliqda o'zgargan bo'lsa VERSION_CONFLICT). */
export async function applyPremisesPlan(db: Db, actor: Row, projectId: string, rows: PlanRow[]) {
  invariant(
    rows.every((r) => r.action !== 'error'),
    'IMPORT_HAS_ERRORS',
    400,
  );
  for (const r of rows) {
    if (r.action === 'create')
      await db.query(
        'INSERT INTO premises(tenant_id,project_id,zone_id,number,kind,floor,rooms,area_m2,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          actor.tenant_id,
          projectId,
          r.zone_id,
          r.number,
          r.kind,
          r.floor,
          r.rooms,
          r.area_m2,
          actor.id,
        ],
      );
    else if (r.action === 'update') {
      const updated = await db.query(
        `UPDATE premises SET zone_id=$3,number=$4,kind=$5,floor=$6,rooms=$7,area_m2=$8,version=version+1,updated_at=now()
           WHERE tenant_id=$1 AND id=$2 AND version=$9 AND archived_at IS NULL`,
        [
          actor.tenant_id,
          r.premise_id,
          r.zone_id,
          r.number,
          r.kind,
          r.floor,
          r.rooms,
          r.area_m2,
          r.version,
        ],
      );
      invariant(updated.rowCount === 1, 'VERSION_CONFLICT');
    }
  }
}
