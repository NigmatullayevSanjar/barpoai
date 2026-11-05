# CLAUDE.md — BARPO AI

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

## Project pointers

- Current work plan (2026-10): `docs/TZ_VA_NARX_REJASI.md` — owner decisions D1–D10 and R1–R2 override older docs; stage status in section 3, ready prompts in section 6, how to continue on another computer and open items in section 9. Client design TZ: `docs/tz/` (`.md` copy for search, `.docx` original).
- Session handoff snapshot (2026-10-12): `docs/BARPO_AI_DAVOM_ETTIRISH.md` — what is done, owner decisions made in recent sessions, open work in order, environment workarounds.
- Plan of record: `docs/BACKEND_TODO.md` (12 stages, per-stage status lines dated). Product spec: `docs/BARPO_AI_PROJECT_CONTEXT.md`. When the two conflict, backend business rules in `docs/backend/BARPO_BUSINESS_RULES.md` win; the context doc guides UI and scope.
- Verify before every commit: `backend`: `npm run build`, `npm test`, `npm run test:integration` (Docker), `npm run test:ui` (Docker + Headless Chrome), `npm run test:roles` (rol × endpoint matritsasi, Docker); `frontend`: `pnpm typecheck`, `pnpm build`. Regenerate API docs with `npm run docs` after route changes.
- Conventions: money and quantities are decimal strings end to end; storage and input are UZS only. USD is display-only: conversion happens only inside `formatMoney`, with the server-provided CBU rate and decimal arithmetic (never `Number`) — the single exception to "frontend does no arithmetic"; no sums, totals come from the server in UZS; forms and Excel exports stay UZS (except the price sheet); money/quantity/area inputs use `Input` with `inputMode="decimal"` (or `NumericInput` in grids): digits show grouped (`3 000 000`), the form value stays without spaces; permissions are enforced server-side (UI only hides); every new UI string goes into both `frontend/src/locales/*.uz.ts` and `*.ru.ts`; no static demo numbers — empty/error states instead.
- Secrets stay in `backend/.env` (gitignored). Never commit tokens.
- Layout: `frontend/` (Vite app), `backend/` (API, worker, migrations, tests), `docs/` (all documentation; backend scripts write generated docs and test results to `docs/backend/`). Full project context for a new session: `docs/BARPO_AI_HANDOFF.md`.

## Project status (2026-11-05)

Everything below is merged into `main`. Work order and owner decisions: `docs/TZ_VA_NARX_REJASI.md` (D1–D34, section 3 table, "Video tahlili g‘oyalari (D23)" table). Business rules per feature: `docs/backend/BARPO_BUSINESS_RULES.md`.

- Stages 1–4 of the plan (pagination/search, server totals, 404/error states, charts, premises, UZS/USD display, price sheet), Figma stages F1–F6 (roles, stock, work, finance, platform), platform roles D21 (super admin with Telegram 2FA, support), Excel import for estimates and premises.
- PR #9 advance offset (`advance_offset`, D22) and "Subpudratchi" naming; PR #11 platform roles merge; PR #12 grouped number inputs (`NumericInput`, `1 000 000`); PR #13 button visibility and font-size setting (O.docx); PR #14 atomic 2FA code check, O3 (all money sums on the server), O12 (accounting by document date), O17 (UTC+5 date parsing); PR #15 role matrix coverage and V-D project finance card.
- Video-analysis ideas (D23, order D → A → B → E → C): V-D project finance card (`GET /v1/projects/:id` `finance`), V-A tasks linked to an estimate line with planned start (migration 025, `GET /v1/estimate-lines`), V-B multi-line material requests (migration 026, `group_id`), V-E floor × work progress matrix (`GET /v1/projects/:id/floor-progress`), V-C brigade piece-rate accounting (migration 027: `labor_rate`, `brigade_percent`, frozen rate on acceptance, `progress_payroll`, `GET /v1/me/earnings`, payroll `piece_rate`, advance settled first on payment).
- Estimates from external companies (D24–D32): estimate archiving stays with the tenant admin (D24); estimate Excel up to 10 MB and 20 000 rows (D25, D30); revision keeps line identity, tasks and facts (migration 028 `lineage_id`, D26–D27); floor matrix rows by work code + name + unit (D28); full Form 5 import (`backend/src/form5.ts`, `/v1/estimate-imports/form5/*`, D29); t ↔ kg auto-conversion on import (D31); Form 5 work-line piece rate from its labor resources × project percent, material aliases on stock receipt, units l/section/boiler/cycle/end and unit labels (migration 029, D32). Test reports: `docs/tests/FORM5_SMETALAR_TEKSHIRUV_2026_11_05.md`. Workbooks with links to other files are accepted; macros stay rejected (D34).
- Billing D33 (migration 030): the worker blocks an active company whose trial or paid period ended unpaid (`blockUnpaid`, `auto_blocked`); a covering payment reopens it in `recomputeCoverage`; a manual owner decision wins (`auto_blocked_for`, a payment never lifts a manual block).
- Automated suites as of 2026-11-05: unit 32, integration 102 checks, role matrix 10 roles × 83 GET routes with no findings, UI 60 checks. Expected counts grow with every feature; a lower count means a removed check and needs an explanation.
- Open: production readiness (hosting, PostgreSQL backup and restore, monitoring and error alerts, env and deploy procedure) and the consolidated manual test cases.

