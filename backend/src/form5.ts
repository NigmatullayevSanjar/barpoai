import type ExcelJS from 'exceljs';
import { Decimal } from 'decimal.js';
import { dec, money, quantity } from './money.js';
import { type Row } from './db.js';

/**
 * D29: Form 5 — «ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ» varag'i (loyiha: docs/FORM5_IMPORT_LOYIHA.md).
 * Ish qatori (A butun son, B norma kodi) → «ish» qatori; uning tagidagi resurslar (A «13.1») → norma × ish hajmi;
 * bosh pudratchi materiali (A bo'sh, miqdor bor) → material qatori; «Раздел … N этаж» → qavat zonasi;
 * S2: ish qatorida to'liq norma shifri (`norm_code`), qolganlarida resurs kodi (`resource_code`), hammasida bo'lim nomi;
 * «ВСЕГО ЗАТРАТ» dan keyingi jamlar bloki o'qilmaydi, faqat «Excel jami» sifatida qaytadi.
 * Formula katagidan Excel saqlagan oxirgi natija olinadi; natijasi yo'q formula — qator xatosi.
 */
type Sheet = ExcelJS.Worksheet;
const NO_RESULT = Symbol('formula without result');

function value(sheet: Sheet, row: number, col: number): unknown {
  const cell = sheet.getRow(row).getCell(col);
  if (cell.isMerged && cell.master.address !== cell.address) return null;
  let v = cell.value as any;
  if (v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v))
    v = v.result === undefined ? NO_RESULT : v.result;
  if (v && typeof v === 'object' && Array.isArray(v.richText))
    v = v.richText.map((r: { text: string }) => r.text).join('');
  else if (v && typeof v === 'object' && 'error' in v) v = null;
  if (typeof v === 'string') v = v.replace(/\s+/g, ' ').trim() || null;
  return v ?? null;
}
const text = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : null);
function num(v: unknown): Decimal | null {
  if (typeof v === 'number' && Number.isFinite(v)) return dec(String(v));
  if (typeof v === 'string' && /^-?\d+([.,]\d+)?$/.test(v.replace(/\s/g, '')))
    return dec(v.replace(/\s/g, '').replace(',', '.'));
  return null;
}

const units: Record<string, string> = {
  'ЧЕЛ.-Ч': 'hour',
  'ЧЕЛ-Ч': 'hour',
  'МАШ.-Ч': 'hour',
  'МАШ-Ч': 'hour',
  Ч: 'hour',
  Т: 't',
  ТН: 't',
  'Т-Н': 't',
  ТОННА: 't',
  М3: 'm3',
  'КУБ.М': 'm3',
  'КУБИЧЕСКИЙ МЕТР': 'm3',
  М2: 'm2',
  'КВ.М': 'm2',
  М: 'm',
  'П.М': 'm',
  КГ: 'kg',
  КИЛОГРАММ: 'kg',
  ШТ: 'pcs',
  КОМП: 'set',
  КОМПЛ: 'set',
  КОМПЛЕКТ: 'set',
  // D32 (2026-11-05): egasining smetalarida uchragan, platformaga qo'shilgan birliklar (migratsiya 029)
  Л: 'l',
  ЛИТР: 'l',
  СЕКЦИЯ: 'section',
  КОТЕЛ: 'boiler',
  КОТЁЛ: 'boiler',
  ЦИКЛ: 'cycle',
  КОНЕЦ: 'end',
};
/** «100 М2» → m2 × 100, «1 КМ» → m × 1000; platformada yo'q birlik (ПАРА, РУЛОН) — dona, `known: false`. */
export function form5Unit(raw: string) {
  const s = raw.toUpperCase().replace(/M/g, 'М').replace(/T/g, 'Т').replace(/\.$/, '').trim();
  if (units[s]) return { unit: units[s], factor: '1', known: true };
  const m = s.match(
    /^(\d+(?:[.,]\d+)?)?\s*(ЧЕЛ\.?-Ч|МАШ\.?-Ч|М2|М3|ТН|Т|ШТ|КГ|КМ|СЕКЦИЯ|КОТЕЛ|КОТЁЛ|ЦИКЛ|КОНЕЦ|ЛИТР|Л|М)(?=$|[\s.,])/,
  );
  if (!m) return { unit: 'pcs', factor: '1', known: false };
  const base = (m[1] ?? '1').replace(',', '.');
  if (m[2] === 'КМ') return { unit: 'm', factor: dec(base).mul(1000).toFixed(), known: true };
  return { unit: units[m[2]!.replace(/^(ЧЕЛ|МАШ)-/, '$1.-')]!, factor: base, known: true };
}
/** Bo'lim nomidagi qavat: «… 1-этаж», «6 этаж» → «1-qavat»; «Цокольный» → «Sokol qavat»; qavat yo'q — null. */
export function form5Floor(section: string) {
  if (/цокол/i.test(section)) return 'Sokol qavat';
  const m = section.match(/(-?\d+)[\s-]*этаж/i);
  return m ? `${m[1]}-qavat` : null;
}
/**
 * Form 5 belgisi: dastlabki 40 qatorda «Наименование работ…» va «Шифр…» sarlavhasi, undan keyin 1, 2, 3…
 * raqamlangan qator. Qaytaradi: raqam → ustun va ma'lumot boshlanadigan qator; Form 5 bo'lmasa null.
 */
