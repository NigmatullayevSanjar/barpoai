-- Egasi qarori (2026-10-26): kontragentga berilgan avans uning qarz hujjatiga (invoys, dalolatnoma) hisoblanadi.
-- Yangi tur `advance_offset`: payable +X, advance −X; kassa va xarajat o'zgarmaydi.
ALTER TABLE finance_documents DROP CONSTRAINT finance_documents_kind_check;
ALTER TABLE finance_documents ADD CONSTRAINT finance_documents_kind_check CHECK (kind IN (
 'allocation','purchase_order','supplier_invoice','opening_debt','labor','equipment','service',
 'payment','receipt','advance','advance_offset','cash_transfer','reversal'));
