-- D43 (2026-11-19): har bir kompaniyaning yagona domeni. Kompaniya xodimi domen + login (yoki telefon) + parol
-- bilan kiradi; platforma xodimlari (tenant_id IS NULL) domensiz kiradi. Login endi kompaniya ichida yagona:
-- ikki kompaniyada bir xil login bo'lishi mumkin, platforma xodimlari loginlari o'zaro yagona.
-- Format: 3–32 belgi, kichik lotin harf, raqam va chiziqcha; chiziqcha bilan boshlanmaydi/tugamaydi.
-- Domen berilmasa (eski skriptlar, seed) ro'yxat raqamidan avtomatik yasaladi; platforma egasi keyin almashtiradi.
ALTER TABLE tenants ADD COLUMN domain text;

CREATE FUNCTION tenant_domain_candidate(key text, self uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  base text := trim(both '-' from left(trim(both '-' from lower(regexp_replace(coalesce(key, ''), '[^a-zA-Z0-9]+', '-', 'g'))), 28));
  candidate text;
  n integer := 1;
BEGIN
  IF length(base) < 3 THEN
    base := 'kompaniya' || CASE WHEN base <> '' THEN '-' || base ELSE '' END;
  END IF;
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM tenants WHERE domain = candidate AND id IS DISTINCT FROM self) LOOP
    n := n + 1;
    candidate := base || '-' || n;
  END LOOP;
  RETURN candidate;
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, registration_key FROM tenants ORDER BY created_at, id LOOP
    UPDATE tenants SET domain = tenant_domain_candidate(r.registration_key, r.id) WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE tenants
  ALTER COLUMN domain SET NOT NULL,
  ADD CONSTRAINT tenants_domain_format CHECK (domain ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'),
  ADD CONSTRAINT tenants_domain_key UNIQUE (domain);

CREATE FUNCTION tenant_default_domain() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.domain IS NULL THEN
    NEW.domain := tenant_domain_candidate(NEW.registration_key, NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tenant_default_domain BEFORE INSERT ON tenants FOR EACH ROW EXECUTE FUNCTION tenant_default_domain();

ALTER TABLE users DROP CONSTRAINT users_login_key;
CREATE UNIQUE INDEX users_login_platform ON users(login) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX users_login_tenant ON users(tenant_id, login) WHERE tenant_id IS NOT NULL;
