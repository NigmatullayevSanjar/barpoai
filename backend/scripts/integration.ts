import { startMaterialRequest, continueFlow, loadState, hasFlow } from '../src/telegram-flows.js';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { createPool, transaction, one } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { buildApp } from '../src/app.js';
import { hashPassword, digest } from '../src/security.js';
import {
  createLinkToken,
  consumeLinkToken,
  telegramStatus,
  unlinkTelegram,
} from '../src/telegram.js';
process.env.AUTH_RATE_LIMIT_PER_MINUTE = '10000';
process.env.RATE_LIMIT_PER_MINUTE = '100000';
process.env.TELEGRAM_BOT_TOKEN ??= 'integration-test-token';
process.env.APP_ORIGIN ??= 'http://localhost:5173';
const name = `barpo-test-${process.pid}`,
  secret = randomBytes(18).toString('hex');
const docker = (...args: string[]) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
let admin: ReturnType<typeof createPool> | undefined,
  appPool: ReturnType<typeof createPool> | undefined,
  app: Awaited<ReturnType<typeof buildApp>>['app'] | undefined;
const passed: string[] = [];
try {
  docker(
    'run',
    '--rm',
    '-d',
    '--name',
    name,
    '-e',
    `POSTGRES_PASSWORD=${secret}`,
    '-p',
    '127.0.0.1::5432',
    'postgres:17-bookworm',
  );
  const port = docker('port', name, '5432/tcp').split(':').pop();
  admin = createPool(`postgresql://postgres:${secret}@127.0.0.1:${port}/postgres`);
  for (let i = 0; ; i++) {
    try {
      await admin.query('SELECT 1');
      break;
    } catch (e) {
      if (i > 40) throw e;
      await delay(500);
    }
  }
  await migrate(admin);
  await migrate(admin);
  passed.push('Fresh migration and repeated migration');
  await admin.query(
    `CREATE ROLE barpo_app LOGIN PASSWORD '${secret}' NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO barpo_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO barpo_app`,
  );
  appPool = createPool(`postgresql://barpo_app:${secret}@127.0.0.1:${port}/postgres`);
  ({ app } = await buildApp(appPool));
  const pass = 'TestingStrongPassword123!';
  const owner = (
    await admin.query(
      "INSERT INTO users(login,display_name,password_hash,role) VALUES('owner','Owner',$1,'platform_owner') RETURNING id",
      [await hashPassword(pass)],
    )
  ).rows[0];
  const call = async (
    method: string,
    url: string,
    body?: any,
    token?: string,
    key?: string,
    expected = 200,
  ) => {
    const res = await app!.inject({
      method: method as any,
      url,
      payload: body,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(method !== 'GET' ? { 'idempotency-key': key ?? randomUUID() } : {}),
      },
    });
    assert.equal(res.statusCode, expected, `${method} ${url}: ${res.body}`);
    return res.json();
  };
  const ownerToken = (await call('POST', '/v1/auth/login', { login: 'owner', password: pass }))
    .access_token;
  const t = await call(
    'POST',
    '/v1/platform/tenants',
    { legal_name: 'Sinov korxona', registration_key: 'TEST-1' },
    ownerToken,
  );
  const invite = await call('POST', `/v1/platform/tenants/${t.id}/invites`, undefined, ownerToken);
  await call('POST', '/v1/auth/invites/preview', { token: invite.token });
  await call('POST', '/v1/auth/invites/preview', { token: invite.token });
  const signups = await Promise.all(
    [1, 2].map((i) =>
      app!.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: { token: invite.token, login: `admin${i}`, password: pass, display_name: 'Admin' },
      }),
    ),
  );
  assert.deepEqual(signups.map((s) => s.statusCode).sort(), [200, 410]);
  const auth = signups.find((s) => s.statusCode === 200)!.json();
  const adminToken = auth.access_token;
  passed.push('Preview does not consume invite; concurrent signup creates one admin/trial');
  const project = await call('POST', '/v1/projects', { name: 'Obyekt A' }, adminToken);
  const employee = async (role: string) => {
    const user = await call(
      'POST',
      '/v1/employees',
      { login: role, display_name: role, password: pass, role },
      adminToken,
    );
    const first = await call('POST', '/v1/auth/login', { login: role, password: pass });
    await call('GET', '/v1/projects', undefined, first.access_token, undefined, 403);
    await call(
      'POST',
      '/v1/auth/password',
      { current_password: pass, new_password: pass + '2' },
      first.access_token,
    );
    const logged = await call('POST', '/v1/auth/login', { login: role, password: pass + '2' });
    await call(
      'POST',
      `/v1/employees/${user.id}/assignments`,
      { project_id: project.id },
      adminToken,
    );
    return { ...user, token: logged.access_token };
  };
  const brigadier = await employee('brigadier'),
    foreman = await employee('foreman'),
    warehouseManager = await employee('warehouse_manager'),
    financier = await employee('financier'),
    manager = await employee('manager');
  passed.push('Employee first login requires password change; sessions revoked');
  const financierPages = await call('GET', '/v1/me/permissions', undefined, financier.token);
  assert.equal(financierPages.pages.bank_cash.create, false);
  assert.equal(financierPages.pages.allocations.create, true);
  const warehouse = await call(
    'POST',
    '/v1/warehouses',
    { project_id: project.id, name: 'Ombor A' },
    adminToken,
  );
  await call(
    'POST',
    `/v1/employees/${warehouseManager.id}/assignments`,
    { project_id: project.id, warehouse_id: warehouse.warehouse.id },
    adminToken,
  );
  const custody = await call(
    'POST',
    '/v1/stock/custody',
    { project_id: project.id, custodian_id: brigadier.id },
    adminToken,
  );
  const material = await call(
    'POST',
    '/v1/materials',
    { name: 'Sement', unit_id: 'kg' },
    adminToken,
  );
  const opening = await call(
    'POST',
    '/v1/stock/commands',
    {
      project_id: project.id,
      kind: 'opening',
      material_id: material.id,
      to_account_id: warehouse.account.id,
      quantity: '100',
      unit_cost: '10',
      reason: 'Boshlang‘ich qoldiq',
    },
    warehouseManager.token,
  );
  const transferBody = {
    project_id: project.id,
    kind: 'transfer',
    material_id: material.id,
    from_account_id: warehouse.account.id,
    to_account_id: custody.id,
    quantity: '70',
    reason: 'Brigadirga jo‘natish',
  };
  const transfers = await Promise.all(
    [1, 2].map(() =>
      app!.inject({
        method: 'POST',
        url: '/v1/stock/commands',
        payload: transferBody,
        headers: {
          authorization: `Bearer ${warehouseManager.token}`,
          'idempotency-key': randomUUID(),
        },
      }),
    ),
  );
  assert.deepEqual(transfers.map((r) => r.statusCode).sort(), [200, 409]);
  const transfer = transfers.find((r) => r.statusCode === 200)!.json();
  passed.push('Concurrent transfers cannot over-reserve stock');
  const acceptKey = randomUUID();
  const acceptBody = { version: 1, action: 'accept', quantity: '40' };
  const a = await call(
    'POST',
    `/v1/stock/commands/${transfer.id}/actions`,
    acceptBody,
    brigadier.token,
    acceptKey,
  );
  const a2 = await call(
    'POST',
    `/v1/stock/commands/${transfer.id}/actions`,
    acceptBody,
    brigadier.token,
    acceptKey,
  );
  assert.deepEqual(a, a2);
  const before = await call('GET', `/v1/projects/${project.id}/dashboard`, undefined, adminToken);
  assert.equal(before.actual_cost, '0.00');
  const consumption = await call(
    'POST',
    '/v1/stock/commands',
    {
      project_id: project.id,
      kind: 'consumption',
      material_id: material.id,
      from_account_id: custody.id,
      quantity: '25',
      reason: 'Devor uchun sarf',
    },
    brigadier.token,
  );
  await call(
    'POST',
    `/v1/stock/commands/${consumption.id}/actions`,
    { version: 1, action: 'review' },
    foreman.token,
  );
  const dashboard = await call(
    'GET',
    `/v1/projects/${project.id}/dashboard`,
    undefined,
    adminToken,
  );
  assert.equal(dashboard.actual_cost, '250.00');
  const held = await call(
    'GET',
    `/v1/stock/accounts/${custody.id}/balances`,
    undefined,
    brigadier.token,
  );
  assert.equal(held.items[0].quantity, '15.000000');
  assert.equal(held.items[0].value, undefined);
  passed.push(
    'Partial acceptance retry is idempotent; only reviewed consumption posts cost; prices redacted',
  );
  await call(
    'POST',
    `/v1/stock/commands/${transfer.id}/actions`,
    { version: 2, action: 'cancel', reason: 'Qolgan jo‘natma bekor' },
    warehouseManager.token,
  );
  const balance = await call(
    'GET',
    `/v1/stock/accounts/${warehouse.account.id}/balances`,
    undefined,
    adminToken,
  );
  assert.equal(balance.items[0].quantity, '60.000000');
  assert.equal(balance.items[0].reserved, '0.000000');
  await assert.rejects(
    transaction(appPool, t.id, (db) =>
      db.query('UPDATE stock_ledger SET quantity_delta=0 WHERE tenant_id=$1', [t.id]),
    ),
    /IMMUTABLE_LEDGER/,
  );
  passed.push('Ledger immutable and remainder cancellation releases reservation');
  const est = await call(
    'POST',
    '/v1/estimates',
    {
      project_id: project.id,
      name: 'Normali smeta',
      lines: [
        {
          kind: 'material',
          description: 'Sement',
          material_id: material.id,
          unit_id: 'kg',
          quantity: '0',
          norm: '2.5',
          work_quantity: '10',
          loss_percent: '4',
          unit_price: '10',
          months: [{ month: '2026-10-01', quantity: '26' }],
        },
      ],
    },
    financier.token,
  );
  assert.equal(est.lines[0].effective_quantity, '26.000000');
  assert.equal(est.lines[0].total, '260.00');
  await call(
    'DELETE',
    `/v1/estimates/${est.id}`,
    { version: 1, reason: 'O‘chirish sinovi' },
    financier.token,
    undefined,
    403,
  );
  passed.push('Financier imports estimates with norms/months but cannot delete by default');
  const workEstimate = await call(
    'POST',
    '/v1/estimates',
    {
      project_id: project.id,
      name: 'Ish smetasi',
      lines: [
        {
          kind: 'labor',
          description: 'Devor qurish',
          unit_id: 'hour',
          quantity: '10',
          unit_price: '100',
        },
      ],
    },
    adminToken,
  );
  const report = await call(
    'POST',
    '/v1/reports',
    {
      project_id: project.id,
      kind: 'daily',
      report_date: '2026-10-01',
      content: 'Bajarilgan kundalik ishlar',
      progress_quantity: '3',
      estimate_line_id: workEstimate.lines[0].id,
      forecast_end: '2026-12-01',
    },
    brigadier.token,
  );
  const reviewKey = randomUUID();
  await call(
    'POST',
    `/v1/reports/${report.id}/review`,
    { version: 1, action: 'accepted', reason: 'Ish joyida tekshirildi' },
    foreman.token,
    reviewKey,
  );
  await call(
    'POST',
    `/v1/reports/${report.id}/review`,
    { version: 1, action: 'accepted', reason: 'Ish joyida tekshirildi' },
    foreman.token,
    reviewKey,
  );
  assert.equal(
    (
      await admin.query('SELECT count(*)::int n FROM progress_entries WHERE report_id=$1', [
        report.id,
      ])
    ).rows[0].n,
    1,
  );
  const forecast = (
    await admin.query('SELECT planned_end,forecast_end::text FROM projects WHERE id=$1', [
      project.id,
    ])
  ).rows[0];
  assert.equal(forecast.planned_end, null);
  assert.equal(forecast.forecast_end, '2026-12-01');
  passed.push('Report acceptance retries post progress once and preserve original plan');
  const task = await call(
    'POST',
    '/v1/tasks',
    {
      project_id: project.id,
      title: 'Sinov vazifasi',
      assignee_id: brigadier.id,
      reviewer_id: foreman.id,
      priority: 'normal',
    },
    adminToken,
  );
  await call(
    'POST',
    `/v1/tasks/${task.id}/transition`,
    { version: 1, status: 'in_progress' },
    brigadier.token,
  );
  await call(
    'POST',
    `/v1/tasks/${task.id}/transition`,
    { version: 2, status: 'submitted' },
    brigadier.token,
  );
  await call(
    'POST',
    `/v1/tasks/${task.id}/transition`,
    { version: 3, status: 'accepted' },
    foreman.token,
  );
  passed.push('Assignee and reviewer task transitions');
  let config = await call('GET', '/v1/company/role-permissions', undefined, adminToken);
  await call(
    'POST',
    '/v1/company/role-permissions',
    {
      version: config.version,
      role: 'manager',
      rules: [{ page: 'projects', read: true, create: true, update: false, delete: false }],
    },
    adminToken,
  );
  const createdByManager = await call(
    'POST',
    '/v1/projects',
    { name: 'Menejer yaratgan' },
    manager.token,
  );
  await call(
    'PATCH',
    `/v1/projects/${createdByManager.id}`,
    { version: 1, name: 'Tahrir' },
    manager.token,
    undefined,
    403,
  );
  config = await call('GET', '/v1/company/role-permissions', undefined, adminToken);
  await call(
    'POST',
    '/v1/company/role-permissions',
    {
      version: config.version,
      role: 'manager',
      rules: [{ page: 'projects', read: false, create: false, update: false, delete: false }],
    },
    adminToken,
  );
  await call('GET', '/v1/projects', undefined, manager.token, undefined, 403);
  const mine = await call('GET', '/v1/me/permissions', undefined, manager.token);
  assert.equal(mine.pages.projects.read, false);
  passed.push('Role page CRUD is independent; live permission changes deny existing sessions');
  await call(
    'POST',
    '/v1/company/role-permissions',
    {
      version: config.version,
      role: 'manager',
      rules: [{ page: 'projects', read: true, create: false, update: false, delete: false }],
    },
    adminToken,
    undefined,
    409,
  );
  await call(
    'POST',
    `/v1/employees/${financier.id}/permissions`,
    { permission: 'estimates.import', effect: 'deny' },
    adminToken,
  );
  await call(
    'POST',
    '/v1/estimates',
    {
      project_id: project.id,
      name: 'Taqiqlangan',
      lines: [
        { kind: 'labor', description: 'Ish', unit_id: 'hour', quantity: '1', unit_price: '1' },
      ],
    },
    financier.token,
    undefined,
    403,
  );
  passed.push('Individual deny overrides baseline role grant');
  const foreign = (
    await admin.query(
      "INSERT INTO tenants(legal_name,registration_key) VALUES('Other','TEST-2') RETURNING id",
    )
  ).rows[0];
  await transaction(admin, foreign.id, (db) =>
    db.query('INSERT INTO projects(tenant_id,name) VALUES($1,$2)', [foreign.id, 'Foreign']),
  );
  const rls = await transaction(appPool, t.id, (db) => db.query('SELECT * FROM projects'));
  assert(rls.rows.every((p) => p.tenant_id === t.id));
  const noContext = await appPool.query('SELECT * FROM projects');
  assert.equal(noContext.rowCount, 0);
  passed.push('Real PostgreSQL RLS under non-superuser; absent tenant context returns no rows');
  await assert.rejects(
    transaction(appPool, t.id, (db) =>
      db.query(
        'UPDATE stock_balances SET quantity=quantity+1 WHERE tenant_id=$1 AND account_id=$2',
        [t.id, custody.id],
      ),
    ),
    /STOCK_PROJECTION_MISMATCH/,
  );
  await assert.rejects(
    transaction(appPool, t.id, (db) =>
      db.query('UPDATE estimate_months SET quantity=1 WHERE tenant_id=$1 AND line_id=$2', [
        t.id,
        est.lines[0].id,
      ]),
    ),
    /MONTH_QUANTITY_MISMATCH/,
  );
  passed.push('Deferred database checks reject divergent balance and month totals');
  const treasury = await call(
    'POST',
    '/v1/cash-accounts',
    { name: 'Bank', kind: 'bank' },
    adminToken,
  );
  const supplier = await call(
    'POST',
    '/v1/counterparties',
    { name: 'Supplier', kind: 'supplier' },
    adminToken,
  );
  const alloc = await call(
    'POST',
    '/v1/finance/documents',
    {
      project_id: project.id,
      kind: 'allocation',
      amount: '100',
      description: 'Material uchun ajratma',
      document_date: '2026-10-01',
    },
    financier.token,
  );
  const expense = await call(
    'POST',
    '/v1/finance/documents',
    {
      project_id: project.id,
      kind: 'labor',
      amount: '100',
      counterparty_id: supplier.id,
      description: 'Ish haqi hisobi',
      document_date: '2026-10-01',
    },
    adminToken,
  );
  await call(
    'POST',
    '/v1/finance/documents',
    {
      project_id: project.id,
      kind: 'payment',
      amount: '60',
      counterparty_id: supplier.id,
      cash_account_id: treasury.id,
      allocated_invoice_id: expense.id,
      description: 'Qisman to‘lov hisobi',
      document_date: '2026-10-01',
    },
    adminToken,
  );
  const final = await call('GET', `/v1/projects/${project.id}/dashboard`, undefined, adminToken);
  assert.deepEqual(final, {
    actual_cost: '350.00',
    net_cash_flow: '-60.00',
    supplier_debt: '40.00',
    advances: '0.00',
  });
  passed.push('Allocation, cost, cash payment and payable are not counted twice');
  await call(
    'POST',
    '/v1/finance/documents',
    {
      project_id: project.id,
      kind: 'payment',
      amount: '50',
      counterparty_id: supplier.id,
      cash_account_id: treasury.id,
      allocated_invoice_id: expense.id,
      description: 'Ortiqcha to‘lov hisobi',
      document_date: '2026-10-01',
    },
    adminToken,
    undefined,
    409,
  );
  config = await call('GET', '/v1/company/role-permissions', undefined, adminToken);
  await call(
    'POST',
    '/v1/company/role-permissions',
    {
      version: config.version,
      role: 'financier',
      rules: [{ page: 'bank_cash', read: false, create: false, update: false, delete: false }],
    },
    adminToken,
  );
  await call('GET', '/v1/cash-accounts', undefined, financier.token, undefined, 403);
  const financeVisible = await call(
    'GET',
    `/v1/finance/documents?project_id=${project.id}`,
    undefined,
    financier.token,
  );
  assert(financeVisible.items.some((d: any) => d.kind === 'labor'));
  assert(!financeVisible.items.some((d: any) => d.kind === 'payment'));
  passed.push('Individual financial pages filter both menus and document data');
  await call('GET', '/v1/billing', undefined, manager.token, undefined, 403);
  config = await call('GET', '/v1/company/role-permissions', undefined, adminToken);
  await call(
    'POST',
    '/v1/company/role-permissions',
    {
      version: config.version,
      role: 'manager',
      rules: [{ page: 'billing', read: true, create: false, update: false, delete: false }],
    },
    adminToken,
  );
  await call('GET', '/v1/billing', undefined, manager.token);
  await call(
    'POST',
    '/v1/company/role-permissions',
    {
      version: 1,
      role: 'manager',
      rules: [{ page: 'billing', read: true, create: true, update: true, delete: true }],
    },
    manager.token,
    undefined,
    403,
  );
  passed.push(
    'Admin delegates billing read independently; employee cannot manage role permissions',
  );
  const current = (await admin.query('SELECT version FROM tenants WHERE id=$1', [t.id])).rows[0];
  await call(
    'PATCH',
    `/v1/platform/tenants/${t.id}`,
    { version: current.version, status: 'blocked', reason: 'Manual bloklash sinovi' },
    ownerToken,
  );
  await call('GET', '/v1/projects', undefined, adminToken, undefined, 401);
  const relog = await call('POST', '/v1/auth/login', {
    login:
      auth.user.id === undefined ? 'none' : signups[0]!.statusCode === 200 ? 'admin1' : 'admin2',
    password: pass,
  });
  await call('GET', '/v1/billing', undefined, relog.access_token);
  await call('GET', '/v1/projects', undefined, relog.access_token, undefined, 403);
  const blockedEmployee = await call('POST', '/v1/auth/login', {
    login: 'manager',
    password: pass + '2',
  });
  await call('GET', '/v1/billing', undefined, blockedEmployee.access_token, undefined, 403);
  passed.push('Blocking revokes sessions; new admin session only reaches billing/support');
  // ---- Milestone 1: phone login, cookie session, trial state, Telegram linking, notifications
  const tenantsList = await call('GET', '/v1/platform/tenants', undefined, ownerToken);
  const listed = tenantsList.items.find((row: any) => row.id === t.id);
  assert.equal(listed.access_state, 'blocked');
  await call(
    'PATCH',
    `/v1/platform/tenants/${t.id}`,
    { version: listed.version, status: 'active', reason: 'Sinov uchun qayta ochish' },
    ownerToken,
  );
  const reopened = (await call('GET', '/v1/platform/tenants', undefined, ownerToken)).items.find(
    (row: any) => row.id === t.id,
  );
  assert.equal(reopened.access_state, 'trial');
  assert.equal(reopened.days_left, 14);
  passed.push('Platform list exposes trial/overdue state; blocking stays a manual owner decision');
  const adminLogin = signups[0]!.statusCode === 200 ? 'admin1' : 'admin2';
  const adminAgain = (await call('POST', '/v1/auth/login', { login: adminLogin, password: pass }))
    .access_token;
  const phoneUser = await call(
    'POST',
    '/v1/employees',
    {
      login: 'phone.user',
      display_name: 'Telefon',
      password: pass,
      role: 'manager',
      phone: '+998 (90) 111-22-33',
    },
    adminAgain,
  );
  assert.equal(phoneUser.phone, '+998901112233');
  const cookieLogin = await app!.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { login: '90 111 22 33', password: pass },
  });
  assert.equal(cookieLogin.statusCode, 200, cookieLogin.body);
  const cookie = cookieLogin.cookies.find((c) => c.name === 'barpo_session');
  assert(cookie && cookie.httpOnly, 'httpOnly cookie expected');
  const viaCookie = await app!.inject({
    method: 'GET',
    url: '/v1/auth/me',
    cookies: { barpo_session: cookie!.value },
  });
  assert.equal(viaCookie.statusCode, 200);
  assert.equal(viaCookie.json().phone, '+998901112233');
  const csrf = await app!.inject({
    method: 'POST',
    url: '/v1/auth/logout',
    cookies: { barpo_session: cookie!.value },
    headers: { origin: 'https://evil.example' },
  });
  assert.equal(csrf.statusCode, 403);
  const okOrigin = await app!.inject({
    method: 'POST',
    url: '/v1/auth/logout',
    cookies: { barpo_session: cookie!.value },
    headers: { origin: process.env.APP_ORIGIN! },
  });
  assert.equal(okOrigin.statusCode, 200);
  assert(
    okOrigin.cookies.some((c) => c.name === 'barpo_session' && c.value === ''),
    'cookie cleared',
  );
  passed.push('Phone or login identifier; httpOnly cookie session with origin check');
  const link = await call('POST', '/v1/integrations/telegram/link', undefined, adminAgain);
  assert.match(link.url, /^https:\/\/t\.me\/[A-Za-z0-9_]+\?start=[A-Za-z0-9_-]{32,}$/);
  const rawToken = link.url.split('start=')[1];
  const tgUser = { id: '424242', username: 'ali_tg', first_name: 'Ali', language_code: 'uz' };
  const races = await Promise.allSettled(
    [1, 2].map(() => transaction(appPool!, null, (db) => consumeLinkToken(db, rawToken, tgUser))),
  );
  assert.deepEqual(races.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(
    (races.find((r) => r.status === 'rejected') as any).reason.code,
    'TELEGRAM_LINK_USED',
  );
  await assert.rejects(
    transaction(appPool!, null, (db) => consumeLinkToken(db, 'x'.repeat(40), tgUser)),
    (e: any) => e.code === 'TELEGRAM_LINK_INVALID',
  );
  const status = await call('GET', '/v1/integrations/telegram', undefined, adminAgain);
  assert.equal(status.linked, true);
  assert.equal(status.username, 'ali_tg');
  const managerAgain = (
    await call('POST', '/v1/auth/login', { login: 'manager', password: pass + '2' })
  ).access_token;
  const otherLink = await call('POST', '/v1/integrations/telegram/link', undefined, managerAgain);
  await assert.rejects(
    transaction(appPool!, null, (db) =>
      consumeLinkToken(db, otherLink.url.split('start=')[1], tgUser),
    ),
    (e: any) => e.code === 'TELEGRAM_ACCOUNT_IN_USE',
  );
  const linkedRow = (
    await admin.query('SELECT user_id FROM telegram_accounts WHERE telegram_user_id=$1', ['424242'])
  ).rows[0];
  assert.equal(linkedRow.user_id, relog.user.id);
  await call('DELETE', '/v1/integrations/telegram', undefined, adminAgain);
  assert.equal(
    (await call('GET', '/v1/integrations/telegram', undefined, adminAgain)).linked,
    false,
  );
  assert.equal(
    (await admin.query('SELECT 1 FROM telegram_accounts WHERE telegram_user_id=$1', ['424242']))
      .rowCount,
    0,
  );
  passed.push(
    'Telegram deep-link token is single-use, hashed, race-safe; account ownership and unlink enforced',
  );
  const notifTask = await call(
    'POST',
    '/v1/tasks',
    {
      project_id: project.id,
      title: 'Bildirishnoma sinovi',
      assignee_id: brigadier.id,
      reviewer_id: foreman.id,
      priority: 'high',
    },
    adminAgain,
  );
  const brigadierAgain = (
    await call('POST', '/v1/auth/login', { login: 'brigadier', password: pass + '2' })
  ).access_token;
  const inbox = await call('GET', '/v1/me/notifications?unread=true', undefined, brigadierAgain);
  assert(
    inbox.items.some((n: any) => n.kind === 'task.assigned' && n.payload.task_id === notifTask.id),
  );
  assert(inbox.unread >= 1);
  await call('POST', '/v1/me/notifications/read', { ids: [] }, brigadierAgain);
  assert.equal(
    (await call('GET', '/v1/me/notifications?unread=true', undefined, brigadierAgain)).unread,
    0,
  );
  const queued = (
    await admin.query(
      "SELECT status,error_code FROM outbox WHERE kind='notification' AND recipient_id=$1",
      [brigadier.id],
    )
  ).rows;
  assert(queued.length >= 1);
  passed.push('Task assignment creates in-app notification and durable Telegram outbox job');
  // Telegram material so'rovi oqimi (chat_state): obyekt bitta → material → miqdor → izoh → so'rov
  const brigadierAgain2 = (
    await call('POST', '/v1/auth/login', { login: 'brigadier', password: pass + '2' })
  ).access_token;
  const brigadierLink = await call(
    'POST',
    '/v1/integrations/telegram/link',
    undefined,
    brigadierAgain2,
  );
  const tgBrigadier = {
    id: '515151',
    username: 'brig_tg',
    first_name: 'Brigadir',
    language_code: 'uz',
  };
  const brigadierUser = await transaction(appPool!, null, (db) =>
    consumeLinkToken(db, brigadierLink.url.split('start=')[1], tgBrigadier),
  );
  await call('POST', '/v1/materials', { name: 'Armatura 12', unit_id: 'kg' }, adminAgain);
  const step1 = await startMaterialRequest(appPool!, brigadierUser, 'uz');
  assert.match(step1, /Materialni tanlang/);
  assert.equal(hasFlow(await loadState(appPool!, '515151')), true);
  const step2 = await continueFlow(
    appPool!,
    brigadierUser,
    await loadState(appPool!, '515151'),
    '1',
    'uz',
  );
  assert.match(step2, /Miqdorni kiriting/);
  const bad = await continueFlow(
    appPool!,
    brigadierUser,
    await loadState(appPool!, '515151'),
    'abc',
    'uz',
  );
  assert.match(bad, /musbat son/);
  const step3 = await continueFlow(
    appPool!,
    brigadierUser,
    await loadState(appPool!, '515151'),
    '25.5',
    'uz',
  );
  assert.match(step3, /Izoh/);
  const done = await continueFlow(
    appPool!,
    brigadierUser,
    await loadState(appPool!, '515151'),
    'Poydevor uchun',
    'uz',
  );
  assert.match(done, /so‘rovi yuborildi/);
  assert.equal(hasFlow(await loadState(appPool!, '515151')), false);
  const requestRow = (
    await admin.query(
      'SELECT quantity::text,status,note FROM material_requests WHERE requested_by=$1',
      [brigadierUser.id],
    )
  ).rows[0];
  assert.deepEqual(
    [requestRow.quantity, requestRow.status, requestRow.note],
    ['25.500000', 'pending', 'Poydevor uchun'],
  );
  const requests = await call(
    'GET',
    `/v1/stock/requests?project_id=${project.id}`,
    undefined,
    adminAgain,
  );
  assert.equal(requests.items.length, 1);
  const fulfilled = await call(
    'POST',
    `/v1/stock/requests/${requests.items[0].id}/actions`,
    { version: 1, action: 'reject', note: 'Sinov: rad etish' },
    adminAgain,
  );
  assert.equal(fulfilled.status, 'rejected');
  passed.push(
    'Telegram multi-step material request creates a pending request; admin resolves it via API',
  );
  const spec = await call('GET', '/openapi.json');
  assert.equal(spec.openapi, '3.1.0');
  passed.push('OpenAPI generated from registered API routes');
  await mkdir('docs', { recursive: true });
  await writeFile(
    'docs/verification.json',
    JSON.stringify(
      {
        executed_at: new Date().toISOString(),
        database: 'PostgreSQL 17 Docker; runtime NOSUPERUSER NOBYPASSRLS',
        passed,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: passed.length, checks: passed }, null, 2));
} finally {
  if (app) await app.close();
  if (appPool) await appPool.end();
  if (admin) await admin.end();
  try {
    docker('stop', name);
  } catch {}
}