function layout(sheet: Sheet) {
  const width = Math.min(sheet.columnCount, 20);
  let header = false;
  for (let r = 1; r <= Math.min(sheet.rowCount, 40); r++) {
    const cells = Array.from({ length: width }, (_, i) => value(sheet, r, i + 1));
    const texts = cells.filter((v): v is string => typeof v === 'string');
    if (texts.some((t) => /наименование работ/i.test(t)) && texts.some((t) => /шифр/i.test(t))) {
      header = true;
      continue;
    }
    if (!header) continue;
    const cols = new Map<number, number>();
    cells.forEach((v, i) => {
      const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d$/.test(v) ? +v : null;
      if (n !== null && n >= 1 && n <= 8 && !cols.has(n)) cols.set(n, i + 1);
    });
    if ([1, 2, 3, 4, 5, 6].every((k) => cols.has(k))) return { cols, start: r + 1 };
  }
  return null;
}
type RowError = { row: number; field: string; message: string };
/** «П» — normada sarfi berilmagan, loyiha (ishchi chizmalar) bo'yicha olinadigan material (ShNK 4.02.70-05, 1.9-band). */
const isProjectQuantity = (v: unknown) => typeof v === 'string' && v.trim().toUpperCase() === 'П';
const PROJECT_QUANTITY_NOTE = 'П — miqdor loyihadan';
/** Varaqni platforma import qatorlariga aylantiradi (`_row` — Excel qatori); Form 5 bo'lmasa null. */
export function parseForm5(sheet: Sheet) {
  const found = layout(sheet);
  if (!found) return null;
  const { cols, start } = found;
  const at = (r: number, k: number) => (cols.has(k) ? value(sheet, r, cols.get(k)!) : null);
  const lines: Row[] = [];
  const errors: RowError[] = [];
  const counts = { works: 0, resources: 0, materials: 0, priced: 0 };
  const unknownUnits = new Map<string, number>();
  const mismatch: { row: number; excel: string; platform: string }[] = [];
  const missingUnit: number[] = [];
  const skipped: number[] = [];
  // S3, D37: bosh pudratchi material qatorlari (A bo'sh, miqdori bor) — «kim beradi» tanlovi shularga tegadi
  const gcRows: number[] = [];
  const projectQty: {
    row: number;
    code: string | null;
    name: string;
    unit: string | null;
    category: string | null;
    zone: string | null;
  }[] = [];
  const prices = new Map<string, { code: string | null; name: string; prices: Set<string> }>();
  let unpriced = 0;
  let work: { code: string; name: string; qty: Decimal; category: string } | null = null;
  let skipping = false;
  let zone: string | null = null;
  // S2: oxirgi «Раздел …» qatorining to'liq matni — keyingi barcha qatorlarga
  let section: string | null = null;
  let end = sheet.rowCount + 1;
  const unitOf = (raw: string) => {
    const u = form5Unit(raw);
    if (!u.known) unknownUnits.set(raw, (unknownUnits.get(raw) ?? 0) + 1);
    return u;
  };
  const priceOf = (r: number, code: string | null, name: string) => {
    const raw = at(r, 7);
    if (raw === NO_RESULT) errors.push({ row: r, field: 'unit_price', message: 'formula' });
    const price = num(raw);
    if (!price || price.isZero()) {
      unpriced++;
      return '0.00';
    }
    counts.priced++;
    const key = code ?? name;
    const entry = prices.get(key) ?? { code, name, prices: new Set<string>() };
    entry.prices.add(money(price));
    prices.set(key, entry);
    return money(price);
  };
  for (let r = start; r <= sheet.rowCount; r++) {
    const [A, B, C, D, E, F] = [1, 2, 3, 4, 5, 6].map((k) => at(r, k));
    const name = text(C);
    if (name && /^ВСЕГО ЗАТРАТ/i.test(name)) {
      end = r;
      break;
    }
    if (!name || /^(итого|всего)/i.test(name)) continue;
    const a = text(A) ?? '';
    const code = text(B);
    if (!a && /^раздел/i.test(name)) {
      zone = form5Floor(name);
      section = name.trim().slice(0, 300);
      continue;
    }
    const sectionField = section ? { section_name: section } : {};
    const resourceCode = code?.trim() ? { resource_code: code.trim().slice(0, 60) } : {};
    if (/^\d+$/.test(a) && code) {
      const qty = num(F) ?? num(E);
      // Hajmi «--» yoki bo'sh — ishlatilmagan variant: resurslari bilan o'tkaziladi (ogohlantirish);
      // natijasiz formula — xato.
      work = null;
      skipping = !qty && F !== NO_RESULT && E !== NO_RESULT;
      if (!qty) {
        if (skipping) skipped.push(r);
        else errors.push({ row: r, field: 'quantity', message: 'formula' });
        continue;
      }
      const raw = text(D) ?? '';
      const u = unitOf(raw);
      const short = code.match(/^\S*?\d{2,4}-\d{3}-\d{2}/)?.[0] ?? code.split(' ')[0] ?? code;
      work = { code: short, name, qty, category: `${short} ${name}`.slice(0, 120) };
      counts.works++;
      lines.push({
        _row: r,
        kind: 'labor',
        category: work.category,
        norm_code: code.trim().slice(0, 200),
        ...sectionField,
        description: name.slice(0, 500),
        ...(zone ? { zone_name: zone } : {}),
        unit_id: u.unit,
        quantity: quantity(qty.mul(u.factor)),
        unit_price: '0.00',
        note: u.factor !== '1' || !u.known ? raw : undefined,
      });
      continue;
    }
    const raw = text(D);
    const u = raw ? unitOf(raw) : null;
    const kind = /ЧЕЛ/i.test(raw ?? '')
      ? 'labor'
      : /МАШ/i.test(raw ?? '')
        ? 'equipment'
        : 'material';
    // Kod endi `resource_code` da; izohda faqat platformada yo'q asl birlik
    const note = u && !u.known ? raw! : undefined;
    if (/^\d+\.\d+$/.test(a)) {
      const norm = num(E);
      if (!work && skipping) continue;
      if (!work || !norm) {
        errors.push(
          work
            ? { row: r, field: 'norm', message: E === NO_RESULT ? 'formula' : '' }
            : { row: r, field: 'work_quantity', message: '' },
        );
        continue;
      }
      counts.resources++;
      const planned = norm.mul(work.qty);
      const excel = num(F);
      if (
        excel &&
        excel
          .minus(planned)
          .abs()
          .gt(Decimal.max('0.005', planned.abs().mul('0.001')))
      )
        mismatch.push({ row: r, excel: excel.toFixed(), platform: quantity(planned) });
      const factor = u?.factor ?? '1';
      lines.push({
        _row: r,
        kind,
        category: work.category,
        ...resourceCode,
        ...sectionField,
        description: name.slice(0, 500),
        ...(kind === 'material' ? { material_name: name.slice(0, 500) } : {}),
        ...(zone ? { zone_name: zone } : {}),
        unit_id: u?.unit ?? 'pcs',
        quantity: quantity(planned.mul(factor)),
        norm: quantity(norm.mul(factor)),
        work_quantity: quantity(work.qty),
        unit_price: priceOf(r, code, name),
        note,
      });
      continue;
    }
    if (!a && !num(F) && (isProjectQuantity(E) || isProjectQuantity(F))) {
      // D35 (ShNK 4.02.70-05, 1.9-band): «П» — sarfi loyihadan (ishchi chizmalardan) olinadigan material.
      // Miqdor 0 bilan saqlanadi va keyin muharrirda kiritiladi (F da miqdor bo'lsa — oddiy material qatori);
      // u normaning qismi, shuning uchun hajmi yo'q ish ostida resurslari bilan birga o'tkaziladi.
      if (!work && skipping) continue;
      counts.materials++;
      if (!raw) missingUnit.push(r);
      projectQty.push({
        row: r,
        code,
        name,
        unit: raw,
        category: work?.category ?? null,
        zone,
      });
      const g = at(r, 7);
      const gPrice = num(g);
      lines.push({
        _row: r,
        kind: 'material',
        category: work?.category ?? null,
        ...resourceCode,
        ...sectionField,
        description: name.slice(0, 500),
        material_name: name.slice(0, 500),
        ...(zone ? { zone_name: zone } : {}),
        ...(u ? { unit_id: u.unit } : {}),
        quantity: quantity(0),
        // Narx faqat G da musbat son (yoki natijasiz formula — xato) bo'lsa; aks holda 0, narxsizlar soniga kirmaydi
        unit_price:
          g === NO_RESULT || (gPrice && !gPrice.isZero()) ? priceOf(r, code, name) : '0.00',
        note: [note, PROJECT_QUANTITY_NOTE].filter(Boolean).join(' · '),
      });
      continue;
    }
    if (!a && (num(F) ?? num(E))) {
      // Bosh pudratchi materiali: raqamsiz qator, miqdor to'g'ridan-to'g'ri. Birligi yo'q bo'lsa — material birligi.
      counts.materials++;
      gcRows.push(r);
      if (!raw) missingUnit.push(r);
      lines.push({
        _row: r,
        kind: 'material',
        category: work?.category ?? null,
        ...resourceCode,
        ...sectionField,
        description: name.slice(0, 500),
        material_name: name.slice(0, 500),
        ...(zone ? { zone_name: zone } : {}),
        ...(u ? { unit_id: u.unit } : {}),
        quantity: quantity((num(F) ?? num(E))!.mul(u?.factor ?? '1')),
        unit_price: priceOf(r, code, name),
        note,
      });
    }
  }
  // «Excel jami»: «ВСЕГО ЗАТРАТ» va undan keyingi qatorlar (summa — 8-ustun, ulush — 7-ustundagi 0…1 son).
  const totals: {
    row: number;
    label: string;
    rate: string | null;
    percent: string | null;
    amount: string | null;
    addable: boolean;
    key: string | null;
  }[] = [];
  for (let r = end; r <= sheet.rowCount && totals.length < 30; r++) {
    const label = text(at(r, 3));
    if (!label) continue;
    const amount = num(at(r, 8));
    const rate = num(at(r, 7));
    const share = rate && rate.gt(0) && rate.lt(1) ? rate.toFixed() : null;
    if (!amount && !share) continue;
    totals.push({
      row: r,
      label,
      rate: share,
      percent: share ? dec(share).mul(100).toFixed() : null,
      amount: amount ? money(amount) : null,
      // Ulushli qator (masalan, «прочие затраты» 21 %), QQS emas — S3 da «boshqa xarajatlar» foizi sifatida taklif qilinadi
      addable: !!share && !/НДС|QQS|VAT/i.test(label),
      key: excelKey(label),
    });
  }
  return {
    lines,
    errors,
    counts,
    gcRows,
    excel: {
      total: totals[0]?.row === end ? totals[0].amount : null,
      rows: totals,
    },
    warnings: {
      unknown_units: [...unknownUnits].map(([unit, rows]) => ({ unit, rows })),
      unpriced,
      quantity_mismatch: mismatch.slice(0, 50),
      quantity_mismatch_count: mismatch.length,
      price_varies: [...prices.values()]
        .filter((p) => p.prices.size > 1)
        .slice(0, 50)
        .map((p) => {
          const sorted = [...p.prices].sort((x, y) => dec(x).cmp(y));
          return { code: p.code, name: p.name, min_price: sorted[0], max_price: sorted.at(-1)! };
        }),
      missing_unit: missingUnit.slice(0, 50),
      skipped_works: skipped.slice(0, 50),
      project_quantity: projectQty.slice(0, 50),
      project_quantity_count: projectQty.length,
    },
  };
}
/**
 * S3: Excel jamlar bloki qatorining smeta narxi zanjiridagi kaliti (egasining `локалка` yorliqlari bo'yicha);
 * tanilmasa null. Tartib muhim: «ИТОГО С НДС» — QQSdan, «ИТОГО С УЧЕТОМ ПРОЧИХ» — «ИТОГО» dan oldin.
 */
