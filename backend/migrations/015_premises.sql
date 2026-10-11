-- Bosqich 3 (TZ OBJ-07, D1, D2): obyektdagi xonadon va joylar ro'yxati. CRM emas: holat, mijoz, bron va narx yo'q.
-- R2: raqam blok ichida takrorlanmaydi. Blok — xonadon zonasining eng yaqin kind='block' ota zonasi (zonaning o'zi ham);
-- blok yo'q bo'lsa raqam obyekt ichida takrorlanmaydi. block_zone_id faqat trigger bilan hisoblanadi.
CREATE TABLE premises (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, project_id uuid NOT NULL,
 zone_id uuid, block_zone_id uuid,
 number text NOT NULL CHECK(number = btrim(number) AND length(number) BETWEEN 1 AND 20),
 kind text NOT NULL CHECK(kind IN ('apartment','commercial','parking','storage')),
 rooms integer CHECK(rooms BETWEEN 0 AND 50),
 floor integer CHECK(floor BETWEEN -10 AND 500),
 area_m2 numeric(12,2) NOT NULL CHECK(area_m2>0),
 archived_at timestamptz, version integer NOT NULL DEFAULT 1,
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,project_id) REFERENCES projects(tenant_id,id),
 FOREIGN KEY(tenant_id,project_id,zone_id) REFERENCES zones(tenant_id,project_id,id),
 FOREIGN KEY(tenant_id,project_id,block_zone_id) REFERENCES zones(tenant_id,project_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id)
);
CREATE UNIQUE INDEX premises_number_block ON premises(tenant_id,block_zone_id,lower(number))
 WHERE archived_at IS NULL AND block_zone_id IS NOT NULL;
CREATE UNIQUE INDEX premises_number_project ON premises(tenant_id,project_id,lower(number))
 WHERE archived_at IS NULL AND block_zone_id IS NULL;
CREATE INDEX premises_scope ON premises(tenant_id,project_id,block_zone_id,floor);
ALTER TABLE premises ENABLE ROW LEVEL SECURITY;
ALTER TABLE premises FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON premises USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

-- Eng yaqin blok: zonaning o'zi yoki ota zonalardan birinchi kind='block'.
CREATE FUNCTION premise_block(p_tenant uuid, p_zone uuid) RETURNS uuid LANGUAGE sql STABLE AS $$
 WITH RECURSIVE up AS (
  SELECT id,parent_id,kind,0 AS depth FROM zones WHERE tenant_id=p_tenant AND id=p_zone
  UNION ALL
  SELECT z.id,z.parent_id,z.kind,up.depth+1 FROM zones z JOIN up ON z.tenant_id=p_tenant AND z.id=up.parent_id
 )
 SELECT id FROM up WHERE kind='block' ORDER BY depth LIMIT 1
$$;
-- Obyekt bo'yicha qulf: zona turi o'zgarishi va xonadon yozilishi navbat bilan bajariladi (blok hisobi eskirmaydi).
CREATE FUNCTION premises_set_block() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(1503, hashtext(NEW.project_id::text));
 NEW.block_zone_id := CASE WHEN NEW.zone_id IS NULL THEN NULL ELSE premise_block(NEW.tenant_id, NEW.zone_id) END;
 RETURN NEW;
END $$;
CREATE TRIGGER premises_block BEFORE INSERT OR UPDATE ON premises FOR EACH ROW EXECUTE FUNCTION premises_set_block();
-- Zona turi o'zgarsa obyekt xonadonlarining bloki qayta hisoblanadi; raqam to'qnashsa unikal indeks zona tahririni bekor qiladi.
CREATE FUNCTION zones_recompute_premises() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(1503, hashtext(NEW.project_id::text));
 UPDATE premises SET zone_id=zone_id WHERE tenant_id=NEW.tenant_id AND project_id=NEW.project_id AND zone_id IS NOT NULL;
 RETURN NULL;
END $$;
CREATE TRIGGER zones_premises_block AFTER UPDATE OF kind ON zones FOR EACH ROW
 WHEN (OLD.kind IS DISTINCT FROM NEW.kind) EXECUTE FUNCTION zones_recompute_premises();

-- Import preview jadvali endi smeta va xonadon importi uchun umumiy.
ALTER TABLE import_previews
 ADD COLUMN kind text NOT NULL DEFAULT 'estimate' CHECK(kind IN ('estimate','premises')),
 ADD COLUMN result jsonb;
