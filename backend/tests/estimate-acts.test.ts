import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAct, type ActLineInput, type Triple } from '../src/estimate-acts.js';

const line = (over: Partial<ActLineInput> & Pick<ActLineInput, 'id' | 'kind'>): ActLineInput => ({
  lineage_id: `lin-${over.id}`,
  description: over.id,
  unit_id: 'pcs',
  norm: null,
  effective_quantity: '0',
  unit_price: '0',
  supplied_by: 'contractor',
  category: null,
  zone_id: null,
  section_name: null,
  norm_code: null,
  resource_code: null,
  position: 0,
  is_percent: false,
  material_id: null,
  ...over,
});
const t = (start: string, year: string, period: string): Triple => ({ start, year, period });

test('act: Form 5 resources follow the work share, normless materials come from consumption (S4, D40)', () => {
  const lines = [
    // Form 5 ish pozitsiyasi (narxsiz) va uning resurslari; «100 М2» birligi — hisobiy miqdor ulushi bilan
    line({ id: 'W', kind: 'labor', unit_id: 'm2', effective_quantity: '200', category: 'C1' }),
    line({
      id: 'R1',
      kind: 'labor',
      unit_id: 'hour',
      norm: '62.4',
      effective_quantity: '124.8',
      unit_price: '30000',
      category: 'C1',
    }),
    line({
      id: 'R2',
      kind: 'material',
      unit_id: 'kg',
      norm: '212.5',
      effective_quantity: '425',
      unit_price: '1500',
      category: 'C1',
    }),
    // bosh pudratchi (buyurtmachi) materiali — normasiz: ombor sarfi
    line({
      id: 'M1',
      kind: 'material',
      unit_id: 'm3',
      effective_quantity: '20',
      unit_price: '650000',
      supplied_by: 'customer',
      category: 'C1',
    }),
    // oddiy qator: o'z qabul qilingan hajmi
    line({
      id: 'E',
      kind: 'equipment',
      unit_id: 'hour',
      effective_quantity: '10',
      unit_price: '200000',
    }),
    // ish pozitsiyasi hajmi rejasi 0 bo'lgan guruh — resurs 0
    line({ id: 'W0', kind: 'labor', unit_id: 'm2', effective_quantity: '0', category: 'C2' }),
    line({
      id: 'R0',
      kind: 'labor',
      unit_id: 'hour',
      norm: '1',
      effective_quantity: '0',
      unit_price: '100',
      category: 'C2',
    }),
    // D39: eski foizli xizmat qatori dalolatnomaga kirmaydi
    line({
      id: 'P',
      kind: 'service',
      unit_id: 'set',
      effective_quantity: '1',
      unit_price: '420000',
      is_percent: true,
    }),
  ];
  const progress = new Map([
    ['lin-W', t('100', '100', '50')],
    ['lin-E', t('4', '4', '1')],
    ['lin-W0', t('5', '5', '5')],
  ]);
  const consumption = new Map([['lin-M1', t('12', '12', '5')]]);
  const act = computeAct(lines, progress, consumption);
  assert.deepEqual(
    act.lines.map((l) => [
      l.id,
      l.basis,
      l.quantity.start,
      l.quantity.period,
      l.amount.start,
      l.amount.period,
    ]),
    [
      ['W', 'work', '100.000000', '50.000000', '0.00', '0.00'],
      ['R1', 'norm', '62.400000', '31.200000', '1872000.00', '936000.00'],
      ['R2', 'norm', '212.500000', '106.250000', '318750.00', '159375.00'],
      ['M1', 'consumption', '12.000000', '5.000000', '7800000.00', '3250000.00'],
      ['E', 'progress', '4.000000', '1.000000', '800000.00', '200000.00'],
      ['W0', 'work', '5.000000', '5.000000', '0.00', '0.00'],
      ['R0', 'norm', '0.000000', '0.000000', '0.00', '0.00'],
    ],
  );
  // F-2 «Норма на ед.» — ishning saqlangan birligiga: 124,8 / 200 m2 = 0,624 (davr: 0,624 × 50 = 31,2)
  assert.deepEqual(
    act.lines.map((l) => l.unit_norm),
    [null, '0.624000', '2.125000', null, null, null, null],
  );
  assert.deepEqual(act.ignored, []);
  assert.deepEqual(act.costs.period, {
    labor: '936000.00',
    equipment: '200000.00',
    contractor_materials: '159375.00',
    customer_materials: '3250000.00',
    services: '0.00',
  });
  assert.deepEqual(act.costs.start, {
    labor: '1872000.00',
    equipment: '800000.00',
    contractor_materials: '318750.00',
    customer_materials: '7800000.00',
    services: '0.00',
  });
});

test('act: a priced labor line with norm but no Form 5 work position uses its own accepted volume', () => {
  const act = computeAct(
    [
      line({
        id: 'L',
        kind: 'labor',
        unit_id: 'm2',
        norm: '1',
        effective_quantity: '10',
        unit_price: '7',
        category: 'K',
      }),
      line({ id: 'S', kind: 'service', effective_quantity: '1', unit_price: '9.99' }),
    ],
    new Map([
      ['lin-L', t('3.333333', '3.333333', '0')],
      ['lin-S', t('1', '0', '0')],
    ]),
    new Map(),
  );
  assert.deepEqual(
    act.lines.map((l) => [l.basis, l.amount.start, l.amount.year]),
    [
      ['progress', '23.33', '23.33'],
      ['progress', '9.99', '0.00'],
    ],
  );
});

test('act: accepted volume written on a Form 5 resource or a D29 percent line is reported, not counted', () => {
  const act = computeAct(
    [
      line({ id: 'W', kind: 'labor', unit_id: 'm2', effective_quantity: '10', category: 'C' }),
      line({
        id: 'R',
        kind: 'labor',
        unit_id: 'hour',
        norm: '1',
        effective_quantity: '10',
        unit_price: '5',
        category: 'C',
      }),
      line({
        id: 'P',
        kind: 'service',
        unit_id: 'set',
        effective_quantity: '1',
        unit_price: '100',
        is_percent: true,
      }),
    ],
    new Map([
      ['lin-W', t('2', '2', '1')],
      ['lin-R', t('7', '7', '7')],
      ['lin-P', t('1', '1', '0')],
    ]),
    new Map(),
  );
  assert.deepEqual(
    [
      act.lines.map((l) => [l.id, l.quantity.period]),
      act.ignored.map((i) => [i.description, i.quantity.start]),
    ],
    [
      [
        ['W', '1.000000'],
        ['R', '1.000000'],
      ],
      [
        ['R', '7'],
        ['P', '1'],
      ],
    ],
  );
});
