# Bosqich 1.1, 1.2, 1.5 — test case’lar

> **Sana:** 2026-10-09.
> **Qamrov:** `docs/TZ_VA_NARX_REJASI.md` dagi 1.1 (sahifalash va qidiruv), 1.2 (smeta jamlari serverdan), 1.5 (404 va xato holatlari). O‘zgarishlar hali commit qilinmagan.
> **Natija fayli:** `docs/tests/BOSQICH_1_NATIJA.md` (6-bo‘lim formati).

**“Qanday” ustuni**

| Belgi | Ma’nosi |
|---|---|
| **A** | Mavjud avtomatik test qamraydi: `backend/scripts/*` yoki `backend/tests/*`. Qaysi qadam ekani natijada ko‘rsatiladi. |
| **A+** | Avtomatik testga qo‘shish kerak: `integration.ts` yoki `ui-test.ts`, vaqtinchalik bazada. |
| **B** | Brauzerda tekshiriladi (Playwright yoki o‘rnatilgan brauzer), lokal stack’da. |

---

## 0. Muhit qoidalari

- Avtomatik testlar o‘z vaqtinchalik PostgreSQL konteynerini ochadi va mavjud bazaga tegmaydi. Ular `docs/backend/` dagi tracked fayllarni qayta yozadi (`verification.json`, `role-verification.json`, `BARPO_ROLE_TEST_REPORT.md`, `ui-verification.json`, `platform-tenant-ui.png`). Bu kutilgan holat.
- Docker testlari (`test:integration`, `test:roles`, `test:ui`) ketma-ket ishga tushiriladi, parallel emas.
- 100+ yozuv, begona kompaniya va narx huquqi kabi holatlar lokal bazada qo‘lda yaratilmaydi. Ular **A+** sifatida vaqtinchalik bazali testga qo‘shiladi. Lokal “Sinov kompaniya” bazasida yangi ma’lumot yaratishdan oldin ruxsat so‘raladi.
- Lokal hisoblarning parollari repoda yo‘q. B testlari uchun foydalanuvchidan chatda so‘raladi va hech qayerga yozilmaydi.
- Playwright `backend/node_modules` da; brauzer `chromium.launch({ channel: 'chrome' })` (handoff 4.5). Vite birinchi ochilishda sahifani bir marta qayta yuklaydi, birinchi urinish timeout bo‘lsa qayta urinish kerak.
- Yiqilgan test **tuzatilmaydi**. Takrorlash qadamlari va taklif qilingan yechim natija fayliga yoziladi, foydalanuvchi qarorini kutadi.

---

## 1. Avtomatik buyruqlar

| ID | Buyruq | Kutilgan natija |
|---|---|---|
| AUTO-01 | `backend`: `npm run build` | Xatosiz. 2026-10-09 da o‘tgan. |
| AUTO-02 | `backend`: `npm test` | Hammasi o‘tadi. 2026-10-09 da 11/11. |
| AUTO-03 | `backend`: `npm run test:integration` | 0 fail. Yangi qadamlar ham o‘tadi: qidiruv, filtrlar, smeta `totals`, `unpaid`, `archived`. |
| AUTO-04 | `backend`: `npm run test:roles` | 5/5 blok, 0 nomuvofiqlik. Yangi query parametrlari “matritsadan tashqari” (`unfillable`) ro‘yxatini oshirmagan. |
| AUTO-05 | `backend`: `npm run test:ui` | 0 fail, brauzer konsolida xato yo‘q. |
| AUTO-06 | `backend`: `npm run docs`, keyin `git diff --stat docs/backend` | OpenAPI va spetsifikatsiya joriy. Ikkinchi marta ishga tushirish yangi farq bermaydi. |
| AUTO-07 | `frontend`: `pnpm typecheck` | Xatosiz. |
| AUTO-08 | `frontend`: `pnpm build` | Xatosiz. |
| AUTO-09 | `git diff` da secret qidirish (token, parol, `.env`) | Topilmaydi. `backend/.env` tracked emas. |

---

## 2. Bosqich 1.1 — backend (API)

