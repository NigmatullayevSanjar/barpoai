import ExcelJS from 'exceljs';
import { type Db, type Row } from './db.js';
import { dec, money, quantity } from './money.js';
import { computeAct, loadActInputs } from './estimate-acts.js';

/**
 * S5 (D37, D40; VMQ 583, 12-band): buyurtmachi (bosh pudratchi) materiallari hisoboti — egasining `отчёт` shakli.
 * Buyurtmachi materiali — obyektning joriy smetalarida «Kim beradi: buyurtmachi» qatori bor material (ombor
 * yozuvida belgi yo'q). Harakatlar obyektning barcha hisoblaridan (omborlar va brigadirlar qo'lidagi qoldiq birga —
 * ular orasidagi o'tkazish jamini o'zgartirmaydi), `stock_ledger` yozuvining Toshkent sanasi bo'yicha:
 * davr boshidagi qoldiq, berilgan (kirim va boshlang'ich qoldiq), sarflangan (sarf), tuzatish (inventarizatsiya),
 * davr oxiridagi qoldiq; storno asl buyruq turi bilan. Summa — ombor yozuvidagi qiymat (kirimdagi narx).
 * Ish bo'yicha: buyurtmachi material qatorining haqiqiy sarfi (shu qatorga bog'langan) va normativ sarfi
 * (reja miqdori × ishning davrda bajarilgan ulushi, S4 moduli). Hech narsa saqlanmaydi.
 * Smeta ma'lumoti (ish bo'yicha qatorlar, ish nomlari, shartnoma) faqat smetani ko'rish huquqi bilan: omborchi va
 * brigadir smetaga kirmaydi — ular faqat material harakatini ko'radi.
 */
type Flow = { quantity: string; value: string };
const tz = `'Asia/Tashkent'`;

