import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dec, money, plannedQuantity, variance } from '../src/money.js';
import { hashPassword, verifyPassword, verifyTelegram } from '../src/security.js';
import { amount, stockInput } from '../src/schemas.js';
import { roles } from '../src/permissions.js';
import ExcelJS from 'exceljs';
import { parseWorkbook, alignKeys, convertMass } from '../src/estimates.js';
test('UZS arithmetic never sums binary floats', () => {
  assert.equal(money(dec('0.10').add('0.20')), '0.30');
  assert.equal(money(dec('99999999999999.99').add('0.01')), '100000000000000.00');
});
test('optional norm and loss; zero-plan percent is null', () => {
  assert.equal(plannedQuantity({ quantity: '10' }), '10.000000');
  assert.equal(
    plannedQuantity({ quantity: '0', norm: '2.5', work_quantity: '10', loss_percent: '4' }),
    '26.000000',
  );
  assert.equal(variance('8', '0').percent, null);
});
test('decimal DTOs reject JS numbers and exponents', () => {
  assert.equal(amount.safeParse(123).success, false);
  assert.equal(amount.safeParse('1e6').success, false);
  assert.equal(amount.safeParse('-1').success, false);
});
test('nine roles; passwords hashed with random salts', async () => {
  assert.equal(new Set(roles).size, 9);
  const a = await hashPassword('ExamplePass123!'),
    b = await hashPassword('ExamplePass123!');
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('ExamplePass123!', a), true);
  assert.equal(await verifyPassword('incorrect', a), false);
});
test('Telegram rejects unauthenticated identity', () =>
  assert.throws(() =>
    verifyTelegram(
      { id: '1', auth_date: String(Math.floor(Date.now() / 1000)), hash: '00' },
      'token',
    ),
  ));
