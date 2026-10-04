import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import YAML from 'yaml';
import { createPool } from '../src/db.js';
import { buildApp } from '../src/app.js';
import { openapi } from '../src/http.js';
import { basePermissions, permissionPage, pages, actions, roles } from '../src/permissions.js';
await mkdir('docs', { recursive: true });
const pool = createPool('postgresql://unused:unused@127.0.0.1:1/unused');
const { app, definitions } = await buildApp(pool);
const spec = openapi(definitions);
await writeFile('docs/BARPO_API_OPENAPI.yaml', YAML.stringify(spec, { lineWidth: 120 }));
const migrations = (await readdir('migrations')).filter((n) => n.endsWith('.sql')).sort();
let schema =
  '# BARPO AI — Database spetsifikatsiyasi\n\nHolat: ushbu DDL migratsiyalari haqiqiy PostgreSQL 17 da tekshiriladi. `verification.json` oxirgi natijani saqlaydi.\n\n## Umumiy qoidalar\n\nUUID PK — gen_random_uuid(); pul numeric(20,2); miqdor numeric(24,6); UTC timestamptz; biznes sanasi date. JSON decimal — string. FK lar ON DELETE/UPDATE NO ACTION (RESTRICT semantikasi, statement oxirida). Arxivlash alohida ustun/status; ledgerlar o‘chirilmaydi. Pastdagi bajariladigan DDL har ustun type, nullability, default, PK/FK/UNIQUE/CHECK, indeks, trigger va RLS siyosatining normativ manbasidir. `NOT NULL` yozilmagan ustun nullable; PRIMARY KEY esa implicit NOT NULL. Foreign key indeksi avtomatik yaratilmaydi; asosiy scope/join indekslari DDLda ko‘rsatilgan.\n\nAuth/platform jadvallari umumiy: tenant_id ilova tomonidan parametr bilan cheklanadi. Operatsion jadvallarda FORCE RLS bor. Runtime barpo_app — NOSUPERUSER, NOBYPASSRLS, DDL vakolatisiz. Migratsiya credentiali APIga berilmaydi.\n\n## Domenlar va jadvallar vazifasi\n\n';
const domains = {
  'Identity va billing': [
    'tenants',
    'users',
    'sessions',
    'invites',
    'password_resets',
    'tenant_aliases',
    'plan_versions',
    'subscriptions',
    'billing_invoices',
    'billing_entries',
    'support_requests',
    'telegram_link_tokens',
    'telegram_accounts',
    'telegram_bot_state',
  ],
  'Resurs va ruxsat': [
    'projects',
    'project_assignments',
    'zones',
    'permission_overrides',
    'role_page_permissions',
    'permission_versions',
    'warehouses',
    'warehouse_assignments',
  ],
  'Katalog va smeta': [
    'units',
    'unit_conversions',
    'catalog_categories',
    'catalog_materials',
    'materials',
    'estimates',
    'estimate_revisions',
    'estimate_lines',
    'estimate_months',
    'import_previews',
  ],
  Ombor: ['stock_accounts', 'stock_balances', 'stock_commands', 'stock_ledger'],
  Moliya: ['counterparties', 'cash_accounts', 'finance_documents', 'journal_entries', 'budgets'],
  'Ish va transport': [
    'tasks',
    'reports',
    'progress_entries',
    'files',
    'integration_connections',
    'integration_mappings',
    'integration_inbox',
    'outbox',
    'notifications',
    'idempotency_keys',
    'audit_events',
  ],
};
for (const [domain, tables] of Object.entries(domains))
  schema += `### ${domain}\n\n${tables.map((t) => '- `' + t + '`').join('\n')}\n\n`;
for (const file of migrations)
  schema += `## ${file}\n\n\`\`\`sql\n${await readFile(`migrations/${file}`, 'utf8')}\n\`\`\`\n\n`;
