# BARPO AI — Ruxsatlar

Tasdiqlangan: 10 rol; bitta xodim bitta kompaniya va bitta rol. Yangi foydalanuvchi talabi: mijoz admini har bir rol va sahifa uchun create/read/update/delete huquqlarini alohida belgilaydi. Bazaviy rol jadvali quyida muhandislik defaultidir, biznes tomonidan majburiy tasdiqlangan matritsa emas.

Mijoz admini ruxsatlarni boshqarish (permissions) sahifasini o‘zida saqlaydi: bu rollarni boshqarishni delegatsiya orqali egallab olish va adminni bloklab qo‘yishdan himoya qiladi. Platforma rollarini tenant admin boshqarmaydi.

## Baholash tartibi

1. Sessiya, active user, kompaniya holati va obuna.
2. Tenant RLS, project/warehouse/own custody scope.
3. Individual deny ustun. Rolning read=false holati sahifani yopadi.
4. Individual grant, keyin rol–sahifa–CRUD override, keyin bazaviy rol.
5. Domain transition va alohida review qoidalari. CREATE huquqi boshqa xodim sarfini o‘z-o‘zidan qabul qilishga ruxsat emas.

POST /v1/company/role-permissions optimistic version + idempotency bilan saqlaydi. GET /v1/me/permissions frontend menyusi va amallari manbasi. Backend har so‘rovda qayta o‘qiydi; frontend 15 soniyada yoki focusda yangilanadi. UI yashirish xavfsizlik o‘rnini bosmaydi.

## Rol × domain amal

| Permission | Sahifa / CRUD | super_admin | platform_owner | support | tenant_admin | foreman | brigadier | warehouse_manager | financier | accountant | manager |
|---|---|---|---|---|---|---|---|---|---|---|---|
| projects.read | projects / read | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| projects.write | projects / create | — | — | — | ✓ | — | — | — | — | — | — |
| employees.manage | employees / update | — | — | — | ✓ | — | — | — | — | — | — |
| estimates.read | estimates / read | — | — | — | ✓ | ✓ | — | — | ✓ | ✓ | — |
| estimates.import | estimates / create | — | — | — | ✓ | — | — | — | ✓ | — | — |
| estimates.edit | estimates / update | — | — | — | ✓ | — | — | — | — | — | — |
| prices.read | finance / read | — | — | — | ✓ | — | — | — | ✓ | ✓ | — |
| stock.read | stock / read | — | — | — | ✓ | ✓ | ✓ | ✓ | — | — | — |
| stock.receive | stock / create | — | — | — | ✓ | — | — | ✓ | — | — | — |
| stock.send | stock / create | — | — | — | ✓ | — | — | ✓ | — | — | — |
| stock.accept | stock / update | — | — | — | ✓ | — | ✓ | — | — | — | — |
| stock.consume | stock / create | — | — | — | ✓ | — | ✓ | — | — | — | — |
| stock.review | stock / update | — | — | — | ✓ | ✓ | — | — | — | — | — |
| stock.reverse | stock / delete | — | — | — | ✓ | — | — | — | — | — | — |
| finance.read | finance / read | — | — | — | ✓ | — | — | — | ✓ | ✓ | — |
| finance.allocate | finance / create | — | — | — | ✓ | — | — | — | ✓ | — | — |
| finance.post | finance / create | — | — | — | ✓ | — | — | — | — | ✓ | — |
| finance.reverse | finance / delete | — | — | — | ✓ | — | — | — | — | ✓ | — |
| tasks.read | tasks / read | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| tasks.manage | tasks / update | — | — | — | ✓ | ✓ | — | — | — | — | ✓ |
| reports.read | reports / read | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| reports.submit | reports / create | — | — | — | ✓ | ✓ | ✓ | — | — | — | — |
| reports.review | reports / update | — | — | — | ✓ | ✓ | — | — | — | — | — |
| files.read | files / read | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| files.write | files / create | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| integrations.read | integrations / read | — | — | — | ✓ | — | — | — | — | — | — |
| audit.read | audit / read | — | — | — | ✓ | — | — | — | — | — | — |

## Sahifalar

- `dashboard`: create, read, update, delete
- `projects`: create, read, update, delete
- `employees`: create, read, update, delete
- `estimates`: create, read, update, delete
- `stock`: create, read, update, delete
- `finance`: create, read, update, delete
- `tasks`: create, read, update, delete
- `reports`: create, read, update, delete
- `files`: create, read, update, delete
- `integrations`: create, read, update, delete
- `camera`: create, read, update, delete
- `billing`: create, read, update, delete
- `settings`: create, read, update, delete
- `permissions`: create, read, update, delete
- `audit`: create, read, update, delete
- `accounting_documents`: create, read, update, delete
- `invoices`: create, read, update, delete
- `bank_cash`: create, read, update, delete
- `counterparties`: create, read, update, delete
- `payroll`: create, read, update, delete
- `reconciliation`: create, read, update, delete
- `financial_reports`: create, read, update, delete
- `allocations`: create, read, update, delete
- `budgets`: create, read, update, delete
- `plan_actual`: create, read, update, delete
- `forecast`: create, read, update, delete
- `payment_requests`: create, read, update, delete
- `payment_calendar`: create, read, update, delete

Forma va tafsilotlar o‘z biznes sahifasining huquqini oladi: masalan smeta yaratish va tahrirlash sahifalari estimates.create va estimates.update bilan alohida filtrlanadi. Moliya dizayn ekranlari alohida bank_cash, invoices, payroll, budgets va boshqa sahifa keylariga moslangan; profil self-service hisoblanadi.

## Platforma chegaralari

Platform owner: kompaniya/invite/alias/tarif/invoys/manual payment/support. Super admin: texnik diagnostika va texnik staff. Support: support so‘rovlari. Hech biri tenant APIga avtomatik kira olmaydi; break-glass o‘chirilgan. Super admin PostgreSQL SUPERUSER emas.

## Sezgir maydonlar

prices.read bo‘lmasa unit_price, unit_cost, total, value, value_delta, amount chiqarilmaydi. Finance read alohida huquq. Hash/token/secret hech qachon oddiy employee DTOda yo‘q. RLS faqat tenant chegarasi; project/custodian filtri handlerlarda. Eksport, worker, fayl va jami ham shu chegarani saqlashi kerak.
