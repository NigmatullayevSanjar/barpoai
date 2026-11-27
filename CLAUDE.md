# CLAUDE.md — BARPO AI

BARPO AI is a multi-tenant SaaS ERP for construction companies in Uzbekistan. The platform owner sells subscriptions to companies; each company runs its projects in it: estimates (smeta), stock, tasks and daily reports, finance, payroll, apartments and price sheets. The UI is in Uzbek (Latin) and Russian. The owner speaks Uzbek: answer in Uzbek unless asked otherwise. This file is for Claude Code sessions: read it fully before changing anything.

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Product in one page

**Tenancy.** Two levels. The platform (owner, super admin, support) creates companies, plans, invoices and answers support requests; it never opens a company's projects, estimates, stock or finance pages. Each company is isolated by PostgreSQL row-level security (`app.tenant_id`). Company users log in with company domain + login or phone + password (D43); platform staff log in without a domain. A company starts with a 14-day trial; the worker blocks it when the trial or paid period ends unpaid, a covering payment reopens it, a manual owner block always wins (D33).

**Roles and what they do** (full reference: `docs/BARPO_ROLLAR_VA_FUNKSIYALAR.md`):

| Role | Key | Can | Cannot |
|---|---|---|---|
| Platform owner | `platform_owner` | Everything on the platform: companies, plans, billing, staff, permissions, audit, diagnostics, corrections (reversals) inside a company | Open a company's business pages |
| Super admin | `super_admin` | Owner's actions by default; Telegram 2FA is mandatory (D21) | Block or change the owner |
| Support | `support` | Read, reply to support requests, diagnostics, password reset links | Create, block, bill, reverse |
| Company admin | `tenant_admin` | Employees, role permissions, projects, estimates, tasks, report review, all finance, payroll, price sheet, audit, settings | Any stock operation or material creation (D18), even with a grant |
| Chief engineer | `manager` | Projects and blocks, estimates (create, edit, import), prices, tasks, reports, read employees | Finance pages, stock operations |
| Foreman | `foreman` | Tasks, daily reports with photos, accept warehouse issues into own custody, consume without approval (posts at once), returns, read stock and estimates by quantity | See any money (D20); review reports; other foremen's custody |
| Warehouse manager | `warehouse_manager` | Materials, receipts, transfers, request fulfilment, reversals, inventory, minimum stock (assigned warehouses only) | Prices, consumption approval |
| Financier | `financier` | Budgets, plan–actual, forecast, payment requests and calendar, price sheet, estimate import | Post documents or pay |
| Accountant | `accountant` | Counterparties, cash accounts, invoices and acts, payments, advances and offsets, reversals, payroll entries, allocations | Edit estimates, stock operations; closing or paying payroll needs the admin's grant |

The admin can change every role's page CRUD matrix and give individual grants (`/v1/company/role-permissions`, `/v1/employees/:id/permissions`); the server enforces everything, the UI only hides.

**Modules.** Projects → blocks → zones (block, entrance, floor, other) → premises (apartments, Excel import). Estimates: manual grid, Excel import, full Form 5 import (`form5.ts`, D29–D35), immutable revisions keeping line identity (`lineage_id`), price chain with overheads, profit and optional VAT (D36–D39), customer-supplied materials (D37), F-2 act and F-3 statement per period (D40–D41), re-upload as the next revision (D42). Stock: receipt → issue «Chiqim» to a foreman (reserve, no request needed) → foreman accepts → foreman's consumption is an expense at once; returns, reversals, inventory. No material requests and no brigadier role (2026-11-23). Tasks (Kanban, optional estimate line) and daily/weekly reports; the foreman writes reports, the chief engineer or admin accepts them and progress is written (no piece rate). Finance: double-entry journal (`finance.ts`), invoices matched to stock receipts, payments allocated to documents, advances and advance offsets (D22), budgets, plan–actual by document date, forecast, payment requests, reconciliation. Payroll (no piece rates since 2026-11-23). Price sheet per apartment with UZS/USD (CBU rate, display only). Dashboards per role, notifications in the app and Telegram, Telegram bot flows per role, audit log with Excel export.

