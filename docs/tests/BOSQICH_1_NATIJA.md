# Bosqich 1.1, 1.2, 1.5 — test natijalari

> **Sana:** 2026-10-09 (testlar), 2026-10-10 (yiqilganlar tuzatildi, avtomatik testlar qayta yurdi). **Manba:** `docs/tests/BOSQICH_1_TEST_CASES.md`.
> **Muhit:** avtomatik testlar — vaqtinchalik `postgres:17` Docker; B testlari — lokal stack (`barpo` compose, API image 2026-10-09 da qayta qurilgan, Vite 5173, Headless Chrome, Playwright). 2026-10-09 da ilova kodi o‘zgartirilmagan; 2026-10-10 dagi tuzatishlar 8-bo‘limda. B testlari tuzatishdan keyin qayta yurmadi (egasi qarori: UI-01 va ERR-07 frontend o‘zgarishi, ERR-07 ni `test:ui` qamraydi). Commit yo‘q.
> Qator raqamlari ishchi papkadagi (commit qilinmagan) fayllarga tegishli, 2026-10-10 holati.

## 1. Avtomatik buyruqlar

| ID | Natija | Dalil | Izoh |
|---|---|---|---|
| AUTO-01 | o‘tdi | `npm run build` → exit 0 (2026-10-09 va 2026-10-10) | |
| AUTO-02 | o‘tdi | `npm test` → `tests 11, pass 11, fail 0` (2026-10-09 va 2026-10-10) | |
| AUTO-03 | o‘tdi (tuzatildi, 2026-10-10) | 2026-10-10: `npm run test:integration` → `"passed": 57`, `"failed": []`, exit 0 (`docs/backend/verification.json`) | 2026-10-09 da yiqilgan edi: `"passed": 54, "failed": ["Estimate Excel export JAMI row must equal totals.total: file=0.6000000000000001 totals=0.60"]`, exit 1 — sabab EST-08. Skript `failed` ro‘yxatini yig‘ib oxirida `process.exitCode` qo‘yadi (`integration.ts:43, :2116`) |
| AUTO-04 | o‘tdi | `npm run test:roles` → `"passed": 5, "findings": [], "unfillable": []`; 63 GET × 10 rol (2026-10-10 da qayta) | HEAD da ham `unfillable` 0 edi — yangi query parametrlar ro‘yxatni oshirmagan |
| AUTO-05 | o‘tdi | 2026-10-10: `npm run test:ui` → 43 check (A+ dan oldin 38), `No uncaught React/browser errors`, exit 0 (`docs/backend/ui-verification.json`) | |
| AUTO-06 | o‘tdi | `npm run docs` → `BARPO_API_OPENAPI.yaml` +120 qator (yangi `q`, `state`, `archived`, `unpaid`, `active`, `role`, `status` parametrlari); ikkinchi yurish `git diff --stat docs/backend` ni o‘zgartirmadi (2026-10-10 da ham) | `queryBool` ga o‘tgan `unread`/`mine`/`overdue` OpenAPI’da avvalgidek `type: boolean` — hujjatda farq yo‘q |
| AUTO-07 | o‘tdi | `pnpm typecheck` → exit 0 (2026-10-09 va 2026-10-10) | |
| AUTO-08 | o‘tdi | `pnpm build` → `✓ built` (2026-10-09 va 2026-10-10) | |
| AUTO-09 | o‘tdi | `git diff` + untracked fayllarda `password/parol/token/secret/.env/scrypt$` qidiruvi: faqat test o‘zgaruvchi nomlari (`adminToken`, `ownerToken`) va hujjat matni; `git ls-files` da faqat `backend/.env.example`, `frontend/.env.example` | |

## 2. Bosqich 1.1 — backend (API)

