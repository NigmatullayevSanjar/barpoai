-- Obyekt kartasi: kod, manzil, buyurtmachi, tavsif va ish holati (arxivlash alohida ustun).
ALTER TABLE projects
 ADD COLUMN code text,
 ADD COLUMN address text,
 ADD COLUMN customer_name text,
 ADD COLUMN description text,
 ADD COLUMN status text NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','active','paused','completed'));
CREATE UNIQUE INDEX projects_code_unique ON projects(tenant_id, lower(code)) WHERE code IS NOT NULL AND archived_at IS NULL;
-- Xodim lavozimi (erkin matn) va ish boshlagan sana; rol alohida qoladi.
ALTER TABLE users ADD COLUMN position text, ADD COLUMN hired_at date;