test('Excel mapping parses decimal strings and rejects formula cells', async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Smeta');
  sheet.addRow(['Turi', 'Nomi', 'Birlik', 'Miqdor', 'Narx']);
  sheet.addRow(['labor', 'Ish', 'hour', '2.50', '100.10']);
  const mapping = {
    kind: 'Turi',
    description: 'Nomi',
    unit_id: 'Birlik',
    quantity: 'Miqdor',
    unit_price: 'Narx',
  };
  const lines = await parseWorkbook(
    Buffer.from(await book.xlsx.writeBuffer()).toString('base64'),
    mapping,
  );
  assert.equal(lines[0]?.unit_price, '100.10');
  sheet.getCell('E2').value = { formula: '1+2', result: 3 };
  await assert.rejects(
    parseWorkbook(Buffer.from(await book.xlsx.writeBuffer()).toString('base64'), mapping),
    /FORMULAS_NOT_ALLOWED/,
  );
});
import { isPhone, normalizePhone, accessState } from '../src/auth.js';
import { phone } from '../src/schemas.js';
test('phone login identifiers normalize to +998XXXXXXXXX', () => {
  assert.equal(isPhone('+998 90 123-45-67'), true);
  assert.equal(isPhone('901234567'), true);
  assert.equal(isPhone('owner'), false);
  assert.equal(normalizePhone('(90) 123 45 67'), '+998901234567');
  assert.equal(phone.parse('998 90 123 45 67'), '+998901234567');
  assert.equal(phone.safeParse('12345').success, false);
});
test('trial end is reported, never auto-blocked', () => {
  const day = 86400000,
    now = Date.parse('2026-10-04T00:00:00Z');
  const trial = accessState(
    { status: 'active', trial_ends_at: new Date(now + 3 * day).toISOString(), paid_until: null },
    now,
  );
  assert.deepEqual([trial.access_state, trial.days_left, trial.days_overdue], ['trial', 3, 0]);
  const overdue = accessState(
    { status: 'active', trial_ends_at: new Date(now - 5 * day).toISOString(), paid_until: null },
    now,
  );
  assert.deepEqual([overdue.access_state, overdue.days_overdue], ['overdue', 5]);
  const paid = accessState(
    {
      status: 'active',
      trial_ends_at: new Date(now - 5 * day).toISOString(),
      paid_until: new Date(now + 20 * day).toISOString(),
    },
    now,
  );
  assert.equal(paid.access_state, 'paid');
  assert.equal(
    accessState({ status: 'blocked', trial_ends_at: null, paid_until: null }, now).access_state,
    'blocked',
  );
});
import { handleUpdate } from '../src/telegram.js';
test('Telegram bot ignores updates without text or sender', async () => {
  // Pool ishlatilmaydi: matn bo'lmagan yangilanish erta qaytadi.
  await handleUpdate({} as never, { update_id: 1, message: { chat: { id: 1 } } } as never);
  await handleUpdate({} as never, { update_id: 2 } as never);
  assert.ok(true);
});
test('notification kinds map to company Telegram categories', async () => {
  const { notificationCategory } = await import('../src/notify.js');
  assert.equal(notificationCategory('task.assigned'), 'tasks');
  assert.equal(notificationCategory('task.overdue'), 'tasks');
  assert.equal(notificationCategory('report.returned'), 'reports');
  assert.equal(notificationCategory('progress.corrected'), 'reports');
  assert.equal(notificationCategory('stock.request.fulfilled'), 'stock');
  assert.equal(notificationCategory('payment.request.approved'), 'finance');
  assert.equal(notificationCategory('support.response'), 'other');
});
test('billing period is a 30-day chain anchored on the given start', async () => {
  const { periodEnd, PERIOD_DAYS, INVOICE_LEAD_DAYS } = await import('../src/billing.js');
  assert.equal(PERIOD_DAYS, 30);
  assert.equal(INVOICE_LEAD_DAYS, 3);
  assert.equal(periodEnd('2026-10-18T00:00:00.000Z').toISOString(), '2026-11-17T00:00:00.000Z');
  assert.equal(
    periodEnd(periodEnd('2026-10-18T00:00:00.000Z')).toISOString(),
    '2026-12-17T00:00:00.000Z',
  );
});
test('estimate revision keeps line identity in order (D26/D30)', () => {
  const pairs = (a: string[], b: string[]) => [...alignKeys(a, b)].sort((x, y) => x[0] - y[0]);
  // yuqoriga qator qo'shildi: bir xil kalitli qatorlar o'z tartibida qoladi
  assert.deepEqual(pairs(['k', 'x', 'x'], ['t', 'k', 'x', 'x']), [
    [1, 0],
    [2, 1],
    [3, 2],
  ]);
  // takrorlanuvchi qatorlardan birinchisi o'chirildi: qolgani o'z juftiga
  assert.deepEqual(pairs(['x', 'y', 'x'], ['y', 'x']), [
    [0, 1],
    [1, 2],
  ]);
  // joy almashgan qatorlar ham kalit bo'yicha topiladi
  assert.deepEqual(pairs(['p', 'q'], ['q', 'p']), [
    [0, 1],
    [1, 0],
  ]);
  // katta o'rta qism (3000 × 3000 > 4 mln katak): kvadrat xotirasiz, har kalit o'z qatoriga
  const big = Array.from({ length: 3000 }, (_, i) => `k${i}`);
  const reversed = [...big].reverse();
  const map = alignKeys(big, reversed);
  assert.equal(map.size, 3000);
  assert.ok([...map].every(([j, i]) => reversed[j] === big[i]));
});
test('import converts t ↔ kg only when the line total stays exact (D31)', () => {
  assert.deepEqual(convertMass({ unit_id: 'kg', quantity: '12.5', unit_price: '9000' }, 't'), {
    unit_id: 't',
    quantity: '0.0125',
    unit_price: '9000000',
  });
  assert.deepEqual(convertMass({ unit_id: 't', quantity: '2', unit_price: '9000000' }, 'kg'), {
    unit_id: 'kg',
    quantity: '2000',
    unit_price: '9000',
  });
  // norma ham o'tkaziladi, ish hajmi o'z birligida qoladi
  assert.deepEqual(
    convertMass(
      { unit_id: 'kg', quantity: '5', norm: '0.5', work_quantity: '10', unit_price: '9000' },
      't',
    ),
    { unit_id: 't', quantity: '0.005', norm: '0.0005', work_quantity: '10', unit_price: '9000000' },
  );
  // narx 2 kasrdan, miqdor 6 kasrdan oshadi; hisobiy miqdor yaxlitlanib jami o'zgaradi; boshqa juftlik
  assert.equal(convertMass({ unit_id: 't', quantity: '1', unit_price: '100.5' }, 'kg'), null);
  assert.equal(convertMass({ unit_id: 'kg', quantity: '0.0005', unit_price: '9000' }, 't'), null);
  assert.equal(
    convertMass(
      { unit_id: 'kg', quantity: '1', norm: '0.125', work_quantity: '3.333', unit_price: '9000' },
      't',
    ),
    null,
  );
  assert.equal(convertMass({ unit_id: 'm3', quantity: '1', unit_price: '100' }, 'kg'), null);
});
import { parseForm5, form5Unit, form5Floor } from '../src/form5.js';
import { form5Workbook } from './form5-fixture.js';
test('Form 5 sheet: works, resources by norm, sections as floors, warnings and Excel totals (D29)', async () => {
  assert.deepEqual(form5Unit('100 М2'), { unit: 'm2', factor: '100', known: true });
  assert.deepEqual(form5Unit('1 КМ ЛИНИЙ'), { unit: 'm', factor: '1000', known: true });
  assert.deepEqual(form5Unit('ЧЕЛ-Ч'), { unit: 'hour', factor: '1', known: true });
  // D32: egasining smetalaridagi birliklar qo'shildi; platformada yo'q birlik — dona, ogohlantirish bilan
  assert.deepEqual(form5Unit('Л'), { unit: 'l', factor: '1', known: true });
  assert.deepEqual(form5Unit('1 СЕКЦИЯ АРМАТУРНОГО КАРКАСА'), {
    unit: 'section',
    factor: '1',
    known: true,
  });
  assert.deepEqual(form5Unit('КОТЕЛ'), { unit: 'boiler', factor: '1', known: true });
  assert.deepEqual(form5Unit('ЦИКЛ'), { unit: 'cycle', factor: '1', known: true });
  assert.deepEqual(form5Unit('1 КОНЕЦ'), { unit: 'end', factor: '1', known: true });
  assert.deepEqual(form5Unit('ПАРА'), { unit: 'pcs', factor: '1', known: false });
  assert.deepEqual(form5Unit('1 ЛИСТ'), { unit: 'pcs', factor: '1', known: false });
  assert.equal(form5Floor('Раздел 7. Кладка (А-Г/1-9)  -1-этаже на отм. -3,600'), '-1-qavat');
  assert.equal(form5Floor('Раздел 14. Монтаж Цоколная этаж'), 'Sokol qavat');
  assert.equal(form5Floor('Раздел 2. Кровля'), null);
  // ExcelJS yozgan faylni qayta o'qiymiz (formula natijasi saqlangan holda)
  const book = new ExcelJS.Workbook();
  await book.xlsx.load((await form5Workbook().xlsx.writeBuffer()) as any);
  assert.equal(parseForm5(book.getWorksheet('Накладная')!), null);
  const local = parseForm5(book.getWorksheet('Локалка 1')!)!;
  assert.deepEqual(local.errors, []);
  assert.deepEqual(local.counts, { works: 2, resources: 7, materials: 2, priced: 8 });
  // S3, D37: «kim beradi» tanlovi faqat bosh pudratchi material qatorlariga (A bo'sh, miqdori bor)
  assert.deepEqual(local.gcRows, [15, 16]);
  assert.deepEqual(local.lines[0], {
    _row: 9,
    kind: 'labor',
    category: 'Е0804-003-01 КЛАДКА ПЕРЕГОРОДОК',
    norm_code: 'Е0804-003-01 ДОП. 12',
    section_name: 'Раздел 1. Кладка стен 1-этаж',
    description: 'КЛАДКА ПЕРЕГОРОДОК',
    zone_name: '1-qavat',
    unit_id: 'm2',
    quantity: '200.000000',
    unit_price: '0.00',
    note: '100 М2',
  });
  assert.deepEqual(
    local.lines.map((l) => [l._row, l.kind, l.unit_id, l.norm ?? null, l.zone_name ?? null]),
    [
      [9, 'labor', 'm2', null, '1-qavat'],
      [10, 'labor', 'hour', '62.400000', '1-qavat'],
      [11, 'equipment', 'hour', '0.500000', '1-qavat'],
      [12, 'material', 'kg', '212.500000', '1-qavat'],
      [13, 'material', 't', '0.030000', '1-qavat'],
      [14, 'material', 'm3', '0.040000', '1-qavat'],
      [15, 'material', 'm3', null, '1-qavat'],
      [16, 'material', undefined, null, '1-qavat'],
      [18, 'labor', 'section', null, '2-qavat'],
      [19, 'labor', 'hour', '3.550000', '2-qavat'],
      [20, 'material', 'kg', '1.200000', '2-qavat'],
    ],
  );
  // S2: ish qatorida to'liq norma shifri (qo'shimchasi bilan), qolganlarida resurs kodi; bo'lim — oxirgi «Раздел …»;
  // izohda kod takrorlanmaydi (faqat ko'paytmali yoki platformada yo'q asl birlik)
  const s1 = 'Раздел 1. Кладка стен 1-этаж';
  const s2 = 'Раздел 2. Монтаж 2 этаж';
  assert.deepEqual(
    local.lines.map((l) => [
      l._row,
      l.norm_code ?? null,
      l.resource_code ?? null,
      l.section_name ?? null,
      l.note ?? null,
    ]),
    [
      [9, 'Е0804-003-01 ДОП. 12', null, s1, '100 М2'],
      [10, null, '1', s1, null],
      [11, null, '762', s1, null],
      [12, null, '19412', s1, null],
      [13, null, '923565', s1, null],
      [14, null, '9219', s1, null],
      [15, null, 'pcpc0281970', s1, null],
      [16, null, 'pcpc0315941', s1, null],
      [18, 'Е0501-061-01', null, s2, null],
      [19, null, '1', s2, null],
      [20, null, '35310', s2, null],
    ],
  );
  const total = local.lines.reduce(
    (s, l) => s.add(money(dec(plannedQuantity(l as any)).mul(l.unit_price))),
    dec('0'),
  );
  assert.equal(money(total), '18337980.00');
  assert.deepEqual(local.warnings, {
    unknown_units: [],
    unpriced: 1,
    quantity_mismatch: [{ row: 13, excel: '0.09', platform: '0.060000' }],
    quantity_mismatch_count: 1,
    price_varies: [
      {
        code: '1',
        name: 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ',
        min_price: '3200.00',
        max_price: '30000.00',
      },
    ],
    missing_unit: [16],
    skipped_works: [21],
    project_quantity: [],
    project_quantity_count: 0,
  });
  assert.deepEqual(local.excel, {
    total: '18340000.00',
    rows: [
      {
        row: 22,
        label: 'ВСЕГО ЗАТРАТ:',
        rate: null,
        percent: null,
        amount: '18340000.00',
        addable: false,
        key: 'direct_total',
      },
      {
        row: 23,
        label: 'ПРОЧИЕ ЗАТРАТЫ СУБПОДРЯДЧИКА',
        rate: '0.21',
        percent: '21',
        amount: '3851400.00',
        addable: true,
        key: 'other_costs',
      },
      {
        row: 24,
        label: 'НДС',
        rate: '0.12',
        percent: '12',
        amount: '2663868.00',
        addable: false,
        key: 'vat',
      },
    ],
  });
  const norms = parseForm5(book.getWorksheet('Нормы')!)!;
  assert.deepEqual(
    [
      norms.lines.length,
      norms.lines[0]!.quantity,
      norms.lines[1]!.unit_price,
      norms.warnings.unpriced,
    ],
    [4, '1000.000000', '0.00', 2],
  );
  // D35: «П» — miqdor loyihadan: material qatori 0 miqdor bilan, ishning kategoriyasida; narxsizlar soniga kirmaydi
  assert.deepEqual(norms.lines[3], {
    _row: 11,
    kind: 'material',
    category: 'Е0101-001-01 РАЗРАБОТКА ГРУНТА',
    resource_code: 'П54889',
    description: 'СМЕСЬ БЕТОННАЯ НАЛИВНОГО ТИПА',
    material_name: 'СМЕСЬ БЕТОННАЯ НАЛИВНОГО ТИПА',
    unit_id: 'kg',
    quantity: '0.000000',
    unit_price: '0.00',
    note: 'П — miqdor loyihadan',
  });
  assert.deepEqual(norms.counts, { works: 1, resources: 2, materials: 1, priced: 0 });
  assert.deepEqual(
    [norms.warnings.project_quantity, norms.warnings.project_quantity_count],
    [
      [
        {
          row: 11,
          code: 'П54889',
          name: 'СМЕСЬ БЕТОННАЯ НАЛИВНОГО ТИПА',
          unit: 'кг',
          category: 'Е0101-001-01 РАЗРАБОТКА ГРУНТА',
          zone: null,
        },
      ],
      1,
    ],
  );
  // D35 chekka holatlari: E va F ikkalasi «П», kichik «п», narxli varaqda G bo'sh / 0 / narx bor, F da miqdor bor,
  // hajmi «--» ish ostidagi «П» (resurslari bilan birga o'tkaziladi)
  const edge = new ExcelJS.Workbook();
  const es = edge.addWorksheet('П holatlari');
  es.getRow(5).values = [
    'N п.п.',
    'Шифр номера нормативов и коды ресурсов',
    'Наименование работ и затрат',
    'Единица измерения',
    'Количество',
    'Количество',
    'Стоимость',
    'Стоимость',
  ];
  es.getRow(6).values = [1, 2, 3, 4, 5, 6, 7, 8];
  const edgeRows: [number, unknown[]][] = [
    [7, [null, null, 'Раздел 1. Полы 1-этаж']],
    [8, [1, 'Е1101-065-01', 'НАЛИВНЫЕ ПОЛЫ', '100М2 ПОЛА', 1, 1]],
    [9, ['1.1', 1, 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ.-Ч', 10, 10, 30000]],
    [10, [null, 'П1', 'СМЕСЬ А', 'кг', 'П', 'П']],
    [11, [null, 'П2', 'СМЕСЬ Б', 'кг', 'п', null, 0]],
    [12, [null, 'С3', 'ПЛЕНКА', 'м2', 'П', null, 2500]],
    [13, [null, 'С4', 'ГРУНТОВКА', 'кг', 'П', 12, 4000]],
    [14, [2, 'Е1101-066-01', 'СТЯЖКА', '100М2', '--', '--']],
    [15, ['2.1', 1, 'ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', 'ЧЕЛ.-Ч', 5, null, 30000]],
    [16, [null, 'П5', 'СМЕСЬ В', 'кг', 'П']],
  ];
  for (const [r, values] of edgeRows) es.getRow(r).values = values as ExcelJS.CellValue[];
  const edgeBook = new ExcelJS.Workbook();
  await edgeBook.xlsx.load((await edge.xlsx.writeBuffer()) as any);
  const ep = parseForm5(edgeBook.getWorksheet('П holatlari')!)!;
  assert.deepEqual(ep.errors, []);
  assert.deepEqual(
    ep.lines.map((l) => [
      l._row,
      l.kind,
      l.quantity,
      l.unit_price,
      l.category,
      l.zone_name ?? null,
      l.norm_code ?? l.resource_code,
    ]),
    [
      [8, 'labor', '100.000000', '0.00', 'Е1101-065-01 НАЛИВНЫЕ ПОЛЫ', '1-qavat', 'Е1101-065-01'],
      [9, 'labor', '10.000000', '30000.00', 'Е1101-065-01 НАЛИВНЫЕ ПОЛЫ', '1-qavat', '1'],
      [10, 'material', '0.000000', '0.00', 'Е1101-065-01 НАЛИВНЫЕ ПОЛЫ', '1-qavat', 'П1'],
      [11, 'material', '0.000000', '0.00', 'Е1101-065-01 НАЛИВНЫЕ ПОЛЫ', '1-qavat', 'П2'],
      [12, 'material', '0.000000', '2500.00', 'Е1101-065-01 НАЛИВНЫЕ ПОЛЫ', '1-qavat', 'С3'],
      // F da miqdor bor — oddiy material qatori (bosh pudratchi materiali kabi), miqdor F dan
      [13, 'material', '12.000000', '4000.00', 'Е1101-065-01 НАЛИВНЫЕ ПОЛЫ', '1-qavat', 'С4'],
    ],
  );
  assert.ok(ep.lines.every((l) => l.section_name === 'Раздел 1. Полы 1-этаж'));
  assert.deepEqual(
    [
      ep.warnings.project_quantity.map((p) => [p.row, p.zone]),
      ep.warnings.project_quantity_count,
      ep.warnings.unpriced,
      ep.warnings.skipped_works,
      ep.counts,
    ],
    [
      [
        [10, '1-qavat'],
        [11, '1-qavat'],
        [12, '1-qavat'],
      ],
      3,
      0,
      [14],
      { works: 1, resources: 1, materials: 4, priced: 3 },
    ],
  );
  // natijasiz formula — qator xatosi
  const broken = new ExcelJS.Workbook();
  await broken.xlsx.load((await form5Workbook({ brokenFormula: true }).xlsx.writeBuffer()) as any);
  assert.deepEqual(parseForm5(broken.getWorksheet('Локалка 1')!)!.errors, [
    { row: 10, field: 'norm', message: 'formula' },
  ]);
});
import { similarMaterials } from '../src/inventory.js';
test('similar materials for a new name: exact name or alias first, then shared words; unrelated sizes are not offered (D32)', () => {
  const rows = [
    {
      id: 'a',
      name: 'Сетка сварная из арматурной стали (100*100) ( 1 м2 2,8 кг)',
      unit_id: 'kg',
      aliases: [],
    },
    { id: 'b', name: 'Труба стальная 76х3,5', unit_id: 'm', aliases: [] },
    { id: 'c', name: 'Цемент М400', unit_id: 't', aliases: ['Портландцемент ПЦ-400'] },
  ];
  assert.deepEqual(
    similarMaterials('Сетка сварная из арматурной стали (100*100)', rows).map((m) => [
      m.id,
      m.exact,
    ]),
    [['a', false]],
  );
  assert.deepEqual(
    similarMaterials('портландцемент пц-400', rows).map((m) => [m.id, m.exact]),
    [['c', true]],
  );
  assert.deepEqual(similarMaterials('Труба стальная 57х3,5', rows), []);
  assert.deepEqual(similarMaterials('Цемент М500', rows), []);
  assert.deepEqual(
    similarMaterials('Сетка', rows).map((m) => m.id),
    ['a'],
  );
});
import JSZip from 'jszip';
import { inspectWorkbook } from '../src/estimates.js';
test('workbook with links to other files is read like the unlinked copy; macros stay rejected (D34)', async () => {
  const plain = Buffer.from(await form5Workbook().xlsx.writeBuffer());
  // Excel tuzilishi: externalLink qismi (TargetMode="External"), workbook.xml dagi havola va unga ishora qiluvchi nom
  const zip = await JSZip.loadAsync(plain);
  zip.file(
    'xl/externalLinks/externalLink1.xml',
    '<externalLink xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><externalBook r:id="rId1"><sheetNames><sheetName val="Лист1"/></sheetNames><sheetDataSet><sheetData sheetId="0"/></sheetDataSet></externalBook></externalLink>',
  );
  zip.file(
    'xl/externalLinks/_rels/externalLink1.xml.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLinkPath" Target="file:///C:/Smeta/boshqa.xlsx" TargetMode="External"/></Relationships>',
  );
  const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
  zip.file(
    'xl/_rels/workbook.xml.rels',
    rels.replace(
      '</Relationships>',
      '<Relationship Id="rIdExt1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLink" Target="externalLinks/externalLink1.xml"/></Relationships>',
    ),
  );
  const workbookXml = await zip.file('xl/workbook.xml')!.async('string');
  assert.match(workbookXml, /<\/sheets>/);
  assert.doesNotMatch(workbookXml, /<definedNames/);
  zip.file(
    'xl/workbook.xml',
    workbookXml.replace(
      '</sheets>',
      '</sheets><externalReferences><externalReference r:id="rIdExt1"/></externalReferences><definedNames><definedName name="Narx">[1]Лист1!$A$1</definedName></definedNames>',
    ),
  );
  const types = await zip.file('[Content_Types].xml')!.async('string');
  zip.file(
    '[Content_Types].xml',
    types.replace(
      '</Types>',
      '<Override PartName="/xl/externalLinks/externalLink1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.externalLink+xml"/></Types>',
    ),
  );
  const linked = await zip.generateAsync({ type: 'nodebuffer' });
  const expected = await inspectWorkbook(plain.toString('base64'));
  assert.equal(expected.format, 'form5');
  assert.deepEqual(await inspectWorkbook(linked.toString('base64')), expected);
  zip.file('xl/vbaProject.bin', 'macro');
  await assert.rejects(
    inspectWorkbook((await zip.generateAsync({ type: 'nodebuffer' })).toString('base64')),
    /UNSAFE_WORKBOOK/,
  );
});
test('invite links use the first APP_ORIGIN entry as a full URL', async () => {
  const { publicOrigin } = await import('../src/http.js');
  const saved = process.env.APP_ORIGIN;
  try {
    process.env.APP_ORIGIN = 'https://barpoai.uz,https://www.barpoai.uz,https://barpoai.uz';
    assert.equal(publicOrigin(), 'https://barpoai.uz');
    process.env.APP_ORIGIN = ' https://app.example.uz/ ';
    assert.equal(publicOrigin(), 'https://app.example.uz');
    process.env.APP_ORIGIN = 'APP_ORIGIN=https://barpoai.uz,https://www.barpoai.uz';
    assert.equal(publicOrigin(), 'https://barpoai.uz');
    process.env.APP_ORIGIN = '"https://barpoai.uz"';
    assert.equal(publicOrigin(), 'https://barpoai.uz');
  } finally {
    if (saved === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = saved;
  }
});
