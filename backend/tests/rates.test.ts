import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCbuRate } from '../src/rates.js';
import { setActiveCurrency, toDisplay } from '../../frontend/src/lib/currency-math.ts';

test('CBU response: USD rate and dd.mm.yyyy date are parsed as decimal text', () => {
  assert.deepEqual(
    parseCbuRate([
      { Ccy: 'EUR', Rate: '14000.10', Date: '10.10.2026' },
      { Ccy: 'USD', Rate: '12850.27', Date: '10.10.2026' },
    ]),
    { currency: 'USD', rate: '12850.27', rate_date: '2026-10-10' },
  );
});
test('CBU response: zero, negative, non-numeric, missing or malformed data is rejected', () => {
  for (const body of [
    [{ Ccy: 'USD', Rate: '0', Date: '10.10.2026' }],
    [{ Ccy: 'USD', Rate: '0.00', Date: '10.10.2026' }],
    [{ Ccy: 'USD', Rate: '-1', Date: '10.10.2026' }],
    [{ Ccy: 'USD', Rate: '12 850,27', Date: '10.10.2026' }],
    [{ Ccy: 'USD', Rate: 12850.27, Date: '10.10.2026' }],
    [{ Ccy: 'USD', Rate: '12850.27', Date: '2026-10-10' }],
    [{ Ccy: 'EUR', Rate: '14000', Date: '10.10.2026' }],
    { Ccy: 'USD', Rate: '12850.27', Date: '10.10.2026' },
    [],
    null,
  ])
    assert.equal(parseCbuRate(body), null, JSON.stringify(body));
});
test('display conversion: UZS ÷ rate, 2 decimals, half-up, no binary floats', () => {
  setActiveCurrency('USD', '12800');
  assert.deepEqual(toDisplay('268125000.00'), { amount: '20947.27', currency: 'USD' });
  // pin='USD': server bergan USD qiymat konvertatsiyasiz (narx varaqasi)
  assert.deepEqual(toDisplay('322', 'USD'), { amount: '322.00', currency: 'USD' });
  assert.deepEqual(toDisplay('64'), { amount: '0.01', currency: 'USD' }); // 0.005 → 0.01
  assert.deepEqual(toDisplay('63.99'), { amount: '0.00', currency: 'USD' });
  assert.deepEqual(toDisplay('99999999999999999.99'), {
    amount: '7812500000000.00',
    currency: 'USD',
  });
  assert.deepEqual(toDisplay('1500.50', 'UZS'), { amount: '1500.5', currency: 'UZS' });
  assert.equal(toDisplay('abc'), null);
  // Kurs yo'q — tanlov USD bo'lsa ham UZS
  setActiveCurrency('USD', null);
  assert.deepEqual(toDisplay('1000'), { amount: '1000', currency: 'UZS' });
  setActiveCurrency('UZS', '12800');
  assert.deepEqual(toDisplay('1000'), { amount: '1000', currency: 'UZS' });
});
