# BARPO AI — Database spetsifikatsiyasi

Holat: ushbu DDL migratsiyalari haqiqiy PostgreSQL 17 da tekshiriladi. `verification.json` oxirgi natijani saqlaydi.

## Umumiy qoidalar

UUID PK — gen_random_uuid(); pul numeric(20,2); miqdor numeric(24,6); UTC timestamptz; biznes sanasi date. JSON decimal — string. FK lar ON DELETE/UPDATE NO ACTION (RESTRICT semantikasi, statement oxirida). Arxivlash alohida ustun/status; ledgerlar o‘chirilmaydi. Pastdagi bajariladigan DDL har ustun type, nullability, default, PK/FK/UNIQUE/CHECK, indeks, trigger va RLS siyosatining normativ manbasidir. `NOT NULL` yozilmagan ustun nullable; PRIMARY KEY esa implicit NOT NULL. Foreign key indeksi avtomatik yaratilmaydi; asosiy scope/join indekslari DDLda ko‘rsatilgan.

Auth/platform jadvallari umumiy: tenant_id ilova tomonidan parametr bilan cheklanadi. Operatsion jadvallarda FORCE RLS bor. Runtime barpo_app — NOSUPERUSER, NOBYPASSRLS, DDL vakolatisiz. Migratsiya credentiali APIga berilmaydi.

## Domenlar va jadvallar vazifasi

### Identity va billing

- `tenants`
- `users`
- `sessions`
- `invites`
- `password_resets`
- `tenant_aliases`
- `plan_versions`
- `subscriptions`
- `billing_invoices`
- `billing_entries`
- `support_requests`
- `telegram_link_tokens`
- `telegram_accounts`
- `telegram_bot_state`

### Resurs va ruxsat

- `projects`
- `project_assignments`
- `zones`
- `permission_overrides`
- `role_page_permissions`
- `permission_versions`
- `warehouses`
- `warehouse_assignments`

### Katalog va smeta

- `units`
- `unit_conversions`
- `catalog_categories`
- `catalog_materials`
- `materials`
- `estimates`
- `estimate_revisions`
- `estimate_lines`
- `estimate_months`
- `import_previews`

### Ombor

- `stock_accounts`
- `stock_balances`
- `stock_commands`
- `stock_ledger`

### Moliya

- `counterparties`
- `cash_accounts`
- `finance_documents`
- `journal_entries`
- `budgets`

### Ish va transport

- `tasks`
- `reports`
- `progress_entries`
- `files`
- `integration_connections`
- `integration_mappings`
- `integration_inbox`
- `outbox`
- `notifications`
- `idempotency_keys`
- `audit_events`

## 001_core.sql

