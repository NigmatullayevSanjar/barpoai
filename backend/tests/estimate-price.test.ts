import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertPriceSettings,
  defaultSettings,
  directCostsOf,
  percentOfLine,
  priceChain,
  suggestFromExcel,
  type PriceSettings,
} from '../src/estimate-price.js';
import { excelKey } from '../src/form5.js';

/** docs/SMETA_TUZATISH_PROMPTLARI.md 2-bo'lim: nazorat misoli (to'g'ridan-to'g'ri 2 000 000,00). */
const control = {
  labor: '1000000.00',
  equipment: '200000.00',
  contractor_materials: '500000.00',
  customer_materials: '300000.00',
  services: '0.00',
};
const free: PriceSettings = { ...defaultSettings, other_costs_percent: '21', vat_percent: '12' };
const vmq: PriceSettings = {
  ...defaultSettings,
  markup_mode: 'vmq583',
  other_costs_percent: '20',
  profit_percent: '7',
  production_costs_percent: '2.5',
  vat_percent: '12',
};
const amounts = (r: ReturnType<typeof priceChain>) =>
  Object.fromEntries(r.lines.map((l) => [l.key, l.amount]));

test('price chain: control example, «Erkin» 21 % and VAT 12 % (S3)', () => {
  const r = priceChain(control, free);
  assert.deepEqual(amounts(r), {
    labor: '1000000.00',
    equipment: '200000.00',
    contractor_materials: '500000.00',
    customer_materials: '300000.00',
    services: '0.00',
    direct_total: '2000000.00',
    other_costs: '420000.00',
    production_costs: '0.00',
    total: '2420000.00',
    customer_deduction: '-300000.00',
    total_without_vat: '2120000.00',
    vat: '254400.00',
    total_with_vat: '2374400.00',
  });
  assert.equal(r.total, '2374400.00');
  assert.deepEqual(
    r.lines.filter((l) => l.percent !== undefined).map((l) => [l.key, l.percent]),
    [
      ['other_costs', '21'],
      ['production_costs', '0'],
      ['vat', '12'],
    ],
  );
});

test('price chain: control example, VMQ 583 (20 % + 7 %, 2.5 %, VAT 12 %) (S3)', () => {
  const r = priceChain(control, vmq);
  const a = amounts(r);
  assert.deepEqual(
    [a.other_costs, a.production_costs, a.total, a.total_without_vat, a.vat, a.total_with_vat],
    ['540000.00', '50000.00', '2590000.00', '2290000.00', '274800.00', '2564800.00'],
  );
  assert.equal(r.lines.find((l) => l.key === 'other_costs')!.percent, '27');
});

test('price chain: no VAT, no deduction, half-up rounding of every line from rounded values', () => {
  const noVat = priceChain(control, { ...free, vat_percent: null });
  assert.deepEqual(
    [noVat.lines.map((l) => l.key).slice(-2), noVat.total],
    [['customer_deduction', 'total_without_vat'], '2120000.00'],
  );
  const keep = priceChain(control, { ...free, deduct_customer_materials: false });
  assert.deepEqual(
    [amounts(keep).customer_deduction, amounts(keep).total_without_vat, keep.total],
    ['0.00', '2420000.00', '2710400.00'],
  );
  // 0,05 × 21 % = 0,0105 → 0,01; 0,05 + 0,01 = 0,06; QQS 0,06 × 12 % = 0,0072 → 0,01
  const tiny = priceChain(
    {
      ...control,
      labor: '0.05',
      equipment: '0',
      contractor_materials: '0',
      customer_materials: '0',
    },
    free,
  );
  assert.deepEqual(
    [amounts(tiny).other_costs, amounts(tiny).total_without_vat, amounts(tiny).vat, tiny.total],
    ['0.01', '0.06', '0.01', '0.07'],
  );
  // har qator yaxlitlangan qiymatdan: 0,04 × 10 % = 0,004 → 0,00 (ikki marta); yaxlitlamasdan 0,048 → 0,05 bo'lardi
  const stepwise = priceChain(
    {
      ...control,
      labor: '0.04',
      equipment: '0',
      contractor_materials: '0',
      customer_materials: '0',
    },
    { ...defaultSettings, other_costs_percent: '10', production_costs_percent: '10' },
  );
  assert.deepEqual(
    [amounts(stepwise).other_costs, amounts(stepwise).production_costs, stepwise.total],
    ['0.00', '0.00', '0.04'],
  );
  // 0,125 so'm half-up: 1,25 × 10 % = 0,125 → 0,13
  assert.equal(
    amounts(
      priceChain(
        {
          ...control,
          labor: '1.25',
          equipment: '0',
          contractor_materials: '0',
          customer_materials: '0',
        },
        { ...defaultSettings, other_costs_percent: '10' },
      ),
    ).other_costs,
    '0.13',
  );
});

