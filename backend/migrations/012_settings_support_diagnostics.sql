-- 09-bosqich: kompaniya sozlamalari, support javobi, texnik panel uchun xato jurnali.
ALTER TABLE tenants
 ADD COLUMN address text,
 ADD COLUMN phone text CHECK (phone ~ '^\+998[0-9]{9}$'),
 ADD COLUMN settings jsonb NOT NULL DEFAULT '{}';
ALTER TABLE support_requests
 ADD COLUMN response text,
 ADD COLUMN responded_by uuid REFERENCES users(id),
 ADD COLUMN responded_at timestamptz;
-- 5xx javoblar; faqat platforma texnik xodimi o'qiydi. Tenant ma'lumotlari saqlanmaydi.
CREATE TABLE error_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id text NOT NULL, method text NOT NULL, path text NOT NULL,
 status integer NOT NULL CHECK(status>=500), code text NOT NULL, message text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX error_events_created_idx ON error_events(created_at DESC);
