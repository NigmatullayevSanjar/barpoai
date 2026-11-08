import ExcelJS from 'exceljs';
import { type Db, type Row } from './db.js';
import { dec, money, quantity } from './money.js';
import { percentLineSql, priceChain, settingsOf, type DirectCosts } from './estimate-price.js';

/**
 * S4 (D40, D41): oylik yopish paketi — F-2 (bajarilgan ishlar dalolatnomasi, lokal resurs smeta) va F-3
 * (ma'lumotnoma-hisobvaraq-faktura). Holat saqlanmaydi: har so'rovda qabul qilingan progress va ombor sarfidan.
 * Uch jamg'arma: qurilish boshidan (`to` gacha), yil boshidan (`to` yilining 1-yanvaridan) va davr (`from`…`to`).
 * - Ish hajmi: qabul qilingan hisobotlar (`progress_entries`, hisobot sanasi bo'yicha) + tuzatishlar (kiritilgan
 *   Toshkent sanasi bo'yicha — tuzatish o'tgan oyni o'zgartirmaydi); reviziyalar bo'ylab `lineage_id` bilan. Hujjat
 *   saqlanmaydi: o'tgan sana bilan keyin qabul qilingan hisobot yoki narx reviziyasi qayta chiqarilgan aktni o'zgartiradi.
 * - Form 5 resursi (normali qator, guruhida ish pozitsiyasi bor): hisobiy miqdor × ishning bajarilgan ulushi
 *   (= norma × davr hajmi, birlik ko'paytmasi bilan).
 * - Normasiz (yoki ish pozitsiyasisiz) material: shu qatorga bog'langan ombor sarfi (storno bilan), yozuvning
 *   Toshkent sanasi bo'yicha (O12).
 * - Qolgan ish, texnika, xizmat qatorlari: o'z qabul qilingan hajmi.
 * Narx — joriy reviziyadagi; summa = round(miqdor × narx, 2); zanjir S3 sozlamalari bilan.
 */
export const actRanges = ['start', 'year', 'period'] as const;
export type ActRange = (typeof actRanges)[number];
export type Triple = Record<ActRange, string>;
const zero = (): Triple => ({ start: '0', year: '0', period: '0' });
const tz = `'Asia/Tashkent'`;

export type ActLineInput = {
  id: string;
  lineage_id: string;
  kind: 'material' | 'labor' | 'equipment' | 'service';
  description: string;
  unit_id: string;
  norm: string | null;
  effective_quantity: string;
  unit_price: string;
  supplied_by: 'contractor' | 'customer';
  category: string | null;
  zone_id: string | null;
  section_name: string | null;
  norm_code: string | null;
  resource_code: string | null;
  position: number;
  is_percent: boolean;
  material_id: string | null;
};
export type ActBasis = 'work' | 'norm' | 'consumption' | 'progress';

