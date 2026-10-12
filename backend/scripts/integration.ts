import {
  startMaterialRequest,
  continueFlow,
  loadState,
  hasFlow,
  startProgressReport,
  continueProgressFlow,
} from '../src/telegram-flows.js';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { writeFile, mkdir } from 'node:fs/promises';
import { createPool, transaction, one } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { buildApp } from '../src/app.js';
import { issueDueInvoices, periodEnd } from '../src/billing.js';
import { hashPassword, digest } from '../src/security.js';
import { dec } from '../src/money.js';
import { refreshRates } from '../src/rates.js';
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
const failed: string[] = [];
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
  const tenantSearch = await call(
    'GET',
    '/v1/platform/tenants?q=sinov&state=trial',
    undefined,
    ownerToken,
  );
  assert.deepEqual(
    tenantSearch.items.map((x: any) => x.id),
    [t.id],
  );
  assert.equal(
    (await call('GET', '/v1/platform/tenants?state=paid', undefined, ownerToken)).items.length,
    0,
  );
  passed.push('Platform tenant list filters by q and access state on the server');
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
  // ---- 1.1: ro'yxat qidiruvi va filtrlari serverda (sahifalash bilan birga ishlashi uchun)
  const projectSearch = await call('GET', '/v1/projects?q=obyekt%20a', undefined, adminToken);
  assert.deepEqual(
    projectSearch.items.map((p: any) => p.id),
    [project.id],
  );
  assert.equal((await call('GET', '/v1/projects?q=yoq', undefined, adminToken)).items.length, 0);
  assert.equal(
    (await call('GET', '/v1/projects?status=completed', undefined, adminToken)).items.length,
    0,
  );
  const employeeSearch = await call(
    'GET',
    '/v1/employees?q=FORE&role=foreman&active=true',
    undefined,
    adminToken,
  );
  assert.deepEqual(
    employeeSearch.items.map((e: any) => e.id),
    [foreman.id],
  );
  assert.equal(
    (await call('GET', '/v1/employees?active=false', undefined, adminToken)).items.length,
    0,
  );
  await call('GET', '/v1/employees?active=yes', undefined, adminToken, undefined, 400);
  passed.push('Project and employee lists filter by q, status, role and active on the server');
  // ---- API-09: obyekt qidiruvi (kod, buyurtmachi, manzil, status) va prorab doirasi
  const projectB = await call(
    'POST',
    '/v1/projects',
    {
      name: 'Obyekt B',
      code: 'PRJ-77',
      customer_name: 'Buyurtmachi Sardor',
      address: 'Chilonzor 5-mavze',
      status: 'active',
    },
    adminToken,
  );
  assert.equal(project.status, 'planning');
  for (const filter of ['q=prj-77', 'q=sardor', 'q=chilonzor', 'status=active'])
    assert.deepEqual(
      (await call('GET', `/v1/projects?${filter}`, undefined, adminToken)).items.map(
        (p: any) => p.id,
      ),
      [projectB.id],
    );
  assert.equal(
    (await call('GET', '/v1/projects?q=obyekt%20b', undefined, foreman.token)).items.length,
    0,
  );
  assert.deepEqual(
    (await call('GET', '/v1/projects?q=obyekt', undefined, foreman.token)).items.map(
      (p: any) => p.id,
    ),
    [project.id],
  );
  for (const filter of ['q=prj-77', 'q=sardor', 'q=chilonzor'])
    assert.deepEqual(
      (await call('GET', `/v1/projects?${filter}`, undefined, foreman.token)).items,
      [],
    );
  await call('GET', `/v1/projects/${projectB.id}`, undefined, foreman.token, undefined, 404);
  passed.push(
    'Project q matches code, customer and address and status filters on the server; a foreman never finds or opens an unassigned project',
  );
  // ---- 1.3 (OBJ-02/OBJ-04): obyekt maydoni, sana tartibi, rasm; zona turi, qavatlar soni, tahrir (version) va audit
  await call(
    'POST',
    '/v1/projects',
    { name: 'Sana xato', planned_start: '2026-10-10', planned_end: '2026-10-01' },
    adminToken,
    undefined,
    400,
  );
  await call('POST', '/v1/projects', { name: 'Maydon xato', area_m2: '0' }, adminToken, undefined, 400);
  const projectC = await call(
    'POST',
    '/v1/projects',
    { name: 'Obyekt C', area_m2: '1250.50', planned_start: '2026-10-01', planned_end: '2026-10-01' },
    adminToken,
  );
  assert.equal(projectC.area_m2, '1250.50');
  assert.equal(projectC.image_file_id, null);
  await call(
    'PATCH',
    `/v1/projects/${projectC.id}`,
    { version: 1, name: 'Obyekt C', actual_start: '2026-10-05', actual_end: '2026-10-04' },
    adminToken,
    undefined,
    400,
  );
  const png1x1 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const facade = await call(
    'POST',
    '/v1/files',
    { project_id: projectC.id, name: 'fasad.png', mime_type: 'image/png', base64: png1x1 },
    adminToken,
  );
  const foreignFile = await call(
    'POST',
    '/v1/files',
    { project_id: project.id, name: 'boshqa.png', mime_type: 'image/png', base64: png1x1 },
    adminToken,
  );
  await call(
    'PATCH',
    `/v1/projects/${projectC.id}`,
    { version: 1, name: 'Obyekt C', image_file_id: foreignFile.id },
    adminToken,
    undefined,
    404,
  );
  const withImage = await call(
    'PATCH',
    `/v1/projects/${projectC.id}`,
    { version: 1, name: 'Obyekt C', area_m2: '1300', image_file_id: facade.id },
    adminToken,
  );
  assert.equal(withImage.image_file_id, facade.id);
  assert.equal(withImage.area_m2, '1300.00');
  assert.equal(
    (await call('GET', `/v1/projects/${projectC.id}`, undefined, adminToken)).image_file_id,
    facade.id,
  );
  await call(
    'PATCH',
    `/v1/projects/${projectC.id}`,
    { version: 2, name: 'Obyekt C', image_file_id: facade.id, planned_start: '2026-10-10', planned_end: '2026-10-01' },
    adminToken,
    undefined,
    400,
  );
  const noImage = await call(
    'PATCH',
    `/v1/projects/${projectC.id}`,
    { version: 2, name: 'Obyekt C', area_m2: '1300', image_file_id: null },
    adminToken,
  );
  assert.equal(noImage.image_file_id, null);
  await call(
    'PATCH',
    `/v1/projects/${projectC.id}`,
    { version: 3, name: 'Obyekt C', image_file_id: facade.id },
    adminToken,
  );
  // Rasm fayli arxivlansa obyektdagi havola tozalanadi va versiya oshadi; arxivlangan faylni qayta ulab bo'lmaydi
  await call('DELETE', `/v1/files/${facade.id}`, { reason: 'Eski fasad rasmi olib tashlandi' }, adminToken);
  const cleared = await call('GET', `/v1/projects/${projectC.id}`, undefined, adminToken);
  assert.equal(cleared.image_file_id, null);
  assert.equal(cleared.version, 5);
  await call(
    'PATCH',
    `/v1/projects/${projectC.id}`,
    { version: 5, name: 'Obyekt C', image_file_id: facade.id },
    adminToken,
    undefined,
    404,
  );
  // Parallel tahrir: qator band bo'lsa PATCH kutadi va yangi versiyani ko'rib 409 qaytaradi (404 emas)
  const racer = await admin.connect();
  try {
    await racer.query('BEGIN');
    await racer.query('UPDATE projects SET version=version+1 WHERE id=$1', [projectC.id]);
    const pending = call(
      'PATCH',
      `/v1/projects/${projectC.id}`,
      { version: 5, name: 'Obyekt C' },
      adminToken,
      undefined,
      409,
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    await racer.query('COMMIT');
    await pending;
  } finally {
    racer.release();
  }
  await assert.rejects(
    admin.query('UPDATE projects SET image_file_id=$1 WHERE id=$2', [foreignFile.id, projectC.id]),
    /projects_image_file_fk/,
  );
  const block = await call(
    'POST',
    `/v1/projects/${projectC.id}/zones`,
    { name: 'A blok', kind: 'block', floors_count: 9 },
    adminToken,
  );
  assert.equal(block.kind, 'block');
  assert.equal(block.floors_count, 9);
  assert.equal(block.version, 1);
  const floorZone = await call(
    'POST',
    `/v1/projects/${projectC.id}/zones`,
    { name: '1-qavat', parent_id: block.id, kind: 'floor', floors_count: 3 },
    adminToken,
  );
  assert.equal(floorZone.floors_count, null);
  assert.equal(
    (await call('POST', `/v1/projects/${projectC.id}/zones`, { name: 'Hovli' }, adminToken)).kind,
    'other',
  );
  const edited = await call(
    'PATCH',
    `/v1/projects/${projectC.id}/zones/${block.id}`,
    { version: 1, name: 'B blok', kind: 'block', floors_count: 12 },
    adminToken,
  );
  assert.equal(edited.name, 'B blok');
  assert.equal(edited.floors_count, 12);
  assert.equal(edited.version, 2);
  assert.equal(edited.parent_id, null);
  await call(
    'PATCH',
    `/v1/projects/${projectC.id}/zones/${block.id}`,
    { version: 1, name: 'Eskirgan', kind: 'block' },
    adminToken,
    undefined,
    409,
  );
  const retyped = await call(
    'PATCH',
    `/v1/projects/${projectC.id}/zones/${block.id}`,
    { version: 2, name: 'B blok', kind: 'entrance', floors_count: 5 },
    adminToken,
  );
  assert.equal(retyped.floors_count, null);
  await call(
    'PATCH',
    `/v1/projects/${projectC.id}/zones/${block.id}`,
    { version: 3, name: 'B blok', kind: 'block', parent_id: null },
    adminToken,
    undefined,
    400,
  );
  // Sahifa amali (projects.update) scope'dan oldin tekshiriladi: prorab uchun 403, begona obyekt/zona uchun 404
  await call(
    'PATCH',
    `/v1/projects/${projectC.id}/zones/${block.id}`,
    { version: 3, name: 'Chet', kind: 'block' },
    foreman.token,
    undefined,
    403,
  );
  await call(
    'PATCH',
    `/v1/projects/${project.id}/zones/${block.id}`,
    { version: 3, name: 'Chet obyekt', kind: 'block' },
    adminToken,
    undefined,
    404,
  );
  assert.deepEqual(
    (
      await admin.query(
        'SELECT action FROM audit_events WHERE resource_id=$1 ORDER BY created_at,action',
        [block.id],
      )
    ).rows.map((r) => r.action),
    ['zone.create', 'zone.update', 'zone.update'],
  );
  passed.push(
    'Project area, date order and image file are validated; zones carry kind/floors and are edited with version check, scope and audit',
  );
  // ---- API-07/API-11: xodim qidiruvi (telefon, lavozim), hash chiqmasligi, active bayrog'i
  const searcher = await call(
    'POST',
    '/v1/employees',
    {
      login: 'izlovchi',
      display_name: 'Izlovchi Xodim',
      password: pass,
      role: 'manager',
      phone: '+998901234567',
      position: 'Sayt muhandisi',
    },
    adminToken,
  );
  const empIds = async (query: string) =>
    (await call('GET', `/v1/employees?${query}`, undefined, adminToken)).items.map(
      (e: any) => e.id as string,
    );
  assert.deepEqual(await empIds('q=%2B998901234567'), [searcher.id]);
  assert.deepEqual(await empIds('q=901234567'), [searcher.id]);
  assert.deepEqual(await empIds('q=muhandis'), [searcher.id]);
  assert.deepEqual(await empIds('q=xodim'), [searcher.id]);
  assert.deepEqual(await empIds('q=izlovchi'), [searcher.id]);
  assert.deepEqual(await empIds('role=foreman'), [foreman.id]);
  assert(!JSON.stringify(searcher).includes('password_hash'));
  assert(!JSON.stringify(searcher).includes('scrypt$'));
  const employeeJson = JSON.stringify(
    await call('GET', '/v1/employees?limit=100', undefined, adminToken),
  );
  assert(!employeeJson.includes('password_hash') && !employeeJson.includes('scrypt$'));
  await call(
    'PATCH',
    `/v1/employees/${searcher.id}`,
    {
      version: searcher.version,
      display_name: searcher.display_name,
      role: 'manager',
      active: false,
    },
    adminToken,
  );
  assert.deepEqual(await empIds('active=false'), [searcher.id]);
  assert(!(await empIds('active=true&limit=100')).includes(searcher.id));
  assert((await empIds('active=true&limit=100')).includes(foreman.id));
  assert.deepEqual(await empIds('active=0'), await empIds('active=false'));
  passed.push(
    'Employee q matches phone and position, the list never exposes password hashes and active=false/0 and true filter on the server',
  );
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
  const materialSearch = await call('GET', '/v1/materials?q=SEM', undefined, foreman.token);
  assert(materialSearch.items.some((m: any) => m.id === material.id));
  assert.equal(
    (await call('GET', '/v1/materials?q=%25', undefined, foreman.token)).items.length,
    0,
  );
  passed.push('Material search is case-insensitive and escapes LIKE wildcards');
  // ---- API-01..06, API-14: materiallar ro'yxati sahifalash, qidiruv va validatsiya
  const numbered = Array.from({ length: 120 }, (_, i) => `Material ${String(i + 1).padStart(3, '0')}`);
  const materialNames = [...numbered, 'AAA takror', 'AAA takror', 'AAA takror', 'Qum_mayda'];
  for (const materialName of materialNames)
    await call('POST', '/v1/materials', { name: materialName, unit_id: 'kg' }, adminToken);
  const total = materialNames.length + 1;
  const matIds = async (query: string) =>
    (await call('GET', `/v1/materials?${query}`, undefined, foreman.token)).items.map(
      (m: any) => m.id as string,
    );
  const page1 = await matIds('limit=100&offset=0'),
    page2 = await matIds('limit=100&offset=100');
  assert.equal(page1.length, 100);
  assert.equal(page2.length, total - 100);
  assert(!page1.some((id: string) => page2.includes(id)));
  assert.equal(new Set([...page1, ...page2]).size, total);
  assert((await matIds('q=sem')).includes(material.id));
  const underscoreRows = (await call('GET', '/v1/materials?q=_', undefined, foreman.token)).items;
  assert.deepEqual(
    underscoreRows.map((m: any) => m.name),
    ['Qum_mayda'],
  );
  assert.equal((await matIds('q=%25')).length, 0);
  assert.deepEqual(await matIds('q=&limit=100&offset=0'), page1);
  assert.deepEqual(await matIds('q=%20%20&limit=100&offset=0'), page1);
  assert.equal(
    (
      await call('GET', `/v1/materials?q=${'a'.repeat(101)}`, undefined, foreman.token, undefined, 400)
    ).error.code,
    'VALIDATION_ERROR',
  );
  await call('GET', `/v1/materials?q=${'a'.repeat(100)}`, undefined, foreman.token);
  for (const bad of ['limit=0', 'limit=101', 'offset=-1', 'limit=abc'])
    assert.equal(
      (await call('GET', `/v1/materials?${bad}`, undefined, foreman.token, undefined, 400)).error
        .code,
      'VALIDATION_ERROR',
    );
  passed.push(
    'Material list pages without overlap or gaps, searches case-insensitively, treats _ and % literally, ignores blank q, caps q at 100 chars and rejects bad limit/offset with VALIDATION_ERROR',
  );
  const dupFirst = await call('GET', '/v1/materials?limit=2&offset=0', undefined, foreman.token);
  const dupSecond = await call('GET', '/v1/materials?limit=2&offset=2', undefined, foreman.token);
  const dupItems = [...dupFirst.items, ...dupSecond.items];
  assert.equal(new Set(dupItems.map((m: any) => m.id)).size, 4);
  assert.deepEqual(
    dupItems.slice(0, 3).map((m: any) => m.name),
    ['AAA takror', 'AAA takror', 'AAA takror'],
  );
  assert.equal(dupItems.filter((m: any) => m.name === 'AAA takror').length, 3);
  assert.deepEqual(
    dupItems.map((m: any) => m.id),
    (await matIds('limit=4&offset=0')),
  );
  const aaa = dupItems.slice(0, 3).map((m: any) => m.id as string);
  assert.deepEqual(aaa, [...aaa].sort());
  const walked: string[] = [];
  for (let offset = 0; offset < 4; offset++) walked.push(...(await matIds(`limit=1&offset=${offset}`)));
  assert.deepEqual(walked, await matIds('limit=4&offset=0'));
  passed.push('Material pages split a run of equal names deterministically: each duplicate appears exactly once');
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
  // 1.2: jamlar serverdan, decimal; narx huquqi bo'lmagan rolga pul maydonlari kelmaydi, soni qoladi
  const estDetail = await call('GET', `/v1/estimates/${est.id}`, undefined, financier.token);
  assert.deepEqual(estDetail.totals, {
    total: '260.00',
    material_total: '260.00',
    work_total: '0.00',
    by_kind: [{ key: 'material', count: 1, total: '260.00', value: '0.00' }],
    by_category: [{ key: '', count: 1, total: '260.00', value: '0.00' }],
    by_zone: [{ key: '', count: 1, total: '260.00', value: '0.00' }],
  });
  const estForeman = await call('GET', `/v1/estimates/${est.id}`, undefined, foreman.token);
  assert.equal(estForeman.totals.total, undefined);
  assert.deepEqual(estForeman.totals.by_kind, [{ key: 'material', count: 1 }]);
  assert.equal(estForeman.lines[0].fact_value, undefined);
  assert.equal(estForeman.lines[0].fact_quantity, '0');
  const estSearch = await call(
    'GET',
    `/v1/estimates?project_id=${project.id}&q=normali`,
    undefined,
    financier.token,
  );
  assert.deepEqual(
    estSearch.items.map((e: any) => e.id),
    [est.id],
  );
  passed.push('Estimate detail totals and kind/category/zone groups come from the server and are redacted without price permission');
  // ---- EST-01/02/04/08: B obyektida 0.10 li qatorlar bilan jamlar, reviziya va eksport (A obyekti raqamlari o'zgarmasin)
  await call(
    'POST',
    `/v1/employees/${foreman.id}/assignments`,
    { project_id: projectB.id },
    adminToken,
  );
  const zoneB = await call(
    'POST',
    `/v1/projects/${projectB.id}/zones`,
    { name: 'Blok A' },
    adminToken,
  );
  const est2 = await call(
    'POST',
    '/v1/estimates',
    {
      project_id: projectB.id,
      name: 'Kichik summalar',
      lines: [
        {
          kind: 'material',
          description: 'Beton',
          material_id: material.id,
          unit_id: 'kg',
          category: 'Beton',
          zone_id: zoneB.id,
          quantity: '1',
          unit_price: '0.10',
        },
        {
          kind: 'labor',
          description: 'Ish zonasiz',
          unit_id: 'hour',
          category: '',
          quantity: '1',
          unit_price: '0.20',
        },
        {
          kind: 'service',
          description: 'Xizmat',
          unit_id: 'hour',
          category: 'Ish',
          zone_id: zoneB.id,
          quantity: '1',
          unit_price: '0.30',
        },
      ],
    },
    adminToken,
  );
  const est2Detail = await call('GET', `/v1/estimates/${est2.id}`, undefined, adminToken);
  assert.equal(typeof est2Detail.totals.total, 'string');
  // 0.1 + 0.2 + 0.3 === 0.6000000000000001 in floats, so a float regression fails here
  assert.equal(est2Detail.totals.total, '0.60');
  assert.equal(est2Detail.lines.length, 3);
  assert.deepEqual(
    est2Detail.lines.map((l: any) => l.total),
    ['0.10', '0.20', '0.30'],
  );
  assert.equal(est2Detail.totals.material_total, '0.10');
  assert.equal(est2Detail.totals.work_total, '0.50');
  const sumOf = (groups: any[]) => groups.reduce((s, g) => s.plus(g.total), dec('0'));
  for (const groups of [
    est2Detail.totals.by_kind,
    est2Detail.totals.by_category,
    est2Detail.totals.by_zone,
  ])
    assert.equal(sumOf(groups).toFixed(2), est2Detail.totals.total);
  const groupMap = (groups: any[]) =>
    Object.fromEntries(groups.map((g: any) => [g.key, g.total as string]));
  assert.deepEqual(groupMap(est2Detail.totals.by_kind), {
    material: '0.10',
    labor: '0.20',
    service: '0.30',
  });
  assert.deepEqual(groupMap(est2Detail.totals.by_category), {
    Beton: '0.10',
    '': '0.20',
    Ish: '0.30',
  });
  assert.deepEqual(groupMap(est2Detail.totals.by_zone), { 'Blok A': '0.40', '': '0.20' });
  passed.push(
    'Estimate totals are exact decimal strings and kind/category/zone group totals add up to the estimate total',
  );
  const sheetOf = async (token: string) => {
    const res = await call('GET', `/v1/estimates/${est2.id}/export`, undefined, token);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(res.base64, 'base64'));
    const sheet = book.getWorksheet('Smeta')!;
    const headers = (sheet.getRow(1).values as any[]).slice(1).map(String);
    return { sheet, headers };
  };
  const adminSheet = await sheetOf(adminToken);
  const totalCol = adminSheet.headers.indexOf('Jami') + 1;
  assert(totalCol > 0 && adminSheet.headers.includes('Birlik narxi'));
  const descCol = adminSheet.headers.indexOf('Nomi') + 1;
  let exported = dec('0');
  adminSheet.sheet.eachRow((row, i) => {
    if (i === 1 || row.getCell(descCol).value === 'JAMI') return;
    exported = exported.plus(String(row.getCell(totalCol).value));
  });
  assert.equal(exported.toFixed(2), '0.60');
  const jamiRows: any[] = [];
  adminSheet.sheet.eachRow((row) => {
    if (row.getCell(descCol).value === 'JAMI') jamiRows.push(row.getCell(totalCol).value);
  });
  assert.equal(jamiRows.length, 1);
  const jamiCell = jamiRows[0];
  if (dec(String(jamiCell)).eq(est2Detail.totals.total))
    passed.push('Estimate Excel export JAMI row equals totals.total exactly');
  else
    failed.push(
      `Estimate Excel export JAMI row must equal totals.total: file=${jamiCell} totals=${est2Detail.totals.total}`,
    );
  const foremanSheet = await sheetOf(foreman.token);
  assert(!foremanSheet.headers.includes('Jami') && !foremanSheet.headers.includes('Birlik narxi'));
  let foremanHasJami = false;
  foremanSheet.sheet.eachRow((row) => {
    if (row.values && (row.values as any[]).includes('JAMI')) foremanHasJami = true;
  });
  assert(!foremanHasJami);
  // Har eksport auditga yoziladi (handoff 9.8): admin va prorab eksporti, joriy reviziya bilan
  const estExports = (
    await admin.query(
      "SELECT actor_id,details FROM audit_events WHERE action='export.estimate' AND resource_id=$1 ORDER BY created_at",
      [est2.id],
    )
  ).rows;
  assert.deepEqual(
    estExports.map((r) => r.actor_id),
    [auth.user.id, foreman.id],
  );
  assert(estExports.every((r) => r.details.revision === 1));
  passed.push(
    'Estimate Excel export sums to the estimate total, drops price columns without price permission and is audited',
  );
  const est2Revised = await call(
    'PATCH',
    `/v1/estimates/${est2.id}`,
    {
      project_id: projectB.id,
      name: 'Kichik summalar',
      version: 1,
      lines: [
        {
          kind: 'labor',
          description: 'Yangi ish 1',
          unit_id: 'hour',
          category: '',
          quantity: '1',
          unit_price: '0.40',
        },
        {
          kind: 'labor',
          description: 'Yangi ish 2',
          unit_id: 'hour',
          category: '',
          quantity: '1',
          unit_price: '0.05',
        },
      ],
    },
    adminToken,
  );
  assert.equal(est2Revised.revision, 2);
  const est2After = await call('GET', `/v1/estimates/${est2.id}`, undefined, adminToken);
  assert.equal(est2After.totals.total, '0.45');
  assert.deepEqual(groupMap(est2After.totals.by_kind), { labor: '0.45' });
  assert.deepEqual(groupMap(est2After.totals.by_zone), { '': '0.45' });
  assert.deepEqual(groupMap(est2After.totals.by_category), { '': '0.45' });
  assert.equal(est2After.totals.material_total, '0.00');
  assert.equal(est2After.totals.work_total, '0.45');
  const revisions = await call('GET', `/v1/estimates/${est2.id}/revisions`, undefined, adminToken);
  assert.deepEqual(
    revisions.items.map((r: any) => [r.revision, r.line_count, r.total]),
    [
      [2, 2, '0.45'],
      [1, 3, '0.60'],
    ],
  );
  assert.equal(
    (
      await admin.query(
        'SELECT count(*)::int n FROM estimate_lines WHERE estimate_id=$1 AND archived_at IS NOT NULL',
        [est2.id],
      )
    ).rows[0].n,
    3,
  );
  const revisionOne = await call(
    'GET',
    `/v1/estimates/${est2.id}/revisions/1`,
    undefined,
    adminToken,
  );
  assert.equal(revisionOne.lines.length, 3);
  passed.push(
    'Estimate revision archives the old lines, keeps the old snapshot readable and recomputes the total',
  );
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
  // mine bayrog'i: admin vazifada ijrochi ham, tekshiruvchi ham emas
  const taskIds = async (flag: string) =>
    (
      await call('GET', `/v1/tasks?project_id=${project.id}${flag}`, undefined, adminToken)
    ).items.map((x: any) => x.id as string);
  const allTasks = await taskIds('');
  assert(allTasks.includes(task.id));
  assert.deepEqual(await taskIds('&mine=false'), allTasks);
  assert.deepEqual(await taskIds('&mine=0'), allTasks);
  assert.deepEqual(await taskIds('&mine=true'), []);
  await call(
    'GET',
    `/v1/tasks?project_id=${project.id}&mine=yes`,
    undefined,
    adminToken,
    undefined,
    400,
  );
  passed.push('Task list mine=false/0 equals the unfiltered list, mine=true keeps only own tasks');
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
  const cpSearch = await call(
    'GET',
    '/v1/counterparties?q=supp&archived=false',
    undefined,
    adminToken,
  );
  assert.deepEqual(
    cpSearch.items.map((c: any) => c.id),
    [supplier.id],
  );
  assert.equal(
    (await call('GET', '/v1/counterparties?archived=true', undefined, adminToken)).items.length,
    0,
  );
  passed.push('Counterparty search by name/INN and archived filter are server-side');
  // ---- API-07/API-12: INN, telefon, kontakt bo'yicha qidiruv va archived bayrog'i
  const cp2 = await call(
    'POST',
    '/v1/counterparties',
    {
      name: 'Toshkent Qurilish Ta’minot',
      kind: 'supplier',
      inn: '301234567',
      phone: '+998712001122',
      contact: 'Akmal aka',
    },
    adminToken,
  );
  const cpIds = async (query: string) =>
    (await call('GET', `/v1/counterparties?${query}`, undefined, adminToken)).items.map(
      (c: any) => c.id as string,
    );
  for (const q of ['301234567', '712001122', 'akmal'])
    assert.deepEqual(await cpIds(`q=${q}`), [cp2.id]);
  // Yozuvsiz kontragent: qarz va avans ham 2 xonali pul satri
  const cp2Row = (await call('GET', '/v1/counterparties?q=akmal', undefined, adminToken)).items[0];
  assert.equal(cp2Row.debt, '0.00');
  assert.equal(cp2Row.advance, '0.00');
  await call(
    'PATCH',
    `/v1/counterparties/${cp2.id}`,
    {
      version: cp2.version,
      name: cp2.name,
      kind: 'supplier',
      inn: cp2.inn,
      phone: cp2.phone,
      contact: cp2.contact,
      archived: true,
    },
    adminToken,
  );
  assert.deepEqual(await cpIds('archived=true'), [cp2.id]);
  assert.deepEqual(await cpIds('archived=1'), await cpIds('archived=true'));
  assert(!(await cpIds('archived=false')).includes(cp2.id));
  assert.deepEqual(await cpIds('archived=0'), await cpIds('archived=false'));
  assert.deepEqual(await cpIds('archived=false'), [supplier.id]);
  assert.equal(
    (await call('GET', '/v1/counterparties?archived=yes', undefined, adminToken, undefined, 400))
      .error.code,
    'VALIDATION_ERROR',
  );
  passed.push(
    'Counterparty q matches INN, phone and contact; archived=true/1 and false/0 are equivalent server filters',
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
  const unpaidDocs = await call(
    'GET',
    `/v1/finance/documents?project_id=${project.id}&unpaid=true`,
    undefined,
    adminToken,
  );
  assert(unpaidDocs.items.some((d: any) => d.id === expense.id && d.outstanding === '40.00'));
  assert(unpaidDocs.items.every((d: any) => Number(d.outstanding) > 0 && !d.reversed));
  await call(
    'GET',
    `/v1/finance/documents?project_id=${project.id}&unpaid=yes`,
    undefined,
    adminToken,
    undefined,
    400,
  );
  passed.push('Finance documents unpaid filter returns only payables with an outstanding balance');
  // ---- API-07: unpaid=false/0 filtrni o'chiradi (to'langanlar ham qoladi)
  const docIds = async (flag: string) =>
    (
      await call(
        'GET',
        `/v1/finance/documents?project_id=${project.id}${flag}`,
        undefined,
        adminToken,
      )
    ).items.map((d: any) => d.id as string);
  const allDocs = await docIds('&unpaid=false');
  assert(allDocs.includes(alloc.id) && allDocs.includes(expense.id));
  for (const id of await docIds('&unpaid=true')) assert(allDocs.includes(id));
  assert.deepEqual(await docIds('&unpaid=0'), allDocs);
  assert.deepEqual(await docIds('&unpaid=false'), await docIds(''));
  passed.push('Finance documents unpaid=false and unpaid=0 keep every document, unpaid=true is a subset');
  // overdue bayrog'i: "false"/"0" haqiqatan false (avval z.coerce.boolean "false" ni true qilardi)
  const payableIds = async (flag: string) =>
    (
      await call(
        'GET',
        `/v1/finance/payables?project_id=${project.id}${flag}`,
        undefined,
        adminToken,
      )
    ).items.map((d: any) => d.id as string);
  const allPayables = await payableIds('');
  assert(allPayables.includes(expense.id), 'expense has no due date and an outstanding balance');
  assert.deepEqual(await payableIds('&overdue=false'), allPayables);
  assert.deepEqual(await payableIds('&overdue=0'), allPayables);
  assert(!(await payableIds('&overdue=true')).includes(expense.id));
  await call(
    'GET',
    `/v1/finance/payables?project_id=${project.id}&overdue=yes`,
    undefined,
    adminToken,
    undefined,
    400,
  );
  passed.push(
    'Payables overdue=false/0 keep documents without a past due date; other flag values are 400',
  );
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
  // unread=false: o'qilganlar ham qaytadi (avval "false" true deb olinib ro'yxat bo'sh chiqardi)
  const readInbox = await call(
    'GET',
    '/v1/me/notifications?unread=false',
    undefined,
    brigadierAgain,
  );
  assert(readInbox.items.some((n: any) => n.payload.task_id === notifTask.id));
  await call('GET', '/v1/me/notifications?unread=yes', undefined, brigadierAgain, undefined, 400);
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
  // Telegram progress oqimi: obyekt bitta → ish qatori → miqdor → matn → rasmsiz → kunlik hisobot
  const p1 = await startProgressReport(appPool!, brigadierUser, 'uz');
  assert.match(p1, /Qaysi ish/);
  const p2 = await continueProgressFlow(
    appPool!,
    brigadierUser,
    await loadState(appPool!, '515151'),
    '1',
    'uz',
  );
  assert.match(p2, /Bajarilgan miqdorni/);
  const p3 = await continueProgressFlow(
    appPool!,
    brigadierUser,
    await loadState(appPool!, '515151'),
    '7.5',
    'uz',
  );
  assert.match(p3, /Bajarilgan ishlarni/);
  const p4 = await continueProgressFlow(
    appPool!,
    brigadierUser,
    await loadState(appPool!, '515151'),
    'Devor terish davom etdi',
    'uz',
  );
  assert.match(p4, /Rasm yuboring/);
  const p5 = await continueProgressFlow(
    appPool!,
    brigadierUser,
    await loadState(appPool!, '515151'),
    '-',
    'uz',
  );
  assert.match(p5, /hisobot yuborildi/);
  assert.equal(hasFlow(await loadState(appPool!, '515151')), false);
  const tgReport = (
    await admin.query(
      "SELECT status,kind,progress_quantity::text FROM reports WHERE content='Devor terish davom etdi'",
    )
  ).rows[0];
  assert.deepEqual(
    [tgReport.status, tgReport.kind, tgReport.progress_quantity],
    ['submitted', 'daily', '7.500000'],
  );
  passed.push('Telegram multi-step progress flow creates a daily report linked to a work line');
  // ---- 09: kompaniya sozlamalari, dashboard, audit, fayllar, eksport, texnik panel, support javobi
  const company = await call('GET', '/v1/company', undefined, adminAgain);
  assert.equal(company.settings.telegram.tasks, true);
  await call('GET', '/v1/company', undefined, brigadierAgain2, undefined, 403);
  const savedCompany = await call(
    'PATCH',
    '/v1/company',
    {
      legal_name: 'Sinov korxona MCHJ',
      phone: '+998 90 123 45 67',
      address: 'Toshkent, Chilonzor',
      settings: { telegram: { tasks: false } },
      version: company.version,
    },
    adminAgain,
  );
  assert.equal(savedCompany.phone, '+998901234567');
  assert.equal(savedCompany.settings.telegram.tasks, false);
  assert.equal(savedCompany.settings.telegram.stock, true);
  await call(
    'PATCH',
    '/v1/company',
    { address: 'eski versiya', version: company.version },
    adminAgain,
    undefined,
    409,
  );
  const mutedTask = await call(
    'POST',
    '/v1/tasks',
    {
      project_id: project.id,
      title: 'Telegram o‘chirilgan sinov',
      assignee_id: brigadier.id,
      reviewer_id: foreman.id,
      priority: 'normal',
    },
    adminAgain,
  );
  const mutedNotif = (
    await admin.query(
      "SELECT id FROM notifications WHERE kind='task.assigned' AND payload->>'task_id'=$1",
      [mutedTask.id],
    )
  ).rows[0];
  assert(mutedNotif, 'in-app notification is still written when Telegram category is muted');
  const mutedJob = (
    await admin.query("SELECT status,error_code FROM outbox WHERE payload->>'notification_id'=$1", [
      mutedNotif.id,
    ])
  ).rows[0];
  assert.deepEqual([mutedJob.status, mutedJob.error_code], ['done', 'DISABLED_BY_SETTINGS']);
  passed.push(
    'Company settings save name/phone/address with optimistic version; muted Telegram category keeps the in-app notification and closes the outbox job',
  );
  const dash = await call('GET', '/v1/dashboard', undefined, adminAgain);
  const dashProject = dash.projects.items.find((p: any) => p.id === project.id);
  assert(dashProject && dashProject.open_tasks >= 2, 'project row with open task count');
  assert(dash.tasks.open >= 2 && dash.stock && dash.employees.active >= 5);
  assert.equal(dash.finance.actual_cost, final.actual_cost);
  const brigDash = await call('GET', '/v1/dashboard', undefined, brigadierAgain2);
  assert.equal(brigDash.finance, null);
  assert.equal(brigDash.employees, null);
  assert.equal(brigDash.reports.pending_review, null);
  assert(brigDash.tasks.my_open >= 2 && brigDash.tasks.items.every((x: any) => x.mine));
  assert.equal(brigDash.stock.inventory_value, null);
  await call('GET', '/v1/dashboard', undefined, ownerToken, undefined, 403);
  passed.push(
    'Dashboard blocks follow permissions: admin totals equal the project journal, brigadier sees no finance/employees/prices',
  );
  const audits = await call('GET', '/v1/audit?action=company.&limit=10', undefined, adminAgain);
  assert(audits.total >= 1 && audits.items.every((a: any) => a.action.startsWith('company.')));
  assert(audits.items[0].actor_name);
  await call('GET', '/v1/audit', undefined, brigadierAgain2, undefined, 403);
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  await call(
    'POST',
    '/v1/files',
    {
      project_id: project.id,
      task_id: mutedTask.id,
      name: 'joy.png',
      mime_type: 'image/png',
      base64: png,
    },
    adminAgain,
  );
  const projectFiles = await call(
    'GET',
    `/v1/files?project_id=${project.id}`,
    undefined,
    adminAgain,
  );
  assert(projectFiles.items.some((f: any) => f.task_id === mutedTask.id && f.task_title));
  passed.push(
    'Audit list filters by action prefix with actor names; project-wide file listing carries task/report context',
  );
  // 07 regressiya: oylik so'rovlar (yalang'och "month" alias) — yig'ma, reja–fakt, prognoz, hisobotlar 200 qaytaradi
  const finSummary = await call('GET', '/v1/finance/summary', undefined, adminAgain);
  assert(Array.isArray(finSummary.monthly));
  const pa = await call(
    'GET',
    `/v1/finance/plan-actual?project_id=${project.id}`,
    undefined,
    adminAgain,
  );
  assert(Array.isArray(pa.monthly) && Array.isArray(pa.by_zone) && pa.by_kind.length === 4);
  await call('GET', `/v1/finance/forecast?project_id=${project.id}`, undefined, adminAgain);
  const finReports = await call(
    'GET',
    '/v1/finance/reports?from=2026-01-01&to=2026-12-31',
    undefined,
    adminAgain,
  );
  assert(finReports);
  passed.push(
    'Finance summary, plan-actual (with zones), forecast and financial reports respond with monthly rows',
  );
  const load = async (res: any) => {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(res.base64, 'base64'));
    return book;
  };
  const paBook = await load(
    await call(
      'GET',
      `/v1/finance/plan-actual/export?project_id=${project.id}`,
      undefined,
      adminAgain,
    ),
  );
  assert.deepEqual(
    paBook.worksheets.map((w) => w.name),
    ['Qatorlar', 'Zonalar', 'Oylar'],
  );
  assert.equal(paBook.getWorksheet('Qatorlar')!.getRow(1).getCell(1).value, 'Turi');
  const taskBook = await load(
    await call('GET', `/v1/tasks/export?project_id=${project.id}`, undefined, brigadierAgain2),
  );
  assert(taskBook.getWorksheet('Vazifalar')!.rowCount >= 3);
  // Eksportda ham mine=false filtrsiz bilan bir xil; admin hech bir vazifa ishtirokchisi emas
  const taskRows = async (flag: string) =>
    (
      await load(
        await call(
          'GET',
          `/v1/tasks/export?project_id=${project.id}${flag}`,
          undefined,
          adminAgain,
        ),
      )
    ).getWorksheet('Vazifalar')!.rowCount;
  const allTaskRows = await taskRows('');
  assert(allTaskRows >= 3);
  assert.equal(await taskRows('&mine=false'), allTaskRows);
  assert.equal(await taskRows('&mine=true'), 1, 'header only');
  const stockBook = await load(
    await call(
      'GET',
      `/v1/stock/overview/export?project_id=${project.id}`,
      undefined,
      brigadierAgain2,
    ),
  );
  const stockHeaders = (stockBook.getWorksheet('Qoldiqlar')!.getRow(1).values as any[]).filter(
    Boolean,
  );
  assert(!stockHeaders.includes('Qiymat (UZS)'), 'brigadier export has no value column');
  await load(await call('GET', '/v1/audit/export?action=export.', undefined, adminAgain));
  await call('GET', '/v1/audit/export', undefined, brigadierAgain2, undefined, 403);
  assert(
    (await admin.query("SELECT count(*)::int n FROM audit_events WHERE action LIKE 'export.%'"))
      .rows[0].n >= 4,
  );
  passed.push(
    'Excel exports (plan-actual, tasks, stock, audit) respect scope and price permission; every export is audited',
  );
  await admin.query(
    "INSERT INTO users(login,display_name,password_hash,role) VALUES('tech','Texnik xodim',$1,'support')",
    [await hashPassword(pass)],
  );
  const supportToken = (await call('POST', '/v1/auth/login', { login: 'tech', password: pass }))
    .access_token;
  const diag = await call('GET', '/v1/platform/diagnostics', undefined, supportToken);
  assert.equal(diag.database.ok, true);
  assert(diag.worker.pending >= 1 && Array.isArray(diag.worker.failed_jobs));
  assert(typeof diag.errors.last_24h === 'number' && Array.isArray(diag.errors.items));
  assert(diag.tenants.active >= 1 && diag.sessions_active >= 1);
  assert.match(String(diag.database.last_migration), /^\d{3}_[a-z_]+\.sql$/);
  await call('GET', '/v1/platform/diagnostics', undefined, ownerToken, undefined, 403);
  const sr = await call(
    'POST',
    '/v1/support-requests',
    { kind: 'support', message: 'Hisobotni eksport qilib bo‘lmayapti' },
    adminAgain,
  );
  const answered = await call(
    'PATCH',
    `/v1/platform/support/${sr.id}`,
    { status: 'closed', response: 'Eksport tugmasi reja–fakt sahifasida.' },
    supportToken,
  );
  assert.equal(answered.status, 'closed');
  assert(answered.responded_at);
  const srNotif = await call('GET', '/v1/me/notifications?unread=true', undefined, adminAgain);
  assert(
    srNotif.items.some(
      (n: any) => n.kind === 'support.response' && n.payload.support_request_id === sr.id,
    ),
  );
  assert.equal(typeof srNotif.total, 'number');
  passed.push(
    'Support staff reads diagnostics (queue, errors, tenants, migration); a support response notifies the requesting admin',
  );
  const srOpen = await call(
    'POST',
    '/v1/support-requests',
    { kind: 'support', message: 'Ochiq qolgan murojaat' },
    adminAgain,
  );
  const openSupport = await call('GET', '/v1/platform/support?status=open', undefined, supportToken);
  assert(openSupport.items.length > 0);
  assert(!openSupport.items.some((s: any) => s.id === sr.id));
  assert(openSupport.items.some((s: any) => s.id === srOpen.id));
  assert(openSupport.items.every((s: any) => s.status === 'open'));
  const closedSupport = await call(
    'GET',
    '/v1/platform/support?status=closed',
    undefined,
    supportToken,
  );
  assert(closedSupport.items.some((s: any) => s.id === sr.id));
  assert(!closedSupport.items.some((s: any) => s.id === srOpen.id));
  passed.push('Support requests are filtered by status on the server');
  // ---- 10: avtomatik 30 kunlik invoys, ortiqcha to'lov krediti, qoplanish zanjiri
  const plan = await call(
    'POST',
    '/v1/platform/plans',
    { code: 'standard', version: 1, monthly_price: '450000.00', limits: { users: 20 } },
    ownerToken,
  );
  const sub = await call(
    'POST',
    '/v1/platform/subscriptions',
    { tenant_id: t.id, plan_version_id: plan.id },
    ownerToken,
  );
  const trialEnd = (await admin.query('SELECT trial_ends_at FROM tenants WHERE id=$1', [t.id]))
    .rows[0].trial_ends_at;
  assert.equal(new Date(sub.next_period_start).toISOString(), new Date(trialEnd).toISOString());
  const dayMs = 86400000;
  assert.equal(
    await issueDueInvoices(appPool!, new Date(new Date(trialEnd).getTime() - 10 * dayMs)),
    0,
  );
  assert.equal(
    await issueDueInvoices(appPool!, new Date(new Date(trialEnd).getTime() - 2 * dayMs)),
    1,
  );
  assert.equal(
    await issueDueInvoices(appPool!, new Date(new Date(trialEnd).getTime() - 2 * dayMs)),
    0,
  );
  const inv1 = (
    await admin.query('SELECT * FROM billing_invoices WHERE tenant_id=$1 ORDER BY period_start', [
      t.id,
    ])
  ).rows;
  assert.equal(inv1.length, 1);
  assert.equal(inv1[0].source, 'auto');
  assert.equal(new Date(inv1[0].period_start).toISOString(), new Date(trialEnd).toISOString());
  assert.equal(new Date(inv1[0].period_end).toISOString(), periodEnd(trialEnd).toISOString());
  assert.equal(inv1[0].amount, '450000.00');
  const subAfter = (
    await admin.query('SELECT next_period_start FROM subscriptions WHERE tenant_id=$1', [t.id])
  ).rows[0];
  assert.equal(
    new Date(subAfter.next_period_start).toISOString(),
    periodEnd(trialEnd).toISOString(),
  );
  const invoiceNotif = await call('GET', '/v1/me/notifications?unread=true', undefined, adminAgain);
  assert(
    invoiceNotif.items.some(
      (n: any) => n.kind === 'billing.invoice' && n.payload.invoice_id === inv1[0].id,
    ),
  );
  passed.push(
    'Worker issues the first 30-day invoice 3 days before the trial ends, once, and notifies the admin',
  );
  const over = await call(
    'POST',
    '/v1/platform/billing/entries',
    {
      invoice_id: inv1[0].id,
      kind: 'payment',
      amount: '550000.00',
      external_ref: 'BANK-OVER-1',
      reason: 'Bank o‘tkazmasi, ortiqcha',
    },
    ownerToken,
  );
  assert.equal(over.credit, '100000.00');
  let billingView = await call('GET', '/v1/billing', undefined, adminAgain);
  assert.equal(billingView.credit_balance, '100000.00');
  assert.equal(billingView.invoices[0].covered, '550000.00');
  assert.equal(
    new Date(billingView.tenant.paid_until).toISOString(),
    periodEnd(trialEnd).toISOString(),
  );
  await call(
    'POST',
    '/v1/platform/billing/entries',
    {
      invoice_id: inv1[0].id,
      kind: 'credit',
      amount: '1.00',
      external_ref: 'MANUAL-CREDIT-1',
      reason: 'Chegirma sinovi',
    },
    ownerToken,
    undefined,
    409,
  );
  passed.push(
    'Overpayment records real cash, moves the excess to tenant credit and extends paid_until by the covered period',
  );
  const secondStart = periodEnd(trialEnd);
  assert.equal(await issueDueInvoices(appPool!, new Date(secondStart.getTime() - dayMs)), 1);
  const inv2 = (
    await admin.query('SELECT * FROM billing_invoices WHERE tenant_id=$1 ORDER BY period_start', [
      t.id,
    ])
  ).rows;
  assert.equal(inv2.length, 2);
  const applied = (
    await admin.query(
      "SELECT amount::text,external_ref FROM billing_entries WHERE invoice_id=$1 AND kind='credit'",
      [inv2[1].id],
    )
  ).rows;
  assert.deepEqual(
    applied.map((a) => a.amount),
    ['100000.00'],
  );
  billingView = await call('GET', '/v1/billing', undefined, adminAgain);
  assert.equal(billingView.credit_balance, '0.00');
  assert.equal(billingView.invoices[0].covered, '100000.00');
  assert.equal(
    new Date(billingView.tenant.paid_until).toISOString(),
    periodEnd(trialEnd).toISOString(),
  );
  const summary = await call('GET', '/v1/platform/billing/summary', undefined, ownerToken);
  assert.equal(summary.debt, '350000.00');
  assert.equal(summary.credit_balance, '0.00');
  assert.equal(summary.cash_received, '550000.00');
  const card = await call('GET', `/v1/platform/tenants/${t.id}`, undefined, ownerToken);
  assert.equal(card.credit_balance, '0.00');
  assert.equal(card.credits.length, 2);
  assert.equal(
    await issueDueInvoices(appPool!, new Date(periodEnd(secondStart).getTime() + dayMs)),
    1,
  );
  const overdueNotif = await call('GET', '/v1/me/notifications?unread=true', undefined, adminAgain);
  assert(
    overdueNotif.items.some(
      (n: any) => n.kind === 'billing.overdue' && n.payload.invoice_id === inv2[1].id,
    ),
  );
  passed.push(
    'Next auto invoice consumes the carried credit; debt is computed per invoice; overdue invoice notifies the admin once without blocking',
  );
  const listInvoices = async (params: string) =>
    (
      await call('GET', `/v1/platform/billing/invoices?${params}`, undefined, ownerToken)
    ).items.map((i: any) => i.id as string);
  const allInvoices = await listInvoices(`tenant_id=${t.id}&unpaid=false`);
  assert(allInvoices.includes(inv1[0].id));
  const unpaidInvoices = await listInvoices(`tenant_id=${t.id}&unpaid=true`);
  assert(!unpaidInvoices.includes(inv1[0].id));
  assert.equal(unpaidInvoices.length, allInvoices.length - 1);
  assert.deepEqual(await listInvoices('q=sinov'), allInvoices);
  assert.deepEqual(await listInvoices('q=yoq'), []);
  await call('GET', '/v1/platform/billing/invoices?unpaid=yes', undefined, ownerToken, undefined, 400);
  passed.push(
    'Platform invoice list: unpaid=false keeps paid invoices, unpaid=true hides them, q filters by company, other flag values are 400',
  );
  const manual = await call(
    'POST',
    '/v1/platform/billing/invoices',
    {
      tenant_id: t.id,
      plan_version_id: plan.id,
      period_start: periodEnd(periodEnd(secondStart)).toISOString(),
    },
    ownerToken,
  );
  assert.equal(manual.source, 'manual');
  assert.equal(
    new Date(manual.period_end).toISOString(),
    periodEnd(periodEnd(periodEnd(secondStart))).toISOString(),
  );
  passed.push('Owner issues a manual invoice from the platform (default 30-day period)');
  // ---- G1: kontragent qarzi faqat foydalanuvchi ko'ra oladigan obyektlar bo'yicha hisoblanadi
  const financierLate = (
    await call('POST', '/v1/auth/login', { login: 'financier', password: pass + '2' })
  ).access_token;
  await call(
    'POST',
    '/v1/finance/documents',
    {
      project_id: projectB.id,
      kind: 'labor',
      amount: '100',
      counterparty_id: supplier.id,
      description: 'B obyekt ish haqi hisobi',
      document_date: '2026-10-02',
    },
    adminAgain,
  );
  // Known data: project A payable = 100 (labor) - 60 (payment) = 40; project B payable = 100 (labor)
  await call(
    'POST',
    '/v1/finance/documents',
    {
      project_id: projectB.id,
      kind: 'advance',
      amount: '30',
      counterparty_id: supplier.id,
      cash_account_id: treasury.id,
      description: 'B obyekt avans',
      document_date: '2026-10-02',
    },
    adminAgain,
  );
  const supplierRow = async (token: string) =>
    (await call('GET', '/v1/counterparties?q=supplier', undefined, token)).items.find(
      (c: any) => c.id === supplier.id,
    );
  const adminRow = await supplierRow(adminAgain),
    financierRow = await supplierRow(financierLate);
  assert.equal(adminRow.debt, '140.00');
  assert.equal(financierRow.debt, '40.00');
  assert.equal(adminRow.advance, '30.00');
  assert.equal(financierRow.advance, '0.00');
  passed.push(
    'Counterparty debt sums payables over all projects for the admin but only over assigned projects for the financier',
  );
  // ---- G2: boshqa kompaniyaning qidiruvi hech qachon bu kompaniya ma'lumotini ko'rsatmaydi
  const newTenant = async (legalName: string, key: string, login: string) => {
    const tenant = await call(
      'POST',
      '/v1/platform/tenants',
      { legal_name: legalName, registration_key: key },
      ownerToken,
    );
    const inv = await call(
      'POST',
      `/v1/platform/tenants/${tenant.id}/invites`,
      undefined,
      ownerToken,
    );
    const reg = await call('POST', '/v1/auth/register', {
      token: inv.token,
      login,
      password: pass,
      display_name: login,
    });
    return { tenant, token: reg.access_token as string };
  };
  const tenantB = await newTenant('Begona korxona', 'TEST-G2', 'adminb');
  const adminBToken = tenantB.token;
  const bMaterial = await call(
    'POST',
    '/v1/materials',
    { name: 'Begona material', unit_id: 'kg' },
    adminBToken,
  );
  const bCounterparty = await call(
    'POST',
    '/v1/counterparties',
    { name: 'Begona kontragent', kind: 'supplier' },
    adminBToken,
  );
  const bEmployee = await call(
    'POST',
    '/v1/employees',
    { login: 'begona.xodim', display_name: 'Begona Xodim', password: pass, role: 'foreman' },
    adminBToken,
  );
  const idsOf = async (url: string, token: string) =>
    (await call('GET', url, undefined, token)).items.map((x: any) => x.id as string);
  assert.deepEqual(await idsOf('/v1/materials?q=begona', adminBToken), [bMaterial.id]);
  assert.deepEqual(await idsOf('/v1/counterparties?q=begona', adminBToken), [bCounterparty.id]);
  assert.deepEqual(await idsOf('/v1/employees?q=begona', adminBToken), [bEmployee.id]);
  assert.deepEqual(await idsOf('/v1/materials?q=sement', adminBToken), []);
  assert.deepEqual(await idsOf('/v1/materials?q=material', adminBToken), [bMaterial.id]);
  assert.deepEqual(await idsOf('/v1/counterparties?q=supplier', adminBToken), []);
  assert.deepEqual(await idsOf('/v1/counterparties?q=toshkent', adminBToken), []);
  assert.deepEqual(await idsOf('/v1/employees?q=izlovchi', adminBToken), []);
  assert.deepEqual(await idsOf('/v1/employees?q=foreman', adminBToken), []);
  assert.deepEqual(await idsOf('/v1/materials?q=begona', adminAgain), []);
  assert.deepEqual(await idsOf('/v1/counterparties?q=begona', adminAgain), []);
  assert.deepEqual(await idsOf('/v1/employees?q=begona', adminAgain), []);
  passed.push('List search never crosses tenants: another company finds only its own materials, counterparties and employees');
  // ---- Bosqich 3: xonadonlar. R2 — raqam blok ichida unikal, blok yo'q bo'lsa obyekt ichida.
  const errCode = async (method: string, url: string, body: any, token: string, status: number) => {
    const res = await app!.inject({
      method: method as any,
      url,
      payload: body,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID() },
    });
    assert.equal(res.statusCode, status, `${method} ${url}: ${res.body}`);
    return res.json().error.code as string;
  };
  const px = await call('POST', '/v1/projects', { name: 'Xonadonli obyekt' }, adminAgain);
  const pxUrl = `/v1/projects/${px.id}`;
  const zone = (body: any) => call('POST', `${pxUrl}/zones`, body, adminAgain);
  const blockA = await zone({ name: 'A', kind: 'block', floors_count: 9 }),
    blockB = await zone({ name: 'B', kind: 'block' }),
    entA = await zone({ name: '1', kind: 'entrance', parent_id: blockA.id }),
    entB = await zone({ name: '1', kind: 'entrance', parent_id: blockB.id }),
    yard = await zone({ name: 'Hovli', kind: 'other' });
  const premise = (body: any) =>
    call(
      'POST',
      `${pxUrl}/premises`,
      { zone_id: null, floor: null, rooms: null, kind: 'apartment', area_m2: '50', ...body },
      adminAgain,
    );
  const a12 = await premise({
    number: '12',
    zone_id: entA.id,
    floor: 3,
    rooms: 2,
    area_m2: '65.4',
  });
  assert.equal(a12.block_zone_id, blockA.id);
  assert.equal(a12.area_m2, '65.40');
  const b12 = await premise({ number: '12', zone_id: entB.id });
  assert.equal(b12.block_zone_id, blockB.id);
  const blockBody = {
    zone_id: blockA.id,
    floor: null,
    rooms: null,
    kind: 'apartment',
    area_m2: '50',
  };
  assert.equal(
    await errCode('POST', `${pxUrl}/premises`, { ...blockBody, number: ' 12 ' }, adminAgain, 409),
    'PREMISE_NUMBER_CONFLICT',
  );
  await premise({ number: 'T-3', zone_id: blockA.id, kind: 'commercial' });
  assert.equal(
    await errCode('POST', `${pxUrl}/premises`, { ...blockBody, number: 't-3' }, adminAgain, 409),
    'PREMISE_NUMBER_CONFLICT',
  );
  // Bloksiz: raqam obyekt ichida takrorlanmaydi (zonasiz va blokka kirmagan zona birga)
  const parkP1 = await premise({ number: 'P-1', kind: 'parking', area_m2: '13.25' });
  assert.equal(parkP1.block_zone_id, null);
  assert.equal(
    await errCode(
      'POST',
      `${pxUrl}/premises`,
      { ...blockBody, zone_id: yard.id, number: 'p-1' },
      adminAgain,
      409,
    ),
    'PREMISE_NUMBER_CONFLICT',
  );
  assert.equal(
    await errCode(
      'POST',
      `${pxUrl}/premises`,
      { ...blockBody, zone_id: entA.id, number: '99', floor: 10 },
      adminAgain,
      400,
    ),
    'FLOOR_ABOVE_BLOCK',
  );
  assert.equal(
    await errCode(
      'POST',
      `${pxUrl}/premises`,
      { ...blockBody, zone_id: block.id, number: '98' },
      adminAgain,
      400,
    ),
    'ZONE_NOT_FOUND',
  );
  // Zona turi o'zgarsa blok qayta hisoblanadi; to'qnashuv zona tahririni bekor qiladi
  await premise({ number: '40', zone_id: yard.id });
  await premise({ number: '40', zone_id: entA.id });
  assert.equal(
    await errCode(
      'PATCH',
      `${pxUrl}/zones/${blockA.id}`,
      { version: 1, name: 'A', kind: 'other' },
      adminAgain,
      409,
    ),
    'PREMISE_NUMBER_CONFLICT',
  );
  const blockAAfter = (await call('GET', `${pxUrl}/zones`, undefined, adminAgain)).items.find(
    (z: any) => z.id === blockA.id,
  );
  assert.equal(blockAAfter.kind, 'block');
  const yardBlock = await call(
    'PATCH',
    `${pxUrl}/zones/${yard.id}`,
    { version: 1, name: 'Hovli', kind: 'block' },
    adminAgain,
  );
  assert.equal(yardBlock.kind, 'block');
  assert.deepEqual(
    (
      await admin.query('SELECT block_zone_id FROM premises WHERE project_id=$1 AND zone_id=$2', [
        px.id,
        yard.id,
      ])
    ).rows,
    [{ block_zone_id: yard.id }],
  );
  await call(
    'PATCH',
    `${pxUrl}/zones/${yard.id}`,
    { version: 2, name: 'Hovli', kind: 'other' },
    adminAgain,
  );
  // Ro'yxat: filtrlar va jami serverda, sahifadan qat'i nazar
  const list = (qs: string) => call('GET', `${pxUrl}/premises?${qs}`, undefined, adminAgain);
  const inA = await list(`block_id=${blockA.id}&limit=1`);
  assert.equal(inA.items.length, 1);
  assert.equal(inA.total_count, 3);
  assert.equal(inA.total_area_m2, '165.40');
  assert.equal(inA.items[0].block_name, 'A');
  assert.deepEqual((await list('block_id=none')).items.map((p: any) => p.number).sort(), [
    '40',
    'P-1',
  ]);
  assert.equal((await list('kind=parking')).total_count, 1);
  assert.equal((await list('floor=3')).items[0].id, a12.id);
  assert.equal((await list('q=t-')).items[0].number, 'T-3');
  const none = await list('kind=storage');
  assert.deepEqual([none.items, none.total_count, none.total_area_m2], [[], 0, '0.00']);
  await call('GET', `${pxUrl}/premises?archived=yes`, undefined, adminAgain, undefined, 400);
  // Tahrir versiya bilan; arxivlash raqamni bo'shatadi, band raqamni arxivdan qaytarib bo'lmaydi
  assert.equal(
    await errCode(
      'PATCH',
      `${pxUrl}/premises/${a12.id}`,
      { ...blockBody, version: 9, number: '12' },
      adminAgain,
      409,
    ),
    'VERSION_CONFLICT',
  );
  const a12b = await call(
    'PATCH',
    `${pxUrl}/premises/${a12.id}`,
    {
      version: 1,
      number: '12',
      kind: 'apartment',
      zone_id: entA.id,
      floor: 4,
      rooms: 3,
      area_m2: '66',
    },
    adminAgain,
  );
  assert.deepEqual([a12b.version, a12b.floor, a12b.area_m2], [2, 4, '66.00']);
  await call('POST', `${pxUrl}/premises/${a12.id}/archive`, { version: 2 }, adminAgain);
  assert.equal(
    await errCode(
      'PATCH',
      `${pxUrl}/premises/${a12.id}`,
      { ...blockBody, version: 3, number: '12' },
      adminAgain,
      409,
    ),
    'PREMISE_ARCHIVED',
  );
  assert.equal((await list('archived=true')).items[0].id, a12.id);
  const a12new = await premise({ number: '12', zone_id: blockA.id, floor: 2, area_m2: '70' });
  assert.equal(
    await errCode('POST', `${pxUrl}/premises/${a12.id}/unarchive`, { version: 3 }, adminAgain, 409),
    'PREMISE_NUMBER_CONFLICT',
  );
  // Ruxsat va doira: prorabda yozish yo'q (403), begona kompaniya va biriktirilmagan obyekt — 404, RLS
  const premForeman = await call(
    'POST',
    '/v1/employees',
    { login: 'prem.foreman', display_name: 'Prem Foreman', password: pass, role: 'foreman' },
    adminAgain,
  );
  const pf1 = await call('POST', '/v1/auth/login', { login: 'prem.foreman', password: pass });
  await call(
    'POST',
    '/v1/auth/password',
    { current_password: pass, new_password: pass + '2' },
    pf1.access_token,
  );
  const pfToken = (
    await call('POST', '/v1/auth/login', { login: 'prem.foreman', password: pass + '2' })
  ).access_token;
  await call('GET', `${pxUrl}/premises`, undefined, pfToken, undefined, 404);
  await call('POST', `${pxUrl}/premises`, { ...blockBody, number: '77' }, pfToken, undefined, 403);
  await call(
    'POST',
    `/v1/employees/${premForeman.id}/assignments`,
    { project_id: px.id },
    adminAgain,
  );
  assert.equal((await call('GET', `${pxUrl}/premises`, undefined, pfToken)).total_count, 6);
  await call('GET', `${pxUrl}/premises`, undefined, adminBToken, undefined, 404);
  await call(
    'PATCH',
    `${pxUrl}/premises/${b12.id}`,
    { ...blockBody, version: 1, number: '12' },
    adminBToken,
    undefined,
    404,
  );
  const foreignView = await transaction(appPool!, tenantB.tenant.id, (db) =>
    db.query('SELECT id FROM premises'),
  );
  assert.equal(foreignView.rowCount, 0);
  assert.equal((await appPool!.query('SELECT id FROM premises')).rowCount, 0);
  passed.push(
    'Premises: number unique within the nearest block (project-wide without a block), zone kind change re-checks it, floor limit, archive frees the number, list totals and filters on the server, scope, 403/404 and RLS',
  );
  // ---- Bosqich 3: Excel import — shablon, haqiqiy qator raqamlari, xato bo'lsa bloklanadi, qayta yuklash dublikat yaratmaydi
  const template = await call('GET', `${pxUrl}/premises/template?lang=ru`, undefined, adminAgain);
  const tplBook = new ExcelJS.Workbook();
  await tplBook.xlsx.load(Buffer.from(template.base64, 'base64') as any);
  assert.deepEqual((tplBook.worksheets[0]!.getRow(1).values as unknown[]).slice(1), [
    'Блок',
    'Подъезд',
    'Этаж',
    'Номер',
    'Тип',
    'Комнаты',
    'Площадь, м²',
  ]);
  const premisesFile = async (rows: unknown[][]) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(template.base64, 'base64') as any);
    for (const r of rows) wb.worksheets[0]!.addRow(r);
    return Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
  };
  const goodFile = await premisesFile([
    ['A', '1', 3, '101', 'Квартира', 2, 65.4],
    [],
    ['B', '1', 4, '102', 'Кладовая', null, '4,5'],
    [null, null, null, 'P-9', 'Паркинг', null, 13.25],
    ['a', null, 5, '12', 'Kvartira', 3, 71],
  ]);
  const preview = await call(
    'POST',
    `${pxUrl}/premises/import/preview`,
    { file_base64: goodFile },
    adminAgain,
  );
  assert.deepEqual(preview.summary, { create: 3, update: 1, unchanged: 0, error: 0 });
  assert.deepEqual(
    preview.rows.map((r: any) => [r.row, r.action]),
    [
      [2, 'create'],
      [4, 'create'],
      [5, 'create'],
      [6, 'update'],
    ],
  );
  assert.equal(preview.rows[3].premise_id, a12new.id);
  const committed = await call(
    'POST',
    `${pxUrl}/premises/import/${preview.id}/commit`,
    { digest: preview.digest },
    adminAgain,
  );
  assert.deepEqual(committed, { create: 3, update: 1, unchanged: 0, error: 0 });
  assert.deepEqual(
    await call(
      'POST',
      `${pxUrl}/premises/import/${preview.id}/commit`,
      { digest: preview.digest },
      adminAgain,
    ),
    committed,
  );
  const again = await call(
    'POST',
    `${pxUrl}/premises/import/preview`,
    { file_base64: goodFile },
    adminAgain,
  );
  assert.deepEqual(again.summary, { create: 0, update: 0, unchanged: 4, error: 0 });
  await call(
    'POST',
    `${pxUrl}/premises/import/${again.id}/commit`,
    { digest: again.digest },
    adminAgain,
  );
  assert.equal((await list('limit=100')).total_count, 9);
  const updated12 = (
    await call('GET', `${pxUrl}/premises?q=12&block_id=${blockA.id}`, undefined, adminAgain)
  ).items[0];
  assert.deepEqual(
    [updated12.id, updated12.floor, updated12.area_m2, updated12.version],
    [a12new.id, 5, '71.00', 2],
  );
  // Kirish ko'rsatilmasa blok ichidagi chuqurroq zona (masalan, qavat) qayta importda saqlanadi
  const floorB3 = await zone({ name: '3-qavat', kind: 'floor', parent_id: blockB.id });
  await premise({ number: '150', zone_id: floorB3.id, floor: 3, rooms: 1, area_m2: '50' });
  const keepZone = await call(
    'POST',
    `${pxUrl}/premises/import/preview`,
    { file_base64: await premisesFile([['B', null, 3, '150', 'Kvartira', 1, 50]]) },
    adminAgain,
  );
  assert.deepEqual(keepZone.summary, { create: 0, update: 0, unchanged: 1, error: 0 });
  assert.equal(keepZone.rows[0].zone_id, floorB3.id);
  // Xatolar varaqdagi qator raqami bilan; id yo'q — commit qilib bo'lmaydi
  const badFile = await premisesFile([
    ['C', null, 1, '201', 'Kvartira', 1, 40],
    [],
    ['A', '1', 10, '202', 'Kvartira', 1, 40],
    ['A', '2', 1, '203', 'Kvartira', 1, 40],
    ['B', null, 1, '204', 'Villa', 1, '40.555'],
    ['B', null, 1, '205', 'Kvartira', 1, 40],
    ['b', null, 2, '205', 'Kvartira', 1, 40],
  ]);
  const badPreview = await call(
    'POST',
    `${pxUrl}/premises/import/preview`,
    { file_base64: badFile },
    adminAgain,
  );
  assert.equal(badPreview.id, null);
  assert.equal(badPreview.digest, null);
  assert.deepEqual(
    badPreview.rows
      .filter((r: any) => r.errors.length)
      .map((r: any) => [r.row, r.errors.map((e: any) => `${e.field}:${e.code}`)]),
    [
      [2, ['block:BLOCK_NOT_FOUND']],
      [4, ['floor:FLOOR_ABOVE_BLOCK']],
      [5, ['entrance:ENTRANCE_NOT_FOUND']],
      [6, ['kind:INVALID_KIND', 'area:INVALID_AREA']],
      [8, ['number:DUPLICATE_IN_FILE']],
    ],
  );
  assert.equal(badPreview.summary.create, 1);
  assert.equal(
    await errCode(
      'POST',
      `${pxUrl}/premises/import/preview`,
      { file_base64: await premisesFile([]) },
      adminAgain,
      400,
    ),
    'IMPORT_EMPTY',
  );
  // Preview'dan keyin baza o'zgarsa commit rad etiladi
  const lateFile = await premisesFile([['A', null, 1, '301', 'Kvartira', 1, 40]]);
  const late = await call(
    'POST',
    `${pxUrl}/premises/import/preview`,
    { file_base64: lateFile },
    adminAgain,
  );
  await premise({ number: '301', zone_id: blockA.id });
  assert.equal(
    await errCode(
      'POST',
      `${pxUrl}/premises/import/${late.id}/commit`,
      { digest: late.digest },
      adminAgain,
      409,
    ),
    'PREVIEW_CHANGED',
  );
  // Xonadon preview'i smeta commit'iga o'tmaydi; prorab import qila olmaydi
  await call(
    'POST',
    `/v1/estimate-imports/${again.id}/commit`,
    { digest: again.digest },
    adminAgain,
    undefined,
    404,
  );
  await call(
    'POST',
    `${pxUrl}/premises/import/preview`,
    { file_base64: lateFile },
    pfToken,
    undefined,
    403,
  );
  assert.deepEqual(
    (
      await admin.query(
        "SELECT details->>'create' AS c FROM audit_events WHERE action='premises.import' AND resource_id=$1",
        [preview.id],
      )
    ).rows,
    [{ c: '3' }],
  );
  passed.push(
    'Premises Excel import: server template, real sheet row numbers, errors block the commit, re-upload updates or skips instead of duplicating, stale preview rejected, audit',
  );
  // ---- G3: platforma ro'yxatidagi state filtri har bir kartadagi access_state bilan mos
  const pendingTenant = await call(
    'POST',
    '/v1/platform/tenants',
    { legal_name: 'Kutilayotgan korxona', registration_key: 'TEST-G3' },
    ownerToken,
  );
  const setStatus = async (id: string, status: string) => {
    const version = (await admin!.query('SELECT version FROM tenants WHERE id=$1', [id])).rows[0]
      .version;
    await call(
      'PATCH',
      `/v1/platform/tenants/${id}`,
      { version, status, reason: 'Holat filtri sinovi' },
      ownerToken,
    );
  };
  const archivedTenant = await newTenant('Arxiv korxona', 'TEST-G4', 'adminarxiv');
  await setStatus(archivedTenant.tenant.id, 'archived');
  const blockedTenant = await newTenant('Bloklangan korxona', 'TEST-G5', 'adminblok');
  await setStatus(blockedTenant.tenant.id, 'blocked');
  // INSERT 003 dagi trial_once triggeriga tushmaydi (u faqat UPDATE da ishlaydi)
  const overdueTenantId: string = (
    await admin.query(
      "INSERT INTO tenants(legal_name,registration_key,status,trial_started_at,trial_ends_at) VALUES('Muddati o‘tgan korxona','TEST-G6','active',now()-interval '40 days',now()-interval '26 days') RETURNING id",
    )
  ).rows[0].id;
  const states = ['pending', 'trial', 'paid', 'overdue', 'blocked', 'archived'] as const;
  const byState: Record<string, string[]> = {};
  for (const s of states) {
    const list = await call(
      'GET',
      `/v1/platform/tenants?state=${s}&limit=100`,
      undefined,
      ownerToken,
    );
    byState[s] = list.items.map((x: any) => x.id as string);
    for (const item of list.items) {
      assert.equal(item.access_state, s);
      const card = await call('GET', `/v1/platform/tenants/${item.id}`, undefined, ownerToken);
      assert.equal(card.access_state, s);
    }
  }
  for (const s of states) assert(byState[s]!.length > 0, `state ${s} has tenants`);
  assert(byState.overdue!.includes(overdueTenantId));
  assert(byState.pending!.includes(pendingTenant.id));
  assert(byState.trial!.includes(tenantB.tenant.id));
  assert(byState.paid!.includes(t.id));
  assert(byState.blocked!.includes(blockedTenant.tenant.id));
  assert(byState.archived!.includes(archivedTenant.tenant.id));
  const everyone = (
    await call('GET', '/v1/platform/tenants?limit=100', undefined, ownerToken)
  ).items.map((x: any) => x.id as string);
  const union = states.flatMap((s) => byState[s]!);
  assert.equal(new Set(union).size, union.length, 'state lists are disjoint');
  assert.deepEqual([...union].sort(), [...everyone].sort());
  assert.deepEqual(
    await idsOf('/v1/platform/tenants?q=&state=trial', ownerToken),
    byState.trial,
  );
  passed.push(
    'Platform tenant state filter matches each tenant access_state; the six state lists are disjoint and together equal the unfiltered list (6 of 6 states seeded)',
  );
  // ---- Bosqich 2: CBU kursi. Xatoda oxirgi kurs qoladi, 0 yozilmaydi; endpoint har bir foydalanuvchiga ochiq
  const noRate = await call('GET', '/v1/exchange-rates/latest', undefined, adminAgain);
  assert.equal(noRate.rate, null);
  const cbu = (status: number, body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  assert.equal(await refreshRates(appPool!, cbu(200, [{ Ccy: 'USD', Rate: '0', Date: '09.10.2026' }])), 'failed');
  assert.equal(await refreshRates(appPool!, cbu(200, [{ Ccy: 'USD', Rate: '12800.00', Date: '09.10.2026' }])), 'saved');
  assert.equal(await refreshRates(appPool!, cbu(200, [{ Ccy: 'USD', Rate: '13000', Date: '10.10.2026' }])), 'skipped');
  await admin.query("UPDATE exchange_rates SET fetched_at=now()-interval '13 hours'");
  assert.equal(await refreshRates(appPool!, cbu(503, {})), 'failed');
  assert.equal(
    await refreshRates(appPool!, (async () => {
      throw new Error('timeout');
    }) as unknown as typeof fetch),
    'failed',
  );
  assert.equal(await refreshRates(appPool!, cbu(200, [{ Ccy: 'USD', Rate: 'abc', Date: '10.10.2026' }])), 'failed');
  const kept = await call('GET', '/v1/exchange-rates/latest', undefined, pfToken);
  assert.deepEqual([kept.rate, kept.rate_date, kept.source], ['12800.0000', '2026-10-09', 'CBU']);
  assert.equal(await refreshRates(appPool!, cbu(200, [{ Ccy: 'USD', Rate: '12850.27', Date: '10.10.2026' }])), 'saved');
  const latestRate = await call('GET', '/v1/exchange-rates/latest', undefined, ownerToken);
  assert.deepEqual([latestRate.rate, latestRate.rate_date], ['12850.2700', '2026-10-10']);
  assert.equal((await admin.query('SELECT count(*)::int n FROM exchange_rates')).rows[0].n, 2);
  await assert.rejects(admin.query("INSERT INTO exchange_rates(currency,rate_date,rate,source) VALUES('USD','2026-10-11',0,'CBU')"), /exchange_rates_rate_check/);
  const anon = await app!.inject({ method: 'GET', url: '/v1/exchange-rates/latest' });
  assert.equal(anon.statusCode, 401);
  passed.push(
    'CBU USD rate: worker saves a valid rate, skips while fresh, keeps the last rate on HTTP/parse/timeout errors and never stores 0; latest rate is readable by any signed-in user, not anonymously',
  );
  // ---- Bosqich 4: narx varaqasi. 4.4 nazorat misoli oxirigacha; reversal o'z guruhida; o'zgarmaslik; ruxsat; eksport
  const finP = (await call('POST', '/v1/auth/login', { login: 'financier', password: pass + '2' })).access_token;
  const foreP = (await call('POST', '/v1/auth/login', { login: 'foreman', password: pass + '2' })).access_token;
  const projectP = await call('POST', '/v1/projects', { name: 'Narx obyekti', area_m2: '10000' }, adminAgain);
  const zoneP = (body: object) => call('POST', `/v1/projects/${projectP.id}/zones`, body, adminAgain);
  const pBlockA = await zoneP({ name: 'Blok A', kind: 'block' });
  const pEntranceA = await zoneP({ name: '1-kirish', kind: 'entrance', parent_id: pBlockA.id });
  const pBlockB = await zoneP({ name: 'Blok B', kind: 'block' });
  const premiseP = (body: object) => call('POST', `/v1/projects/${projectP.id}/premises`, body, adminAgain);
  const flat65 = await premiseP({ number: '65', kind: 'apartment', zone_id: pEntranceA.id, floor: 3, rooms: 2, area_m2: '65' });
  await premiseP({ number: 'T-1', kind: 'commercial', zone_id: pBlockA.id, floor: null, rooms: null, area_m2: '2935' });
  await premiseP({ number: '1', kind: 'apartment', zone_id: pBlockB.id, floor: null, rooms: null, area_m2: '7000' });
  await call(
    'POST',
    '/v1/estimates',
    {
      project_id: projectP.id,
      name: 'Narx smetasi',
      lines: [
        { kind: 'service', description: 'Blok A ishlari', unit_id: 'hour', quantity: '1', unit_price: '8000000000', zone_id: pBlockA.id },
        { kind: 'service', description: 'Blok B ishlari', unit_id: 'hour', quantity: '1', unit_price: '14000000000', zone_id: pBlockB.id },
        { kind: 'service', description: 'Umumiy xarajat', unit_id: 'hour', quantity: '1', unit_price: '3000000000' },
      ],
    },
    adminAgain,
  );
  const expenseP = (amount: string, zone_id?: string) =>
    call(
      'POST',
      '/v1/finance/documents',
      {
        project_id: projectP.id,
        kind: 'service',
        amount,
        counterparty_id: supplier.id,
        description: 'Narx varaqasi uchun xarajat',
        document_date: '2026-10-05',
        ...(zone_id ? { zone_id } : {}),
      },
      adminAgain,
    );
  await expenseP('8500000000', pBlockA.id);
  const smallA = await expenseP('500000000', pBlockA.id);
  await expenseP('5000000000', pBlockB.id);
  await expenseP('1000000000');
  await admin.query("INSERT INTO exchange_rates(currency,rate_date,rate,source) VALUES('USD','2026-10-12',12800,'CBU')");
  await call('POST', `/v1/employees/${financier.id}/assignments`, { project_id: projectP.id }, adminAgain);
  // D8: prorab narx varaqasini na yaratadi, na ko'radi
  await call('POST', '/v1/pricing/price-lists', { project_id: projectP.id, markup_percent: '25' }, foreP, undefined, 403);
  const v1 = await call('POST', '/v1/pricing/price-lists', { project_id: projectP.id, markup_percent: '25' }, finP);
  assert.deepEqual(
    [v1.version, v1.usd_rate, v1.usd_rate_date, v1.premises_count, v1.area_total, v1.plan_total, v1.fact_total, v1.forecast_total],
    [1, '12800.0000', '2026-10-12', 3, '10000.00', '25000000000.00', '15000000000.00', '26000000000.00'],
  );
  assert.deepEqual(
    v1.groups.map((g: any) => [g.zone_name, g.area_m2, g.plan_value, g.fact_value, g.forecast_value, g.forecast_m2]),
    [
      ['Blok A', '3000.00', '8000000000.00', '9000000000.00', '9000000000.00', '3000000.00'],
      ['Blok B', '7000.00', '14000000000.00', '5000000000.00', '14000000000.00', '2000000.00'],
      [null, '10000.00', '3000000000.00', '1000000000.00', '3000000000.00', '300000.00'],
    ],
  );
  const d65 = await call('GET', `/v1/pricing/price-lists/${v1.id}?q=65`, undefined, finP);
  assert.equal(d65.lines_total, 1);
  const l65 = d65.lines[0];
  assert.deepEqual(
    [l65.premise_id, l65.block_name, l65.entrance_name, l65.floor, l65.cost, l65.cost_m2, l65.sale_m2, l65.price, l65.sale_m2_usd, l65.price_usd],
    [flat65.id, 'Blok A', '1-kirish', 3, '214500000.00', '3300000.00', '4125000.00', '268125000.00', '322.00', '20930.00'],
  );
  const v1All = await call('GET', `/v1/pricing/price-lists/${v1.id}`, undefined, adminAgain);
  assert.equal(v1All.lines.length, 3);
  assert.equal(
    v1All.lines.reduce((sum: any, l: any) => sum.add(l.cost), dec('0')).toFixed(2),
    '26000000000.00',
  );
  await call('GET', `/v1/pricing/price-lists/${v1.id}`, undefined, foreP, undefined, 403);
  await assert.rejects(admin.query('UPDATE price_lists SET markup_percent=30 WHERE id=$1', [v1.id]), /IMMUTABLE_LEDGER/);
  await assert.rejects(admin.query('DELETE FROM price_list_lines WHERE price_list_id=$1', [v1.id]), /IMMUTABLE_LEDGER/);
  // Zonali xarajat bekor qilinsa reversal asl hujjat zonasida qoladi: faqat Blok A fakti kamayadi, umumiy guruh o'zgarmaydi
  await call('POST', `/v1/finance/documents/${smallA.id}/reverse`, { reason: 'Xato kiritilgan xarajat' }, adminAgain);
  const v2 = await call('POST', '/v1/pricing/price-lists', { project_id: projectP.id, markup_percent: '30', note: 'Reversaldan keyin' }, adminAgain);
  assert.equal(v2.version, 2);
  assert.deepEqual(
    v2.groups.map((g: any) => [g.zone_name, g.fact_value, g.forecast_value]),
    [
      ['Blok A', '8500000000.00', '8500000000.00'],
      ['Blok B', '5000000000.00', '14000000000.00'],
      [null, '1000000000.00', '3000000000.00'],
    ],
  );
  assert.equal(v2.forecast_total, '25500000000.00');
  const pVersions = await call('GET', `/v1/pricing/price-lists?project_id=${projectP.id}`, undefined, finP);
  assert.deepEqual(
    pVersions.items.map((v: any) => [v.version, v.markup_percent, v.note]),
    [
      [2, '30.00', 'Reversaldan keyin'],
      [1, '25.00', null],
    ],
  );
  const xlsUsd = await call('GET', `/v1/pricing/price-lists/${v1.id}/export?currency=USD`, undefined, finP);
  assert.match(xlsUsd.filename, /-narx-v1-USD\.xlsx$/);
  const usdBook = new ExcelJS.Workbook();
  await usdBook.xlsx.load(Buffer.from(xlsUsd.base64, 'base64') as any);
  const usdRow = usdBook.getWorksheet('Narx varaqasi')!.getRow(2).values as any[];
  // T-1 (2 935 m², Blok A): tannarx 9 685 500 000 so'm; USD ustunlari versiya kursi 12 800 bilan
  assert.deepEqual(
    Array.from(usdRow.slice(1), (v: any) => v ?? ''),
    ['Blok A', '', '', 'T-1', 'Tijorat', '', 2935, 257.81, 756679.69, 322, 945070],
  );
  assert.equal(
    (await admin.query("SELECT count(*)::int n FROM audit_events WHERE action='export.price_list' AND resource_id=$1", [v1.id])).rows[0].n,
    1,
  );
  // Kurs yo'q: USD maydonlari null, USD eksport rad etiladi
  await admin.query('DELETE FROM exchange_rates');
  const v3 = await call('POST', '/v1/pricing/price-lists', { project_id: projectP.id, markup_percent: '30' }, adminAgain);
  assert.equal(v3.usd_rate, null);
  assert.equal((await call('GET', `/v1/pricing/price-lists/${v3.id}`, undefined, adminAgain)).lines[0].price_usd, null);
  assert.equal(
    (await call('GET', `/v1/pricing/price-lists/${v3.id}/export?currency=USD`, undefined, adminAgain, undefined, 409)).error.code,
    'PRICE_LIST_NO_RATE',
  );
  // Xonadonsiz va xarajatsiz obyekt; ustama chegarasi
  const emptyP = await call('POST', '/v1/projects', { name: 'Bo‘sh obyekt' }, adminAgain);
  assert.equal(
    (await call('POST', '/v1/pricing/price-lists', { project_id: emptyP.id, markup_percent: '10' }, adminAgain, undefined, 409)).error.code,
    'PRICE_LIST_NO_PREMISES',
  );
  await call('POST', `/v1/projects/${emptyP.id}/premises`, { number: '1', kind: 'apartment', zone_id: null, floor: null, rooms: null, area_m2: '50' }, adminAgain);
  assert.equal(
    (await call('POST', '/v1/pricing/price-lists', { project_id: emptyP.id, markup_percent: '10' }, adminAgain, undefined, 409)).error.code,
    'PRICE_LIST_NO_COSTS',
  );
  await call('POST', '/v1/pricing/price-lists', { project_id: emptyP.id, markup_percent: '1000.01' }, adminAgain, undefined, 400);
  // Egasi qarori (2026-10-11, 1-savol): zonasiz, lekin smeta qatoriga bog'langan sarf qator zonasiga tushadi.
  // Reja A 100, sarf 80 (zonasiz, A qatoriga bog'langan) → A prognozi 100, umumiy guruh 0.
  const brigP = (await call('POST', '/v1/auth/login', { login: 'brigadier', password: pass + '2' })).access_token;
  const projectQ = await call('POST', '/v1/projects', { name: 'Sarf zonasi obyekti' }, adminAgain);
  const qBlock = await call('POST', `/v1/projects/${projectQ.id}/zones`, { name: 'Blok Q', kind: 'block' }, adminAgain);
  await call(
    'POST',
    `/v1/projects/${projectQ.id}/premises`,
    { number: '1', kind: 'apartment', zone_id: qBlock.id, floor: null, rooms: null, area_m2: '10' },
    adminAgain,
  );
  const brick = await call('POST', '/v1/materials', { name: 'G‘isht', unit_id: 'pcs' }, adminAgain);
  const qEstimate = await call(
    'POST',
    '/v1/estimates',
    {
      project_id: projectQ.id,
      name: 'Sarf smetasi',
      lines: [
        { kind: 'material', description: 'G‘isht', material_id: brick.id, unit_id: 'pcs', quantity: '1', unit_price: '100', zone_id: qBlock.id },
      ],
    },
    adminAgain,
  );
  await call('POST', `/v1/employees/${brigadier.id}/assignments`, { project_id: projectQ.id }, adminAgain);
  const qWarehouse = await call('POST', '/v1/warehouses', { project_id: projectQ.id, name: 'Ombor Q' }, adminAgain);
  const qCustody = await call('POST', '/v1/stock/custody', { project_id: projectQ.id, custodian_id: brigadier.id }, adminAgain);
  await call(
    'POST',
    '/v1/stock/commands',
    { project_id: projectQ.id, kind: 'opening', material_id: brick.id, to_account_id: qWarehouse.account.id, quantity: '1', unit_cost: '80', reason: 'Boshlang‘ich qoldiq' },
    adminAgain,
  );
  const qTransfer = await call(
    'POST',
    '/v1/stock/commands',
    { project_id: projectQ.id, kind: 'transfer', material_id: brick.id, from_account_id: qWarehouse.account.id, to_account_id: qCustody.id, quantity: '1', reason: 'Brigadirga' },
    adminAgain,
  );
  await call('POST', `/v1/stock/commands/${qTransfer.id}/actions`, { version: 1, action: 'accept', quantity: '1' }, brigP);
  const qConsumption = await call(
    'POST',
    '/v1/stock/commands',
    { project_id: projectQ.id, kind: 'consumption', material_id: brick.id, from_account_id: qCustody.id, quantity: '1', estimate_line_id: qEstimate.lines[0].id, reason: 'Zonasiz sarf' },
    brigP,
  );
  await call('POST', `/v1/stock/commands/${qConsumption.id}/actions`, { version: 1, action: 'review' }, adminAgain);
  const vQ = await call('POST', '/v1/pricing/price-lists', { project_id: projectQ.id, markup_percent: '0' }, adminAgain);
  assert.deepEqual(
    vQ.groups.map((g: any) => [g.zone_name, g.plan_value, g.fact_value, g.forecast_value]),
    [
      ['Blok Q', '100.00', '80.00', '100.00'],
      [null, '0.00', '0.00', '0.00'],
    ],
  );
  assert.equal(vQ.forecast_total, '100.00');
  // Sarf reversal (zona va qator nusxalanmaydi) ham asl buyruq orqali Blok Q da kamayadi
  await call('POST', `/v1/stock/commands/${qConsumption.id}/reverse`, { reason: 'Sarf xato kiritilgan' }, adminAgain);
  const vQ2 = await call('POST', '/v1/pricing/price-lists', { project_id: projectQ.id, markup_percent: '0' }, adminAgain);
  assert.deepEqual(
    vQ2.groups.map((g: any) => [g.zone_name, g.plan_value, g.fact_value, g.forecast_value]),
    [
      ['Blok Q', '100.00', '0.00', '100.00'],
      [null, '0.00', '0.00', '0.00'],
    ],
  );
  // Tayyorlik: xonadonsiz obyekt va xarajatsiz obyekt sabablari
  const readyQ = await call('GET', `/v1/pricing/readiness?project_id=${projectQ.id}`, undefined, adminAgain);
  assert.deepEqual(readyQ, { premises_count: 1, has_costs: true });
  assert.deepEqual(
    await call('GET', `/v1/pricing/readiness?project_id=${emptyP.id}`, undefined, adminAgain),
    { premises_count: 1, has_costs: false },
  );
  passed.push(
    'Price list (stage 4): the 4.4 control example is reproduced end to end, a reversed expense stays in its zone group, versions are immutable and numbered per project, USD columns follow the version rate, the Excel export is audited, and pricing is limited to admin and financier',
  );
  // ---- 1.4: dashboard grafiklari — obyekt va davr filtri, turlar yig'indisi = davr xarajati, budjetdan oshgan obyekt
  const dash6 = await call('GET', '/v1/dashboard', undefined, adminAgain);
  assert.equal(dash6.period.months, 6);
  assert.equal(dash6.finance.monthly.length, 6);
  const sumKey = (rows: any[], key: string) => rows.reduce((s: any, r: any) => s.add(r[key]), dec('0')).toFixed(2);
  assert.equal(sumKey(dash6.finance.by_kind, 'amount'), dash6.finance.period_expense);
  assert.equal(sumKey(dash6.finance.monthly, 'fact'), dash6.finance.period_expense);
  assert.deepEqual(
    dash6.finance.by_kind.map((k: any) => k.kind),
    ['material', 'labor', 'equipment', 'service'],
  );
  const positiveKinds = dash6.finance.by_kind
    .filter((k: any) => dec(k.amount).gt(0))
    .reduce((s: any, k: any) => s.add(k.amount), dec('0'));
  for (const k of dash6.finance.by_kind)
    assert.equal(
      k.share_percent,
      dec(k.amount).isNegative() ? null : dec(k.amount).div(positiveKinds).mul(100).toFixed(1),
    );
  assert(dec(dash6.finance.by_kind[0].amount).gt(0), 'material consumption is an expense kind');
  // Alohida obyekt, sanalar bugunga nisbatan: eski oyda texnika akti, bugun xizmat akti va texnika aktining stornosi.
  const projectD = await call('POST', '/v1/projects', { name: 'Dashboard grafik obyekti' }, adminAgain);
  const firstMonth = dash6.period.from as string; // 6 oylik oynaning birinchi oyi
  const todayTk = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
  const docD = (kind: string, amount: string, document_date: string) =>
    call(
      'POST',
      '/v1/finance/documents',
      { project_id: projectD.id, kind, amount, counterparty_id: supplier.id, description: 'Dashboard testi', document_date },
      adminAgain,
    );
  const oldEquipment = await docD('equipment', '700.00', firstMonth);
  await docD('service', '300.00', todayTk);
  await call('POST', `/v1/finance/documents/${oldEquipment.id}/reverse`, { reason: 'Dashboard storno testi' }, adminAgain);
  const reversalDate = (
    await admin.query("SELECT document_date::text d FROM finance_documents WHERE reverses_id=$1", [oldEquipment.id])
  ).rows[0].d as string;
  const dashD = await call('GET', `/v1/dashboard?project_id=${projectD.id}&months=6`, undefined, adminAgain);
  assert.equal(dashD.project_id, projectD.id);
  assert.deepEqual([dashD.projects.total, dashD.projects.items[0].id], [1, projectD.id]);
  // Mustaqil tekshiruv: hamma yozuv oynada, demak davr xarajati = jurnaldagi butun xarajat
  const rawD = (
    await admin.query(
      "SELECT coalesce(sum(amount),0)::numeric(20,2)::text v FROM journal_entries WHERE project_id=$1 AND account='expense'",
      [projectD.id],
    )
  ).rows[0].v;
  assert.deepEqual([dashD.finance.period_expense, dashD.finance.actual_cost, rawD], ['300.00', '300.00', '300.00']);
  // Storno asl tur (texnika) va o'z hujjat sanasi oyida: texnika jami 0, ulush null emas (0.0)
  assert.deepEqual(
    dashD.finance.by_kind.map((k: any) => [k.kind, k.amount, k.share_percent]),
    [
      ['material', '0.00', '0.0'],
      ['labor', '0.00', '0.0'],
      ['equipment', '0.00', '0.0'],
      ['service', '300.00', '100.0'],
    ],
  );
  const factOf = (month: string) => dashD.finance.monthly.find((m: any) => m.month === month)?.fact;
  const monthOf = (d: string) => `${d.slice(0, 7)}-01`;
  if (monthOf(reversalDate) === monthOf(todayTk)) {
    assert.equal(factOf(firstMonth), '700.00');
    assert.equal(factOf(monthOf(todayTk)), '-400.00');
  }
  // 3 oylik oynada eski akt yo'q, faqat bugungi xizmat va storno: texnika manfiy, ulushi null
  const dashD3 = await call('GET', `/v1/dashboard?project_id=${projectD.id}&months=3`, undefined, adminAgain);
  assert.deepEqual(
    dashD3.finance.by_kind.map((k: any) => [k.kind, k.amount, k.share_percent]).slice(2),
    [
      ['equipment', '-700.00', null],
      ['service', '300.00', '100.0'],
    ],
  );
  assert.equal(dashD3.finance.period_expense, '-400.00');
  // Budjetdan oshgan obyekt "Budjetlar" sahifasi bilan bir xil: budjet oylari fakti > budjet
  const thisMonth = `${dash6.period.to.slice(0, 7)}-01`;
  await call('POST', '/v1/budgets', { project_id: projectP.id, month: thisMonth, amount: '1000000000.00' }, adminAgain);
  const dashOver = await call('GET', `/v1/dashboard?project_id=${projectP.id}`, undefined, adminAgain);
  const summaryP = await call('GET', `/v1/finance/summary?project_id=${projectP.id}`, undefined, adminAgain);
  const budgetPageActual = summaryP.monthly.find((m: any) => m.month.slice(0, 10) === thisMonth).expense;
  assert.deepEqual(dashOver.finance.over_budget, [
    {
      id: projectP.id,
      name: projectP.name,
      code: projectP.code ?? null,
      budget: '1000000000.00',
      actual: dec(budgetPageActual).toFixed(2),
      over: dec(budgetPageActual).minus('1000000000').toFixed(2),
    },
  ]);
  assert.equal(dashOver.finance.period_budget, '1000000000.00');
  // Vazifalar: davrda qabul qilingan va kechikkan ro'yxat
  assert(dash6.tasks.accepted_period >= 1, 'accepted task counted in period');
  const openTask = (
    await admin.query("SELECT id FROM tasks WHERE project_id=$1 AND status<>'accepted' AND archived_at IS NULL LIMIT 1", [project.id])
  ).rows[0];
  await admin.query("UPDATE tasks SET deadline=now()-interval '2 days' WHERE id=$1", [openTask.id]);
  const dashTasks = await call('GET', `/v1/dashboard?project_id=${project.id}&months=3`, undefined, adminAgain);
  assert(dashTasks.tasks.overdue_items.some((x: any) => x.id === openTask.id && x.assignee_name));
  assert(dashTasks.tasks.overdue_items.every((x: any) => new Date(x.deadline) < new Date()));
  assert.equal(typeof dashTasks.reports.in_period, 'number');
  // Noto'g'ri davr — 400, ko'rinmaydigan obyekt — 404
  await call('GET', '/v1/dashboard?months=5', undefined, adminAgain, undefined, 400);
  await call('GET', `/v1/dashboard?project_id=${randomUUID()}`, undefined, adminAgain, undefined, 404);
  passed.push(
    'Dashboard charts (stage 1.4): project and period filters, expense kinds sum to the period expense with server shares, a reversal stays in its original kind and document month, over-budget matches the budgets page, overdue tasks list',
  );
  const spec = await call('GET', '/openapi.json');
  assert.equal(spec.openapi, '3.1.0');
  passed.push('OpenAPI generated from registered API routes');
  await mkdir('../docs/backend', { recursive: true });
  await writeFile(
    '../docs/backend/verification.json',
    JSON.stringify(
      {
        executed_at: new Date().toISOString(),
        database: 'PostgreSQL 17 Docker; runtime NOSUPERUSER NOBYPASSRLS',
        passed,
        failed,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: passed.length, failed, checks: passed }, null, 2));
  process.exitCode = failed.length ? 1 : 0;
} catch (error) {
  // Diagnostika: 5xx xatolar matni error_events jadvalida.
  if (admin)
    console.error(
      'ERROR_EVENTS',
      (
        await admin.query(
          'SELECT code,message,path FROM error_events ORDER BY created_at DESC LIMIT 5',
        )
      ).rows,
    );
  throw error;
} finally {
  if (app) await app.close();
  if (appPool) await appPool.end();
  if (admin) await admin.end();
  try {
    docker('stop', name);
  } catch {}
}
