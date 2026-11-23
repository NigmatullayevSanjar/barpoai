/**
 * QA smoke: ishlab turgan lokal stack (API + baza) ustida to'liq biznes oqimi — HTTP orqali, haqiqiy rollar bilan.
 * `QA-<vaqt>` kompaniyasi yaratiladi, oqim o'tadi, muvaffaqiyatda kompaniya barcha ma'lumotlari bilan o'chiriladi.
 *
 *   API_URL=http://127.0.0.1:3001 QA_OWNER_LOGIN=... QA_OWNER_PASSWORD=... npm run qa:smoke
 *
 * Muhit: QA_OWNER_LOGIN/QA_OWNER_PASSWORD — platforma egasi yoki super admin (Telegram 2FA ulanmagan bo'lsin);
 * MIGRATION_DATABASE_URL (yoki backend/.env) — yakuniy tozalash uchun; QA_KEEP=1 — ma'lumotni o'chirmaslik.
 * Xatoda ma'lumot saqlanadi (sababni ko'rish uchun) va tozalash buyrug'i ko'rsatiladi. Faqat lokal muhit uchun.
 */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createPool, transaction } from '../src/db.js';
import { cleanupTenant, loadEnv } from './qa-cleanup.js';

loadEnv();
const API = (process.env.API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
const ORIGIN = process.env.APP_ORIGIN ?? 'http://localhost:5173';
const OWNER_LOGIN = process.env.QA_OWNER_LOGIN ?? '';
const OWNER_PASSWORD = process.env.QA_OWNER_PASSWORD ?? '';
const STAMP = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
const KEY = `QA-${STAMP}`;
const PASS = process.env.QA_PASSWORD ?? `Qa-${randomBytes(6).toString('hex')}`;
const KEEP = process.env.QA_KEEP === '1';
const today = new Date().toISOString().slice(0, 10);
const monthStart = `${today.slice(0, 7)}-01`;
const passed: string[] = [];
assert(
  OWNER_LOGIN && OWNER_PASSWORD,
  'QA_OWNER_LOGIN va QA_OWNER_PASSWORD kerak (platforma egasi yoki super admin)',
);

async function call(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
  expected = 200,
): Promise<any> {
  const res = await fetch(API + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      origin: ORIGIN,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(method !== 'GET' ? { 'idempotency-key': randomUUID() } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  assert.equal(res.status, expected, `${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}
/** Login — daqiqasiga cheklangan (AUTH_RATE_LIMIT); 429 bo'lsa kutib qayta uriniladi, chegara yumshatilmaydi. */
/** D43: sinov kompaniyasining domeni — kompaniya yaratilgach qo'yiladi; platforma xodimi domensiz kiradi. */
let DOMAIN = '';
async function login(user: string, password: string, domain = DOMAIN): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}/v1/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: ORIGIN,
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({ login: user, password, ...(domain ? { domain } : {}) }),
    });
    if (res.status === 429 && attempt < 12) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    const text = await res.text();
    assert.equal(
      res.status,
      200,
      `POST /v1/auth/login (${user}) → ${res.status}: ${text.slice(0, 300)}`,
    );
    return JSON.parse(text).access_token as string;
  }
}
/** Xodim birinchi kirishda parolni almashtiradi (sessiyalar bekor bo'ladi), keyin yangi parol bilan kiradi. */
async function employee(admin: string, role: string, name: string) {
  const user = await call(
    'POST',
    '/v1/employees',
    { login: `qa.${role}.${STAMP.toLowerCase()}`, password: PASS, display_name: name, role },
    admin,
  );
  const first = await login(user.login, PASS);
  await call(
    'POST',
    '/v1/auth/password',
    { current_password: PASS, new_password: `${PASS}2` },
    first,
  );
  return { ...user, token: await login(user.login, `${PASS}2`) };
}
const num = (s: string) => s;

console.log(`QA smoke → ${API}, kompaniya ${KEY}`);
try {
  // 0. Sog'liq
  assert.equal((await (await fetch(`${API}/health/ready`)).json()).status, 'ok');
  passed.push('API tayyor (/health/ready)');

  // 1. Platforma: kompaniya, taklif, admin ro'yxatdan o'tishi
  const owner = await login(OWNER_LOGIN, OWNER_PASSWORD, '');
  const tenant = await call(
    'POST',
    '/v1/platform/tenants',
    { legal_name: `QA Sinov MCHJ ${STAMP}`, registration_key: KEY },
    owner,
  );
  DOMAIN = tenant.domain;
  const invite = await call('POST', `/v1/platform/tenants/${tenant.id}/invites`, undefined, owner);
  await call('POST', '/v1/auth/invites/preview', { token: invite.token });
  const adminLogin = `qa.admin.${STAMP.toLowerCase()}`;
  await call('POST', '/v1/auth/register', {
    token: invite.token,
    login: adminLogin,
    password: PASS,
    display_name: 'QA Admin',
  });
  await call(
    'POST',
    '/v1/auth/register',
    { token: invite.token, login: `${adminLogin}x`, password: PASS, display_name: 'QA Admin 2' },
    undefined,
    410,
  );
  const admin = await login(adminLogin, PASS);
  passed.push(
    'Kompaniya yaratildi, bir martalik taklif bilan admin ro‘yxatdan o‘tdi, link ikkinchi marta ishlamaydi',
  );

  // 2. Xodimlar (har rol), birinchi kirishda parol almashtirish
  const foreman = await employee(admin, 'foreman', 'QA Prorab');
  const warehouse = await employee(admin, 'warehouse_manager', 'QA Omborchi');
  const financier = await employee(admin, 'financier', 'QA Finansist');
  const accountant = await employee(admin, 'accountant', 'QA Buxgalter');
  const manager = await employee(admin, 'manager', 'QA Bosh muhandis');
  await call('GET', '/v1/auth/me', undefined, foreman.token);
  passed.push(
    '5 rol xodimi yaratildi; birinchi kirishda parol almashtirildi (eski sessiyalar bekor), yangi sessiya ishlaydi',
  );

  // 3. Obyekt, zonalar, biriktirish, standart ombor
  const project = await call('POST', '/v1/projects', { name: `QA obyekt ${STAMP}` }, admin);
  const block = await call(
    'POST',
    `/v1/projects/${project.id}/zones`,
    { name: 'A blok', kind: 'block', floors_count: 3 },
    admin,
  );
  const floor = await call(
    'POST',
    `/v1/projects/${project.id}/zones`,
    { name: '1-qavat', kind: 'floor', parent_id: block.id },
    admin,
  );
  const warehouses = (
    await call('GET', `/v1/warehouses?project_id=${project.id}`, undefined, admin)
  ).items;
  assert.equal(warehouses.length, 1, 'obyekt bilan "Asosiy ombor" yaratiladi');
  const whAccount = warehouses[0].account_id as string;
  for (const u of [foreman, financier, accountant, manager])
    await call('POST', `/v1/employees/${u.id}/assignments`, { project_id: project.id }, admin);
  await call(
    'POST',
    `/v1/employees/${warehouse.id}/assignments`,
    { project_id: project.id, warehouse_id: warehouses[0].id },
    admin,
  );
  passed.push('Obyekt, blok va qavat zonasi, standart ombor, xodimlar biriktirildi');

  // 4. Material va kirim (ombor mudiri); admin material yarata olmaydi (D18)
  await call('POST', '/v1/materials', { name: 'QA Sement admin', unit_id: 'kg' }, admin, 403);
  const material = await call(
    'POST',
    '/v1/materials',
    { name: `QA Sement ${STAMP}`, unit_id: 'kg' },
    warehouse.token,
  );
  const receipt = await call(
    'POST',
    '/v1/stock/commands',
    {
      project_id: project.id,
      kind: 'receipt',
      material_id: material.id,
      to_account_id: whAccount,
      quantity: '1000',
      unit_cost: '1200',
      reason: 'QA kirim',
    },
    warehouse.token,
  );
  const whBalance = (
    await call('GET', `/v1/stock/accounts/${whAccount}/balances`, undefined, warehouse.token)
  ).items.find((b: any) => b.material_id === material.id);
  assert.equal(whBalance.quantity, '1000.000000');
  passed.push('Ombor mudiri material yaratdi va 1000 kg kirim qildi (admin 403); qoldiq 1000');

  // 5. Smeta (bosh muhandis): ish qatori qavatga; material qatori
  await call(
    'POST',
    '/v1/estimates',
    {
      project_id: project.id,
      name: 'x',
      lines: [{ kind: 'labor', description: 'x', unit_id: 'm3', quantity: '1', unit_price: '1' }],
    },
    warehouse.token,
    403,
  );
  const estimate = await call(
    'POST',
    '/v1/estimates',
    {
      project_id: project.id,
      name: 'QA smeta',
      lines: [
        {
          kind: 'labor',
          description: 'QA Beton',
          unit_id: 'm3',
          quantity: '100',
          unit_price: '250000',
          zone_id: floor.id,
        },
        {
          kind: 'material',
          description: 'QA Sement',
          material_id: material.id,
          unit_id: 'kg',
          quantity: '500',
          unit_price: '1200',
        },
      ],
    },
    manager.token,
  );
  const laborLine = estimate.lines[0],
    materialLine = estimate.lines[1];
  const estDetail = await call('GET', `/v1/estimates/${estimate.id}`, undefined, manager.token);
  assert.equal(estDetail.totals.total, '25600000.00');
  assert.equal(
    (await call('GET', `/v1/estimates/${estimate.id}`, undefined, foreman.token)).lines[0]
      .unit_price,
    undefined,
  );
  passed.push(
    'Smeta: jami 25 600 000 serverdan; prorabga narx ustunlari kelmaydi; omborchi smeta yarata olmaydi',
  );

  // 6. Chiqim (so'rovsiz) → prorab qabuli → prorab sarfi tasdiqsiz xarajat 120 000
  const custody = await call(
    'POST',
    '/v1/stock/custody',
    { project_id: project.id, custodian_id: foreman.id },
    admin,
  );
  const transfer = await call(
    'POST',
    '/v1/stock/commands',
    {
      project_id: project.id,
      kind: 'transfer',
      material_id: material.id,
      from_account_id: whAccount,
      to_account_id: custody.id,
      quantity: '300',
      reason: 'QA chiqim',
    },
    warehouse.token,
  );
  await call(
    'POST',
    `/v1/stock/commands/${transfer.id}/actions`,
    { version: 1, action: 'accept', quantity: '300' },
    foreman.token,
  );
  const consumption = await call(
    'POST',
    '/v1/stock/commands',
    {
      project_id: project.id,
      kind: 'consumption',
      material_id: material.id,
      from_account_id: custody.id,
      quantity: '100',
      estimate_line_id: materialLine.id,
      zone_id: floor.id,
      reason: 'QA sarf',
    },
    foreman.token,
  );
  await call(
    'POST',
    `/v1/stock/commands/${consumption.id}/actions`,
    { version: 2, action: 'review' },
    foreman.token,
    400,
  );
  const dash1 = await call('GET', `/v1/projects/${project.id}/dashboard`, undefined, admin);
  assert.equal(dash1.actual_cost, '120000.00');
  passed.push(
    'Chiqim 300 kg prorab tomonidan qabul qilindi, 100 kg sarf tasdiqsiz 120 000 xarajat bo‘ldi (tasdiqlash amali yo‘q)',
  );

  // 7. Talabnomalar olib tashlangan
  await call('GET', `/v1/stock/requests?project_id=${project.id}`, undefined, admin, 404);
  passed.push('Talabnomalar yo‘q: /v1/stock/requests 404');

  // 8. Vazifa: smeta qatoriga bog'langan, prorab bajaradi, bosh muhandis qabul qiladi
  const task = await call(
    'POST',
    '/v1/tasks',
    {
      project_id: project.id,
      title: 'QA beton quyish',
      assignee_id: foreman.id,
      reviewer_id: manager.id,
      priority: 'high',
      estimate_line_id: laborLine.id,
      planned_start: today,
    },
    admin,
  );
  await call(
    'POST',
    `/v1/tasks/${task.id}/transition`,
    { version: 1, status: 'in_progress' },
    foreman.token,
  );
  await call(
    'POST',
    `/v1/tasks/${task.id}/transition`,
    { version: 2, status: 'submitted' },
    foreman.token,
  );
  await call(
    'POST',
    `/v1/tasks/${task.id}/transition`,
    { version: 3, status: 'accepted' },
    foreman.token,
    403,
  );
  await call(
    'POST',
    `/v1/tasks/${task.id}/transition`,
    { version: 3, status: 'accepted' },
    manager.token,
  );
  const taskDetail = await call('GET', `/v1/tasks/${task.id}`, undefined, admin);
  assert.deepEqual([taskDetail.status, taskDetail.estimate_line_name], ['accepted', 'QA Beton']);
  passed.push(
    'Vazifa smeta qatori bilan yaratildi; prorab boshladi va topshirdi, bosh muhandis qabul qildi (prorab o‘zini qabul qila olmaydi)',
  );

  // 9. Kunlik hisobot (prorab) → qabul (bosh muhandis) → progress, tuzatish, qavat matritsasi
  const report = await call(
    'POST',
    '/v1/reports',
    {
      project_id: project.id,
      kind: 'daily',
      report_date: today,
      content: 'QA beton quyildi',
      progress_quantity: '40',
      estimate_line_id: laborLine.id,
      zone_id: floor.id,
    },
    foreman.token,
  );
  await call(
    'POST',
    `/v1/reports/${report.id}/review`,
    { version: 1, action: 'accepted', reason: 'QA tekshirildi' },
    foreman.token,
    403,
  );
  await call(
    'POST',
    `/v1/reports/${report.id}/review`,
    { version: 1, action: 'accepted', reason: 'QA tekshirildi' },
    manager.token,
  );
  const reportDone = await call('GET', `/v1/reports/${report.id}`, undefined, manager.token);
  assert.deepEqual(
    [
      reportDone.progress.quantity,
      reportDone.progress.labor_rate,
      reportDone.progress.labor_amount,
    ],
    ['40.000000', undefined, undefined],
  );
  await call(
    'POST',
    `/v1/progress-entries/${reportDone.progress.id}/corrections`,
    { quantity_delta: '-5', reason: 'QA qayta o‘lchash' },
    manager.token,
  );
  const matrix = await call(
    'GET',
    `/v1/projects/${project.id}/floor-progress`,
    undefined,
    foreman.token,
  );
  const cell = matrix.cells.find(
    (c: any) => c.zone_id === floor.id && c.description === 'QA Beton',
  );
  assert.deepEqual([cell.plan, cell.fact, cell.percent], ['100.000000', '35.000000', '35.0']);
  passed.push(
    'Hisobot prorab yozdi, bosh muhandis qabul qildi (prorab 403), akkord yo‘q; tuzatish −5 → qavat matritsasida 35 / 100 (35 %)',
  );

  // 10. Moliya (buxgalter): kassa, tushum, yetkazuvchi invoysi kirimga bog'langan, to'lov
  const cash = await call(
    'POST',
    '/v1/cash-accounts',
    { name: `QA kassa ${STAMP}`, kind: 'cash' },
    accountant.token,
  );
  const customer = await call(
    'POST',
    '/v1/counterparties',
    { name: 'QA Buyurtmachi', kind: 'customer' },
    accountant.token,
  );
  const supplier = await call(
    'POST',
    '/v1/counterparties',
    { name: 'QA Yetkazuvchi', kind: 'supplier' },
    accountant.token,
  );
  await call(
    'POST',
    '/v1/finance/documents',
    {
      project_id: project.id,
      kind: 'receipt',
      amount: '10000000',
      cash_account_id: cash.id,
      counterparty_id: customer.id,
      description: 'QA tushum',
      document_date: today,
    },
    accountant.token,
  );
  const invoice = await call(
    'POST',
    '/v1/finance/documents',
    {
      project_id: project.id,
      kind: 'supplier_invoice',
      amount: '1200000',
      counterparty_id: supplier.id,
      matched_receipt_id: receipt.id,
      description: 'QA invoys',
      document_date: today,
    },
    accountant.token,
  );
  await call(
    'POST',
    '/v1/finance/documents',
    {
      project_id: project.id,
      kind: 'payment',
      amount: '1200000',
      counterparty_id: supplier.id,
      cash_account_id: cash.id,
      allocated_invoice_id: invoice.id,
      description: 'QA to‘lov',
      document_date: today,
    },
    accountant.token,
  );
  await call(
    'GET',
    `/v1/finance/documents?project_id=${project.id}`,
    undefined,
    foreman.token,
    403,
  );
  const fin1 = (await call('GET', `/v1/projects/${project.id}`, undefined, admin)).finance;
  assert.deepEqual(
    [fin1.fact_total, fin1.paid, fin1.debt, fin1.income],
    ['120000.00', '1200000.00', '0.00', '10000000.00'],
  );
  passed.push(
    'Tushum 10 000 000, kirimga bog‘langan invoys 1 200 000 to‘landi: obyekt kartasida fakt 120 000, to‘langan 1 200 000, qarz 0; prorab moliyani ko‘rmaydi',
  );

  // 11. Ish haqi: prorab oklad 3 500 000 → davr yopildi → avans 500 000 → to'lov (avans avval)
  const period = await call(
    'POST',
    '/v1/finance/payroll/periods',
    { project_id: project.id, month: monthStart },
    accountant.token,
  );
  await call(
    'POST',
    `/v1/finance/payroll/periods/${period.id}/entries`,
    { employee_id: foreman.id, base_salary: '3500000' },
    accountant.token,
  );
  const payroll1 = await call(
    'GET',
    `/v1/finance/payroll?project_id=${project.id}`,
    undefined,
    accountant.token,
  );
  assert.equal(payroll1.periods[0].piece_pending, undefined);
  // Davrni yopish va to'lash — payroll sahifasida 'update' ruxsati (standart siyosatda admin; buxgalterga admin Ruxsatlar sahifasidan beradi)
  await call(
    'POST',
    `/v1/finance/payroll/periods/${period.id}/post`,
    { version: period.version },
    accountant.token,
    403,
  );
  await call(
    'POST',
    `/v1/finance/payroll/periods/${period.id}/post`,
    { version: period.version },
    admin,
  );
  const payroll2 = await call(
    'GET',
    `/v1/finance/payroll?project_id=${project.id}`,
    undefined,
    accountant.token,
  );
  const entry = payroll2.entries.find((e: any) => e.employee_id === foreman.id);
  assert.deepEqual([entry.net, entry.status], ['3500000.00', 'posted']);
  const laborDoc = (
    await call(
      'GET',
      `/v1/finance/documents?project_id=${project.id}&kind=labor`,
      undefined,
      accountant.token,
    )
  ).items[0];
  await call(
    'POST',
    '/v1/finance/documents',
    {
      project_id: project.id,
      kind: 'advance',
      amount: '500000',
      counterparty_id: laborDoc.counterparty_id,
      cash_account_id: cash.id,
      description: 'QA prorabga avans',
      document_date: today,
    },
    accountant.token,
  );
  const entry2 = (
    await call('GET', `/v1/finance/payroll?project_id=${project.id}`, undefined, accountant.token)
  ).entries.find((e: any) => e.id === entry.id);
  assert.deepEqual([entry2.advance_available, entry2.cash_due], ['500000.00', '3000000.00']);
  const paid = await call(
    'POST',
    `/v1/finance/payroll/entries/${entry.id}/pay`,
    { version: entry2.version, cash_account_id: cash.id, document_date: today },
    admin,
  );
  assert.deepEqual(
    [paid.status, paid.advance_applied, paid.paid_cash],
    ['paid', '500000.00', '3000000.00'],
  );
  await call('GET', '/v1/me/earnings', undefined, foreman.token, 404);
  const fin2 = (await call('GET', `/v1/projects/${project.id}`, undefined, admin)).finance;
  assert.deepEqual([fin2.fact_total, fin2.paid, fin2.debt], ['3620000.00', '4700000.00', '0.00']);
  passed.push(
    'Ish haqi davri (admin yopdi, buxgalter 403): prorab oklad 3 500 000; avans 500 000 to‘lovda avval hisoblandi, 3 000 000 kassadan; akkord hisobi yo‘q (404); obyekt fakti 3 620 000',
  );

  // 12. Dashboard va ruxsat chegaralari
  const adminDash = await call('GET', '/v1/dashboard', undefined, admin);
  assert.equal(adminDash.stock.pending_requests, undefined);
  assert.equal((await call('GET', '/v1/dashboard', undefined, foreman.token)).finance, null);
  assert.equal(
    (await call('GET', `/v1/projects/${project.id}`, undefined, foreman.token)).finance,
    null,
  );
  await call('GET', '/v1/audit', undefined, foreman.token, 403);
  passed.push('Dashboard: admin to‘liq, prorab moliyasiz va auditni ko‘rmaydi');

  // 13. Tozalash
  let cleanup: unknown = 'QA_KEEP=1 — ma‘lumot saqlandi';
  if (!KEEP) {
    assert(process.env.MIGRATION_DATABASE_URL, 'MIGRATION_DATABASE_URL kerak (tozalash uchun)');
    const pool = createPool(process.env.MIGRATION_DATABASE_URL);
    try {
      cleanup = await transaction(pool, null, (db) => cleanupTenant(db, KEY));
    } finally {
      await pool.end();
    }
    assert.equal(
      (await call('GET', `/v1/platform/tenants?q=${KEY}`, undefined, owner)).items.length,
      0,
    );
    await call('GET', '/v1/auth/me', undefined, admin, 401);
    passed.push(
      'Tozalash: QA kompaniyasi va uning barcha ma‘lumotlari o‘chirildi, admin sessiyasi yaroqsiz',
    );
  }
  console.log(
    JSON.stringify(
      { executed_at: new Date().toISOString(), api: API, tenant: KEY, checks: passed, cleanup },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(JSON.stringify({ failed_after: passed, tenant: KEY }, null, 2));
  console.error(error);
  console.error(`\nMa'lumot saqlandi. Tozalash: npm run qa:cleanup -- ${KEY}`);
  process.exitCode = 1;
}