/** Qatorlar bo'yicha uch jamg'arma miqdori, summasi va zanjir uchun xarajat turlari (sof hisob, bazasiz). */
export function computeAct(
  lines: ActLineInput[],
  progress: Map<string, Triple>,
  consumption: Map<string, Triple>,
) {
  const groupKey = (l: ActLineInput) =>
    l.category === null ? null : `${l.category}\u0000${l.zone_id ?? ''}`;
  const hasNormed = new Set(
    lines
      .filter((l) => l.norm !== null)
      .map(groupKey)
      .filter((k): k is string => k !== null),
  );
  // Form 5 ish pozitsiyasi: mehnat, normasiz, narxi 0, guruhida normali qator bor (D32 dagi «ish qatori»)
  const isWork = (l: ActLineInput) =>
    l.kind === 'labor' &&
    l.norm === null &&
    dec(l.unit_price).isZero() &&
    groupKey(l) !== null &&
    hasNormed.has(groupKey(l)!);
  const works = new Map<
    string,
    { plan: ReturnType<typeof dec>; done: Record<ActRange, ReturnType<typeof dec>> }
  >();
  for (const l of lines.filter(isWork)) {
    const key = groupKey(l)!;
    const g = works.get(key) ?? {
      plan: dec('0'),
      done: { start: dec('0'), year: dec('0'), period: dec('0') },
    };
    g.plan = g.plan.plus(l.effective_quantity);
    const p = progress.get(l.lineage_id) ?? zero();
    for (const r of actRanges) g.done[r] = g.done[r].plus(p[r]);
    works.set(key, g);
  }
  const costs = Object.fromEntries(
    actRanges.map((r) => [
      r,
      {
        labor: dec('0'),
        equipment: dec('0'),
        contractor_materials: dec('0'),
        customer_materials: dec('0'),
        services: dec('0'),
      },
    ]),
  ) as Record<ActRange, Record<keyof DirectCosts, ReturnType<typeof dec>>>;
  const out = [];
  const ignored: { description: string; unit_id: string; quantity: Triple }[] = [];
  const hasAny = (q: Triple | undefined) => !!q && actRanges.some((r) => !dec(q[r]).isZero());
  for (const l of lines) {
    // D39: eski foizli «xizmat» qatori zanjirga ham, dalolatnomaga ham kirmaydi
    if (l.is_percent) {
      if (hasAny(progress.get(l.lineage_id)))
        ignored.push({
          description: l.description,
          unit_id: l.unit_id,
          quantity: progress.get(l.lineage_id)!,
        });
      continue;
    }
    const group = groupKey(l) === null ? undefined : works.get(groupKey(l)!);
    let basis: ActBasis;
    let qty: Triple;
    if (isWork(l)) {
      basis = 'work';
      qty = progress.get(l.lineage_id) ?? zero();
    } else if (l.norm !== null && group) {
      basis = 'norm';
      // Form 5 resursi hajmi ish ulushidan; resursning o'ziga yozilgan progress hisobga olinmaydi — ogohlantirish
      if (hasAny(progress.get(l.lineage_id)))
        ignored.push({
          description: l.description,
          unit_id: l.unit_id,
          quantity: progress.get(l.lineage_id)!,
        });
      qty = Object.fromEntries(
        actRanges.map((r) => [
          r,
          group.plan.isZero()
            ? quantity(0)
            : quantity(dec(l.effective_quantity).mul(group.done[r]).div(group.plan)),
        ]),
      ) as Triple;
    } else if (l.kind === 'material') {
      basis = 'consumption';
      qty = consumption.get(l.lineage_id) ?? zero();
    } else {
      basis = 'progress';
      qty = progress.get(l.lineage_id) ?? zero();
    }
    const amount = Object.fromEntries(
      actRanges.map((r) => [r, money(dec(qty[r]).mul(l.unit_price))]),
    ) as Triple;
    const bucket: keyof DirectCosts =
      l.kind === 'labor'
        ? 'labor'
        : l.kind === 'equipment'
          ? 'equipment'
          : l.kind === 'service'
            ? 'services'
            : l.supplied_by === 'customer'
              ? 'customer_materials'
              : 'contractor_materials';
    for (const r of actRanges) costs[r][bucket] = costs[r][bucket].plus(amount[r]);
    out.push({
      ...l,
      // F-2 «Норма на ед.»: ishning saqlangan birligiga (m2, …) — davr miqdori = norma × ish hajmi
      unit_norm:
        basis === 'norm' && group && !group.plan.isZero()
          ? quantity(dec(l.effective_quantity).div(group.plan))
          : null,
      basis,
      quantity: Object.fromEntries(actRanges.map((r) => [r, quantity(qty[r])])) as Triple,
      amount,
    });
  }
  const direct = Object.fromEntries(
    actRanges.map((r) => [
      r,
      Object.fromEntries(Object.entries(costs[r]).map(([k, v]) => [k, money(v)])) as DirectCosts,
    ]),
  ) as Record<ActRange, DirectCosts>;
  return { lines: out, costs: direct, ignored };
}

const sumTriple = (expr: string, date: string) => `
  coalesce(sum(${expr}) FILTER(WHERE ${date}<=$4),0)::text "start",
  coalesce(sum(${expr}) FILTER(WHERE ${date} BETWEEN $5 AND $4),0)::text "year",
  coalesce(sum(${expr}) FILTER(WHERE ${date} BETWEEN $3 AND $4),0)::text "period"`;
/** Ombor sarfi: sarf buyrug'i yoki uning stornosi (`reversal`) qaysi smeta qatoriga tegishli. */
const consumedLine = `CASE WHEN c.kind='reversal' THEN o.estimate_line_id ELSE c.estimate_line_id END`;

