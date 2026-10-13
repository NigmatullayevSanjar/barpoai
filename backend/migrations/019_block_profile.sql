-- Blok kartasi (TZ OBJ-04–07, Figma "Yangi blok qo'shish"): yer maydoni, reja va fakt sanalari, rasm, mas'ullar.
-- Holat saqlanmaydi: sanalardan hisoblanadi (Kutilmoqda / Faol / Kechikmoqda / Yakunlandi). Smeta jami
-- blokka bog'langan smeta qatorlaridan hisoblanadi, qo'lda kiritilmaydi (egasi qarori, 2026-10-12).
ALTER TABLE zones
 ADD COLUMN area_m2 numeric(12,2) CHECK(area_m2>0),
 ADD COLUMN planned_start date,
 ADD COLUMN planned_end date,
 ADD COLUMN actual_start date,
 ADD COLUMN actual_end date,
 ADD COLUMN image_file_id uuid,
 ADD CONSTRAINT zones_planned_order CHECK(planned_end>=planned_start),
 ADD CONSTRAINT zones_actual_order CHECK(actual_end>=actual_start),
 ADD CONSTRAINT zones_image_file_fk FOREIGN KEY(tenant_id,project_id,image_file_id) REFERENCES files(tenant_id,project_id,id);
CREATE TABLE zone_responsibles (
 tenant_id uuid NOT NULL, project_id uuid NOT NULL, zone_id uuid NOT NULL, user_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,zone_id,user_id),
 FOREIGN KEY(tenant_id,project_id,zone_id) REFERENCES zones(tenant_id,project_id,id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES users(tenant_id,id)
);
ALTER TABLE zone_responsibles ENABLE ROW LEVEL SECURITY;
ALTER TABLE zone_responsibles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON zone_responsibles USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
-- Xonadon reja rasmi (planirovka): shu obyektga yuklangan fayl.
ALTER TABLE premises
 ADD COLUMN plan_file_id uuid,
 ADD CONSTRAINT premises_plan_file_fk FOREIGN KEY(tenant_id,project_id,plan_file_id) REFERENCES files(tenant_id,project_id,id);
