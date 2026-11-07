-- S3 (2026-11-07): smetaning yakuniy qismi — foizli zanjir (D36–D39).
-- supplied_by — material qatorini kim beradi: pudratchi (standart) yoki buyurtmachi (bosh pudratchi). Buyurtmachi
-- materiallari boshqa xarajatlar bazasiga kiradi va jami oxirida chegiriladi (VMQ 583, 12-band; D37).
-- Smeta sozlamalari: markup_mode («free» — foizlar qo'lda, «vmq583» — 20 % + 7 % foyda, ishlab chiqarish 2,5 % yoki 5 %),
-- boshqa xarajatlar, foyda va ishlab chiqarish xarajatlari foizi, buyurtmachi materiallarini chegirish, ixtiyoriy QQS
-- (null — QQS yo'q, D36). plan_total va qator jamlari o'zgarmaydi (D38): zanjir alohida «smeta narxi».
-- Faqat ADD COLUMN ... DEFAULT: ma'lumotli bazada UPDATE ishlatilmaydi.
ALTER TABLE estimate_lines
  ADD COLUMN supplied_by text NOT NULL DEFAULT 'contractor' CHECK (supplied_by IN ('contractor', 'customer')),
  ADD CONSTRAINT estimate_lines_supplied_by_material CHECK (supplied_by = 'contractor' OR kind = 'material');
ALTER TABLE estimates
  ADD COLUMN markup_mode text NOT NULL DEFAULT 'free' CHECK (markup_mode IN ('free', 'vmq583')),
  ADD COLUMN other_costs_percent numeric(7,4) NOT NULL DEFAULT 0 CHECK (other_costs_percent BETWEEN 0 AND 100),
  ADD COLUMN profit_percent numeric(7,4) NOT NULL DEFAULT 0 CHECK (profit_percent BETWEEN 0 AND 100),
  ADD COLUMN production_costs_percent numeric(7,4) NOT NULL DEFAULT 0 CHECK (production_costs_percent BETWEEN 0 AND 100),
  ADD COLUMN deduct_customer_materials boolean NOT NULL DEFAULT true,
  ADD COLUMN vat_percent numeric(7,4) CHECK (vat_percent BETWEEN 0 AND 100);
