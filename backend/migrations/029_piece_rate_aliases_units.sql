-- D32 (2026-11-05, egasi qarori): Form 5 smetalari bilan ishlash.
-- 1) Akkord stavkasi Form 5 ish qatorida uning mehnat resurslaridan avtomatik hisoblanadi (ustun yo'q, so'rovda —
--    earnings.ts `lineRateSql`); guruh (smeta, kategoriya, zona) qidiruvi uchun indeks.
-- 2) Material muqobil nomi: nakladnoydagi nom smetadagidan farq qilsa, omborchi tasdiqlagan nom shu materialga bog'lanadi
--    va keyingi qidiruvda topiladi. Nom kompaniya ichida bitta materialga tegishli.
-- 3) Form 5 da uchragan, platformada yo'q birliklar.
INSERT INTO units VALUES ('l','Litr','volume'),('section','Seksiya','count'),('boiler','Qozon','count'),('cycle','Sikl','count'),('end','Uchi','count') ON CONFLICT (id) DO NOTHING;
CREATE INDEX estimate_lines_group ON estimate_lines(tenant_id,estimate_id,category);
CREATE TABLE material_aliases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, material_id uuid NOT NULL,
 name text NOT NULL CHECK(length(btrim(name))>0), created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,material_id) REFERENCES materials(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id)
);
CREATE UNIQUE INDEX material_aliases_name ON material_aliases(tenant_id,lower(name));
CREATE INDEX material_aliases_material ON material_aliases(tenant_id,material_id);
ALTER TABLE material_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_aliases FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON material_aliases USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
