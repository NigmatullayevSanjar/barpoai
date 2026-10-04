# BARPO AI — Arxitektura va qarorlar

## Talab va holat

Tasdiqlangan: Node.js, PostgreSQL, Docker; boshlanishida 1 kompaniya va 50+ xodim; kelajakda multi-tenant SaaS. Mobil ilova hozir yaratilmaydi. Foydalanuvchining so‘nggi topshirig‘i hujjat bilan birga backend kodini ham talab qiladi. Workspace’da React/Figma demo topildi, oldingi backend yoki Git repo topilmadi.

Tasdiqlangan yangi talab: mijoz admini har bir kompaniya roli uchun sahifadagi C/R/U/D amallarini alohida boshqaradi. Finansist va buxgalter alohida, jami 10 rol. Bir userda `tenant_id` va bitta `role`; multi-membership modeli yo‘q.

Koddagi muhandislik tavsiyalari: Fastify 5, TypeScript strict, parametrli SQL uchun node-postgres; zod DTO validatsiyasi; decimal.js. ORM kiritilmagan: moliya va stock lock/ledger tranzaksiyalari SQLda aniq ko‘rinadi. Mikroservis, sharding yoki Redis talab qilinmaydi. PostgreSQL outbox minimal durable queue vazifasini bajaradi.

## Runtime

Web → HTTPS reverse proxy → Fastify API → PostgreSQL. Worker shu kod va shu bazani alohida process sifatida ishlatadi. Fotosuratlar private volume’da; API orqali vakolat tekshirilib olinadi. API tokenlar front-end xotirasida saqlanadi; brauzer yangilansa qayta login kerak. Production’dagi secure cookie sessiyasi keyingi hardening qarori bo‘lishi mumkin.

Docker Compose: `db`, `migrate` (bir martalik), `api`, `worker`. Migration tugamaguncha api/worker boshlanmaydi. `postgres_data` va `private_files` doimiy volume. Hosting provayderi noma’lum; aniq cloud xizmatiga bog‘lanish yo‘q. Lokal portlar faqat loopbackda.

## Modul chegaralari

| Modul | Mas’uliyat | Boshqa modulga chiqish |
|---|---|---|
| Auth | Parol, sessiya, invite, reset, Telegram identity | Users, tenant status |
| Platform | Tenant onboarding/alias/block, tarif va SaaS billing | Tenantga operatsion kirish bermaydi |
| Permissions | Bazaviy rol, rol–sahifa CRUD, individual grant/deny | Har API va frontend permission DTO |
| Company | Xodim, obyekt, zona, assignment, ownership | Scope invariantlari |
| Estimates | Smeta, norma, oy, revision, Excel preview/commit | Immutable eski qatorlar |
| Inventory | Rezerv, book qoldiq, custody, review, ledger, reversal | Material sarfi → journal expense |
| Finance | Ajratma, PO, invoice matching, actual, cash, payable | Ledger source FK |
| Work | Kanban, daily/weekly report, progress, private photo | Forecast reja sanasini almashtirmaydi |
| Integration | Connection/mapping/inbox/outbox/adapter chegarasi | Provider tanlanmaguncha not_configured |

## Tranzaksiya va izolyatsiya

Har command bitta `pg.PoolClient` bilan BEGIN/COMMIT; `SET LOCAL app.tenant_id` sessiya orqali olinadi. Client yuborgan tenant ID operatsion doira sifatida qabul qilinmaydi. READ COMMITTED + row lock va unique constraint boshlang‘ich yuklama uchun yetarli. Deadlock/serialization holatida ko‘pi bilan 2 retry; 15 sekund statement va 5 sekund lock timeout.

Invite: tenant → invite. Billing: tenant → invoice. Stock: command → saralanib lock qilingan account/material balanslari. Finance payment: invoice row lock. Idempotency key actor/tenant doirasida advisory lock bilan serialize qilinadi. Avvalgi response request hash bilan birga atomik saqlanadi; bir key boshqa payloadga ishlatilsa 409.

Stock va financial ledger UPDATE/DELETE trigger orqali taqiqlangan. Projection summasi, journal balansi va oy taqsimoti deferred constraint trigger bilan commitda tekshiriladi. Reversal yangi command va qarama-qarshi yozuvlar yaratadi. Tashqi sendMessage DB bilan atomik bo‘la olmaydi: worker retry xabarni takrorlashi mumkin; biznes ledger ta’siri bilan adashtirilmaydi.

## Xavfsizlik

Scrypt N=131072,r=8,p=1, tasodifiy salt; plaintext parol saqlanmaydi. Token 256-bit random, bazada SHA-256 hash. Reset retrieval emas. Boshlang‘ich xodim paroli almashmaguncha me/logout/passworddan boshqa API yopiq. CORS explicit origin, Helmet, rate limit, body limit; parametrli SQL. DB URL va parol loglarda yo‘q. Request bodylar loglanmaydi.

Runtime `barpo_app` DDL, SUPERUSER va BYPASSRLSsiz. Operatsion tenant jadvallari FORCE RLS. Auth/platform jadvallari pre-login ehtiyoji tufayli RLSsiz, ularda server role + tenant query predicate majburiy. Tenant admin platforma staff yoki platforma rolini bera olmaydi. Platforma rollari tenant scopega avtomatik o‘tmaydi. Break-glass standart holatda o‘chirilgan; kelajakda tasdiqlangan ticket, maqsad, aniq resurs, 30 minut expiry, read-only va audit bilan alohida approval oqimi kerak.

Fayllar 5 MiB gacha JPEG/PNG magic bilan tekshiriladi, random storage key; filename path sifatida ishlatilmaydi. Excel 2 MiB compressed / 20 MiB expanded, formula va macro/external-link rad etiladi. Anti-virus/image re-encode va orphan file cleanup production gate sifatida qolgan.

## Monitoring va tiklash

`/health/live` process, `/health/ready` DB/migratsiya mavjudligini tekshiradi. Strukturali request ID/error code; auditda actor/action/resource/time. Kuzatish: API latency/error, DB pool/lock timeout, failed login, worker attempts/dead, integration lag, disk va backup yoshi. Log transporti va alert kanali hosting tanlanganda sozlanadi.

Tavsiya RPO 15 minut va RTO 4 soat. Buning uchun WAL/PITR, kundalik encrypted backup, private file volume nusxasi va har oy izolyatsiyada restore drill talab qilinadi. Bu maqsadlar hozir o‘lchangan kafolat emas. Migration expand → compatible app deploy → verification → contract; destruktiv down migration o‘rniga forward fix. Har katta migrationdan avval restore tekshirilgan backup.

## Rasmiy manbalar

- [Fastify validation/serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/) — DTO chegaralari uchun tekshirildi.
- [node-postgres transactions](https://node-postgres.com/features/transactions) — bitta client talabi.
- [PostgreSQL row security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html) — owner bypass va FORCE RLS farqi.
- [Telegram login widget](https://core.telegram.org/widgets/login/) — imzo tekshiruvi; bot/domain sozlanishi hali kerak.
- [Telegram Bot API](https://core.telegram.org/bots/api) — notification va webhook security kontrakti.
