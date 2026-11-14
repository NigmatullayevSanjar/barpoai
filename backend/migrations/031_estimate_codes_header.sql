-- S2 (2026-11-07): smeta qatorining kodlari va bo'limi, smeta sarlavhasi (D41).
-- norm_code — ish qatorining to'liq norma shifri (Form 5 B ustuni, «ДОП. … ПР. № 429» qo'shimchasi bilan);
-- resource_code — resurs yoki material kodi (1, 3, 1234, П54889, pcpc…); section_name — «Раздел …» qatorining to'liq matni.
-- category ma'nosi o'zgarmaydi: reviziya moslash (D26/D27), qavat matritsasi (D28) va akkord guruhi (D32) unga tayanadi.
-- Sarlavha: asos (chizmalar), narx darajasi sanasi, ish haqi stavkasi manbai va pudrat shartnomasi (summasi QQS bilan).
-- Faqat ADD COLUMN: eski qatorlar to'ldirilmaydi (egasi qarori, 2026-11-07) — qayta import to'liq ma'lumot beradi.
ALTER TABLE estimate_lines
  ADD COLUMN norm_code text,
  ADD COLUMN resource_code text,
  ADD COLUMN section_name text;
ALTER TABLE estimates
  ADD COLUMN basis text,
  ADD COLUMN price_level_date date,
  ADD COLUMN labor_rate_source text,
  ADD COLUMN contract_number text,
  ADD COLUMN contract_date date,
  ADD COLUMN contract_amount numeric(20,2) CHECK (contract_amount >= 0);