## Working rules learned in this project

- Immutable ledgers: `journal_entries`, `stock_ledger`, `progress_entries`, `finance_documents`, `audit_events`, `estimate_revisions`, `billing_entries`, `plan_versions`, `progress_corrections`, `progress_payroll` reject UPDATE and DELETE (trigger `reject_mutation`, error `IMMUTABLE_LEDGER` → 409 `INVARIANT_VIOLATION`). Never update them; add a new row (reversal, correction, link table) instead.
- Database check violations surface as 409 `INVARIANT_VIOLATION` without the constraint name. When one appears in a test, find the constraint or trigger before changing code.
- Price fields are redacted on `sensitive` routes for roles without `prices.read` (`redactPrices` list in `backend/src/permissions.ts`): add every new money or rate field name there. Foreman never sees sums (D20); the brigadier sees only own earnings.
- Every new GET route is picked up by `npm run test:roles` automatically; a route with `:id` needs an entry in the `ids`/`docIds` maps of `backend/scripts/role-tests.ts` only when its prefix is new (`unfillable` must stay empty).
- Migration file names must match `^\d{3}_[a-z_]+\.sql$` (no digits after the number; the integration suite asserts it). On a database with data, do not combine UPDATE and ALTER TABLE in one migration ("pending trigger events").
- Docker suites (`test:integration`, `test:roles`, `test:ui`) each start their own PostgreSQL 17 container and drop it; run at most two at a time (three concurrent runs caused a UI timeout). A background suite exits 0 even when the test failed: always read the log, not the wrapper exit code.
- The suites overwrite tracked report files in `docs/backend/` (`verification.json`, `role-verification.json`, `ui-verification.json`, `BARPO_ROLE_TEST_REPORT.md`, `platform-tenant-ui.png`, `ui-failure-*.png`). Restore them with `git checkout --` before committing; `npm run docs` output (`BARPO_API_OPENAPI.yaml`, `BARPO_DATABASE_SPEC.md`) is committed.
- Prettier: format a file only if it was Prettier-clean before your change (`git show HEAD:<file> | npx prettier --stdin-filepath <file>`); leave previously unformatted files as they are.
- Playwright `getByRole(..., { name })` matches substrings by default: use `exact: true` or a scoped locator when the same word appears in another cell; wait for the mutation result (a button disappearing) before counting elements.
- Branch workflow: develop on `main-vxg6su`, open a PR, the owner merges on GitHub and says "birlashtirdim"; then `git fetch origin main && git checkout -B main-vxg6su origin/main` only after confirming the merge commit is in `origin/main`. Commit messages end with the attribution lines from the session; push only after every suite passed.
- QA on a running local stack: `npm run qa:smoke` (full business flow over HTTP as every role, then deletes its `QA-<stamp>` company) and `npm run qa:cleanup -- <QA-key> | --all-qa`; procedure in `docs/tests/CLAUDE_CODE_PULL_TEKSHIRUVI.md`. Only companies whose registration key starts with `QA-` can be deleted.
- Manual test cases live in `docs/tests/` (one file per feature, table `ID | Qadam | Kutilgan natija`); the owner's end-to-end manual case: `docs/tests/QOLDA_TEST_CASE_2026_10_28.md`. Role and function reference for the owner: `docs/BARPO_ROLLAR_VA_FUNKSIYALAR.md` (PDF alongside).