```sql
CREATE TABLE tenants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), legal_name text NOT NULL, registration_key text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','blocked','archived')),
 block_reason text, trial_started_at timestamptz, trial_ends_at timestamptz, paid_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1,
 CHECK ((trial_started_at IS NULL) = (trial_ends_at IS NULL)), CHECK (trial_ends_at = trial_started_at + interval '14 days')
);
CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES tenants(id), login text NOT NULL UNIQUE CHECK(login=lower(login)),
 display_name text NOT NULL, password_hash text NOT NULL, role text NOT NULL CHECK(role IN ('super_admin','platform_owner','support','tenant_admin','foreman','brigadier','warehouse_manager','financier','accountant','manager')),
 active boolean NOT NULL DEFAULT true, must_change_password boolean NOT NULL DEFAULT false,
 telegram_id text UNIQUE, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), CHECK ((tenant_id IS NULL) = (role IN ('super_admin','platform_owner','support')))
);
CREATE UNIQUE INDEX one_tenant_admin ON users(tenant_id) WHERE role='tenant_admin' AND active;
CREATE TABLE sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), expires_at timestamptz NOT NULL,
 revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE invites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL, used_at timestamptz, revoked_at timestamptz,
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_live_invite ON invites(tenant_id) WHERE used_at IS NULL AND revoked_at IS NULL;
CREATE TABLE password_resets (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), expires_at timestamptz NOT NULL, used_at timestamptz
);
CREATE TABLE tenant_aliases (
 owner_id uuid NOT NULL REFERENCES users(id), tenant_id uuid NOT NULL REFERENCES tenants(id), alias text NOT NULL,
 PRIMARY KEY(owner_id,tenant_id)
);
CREATE TABLE plan_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL, version integer NOT NULL CHECK(version>0),
 monthly_price numeric(20,2) NOT NULL CHECK(monthly_price>=0), currency text NOT NULL DEFAULT 'UZS' CHECK(currency='UZS'),
 limits jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(code,version)
);
CREATE TABLE subscriptions (
 tenant_id uuid PRIMARY KEY REFERENCES tenants(id), plan_version_id uuid NOT NULL REFERENCES plan_versions(id),
 next_period_start timestamptz NOT NULL, auto_block boolean NOT NULL DEFAULT false
);
CREATE TABLE billing_invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), plan_version_id uuid NOT NULL REFERENCES plan_versions(id),
 period_start timestamptz NOT NULL, period_end timestamptz NOT NULL, due_at timestamptz NOT NULL,
 amount numeric(20,2) NOT NULL CHECK(amount>0), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,period_start), UNIQUE(tenant_id,id), CHECK(period_end>period_start)
);
CREATE TABLE billing_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), invoice_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('payment','credit','refund')), amount numeric(20,2) NOT NULL CHECK(amount>0),
 external_ref text NOT NULL UNIQUE, reason text NOT NULL, created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(tenant_id,invoice_id) REFERENCES billing_invoices(tenant_id,id)
);
CREATE TABLE support_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('support','plan_change')), message text NOT NULL, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
 created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id)
);
CREATE TABLE projects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), name text NOT NULL,
 planned_start date, planned_end date, actual_start date, actual_end date, forecast_end date,
 archived_at timestamptz, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
 CHECK(planned_end>=planned_start), CHECK(actual_end>=actual_start)
);
CREATE TABLE project_assignments (
 tenant_id uuid NOT NULL, project_id uuid NOT NULL, user_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,project_id,user_id), FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id), FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id)
);
CREATE TABLE zones (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, project_id uuid NOT NULL, parent_id uuid, name text NOT NULL,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,project_id,id), FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id),
 FOREIGN KEY(tenant_id,project_id,parent_id) REFERENCES zones(tenant_id,project_id,id), CHECK(id<>parent_id)
);
CREATE TABLE permission_overrides (
 tenant_id uuid NOT NULL, user_id uuid NOT NULL, permission text NOT NULL, effect text NOT NULL CHECK(effect IN ('grant','deny')),
 PRIMARY KEY(tenant_id,user_id,permission), FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id)
);
CREATE TABLE units (id text PRIMARY KEY, name text NOT NULL, dimension text NOT NULL);
INSERT INTO units VALUES ('kg','Kilogramm','mass'),('t','Tonna','mass'),('m','Metr','length'),('m2','Kvadrat metr','area'),('m3','Kub metr','volume'),('pcs','Dona','count'),('hour','Soat','time');
CREATE TABLE unit_conversions (
 from_id text NOT NULL REFERENCES units(id), to_id text NOT NULL REFERENCES units(id), factor numeric(24,9) NOT NULL CHECK(factor>0), PRIMARY KEY(from_id,to_id)
);
INSERT INTO unit_conversions VALUES ('t','kg',1000),('kg','t',0.001);
CREATE TABLE catalog_categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), parent_id uuid REFERENCES catalog_categories(id), name text NOT NULL, CHECK(id<>parent_id));
CREATE TABLE catalog_materials (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category_id uuid REFERENCES catalog_categories(id), name text NOT NULL, unit_id text NOT NULL REFERENCES units(id), archived_at timestamptz);
CREATE TABLE materials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), catalog_id uuid REFERENCES catalog_materials(id), name text NOT NULL,
 unit_id text NOT NULL REFERENCES units(id), archived_at timestamptz, UNIQUE(tenant_id,id)
);
CREATE TABLE warehouses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, project_id uuid NOT NULL, name text NOT NULL,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,project_id,id), FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id)
);
CREATE TABLE warehouse_assignments (
 tenant_id uuid NOT NULL, warehouse_id uuid NOT NULL, user_id uuid NOT NULL, PRIMARY KEY(tenant_id,warehouse_id,user_id),
 FOREIGN KEY(tenant_id,warehouse_id) REFERENCES warehouses(tenant_id,id), FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id)
);
CREATE TABLE estimates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, project_id uuid NOT NULL, name text NOT NULL,
 revision integer NOT NULL DEFAULT 1, archived_at timestamptz, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,project_id,id), FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id), FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE estimate_revisions (
 tenant_id uuid NOT NULL, estimate_id uuid NOT NULL, revision integer NOT NULL, snapshot jsonb NOT NULL,
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,estimate_id,revision),
 FOREIGN KEY(tenant_id,estimate_id) REFERENCES estimates(tenant_id,id), FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE estimate_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, project_id uuid NOT NULL, estimate_id uuid NOT NULL,
 zone_id uuid, material_id uuid, kind text NOT NULL CHECK(kind IN ('material','labor','equipment','service')),
 description text NOT NULL, unit_id text NOT NULL REFERENCES units(id), quantity numeric(24,6) NOT NULL CHECK(quantity>=0),
 norm numeric(24,6) CHECK(norm>=0), work_quantity numeric(24,6) CHECK(work_quantity>=0), loss_percent numeric(10,6) NOT NULL DEFAULT 0 CHECK(loss_percent>=0),
 effective_quantity numeric(24,6) NOT NULL CHECK(effective_quantity>=0), unit_price numeric(20,2) NOT NULL CHECK(unit_price>=0),
 total numeric(20,2) NOT NULL CHECK(total>=0), archived_at timestamptz, UNIQUE(tenant_id,id), UNIQUE(tenant_id,project_id,id),
 CHECK ((norm IS NULL)=(work_quantity IS NULL)), CHECK((kind='material')=(material_id IS NOT NULL)),
 FOREIGN KEY(tenant_id,project_id,estimate_id) REFERENCES estimates(tenant_id,project_id,id),
 FOREIGN KEY(tenant_id,project_id,zone_id) REFERENCES zones(tenant_id,project_id,id), FOREIGN KEY(tenant_id,material_id) REFERENCES materials(tenant_id,id)
);
CREATE TABLE estimate_months (
 tenant_id uuid NOT NULL, line_id uuid NOT NULL, month date NOT NULL CHECK(extract(day FROM month)=1), quantity numeric(24,6) NOT NULL CHECK(quantity>=0),
 PRIMARY KEY(tenant_id,line_id,month), FOREIGN KEY(tenant_id,line_id) REFERENCES estimate_lines(tenant_id,id)
);
CREATE TABLE import_previews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, project_id uuid NOT NULL, created_by uuid NOT NULL,
 payload jsonb NOT NULL, digest text NOT NULL, expires_at timestamptz NOT NULL, committed_estimate_id uuid,
 FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id), FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id),
 FOREIGN KEY(tenant_id,committed_estimate_id) REFERENCES estimates(tenant_id,id)
);
CREATE TABLE stock_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, project_id uuid NOT NULL, warehouse_id uuid, custodian_id uuid,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,project_id,id), UNIQUE(tenant_id,warehouse_id), UNIQUE(tenant_id,project_id,custodian_id),
 CHECK((warehouse_id IS NULL)<>(custodian_id IS NULL)),
 FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id), FOREIGN KEY(tenant_id,project_id,warehouse_id) REFERENCES warehouses(tenant_id,project_id,id),
 FOREIGN KEY(tenant_id,custodian_id) REFERENCES users(tenant_id,id)
);
CREATE TABLE stock_balances (
 tenant_id uuid NOT NULL, account_id uuid NOT NULL, material_id uuid NOT NULL, quantity numeric(24,6) NOT NULL DEFAULT 0 CHECK(quantity>=0),
 reserved numeric(24,6) NOT NULL DEFAULT 0 CHECK(reserved>=0 AND reserved<=quantity), value numeric(20,2) NOT NULL DEFAULT 0 CHECK(value>=0),
 minimum_quantity numeric(24,6) NOT NULL DEFAULT 0 CHECK(minimum_quantity>=0), PRIMARY KEY(tenant_id,account_id,material_id),
 FOREIGN KEY(tenant_id,account_id) REFERENCES stock_accounts(tenant_id,id), FOREIGN KEY(tenant_id,material_id) REFERENCES materials(tenant_id,id)
);
CREATE TABLE stock_commands (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, project_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('opening','receipt','transfer','consumption','return','adjustment','reversal')),
 material_id uuid NOT NULL, from_account_id uuid, to_account_id uuid, quantity numeric(24,6) NOT NULL CHECK(quantity>0),
 unit_cost numeric(20,6) CHECK(unit_cost>=0), accepted_quantity numeric(24,6) NOT NULL DEFAULT 0 CHECK(accepted_quantity>=0 AND accepted_quantity<=quantity),
 status text NOT NULL CHECK(status IN ('pending','partial','posted','cancelled','disputed')), estimate_line_id uuid, zone_id uuid,
 reverses_id uuid, reason text NOT NULL, created_by uuid NOT NULL, reviewed_by uuid, version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,reverses_id),
 FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id), FOREIGN KEY(tenant_id,material_id) REFERENCES materials(tenant_id,id),
 FOREIGN KEY(tenant_id,project_id,from_account_id) REFERENCES stock_accounts(tenant_id,project_id,id), FOREIGN KEY(tenant_id,project_id,to_account_id) REFERENCES stock_accounts(tenant_id,project_id,id),
 FOREIGN KEY(tenant_id,project_id,estimate_line_id) REFERENCES estimate_lines(tenant_id,project_id,id), FOREIGN KEY(tenant_id,project_id,zone_id) REFERENCES zones(tenant_id,project_id,id),
 FOREIGN KEY(tenant_id,reverses_id) REFERENCES stock_commands(tenant_id,id), FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id), FOREIGN KEY(tenant_id,reviewed_by) REFERENCES users(tenant_id,id),
 CHECK(from_account_id IS DISTINCT FROM to_account_id)
);
CREATE TABLE stock_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, command_id uuid NOT NULL, account_id uuid NOT NULL, material_id uuid NOT NULL,
 effect_key text NOT NULL, quantity_delta numeric(24,6) NOT NULL, value_delta numeric(20,2) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,effect_key,account_id), FOREIGN KEY(tenant_id,command_id) REFERENCES stock_commands(tenant_id,id),
 FOREIGN KEY(tenant_id,account_id) REFERENCES stock_accounts(tenant_id,id), FOREIGN KEY(tenant_id,material_id) REFERENCES materials(tenant_id,id)
);
CREATE INDEX stock_ledger_balance ON stock_ledger(tenant_id,account_id,material_id,created_at);
CREATE TABLE counterparties (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), name text NOT NULL, kind text NOT NULL CHECK(kind IN ('supplier','contractor','customer')), UNIQUE(tenant_id,id)
);
CREATE TABLE cash_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), name text NOT NULL, kind text NOT NULL CHECK(kind IN ('bank','cash')), UNIQUE(tenant_id,id)
);
CREATE TABLE finance_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, project_id uuid NOT NULL, zone_id uuid, counterparty_id uuid,
 kind text NOT NULL CHECK(kind IN ('allocation','purchase_order','supplier_invoice','opening_debt','labor','equipment','service','payment','receipt','advance','cash_transfer','reversal')),
 amount numeric(20,2) NOT NULL CHECK(amount>0), currency text NOT NULL DEFAULT 'UZS' CHECK(currency='UZS'),
 cash_account_id uuid, target_cash_account_id uuid, matched_receipt_id uuid, allocated_invoice_id uuid, reverses_id uuid,
 external_ref text, description text NOT NULL, document_date date NOT NULL, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,project_id,id), UNIQUE(tenant_id,external_ref), UNIQUE(tenant_id,reverses_id), UNIQUE(tenant_id,matched_receipt_id),
 FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id), FOREIGN KEY(tenant_id,project_id,zone_id) REFERENCES zones(tenant_id,project_id,id),
 FOREIGN KEY(tenant_id,counterparty_id) REFERENCES counterparties(tenant_id,id), FOREIGN KEY(tenant_id,cash_account_id) REFERENCES cash_accounts(tenant_id,id),
 FOREIGN KEY(tenant_id,target_cash_account_id) REFERENCES cash_accounts(tenant_id,id), FOREIGN KEY(tenant_id,matched_receipt_id) REFERENCES stock_commands(tenant_id,id),
 FOREIGN KEY(tenant_id,project_id,allocated_invoice_id) REFERENCES finance_documents(tenant_id,project_id,id), FOREIGN KEY(tenant_id,reverses_id) REFERENCES finance_documents(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE journal_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, project_id uuid NOT NULL, finance_document_id uuid, stock_command_id uuid,
 account text NOT NULL CHECK(account IN ('inventory','expense','cash','payable','advance','income','clearing','opening_equity')),
 cash_account_id uuid, counterparty_id uuid, amount numeric(20,2) NOT NULL CHECK(amount<>0), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((finance_document_id IS NULL)<>(stock_command_id IS NULL)), FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id),
 FOREIGN KEY(tenant_id,finance_document_id) REFERENCES finance_documents(tenant_id,id), FOREIGN KEY(tenant_id,stock_command_id) REFERENCES stock_commands(tenant_id,id),
 FOREIGN KEY(tenant_id,cash_account_id) REFERENCES cash_accounts(tenant_id,id), FOREIGN KEY(tenant_id,counterparty_id) REFERENCES counterparties(tenant_id,id)
);
CREATE INDEX journal_project ON journal_entries(tenant_id,project_id,account,created_at);
CREATE TABLE budgets (
 tenant_id uuid NOT NULL, project_id uuid NOT NULL, month date NOT NULL CHECK(extract(day FROM month)=1), amount numeric(20,2) NOT NULL CHECK(amount>=0),
 PRIMARY KEY(tenant_id,project_id,month), FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id)
);
CREATE TABLE tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, project_id uuid NOT NULL, zone_id uuid,
 title text NOT NULL, assignee_id uuid NOT NULL, reviewer_id uuid NOT NULL, priority text NOT NULL CHECK(priority IN ('low','normal','high','urgent')),
 deadline timestamptz, status text NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','submitted','returned','accepted')),
 version integer NOT NULL DEFAULT 1, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id), FOREIGN KEY(tenant_id,project_id,zone_id) REFERENCES zones(tenant_id,project_id,id),
 FOREIGN KEY(tenant_id,assignee_id) REFERENCES users(tenant_id,id), FOREIGN KEY(tenant_id,reviewer_id) REFERENCES users(tenant_id,id), FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, project_id uuid NOT NULL, zone_id uuid, author_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('daily','weekly')), report_date date NOT NULL, content text NOT NULL, progress_quantity numeric(24,6) CHECK(progress_quantity>=0),
 estimate_line_id uuid, forecast_end date, status text NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','returned','accepted')),
 version integer NOT NULL DEFAULT 1, reviewed_by uuid, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id), FOREIGN KEY(tenant_id,project_id,zone_id) REFERENCES zones(tenant_id,project_id,id),
 FOREIGN KEY(tenant_id,project_id,estimate_line_id) REFERENCES estimate_lines(tenant_id,project_id,id), FOREIGN KEY(tenant_id,author_id) REFERENCES users(tenant_id,id), FOREIGN KEY(tenant_id,reviewed_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE progress_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, report_id uuid NOT NULL, estimate_line_id uuid NOT NULL,
 quantity numeric(24,6) NOT NULL CHECK(quantity>=0), UNIQUE(tenant_id,report_id),
 FOREIGN KEY(tenant_id,report_id) REFERENCES reports(tenant_id,id), FOREIGN KEY(tenant_id,estimate_line_id) REFERENCES estimate_lines(tenant_id,id)
);
CREATE TABLE files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, project_id uuid NOT NULL, report_id uuid, name text NOT NULL,
 mime_type text NOT NULL, size integer NOT NULL CHECK(size>0 AND size<=5242880), sha256 text NOT NULL, storage_key text NOT NULL UNIQUE,
 uploaded_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id), FOREIGN KEY(tenant_id,report_id) REFERENCES reports(tenant_id,id), FOREIGN KEY(tenant_id,uploaded_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE integration_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), provider text NOT NULL CHECK(provider IN ('telegram','uysot','bank','didox','ihamkor','camera','saas_payment')),
 status text NOT NULL DEFAULT 'not_configured' CHECK(status IN ('not_configured','healthy','stale','error')), cursor text, last_success_at timestamptz, last_error_code text,
 UNIQUE(tenant_id,provider), UNIQUE(tenant_id,id)
);
CREATE TABLE integration_mappings (
 tenant_id uuid NOT NULL, connection_id uuid NOT NULL, external_id text NOT NULL, project_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,connection_id,external_id), FOREIGN KEY(tenant_id,connection_id) REFERENCES integration_connections(tenant_id,id), FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id)
);
CREATE TABLE integration_inbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, connection_id uuid NOT NULL, external_event_id text NOT NULL,
 event_type text NOT NULL, payload jsonb NOT NULL, occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processed','dead')), attempts integer NOT NULL DEFAULT 0, error_code text,
 UNIQUE(tenant_id,connection_id,external_event_id), FOREIGN KEY(tenant_id,connection_id) REFERENCES integration_connections(tenant_id,id)
);
CREATE TABLE outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), project_id uuid, recipient_id uuid,
 kind text NOT NULL, payload jsonb NOT NULL, dedup_key text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','done','dead')),
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), error_code text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,dedup_key), FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id), FOREIGN KEY(tenant_id,recipient_id) REFERENCES users(tenant_id,id)
);
CREATE INDEX outbox_pending ON outbox(tenant_id,available_at) WHERE status='pending';
CREATE TABLE idempotency_keys (
 tenant_id uuid NOT NULL, actor_id uuid NOT NULL, key text NOT NULL, request_hash text NOT NULL, response jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,actor_id,key), FOREIGN KEY(tenant_id,actor_id) REFERENCES users(tenant_id,id)
);
CREATE TABLE audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES tenants(id), actor_id uuid REFERENCES users(id),
 action text NOT NULL, resource_id uuid, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_tenant ON audit_events(tenant_id,created_at,id);

CREATE FUNCTION reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'IMMUTABLE_LEDGER' USING ERRCODE='23514'; END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['stock_ledger','journal_entries','billing_entries','audit_events','estimate_revisions','progress_entries','finance_documents','plan_versions'] LOOP
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_mutation()',t);
 END LOOP;
END $$;
CREATE FUNCTION check_journal_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE net numeric;
BEGIN
 SELECT coalesce(sum(amount),0) INTO net FROM journal_entries
 WHERE tenant_id=NEW.tenant_id AND ((NEW.finance_document_id IS NOT NULL AND finance_document_id=NEW.finance_document_id) OR (NEW.stock_command_id IS NOT NULL AND stock_command_id=NEW.stock_command_id));
 IF net<>0 THEN RAISE EXCEPTION 'UNBALANCED_JOURNAL' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER balanced_journal AFTER INSERT ON journal_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_journal_balance();

-- Auth/platform tables are deliberately separate: no tenant context exists before login.
-- All operational tenant tables fail closed without SET LOCAL app.tenant_id.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['projects','project_assignments','zones','permission_overrides','materials','warehouses','warehouse_assignments','estimates','estimate_revisions','estimate_lines','estimate_months','import_previews','stock_accounts','stock_balances','stock_commands','stock_ledger','counterparties','cash_accounts','finance_documents','journal_entries','budgets','tasks','reports','progress_entries','files','integration_connections','integration_mappings','integration_inbox','outbox','idempotency_keys'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
 END LOOP;
END $$;

```

