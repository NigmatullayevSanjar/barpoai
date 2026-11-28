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

| Permission | Sahifa / CRUD | super_admin | platform_owner | support | tenant_admin | foreman | warehouse_manager | financier | accountant | manager | pto_engineer |
|---|---|---|---|---|---|---|---|---|---|---|---|
| projects.read | projects / read | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| projects.write | projects / create | — | — | — | ✓ | — | — | — | — | ✓ | — |
| employees.read | employees / read | — | — | — | ✓ | — | — | — | — | ✓ | — |
| employees.manage | employees / update | — | — | — | ✓ | — | — | — | — | — | — |
| estimates.read | estimates / read | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| estimates.import | estimates / create | — | — | — | ✓ | — | — | ✓ | — | ✓ | ✓ |
| estimates.edit | estimates / update | — | — | — | ✓ | — | — | — | — | ✓ | ✓ |
| prices.read | finance / read | — | — | — | ✓ | — | — | ✓ | ✓ | ✓ | ✓ |
| stock.read | stock / read | — | — | — | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| stock.receive | stock / create | — | — | — | — | — | ✓ | — | — | — | — |
| stock.send | stock / create | — | — | — | — | — | ✓ | — | — | — | — |
| stock.accept | stock / update | — | — | — | — | ✓ | — | — | — | — | — |
| stock.consume | stock / create | — | — | — | — | ✓ | — | — | — | — | — |
| stock.review | stock / update | — | — | — | — | — | — | — | — | — | — |
| stock.reverse | stock / delete | — | — | — | — | — | ✓ | — | — | — | — |
| finance.read | finance / read | — | — | — | ✓ | — | — | ✓ | ✓ | — | — |
| finance.allocate | finance / create | — | — | — | ✓ | — | — | ✓ | ✓ | — | — |
| finance.post | finance / create | — | — | — | ✓ | — | — | — | ✓ | — | — |
| finance.reverse | finance / delete | — | — | — | ✓ | — | — | — | ✓ | — | — |
| tasks.read | tasks / read | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| tasks.manage | tasks / update | — | — | — | ✓ | ✓ | — | — | — | ✓ | — |
| reports.read | reports / read | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| reports.submit | reports / create | — | — | — | ✓ | ✓ | — | — | — | ✓ | ✓ |
| reports.review | reports / update | — | — | — | ✓ | — | — | — | — | ✓ | ✓ |
| files.read | files / read | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| files.write | files / create | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| integrations.read | integrations / read | — | — | — | ✓ | — | — | — | — | — | — |
| audit.read | audit / read | — | — | — | ✓ | — | — | — | — | — | — |
| pricing.read | pricing / read | — | — | — | ✓ | — | — | ✓ | — | — | — |
| pricing.write | pricing / create | — | — | — | ✓ | — | — | ✓ | — | — | — |

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
- `pricing`: create, read, update, delete

Forma va tafsilotlar o‘z biznes sahifasining huquqini oladi: masalan smeta yaratish va tahrirlash sahifalari estimates.create va estimates.update bilan alohida filtrlanadi. Moliya dizayn ekranlari alohida bank_cash, invoices, payroll, budgets va boshqa sahifa keylariga moslangan; profil self-service hisoblanadi.

## Platforma chegaralari (D21, 2026-10-22)

Ko‘rish (kompaniyalar, tariflar, daromad, qarzdorlar, murojaatlar) barcha platforma xodimlariga ochiq. Amallar quyidagi ruxsatlar bilan; platforma egasida hammasi doim bor, super admin va support uchun standart qiymatlar jadvalda, egasi yoki `permissions.manage` ruxsati bor xodim ularni “Platforma ruxsatlari” sahifasida o‘zgartiradi (super admin qatorini faqat egasi yoki super admin). Egasiga tegishli cheklovlar qat’iy: egasini hech kim bloklamaydi va rolini o‘zgartirmaydi; egasining parolini faqat super admin tiklaydi (havola unga ko‘rsatiladi); o‘zini hech kim tiklamaydi. Super admin uchun Telegram 2FA majburiy: bot sozlangan, Telegram ulanmagan bo‘lsa faqat profil va Telegramni ulash ochiq (TWO_FACTOR_SETUP_REQUIRED). Kompaniya tuzatishlari (`tenants.correct`) kompaniya sahifalariga kirishsiz, tayyor amallar bilan: storno, ish hajmini tuzatish, xodimni faolsizlantirish, sessiya va Telegramni uzish, adminlikni o‘tkazish; hujjat kompaniya admini nomidan (created_by), audit platforma xodimiga yoziladi (`platform_correction`). Break-glass o‘chirilgan; super admin PostgreSQL SUPERUSER emas.

| Platforma ruxsati | platform_owner | super_admin | support |
|---|---|---|---|
| tenants.manage | ✓ | ✓ | — |
| tenants.block | ✓ | ✓ | — |
| plans.manage | ✓ | ✓ | — |
| billing.manage | ✓ | ✓ | — |
| users.reset | ✓ | ✓ | ✓ |
| tenants.correct | ✓ | ✓ | — |
| audit.read | ✓ | ✓ | — |
| support.reply | ✓ | ✓ | ✓ |
| diagnostics.read | ✓ | ✓ | ✓ |
| staff.manage | ✓ | ✓ | — |
| permissions.manage | ✓ | ✓ | — |

## Sezgir maydonlar

prices.read bo‘lmasa unit_price, unit_cost, total, value, value_delta, amount chiqarilmaydi. Finance read alohida huquq. Hash/token/secret hech qachon oddiy employee DTOda yo‘q. RLS faqat tenant chegarasi; project/custodian filtri handlerlarda. Eksport, worker, fayl va jami ham shu chegarani saqlashi kerak.
