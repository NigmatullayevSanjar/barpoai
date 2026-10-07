# API bilan tez boshlash

HTTP bazasi: `/v1`. Auth: brauzerda httpOnly cookie `barpo_session` (login javobida qo‘yiladi, `credentials: include` bilan yuboriladi, o‘zgartiruvchi so‘rovlarda Origin tekshiriladi) yoki `Authorization: Bearer <access_token>`. Operatsion commandlar `Idempotency-Key` talab qiladi (8–128 belgi, odatda UUID). Qayta yuborishda ayni key va ayni payload. Bir keyni yangi ma’lumotga ishlatmang. DTOlar qat’iy: noma’lum field 400. Pul va quantity JSON string: `"100.50"`, `"25.000000"`.

## Asosiy DTO namunalari

Login input: `{ "login":"owner", "password":"..." }` — `login` foydalanuvchi nomi yoki telefon (`+998 90 123 45 67`, `901234567`).
Login output: `{ "access_token":"...", "token_type":"Bearer", "expires_in":43200, "user":{"id":"uuid","tenant_id":"uuid yoki null","role":"tenant_admin","display_name":"...","must_change_password":false} }`.

Error: `{ "error":{"code":"PAGE_ACTION_FORBIDDEN"}, "request_id":"req-..." }`. Validation error `fields:[{path:["amount"],message:"..."}]` oladi. Xato kodlari: UNAUTHORIZED/INVALID_CREDENTIALS (401), SUBSCRIPTION_REQUIRED (402), FORBIDDEN/PAGE_ACTION_FORBIDDEN/TENANT_BLOCKED/PASSWORD_CHANGE_REQUIRED (403), NOT_FOUND (404), VERSION_CONFLICT/IDEMPOTENCY_CONFLICT/INVARIANT_VIOLATION/INSUFFICIENT_AVAILABLE_STOCK (409), INVITE_UNAVAILABLE/PREVIEW_EXPIRED (410), RATE_LIMITED (429), PROVIDER_NOT_CONFIGURED/PAYMENT_PROVIDER_NOT_CONFIGURED (503).

Listlar: `{items:[...]}`, query `limit=30&offset=0`; limit max100. Domain listlari `project_id` oladi va server assignmentni tekshiradi. Tenant IDni querydan almashtirib access olish mumkin emas. Narx maydonlari vakolatsiz userlarda response’dan tushiriladi. Barcha row field type va nullability [database spec](BARPO_DATABASE_SPEC.md)da; operatsion route inputlari [OpenAPI](BARPO_API_OPENAPI.yaml)da.

## Role CRUD

`GET /v1/me/permissions`:

```json
{
  "role":"manager",
  "version":2,
  "pages":{"projects":{"create":true,"read":true,"update":false,"delete":false}},
  "permissions":["projects.read","projects.write"]
}
```

Yuqoridagi misol qisqartirilgan; real response barcha page keylarni beradi. Domain permissions yordamchi ma’lumot; UI aynan page/action flagini tekshiradi. `GET /v1/company/role-permissions` barcha kompaniya rollari, `version`, `locked_pages` qaytaradi. Saqlash:

```json
{
  "version":2,
  "role":"manager",
  "rules":[{"page":"projects","read":true,"create":true,"update":false,"delete":false}]
}
```

Yangi version bilan response keladi; eski versiya 409. read=false bo‘lsa qolgan uchta flag false bo‘lishi kerak. Moliya ichida bank_cash, invoices, payroll, budgets, allocations va boshqalar mustaqil. Platforma roli/tenant_admin ushbu endpoint orqali o‘zgartirilmaydi.

## Ombor commandlari

