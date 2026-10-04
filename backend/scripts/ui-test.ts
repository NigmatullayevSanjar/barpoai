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
