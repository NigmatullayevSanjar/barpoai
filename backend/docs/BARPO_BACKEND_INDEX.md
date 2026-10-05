# BARPO AI — Backend indeksi

Natija: kod va texnik hujjatlarga ega **v0.1 backend**. To‘liq production/R1 tayyorligi deyilmaydi. Foydalanuvchi provayderlar hozir yo‘qligini tasdiqlagan. Ishlashni boshlash: [README](../README.md).

## Artefaktlar

1. [Arxitektura va qarorlar](BARPO_BACKEND_ARCHITECTURE.md)
2. [Database spetsifikatsiyasi — to‘liq executable DDL](BARPO_DATABASE_SPEC.md)
3. [Domenlar bo‘yicha Mermaid ERD](BARPO_ERD.md)
4. [Biznes qoidalari va formulalar](BARPO_BUSINESS_RULES.md)
5. [Rol, sahifa, CRUD va domain permission matritsasi](BARPO_PERMISSIONS.md)
6. [OpenAPI 3.1 YAML](BARPO_API_OPENAPI.yaml), [DTO va API qo‘llanmasi](BARPO_API_GUIDE.md), runtime `/openapi.json`, [Dashboard ko‘rsatkichlari](BARPO_DASHBOARD_METRICS.md), [Rol bo‘yicha sinov hisoboti](BARPO_ROLE_TEST_REPORT.md)
7. [Integratsiya kontraktlari va blockerlar](BARPO_INTEGRATIONS.md)
8. [Acceptance ssenariylari](BARPO_ACCEPTANCE_TESTS.md), [haqiqiy test natijalari](verification.json), [Docker smoke natijalari](docker-verification.json), [brauzer natijalari](ui-verification.json), [ruxsatlar ekrani](permissions-ui.png)
9. [Bajarilgan ish, qolgan R1 gate va ochiq qarorlar](BARPO_IMPLEMENTATION_PLAN.md)

## Talab → yechim

| Talab | Kod / hujjat |
|---|---|
| Node/Postgres/Docker modular monolith | src/app.ts, src/server.ts, Dockerfile, compose.yaml, architecture |
| 10 rol, bir user/bir tenant/bir rol | users CHECK, permissions.ts, permissions matrix |
| Har rol/har sahifa mustaqil CRUD | role_page_permissions, permission_versions, routes-permissions.ts, RolePermissionsPage.tsx |
| Frontend role pages filtering | /v1/me/permissions, src/api/client.ts, src/ui/roles.ts, barcha Sidebar filtrlari |
| Tenant/project/warehouse izolyatsiya | FORCE RLS, composite FK, projectScope/accountScope, PostgreSQL tests |
| Platforma texnik/owner/support bo‘linishi | routes-platform.ts; tenant API access yo‘q |
| Invite, trial, block, alias | auth.ts, routes-auth.ts, routes-platform.ts; trial_once trigger |
| Tarif/billing/payment/refund | plan_versions, billing_invoices/entries, subscription/coverage; business rules |
| Xodim password/assignment/handover | routes-company.ts, scrypt, sessions, task/custody tekshiruvi |
| Obyekt/zona/material | company + operations routes, typed FK schema |
| Smeta approvalsiz; finansist import | estimates.ts, routes-operations.ts; immutable revisions |
| Optional norm/month va Excel | schemas.ts, plannedQuantity, parseWorkbook, preview/commit |
| Ombor send/partial accept/consume/review | inventory.ts, stock_commands/ledger/balances |
| Ajratma≠actual≠payment | finance.ts, immutable balanced journal |
| Task va report approval | routes-work.ts, routes-lifecycle.ts, progress_entries unique |
| Telegram/UySot/bank/Didox/iHamkor/camera/payment R1 | integration schema/worker/contracts; real access — blocker |
| Audit, secrets, private files, health | db.audit, security.ts, private file handlers, helmet/rate-limit |
| Race/retry/rollback sifat | unit va Docker PostgreSQL integration testlari |

## Foydalanish chegarasi

Mavjud front-end dizaynidagi raqamlar ushbu backendda real korxona ma’lumotlari sifatida ko‘chirilmagan. Real auth/permissions alohida yoqiladi (`VITE_API_URL`). Backend endpointlari orqali haqiqiy lokal ma’lumotlar yaratiladi. Qolgan formalar/demo ekranlarni ulash va R1 accounting/provider completion ishlari implementation plan’da ochiq qayd etilgan.
