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
import { chromium, type Browser, type Locator } from 'playwright';
import ExcelJS from 'exceljs';
import { tmpdir } from 'node:os';
import { navFor, navHref, type Role } from '../../frontend/src/lib/permissions.ts';

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
  const { createServer } = await import('../../frontend/node_modules/vite/dist/node/index.js');
  vite = await createServer({
    root: resolve('../frontend'),
    configFile: resolve('../frontend/vite.config.ts'),
    server: { host: 'localhost', port: 0, strictPort: false },
    // Foydalanuvchining pnpm dev nusxasi bilan .vite/deps keshini bo'lishmaslik uchun (bo'sh sahifa reload bo'ronlari).
    cacheDir: resolve(tmpdir(), 'barpo-ui-test-vite-cache'),
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
  await ownerPage.getByRole('heading', { name: 'Platforma boshqaruv paneli' }).waitFor();
  checks.push('Platform owner logs in with cookie session and sees the platform dashboard');
  await ownerPage.getByRole('link', { name: 'Tariflar' }).click();
  await ownerPage.getByRole('button', { name: 'Yangi tarif versiyasi' }).first().click();
  await ownerPage.getByLabel('Oylik narx (UZS)').fill('450000.00');
  await ownerPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Yaratish', exact: true })
    .click();
  // Figma F6: tariflar kartalar ko'rinishida — sarlavha tarif kodi
  await ownerPage.getByRole('heading', { name: 'standard', exact: true }).waitFor();
  checks.push('Plan version created from the UI');
  await ownerPage.getByRole('link', { name: 'Mijozlar' }).click();
  await ownerPage.getByRole('button', { name: 'Yangi kompaniya' }).first().click();
  // Figma F6: uch qadamli yaratish — ma'lumotlar → yuridik va domen → tarif va holat
  await ownerPage.getByLabel('Kompaniya nomi').fill('UI sinov qurilish');
  await ownerPage.getByRole('dialog').getByRole('button', { name: 'Keyingisi', exact: true }).click();
  await ownerPage.getByLabel('Ro‘yxat raqami (STIR yoki ichki kod)').fill('UI-TEST-001');
  await ownerPage.getByRole('dialog').getByRole('button', { name: 'Keyingisi', exact: true }).click();
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
  await managerPage.locator('.sidebar').getByRole('link', { name: 'Vazifalar' }).waitFor();
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
  await adminPage.getByRole('dialog').getByLabel('Maydon, m²').fill('1250.5');
  await adminPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Yaratish', exact: true })
    .click();
  await adminPage.getByRole('heading', { name: /Navoiy 28 turar-joy/ }).waitFor();
  await adminPage.getByText('1250.50', { exact: true }).waitFor();
  // 1.3: obyekt rasmi tahrir oynasida yuklanadi (JPEG/PNG), kartada ko'rinadi
  await adminPage.getByRole('button', { name: 'Tahrirlash', exact: true }).click();
  await adminPage
    .getByRole('dialog')
    .locator('input[type=file]')
    .setInputFiles({
      name: 'fasad.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64',
      ),
    });
  await adminPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Saqlash', exact: true })
    .click();
  await adminPage.locator('img[alt="Navoiy 28 turar-joy"]').waitFor();
  // 1.3: zona turi (blok) va qavatlar soni, keyin tahrir
  await adminPage.getByRole('tab', { name: /Zonalar/ }).click();
  await adminPage.getByRole('button', { name: 'Zona qo‘shish' }).click();
  await adminPage
    .getByRole('dialog')
    .getByLabel(/Zona nomi/)
    .fill('A blok');
  await adminPage.getByRole('dialog').getByLabel('Zona turi').selectOption('block');
  await adminPage.getByRole('dialog').getByLabel('Qavatlar soni').fill('9');
  await adminPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Qo‘shish', exact: true })
    .click();
  // Blok ham karta ("Blok: A blok"), ham zona daraxtida chiqadi — birinchisi yetarli.
  await adminPage.getByText('A blok').first().waitFor();
  await adminPage.getByText('9 qavat').waitFor();
  await adminPage.getByRole('button', { name: 'Zonani tahrirlash' }).click();
  await adminPage.getByRole('dialog').getByLabel('Qavatlar soni').fill('12');
  await adminPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Saqlash', exact: true })
    .click();
  await adminPage.getByText('12 qavat').waitFor();
  const projectUrl = adminPage.url();
  checks.push(
    'Admin creates a project with area and photo, adds a block zone with floors and edits it from the UI',
  );
  // Bosqich 3: xonadon formadan qo'shiladi, keyin Excel shablon bo'yicha import; jami serverdan
  await adminPage.getByRole('tab', { name: /Xonadonlar/ }).click();
  await adminPage.getByRole('button', { name: 'Xonadon qo‘shish' }).click();
  const premiseDlg = adminPage.getByRole('dialog');
  await premiseDlg.getByLabel(/^Raqam/).fill('12');
  await premiseDlg.getByLabel('Zona (blok, kirish, qavat)').selectOption({ index: 1 });
  await premiseDlg.getByLabel('Qavat', { exact: true }).fill('3');
  await premiseDlg.getByLabel('Xonalar', { exact: true }).fill('2');
  await premiseDlg.getByLabel('Maydon, m²').fill('65,4');
  await premiseDlg.getByRole('button', { name: 'Saqlash', exact: true }).click();
  await adminPage.getByText(/Jami: 1 ta, 65[.,]4 m²/).waitFor();
  const premisesBook = new ExcelJS.Workbook();
  const premisesSheet = premisesBook.addWorksheet('Xonadonlar');
  premisesSheet.addRow(['Blok', 'Kirish', 'Qavat', 'Raqam', 'Tur', 'Xonalar', 'Maydon, m²']);
  premisesSheet.addRow(['A blok', null, 4, '13', 'Kvartira', 3, 70.5]);
  await adminPage.getByRole('button', { name: 'Excel’dan import' }).click();
  await adminPage
    .getByRole('dialog')
    .locator('input[type=file]')
    .setInputFiles({
      name: 'xonadonlar.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(await premisesBook.xlsx.writeBuffer()),
    });
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Import qilish' }).click();
  await adminPage.getByRole('dialog').getByText('Import yakunlandi').first().waitFor();
  await adminPage.getByRole('dialog').getByRole('button', { name: 'Yopish' }).click();
  await adminPage.getByText(/Jami: 2 ta, 135[.,]9 m²/).waitFor();
  checks.push('Premises tab: add a premise from the form and import another from Excel; total count and area come from the server');
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
  // Server qidiruvli tanlov (SearchSelect): matn yoziladi, ro'yxatdan variant bosiladi.
  const pickOption = async (
    scope: Locator,
    label: string | RegExp,
    text: string,
    option?: string | RegExp,
  ) => {
    const input = scope.getByLabel(label, { exact: typeof label === 'string' });
    await input.click();
    if (text) await input.fill(text);
    // Ro'yxat portal orqali body'ga chiqadi, shuning uchun dialog ichidan emas, sahifadan qidiriladi.
    const page = scope.page();
    const options = option ? page.getByRole('option', { name: option }) : page.getByRole('option');
    await options.first().click();
  };
  // 5b2. 100 tadan ortiq material: qidiruvli tanlov 101-chi va undan keyingisini ham topadi.
  // Admin materiallarni faqat ko'radi (2026-10-16) — yaratish menejer (smeta import huquqi) nomidan.
  for (let i = 1; i <= 120; i++) {
    const m = await managerPage.request.post(webURL + '/v1/materials', {
      data: { name: 'Tosh ' + String(i).padStart(3, '0'), unit_id: 'kg' },
      headers: { 'Idempotency-Key': randomUUID(), Origin: webURL },
    });
    assert.equal(m.status(), 200, await m.text());
  }
  await adminPage.goto(webURL + '/app/estimates?project=' + projectUrl.split('/').pop());
  await adminPage.getByRole('button', { name: 'Yangi smeta' }).first().click();
  const pickRow = adminPage.locator('table.grid-editor tbody tr').first();
  await pickRow.getByLabel('Turi', { exact: true }).selectOption('material');
  await pickOption(pickRow, 'Material', 'Tosh 118', /Tosh 118/);
  assert.equal(await pickRow.getByRole('combobox', { name: 'Material' }).inputValue(), 'Tosh 118');
  // Tanlov natijasi: setMaterial qator nomi va birligini materialdan to'ldiradi
  assert.equal(await pickRow.getByLabel('Nomi', { exact: true }).inputValue(), 'Tosh 118');
  assert.equal(await pickRow.getByLabel('Birlik', { exact: true }).inputValue(), 'kg');
  // Fokus ketgach SearchSelect close() tanlanmagan bo'lsa matnni tozalardi; tanlangan bo'lsa qoladi
  await adminPage.getByLabel('Smeta nomi').click();
  assert.equal(await pickRow.getByRole('combobox', { name: 'Material' }).inputValue(), 'Tosh 118');
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
  // Admin muharrirda "Yangi material" ko'rmaydi (faqat ko'rish, 2026-10-16); material menejer nomidan yaratiladi
  assert.equal(await row2.getByRole('button', { name: 'Yangi material' }).count(), 0);
  const sement = await managerPage.request.post(webURL + '/v1/materials', {
    data: { name: 'Sement M500', unit_id: 'kg' },
    headers: { 'Idempotency-Key': randomUUID(), Origin: webURL },
  });
  assert.equal(sement.status(), 200, await sement.text());
  await pickOption(row2, 'Material', 'Sement M500', /Sement M500/);
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
  // "Asosiy ombor" obyekt bilan avtomatik yaratilgan (2026-10-16); admin qo'shimcha ombor qo'sha oladi,
  // lekin ombor amallarini (kirim, jo'natish, tasdiqlash, so'rov) bajarmaydi — ular ombor mudiri va prorabda.
  await adminPage.goto(projectUrl);
  await adminPage.getByRole('tab', { name: /Omborlar/ }).click();
  await adminPage.getByText('Asosiy ombor').first().waitFor();
  await adminPage.getByRole('button', { name: 'Ombor qo‘shish' }).click();
  await adminPage.getByRole('dialog').getByLabel('Ombor nomi').fill('Qo‘shimcha ombor');
  await adminPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Qo‘shish', exact: true })
    .click();
  await adminPage.getByText('Qo‘shimcha ombor').first().waitFor();
  checks.push('A new project gets its main warehouse automatically; the admin can still add another warehouse');
  const projectDetail = await adminPage.request
    .get(webURL + '/v1/projects/' + projectUrl.split('/').pop())
    .then((r) => r.json());
  const mainWarehouse = projectDetail.warehouses.find((w: { name: string }) => w.name === 'Asosiy ombor');
  assert(mainWarehouse, 'main warehouse exists');
  const stockStaff: Record<string, Awaited<ReturnType<typeof newPage>>> = {};
  for (const [loginName, role, suffix] of [
    ['ui.warehouse', 'warehouse_manager', '4'],
    ['ui.foreman', 'foreman', '5'],
  ] as const) {
    const made = await adminPage.request.post(webURL + '/v1/employees', {
      data: { login: loginName, display_name: `Sinov ${role}`, password, role },
      headers: { 'Idempotency-Key': randomUUID(), Origin: webURL },
    });
    assert.equal(made.status(), 200, await made.text());
    const assigned = await adminPage.request.post(
      webURL + '/v1/employees/' + (await made.json()).id + '/assignments',
      {
        data: {
          project_id: projectUrl.split('/').pop(),
          ...(role === 'warehouse_manager' ? { warehouse_id: mainWarehouse.id } : {}),
        },
        headers: { 'Idempotency-Key': randomUUID(), Origin: webURL },
      },
    );
    assert.equal(assigned.status(), 200, await assigned.text());
    const page = await newPage();
    await login(page, loginName, password);
    await page.locator('input[name=current_password]').fill(password);
    await page.locator('input[name=new_password]').fill(password + suffix);
    await page.locator('input[name=repeat]').fill(password + suffix);
    await page.getByRole('button', { name: 'Saqlash' }).click();
    await page.getByText('Parol yangilandi').waitFor();
    await login(page, loginName, password + suffix);
    await page.locator('.sidebar').getByRole('link', { name: 'Bosh sahifa' }).waitFor();
    stockStaff[role] = page;
  }
  const warehousePage = stockStaff.warehouse_manager!;
  const foremanPage = stockStaff.foreman!;
  const stockUrl = webURL + '/app/stock?project=' + projectUrl.split('/').pop();
  await adminPage.goto(stockUrl);
  await adminPage.getByRole('tab', { name: /Qoldiqlar|Harakatlar/ }).first().waitFor();
  assert.equal(await adminPage.getByRole('button', { name: 'Kirim', exact: true }).count(), 0);
  assert.equal(await adminPage.getByRole('button', { name: 'Jo‘natish', exact: true }).count(), 0);
  checks.push('Tenant admin sees the stock page without any action buttons (read-only warehouse and materials)');
  await warehousePage.goto(stockUrl);
  await warehousePage.getByRole('button', { name: 'Kirim', exact: true }).click();
  await pickOption(warehousePage.getByRole('dialog'), 'Material', 'Tosh 118', /Tosh 118/);
  assert.equal(
    await warehousePage.getByRole('dialog').getByLabel('Material', { exact: true }).inputValue(),
    'Tosh 118',
  );
  await warehousePage
    .getByRole('dialog')
    .getByLabel(/^Miqdor/)
    .click();
  assert.equal(
    await warehousePage.getByRole('dialog').getByLabel('Material', { exact: true }).inputValue(),
    'Tosh 118',
  );
  await warehousePage.getByRole('dialog').getByRole('button', { name: 'Bekor qilish' }).click();
  await warehousePage.getByRole('dialog').waitFor({ state: 'detached' });
  checks.push(
    'Material pickers (estimate editor, stock receipt) find a material beyond the first 100 by server search',
  );
  await warehousePage.getByRole('button', { name: 'Kirim', exact: true }).click();
  await pickOption(warehousePage.getByRole('dialog'), 'Material', 'Sement', /Sement M500/);
  await warehousePage
    .getByRole('dialog')
    .getByLabel(/^Miqdor/)
    .fill('1000');
  await warehousePage
    .getByRole('dialog')
    .getByLabel(/Birlik tannarxi/)
    .fill('1200');
  await warehousePage.getByRole('dialog').getByLabel(/Sabab/).fill('Yetkazib beruvchidan kirim');
  await warehousePage.getByRole('dialog').getByRole('button', { name: 'Saqlash' }).click();
  await warehousePage.getByRole('status').filter({ hasText: 'Harakat saqlandi' }).first().waitFor();
  await warehousePage
    .getByRole('cell', { name: /Sement M500/ })
    .first()
    .waitFor();
  checks.push('Warehouse receipt posts stock and inventory value from the UI');
  await warehousePage.getByRole('button', { name: 'Jo‘natish', exact: true }).first().click();
  await warehousePage
    .getByRole('dialog')
    .getByLabel('Qayerga')
    .selectOption({ label: 'Sinov brigadiri' });
  await warehousePage
    .getByRole('dialog')
    .getByLabel('Material', { exact: true })
    .selectOption({ index: 1 });
  await warehousePage
    .getByRole('dialog')
    .getByLabel(/^Miqdor/)
    .fill('300');
  await warehousePage.getByRole('dialog').getByLabel(/Sabab/).fill('Brigadirga jo‘natish');
  await warehousePage.getByRole('dialog').getByRole('button', { name: 'Saqlash' }).click();
  await warehousePage.getByRole('status').filter({ hasText: 'Harakat saqlandi' }).first().waitFor();
  const brigadierPage = await newPage();
  await login(brigadierPage, 'ui.brigadier', brigadierPassword);
  await brigadierPage.locator('input[name=current_password]').fill(brigadierPassword);
  await brigadierPage.locator('input[name=new_password]').fill(password + '3');
  await brigadierPage.locator('input[name=repeat]').fill(password + '3');
  await brigadierPage.getByRole('button', { name: 'Saqlash' }).click();
  await brigadierPage.getByText('Parol yangilandi').waitFor();
  await login(brigadierPage, 'ui.brigadier', password + '3');
  await brigadierPage.locator('.sidebar').getByRole('link', { name: 'Bosh sahifa' }).waitFor();
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
  // Sarf taklifini prorab tasdiqlaydi (stock.review); admin faqat ko'radi
  await foremanPage.goto(stockUrl);
  await foremanPage.getByRole('tab', { name: /Harakatlar/ }).click();
  await foremanPage.getByRole('button', { name: 'Tasdiqlash', exact: true }).first().click();
  await foremanPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Tasdiqlash', exact: true })
    .click();
  await foremanPage.getByRole('status').filter({ hasText: 'Harakat saqlandi' }).first().waitFor();
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
  await pickOption(brigadierPage.getByRole('dialog'), 'Material', 'Sement', /Sement M500/);
  await brigadierPage.getByRole('dialog').getByLabel('Miqdor', { exact: true }).fill('100');
  await brigadierPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Tasdiqlash', exact: true })
    .click();
  await brigadierPage.getByRole('status').filter({ hasText: 'Harakat saqlandi' }).first().waitFor();
  // Talabnomani faqat ombor mudiri bajaradi (2026-10-16)
  await warehousePage.goto(stockUrl);
  await warehousePage.getByRole('tab', { name: /So‘rovlar/ }).click();
  await warehousePage.getByRole('button', { name: 'Jo‘natish bilan bajarish' }).first().click();
  await warehousePage
    .getByRole('dialog')
    .getByRole('button', { name: 'Tasdiqlash', exact: true })
    .click();
  await warehousePage.getByRole('status').filter({ hasText: 'Harakat saqlandi' }).first().waitFor();
  await warehousePage.getByRole('cell', { name: 'Bajarildi' }).first().waitFor();
  await adminPage.goto(stockUrl);
  await adminPage.getByRole('tab', { name: /So‘rovlar/ }).click();
  await adminPage.getByRole('cell', { name: 'Bajarildi' }).first().waitFor();
  assert.equal(await adminPage.getByRole('button', { name: 'Jo‘natish bilan bajarish' }).count(), 0);
  checks.push(
    'Material request from brigadier is fulfilled by the warehouse manager via a transfer created from the request; the admin only reads it',
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
  await pickOption(dialog(), /^Kontragent/, 'Qurilish', /Qurilish Savdo/);
  await pickOption(dialog(), /Bog‘lanadigan ombor kirimi/, '', /Sement M500/);
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
  await pickOption(dialog(), /^Kontragent/, 'Qurilish', /Qurilish Savdo/);
  await dialog()
    .getByLabel(/^Summa/)
    .fill('500000');
  await dialog().getByLabel('To‘lov muddati').fill('2026-10-25');
  await dialog().getByLabel('Tavsif').fill('Kran ijarasi xizmati');
  await dialog().getByRole('button', { name: 'Saqlash', exact: true }).click();
  await dialog().waitFor({ state: 'detached' });
  await adminPage.goto(webURL + '/app/finance/payment-requests');
  await adminPage.getByRole('button', { name: 'To‘lov so‘rovi' }).first().click();
  await pickOption(dialog(), /^Kontragent/, 'Qurilish', /Qurilish Savdo/);
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
  // Bosqich 2: kurs yo'q — USD o'chiq; kurs bo'lsa summalar USD'da (UZS ÷ kurs), sarlavha (USD), keyin UZS'ga qaytadi
  const docsUrl = webURL + '/app/finance/documents?project=' + projectUrl.split('/').pop();
  await adminPage.goto(docsUrl);
  const usd = adminPage.getByRole('button', { name: 'USD', exact: true });
  await usd.waitFor();
  assert.equal(await usd.isDisabled(), true, 'USD must be disabled without a rate');
  await owner.query(
    "INSERT INTO exchange_rates(currency,rate_date,rate,source) VALUES('USD','2026-10-10',12500,'CBU')",
  );
  await adminPage.reload();
  await adminPage.getByText(/1 USD = 12.500 so‘m/).waitFor();
  await usd.click();
  await adminPage.getByRole('columnheader', { name: /Summa \(USD\)/ }).waitFor();
  await adminPage.getByRole('cell', { name: /^40[.,]00( \$)?$/ }).first().waitFor();
  await adminPage.getByRole('button', { name: 'UZS', exact: true }).click();
  await adminPage.getByRole('columnheader', { name: /Summa \(UZS\)/ }).waitFor();
  checks.push(
    'Currency switch: USD disabled without a CBU rate; with a rate the documents table shows USD (500 000 ÷ 12 500 = 40) and switches back to UZS',
  );
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
  // Figma (D17): admin bosh muhandis panelini ko'radi (smeta summasi, davr xarajati), brigadir o'z panelini (xarajatsiz)
  await adminPage.goto(webURL + '/app');
  await adminPage.getByRole('heading', { name: 'Boshqaruv paneli' }).waitFor();
  await adminPage.getByText('Jami smeta summasi', { exact: true }).waitFor();
  await adminPage.getByText('Davr xarajati', { exact: true }).waitFor();
  await adminPage.getByRole('heading', { name: 'Yaqindagi vazifalar' }).waitFor();
  assert.equal(await adminPage.getByRole('heading', { name: 'So‘nggi bildirishnomalar' }).count(), 0);
  await brigadierPage.goto(webURL + '/app');
  await brigadierPage.getByRole('heading', { name: 'Brigadir paneli' }).waitFor();
  await brigadierPage.getByText('Mening vazifalarim', { exact: true }).waitFor();
  assert.equal(await brigadierPage.getByText('Davr xarajati', { exact: true }).count(), 0);
  checks.push(
    'Role dashboards follow permissions in the browser: admin sees cost blocks, brigadier does not; no notifications card on home pages',
  );
  // 1.4: grafiklar va filtrlar — davr va obyekt tanlansa server javobi bilan qayta chiziladi
  await adminPage.getByRole('heading', { name: /Xarajatlar taqsimoti/ }).waitFor();
  await adminPage.getByRole('heading', { name: /Xarajatlar tahlili/ }).waitFor();
  await adminPage.getByRole('heading', { name: 'Budjetdan oshgan obyektlar' }).waitFor();
  await adminPage.getByRole('heading', { name: /Tizimdagi faol obyektlar/ }).waitFor();
  const dashQuery = (pattern: RegExp) =>
    adminPage.waitForResponse((r) => r.url().includes('/v1/dashboard') && pattern.test(r.url()) && r.ok());
  await Promise.all([dashQuery(/months=12/), adminPage.getByLabel('Davr').selectOption('12')]);
  await Promise.all([
    dashQuery(new RegExp(`project_id=${projectId}`)),
    adminPage.getByLabel('Obyektni tanlang').selectOption(projectId),
  ]);
  await adminPage.getByText('Hozirgi holat', { exact: false }).first().waitFor();
  assert.equal(await brigadierPage.getByRole('heading', { name: /Xarajatlar taqsimoti/ }).count(), 0);
  checks.push(
    'Dashboard charts: expense kinds, plan/budget/fact by month, over-budget and overdue lists render; period and project filters refetch from the server; brigadier sees no finance charts',
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
  // Bosqich 4: narx varaqasi — versiya UI'dan yaratiladi, xonadon narxlari serverdan, USD ustuni versiya kursi bilan
  await adminPage.goto(webURL + '/app/finance/pricing?project=' + projectId);
  await adminPage.getByRole('button', { name: 'Yangi versiya' }).first().click();
  await dialog().getByLabel('Ustama, %').fill('25');
  await dialog().getByRole('button', { name: 'Yaratish', exact: true }).click();
  await dialog().waitFor({ state: 'detached' });
  await adminPage.getByText(/^v1 · .*ustama 25/).waitFor();
  await adminPage.getByRole('columnheader', { name: /^Narx \(UZS\)/ }).waitFor();
  const row12 = adminPage
    .getByRole('row')
    .filter({ has: adminPage.getByRole('cell', { name: '12', exact: true }) })
    .first();
  await row12.getByText(/so‘m$/).first().waitFor();
  await adminPage.getByRole('button', { name: 'USD', exact: true }).click();
  await adminPage.getByRole('columnheader', { name: /^Narx \(USD\)/ }).waitFor();
  await row12.getByText(/\$$/).first().waitFor();
  await adminPage.getByRole('button', { name: 'UZS', exact: true }).click();
  await adminPage.getByRole('columnheader', { name: /^Narx \(UZS\)/ }).waitFor();
  checks.push(
    'Price list: a version is created from the UI with a 25% markup, premise prices come from the server and the USD column follows the version rate',
  );
  await owner.query(
    "INSERT INTO users(login,display_name,password_hash,role) VALUES('ui_tech','Texnik xodim',$1,'super_admin')",
    [await hashPassword(password)],
  );
  const techPage = await newPage();
  await login(techPage, 'ui_tech', password);
  // D15: super_admin bosh sahifaga tushadi, o'qiydi, lekin biznes tugmalari yo'q; Audit va Texnik xodimlar sahifalari bor.
  await techPage.getByRole('heading', { name: 'Platforma boshqaruv paneli' }).waitFor();
  await techPage.goto(webURL + '/admin/plans');
  await techPage.getByRole('heading', { name: 'Tariflar' }).waitFor();
  assert.equal(await techPage.getByRole('button', { name: 'Yangi tarif versiyasi' }).count(), 0);
  await techPage.goto(webURL + '/admin/audit');
  await techPage.getByRole('heading', { name: 'Platforma auditi' }).waitFor();
  await techPage.getByText('plan.create', { exact: true }).first().waitFor();
  await techPage.goto(webURL + '/admin/staff');
  await techPage.getByRole('heading', { name: 'Texnik xodimlar' }).waitFor();
  await techPage.getByText('2FA yo‘q — Telegram ulanmagan').first().waitFor();
  await techPage.goto(webURL + '/admin/support');
  await techPage.getByRole('heading', { name: 'Murojaatlar' }).waitFor();
  await techPage.goto(webURL + '/admin/diagnostics');
  await techPage.getByText('Worker navbati', { exact: true }).waitFor();
  await techPage.getByText(/Oxirgi migratsiya: \d{3}_[a-z_]+\.sql/).waitFor();
  await adminPage.goto(webURL + '/app/billing');
  await adminPage.getByRole('button', { name: 'Yordam so‘rovi yuborish' }).click();
  await adminPage.getByRole('dialog').getByLabel('Xabar').fill('UI sinov: eksport qayerda?');
  await adminPage.getByRole('dialog').locator('.modal-footer button').last().click();
  await adminPage.getByRole('dialog').waitFor({ state: 'detached' });
  // Figma F6: murojaatlar chat ko'rinishida — ro'yxatdan tanlash, javob yuborish, yakunlash
  await techPage.goto(webURL + '/admin/support');
  await techPage.getByText('UI sinov: eksport qayerda?').first().click();
  await techPage.getByLabel('Javob').fill('UI sinov: eksport tugmasi reja–fakt sahifasida.');
  await techPage.getByRole('button', { name: 'Yuborish', exact: true }).click();
  await techPage.locator('.chat-bubble.staff').getByText('UI sinov: eksport tugmasi').waitFor();
  await techPage.getByRole('button', { name: 'Yakunlansin', exact: true }).click();
  await techPage.getByRole('button', { name: 'Yakunlanganlar', exact: true }).click();
  await techPage.getByText('UI sinov: eksport qayerda?').first().waitFor();
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
  // Dialog yopilgach karta tarifni ko'rsatadi (ochiq dialogda select ham shu matnni ko'rsatadi).
  await ownerPage.getByRole('dialog').waitFor({ state: 'detached' });
  await ownerPage.getByText('standard v1').first().waitFor();
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

  // 11-bosqich: qolgan rollar — login, menyu server ruxsati bilan bir xil, har ruxsatli sahifa xatosiz ochiladi
  const tenantRow = (
    await owner.query('SELECT id FROM tenants WHERE registration_key=$1', ['UI-TEST-001'])
  ).rows[0];
  for (const role of ['foreman', 'warehouse_manager', 'financier', 'accountant']) {
    const loginName = `ui_${role}`;
    const u = (
      await owner.query(
        'INSERT INTO users(tenant_id,login,display_name,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id',
        [tenantRow.id, loginName, `Sinov ${role}`, await hashPassword(password), role],
      )
    ).rows[0];
    await owner.query(
      'INSERT INTO project_assignments(tenant_id,project_id,user_id) VALUES($1,$2,$3)',
      [tenantRow.id, projectId, u.id],
    );
    const rolePage = await newPage();
    await login(rolePage, loginName, password);
    await rolePage.locator('.page-header').first().waitFor();
    const snap = await rolePage.request.get(webURL + '/v1/me/permissions').then((r) => r.json());
    const readable = Object.entries(snap.pages as Record<string, { read: boolean }>)
      .filter(([, v]) => v.read)
      .map(([k]) => k);
    // Figma (D17): menyu rolga xos ro'yxat, ruxsat matritsasi bilan filtrlangan
    const expectedHrefs = [
      ...new Set(
        navFor(role as Role)
          .flatMap((g) => g.items)
          .filter((it) => readable.includes(it.page))
          .map((it) => navHref(it)),
      ),
    ].sort();
    const hrefs = await rolePage
      .locator('.sidebar nav a.nav-link')
      .evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    assert.deepEqual([...new Set(hrefs)].sort(), expectedHrefs, `${role} sidebar vs permissions`);
    for (const href of expectedHrefs) {
      // Ombor bo'limlari so'rov parametri bilan (?tab=…): obyekt parametri & bilan qo'shiladi
      await rolePage.goto(
        webURL + href + (href.startsWith('/app/') ? `${href.includes('?') ? '&' : '?'}project=${projectId}` : ''),
      );
      await rolePage.locator('.page-header').first().waitFor();
      await delay(150);
    }
    assert.deepEqual(errors, [], `${role} pages raised errors`);
    // Xotira: har rol konteksti yopiladi (scrypt + ko'p sahifa birga xotirani tugatadi).
    await rolePage.context().close();
  }
  await owner.query(
    "INSERT INTO users(login,display_name,password_hash,role) VALUES('ui_support','Yordam xodimi',$1,'support')",
    [await hashPassword(password)],
  );
  const supportPage = await newPage();
  await login(supportPage, 'ui_support', password);
  // D15: support faqat o'qiydi — Mijozlar ro'yxatiga tushadi; bosh sahifa, tariflar, to'lovlar, qarzdorlar, murojaatlar, diagnostika ochiq (7 havola).
  await supportPage.getByRole('heading', { name: 'Mijoz kompaniyalar' }).waitFor();
  await supportPage.goto(webURL + '/admin/diagnostics');
  await supportPage.getByText('Worker navbati', { exact: true }).waitFor();
  assert.equal(await supportPage.locator('.sidebar nav a.nav-link').count(), 7);
  // Mijoz kartasi o'qiladi, lekin biznes tugmalari yo'q
  await supportPage.goto(webURL + '/admin/tenants');
  await supportPage.getByRole('heading', { name: 'Mijoz kompaniyalar' }).waitFor();
  assert.equal(await supportPage.getByRole('button', { name: 'Yangi kompaniya' }).count(), 0);
  checks.push(
    'Foreman, warehouse manager, financier, accountant and support log in; the sidebar equals server permissions and every allowed page renders without errors',
  );

  // 7a. 100 tadan ortiq obyekt: ProjectSelect barcha sahifalarni (apiAll) yuklaydi
  for (let i = 1; i <= 101; i++) {
    const r = await adminPage.request.post(webURL + '/v1/projects', {
      data: { name: 'Obyekt ' + String(i).padStart(3, '0') },
      headers: { 'Idempotency-Key': randomUUID(), Origin: webURL },
    });
    assert.equal(r.status(), 200, await r.text());
  }
  await adminPage.goto(webURL + '/app/tasks');
  const projectSelect = adminPage.locator('select[aria-label="Obyektni tanlang"]');
  await projectSelect.waitFor();
  await adminPage.waitForFunction(
    () => document.querySelectorAll('select[aria-label="Obyektni tanlang"] option').length === 102,
  );
  // Asl obyekt + 101 ta; bo'sh ro'yxat uchun placeholder option faqat ro'yxat bo'sh bo'lganda chiqadi
  assert.equal(await projectSelect.locator('option').count(), 102);
  assert.equal(await projectSelect.locator('option', { hasText: 'Obyekt 101' }).count(), 1);
  checks.push('Project select loads every page of a 100+ project list (apiAll)');

  // 7b. 404 holatlari: begona/yo'q yozuv va noma'lum manzil AppShell ichidagi 404 sahifasini ko'rsatadi
  await managerPage.goto(webURL + '/app/projects/' + randomUUID());
  await managerPage.getByRole('heading', { name: 'Yozuv topilmadi' }).waitFor();
  await managerPage.getByRole('button', { name: 'Ro‘yxatga qaytish' }).click();
  await managerPage.getByRole('heading', { name: 'Obyektlar' }).first().waitFor();
  await managerPage.goto(webURL + '/app/bunday-sahifa-yoq');
  await managerPage.getByRole('heading', { name: 'Sahifa topilmadi' }).waitFor();
  await managerPage.getByRole('button', { name: 'Bosh sahifaga' }).click();
  await managerPage.waitForURL(/\/app$/);
  checks.push(
    'Unknown record id and unknown route render the in-app 404 page with SPA navigation back',
  );

  // 7c. Yo'q, biriktirilmagan va begona kompaniya obyekti bir xil 404 ko'rinishini beradi
  const projectB = await adminPage.request.post(webURL + '/v1/projects', {
    data: { name: 'Obyekt B maxfiy' },
    headers: { 'Idempotency-Key': randomUUID(), Origin: webURL },
  });
  assert.equal(projectB.status(), 200, await projectB.text());
  const projectBId = (await projectB.json()).id as string;
  const managerAssignments = await owner.query(
    'SELECT count(*)::int n FROM project_assignments a JOIN users u ON u.id=a.user_id WHERE u.login=$1',
    ['ui.manager'],
  );
  assert.equal(managerAssignments.rows[0].n, 0);
  const foreignTenant = (
    await owner.query(
      "INSERT INTO tenants(legal_name,registration_key) VALUES('Begona kompaniya','FOREIGN-1') RETURNING id",
    )
  ).rows[0];
  const foreignProject = (
    await owner.query(
      "INSERT INTO projects(tenant_id,name) VALUES($1,'Begona obyekt') RETURNING id",
      [foreignTenant.id],
    )
  ).rows[0];
  const notFoundViews = [];
  for (const id of [randomUUID(), projectBId, foreignProject.id as string]) {
    await managerPage.goto(webURL + '/app/projects/' + id);
    await managerPage.getByRole('heading', { name: 'Yozuv topilmadi' }).waitFor();
    const card = managerPage.locator('.state');
    notFoundViews.push({
      heading: await card.locator('h3').innerText(),
      description: await card.locator('p').innerText(),
      buttons: await card.getByRole('button').allInnerTexts(),
      icon: await card.locator('svg').first().getAttribute('class'),
    });
  }
  assert.deepEqual(notFoundViews[1], notFoundViews[0]);
  assert.deepEqual(notFoundViews[2], notFoundViews[0]);
  checks.push(
    'Missing, unassigned and foreign-tenant project ids render the identical not-found view (existence is not revealed)',
  );

  // 7d. Tafsilot so'rovi xatolari: 5xx va tarmoq uzilishi qayta urinish bilan, 403 va 404 alohida
  const mockCtx = await browser!.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'uz-UZ',
  });
  const mockPage = await mockCtx.newPage();
  // Soxta 4xx/5xx javoblar ataylab: faqat pageerror va console xatolari yig'iladi
  mockPage.on('pageerror', (e) => errors.push(e.message));
  mockPage.on(
    'console',
    (m) =>
      m.type() === 'error' &&
      !/Failed to load resource/.test(m.text()) &&
      errors.push('console: ' + m.text()),
  );
  await login(mockPage, 'ui.admin', password);
  await mockPage.getByText('UI sinov qurilish').first().waitFor();
  const detailPath = `**/v1/projects/${projectId}`;
  const detailUrl = webURL + '/app/projects/' + projectId;
  const retry = mockPage.getByRole('button', { name: 'Qayta urinish' });
  let calls = 0;
  await mockPage.route(detailPath, (r) => {
    calls++;
    void r.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'INTERNAL_ERROR' }, request_id: 'ui' }),
    });
  });
  await mockPage.goto(detailUrl);
  await retry.waitFor({ timeout: 30000 });
  // Avtomatik qayta urinishlar tugaganini kutamiz, so'ng faqat tugma bosilishi so'rov yuborishini tekshiramiz
  await delay(1500);
  const before = calls;
  await delay(500);
  assert.equal(calls, before, 'no automatic retries may still be in flight');
  await retry.click();
  await delay(1000);
  assert.ok(calls > before, 'retry must re-request the detail');
  await mockPage.unroute(detailPath);
  // TanStack Query 5xx'ni o'zi qayta urinadi: tugma yo'qolgan bo'lishi mumkin, u holda sahifa o'zi tiklanadi.
  const projectHeading = mockPage.getByRole('heading', { name: /Navoiy 28 turar-joy/ });
  await retry.or(projectHeading).first().waitFor();
  if (await retry.isVisible()) await retry.click();
  await projectHeading.waitFor();
  let aborts = 0;
  await mockPage.route(detailPath, (r) => {
    aborts++;
    void r.abort('failed');
  });
  await mockPage.goto(detailUrl);
  await retry.waitFor({ timeout: 30000 });
  assert.equal(await mockPage.getByRole('heading', { name: 'Yozuv topilmadi' }).count(), 0);
  await delay(1500);
  const abortsBefore = aborts;
  await retry.click();
  await delay(1000);
  assert.ok(aborts > abortsBefore, 'retry must re-request the detail after a network failure');
  await mockPage.unroute(detailPath);
  await mockPage.route(detailPath, (r) => {
    void r.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'FORBIDDEN' }, request_id: 'ui' }),
    });
  });
  await mockPage.goto(detailUrl);
  await mockPage.getByRole('heading', { name: 'Bu sahifaga ruxsat yo‘q' }).waitFor();
  await mockPage.unroute(detailPath);
  checks.push(
    'Detail page distinguishes server error and network failure (retry re-requests) from 403 and 404',
  );
  // ERR-07: UUID bo'lmagan id serverda 400 (shu kontekstda 4xx tinglovchisi yo'q), ko'rinishi 404
  for (const path of ['/app/projects/abc', '/app/estimates/abc', '/app/estimates/abc/edit']) {
    await mockPage.goto(webURL + path);
    await mockPage.getByRole('heading', { name: 'Yozuv topilmadi' }).waitFor();
    assert.equal(await retry.count(), 0, `${path} must not offer a retry`);
  }
  await mockCtx.close();
  checks.push('Malformed (non-UUID) detail ids render the not-found view without a retry button');

  // 8. Chiqish cookie'ni tozalaydi
  await managerPage.getByRole('button', { name: /Sinov menejeri/ }).click();
  await managerPage.getByRole('button', { name: 'Chiqish' }).click();
  await managerPage.getByRole('heading', { name: 'Hisobingizga kiring' }).waitFor();
  await managerPage.goto(webURL + '/app');
  await managerPage.getByRole('heading', { name: 'Hisobingizga kiring' }).waitFor();
  await managerPage.goto(webURL + '/app/bunday-sahifa-yoq');
  await managerPage.getByRole('heading', { name: 'Hisobingizga kiring' }).waitFor();
  checks.push('Logout clears the session cookie and protected routes redirect to login');
  assert.deepEqual(errors, []);
  checks.push('No uncaught React/browser errors');
  await mkdir('../docs/backend', { recursive: true });
  await ownerPage.screenshot({ path: '../docs/backend/platform-tenant-ui.png' });
  const result = { executed_at: new Date().toISOString(), browser: 'Headless Chrome', checks };
  await writeFile('../docs/backend/ui-verification.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error('ERRORS', JSON.stringify(errorsRef.list));
  // Diagnostika: 5xx xatolar matni error_events jadvalida (integration.ts bilan bir xil).
  if (owner)
    try {
      console.error(
        'ERROR_EVENTS',
        (await owner.query('SELECT code,message,path FROM error_events ORDER BY created_at DESC LIMIT 5')).rows,
      );
    } catch {}
  let n = 0;
  for (const p of pages) {
    try {
      await p.screenshot({ path: '../docs/backend/ui-failure-' + n++ + '.png' });
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