## 002_page_permissions.sql

```sql
CREATE TABLE role_page_permissions (
 tenant_id uuid NOT NULL REFERENCES tenants(id), role text NOT NULL CHECK(role IN ('foreman','brigadier','warehouse_manager','financier','accountant','manager')),
 page text NOT NULL CHECK(page IN ('dashboard','projects','employees','estimates','stock','finance','tasks','reports','files','integrations','camera','billing','settings','permissions','audit')),
 action text NOT NULL CHECK(action IN ('create','read','update','delete')), allowed boolean NOT NULL,
 updated_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,role,page,action),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE permission_versions (tenant_id uuid PRIMARY KEY REFERENCES tenants(id), version integer NOT NULL DEFAULT 1 CHECK(version>0));
ALTER TABLE role_page_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_page_permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON role_page_permissions USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
ALTER TABLE permission_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON permission_versions USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);

```

## 003_invariants.sql

```sql
ALTER TABLE tasks ADD COLUMN archived_at timestamptz;
ALTER TABLE reports ADD COLUMN archived_at timestamptz;
ALTER TABLE files ADD COLUMN archived_at timestamptz;
ALTER TABLE stock_commands ADD CONSTRAINT stock_command_source_unique UNIQUE(tenant_id,id,material_id);
ALTER TABLE stock_ledger ADD CONSTRAINT ledger_material_source_fk FOREIGN KEY(tenant_id,command_id,material_id) REFERENCES stock_commands(tenant_id,id,material_id);
ALTER TABLE finance_documents ADD CONSTRAINT finance_project_source_unique UNIQUE(tenant_id,id,project_id);
ALTER TABLE stock_commands ADD CONSTRAINT stock_project_source_unique UNIQUE(tenant_id,id,project_id);
ALTER TABLE journal_entries ADD CONSTRAINT journal_finance_project_fk FOREIGN KEY(tenant_id,finance_document_id,project_id) REFERENCES finance_documents(tenant_id,id,project_id);
ALTER TABLE journal_entries ADD CONSTRAINT journal_stock_project_fk FOREIGN KEY(tenant_id,stock_command_id,project_id) REFERENCES stock_commands(tenant_id,id,project_id);
ALTER TABLE reports ADD CONSTRAINT report_project_unique UNIQUE(tenant_id,project_id,id);
ALTER TABLE files ADD CONSTRAINT file_report_project_fk FOREIGN KEY(tenant_id,project_id,report_id) REFERENCES reports(tenant_id,project_id,id);
CREATE FUNCTION check_month_sum() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t uuid; l uuid; planned numeric; allocated numeric; n integer;
BEGIN
 t=NEW.tenant_id;
 IF TG_TABLE_NAME='estimate_lines' THEN l=NEW.id; ELSE l=NEW.line_id; END IF;
 SELECT effective_quantity INTO planned FROM estimate_lines WHERE tenant_id=t AND id=l FOR UPDATE;
 SELECT count(*),sum(quantity) INTO n,allocated FROM estimate_months WHERE tenant_id=t AND line_id=l;
 IF n>0 AND allocated<>planned THEN RAISE EXCEPTION 'MONTH_QUANTITY_MISMATCH' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER check_month_total AFTER INSERT OR UPDATE ON estimate_months DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_month_sum();
CREATE CONSTRAINT TRIGGER check_line_month_total AFTER INSERT OR UPDATE ON estimate_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_month_sum();
CREATE FUNCTION check_stock_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE q numeric; v numeric; b stock_balances;
BEGIN
 SELECT coalesce(sum(quantity_delta),0),coalesce(sum(value_delta),0) INTO q,v FROM stock_ledger WHERE tenant_id=NEW.tenant_id AND account_id=NEW.account_id AND material_id=NEW.material_id;
 SELECT * INTO b FROM stock_balances WHERE tenant_id=NEW.tenant_id AND account_id=NEW.account_id AND material_id=NEW.material_id;
 IF b.quantity IS DISTINCT FROM q OR b.value IS DISTINCT FROM v THEN RAISE EXCEPTION 'STOCK_PROJECTION_MISMATCH' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER balance_matches_ledger AFTER INSERT OR UPDATE ON stock_balances DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_stock_projection();
CREATE CONSTRAINT TRIGGER ledger_matches_balance AFTER INSERT ON stock_ledger DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_stock_projection();
CREATE FUNCTION protect_trial() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.trial_started_at IS NOT NULL AND (NEW.trial_started_at IS DISTINCT FROM OLD.trial_started_at OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at) THEN RAISE EXCEPTION 'TRIAL_IMMUTABLE' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER trial_once BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION protect_trial();
CREATE INDEX tasks_scope ON tasks(tenant_id,project_id,assignee_id,status);
CREATE INDEX reports_scope ON reports(tenant_id,project_id,author_id,report_date);
CREATE INDEX estimates_scope ON estimates(tenant_id,project_id,created_at);
CREATE INDEX finance_scope ON finance_documents(tenant_id,project_id,document_date);

```

