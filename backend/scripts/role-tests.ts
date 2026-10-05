import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { z } from 'zod';
import { createPool } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/security.js';
import { permissionPage, pages, tenantRoles, financialPages } from '../src/permissions.js';
import type { Endpoint } from '../src/http.js';

/**
 * 11-bosqich: 10 rol bilan to'liq sinov.
 * 1) Rol × GET endpoint matritsasi: /v1/me/permissions kutgan natija bilan haqiqiy HTTP javob solishtiriladi.
 * 2) Kompaniyalararo kirish, individual taqiq, sahifa CRUD, obyekt/ombor chegarasi, narx yashirish.
 * 3) Takroriy va parallel so'rovlarda pul/material/progress ikki marta yozilmasligi.
 * Natija: docs/BARPO_ROLE_TEST_REPORT.md va docs/role-verification.json.
 */
const name = `barpo-role-test-${process.pid}`,
  secret = randomBytes(18).toString('hex'),
  pass = 'RoleTestPassword!123';
const docker = (...args: string[]) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
let owner: ReturnType<typeof createPool> | undefined,
  appPool: ReturnType<typeof createPool> | undefined,
  app: Awaited<ReturnType<typeof buildApp>>['app'] | undefined;
const passed: string[] = [];
const findings: string[] = [];
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
  owner = createPool(`postgresql://postgres:${secret}@127.0.0.1:${port}/postgres`);
  for (let i = 0; ; i++) {
    try {
      await owner.query('SELECT 1');
      break;
    } catch (error) {
      if (i > 40) throw error;
      await delay(500);
    }
  }
  await migrate(owner);
  await owner.query(
    `CREATE ROLE barpo_app LOGIN PASSWORD '${secret}' NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO barpo_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO barpo_app`,
  );
  appPool = createPool(`postgresql://barpo_app:${secret}@127.0.0.1:${port}/postgres`);
  for (const [login, role] of [
    ['owner', 'platform_owner'],
    ['tech', 'super_admin'],
    ['helpdesk', 'support'],
  ])
    await owner.query(
      'INSERT INTO users(login,display_name,password_hash,role) VALUES($1,$1,$2,$3)',
      [login, await hashPassword(pass), role],
    );
  process.env.AUTH_RATE_LIMIT_PER_MINUTE = '100000';
  process.env.RATE_LIMIT_PER_MINUTE = '1000000';
  process.env.TELEGRAM_BOT_TOKEN = 'role-test-token';
  const built = await buildApp(appPool);
  app = built.app;
  const definitions: Endpoint[] = built.definitions;
  /** Xom so'rov: status + body (assert yo'q). */
  const raw = async (method: string, url: string, body?: unknown, token?: string, key?: string) => {
    const res = await app!.inject({
      method: method as any,
      url,
      payload: body,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(method !== 'GET' ? { 'idempotency-key': key ?? randomUUID() } : {}),
      },
    });
    let json: any = null;
    try {
      json = res.json();
    } catch {
      json = null;
    }
    return { status: res.statusCode, body: json };
  };
  const call = async (
    method: string,
    url: string,
    body?: unknown,
    token?: string,
    expected = 200,
    key?: string,
  ) => {
    const r = await raw(method, url, body, token, key);
    assert.equal(r.status, expected, `${method} ${url}: ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const login = async (user: string, password = pass) =>
    (await call('POST', '/v1/auth/login', { login: user, password })).access_token as string;
  const ownerToken = await login('owner');
  const techToken = await login('tech');
  const helpToken = await login('helpdesk');

  // ---------------------------------------------------------------- Seed: ikki kompaniya
  const makeTenant = async (key: string, adminLogin: string) => {
    const t = await call(
      'POST',
      '/v1/platform/tenants',
      { legal_name: `Korxona ${key}`, registration_key: key },
      ownerToken,
    );
    const invite = await call(
      'POST',
      `/v1/platform/tenants/${t.id}/invites`,
      undefined,
      ownerToken,
    );
    const reg = await call('POST', '/v1/auth/register', {
      token: invite.token,
      login: adminLogin,
      password: pass,
      display_name: `Admin ${key}`,
    });
    return {
      id: t.id as string,
      adminToken: reg.access_token as string,
      adminId: reg.user.id as string,
    };
  };
  const A = await makeTenant('ROLE-A', 'admin_a');
  const B = await makeTenant('ROLE-B', 'admin_b');
  const employee = async (tenantAdmin: string, role: string, loginName: string) => {
    const user = await call(
      'POST',
      '/v1/employees',
      { login: loginName, display_name: loginName, password: pass, role },
      tenantAdmin,
    );
    const first = await login(loginName);
    await call(
      'POST',
      '/v1/auth/password',
      { current_password: pass, new_password: pass + '2' },
      first,
    );
    return {
      id: user.id as string,
      role,
      login: loginName,
      token: await login(loginName, pass + '2'),
    };
  };
  const staff: Record<string, { id: string; role: string; login: string; token: string }> = {};
  for (const role of tenantRoles.filter((r) => r !== 'tenant_admin'))
    staff[role] = await employee(A.adminToken, role, `a_${role}`);
  staff.tenant_admin = {
    id: A.adminId,
    role: 'tenant_admin',
    login: 'admin_a',
    token: A.adminToken,
  };
  const projectA1 = await call(
    'POST',
    '/v1/projects',
    { name: 'Obyekt A1', code: 'A1' },
    A.adminToken,
  );
  const projectA2 = await call(
    'POST',
    '/v1/projects',
    { name: 'Obyekt A2 (biriktirilmagan)', code: 'A2' },
    A.adminToken,
  );
  const projectB1 = await call(
    'POST',
    '/v1/projects',
    { name: 'Obyekt B1', code: 'B1' },
    B.adminToken,
  );
  for (const role of Object.keys(staff))
    if (role !== 'tenant_admin')
      await call(
        'POST',
        `/v1/employees/${staff[role]!.id}/assignments`,
        { project_id: projectA1.id },
        A.adminToken,
      );
  const zone = await call(
    'POST',
    `/v1/projects/${projectA1.id}/zones`,
    { name: '1-qavat' },
    A.adminToken,
  );
  const warehouse = await call(
    'POST',
    '/v1/warehouses',
    { project_id: projectA1.id, name: 'Ombor A1' },
    A.adminToken,
  );
  const warehouse2 = await call(
    'POST',
    '/v1/warehouses',
    { project_id: projectA1.id, name: 'Ombor A1-2 (biriktirilmagan)' },
    A.adminToken,
  );
  await call(
    'POST',
    `/v1/employees/${staff.warehouse_manager!.id}/assignments`,
    { project_id: projectA1.id, warehouse_id: warehouse.warehouse.id },
    A.adminToken,
  );
  const custody = await call(
    'POST',
    '/v1/stock/custody',
    { project_id: projectA1.id, custodian_id: staff.brigadier!.id },
    A.adminToken,
  );
  const material = await call(
    'POST',
    '/v1/materials',
    { name: 'Sement', unit_id: 'kg' },
    A.adminToken,
  );
  const materialB = await call(
    'POST',
    '/v1/materials',
    { name: 'G‘isht', unit_id: 'pcs' },
    B.adminToken,
  );
  const receiptKey = randomUUID();
  const receiptBody = {
    project_id: projectA1.id,
    kind: 'receipt',
    material_id: material.id,
    to_account_id: warehouse.account.id,
    quantity: '100',
    unit_cost: '1000',
    reason: 'Yetkazib beruvchidan kirim',
  };
  const receipt = await call(
    'POST',
    '/v1/stock/commands',
    receiptBody,
    staff.warehouse_manager!.token,
    200,
    receiptKey,
  );
  const receiptReplay = await call(
    'POST',
    '/v1/stock/commands',
    receiptBody,
    staff.warehouse_manager!.token,
    200,
    receiptKey,
  );
  assert.equal(receiptReplay.id, receipt.id);
  const transfer = await call(
    'POST',
    '/v1/stock/commands',
    {
      project_id: projectA1.id,
      kind: 'transfer',
      material_id: material.id,
      from_account_id: warehouse.account.id,
      to_account_id: custody.id,
      quantity: '60',
      reason: 'Brigadaga',
    },
    staff.warehouse_manager!.token,
  );
  await call(
    'POST',
    `/v1/stock/commands/${transfer.id}/actions`,
    { version: 1, action: 'accept', quantity: '60' },
    staff.brigadier!.token,
  );
  const consumption = await call(
    'POST',
    '/v1/stock/commands',
    {
      project_id: projectA1.id,
      kind: 'consumption',
      material_id: material.id,
      from_account_id: custody.id,
      quantity: '20',
      reason: 'Devor uchun',
    },
    staff.brigadier!.token,
  );
  await call(
    'POST',
    `/v1/stock/commands/${consumption.id}/actions`,
    { version: 1, action: 'review' },
    staff.foreman!.token,
  );
  const estimate = await call(
    'POST',
    '/v1/estimates',
    {
      project_id: projectA1.id,
      name: 'Asosiy smeta',
      lines: [
        {
          kind: 'material',
          description: 'Sement',
          material_id: material.id,
          unit_id: 'kg',
          quantity: '100',
          unit_price: '1000',
          zone_id: zone.id,
        },
        {
          kind: 'labor',
          description: 'Devor terish',
          unit_id: 'm2',
          quantity: '50',
          unit_price: '20000',
          zone_id: zone.id,
        },
      ],
    },
    A.adminToken,
  );
  const workLine = estimate.lines.find((l: any) => l.kind === 'labor');
  const task = await call(
    'POST',
    '/v1/tasks',
    {
      project_id: projectA1.id,
      title: 'Sinov vazifasi',
      assignee_id: staff.brigadier!.id,
      reviewer_id: staff.foreman!.id,
      priority: 'normal',
    },
    A.adminToken,
  );
  const report = await call(
    'POST',
    '/v1/reports',
    {
      project_id: projectA1.id,
      kind: 'daily',
      report_date: '2026-10-01',
      content: 'Devor terildi',
      progress_quantity: '5',
      estimate_line_id: workLine.id,
    },
    staff.brigadier!.token,
  );
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const file = await call(
    'POST',
    '/v1/files',
    {
      project_id: projectA1.id,
      report_id: report.id,
      name: 'foto.png',
      mime_type: 'image/png',
      base64: png,
    },
    staff.brigadier!.token,
  );
  const supplier = await call(
    'POST',
    '/v1/counterparties',
    { name: 'Supplier A', kind: 'supplier' },
    A.adminToken,
  );
  const treasury = await call(
    'POST',
    '/v1/cash-accounts',
    { name: 'Kassa', kind: 'cash' },
    A.adminToken,
  );
  const labor = await call(
    'POST',
    '/v1/finance/documents',
    {
      project_id: projectA1.id,
      kind: 'labor',
      amount: '500000',
      counterparty_id: supplier.id,
      description: 'Ish haqi akti',
      document_date: '2026-10-01',
    },
    A.adminToken,
  );
  const payKey = randomUUID();
  const payBody = {
    project_id: projectA1.id,
    kind: 'payment',
    amount: '200000',
    counterparty_id: supplier.id,
    cash_account_id: treasury.id,
    allocated_invoice_id: labor.id,
    description: 'Qisman to‘lov',
    document_date: '2026-10-02',
  };
  const payment = await call('POST', '/v1/finance/documents', payBody, A.adminToken, 200, payKey);
  const paymentReplay = await call(
    'POST',
    '/v1/finance/documents',
    payBody,
    A.adminToken,
    200,
    payKey,
  );
  assert.equal(paymentReplay.id, payment.id);
  const payrollPeriod = await call(
    'POST',
    '/v1/finance/payroll/periods',
    { project_id: projectA1.id, month: '2026-10-01' },
    A.adminToken,
  );
  await call(
    'POST',
    '/v1/finance/payment-requests',
    {
      project_id: projectA1.id,
      counterparty_id: supplier.id,
      amount: '100000',
      purpose: 'Qolgan to‘lov uchun so‘rov',
    },
    staff.financier!.token,
  );
  const plan = await call(
    'POST',
    '/v1/platform/plans',
    { code: 'standard', version: 1, monthly_price: '450000.00' },
    ownerToken,
  );
  await call(
    'POST',
    '/v1/platform/subscriptions',
    { tenant_id: A.id, plan_version_id: plan.id },
    ownerToken,
  );
  passed.push(
    'Seed: two tenants, seven tenant roles, project/zone/warehouse/custody, stock chain, estimate, task, report+photo, finance documents, payroll, payment request, plan',
  );

  // ---------------------------------------------------------------- 1. Rol × endpoint matritsasi
  const ids: Record<string, string> = {
    '/v1/projects': projectA1.id,
    '/v1/estimates': estimate.id,
    '/v1/tasks': task.id,
    '/v1/reports': report.id,
    '/v1/files': file.id,
    '/v1/counterparties': supplier.id,
    '/v1/cash-accounts': treasury.id,
    '/v1/stock/accounts': warehouse.account.id,
    '/v1/employees': staff.foreman!.id,
    '/v1/platform/tenants': A.id,
    '/v1/finance/payroll/periods': payrollPeriod.id,
    '/v1/stock/commands': receipt.id,
    '/v1/progress-entries': report.id,
  };
  const queryValues: Record<string, string> = {
    project_id: projectA1.id,
    report_id: report.id,
    task_id: task.id,
    from: '2026-01-01',
    to: '2026-12-31',
    account_id: warehouse.account.id,
    material_id: material.id,
    counterparty_id: supplier.id,
    tenant_id: A.id,
  };
  const fillUrl = (route: Endpoint) => {
    const prefix = Object.keys(ids)
      .filter((p) => route.path.startsWith(p + '/'))
      .sort((a, b) => b.length - a.length)[0];
    let path = route.path.replace(/:revision/g, '1');
    if (/:id/.test(path)) {
      if (!prefix) return null;
      path = path.replace(/:id/g, ids[prefix]!);
    }
    if (/:[a-z_]+/.test(path)) return null;
    const params: string[] = [];
    if (route.query) {
      const json = z.toJSONSchema(route.query, { unrepresentable: 'any', io: 'input' }) as any;
      for (const key of json.required ?? []) {
        if (!(key in queryValues)) return null;
        params.push(`${key}=${encodeURIComponent(queryValues[key]!)}`);
      }
    }
    return path + (params.length ? '?' + params.join('&') : '');
  };
  const gets = definitions.filter((r) => r.method === 'GET' && !r.public);
  const unfillable = gets.filter((r) => fillUrl(r) === null).map((r) => r.path);
  const matrix: Record<string, { allowed: number; denied: number; mismatches: string[] }> = {};
  const expectTenant = (route: Endpoint, snap: any) => {
    if (route.platform) return false;
    if (route.adminOnly && snap.role !== 'tenant_admin') return false;
    // Hujjatlar ro'yxati sub-sahifalar bo'yicha ichkarida tekshiradi: biror moliyaviy sahifa o'qilsa ochiq.
    if (route.path === '/v1/finance/documents')
      return Object.values(financialPages).some((p) => Boolean(snap.pages[p!]?.read));
    if (!route.permission && !route.page) return true;
    const page = route.page ?? permissionPage[route.permission!][0];
    const action = route.action ?? 'read';
    const pageOk = Boolean(snap.pages[page]?.[action]);
    const permOk = !route.permission || snap.permissions.includes(route.permission);
    return pageOk && permOk;
  };
  for (const role of Object.keys(staff)) {
    const token = staff[role]!.token;
    const snap = await call('GET', '/v1/me/permissions', undefined, token);
    const cell = (matrix[role] = { allowed: 0, denied: 0, mismatches: [] });
    for (const route of gets) {
      const url = fillUrl(route);
      if (!url) continue;
      const expected = expectTenant(route, snap);
      const r = await raw('GET', url, undefined, token);
      const actuallyDenied = r.status === 403;
      if (expected) cell.allowed++;
      else cell.denied++;
      if (expected === actuallyDenied)
        cell.mismatches.push(
          `${role}: GET ${route.path} expected ${expected ? 'allow' : '403'}, got ${r.status} ${r.body?.error?.code ?? ''}`,
        );
    }
  }
  for (const [role, token] of [
    ['platform_owner', ownerToken],
    ['super_admin', techToken],
    ['support', helpToken],
  ] as const) {
    const cell = (matrix[role] = { allowed: 0, denied: 0, mismatches: [] });
    for (const route of gets) {
      const url = fillUrl(route);
      if (!url) continue;
      const expected = route.platform
        ? route.platform.includes(role)
        : Boolean(route.passwordChange);
      const r = await raw('GET', url, undefined, token);
      if (expected) cell.allowed++;
      else cell.denied++;
      if (expected === (r.status === 403))
        cell.mismatches.push(
          `${role}: GET ${route.path} expected ${expected ? 'allow' : '403'}, got ${r.status} ${r.body?.error?.code ?? ''}`,
        );
    }
  }
  const allMismatches = Object.values(matrix).flatMap((m) => m.mismatches);
  findings.push(...allMismatches);
  assert.deepEqual(allMismatches, [], 'role × endpoint matrix mismatches');
  passed.push(
    `Role × GET endpoint matrix: ${gets.length - unfillable.length} endpoints × 10 roles match /v1/me/permissions (403 exactly where expected)`,
  );

  // ---------------------------------------------------------------- 2. Kompaniyalararo kirish
  const crossGets = gets.filter((r) => /:id/.test(r.path) && !r.platform);
  const leaks: string[] = [];
  for (const route of crossGets) {
    const url = fillUrl(route);
    if (!url) continue;
    const r = await raw('GET', url, undefined, B.adminToken);
    if (r.status === 200) leaks.push(`GET ${route.path} → 200 for other tenant`);
  }
  const crossWrites: [string, string, unknown][] = [
    ['PATCH', `/v1/projects/${projectA1.id}`, { version: projectA1.version, name: 'Hijack' }],
    ['POST', `/v1/tasks/${task.id}/transition`, { version: task.version, status: 'in_progress' }],
    ['POST', `/v1/employees/${staff.foreman!.id}/assignments`, { project_id: projectB1.id }],
    [
      'POST',
      '/v1/stock/commands',
      {
        project_id: projectB1.id,
        kind: 'receipt',
        material_id: material.id,
        to_account_id: warehouse.account.id,
        quantity: '1',
        unit_cost: '1',
        reason: 'Chet material bilan kirim',
      },
    ],
    [
      'POST',
      '/v1/finance/documents',
      {
        project_id: projectB1.id,
        kind: 'labor',
        amount: '1',
        counterparty_id: supplier.id,
        description: 'Chet kontragent',
        document_date: '2026-10-01',
      },
    ],
  ];
  for (const [method, url, body] of crossWrites) {
    const r = await raw(method, url, body, B.adminToken);
    if (r.status < 400) leaks.push(`${method} ${url} → ${r.status} for other tenant`);
  }
  const rA = await raw('GET', `/v1/projects/${projectB1.id}`, undefined, A.adminToken);
  if (rA.status === 200) leaks.push('tenant A admin reads tenant B project');
  const mB = await raw('GET', '/v1/materials', undefined, B.adminToken);
  if (mB.body.items.some((m: any) => m.id === material.id))
    leaks.push('tenant B list contains tenant A material');
  findings.push(...leaks);
  assert.deepEqual(leaks, [], 'cross-tenant leaks');
  passed.push(
    `Cross-tenant isolation: ${crossGets.length} id-routes and 5 writes with foreign ids are rejected; lists stay tenant-scoped`,
  );

  // ---------------------------------------------------------------- 3. Individual taqiq, sahifa CRUD, chegaralar, narx
  await call(
    'POST',
    `/v1/employees/${staff.foreman!.id}/permissions`,
    { permission: 'stock.read', effect: 'deny' },
    A.adminToken,
  );
  const foremanAgain = await login('a_foreman', pass + '2');
  await call('GET', `/v1/stock/overview?project_id=${projectA1.id}`, undefined, foremanAgain, 403);
  assert.equal(
    (await call('GET', '/v1/me/permissions', undefined, foremanAgain)).pages.stock.read,
    false,
  );
  await call(
    'POST',
    `/v1/employees/${staff.foreman!.id}/permissions`,
    { permission: 'stock.read', effect: 'inherit' },
    A.adminToken,
  );
  await call(
    'GET',
    `/v1/stock/overview?project_id=${projectA1.id}`,
    undefined,
    await login('a_foreman', pass + '2'),
  );
  let rp = await call('GET', '/v1/company/role-permissions', undefined, A.adminToken);
  await call(
    'POST',
    '/v1/company/role-permissions',
    {
      version: rp.version,
      role: 'brigadier',
      rules: [{ page: 'reports', read: false, create: false, update: false, delete: false }],
    },
    A.adminToken,
  );
  await call(
    'GET',
    `/v1/reports?project_id=${projectA1.id}`,
    undefined,
    staff.brigadier!.token,
    403,
  );
  await call(
    'POST',
    '/v1/reports',
    { project_id: projectA1.id, kind: 'daily', report_date: '2026-10-02', content: 'Taqiqlangan' },
    staff.brigadier!.token,
    403,
  );
  rp = await call('GET', '/v1/company/role-permissions', undefined, A.adminToken);
  await call(
    'POST',
    '/v1/company/role-permissions',
    {
      version: rp.version,
      role: 'brigadier',
      rules: [{ page: 'reports', read: true, create: true, update: true, delete: false }],
    },
    A.adminToken,
  );
  await call('GET', `/v1/reports?project_id=${projectA1.id}`, undefined, staff.brigadier!.token);
  await call(
    'GET',
    `/v1/stock/overview?project_id=${projectA2.id}`,
    undefined,
    staff.brigadier!.token,
    404,
  );
  await call('GET', `/v1/tasks?project_id=${projectA2.id}`, undefined, staff.foreman!.token, 404);
  await call(
    'GET',
    `/v1/stock/accounts/${warehouse2.account.id}/balances`,
    undefined,
    staff.warehouse_manager!.token,
    404,
  );
  await call(
    'POST',
    '/v1/stock/commands',
    {
      project_id: projectA1.id,
      kind: 'receipt',
      material_id: material.id,
      to_account_id: warehouse2.account.id,
      quantity: '1',
      unit_cost: '1',
      reason: 'Biriktirilmagan ombor',
    },
    staff.warehouse_manager!.token,
    404,
  );
  const hasKey = (value: any, keys: string[]): string | null => {
    if (Array.isArray(value)) {
      for (const v of value) {
        const k = hasKey(v, keys);
        if (k) return k;
      }
      return null;
    }
    if (value && typeof value === 'object')
      for (const [k, v] of Object.entries(value)) {
        if (keys.includes(k) && v !== null && v !== undefined) return k;
        const inner = hasKey(v, keys);
        if (inner) return inner;
      }
    return null;
  };
  const priceKeys = ['unit_price', 'unit_cost', 'total', 'value', 'value_delta', 'amount', 'price'];
  // Narx huquqi yo'q rollar: prorab (smeta o'qiydi, narx yo'q) va brigadir (ombor/ish qatorlari/dashboard).
  const priceChecks: [string, string, string][] = [
    ['estimate card (foreman)', `/v1/estimates/${estimate.id}`, staff.foreman!.token],
    ['estimates list (foreman)', `/v1/estimates?project_id=${projectA1.id}`, staff.foreman!.token],
    [
      'stock overview (brigadier)',
      `/v1/stock/overview?project_id=${projectA1.id}`,
      staff.brigadier!.token,
    ],
    [
      'stock overview (foreman)',
      `/v1/stock/overview?project_id=${projectA1.id}`,
      staff.foreman!.token,
    ],
    ['work lines (brigadier)', `/v1/projects/${projectA1.id}/work-lines`, staff.brigadier!.token],
    ['dashboard (brigadier)', '/v1/dashboard', staff.brigadier!.token],
    ['dashboard (foreman)', '/v1/dashboard', staff.foreman!.token],
    ['tasks (brigadier)', `/v1/tasks?project_id=${projectA1.id}`, staff.brigadier!.token],
  ];
  for (const [label, url, token] of priceChecks) {
    const r = await raw('GET', url, undefined, token);
    assert.equal(r.status, 200, `${label}: ${r.status} ${JSON.stringify(r.body)}`);
    // Dashboardda `total` — obyektlar soni; pul maydonlari faqat finance blokida (narxsiz rolda null).
    const leaked = hasKey(
      r.body,
      label.startsWith('dashboard') ? priceKeys.filter((k) => k !== 'total') : priceKeys,
    );
    if (leaked) findings.push(`price leak in ${label}: ${leaked}`);
  }
  await call('GET', `/v1/estimates/${estimate.id}`, undefined, staff.brigadier!.token, 403);
  await call('GET', '/v1/finance/summary', undefined, staff.brigadier!.token, 403);
  await call(
    'GET',
    `/v1/finance/plan-actual/export?project_id=${projectA1.id}`,
    undefined,
    staff.brigadier!.token,
    403,
  );
  assert.deepEqual(
    findings.filter((f) => f.startsWith('price leak')),
    [],
  );
  passed.push(
    'Individual deny beats role grant; role page revoke blocks read and create; unassigned project/warehouse → 404; brigadier responses carry no price fields',
  );

  // ---------------------------------------------------------------- 4. Takror / parallel yozuvlar
  const ledgerRows = (
    await owner.query('SELECT count(*)::int n FROM stock_ledger WHERE command_id=$1', [receipt.id])
  ).rows[0].n;
  assert.equal(ledgerRows, 1, 'idempotent receipt writes one ledger row');
  const journalRows = (
    await owner.query('SELECT count(*)::int n FROM journal_entries WHERE finance_document_id=$1', [
      payment.id,
    ])
  ).rows[0].n;
  assert(journalRows >= 2 && journalRows <= 4, 'idempotent payment posts one journal set');
  const t2 = await call('GET', `/v1/tasks/${task.id}`, undefined, staff.brigadier!.token);
  const races = await Promise.all(
    [1, 2].map(() =>
      raw(
        'POST',
        `/v1/tasks/${task.id}/transition`,
        { version: t2.version, status: 'in_progress' },
        staff.brigadier!.token,
      ),
    ),
  );
  assert.deepEqual(
    races.map((r) => r.status).sort(),
    [200, 409],
    'parallel transitions: one wins, one VERSION_CONFLICT',
  );
  const reviewKey = randomUUID();
  const reviewBody = {
    version: report.version,
    action: 'accepted',
    reason: 'Qabul qilindi, hajm mos',
  };
  await call(
    'POST',
    `/v1/reports/${report.id}/review`,
    reviewBody,
    staff.foreman!.token,
    200,
    reviewKey,
  );
  await call(
    'POST',
    `/v1/reports/${report.id}/review`,
    reviewBody,
    staff.foreman!.token,
    200,
    reviewKey,
  );
  const again = await raw(
    'POST',
    `/v1/reports/${report.id}/review`,
    reviewBody,
    staff.foreman!.token,
  );
  assert.notEqual(again.status, 200, 'stale version re-accept is rejected');
  const progressRows = (
    await owner.query(
      'SELECT count(*)::int n,sum(quantity)::text q FROM progress_entries WHERE report_id=$1',
      [report.id],
    )
  ).rows[0];
  assert.deepEqual([progressRows.n, progressRows.q], [1, '5.000000']);
  // Ishlatilgan kirim qaytarilmaydi (REVERSAL_STOCK_ALREADY_USED); yangi kirim bir marta qaytariladi.
  const usedReverse = await raw(
    'POST',
    `/v1/stock/commands/${receipt.id}/reverse`,
    { reason: 'Xato kirim, qaytarildi' },
    A.adminToken,
  );
  assert.equal(usedReverse.status, 409);
  const receipt2 = await call(
    'POST',
    '/v1/stock/commands',
    { ...receiptBody, quantity: '5', reason: 'Qaytariladigan kirim' },
    staff.warehouse_manager!.token,
  );
  const reverse = await call(
    'POST',
    `/v1/stock/commands/${receipt2.id}/reverse`,
    { reason: 'Xato kirim, qaytarildi' },
    A.adminToken,
    200,
  );
  const reverseTwice = await raw(
    'POST',
    `/v1/stock/commands/${receipt2.id}/reverse`,
    { reason: 'Xato kirim, qaytarildi' },
    A.adminToken,
  );
  assert.equal(
    reverseTwice.status,
    409,
    `second reversal must conflict, got ${reverseTwice.status} ${JSON.stringify(reverseTwice.body)}`,
  );
  assert(reverse.id);
  passed.push(
    'Replays with the same idempotency key, parallel version races, double accept and double reversal never write money/material/progress twice',
  );

  // ---------------------------------------------------------------- 5. Hisobot
  const skipped = [
    'UySot, bank, Didox, iHamkor, kamera va obuna to‘lov provayderlari — kirish (hujjat, sandbox, kalit) yo‘q; adapterlar `not_configured`, `POST /v1/billing/checkout` 503 PAYMENT_PROVIDER_NOT_CONFIGURED',
    'Telegram real yetkazilishi — bot tokeni faqat jonli muhitda; testlarda outbox va chat_state oqimi tekshiriladi',
  ];
  const roleTable = Object.keys(matrix)
    .map(
      (role) =>
        `| ${role} | ${matrix[role]!.allowed} | ${matrix[role]!.denied} | ${matrix[role]!.mismatches.length} |`,
    )
    .join('\n');
  const pageRows: string[] = [];
  for (const role of Object.keys(staff)) {
    const snap = await call('GET', '/v1/me/permissions', undefined, staff[role]!.token);
    pageRows.push(
      `| ${role} | ${pages.map((p) => (snap.pages[p].read ? (snap.pages[p].create || snap.pages[p].update ? 'RW' : 'R') : '—')).join(' | ')} |`,
    );
  }
  const report_md = `# BARPO AI — 11-bosqich: rol bo‘yicha to‘liq sinov hisoboti

Bajarildi: ${new Date().toISOString()} (\`npm run test:roles\`, vaqtinchalik PostgreSQL 17 Docker, runtime NOSUPERUSER NOBYPASSRLS). Har bosqichda avtomatik qayta yuriladi; qo‘lda tahrirlanmaydi.

## Natija

${passed.map((p) => `- ✅ ${p}`).join('\n')}

Ochiq xatolar: ${findings.length === 0 ? 'yo‘q' : findings.map((f) => `\n- ❌ ${f}`).join('')}

## Rol × GET endpoint matritsasi

Har rol uchun ${gets.length - unfillable.length} ta GET endpoint chaqirildi; kutilgan natija \`/v1/me/permissions\` (sahifa CRUD + domen ruxsati) va marshrut metama’lumotidan hisoblandi. «Mos kelmadi» ustuni 0 bo‘lishi shart.

| Rol | Ruxsat kutilgan | 403 kutilgan | Mos kelmadi |
| --- | --- | --- | --- |
${roleTable}

Parametri to‘ldirilmagan (matritsadan tashqari) endpointlar: ${unfillable.length ? unfillable.map((u) => `\`${u}\``).join(', ') : 'yo‘q'}.

## Sahifa ruxsatlari (standart rol siyosati, kompaniya A)

R — o‘qish, RW — o‘qish va yozish (create yoki update), — yo‘q.

| Rol | ${pages.join(' | ')} |
| --- | ${pages.map(() => '---').join(' | ')} |
${pageRows.join('\n')}

## Provayderga bog‘liq, bajarilmagan testlar

${skipped.map((s) => `- ⏸ ${s}`).join('\n')}

## Qamrov haqida

To‘liq biznes ssenariy (kompaniya → xodim → obyekt → smeta → kirim → jo‘natish → qabul → sarf → invoys → to‘lov → hisobot → dashboard) \`npm run test:integration\` va brauzer e2e \`npm run test:ui\` da yuradi; ularning natijalari \`verification.json\` va \`ui-verification.json\` da.
`;
  await mkdir('docs', { recursive: true });
  await writeFile('docs/BARPO_ROLE_TEST_REPORT.md', report_md);
  await writeFile(
    'docs/role-verification.json',
    JSON.stringify(
      { executed_at: new Date().toISOString(), passed, findings, matrix, unfillable, skipped },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: passed.length, findings, unfillable }, null, 2));
} catch (error) {
  if (findings.length) console.error('FINDINGS', JSON.stringify(findings, null, 2));
  throw error;
} finally {
  if (app) await app.close();
  if (appPool) await appPool.end();
  if (owner) await owner.end();
  try {
    docker('stop', name);
  } catch {}
}
