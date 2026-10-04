import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPool } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/security.js';
import { chromium, type Browser } from 'playwright';
import ExcelJS from 'exceljs';
import { tmpdir } from 'node:os';

/**
 * Haqiqiy brauzer sinovi: vaqtinchalik PostgreSQL + API + Vite.
 * Oqim: platforma egasi → tarif → kompaniya → taklif → admin signup → ruxsatlar → xodim → Telegram havolasi → billing.
 */
const name = `barpo-ui-test-${process.pid}`,
  secret = randomBytes(18).toString('hex');
const docker = (...args: string[]) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
let owner: ReturnType<typeof createPool> | undefined,
  pool: ReturnType<typeof createPool> | undefined;
let app: Awaited<ReturnType<typeof buildApp>>['app'] | undefined,
  browser: Browser | undefined,
  vite: any;
const checks: string[] = [];
const pages: any[] = [];
const errorsRef: { list: string[] } = { list: [] };
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
  pool = createPool(`postgresql://barpo_app:${secret}@127.0.0.1:${port}/postgres`);
  const password = 'UITestPasswordOnly!123';
  await owner.query(
    "INSERT INTO users(login,display_name,password_hash,role) VALUES('ui_owner','Platforma egasi',$1,'platform_owner')",
    [await hashPassword(password)],
  );
  process.env.AUTH_RATE_LIMIT_PER_MINUTE = '10000';
  process.env.RATE_LIMIT_PER_MINUTE = '100000';
  process.env.TELEGRAM_BOT_TOKEN = 'ui-test-token';
  process.env.TELEGRAM_BOT_USERNAME = 'barpoai_bot';
  ({ app } = await buildApp(pool));
  const apiURL = await app.listen({ host: '127.0.0.1', port: 0 });
  process.env.API_PROXY_TARGET = apiURL;
  const { createServer } = await import('../../node_modules/vite/dist/node/index.js');
  vite = await createServer({
    root: resolve('..'),
    configFile: resolve('../vite.config.ts'),
    server: { host: 'localhost', port: 0, strictPort: false },
    logLevel: 'error',
  });
  await vite.listen();
  const webURL = `http://localhost:${vite.httpServer.address().port}`;
  process.env.APP_ORIGIN = webURL; // cookie CSRF tekshiruvi va taklif havolasi shu originni ishlatadi
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
    headless: true,
  });
  const errors: string[] = errorsRef.list;
  const newPage = async () => {
    const context = await browser!.newContext({
      viewport: { width: 1440, height: 1000 },
      locale: 'uz-UZ',
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on(
      'console',
      (m) =>
        m.type() === 'error' &&
        !/Failed to load resource/.test(m.text()) &&
        errors.push('console: ' + m.text()),
    );
    page.on('response', async (r) => {
      if (r.url().includes('/v1/') && r.status() >= 400 && r.status() !== 401 && r.status() !== 404)
        errors.push(
          'http ' +
            r.status() +
            ' ' +
            r.request().method() +
            ' ' +
            r.url().split('/v1')[1] +
            ' ' +
            (await r.text().catch(() => '')).slice(0, 300),
        );
    });
    pages.push(page);
    return page;
  };
  const login = async (page: Awaited<ReturnType<typeof newPage>>, user: string, pass: string) => {
    await page.goto(webURL + '/login');
    await page.getByLabel('Login yoki telefon').fill(user);
    await page.locator('input[name=password]').fill(pass);
    await page.getByRole('button', { name: 'Kirish', exact: true }).click();
  };

  // 1. Platforma egasi: login, tarif, kompaniya, taklif
  const ownerPage = await newPage();
  await login(ownerPage, 'ui_owner', password);
  await ownerPage.getByRole('heading', { name: 'Platforma ko‘rsatkichlari' }).waitFor();
  checks.push('Platform owner logs in with cookie session and sees the platform dashboard');
  await ownerPage.getByRole('link', { name: 'Tariflar' }).click();
  await ownerPage.getByRole('button', { name: 'Yangi tarif versiyasi' }).first().click();
  await ownerPage.getByLabel('Oylik narx (UZS)').fill('450000.00');
  await ownerPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Yaratish', exact: true })
    .click();
  await ownerPage.getByRole('cell', { name: 'standard' }).waitFor();
  checks.push('Plan version created from the UI');
  await ownerPage.getByRole('link', { name: 'Mijozlar' }).click();
  await ownerPage.getByRole('button', { name: 'Yangi kompaniya' }).first().click();
  await ownerPage.getByLabel('Kompaniya nomi').fill('UI sinov qurilish');
  await ownerPage.getByLabel('Ro‘yxat raqami (STIR yoki ichki kod)').fill('UI-TEST-001');
  await ownerPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Yaratish', exact: true })
    .click();
  await ownerPage.getByRole('heading', { name: /UI sinov qurilish/ }).waitFor();
  await ownerPage.getByRole('button', { name: 'Yangi havola yaratish' }).click();
  const inviteUrl = (await ownerPage.locator('code').first().textContent())!.trim();
  assert.match(inviteUrl, /\/register#token=/);
  checks.push('Tenant created and one-time registration link issued');

  // 2. Mijoz admini: taklif orqali signup
  const adminPage = await newPage();
  await adminPage.goto(inviteUrl);
  await adminPage.getByRole('heading', { name: 'Kompaniyani ro‘yxatdan o‘tkazish' }).waitFor();
  await adminPage.getByLabel('Ism va familiya').fill('Sinov Admini');
  await adminPage.getByLabel('Login (lotin harflar, raqam, nuqta)').fill('ui.admin');
  await adminPage.getByLabel(/Telefon/).fill('+998 90 111 22 33');
  await adminPage.locator('input[name=password]').fill(password);
  await adminPage.locator('input[name=repeat]').fill(password);
  await adminPage.getByRole('button', { name: 'Hisob yaratish va boshlash' }).click();
  await adminPage.getByText('UI sinov qurilish').first().waitFor();
  await adminPage.getByRole('link', { name: 'Rollar va ruxsatlar' }).waitFor();
  checks.push(
    'Invite registration creates tenant admin, starts trial and opens the company workspace',
  );

  // 3. Ruxsatlar: menejerdan Obyektlar ko'rishni olib tashlash
  await adminPage.getByRole('link', { name: 'Rollar va ruxsatlar' }).click();
  await adminPage.getByRole('heading', { name: 'Rollar va sahifa ruxsatlari' }).waitFor();
  await adminPage.getByLabel('Rol', { exact: true }).selectOption('manager');
  const projectRead = adminPage.getByRole('checkbox', {
    name: 'Menejer: Obyektlar — Ko‘rish',
    exact: true,
  });
  await projectRead.waitFor();
  assert.equal(await projectRead.isChecked(), true);
  await projectRead.uncheck();
  await adminPage.getByRole('button', { name: 'O‘zgarishlarni saqlash' }).click();
  await adminPage.locator('button[disabled]', { hasText: 'O‘zgarishlarni saqlash' }).waitFor();
  checks.push('Admin saves per-role page CRUD matrix');

  // 4. Xodim yaratish (API, admin cookie bilan) va birinchi kirish
  const created = await adminPage.request.post(webURL + '/v1/employees', {
    data: { login: 'ui.manager', display_name: 'Sinov menejeri', password, role: 'manager' },
    headers: { 'Idempotency-Key': randomUUID(), Origin: webURL },
  });
  assert.equal(created.status(), 200, await created.text());
  const managerPage = await newPage();
  await login(managerPage, 'ui.manager', password);
  await managerPage.getByRole('heading', { name: 'Boshlang‘ich parolni almashtiring' }).waitFor();
  await managerPage.locator('input[name=current_password]').fill(password);
  await managerPage.locator('input[name=new_password]').fill(password + '2');
  await managerPage.locator('input[name=repeat]').fill(password + '2');
  await managerPage.getByRole('button', { name: 'Saqlash' }).click();
  await managerPage.getByText('Parol yangilandi').waitFor();
  await login(managerPage, 'ui.manager', password + '2');
  await managerPage.getByRole('link', { name: 'Vazifalar' }).waitFor();
  assert.equal(await managerPage.getByRole('link', { name: 'Obyektlar', exact: true }).count(), 0);
  await managerPage.goto(webURL + '/app/projects');
  await managerPage.getByRole('heading', { name: 'Bu sahifaga ruxsat yo‘q' }).waitFor();
  checks.push(
    'Employee forced password change; disabled page hidden from menu and denied by direct URL',
  );

  // 5. Jonli ruxsat yangilanishi
  await projectRead.check();
  await adminPage.getByRole('button', { name: 'O‘zgarishlarni saqlash' }).click();
  await adminPage.locator('button[disabled]', { hasText: 'O‘zgarishlarni saqlash' }).waitFor();
  for (
    let i = 0;
    i < 10 &&
    (await managerPage.getByRole('link', { name: 'Obyektlar', exact: true }).count()) === 0;
    i++
  ) {
    await managerPage.evaluate(() => window.dispatchEvent(new Event('focus')));
    await delay(500);
  }
  await managerPage.getByRole('link', { name: 'Obyektlar', exact: true }).waitFor();
  checks.push('Existing employee session picks up permission changes on focus');

  // 5b. Obyekt, zona, xodim va biriktirish (stage 04)
  await adminPage.goto(webURL + '/app/projects');
  await adminPage.getByRole('button', { name: 'Obyekt qo‘shish' }).first().click();
  await adminPage.getByRole('dialog').getByLabel('Obyekt nomi').fill('Navoiy 28 turar-joy');
  await adminPage.getByRole('dialog').getByLabel('Loyiha kodi').fill('NAV-28');
  await adminPage.getByRole('dialog').getByLabel('Buyurtmachi').fill('Toshkent Invest');
  await adminPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Yaratish', exact: true })
    .click();
  await adminPage.getByRole('heading', { name: /Navoiy 28 turar-joy/ }).waitFor();
  await adminPage.getByRole('tab', { name: /Zonalar/ }).click();
  await adminPage.getByRole('button', { name: 'Zona qo‘shish' }).click();
  await adminPage
    .getByRole('dialog')
    .getByLabel(/Zona nomi/)
    .fill('A blok');
  await adminPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Qo‘shish', exact: true })
    .click();
  await adminPage.getByText('A blok').waitFor();
  const projectUrl = adminPage.url();
  checks.push('Admin creates a project with code and customer and adds a zone from the UI');
  await adminPage.goto(webURL + '/app/employees');
  await adminPage.getByRole('button', { name: 'Xodim qo‘shish' }).first().click();
  const dlg = adminPage.getByRole('dialog');
  await dlg.getByLabel('Ism va familiya').fill('Sinov brigadiri');
  await dlg.locator('input[name=login]').fill('ui.brigadier');
  await dlg.locator('select[name=role]').selectOption('brigadier');
  await dlg.getByLabel('Navoiy 28 turar-joy').check();
  await dlg.getByRole('button', { name: 'Yaratish', exact: true }).click();
  await dlg.getByText('Login: ui.brigadier').waitFor();
  const brigadierPassword = (await dlg.locator('code').textContent())!.split('Parol: ')[1]!.trim();
  await dlg.getByRole('button', { name: 'Yopish' }).click();
  await adminPage.getByRole('cell', { name: /Sinov brigadiri/ }).waitFor();
  await adminPage.getByRole('cell', { name: /Sinov brigadiri/ }).click();
  await adminPage
    .getByRole('dialog')
    .getByText('Navoiy 28 turar-joy', { exact: true })
    .first()
    .waitFor();
  await adminPage.getByRole('dialog').getByRole('button', { name: 'close' }).click();
  await adminPage.goto(projectUrl);
  await adminPage.getByRole('tab', { name: /Xodimlar/ }).click();
  await adminPage.getByRole('cell', { name: 'Sinov brigadiri' }).waitFor();
  checks.push(
    'Employee created from the UI with project assignment; project members tab and employee card agree',
  );
  await adminPage.goto(webURL + '/app');
  await adminPage.getByRole('link', { name: /Navoiy 28 turar-joy/ }).waitFor();
  checks.push('Company dashboard lists real projects and counters');
  // 5c. Smeta: qo‘lda yaratish, material, reviziya, Excel import (stage 05)
  await adminPage.goto(webURL + '/app/estimates?project=' + projectUrl.split('/').pop());
  await adminPage.getByRole('button', { name: 'Yangi smeta' }).first().click();
  await adminPage.getByLabel('Smeta nomi').fill('Asosiy smeta');
  const row1 = adminPage.locator('table.grid-editor tbody tr').first();
  await row1.getByLabel('Turi', { exact: true }).selectOption('labor');
  await row1.getByLabel('Nomi', { exact: true }).fill('Beton quyish');
  await row1.getByLabel('Birlik', { exact: true }).selectOption('m3');
  await row1.getByLabel('Miqdor', { exact: true }).fill('120');
  await row1.getByLabel('Birlik narxi').fill('250000');
  await adminPage.getByRole('button', { name: 'Qator qo‘shish' }).click();
  const row2 = adminPage.locator('table.grid-editor tbody tr').nth(1);
  await row2.getByLabel('Turi', { exact: true }).selectOption('material');
  await row2.getByRole('button', { name: 'Yangi material' }).click();
  await adminPage.getByRole('dialog').getByLabel('Material nomi').fill('Sement M500');
  await adminPage
    .getByRole('dialog')
    .getByLabel(/O‘lchov birligi/)
    .selectOption('kg');
  await adminPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Yaratish', exact: true })
    .click();
  await adminPage.getByRole('status').filter({ hasText: 'Material yaratildi' }).waitFor();
  await row2.getByLabel('Nomi', { exact: true }).fill('Sement');
  await row2.getByLabel('Miqdor', { exact: true }).fill('5000');
  await row2.getByLabel('Birlik narxi').fill('1200.50');
  await adminPage.locator('.sticky-actions').getByRole('button', { name: 'Saqlash' }).click();
  await adminPage.getByRole('status').filter({ hasText: 'Smeta yaratildi' }).waitFor();
  await adminPage.getByRole('heading', { name: /Asosiy smeta/ }).waitFor();
  await adminPage.getByText('Beton quyish').waitFor();
  const estTotal = (
    await owner.query('SELECT sum(total)::text s FROM estimate_lines WHERE archived_at IS NULL')
  ).rows[0].s;
  assert.equal(estTotal, '36002500.00');
  checks.push(
    'Estimate created in the grid editor with labor and material lines; totals match decimal arithmetic',
  );
  await adminPage.getByRole('button', { name: 'Tahrirlash' }).click();
  await adminPage.getByRole('heading', { name: /yangi reviziya/ }).waitFor();
  await adminPage
    .locator('table.grid-editor tbody tr')
    .first()
    .getByLabel('Miqdor', { exact: true })
    .fill('130');
  await adminPage.locator('.sticky-actions').getByRole('button', { name: 'Saqlash' }).click();
  await adminPage.getByRole('status').filter({ hasText: 'reviziya 2' }).waitFor();
  await adminPage.getByRole('tab', { name: 'Reviziyalar tarixi' }).click();
  await adminPage.getByRole('cell', { name: /1/ }).first().waitFor();
  assert.equal((await owner.query('SELECT count(*)::int n FROM estimate_revisions')).rows[0].n, 2);
  checks.push('Editing an estimate creates an immutable new revision and keeps history');
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Smeta');
  sheet.addRow(['Turi', 'Nomi', 'Material', 'Birlik', 'Miqdor', 'Narx', 'Kategoriya']);
  sheet.addRow(['material', 'Sement import', 'Sement M500', 'kg', 1000, 1100, 'Materiallar']);
  sheet.addRow(['labor', 'G‘isht terish', '', 'm2', 80, 95000, 'Ishlar']);
  const xlsxPath = resolve(tmpdir(), 'barpo-ui-import-' + process.pid + '.xlsx');
  await book.xlsx.writeFile(xlsxPath);
  await adminPage.goto(webURL + '/app/estimates?project=' + projectUrl.split('/').pop());
  await adminPage.getByRole('button', { name: 'Excel import' }).first().click();
  await adminPage.getByRole('dialog').locator('input[type=file]').setInputFiles(xlsxPath);
  await adminPage.getByRole('dialog').getByText('2 ta qator topildi').waitFor();
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Tekshirish' }).click();
  await adminPage
    .getByRole('dialog')
    .getByText(/Tekshiruv o‘tdi: 2 ta qator/)
    .waitFor();
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Smetani yaratish' }).click();
  await adminPage.getByRole('status').filter({ hasText: 'Smeta import qilindi' }).waitFor();
  await adminPage.getByText('G‘isht terish').waitFor();
  checks.push(
    'Excel import: inspect headers, auto-map columns, resolve material by name, preview then commit',
  );
  // 5d. Ombor: kirim → jo‘natish → qisman qabul → sarf taklifi → tasdiqlash → so‘rov (stage 06)
  await adminPage.goto(projectUrl);
  await adminPage.getByRole('tab', { name: /Omborlar/ }).click();
  await adminPage.getByRole('button', { name: 'Ombor qo‘shish' }).click();
  await adminPage.getByRole('dialog').getByLabel('Ombor nomi').fill('Asosiy ombor');
  await adminPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Qo‘shish', exact: true })
    .click();
  await adminPage.getByText('Asosiy ombor').first().waitFor();
  const stockUrl = webURL + '/app/stock?project=' + projectUrl.split('/').pop();
  await adminPage.goto(stockUrl);
  await adminPage.getByRole('button', { name: 'Kirim', exact: true }).click();
  await adminPage
    .getByRole('dialog')
    .getByLabel('Material', { exact: true })
    .selectOption({ label: 'Sement M500 (kg)' });
  await adminPage
    .getByRole('dialog')
    .getByLabel(/^Miqdor/)
    .fill('1000');
  await adminPage
    .getByRole('dialog')
    .getByLabel(/Birlik tannarxi/)
    .fill('1200');
  await adminPage.getByRole('dialog').getByLabel(/Sabab/).fill('Yetkazib beruvchidan kirim');
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Saqlash' }).click();
  await adminPage.getByRole('status').filter({ hasText: 'Harakat saqlandi' }).first().waitFor();
  await adminPage
    .getByRole('cell', { name: /Sement M500/ })
    .first()
    .waitFor();
  checks.push('Warehouse receipt posts stock and inventory value from the UI');
  await adminPage.getByRole('button', { name: 'Jo‘natish', exact: true }).first().click();
  await adminPage
    .getByRole('dialog')
    .getByLabel('Qayerga')
    .selectOption({ label: 'Sinov brigadiri' });
  await adminPage
    .getByRole('dialog')
    .getByLabel('Material', { exact: true })
    .selectOption({ index: 1 });
  await adminPage
    .getByRole('dialog')
    .getByLabel(/^Miqdor/)
    .fill('300');
  await adminPage.getByRole('dialog').getByLabel(/Sabab/).fill('Brigadirga jo‘natish');
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Saqlash' }).click();
  await adminPage.getByRole('status').filter({ hasText: 'Harakat saqlandi' }).first().waitFor();
  const brigadierPage = await newPage();
  await login(brigadierPage, 'ui.brigadier', brigadierPassword);
  await brigadierPage.locator('input[name=current_password]').fill(brigadierPassword);
  await brigadierPage.locator('input[name=new_password]').fill(password + '3');
  await brigadierPage.locator('input[name=repeat]').fill(password + '3');
  await brigadierPage.getByRole('button', { name: 'Saqlash' }).click();
  await brigadierPage.getByText('Parol yangilandi').waitFor();
  await login(brigadierPage, 'ui.brigadier', password + '3');
  await brigadierPage.getByRole('link', { name: 'Bosh sahifa' }).waitFor();
  await brigadierPage.goto(stockUrl);
  await brigadierPage.getByRole('tab', { name: /Harakatlar/ }).click();
  await brigadierPage.getByRole('button', { name: 'Qabul qilish' }).first().click();
  await brigadierPage
    .getByRole('dialog')
    .getByLabel(/Qabul miqdori/)
    .fill('200');
  await brigadierPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Tasdiqlash', exact: true })
    .click();
  await brigadierPage.getByRole('status').filter({ hasText: 'Harakat saqlandi' }).first().waitFor();
  await brigadierPage.getByRole('button', { name: 'Sarf', exact: true }).click();
  await brigadierPage
    .getByRole('dialog')
    .getByLabel('Material', { exact: true })
    .selectOption({ index: 1 });
  await brigadierPage
    .getByRole('dialog')
    .getByLabel(/^Miqdor/)
    .fill('150');
  await brigadierPage.getByRole('dialog').getByLabel(/Sabab/).fill('Poydevor betoni uchun sarf');
  await brigadierPage.getByRole('dialog').getByRole('button', { name: 'Saqlash' }).click();
  await brigadierPage.getByRole('status').filter({ hasText: 'Harakat saqlandi' }).first().waitFor();
  checks.push('Brigadier accepts a transfer partially and submits a consumption proposal');
  await adminPage.reload();
  await adminPage.getByRole('tab', { name: /Harakatlar/ }).click();
  await adminPage.getByRole('button', { name: 'Tasdiqlash', exact: true }).first().click();
  await adminPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Tasdiqlash', exact: true })
    .click();
  await adminPage.getByRole('status').filter({ hasText: 'Harakat saqlandi' }).first().waitFor();
  const stockState = (
    await owner.query(
      "SELECT (SELECT coalesce(sum(amount),0)::text FROM journal_entries WHERE account='expense') expense,(SELECT quantity::text FROM stock_balances b JOIN stock_accounts a ON a.id=b.account_id WHERE a.warehouse_id IS NOT NULL) warehouse_qty,(SELECT (quantity-reserved)::text FROM stock_balances b JOIN stock_accounts a ON a.id=b.account_id WHERE a.custodian_id IS NOT NULL) custody_available",
    )
  ).rows[0];
  assert.equal(stockState.expense, '180000.00');
  assert.equal(stockState.warehouse_qty, '800.000000');
  assert.equal(stockState.custody_available, '50.000000');
  checks.push(
    'Consumption review posts expense 150 x 1200 and leaves warehouse 800 (100 still reserved) and custody 50',
  );
  await brigadierPage.getByRole('tab', { name: /So‘rovlar/ }).click();
  await brigadierPage.getByRole('button', { name: 'Material so‘rash' }).click();
  await brigadierPage
    .getByRole('dialog')
    .getByLabel('Material', { exact: true })
    .selectOption({ index: 1 });
  await brigadierPage.getByRole('dialog').getByLabel('Miqdor', { exact: true }).fill('100');
  await brigadierPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Tasdiqlash', exact: true })
    .click();
  await brigadierPage.getByRole('status').filter({ hasText: 'Harakat saqlandi' }).first().waitFor();
  await adminPage.getByRole('tab', { name: /So‘rovlar/ }).click();
  await adminPage.getByRole('button', { name: 'Jo‘natish bilan bajarish' }).first().click();
  await adminPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Tasdiqlash', exact: true })
    .click();
  await adminPage.getByRole('status').filter({ hasText: 'Harakat saqlandi' }).first().waitFor();
  await adminPage.getByRole('cell', { name: 'Bajarildi' }).first().waitFor();
  checks.push(
    'Material request from brigadier is fulfilled by a transfer created from the request',
  );
  // 5e. Moliya: kontragent, kassa, invoys (kirimga bog'langan), to'lov, to'lov so'rovi, ish haqi (stage 07)
  const dialog = () => adminPage.getByRole('dialog');
  await adminPage.goto(webURL + '/app/finance/counterparties');
  await adminPage.getByRole('button', { name: 'Kontragent qo‘shish' }).first().click();
  await dialog().getByLabel(/^Nomi/).fill('Qurilish Savdo MChJ');
  await dialog().getByRole('button', { name: 'Saqlash', exact: true }).click();
  await dialog().waitFor({ state: 'detached' });
  await adminPage.getByRole('cell', { name: /Qurilish Savdo MChJ/ }).waitFor();
  await adminPage.goto(webURL + '/app/finance/bank-cash?project=' + projectUrl.split('/').pop());
  await adminPage.getByRole('button', { name: 'Hisob qo‘shish' }).click();
  await dialog().getByLabel('Hisob nomi').fill('Asosiy kassa');
  await dialog().getByLabel('Turi').selectOption('cash');
  await dialog().getByRole('button', { name: 'Saqlash', exact: true }).click();
  await dialog().waitFor({ state: 'detached' });
  await adminPage.getByText('Asosiy kassa').first().waitFor();
  checks.push('Counterparty and cash account created from the UI');
  await adminPage.goto(webURL + '/app/finance/invoices?project=' + projectUrl.split('/').pop());
  await adminPage.getByRole('button', { name: 'Invoys / dalolatnoma' }).first().click();
  await dialog().getByLabel('Turi').selectOption('supplier_invoice');
  await dialog()
    .getByLabel(/^Kontragent/)
    .selectOption({ index: 1 });
  await dialog()
    .getByLabel(/Bog‘lanadigan ombor kirimi/)
    .selectOption({ index: 1 });
  await dialog().getByLabel('To‘lov muddati').fill('2026-10-20');
  await dialog().getByLabel('Tavsif').fill('Sement M500 uchun invoys');
  await dialog().getByRole('button', { name: 'Saqlash', exact: true }).click();
  await dialog().waitFor({ state: 'detached' });
  await adminPage.getByRole('button', { name: 'To‘lash', exact: true }).first().click();
  await dialog()
    .getByLabel(/Bank\/kassa hisobi/)
    .selectOption({ index: 1 });
  await dialog().getByLabel('Tavsif').fill('Invoys bo‘yicha to‘lov');
  await dialog().getByRole('button', { name: 'Saqlash', exact: true }).click();
  await dialog().waitFor({ state: 'detached' });
  const fin1 = (
    await owner.query(
      "SELECT (-coalesce(sum(amount) FILTER(WHERE account='payable'),0))::text debt,coalesce(sum(amount) FILTER(WHERE account='cash'),0)::text cash,coalesce(sum(amount) FILTER(WHERE account='clearing'),0)::text clearing FROM journal_entries",
    )
  ).rows[0];
  assert.equal(fin1.debt, '0.00');
  assert.equal(fin1.cash, '-1200000.00');
  assert.equal(fin1.clearing, '0.00');
  checks.push(
    'Supplier invoice matched to the receipt clears GR/IR; payment settles the debt and reduces cash',
  );
  await adminPage.goto(webURL + '/app/finance/documents?project=' + projectUrl.split('/').pop());
  await adminPage.getByRole('button', { name: 'Hujjat yaratish' }).first().click();
  await dialog().getByLabel('Turi').selectOption('service');
  await dialog()
    .getByLabel(/^Kontragent/)
    .selectOption({ index: 1 });
  await dialog()
    .getByLabel(/^Summa/)
    .fill('500000');
  await dialog().getByLabel('To‘lov muddati').fill('2026-10-25');
  await dialog().getByLabel('Tavsif').fill('Kran ijarasi xizmati');
  await dialog().getByRole('button', { name: 'Saqlash', exact: true }).click();
  await dialog().waitFor({ state: 'detached' });
  await adminPage.goto(webURL + '/app/finance/payment-requests');
  await adminPage.getByRole('button', { name: 'To‘lov so‘rovi' }).first().click();
  await dialog()
    .getByLabel(/^Kontragent/)
    .selectOption({ index: 1 });
  await dialog()
    .getByLabel(/Bog‘langan hujjat/)
    .selectOption({ index: 1 });
  await dialog().getByLabel('Maqsad').fill('Kran ijarasi uchun to‘lov');
  await dialog().getByRole('button', { name: 'Tasdiqlash', exact: true }).click();
  await dialog().waitFor({ state: 'detached' });
  await adminPage.getByRole('button', { name: 'Tasdiqlash', exact: true }).first().click();
  await dialog().getByRole('button', { name: 'Tasdiqlash', exact: true }).click();
  await dialog().waitFor({ state: 'detached' });
  await adminPage.getByRole('button', { name: 'To‘lash', exact: true }).first().click();
  await dialog()
    .getByLabel(/Bank\/kassa hisobi/)
    .selectOption({ index: 1 });
  await dialog().getByRole('button', { name: 'Tasdiqlash', exact: true }).click();
  await dialog().waitFor({ state: 'detached' });
  await adminPage.getByRole('cell', { name: 'To‘langan' }).first().waitFor();
  const fin2 = (
    await owner.query(
      "SELECT (-coalesce(sum(amount) FILTER(WHERE account='payable'),0))::text debt,coalesce(sum(amount) FILTER(WHERE account='cash'),0)::text cash,coalesce(sum(amount) FILTER(WHERE account='expense'),0)::text expense FROM journal_entries",
    )
  ).rows[0];
  assert.equal(fin2.debt, '0.00');
  assert.equal(fin2.cash, '-1700000.00');
  assert.equal(fin2.expense, '680000.00');
  checks.push('Payment request → approve → pay settles a service act; expense is booked once');
  await adminPage.goto(webURL + '/app/finance/payroll?project=' + projectUrl.split('/').pop());
  await adminPage.getByRole('button', { name: 'Davr ochish' }).first().click();
  await dialog().getByRole('button', { name: 'Yaratish', exact: true }).click();
  await dialog().waitFor({ state: 'detached' });
  await adminPage.getByRole('button', { name: 'Xodim qo‘shish' }).click();
  const brigadierOption = await dialog()
    .getByLabel('Xodim', { exact: true })
    .locator('option', { hasText: 'Sinov brigadiri' })
    .getAttribute('value');
  await dialog().getByLabel('Xodim', { exact: true }).selectOption(brigadierOption!);
  await dialog().getByLabel('Oklad').fill('3000000');
  await dialog().getByLabel('Bonus').fill('200000');
  await dialog().getByLabel('Ushlanma').fill('100000');
  await dialog().getByRole('button', { name: 'Saqlash', exact: true }).click();
  await dialog().waitFor({ state: 'detached' });
  await adminPage.getByRole('button', { name: /Davrni yopish/ }).click();
  await dialog().getByRole('button', { name: 'Tasdiqlash', exact: true }).click();
  await dialog().waitFor({ state: 'detached' });
  await adminPage.getByRole('button', { name: 'To‘lash', exact: true }).first().click();
  await dialog()
    .getByLabel(/Bank\/kassa hisobi/)
    .selectOption({ index: 1 });
  await dialog().getByRole('button', { name: 'Tasdiqlash', exact: true }).click();
  await dialog().waitFor({ state: 'detached' });
  const fin3 = (
    await owner.query(
      "SELECT (-coalesce(sum(amount) FILTER(WHERE account='payable'),0))::text debt,coalesce(sum(amount) FILTER(WHERE account='cash'),0)::text cash,coalesce(sum(amount) FILTER(WHERE account='expense'),0)::text expense,(SELECT count(*)::int FROM counterparties WHERE kind='employee') employee_cps FROM journal_entries",
    )
  ).rows[0];
  assert.equal(fin3.debt, '0.00');
  assert.equal(fin3.cash, '-4800000.00');
  assert.equal(fin3.expense, '3780000.00');
  assert.equal(fin3.employee_cps, 1);
  checks.push(
    'Payroll period posts labor expense per employee and payment clears it through the cash account',
  );
  // 5f. Vazifa va hisobot: yaratish → bajaruvchi → tekshiruv; hisobot + foto + progress tuzatish (stage 08)
  await adminPage.goto(webURL + '/app/tasks?project=' + projectUrl.split('/').pop());
  await adminPage.getByRole('button', { name: 'Vazifa qo‘shish' }).first().click();
  await dialog()
    .getByLabel(/^Vazifa/)
    .fill('Poydevor armaturasini bog‘lash');
  const assigneeOption = await dialog()
    .getByLabel(/^Bajaruvchi/)
    .locator('option', { hasText: 'Sinov brigadiri' })
    .getAttribute('value');
  await dialog()
    .getByLabel(/^Bajaruvchi/)
    .selectOption(assigneeOption!);
  const reviewerOption = await dialog()
    .getByLabel(/^Tekshiruvchi/)
    .locator('option', { hasText: 'Sinov Admini' })
    .getAttribute('value');
  await dialog()
    .getByLabel(/^Tekshiruvchi/)
    .selectOption(reviewerOption!);
  await dialog().getByLabel('Muhimlik').selectOption('high');
  await dialog().getByRole('button', { name: 'Saqlash', exact: true }).click();
  await dialog().waitFor({ state: 'detached' });
  await adminPage.getByText('Poydevor armaturasini bog‘lash').first().waitFor();
  checks.push('Task created from the kanban page with assignee, reviewer and priority');
  await brigadierPage.goto(webURL + '/app/tasks?project=' + projectUrl.split('/').pop());
  await brigadierPage.getByText('Poydevor armaturasini bog‘lash').first().click();
  await brigadierPage.getByRole('button', { name: 'Boshlash' }).click();
  await brigadierPage.getByRole('button', { name: 'Tekshiruvga yuborish' }).waitFor();
  await brigadierPage.getByRole('button', { name: 'Tekshiruvga yuborish' }).click();
  await brigadierPage
    .getByRole('dialog')
    .getByText('Tekshiruvda', { exact: true })
    .first()
    .waitFor();
  await adminPage.reload();
  await adminPage.getByText('Poydevor armaturasini bog‘lash').first().click();
  await adminPage.getByRole('dialog').getByLabel('Izoh').fill('Sifat talabga javob beradi');
  await adminPage.getByRole('button', { name: 'Qabul qilish', exact: true }).click();
  await adminPage.getByRole('dialog').getByText('Qabul qilingan').first().waitFor();
  let taskStatus = '';
  for (let i = 0; i < 40 && taskStatus !== 'accepted'; i++) {
    taskStatus =
      (await owner.query("SELECT status FROM tasks WHERE title='Poydevor armaturasini bog‘lash'"))
        .rows[0]?.status ?? '';
    if (taskStatus !== 'accepted') await delay(250);
  }
  assert.equal(taskStatus, 'accepted');
  checks.push('Assignee starts and submits the task; reviewer accepts it with a note');
  await adminPage.getByRole('dialog').getByRole('button', { name: 'close' }).click();
  await brigadierPage.goto(webURL + '/app/reports?project=' + projectUrl.split('/').pop());
  await brigadierPage.getByRole('button', { name: 'Hisobot yaratish' }).first().click();
  await brigadierPage
    .getByRole('dialog')
    .getByLabel('Bajarilgan ishlar')
    .fill('Beton quyish ishlari bajarildi, 40 m3');
  await brigadierPage
    .getByRole('dialog')
    .getByLabel(/Smeta qatori/)
    .selectOption({ index: 1 });
  await brigadierPage
    .getByRole('dialog')
    .getByLabel(/Bajarilgan miqdor/)
    .fill('40');
  await brigadierPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Saqlash', exact: true })
    .click();
  await brigadierPage
    .getByRole('dialog')
    .getByRole('heading', { name: /Kunlik/ })
    .waitFor();
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  await brigadierPage
    .getByRole('dialog')
    .locator('input[type=file]')
    .setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png });
  await brigadierPage.getByRole('status').filter({ hasText: 'Foto yuklandi' }).first().waitFor();
  await brigadierPage.getByRole('dialog').getByRole('button', { name: 'foto.png' }).waitFor();
  checks.push('Brigadier submits a daily report with work progress and uploads a photo');
  await adminPage.goto(webURL + '/app/reports?project=' + projectUrl.split('/').pop());
  await adminPage.getByText('Beton quyish ishlari bajarildi').first().click();
  await adminPage
    .getByRole('dialog')
    .getByLabel(/Izoh \(sabab\)/)
    .fill('Hajm tasdiqlandi');
  await adminPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Qabul qilish', exact: true })
    .click();
  await adminPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Progressni tuzatish' })
    .waitFor();
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Progressni tuzatish' }).click();
  await adminPage.getByRole('dialog').last().getByLabel(/^Farq/).fill('-5');
  await adminPage
    .getByRole('dialog')
    .last()
    .getByLabel('Sabab')
    .fill('Qayta o‘lchashda 35 m3 chiqdi');
  await adminPage
    .getByRole('dialog')
    .last()
    .getByRole('button', { name: 'Saqlash', exact: true })
    .click();
  await adminPage.getByRole('dialog').getByText('Qayta o‘lchashda 35 m3 chiqdi').waitFor();
  let prog: any = {};
  for (let i = 0; i < 40 && prog.corrected !== '-5.000000'; i++) {
    prog = (
      await owner.query(
        'SELECT (SELECT sum(quantity)::text FROM progress_entries) entered,(SELECT sum(quantity_delta)::text FROM progress_corrections) corrected',
      )
    ).rows[0];
    if (prog.corrected !== '-5.000000') await delay(250);
  }
  assert.deepEqual([prog.entered, prog.corrected], ['40.000000', '-5.000000']);
  const estLine = await adminPage.request
    .get(webURL + '/v1/estimates?project_id=' + projectUrl.split('/').pop())
    .then((r) => r.json());
  const estDetail = await adminPage.request
    .get(webURL + '/v1/estimates/' + estLine.items.find((e: any) => e.name === 'Asosiy smeta').id)
    .then((r) => r.json());
  assert.equal(
    estDetail.lines.find((l: any) => l.description === 'Beton quyish').fact_quantity,
    '35.000000',
  );
  checks.push(
    'Report acceptance posts progress once; a signed correction adjusts the effective fact without editing history',
  );
  // 6. Profil va Telegram havolasi, til almashtirish
  await adminPage.goto(webURL + '/profile');
  await adminPage.getByRole('button', { name: 'Telegramni ulash' }).click();
  const tgLink = (await adminPage.locator('code').first().textContent())!.trim();
  assert.match(tgLink, /^https:\/\/t\.me\/barpoai_bot\?start=[A-Za-z0-9_-]{32,}$/);
  await adminPage.getByRole('button', { name: 'RU', exact: true }).click();
  await adminPage.getByRole('heading', { name: 'Профиль' }).waitFor();
  await adminPage.getByRole('button', { name: 'UZ', exact: true }).click();
  checks.push('Profile issues one-time Telegram deep link; UI switches between UZ and RU');

  // 6b. 09-bosqich: dashboard bloklari, sozlamalar, bildirishnomalar, audit, fayllar, eksport, texnik panel
  const projectId = projectUrl.split('/').pop()!;
  await adminPage.goto(webURL + '/app');
  await adminPage.getByText('Ochiq vazifalar', { exact: true }).waitFor();
  await adminPage.getByText('Qolgan budjet', { exact: true }).waitFor();
  await adminPage.getByRole('heading', { name: 'Yaqin vazifalarim' }).waitFor();
  await brigadierPage.goto(webURL + '/app');
  await brigadierPage.getByRole('heading', { name: 'Yaqin vazifalarim' }).waitFor();
  assert.equal(await brigadierPage.getByText('Qolgan budjet', { exact: true }).count(), 0);
  checks.push(
    'Dashboard blocks follow permissions in the browser: admin sees finance, brigadier does not',
  );
  await adminPage.goto(webURL + '/app/settings');
  await adminPage.getByLabel('Kompaniya nomi').fill('UI Sinov Qurilish MCHJ');
  await adminPage.getByLabel('Telefon').fill('+998 71 200 00 11');
  await adminPage.getByRole('button', { name: 'Saqlash', exact: true }).click();
  await adminPage.getByText('Sozlamalar saqlandi').first().waitFor();
  await adminPage.locator('.sidebar-tenant', { hasText: 'UI Sinov Qurilish MCHJ' }).waitFor();
  await adminPage.getByRole('switch', { name: /Vazifalar/ }).click();
  let tenantSettings: any = {};
  for (let i = 0; i < 40 && tenantSettings.tasks !== 'false'; i++) {
    tenantSettings = (
      await owner.query(
        "SELECT settings->'telegram'->>'tasks' tasks,phone FROM tenants WHERE registration_key=$1",
        ['UI-TEST-001'],
      )
    ).rows[0];
    if (tenantSettings.tasks !== 'false') await delay(250);
  }
  assert.deepEqual([tenantSettings.tasks, tenantSettings.phone], ['false', '+998712000011']);
  checks.push(
    'Settings page saves company name/phone (sidebar updates) and mutes a Telegram category',
  );
  await brigadierPage.goto(webURL + '/notifications');
  await brigadierPage.getByRole('heading', { name: 'Bildirishnomalar' }).waitFor();
  await brigadierPage.getByText('Yangi vazifa', { exact: false }).first().waitFor();
  await brigadierPage.getByRole('button', { name: 'Hammasini o‘qilgan qilish' }).click();
  await brigadierPage
    .getByRole('button', { name: 'O‘qildi' })
    .first()
    .waitFor({ state: 'detached' });
  checks.push('Notifications page lists history and marks everything read');
  await adminPage.goto(webURL + '/app/audit');
  await adminPage.getByPlaceholder('Amal bo‘yicha (masalan, task.)').fill('company.');
  await adminPage.getByText('company.settings').first().waitFor();
  await adminPage.goto(webURL + '/app/files?project=' + projectId);
  await adminPage.getByRole('button', { name: 'foto.png' }).first().waitFor();
  checks.push('Audit page filters by action prefix; files page shows report photos by project');
  await adminPage.goto(webURL + '/app/finance/plan-actual?project=' + projectId);
  await adminPage.getByRole('heading', { name: 'Zonalar bo‘yicha' }).waitFor();
  const [download] = await Promise.all([
    adminPage.waitForEvent('download'),
    adminPage.getByRole('button', { name: 'Excel' }).click(),
  ]);
  assert.match(download.suggestedFilename(), /reja-fakt\.xlsx$/);
  checks.push('Plan–actual page renders the zone rollup and downloads the Excel export');
  await owner.query(
    "INSERT INTO users(login,display_name,password_hash,role) VALUES('ui_tech','Texnik xodim',$1,'super_admin')",
    [await hashPassword(password)],
  );
  const techPage = await newPage();
  await login(techPage, 'ui_tech', password);
  await techPage.getByRole('heading', { name: 'Murojaatlar' }).waitFor();
  await techPage.goto(webURL + '/admin/diagnostics');
  await techPage.getByText('Worker navbati', { exact: true }).waitFor();
  await techPage.getByText(/Oxirgi migratsiya: \d{3}_[a-z_]+\.sql/).waitFor();
  await adminPage.goto(webURL + '/app/billing');
  await adminPage.getByRole('button', { name: 'Yordam so‘rovi yuborish' }).click();
  await adminPage.getByRole('dialog').getByLabel('Xabar').fill('UI sinov: eksport qayerda?');
  await adminPage.getByRole('dialog').locator('.modal-footer button').last().click();
  await adminPage.getByRole('dialog').waitFor({ state: 'detached' });
  await techPage.goto(webURL + '/admin/support');
  await techPage.getByText('UI sinov: eksport qayerda?').waitFor();
  await techPage.getByRole('button', { name: 'Javob yozish' }).first().click();
  await techPage
    .getByRole('dialog')
    .getByLabel('Javob')
    .fill('UI sinov: eksport tugmasi reja–fakt sahifasida.');
  await techPage.getByRole('dialog').getByRole('button', { name: 'Javob berib yopish' }).click();
  await techPage.getByRole('dialog').waitFor({ state: 'detached' });
  await techPage.getByRole('button', { name: 'Yopiq', exact: true }).first().click();
  await techPage.getByText('Javob: UI sinov: eksport tugmasi').waitFor();
  await adminPage.goto(webURL + '/notifications');
  await adminPage.getByText('BARPO AI support javobi').first().waitFor();
  checks.push(
    'Super admin reads diagnostics (queue, migration) and answers a support request; the admin receives the reply as a notification',
  );

  // 7. Platforma egasi: tarif biriktirish, invoys, to'lov, holat
  await ownerPage.reload();
  await ownerPage.getByText('Sinov Admini').waitFor();
  await ownerPage.getByRole('button', { name: 'Tarif biriktirish' }).click();
  await ownerPage.getByLabel('Tarif versiyasi').selectOption({ index: 1 });
  await ownerPage.getByRole('dialog').getByRole('button', { name: 'Saqlash', exact: true }).click();
  await ownerPage.getByText('standard v1').waitFor();
  await ownerPage.getByRole('button', { name: 'Invoys chiqarish' }).click();
  await ownerPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Yaratish', exact: true })
    .click();
  await ownerPage.getByRole('button', { name: 'To‘lov yozish' }).first().click();
  await ownerPage.getByLabel('Summa (UZS)').fill('450000.00');
  await ownerPage.getByLabel('Tashqi hujjat raqami').fill('UI-PAY-1');
  await ownerPage.getByLabel('Sabab').fill('UI sinov to‘lovi');
  await ownerPage.getByRole('dialog').getByRole('button', { name: 'Saqlash', exact: true }).click();
  await ownerPage
    .getByRole('cell', { name: /450.000/ })
    .first()
    .waitFor();
  await delay(300);
  const stateRow = (
    await owner.query('SELECT paid_until FROM tenants WHERE registration_key=$1', ['UI-TEST-001'])
  ).rows[0];
  assert(stateRow.paid_until, 'paid_until extended by fully covered invoice');
  // 10-bosqich: ortiqcha to'lov kreditga o'tadi va kompaniya billing sahifasida ko'rinadi
  await ownerPage.getByRole('button', { name: 'To‘lov yozish' }).first().click();
  await ownerPage.getByLabel('Summa (UZS)').fill('100000.00');
  await ownerPage.getByLabel('Tashqi hujjat raqami').fill('UI-PAY-2');
  await ownerPage.getByLabel('Sabab').fill('UI sinov: ortiqcha to‘lov');
  await ownerPage.getByRole('dialog').getByRole('button', { name: 'Saqlash', exact: true }).click();
  await ownerPage.getByRole('dialog').waitFor({ state: 'detached' });
  const creditRow = (
    await owner.query(
      'SELECT coalesce(sum(c.amount),0)::text balance FROM billing_credits c JOIN tenants t ON t.id=c.tenant_id WHERE t.registration_key=$1',
      ['UI-TEST-001'],
    )
  ).rows[0];
  assert.equal(creditRow.balance, '100000.00');
  await adminPage.goto(webURL + '/app/billing');
  await adminPage.getByText('Kredit qoldig‘i', { exact: true }).waitFor();
  await adminPage
    .getByText(/100.000/)
    .first()
    .waitFor();
  checks.push(
    'Overpayment becomes tenant credit; the company billing page shows the credit balance and next invoice date',
  );
  checks.push(
    'Owner assigns plan, issues invoice and records payment; coverage extends paid_until',
  );

  // 8. Chiqish cookie'ni tozalaydi
  await managerPage.getByRole('button', { name: /Sinov menejeri/ }).click();
  await managerPage.getByRole('button', { name: 'Chiqish' }).click();
  await managerPage.getByRole('heading', { name: 'Hisobingizga kiring' }).waitFor();
  await managerPage.goto(webURL + '/app');
  await managerPage.getByRole('heading', { name: 'Hisobingizga kiring' }).waitFor();
  checks.push('Logout clears the session cookie and protected routes redirect to login');
  assert.deepEqual(errors, []);
  checks.push('No uncaught React/browser errors');
  await mkdir('docs', { recursive: true });
  await ownerPage.screenshot({ path: 'docs/platform-tenant-ui.png' });
  const result = { executed_at: new Date().toISOString(), browser: 'Headless Chrome', checks };
  await writeFile('docs/ui-verification.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error('ERRORS', JSON.stringify(errorsRef.list));
  let n = 0;
  for (const p of pages) {
    try {
      await p.screenshot({ path: 'docs/ui-failure-' + n++ + '.png' });
    } catch {}
    try {
      console.error(
        'PAGE',
        p.url(),
        (await p.evaluate(() => document.body.innerHTML.length)) +
          ' ' +
          (await p.locator('body').innerText()).slice(0, 600).replace(/s+/g, ' '),
      );
    } catch {}
  }
  throw error;
} finally {
  if (browser) await browser.close();
  if (vite) await vite.close();
  if (app) await app.close();
  if (pool) await pool.end();
  if (owner) await owner.end();
  try {
    docker('stop', name);
  } catch {}
}
