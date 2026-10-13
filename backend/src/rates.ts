import type pg from 'pg';

/** CBU kunlik kursi (D7, rejaning 5-bo'limi). Manzil `CBU_RATES_URL` bilan almashtiriladi (test, proksi). */
export const cbuUrl = () =>
  process.env.CBU_RATES_URL ?? 'https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/';
const rateText = /^(0|[1-9]\d{0,13})(\.\d{1,4})?$/;

/**
 * CBU javobi: `[{ Ccy: "USD", Rate: "12850.27", Date: "10.10.2026", ... }]`.
 * Noto'g'ri, 0 yoki boshqa valyuta — null (yozilmaydi).
 */
export function parseCbuRate(body: unknown, currency = 'USD') {
  const row = Array.isArray(body) ? body.find((r) => r?.Ccy === currency) : undefined;
  const rate = typeof row?.Rate === 'string' ? row.Rate.trim() : '';
  const date = typeof row?.Date === 'string' ? /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(row.Date) : null;
  if (!rateText.test(rate) || !/[1-9]/.test(rate) || !date) return null;
  const iso = `${date[3]}-${date[2]}-${date[1]}`;
  if (Number.isNaN(Date.parse(iso))) return null;
  return { currency, rate, rate_date: iso };
}

/**
 * Bugungi (Toshkent sanasi) kurs bazada bo'lsa o'tkaziladi; aks holda CBU'dan oladi — CBU yangi kursni ertalab
 * e'lon qiladi, dam olish kunlari oldingi kursni qaytaradi (shu sana bilan). Xatoda hech narsa yozilmaydi — oxirgi kurs qoladi.
 * Natija: 'skipped' | 'saved' | 'failed'.
 */
export async function refreshRates(pool: pg.Pool, fetcher: typeof fetch = fetch) {
  const fresh = await pool.query(
    "SELECT 1 FROM exchange_rates WHERE currency='USD' AND rate_date >= (now() AT TIME ZONE 'Asia/Tashkent')::date",
  );
  if (fresh.rowCount) return 'skipped' as const;
  try {
    const res = await fetcher(cbuUrl(), { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return 'failed' as const;
    const parsed = parseCbuRate(await res.json());
    if (!parsed) return 'failed' as const;
    await pool.query(
      `INSERT INTO exchange_rates(currency,rate_date,rate,source) VALUES($1,$2,$3,'CBU')
       ON CONFLICT(currency,rate_date) DO UPDATE SET rate=EXCLUDED.rate,fetched_at=now()`,
      [parsed.currency, parsed.rate_date, parsed.rate],
    );
    return 'saved' as const;
  } catch {
    return 'failed' as const;
  }
}
