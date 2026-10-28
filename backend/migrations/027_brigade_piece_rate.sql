-- V-C (D23): brigada akkord hisobi. Stavka smeta qatorida (labor_rate, so'm/birlik), bo'lmasa obyektning standart
-- foizi (brigade_percent, smeta birlik narxidan). Hisobot qabulida stavka progress yozuviga qotiriladi; ish haqi davri
-- yopilganda yig'ilgan summa payroll_entries.piece_rate bo'lib yoziladi; qaysi progress yozuvidan qancha davrga kirgani
-- progress_payroll (append-only) jadvalida — progress_entries o'zgarmas ledger.
ALTER TABLE estimate_lines ADD COLUMN labor_rate numeric(20,2) CHECK(labor_rate>=0);
ALTER TABLE projects ADD COLUMN brigade_percent numeric(5,2) CHECK(brigade_percent>=0 AND brigade_percent<=100);
ALTER TABLE payroll_entries ADD CONSTRAINT payroll_entries_tenant_unique UNIQUE(tenant_id,id);
ALTER TABLE payroll_entries ADD COLUMN piece_rate numeric(20,2) NOT NULL DEFAULT 0 CHECK(piece_rate>=0),
 ADD COLUMN advance_offset_document_id uuid,
 ADD CONSTRAINT payroll_entries_offset_fk FOREIGN KEY(tenant_id,advance_offset_document_id) REFERENCES finance_documents(tenant_id,id);
ALTER TABLE payroll_entries DROP COLUMN net;
ALTER TABLE payroll_entries ADD COLUMN net numeric(20,2) GENERATED ALWAYS AS (base_salary+bonus+piece_rate-deduction) STORED;
ALTER TABLE progress_entries ADD COLUMN labor_rate numeric(20,2) CHECK(labor_rate>=0);
CREATE TABLE progress_payroll (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, progress_entry_id uuid NOT NULL, payroll_entry_id uuid NOT NULL,
 amount numeric(20,2) NOT NULL CHECK(amount<>0), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,progress_entry_id) REFERENCES progress_entries(tenant_id,id),
 FOREIGN KEY(tenant_id,payroll_entry_id) REFERENCES payroll_entries(tenant_id,id)
);
CREATE INDEX progress_payroll_entry ON progress_payroll(tenant_id,progress_entry_id);
CREATE INDEX progress_payroll_payroll ON progress_payroll(tenant_id,payroll_entry_id);
ALTER TABLE progress_payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_payroll FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON progress_payroll USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON progress_payroll FOR EACH ROW EXECUTE FUNCTION reject_mutation();