| ID | Tekshiruv | Qadamlar | Kutilgan natija | Qanday |
|---|---|---|---|---|
| API-01 | 100 dan ortiq material | 120 ta material yaratish. `GET /v1/materials?limit=100&offset=0`, keyin `offset=100` | 100 + 20 qator. Ikki sahifa kesishmaydi, birlashmasi 120 ta takrorsiz ID. | A+ |
| API-02 | Qidiruv katta-kichik harfga qaramaydi | “Sement M400” materiali; `q=SEM`, `q=sem` | Ikkalasida topiladi. | A (`q=SEM`), A+ (`q=sem`) |
| API-03 | `%` va `_` oddiy belgi sifatida qidiriladi | Nomida `%` yo‘q materiallar bor; `q=%` va `q=_` | `%` bo‘yicha bo‘sh. `_` bo‘yicha faqat nomida `_` borlari chiqadi; wildcard ishlamaydi. | A (`%`), A+ (`_`) |
| API-04 | Bo‘sh `q` | `q=` va `q=%20%20` | Filtrsiz natija bilan bir xil. | A+ |
| API-05 | `q` uzunligi | 101 belgilik `q` | `400 VALIDATION_ERROR`. 100 belgi qabul qilinadi. | A+ |
| API-06 | Sahifa chegaralari | `limit=0`, `limit=101`, `offset=-1`, `limit=abc` | Hammasi `400 VALIDATION_ERROR`. | A+ |
| API-07 | Mantiqiy filtrlar | Kontragent: `archived=true`, `archived=false`, `archived=1`, `archived=yes`. Xodim: `active=false`. Moliya hujjati: `unpaid=false` | `false`/`0` haqiqatan “yo‘q” deb olinadi (avvalgi xato: `"false"` → true). `yes` → 400. | A (qisman), A+ (`active=false`, `archived=1`) |
| API-08 | Obyekt qidiruvi va holat filtri | `q` nom, kod, buyurtmachi va manzil bo‘yicha; `status=active` | Har maydon bo‘yicha topiladi; status to‘g‘ri filtrlanadi. | A (`q`), A+ (kod, manzil, status) |
| API-09 | Qidiruv scope’dan chiqmaydi | Prorab A obyektga biriktirilgan; B obyekt nomi bilan `GET /v1/projects?q=<B nomi>` | Bo‘sh. B obyekt hech qanday qidiruvda chiqmaydi. | A+ |
| API-10 | Begona kompaniya | A kompaniya tokeni bilan B kompaniyadagi material, kontragent va xodim nomi bo‘yicha `q` | Hammasi bo‘sh. | A+ |
| API-11 | Xodimlar | `q` ism, login, telefon va lavozim bo‘yicha; `role=foreman&active=true` | To‘g‘ri natija; javobda parol hash’i yo‘q. | A (qisman), A+ (telefon, lavozim) |
| API-12 | Kontragentlar | `q` nom, INN, telefon va kontakt bo‘yicha | Har biri bo‘yicha topiladi. Qarz va avans faqat biriktirilgan obyektlar bo‘yicha (oldingi xatti-harakat saqlangan). | A (nom, INN), A+ (telefon, kontakt) |
| API-13 | Platforma ro‘yxatlari | `/v1/platform/tenants?q=&state=trial`, `/v1/platform/support?status=open`, `/v1/platform/billing/invoices?q=&unpaid=true` | `state` qiymati `/v1/platform/tenants/{id}` dagi `access_state` bilan bir xil. Filtrlar to‘g‘ri. Kompaniya roli → 403. | A (qisman), A+ (`state` ↔ `access_state` har 6 qiymat) |
| API-14 | Barqaror tartib | Bir xil nomli 3 material, sahifa chegarasi ular orasida | Sahifalar orasida takror ham, yo‘qolish ham yo‘q (`ORDER BY name, id`). | A+ |

---

## 3. Bosqich 1.1 — frontend

