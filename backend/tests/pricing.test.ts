import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Decimal } from 'decimal.js';
import { buildPriceList, roundStep, type PricingInput } from '../src/pricing.js';

const A = 'a0000000-0000-4000-8000-000000000001';
const B = 'b0000000-0000-4000-8000-000000000002';
const E = 'e0000000-0000-4000-8000-000000000003';
const premise = (
  id: string,
  zone_id: string | null,
  area_m2: string,
  over: Partial<PricingInput['premises'][number]> = {},
) => ({ id, zone_id, number: id.slice(-2), kind: 'apartment', rooms: null, floor: null, area_m2, ...over });
const base = (over: Partial<PricingInput> = {}): PricingInput => ({
  zones: [
    { id: A, parent_id: null, kind: 'block', name: 'Blok A' },
    { id: B, parent_id: null, kind: 'block', name: 'Blok B' },
  ],
  premises: [],
  plan: [],
  fact: [],
  markup_percent: '25',
  round_uzs: '1000',
  round_usd: '1',
  usd_rate: '12800',
  ...over,
});
/** Rejaning 4.4 nazorat misoli: Blok A 3 000 m², Blok B 7 000 m², umumiy 10 000 m². */
const control = () =>
  base({
    zones: [
      { id: A, parent_id: null, kind: 'block', name: 'Blok A' },
      { id: E, parent_id: A, kind: 'entrance', name: '1-kirish' },
      { id: B, parent_id: null, kind: 'block', name: 'Blok B' },
    ],
    premises: [
      premise('p-65', E, '65', { number: '65', floor: 3, rooms: 2 }),
      premise('p-a2', A, '2935', { number: 'T-1', kind: 'commercial' }),
      premise('p-b1', B, '7000', { number: '1' }),
    ],
    plan: [
      { zone_id: A, amount: '8000000000.00' },
      { zone_id: B, amount: '14000000000.00' },
      { zone_id: null, amount: '3000000000.00' },
    ],
    fact: [
      { zone_id: A, amount: '9000000000.00' },
      { zone_id: B, amount: '5000000000.00' },
      { zone_id: null, amount: '1000000000.00' },
    ],
  });

test('4.4 control example: forecast per group, 65 m² premise in block A, USD at 12 800', () => {
  const r = buildPriceList(control());
  assert.deepEqual(
    r.groups.map((g) => [g.zone_name, g.area_m2, g.plan_value, g.fact_value, g.forecast_value, g.forecast_m2]),
    [
      ['Blok A', '3000.00', '8000000000.00', '9000000000.00', '9000000000.00', '3000000.00'],
      ['Blok B', '7000.00', '14000000000.00', '5000000000.00', '14000000000.00', '2000000.00'],
      [null, '10000.00', '3000000000.00', '1000000000.00', '3000000000.00', '300000.00'],
    ],
  );
  const line = r.lines.find((l) => l.premise_id === 'p-65')!;
  assert.deepEqual(
    [line.cost, line.cost_m2, line.sale_m2, line.price, line.sale_m2_usd, line.price_usd],
    ['214500000.00', '3300000.00', '4125000.00', '268125000.00', '322.00', '20930.00'],
  );
  assert.deepEqual([line.block_name, line.entrance_name, line.zone_name], ['Blok A', '1-kirish', '1-kirish']);
  assert.deepEqual(
    [r.premises_count, r.area_total, r.plan_total, r.fact_total, r.forecast_total],
    [3, '10000.00', '25000000000.00', '15000000000.00', '26000000000.00'],
  );
  const sum = r.lines.reduce((s, l) => s.add(l.cost), new Decimal(0));
  assert.equal(sum.toFixed(2), r.forecast_total);
  // Blok B xonadoni: 14e9/7000 + 300 000 = 2 300 000 so'm/m²
  const b = r.lines.find((l) => l.premise_id === 'p-b1')!;
  assert.deepEqual([b.cost, b.sale_m2, b.price], ['16100000000.00', '2875000.00', '20125000000.00']);
});

test('allocation remainder goes to the last premise and the invariant holds to the tiyin', () => {
  const r = buildPriceList(
    base({
      zones: [],
      premises: [premise('p-1', null, '33.33'), premise('p-2', null, '33.33'), premise('p-3', null, '33.33')],
      plan: [{ zone_id: null, amount: '100.00' }],
      usd_rate: null,
    }),
  );
  assert.deepEqual(
    r.lines.map((l) => l.cost),
    ['33.33', '33.33', '33.34'],
  );
  assert.equal(r.forecast_total, '100.00');
  assert.deepEqual([r.lines[0]!.sale_m2_usd, r.lines[0]!.price_usd], [null, null]);
});

test('nested zones: a premise takes shares from its own zone and every ancestor; premise-less zones fall into the common group', () => {
  const Z = 'c0000000-0000-4000-8000-000000000009';
  const r = buildPriceList(
    base({
      zones: [
        { id: A, parent_id: null, kind: 'block', name: 'Blok A' },
        { id: E, parent_id: A, kind: 'entrance', name: '1-kirish' },
        { id: Z, parent_id: null, kind: 'other', name: 'Hovli' },
      ],
      premises: [premise('p-e', E, '50'), premise('p-a', A, '50')],
      plan: [
        { zone_id: A, amount: '1000.00' },
        { zone_id: E, amount: '300.00' },
        { zone_id: Z, amount: '400.00' },
      ],
      fact: [{ zone_id: null, amount: '-100.00' }],
      markup_percent: '0',
      round_uzs: '0.01',
      usd_rate: null,
    }),
  );
  // E: 300 faqat p-e ga; A: 1000 ikkiga teng; Hovli (xonadonsiz, ota zonasi yo'q) 400 umumiyga; umumiy fakt manfiy → prognoz 400
  assert.deepEqual(
    r.lines.map((l) => [l.premise_id, l.cost]),
    [
      ['p-a', '700.00'],
      ['p-e', '1000.00'],
    ],
  );
  assert.deepEqual(
    r.groups.map((g) => [g.zone_name, g.plan_value, g.fact_value, g.forecast_value]),
    [
      ['1-kirish', '300.00', '0.00', '300.00'],
      ['Blok A', '1000.00', '0.00', '1000.00'],
      [null, '400.00', '-100.00', '400.00'],
    ],
  );
  assert.equal(r.forecast_total, '1700.00');
});