## 004_financial_page_permissions.sql

```sql
ALTER TABLE role_page_permissions DROP CONSTRAINT role_page_permissions_page_check;
ALTER TABLE role_page_permissions ADD CONSTRAINT role_page_permissions_page_check CHECK(page IN (
 'dashboard','projects','employees','estimates','stock','finance','tasks','reports','files','integrations','camera','billing','settings','permissions','audit',
 'accounting_documents','invoices','bank_cash','counterparties','payroll','reconciliation','financial_reports','allocations','budgets','plan_actual','forecast','payment_requests','payment_calendar'
));

```

## 005_budget_version.sql

```sql
ALTER TABLE budgets ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version>0);

```

## 006_identity_telegram_notifications.sql

```sql
-- Telefon orqali login: E.164 ko'rinishida normalizatsiya qilingan, global unique.
ALTER TABLE users ADD COLUMN phone text UNIQUE CHECK (phone ~ '^\+998[0-9]{9}$');

-- Telegram ulash: bir martalik, qisqa muddatli, hash holida saqlanadigan token.
CREATE TABLE telegram_link_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX telegram_link_tokens_user ON telegram_link_tokens(user_id) WHERE used_at IS NULL;

-- Bir foydalanuvchi = bitta faol Telegram akkaunt; bitta Telegram akkaunt = bitta foydalanuvchi.
CREATE TABLE telegram_accounts (
 user_id uuid PRIMARY KEY REFERENCES users(id), telegram_user_id text NOT NULL UNIQUE CHECK (telegram_user_id ~ '^[0-9]{1,20}$'),
 telegram_username text, telegram_first_name text, telegram_last_name text,
 chat_state jsonb NOT NULL DEFAULT '{}', linked_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz
);
INSERT INTO telegram_accounts(user_id,telegram_user_id) SELECT id,telegram_id FROM users WHERE telegram_id IS NOT NULL;
ALTER TABLE users DROP COLUMN telegram_id;

-- Telegram bot long-polling offset (bitta qator).
CREATE TABLE telegram_bot_state (id boolean PRIMARY KEY DEFAULT true CHECK(id), update_offset bigint NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO telegram_bot_state DEFAULT VALUES;

-- Ilova ichidagi bildirishnomalar markazi. Platforma xodimlari uchun tenant_id NULL.
CREATE TABLE notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES tenants(id), user_id uuid NOT NULL REFERENCES users(id),
 project_id uuid, kind text NOT NULL, title text NOT NULL, body text NOT NULL, payload jsonb NOT NULL DEFAULT '{}',
 read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id)
);
CREATE INDEX notifications_user ON notifications(user_id,created_at DESC) ;
CREATE INDEX notifications_unread ON notifications(user_id) WHERE read_at IS NULL;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notifications
 USING (tenant_id IS NULL OR tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK (tenant_id IS NULL OR tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

-- Outbox: platforma xodimlariga ham yetkazish uchun tenant_id ixtiyoriy bo'ladi.
ALTER TABLE outbox ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE outbox DROP CONSTRAINT outbox_tenant_id_recipient_id_fkey;
ALTER TABLE outbox ADD CONSTRAINT outbox_recipient_fk FOREIGN KEY(recipient_id) REFERENCES users(id);
DROP POLICY tenant_isolation ON outbox;
CREATE POLICY tenant_isolation ON outbox
 USING (tenant_id IS NULL OR tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK (tenant_id IS NULL OR tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
ALTER TABLE outbox DROP CONSTRAINT outbox_tenant_id_dedup_key_key;
CREATE UNIQUE INDEX outbox_dedup ON outbox(coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid),dedup_key);

-- Sessiya kanali: brauzer cookie yoki Bearer. Audit uchun saqlanadi.
ALTER TABLE sessions ADD COLUMN channel text NOT NULL DEFAULT 'bearer' CHECK (channel IN ('bearer','cookie'));

```