| ID | Natija | Dalil | Izoh |
|---|---|---|---|
| API-01 | o‘tdi | A+ `integration.ts:361` — 125 material, `limit=100&offset=0` → 100, `offset=100` → 25, kesishma yo‘q, 125 unikal ID | |
| API-02 | o‘tdi | A `integration.ts:321` (`q=SEM`), A+ `:361` (`q=sem`) | |
| API-03 | o‘tdi | A `integration.ts:321` (`q=%25` → 0), A+ `:361` (`q=_` → faqat `Qum_mayda`) | `likePattern` (`schemas.ts:96`) `\ % _` ni qochiradi |
| API-04 | o‘tdi | A+ `integration.ts:361` — `q=` va `q=%20%20` ID ro‘yxati filtrsiz bilan deepEqual | |
| API-05 | o‘tdi | A+ `integration.ts:361` — 101 belgi → `400`, `error.code === 'VALIDATION_ERROR'`; 100 belgi → 200 | |
| API-06 | o‘tdi | A+ `integration.ts:361` — `limit=0`, `limit=101`, `offset=-1`, `limit=abc` → `400 VALIDATION_ERROR` | |
| API-07 | o‘tdi | A `integration.ts:199` (`active=yes` → 400), `:1002` (`archived=true/false`), `:1117` (`unpaid=true`, `unpaid=yes` → 400); A+ `:286` (nofaol xodim seed, `active=false`/`0`, `active=true` prorabni o‘z ichiga oladi), `:1051` (arxiv kontragent seed, `archived=1` ≡ `true`, `0` ≡ `false`, `archived=false` → faqat faol, `archived=yes` → 400), `:1133` (`unpaid=false` ≡ filtrsiz ≡ `unpaid=0` ⊇ `unpaid=true`). 2026-10-10 qo‘shimcha (qolgan 4 bayroq): `:851` (`/v1/tasks` `mine=false`/`0` ≡ filtrsiz, `mine=true` → admin uchun bo‘sh, `mine=yes` → 400), `:1158` (`/v1/finance/payables` `overdue=false`/`0` ≡ filtrsiz, `overdue=true` muddatsiz hujjatni chiqarmaydi, `overdue=yes` → 400), `:1384` (`/v1/me/notifications?unread=false` o‘qilganlarni qaytaradi, `unread=yes` → 400), `:1685` (`/v1/tasks/export` `mine=false` ≡ filtrsiz, `mine=true` → faqat sarlavha) | `queryBool` (`schemas.ts:98`) `"false"`/`"0"` → false; 2026-10-10 dan endpointlarda `z.coerce.boolean` qolmadi |
| API-08 | o‘tdi | A `integration.ts:199` (nom, `status=completed` → 0); A+ `:238` (`q=prj-77`, buyurtmachi, manzil, `status=active` → faqat Obyekt B) | |
| API-09 | o‘tdi | A+ `integration.ts:238` — prorab `q=obyekt%20b`, `q=prj-77`, `q=sardor`, `q=chilonzor` → 0; `q=obyekt` → faqat A; `GET /v1/projects/<B>` → 404 | |
| API-10 | o‘tdi | A+ `integration.ts:2034` — B kompaniya tokeni bilan A ning material/kontragent/xodim nomlari → 0 (va aksincha), o‘z nomlari topiladi; ID bo‘yicha izolyatsiya `role-tests.ts:560–614` | |
| API-11 | o‘tdi | A `integration.ts:199` (`q=FORE&role=foreman&active=true`); A+ `:286` (ism, login, telefon, lavozim alohida; `role=foreman` alohida; POST javobi va ro‘yxat JSON’ida `password_hash` va `scrypt$` yo‘q) | `GET /v1/employees/:id` mavjud emas — tekshirilmadi |
| API-12 | o‘tdi | A `integration.ts:1002` (nom); A+ `:1051` (INN, telefon, kontakt; yozuvsiz kontragent `debt`/`advance` === `'0.00'`), `:1976` (literal: admin qarz `140.00` = A 40 + B 100, faqat A ga biriktirilgan finansist `40.00`; avans admin `30.00`, finansist `'0.00'`) | 2026-10-10 gacha yozuv bo‘lmasa `'0'` qaytardi — tuzatildi (9-bo‘lim, 6) |
| API-13 | o‘tdi | A `integration.ts:141` (`q`+`state=trial`), `:1764` (support `status=open` — endi seed qilingan ochiq murojaat bilan, bo‘sh emas), `:1915` (invoys `q`/`unpaid`); A+ `:2096` — 6 `state` ro‘yxati, har element `GET /v1/platform/tenants/{id}.access_state` bilan teng, ro‘yxatlar kesishmaydi, birlashmasi filtrsiz ro‘yxatga teng, 6/6 holat seed qilingan va har biri a’zoligi tekshirilgan; kompaniya roli → 403: `role-tests.ts:560` matritsa | `overdue` DB INSERT bilan seed qilingan (003 `trial_once` trigger faqat UPDATE ni to‘xtatadi) |
| API-14 | o‘tdi | A+ `integration.ts:381` — 3 ta `AAA takror`, `limit=2&offset=0` ∪ `limit=2&offset=2` → 4 unikal, har takror bir marta, takror ID’lar o‘sish tartibida (`ORDER BY name,id`), `limit=1&offset=0..3` yurishi `limit=4` bilan teng | |

## 3. Bosqich 1.1 — frontend

