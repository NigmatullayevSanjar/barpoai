# BARPO AI — 11-bosqich: rol bo‘yicha to‘liq sinov hisoboti

Bajarildi: 2026-10-05T09:42:58.467Z (`npm run test:roles`, vaqtinchalik PostgreSQL 17 Docker, runtime NOSUPERUSER NOBYPASSRLS). Har bosqichda avtomatik qayta yuriladi; qo‘lda tahrirlanmaydi.

## Natija

- ✅ Seed: two tenants, seven tenant roles, project/zone/warehouse/custody, stock chain, estimate, task, report+photo, finance documents, payroll, payment request, plan
- ✅ Role × GET endpoint matrix: 63 endpoints × 10 roles match /v1/me/permissions (403 exactly where expected)
- ✅ Cross-tenant isolation: 14 id-routes and 5 writes with foreign ids are rejected; lists stay tenant-scoped
- ✅ Individual deny beats role grant; role page revoke blocks read and create; unassigned project/warehouse → 404; brigadier responses carry no price fields
- ✅ Replays with the same idempotency key, parallel version races, double accept and double reversal never write money/material/progress twice

Ochiq xatolar: yo‘q

## Rol × GET endpoint matritsasi

Har rol uchun 63 ta GET endpoint chaqirildi; kutilgan natija `/v1/me/permissions` (sahifa CRUD + domen ruxsati) va marshrut metama’lumotidan hisoblandi. «Mos kelmadi» ustuni 0 bo‘lishi shart.

| Rol | Ruxsat kutilgan | 403 kutilgan | Mos kelmadi |
| --- | --- | --- | --- |
| foreman | 31 | 32 | 0 |
| brigadier | 26 | 37 | 0 |
| warehouse_manager | 26 | 37 | 0 |
| financier | 39 | 24 | 0 |
| accountant | 39 | 24 | 0 |
| manager | 18 | 45 | 0 |
| tenant_admin | 55 | 8 | 0 |
| platform_owner | 9 | 54 | 0 |
| super_admin | 6 | 57 | 0 |
| support | 5 | 58 | 0 |

Parametri to‘ldirilmagan (matritsadan tashqari) endpointlar: yo‘q.

## Sahifa ruxsatlari (standart rol siyosati, kompaniya A)

R — o‘qish, RW — o‘qish va yozish (create yoki update), — yo‘q.

| Rol | dashboard | projects | employees | estimates | stock | finance | tasks | reports | files | integrations | camera | billing | settings | permissions | audit | accounting_documents | invoices | bank_cash | counterparties | payroll | reconciliation | financial_reports | allocations | budgets | plan_actual | forecast | payment_requests | payment_calendar |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| foreman | R | R | — | R | RW | — | RW | RW | RW | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| brigadier | R | R | — | — | RW | — | RW | RW | RW | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| warehouse_manager | R | R | — | — | RW | — | RW | R | RW | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| financier | R | R | — | RW | — | RW | RW | R | RW | — | — | — | — | — | — | R | R | R | R | R | R | R | RW | RW | R | R | RW | R |
| accountant | R | R | — | R | — | RW | RW | R | RW | — | — | — | — | — | — | RW | RW | RW | RW | RW | RW | RW | R | R | RW | RW | R | RW |
| manager | R | R | — | — | — | — | RW | R | RW | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| tenant_admin | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW |

## Provayderga bog‘liq, bajarilmagan testlar

- ⏸ UySot, bank, Didox, iHamkor, kamera va obuna to‘lov provayderlari — kirish (hujjat, sandbox, kalit) yo‘q; adapterlar `not_configured`, `POST /v1/billing/checkout` 503 PAYMENT_PROVIDER_NOT_CONFIGURED
- ⏸ Telegram real yetkazilishi — bot tokeni faqat jonli muhitda; testlarda outbox va chat_state oqimi tekshiriladi

## Qamrov haqida

To‘liq biznes ssenariy (kompaniya → xodim → obyekt → smeta → kirim → jo‘natish → qabul → sarf → invoys → to‘lov → hisobot → dashboard) `npm run test:integration` va brauzer e2e `npm run test:ui` da yuradi; ularning natijalari `verification.json` va `ui-verification.json` da.
