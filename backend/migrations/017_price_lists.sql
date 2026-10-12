-- Bosqich 4 (D2–D8, R1, rejaning 4-bo'limi): narx varaqasi. Har hisob o'zgarmas versiya: sarlavha (ustama, yaxlitlash
-- qadamlari, USD kursi va sanasi, guruhlar yig'masi) va xonadon qatorlari snapshot'i. UPDATE/DELETE taqiqlangan.
CREATE TABLE price_lists (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, project_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0),
 markup_percent numeric(7,2) NOT NULL CHECK(markup_percent>=0 AND markup_percent<=1000),
 round_uzs numeric(20,2) NOT NULL CHECK(round_uzs>0), round_usd numeric(20,2) NOT NULL CHECK(round_usd>0),
 usd_rate numeric(18,4) CHECK(usd_rate>0), usd_rate_date date,
 premises_count integer NOT NULL CHECK(premises_count>0), area_total numeric(14,2) NOT NULL CHECK(area_total>0),
 plan_total numeric(20,2) NOT NULL, fact_total numeric(20,2) NOT NULL, forecast_total numeric(20,2) NOT NULL CHECK(forecast_total>0),
 groups jsonb NOT NULL, note text,
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,project_id,version),
 CHECK((usd_rate IS NULL)=(usd_rate_date IS NULL)),
 FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id)
);
CREATE TABLE price_list_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, price_list_id uuid NOT NULL, premise_id uuid NOT NULL,
 position integer NOT NULL CHECK(position>=0),
 number text NOT NULL, kind text NOT NULL CHECK(kind IN ('apartment','commercial','parking','storage')),
 rooms integer, floor integer, area_m2 numeric(12,2) NOT NULL CHECK(area_m2>0),
 zone_id uuid, zone_name text, block_name text, entrance_name text,
 cost numeric(20,2) NOT NULL CHECK(cost>=0), cost_m2 numeric(20,2) NOT NULL, sale_m2 numeric(20,2) NOT NULL, price numeric(20,2) NOT NULL,
 sale_m2_usd numeric(20,2), price_usd numeric(20,2),
 UNIQUE(tenant_id,price_list_id,premise_id), UNIQUE(tenant_id,price_list_id,position),
 CHECK((sale_m2_usd IS NULL)=(price_usd IS NULL)),
 FOREIGN KEY(tenant_id,price_list_id) REFERENCES price_lists(tenant_id,id),
 FOREIGN KEY(tenant_id,premise_id) REFERENCES premises(tenant_id,id)
);
CREATE INDEX price_lists_project ON price_lists(tenant_id,project_id,version DESC);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['price_lists','price_list_lines'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_mutation()',t);
 END LOOP;
END $$;
-- Yangi kompaniya sahifasi "pricing" (narx varaqasi): tenant_admin va financier (D8), admin sahifa ruxsati bilan kengaytiradi.
ALTER TABLE role_page_permissions DROP CONSTRAINT role_page_permissions_page_check;
ALTER TABLE role_page_permissions ADD CONSTRAINT role_page_permissions_page_check CHECK(page IN (
 'dashboard','projects','employees','estimates','stock','finance','tasks','reports','files','integrations','camera','billing','settings','permissions','audit',
 'accounting_documents','invoices','bank_cash','counterparties','payroll','reconciliation','financial_reports','allocations','budgets','plan_actual','forecast','payment_requests','payment_calendar',
 'pricing'
));
