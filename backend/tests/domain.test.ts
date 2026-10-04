import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dec, money, plannedQuantity, variance } from '../src/money.js';
import { hashPassword, verifyPassword, verifyTelegram } from '../src/security.js';
import { amount, stockInput } from '../src/schemas.js';
import { roles } from '../src/permissions.js';
import ExcelJS from 'exceljs';
import { parseWorkbook } from '../src/estimates.js';
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
test('ten roles; passwords hashed with random salts', async () => {
  assert.equal(new Set(roles).size, 10);
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
