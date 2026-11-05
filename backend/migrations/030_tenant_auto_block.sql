-- D33: obuna muddati (trial yoki to'langan davr) tugab, to'lov qoplamagan bo'lsa worker kompaniyani bloklaydi.
-- auto_blocked — joriy blokni worker qo'ygan: to'lov muddatni qoplasa blok o'zi ochiladi (qo'lda blokka tegilmaydi).
-- auto_blocked_for — shu qoplangan sana tugashi bo'yicha qaror bor (worker bloklagan yoki platforma egasi qo'lda
-- ochgan): shu uzilish uchun qayta avtomatik bloklanmaydi.
ALTER TABLE tenants
  ADD COLUMN auto_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN auto_blocked_for timestamptz;