## Architecture and stack

- `backend/`: Node.js 22, TypeScript 5.9, Fastify 5, `pg` with raw SQL (no ORM), zod 4 schemas, `decimal.js` for all money, ExcelJS. Every route is declared with `add({ method, path, permission | page, action, body, query, params, sensitive, idempotent, handler })` (`http.ts`); mutations require an `Idempotency-Key` and optimistic `version`; `transaction()` sets `app.tenant_id` and rolls back on throw; `invariant(cond, CODE, status)` raises domain errors (`errors.ts`). Sessions are httpOnly cookies or Bearer tokens.
- Main modules: `routes-*.ts` (HTTP), `finance.ts` (journal posting and rules), `inventory.ts` (stock ledger), `estimates.ts`, `estimate-price.ts`, `estimate-acts.ts`, `form5.ts`, `customer-materials.ts`, `billing.ts`, `pricing.ts`, `premises.ts`, `permissions.ts` and `platform-permissions.ts`, `notify.ts`, `telegram.ts` and `telegram-flows.ts`, `worker.ts` (outbox, invoices, auto-block, Telegram polling, CBU rate), `migrate.ts`.
- Database: PostgreSQL 17, migrations in `backend/migrations/NNN_name.sql` (runner tracks file names; next free number is **039**). Two roles: `barpo_owner` (migrations, superuser) and `barpo_app` (runtime, `NOBYPASSRLS`).
- `frontend/`: Vite 7, React 19, TypeScript, TanStack Query 5, react-router, react-hook-form + zod. Features in `frontend/src/features/*`, shared UI in `frontend/src/components/ui`, i18n strings in `frontend/src/locales/*.uz.ts` and `*.ru.ts`, number and money formatting in `frontend/src/lib/format.ts`, navigation per role in `frontend/src/lib/permissions.ts`.
- `deploy/`: production Compose (`db`, `migrate`, `api`, `worker`, `web` = Caddy with HTTPS serving the frontend and proxying `/v1`), `web.Dockerfile`, `Caddyfile`, `Caddyfile.railway`, `backup.sh`.
- `docs/`: all documentation (map below). Backend scripts write generated docs and test reports to `docs/backend/`.

## Running locally

1. `backend/.env` from `backend/.env.example` (DB passwords, `APP_ORIGIN=http://localhost:5173`, optional `TELEGRAM_BOT_TOKEN`). Secrets never leave this file.
2. `cd backend && docker compose up --build -d` starts `db`, `migrate`, `api` (port 3001), `worker`. After backend changes: `docker compose up -d --build api worker`.
3. First platform owner: `BOOTSTRAP_LOGIN=... BOOTSTRAP_PASSWORD=... npm run bootstrap` (`MIGRATION_DATABASE_URL` from `.env`).
4. `cd frontend && pnpm install && pnpm dev` → `http://localhost:5173` (`/v1` is proxied to the API).
5. Owner → «Mijozlar» → create a company → invite link → register its admin in another browser window.

## Verification before every commit

- `backend`: `npm run build`, `npm test`, `npm run test:integration`, `npm run test:roles`, `npm run test:ui` (the last three each start a disposable PostgreSQL 17 in Docker; run at most two at a time), `npm run docs` after route or schema changes.
- `frontend`: `pnpm typecheck`, `pnpm build`.
- On a running local stack: `npm run qa:smoke` then confirm no `QA-` company is left; post-pull procedure for Claude Code: `docs/tests/CLAUDE_CODE_PULL_TEKSHIRUVI.md`.
- Last recorded counts (2026-11-23): unit 41, integration 112 checks, UI 69 checks, role matrix 9 roles with no findings (brigadier removed 2026-11-23). Counts only grow; a lower count means a removed check and needs an explanation.

## Deployment

