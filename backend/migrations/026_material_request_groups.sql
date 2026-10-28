-- V-B (D23): ko'p qatorli talabnoma — bitta so'rovda bir nechta material. Har qator alohida yozuv (holati, bajarilishi
-- qatorma-qator), umumiy group_id bilan bitta talabnomaga birlashadi. Eski yozuvlar o'z guruhida qoladi.
ALTER TABLE material_requests ADD COLUMN group_id uuid NOT NULL DEFAULT gen_random_uuid(), ADD COLUMN position smallint NOT NULL DEFAULT 1;
CREATE INDEX material_requests_group ON material_requests(tenant_id,group_id);
