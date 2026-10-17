# BARPO AI — ishni davom ettirish uchun to‘liq holat (boshqa Claude sessiyasi uchun)

> **Sana:** 2026-10-12 (PR #3–#6 birlashgandan keyin yangilangan, `main` = `0542d87`). **Repo:** `Ismoil59/barpoai` (private), asosiy branch `main`.
> **Foydalanuvchi:** o‘zbekcha yozadi — javoblar o‘zbekcha. Loyiha egasi qarorlarini foydalanuvchi beradi.
> Bu fayl yangi sessiyani tez boshlash uchun holat surati. Sanasidan keyingi o‘zgarishlar uchun `git log` va ochiq PR’larni tekshiring; ziddiyat bo‘lsa reja hujjati va `BARPO_BUSINESS_RULES.md` ustun.

---

## 1. Birinchi qadam (majburiy)

1. `CLAUDE.md` ni o‘qing (xulq-atvor qoidalari va loyiha ko‘rsatkichlari).
2. `docs/TZ_VA_NARX_REJASI.md` — joriy ish rejasi. 1-bo‘lim (D1–D10, R1, R2) **majburiy** va eski hujjatlardan ustun. 3-bo‘lim — bosqichlar holati, 4-bo‘lim — narx varaqasi hisob qoidalari, 5-bo‘lim — valyuta qoidalari, 6-bo‘lim — tayyor promptlar, 9-bo‘lim — boshqa kompyuterda davom ettirish va ochiq ishlar (9.4 jadvali).
3. `docs/BARPO_AI_HANDOFF.md` — to‘liq loyiha konteksti (ishga tushirish, API, ruxsatlar, testlar).
4. `docs/backend/BARPO_BUSINESS_RULES.md` — biznes qoidalari (xonadonlar, valyuta, narx varaqasi bo‘limlari shu sessiyalarda qo‘shilgan).
5. Mijoz TZ’si: `docs/tz/BARPO_AI_Figma_TZ.md` (qidirish uchun), asl nusxasi `.docx`.

## 2. Loyiha qisqacha

Qurilish kompaniyalari uchun multi-tenant SaaS ERP: obyektlar va zonalar, smeta, ombor, moliya (jurnal), vazifa va hisobotlar, ish haqi, Telegram bot, SaaS billing, 10 rol (3 platforma + 7 kompaniya). Stack: backend Node/TypeScript + Fastify + PostgreSQL 17 (RLS), frontend Vite + React + TS + react-query. Joylashuv: `backend/`, `frontend/`, `docs/`.

**Qat’iy qoidalar (CLAUDE.md dan):**
- Pul va miqdor — oxirigacha decimal string. Saqlash va kiritish faqat UZS. USD faqat ko‘rsatish uchun: konvertatsiya faqat `formatMoney` ichida, server bergan CBU kursi bilan, decimal arifmetika (Number emas). Frontend yig‘indi hisoblamaydi, jamlar serverdan.
- Ruxsat serverda (UI faqat yashiradi). Har yangi matn `uz` va `ru` lokallarga. Statik demo raqam yo‘q — bo‘sh/xato holatlari.
- Qo‘llangan migratsiyani tahrirlamang. Oxirgi migratsiya `021_telegram_bot_health.sql`, keyingisi **022**.
- AI funksiya qo‘shilmaydi. CRM, sotuv, bron, mijoz, shartnoma yo‘q (D1).
- Sirlar `backend/.env` da (gitignore). Token yoki parol yaratmang, so‘ramang, faylga yozmang. Lokal hisob parollari hech qayerda yozilmagan — kerak bo‘lsa foydalanuvchi o‘zi kiradi.

## 3. Ish tartibi (foydalanuvchi talab qiladi)

1. Har bosqich: **avval reja va taxminlar → foydalanuvchi tasdig‘i → ish → tekshiruv**. Savol va taxminlarni aniq ayting, tavsiyangizni bering.
2. Modellar taqsimoti — rejaning 6.0-bo‘limi: qidiruv `Explore` (haiku); mexanik UI/lokal kod `general-purpose` (sonnet) aniq fayl ro‘yxati va qabul mezoni bilan; migratsiya, ruxsat, pul va hisob — asosiy sessiya; oxirida diff’ni yangi opus sub-agent mustaqil tekshiradi (hisob modullari uchun fable, bo‘lmasa opus).
3. Tekshiruv (har commit oldidan): backend `npm run build`, `npm test`, `npm run test:integration`, `npm run test:roles`, `npm run test:ui`, route o‘zgarsa `npm run docs`; frontend `pnpm typecheck`, `pnpm build`. O‘tmagan testni “o‘tdi” demang; natijani jadval bilan bering.
4. **Commit, push va PR faqat foydalanuvchi ruxsati bilan.** Har bosqich `main` ustidan alohida branch, alohida PR. PR’ni foydalanuvchi birlashtiradi.
5. Testlar qayta yozadigan hisobot fayllarini (`docs/backend/verification.json`, `role-verification.json`, `ui-verification.json`, `BARPO_ROLE_TEST_REPORT.md`, `platform-tenant-ui.png`, `ui-failure-*.png`) faqat ataylab yangilash kerak bo‘lsa commit qiling; aks holda `git checkout --` bilan qaytaring. Haqiqiy hujjat o‘zgarishlari (OpenAPI, DDL, biznes qoidalari) commit’ga kiradi.
6. Prettier: o‘zgartirgan faylingiz oldin prettier-toza bo‘lsa formatlang; toza bo‘lmasa, boshqa qatorlarni qayta formatlamang (diff faqat o‘zingizniki bo‘lsin).
7. Parallel thread’lar: ikki thread bir faylni o‘zgartirsa, ikkinchi birlashadigan PR’da konflikt bo‘ladi. Ayniqsa `docs/TZ_VA_NARX_REJASI.md` (3-bo‘lim va 9.4-jadval). Ikkinchi PR’dan oldin `main` ni qo‘shib testlarni qayta o‘tkazing.

## 4. Muhit

**Bulut konteyneri (Claude Code on the web):**
- Node 22 (talab ≥24) — build va hamma testlar shu bilan o‘tadi.
- Docker daemon o‘zi ishlamaydi: `dockerd` ni fonda ishga tushiring, `docker info` bilan kuting. Konteyner qayta tug‘ilsa daemon yana o‘chadi.
- Docker Hub 429 bersa: `docker pull mirror.gcr.io/library/postgres:17-bookworm` va `docker tag mirror.gcr.io/library/postgres:17-bookworm postgres:17-bookworm`.
- `test:ui` Google Chrome kutadi: `mkdir -p /opt/google/chrome && ln -sf /opt/pw-browsers/chromium-1194/chrome-linux/chrome /opt/google/chrome/chrome` (faqat konteynerda, repoga hech narsa qo‘shmang).
- `cbu.uz` ga tarmoq ruxsati yo‘q (403) — CBU jonli faqat lokalda tekshiriladi.
- Agar repo ko‘rinmasa: `add_repo` (Ismoil59/barpoai); GitHub ulanishi `https://claude.ai/connect-github` da.

**Foydalanuvchining kompyuterlari (Windows):**
- **Yangi (joriy):** `D:\SANCEEK\barpoai\barpo-ai` — GitHub’dan olingan. Baza bo‘sh boshlanadi; platforma egasini foydalanuvchi o‘zi `npm.cmd run bootstrap` bilan yaratadi (parol hech qayerda saqlanmaydi, so‘ramang). PowerShell `pnpm.ps1` ni bloklasa: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` yoki `pnpm.cmd` / `npm.cmd`.
- **Eski:** `D:\Ismoil\VScode\Frontend\Frontend\barpo-ai` — lokal bazada “Sinov kompaniya” bor.
- `backend/` da `docker compose up --build -d` (migratsiyalar avtomatik), API `127.0.0.1:3001`, DB `127.0.0.1:5433`, frontend `pnpm dev` → `localhost:5173` (strictPort).
- `COMPOSE_PROJECT_NAME=barpo`; boshqa loyihaning `backend_postgres_data` volume’iga tegmang.
- Eski kompyuter bazasida “Sinov kompaniya” (`SINOV-001`) va `SINOV-` test ma’lumotlari bor; yangi kompyuterga va bulutga ko‘chmaydi.
- `backend/.env` da haqiqiy Telegram bot tokeni bor: bitta token bilan ikki joyda worker ishlamasin (`getUpdates` konflikti). 2026-10-13: shunday konflikt topildi — boshqa nusxa (eski kompyuter yoki bulut) polling qilib, ulash havolasi va 2FA kodlarini “yutgan”. Endi worker so‘nggi xatoni `telegram_bot_state` ga yozadi (migratsiya 021), Diagnostika va Profil “bot boshqa joyda ishlayapti” deb ko‘rsatadi; `docker logs barpo-worker-1` da `Conflict: terminated by other getUpdates request`.
- Lokalda CBU kursi ishlaydi (2026-10-11 da 11 897,90 olingan, `parseCbuRate` mos).
- Kompyuter vaqt zonasi UTC+5: Docker testlarini `TZ=UTC` bilan yurgizing (Git Bash: `TZ=UTC npm run test:integration`), aks holda `integration.ts` eski O17 xatosi bilan yiqiladi (toza `main` da ham). 2026-10-12 da shu rejimda: integration 71, roles 5, UI 47.

## 5. Bajarilgan ishlar (holat 2026-10-12)

| Bosqich | Mazmun | Qayerda |
|---|---|---|
| 1.1, 1.2, 1.5 | server sahifalash va qidiruv, smeta jamlari serverdan, 404 va xato holatlari | `main` (`ec91638`) |
| 1.3 | obyekt maydoni/rasmi, zona turi va tahriri, migratsiya 014 | `main` (`af70f57`) |
| 3 | xonadonlar (`premises`) ro‘yxati va Excel import, migratsiya 015 | `main` (PR #1) |
| 2 | UZS/USD almashtirgich, CBU kursi, migratsiya 016 | `main` (PR #2) |
| 4 | narx varaqasi, migratsiya 017 | `main` (PR #2, `a1ba70c`) |
| 1.4 | dashboard grafiklari, obyekt va davr filtri | `main` (PR #3, `16b2d43`) |
| Hujjat | shu holat fayli va `CLAUDE.md` ko‘rsatkichi | `main` (PR #4, `6a9d200`) |
| Kichik tuzatishlar | O1, O4–O8, O10 (`PayablesList` o‘chirildi), reja 9.1/9.4; yangi O13 | `main` (PR #6, `ec9a706`) |
| Hujjat | TZ’dan kelishilgan farqlar (8-bo‘lim), bosqichlar holati | `main` (PR #5, `0542d87`) |
| Egasi fikri 2026-10-12 | D11–D14: tarif tahriri (018), super_admin huquqlari va parol tiklash havolasi, parol 6 belgi, blok kartasi va blok sahifasi (019, xonadon reja rasmi, narx varaqasidagi tannarx), Excel import tuzatishi (openpyxl fayllari, sarlavha qatorini topish, birlik sinonimlari), login sahifasi ru tili, bildirishnomadan sahifaga o‘tish, “Obuna to‘lovlari”, overscroll, Windows Chrome kursori, logo, kalendar va select komponentlari, smeta muharriri joylashuvi; `scripts/seed-dev.ts` (dev hisoblar, parol faqat `SEED_PASSWORD`) | branch `claude/feedback-2026-10-12`, PR egasi ruxsati bilan |
| Figma F1 (2026-10-16/17) | D17–D20 (rejaning 1-bo‘limi): migratsiya 022 (“Asosiy ombor”), admin ombor/materiallarni faqat ko‘radi, rollar Figma bo‘yicha (`employees.read` yangi ruxsat), umumiy qobiq va rolga xos menyular, 6 rol bosh sahifasi, `GET /v1/dashboard` `costs`/`stock.monthly`/`stock.recent` | branch `claude/figma-stage-1` (`claude/feedback-2026-10-12` ustiga), commit egasi ruxsati bilan |
| Figma F2 (2026-10-17) | Obyektlar kartalari (`GET /v1/projects` progress/mas’ul/smeta/xarajat), obyekt sahifasi banner va bloklar tabi, smetalar KPI va ro‘yxat (`GET /v1/estimates` `summary`), smeta ko‘rish ierarxik jadvali va hisoblash kartasi; F3–F6 navbatda | o‘sha branch, commit egasi ruxsati bilan |

### Bosqich 3 — xonadonlar (asosiy qarorlar)
- Jadval `premises`: zona ixtiyoriy, `kind` apartment/commercial/parking/storage, qavat −10…500, xonalar 0…50, maydon numeric(12,2) > 0, arxiv, version; RLS, kompozit FK.
- **R2 bazada:** `block_zone_id` faqat trigger hisoblaydi (eng yaqin `kind='block'` ota zona); ikkita qisman unikal indeks (`lower(number)`, faqat arxivlanmaganlar). Zona turi o‘zgarsa bloklar qayta hisoblanadi, to‘qnashuv → `PREMISE_NUMBER_CONFLICT` (409). Obyekt bo‘yicha advisory qulf (`1503`) har qanday qator qulfidan oldin olinadi.
- Excel import: qat’iy shablon (Blok, Kirish, Qavat, Raqam, Tur, Xonalar, Maydon; uz yoki ru sarlavhalar), haqiqiy Excel qator raqamlari, xato bo‘lsa import bloklanadi. Qayta yuklash: (blok, raqam) bo‘yicha — farq bo‘lsa yangilanadi, bir xil bo‘lsa o‘zgarishsiz. Yo‘q blok/kirish → xato (zona avtomatik yaratilmaydi). Tur qiymatlari uz/ru so‘zlar. Arxivlangan raqam unikallikda hisoblanmaydi. Qavat blok `floors_count` dan oshmaydi. Katak 500 belgigacha; Raqam son katagi faqat butun son.
- Ma’lum cheklovlar: blok qavatlari keyin kamaytirilsa mavjud xonadonlar qayta tekshirilmaydi; JS va PostgreSQL katta-kichik harf farqi kamdan-kam holatda commit paytida 409 beradi.

### Bosqich 2 — valyuta (asosiy qarorlar)
- `exchange_rates` umumiy jadval (RLS yo‘q, kurs > 0). Worker `refreshRates` (`backend/src/rates.ts`): bugungi sanali kurs bo‘lsa o‘tkaziladi, xatoda oxirgi kurs qoladi, keyingi urinish 10 daqiqadan keyin; boshqa worker ishlaridan alohida `try`.
- `GET /v1/exchange-rates/latest` — har bir kirgan foydalanuvchi, platforma xodimlari ham (`passwordChange: true` bilan tenant tekshiruvisiz; kurs ochiq ma’lumot).
- Frontend: `CurrencyProvider` (`lib/currency.tsx`, `localStorage['barpo.currency']`), sof hisob `lib/currency-math.ts` (decimal.js, precision 40, HALF_UP, 2 xona), `formatMoney(value, lang, withCurrency, pin?)` — `pin='UZS'` formalarda, `pin='USD'` narx varaqasida (server bergan USD qiymat). USD “20 947,30 $”. Jadval sarlavhalari `displayCurrency()`. Formalar va eksportlar UZS (narx varaqasi bundan mustasno).

### Bosqich 4 — narx varaqasi (asosiy qarorlar)
- `price_lists` va `price_list_lines` o‘zgarmas (trigger) + RLS; yangi `pricing` sahifasi, ruxsatlar `pricing.read/write`, bazaviy siyosat `tenant_admin` va `financier` (D8). Hisob `backend/src/pricing.ts`; 4.4 nazorat misoli testda aynan chiqadi.
- Egasi qarorlari: hamma tur maydon bo‘yicha teng ulush (D4); fakt = `account='expense'` jurnal yozuvlari; reversal xarajati asl hujjat zonasiga; zonasiz sarf zonasi smeta qatori zonasidan; **xonadonsiz zona xarajati eng yaqin xonadonli ota zonaga**, topilmasa umumiy guruhga (rejaning 4.1-bandi shunga yangilangan); barcha arxivlanmagan smetalar rejaga kiradi (muqobil smetalarni arxivlash kerak — chegara, hujjatlangan); prognoz 0 → `PRICE_LIST_NO_COSTS`; ustama 0..1000, oldingisidan to‘ldiriladi; versiyalar o‘chirilmaydi, oxirgisi joriy; guruhlar jsonb; eksport `prices.read` talab qiladi.

### Bosqich 1.4 — dashboard (`main`, PR #3)
- `GET /v1/dashboard` ga `project_id` va `months` (3/6/12); `finance.monthly`, `by_kind`, `over_budget`; `tasks.overdue_items`.
- Foydalanuvchi tuzatishlari bajarilgan: obyekt filtri hamma bloklarga, davr filtri davrga bog‘liq ko‘rsatkichlarga, davrsiz sanoqlarda “hozirgi holat” izohi; grafiklar `document_date` bo‘yicha; “budjetdan oshgan” Budjetlar sahifasi ta’rifi bilan (u `created_at`); turlar material/ish haqi/texnika/xizmat, yig‘indi = davr xarajati; ulushlar serverdan.
- API’dan `month_expense`, `budget_month`, `accepted_30d`, `last_7d` o‘chirildi (iste’molchilar faqat dashboard, tekshirilgan).
- Yangi ochiq ish **O12** (9.4-jadvalda): reja–fakt va budjet sahifalari `created_at` ishlatadi, `document_date` emas.
- Docker PostgreSQL 17 bilan tekshirilgan: integration 63, roles 5, UI 47.
- Ko‘rib chiqishdagi kichik kuzatuvlar (bloklamagan): oylik reja `oylik miqdor × birlik narxi` qatorma-qator yaxlitlanmaydi (smeta jamidan tiyinlarga farq qilishi mumkin); reja barcha arxivlanmagan smetalardan; “qolgan budjet” davrga emas, butun muddatga; obyekt filtri bilan xodimlar sonida kompaniya admini hisoblanmaydi (biriktirilmagan).

## 6. Qilinishi kerak bo‘lgan ishlar (tavsiya tartibi)

**`main` = `0542d87` da to‘liq tekshiruv (2026-10-12, bulut, Docker PostgreSQL 17):** build, unit 27, integration 65, roles 5 (topilma yo‘q), UI 47; frontend typecheck va build — hammasi o‘tdi.

0. **Figma bosqichlari F2–F6** (2026-10-17 dan asosiy ish): tartib va mazmun rejaning 3-bo‘limidagi “Figma bosqichlari” jadvalida; har bosqich alohida branch va PR, egasi tasdig‘i bilan. `claude/figma-stage-1` branch’i hali commit qilinmagan o‘zgarishlar bilan (egasi ruxsatini kutadi).
1. **Yangi kompyuterda tekshiruv** (foydalanuvchi): `git pull`, `docker compose up --build -d`, platforma egasini bootstrap, brauzerda dashboard grafiklari, Xonadonlar, Narx varaqasi va UZS/USD.
2. **O3** — frontenddagi pul yig‘indilarini serverga ko‘chirish (kassalar `finance/pages.tsx`, budjet, to‘lov kalendari `workflow.tsx`, smeta importi oldindan ko‘rish `ImportWizard.tsx`). Opus tekshiruvi qo‘shimcha joylarni ham topgan: `finance/pages.tsx` (~178, ~783, ~843) va `workflow.tsx` (~976, ~1345) da `num(a) - num(b)`. Alohida PR. Shu ro‘yxatga `finance/DocumentModal.tsx` dagi kirim summasi (`unit_cost × accepted_quantity`, `Number`) ham kiradi.
3. **O12** — reja–fakt va budjet sahifalarini `document_date` ga o‘tkazish (dashboard “budjetdan oshgan” ro‘yxati ham birga).
4. **O14 — ruxsatlarni qayta yuklashdagi miltillash** (9.4 da): `frontend/src/lib/auth.tsx` `loadPermissions` xato bersa `permissions=null` → `RequirePage` bir lahza `Forbidden` ko‘rsatadi. UI testda bir marta “topilmadi” tekshiruvini yiqitgan (`ui-test.ts` ~1139). Taklif: qayta yuklash paytida eski ruxsatlarni saqlash.
5. **Qolgan ochiq ishlar:** O2 (Telegram bot material ro‘yxati `LIMIT 60`, qidiruv yo‘q), O9 (ba’zi UI testlari yo‘q), O11 (yetim fayllar, 08-bosqich bilan), O13 (bekor qilingan invoys ombor kirimini bo‘shatmaydi — egasi qarori kerak).
6. **Rejaning 7-bo‘limi** (rejalashtirilmagan TZ talablari) — ko‘plari foydalanuvchidan qaror yoki provayder/kirish ma’lumotini talab qiladi (bank/Didox/iHamkor, UySot, kamera, email/SMS provayderi, markaziy katalog siyosati).
7. Kichik texnik qarz: `backend/tests/rates.test.ts` frontenddagi `currency-math.ts` ni import qiladi va `decimal.js` ni `frontend/node_modules` dan oladi — faqat backend o‘rnatilgan muhitda yiqiladi (hozir CI yo‘q).
8. Buxgalter uchun alohida dashboard hozir yo‘q (TZ DASH-01–06 da buxgalter yo‘q). Taklif: finansistnikiga yaqin (to‘lanmagan hujjatlar, kontragentlar qarzi, moslashtirilmagan to‘lovlar, davr xarajati, bekor qilingan hujjatlar) — foydalanuvchi tasdiqlasa, keyinroq.
9. Ixtiyoriy “UI sifat” tekshiruvi (dizayner yo‘qligi sababli): `test:ui` skrinshotlari va lokal brauzer bo‘yicha bir xillik, bo‘sh holatlar, uz/ru matnlar, mobil ko‘rinish; topilmalar alohida kichik PR’larda.

## 7. Dizayn

- **2026-10-16 dan:** egasi Figma dizaynini PNG eksport sifatida berdi — `D:\SANCEEK\barpoai\figma` (repoda emas; 9 rol papkasi, 91 ekran). Bu endi har rol uchun dizayn va mantiq manbai (reja D17–D20, F1–F6 bosqichlari rejaning 3-bo‘limida). Backendda ma’lumoti yo‘q bo‘limlar ko‘rsatilmaydi; demo raqam yo‘q qoidasi kuchda.
- Oldin (2026-10-12): dizayner yo‘q, dizayn manbai — kod (mavjud komponentlar, `tokens.css`). Figma TZ faqat talablar ro‘yxati.
- TZ’dan farqlar rejaning 8-bo‘limida “kelishilgan farqlar” sifatida qayd etilgan; hech kimga xabar yuborish kerak emas.
- Aniqlik (8-bo‘limda ham): kompaniya adminini platforma egasi bir martalik taklif havolasi (72 soat) bilan qo‘shadi; xodimlarni admin login va boshlang‘ich parol bilan qo‘shadi (birinchi kirishda almashtirish majburiy); parolni tiklash — admin bergan 30 daqiqalik bir martalik havola.

## 8. Avtomatlashtirish

- “Haftalik holat” routine: har dushanba 9:45 da faqat o‘qiydigan o‘zbekcha qisqa hisobot (birlashgan bosqichlar, ochiq PR’lar, keyingi qadam). Yoqilgan.

## 9. Yangi sessiya uchun boshlang‘ich prompt

```text
CLAUDE.md, docs/BARPO_AI_HANDOFF.md va docs/TZ_VA_NARX_REJASI.md ni o‘qi (1-, 3-, 4-, 5- va 9-bo‘limlar).
Holat faylini ham o‘qi: docs/BARPO_AI_DAVOM_ETTIRISH.md.
git fetch qil va main, ochiq PR’lar va branch’larni fayldagi holat bilan solishtir; farq bo‘lsa ayt.
Joriy holatni va keyingi qadamni qisqa ayt, hech narsani o‘zgartirma.
Keyingi ishni boshlashdan oldin reja va taxminlaringni ber, tasdig‘imni kut. Commit/push/PR faqat ruxsatim bilan.
```