const latinLookalikes: Record<string, string> = {
  A: 'А',
  B: 'В',
  C: 'С',
  E: 'Е',
  H: 'Н',
  K: 'К',
  M: 'М',
  O: 'О',
  P: 'Р',
  T: 'Т',
  X: 'Х',
};
export function excelKey(label: string) {
  // Egasining fayllarida yorliqlar qo'lda yozilgan: «С У ЧЕТОМ» (so'z ichida probel), «C НДС» (lotin C),
  // «ГЕНПОДРДЧИКА» (harf tushgan) — probelsiz va kirill harflari bilan solishtiriladi
  const raw = label.toUpperCase().replace(/\s+/g, '');
  const l = raw.replace(/[ABCEHKMOPTX]/g, (c) => latinLookalikes[c]!);
  if (/QQS|VAT/.test(raw)) return 'vat';
  if (/ВОЗВРАТ/.test(l)) return 'customer_deduction';
  if (/СНДС/.test(l)) return 'total_with_vat';
  if (/НДС/.test(l)) return 'vat';
  if (/СУЧ[ЕЁ]ТОМ/.test(l)) return 'total_without_vat';
  if (/ПРОЧИЕ|НАКЛАДН/.test(l)) return 'other_costs';
  if (/ЗАРПЛАТ|ОПЛАТАТРУДА|ЗАТРАТЫТРУДА/.test(l)) return 'labor';
  if (/МАШИН|МЕХАНИЗМ/.test(l)) return 'equipment';
  if (/МАТЕРИАЛ.*(ГЕНПОДР|ЗАКАЗЧ)/.test(l)) return 'customer_materials';
  if (/МАТЕРИАЛ/.test(l)) return 'contractor_materials';
  if (/ВСЕГОЗАТРАТ|ПРЯМЫХ/.test(l)) return 'direct_total';
  if (/^ИТОГО/.test(l)) return 'total';
  return null;
}
/** Inspeksiya uchun varaq qisqachasi; `too_large` varaq tanlanmaydi (chegara smeta importi bilan bir xil). */
export function form5Summary(sheet: Sheet, maxRows: number, maxColumns: number) {
  const too_large = sheet.rowCount > maxRows || sheet.columnCount > maxColumns;
  const parsed = too_large ? null : parseForm5(sheet);
  return {
    sheet: sheet.name,
    form5: too_large ? !!layout(sheet) : !!parsed,
    too_large,
    rows: sheet.rowCount,
    works: parsed?.counts.works ?? 0,
    resources: parsed?.counts.resources ?? 0,
    materials: parsed?.counts.materials ?? 0,
    priced: parsed?.counts.priced ?? 0,
  };
}