| ID | Natija | Dalil | Izoh |
|---|---|---|---|
| UI-01 | o‘tdi (tuzatildi, 2026-10-10) | B (2026-10-09): 11 ro‘yxat (obyektlar, xodimlar, smetalar, vazifalar, hisobotlar, ombor “Harakatlar” tabi, hujjatlar, to‘lov so‘rovlari, kontragentlar, platforma kompaniyalari, platforma invoyslari) — hammasida `10/25/50`, tanlov o‘zgarganda so‘rov `limit=10&offset=0`; faqat platforma invoyslari (`/admin/billing`) default 50 edi. `screenshots/UI-01.png`. Tuzatish: `frontend/src/features/platform/pages.tsx:1231` `useListState(50)` → `useListState()` (default 25, `components/ui/index.tsx:569`) | Tuzatishdan keyin B qayta yurmadi (egasi qarori: kod o‘zgarishi dalil). Qayd: ombor “Balanslar” tabi sahifasiz (`/v1/stock/overview` to‘liq ro‘yxat) |
| UI-02 | o‘tdi | B: 30 ta `SINOV-Obyekt` (qidiruv bilan), 1-sahifa 25 qator, “Keyingi” → `?q=SINOV-Obyekt&limit=25&offset=25`, 2-sahifa 5 qator, takror 0, “2-sahifa” ko‘rsatkichi; “Oldingi” → `offset=0`, “1-sahifa”. `screenshots/UI-02.png` | |
| UI-03 | o‘tdi | B: `SINOV` 5 harfi 336 ms da yozildi, 1.2 s ichida bitta so‘rov `?q=SINOV&limit=25&offset=0` | `useDebounced` 300 ms (`components/ui/index.tsx:556`) |
| UI-04 | o‘tdi | B: `limit=10`, 3-sahifada (`offset=20`) holat filtri `active` → so‘rov `?q=SINOV-Obyekt&status=active&limit=10&offset=0`, “1-sahifa” | |
| UI-05 | o‘tdi | A+ `ui-test.ts:418` — 120 ta `Tosh NNN`; smeta muharriri qatorida `Tosh 118` tanlangach qator “Nomi” = `Tosh 118`, “Birlik” = `kg`, blur’dan keyin maydon qiymati saqlanadi; ombor “Kirim” modalida ham blur’dan keyin `Tosh 118` | `SearchSelect` `limit=50` bilan server qidiruvi; `Tosh 118` default tartibda 118/120-o‘rinda |
| UI-06 | o‘tdi | B: hujjat modali (`service`) kontragent maydoni → `GET /v1/counterparties?archived=false&q=SINOV&limit=50` → 2 variant (`SINOV-Kontragent A`, `B`), arxivlangan `SINOV-Kontragent Arxiv` yo‘q; to‘lov so‘rovi modali ham shunday. `screenshots/UI-06.png` | Moliya hub sahifasida kontragent tanlovi yo‘q |
| UI-07 | o‘tdi | B: `SINOV-Smeta API` ni tahrirga ochganda material qatori maydonida `SINOV-Material 3` (UUID emas). `screenshots/UI-07.png` | Lokalda 101+ material yo‘q (kichik hajm); 101+ holat A+ UI-05 da. Mexanizm (`valueLabel`) o‘rindan bog‘liq emas |
| UI-08 | o‘tdi | B: natija yo‘q → “Hech narsa topilmadi”; `page.route` 500 → “Xatolik yuz berdi”; kechiktirilgan javobda “Yuklanmoqda…”; Esc ro‘yxatni yopadi, modal ochiq qoladi; ArrowDown + Enter → `SINOV-Kontragent B` tanlanadi. `screenshots/UI-08-empty.png`, `UI-08-error.png` | |
| UI-09 | o‘tdi | A+ `ui-test.ts:1008` — 101 obyekt, `/app/tasks` dagi `ProjectSelect` aynan 102 variant, `Obyekt 101` bitta | `apiAll` (`lib/api.ts:82`) |
| UI-10 | o‘tdi | B: kontragentlar, hujjatlar, to‘lov so‘rovlari sahifalarida `tfoot` yo‘q (ekrandagi qatorlardan “jami” ko‘rsatilmaydi). Kod ko‘rib chiqish: `grep "Number(\|reduce("` — hujjatlar (`DocumentsTable.tsx`), to‘lov so‘rovlari (`workflow.tsx:42–216`) va kontragentlar (`pages.tsx:505–620`) sahifalarida mijoz yig‘indisi yo‘q, `Number` faqat `sortValue` va `outstanding > 0` shartida. Qolgan yig‘indilar sahifalanmagan to‘liq ro‘yxatlarda: `pages.tsx:387` kassa hisoblari (`/v1/finance/cash-balances`, sahifasiz), `pages.tsx:755–756` budjetlar (`limit=100`, oy unikal), `workflow.tsx:483,525` kalendar (`/v1/finance/calendar`, sahifasiz) |
| UI-11 | yiqildi (ma’lum cheklov) | Kod ko‘rib chiqish: `DocumentModal.tsx:49` — `GET /v1/stock/commands?kind=receipt&status=posted&limit=100`, server `ORDER BY created_at DESC` (`routes-stock-extra.ts:108`), bog‘lanmaganlik filtri yo‘q | 101-chi eski (hali invoysga bog‘lanmagan) kirim tanlovda chiqmaydi. Qolgan 3 joy: budjetlar `finance/model.ts:279` — oy unikal, 100 oy amalda chegara emas (o‘tdi); kontragent qarz hujjatlari `DocumentModal.tsx:55`, `workflow.tsx:233` — kontragent + obyekt bo‘yicha `outstanding>0`, 100 dan oshishi kam ehtimol (o‘tdi, cheklov saqlanadi); obyekt smetalari `StockModals.tsx:38` — `limit=100` ishlatilmaydi, faqat `items[0]` (eng yangi smeta) olinadi — oldindan mavjud cheklov, sahifalashga aloqasi yo‘q. Taklif 8-bo‘limda |
| UI-12 | o‘tdi | B: RU, 1280 px — 11 sahifa (UI-01 ro‘yxatlari + smeta detali va muharriri): xom kalit (`common.xxx` naqshi) yo‘q, gorizontal scroll yo‘q. `screenshots/UI-12-ru-1280.png`, `UI-12-ru-modal.png` | |

## 4. Bosqich 1.2 — smeta jamlari