## 007_project_profile.sql

```sql
-- Obyekt kartasi: kod, manzil, buyurtmachi, tavsif va ish holati (arxivlash alohida ustun).
ALTER TABLE projects
 ADD COLUMN code text,
 ADD COLUMN address text,
 ADD COLUMN customer_name text,
 ADD COLUMN description text,
 ADD COLUMN status text NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','active','paused','completed'));
CREATE UNIQUE INDEX projects_code_unique ON projects(tenant_id, lower(code)) WHERE code IS NOT NULL AND archived_at IS NULL;
-- Xodim lavozimi (erkin matn) va ish boshlagan sana; rol alohida qoladi.
ALTER TABLE users ADD COLUMN position text, ADD COLUMN hired_at date;

```

## 008_estimate_line_meta.sql

```sql
-- Smeta qatori: kategoriya (guruhlash), izoh va ko'rsatish tartibi. Tarixiy qatorlarga ta'sir qilmaydi.
ALTER TABLE estimate_lines
 ADD COLUMN category text,
 ADD COLUMN note text,
 ADD COLUMN position integer NOT NULL DEFAULT 0;
CREATE INDEX estimate_lines_order ON estimate_lines(tenant_id, estimate_id, position, id) WHERE archived_at IS NULL;

```

## 009_material_requests.sql