/** Smetaning davr dalolatnomasi (F-2/F-3 ma'lumoti). `from`, `to` — sana (YYYY-MM-DD), `to` kiradi. */
export async function estimateAct(
  db: Db,
  tenantId: string,
  estimate: Row,
  from: string,
  to: string,
) {
  const year = `${to.slice(0, 4)}-01-01`;
  const params = [tenantId, estimate.id, from, to, year];
  const lines = (
    await db.query(
      `SELECT l.id,l.lineage_id,l.kind,l.description,l.unit_id,l.norm::text norm,l.effective_quantity::text effective_quantity,
         l.unit_price::text unit_price,l.supplied_by,l.category,l.zone_id,l.section_name,l.norm_code,l.resource_code,l.position,l.material_id,
         ${percentLineSql} is_percent
       FROM estimate_lines l WHERE l.tenant_id=$1 AND l.estimate_id=$2 AND l.archived_at IS NULL
       ORDER BY l.position,l.id`,
      [tenantId, estimate.id],
    )
  ).rows as ActLineInput[];
  const progressRows = (
    await db.query(
      `SELECT x.lineage_id,max(x.description) description,max(x.unit_id) unit_id,
         sum(x.start::numeric)::text "start",sum(x.year::numeric)::text "year",sum(x.period::numeric)::text "period"
       FROM (
         SELECT w.lineage_id,w.description,w.unit_id,${sumTriple('pe.quantity', 'r.report_date')}
         FROM progress_entries pe JOIN reports r ON r.tenant_id=pe.tenant_id AND r.id=pe.report_id
           JOIN estimate_lines w ON w.tenant_id=pe.tenant_id AND w.id=pe.estimate_line_id
         WHERE pe.tenant_id=$1 AND w.estimate_id=$2 GROUP BY w.lineage_id,w.description,w.unit_id
         UNION ALL
         SELECT w.lineage_id,w.description,w.unit_id,${sumTriple('pc.quantity_delta', `(pc.created_at AT TIME ZONE ${tz})::date`)}
         FROM progress_corrections pc JOIN progress_entries pe ON pe.tenant_id=pc.tenant_id AND pe.id=pc.progress_entry_id
           JOIN estimate_lines w ON w.tenant_id=pe.tenant_id AND w.id=pe.estimate_line_id
         WHERE pc.tenant_id=$1 AND w.estimate_id=$2 GROUP BY w.lineage_id,w.description,w.unit_id
       ) x GROUP BY x.lineage_id`,
      params,
    )
  ).rows;
  const consumptionRows = (
    await db.query(
      `SELECT w.lineage_id,max(w.description) description,max(w.unit_id) unit_id,
         ${sumTriple('-sl.quantity_delta', `(sl.created_at AT TIME ZONE ${tz})::date`)}
       FROM stock_ledger sl
         JOIN stock_commands c ON c.tenant_id=sl.tenant_id AND c.id=sl.command_id
         LEFT JOIN stock_commands o ON o.tenant_id=c.tenant_id AND o.id=c.reverses_id
         JOIN estimate_lines w ON w.tenant_id=sl.tenant_id AND w.id=${consumedLine}
       WHERE sl.tenant_id=$1 AND (c.kind='consumption' OR (c.kind='reversal' AND o.kind='consumption'))
         AND w.estimate_id=$2
       GROUP BY w.lineage_id`,
      params,
    )
  ).rows;
  const toMap = (rows: Row[]) =>
    new Map(
      rows.map((r) => [r.lineage_id as string, { start: r.start, year: r.year, period: r.period }]),
    );
  const computed = computeAct(lines, toMap(progressRows), toMap(consumptionRows));
  const settings = settingsOf(estimate);
  const totals = Object.fromEntries(
    actRanges.map((r) => [r, priceChain(computed.costs[r], settings)]),
  ) as Record<ActRange, ReturnType<typeof priceChain>>;
  // Shartnoma (D41, QQS bilan): F-3 dagi % = QQS bilan bajarilgan ÷ shartnoma summasi
  const contractAmount: string | null = estimate.contract_amount;
  const withoutVat =
    contractAmount === null
      ? null
      : settings.vat_percent === null
        ? money(contractAmount)
        : money(dec(contractAmount).div(dec(settings.vat_percent).div(100).plus(1)));
  const contract = {
    number: estimate.contract_number as string | null,
    date: estimate.contract_date as string | null,
    amount: contractAmount,
    amount_without_vat: withoutVat,
    vat:
      contractAmount === null || withoutVat === null
        ? null
        : money(dec(contractAmount).minus(withoutVat)),
    percent: Object.fromEntries(
      actRanges.map((r) => [
        r,
        contractAmount === null || dec(contractAmount).isZero()
          ? null
          : money(dec(totals[r].total).div(contractAmount).mul(100)),
      ]),
    ) as Record<ActRange, string | null>,
  };
  // Ogohlantirishlar: joriy reviziyada yo'q qatorning davrdagi fakti; smeta materiali, lekin qatorga bog'lanmagan sarf
  const current = new Set(lines.map((l) => l.lineage_id));
  const removed = [...progressRows, ...consumptionRows]
    .filter((r) => !current.has(r.lineage_id) && actRanges.some((k) => !dec(r[k]).isZero()))
    .map((r) => ({
      description: r.description as string,
      unit_id: r.unit_id as string,
      quantity: Object.fromEntries(actRanges.map((k) => [k, quantity(r[k])])) as Triple,
    }));
  // Bog'lanmagan sarf faqat ombor sarfidan olinadigan material qatorlari uchun (normali resurslar normadan)
  const consumed = [
    ...new Set(
      computed.lines
        .filter((l) => l.basis === 'consumption' && l.material_id)
        .map((l) => l.material_id),
    ),
  ];
  const unlinked = (
    await db.query(
      `SELECT m.name,m.unit_id,sum(-sl.quantity_delta)::text quantity
       FROM stock_ledger sl
         JOIN stock_commands c ON c.tenant_id=sl.tenant_id AND c.id=sl.command_id
         LEFT JOIN stock_commands o ON o.tenant_id=c.tenant_id AND o.id=c.reverses_id
         JOIN materials m ON m.tenant_id=sl.tenant_id AND m.id=sl.material_id
       WHERE sl.tenant_id=$1 AND (c.kind='consumption' OR (c.kind='reversal' AND o.kind='consumption'))
         AND ${consumedLine} IS NULL AND c.project_id=$5
         AND (sl.created_at AT TIME ZONE ${tz})::date BETWEEN $3 AND $4
         AND c.material_id=ANY($2::uuid[])
       GROUP BY m.name,m.unit_id ORDER BY m.name`,
      [tenantId, consumed, from, to, estimate.project_id],
    )
  ).rows.filter((r) => !dec(r.quantity).isZero());
  return {
    period: { from, to, year_from: year },
    settings,
    lines: computed.lines.filter((l) => actRanges.some((r) => !dec(l.quantity[r]).isZero())),
    costs: computed.costs,
    totals,
    contract,
    warnings: {
      removed_lines: removed,
      unlinked_consumption: unlinked,
      ignored_progress: computed.ignored.map((i) => ({
        ...i,
        quantity: Object.fromEntries(actRanges.map((k) => [k, quantity(i.quantity[k])])) as Triple,
      })),
    },
  };
}
export type EstimateAct = Awaited<ReturnType<typeof estimateAct>>;