| ID | Tekshiruv | Qadamlar | Kutilgan natija | Qanday |
|---|---|---|---|---|
| UI-01 | Sahifa hajmi | Obyektlar, xodimlar, smetalar, vazifalar, hisobotlar, ombor, moliya hujjatlari, to‘lov so‘rovlari, kontragentlar, platforma kompaniyalari va invoyslari | Har birida 10/25/50 tanlovi, default 25. Tanlov o‘zgarsa 1-sahifaga qaytadi va so‘rovdagi `limit` mos keladi. | B |
| UI-02 | Sahifalash | 26+ yozuvli ro‘yxatda keyingi va oldingi sahifa | `offset` to‘g‘ri, qatorlar takrorlanmaydi, sahifa raqami va ko‘rsatkich to‘g‘ri. | B |
| UI-03 | Qidiruvni kutib yuborish (debounce) | Qidiruvga tez 5 harf yozish | Taxminan 300 ms dan keyin bitta so‘rov ketadi, har harfga emas. Natija 1-sahifadan boshlanadi. | B |
| UI-04 | Filtr sahifani qaytaradi | 3-sahifada turib holat filtrini o‘zgartirish | `offset=0`. | B |
| UI-05 | Material tanlash 100+ ro‘yxatda | 120 materialli kompaniyada smeta muharriri, ombor kirimi/jo‘natish/sarf modallari, StockPage | Ro‘yxatda 101-o‘rindan keyingi material nomi bilan qidirib topiladi va tanlanadi. | A+ (`ui-test.ts`) yoki B |
| UI-06 | Kontragent tanlash | Hujjat modali, moliya sahifasi, to‘lov so‘rovi | Server qidiruvi ishlaydi; arxivlangan kontragent taklif qilinmaydi. | B |
| UI-07 | Tahrirda tanlangan qiymat | Materiali 101-o‘rindan keyin turgan mavjud smeta qatorini tahrirga ochish | Maydonda UUID emas, material nomi ko‘rinadi. | B |
| UI-08 | `SearchSelect` holatlari | Natija yo‘q; yuklanmoqda; server xatosi; Esc, Enter va strelkalar | Har holat uchun matn bor; klaviatura bilan tanlash mumkin; Esc yopadi. | B |
| UI-09 | Obyekt va xodim tanlovlari (`apiAll`) | 100+ obyekt yoki xodim (vaqtinchalik bazada) | Hammasi tanlovda bor. | A+ |
| UI-10 | Yig‘indi faqat serverdan | Summa ko‘rsatadigan ro‘yxatlar: moliya hujjatlari, to‘lov so‘rovlari, kontragentlar | Faqat ekrandagi qatorlardan hisoblangan “jami” yo‘q: jami serverdan keladi yoki umuman ko‘rsatilmaydi (TZ 16-bo‘lim). `grep` bilan `Number(` va `reduce` pul maydonlarida tekshiriladi. | B + kod ko‘rib chiqish |
| UI-11 | `limit=100` qolgan 4 joy | Budjetlar, invoysga bog‘lanadigan ombor kirimlari, kontragent bo‘yicha qarz hujjatlari, obyekt smetalari | Har biri haqiqatan chegaralanganmi, baholanadi. **Xavf:** invoysga bog‘lanadigan kirimlar obyektda 100 dan oshishi mumkin. 101-chi hali bog‘lanmagan kirim tanlovda chiqmasa, “yiqildi (ma’lum cheklov)” deb yoziladi. | A+ yoki kod ko‘rib chiqish |
| UI-12 | Matnlar | UZ va RU da UI-01–08 ekranlari | Xom kalit (`common.xxx`) ko‘rinmaydi; ruscha matn 1280 px da sig‘adi. | B |

---

## 4. Bosqich 1.2 — smeta jamlari

| ID | Tekshiruv | Qadamlar | Kutilgan natija | Qanday |
|---|---|---|---|---|
| EST-01 | Tiyin aniqligi | Qatorlar jami 0.10, 0.20, 0.30 bo‘lgan smeta; `GET /v1/estimates/:id` | `totals.total === "0.60"` (string). Float qoldig‘i yo‘q. | A+ |
| EST-02 | Guruhlar mosligi | Har xil tur, kategoriya va zonali qatorlar | `by_kind`, `by_category` va `by_zone` har birining yig‘indisi `totals.total` ga teng. Zonasiz qatorlar alohida guruhda. | A (qisman), A+ (yig‘indi tengligi) |
| EST-03 | Narx huquqi yo‘q rol | Prorab bilan smeta detali | `totals.total` va summa maydonlari yo‘q; faqat soni (`count`) bor. Qatorlarda `fact_value` yo‘q. | A |
| EST-04 | Joriy reviziya | Smetani tahrirlab reviziya 2 yaratish | `totals` faqat joriy reviziyadan; arxivlangan qatorlar kirmaydi. | A+ |
| EST-05 | Detal sahifasi | Filtrsiz; faqat tur filtri; kategoriya, zona yoki qidiruv filtri | Filtrsiz → server jami. Faqat tur → shu turning server jami. Boshqa filtr → jami ko‘rsatilmaydi, noto‘g‘ri raqam ham chiqmaydi. | B |
| EST-06 | Frontendda pul qo‘shilmaydi | `grep -rn "sumBy\|Number(" frontend/src/features/estimates` | `EstimateDetailPage.tsx` da pul yig‘indisi qolmagan. Muharrirdagi saqlanmagan qatorlar uchun taxminiy jami ma’lum istisno. | Kod ko‘rib chiqish |
| EST-07 | Saqlangandan keyin moslik | EST-01 ma’lumoti bilan muharrirda saqlash, keyin detalga o‘tish | Detaldagi jami muharrirdagi taxminiy jami bilan formatlangan holda bir xil. | B |
| EST-08 | Excel eksport | Smetani eksport qilish | Fayldagi jami detaldagi `totals.total` ga teng; narx huquqisiz rolda summa ustunlari yo‘q. | A+ |

---

## 5. Bosqich 1.5 — 404 va xato holatlari

