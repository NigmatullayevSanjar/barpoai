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
