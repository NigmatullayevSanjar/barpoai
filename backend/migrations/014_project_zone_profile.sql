-- 1.3 (TZ OBJ-02, OBJ-04): obyekt maydoni va rasmi; zona turi, qavatlar soni va tahrir uchun versiya.
ALTER TABLE projects
 ADD COLUMN area_m2 numeric(12,2) CHECK(area_m2>0),
 ADD COLUMN image_file_id uuid;
-- Rasm faqat shu obyektga yuklangan fayl bo'la oladi (kompozit FK; files jadvali o'chirilmaydi, arxivlanadi).
ALTER TABLE files ADD CONSTRAINT files_tenant_project_id_unique UNIQUE(tenant_id,project_id,id);
ALTER TABLE projects ADD CONSTRAINT projects_image_file_fk FOREIGN KEY(tenant_id,id,image_file_id) REFERENCES files(tenant_id,project_id,id);
-- Zona turi: blok, kirish yo'lagi, qavat, boshqa. Qavatlar soni faqat blok uchun. Parent o'zgarmas qoladi.
ALTER TABLE zones
 ADD COLUMN kind text NOT NULL DEFAULT 'other' CHECK(kind IN ('block','entrance','floor','other')),
 ADD COLUMN floors_count integer CHECK(floors_count>0),
 ADD COLUMN version integer NOT NULL DEFAULT 1,
 ADD CONSTRAINT zones_floors_only_block CHECK(floors_count IS NULL OR kind='block');
