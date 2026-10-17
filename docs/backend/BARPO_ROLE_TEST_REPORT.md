# BARPO AI — 11-bosqich: rol bo‘yicha to‘liq sinov hisoboti

Bajarildi: 2026-10-17T08:02:31.778Z (`npm run test:roles`, vaqtinchalik PostgreSQL 17 Docker, runtime NOSUPERUSER NOBYPASSRLS). Har bosqichda avtomatik qayta yuriladi; qo‘lda tahrirlanmaydi.

## Natija

- ✅ Seed: two tenants, seven tenant roles, project/zone/warehouse/custody, stock chain, estimate, task, report+photo, finance documents, payroll, payment request, plan, price list
- ✅ Role × GET endpoint matrix: 71 endpoints × 10 roles match /v1/me/permissions (403 exactly where expected)
- ✅ Cross-tenant isolation: 18 id-routes and 10 writes with foreign ids are rejected; lists stay tenant-scoped
- ✅ Individual deny beats role grant; role page revoke blocks read and create; unassigned project/warehouse → 404; brigadier responses carry no price fields
- ✅ Replays with the same idempotency key, parallel version races, double accept and double reversal never write money/material/progress twice

Ochiq xatolar: yo‘q

## Rol × GET endpoint matritsasi

Har rol uchun 71 ta GET endpoint chaqirildi; kutilgan natija `/v1/me/permissions` (sahifa CRUD + domen ruxsati) va marshrut metama’lumotidan hisoblandi. «Mos kelmadi» ustuni 0 bo‘lishi shart.

| Rol | Ruxsat kutilgan | 403 kutilgan | Mos kelmadi |
| --- | --- | --- | --- |
| foreman | 34 | 37 | 0 |
| brigadier | 29 | 42 | 0 |
| warehouse_manager | 29 | 42 | 0 |
| financier | 46 | 25 | 0 |
| accountant | 42 | 29 | 0 |
| manager | 36 | 35 | 0 |
| tenant_admin | 62 | 9 | 0 |
| platform_owner | 11 | 60 | 0 |
| super_admin | 13 | 58 | 0 |
| support | 11 | 60 | 0 |

Parametri to‘ldirilmagan (matritsadan tashqari) endpointlar: yo‘q.

## Sahifa ruxsatlari (standart rol siyosati, kompaniya A)

R — o‘qish, RW — o‘qish va yozish (create yoki update), — yo‘q.

| Rol | dashboard | projects | employees | estimates | stock | finance | tasks | reports | files | integrations | camera | billing | settings | permissions | audit | accounting_documents | invoices | bank_cash | counterparties | payroll | reconciliation | financial_reports | allocations | budgets | plan_actual | forecast | payment_requests | payment_calendar | pricing |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| foreman | R | R | — | R | RW | — | RW | RW | RW | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| brigadier | R | R | — | — | RW | — | RW | RW | RW | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | RW |
| warehouse_manager | R | R | — | — | RW | — | RW | R | RW | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| financier | R | R | — | RW | — | RW | RW | R | RW | — | — | — | — | — | — | R | R | R | R | R | R | R | RW | RW | R | R | RW | R | RW |
| accountant | R | R | — | R | — | RW | RW | R | RW | — | — | — | — | — | — | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | — |
| manager | R | RW | R | RW | R | — | RW | RW | RW | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| tenant_admin | RW | RW | RW | RW | R | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW | RW |

## Provayderga bog‘liq, bajarilmagan testlar

- ⏸ UySot, bank, Didox, iHamkor, kamera va obuna to‘lov provayderlari — kirish (hujjat, sandbox, kalit) yo‘q; adapterlar `not_configured`, `POST /v1/billing/checkout` 503 PAYMENT_PROVIDER_NOT_CONFIGURED
- ⏸ Telegram real yetkazilishi — bot tokeni faqat jonli muhitda; testlarda outbox va chat_state oqimi tekshiriladi

## Qamrov haqida

To‘liq biznes ssenariy (kompaniya → xodim → obyekt → smeta → kirim → jo‘natish → qabul → sarf → invoys → to‘lov → hisobot → dashboard) `npm run test:integration` va brauzer e2e `npm run test:ui` da yuradi; ularning natijalari `verification.json` va `ui-verification.json` da.