```sql
-- Material so'rovi: brigadir/prorab so'raydi, ombor mudiri jo'natish (transfer) bilan bajaradi.
-- So'rovning o'zi qoldiqni o'zgartirmaydi; faqat bajarilganda stock_command yaratiladi.
CREATE TABLE material_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, project_id uuid NOT NULL, material_id uuid NOT NULL,
 zone_id uuid, requested_by uuid NOT NULL, quantity numeric(24,6) NOT NULL CHECK(quantity>0), needed_by date, note text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','fulfilled','rejected','cancelled')),
 fulfilled_command_id uuid, reviewed_by uuid, review_note text, reviewed_at timestamptz,
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id),
 FOREIGN KEY(tenant_id,material_id) REFERENCES materials(tenant_id,id),
 FOREIGN KEY(tenant_id,project_id,zone_id) REFERENCES zones(tenant_id,project_id,id),
 FOREIGN KEY(tenant_id,requested_by) REFERENCES users(tenant_id,id),
 FOREIGN KEY(tenant_id,reviewed_by) REFERENCES users(tenant_id,id),
 FOREIGN KEY(tenant_id,fulfilled_command_id) REFERENCES stock_commands(tenant_id,id)
);
CREATE INDEX material_requests_scope ON material_requests(tenant_id,project_id,status,created_at);
ALTER TABLE material_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON material_requests USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

```