1. POST /materials: `{name,unit_id}`.
2. POST /warehouses: `{project_id,name}` → `{warehouse,account}`.
3. POST /stock/custody: `{project_id,custodian_id}` → stock_account.
4. POST /stock/commands receipt/opening: `{project_id,kind,material_id,to_account_id,quantity,unit_cost,reason}`.
5. Transfer: `{project_id,kind:"transfer",material_id,from_account_id,to_account_id,quantity,reason}` → pending/version1.
6. POST /stock/commands/{id}/actions: `{version:1,action:"accept",quantity:"40"}` → partial/version2.
7. Consumption: `kind:"consumption",from_account_id` va quantity; prorab `{version:1,action:"review"}`.
8. Return: `kind:"return",from_account_id:custody,to_account_id:warehouse`; warehouse accept.

Command output: id, tenant_id, project_id, kind, material_id, from_account_id/to_account_id nullable, quantity string, accepted_quantity string, status, version, created_by/reviewed_by, reason, timestamp. unit_cost narx huquqiga bog‘liq. Reversal alohida `/reverse` va reason bilan, eski yozuv o‘zgarmaydi.

## Hujjat va frontend chegaralari

OpenAPI runtime route registridan generatsiya qilinadi. Input/permission/idempotency/pathlar kod bilan bir manbadan. Response schema hozir ayrim operatsiyalarda generic object: fieldlarni qat’iy avtomatik serialize qilish full R1 hardening gate sifatida qayd etilgan. Frontend auth va permissions real ishlaydi; biznes ekranlarining qolgan demo formalarini ushbu endpointlarga ulash hali tugallanmagan.

## Telegram ulash va bildirishnomalar

`POST /v1/integrations/telegram/link` → `{url:"https://t.me/barpoai_bot?start=<token>",expires_at,expires_in:300}`. Token bir martalik, 5 daqiqa, bazada faqat SHA-256 hash. Bot `/start <token>` ni qabul qilib tokenni atomik sarflaydi; rol va kompaniya tokendan emas, bazadagi foydalanuvchidan olinadi. Bir Telegram akkaunt bitta foydalanuvchiga: boshqasida ulangan bo‘lsa `TELEGRAM_ACCOUNT_IN_USE`; foydalanuvchi yangi akkaunt ulasa eskisi avtomatik uziladi. `GET /v1/integrations/telegram` holat, `DELETE /v1/integrations/telegram` uzish. Bot menyusi rolga qarab tuziladi, lekin har amal bazadagi ruxsat va tenant doirasi bilan qayta tekshiriladi.

`GET /v1/me/notifications?unread=true` → `{items,unread}`; `POST /v1/me/notifications/read {ids:[]}` hammasini o‘qilgan qiladi. Bildirishnoma manbalari: vazifa biriktirish/holat o‘zgarishi, hisobot yuborish/tekshirish, material jo‘natish/sarf taklifi/qaytarish, kam qolgan material, 24 soat qolgan va o‘tgan deadline. Har biri ilova ichida saqlanadi va Telegram ulangan bo‘lsa worker orqali yetkaziladi.

## Sozlamalar, dashboard, eksport va texnik panel (09-bosqich)

`GET /v1/company` → `{legal_name,address,phone,created_at,version,status,access:{access_state,days_left,days_overdue},settings:{telegram:{tasks,reports,stock,finance}}}` (sahifa `settings`, odatda faqat kompaniya admini). `PATCH /v1/company {legal_name?,address?,phone?,settings?:{telegram:{...}},version}` optimistic `version` bilan; `VERSION_CONFLICT` 409. Telegram toifasi `false` bo‘lsa ilova ichidagi bildirishnoma baribir yoziladi, outbox vazifasi esa darhol `done/DISABLED_BY_SETTINGS` holatida yopiladi (dedup saqlanadi). Toifa `kind` prefiksidan: `task.*`→tasks, `report.*`/`progress.*`→reports, `stock.*`→stock, `payment.*`→finance, qolganlari (masalan `support.response`) doim yetkaziladi. Logotip saqlanmaydi (egasi qarori).