- Hetzner VPS (one server, Docker Compose, Caddy HTTPS, daily `backup.sh`): `docs/DEPLOY_HETZNER.md`.
- Railway (`Postgres`, `app` = API + worker in one container, `web` = Caddy + frontend): `docs/DEPLOY_RAILWAY.md`. The pilot domain is `barpoai.uz`.
- Both host data outside Uzbekistan (personal data law, article 27¹): pilot only; section 7 of each guide covers moving to a local server.
- Production sets `NODE_ENV=production`, so session cookies are `Secure`: serve over HTTPS and set `APP_ORIGIN` to the real domain (logout skips the origin check since PR #25; other mutations do not).

## Documentation map

- `docs/TZ_VA_NARX_REJASI.md` — work plan and **owner decisions D1–D43** (they override older docs), stage table (section 3), ready prompts (section 6), open items (section 9).
- `docs/backend/BARPO_BUSINESS_RULES.md` — the binding rules per feature; wins over `docs/BARPO_AI_PROJECT_CONTEXT.md` (product spec, guides UI and scope) and `docs/BACKEND_TODO.md` (original 12-stage plan).
- `docs/backend/BARPO_API_OPENAPI.yaml`, `BARPO_DATABASE_SPEC.md`, `BARPO_ROLE_TEST_REPORT.md` — generated; do not edit by hand.
- `docs/BARPO_ROLLAR_VA_FUNKSIYALAR.md` (+ PDF) — roles and "what happens when" for the owner.
- `docs/SMETA_TUZATISH_PROMPTLARI.md`, `docs/FORM5_IMPORT_LOYIHA.md`, `docs/research/` — estimate research, Form 5 design, sample workbooks (synthetic `NAMUNA_SMETA_FORM5_2026_11_10.xlsx` is safe to show).
- `docs/tests/` — manual test cases per feature (`ID | Qadam | Kutilgan natija`), QA reports and screenshots; owner's end-to-end case `QOLDA_TEST_CASE_2026_10_28.md`, full platform case `PLATFORMA_TOLIQ_*`.
- `docs/tz/` — client design TZ (`.md` for search, `.docx` original). `docs/BARPO_AI_HANDOFF.md`, `docs/BARPO_AI_DAVOM_ETTIRISH.md` — older handoff snapshots (2026-10-12), history only.

## Conventions

- Money and quantities are decimal strings end to end; storage and input are UZS only. All sums and totals come from the server. USD is display-only: conversion happens only inside `formatMoney`, with the server-provided CBU rate and decimal arithmetic (never `Number`) — the single exception to "frontend does no arithmetic". Forms and Excel exports stay UZS (except the price sheet).
- Money/quantity/area inputs use `Input` with `inputMode="decimal"` (or `NumericInput` in grids): digits show grouped (`3 000 000`), the form value stays without spaces.
- Permissions are enforced server-side; the UI only hides. Every new UI string goes into both `frontend/src/locales/*.uz.ts` and `*.ru.ts`. No static demo numbers: empty and error states instead.
- Secrets stay in `backend/.env` and `deploy/.env` (gitignored). Never commit tokens, never write passwords to files or chat.
- Code comments and docs for the owner are in Uzbek; commit messages and this file are in English.

## Project status (2026-11-23)

Everything below is merged into `main` (latest: PR #25, 2026-11-21).

- Stages 1–4 (pagination and search, server totals, error states, charts, premises, UZS/USD, price sheet), Figma stages F1–F6, platform roles D21, Excel import for estimates and premises.
- PR #9–#15: advance offset and «Subpudratchi» (D22), grouped number inputs, button visibility and font size, atomic 2FA check, server-side sums (O3), accounting by document date (O12), UTC+5 dates (O17), role matrix coverage.
- Video-analysis ideas (D23): project finance card, tasks linked to estimate lines (migration 025), multi-line material requests (026), floor × work matrix, brigade piece rate with payroll and advances (027). PR #20: `qa:smoke`, `qa:cleanup`, owner guides.
- Estimates from external companies (D24–D34): Form 5 import, revision identity (028), piece rate from labor resources, material aliases, units (029), auto-block of unpaid companies (030, D33), linked workbooks accepted, macros rejected (D34).
- Estimate correction S1–S5 (D35–D41): «П» rows, line codes and sections, header and resource summary (031), price chain, customer materials and settings (032), F-2 and F-3 acts, customer materials report (S5); re-upload as a revision with the warehouse showing the estimate plan (D42, `031_import_target.sql`). Since 2026-11-23 the estimate plan, over-plan flag and estimate lines in stock are visible only with `estimates.read` or `stock.consume`: the warehouse manager sees no estimate data. Two `031_*` files are intentional: renaming one would re-run it.
- Company domain login, unique login per company, `LOGIN_TAKEN`/`PHONE_TAKEN`, trial companies are not debtors, invoices start after the trial, unarchive button (D43, migration 033). Notifications open their source page. Ids without `crypto.randomUUID` over plain http. Hetzner and Railway deploy setups. Logout works from any origin.
- PR #27 (merged, branch `claude/project-thread-n8na8o`): the warehouse manager sees no estimate data and no false «insufficient stock» on receipts; «Jo‘natish» renamed «Chiqim».
- PR #28 (merged, same branch): brigadier role removed (migrations 034–035): foremen accept warehouse issues into custody and consume without approval, the chief engineer or admin reviews reports, material requests and piece rates are gone; piece-rate leftovers removed too: migration 036 drops `estimate_lines.labor_rate` and `projects.brigade_percent`, the earnings routes and payroll piece fields are gone; `progress_entries.labor_rate`, `payroll_entries.piece_rate` and `progress_payroll` stay as history.
- PR #29 (merged): the warehouse manager enters no price at receipt. An unpriced receipt posts at a provisional cost (`cost_provisional`, migration 037: average contractor estimate price of the material in the project, else the last priced receipt, else 0); the accountant's supplier invoice sets the real price: the difference revalues the project's stock on hand (pro rata by quantity, ledger key `price:<invoice>`) and the consumed share goes to expense; reversing the invoice reverses it (`STOCK_ALREADY_MOVED` if the value has left). `PRICE_ADJUSTMENT_REQUIRED` is gone.
- Next PR (same branch): no price anywhere for the warehouse manager: opening balances post at the provisional cost (`cost_provisional`), inventory surpluses at the account's average cost (else provisional). The consumed share of an invoice price difference is booked on the consumptions of that material after the receipt (pro rata by quantity, journal pair inventory −/expense + tagged `price_document_id`, migration 038), so the estimate line «Fakt» includes it; an invoice reversal reverses those pairs, a consumption reversal leaves them.

**Open items** (fix only when the owner says):

- Production readiness: choose the host (Hetzner vs Railway vs a server in Uzbekistan), verify backup and restore, monitoring and error alerts.
- N-01: Form 5 imports the trailing «ИТОГО ПО ЛОКАЛЬНОЙ РЕСУРСНОЙ ВЕДОМОСТИ» block of the real «ОБЩЕЕ» sheet as works (`form5.ts` stops only at «ВСЕГО ЗАТРАТ»).
- N-02: the chief engineer gets 403 on acts (`prices.read` maps to the finance page in `permissions.ts`).
- K-1: estimate line «Fakt» and the «Umumiy» tab ignore stock reversals, unlike acts and S5 (owner to decide whether they should subtract them).
- Login on the Docker stack over a LAN IP (`http://10.x.x.x:5173`): the API runs with `NODE_ENV=production`, so the `Secure` cookie is dropped over http. Proposed: `Secure` only for https requests.
- Owner questions: the stock «Materiallar» tab as a company catalog vs following the estimate; freezing a signed act (acts are recomputed from the current revision); labor re-pricing at MHTEKM × 5 % for VMQ 583; N-03 unpriced general-contractor rows; archived companies in the debtors list; whether the first invoice should wait until the trial actually ends; the 1 500 000 invoices issued during trial on the local DB.
- Opening balances have no invoice, so their provisional cost is never corrected by the accountant.
- Two computers on the same LAN running the same Telegram bot token cause «Conflict: terminated by other getUpdates request»: one bot token per running stack.

## Working rules learned in this project

- Immutable ledgers: `journal_entries`, `stock_ledger`, `progress_entries`, `finance_documents`, `audit_events`, `estimate_revisions`, `billing_entries`, `plan_versions`, `progress_corrections`, `progress_payroll` reject UPDATE and DELETE (trigger `reject_mutation`, error `IMMUTABLE_LEDGER` → 409 `INVARIANT_VIOLATION`). Never update them; add a new row (reversal, correction, link table) instead.
- Database check violations surface as 409 `INVARIANT_VIOLATION` without the constraint name. When one appears in a test, find the constraint or trigger before changing code.
- Price fields are redacted on `sensitive` routes for roles without `prices.read` (`redactPrices` list in `backend/src/permissions.ts`): add every new money or rate field name there. Foreman never sees sums (D20); there is no brigadier role since 2026-11-23.
- Every new GET route is picked up by `npm run test:roles` automatically; a route with `:id` needs an entry in the `ids`/`docIds` maps of `backend/scripts/role-tests.ts` only when its prefix is new (`unfillable` must stay empty).
- Migration file names must match `^\d{3}_[a-z_]+\.sql$` (no digits after the number; the integration suite asserts it). On a database with data, do not combine UPDATE and ALTER TABLE in one migration ("pending trigger events").
- Docker suites (`test:integration`, `test:roles`, `test:ui`) each start their own PostgreSQL 17 container and drop it; run at most two at a time (three concurrent runs caused a UI timeout). A background suite exits 0 even when the test failed: always read the log, not the wrapper exit code.
- The suites overwrite tracked report files in `docs/backend/` (`verification.json`, `role-verification.json`, `ui-verification.json`, `BARPO_ROLE_TEST_REPORT.md`, `platform-tenant-ui.png`, `ui-failure-*.png`). Restore them with `git checkout --` before committing; `npm run docs` output (`BARPO_API_OPENAPI.yaml`, `BARPO_DATABASE_SPEC.md`) is committed.
- Prettier: format a file only if it was Prettier-clean before your change (`git show HEAD:<file> | npx prettier --stdin-filepath <file>`); leave previously unformatted files as they are.
- Playwright `getByRole(..., { name })` matches substrings by default: use `exact: true` or a scoped locator when the same word appears in another cell; wait for the mutation result (a button disappearing) before counting elements.
- Branch workflow: develop on `main-vxg6su`, open a PR, the owner merges on GitHub and says "birlashtirdim"; then `git fetch origin main && git checkout -B main-vxg6su origin/main` only after confirming the merge commit is in `origin/main`. Commit messages end with the attribution lines from the session; push only after every suite passed.
- QA on a running local stack: `npm run qa:smoke` (full business flow over HTTP as every role, then deletes its `QA-<stamp>` company) and `npm run qa:cleanup -- <QA-key> | --all-qa`; procedure in `docs/tests/CLAUDE_CODE_PULL_TEKSHIRUVI.md`. Only companies whose registration key starts with `QA-` can be deleted.
- QA without the platform owner password: create the `QA-` tenant directly in the local DB (`INSERT INTO tenants` + `INSERT INTO invites` with `digest(token())` from `backend/src/security.ts`, run with `npx tsx`), register its admin via `/v1/auth/register`, finish with `qa:cleanup`. Compute expected numbers from the Excel inputs independently, never from platform code. QA list endpoints accept `limit` ≤ 100; record mutating steps so a rerun does not duplicate stock rows.
- Wiping a company's objects and operations but keeping the company, its employees, roles and billing: `backend/scripts/reset-operations.sql` (tested on a DB copy, 165 foreign keys intact). Take a `pg_dump` first; run with `psql -v key=<registration_key>`; it deletes every `tenant_id` table except the keep list in one transaction with `session_replication_role = replica` (immutable-ledger triggers are bypassed only there). Uploaded files stay in the `private_files` volume and are removed by hand. Full reset instead: `docker compose down -v`, `up -d`, `npm run bootstrap`.
- Manual test cases live in `docs/tests/` (one file per feature, table `ID | Qadam | Kutilgan natija`); the owner's end-to-end manual case: `docs/tests/QOLDA_TEST_CASE_2026_10_28.md`. Role and function reference for the owner: `docs/BARPO_ROLLAR_VA_FUNKSIYALAR.md` (PDF alongside).