schema +=
  '## Jadvallararo invariantlar\n\nTenant + resurs composite FK boshqa kompaniya havolasini rad etadi. Ombor/project, zona/project, smeta/project, journal/source/project va file/report/project bog‘lanishlari composite FK bilan yopilgan. Source material ledgerga mosligi FK bilan tekshiriladi. Stock projection va immutable ledger summasi deferred constraint trigger bilan tenglashtiriladi. Oylik smeta miqdori deferred trigger bilan tekshiriladi. Journal har source uchun commit vaqtida nolga teng bo‘lishi shart.\n\nRol/proyekt assignment va qoldiq yetarliligi domain transactionda tekshiriladi. User yaratishdagi unique login global: bitta odamni bir nechta kompaniyada yangi login bilan yaratishga texnik jihatdan to‘sqinlik qilish uchun tashqi verified identity talab etiladi; membership jadvali yo‘q.\n';
await writeFile('docs/BARPO_DATABASE_SPEC.md', schema);
let matrix =
  '# BARPO AI — Ruxsatlar\n\nTasdiqlangan: 10 rol; bitta xodim bitta kompaniya va bitta rol. Yangi foydalanuvchi talabi: mijoz admini har bir rol va sahifa uchun create/read/update/delete huquqlarini alohida belgilaydi. Bazaviy rol jadvali quyida muhandislik defaultidir, biznes tomonidan majburiy tasdiqlangan matritsa emas.\n\nMijoz admini ruxsatlarni boshqarish (permissions) sahifasini o‘zida saqlaydi: bu rollarni boshqarishni delegatsiya orqali egallab olish va adminni bloklab qo‘yishdan himoya qiladi. Platforma rollarini tenant admin boshqarmaydi.\n\n## Baholash tartibi\n\n1. Sessiya, active user, kompaniya holati va obuna.\n2. Tenant RLS, project/warehouse/own custody scope.\n3. Individual deny ustun. Rolning read=false holati sahifani yopadi.\n4. Individual grant, keyin rol–sahifa–CRUD override, keyin bazaviy rol.\n5. Domain transition va alohida review qoidalari. CREATE huquqi boshqa xodim sarfini o‘z-o‘zidan qabul qilishga ruxsat emas.\n\nPOST /v1/company/role-permissions optimistic version + idempotency bilan saqlaydi. GET /v1/me/permissions frontend menyusi va amallari manbasi. Backend har so‘rovda qayta o‘qiydi; frontend 15 soniyada yoki focusda yangilanadi. UI yashirish xavfsizlik o‘rnini bosmaydi.\n\n## Rol × domain amal\n\n| Permission | Sahifa / CRUD | ' +
  roles.join(' | ') +
  ' |\n|---|---|' +
  roles.map(() => '---').join('|') +
  '|\n';
for (const [permission, [page, action]] of Object.entries(permissionPage))
  matrix += `| ${permission} | ${page} / ${action} | ${roles.map((role) => (basePermissions[role]!.includes(permission as any) ? '✓' : '—')).join(' | ')} |\n`;
matrix +=
  '\n## Sahifalar\n\n' +
  pages.map((p) => '- `' + p + '`: ' + actions.join(', ')).join('\n') +
  '\n\nForma va tafsilotlar o‘z biznes sahifasining huquqini oladi: masalan smeta yaratish va tahrirlash sahifalari estimates.create va estimates.update bilan alohida filtrlanadi. Moliya dizayn ekranlari alohida bank_cash, invoices, payroll, budgets va boshqa sahifa keylariga moslangan; profil self-service hisoblanadi.\n\n## Platforma chegaralari\n\nPlatform owner: kompaniya/invite/alias/tarif/invoys/manual payment/support. Super admin: texnik diagnostika va texnik staff. Support: support so‘rovlari. Hech biri tenant APIga avtomatik kira olmaydi; break-glass o‘chirilgan. Super admin PostgreSQL SUPERUSER emas.\n\n## Sezgir maydonlar\n\nprices.read bo‘lmasa unit_price, unit_cost, total, value, value_delta, amount chiqarilmaydi. Finance read alohida huquq. Hash/token/secret hech qachon oddiy employee DTOda yo‘q. RLS faqat tenant chegarasi; project/custodian filtri handlerlarda. Eksport, worker, fayl va jami ham shu chegarani saqlashi kerak.\n';
await writeFile('docs/BARPO_PERMISSIONS.md', matrix);
await app.close();
await pool.end();
console.log(
  `${definitions.length} endpoint: OpenAPI, database DDL va ruxsatlar hujjati yangilandi.`,
);
