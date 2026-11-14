-- BARPO: kompaniya, xodimlar (admin bilan), rol sozlamalari va obuna QOLADI;
-- obyektlar, smetalar, ombor, materiallar, moliya, kontragentlar, kassa hisoblari, vazifalar, hisobotlar,
-- audit va bildirishnomalar O'CHADI. Faqat lokal bazada ishlating; avval zaxira nusxa oling.
--
-- Ishga tushirish (kompaniya kaliti -v key=... bilan beriladi):
--   docker exec barpo-db-1 psql -U barpo_owner -d barpo -v ON_ERROR_STOP=1 -v key=SINOV-001 -f /tmp/reset-operations.sql
-- Avval sinab ko'rish uchun oxirgi COMMIT ni ROLLBACK ga almashtiring — hech narsa saqlanmaydi.

\set ON_ERROR_STOP on
BEGIN;
-- O'zgarmas jurnallar (ombor, moliya, audit ...) o'chirishni trigger bilan rad etadi; bu sozlama faqat shu tranzaksiyada
-- triggerlarni o'chiradi. Shu sababli o'chirish butun kompaniya bo'yicha bir yo'la qilinadi (osilib qolgan bog'lanish qolmaydi).
SET LOCAL session_replication_role = replica;
SELECT set_config('barpo.key', :'key', true);

DO $$
DECLARE
  -- Qoladigan jadvallar: xodimlar, takliflar, ruxsatlar va rol sozlamalari, obuna va hisob-fakturalar,
  -- texnik yordam murojaatlari, platforma egasining kompaniya taxallusi.
  keep text[] := ARRAY['users', 'invites', 'permission_overrides', 'permission_versions', 'role_page_permissions',
                       'subscriptions', 'billing_entries', 'billing_invoices', 'billing_credits',
                       'support_requests', 'tenant_aliases'];
  t uuid := (SELECT id FROM tenants WHERE registration_key = current_setting('barpo.key'));
  r record;
  n bigint;
BEGIN
  IF t IS NULL THEN
    RAISE EXCEPTION 'Kompaniya topilmadi: %', current_setting('barpo.key');
  END IF;
  -- Diskdagi yuklangan fayllar (keyin qo'lda o'chiriladi)
  FOR r IN SELECT storage_key FROM files WHERE tenant_id = t LOOP
    RAISE NOTICE 'Diskdagi fayl: %', r.storage_key;
  END LOOP;
  FOR r IN
    SELECT DISTINCT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id' AND c.table_name <> ALL (keep)
    ORDER BY 1
  LOOP
    EXECUTE format('DELETE FROM %I WHERE tenant_id = $1', r.table_name) USING t;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      RAISE NOTICE '%: % ta yozuv o''chirildi', r.table_name, n;
    END IF;
  END LOOP;
END $$;

-- Natija: xodimlar qolgan, obyekt va materiallar 0 bo'lishi kerak
SELECT k.registration_key AS kompaniya,
       (SELECT count(*) FROM users u WHERE u.tenant_id = k.id) AS xodimlar,
       (SELECT count(*) FROM projects p WHERE p.tenant_id = k.id) AS obyektlar,
       (SELECT count(*) FROM estimates e WHERE e.tenant_id = k.id) AS smetalar,
       (SELECT count(*) FROM materials m WHERE m.tenant_id = k.id) AS materiallar,
       (SELECT count(*) FROM counterparties c WHERE c.tenant_id = k.id) AS kontragentlar,
       (SELECT count(*) FROM audit_events a WHERE a.tenant_id = k.id) AS audit
FROM tenants k WHERE k.registration_key = current_setting('barpo.key');

COMMIT;
