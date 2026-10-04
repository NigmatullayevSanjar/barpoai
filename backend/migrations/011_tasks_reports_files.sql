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