test('VMQ 583 preset: profit 7 %, production 2.5 % or 5 %; other costs editable', () => {
  assertPriceSettings(vmq);
  assertPriceSettings({ ...vmq, production_costs_percent: '5', other_costs_percent: '10' });
  assertPriceSettings({ ...free, profit_percent: '3' });
  assert.throws(() => assertPriceSettings({ ...vmq, profit_percent: '5' }), /VMQ583_PRESET/);
  assert.throws(
    () => assertPriceSettings({ ...vmq, production_costs_percent: '3' }),
    /VMQ583_PRESET/,
  );
});

test('direct costs of unsaved lines: customer materials apart, line total = quantity × price rounded', () => {
  assert.deepEqual(
    directCostsOf([
      { kind: 'labor', quantity: '0', norm: '0.5', work_quantity: '3', unit_price: '0.33' },
      { kind: 'material', quantity: '2', unit_price: '10', supplied_by: 'customer' },
      { kind: 'material', quantity: '1', unit_price: '5' },
      { kind: 'equipment', quantity: '1', unit_price: '7' },
      { kind: 'service', quantity: '1', unit_price: '9' },
    ]),
    {
      labor: '0.50',
      equipment: '7.00',
      contractor_materials: '5.00',
      customer_materials: '20.00',
      services: '9.00',
    },
  );
});

test('Form 5 totals block: labels map to chain keys, settings and supplier are suggested', () => {
  const labels: [string, string | null][] = [
    ['ВСЕГО ЗАТРАТ:', 'direct_total'],
    ['ЗАРПЛАТА (в т.ч. соцстрах)', 'labor'],
    ['ЭКСПЛУАТАЦИЯ МАШИН', 'equipment'],
    ['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ ГЕНПОДРЯДЧИКА', 'customer_materials'],
    ['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ СУБПОДРЯДЧИКА', 'contractor_materials'],
    ['ИТОГО ПРЯМЫХ ЗАТРАТ', 'direct_total'],
    ['ПРОЧИЕ ЗАТРАТЫ СУБПОДРЯДЧИКА', 'other_costs'],
    ['ИТОГО', 'total'],
    ['ВОЗВРАТ МАТЕРИАЛЫ ГЕНПОДРЯДЧИКА', 'customer_deduction'],
    ['ИТОГО С УЧЕТОМ ПРОЧИХ ЗАТРАТ', 'total_without_vat'],
    ['НДС', 'vat'],
    ['ИТОГО С НДС', 'total_with_vat'],
    ['Подпись', null],
    // egasining haqiqiy faylidagi yozilishlar: harf tushgan, so'z ichida probel, lotin C
    ['СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ ГЕНПОДРДЧИКА', 'customer_materials'],
    ['ИТОГО С У ЧЕТОМ ПРОЧИХ ЗАТРАТ', 'total_without_vat'],
    ['ИТОГО C НДС', 'total_with_vat'],
    ['ЗАТРАТЫ ТРУДА РАБОЧИХ', 'labor'],
    ['QQS', 'vat'],
  ];
  assert.deepEqual(
    labels.map(([l]) => [l, excelKey(l)]),
    labels,
  );
  const rows = [
    { key: 'other_costs', percent: '21', addable: true, amount: '72748327.00' },
    { key: 'customer_deduction', percent: null, addable: false, amount: '140890681.77' },
    { key: 'vat', percent: '12', addable: false, amount: '33393390.00' },
  ];
  assert.deepEqual(suggestFromExcel(rows), {
    settings: { ...defaultSettings, other_costs_percent: '21', vat_percent: '12' },
    gc_supplied_by: 'customer',
  });
  assert.deepEqual(suggestFromExcel([]), {
    settings: defaultSettings,
    gc_supplied_by: 'contractor',
  });
  // summasi 0 bo'lgan bosh pudratchi materiallari qatori — buyurtmachi taklif qilinmaydi; foiz 4 kasrgacha
  assert.deepEqual(
    suggestFromExcel([
      { key: 'customer_materials', percent: null, addable: false, amount: '0.00' },
      { key: 'other_costs', percent: '12.3456789', addable: true, amount: '1.00' },
    ]),
    {
      settings: { ...defaultSettings, other_costs_percent: '12.3457' },
      gc_supplied_by: 'contractor',
    },
  );
  assert.equal(percentOfLine('ПРОЧИЕ ЗАТРАТЫ СУБПОДРЯДЧИКА (21 %)'), '21');
  assert.equal(percentOfLine('Tashish'), null);
});
