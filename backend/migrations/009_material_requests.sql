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