| ID | Natija | Dalil | Izoh |
|---|---|---|---|
| EST-01 | o‘tdi | A `integration.ts:548` (`total: '260.00'`); A+ `:632` — spec ma’lumoti 0.10 + 0.20 + 0.30 → `totals.total === '0.60'` (string; float’da 0.6000000000000001 bo‘lardi) | |
| EST-02 | o‘tdi | A `integration.ts:548`; A+ `:632` — `by_kind` {material 0.10, labor 0.20, service 0.30}, `by_category` {Beton 0.10, '' 0.20, Ish 0.30}, `by_zone` {Blok A 0.40, '' 0.20}, `material_total` 0.10, `work_total` 0.50 — literal; har guruh yig‘indisi `Decimal` bilan `totals.total` ga teng; zonasiz guruh `key: ''` alohida | |
| EST-03 | o‘tdi | A `integration.ts:548` — prorab: `totals.total` undefined, `by_kind` faqat `{key, count}`, `lines[0].fact_value` undefined; `role-tests.ts:778` narx kalitlari skaneri | |
| EST-04 | o‘tdi | A+ `integration.ts:747` — PATCH → reviziya 2 (labor 0.40 + 0.05), `totals.total === '0.45'`, `by_kind` {labor 0.45}, `by_zone` {'' 0.45}, `by_category` {'' 0.45}, `material_total` 0.00, `work_total` 0.45; DB da 3 qator `archived_at IS NOT NULL`; reviziyalar `[[2,2,'0.45'],[1,3,'0.60']]`, 1-reviziya o‘qiladi | |
| EST-05 | o‘tdi | B: `SINOV-Smeta API` (0.10 material + 0.20 + 0.30 ish): filtrsiz jami `0.6` = `totals.total` 0.60; faqat tur = ish → `0.5` = `by_kind.labor` 0.50; qidiruv `ish 1` → jami qatori yo‘q. `screenshots/EST-05.png` | UI’da kategoriya/zona filtri yo‘q, faqat qidiruv va tur. Qayd: `formatMoney` `0.60` ni `0.6` deb ko‘rsatadi (2 xona majburiy emas) |
| EST-06 | o‘tdi | `grep -rn "sumBy\|Number(\|reduce(" frontend/src/features/estimates`: `EstimateDetailPage.tsx` da pul yig‘indisi yo‘q — `:257–258` miqdor foizi (progress), `:283` `loss_percent` bo‘sh/emas sharti; jami `d.totals.*` dan (`:145–147, :189–194`) | Ma’lum istisnolar: `EstimateEditor.tsx:81` saqlanmagan qatorlar taxminiy jami; `ImportWizard.tsx:153` import preview jami ham mijozda (`Number(quantity)*Number(unit_price)`) — spec’da yo‘q, qayd uchun. `EstimatesPage.tsx:58–72` `Number` faqat saralash uchun |
| EST-07 | o‘tdi | B: muharrirda 3 ish qatori 1×0.10, 1×0.20, 1×0.30 → taxminiy jami `0.6 so‘m`; saqlangach detalda `0.6` — formatlangan qiymat bir xil. `screenshots/EST-07-editor.png`, `EST-07-detail.png` | Muharrir float (`0.6000000000000001`) ni formatlab `0.6` ko‘rsatadi; server `0.60` |
| EST-08 | o‘tdi (tuzatildi, 2026-10-10) | A+ `integration.ts:659` — `GET /v1/estimates/:id/export` (0.10/0.20/0.30 qatorlari) base64 → ExcelJS: fayldagi `JAMI` katagi `Decimal` bilan `totals.total` (`'0.60'`) ga teng; `:684` — qatorlar bo‘yicha `Jami` ustuni yig‘indisi `0.60`, prorabda `Birlik narxi`/`Jami` ustunlari va `JAMI` qatori yo‘q, admin va prorab eksporti `audit_events` ga `export.estimate` (resurs = smeta, `revision: 1`) bilan yozilgan | 2026-10-09 da yiqilgan edi: `JAMI` = `0.6000000000000001` (`lines.reduce((s, l) => s + Number(l.total), 0)`). Tuzatish 8-bo‘limda |

## 5. Bosqich 1.5 — 404 va xato holatlari

