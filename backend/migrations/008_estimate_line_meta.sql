-- Smeta qatori: kategoriya (guruhlash), izoh va ko'rsatish tartibi. Tarixiy qatorlarga ta'sir qilmaydi.
ALTER TABLE estimate_lines
 ADD COLUMN category text,
 ADD COLUMN note text,
 ADD COLUMN position integer NOT NULL DEFAULT 0;
CREATE INDEX estimate_lines_order ON estimate_lines(tenant_id, estimate_id, position, id) WHERE archived_at IS NULL;
