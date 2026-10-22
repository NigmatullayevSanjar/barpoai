-- Figma F6 (2026-10-17): kompaniya profili — mas'ul shaxs, e-mail, tashkiliy shakl (manzil va telefon 012 da).
ALTER TABLE tenants
 ADD COLUMN contact_name text,
 ADD COLUMN email text CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
 ADD COLUMN legal_form text CHECK (legal_form IN ('mchj','aj','yatt','qk','other'));
