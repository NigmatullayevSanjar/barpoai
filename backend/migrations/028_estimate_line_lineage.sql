-- D26/D27 (2026-11-03): reviziyalar orasida o'zgarmaydigan ish identifikatori. Yangi reviziya qatori mos eski qatorning
-- lineage_id sini oladi (tur, nom, birlik, zona, material, kategoriya bir xil; bir nechta bo'lsa tartibi bo'yicha).
-- Fakt (qabul qilingan progress, tasdiqlangan sarf va uning qiymati) va vazifa bog'lanishi shu identifikator
-- bo'yicha; o'zgarmas jurnallar (progress_entries, stock_commands, journal_entries) qayta yozilmaydi.
-- Mavjud qatorlar o'z (yangi) identifikatorini oladi: oldingi reviziyalar orqaga qarab bog'lanmaydi. UPDATE ishlatilmaydi —
-- ma'lumotli bazada UPDATE dan keyingi ALTER TABLE "pending trigger events" bilan yiqiladi.
ALTER TABLE estimate_lines ADD COLUMN lineage_id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE INDEX estimate_lines_lineage ON estimate_lines(tenant_id,lineage_id);
