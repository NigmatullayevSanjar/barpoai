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