`GET /v1/dashboard` → `{generated_at,projects,tasks,reports,stock,finance,employees}`; har blok tegishli ruxsat bo‘lmasa `null` (brigadir uchun `finance`/`employees` null, `stock.inventory_value` narx huquqisiz null). Hisoblash qoidalari: `BARPO_DASHBOARD_METRICS.md`.

Excel eksportlar (javob `{filename,mime_type,base64}`, har biri `export.*` auditga yoziladi): `GET /v1/finance/plan-actual/export?project_id` (Qatorlar/Zonalar/Oylar varaqlari; narx huquqisiz summa ustunlari yo‘q), `GET /v1/tasks/export?project_id&status&mine`, `GET /v1/stock/overview/export?project_id` (rol doirasidagi hisoblar), `GET /v1/audit/export?action&actor_id&from&to` (admin, 5000 tagacha). `GET /v1/finance/plan-actual` endi `by_zone` ham qaytaradi. `GET /v1/audit` filtrlari: `action` (prefiks), `actor_id`, `from`, `to`; javobda `actor_name`, `actor_role`, `total`. `GET /v1/files?project_id` obyekt bo‘yicha fayllar (hisobot sanasi/holati, vazifa nomi bilan). `GET /v1/me/notifications` javobida `total` ham bor.

`GET /v1/platform/diagnostics` (super_admin va support) → baza (`latency_ms`, `last_migration`), worker navbati (`pending`, `dead`, `done_24h`, `oldest_pending_at`, `failed_jobs`), `errors` (5xx javoblar `error_events` jadvalidan, so‘nggi 20 ta), `sessions_active`, `telegram`, `tenants` holat bo‘yicha. Tenant moliyasi ochilmaydi. `PATCH /v1/platform/support/:id {status,response?}` — javob yozilsa murojaat egasiga `support.response` bildirishnomasi (ilova + Telegram) ketadi; `GET /v1/platform/support` endi super_admin uchun ham ochiq.

## Avtomatik obuna invoyslari va kredit (10-bosqich)

Davr 30 kun (`PERIOD_DAYS`), zanjir trial tugagan kundan. `POST /v1/platform/subscriptions {tenant_id,plan_version_id,next_period_start?}` — sana berilmasa `max(trial_ends_at, paid_until, now)`. Worker har 10 daqiqada `issueDueInvoices`: `next_period_start ≤ now + 3 kun` bo‘lsa va shu `period_start` uchun invoys bo‘lmasa bitta invoys (`source='auto'`, `due_at=period_start`, `period_end=period_start+30 kun`) chiqaradi, `subscriptions.next_period_start` ni `period_end` ga suradi va kompaniya adminiga `billing.invoice` bildirishnomasi yuboradi. Qo‘lda `POST /v1/platform/billing/invoices` ham shu funksiyadan (`period_end`/`due_at` ixtiyoriy, `source='manual'`). Muddati o‘tgan qoplanmagan invoys uchun adminga bir martalik `billing.overdue`; avtomatik blok yo‘q.

`POST /v1/platform/billing/entries` — `payment` endi invoysdan ortiqcha bo‘lishi mumkin: pul to‘liq yoziladi, ortiqchasi `billing_credits(kind='overpayment')` ga tushadi (javobda `credit`). Kredit darhol boshqa to‘lanmagan invoyslarga (eng eskisidan) `billing_entries(kind='credit')` + `billing_credits(kind='applied')` bilan qo‘llanadi; yangi invoys chiqqanda ham avtomatik. Qo‘lda `credit` va `refund` avvalgidek chegaralangan (`BILLING_AMOUNT_EXCEEDED`). Qoplanish zanjiri (`paid_until`) har o‘zgarishdan keyin qayta hisoblanadi.

`GET /v1/billing` → qo‘shimcha `credit_balance`, invoyslarda `covered` va `source`. `GET /v1/platform/tenants/:id` → `credit_balance`, `credits[]`. `GET /v1/platform/billing/summary` → `debt` invoys kesimida (`Σ max(0, amount − covered)`), `credit_balance` alohida; `profit` hamon `null`.