| ID | Natija | Dalil | Izoh |
|---|---|---|---|
| ERR-01 | o‘tdi | A `ui-test.ts:1020`; B: `/app/blabla` → AppShell ichida (sidebar bor) `SearchX` ikonkasi, “Sahifa topilmadi”, tavsif; “Bosh sahifaga” → `/app`, `window` belgisi saqlandi (document qayta yuklanmadi). `screenshots/ERR-01.png` | |
| ERR-02 | o‘tdi | A `ui-test.ts:1153`; B: login qilinmagan kontekstda `/app/blabla` → `/login`, `/blabla` → `/login`. `screenshots/ERR-02.png` | |
| ERR-03 | tekshirilmadi (qisman: owner o‘tdi) | B: `platform_owner` `/admin/blabla` → “Sahifa topilmadi”, “Bosh sahifaga” → `/admin`. `screenshots/ERR-03.png` | `super_admin` va `support` hisoblari lokal bazada yo‘q — tekshirilmadi |
| ERR-04 | o‘tdi | A `ui-test.ts:1020`; B: `/app/projects/<uuid>` → ikonka, “Yozuv topilmadi”, “Ro‘yxatga qaytish” → `/app/projects`. `screenshots/ERR-04.png` | |
| ERR-05 | o‘tdi | A+ `ui-test.ts:1061` — biriktirilmagan menejer (`project_assignments` da 0 qator, tasdiqlanadi) `Obyekt B maxfiy` ni ochadi; sarlavha, tavsif, tugmalar ro‘yxati va ikonka klassi tasodifiy UUID holati bilan deepEqual | Spec’dagi “prorab boshqa obyekt” o‘rniga biriktirilmagan menejer — scope mantig‘i bir xil (`tenant_admin` dan boshqa hamma) |
| ERR-06 | o‘tdi | A+ `ui-test.ts:1061` — `owner.query` bilan begona tenant (`FOREIGN-1`) obyekti; ko‘rinish ERR-04/05 bilan deepEqual | |
| ERR-07 | o‘tdi (tuzatildi, 2026-10-10) | A+ `ui-test.ts:1143` — `/app/projects/abc`, `/app/estimates/abc`, `/app/estimates/abc/edit` → “Yozuv topilmadi”, “Qayta urinish” tugmasi yo‘q (7d dagi 4xx tinglovchisiz kontekstda, chunki server baribir 400 qaytaradi) | 2026-10-09 da yiqilgan edi (B): “Xatolik yuz berdi — Kiritilgan ma’lumot noto‘g‘ri.” + “Qayta urinish”. `screenshots/ERR-07-projects.png`, `ERR-07-estimates.png` — tuzatishdan oldingi holat. Tuzatish 8-bo‘limda |
| ERR-08 | o‘tdi | B: `/app/estimates/<uuid>` va `/app/estimates/<uuid>/edit` → “Yozuv topilmadi”, “Ro‘yxatga qaytish” → `/app/estimates`. `screenshots/ERR-08-edit.png` | |
| ERR-09 | o‘tdi | B: `/admin/tenants/<uuid>` → “Yozuv topilmadi”, “Ro‘yxatga qaytish” → `/admin/tenants`. `screenshots/ERR-09.png` | |
| ERR-10 | o‘tdi | A+ `ui-test.ts:1134` — `page.route` 500 → `ErrorState` + “Qayta urinish”; avtomatik qayta urinishlar tugaganini kutib (`calls` 1.5 s barqaror), bosilganda so‘rovlar soni oshadi; route olingach obyekt sarlavhasi. B: lokalda ham — 500 → “Qayta urinish”, bosilganda so‘rov 3→4, route olingach `SINOV-Obyekt 01` ochildi. `screenshots/ERR-10.png` | TanStack Query 5xx ni 2 marta o‘zi qayta uradi (`App.tsx:141`) |
| ERR-11 | o‘tdi | A+ `ui-test.ts:1134` — `route.abort()` → “Qayta urinish” bor, “Yozuv topilmadi” yo‘q; bosilganda abort hisoblagichi oshadi. B: `screenshots/ERR-11.png` | |
| ERR-12 | o‘tdi | A+ `ui-test.ts:1134` — 403 → “Bu sahifaga ruxsat yo‘q”. B: `screenshots/ERR-12.png` | |
| ERR-13 | o‘tdi | A `ui-test.ts:210`; `role-tests.ts:560` API 403; B: `sinov.menejer` (individual `projects.read` deny) `/app/projects` → “Bu sahifaga ruxsat yo‘q”, `/v1/projects` so‘rovi 0 ta, menyuda “Obyektlar” yo‘q. `screenshots/ERR-13.png` | |
| ERR-14 | o‘tdi | B: (a) `/app` dan ilova ichida yo‘q obyekt ID’siga o‘tilganda (React Router Link bilan bir xil mexanizm: `history.pushState` idx+1 + `popstate`) “Orqaga” bor, bosilganda `/app` ga qaytadi; (b) `/app/projects/<uuid>` to‘g‘ridan-to‘g‘ri ochilganda “Orqaga” yo‘q. `screenshots/ERR-14a.png`, `ERR-14b.png` | Qayd: `DELETE /v1/estimates/:id` arxivlaydi, arxivlangan smeta detali hali ochiladi (404 emas) — “eskirgan ro‘yxat havolasi” ssenariysi 404 bermaydi, bu kutilgan (arxiv ≠ o‘chirish) |
| ERR-15 | o‘tdi | B: RU — ERR-01 “Страница не найдена / Запрошенный адрес не существует или был перемещён. / На главную”; ERR-04 “Запись не найдена / Эта запись не существует, архивирована или не закреплена за вами. Проверьте ссылку. / К списку / На главную”; ERR-10 “Произошла ошибка / Ошибка сервера. / Повторить”; xom kalit yo‘q. `screenshots/ERR-15-01-ru.png`, `ERR-15-04-ru.png`, `ERR-15-10-ru.png` | |
| ERR-16 | o‘tdi | B: 1280 va 1440 px da `/app/projects/<uuid>`: 2 tugma bir qatorda, viewport ichida, gorizontal scroll yo‘q. `screenshots/ERR-16-1280.png`, `ERR-16-1440.png` | |

## 6. Jami

