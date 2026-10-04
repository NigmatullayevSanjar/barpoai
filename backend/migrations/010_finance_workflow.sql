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
