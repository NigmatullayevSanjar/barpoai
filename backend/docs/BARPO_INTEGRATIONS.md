# BARPO AI — Integratsiya spetsifikatsiyasi

## R1 holati

Foydalanuvchi 2026-10-01 kuni bank/payment/kamera provayderi va UySot/Didox/iHamkor hujjatlari hozircha yo‘qligini bildirdi. Bu imkoniyatlar R1 scope’dan chiqarilmagan. Haqiqiy ulanish/e2e tasdiq bo‘lmaguncha **R1 release blocker**. Endpoint, credential va ishlayotgan adapter ixtiro qilinmaydi.

| Adapter | Mavjud kod | Yetishmayotgan ma’lumot |
|---|---|---|
| Telegram | Login Widget HMAC tekshirish, existing user link/login, stock.low worker sendMessage | Bot token, domain, test user/chat va real delivery testi |
| UySot | Tenant connection/mapping/inbox schema, holat API | Rasmiy API, auth, external object/payment IDs, sandbox |
| Bank | Cash/import domen kontrakti, idempotency/external_ref | Bank tanlovi, API/statement format, webhook/polling imkoniyati |
| Didox | Connection/inbox kontrakti | Hujjat turlari, auth/signature, API va status tartibi |
| iHamkor | Connection/inbox kontrakti | Alohida API, imkoniyat va kelishuv |
| Kamera/VMS | Connection va scope kontrakti | VMS vendor, event schema, frame auth/storage ruxsati |
| SaaS payment | Invoice/payment/refund ledger; checkout 503 | Provider, merchant, callback signature, sandbox, refund API |

Bank/Didox/iHamkor uchala alohida majburiy servis yoki tanlangan manbalar ekanligi hali aniqlanmagan. Ularning auth/endpointini bir xil deb qabul qilmaslik.

## Adapter chegarasi

Har yangi adapter implementatsiya qilganda kontrakt:

```ts
type ExternalEvent = {
  provider: string;
  connectionId: string; // URL yoki ro‘yxatdan o‘tgan integration identitydan olinadi
  eventId: string;
  type: string;
  occurredAt: string; // RFC3339 UTC
  version?: string; // provider ordering/sequence
  payload: unknown; // provider schema bilan parse qilinadi
};
type PollPage = { events: ExternalEvent[]; nextCursor: string | null };
interface Adapter {
  verifyWebhook(rawBody: Uint8Array, headers: Record<string,string>): ExternalEvent;
  poll(cursor: string | null): Promise<PollPage>;
  reconcile(from: string, to: string): Promise<ExternalEvent[]>;
}
```

Bu **kelishilgan ichki interfeys**, vendor endpointi emas. `tenant_id` untrusted payload’dan olinmaydi: connection→tenant server mappingi. Project external_id mappingi RLS/composite FKga mos bo‘lishi shart. Unknown mapping eventni karantinda qoldiradi, avtomatik yangi tenant yoki obyekt yaratmaydi.

## Inbox / outbox semantikasi

Webhook raw body provider signature, timestamp skew va replay tekshiruvdan keyin olinadi. Faqat HTTPS. Provider talab qilsa mTLS/IP allowlist qo‘shimcha; signature o‘rnini bosmaydi. Unique(connection,event_id) bir eventni bitta inbox yozuviga aylantiradi; bir ID bilan boshqa payload xavfsizlik hodisasi. Kirish 2xx faqat durable commitdan so‘ng; processing keyin idempotent domain command. Out-of-order eventlar provider version/occurred_at bo‘yicha tekshiriladi, eski status yangi holatni ortga qaytarmaydi. Refund oldin kelsa unresolved reference bo‘lib kutadi.

Polling cursor eventlar va checkpoint durable commit bo‘lgandan keyin yangilanadi. Lookback overlap + event ID unique yo‘qolgan chegaraviy eventlarni oldini oladi. Retry exponential backoff+jitter, provider Retry-Afterga rioya; 8 urinishdan so‘ng dead-letter. Retry faqat vakolatli operatorda; auditga sabab yoziladi. Reconciliation cursor bilan bir xil emas: kunlik provider totals va local source ID/amount/currency bo‘yicha farqlar hisoboti.

Hozirgi worker stock.low uchun PostgreSQL `FOR UPDATE SKIP LOCKED` ishlatadi. Telegram’da remote idempotency key yo‘qligi sabab crash-after-send xabar takrorlanishi mumkin. Exactly-once remote notification deb va’da berilmaydi. Stock/moliyaviy effektlar esa unique source va idempotency tranzaksiyasi bilan takrorlanmaydi.

## Provider ma’lumot mappingi

- Telegram: authenticated Telegram `id` → existing users.telegram_id. Unlinked identity kompaniya yoki yangi xodim yaratmaydi. HMAC va 5 minut freshness; bot login domeni sozlanadi. Chat message maydoni ruxsatli, narxsiz umumiy alert. Worker bajarish vaqtida active tenant/user/project/stock.read qayta tekshiriladi. Webhook ishlatilsa X-Telegram-Bot-Api-Secret-Token tekshiruvi va bot→tenant bog‘lanishi talab etiladi; hozir webhook receiver yo‘q.
- UySot: external object → projects; planned monthly receipt → read-only sales plan import; actual receipt → reconciliation candidate. Bankdagi transaction bilan stable reference bo‘yicha bog‘langandan keyin bitta cash event. Sum/date heuristika faqat operatorga candidate, avtomatik post uchun yetarli emas.
- Bank: external bank transaction ID → unique source ref, value_date, signed UZS amount string, cash_account. Reversal provayder qaytarish ID bilan yangi command; tarix update qilinmaydi.
- Didox/iHamkor: document ID, counterparty identity, document type/date/status, line quantities/UZS amounts. Invoice import fizik receipt emas, match key orqali stock receiptga ulanadi. QQS moduli yo‘q; manbada QQS bo‘lsa narx tarkibi bo‘yicha accounting qarori talab qilinadi.
- Kamera: camera_id, event_id, occurred_at, direction, plate, confidence, protected frame reference. Project/warehouse mapping, retention va plate access scope. Stock receipt/payment avtomatik yozilmaydi; operatorning mos domain commandi bilan hujjatga bog‘lanadi. Kamera event persist/link API hali ichki implementatsiya gate.
- SaaS payment: provider transaction ID → invoice; callbackda tenant, invoice, currency, amount server qiymatlari bilan moslanadi. Browser success URL settlement manbasi emas. Checkout retry provider idempotency key bilan. Qisman payment, refund/capture tartibi va coverage qayta hisoblash billing ledger orqali. Manual payment endpointini public webhook sifatida ishlatish taqiqlanadi.

## Holat va secretlar

GET /v1/integrations `not_configured | healthy | stale | error`, last_success_at va error_code qaytaradi. Noma’lum ma’lumotni moliyaviy 0 deb ko‘rsatmaydi. Hozir release_ready=false. Credentials environment/secret managerda, DB/API/auditda raw secret yo‘q. Secret rotatsiya, provider timeout va rate limit tanlangan provider hujjatidan olinadi. Tenant blockdan keyin operatsion polling/posting to‘xtaydi; billing settlement recovery alohida cheklangan yo‘l bo‘ladi.