59 ta ID (2026-10-10 holati): **57 o‘tdi** (shundan 4 tasi 2026-10-10 da tuzatildi: AUTO-03, UI-01, EST-08, ERR-07), **0 yiqildi**, **1 yiqildi (ma’lum cheklov)** (UI-11), **1 tekshirilmadi** (ERR-03 — `super_admin`/`support` qismi; owner qismi o‘tdi).

2026-10-09 dagi holat: 53 o‘tdi, 4 yiqildi (AUTO-03 va EST-08 — eksportdagi `JAMI` float yig‘indisi; UI-01 — platforma invoyslari default 50; ERR-07 — uuid bo‘lmagan ID’da 404 o‘rniga “Xatolik / Qayta urinish”). Tuzatishlar 8-bo‘limda.

## 7. Yangi qo‘shilgan avtomatik testlar

`backend/scripts/integration.ts` (42 → 57 qadam, `failed: []`):

| Qator | Qadam | ID |
|---|---|---|
| 238 | Project q matches code, customer and address and status filters on the server; a foreman never finds or opens an unassigned project | API-08, API-09 |
| 286 | Employee q matches phone and position, the list never exposes password hashes and active=false/0 and true filter on the server | API-07, API-11 |
| 361 | Material list pages without overlap or gaps, searches case-insensitively, treats _ and % literally, ignores blank q, caps q at 100 chars and rejects bad limit/offset with VALIDATION_ERROR | API-01…06 |
| 381 | Material pages split a run of equal names deterministically: each duplicate appears exactly once | API-14 |
| 632 | Estimate totals are exact decimal strings and kind/category/zone group totals add up to the estimate total | EST-01, EST-02 |
| 659 | Estimate Excel export JAMI row equals totals.total exactly (2026-10-09 da `failed` ga tushardi, 2026-10-10 dan o‘tadi) | EST-08 |
| 684 | Estimate Excel export sums to the estimate total, drops price columns without price permission and is audited (2026-10-10: audit tekshiruvi qo‘shildi) | EST-08 |
| 747 | Estimate revision archives the old lines, keeps the old snapshot readable and recomputes the total | EST-04 |
| 851 | Task list mine=false/0 equals the unfiltered list, mine=true keeps only own tasks (2026-10-10) | API-07 |
| 1051 | Counterparty q matches INN, phone and contact; archived=true/1 and false/0 are equivalent server filters (2026-10-10: yozuvsiz kontragent `'0.00'`) | API-07, API-12 |
| 1133 | Finance documents unpaid=false and unpaid=0 keep every document, unpaid=true is a subset | API-07 |
| 1158 | Payables overdue=false/0 keep documents without a past due date; other flag values are 400 (2026-10-10) | API-07 |
| 1384 | `unread=false` / `unread=yes` tekshiruvi — mavjud bildirishnoma qadami ichida (2026-10-10) | API-07 |
| 1685 | `/v1/tasks/export` `mine=false`/`true` — mavjud “Excel exports …” qadami (`:1706`) ichida (2026-10-10) | API-07 |
| 1764 | Support requests are filtered by status on the server (mavjud qadam, ochiq murojaat seed bilan kuchaytirildi) | API-13 |
| 1976 | Counterparty debt sums payables over all projects for the admin but only over assigned projects for the financier | API-12 |
| 2034 | List search never crosses tenants: another company finds only its own materials, counterparties and employees | API-10 |
| 2096 | Platform tenant state filter matches each tenant access_state; the six state lists are disjoint and together equal the unfiltered list (6 of 6 states seeded) | API-13 |

Skript infratuzilmasi: `failed: string[]` (`:43`) — EST-08 JAMI tekshiruvi uchun; `verification.json` ga `failed` maydoni, oxirida `process.exitCode = failed.length ? 1 : 0` (`:2116`). Boshqa barcha assertlar avvalgidek darhol to‘xtatadi.

`backend/scripts/ui-test.ts` (38 → 43 check):

| Qator | Qadam | ID |
|---|---|---|
| 418 | Material pickers (estimate editor, stock receipt) find a material beyond the first 100 by server search | UI-05 |
| 1008 | Project select loads every page of a 100+ project list (apiAll) | UI-09 |
| 1061 | Missing, unassigned and foreign-tenant project ids render the identical not-found view (existence is not revealed) | ERR-05, ERR-06 |
| 1134 | Detail page distinguishes server error and network failure (retry re-requests) from 403 and 404 | ERR-10, ERR-11, ERR-12 |
| 1143 | Malformed (non-UUID) detail ids render the not-found view without a retry button (2026-10-10) | ERR-07 |

Yon o‘zgarishlar: `ui-test.ts` da `pickOption` yordamchisi 5c dan oldinga ko‘chirildi (mazmuni o‘zgarmagan), brigadir material so‘rovi `pickOption` da `''` o‘rniga `'Sement'` yozadi (tartibga bog‘liqlik olib tashlandi), faylga prettier qo‘llandi. Ikkala skript ham vaqtinchalik bazada ishlaydi, mavjud assertlar o‘zgartirilmagan.

## 8. Yiqilganlar: tuzatishlar (2026-10-10) va qolgan taklif

**Tuzatildi (2026-10-10, commit yo‘q):**