## 010_finance_workflow.sql

```sql
-- Moliya oqimlari: to'lov muddati, kontragent rekvizitlari, to'lov so'rovlari va ish haqi davrlari.
ALTER TABLE finance_documents ADD COLUMN due_date date;
ALTER TABLE finance_documents ADD COLUMN reference text;
CREATE INDEX finance_due ON finance_documents(tenant_id, due_date) WHERE due_date IS NOT NULL;

ALTER TABLE counterparties DROP CONSTRAINT counterparties_kind_check;
ALTER TABLE counterparties ADD CONSTRAINT counterparties_kind_check CHECK (kind IN ('supplier','contractor','customer','employee'));
ALTER TABLE counterparties
 ADD COLUMN inn text, ADD COLUMN phone text, ADD COLUMN contact text, ADD COLUMN bank_details text, ADD COLUMN note text,
 ADD COLUMN employee_id uuid, ADD COLUMN archived_at timestamptz, ADD COLUMN version integer NOT NULL DEFAULT 1,
 ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE counterparties ADD CONSTRAINT counterparties_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES users(tenant_id,id);
CREATE UNIQUE INDEX counterparties_employee_unique ON counterparties(tenant_id, employee_id) WHERE employee_id IS NOT NULL;

ALTER TABLE cash_accounts ADD COLUMN account_number text, ADD COLUMN bank_name text, ADD COLUMN archived_at timestamptz, ADD COLUMN version integer NOT NULL DEFAULT 1;

-- To'lov so'rovi: finansist/prorab so'raydi, tasdiqlanadi, buxgalter kassadan/bankdan to'laydi (payment hujjati).
CREATE TABLE payment_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, project_id uuid NOT NULL, counterparty_id uuid NOT NULL,
 document_id uuid, amount numeric(20,2) NOT NULL CHECK(amount>0), due_date date, purpose text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','paid','cancelled')),
 requested_by uuid NOT NULL, approved_by uuid, approved_at timestamptz, decision_note text,
 payment_document_id uuid, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id),
 FOREIGN KEY(tenant_id,counterparty_id) REFERENCES counterparties(tenant_id,id),
 FOREIGN KEY(tenant_id,document_id) REFERENCES finance_documents(tenant_id,id),
 FOREIGN KEY(tenant_id,payment_document_id) REFERENCES finance_documents(tenant_id,id),
 FOREIGN KEY(tenant_id,requested_by) REFERENCES users(tenant_id,id),
 FOREIGN KEY(tenant_id,approved_by) REFERENCES users(tenant_id,id)
);
CREATE INDEX payment_requests_scope ON payment_requests(tenant_id,project_id,status,due_date);

-- Ish haqi: oylik davr, xodim bo'yicha oklad/bonus/ushlanma; davr yopilganda labor hujjatlari, to'lovda payment hujjatlari.
CREATE TABLE payroll_periods (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), project_id uuid NOT NULL,
 month date NOT NULL CHECK(extract(day FROM month)=1), status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','posted','closed')),
 posted_at timestamptz, posted_by uuid, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,project_id,month),
 FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id), FOREIGN KEY(tenant_id,posted_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE payroll_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, period_id uuid NOT NULL, employee_id uuid NOT NULL,
 position text, base_salary numeric(20,2) NOT NULL DEFAULT 0 CHECK(base_salary>=0), bonus numeric(20,2) NOT NULL DEFAULT 0 CHECK(bonus>=0),
 deduction numeric(20,2) NOT NULL DEFAULT 0 CHECK(deduction>=0), net numeric(20,2) GENERATED ALWAYS AS (base_salary+bonus-deduction) STORED,
 note text, labor_document_id uuid, payment_document_id uuid, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','posted','paid')),
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,period_id,employee_id), CHECK(base_salary+bonus-deduction>=0),
 FOREIGN KEY(tenant_id,period_id) REFERENCES payroll_periods(tenant_id,id),
 FOREIGN KEY(tenant_id,employee_id) REFERENCES users(tenant_id,id),
 FOREIGN KEY(tenant_id,labor_document_id) REFERENCES finance_documents(tenant_id,id),
 FOREIGN KEY(tenant_id,payment_document_id) REFERENCES finance_documents(tenant_id,id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['payment_requests','payroll_periods','payroll_entries'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
 END LOOP;
END $$;

```