export async function customerMaterials(
  db: Db,
  tenantId: string,
  projectId: string,
  from: string,
  to: string,
  estimatesVisible: boolean,
) {
  const materials = (
    await db.query(
      `SELECT m.id,m.name,m.unit_id,bool_or(l.supplied_by='contractor') mixed
       FROM estimate_lines l JOIN estimates e ON e.tenant_id=l.tenant_id AND e.id=l.estimate_id
         JOIN materials m ON m.tenant_id=l.tenant_id AND m.id=l.material_id
       WHERE l.tenant_id=$1 AND e.project_id=$2 AND e.archived_at IS NULL AND l.archived_at IS NULL
         AND l.kind='material'
       GROUP BY m.id,m.name,m.unit_id HAVING bool_or(l.supplied_by='customer')
       ORDER BY m.name,m.id`,
      [tenantId, projectId],
    )
  ).rows;
  const ids = materials.map((m) => m.id as string);
  const day = `(sl.created_at AT TIME ZONE ${tz})::date`;
  const kind = `CASE WHEN c.kind='reversal' THEN o.kind ELSE c.kind END`;
  const flow = (name: string, sign: string, where: string) => `
    coalesce(${sign}sum(sl.quantity_delta) FILTER(WHERE ${where}),0)::text ${name}_quantity,
    coalesce(${sign}sum(sl.value_delta) FILTER(WHERE ${where}),0)::text ${name}_value`;
  const movements = ids.length
    ? (
        await db.query(
          `SELECT sl.material_id,
             ${flow('opening', '', `${day}<$3`)},
             ${flow('received', '', `${kind} IN ('opening','receipt') AND ${day} BETWEEN $3 AND $4`)},
             ${flow('consumed', '-', `${kind}='consumption' AND ${day} BETWEEN $3 AND $4`)},
             ${flow('adjusted', '', `${kind}='adjustment' AND ${day} BETWEEN $3 AND $4`)},
             ${flow('closing', '', `${day}<=$4`)}
           FROM stock_ledger sl
             JOIN stock_accounts a ON a.tenant_id=sl.tenant_id AND a.id=sl.account_id
             JOIN stock_commands c ON c.tenant_id=sl.tenant_id AND c.id=sl.command_id
             LEFT JOIN stock_commands o ON o.tenant_id=c.tenant_id AND o.id=c.reverses_id
           WHERE sl.tenant_id=$1 AND a.project_id=$2 AND sl.material_id=ANY($5::uuid[])
           GROUP BY sl.material_id`,
          [tenantId, projectId, from, to, ids],
        )
      ).rows
    : [];
  const byMaterial = new Map(movements.map((r) => [r.material_id as string, r]));
  const pair = (r: Row | undefined, name: string): Flow => ({
    quantity: quantity(r?.[`${name}_quantity`] ?? '0'),
    value: money(r?.[`${name}_value`] ?? '0'),
  });
  // Ish bo'yicha: har smetaning buyurtmachi material qatorlari — haqiqiy va normativ sarf (davr)
  const estimates = (
    await db.query(
      `SELECT e.id,e.name,e.contract_number,e.contract_date FROM estimates e
       WHERE e.tenant_id=$1 AND e.project_id=$2 AND e.archived_at IS NULL
         AND EXISTS (SELECT 1 FROM estimate_lines l WHERE l.tenant_id=e.tenant_id AND l.estimate_id=e.id
                     AND l.archived_at IS NULL AND l.supplied_by='customer')
       ORDER BY e.created_at,e.id`,
      [tenantId, projectId],
    )
  ).rows;
  const lines: {
    estimate_id: string;
    estimate_name: string;
    line_id: string;
    work: string | null;
    material_id: string | null;
    description: string;
    unit_id: string;
    normative: string | null;
    actual: string;
    deviation: string | null;
  }[] = [];
  for (const e of estimates) {
    const inputs = await loadActInputs(db, tenantId, e.id, from, to);
    const computed = computeAct(inputs.lines, inputs.progress, inputs.consumption);
    for (const l of computed.lines) {
      if (l.kind !== 'material' || l.supplied_by !== 'customer') continue;
      const actual = l.consumed?.period ?? quantity(0);
      const normative = l.normative?.period ?? null;
      if (dec(actual).isZero() && (normative === null || dec(normative).isZero())) continue;
      lines.push({
        estimate_id: e.id as string,
        estimate_name: e.name as string,
        line_id: l.id,
        work: l.work ?? l.category,
        material_id: l.material_id,
        description: l.description,
        unit_id: l.unit_id,
        normative,
        actual,
        // miqdor farqi (narx emas): + ortiqcha sarf, − tejash
        deviation: normative === null ? null : quantity(dec(actual).minus(normative)),
      });
    }
  }
  const rows = materials.map((m) => {
    const r = byMaterial.get(m.id);
    // Joriy buyurtmachi smeta qatorlariga tushmagan sarf: bog'lanmagan, arxivlangan smeta yoki reviziyada olib
    // tashlangan qator, pudratchi qatori — sarflangan − joriy qatorlar haqiqiy sarfi
    const onLines = lines
      .filter((l) => l.material_id === m.id)
      .reduce((s, l) => s.plus(l.actual), dec('0'));
    const consumed = pair(r, 'consumed');
    return {
      material_id: m.id as string,
      name: m.name as string,
      unit_id: m.unit_id as string,
      mixed: m.mixed as boolean,
      works: estimatesVisible
        ? [
            ...new Set(
              lines
                .filter((l) => l.material_id === m.id && !dec(l.actual).isZero() && l.work)
                .map((l) => l.work as string),
            ),
          ]
        : [],
      opening: pair(r, 'opening'),
      received: pair(r, 'received'),
      consumed,
      adjusted: pair(r, 'adjusted'),
      closing: pair(r, 'closing'),
      unlinked: quantity(dec(consumed.quantity).minus(onLines)),
    };
  });
  const sum = (name: 'opening' | 'received' | 'consumed' | 'adjusted' | 'closing') => ({
    value: money(rows.reduce((s, r) => s.plus(r[name].value), dec('0'))),
  });
  return {
    period: { from, to },
    contracts: estimatesVisible
      ? estimates
          .filter((e) => e.contract_number)
          .map((e) => ({
            number: e.contract_number as string,
            date: e.contract_date as string | null,
          }))
      : [],
    materials: rows,
    lines: estimatesVisible ? lines : [],
    totals: {
      opening: sum('opening'),
      received: sum('received'),
      consumed: sum('consumed'),
      adjusted: sum('adjusted'),
      closing: sum('closing'),
    },
    warnings: {
      mixed: rows.filter((r) => r.mixed).map((r) => r.name),
      adjusted: rows
        .filter((r) => !dec(r.adjusted.quantity).isZero())
        .map((r) => ({ name: r.name, unit_id: r.unit_id, quantity: r.adjusted.quantity })),
      unlinked: rows
        .filter((r) => !dec(r.unlinked).isZero())
        .map((r) => ({ name: r.name, unit_id: r.unit_id, quantity: r.unlinked })),
    },
  };
}
export type CustomerMaterialsReport = Awaited<ReturnType<typeof customerMaterials>>;

const units: Record<string, string> = {
  pcs: 'шт',
  m: 'м',
  m2: 'м2',
  m3: 'м3',
  kg: 'кг',
  t: 'т',
  set: 'компл',
  l: 'л',
  hour: 'ч',
  section: 'секция',
  boiler: 'котел',
  cycle: 'цикл',
  end: 'конец',
};
const ddmmyyyy = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const num = (v: string | null | undefined) => (v === null || v === undefined ? '' : Number(v));