/** F-2 va F-3 shakllaridagi yorliqlar (egasining `ф-2` va `ф3` varaqlari kabi — rus tilida). */
const chainLabels: Record<string, string> = {
  labor: 'Заработная плата',
  equipment: 'Эксплуатация машин',
  contractor_materials: 'Материалы подрядчика',
  customer_materials: 'Материалы заказчика (генподрядчика)',
  services: 'Услуги',
  direct_total: 'Итого прямых затрат',
  other_costs: 'Прочие затраты (с прибылью)',
  production_costs: 'Производственные расходы',
  total: 'Итого',
  customer_deduction: 'Возврат материалов заказчика (генподрядчика)',
  total_without_vat: 'Итого без НДС',
  vat: 'НДС',
  total_with_vat: 'Итого с НДС',
};
const units: Record<string, string> = {
  pcs: 'шт',
  m: 'м',
  m2: 'м2',
  m3: 'м3',
  kg: 'кг',
  t: 'т',
  set: 'компл',
  l: 'л',
};
const unitOf = (unit: string, kind: string) =>
  unit === 'hour' ? (kind === 'equipment' ? 'маш.-ч' : 'чел.-ч') : (units[unit] ?? unit);
const ddmmyyyy = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const num = (v: string | null | undefined) => (v === null || v === undefined ? '' : Number(v));
export type ActParties = {
  contractor: string;
  contractor_address: string | null;
  contractor_phone: string | null;
  customer: string | null;
  project: string;
  project_address: string | null;
  estimate: string;
  revision: number;
};