## 011_tasks_reports_files.sql

```sql
-- Vazifa tavsifi, vazifaga fayl biriktirish va qabul qilingan progressni o'zgarmas tuzatish yozuvlari.
ALTER TABLE tasks ADD COLUMN description text;
ALTER TABLE files ADD COLUMN task_id uuid;
ALTER TABLE files ADD CONSTRAINT files_task_fk FOREIGN KEY(tenant_id,task_id) REFERENCES tasks(tenant_id,id);
CREATE INDEX files_task ON files(tenant_id,task_id) WHERE task_id IS NOT NULL;
CREATE INDEX files_report ON files(tenant_id,report_id) WHERE report_id IS NOT NULL;

CREATE TABLE progress_corrections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, progress_entry_id uuid NOT NULL,
 quantity_delta numeric(24,6) NOT NULL CHECK(quantity_delta<>0), reason text NOT NULL, created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id)
);
ALTER TABLE progress_entries ADD CONSTRAINT progress_entries_tenant_unique UNIQUE(tenant_id,id);
ALTER TABLE progress_corrections ADD CONSTRAINT progress_corrections_entry_fk FOREIGN KEY(tenant_id,progress_entry_id) REFERENCES progress_entries(tenant_id,id);
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON progress_corrections FOR EACH ROW EXECUTE FUNCTION reject_mutation();
ALTER TABLE progress_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_corrections FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON progress_corrections USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

```

## Jadvallararo invariantlar

Tenant + resurs composite FK boshqa kompaniya havolasini rad etadi. Ombor/project, zona/project, smeta/project, journal/source/project va file/report/project bog‘lanishlari composite FK bilan yopilgan. Source material ledgerga mosligi FK bilan tekshiriladi. Stock projection va immutable ledger summasi deferred constraint trigger bilan tenglashtiriladi. Oylik smeta miqdori deferred trigger bilan tekshiriladi. Journal har source uchun commit vaqtida nolga teng bo‘lishi shart.

Rol/proyekt assignment va qoldiq yetarliligi domain transactionda tekshiriladi. User yaratishdagi unique login global: bitta odamni bir nechta kompaniyada yangi login bilan yaratishga texnik jihatdan to‘sqinlik qilish uchun tashqi verified identity talab etiladi; membership jadvali yo‘q.