/** Excel (rus tilida, egasining `отчёт` kabi): «Отчет» — 11 ustun; «Нормативный расход» — ish bo'yicha. */
export async function customerMaterialsWorkbook(
  report: CustomerMaterialsReport,
  parties: { project: string; project_address: string | null },
  prices: boolean,
) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Отчет');
  sheet.columns = [40, 48, 10, 14, 16, 14, 16, 14, 16, 14, 16].map((width) => ({ width }));
  const bold = (row: ExcelJS.Row) => {
    row.font = { bold: true };
  };
  const sumCell = (v: string | undefined) => (prices && v !== undefined ? Number(v) : '');
  sheet.addRow([
    'Объект строительства:',
    `${parties.project}${parties.project_address ? `, ${parties.project_address}` : ''}`,
  ]);
  sheet.addRow([
    'Договор субподряда:',
    report.contracts.length
      ? report.contracts
          .map((c) => `№ ${c.number}${c.date ? ` от ${ddmmyyyy(c.date)}` : ''}`)
          .join('; ')
      : '№ ________ от ________',
  ]);
  sheet.addRow([]);
  bold(sheet.addRow(['', 'Отчет об использовании строительного материала']));
  sheet.addRow([
    '',
    `за период с ${ddmmyyyy(report.period.from)} по ${ddmmyyyy(report.period.to)}`,
  ]);
  sheet.addRow([]);
  bold(
    sheet.addRow([
      'Наименование работ',
      'Наименование материалов, предоставленных заказчиком (генподрядчиком)',
      'Единица измерения',
      'Кол-во неизрасходованного материала на начало периода',
      'Сумма неизрасходованного материала на начало периода',
      'Кол-во переданных материалов за период',
      'Сумма переданных материалов за период',
      'Кол-во фактически использованного материала',
      'Сумма фактически использованного материала',
      'Кол-во неизрасходованного материала на конец периода',
      'Сумма неизрасходованного материала на конец периода',
    ]),
  );
  for (const m of report.materials)
    sheet.addRow([
      m.works.join('; '),
      m.name,
      units[m.unit_id] ?? m.unit_id,
      num(m.opening.quantity),
      sumCell(m.opening.value),
      num(m.received.quantity),
      sumCell(m.received.value),
      num(m.consumed.quantity),
      sumCell(m.consumed.value),
      num(m.closing.quantity),
      sumCell(m.closing.value),
    ]);
  if (prices)
    bold(
      sheet.addRow([
        '',
        'Итого',
        '',
        '',
        sumCell(report.totals.opening.value),
        '',
        sumCell(report.totals.received.value),
        '',
        sumCell(report.totals.consumed.value),
        '',
        sumCell(report.totals.closing.value),
      ]),
    );
  // Izohlar: inventarizatsiya tuzatishi (oxirgi qoldiqqa kiradi) va aralash ta'minot
  for (const a of report.warnings.adjusted)
    sheet.addRow([
      '',
      `Примечание: корректировка по инвентаризации — ${a.name}: ${a.quantity} ${units[a.unit_id] ?? a.unit_id} (учтена в остатке на конец периода)`,
    ]);
  if (report.warnings.mixed.length)
    sheet.addRow([
      '',
      `Примечание: поставляется также подрядчиком — ${report.warnings.mixed.join('; ')}`,
    ]);
  sheet.addRow([]);
  sheet.addRow(['', 'Должность ______________________', '', 'подпись ______________']);
  sheet.addRow(['', 'Должность ______________________', '', 'подпись ______________']);

  // Ish bo'yicha varaq — faqat smetani ko'rish huquqi bilan (qatorlar bo'sh bo'lsa ham bog'lanmagan sarf ko'rinadi)
  if (!report.lines.length && !report.warnings.unlinked.length)
    return Buffer.from(await book.xlsx.writeBuffer()).toString('base64');
  const norms = book.addWorksheet('Нормативный расход');
  norms.columns = [28, 40, 40, 10, 16, 16, 16].map((width) => ({ width }));
  bold(
    norms.addRow([
      'Смета',
      'Наименование работ',
      'Материал',
      'Ед. изм.',
      'Нормативный расход',
      'Фактический расход',
      'Отклонение (+ перерасход, − экономия)',
    ]),
  );
  for (const l of report.lines)
    norms.addRow([
      l.estimate_name,
      l.work ?? '',
      l.description,
      units[l.unit_id] ?? l.unit_id,
      num(l.normative),
      num(l.actual),
      num(l.deviation),
    ]);
  for (const u of report.warnings.unlinked)
    norms.addRow([
      '',
      'Без привязки к текущей строке сметы',
      u.name,
      units[u.unit_id] ?? u.unit_id,
      '',
      num(u.quantity),
      '',
    ]);
  return Buffer.from(await book.xlsx.writeBuffer()).toString('base64');
}
