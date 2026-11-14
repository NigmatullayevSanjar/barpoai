-- D42 (2026-11-10, egasi qarori): Excel yoki Form 5 fayli mavjud smetaning yangi reviziyasi sifatida yuklanadi —
-- reja yangi fayldan, fakt (kirim, sarf, bajarilgan hajm) ish identifikatori (lineage_id) bo'yicha saqlanadi.
-- Preview qaysi smetaga va uning qaysi reviziyasiga tayyorlanganini eslab qoladi; commit paytida smeta shu orada
-- o'zgargan bo'lsa yozilmaydi.
ALTER TABLE import_previews
 ADD COLUMN target_estimate_id uuid,
 ADD COLUMN target_revision integer,
 ADD CONSTRAINT import_previews_target_fk FOREIGN KEY(tenant_id,target_estimate_id) REFERENCES estimates(tenant_id,id),
 ADD CONSTRAINT import_previews_target_pair CHECK((target_estimate_id IS NULL)=(target_revision IS NULL));