test('premise-less zones charge the nearest ancestor with premises (all its premises); root chains and unknown zones go to the common group', () => {
  const E2 = 'e2000000-0000-4000-8000-000000000012';
  const F2 = 'f2000000-0000-4000-8000-000000000013';
  const H = 'h0000000-0000-4000-8000-000000000014';
  const H1 = 'h1000000-0000-4000-8000-000000000015';
  const X = 'x0000000-0000-4000-8000-000000000099';
  const r = buildPriceList(
    base({
      zones: [
        { id: A, parent_id: null, kind: 'block', name: 'Blok A' },
        { id: E, parent_id: A, kind: 'entrance', name: 'Kirish 1' },
        { id: E2, parent_id: A, kind: 'entrance', name: 'Kirish 2' },
        { id: F2, parent_id: E2, kind: 'floor', name: '2-qavat' },
        { id: H, parent_id: null, kind: 'other', name: 'Hovli' },
        { id: H1, parent_id: H, kind: 'other', name: 'Hovli yo‘lagi' },
        { id: B, parent_id: null, kind: 'block', name: 'Blok B' },
      ],
      premises: [premise('p-a', A, '30'), premise('p-e1', E, '70'), premise('p-b', B, '50')],
      plan: [
        { zone_id: F2, amount: '100.00' },
        { zone_id: E2, amount: '50.00' },
        { zone_id: E, amount: '7.00' },
        { zone_id: H1, amount: '30.00' },
        { zone_id: X, amount: '20.00' },
        { zone_id: B, amount: '200.00' },
      ],
      fact: [{ zone_id: E2, amount: '200.00' }],
      markup_percent: '0',
      round_uzs: '0.01',
      usd_rate: null,
    }),
  );
  // Kirish 2 va 2-qavat (xonadonsiz zanjir) → Blok A: reja 150, fakt 200, prognoz 200, blokning hamma xonadonlariga (30/70);
  // Kirish 1 o'z guruhi; Hovli yo'lagi (xonadonli ota yo'q) va noma'lum zona → umumiy 50; Blok B ga hech narsa qo'shilmaydi
  assert.deepEqual(
    r.groups.map((g) => [g.zone_name, g.plan_value, g.fact_value, g.forecast_value]),
    [
      ['Blok A', '150.00', '200.00', '200.00'],
      ['Blok B', '200.00', '0.00', '200.00'],
      ['Kirish 1', '7.00', '0.00', '7.00'],
      [null, '50.00', '0.00', '50.00'],
    ],
  );
  // p-a: 60 (A) + 10 (umumiy 50 × 30/150); p-e1: 140 + 7 + 23.33; p-b: 200 + qoldiq 16.67
  assert.deepEqual(
    r.lines.map((l) => [l.premise_id, l.cost]),
    [
      ['p-a', '70.00'],
      ['p-e1', '170.33'],
      ['p-b', '216.67'],
    ],
  );
  assert.equal(r.forecast_total, '457.00');
});

test('rounding step: half up at 1 000 UZS and 1 USD; cost per m² kept unrounded before the markup', () => {
  assert.equal(roundStep(new Decimal('4124500'), '1000').toFixed(), '4125000');
  assert.equal(roundStep(new Decimal('4124499.99'), '1000').toFixed(), '4124000');
  assert.equal(roundStep(new Decimal('322.5'), '1').toFixed(), '323');
  const r = buildPriceList(
    base({
      zones: [],
      premises: [premise('p-1', null, '3')],
      plan: [{ zone_id: null, amount: '10.00' }],
      markup_percent: '0',
      round_uzs: '0.01',
      round_usd: '0.01',
      usd_rate: '3',
    }),
  );
  // 10/3 = 3.333… → m² narxi 3.33, xonadon narxi 3 × 3.33 = 9.99 (jami = maydon × m² narxi)
  assert.deepEqual([r.lines[0]!.cost_m2, r.lines[0]!.sale_m2, r.lines[0]!.price], ['3.33', '3.33', '9.99']);
  assert.deepEqual([r.lines[0]!.sale_m2_usd, r.lines[0]!.price_usd], ['1.11', '3.33']);
});

test('database list order (rank) wins over the JS comparator when provided', () => {
  const r = buildPriceList(
    base({
      zones: [],
      premises: [premise('p-1', null, '10', { rank: 1 }), premise('p-2', null, '10', { rank: 0 })],
      plan: [{ zone_id: null, amount: '0.03' }],
      usd_rate: null,
    }),
  );
  assert.deepEqual(
    r.lines.map((l) => [l.premise_id, l.position, l.cost]),
    [
      ['p-2', 0, '0.01'],
      ['p-1', 1, '0.02'],
    ],
  );
});

test('no premises and no costs are rejected with domain codes', () => {
  assert.throws(() => buildPriceList(base({ plan: [{ zone_id: null, amount: '1.00' }] })), /PRICE_LIST_NO_PREMISES/);
  assert.throws(
    () => buildPriceList(base({ premises: [premise('p-1', A, '10')], fact: [{ zone_id: null, amount: '-5.00' }] })),
    /PRICE_LIST_NO_COSTS/,
  );
});
