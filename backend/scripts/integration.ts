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
import JSZip from 'jszip';
import { writeFile, mkdir } from 'node:fs/promises';
import { createPool, transaction, one } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { buildApp } from '../src/app.js';
import { AUTO_BLOCK_REASON, blockUnpaid, issueDueInvoices, periodEnd } from '../src/billing.js';
import { hashPassword, digest } from '../src/security.js';
import { form5Workbook } from '../tests/form5-fixture.js';
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
    accountant = await employee('accountant'),
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
  // Blok bo'lmagan zonaga qavatlar soni berilsa jim tashlab yuborilmaydi, 400
  await call(
    'POST',
    `/v1/projects/${projectC.id}/zones`,
    { name: '1-qavat', parent_id: block.id, kind: 'floor', floors_count: 3 },
    adminToken,
    undefined,
    400,
  );
  await call(
    'POST',
    `/v1/projects/${projectC.id}/zones`,
    { name: 'Hovli', floors_count: 2 },
    adminToken,
    undefined,
    400,
  );
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
  await call(
    'PATCH',
    `/v1/projects/${projectC.id}/zones/${block.id}`,
    { version: 2, name: 'B blok', kind: 'entrance', floors_count: 5 },
    adminToken,
    undefined,
    400,
  );
  const retyped = await call(
    'PATCH',
    `/v1/projects/${projectC.id}/zones/${block.id}`,
    { version: 2, name: 'B blok', kind: 'entrance', floors_count: null },
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
      hired_at: '2026-10-10',
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
  // Kartadagi qiymatlarni o'zgartirmasdan qaytarib saqlash (UI shunday qiladi): `date` ustuni YYYY-MM-DD matn bo'lib keladi,
  // aks holda pg Date ni ISO vaqtga aylantirib, PATCH VALIDATION_ERROR berardi (2026-10-17 egasi xabari).
  const empCard = await call('GET', `/v1/employees/${searcher.id}`, undefined, adminToken);
  assert.equal(empCard.hired_at, '2026-10-10');
  await call(
    'PATCH',
    `/v1/employees/${searcher.id}`,
    {
      version: empCard.version,
      display_name: empCard.display_name,
      role: 'foreman',
      active: empCard.active,
      phone: empCard.phone,
      position: empCard.position,
      hired_at: empCard.hired_at,
    },
    adminToken,
  );
  assert.equal((await call('GET', `/v1/employees/${searcher.id}`, undefined, adminToken)).role, 'foreman');
  passed.push(
    'Employee q matches phone and position, the list never exposes password hashes and active=false/0 and true filter on the server; an employee card with a hire date is saved back unchanged (date columns are YYYY-MM-DD text)',
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
  // Egasi qarori (2026-10-16): admin materiallarni faqat ko'radi; yaratishni ombor mudiri qiladi
  await call('POST', '/v1/materials', { name: 'Admin materiali', unit_id: 'kg' }, adminToken, undefined, 403);
  const material = await call(
    'POST',
    '/v1/materials',
    { name: 'Sement', unit_id: 'kg' },
    warehouseManager.token,
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
    await call('POST', '/v1/materials', { name: materialName, unit_id: 'kg' }, warehouseManager.token);
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
  // ---- V-A (D23): vazifa ixtiyoriy smeta qatoriga bog'lanadi; reja/fakt qatordan, hajm faqat hisobot orqali
  const lineTask = await call(
    'POST',
    '/v1/tasks',
    {
      project_id: project.id,
      title: 'Devor vazifasi',
      assignee_id: brigadier.id,
      reviewer_id: foreman.id,
      priority: 'normal',
      estimate_line_id: workEstimate.lines[0].id,
      planned_start: '2026-10-20',
    },
    adminToken,
  );
  const lineRow = (
    await call('GET', `/v1/tasks?project_id=${project.id}`, undefined, adminToken)
  ).items.find((x: any) => x.id === lineTask.id);
  assert.equal(lineRow.planned_start, '2026-10-20');
  assert.equal(lineRow.estimate_line_name, 'Devor qurish');
  assert.equal(lineRow.estimate_kind, 'labor');
  assert.equal(lineRow.estimate_unit, 'hour');
  assert.equal(lineRow.estimate_plan_quantity, '10.000000');
  assert.equal(lineRow.estimate_fact_quantity, '3.000000');
  assert.equal(lineRow.estimate_percent, '30.0');
  assert.equal(lineRow.estimate_line_archived, false);
  const lineDetail = await call('GET', `/v1/tasks/${lineTask.id}`, undefined, adminToken);
  assert.equal(lineDetail.estimate_percent, '30.0');
  assert.equal(lineDetail.estimate_fact_value, null);
  // qator qidiruvi: faqat obyektning joriy smeta qatorlari, q — tavsif/smeta nomi bo'yicha
  const lineSearch = await call(
    'GET',
    `/v1/estimate-lines?project_id=${project.id}&q=devor`,
    undefined,
    adminToken,
  );
  assert(
    lineSearch.items.some(
      (l: any) => l.id === workEstimate.lines[0].id && l.estimate_name === 'Ish smetasi',
    ),
  );
  assert(!lineSearch.items.some((l: any) => l.id === est.lines[0].id));
  // boshqa obyekt qatori yoki mavjud bo'lmagan qator — 400
  for (const badLine of [randomUUID(), est2After.lines[0].id])
    assert.equal(
      (
        await call(
          'PATCH',
          `/v1/tasks/${lineTask.id}`,
          {
            version: 1,
            title: 'Devor vazifasi',
            assignee_id: brigadier.id,
            reviewer_id: foreman.id,
            deadline: null,
            estimate_line_id: badLine,
          },
          adminToken,
          undefined,
          400,
        )
      ).error.code,
      'ESTIMATE_LINE_NOT_FOUND',
    );
  // reviziya: vazifa yangi reviziyadagi o'sha qatorga o'tadi; qator yo'qolsa — eski (arxivlangan) qatorda qoladi
  const revEstimate = await call(
    'POST',
    '/v1/estimates',
    {
      project_id: project.id,
      name: 'Reviziya smetasi',
      lines: [
        { kind: 'labor', description: 'Shtukaturka', unit_id: 'hour', quantity: '4', unit_price: '1' },
      ],
    },
    adminToken,
  );
  const revTask = await call(
    'PATCH',
    `/v1/tasks/${lineTask.id}`,
    {
      version: 1,
      title: 'Devor vazifasi',
      assignee_id: brigadier.id,
      reviewer_id: foreman.id,
      deadline: null,
      estimate_line_id: revEstimate.lines[0].id,
    },
    adminToken,
  );
  assert.equal(revTask.estimate_line_id, revEstimate.lines[0].id);
  const revised = await call(
    'PATCH',
    `/v1/estimates/${revEstimate.id}`,
    {
      project_id: project.id,
      name: 'Reviziya smetasi',
      version: 1,
      lines: [
        { kind: 'labor', description: 'Shtukaturka', unit_id: 'hour', category: '', quantity: '6', unit_price: '1' },
      ],
    },
    adminToken,
  );
  assert.notEqual(revised.lines[0].id, revEstimate.lines[0].id);
  const afterRevision = await call('GET', `/v1/tasks/${lineTask.id}`, undefined, adminToken);
  assert.equal(afterRevision.estimate_line_id, revised.lines[0].id);
  assert.equal(afterRevision.estimate_plan_quantity, '6.000000');
  assert.equal(afterRevision.estimate_line_archived, false);
  await call(
    'PATCH',
    `/v1/estimates/${revEstimate.id}`,
    {
      project_id: project.id,
      name: 'Reviziya smetasi',
      version: 2,
      lines: [
        { kind: 'labor', description: 'Boʻyoq', unit_id: 'hour', category: '', quantity: '6', unit_price: '1' },
      ],
    },
    adminToken,
  );
  const afterRename = await call('GET', `/v1/tasks/${lineTask.id}`, undefined, adminToken);
  assert.equal(afterRename.estimate_line_id, revised.lines[0].id);
  assert.equal(afterRename.estimate_line_archived, true);
  // eski qator bilan oddiy tahrir bloklanmaydi (bog'lanish o'zgarmagan)
  const keptOld = await call(
    'PATCH',
    `/v1/tasks/${lineTask.id}`,
    {
      version: 2,
      title: 'Devor vazifasi (tahrir)',
      assignee_id: brigadier.id,
      reviewer_id: foreman.id,
      deadline: null,
      estimate_line_id: revised.lines[0].id,
    },
    adminToken,
  );
  assert.equal(keptOld.estimate_line_id, revised.lines[0].id);
  // null — bog'lanish olib tashlanadi
  const unlinked = await call(
    'PATCH',
    `/v1/tasks/${lineTask.id}`,
    {
      version: 3,
      title: 'Devor vazifasi',
      assignee_id: brigadier.id,
      reviewer_id: foreman.id,
      deadline: null,
      estimate_line_id: null,
      planned_start: null,
    },
    adminToken,
  );
  assert.equal(unlinked.estimate_line_id, null);
  assert.equal(unlinked.planned_start, null);
  passed.push(
    'Tasks link to one current estimate line: plan/fact/percent from the line, line search per project, revision re-points the task, missing match flags the archived line without blocking edits, null unlinks',
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
  // Admin material yaratmaydi (2026-10-16); ombor mudiri (kirim huquqi) yangi sessiya bilan yaratadi
  const whTg = (await call('POST', '/v1/auth/login', { login: 'warehouse_manager', password: pass + '2' }))
    .access_token;
  await call('POST', '/v1/materials', { name: 'Armatura 12', unit_id: 'kg' }, whTg);
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
  // V-B: Telegram so'rovi bitta qatorli talabnoma
  assert.equal(requests.items[0].lines.length, 1);
  const tgLineId = requests.items[0].lines[0].id;
  // Talabnomani faqat ombor mudiri hal qiladi (2026-10-16); admin faqat ko'radi
  await call(
    'POST',
    `/v1/stock/requests/${tgLineId}/actions`,
    { version: 1, action: 'reject', note: 'Sinov: rad etish' },
    adminAgain,
    undefined,
    403,
  );
  const fulfilled = await call(
    'POST',
    `/v1/stock/requests/${tgLineId}/actions`,
    { version: 1, action: 'reject', note: 'Sinov: rad etish' },
    whTg,
  );
  assert.equal(fulfilled.status, 'rejected');
  passed.push(
    'Telegram multi-step material request creates a pending request; the admin only reads it, the warehouse manager resolves it via API',
  );
  // ---- V-B (D23): ko'p qatorli talabnoma — bitta so'rovda bir nechta material; holat va amallar qatorma-qator
  const armatura = (await call('GET', '/v1/materials?q=Armatura', undefined, whTg)).items[0];
  const multi = await call(
    'POST',
    '/v1/stock/requests',
    {
      project_id: project.id,
      lines: [
        { material_id: material.id, quantity: '10' },
        { material_id: armatura.id, quantity: '2.5' },
      ],
      note: 'Ikki qatorli talabnoma',
    },
    brigadierAgain2,
  );
  assert.equal(multi.lines.length, 2);
  assert(multi.lines.every((l: any) => l.group_id === multi.group_id));
  assert.deepEqual(
    multi.lines.map((l: any) => l.position),
    [1, 2],
  );
  assert.equal(
    (
      await call(
        'POST',
        '/v1/stock/requests',
        {
          project_id: project.id,
          lines: [
            { material_id: material.id, quantity: '1' },
            { material_id: material.id, quantity: '2' },
          ],
        },
        brigadierAgain2,
        undefined,
        400,
      )
    ).error.code,
    'REQUEST_LINE_DUPLICATE',
  );
  const grouped = await call(
    'GET',
    `/v1/stock/requests?project_id=${project.id}`,
    undefined,
    adminAgain,
  );
  assert.deepEqual(grouped.summary, { total: 2, pending: 1, fulfilled: 0, rejected: 1 });
  const group = grouped.items.find((g: any) => g.group_id === multi.group_id);
  assert.equal(group.status, 'pending');
  assert.equal(group.note, 'Ikki qatorli talabnoma');
  assert.deepEqual(
    group.lines.map((l: any) => [l.material_name, l.quantity, l.status]),
    [
      ['Sement', '10.000000', 'pending'],
      ['Armatura 12', '2.500000', 'pending'],
    ],
  );
  // Telegram so'rovi bitta qatorli talabnoma sifatida ko'rinadi
  assert.equal(grouped.items.find((g: any) => g.status === 'rejected').lines.length, 1);
  // KPI talabnomalarni (qatorlarni emas) sanaydi
  assert.equal((await call('GET', '/v1/dashboard', undefined, adminAgain)).stock.pending_requests, 1);
  // 1-qator rad etiladi — talabnoma hali kutilmoqda; 2-qatorni so'rovchi bekor qiladi — talabnoma rad etilgan
  await call(
    'POST',
    `/v1/stock/requests/${group.lines[0].id}/actions`,
    { version: 1, action: 'reject', note: 'Omborda yo‘q' },
    whTg,
  );
  const stillPending = await call(
    'GET',
    `/v1/stock/requests?project_id=${project.id}&status=pending`,
    undefined,
    brigadierAgain2,
  );
  assert.deepEqual(
    stillPending.items.map((g: any) => g.group_id),
    [multi.group_id],
  );
  assert.deepEqual(
    stillPending.items[0].lines.map((l: any) => [l.status, l.review_note]),
    [
      ['rejected', 'Omborda yo‘q'],
      ['pending', null],
    ],
  );
  await call(
    'POST',
    `/v1/stock/requests/${group.lines[1].id}/actions`,
    { version: 1, action: 'cancel' },
    brigadierAgain2,
  );
  const closed = await call(
    'GET',
    `/v1/stock/requests?project_id=${project.id}`,
    undefined,
    adminAgain,
  );
  assert.equal(closed.items.find((g: any) => g.group_id === multi.group_id).status, 'rejected');
  assert.deepEqual(closed.summary, { total: 2, pending: 0, fulfilled: 0, rejected: 2 });
  assert.equal((await call('GET', '/v1/dashboard', undefined, adminAgain)).stock.pending_requests, 0);
  passed.push(
    'Multi-line material request: one group with ordered lines, duplicate material rejected, group status and KPIs derive from the lines (pending while any line is open), line-by-line reject and cancel',
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
  // D21: platforma egasida hamma ruxsat bor — diagnostika ham ochiq
  await call('GET', '/v1/platform/diagnostics', undefined, ownerToken);
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
  const debtors = async (params = '') =>
    (
      await call('GET', `/v1/platform/billing/debtors${params ? `?${params}` : ''}`, undefined, ownerToken)
    ).items as any[];
  const debtor = (await debtors()).find((d) => d.tenant_id === t.id);
  assert(debtor, 'tenant with unpaid invoices is listed as a debtor');
  assert.equal(debtor.invoices, unpaidInvoices.length);
  const unpaidRows = (
    await call('GET', `/v1/platform/billing/invoices?tenant_id=${t.id}&unpaid=true`, undefined, ownerToken)
  ).items as any[];
  assert.equal(debtor.debt, unpaidRows.reduce((s, i) => s.add(i.outstanding), dec('0')).toFixed(2));
  assert.equal(dec(debtor.overdue).add(debtor.current).toFixed(2), debtor.debt);
  // Muddati o'tgan qism — faqat due_at<now() bo'lgan invoyslar (bu bosqichda davrlar kelajakda: odatda 0).
  const overdueSum = unpaidRows
    .filter((i) => new Date(i.due_at) < new Date())
    .reduce((s, i) => s.add(i.outstanding), dec('0'))
    .toFixed(2);
  assert.equal(debtor.overdue, overdueSum);
  assert.equal(Boolean(debtor.oldest_due_at), Number(overdueSum) > 0);
  assert.equal(debtor.access_state, 'paid');
  assert((await debtors('overdue=true')).every((d) => Number(d.overdue) > 0));
  assert.deepEqual(await debtors('q=yoq'), []);
  await call('GET', '/v1/platform/billing/debtors?overdue=yes', undefined, ownerToken, undefined, 400);
  passed.push(
    'Platform debtors: a paid-up company with unpaid invoices is listed, its debt equals the sum of its unpaid invoices, overdue+current=debt, overdue=true and q filter, other flag values are 400',
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
  // Admin material yaratmaydi (2026-10-16): B korxonada ombor mudiri yaratadi (nomi "begona" qidiruviga tushmasin)
  await call(
    'POST',
    '/v1/employees',
    { login: 'wm_b', display_name: 'Omborchi B', password: pass, role: 'warehouse_manager' },
    adminBToken,
  );
  const wmBFirst = (await call('POST', '/v1/auth/login', { login: 'wm_b', password: pass })).access_token;
  await call('POST', '/v1/auth/password', { current_password: pass, new_password: pass + '2' }, wmBFirst);
  const wmBToken = (await call('POST', '/v1/auth/login', { login: 'wm_b', password: pass + '2' })).access_token;
  const bMaterial = await call(
    'POST',
    '/v1/materials',
    { name: 'Begona material', unit_id: 'kg' },
    wmBToken,
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
  // ---- V-E (D23): qavat × ish progress matritsasi — qavat zonalari, ish qatorlari rejasi va qabul qilingan hajm
  const floorA1 = await zone({ name: '1-qavat', kind: 'floor', parent_id: entA.id });
  const roomB3 = await zone({ name: '150-xonadon', kind: 'other', parent_id: floorB3.id });
  const floorEst = await call(
    'POST',
    '/v1/estimates',
    {
      project_id: px.id,
      name: 'Qavat ishlari',
      lines: [
        { kind: 'labor', description: 'Shtukaturka', unit_id: 'm2', quantity: '100', unit_price: '1', zone_id: floorB3.id },
        { kind: 'labor', description: 'Shtukaturka', unit_id: 'm2', quantity: '80', unit_price: '1', zone_id: floorA1.id },
        { kind: 'labor', description: 'Pol', unit_id: 'm2', quantity: '50', unit_price: '1' },
        { kind: 'material', description: 'Sement', material_id: material.id, unit_id: 'kg', quantity: '10', unit_price: '1', zone_id: floorB3.id },
      ],
    },
    adminAgain,
  );
  await call('POST', `/v1/employees/${brigadier.id}/assignments`, { project_id: px.id }, adminAgain);
  const floorReport = async (body: Record<string, unknown>) => {
    const r = await call(
      'POST',
      '/v1/reports',
      { project_id: px.id, kind: 'daily', report_date: '2026-10-05', content: 'Qavat ishi', ...body },
      brigadierAgain2,
    );
    await call(
      'POST',
      `/v1/reports/${r.id}/review`,
      { version: 1, action: 'accepted', reason: 'Tekshirildi' },
      adminAgain,
    );
  };
  // hisobot zonasi qavat ichidagi zona → B / 3-qavat; zonasiz hisobot → qator zonasi (A / 1-qavat); rejasiz qavat ustuni (Pol zonasiz)
  await floorReport({ zone_id: roomB3.id, estimate_line_id: floorEst.lines[0].id, progress_quantity: '40' });
  await floorReport({ estimate_line_id: floorEst.lines[1].id, progress_quantity: '20' });
  await floorReport({ zone_id: floorA1.id, estimate_line_id: floorEst.lines[2].id, progress_quantity: '10' });
  // yuborilgan, qabul qilinmagan hisobot hisobga olinmaydi
  await call(
    'POST',
    '/v1/reports',
    { project_id: px.id, kind: 'daily', report_date: '2026-10-06', content: 'Kutilmoqda', zone_id: floorB3.id, estimate_line_id: floorEst.lines[0].id, progress_quantity: '99' },
    brigadierAgain2,
  );
  const matrix = await call('GET', `${pxUrl}/floor-progress`, undefined, brigadierAgain2);
  assert.deepEqual(
    matrix.floors.map((f: any) => [f.parent_name, f.name, f.plan, f.fact, f.percent]),
    [
      ['1', '1-qavat', '80.000000', '30.000000', '37.5'],
      ['B', '3-qavat', '100.000000', '40.000000', '40.0'],
    ],
  );
  assert.deepEqual(
    matrix.works.map((w: any) => [w.description, w.unit_id, w.plan, w.fact, w.percent]),
    [
      ['Shtukaturka', 'm2', '180.000000', '60.000000', '33.3'],
      ['Pol', 'm2', '50.000000', '10.000000', '20.0'],
    ],
  );
  const cellOf = (zoneId: string, d: string) =>
    matrix.cells.find((c: any) => c.zone_id === zoneId && c.description === d);
  assert.deepEqual(
    [floorB3.id, floorA1.id].map((z) => {
      const c = cellOf(z, 'Shtukaturka');
      return [c.plan, c.fact, c.percent];
    }),
    [
      ['100.000000', '40.000000', '40.0'],
      ['80.000000', '20.000000', '25.0'],
    ],
  );
  const polA1 = cellOf(floorA1.id, 'Pol');
  assert.deepEqual([polA1.plan, polA1.fact, polA1.percent], [null, '10.000000', null]);
  assert.equal(cellOf(floorB3.id, 'Pol'), undefined);
  passed.push(
    'Floor × work progress matrix: floor zones (nested zones roll up), plan from floor-bound work lines, fact from accepted reports by report zone or line zone, per-floor and per-work totals, unaccepted reports and material lines excluded',
  );
  // ---- D26–D28 (2026-11-03): reviziyada vazifa va fakt o'sha ishga (ish identifikatori) o'tadi; matritsada ish kodi
  const formLine = (category: string, description: string, quantity: string) => ({
    kind: 'labor', description, unit_id: 'hour', quantity, unit_price: '1', category, zone_id: floorA1.id,
  });
  const workEst = await call(
    'POST',
    '/v1/estimates',
    {
      project_id: px.id,
      name: 'Form 5 ishlari',
      lines: [formLine('E-01 Kladka', 'Mehnat', '10'), formLine('E-02 Armatura', 'Mehnat', '20'), formLine('E-02 Armatura', 'Mehnat', '30')],
    },
    adminAgain,
  );
  // prorab bu obyektga keyinroq biriktiriladi — tekshiruvchi admin (biriktirish talab qilinmaydi)
  const workReviewer = (await call('GET', '/v1/auth/me', undefined, adminAgain)).id;
  const workTask = await call(
    'POST',
    '/v1/tasks',
    { project_id: px.id, title: 'Armatura (ikkinchi)', assignee_id: brigadier.id, reviewer_id: workReviewer, priority: 'normal', estimate_line_id: workEst.lines[2].id },
    adminAgain,
  );
  await floorReport({ estimate_line_id: workEst.lines[2].id, progress_quantity: '12' });
  // yuqoriga yangi ish qo'shildi (hamma pozitsiya suriladi), ikkinchi armatura hajmi o'zgardi
  const workRev = await call(
    'PATCH',
    `/v1/estimates/${workEst.id}`,
    {
      project_id: px.id,
      name: 'Form 5 ishlari',
      version: 1,
      lines: [formLine('E-00 Tozalash', 'Tozalash', '5'), formLine('E-01 Kladka', 'Mehnat', '10'), formLine('E-02 Armatura', 'Mehnat', '20'), formLine('E-02 Armatura', 'Mehnat', '35')],
    },
    adminAgain,
  );
  const newArm = workRev.lines[3];
  const taskAfterRev = await call('GET', `/v1/tasks/${workTask.id}`, undefined, adminAgain);
  assert.deepEqual(
    [taskAfterRev.estimate_line_id, taskAfterRev.estimate_plan_quantity, taskAfterRev.estimate_fact_quantity],
    [newArm.id, '35.000000', '12.000000'],
  );
  const workDetail = await call('GET', `/v1/estimates/${workEst.id}`, undefined, adminAgain);
  assert.deepEqual(workDetail.lines.map((l: any) => Number(l.fact_quantity)), [0, 0, 0, 12]);
  const pxPlanActual = await call('GET', `/v1/finance/plan-actual?project_id=${px.id}`, undefined, adminAgain);
  assert.equal(Number(pxPlanActual.lines.find((l: any) => l.id === newArm.id).fact_qty), 12);
  const workMatrix = await call('GET', `${pxUrl}/floor-progress`, undefined, brigadierAgain2);
  const workCell = (category: string) =>
    workMatrix.cells.find((c: any) => c.zone_id === floorA1.id && c.category === category && c.description === 'Mehnat');
  assert.deepEqual([workCell('E-02 Armatura').plan, Number(workCell('E-02 Armatura').fact)], ['55.000000', 12]);
  assert.deepEqual([workCell('E-01 Kladka').plan, Number(workCell('E-01 Kladka').fact)], ['10.000000', 0]);
  passed.push(
    'Estimate revision keeps work identity (D26–D28): same kind/name/unit/zone/category matched in order even when lines shift, the task and accepted progress follow the line (task card, estimate, plan-actual), the floor matrix splits same-named resources by work code',
  );
  // ---- V-C (D23): brigada akkord hisobi — stavka qabulda qotiriladi, obyekt foizi, tuzatish, davr, avans bilan to'lov
  const pxNow = await call('GET', pxUrl, undefined, adminAgain);
  const pieceEst = await call(
    'POST',
    '/v1/estimates',
    {
      project_id: px.id,
      name: 'Akkord smetasi',
      lines: [
        { kind: 'labor', description: 'Gipsokarton', unit_id: 'm2', quantity: '50', unit_price: '100000', labor_rate: '20000' },
        { kind: 'labor', description: 'Boyoq', unit_id: 'm2', quantity: '30', unit_price: '50000' },
        { kind: 'material', description: 'Sement', material_id: material.id, unit_id: 'kg', quantity: '10', unit_price: '1', labor_rate: '5' },
      ],
    },
    adminAgain,
  );
  // material qatorida stavka saqlanmaydi
  assert.equal(pieceEst.lines[2].labor_rate, null);
  assert.equal(pieceEst.lines[0].labor_rate, '20000.00');
  const pieceReport = async (lineId: string, qty: string, reportDate = '2026-10-05') => {
    const r = await call(
      'POST',
      '/v1/reports',
      { project_id: px.id, kind: 'daily', report_date: reportDate, content: 'Akkord ishi', estimate_line_id: lineId, progress_quantity: qty },
      brigadierAgain2,
    );
    await call('POST', `/v1/reports/${r.id}/review`, { version: 1, action: 'accepted', reason: 'Tekshirildi' }, adminAgain);
    return (await call('GET', `/v1/reports/${r.id}`, undefined, adminAgain)) as any;
  };
  // R1: qator stavkasi 20000 × 10 m2 = 200000; R2: stavka yo'q (foiz hali berilmagan) → summa yo'q
  const r1 = await pieceReport(pieceEst.lines[0].id, '10');
  assert.deepEqual([r1.progress.labor_rate, r1.progress.labor_amount], ['20000.00', '200000.00']);
  const r2 = await pieceReport(pieceEst.lines[1].id, '5');
  assert.deepEqual([r2.progress.labor_rate, r2.progress.labor_amount], [null, null]);
  // obyekt foizi 20% → Boyoq: 50000 × 20% = 10000; R2 ning stavkasi o'zgarmaydi (qotirilgan)
  await call('PATCH', pxUrl, { version: pxNow.version, name: pxNow.name, brigade_percent: '20' }, adminAgain);
  const r3 = await pieceReport(pieceEst.lines[1].id, '4');
  assert.deepEqual([r3.progress.labor_rate, r3.progress.labor_amount], ['10000.00', '40000.00']);
  assert.equal((await call('GET', `/v1/reports/${r2.id}`, undefined, adminAgain)).progress.labor_rate, null);
  // tuzatish qotirilgan stavka bilan: 10 − 2 = 8 m2 × 20000 = 160000
  await call('POST', `/v1/progress-entries/${r1.progress.id}/corrections`, { quantity_delta: '-2', reason: 'Qayta o‘lchash' }, adminAgain);
  assert.equal((await call('GET', `/v1/reports/${r1.id}`, undefined, adminAgain)).progress.labor_amount, '160000.00');
  // reviziya: yangi stavka 30000 faqat yangi hisobotlarga; eski 160000 da qoladi
  const pieceRevised = await call(
    'PATCH',
    `/v1/estimates/${pieceEst.id}`,
    {
      project_id: px.id,
      name: 'Akkord smetasi',
      version: 1,
      lines: [
        { kind: 'labor', description: 'Gipsokarton', unit_id: 'm2', category: '', quantity: '50', unit_price: '100000', labor_rate: '30000' },
        { kind: 'labor', description: 'Boyoq', unit_id: 'm2', category: '', quantity: '30', unit_price: '50000' },
      ],
    },
    adminAgain,
  );
  const r4 = await pieceReport(pieceRevised.lines[0].id, '1');
  assert.equal(r4.progress.labor_amount, '30000.00');
  assert.equal((await call('GET', `/v1/reports/${r1.id}`, undefined, adminAgain)).progress.labor_amount, '160000.00');
  // D20: prorab hajmni ko'radi, summani emas; brigadir o'z hisobotida ko'radi
  await call('POST', `/v1/employees/${foreman.id}/assignments`, { project_id: px.id }, adminAgain);
  const forePx = (await call('POST', '/v1/auth/login', { login: 'foreman', password: pass + '2' })).access_token;
  const r1Fore = await call('GET', `/v1/reports/${r1.id}`, undefined, forePx);
  assert.equal(r1Fore.progress.quantity, '10.000000');
  assert.equal(r1Fore.progress.labor_amount, undefined);
  assert.equal((await call('GET', `/v1/reports/${r1.id}`, undefined, brigadierAgain2)).progress.labor_amount, '160000.00');
  // Brigadir balansi: 160000 + 40000 + 30000 = 230000, hali davrga kirmagan
  const earn1 = await call('GET', '/v1/me/earnings', undefined, brigadierAgain2);
  const pxEarn = earn1.projects.find((p: any) => p.project_id === px.id);
  // Hisobotlar 2026-10 sanasida; "shu oy" summasi faqat test oktyabrda ishlasa 230000 (current_date bo'yicha)
  const pieceMonth = new Date().toISOString().slice(0, 7) === '2026-10' ? '230000.00' : '0.00';
  assert.deepEqual(
    [pxEarn.earned, pxEarn.earned_month, pxEarn.in_payroll, pxEarn.paid, pxEarn.advances, pxEarn.balance],
    ['230000.00', pieceMonth, '0.00', '0.00', '0.00', '230000.00'],
  );
  assert.equal(earn1.totals.earned, '230000.00');
  assert.equal(earn1.entries.find((e: any) => e.id === r2.progress.id).amount, null);
  await call('GET', `/v1/employees/${brigadier.id}/earnings`, undefined, brigadierAgain2, undefined, 403);
  assert.equal((await call('GET', `/v1/employees/${brigadier.id}/earnings`, undefined, adminAgain)).totals.earned, '230000.00');
  // Ish haqi davri: kutilayotgan akkord ko'rinadi, yopishda yozuv avtomatik qo'shiladi
  const piecePeriod = await call('POST', '/v1/finance/payroll/periods', { project_id: px.id, month: '2026-10-01' }, adminAgain);
  const payroll1 = await call('GET', `/v1/finance/payroll?project_id=${px.id}`, undefined, adminAgain);
  assert.deepEqual(
    payroll1.periods.find((p: any) => p.id === piecePeriod.id).piece_pending.map((p: any) => [p.employee_id, p.amount]),
    [[brigadier.id, '230000.00']],
  );
  await call('POST', `/v1/finance/payroll/periods/${piecePeriod.id}/post`, { version: piecePeriod.version }, adminAgain);
  const payroll2 = await call('GET', `/v1/finance/payroll?project_id=${px.id}`, undefined, adminAgain);
  const pieceEntry = payroll2.entries.find((e: any) => e.period_id === piecePeriod.id && e.employee_id === brigadier.id);
  assert.deepEqual([pieceEntry.base_salary, pieceEntry.piece_rate, pieceEntry.net, pieceEntry.status], ['0.00', '230000.00', '230000.00', 'posted']);
  assert.equal(payroll2.periods.find((p: any) => p.id === piecePeriod.id).piece_total, '230000.00');
  const earn2 = await call('GET', '/v1/me/earnings', undefined, brigadierAgain2);
  const pxEarn2 = earn2.projects.find((p: any) => p.project_id === px.id);
  assert.deepEqual([pxEarn2.in_payroll, pxEarn2.posted_unpaid, pxEarn2.balance], ['230000.00', '230000.00', '230000.00']);
  // Avans 50000 → to'lovda avval avans hisoblanadi, 180000 kassadan
  const pieceLabor = (
    await admin.query('SELECT f.counterparty_id FROM finance_documents f WHERE f.id=$1', [pieceEntry.labor_document_id])
  ).rows[0];
  await call(
    'POST',
    '/v1/finance/documents',
    { project_id: px.id, counterparty_id: pieceLabor.counterparty_id, kind: 'advance', amount: '50000', cash_account_id: treasury.id, description: 'Brigadirga avans', document_date: '2026-10-20' },
    adminAgain,
  );
  const payroll3 = await call('GET', `/v1/finance/payroll?project_id=${px.id}`, undefined, adminAgain);
  const pieceEntry2 = payroll3.entries.find((e: any) => e.id === pieceEntry.id);
  assert.deepEqual([pieceEntry2.advance_available, pieceEntry2.cash_due], ['50000.00', '180000.00']);
  assert.equal((await call('GET', '/v1/me/earnings', undefined, brigadierAgain2)).projects.find((p: any) => p.project_id === px.id).balance, '180000.00');
  const paid = await call(
    'POST',
    `/v1/finance/payroll/entries/${pieceEntry.id}/pay`,
    { version: pieceEntry2.version, cash_account_id: treasury.id, document_date: '2026-10-31' },
    adminAgain,
  );
  assert.deepEqual([paid.status, paid.advance_applied, paid.paid_cash], ['paid', '50000.00', '180000.00']);
  assert(paid.advance_offset_document_id && paid.payment_document_id);
  const earn3 = await call('GET', '/v1/me/earnings', undefined, brigadierAgain2);
  const pxEarn3 = earn3.projects.find((p: any) => p.project_id === px.id);
  assert.deepEqual([pxEarn3.paid, pxEarn3.advances, pxEarn3.balance], ['230000.00', '0.00', '0.00']);
  // To'lovdan keyingi tuzatish (+1 m2 × 20000) keyingi davrga kiradi
  await call('POST', `/v1/progress-entries/${r1.progress.id}/corrections`, { quantity_delta: '1', reason: 'Qo‘shimcha hajm' }, adminAgain);
  const earn4 = await call('GET', '/v1/me/earnings', undefined, brigadierAgain2);
  const pxEarn4 = earn4.projects.find((p: any) => p.project_id === px.id);
  assert.deepEqual([pxEarn4.earned, pxEarn4.in_payroll, pxEarn4.balance], ['250000.00', '230000.00', '20000.00']);
  const piecePeriod2 = await call('POST', '/v1/finance/payroll/periods', { project_id: px.id, month: '2026-11-01' }, adminAgain);
  await call('POST', `/v1/finance/payroll/periods/${piecePeriod2.id}/post`, { version: piecePeriod2.version }, adminAgain);
  const payroll4 = await call('GET', `/v1/finance/payroll?project_id=${px.id}`, undefined, adminAgain);
  assert.equal(payroll4.entries.find((e: any) => e.period_id === piecePeriod2.id && e.employee_id === brigadier.id).piece_rate, '20000.00');
  passed.push(
    'Brigade piece-rate (D23): line rate or project percent frozen at acceptance, corrections and revisions respect the frozen rate, foreman sees quantities only, brigadier balance per project, payroll post adds the piece-rate entry, payment settles the advance first, a post-payment correction rolls into the next period',
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
  // Qarzdorlar: muddati 5 kun oldin o'tgan invoys — overdue summasi, kunlar soni, eng eski muddat; q — kalit bo'yicha.
  const lateDue = new Date(Date.now() - 5 * dayMs);
  const lateInvoice = await call(
    'POST',
    '/v1/platform/billing/invoices',
    {
      tenant_id: overdueTenantId,
      plan_version_id: plan.id,
      period_start: lateDue.toISOString(),
      due_at: lateDue.toISOString(),
    },
    ownerToken,
  );
  const lateDebtor = (await debtors('overdue=true')).find((d) => d.tenant_id === overdueTenantId);
  assert(lateDebtor, 'company with an overdue invoice is listed under overdue=true');
  assert.equal(lateDebtor.overdue, dec(lateInvoice.amount).toFixed(2));
  assert.equal(lateDebtor.current, '0.00');
  assert.equal(lateDebtor.debt, lateDebtor.overdue);
  assert.equal(lateDebtor.invoices, 1);
  assert.equal(lateDebtor.overdue_days, 5);
  assert.equal(new Date(lateDebtor.oldest_due_at).toISOString(), lateDue.toISOString());
  assert.equal(lateDebtor.access_state, 'overdue');
  const ordered = await debtors();
  for (let i = 1; i < ordered.length; i++)
    assert(Number(ordered[i - 1].overdue) >= Number(ordered[i].overdue), 'debtors sort by overdue amount first');
  assert.deepEqual(
    (await debtors('q=TEST-G6')).map((d) => d.tenant_id),
    [overdueTenantId],
  );
  passed.push(
    'Platform debtors: an overdue invoice lists the company first with overdue amount, days overdue and oldest due date; q matches the registration key',
  );
  // ---- D33: muddati tugab, to'lanmagan kompaniya avtomatik bloklanadi; to'lov ochadi, qo'lda qaror ustun
  const autoT = await newTenant('Avto blok korxona', 'TEST-D33', 'adminavto');
  const manualT = await newTenant('Qo‘lda ochilgan korxona', 'TEST-D33M', 'adminqolda');
  // trial_once triggeri trialni o'zgartirmaydi — sinov uchun replika rejimida 6 kun oldin tugagan qilinadi
  await admin.query(
    "BEGIN; SET LOCAL session_replication_role=replica; UPDATE tenants SET trial_started_at=now()-interval '20 days',trial_ends_at=now()-interval '6 days' WHERE registration_key IN ('TEST-D33','TEST-D33M'); COMMIT;",
  );
  // Worker ishlashidan oldin qo'lda bloklanib, qo'lda ochilgan kompaniya — egasi shu uzilish bo'yicha qaror qilgan
  for (const status of ['blocked', 'active'])
    await call(
      'PATCH',
      `/v1/platform/tenants/${manualT.tenant.id}`,
      {
        status,
        version: (await admin.query('SELECT version FROM tenants WHERE id=$1', [manualT.tenant.id])).rows[0].version,
        reason: 'Egasi qarori',
      },
      ownerToken,
    );
  const autoState = async () =>
    (
      await admin!.query('SELECT status,block_reason,auto_blocked,version FROM tenants WHERE id=$1', [
        autoT.tenant.id,
      ])
    ).rows[0];
  const autoCard = async () =>
    (await call('GET', `/v1/platform/tenants/${autoT.tenant.id}`, undefined, ownerToken)).access_state;
  assert.equal(await autoCard(), 'overdue');
  assert((await blockUnpaid(appPool!)) >= 1);
  let autoRow = await autoState();
  assert.deepEqual(
    [autoRow.status, autoRow.auto_blocked, autoRow.block_reason],
    ['blocked', true, AUTO_BLOCK_REASON],
  );
  assert.equal(await blockUnpaid(appPool!), 0);
  assert.equal((await autoState()).version, autoRow.version);
  assert.equal(
    (await call('GET', `/v1/platform/tenants/${manualT.tenant.id}`, undefined, ownerToken)).access_state,
    'overdue',
  );
  // Sessiya yopilmaydi: admin obuna sahifasini ko'radi, ish sahifalari TENANT_BLOCKED
  assert.equal(
    (await call('GET', '/v1/projects', undefined, autoT.token, undefined, 403)).error.code,
    'TENANT_BLOCKED',
  );
  assert.equal((await call('GET', '/v1/billing', undefined, autoT.token)).tenant.access_state, 'blocked');
  // Uzilishdan keyingi davr (kecha boshlangan) to'lansa zanjir ulanadi va avtomatik blok o'zi ochiladi
  const autoInvoice = await call(
    'POST',
    '/v1/platform/billing/invoices',
    { tenant_id: autoT.tenant.id, plan_version_id: plan.id, period_start: new Date(Date.now() - dayMs).toISOString() },
    ownerToken,
  );
  const autoEntry = (kind: string, ref: string) =>
    call(
      'POST',
      '/v1/platform/billing/entries',
      { invoice_id: autoInvoice.id, kind, amount: autoInvoice.amount, external_ref: ref, reason: 'D33 sinovi' },
      ownerToken,
    );
  await autoEntry('payment', 'D33-PAY-1');
  autoRow = await autoState();
  assert.deepEqual([autoRow.status, autoRow.auto_blocked, autoRow.block_reason], ['active', false, null]);
  assert.equal(await autoCard(), 'paid');
  await call('GET', '/v1/projects', undefined, autoT.token);
  // Refund qoplashni qaytaradi — keyingi sikl yana bloklaydi
  await autoEntry('refund', 'D33-REFUND-1');
  assert.equal(await blockUnpaid(appPool!), 1);
  assert.equal((await autoState()).status, 'blocked');
  // Platforma egasi qo'lda ochsa, shu uzilish uchun qayta bloklanmaydi
  await call(
    'PATCH',
    `/v1/platform/tenants/${autoT.tenant.id}`,
    { status: 'active', version: (await autoState()).version, reason: 'To‘lov va’da qilindi' },
    ownerToken,
  );
  assert.equal(await blockUnpaid(appPool!), 0);
  assert.equal(await autoCard(), 'overdue');
  // Qo'lda qo'yilgan blokni to'lov ochmaydi
  await call(
    'PATCH',
    `/v1/platform/tenants/${autoT.tenant.id}`,
    { status: 'blocked', version: (await autoState()).version, reason: 'Qoida buzilishi' },
    ownerToken,
  );
  await autoEntry('payment', 'D33-PAY-2');
  autoRow = await autoState();
  assert.deepEqual(
    [autoRow.status, autoRow.auto_blocked, autoRow.block_reason],
    ['blocked', false, 'Qoida buzilishi'],
  );
  const autoAudit = (
    await admin.query(
      "SELECT action FROM audit_events WHERE resource_id=$1 AND details->>'automatic'='true' ORDER BY created_at,id",
      [autoT.tenant.id],
    )
  ).rows.map((r) => r.action);
  assert.deepEqual(autoAudit, ['tenant.blocked', 'tenant.active', 'tenant.blocked']);
  passed.push(
    'D33: an active company whose trial or paid period ended unpaid is blocked by the worker once (admin keeps the billing page), a covering payment after the gap reopens it, a refund blocks it again, a manual reopen (also of a never auto-blocked company) is not re-blocked for the same lapse, and a payment does not lift a manual block',
  );
  // ---- Bosqich 2: CBU kursi. Xatoda oxirgi kurs qoladi, 0 yozilmaydi; endpoint har bir foydalanuvchiga ochiq
  const noRate = await call('GET', '/v1/exchange-rates/latest', undefined, adminAgain);
  assert.equal(noRate.rate, null);
  const cbu = (status: number, body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  assert.equal(await refreshRates(appPool!, cbu(200, [{ Ccy: 'USD', Rate: '0', Date: '09.10.2026' }])), 'failed');
  // Bugungi (Toshkent) sanali kurs bor — CBU'ga so'rov yo'q; eski sanali kurs bo'lsa har siklda qayta so'raladi (dam olish kunlari CBU oldingi sanani qaytaradi)
  const cbuToday = (await admin.query("SELECT to_char((now() AT TIME ZONE 'Asia/Tashkent')::date,'DD.MM.YYYY') d")).rows[0].d as string;
  assert.equal(await refreshRates(appPool!, cbu(200, [{ Ccy: 'USD', Rate: '12800.00', Date: cbuToday }])), 'saved');
  assert.equal(await refreshRates(appPool!, cbu(200, [{ Ccy: 'USD', Rate: '13000', Date: cbuToday }])), 'skipped');
  await admin.query("DELETE FROM exchange_rates WHERE currency='USD'");
  assert.equal(await refreshRates(appPool!, cbu(200, [{ Ccy: 'USD', Rate: '12800.00', Date: '09.10.2026' }])), 'saved');
  assert.notEqual(await refreshRates(appPool!, cbu(200, [{ Ccy: 'USD', Rate: '12800.00', Date: '09.10.2026' }])), 'skipped');
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
  // Ombor mudiri: material yaratish va ombor amallari (admin faqat ko'radi, 2026-10-16)
  const whP = (await call('POST', '/v1/auth/login', { login: 'warehouse_manager', password: pass + '2' })).access_token;
  const projectQ = await call('POST', '/v1/projects', { name: 'Sarf zonasi obyekti' }, adminAgain);
  const qBlock = await call('POST', `/v1/projects/${projectQ.id}/zones`, { name: 'Blok Q', kind: 'block' }, adminAgain);
  await call(
    'POST',
    `/v1/projects/${projectQ.id}/premises`,
    { number: '1', kind: 'apartment', zone_id: qBlock.id, floor: null, rooms: null, area_m2: '10' },
    adminAgain,
  );
  const brick = await call('POST', '/v1/materials', { name: 'G‘isht', unit_id: 'pcs' }, whP);
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
  // Admin ombor amallarini bajarmaydi (2026-10-16): ombor mudiri va prorab obyektga biriktiriladi
  await call(
    'POST',
    `/v1/employees/${warehouseManager.id}/assignments`,
    { project_id: projectQ.id, warehouse_id: qWarehouse.warehouse.id },
    adminAgain,
  );
  await call('POST', `/v1/employees/${foreman.id}/assignments`, { project_id: projectQ.id }, adminAgain);
  const qOpeningBody = { project_id: projectQ.id, kind: 'opening', material_id: brick.id, to_account_id: qWarehouse.account.id, quantity: '1', unit_cost: '80', reason: 'Boshlang‘ich qoldiq' };
  await call('POST', '/v1/stock/commands', qOpeningBody, adminAgain, undefined, 403);
  await call('POST', '/v1/stock/commands', qOpeningBody, whP);
  const qTransfer = await call(
    'POST',
    '/v1/stock/commands',
    { project_id: projectQ.id, kind: 'transfer', material_id: brick.id, from_account_id: qWarehouse.account.id, to_account_id: qCustody.id, quantity: '1', reason: 'Brigadirga' },
    whP,
  );
  await call('POST', `/v1/stock/commands/${qTransfer.id}/actions`, { version: 1, action: 'accept', quantity: '1' }, brigP);
  const qConsumption = await call(
    'POST',
    '/v1/stock/commands',
    { project_id: projectQ.id, kind: 'consumption', material_id: brick.id, from_account_id: qCustody.id, quantity: '1', estimate_line_id: qEstimate.lines[0].id, reason: 'Zonasiz sarf' },
    brigP,
  );
  await call('POST', `/v1/stock/commands/${qConsumption.id}/actions`, { version: 1, action: 'review' }, adminAgain, undefined, 403);
  await call('POST', `/v1/stock/commands/${qConsumption.id}/actions`, { version: 1, action: 'review' }, foreP);
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
  await call('POST', `/v1/stock/commands/${qConsumption.id}/reverse`, { reason: 'Sarf xato kiritilgan' }, adminAgain, undefined, 403);
  await call('POST', `/v1/stock/commands/${qConsumption.id}/reverse`, { reason: 'Sarf xato kiritilgan' }, whP);
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
  const serviceD = await docD('service', '300.00', todayTk);
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
  // O12: reja–fakt, yig'ma (budjetlar sahifasi) va hisobotlar ham hisob sanasi bo'yicha — eski akt o'z oyida, dashboard bilan bir xil
  const paD = await call('GET', `/v1/finance/plan-actual?project_id=${projectD.id}`, undefined, adminAgain);
  const sumD = await call('GET', `/v1/finance/summary?project_id=${projectD.id}`, undefined, adminAgain);
  const repD = await call('GET', `/v1/finance/reports?from=${firstMonth}&to=${todayTk}&project_id=${projectD.id}`, undefined, adminAgain);
  const monthRow = (rows: any[], month: string) => rows.find((m) => String(m.month).slice(0, 10) === month);
  assert.equal(monthRow(paD.monthly, firstMonth)?.fact_value, '700.00');
  assert.equal(monthRow(sumD.monthly, firstMonth)?.expense, '700.00');
  assert.equal(monthRow(repD.expenses, firstMonth)?.total, '700.00');
  if (monthOf(reversalDate) === monthOf(todayTk)) {
    assert.equal(monthRow(paD.monthly, monthOf(todayTk))?.fact_value, '-400.00');
    assert.equal(monthRow(sumD.monthly, monthOf(todayTk))?.expense, '-400.00');
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
  // D (D23): obyekt moliya kartasi — GET /v1/projects/:id `finance` faqat narx huquqi bilan; to'langan = to'lov + avans
  // (storno asl tur bilan netto), kassalar aro o'tkazma kirmaydi; tushum — buyurtmachidan kirim
  const finD = async () => (await call('GET', `/v1/projects/${projectD.id}`, undefined, adminAgain)).finance;
  assert.deepEqual(await finD(), {
    plan_total: '0.00',
    fact_total: '300.00',
    remaining_plan: '-300.00',
    fact_percent: null,
    paid: '0.00',
    debt: '300.00',
    advances: '0.00',
    income: '0.00',
    progress_percent: null,
  });
  const cashD = (body: any) =>
    call('POST', '/v1/finance/documents', { project_id: projectD.id, document_date: todayTk, cash_account_id: treasury.id, ...body }, adminAgain);
  await cashD({ kind: 'receipt', amount: '1000.00', description: 'Buyurtmachidan tushum (karta testi)' });
  const payD = await cashD({ kind: 'payment', amount: '300.00', counterparty_id: supplier.id, allocated_invoice_id: serviceD.id, description: 'Xizmat to‘lovi (karta testi)' });
  await cashD({ kind: 'advance', amount: '50.00', counterparty_id: supplier.id, description: 'Avans (karta testi)' });
  const cardCashbox = await call('POST', '/v1/cash-accounts', { name: 'Karta kassa', kind: 'cash' }, adminAgain);
  await cashD({ kind: 'cash_transfer', amount: '100.00', target_cash_account_id: cardCashbox.id, description: 'Kassalar aro o‘tkazma (karta testi)' });
  let finCard = await finD();
  assert.deepEqual([finCard.paid, finCard.debt, finCard.advances, finCard.income], ['350.00', '0.00', '50.00', '1000.00']);
  await call('POST', `/v1/finance/documents/${payD.id}/reverse`, { reason: 'To‘lov stornosi (karta testi)' }, adminAgain);
  finCard = await finD();
  assert.deepEqual([finCard.paid, finCard.debt, finCard.fact_total], ['50.00', '300.00', '300.00']);
  const foreCard = (await call('POST', '/v1/auth/login', { login: 'foreman', password: pass + '2' })).access_token;
  assert.equal((await call('GET', `/v1/projects/${project.id}`, undefined, foreCard)).finance, null);
  assert((await call('GET', `/v1/projects/${project.id}`, undefined, adminAgain)).finance.plan_total !== undefined);
  passed.push(
    'Project finance card: plan, fact, remaining, paid (payments and advances net of reversals, transfers excluded), debt, advances and customer income come from the server, only with prices.read',
  );
  // Budjetdan oshgan obyekt "Budjetlar" sahifasi bilan bir xil: budjet oylari fakti > budjet
  // Budjet xarajatlar oyiga (expenseP — 2026-10-05); dashboardning 6 oylik davri shu oyni o'z ichiga oladi
  const thisMonth = '2026-10-01';
  assert(dash6.period.from <= thisMonth && thisMonth <= dash6.period.to, `davr ${dash6.period.from}..${dash6.period.to}`);
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
  // O1: invoysga bog'lanadigan kirim tanlovi — unmatched=true bog'langan kirimni chiqarmaydi, q material nomi bo'yicha
  const receiptBody = {
    project_id: project.id,
    kind: 'receipt',
    material_id: material.id,
    to_account_id: warehouse.account.id,
    quantity: '2',
    unit_cost: '15',
    reason: 'Yetkazib beruvchidan kirim',
  };
  const matchedReceipt = await call('POST', '/v1/stock/commands', receiptBody, whP);
  const freeReceipt = await call('POST', '/v1/stock/commands', receiptBody, whP);
  await call(
    'POST',
    '/v1/finance/documents',
    {
      project_id: project.id,
      kind: 'supplier_invoice',
      amount: '30',
      counterparty_id: supplier.id,
      matched_receipt_id: matchedReceipt.id,
      description: 'Kirim uchun invoys',
      document_date: '2026-10-02',
    },
    adminAgain,
  );
  const receiptIds = async (extra: string) =>
    (
      await call(
        'GET',
        `/v1/stock/commands?project_id=${project.id}&kind=receipt&status=posted&limit=100${extra}`,
        undefined,
        adminAgain,
      )
    ).items.map((r: any) => r.id);
  const allReceipts = await receiptIds('');
  assert(allReceipts.includes(matchedReceipt.id) && allReceipts.includes(freeReceipt.id));
  const unmatchedReceipts = await receiptIds('&unmatched=true');
  assert(!unmatchedReceipts.includes(matchedReceipt.id) && unmatchedReceipts.includes(freeReceipt.id));
  assert.deepEqual(await receiptIds('&unmatched=false'), allReceipts);
  assert(
    (await receiptIds(`&unmatched=true&q=${encodeURIComponent(material.name)}`)).includes(freeReceipt.id),
  );
  assert.deepEqual(await receiptIds('&unmatched=true&q=mavjud-emas-xyz'), []);
  // Buxgalter invoysni o'zi yaratadi: bog'lanmagan kirimlarni ko'radi (stock.read), lekin kirim yarata olmaydi.
  // Boshlang'ich token bu bo'limgacha eskiradi — boshqa bo'limlardagidek yangi login.
  const accP = (await call('POST', '/v1/auth/login', { login: 'accountant', password: pass + '2' })).access_token;
  const accountantReceipts = (
    await call(
      'GET',
      `/v1/stock/commands?project_id=${project.id}&kind=receipt&status=posted&unmatched=true&limit=100`,
      undefined,
      accP,
    )
  ).items.map((r: any) => r.id);
  assert(accountantReceipts.includes(freeReceipt.id) && !accountantReceipts.includes(matchedReceipt.id));
  await call('POST', '/v1/stock/commands', receiptBody, accP, undefined, 403);
  await call(
    'GET',
    `/v1/stock/commands?project_id=${project.id}&unmatched=yes`,
    undefined,
    adminAgain,
    undefined,
    400,
  );
  passed.push(
    'Receipts for invoice matching: unmatched=true hides receipts already on an invoice, q searches the material name; the accountant lists unmatched receipts but cannot post stock',
  );
  // ---- Avans hisobi (egasi, 2026-10-26): subpudratchi avansi uning dalolatnomasiga hisoblanadi
  const subCp = await call(
    'POST',
    '/v1/counterparties',
    { name: 'Usta Subpudrat', kind: 'contractor' },
    adminAgain,
  );
  const subDoc = (body: any, token = accP, expected = 200, projectId = project.id) =>
    call(
      'POST',
      '/v1/finance/documents',
      { project_id: projectId, counterparty_id: subCp.id, document_date: '2026-10-05', ...body },
      token,
      undefined,
      expected,
    );
  const subRow = async () =>
    (await call('GET', '/v1/counterparties?kind=contractor&q=Usta%20Subpudrat', undefined, adminAgain)).items.find(
      (c: any) => c.id === subCp.id,
    );
  const subAct = async (id: string) =>
    (
      await call(
        'GET',
        `/v1/finance/documents?project_id=${project.id}&kind=labor&counterparty_id=${subCp.id}&limit=100`,
        undefined,
        adminAgain,
      )
    ).items.find((d: any) => d.id === id);
  await subDoc({ kind: 'advance', amount: '3000000', cash_account_id: treasury.id, description: 'Subpudratchiga avans' });
  const subLabor = await subDoc({
    kind: 'labor',
    amount: '10000000',
    due_date: '2026-10-10',
    description: 'Poydevor ishlari dalolatnomasi',
  });
  assert.equal((await subAct(subLabor.id)).advance_offsettable, '3000000.00');
  // Kassa hisobi yoki bog'langan hujjatsiz avans hisobi — 400; avansdan ortiq — ADVANCE_INSUFFICIENT
  await subDoc(
    { kind: 'advance_offset', amount: '1', cash_account_id: treasury.id, allocated_invoice_id: subLabor.id, description: 'Kassa bilan hisob' },
    accP,
    400,
  );
  await subDoc({ kind: 'advance_offset', amount: '1', description: 'Hujjatsiz avans hisobi' }, accP, 400);
  assert.equal(
    (
      await subDoc(
        { kind: 'advance_offset', amount: '3000000.01', allocated_invoice_id: subLabor.id, description: 'Avansdan ortiq hisob' },
        accP,
        409,
      )
    ).error.code,
    'ADVANCE_INSUFFICIENT',
  );
  // Finansist (bank/kassa yaratish yo'q) va prorab avansni hisoblay olmaydi
  const finOffset = (await call('POST', '/v1/auth/login', { login: 'financier', password: pass + '2' })).access_token;
  const foreOffset = (await call('POST', '/v1/auth/login', { login: 'foreman', password: pass + '2' })).access_token;
  const offsetBody = { kind: 'advance_offset', amount: '1', allocated_invoice_id: subLabor.id, description: 'Ruxsatsiz hisob' };
  await subDoc(offsetBody, finOffset, 403);
  await subDoc(offsetBody, foreOffset, 403);
  // Parallel: avans 3 mln, ikkita 2 mln lik hisob — kontragent qulfi tufayli faqat bittasi o'tadi
  const parallelOffsets = await Promise.all(
    [1, 2].map(() =>
      app!.inject({
        method: 'POST',
        url: '/v1/finance/documents',
        payload: {
          project_id: project.id,
          counterparty_id: subCp.id,
          kind: 'advance_offset',
          amount: '2000000',
          allocated_invoice_id: subLabor.id,
          description: 'Parallel avans hisobi',
          document_date: '2026-10-06',
        },
        headers: { authorization: `Bearer ${accP}`, 'idempotency-key': randomUUID() },
      }),
    ),
  );
  assert.deepEqual(parallelOffsets.map((r) => r.statusCode).sort(), [200, 409]);
  assert.equal(parallelOffsets.find((r) => r.statusCode === 409)!.json().error.code, 'ADVANCE_INSUFFICIENT');
  // Mijoz admini ham avans hisobini qiladi: qolgan 1 mln
  const adminOffset = await subDoc(
    { kind: 'advance_offset', amount: '1000000', allocated_invoice_id: subLabor.id, description: 'Qolgan avans hisobi' },
    adminAgain,
  );
  let subNow = await subRow();
  assert.equal(subNow.debt, '7000000.00');
  assert.equal(subNow.advance, '0.00');
  let actNow = await subAct(subLabor.id);
  assert.equal(actNow.paid, '3000000.00');
  assert.equal(actNow.outstanding, '7000000.00');
  assert.equal(actNow.advance_offsettable, '0.00');
  await subDoc({
    kind: 'payment',
    amount: '7000000',
    cash_account_id: treasury.id,
    allocated_invoice_id: subLabor.id,
    description: 'Dalolatnoma qoldig‘i to‘lovi',
  });
  assert.equal(
    (
      await subDoc(
        { kind: 'payment', amount: '1', cash_account_id: treasury.id, allocated_invoice_id: subLabor.id, description: 'Ortiqcha to‘lov' },
        accP,
        409,
      )
    ).error.code,
    'OVERPAYMENT_USE_ADVANCE',
  );
  subNow = await subRow();
  assert.equal(subNow.debt, '0.00');
  assert.equal(subNow.advance, '0.00');
  assert.equal(subNow.overdue, '0.00');
  actNow = await subAct(subLabor.id);
  assert.equal(actNow.outstanding, '0.00');
  const subStatement = await call('GET', `/v1/counterparties/${subCp.id}/statement?project_id=${project.id}`, undefined, adminAgain);
  assert.equal(subStatement.items.at(-1).running_debt, '0.00');
  assert.deepEqual(
    [subStatement.totals.debt, subStatement.totals.advance].map((v: string) => dec(v).toFixed(2)),
    ['0.00', '0.00'],
  );
  const subJournal = (
    await admin.query(
      "SELECT coalesce(-sum(amount) FILTER(WHERE account='cash'),0)::text cash_out,coalesce(sum(amount) FILTER(WHERE account='expense'),0)::text expense FROM journal_entries WHERE counterparty_id=$1",
      [subCp.id],
    )
  ).rows[0];
  assert.equal(subJournal.cash_out, '10000000.00');
  assert.equal(subJournal.expense, '10000000.00');
  passed.push(
    'Advance offset: a subcontractor advance closes part of its labor act (payable +, advance −, no cash or expense), never above the advance or the act balance, serialized under parallel requests; the admin and the accountant may offset, the financier and the foreman get 403',
  );
  // Storno: dalolatnoma avval to'lov va hisoblar storno qilinmaguncha qoladi; hisoblangan avans storno qilinmaydi;
  // hisob storno qilinsa qarz va avans qaytadi
  assert.equal(
    (await call('POST', `/v1/finance/documents/${subLabor.id}/reverse`, { reason: 'Xato dalolatnoma' }, adminAgain, undefined, 409)).error
      .code,
    'REVERSE_PAYMENTS_FIRST',
  );
  const subAdvance = (
    await admin.query("SELECT id FROM finance_documents WHERE counterparty_id=$1 AND kind='advance'", [subCp.id])
  ).rows[0];
  assert.equal(
    (await call('POST', `/v1/finance/documents/${subAdvance.id}/reverse`, { reason: 'Avans bekor' }, adminAgain, undefined, 409))
      .error.code,
    'ADVANCE_ALREADY_APPLIED',
  );
  await call('POST', `/v1/finance/documents/${adminOffset.id}/reverse`, { reason: 'Hisob xato kiritildi' }, adminAgain);
  subNow = await subRow();
  assert.equal(subNow.debt, '1000000.00');
  assert.equal(subNow.advance, '1000000.00');
  actNow = await subAct(subLabor.id);
  assert.equal(actNow.outstanding, '1000000.00');
  assert.equal(actNow.advance_offsettable, '1000000.00');
  // Boshqa obyektdagi avans bu obyekt hujjatiga hisoblanmaydi
  await subDoc(
    { kind: 'advance', amount: '500000', cash_account_id: treasury.id, description: 'B obyekt avansi' },
    adminAgain,
    200,
    projectB.id,
  );
  const subLabor2 = await subDoc({ kind: 'labor', amount: '2000000', description: 'Devor ishlari dalolatnomasi' });
  assert.equal(
    (
      await subDoc(
        { kind: 'advance_offset', amount: '1500000', allocated_invoice_id: subLabor2.id, description: 'Boshqa obyekt avansi bilan' },
        accP,
        409,
      )
    ).error.code,
    'ADVANCE_INSUFFICIENT',
  );
  assert.equal((await subAct(subLabor2.id)).advance_offsettable, '1000000.00');
  passed.push(
    'Advance offset reversal restores debt and advance; an act with live offsets or payments and an already applied advance cannot be reversed; another project advance is never offset',
  );
  // Ish haqi davri hujjati avans bilan yopilmaydi (ish haqi sahifasidan net summa to'lanadi)
  const offsetPeriod = await call('POST', '/v1/finance/payroll/periods', { project_id: project.id, month: '2026-09-01' }, adminAgain);
  await call(
    'POST',
    `/v1/finance/payroll/periods/${offsetPeriod.id}/entries`,
    { employee_id: foreman.id, base_salary: '1000000' },
    adminAgain,
  );
  await call('POST', `/v1/finance/payroll/periods/${offsetPeriod.id}/post`, { version: offsetPeriod.version }, adminAgain);
  const salaryDoc = (
    await admin.query(
      'SELECT f.id,f.counterparty_id FROM payroll_entries e JOIN finance_documents f ON f.id=e.labor_document_id WHERE e.period_id=$1',
      [offsetPeriod.id],
    )
  ).rows[0];
  await call(
    'POST',
    '/v1/finance/documents',
    {
      project_id: project.id,
      counterparty_id: salaryDoc.counterparty_id,
      kind: 'advance',
      amount: '300000',
      cash_account_id: treasury.id,
      description: 'Xodimga avans',
      document_date: '2026-10-05',
    },
    adminAgain,
  );
  assert.equal(
    (
      await call(
        'POST',
        '/v1/finance/documents',
        {
          project_id: project.id,
          counterparty_id: salaryDoc.counterparty_id,
          kind: 'advance_offset',
          amount: '300000',
          allocated_invoice_id: salaryDoc.id,
          description: 'Ish haqini avans bilan yopish',
          document_date: '2026-10-05',
        },
        adminAgain,
        undefined,
        409,
      )
    ).error.code,
    'PAYROLL_DOCUMENT_NOT_OFFSETTABLE',
  );
  const salaryRow = (
    await call('GET', `/v1/finance/documents?project_id=${project.id}&kind=labor&limit=100`, undefined, adminAgain)
  ).items.find((d: any) => d.id === salaryDoc.id);
  assert.equal(salaryRow.advance_offsettable, '0.00');
  passed.push('A payroll period labor document is paid from the payroll page only and is never offered for advance offset');
  // O7: moliya yig'masi yozuv bo'lmasa ham 2 xonali summa qaytaradi ('0' emas, '0.00')
  const emptyProject = await call('POST', '/v1/projects', { name: 'Bo‘sh yig‘ma' }, adminAgain);
  const emptySummary = await call(
    'GET',
    `/v1/finance/summary?project_id=${emptyProject.id}`,
    undefined,
    adminAgain,
  );
  for (const key of [
    'actual_cost',
    'inventory_value',
    'net_cash_flow',
    'supplier_debt',
    'advances',
    'income',
    'allocations',
    'purchase_orders',
  ])
    assert.equal(emptySummary[key], '0.00', key);
  assert.deepEqual(
    emptySummary.by_project.map((p: any) => [p.actual_cost, p.debt, p.budget]),
    [['0.00', '0.00', '0.00']],
  );
  const twoDecimals = /^-?\d+\.\d{2}$/;
  const fullSummary = await call('GET', '/v1/finance/summary', undefined, adminAgain);
  for (const row of [...fullSummary.top_debt, ...fullSummary.monthly, ...fullSummary.by_kind])
    for (const key of ['debt', 'advance', 'expense', 'cash_out', 'cash_in', 'budget', 'amount'])
      if (key in row) assert.match(row[key], twoDecimals, `${key}=${row[key]}`);
  assert(fullSummary.top_debt.length > 0 && fullSummary.monthly.length > 0);
  passed.push('Finance summary amounts always have two decimals, also for a project without entries');
  // ---- Egasi fikri (2026-10-12): openpyxl uslubidagi Excel smeta (mutlaq rels yo'li, jadval, tepada nom va izoh,
  // pastda birlashtirilgan JAMI qatori, "m³" va "kompl." birliklari) import qilinadi.
  const smetaBook = new ExcelJS.Workbook();
  const smetaSheet = smetaBook.addWorksheet('Test smeta');
  smetaSheet.addRow(['QURILISH SMETASI (TEST)']);
  smetaSheet.mergeCells('A1:F1');
  smetaSheet.addRow(['DIQQAT: shartli qiymatlar']);
  smetaSheet.mergeCells('A2:F2');
  smetaSheet.addRow([]);
  smetaSheet.addTable({
    name: 'TestSmeta',
    ref: 'A4',
    headerRow: true,
    columns: ['Bo‘lim', 'Ish nomi', 'O‘lchov birligi', 'Miqdor', 'Birlik narxi (so‘m)', 'Jami summa (so‘m)'].map(
      (name) => ({ name }),
    ),
    rows: [
      ['Poydevor', 'Beton quyish', 'm³', 2, 1000, { formula: 'D5*E5' }],
      ['Tayyorgarlik', 'Geodezik belgilash', 'kompl.', 1, 500, { formula: 'D6*E6' }],
      ['Poydevor', 'Gidroizolyatsiya', 'm²', 3, 10, { formula: 'D7*E7' }],
    ],
  });
  smetaSheet.addRow([]);
  smetaSheet.addRow(['UMUMIY JAMI', null, null, null, null, { formula: 'SUM(F5:F7)' }]);
  smetaSheet.mergeCells('A9:E9');
  const smetaZip = await JSZip.loadAsync(Buffer.from(await smetaBook.xlsx.writeBuffer()));
  for (const relName of Object.keys(smetaZip.files).filter((n) => n.endsWith('.rels'))) {
    const xml = await smetaZip.file(relName)!.async('string');
    smetaZip.file(relName, xml.replace(/Target="\.\.\/tables\//g, 'Target="/xl/tables/'));
  }
  const smetaRels = await smetaZip.file('xl/worksheets/_rels/sheet1.xml.rels')!.async('string');
  assert.match(smetaRels, /Target="\/xl\/tables\/table1\.xml"/);
  const smetaB64 = (await smetaZip.generateAsync({ type: 'nodebuffer' })).toString('base64');
  const smetaInspect = await call(
    'POST',
    '/v1/estimate-imports/inspect',
    { file_base64: smetaB64 },
    adminAgain,
  );
  assert.equal(smetaInspect.header_row, 4);
  assert.deepEqual(smetaInspect.headers, [
    'Bo‘lim',
    'Ish nomi',
    'O‘lchov birligi',
    'Miqdor',
    'Birlik narxi (so‘m)',
    'Jami summa (so‘m)',
  ]);
  assert.deepEqual(smetaInspect.sample[0].slice(0, 5), ['Poydevor', 'Beton quyish', 'm³', '2', '1000']);
  const smetaPreview = await call(
    'POST',
    '/v1/estimate-imports/preview',
    {
      project_id: projectQ.id,
      name: 'Openpyxl smeta',
      file_base64: smetaB64,
      mapping: {
        category: 'Bo‘lim',
        description: 'Ish nomi',
        unit_id: 'O‘lchov birligi',
        quantity: 'Miqdor',
        unit_price: 'Birlik narxi (so‘m)',
      },
      defaults: { kind: 'labor' },
    },
    adminAgain,
  );
  assert.deepEqual(
    smetaPreview.preview.lines.map((l: any) => [l.description, l.unit_id, l.quantity]),
    [
      ['Beton quyish', 'm3', '2'],
      ['Geodezik belgilash', 'set', '1'],
      ['Gidroizolyatsiya', 'm2', '3'],
    ],
  );
  // Formula ustuni (Jami) xaritalansa rad etiladi; o'qib bo'lmaydigan ZIP 500 emas, INVALID_XLSX
  await call(
    'POST',
    '/v1/estimate-imports/preview',
    {
      project_id: projectQ.id,
      name: 'Formula',
      file_base64: smetaB64,
      mapping: { description: 'Ish nomi', quantity: 'Miqdor', unit_price: 'Jami summa (so‘m)' },
      defaults: { kind: 'labor', unit_id: 'm2' },
    },
    adminAgain,
    undefined,
    400,
  );
  // 2026-10-22: Excelda bor, bazada yo'q material va zona nomlari import paytida avtomatik yaratiladi
  const autoBook = new ExcelJS.Workbook();
  const autoSheet = autoBook.addWorksheet('Smeta');
  autoSheet.addRow(['Nomi', 'Material', 'Zona', 'Birlik', 'Miqdor', 'Narx']);
  autoSheet.addRow(['Sement quyish', 'Avto-sement M400', 'Avto-zona 1', 'kg', 5, 100]);
  autoSheet.addRow(['Sement qo‘shimcha', 'avto-sement m400', 'AVTO-ZONA 1', 'kg', 2, 100]);
  const autoB64 = Buffer.from(await autoBook.xlsx.writeBuffer()).toString('base64');
  const autoPreview = await call(
    'POST',
    '/v1/estimate-imports/preview',
    {
      project_id: projectQ.id,
      name: 'Avto yaratish',
      file_base64: autoB64,
      mapping: { description: 'Nomi', material_name: 'Material', zone_name: 'Zona', unit_id: 'Birlik', quantity: 'Miqdor', unit_price: 'Narx' },
      defaults: { kind: 'material' },
    },
    adminAgain,
  );
  assert.deepEqual(autoPreview.created, { materials: 1, zones: 1 });
  assert.equal(autoPreview.preview.lines[0].material_id, autoPreview.preview.lines[1].material_id);
  assert.equal(autoPreview.preview.lines[0].zone_id, autoPreview.preview.lines[1].zone_id);
  const autoMaterial = (await admin!.query("SELECT unit_id FROM materials WHERE name='Avto-sement M400'")).rows;
  assert.deepEqual(autoMaterial.map((r: any) => r.unit_id), ['kg']);
  await call('POST', `/v1/estimate-imports/${autoPreview.id}/commit`, { digest: autoPreview.digest }, adminAgain);
  // Noma'lum birlik bo'lsa material yaratilmaydi, xato qaytadi (tranzaksiya bekor)
  autoSheet.getCell('D2').value = 'noma-lum-birlik';
  autoSheet.getCell('B2').value = 'Boshqa material';
  const badUnit = Buffer.from(await autoBook.xlsx.writeBuffer()).toString('base64');
  await call(
    'POST',
    '/v1/estimate-imports/preview',
    {
      project_id: projectQ.id,
      name: 'Noma‘lum birlik',
      file_base64: badUnit,
      mapping: { description: 'Nomi', material_name: 'Material', unit_id: 'Birlik', quantity: 'Miqdor', unit_price: 'Narx' },
      defaults: { kind: 'material' },
    },
    adminAgain,
    undefined,
    400,
  );
  assert.equal((await admin!.query("SELECT count(*)::int n FROM materials WHERE name='Boshqa material'")).rows[0].n, 0);
  // O3: jami serverda — qator `total` va umumiy `total` (decimal), frontend qo'shmaydi
  assert.equal(smetaPreview.preview.lines[0].total, '2000.00');
  assert.equal(
    smetaPreview.total,
    smetaPreview.preview.lines.reduce((sum: any, l: any) => sum.add(l.total), dec('0')).toFixed(2),
  );
  assert.equal(
    smetaPreview.total,
    smetaPreview.preview.lines.reduce((sum: any, l: any) => sum.add(dec(l.quantity).mul(l.unit_price)), dec('0')).toFixed(2),
  );
  passed.push('Estimate import creates missing materials and zones (case-insensitive, once), reports the counts, and rolls back when a unit is unknown');
  // Mijoz admini adminlikni topshira olmaydi (faqat platforma o'tkazadi); jadvalni xlsx qilish
  await call('POST', '/v1/company/ownership', { new_admin_id: foreman.id, previous_admin_role: 'manager', reason: 'Endi mumkin emas' }, adminAgain, undefined, 404);
  const tableXlsx = await call('POST', '/v1/exports/table', { filename: 'sinov jadval', sheet: 'Sinov', title: 'Sinov', headers: ['Nomi', 'Summa'], rows: [['A', '1000.50'], ['B', null]] }, adminAgain);
  assert.equal(tableXlsx.filename, 'sinov_jadval.xlsx');
  const tableBook = new ExcelJS.Workbook();
  await tableBook.xlsx.load(Buffer.from(tableXlsx.base64, 'base64') as any);
  assert.equal(tableBook.worksheets[0]!.getRow(3).getCell(2).value, 'Summa');
  assert.equal(tableBook.worksheets[0]!.getRow(4).getCell(2).value, 1000.5);
  passed.push('Company admin can no longer transfer adminship (endpoint removed); /v1/exports/table builds an xlsx from a screen table');
  const brokenZip = new JSZip();
  brokenZip.file('xl/workbook.xml', '<workbook');
  assert.equal(
    (
      await call(
        'POST',
        '/v1/estimate-imports/inspect',
        { file_base64: (await brokenZip.generateAsync({ type: 'nodebuffer' })).toString('base64') },
        adminAgain,
        undefined,
        400,
      )
    ).error.code,
    'INVALID_XLSX',
  );
  passed.push(
    'Estimate import reads openpyxl workbooks (absolute rels, table, merged title and total rows), finds the header row, maps m³/m²/kompl. units and reports unreadable files as INVALID_XLSX',
  );
  // D25: smeta fayli 10 MB gacha — 2 MB dan katta to'g'ri fayl o'qiladi, 10 MB dan bir bayt kattasi rad etiladi
  const bigBook = new ExcelJS.Workbook();
  const bigSheet = bigBook.addWorksheet('Smeta');
  bigSheet.addRow(['Nomi', 'Izoh']);
  for (let i = 0; i < 1900; i++) bigSheet.addRow([`Qator ${i}`, randomBytes(1800).toString('base64')]);
  const bigFile = Buffer.from(await bigBook.xlsx.writeBuffer());
  assert.ok(bigFile.length > 2 * 1024 * 1024, `test fayli ${bigFile.length} bayt`);
  assert.equal(
    (await call('POST', '/v1/estimate-imports/inspect', { file_base64: bigFile.toString('base64') }, adminAgain)).rows,
    1900,
  );
  const tooBig = Buffer.alloc(10 * 1024 * 1024 + 1);
  tooBig.write('PK');
  assert.equal(
    (await call('POST', '/v1/estimate-imports/inspect', { file_base64: tooBig.toString('base64') }, adminAgain, undefined, 400)).error.code,
    'INVALID_XLSX',
  );
  passed.push('Estimate import accepts a valid workbook over 2 MB and rejects one byte over 10 MB (D25)');
  // D30: smeta varag'i 20 000 qatorgacha — eski 2 000 chegarasidan katta smeta preview'dan o'tadi, 20 001 dan oshgani rad
  const longBook = new ExcelJS.Workbook();
  const longSheet = longBook.addWorksheet('Smeta');
  longSheet.addRow(['Nomi', 'Turi', 'Birlik', 'Miqdor', 'Narx']);
  for (let i = 1; i <= 2500; i++) longSheet.addRow([`Ish ${i}`, 'labor', 'm2', 2, 1000]);
  const longPreview = await call(
    'POST',
    '/v1/estimate-imports/preview',
    {
      project_id: projectQ.id,
      name: 'Uzun smeta',
      file_base64: Buffer.from(await longBook.xlsx.writeBuffer()).toString('base64'),
      mapping: { description: 'Nomi', kind: 'Turi', unit_id: 'Birlik', quantity: 'Miqdor', unit_price: 'Narx' },
    },
    adminAgain,
  );
  assert.deepEqual([longPreview.preview.lines.length, longPreview.total], [2500, '5000000.00']);
  for (let i = 2501; i <= 20001; i++) longSheet.addRow([`Ish ${i}`, 'labor', 'm2', 2, 1000]);
  assert.equal(
    (await call('POST', '/v1/estimate-imports/inspect', { file_base64: Buffer.from(await longBook.xlsx.writeBuffer()).toString('base64') }, adminAgain, undefined, 400)).error.code,
    'WORKBOOK_LIMIT',
  );
  passed.push('Estimate import reads a sheet over the old 2 000-row limit and rejects one over 20 000 rows (D30)');
  // 2026-11-03: platforma eksporti qayta import qilinadi (JAMI qatori o'tkaziladi); birlik va qiymat xatolari Excel qatori bilan
  const exportedEst = await call(
    'POST',
    '/v1/estimates',
    {
      project_id: projectQ.id,
      name: 'Eksport sinovi',
      lines: [
        { kind: 'labor', description: 'Suvoq', unit_id: 'm2', quantity: '12.5', unit_price: '20000', category: 'Pardozlash' },
        { kind: 'material', description: 'Sement', material_id: material.id, unit_id: 'kg', quantity: '40', unit_price: '1500' },
      ],
    },
    adminAgain,
  );
  const exportedFile = await call('GET', `/v1/estimates/${exportedEst.id}/export`, undefined, adminAgain);
  const reimported = await call(
    'POST',
    '/v1/estimate-imports/preview',
    {
      project_id: projectQ.id,
      name: 'Eksportdan qayta',
      file_base64: exportedFile.base64,
      mapping: { kind: 'Turi', category: 'Kategoriya', description: 'Nomi', material_name: 'Material', zone_name: 'Zona', unit_id: 'Birlik', quantity: 'Miqdor', norm: 'Norma', work_quantity: 'Ish hajmi', loss_percent: 'Yo‘qotish %', unit_price: 'Birlik narxi', note: 'Izoh' },
    },
    adminAgain,
  );
  assert.deepEqual([reimported.preview.lines.length, reimported.total], [2, '310000.00']);
  const rowsBook = async (rows: unknown[][]) => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Smeta');
    for (const r of rows) sheet.addRow(r);
    return Buffer.from(await book.xlsx.writeBuffer()).toString('base64');
  };
  const unitRows = await call(
    'POST',
    '/v1/estimate-imports/preview',
    {
      project_id: projectQ.id,
      name: 'Birlik xatosi',
      file_base64: await rowsBook([
        ['Nomi', 'Turi', 'Birlik', 'Miqdor', 'Narx', 'Material'],
        ['Mehnat', 'labor', 'ЧЕЛ.-Ч', 2, 100, null],
        ['Bolt', 'material', 'kg', 1, 100, 'QA bolt (birlik)'],
        ['Bolt', 'material', 'm3', 1, 100, 'QA bolt (birlik)'],
        ['Bolt', 'material', 't', 1, 100.5, 'QA bolt (birlik)'],
      ]),
      mapping: { description: 'Nomi', kind: 'Turi', unit_id: 'Birlik', quantity: 'Miqdor', unit_price: 'Narx', material_name: 'Material' },
    },
    adminAgain,
    undefined,
    400,
  );
  assert.deepEqual(
    [unitRows.error.code, unitRows.error.details],
    [
      'IMPORT_NAMES_UNRESOLVED',
      [
        { row: 2, field: 'unit_id', message: 'ЧЕЛ.-Ч' },
        { row: 4, field: 'unit_id', message: 'm3 ≠ kg' },
        { row: 5, field: 'unit_id', message: 't ≠ kg' },
      ],
    ],
  );
  // D31: bir material t va kg da — material birligiga o'tkaziladi, jami o'zgarmaydi
  const massRows = await call(
    'POST',
    '/v1/estimate-imports/preview',
    {
      project_id: projectQ.id,
      name: 'Birlik o‘tkazish',
      file_base64: await rowsBook([
        ['Nomi', 'Birlik', 'Miqdor', 'Norma', 'Ish hajmi', 'Narx', 'Material'],
        ['Armatura', 't', 2, null, null, 9000000, 'QA armatura (t↔kg)'],
        ['Armatura', 'кг', 12.5, null, null, 9000, 'QA armatura (t↔kg)'],
        ['Armatura', 'kg', 5, 0.5, 10, 9000, 'QA armatura (t↔kg)'],
      ]),
      mapping: { description: 'Nomi', unit_id: 'Birlik', quantity: 'Miqdor', norm: 'Norma', work_quantity: 'Ish hajmi', unit_price: 'Narx', material_name: 'Material' },
      defaults: { kind: 'material' },
    },
    adminAgain,
  );
  assert.deepEqual(
    [
      massRows.total,
      massRows.converted,
      massRows.preview.lines.map((l: any) => [l.unit_id, l.quantity, l.norm ?? null, l.unit_price, l.total]),
    ],
    [
      '18157500.00',
      [
        { row: 3, from: 'kg', to: 't' },
        { row: 4, from: 'kg', to: 't' },
      ],
      [
        ['t', '2', null, '9000000', '18000000.00'],
        ['t', '0.0125', null, '9000000', '112500.00'],
        ['t', '0.005', '0.0005', '9000000', '45000.00'],
      ],
    ],
  );
  const valueRows = await call(
    'POST',
    '/v1/estimate-imports/preview',
    {
      project_id: projectQ.id,
      name: 'Qiymat xatosi',
      file_base64: await rowsBook([
        ['Nomi', 'Turi', 'Birlik', 'Miqdor', 'Narx'],
        ['Suvoq', 'labor', 'm2', 'abc', 100],
        ['Bo‘yoq', 'labor', 'm2', 3, null],
      ]),
      mapping: { description: 'Nomi', kind: 'Turi', unit_id: 'Birlik', quantity: 'Miqdor', unit_price: 'Narx' },
    },
    adminAgain,
    undefined,
    400,
  );
  assert.deepEqual(
    [valueRows.error.code, valueRows.error.details],
    ['IMPORT_ROWS_INVALID', [{ row: 2, field: 'quantity', message: 'abc' }, { row: 3, field: 'unit_price', message: '' }]],
  );
  passed.push(
    'Estimate export re-imports with the same total (the JAMI row is skipped); unit errors (unknown unit, other unit of the same material) and value errors come back with the Excel row number',
  );
  passed.push(
    'Estimate import converts a material given in t and kg to the material unit with the same line totals; an inexact conversion stays a unit error with the Excel row (D31)',
  );
  // D29: Form 5 — varaqlar ro'yxati, preview (21 % qo'shilgan), hammasi bitta amalda saqlanadi; xatolar varaq va qator bilan
  const form5File = Buffer.from(await form5Workbook().xlsx.writeBuffer()).toString('base64');
  const f5inspect = await call('POST', '/v1/estimate-imports/inspect', { file_base64: form5File }, adminAgain);
  assert.deepEqual(
    [f5inspect.format, f5inspect.sheets.map((s: any) => [s.sheet, s.form5, s.works, s.resources, s.materials, s.priced])],
    [
      'form5',
      [
        ['Накладная', false, 0, 0, 0, 0],
        ['Локалка 1', true, 2, 7, 2, 8],
        ['Нормы', true, 1, 2, 1, 0],
      ],
    ],
  );
  const f5body = (addRows?: number[], file = form5File) => ({
    project_id: projectQ.id,
    file_base64: file,
    sheets: [
      { sheet: 'Локалка 1', name: 'Form 5 lokalka', ...(addRows ? { add_rows: addRows } : {}) },
      { sheet: 'Нормы', name: 'Form 5 normalar' },
    ],
  });
  assert.equal(
    (await call('POST', '/v1/estimate-imports/form5/preview', f5body([24]), adminAgain, undefined, 400)).error.code,
    'EXCEL_ROW_NOT_ADDABLE',
  );
  const brokenFile = Buffer.from(await form5Workbook({ brokenFormula: true }).xlsx.writeBuffer()).toString('base64');
  const f5broken = await call('POST', '/v1/estimate-imports/form5/preview', f5body(undefined, brokenFile), adminAgain, undefined, 400);
  assert.deepEqual(
    [f5broken.error.code, f5broken.error.details],
    ['IMPORT_ROWS_INVALID', [{ sheet: 'Локалка 1', row: 10, field: 'norm', message: 'formula' }]],
  );
  const f5 = await call('POST', '/v1/estimate-imports/form5/preview', f5body([23]), adminAgain);
  const [f5lok, f5norm] = f5.sheets;
  assert.deepEqual(
    [
      f5lok.lines,
      f5lok.total,
      f5lok.direct_total,
      f5lok.excel_total,
      f5lok.excel_difference,
      f5lok.zones,
      f5lok.created,
      f5lok.converted,
      f5lok.excel_rows.map((x: any) => [x.row, x.addable, x.added]),
      [f5norm.lines, f5norm.total, f5norm.warnings.unpriced, f5norm.warnings.project_quantity_count, f5norm.warnings.project_quantity.map((p: any) => p.row)],
    ],
    [
      12,
      '22188955.80',
      '18337980.00',
      '18340000.00',
      '-2020.00',
      ['1-qavat', '2-qavat'],
      { materials: 4, zones: 2 },
      [{ row: 20, from: 'kg', to: 't' }],
      [
        [22, false, false],
        [23, true, true],
        [24, false, false],
      ],
      [4, '0.00', 2, 1, [11]],
    ],
  );
  // biri xato bo'lsa hech biri saqlanmaydi
  const f5count = async () =>
    (await admin!.query("SELECT count(*)::int n FROM estimates WHERE project_id=$1 AND name LIKE 'Form 5 %'", [projectQ.id])).rows[0].n;
  await call(
    'POST',
    '/v1/estimate-imports/form5/commit',
    { items: [{ id: f5lok.id, digest: f5lok.digest }, { id: f5norm.id, digest: '0'.repeat(64) }] },
    adminAgain,
    undefined,
    409,
  );
  assert.equal(await f5count(), 0);
  const f5items = { items: f5.sheets.map((x: any) => ({ id: x.id, digest: x.digest })) };
  const f5saved = await call('POST', '/v1/estimate-imports/form5/commit', f5items, adminAgain);
  assert.equal(await f5count(), 2);
  assert.deepEqual((await call('POST', '/v1/estimate-imports/form5/commit', f5items, adminAgain)).estimates, f5saved.estimates);
  const f5est = await call('GET', `/v1/estimates/${f5saved.estimates[0].id}`, undefined, adminAgain);
  assert.deepEqual(
    [f5est.lines.length, f5est.totals.total, f5est.lines.at(-1).kind, f5est.lines.at(-1).description],
    [12, '22188955.80', 'service', 'ПРОЧИЕ ЗАТРАТЫ СУБПОДРЯДЧИКА (21 %)'],
  );
  // D35: «П» (miqdor loyihadan) material qatori 0 miqdor bilan saqlanadi, izohda asl kod va belgi
  const f5normEst = await call('GET', `/v1/estimates/${f5saved.estimates[1].id}`, undefined, adminAgain);
  assert.deepEqual(
    f5normEst.lines.filter((l: any) => l.kind === 'material').map((l: any) => [l.description, l.unit_id, l.quantity, l.note, l.total]),
    [['СМЕСЬ БЕТОННАЯ НАЛИВНОГО ТИПА', 'kg', '0.000000', 'П54889 · П — miqdor loyihadan', '0.00']],
  );
  assert.deepEqual(
    (await admin.query("SELECT name,kind FROM zones WHERE project_id=$1 AND name LIKE '%-qavat' ORDER BY name", [projectQ.id])).rows,
    [
      { name: '1-qavat', kind: 'floor' },
      { name: '2-qavat', kind: 'floor' },
    ],
  );
  const f5matrix = await call('GET', `/v1/projects/${projectQ.id}/floor-progress`, undefined, adminAgain);
  assert.deepEqual(f5matrix.floors.map((f: any) => f.name).sort(), ['1-qavat', '2-qavat']);
  passed.push(
    'Form 5 workbook: sheets are listed, each chosen sheet previews as its own estimate (works, resources by norm, floors from sections, t ↔ kg, Excel total and the 21 % row from the platform total; VAT not addable), row errors carry the sheet, and all sheets commit together or not at all (D29); a material whose quantity is «П» (taken from the project) is kept with quantity 0 and a warning (D35)',
  );
  // ---- D32 (2026-11-05): Form 5 ish qatoriga akkord mehnat resurslaridan × obyekt foizi; resurs qatorlari stavkasiz;
  // qo'lda stavka ustun; narx reviziyada o'zgarsa yangi hisobotga yangi stavka, qabul qilingani qotirilgan
  const qNow = await call('GET', `/v1/projects/${projectQ.id}`, undefined, adminAgain);
  await call('PATCH', `/v1/projects/${projectQ.id}`, { version: qNow.version, name: qNow.name, brigade_percent: '20' }, adminAgain);
  const f5rated = await call('GET', `/v1/estimates/${f5saved.estimates[0].id}`, undefined, adminAgain);
  const f5row = (desc: string, zone: string, i = 0) =>
    f5rated.lines.filter((l: any) => l.description === desc && l.zone_name === zone)[i];
  const kladka = f5row('КЛАДКА ПЕРЕГОРОДОК', '1-qavat');
  const kladkaLabor = f5row('ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ', '1-qavat');
  const karkas = f5row('УСТАНОВКА КАРКАСА', '2-qavat');
  // kladka: 124,8 soat × 30 000 = 3 744 000 / 200 m2 × 20 % = 3 744; karkas: 10,65 × 3 200 = 34 080 / 3 seksiya × 20 % = 2 272
  assert.deepEqual(
    [
      [kladka.unit_id, kladka.labor_rate, kladka.auto_labor_rate],
      [kladkaLabor.auto_labor_rate, f5row('КРАНЫ НА АВТОМОБИЛЬНОМ ХОДУ', '1-qavat').auto_labor_rate],
      [karkas.unit_id, karkas.auto_labor_rate],
      f5row('Блоки газобетонные', '1-qavat').auto_labor_rate,
    ],
    [['m2', null, '3744.00'], [null, null], ['section', '2272.00'], null],
  );
  assert.equal((await call('GET', `/v1/estimates/${f5rated.id}`, undefined, forePx)).lines[0].auto_labor_rate, undefined);
  const f5report = async (lineId: string, qty: string) => {
    const r = await call(
      'POST',
      '/v1/reports',
      { project_id: projectQ.id, kind: 'daily', report_date: '2026-10-06', content: 'Form 5 akkord', estimate_line_id: lineId, progress_quantity: qty },
      brigadierAgain2,
    );
    await call('POST', `/v1/reports/${r.id}/review`, { version: 1, action: 'accepted', reason: 'Tekshirildi' }, adminAgain);
    return { ...(await call('GET', `/v1/reports/${r.id}`, undefined, adminAgain)).progress, report: r.id };
  };
  const kladkaDone = await f5report(kladka.id, '10');
  assert.deepEqual([kladkaDone.labor_rate, kladkaDone.labor_amount], ['3744.00', '37440.00']);
  const laborDone = await f5report(kladkaLabor.id, '5');
  assert.deepEqual([laborDone.labor_rate, laborDone.labor_amount], [null, null]);
  // reviziya: ishchi soati 40 000 → kladka 4 992 (avtomatik, yangi narxdan); karkasga qo'lda 2 500
  const lineKeys = ['kind', 'description', 'zone_id', 'material_id', 'unit_id', 'quantity', 'labor_rate', 'norm', 'work_quantity', 'loss_percent', 'category', 'note', 'unit_price'];
  const f5revised = await call(
    'PATCH',
    `/v1/estimates/${f5rated.id}`,
    {
      project_id: projectQ.id,
      name: f5rated.name,
      version: f5rated.revision,
      lines: f5rated.lines.map((l: any) => ({
        ...Object.fromEntries(lineKeys.filter((k) => l[k] !== null && l[k] !== undefined).map((k) => [k, String(l[k])])),
        position: l.position,
        ...(l.id === kladkaLabor.id ? { unit_price: '40000' } : {}),
        ...(l.id === karkas.id ? { labor_rate: '2500' } : {}),
      })),
    },
    adminAgain,
  );
  const f5after = await call('GET', `/v1/estimates/${f5revised.id}`, undefined, adminAgain);
  const kladka2 = f5after.lines.find((l: any) => l.description === 'КЛАДКА ПЕРЕГОРОДОК');
  const karkas2 = f5after.lines.find((l: any) => l.description === 'УСТАНОВКА КАРКАСА');
  assert.deepEqual(
    [kladka2.auto_labor_rate, karkas2.labor_rate, karkas2.auto_labor_rate],
    ['4992.00', '2500.00', '2272.00'],
  );
  assert.deepEqual(
    [(await f5report(kladka2.id, '1')).labor_amount, (await f5report(karkas2.id, '1')).labor_amount],
    ['4992.00', '2500.00'],
  );
  assert.equal(
    (await call('GET', `/v1/reports/${kladkaDone.report}`, undefined, adminAgain)).progress.labor_amount,
    '37440.00',
  );
  // nakladnoy nomi farq qilsa: o'xshash smeta materiali taklif qilinadi, omborchi tasdiqlagan nom muqobil nom bo'ladi
  const blocks = f5row('Блоки газобетонные', '1-qavat').material_id;
  const similar = async (name: string, token = whP) =>
    (await call('GET', `/v1/materials/similar?project_id=${projectQ.id}&name=${encodeURIComponent(name)}`, undefined, token)).items;
  assert.deepEqual(
    (await similar('Блоки газобетонные D500')).map((m: any) => [m.id, m.exact]),
    [[blocks, false]],
  );
  assert.deepEqual(await similar('Труба стальная 57х3,5'), []);
  assert.equal(
    (await call('POST', `/v1/materials/${blocks}/aliases`, { name: 'Блоки газобетонные D500' }, adminAgain, undefined, 403)).error.code,
    'FORBIDDEN',
  );
  assert.equal(
    (await call('POST', `/v1/materials/${blocks}/aliases`, { name: 'Блоки газобетонные D500' }, whP)).id,
    blocks,
  );
  assert.deepEqual(
    (await similar('блоки газобетонные d500')).map((m: any) => [m.id, m.exact, m.aliases]),
    [[blocks, true, ['Блоки газобетонные D500']]],
  );
  const byAlias = await call('GET', `/v1/materials?q=${encodeURIComponent('D500')}`, undefined, whP);
  assert.deepEqual(
    byAlias.items.map((m: any) => [m.id, m.alias]),
    [[blocks, 'Блоки газобетонные D500']],
  );
  const mortar = f5row('СМЕСЬ РАСТВОРНАЯ СУХАЯ', '1-qavat').material_id;
  assert.equal(
    (await call('POST', `/v1/materials/${mortar}/aliases`, { name: 'БЛОКИ газобетонные d500' }, whP, undefined, 409)).error.code,
    'ALREADY_EXISTS',
  );
  const catalogUnits = (await call('GET', '/v1/catalog', undefined, whP)).units.map((u: any) => u.id);
  assert.ok(['l', 'section', 'boiler', 'cycle', 'end'].every((u) => catalogUnits.includes(u)), catalogUnits.join(','));
  passed.push(
    'Form 5 piece rate (D32): the work line rate comes from its labor resources × the project percent and follows a price revision, resource lines get no automatic rate, a typed rate wins, accepted rates stay frozen; a differing invoice name is offered the similar estimate material (not other sizes) and saved as its alias by the warehouse role only, then found by search; Л, СЕКЦИЯ, КОТЕЛ, ЦИКЛ, КОНЕЦ are platform units',
  );
  // ---- Tarif tahriri: narx va limit o'zgaradi, chiqarilgan invoyslar summasi o'zgarmaydi, o'chirish taqiq
  const invoicesBefore = (
    await admin.query('SELECT id,amount::text FROM billing_invoices WHERE plan_version_id=$1 ORDER BY id', [plan.id])
  ).rows;
  assert(invoicesBefore.length > 0);
  const editedPlan = await call(
    'PATCH',
    `/v1/platform/plans/${plan.id}`,
    { code: 'standard', monthly_price: '1200000.00', limits: { users: 25, projects: 20 } },
    ownerToken,
  );
  assert.equal(editedPlan.monthly_price, '1200000.00');
  assert.deepEqual(editedPlan.limits, { users: 25, projects: 20 });
  assert.deepEqual(
    (
      await admin.query('SELECT id,amount::text FROM billing_invoices WHERE plan_version_id=$1 ORDER BY id', [plan.id])
    ).rows,
    invoicesBefore,
  );
  await assert.rejects(admin.query('DELETE FROM plan_versions WHERE id=$1', [plan.id]), /IMMUTABLE_LEDGER/);
  assert.equal(
    (await admin.query("SELECT count(*)::int n FROM audit_events WHERE action='plan.update' AND resource_id=$1", [plan.id]))
      .rows[0].n,
    1,
  );
  await call('PATCH', `/v1/platform/plans/${plan.id}`, { code: 'standard', monthly_price: '1.00' }, supportToken, undefined, 403);
  passed.push('Plan edit changes price and limits for future invoices only, is audited, owner-only, and plans still cannot be deleted');
  // ---- D21 (2026-10-22): super_admin — butun platforma admini (egasining amallari ham); support — murojaatlar,
  // diagnostika va kompaniya foydalanuvchisiga parol tiklash; ruxsatlar matritsasi sahifadan sozlanadi.
  await admin.query(
    "INSERT INTO users(login,display_name,password_hash,role) VALUES('superadmin','Super admin',$1,'super_admin')",
    [await hashPassword(pass)],
  );
  const superToken = (await call('POST', '/v1/auth/login', { login: 'superadmin', password: pass }))
    .access_token;
  const tenantAdminId = (await admin.query("SELECT id FROM users WHERE tenant_id=$1 AND role='tenant_admin'", [t.id]))
    .rows[0].id;
  const ownerId = (await admin.query("SELECT id FROM users WHERE login='owner'")).rows[0].id;
  const superId = (await admin.query("SELECT id FROM users WHERE login='superadmin'")).rows[0].id;
  // 2FA majburiy: bot sozlangan, Telegram ulanmagan super admin faqat profil va Telegramni ulashga kiradi.
  const saMe = await call('GET', '/v1/auth/me', undefined, superToken);
  assert.equal(saMe.two_factor_setup_required, true);
  assert.equal(saMe.platform_permissions.length, 11);
  assert.equal(
    (await call('GET', '/v1/platform/tenants', undefined, superToken, undefined, 403)).error.code,
    'TWO_FACTOR_SETUP_REQUIRED',
  );
  const saLink = await call('POST', '/v1/integrations/telegram/link', undefined, superToken);
  await transaction(appPool!, null, (db) => consumeLinkToken(db, saLink.url.split('start=')[1]!, { id: '777001', first_name: 'SA' } as any));
  assert.equal((await call('GET', '/v1/auth/me', undefined, superToken)).two_factor_setup_required, false);
  const supportMe = await call('GET', '/v1/auth/me', undefined, supportToken);
  assert.deepEqual([...supportMe.platform_permissions].sort(), ['diagnostics.read', 'support.reply', 'users.reset']);
  assert.equal(supportMe.two_factor_setup_required, false);
  passed.push(
    'D21: a super_admin without Telegram (bot configured) reaches only profile and Telegram linking, everything else is TWO_FACTOR_SETUP_REQUIRED; after linking the same session works; /auth/me lists platform permissions',
  );
  for (const path of ['/v1/platform/tenants', '/v1/platform/plans', '/v1/platform/billing/summary', '/v1/platform/billing/invoices', '/v1/platform/billing/debtors', '/v1/platform/support', `/v1/platform/tenants/${t.id}`, `/v1/platform/tenants/${t.id}/users`])
    for (const tok of [superToken, supportToken]) await call('GET', path, undefined, tok);
  // Super admin egasining biznes amallarini bajaradi
  const saPlan = await call('POST', '/v1/platform/plans', { code: 'tech', version: 1, monthly_price: '1.00' }, superToken);
  await call('PATCH', `/v1/platform/plans/${saPlan.id}`, { code: 'tech', monthly_price: '2.00' }, superToken);
  const saTenant = await call('POST', '/v1/platform/tenants', { legal_name: 'Super admin ochgan', registration_key: 'SA-1' }, superToken);
  await call('POST', `/v1/platform/tenants/${saTenant.id}/invites`, undefined, superToken);
  await call('POST', '/v1/platform/subscriptions', { tenant_id: saTenant.id, plan_version_id: saPlan.id }, superToken);
  assert.equal(
    (await call('PATCH', `/v1/platform/tenants/${saTenant.id}`, { status: 'blocked', version: saTenant.version, reason: 'Texnik sinov' }, superToken, undefined, 409)).error.code,
    'SIGNUP_REQUIRED',
  );
  const saInvoice = await call('POST', '/v1/platform/billing/invoices', { tenant_id: saTenant.id, plan_version_id: saPlan.id, period_start: new Date().toISOString() }, superToken);
  assert.equal(saInvoice.amount, '2.00');
  await call('POST', '/v1/platform/billing/entries', { invoice_id: saInvoice.id, kind: 'payment', amount: saInvoice.amount, external_ref: 'SA-PAY-1', reason: 'Super admin to‘lov sinovi' }, superToken);
  await call('POST', '/v1/platform/tenants', { legal_name: 'Support yaratmaydi', registration_key: 'SUP-1' }, supportToken, undefined, 403);
  await call('POST', '/v1/platform/plans', { code: 'sup', version: 1, monthly_price: '1.00' }, supportToken, undefined, 403);
  await call('POST', '/v1/platform/billing/entries', { invoice_id: saInvoice.id, kind: 'credit', amount: '1.00', external_ref: 'SUP-1', reason: 'Support kredit bermaydi' }, supportToken, undefined, 403);
  for (const path of ['/v1/platform/staff', '/v1/platform/audit', '/v1/platform/permissions'])
    await call('GET', path, undefined, supportToken, undefined, 403);
  passed.push(
    'D21: super_admin creates plans, tenants, invites, subscriptions, invoices and payments like the owner; support stays out of business actions, staff, audit and permissions',
  );
  // Parol tiklash: o'ziga hech kim; support — faqat kompaniya foydalanuvchisiga (admin ham), xodim va egasiga emas
  await call('POST', `/v1/platform/users/${superId}/reset`, undefined, superToken, undefined, 403);
  await call('POST', `/v1/platform/users/${ownerId}/reset`, undefined, supportToken, undefined, 403);
  await call('POST', `/v1/platform/users/${superId}/reset`, undefined, supportToken, undefined, 403);
  const platformTarget = await call('POST', '/v1/employees', { login: 'platforma.sinov', display_name: 'Platforma sinov', password: pass, role: 'manager' }, adminAgain);
  const supReset = await call('POST', `/v1/platform/users/${platformTarget.id}/reset`, undefined, supportToken);
  assert(supReset.token.length >= 32);
  passed.push('D21 password reset: nobody resets themselves; support issues links to company users but not to platform staff or the owner');
  // Ruxsatlar matritsasi: egasi va super admin sozlaydi; support o'z qatorini (ruxsati bo'lsa), super admin qatorini emas
  const pMatrix = await call('GET', '/v1/platform/permissions', undefined, ownerToken);
  assert(Object.values(pMatrix.roles.super_admin).every(Boolean));
  assert.equal(pMatrix.roles.support['audit.read'], false);
  await call('PATCH', '/v1/platform/permissions', { role: 'support', permissions: { 'audit.read': true, 'permissions.manage': true } }, superToken);
  await call('GET', '/v1/platform/audit?limit=1', undefined, supportToken);
  await call('PATCH', '/v1/platform/permissions', { role: 'super_admin', permissions: { 'audit.read': false } }, supportToken, undefined, 403);
  await call(
    'PATCH',
    '/v1/platform/permissions',
    { role: 'support', permissions: Object.fromEntries(pMatrix.permissions.map((p: string) => [p, pMatrix.defaults.support.includes(p)])) },
    supportToken,
  );
  await call('GET', '/v1/platform/audit?limit=1', undefined, supportToken, undefined, 403);
  await call('GET', '/v1/platform/permissions', undefined, supportToken, undefined, 403);
  // Super admin o'z ruxsatini ham o'zgartiradi (egasi qarori); egasi qaytaradi
  await call('PATCH', '/v1/platform/permissions', { role: 'super_admin', permissions: { 'billing.manage': false } }, superToken);
  await call('POST', '/v1/platform/billing/entries', { invoice_id: saInvoice.id, kind: 'credit', amount: '1.00', external_ref: 'SA-CR-1', reason: 'Ruxsatsiz kredit' }, superToken, undefined, 403);
  await call('PATCH', '/v1/platform/permissions', { role: 'super_admin', permissions: { 'billing.manage': true } }, ownerToken);
  assert.equal((await admin.query("SELECT count(*)::int n FROM audit_events WHERE action='platform.permissions'")).rows[0].n, 4);
  passed.push(
    'D21 permission matrix: the owner and super_admin edit role permissions; a change applies on the next request; support with permissions.manage edits only its own row; a super_admin can remove its own permission and the owner restores it; every change is audited',
  );
  // Umumiy audit: kompaniya, rol, platforma filtrlari; tuzatish turi yozuvning o'zida
  const tenantAudit = await call('GET', `/v1/platform/audit?scope=tenants&tenant_id=${t.id}&limit=100`, undefined, superToken);
  assert(tenantAudit.items.length > 0 && tenantAudit.items.every((x: any) => x.tenant_id === t.id && x.tenant_name));
  const foremanAudit = await call('GET', '/v1/platform/audit?role=foreman&limit=100', undefined, ownerToken);
  assert(foremanAudit.items.length > 0 && foremanAudit.items.every((x: any) => x.actor_role === 'foreman'));
  const acceptedAudit = await call('GET', `/v1/platform/audit?tenant_id=${t.id}&action=report.accepted`, undefined, superToken);
  assert.equal(acceptedAudit.items.find((x: any) => x.resource_id === report.id)?.correction, 'progress');
  const platformAudit = await call('GET', '/v1/platform/audit?scope=platform&limit=100', undefined, superToken);
  assert(platformAudit.items.length > 0 && platformAudit.items.every((x: any) => x.tenant_id === null));
  passed.push('D21 general audit lists platform and company actions of every role with tenant, role, scope and action filters and marks correctable rows');
  // Kompaniya xatolarini tuzatish: storno (ombor, moliya) va ish hajmi — audit yozuvidan
  const saReceipt = await call('POST', '/v1/stock/commands', { project_id: projectQ.id, kind: 'receipt', material_id: brick.id, to_account_id: qWarehouse.account.id, quantity: '2', unit_cost: '50', reason: 'Platforma storno sinovi' }, whP);
  const receiptAudit = await call('GET', `/v1/platform/audit?tenant_id=${t.id}&action=stock.receipt`, undefined, superToken);
  assert.equal(receiptAudit.items.find((x: any) => x.resource_id === saReceipt.id)?.correction, 'stock');
  await call('POST', `/v1/platform/tenants/${t.id}/stock-commands/${saReceipt.id}/reverse`, { reason: 'Noto‘g‘ri kirim' }, supportToken, undefined, 403);
  const receiptPreview = await call('GET', `/v1/platform/tenants/${t.id}/stock-commands/${saReceipt.id}`, undefined, superToken);
  assert.equal(receiptPreview.reversed, false);
  assert.equal(receiptPreview.kind, 'receipt');
  const stockReversal = await call('POST', `/v1/platform/tenants/${t.id}/stock-commands/${saReceipt.id}/reverse`, { reason: 'Noto‘g‘ri kirim' }, superToken);
  assert.equal(stockReversal.created_by, tenantAdminId);
  assert(stockReversal.reason.startsWith('BARPO AI (Super admin): '));
  assert.equal((await call('GET', `/v1/platform/tenants/${t.id}/stock-commands/${saReceipt.id}`, undefined, superToken)).reversed, true);
  const stockAudit = (await admin.query("SELECT actor_id,details FROM audit_events WHERE tenant_id=$1 AND action='stock.reverse' AND resource_id=$2", [t.id, stockReversal.id])).rows[0];
  assert.equal(stockAudit.actor_id, superId);
  assert.equal(stockAudit.details.platform_correction, true);
  const saDoc = await call('POST', '/v1/finance/documents', { project_id: projectQ.id, kind: 'labor', amount: '10', counterparty_id: supplier.id, description: 'Platforma storno sinovi', document_date: '2026-10-01' }, adminAgain);
  const docAudit = await call('GET', `/v1/platform/audit?tenant_id=${t.id}&action=finance.labor`, undefined, superToken);
  assert.equal(docAudit.items.find((x: any) => x.resource_id === saDoc.id)?.correction, 'finance');
  const finReversal = await call('POST', `/v1/platform/tenants/${t.id}/finance-documents/${saDoc.id}/reverse`, { reason: 'Ikki marta kiritilgan' }, superToken);
  assert.equal(finReversal.created_by, tenantAdminId);
  assert.equal((await call('GET', `/v1/platform/tenants/${t.id}/finance-documents/${saDoc.id}`, undefined, superToken)).reversed, true);
  const progressBefore = await call('GET', `/v1/platform/tenants/${t.id}/reports/${report.id}/progress`, undefined, superToken);
  assert.equal(progressBefore.items.length, 1);
  const entry0 = progressBefore.items[0];
  await call('POST', `/v1/platform/tenants/${t.id}/progress-entries/${entry0.id}/corrections`, { quantity_delta: '1', reason: 'Hajm kam yozilgan' }, superToken);
  const entry1 = (await call('GET', `/v1/platform/tenants/${t.id}/reports/${report.id}/progress`, undefined, superToken)).items[0];
  assert.equal(dec(entry1.total).minus(entry0.total).toString(), '1');
  assert.equal(
    (await call('POST', `/v1/platform/tenants/${t.id}/progress-entries/${entry0.id}/corrections`, { quantity_delta: '-1000', reason: 'Manfiy bo‘lmasin' }, superToken, undefined, 400)).error.code,
    'NEGATIVE_PROGRESS',
  );
  assert.equal(
    (await call('POST', `/v1/platform/tenants/${saTenant.id}/stock-commands/${randomUUID()}/reverse`, { reason: 'Admin yo‘q sinovi' }, superToken, undefined, 409)).error.code,
    'TENANT_ADMIN_REQUIRED',
  );
  assert(
    (await admin.query("SELECT count(*)::int n FROM notifications WHERE user_id=$1 AND kind='platform.correction'", [tenantAdminId])).rows[0].n >= 3,
  );
  passed.push(
    'D21 corrections: from a general-audit row the super_admin reverses a stock receipt and a finance document and corrects accepted progress (never below zero); the document is written for the company admin, the audit names the super_admin (platform_correction) and the admin is notified; support cannot correct; a company without an active admin needs an ownership transfer first',
  );
  // Foydalanuvchi tuzatishlari: Telegramni uzish, sessiyalar, faolsizlantirish (admin — faqat adminlikni o'tkazish bilan)
  const targetSession = (await call('POST', '/v1/auth/login', { login: 'platforma.sinov', password: pass })).access_token;
  const targetLink = await call('POST', '/v1/integrations/telegram/link', undefined, targetSession);
  await transaction(appPool!, null, (db) => consumeLinkToken(db, targetLink.url.split('start=')[1]!, { id: '777003', first_name: 'PT' } as any));
  const targetRow = (await call('GET', `/v1/platform/tenants/${t.id}/users`, undefined, supportToken)).items.find((u: any) => u.id === platformTarget.id);
  assert.equal(targetRow.telegram_linked, true);
  assert(targetRow.sessions_active >= 1);
  await call('POST', `/v1/platform/tenants/${t.id}/users/${platformTarget.id}/telegram/unlink`, { reason: 'Telefon yo‘qolgan' }, supportToken, undefined, 403);
  await call('POST', `/v1/platform/tenants/${t.id}/users/${platformTarget.id}/telegram/unlink`, { reason: 'Telefon yo‘qolgan' }, superToken);
  assert.equal(
    (await call('POST', `/v1/platform/tenants/${t.id}/users/${platformTarget.id}/telegram/unlink`, { reason: 'Telefon yo‘qolgan' }, superToken, undefined, 409)).error.code,
    'TELEGRAM_NOT_LINKED',
  );
  const revokedSessions = await call('POST', `/v1/platform/tenants/${t.id}/users/${platformTarget.id}/sessions/revoke`, { reason: 'Shubhali kirish' }, superToken);
  assert(revokedSessions.revoked >= 1);
  await call('GET', '/v1/auth/me', undefined, targetSession, undefined, 401);
  await call('PATCH', `/v1/platform/tenants/${t.id}/users/${platformTarget.id}`, { active: false, reason: 'Ishdan ketgan' }, superToken);
  await call('POST', '/v1/auth/login', { login: 'platforma.sinov', password: pass }, undefined, undefined, 401);
  await call('PATCH', `/v1/platform/tenants/${t.id}/users/${platformTarget.id}`, { active: true, reason: 'Qayta ishga olindi' }, superToken);
  assert.equal(
    (await call('PATCH', `/v1/platform/tenants/${t.id}/users/${tenantAdminId}`, { active: false, reason: 'Admin faolsizlantirilmaydi' }, superToken, undefined, 409)).error.code,
    'OWNERSHIP_TRANSFER_REQUIRED',
  );
  const userAudit = (await admin.query("SELECT actor_id,details FROM audit_events WHERE tenant_id=$1 AND action='employee.update' AND resource_id=$2 ORDER BY created_at", [t.id, platformTarget.id])).rows;
  assert(userAudit.length >= 2 && userAudit.slice(-2).every((x: any) => x.actor_id === superId && x.details.platform_correction === true));
  passed.push(
    'D21 user corrections: the super_admin unlinks a company user’s Telegram, revokes their sessions and deactivates/reactivates them with a reason (the company admin only via ownership transfer); each step lands in the company audit under the super_admin; support cannot',
  );
  // ---- Xodimlar: super_admin faolsizlantiradi va rolini o'zgartiradi (sessiya bekor), o'zini va egasini emas
  const helper = await call('POST', '/v1/platform/staff', { login: 'helper2', password: pass, display_name: 'Yordamchi', role: 'support' }, superToken);
  const staffList = await call('GET', '/v1/platform/staff', undefined, superToken);
  assert.equal(staffList.items.find((s: any) => s.id === helper.id).telegram_linked, false);
  // Yangi xodim birinchi kirishda parolni almashtiradi (must_change_password), keyin ishlaydi.
  const helperFirst = (await call('POST', '/v1/auth/login', { login: 'helper2', password: pass })).access_token;
  await call('POST', '/v1/auth/password', { current_password: pass, new_password: pass + '2' }, helperFirst);
  const helperToken = (await call('POST', '/v1/auth/login', { login: 'helper2', password: pass + '2' })).access_token;
  await call('GET', '/v1/platform/support', undefined, helperToken);
  await call('PATCH', `/v1/platform/staff/${helper.id}`, { active: true, role: 'super_admin' }, superToken);
  await call('GET', '/v1/platform/support', undefined, helperToken, undefined, 401);
  const helperToken2 = (await call('POST', '/v1/auth/login', { login: 'helper2', password: pass + '2' })).access_token;
  // D21: Telegram ulanmagan yangi super admin faqat profil va Telegramni ulashga kiradi
  assert.equal((await call('GET', '/v1/platform/staff', undefined, helperToken2, undefined, 403)).error.code, 'TWO_FACTOR_SETUP_REQUIRED');
  await call('PATCH', `/v1/platform/staff/${helper.id}`, { active: false, role: 'super_admin' }, superToken);
  await call('POST', '/v1/auth/login', { login: 'helper2', password: pass + '2' }, undefined, undefined, 401);
  await call('PATCH', `/v1/platform/staff/${superId}`, { active: false, role: 'support' }, superToken, undefined, 403);
  await call('PATCH', `/v1/platform/staff/${ownerId}`, { active: false, role: 'support' }, superToken, undefined, 403);
  // D21: egasi ham xodimlarni boshqaradi; staff.manage ruxsati yo'q support — yo'q
  const ownerHelper = await call('POST', '/v1/platform/staff', { login: 'helper3', password: pass, display_name: 'Egasi qo‘shgan', role: 'support' }, ownerToken);
  await call('PATCH', `/v1/platform/staff/${ownerHelper.id}`, { active: false, role: 'support' }, ownerToken);
  await call('POST', '/v1/platform/staff', { login: 'helper4', password: pass, display_name: 'Support qo‘shmaydi', role: 'support' }, supportToken, undefined, 403);
  passed.push('Staff: role change and deactivation revoke sessions and block login; a super_admin cannot change itself or the owner; the owner manages staff too (D21); a newly promoted super_admin without Telegram is limited to 2FA setup');
  // ---- Platforma auditi: egasi va super_admin ko'radi, action filtri ishlaydi
  const pAudit = await call('GET', '/v1/platform/audit?action=platform.staff', undefined, superToken);
  assert(pAudit.items.length >= 3 && pAudit.items.every((a: any) => a.action.startsWith('platform.staff')));
  assert(pAudit.items.every((a: any) => ['super_admin', 'platform_owner'].includes(a.actor_role)));
  assert.equal(typeof pAudit.total, 'number');
  await call('GET', '/v1/platform/audit?limit=1', undefined, ownerToken);
  passed.push('Platform audit lists platform-staff actions with actor role and filters by action prefix');
  // ---- Yangi murojaat → platforma xodimlariga bildirishnoma (super_admin, support, egasi)
  const srNew = await call('POST', '/v1/support-requests', { kind: 'plan_change', message: 'Tarifni kattaroqqa almashtiring' }, adminAgain);
  for (const tok of [superToken, supportToken, ownerToken]) {
    const n = await call('GET', '/v1/me/notifications?unread=true', undefined, tok);
    assert(n.items.some((x: any) => x.kind === 'support.request' && x.payload.support_request_id === srNew.id), 'support.request notification missing');
  }
  passed.push('A new support request notifies every active platform staff member');
  // ---- 2FA: Telegram ulangan super_admin uchun kirish kod bilan; kod botga global fetch orqali ketadi (bu yerda ushlanadi)
  // Super admin Telegrami D21 blokida ulangan (777001).
  const realFetch = globalThis.fetch;
  const sent: string[] = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('api.telegram.org')) {
      sent.push(JSON.parse(init.body).text);
      return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
    }
    return realFetch(input, init);
  }) as typeof fetch;
  try {
    const challengeRes = await call('POST', '/v1/auth/login', { login: 'superadmin', password: pass });
    assert.equal(challengeRes.two_factor, true);
    assert(!challengeRes.access_token && challengeRes.challenge.length >= 32);
    const code = /kirish kodi: (\d{6})/.exec(sent.at(-1) ?? '')![1]!;
    assert.equal((await call('POST', '/v1/auth/login/verify', { challenge: challengeRes.challenge, code: '000000' }, undefined, undefined, 401)).error.code, 'LOGIN_CODE_INVALID');
    const session2fa = await call('POST', '/v1/auth/login/verify', { challenge: challengeRes.challenge, code });
    assert(session2fa.access_token);
    await call('GET', '/v1/platform/staff', undefined, session2fa.access_token);
    assert.equal((await call('POST', '/v1/auth/login/verify', { challenge: challengeRes.challenge, code }, undefined, undefined, 410)).error.code, 'LOGIN_CODE_EXPIRED');
    // 5 ta xato urinish — challenge bekor
    const c2 = await call('POST', '/v1/auth/login', { login: 'superadmin', password: pass });
    for (let i = 0; i < 4; i++) await call('POST', '/v1/auth/login/verify', { challenge: c2.challenge, code: '111111' }, undefined, undefined, 401);
    await call('POST', '/v1/auth/login/verify', { challenge: c2.challenge, code: '111111' }, undefined, undefined, 410);
    // Parallel urinishlar ham 5 tadan oshmaydi: 20 ta bir vaqtdagi noto'g'ri koddan faqat 5 tasi tekshiriladi,
    // keyin to'g'ri kod ham rad etiladi (oldin har so'rov qatorni o'qib, alohida solishtirardi — 20 ta tekshiruv)
    const c3 = await call('POST', '/v1/auth/login', { login: 'superadmin', password: pass });
    const code3 = /kirish kodi: (\d{6})/.exec(sent.at(-1) ?? '')![1]!;
    const wrong3 = code3 === '222222' ? '333333' : '222222';
    const burst = await Promise.all(
      Array.from({ length: 20 }, () =>
        app!.inject({
          method: 'POST',
          url: '/v1/auth/login/verify',
          payload: { challenge: c3.challenge, code: wrong3 },
          headers: { 'idempotency-key': randomUUID() },
        }),
      ),
    );
    const burstStatus = burst.map((r) => r.statusCode);
    assert.equal(burstStatus.filter((s) => s === 401).length, 4, String(burstStatus));
    assert.equal(burstStatus.filter((s) => s === 410).length, 16, String(burstStatus));
    const c3Row = (await admin.query('SELECT attempts,used_at FROM login_codes WHERE challenge_hash=$1', [digest(c3.challenge)])).rows[0];
    assert.equal(c3Row.attempts, 5);
    assert(c3Row.used_at);
    assert.equal((await call('POST', '/v1/auth/login/verify', { challenge: c3.challenge, code: code3 }, undefined, undefined, 410)).error.code, 'LOGIN_CODE_EXPIRED');
    // support uchun 2FA yo'q (Telegram ulangan bo'lsa ham oddiy kirish)
    const techId = (await admin.query("SELECT id FROM users WHERE login='tech'")).rows[0].id;
    const supLink = await transaction(appPool!, null, (db) => createLinkToken(db, { id: techId, tenant_id: null, role: 'support' }));
    await transaction(appPool!, null, (db) => consumeLinkToken(db, supLink.url.split('start=')[1]!, { id: '777002', first_name: 'Sup' } as any));
    assert((await call('POST', '/v1/auth/login', { login: 'tech', password: pass })).access_token);
  } finally {
    globalThis.fetch = realFetch;
  }
  passed.push('2FA: a Telegram-linked super_admin gets a 6-digit code instead of a session, wrong codes are limited to 5 (also under 20 parallel requests: exactly 5 codes are compared), a used or expired challenge is rejected, support logs in without a code');
  // ---- Blok kartasi: maydon, sanalar, mas'ullar, rasm; holat sanalardan; smeta jami blok zonalaridan
  const blockImage = await call(
    'POST',
    '/v1/files',
    { project_id: projectQ.id, name: 'blok.png', mime_type: 'image/png', base64: png1x1 },
    adminAgain,
  );
  const qBlockNow = (await call('GET', `/v1/projects/${projectQ.id}`, undefined, adminAgain)).zones.find(
    (z: any) => z.id === qBlock.id,
  );
  assert.equal(qBlockNow.status, 'waiting');
  assert.equal(qBlockNow.estimate_total, '100.00');
  await call(
    'PATCH',
    `/v1/projects/${projectQ.id}/zones/${qBlock.id}`,
    { version: qBlockNow.version, name: 'Blok Q', kind: 'block', floors_count: 12, planned_start: '2026-01-10', planned_end: '2026-01-01' },
    adminAgain,
    undefined,
    400,
  );
  const qBlockEdited = await call(
    'PATCH',
    `/v1/projects/${projectQ.id}/zones/${qBlock.id}`,
    {
      version: qBlockNow.version,
      name: 'Blok Q',
      kind: 'block',
      floors_count: 12,
      area_m2: '1000',
      planned_start: '2020-01-01',
      planned_end: '2020-12-31',
      actual_start: '2020-02-01',
      image_file_id: blockImage.id,
      responsible_ids: [brigadier.id],
    },
    adminAgain,
  );
  assert.equal(qBlockEdited.area_m2, '1000.00');
  // Faqat nom/tur yuborilgan eski tahrir karta maydonlarini o'chirmaydi
  const qBlockRenamed = await call(
    'PATCH',
    `/v1/projects/${projectQ.id}/zones/${qBlock.id}`,
    { version: qBlockEdited.version, name: 'Blok Q', kind: 'block', floors_count: 12 },
    adminAgain,
  );
  assert.equal(qBlockRenamed.planned_end, qBlockEdited.planned_end);
  assert.equal(qBlockRenamed.image_file_id, blockImage.id);
  const blockOf = async (token: string) =>
    (await call('GET', `/v1/projects/${projectQ.id}`, undefined, token)).zones.find((z: any) => z.id === qBlock.id);
  const delayed = await blockOf(adminAgain);
  assert.equal(delayed.status, 'delayed');
  assert.deepEqual(delayed.responsibles.map((r: any) => r.id), [brigadier.id]);
  assert.equal((await blockOf(brigP)).estimate_total, null);
  await call(
    'PATCH',
    `/v1/projects/${projectQ.id}/zones/${qBlock.id}`,
    { version: qBlockRenamed.version, name: 'Blok Q', kind: 'block', floors_count: 12, actual_end: '2020-11-30', responsible_ids: [] },
    adminAgain,
  );
  const completed = await blockOf(adminAgain);
  assert.equal(completed.status, 'completed');
  assert.deepEqual(completed.responsibles, []);
  passed.push(
    'Block card stores area, plan/fact dates, image and responsibles; status is derived from dates; estimate total comes from block zone lines and is hidden without price permission; an old-style edit keeps card fields',
  );
  // ---- Xonadon reja rasmi, xonalar soni bo'yicha guruh, oxirgi narx varaqasidagi tannarx
  const qPremise = (await call('GET', `/v1/projects/${projectQ.id}/premises?block_id=${qBlock.id}`, undefined, adminAgain))
    .items[0];
  const planImage = await call(
    'POST',
    '/v1/files',
    { project_id: projectQ.id, name: 'reja.png', mime_type: 'image/png', base64: png1x1 },
    adminAgain,
  );
  const planned = await call(
    'PATCH',
    `/v1/projects/${projectQ.id}/premises/${qPremise.id}/plan`,
    { version: qPremise.version, plan_file_id: planImage.id },
    adminAgain,
  );
  assert.equal(planned.plan_file_id, planImage.id);
  const blockList = await call('GET', `/v1/projects/${projectQ.id}/premises?block_id=${qBlock.id}&rooms=none`, undefined, adminAgain);
  assert.equal(blockList.items[0].cost, '100.00');
  assert.deepEqual(blockList.by_rooms, [{ rooms: null, count: 1 }]);
  assert.equal(
    (await call('GET', `/v1/projects/${projectQ.id}/premises?block_id=${qBlock.id}&rooms=2`, undefined, adminAgain)).total_count,
    0,
  );
  assert.equal(
    (await call('GET', `/v1/projects/${projectQ.id}/premises?block_id=${qBlock.id}`, undefined, brigP)).items[0].cost,
    null,
  );
  await call('DELETE', `/v1/files/${planImage.id}`, { reason: 'Reja rasmi almashtiriladi' }, adminAgain);
  assert.equal(
    (await call('GET', `/v1/projects/${projectQ.id}/premises?block_id=${qBlock.id}`, undefined, adminAgain)).items[0]
      .plan_file_id,
    null,
  );
  passed.push(
    'Premise plan image is set by version and cleared when the file is archived; premises filter by rooms with group counts; cost comes from the latest price list only with pricing permission',
  );
  // Oxirida: super_admin kompaniya adminiga reset havolasi beradi, admin 6 belgili yangi parol qo'yadi (sessiyalar bekor)
  const adminReset = await call('POST', `/v1/platform/users/${tenantAdminId}/reset`, undefined, superToken);
  await call('POST', '/v1/auth/reset', { token: adminReset.token, new_password: 'qisqa' }, undefined, undefined, 400);
  await call('POST', '/v1/auth/reset', { token: adminReset.token, new_password: 'olti66' });
  await call('GET', '/v1/projects', undefined, adminAgain, undefined, 401);
  const adminLoginRow = (await admin.query('SELECT login FROM users WHERE id=$1', [tenantAdminId])).rows[0];
  await call('POST', '/v1/auth/login', { login: adminLoginRow.login, password: 'olti66' });
  passed.push('super_admin issues a reset link to a company admin; the new password needs 6+ characters; old sessions are revoked');
  // ---- D21: platforma adminlikni o'tkazadi; egasining parolini super admin tiklaydi (havola unga ko'rsatiladi)
  const oldAdminSession = (await call('POST', '/v1/auth/login', { login: adminLoginRow.login, password: 'olti66' })).access_token;
  assert.equal(
    (await call('POST', `/v1/platform/tenants/${t.id}/ownership`, { new_admin_id: platformTarget.id, reason: 'Admin ishdan ketdi' }, superToken, undefined, 400)).error.code,
    'PREVIOUS_ADMIN_ROLE_REQUIRED',
  );
  await call('POST', `/v1/platform/tenants/${t.id}/ownership`, { new_admin_id: platformTarget.id, previous_admin_role: 'manager', reason: 'Admin ishdan ketdi' }, supportToken, undefined, 403);
  await call('POST', `/v1/platform/tenants/${t.id}/ownership`, { new_admin_id: platformTarget.id, previous_admin_role: 'manager', reason: 'Admin ishdan ketdi' }, superToken);
  const roleOf = async (id: string) => (await admin!.query('SELECT role FROM users WHERE id=$1', [id])).rows[0].role;
  assert.equal(await roleOf(platformTarget.id), 'tenant_admin');
  assert.equal(await roleOf(tenantAdminId), 'manager');
  await call('GET', '/v1/auth/me', undefined, oldAdminSession, undefined, 401);
  assert.equal(
    (await admin.query("SELECT count(*)::int n FROM notifications WHERE user_id=$1 AND kind='platform.correction'", [platformTarget.id])).rows[0].n,
    1,
  );
  const ownerLink = await call('POST', `/v1/platform/users/${ownerId}/reset`, undefined, superToken);
  assert(ownerLink.token.length >= 32);
  await call('GET', '/v1/auth/me', undefined, ownerToken, undefined, 401);
  const ownerAgain = (await call('POST', '/v1/auth/login', { login: 'owner', password: pass })).access_token;
  await call('POST', `/v1/platform/users/${superId}/reset`, undefined, ownerAgain);
  await call('GET', '/v1/auth/me', undefined, superToken, undefined, 401);
  passed.push(
    'D21: the super_admin moves company adminship (the previous admin role is required, both re-login, the new admin is notified); the super_admin resets the owner’s password (owner sessions revoked) and the owner resets a super_admin',
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
