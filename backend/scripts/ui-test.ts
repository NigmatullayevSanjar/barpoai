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
  // 6. Profil va Telegram havolasi, til almashtirish
  await adminPage.goto(webURL + '/profile');
  await adminPage.getByRole('button', { name: 'Telegramni ulash' }).click();
  const tgLink = (await adminPage.locator('code').first().textContent())!.trim();
  assert.match(tgLink, /^https:\/\/t\.me\/barpoai_bot\?start=[A-Za-z0-9_-]{32,}$/);
  await adminPage.getByRole('button', { name: 'RU', exact: true }).click();
  await adminPage.getByRole('heading', { name: 'Профиль' }).waitFor();
  await adminPage.getByRole('button', { name: 'UZ', exact: true }).click();
  checks.push('Profile issues one-time Telegram deep link; UI switches between UZ and RU');

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
