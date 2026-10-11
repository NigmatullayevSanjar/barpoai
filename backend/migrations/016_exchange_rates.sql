-- Bosqich 2 (D7): CBU valyuta kursi. Umumiy jadval (tenant ma'lumoti emas, RLS yo'q) — faqat ko'rsatish uchun.
-- Saqlash va kiritish UZS'da qoladi; kurs bo'lmasa USD ko'rsatilmaydi, 0 hech qachon yozilmaydi.
CREATE TABLE exchange_rates (
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 rate_date date NOT NULL,
 rate numeric(18,4) NOT NULL CHECK(rate>0),
 source text NOT NULL,
 fetched_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(currency,rate_date)
);
