-- Invoys narx farqining sarflangan qismi (2026-11-23, egasi: «Faktga qo'shilsin»): sarf buyrug'iga jurnal juftligi
-- (inventory −, expense +) yoziladi va qaysi invoysdan kelgani shu ustunda saqlanadi (storno uchun).
ALTER TABLE journal_entries ADD COLUMN price_document_id uuid;
ALTER TABLE journal_entries ADD CONSTRAINT journal_price_document_fk FOREIGN KEY(tenant_id,price_document_id) REFERENCES finance_documents(tenant_id,id);