- **EST-08 / AUTO-03.** `backend/src/routes-estimates-extra.ts`: `JAMI` = `Number(money(lines.reduce((s, l) => s.plus(l.total), dec('0'))))` (`src/money.ts`), `Number` yig‘indisi olib tashlandi. Natija: `integration.ts:659` o‘tadi, `failed: []`. Qator kataklari (`Number(l.total)`) o‘zgarmadi — har biri 2 xonali satrdan bitta konvertatsiya, yig‘indi emas.
- **Smeta eksporti auditi (9-bo‘lim, 4).** Shu route’da `audit(db, actor, 'export.estimate', params.id, { revision })` — boshqa 4 eksportning `export.*` naqshi. Test: `integration.ts:684`.
- **UI-01.** `frontend/src/features/platform/pages.tsx:1231` `useListState(50)` → `useListState()` (default 25).
- **ERR-07.** `frontend/src/app/guards.tsx` `DetailError`: `400 VALIDATION_ERROR` va xato maydoni `id` bo‘lsa → `NotFound record` (4 tafsilot sahifasi ham shu komponentdan foydalanadi). Faqat `id` maydoni — frontend’ning boshqa 400 xatolari “topilmadi” deb yashirilmaydi. So‘rov baribir yuboriladi (server 400). Test: `ui-test.ts:1143`.
- **`z.coerce.boolean` qoldiqlari (9-bo‘lim, 2).** `queryBool` ga almashtirildi: `routes-finance-extra.ts` (`/v1/finance/payables` `overdue`), `routes-auth.ts` (`/v1/me/notifications` `unread`), `routes-dashboard.ts` (`/v1/tasks/export` `mine`), `routes-work.ts` (`/v1/tasks` `mine`). Endi `"false"`/`"0"` → false, boshqa qiymat → 400. Frontend bu bayroqlarni faqat `true` holatda yuboradi. Testlar: `integration.ts:851, :1158, :1384, :1685`.
- **Kontragent `debt`/`advance` (9-bo‘lim, 6).** `backend/src/routes-operations.ts` `GET /v1/counterparties`: ikkalasiga `::numeric(20,2)::text` — yozuv bo‘lmasa ham `"0.00"`. Testlar: `integration.ts:1051` (yozuvsiz kontragent), `:1976` (finansist avansi).

**Qolgan taklif (bajarilmagan):**

- **UI-11 (invoysga bog‘lanadigan kirimlar).** Takrorlash: bitta obyektda 101+ `posted` kirim, eng eskisi hali `supplier_invoice` ga bog‘lanmagan; `/app/finance/invoices` → “Invoys / dalolatnoma” → “Bog‘lanadigan ombor kirimi” ro‘yxatida u yo‘q (`limit=100`, `created_at DESC`). Taklif: `GET /v1/stock/commands` ga `unmatched=true` filtri (`supplier_invoice` da `matched_receipt_id` bo‘lmaganlar) qo‘shib, modalda `SearchSelect` (material nomi/sana bo‘yicha `q`) ishlatish; yoki hech bo‘lmaganda bog‘langanlarni serverda chiqarib tashlash — bog‘lanmagan kirimlar soni amalda 100 dan kam bo‘ladi.

## 9. Mustaqil tekshiruv (Opus) va kuchaytirishlar

Yangi test kodi alohida Opus sub-agent tomonidan faqat o‘qib tekshirildi (testlar ishga tushirilmadi). Xulosa: 10 mustahkam, 4 zaif, 2 yolg‘on‑o‘tish xavfi. Hammasi test tomonida tuzatildi (ilova kodiga tegilmadi):

| Blok | Topilma | Tuzatish |
|---|---|---|
| EST-08 (eksport) | **Yolg‘on o‘tish.** Test fayldagi `JAMI` qatorini o‘tkazib yuborib, qatorlarni o‘zi qo‘shgan; `0.40+0.05` tasodifan float’da aniq. Serverda `JAMI` `Number` bilan yig‘iladi | Spec ma’lumoti (0.10/0.20/0.30) bilan eksport, `JAMI` katagi `Decimal` bilan `totals.total` ga tenglanadi, yaxlitlashsiz → **ilova xatosi ochildi** |
| UI-05 (material tanlov) | **Yolg‘on o‘tish.** `inputValue()` testning o‘zi yozgan matnni qaytaradi; tanlov ishlamasa ham o‘tardi | Muharrirda `setMaterial` ta’siri (qator “Nomi” = `Tosh 118`, “Birlik” = `kg`) va blur’dan keyingi qiymat; ombor modalida blur’dan keyingi qiymat |
| API-11 (xodimlar) | Zaif: `role` filtri alohida, `active=true` musbat holat, ism/login alohida tekshirilmagan | Qo‘shildi |
| API-14 (bir xil nom) | Zaif: `,id` tiebreaker olib tashlansa ham o‘tishi mumkin edi | 3 takror ID o‘sish tartibida, `limit=1` bilan 4 qadam yurish |
| EST-04 (reviziya) | Zaif: reviziyadan keyin faqat `total` tekshirilgan, guruhlar emas | `by_kind/by_category/by_zone`, `material_total`, `work_total` ham |
| API-12 (qarz scope) | Zaif: kutilgan qiymat route bilan bir xil SQL formuladan olingan | Literal `140.00` / `40.00`; avans (`30.00` / 0) qo‘shildi |
| API-05, API-07, API-13 | Kod tekshirilmagan (`VALIDATION_ERROR`), kontragent `archived=yes`, support `status=open` bo‘sh ro‘yxatda vakuum | Qo‘shildi: kod, 400, ochiq murojaat seed + a’zolik |
| UI-09 | `>= 102` o‘rniga aniq `=== 102` | Qo‘shildi |
| ERR-10/11 | Sababiyat: bosishdan oldin `calls` barqarorligi; abort holatida “Qayta urinish” bosilmagan | Qo‘shildi; mock sahifaga `pageerror`/console tinglovchilari ham ulandi |
| ERR-05/06 | Snapshot’da ikonka yo‘q | Ikonka klassi qo‘shildi |

