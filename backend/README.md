# BARPO AI backend

Node.js 24 + TypeScript + Fastify + PostgreSQL 17. API, migratsiyalar, worker, testlar va Docker topologiyasi mavjud. [Texnik hujjatlar indeksi](docs/BARPO_BACKEND_INDEX.md) talablar va cheklovlarni ko‘rsatadi.

## Lokal ishga tushirish

1. `backend/.env` yarating. Quyidagi parollarni o‘zingizning uzun, tasodifiy **hex** qiymatlaringiz bilan almashtiring. Hex tanlash DB URL escaping muammosini oldini oladi. `.env` Gitga qo‘shilmaydi.

```dotenv
DB_OWNER_PASSWORD=YOUR_RANDOM_HEX_OWNER_PASSWORD
DB_APP_PASSWORD=YOUR_DIFFERENT_RANDOM_HEX_APP_PASSWORD
DB_PORT=5433
APP_ORIGIN=http://localhost:5173
```

2. Docker Desktop ishlayotgan bo‘lsin:

```sh
docker compose up --build -d
```

API: `http://localhost:3001`; health: `/health/ready`; API kontrakti: `/openapi.json`.
Database faqat `127.0.0.1:5433` da. Lokal PostgreSQL bilan to‘qnashmaslik uchun host porti 5433; Docker ichida DB porti 5432. `DB_PORT` o‘zgarsa, lokal `DATABASE_URL` va `MIGRATION_DATABASE_URL` portlarini ham moslang. API va worker migratsiyadan keyin boshlanadi. Production tashqi trafik uchun TLS reverse proxy va backup sozlamalari kerak.

3. Birinchi platforma egasini lokal terminal orqali yarating. Parolni shell tarixiga yozish o‘rniga muhit o‘zgaruvchilarini xavfsiz kiriting. Docker ichida `node dist/bootstrap.js` buyrug‘iga `MIGRATION_DATABASE_URL`, `BOOTSTRAP_LOGIN`, `BOOTSTRAP_PASSWORD` ni environment sifatida bering. Default login yoki parol yaratilmaydi.

PowerShell bilan Node orqali bootstrap (Docker DB ishga tushganidan keyin):

```powershell
npm.cmd ci
$env:MIGRATION_DATABASE_URL = 'postgresql://barpo_owner:YOUR_OWNER_PASSWORD@127.0.0.1:5433/barpo'
$env:BOOTSTRAP_LOGIN = Read-Host 'Platforma egasi login'
$securePassword = Read-Host 'Yangi parol (kamida 12 belgi)' -AsSecureString
$env:BOOTSTRAP_PASSWORD = [System.Net.NetworkCredential]::new('', $securePassword).Password
npm.cmd run bootstrap
Remove-Item Env:BOOTSTRAP_PASSWORD
Remove-Item Env:MIGRATION_DATABASE_URL
```

4. Platform owner `/v1/auth/login` → `/v1/platform/tenants` → `/v1/platform/tenants/{id}/invites`. Link tokeni `/v1/auth/register` uchun. Preview tokenni sarflamaydi. Tenant admin signupdan so‘ng 14 kun trial oladi.

5. Frontendni ulash: loyiha ildizidagi `.env.example` dan `.env.local` yarating (`VITE_API_URL=http://localhost:3001`) va Vite’ni qayta boshlang. Login, birinchi parol almashinuvi, rol–sahifa–CRUD sozlamalari va menyu filtrlari real APIga ulangan. Boshqa mavjud Figma ekranlarining ma’lumotlari hali demo; backend endpointlari bilan keyingi ekranlar ulanishi alohida ish.

## Node bilan rivojlantirish

`npm run dev` avtomatik `.env` yuklamaydi: environmentni shell orqali yoki `node --env-file=.env --import tsx src/server.ts` orqali bering. API uchun `DATABASE_URL` runtime rolni, migratsiya uchun `MIGRATION_DATABASE_URL` ownerni ko‘rsatsin. Odatdagi commandlar:

```sh
npm ci
npm run build
npm test
npm run test:integration
npm run docs
npm run test:docker
npm run test:ui
```

Integration test Docker’da izolyatsiyalangan PostgreSQL yaratadi, barcha migratsiyalarni qo‘llaydi, runtime’ni `NOSUPERUSER NOBYPASSRLS` bilan tekshiradi va faqat o‘zi yaratgan test konteynerini to‘xtatadi. Mavjud DBga tegmaydi. `/docs/verification.json` oxirgi bajarilgan natija.

Docker smoke oldidan `docker build -t barpo-backend:local .` bajaring. Brauzer testi uchun frontend dependencies ham o‘rnatilgan va Chrome mavjud bo‘lsin (`PLAYWRIGHT_CHANNEL` bilan boshqa Chromium kanalini tanlash mumkin). `test:ui` vaqtinchalik PostgreSQL, API va Vite serverini o‘zi ishga tushiradi; admin ruxsatni o‘zgartirganda xodim menyusi, bevosita URL va alohida yaratish tugmasini tekshiradi. Natija: [ui-verification.json](docs/ui-verification.json), [ekran tasviri](docs/permissions-ui.png).

## Muhim chegaralar

- Tasdiqlangan SaaS tarif narxi yoki demo mijoz pullari bazaga avtomatik kiritilmaydi.
- Telegram bot tokeni, UySot, bank, Didox, iHamkor, kamera va payment provayderlari foydalanuvchi tomonidan hali taqdim etilmagan. Ular R1 release blocker; soxta muvaffaqiyat yo‘q.
- O‘rtacha tannarx, trialning signupda boshlanishi, 72 soat invite va 12 soat sessiya — hujjatdagi muhandislik defaultlari.
- Texnik super adminni yaratish/tenant adminni tiklash operational identity tekshiruvi bilan migratsiya operatori orqali bajariladi. Public parol retrieval yoki ixtiyoriy SQL API yo‘q.
- Texnik super adminning birinchi hisobi uchun `BOOTSTRAP_ROLE=super_admin` bilan bootstrapni alohida bajaring; keyingi texnik staff `/v1/platform/staff` orqali yaratiladi. Default bootstrap roli platform_owner.
- To‘liq R1 holati va ichki yakunlanmagan imkoniyatlar [implementation plan](docs/BARPO_IMPLEMENTATION_PLAN.md) da ochiq ko‘rsatilgan. Bu v0.1 backend implementatsiyasini to‘liq production R1 deb qabul qilmang.