| ID | Tekshiruv | Qadamlar | Kutilgan natija | Qanday |
|---|---|---|---|---|
| ERR-01 | Noma’lum manzil, kompaniya roli | Login qilib `/app/blabla` ga kirish | AppShell ichida 404: ikonka, “topilmadi” sarlavhasi. “Bosh sahifa” `/app` ga sahifani qayta yuklamasdan o‘tadi (yangi document so‘rovi yo‘q). | B |
| ERR-02 | Login qilinmagan | `/app/blabla` va `/blabla` | `/login` ga yo‘naltiriladi. | B |
| ERR-03 | Platforma rollari | `platform_owner`, `super_admin` bilan `/admin/blabla` | 404. “Bosh sahifa” owner uchun `/admin` ga, super_admin va support uchun `/admin/support` ga olib boradi. | B |
| ERR-04 | Yo‘q obyekt | `/app/projects/<tasodifiy UUID>` | “Yozuv topilmadi” varianti; “Ro‘yxatga qaytish” tugmasi `/app/projects` ga olib boradi. | A+ (`ui-test.ts`) |
| ERR-05 | Biriktirilmagan obyekt | Prorab boshqa obyekt ID’sini ochadi | Ko‘rinish ERR-04 bilan aynan bir xil: matn, ikonka, tugmalar. Obyekt mavjudligi oshkor bo‘lmaydi. | A+ |
| ERR-06 | Begona kompaniya obyekti | A kompaniya admini B kompaniya obyekt ID’sini ochadi | ERR-04 bilan bir xil. | A+ |
| ERR-07 | Noto‘g‘ri formatdagi ID | `/app/projects/abc`, `/app/estimates/abc` | **Kutilgan:** 404 sahifasi. Agar server 400 qaytarib, sahifa “Xato” va “Qayta urinish” ko‘rsatsa, “yiqildi” deb yoziladi va yechim taklif qilinadi. | B |
| ERR-08 | Smeta va muharrir | `/app/estimates/<yo‘q ID>` va `/app/estimates/<yo‘q ID>/edit` | “Yozuv topilmadi”; “Ro‘yxatga qaytish” `/app/estimates` ga olib boradi. | B |
| ERR-09 | Platforma kompaniya kartasi | `/admin/tenants/<yo‘q ID>` | “Yozuv topilmadi”; qaytish `/admin/tenants` ga. | B |
| ERR-10 | Server xatosi | Playwright `page.route` bilan detal so‘roviga 500 qaytarish | `ErrorState` va “Qayta urinish” chiqadi. Bosilganda so‘rov qayta ketadi; route olib tashlangach sahifa ochiladi. | A+ yoki B |
| ERR-11 | Tarmoq uzilishi | `page.route(...).abort()` | ERR-10 bilan bir xil holat; 404 emas. | A+ yoki B |
| ERR-12 | API 403 | `page.route` bilan detal so‘roviga `403 FORBIDDEN` | `Forbidden` ko‘rinishi. | B |
| ERR-13 | Sahifa ruxsati | Ruxsati yopilgan rol bilan sahifa manzilini to‘g‘ridan-to‘g‘ri ochish | `Forbidden` (RequirePage) chiqadi, ma’lumot so‘rovi yuborilmaydi. | A (rol testi qisman), B |
| ERR-14 | “Orqaga” tugmasi | (a) Ichki havola orqali 404 ga kelish; (b) 404 havolasini yangi tabda ochish | (a) “Orqaga” bor va oldingi sahifaga qaytaradi. (b) “Orqaga” yo‘q. | B |
| ERR-15 | Matnlar | UZ va RU da ERR-01, ERR-04, ERR-10 | Ikkala tilda to‘liq matn, xom kalit yo‘q. | B |
| ERR-16 | Kenglik | 1280 va 1440 px | Tugmalar bir qatorda yoki toza o‘raladi, kesilmaydi. | B |

---

## 6. Natija formati (`docs/tests/BOSQICH_1_NATIJA.md`)

```text
| ID | Natija | Dalil | Izoh |
|---|---|---|---|
| AUTO-03 | o‘tdi | npm run test:integration → 0 fail (chiqishning oxirgi qatorlari) | |
| API-09 | yiqildi | scripts/integration.ts:<qator>, javob: [...] | Takrorlash qadamlari, taklif |
| UI-07 | tekshirilmadi | — | Sabab |
```

**Natija qiymatlari:**
- `o‘tdi`;
- `yiqildi`;
- `yiqildi (ma’lum cheklov)`;
- `tekshirilmadi` (sababi bilan).

**Fayl oxirida:**
- jami son: o‘tdi / yiqildi / tekshirilmadi;
- yangi qo‘shilgan avtomatik testlar ro‘yxati (fayl:qator);
- yiqilganlar bo‘yicha taklif qilingan tuzatishlar (hali qilinmagan);
- B testlari skrinshotlari: `docs/tests/screenshots/`.