Mavjud assertlar o‘zgartirilmagan, seed ma’lumotlari eski kutilgan qiymatlarni o‘zgartirmagan (tekshiruvchi tasdiqladi).

**Tekshiruv ochgan ilova topilmalari:**

1. `backend/src/routes-estimates-extra.ts` — smeta Excel eksportidagi `JAMI` qatori `Number` yig‘indisi edi (0.10+0.20+0.30 → `0.6000000000000001`). **Tuzatildi (2026-10-10)**, 8-bo‘lim.
2. `z.coerce.boolean()` 4 joyda qolgan edi (`overdue`, `unread`, `mine` ×2) — `"false"` → `true`. **Tuzatildi (2026-10-10)**, 8-bo‘lim.
3. `telegram-flows.ts:153` — Telegram material so‘rovi `LIMIT 60`, qidiruv yo‘q: 60+ materialli kompaniyada bot orqali material tanlab bo‘lmaydi (1.1 muammosining bot varianti). Ochiq, egasi qaroriga.
4. Smeta eksporti auditga yozilmasdi (handoff 9.8). **Tuzatildi (2026-10-10)**, 8-bo‘lim.
5. `frontend/src/app/App.tsx:141` — tarmoq xatosi (`status: 0`) `< 500` sifatida qayta urinilmaydi; ehtimol niyatda emas. Ochiq, egasi qaroriga.
6. `GET /v1/counterparties` da `debt`/`advance` yozuv bo‘lmasa `'0'` qaytarardi. **Tuzatildi (2026-10-10)**, 8-bo‘lim.

**2026-10-10 tuzatishlarining mustaqil tekshiruvi (Opus, faqat o‘qish):** 6 tuzatish to‘g‘ri va doirada; har yangi test eski kodda yiqilardi; yolg‘on‑o‘tish xavfi yo‘q. Qayd etilgan, bajarilmagan ixtiyoriy ishlar: `/admin/tenants/abc` va `BillingPage` default hajmi uchun UI testi yo‘q; `docs/backend/BARPO_API_GUIDE.md:68` audit qilinadigan eksportlar ro‘yxatida smeta eksporti yo‘q; `top_debt` (`routes-finance-extra.ts:313`) va obyekt yig‘masi (`routes-operations.ts:748`) yozuv bo‘lmasa hali `'0'` qaytarishi mumkin. Xatti-harakat o‘zgarishi: `unread`/`mine`/`overdue` uchun `?flag=` (bo‘sh) va `?flag=on` endi 400 — hozirgi frontend bunday yubormaydi.

## 10. B testlari: muhit va skrinshotlar

- Lokal bazada `SINOV-` prefiksli ma’lumot yaratildi (kichik hajm, takror yaratmaydi): 30 obyekt `SINOV-Obyekt 01…30` (har uchinchisi `active`), 5 material `SINOV-Material 1…5`, 3 kontragent (`SINOV-Kontragent A`, `B`, `Arxiv` — arxivlangan), smeta `SINOV-Smeta API`, xodim `sinov.menejer` (manager, individual `projects.read` deny, paroli chatda berilgan env orqali, repoda yo‘q). EST-07 har yurishda `SINOV-Smeta UI <raqam>` smetasini muharrirda yaratadi — 3 ta qoldi (biri ERR-14 ning dastlabki varianti tomonidan arxivlangan); keraksiz bo‘lsa arxivlash mumkin.
- Skript: Playwright + o‘rnatilgan Chrome, 1440×1000 (UI-12 1280×900), parollar faqat env orqali; repoda saqlanmaydi.
- Skrinshotlar (`docs/tests/screenshots/`): `UI-01`, `UI-02`, `UI-02-before`, `UI-06`, `UI-07`, `UI-08-empty`, `UI-08-error`, `UI-12-ru-1280`, `UI-12-ru-modal`, `EST-05`, `EST-07-editor`, `EST-07-detail`, `ERR-01`, `ERR-02`, `ERR-03`, `ERR-04`, `ERR-07-projects`, `ERR-07-estimates`, `ERR-08-edit`, `ERR-09`, `ERR-10`, `ERR-11`, `ERR-12`, `ERR-13`, `ERR-14a`, `ERR-14b`, `ERR-15-01-ru`, `ERR-15-04-ru`, `ERR-15-10-ru`, `ERR-16-1280`, `ERR-16-1440`.
