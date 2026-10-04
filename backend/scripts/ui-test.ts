import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPool } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/security.js';
import { chromium, type Browser } from 'playwright';

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
  const tenant = (
    await owner.query(
      "INSERT INTO tenants(legal_name,registration_key,status,trial_started_at,trial_ends_at) VALUES('UI test tenant','UI-TEST','active',now(),now()+interval '14 days') RETURNING id",
    )
  ).rows[0];
  const password = 'UITestPasswordOnly!123',
    hashed = await hashPassword(password);
  await owner.query(
    "INSERT INTO users(tenant_id,login,display_name,password_hash,role) VALUES($1,'ui_admin','Sinov admini',$2,'tenant_admin'),($1,'ui_manager','Sinov menejeri',$2,'manager')",
    [tenant.id, hashed],
  );
  ({ app } = await buildApp(pool));
  const apiURL = await app.listen({ host: '127.0.0.1', port: 0 });
  const { createServer } = await import('../../node_modules/vite/dist/node/index.js');
  vite = await createServer({
    root: resolve('..'),
    configFile: false,
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/backend') },
    server: {
      host: '127.0.0.1',
      port: 0,
      proxy: {
        '/backend': { target: apiURL, rewrite: (path: string) => path.replace(/^\/backend/, '') },
      },
    },
  });
  await vite.listen();
  const webURL = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
    headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(webURL + '/#/screen/38');
  await page.getByLabel('Login', { exact: true }).fill('ui_admin');
  await page.getByLabel('Parol', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Kirish', exact: true }).click();
  await page.getByRole('heading', { name: 'Rollar va sahifa ruxsatlari' }).waitFor();
  await page.getByLabel('Rol', { exact: true }).selectOption('manager');
  const projectRead = page.getByRole('checkbox', {
    name: 'Menejer: Obyektlar — Ko‘rish',
    exact: true,
  });
  await projectRead.waitFor();
  assert.equal(await projectRead.isChecked(), true);
  await projectRead.uncheck();
  await page.getByRole('checkbox', { name: 'Menejer: Budjetlar — Ko‘rish', exact: true }).check();
  await page.getByRole('button', { name: 'O‘zgarishlarni saqlash', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Ruxsatlar saqlandi.' }).waitFor();
  await mkdir('docs', { recursive: true });
  await page.screenshot({ path: 'docs/permissions-ui.png', fullPage: false });
  const managerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const manager = await managerContext.newPage();
  manager.on('pageerror', (e) => errors.push(e.message));
  await manager.goto(webURL + '/#/screen/13');
  await manager.getByLabel('Login', { exact: true }).fill('ui_manager');
  await manager.getByLabel('Parol', { exact: true }).fill(password);
  await manager.getByRole('button', { name: 'Kirish', exact: true }).click();
  await manager.locator('.backend-status').waitFor();
  assert.equal(await manager.getByRole('link', { name: 'Obyektlar', exact: true }).count(), 0);
  await manager.evaluate(() => {
    location.hash = '/screen/26';
  });
  await manager.getByRole('heading', { name: 'Bu sahifaga ruxsat yo‘q' }).waitFor();
  await manager.getByRole('link', { name: 'Budjetlar', exact: true }).click();
  await manager.getByRole('heading', { name: 'Budjetlar boshqaruvi' }).waitFor();
  assert.equal(
    await manager.getByRole('button', { name: '+ Budjet qo‘shish', exact: true }).isDisabled(),
    true,
  );
  await page.getByRole('checkbox', { name: 'Menejer: Budjetlar — Yaratish', exact: true }).check();
  await projectRead.check();
  await page.getByRole('button', { name: 'O‘zgarishlarni saqlash', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Ruxsatlar saqlandi.' }).waitFor();
  await manager.evaluate(() => window.dispatchEvent(new Event('focus')));
  await manager.getByRole('link', { name: 'Obyektlar', exact: true }).waitFor();
  assert.equal(
    await manager.getByRole('button', { name: '+ Budjet qo‘shish', exact: true }).isEnabled(),
    true,
  );
  await manager.evaluate(() => {
    location.hash = '/screen/23';
  });
  await manager.getByRole('heading', { name: 'Bu sahifaga ruxsat yo‘q' }).waitFor();
  assert.deepEqual(errors, []);
  const result = {
    executed_at: new Date().toISOString(),
    browser: 'Headless Chrome',
    checks: [
      'Real login through browser',
      'Admin saves role-specific page permissions',
      'Disabled read removes navigation link',
      'Direct disabled URL is denied',
      'Existing session updates permissions on focus',
      'Read-only role cannot open create form',
      'No uncaught React/browser errors',
      'Delegated pages appear outside the original role menu',
      'Create button follows separate live CRUD permission',
    ],
  };
  await writeFile('docs/ui-verification.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
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
