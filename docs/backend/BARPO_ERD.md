# BARPO AI — Domenlar bo‘yicha ERD

Bu diagrammalar konseptual bog‘lanishlarni ko‘rsatadi; har bir FKning aniq tenant/project composite tarkibi [database spetsifikatsiyasi](BARPO_DATABASE_SPEC.md) dagi executable DDLda berilgan. Cardinality bitta kompaniya/bitta rol modeliga mos.

## Identity va billing

```mermaid
erDiagram
  tenants ||--o{ users : employees
  users ||--o{ sessions : authenticates
  users ||--o{ password_resets : resets
  tenants ||--o{ invites : onboarding
  users ||--o{ invites : creates
  users ||--o{ tenant_aliases : private_alias
  tenants ||--o{ tenant_aliases : labelled
  plan_versions ||--o{ billing_invoices : prices
  tenants ||--o{ billing_invoices : owes
  billing_invoices ||--o{ billing_entries : settlement
  tenants ||--o| subscriptions : current_plan
  plan_versions ||--o{ subscriptions : selects
  tenants ||--o{ support_requests : recovery
  tenants ||--o{ role_page_permissions : configures
  tenants ||--o| permission_versions : concurrency
  users ||--o{ permission_overrides : grant_deny
```

`users.tenant_id` platforma rollarida NULL, tenant rollarida NOT NULL invariantiga ega. `role` bitta scalar. `one_tenant_admin` partial unique indeks bir faol egani ta’minlaydi.

## Obyekt, katalog, smeta

```mermaid
erDiagram
  tenants ||--o{ projects : owns
  projects ||--o{ project_assignments : assigns
  users ||--o{ project_assignments : works
  projects ||--o{ zones : contains
  zones o|--o{ zones : parent
  units ||--o{ catalog_materials : measures
  catalog_categories o|--o{ catalog_categories : parent
  catalog_categories o|--o{ catalog_materials : groups
  catalog_materials o|--o{ materials : maps
  tenants ||--o{ materials : private_catalog
  units ||--o{ materials : base_unit
  units ||--o{ unit_conversions : converts
  projects ||--o{ estimates : plans
  estimates ||--|{ estimate_revisions : history
  estimates ||--|{ estimate_lines : contains
  estimate_lines ||--o{ estimate_months : distributes
  materials o|--o{ estimate_lines : material_only
  zones o|--o{ estimate_lines : locates
  projects ||--o{ import_previews : validates
  estimates o|--o{ import_previews : commits
```

Smeta approvalsiz: revision va import preview — audit/validatsiya. Oldingi estimate_lines fizik o‘chirilmaydi.

## Ombor va moliya

```mermaid
erDiagram
  projects ||--o{ warehouses : contains
  warehouses ||--o{ warehouse_assignments : authorizes
  users ||--o{ warehouse_assignments : manages
  warehouses o|--o| stock_accounts : warehouse_account
  users o|--o{ stock_accounts : custody_account
  stock_accounts ||--o{ stock_balances : projection
  materials ||--o{ stock_balances : per_material
  stock_accounts o|--o{ stock_commands : from_to
  stock_commands ||--o{ stock_ledger : posts
  materials ||--o{ stock_commands : moves
  stock_accounts ||--o{ stock_ledger : balance_effect
  estimate_lines o|--o{ stock_commands : planned_source
  counterparties o|--o{ finance_documents : party
  cash_accounts o|--o{ finance_documents : cash_source
  stock_commands o|--o| finance_documents : receipt_matching
  finance_documents o|--o{ finance_documents : invoice_allocation
  finance_documents o|--o{ journal_entries : money_source
  stock_commands o|--o{ journal_entries : inventory_source
  projects ||--o{ journal_entries : cost_scope
  projects ||--o{ budgets : monthly_limit
```

Journal source XOR: finance_document_id yoki stock_command_id, faqat bittasi. Stock source `command_id+material_id+tenant_id` FK bilan bog‘langan. Reversal sourcega unique havola qiladi.

## Ish, fayl, ishonchli yetkazish

```mermaid
erDiagram
  projects ||--o{ tasks : organizes
  users ||--o{ tasks : assignee_reviewer
  projects ||--o{ reports : reports_on
  users ||--o{ reports : authors
  reports ||--o| progress_entries : accepted_once
  estimate_lines ||--o{ progress_entries : work_progress
  projects ||--o{ files : private
  reports o|--o{ files : photos
  tenants ||--o{ integration_connections : connects
  integration_connections ||--o{ integration_mappings : maps
  projects ||--o{ integration_mappings : local_target
  integration_connections ||--o{ integration_inbox : receives_once
  tenants ||--o{ outbox : durable_jobs
  users o|--o{ outbox : recipient
  users ||--o{ idempotency_keys : deduplicates
  users o|--o{ audit_events : actor
  tenants o|--o{ audit_events : tenant_scope
```

Integration inbox va mapping jadvallari tayyor infratuzilma; real provider adapterlari yo‘qligini ERDning mavjudligi o‘zgartirmaydi.