/** F-2 (dalolatnoma) va F-3 (ma'lumotnoma) varaqlari bitta faylda; kataklarda formula emas, qiymat. */
export async function actWorkbook(act: EstimateAct, parties: ActParties) {
  const book = new ExcelJS.Workbook();
  const period = `за период с ${ddmmyyyy(act.period.from)} по ${ddmmyyyy(act.period.to)}`;
  const contractText = `№ ${act.contract.number ?? '________'} от ${
    act.contract.date ? ddmmyyyy(act.contract.date) : '________'
  }`;
  const objectText = `${parties.project}${parties.project_address ? `, ${parties.project_address}` : ''}`;
  const amountOf = (r: ActRange, key: string) =>
    act.totals[r].lines.find((l) => l.key === key)?.amount ?? null;
  const bold = (row: ExcelJS.Row) => {
    row.font = { bold: true };
  };

  // ---- F-2: «АКТ ВЫПОЛНЕННЫХ РАБОТ (локальная ресурсная смета)» — davr hajmi bor qatorlar
  const f2 = book.addWorksheet('F-2');
  f2.columns = [8, 22, 60, 10, 12, 16, 16, 18].map((width) => ({ width }));
  f2.addRow([`ГЕНПОДРЯДЧИК: ${parties.customer ?? '________________'}`]);
  f2.addRow([`СУБПОДРЯДЧИК: ${parties.contractor}`]);
  f2.addRow([`Объект: ${objectText}`]);
  f2.addRow([`Договор ${contractText}`]);
  f2.addRow([]);
  bold(f2.addRow(['', '', 'АКТ ВЫПОЛНЕННЫХ РАБОТ']));
  f2.addRow(['', '', '(локальная ресурсная смета)']);
  bold(f2.addRow(['', '', period]));
  f2.addRow(['', '', `Смета: ${parties.estimate} (ревизия ${parties.revision})`]);
  f2.addRow([]);
  bold(
    f2.addRow([
      '№ п.п.',
      'Шифр нормативов и коды ресурсов',
      'Наименование работ и затрат',
      'Ед. изм.',
      'Норма на ед.',
      'Количество за период',
      'Цена за ед. (сум)',
      'Сумма (сум)',
    ]),
  );
  f2.addRow([1, 2, 3, 4, 5, 6, 7, 8]);
  let section: string | null = null;
  let work = 0;
  let sub = 0;
  let workGroup: string | null = null;
  const groupOf = (l: { category: string | null; zone_id: string | null }) =>
    l.category === null ? null : `${l.category}\u0000${l.zone_id ?? ''}`;
  for (const l of act.lines.filter((x) => !dec(x.quantity.period).isZero())) {
    if (l.section_name && l.section_name !== section) bold(f2.addRow(['', '', l.section_name]));
    section = l.section_name ?? section;
    // Pozitsiya raqami: ish — butun son, uning resurslari — «n.m» (Form 5 kabi)
    // ish — butun son; o'sha guruhdagi (kategoriya + zona) resurs va materiallar — «n.m»
    let n: string;
    if (l.basis !== 'work' && workGroup !== null && groupOf(l) === workGroup)
      n = `${work}.${++sub}`;
    else {
      sub = 0;
      n = String(++work);
      workGroup = l.basis === 'work' ? groupOf(l) : null;
    }
    f2.addRow([
      n,
      l.norm_code ?? l.resource_code ?? '',
      l.description,
      unitOf(l.unit_id, l.kind),
      num(l.unit_norm),
      num(l.quantity.period),
      num(l.unit_price),
      num(l.amount.period),
    ]);
  }
  f2.addRow([]);
  for (const line of act.totals.period.lines) {
    const row = f2.addRow([
      '',
      '',
      chainLabels[line.key] ?? line.key,
      'сум',
      '',
      '',
      line.percent !== undefined ? `${line.percent} %` : '',
      Number(line.amount),
    ]);
    if (['direct_total', 'total', 'total_without_vat', 'total_with_vat'].includes(line.key))
      bold(row);
  }

  // ---- F-3: «СПРАВКА-СЧЕТ-ФАКТУРА» — 16 ustun: boshidan / yil boshidan / davr (hajm, %, summa)
  const f3 = book.addWorksheet('F-3');
  f3.columns = [6, 44, 8, 12, 12, 18, 18, 12, 12, 18, 12, 12, 18, 12, 12, 18].map((width) => ({
    width,
  }));
  bold(f3.addRow(['', 'СПРАВКА-СЧЕТ-ФАКТУРА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ (понесенных затрат)']));
  f3.addRow(['', period]);
  f3.addRow([]);
  // Rekvizitlar: kompaniya va buyurtmachi nomi; platformada saqlanmaydiganlari qo'lda to'ldiriladi
  const side = (label: string, left: string | null, right: string | null) =>
    f3.addRow(['', label, left ?? '', '', '', '', '', '', label, '', right ?? '']);
  bold(side('СУБПОДРЯДЧИК / ГЕНПОДРЯДЧИК', parties.contractor, parties.customer));
  side('Адрес', parties.contractor_address, '');
  side('Телефон', parties.contractor_phone, '');
  for (const label of ['Расчетный счет', 'Банк', 'МФО', 'ИНН', 'Код по ОКЭД']) side(label, '', '');
  f3.addRow(['', 'Наименование объекта и его адрес', objectText]);
  f3.addRow([
    '',
    'Договор субподряда',
    contractText,
    '',
    '',
    '',
    '',
    'Общая стоимость в договорных текущих ценах (сум) с учётом НДС',
    '',
    '',
    '',
    num(act.contract.amount),
  ]);
  f3.addRow([]);
  bold(
    f3.addRow([
      '№',
      'Наименование объектов, этапов, видов работ, оборудования',
      'Ед. изм.',
      'Объем работ в физических показателях',
      '',
      'Стоимость в договорных текущих ценах (сум)',
      '',
      'Выполненные работы (понесенные затраты): с начала строительства',
      '',
      '',
      'с начала года',
      '',
      '',
      'в том числе за отчетный период',
      '',
      '',
    ]),
  );
  bold(
    f3.addRow([
      '',
      '',
      '',
      'всего',
      'в т.ч. на текущий год',
      'всего',
      'в т.ч. на текущий год',
      'в физических показателях',
      'в % к стоимости по договору',
      'в договорных текущих ценах (сум)',
      'в физических показателях',
      'в % к стоимости по договору',
      'в договорных текущих ценах (сум)',
      'в физических показателях',
      'в % к стоимости по договору',
      'в договорных текущих ценах (сум)',
    ]),
  );
  f3.addRow(Array.from({ length: 16 }, (_, i) => i + 1));
  const money3 = (key: string, abs = false) =>
    actRanges.flatMap((r) => {
      const v = amountOf(r, key);
      return ['', '', v === null ? '' : Number(abs ? dec(v).abs().toFixed(2) : v)];
    });
  // «в т.ч. на текущий год» ulushi platformada saqlanmaydi — bo'sh (qo'lda)
  const contract = (v: string | null) => [num(v), ''];
  f3.addRow([
    1,
    'ВСЕГО СМР',
    'сум',
    '',
    '',
    ...contract(act.contract.amount_without_vat),
    ...money3('total'),
  ]);
  if (act.settings.deduct_customer_materials)
    f3.addRow([
      '',
      'МИНУС МАТЕРИАЛЫ ЗАКАЗЧИКА (ГЕНПОДРЯДЧИКА)',
      'сум',
      '',
      '',
      '',
      '',
      ...money3('customer_deduction', true),
    ]);
  f3.addRow([
    '',
    'Всего СМР без НДС',
    'сум',
    '',
    '',
    ...contract(act.contract.amount_without_vat),
    ...money3('total_without_vat'),
  ]);
  const vatPercent = act.settings.vat_percent;
  if (vatPercent !== null)
    f3.addRow([
      '',
      `НДС ${dec(vatPercent).toFixed()}%`,
      'сум',
      '',
      '',
      ...contract(act.contract.vat),
      ...money3('vat'),
    ]);
  const final = vatPercent === null ? 'total_without_vat' : 'total_with_vat';
  bold(
    f3.addRow([
      '',
      vatPercent === null ? 'Итого' : 'Итого с НДС',
      'сум',
      '',
      '',
      ...contract(act.contract.amount),
      ...actRanges.flatMap((r) => ['', num(act.contract.percent[r]), num(amountOf(r, final))]),
    ]),
  );
  f3.addRow([]);
  f3.addRow(['', 'СУБПОДРЯДЧИК', '', '', '', '', '', 'ГЕНПОДРЯДЧИК']);
  f3.addRow([
    '',
    'Директор: ______________________',
    '',
    '',
    '',
    '',
    '',
    'Директор: ______________________',
  ]);
  f3.addRow([
    '',
    'Гл.бухгалтер: ____________________',
    '',
    '',
    '',
    '',
    '',
    'Гл.бухгалтер: ____________________',
  ]);
  return Buffer.from(await book.xlsx.writeBuffer()).toString('base64');
}
