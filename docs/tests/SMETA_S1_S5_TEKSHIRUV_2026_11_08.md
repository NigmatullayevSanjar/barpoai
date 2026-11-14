# Smetani to‘g‘rilash S1–S5: haqiqiy fayllar bilan tekshiruv (2026-11-08)

> **Sana:** 2026-11-08. **Branch:** `main-vxg6su` — `62ecbbf` (S1), `9e00b54` (S2), `0b04562` (S3), `e3165ef` (S4); **S5 commit qilinmagan** (ishchi daraxtda: `backend/src/customer-materials.ts`, `frontend/src/features/stock/CustomerMaterialsTab.tsx` va boshqalar). `main-vxg6su` `origin/main` dan 5 commit oldinda, 1 commit (PR #22 merge) orqada.
> **Muhit:** Windows 11, Node 24.18.0, pnpm 10.18.3, Docker 29.9.2; `backend/.env` bor. Lokal stack (`docker compose`, loyiha «barpo») yangi kod bilan qayta yig‘ildi; frontend `pnpm dev` (5173).
> **Fayllar:** egasining `Иш турлари.xlsx` (havolali asl), `давальческие.xlsx` (havolali asl) va havolasiz nusxa. Faqat o‘qildi va QA kompaniyasiga yuklandi. Hisobotda kompaniya nomlari, INN, hisob raqamlari, shartnoma raqami va manzillar yo‘q — «Bosh pudratchi», «Subpudratchi», «Obyekt».
> **Umumiy natija:** 78 qadam (S5-01…S5-15 — 15 ta) — **75 o‘tdi, 2 yiqildi, 1 bo‘shliq**. Kritik nuqson (ma’lumot yo‘qolishi, boshqa kompaniya ma’lumoti, pul noto‘g‘ri hisoblanishi) **yo‘q**. Yuqori — 2, o‘rta — 1 (egasi qarori kerak), past — 10.

## Qisqa xulosa

- Avtomatik to‘plamlar kutilgan sonlardan kam emas: unit 41, integration 106, rollar 10 × 88 GET, UI 66.
- S1–S3 egasining fayllarida to‘g‘ri ishlaydi. «локалка» zanjiri Excel bilan farqi faqat ma’lum farq (−11 137,04): uning sababi topildi — **egasining Excel faylidagi formula xatosi** (361-qator) va narxni 0,01 gacha yaxlitlash; platforma to‘g‘ri hisoblaydi.
- **To‘liq hajm stsenariysi** (49 ish to‘liq qabul qilindi, `Накладной` bo‘yicha kirim va bog‘langan sarf): F-3 egasining `ф3` varag‘i bilan bir xil tuzilishda; shartnoma qiymatlari aynan teng; S5 hisobotidagi miqdorlar `отчёт` bilan **har materialda aynan teng**.
- Yuqori nuqsonlar: (1) «ОБЩЕЕ» varag‘i oxiridagi resurslar yig‘masi bloki 483 ta soxta «ish» qatori bo‘lib import qilinadi; (2) bosh muhandis dalolatnomani ocha olmaydi (403), tugma esa ko‘rinadi.
- `qa:smoke` bajarilmadi: platforma egasi paroli berilmadi (bo‘shliq). QA kompaniyasi shu sababli platforma egasi API’si o‘rniga lokal bazada (`QA-` kaliti, bir martalik taklif) ochildi; admin oddiy ro‘yxatdan o‘tish API’si bilan kirdi.

## Natijalar jadvali

### 0–2. Holat, avtomatik tekshiruv, lokal stack

| ID | Qadam | Kutilgan natija | Natija | Izoh |
|---|---|---|---|---|
| H-01 | `git status`, log, `rev-list` | S5 holati aniqlanadi | o‘tdi | S5 commit qilinmagan, ishchi daraxtda; 5 oldinda / 1 orqada |
| A-01 | backend `npm run build` | xatosiz | o‘tdi | 3,9 s |
| A-02 | backend `npm test` | pass ≥ 41, fail 0 | o‘tdi | 41 / 0 |
| A-03 | `npm run test:integration` | passed ≥ 106, failed [] | o‘tdi | 106, `failed: []` |
| A-04 | `npm run test:roles` | 10 rol × ≥ 88 GET, findings [], unfillable [] | o‘tdi | 88 × 10, ikkalasi bo‘sh; kompaniyalararo ajratish 23 marshrut + 11 yozuv |
| A-05 | `npm run test:ui` | checks ≥ 66, brauzer xatosiz | o‘tdi | 66, «No uncaught React/browser errors» bor |
| A-06 | `npm run docs` | OpenAPI va DB spec o‘zgarmaydi | o‘tdi | S5 commit qilinmagani uchun ishchi daraxtdagi nusxa bilan solishtirildi — bayt bo‘yicha bir xil; HEAD’dan farq faqat S5 ning 2 ta yangi marshruti |
| A-07 | frontend `pnpm typecheck`, `pnpm build` | xatosiz | o‘tdi | |
| A-08 | hisobot fayllarini tiklash, `docker ps -a` | vaqtinchalik konteyner yo‘q | o‘tdi | 5 fayl nomma-nom tiklandi, yangi `ui-failure-*.png` yo‘q |
| L-01 | `docker compose up --build -d`, 031–032 migratsiyalari | ustunlar bor, `/health/ready` ok | o‘tdi | `estimate_lines`: norm_code, resource_code, section_name, supplied_by; `estimates`: 12 ta sarlavha va sozlama ustuni |
| L-02 | `pnpm dev` | 5173 ishlaydi | o‘tdi | ishlamayotgan edi — ishga tushirildi |
| L-03 | `npm run qa:smoke` | barcha qadamlar, o‘z kompaniyasini o‘chiradi | **bo‘shliq** | platforma egasi paroli berilmadi |
| Q-01 | QA kompaniyasi, 7 rol, obyektlar | `QA-` kaliti, brigada foizi 20, brigadir hisobi | o‘tdi | `QA-202611081419-S15`; buyurtmachi «Bosh pudratchi MChJ»; obyekt A (S3/S4), B (S1/S2), C (nazorat misoli), D (S5), E (to‘liq hajm) |

### 4. Haqiqiy fayllar bilan qo‘lda tekshiruv

| ID | Qadam | Kutilgan natija | Natija | Izoh |
|---|---|---|---|---|
| S1-01 | `Иш турлари` (havolali asl) — Е11, Е22, Е23, Е27 | 18 / 653 / 411 / 972 qator; «П» ogohlantirishi, jami 51 | o‘tdi | preview va saqlangandan keyin aynan shu sonlar; «П» 3 / 27 / 17 / 4 = 51; ogohlantirishda bir xil nomlilar nom bo‘yicha guruhlangan (qator raqamlari ro‘yxati bilan) |
| S1-01b | Havolasiz nusxa, shu 4 varaq (faqat preview) | sonlar bir xil | o‘tdi | qatorlar, `counts`, «П» va qator raqamlari bir xil |
| S1-02 | «П» qatori smetada | miqdor 0, izoh «П — miqdor loyihadan», Shifr, ishning kategoriyasi va zonasi | o‘tdi | Е22 dagi 27 ta «П» qatorining hammasi; ish qatorisiz «П» yo‘q |
| S1-03 | ОБЩЕЕ preview va commit | xatosiz; vaqt | o‘tdi | preview 2,1 s, commit 4,4 s (avval 1,8 / 3,1 s; bitta o‘lchov). Qatorlar soni 4 124 — shundan 483 tasi soxta, N-01 ga qarang |
| S2-01 | «Shifr» ustuni | ishda to‘liq norma shifri qo‘shimchasi bilan, resursda resurs kodi | o‘tdi | `Иш турлари` da «Е310-5001 ДОП. 2»; «Е0904-006-01 ДОП. 11 …» `давальческие` → «локалка» da (F-2 da ham to‘liq); resurslarda «1», «660», «С39995», «П54889» |
| S2-02 | Bo‘lim filtri («локалка», 21 bo‘lim) | faqat bo‘lim qatorlari; jami serverdan | o‘tdi | 21 bo‘limning hammasi `totals.by_section` bilan son va summada mos |
| S2-03 | Sarlavha oynasi (ОБЩЕЕ) | saqlanadi; reviziya o‘zgarmaydi; prorab shartnoma summasini ko‘rmaydi | o‘tdi | reviziya 1 → 1; prorab API javobida `contract_amount` kaliti yo‘q |
| S2-04 | Resurslar yig‘masi (ОБЩЕЕ) | jami = smeta jami; mashinalar 154, materiallar 328 | **yiqildi** | jami 0 = 0 (faylda narx yo‘q); materiallar 328 ✓; mashinalar 153 — to‘g‘ri (yig‘ma blokda mashinalar 2…154 raqamlangan: «154» — oxirgi raqam, mashinalar soni 153); lekin «Mehnat» guruhida 479 nom — N-01 |
| S2-05 | Eksport → import (Е11) | kodlar, bo‘lim, «Kim beradi» saqlanadi; jamlar bloki o‘tkaziladi | o‘tdi | 18 = 18 qator, 0 farq; qo‘shimcha: narxli, 2 bo‘limli, «buyurtmachi» qatorli sintetik smeta — 5 = 5, jami 1 872 581,25 teng |
| S3-01 | `давальческие` (havolali asl) → «локалка» preview | 12 jamlar qatori zanjirga tushadi; taklif 21 %, QQS 12 %, «Buyurtmachi» | o‘tdi | 12 qatorning hammasida `key` (shu jumladan «ГЕНПОДРДЧИКА», «С У ЧЕТОМ», «C НДС»); taklif aynan shunday, 77 ta bosh pudratchi qatori |
| S3-02 | Solishtiruv farqlari (ma’lum) | −11 137,04 (ish haqi −11 137,26), +0,01, +0,21; ≈ 311 656 546,85 | o‘tdi | aynan shu sonlar; **sabab topildi** — pastda «S3-02: farq sababi» |
| S3-03 | «Smeta yakuni» kartasi | 21 % → chegirma → QQS 12 %; `plan_total` o‘zgarmaydi | o‘tdi | QQS bilan 311 656 546,85; qatorlar jami = `plan_total` = 346 409 467,73 |
| S3-04 | Nazorat misoli (obyekt C) | «Erkin» 2 374 400,00; «VMQ 583» 2 564 800,00 | o‘tdi | ikkalasi aynan (smeta API bilan yaratildi, karta va sozlamalar UI da); zanjir moduli bilan ham qayta hisoblandi |
| S3-05 | VMQ 583 noto‘g‘ri foyda | `VMQ583_PRESET`, saqlanmaydi | o‘tdi | foyda 8 % va ishlab chiqarish 3 % — 400; UI da foyda 7 % qotirilgan |
| S3-06 | Eski «(21 %)» xizmat qatori | ogohlantirish; tugmada natija foizi; yangi reviziya | o‘tdi | tugma «… 31 % bo‘ladi»; reviziya 1 → 2, qator 4 → 3, `plan_total` −420 000, qolgan qatorlarning lineage’i o‘zgarmadi |
| S4-01 | Dalolatnoma oynasi, davrda ish yo‘q | joriy oy, bo‘sh holat, 3 jamg‘arma | o‘tdi | |
| S4-02 | O‘tgan oy hisoboti qabul qilinadi | ish hajmi, summa 0; resurslar = norma × hajm | o‘tdi | 10 m3: ishchilar 66,4 soat × 36 929,94 = 2 452 148,02 …; QQS bilan 6 675 202,98 (qo‘lda hisobga mos) |
| S4-03 | Qabul qilinmagan hisobot | hajm o‘zgarmaydi | o‘tdi | |
| S4-04 | Narx reviziyasi, yangi qatorga hisobot | ikki reviziya hajmi bitta qatorda, narx joriy | o‘tdi | kichik smeta (obyekt A) |
| S4-05 | Bugungi sana bilan tuzatish | o‘tgan oy o‘zgarmaydi; joriy oyga tushadi | o‘tdi | |
| S4-06 | Buyurtmachi materiali sarfi | qator = sarf, smeta narxida; chegirma teng | o‘tdi | 3 m3 × 669 642,86 = 2 008 928,58 |
| S4-07 | Sarf stornosi | sarf kamayadi | o‘tdi | 4 → 3 m3 |
| S4-08 | Bog‘lanmagan sarf | ogohlantirish, summaga kirmaydi | o‘tdi | |
| S4-09 | Texnika qatori reviziyada o‘chiriladi | «O‘chirilgan qatorlar» ogohlantirishi, summa 0 | o‘tdi | |
| S4-10 | Sana oralig‘i teskari | `DATE_RANGE_INVALID` | o‘tdi | |
| S4-11 | «Excel (F-2, F-3)» | `akt-…xlsx`, varaqlar F-2, F-3, formula yo‘q | o‘tdi | formula 0; fayl nomi — N-05 |
| S4-12 | F-2 varag‘i | sarlavha, 8 ustun, 1 / 1.1, bo‘limlar, jamlar zanjiri | o‘tdi | |
| S4-13 | F-3 varag‘i | 16 ustun, shartnoma ustunlari, % | o‘tdi | rekvizitlar bo‘sh |
| S4-14 | Shartnomasiz smeta | % yo‘q, eslatma | o‘tdi | QQSsiz holat ham |
| S4-15 | Prorab, brigadir, omborchi | tugma yo‘q; API 403 | o‘tdi | |
| S4-16 | Finansist va buxgalter | ochiladi | o‘tdi | bosh muhandis — R-02 |
| S4-17 | Holat saqlanmaydi; audit | hech narsa o‘zgarmaydi; `export.estimate_act` | o‘tdi | smeta, hisobot, ombor, reviziya — xesh bo‘yicha bir xil |
| F2-01 | F-2 ni egasining `Апартамент № 1 ф-2` bilan solishtirish (to‘liq hajm) | raqamlash, bo‘limlar, ustunlar, jamlar | o‘tdi | pastda «F-2 / F-3 solishtiruvi» |
| F3-01 | F-3 ni egasining `ф3` bilan solishtirish | 16 ustun, jamlar, shartnomaga nisbatan % | o‘tdi | farqlar past (N-07) |
| S5-01 … S5-15 | `S5_BUYURTMACHI_MATERIALLARI_TEST_CASES.md` (obyekt D) | test case’dagi natijalar | o‘tdi (15/15) | berilgan 10, sarflangan 4, inventarizatsiya −1, qoldiq 5; normativ 2 / haqiqiy 3 / farq +1 (qizil); aralash va bog‘lanmagan ogohlantirish; qarz paydo bo‘lmadi; audit `export.customer_materials`; hisobot hech narsani o‘zgartirmaydi |
| O-01 | S5 hisobotini egasining `отчёт` bilan solishtirish (to‘liq hajm) | berilgan ≈ 140 890 681,77 | o‘tdi | miqdorlar har materialda aynan teng; summa 140 890 681,97 (+0,20 — nakladnoyning o‘zidan, pastda) |

### 5. Rollar (obyekt E, to‘liq ma’lumot bilan)

| ID | Rol | Kutilgan natija | Natija | Izoh |
|---|---|---|---|---|
| R-01 | Mijoz admini | hammasi, summalar bilan | o‘tdi | |
| R-02 | Bosh muhandis | smeta, narx, «Smeta yakuni», **dalolatnoma**, buyurtmachi materiallari | **yiqildi** | dalolatnoma API 403, tugma ko‘rinadi — N-02 |
| R-03 | Prorab | smeta narxsiz; «Smeta yakuni» va shartnoma summasi yo‘q; dalolatnoma yo‘q (403); materiallar — faqat miqdor, ish jadvali bor | o‘tdi | JSON da narx kalitlari umuman yo‘q |
| R-04 | Brigadir | smetaga kirmaydi; dalolatnoma 403; materiallar — faqat miqdor, smeta ma’lumotisiz | o‘tdi | `lines`, `works`, `contracts` bo‘sh; Excel’da faqat «Отчет» |
| R-05 | Ombor mudiri | brigadir kabi | o‘tdi | |
| R-06 | Buxgalter | hammasi, summalar bilan | o‘tdi | |
| R-07 | Finansist | smeta va dalolatnoma bor; buyurtmachi materiallari yo‘q (`stock.read` yo‘q) | o‘tdi | tab yo‘q, API 403 |

Narx yoki smeta ma’lumotining sizib chiqishi topilmadi (JSON va Excel tekshirildi).

### 6. Chekka holatlar va tezlik

| ID | Qadam | Kutilgan natija | Natija | Izoh |
|---|---|---|---|---|
| E-01 | Davr yildan o‘tadi (2026-12-15 … 2027-01-10) | `ACT_PERIOD_CROSSES_YEAR` | o‘tdi | API va UI |
| E-02 | Shartnomasiz va QQSsiz smeta | % yo‘q, «QQSsiz jami» | o‘tdi | |
| E-03 | Reviziyada o‘chirilgan qator fakti | ogohlantirish, summaga kirmaydi | o‘tdi | S4-09 |
| E-04 | Aralash ta’minotli material | «aralash» ogohlantirishi | o‘tdi | S5-11 |
| E-05 | ОБЩЕЕ: smeta, resurslar yig‘masi, dalolatnoma, Excel vaqti | 5 s dan oshmaydi | o‘tdi | pastda «Vaqt o‘lchovlari» |

### 7. Tozalash

| ID | Qadam | Kutilgan natija | Natija | Izoh |
|---|---|---|---|---|
| T-01 | `npm run qa:cleanup -- QA-202611081419-S15` | kompaniya o‘chadi | o‘tdi | `deleted: true`, 53 jadval; bazada faqat SINOV-001 |
| T-02 | `docker ps -a` | vaqtinchalik konteyner yo‘q | o‘tdi | |
| T-03 | `git status` | faqat hisobot va skrinshotlar qo‘shilgan | o‘tdi | boshlanishdagi holat (S5 ishchi daraxti) o‘zgarmagan |

## Nuqsonlar

### N-01 (yuqori) — «ОБЩЕЕ» oxiridagi resurslar yig‘masi bloki 483 ta soxta «ish» bo‘lib import qilinadi

- **Takrorlash:** `Иш турлари.xlsx` → faqat «ОБЩЕЕ» varag‘ini Form 5 import qiling → smetada «Resurslar yig‘masi».
- **Natija:** Excel’ning 3662-qatorida «ИТОГО ПО ЛОКАЛЬНОЙ РЕСУРСНОЙ ВЕДОМОСТИ», undan keyin yig‘ma blok: «ТРУДОВЫЕ РЕСУРСЫ» (1), «СТРОИТЕЛЬНЫЕ МАШИНЫ И МЕХАНИЗМЫ» (153), «МАТЕРИАЛЬНЫЕ РЕСУРСЫ» (329). Blok qatorlari ham «A — butun son, B — kod» shaklida, shuning uchun 483 tasi `labor` ish pozitsiyasi bo‘lib qo‘shiladi (kategoriya «107 АВТОГРЕЙДЕРЫ …», hajmi — blokdagi jami miqdor, masalan 36 217 kishi-soat). Haqiqiy qatorlar soni **3 641**, platforma 4 124 ko‘rsatadi. «Mehnat» guruhida 479 nom (mashina va materiallar «soat» birligida).
- **Ta’siri:** pul hozir o‘zgarmaydi (ish pozitsiyasi narxi 0), lekin soxta ishlar vazifa, hisobot, qavat matritsasi va dalolatnomada tanlanadigan ish bo‘lib ko‘rinadi; resurslar yig‘masi noto‘g‘ri. Faqat «ОБЩЕЕ» da (qolgan 19 varaq va `давальческие` toza).
- **Taxminiy sabab:** [backend/src/form5.ts:169-173](../../backend/src/form5.ts) — o‘qish faqat «ВСЕГО ЗАТРАТ» da to‘xtaydi; «ИТОГО ПО ЛОКАЛЬНОЙ РЕСУРСНОЙ ВЕДОМОСТИ» qatori `continue` bilan o‘tkazib yuboriladi.
- **Dalil:** `screenshots/s15-s2-obshee-resurslar-soxta-ishlar.png`.

### N-02 (yuqori) — Bosh muhandis dalolatnomani ocha olmaydi, tugma esa ko‘rinadi

- **Takrorlash:** bosh muhandis sifatida smeta → «Dalolatnoma (F-2/F-3)» yoki `GET /v1/estimates/:id/acts` va `/acts/export`.
- **Natija:** 403 `PAGE_ACTION_FORBIDDEN`; oynada «Sizda bu amal uchun ruxsat yo‘q», «Excel» tugmasi ham ko‘rinib turadi. Biznes qoidalarida (S4 bo‘limi) ruxsat «admin, bosh muhandis, finansist, buxgalter».
- **Taxminiy sabab:** marshrut ruxsati `prices.read`, u [backend/src/permissions.ts:130](../../backend/src/permissions.ts) da `['finance','read']` sahifasiga bog‘langan; bosh muhandisda `prices.read` bor, `finance` sahifasi yo‘q. Frontend tugmani narx ko‘rinishi bo‘yicha ko‘rsatadi (`EstimateDetailPage.tsx` ~257). `test:roles` buni ushlamaydi — u kutilganni ruxsatlar jadvalidan hisoblaydi, biznes qoidasidan emas; integration testida bosh muhandis tekshirilmaydi.
- **Dalil:** `screenshots/s15-s4-bosh-muhandis-403.png`.
- **Qaror kerak:** kod (marshrut sahifasini `estimates` ga) yoki qoida (bosh muhandis yo‘q, tugma yashirinadi).

### N-03 (o‘rta, egasi qarori) — Narxsiz bosh pudratchi qatorlari «Buyurtmachi» bo‘lib qoladi

- **Natija:** «локалка» dagi 77 ta bosh pudratchi qatoridan 39 tasi narxsiz, faqat nomi bilan (masalan, blok 30 m3, yelim 632 kg, setka 22,17 m2, «Лист …»). D37 bo‘yicha import ularni ham «Buyurtmachi» qiladi. Ular nakladnoyda ham, `отчёт` da ham yo‘q. To‘liq hajm stsenariysida S5 «Ish bo‘yicha normativ sarf» da shu 39 qatorda soxta manfiy farq chiqadi (normativ = reja, haqiqiy 0); «Отчет» da harakatsiz uchta «Лист» materiali nol qator bo‘lib turadi. F-2 da ular sarfi yo‘qligi uchun chiqmaydi (D40 ga mos).
- **Savol:** narxsiz bosh pudratchi qatorlari importda «Buyurtmachi» bo‘lsinmi yoki «Pudratchi»; yoki normativ jadvaldan chiqarilsinmi?

### Past darajadagilar

| № | Nuqson | Dalil / sabab |
|---|---|---|
| N-04 | F-2 «Норма на ед.» yaxlitlash shovqini bilan: 17.004001, 2.155999, 0.062999 (norma 17,004 / 2,156 / 0,063) | norma `hisobiy miqdor ÷ hajm` dan qayta hisoblanadi (`estimate-acts.ts`); summaga ta’siri ~0,04 so‘m |
| N-05 | Excel fayl nomida kirill smeta nomi yo‘qoladi: «локалка» → `akt-_-2026-10-01-2026-10-31.xlsx` | `routes-estimates-extra.ts` (filename) `replace(/[^\w.-]+/g,'_')` |
| N-06 | F-3 rekvizit blokida ikkala tomonda ham «СУБПОДРЯДЧИК / ГЕНПОДРЯДЧИК» yorlig‘i | `estimate-acts.ts` `side()` bir xil yorliq beradi |
| N-07 | F-3 da egasining shaklidagi «АКЦИЗНЫЙ НАЛОГ (БЕЗ АКЦИЗА)» (Х) va «Всего к оплате:» qatorlari yo‘q; «в т.ч. на текущий год» (7-ustun) bo‘sh (hujjatda shunday); % son ko‘rinishida (73,58), egasida ulush (0,7359) | shakl farqi |
| N-08 | S5 «Отчет» izohida miqdor formatlanmagan: «-1.000000 шт» (UI da «-1 dona») | `customer-materials.ts` Excel `warnings.adjusted` bloki |
| N-09 | Sarlavha oynasi qayta ochilganda shartnoma summasi «500 000 000.00» ko‘rinishida | kosmetik |
| N-10 | Preview «П» ogohlantirishi 5 guruhdan keyin «…» bilan qisqaradi (Е23 da 13 guruhdan 5 tasi ko‘rinadi) | foydalanuvchi to‘ldirilishi kerak bo‘lgan hamma qatorni ko‘rmaydi |
| N-11 | Preview miqdor ogohlantirishida Excel qiymati xom: «7.329587300000001 → 7.027711» | kosmetik |
| N-12 | «Sozlamalar»: VMQ 583 saqlangan smetada «Erkin» tanlansa maydonlar VMQ qiymatida (20 / 7 / 2,5) qoladi | `EstimateDetailPage.tsx:721-729` — `initial` ga qaytaradi; UX |
| N-13 | `POST /v1/estimates` noma’lum `unit_id` da umumiy 404 `NOT_FOUND` (maydon ko‘rsatilmaydi) | `estimates.ts` `validateEstimate` → `one()`; UI ga ta’sir yo‘q |

Kuzatuvlar (nuqson emas): «П» qatorida nom «Nomi» katagida ikki marta (asosiy va kulrang material nomi); ombor sahifasi KPI «Jami xomashyo turlari» 1 material uchun 2 (ombor va brigadir hisobi alohida sanaladi, S5 ga aloqasi yo‘q); bir vaqtda ko‘p login qilinganda `RATE_LIMITED` (429) 8–10 daqiqa — agentlar parallel ishlaganidan.

## S3-02: farq sababi (−11 137,04)

«локалка» ni Form 5 o‘quvchisi bilan qatorma-qator solishtirildi (platforma qator jami = round(norma × hajm × narx, 2), Excel — o‘zining 8-ustuni):

| Tur | Platforma | Excel | Farq | Sabab |
|---|---|---|---|---|
| Ish haqi | 190 650 309,38 | 190 661 446,64 | −11 137,26 | **−11 148,73** — Excel 361-qatori: formula `=E361*$E$328` o‘z ishining hajmiga (E360 = 0,1102732) emas, boshqa ishning hajmiga havola qiladi (Excel 7,3295873, to‘g‘risi 63,73 × 0,1102732 = 7,0277); **+11,47** — ish haqi stavkasi Excel’da 36 929,937758, platformada 0,01 gacha 36 929,94 |
| Mashinalar | 14 868 476,37 | 14 868 476,36 | +0,01 | qatorma-qator yaxlitlash |
| Materiallar | 140 890 681,98 | 140 890 681,77 | +0,21 | narx 669 642,86 (Excel’da 750 000 / 1,12 = 669 642,857…) va qatorma-qator yaxlitlash |

Preview 361-qatorni «miqdor mos emas» ogohlantirishi bilan ko‘rsatadi (yana 155-qator: 0,676 → 0,507). Platforma nuqsoni emas; egasi Excel’dagi 361-qator formulasini tekshirishi mumkin.

## F-2 / F-3 va hisobot: egasining varaqlari bilan solishtiruv (to‘liq hajm stsenariysi)

Obyekt E: «локалка» importi (taklif sozlamalari), shartnoma summasi 423 534 720 (QQS bilan, egasining `ф3` dagidek), 49 ish pozitsiyasi to‘liq reja hajmida qabul qilindi, `Накладной № 1` ning 14 qatori nakladnoy narxida kirim qilindi (setka nomi smetadagidan qisqa — D32 bo‘yicha muqobil nom bilan bog‘landi), hammasi brigadirga berildi va 38 ta narxli buyurtmachi qatoriga reja miqdorida bog‘langan sarf qilindi (qoldiq 0). Davr — 2026 yil noyabr.

**F-3 (`ф3` bilan):**

| Qator | Platforma | Egasi |
|---|---|---|
| ВСЕГО СМР | 419 155 455,95 | 419 168 931,77 |
| Минус материалы заказчика | 140 890 681,98 | 140 890 681,77 |
| Без НДС | 278 264 773,97 | 278 278 250,00 |
| НДС 12 % | 33 391 772,88 | 33 393 390,00 |
| Итого с НДС | 311 656 546,85 | 311 671 640,00 |
| Shartnoma: QQSsiz / QQS / QQS bilan | 378 156 000 / 45 378 720 / 423 534 720 | aynan teng |
| Shartnomaga nisbatan | 73,58 % | 73,59 % |

Farq faqat S3-02 farqining zanjirdagi davomi (−15 093,15); dalolatnoma mexanizmi yangi farq qo‘shmadi. Uch jamg‘arma (boshidan, yil boshidan, davr) bir xil — egasida ham. Ogohlantirishlar yo‘q. Tuzilish: 16 ustun, 1…16 raqamlar, % faqat «Итого с НДС» da — egasidagidek; farqlar N-07 da.

**F-2 (`Апартамент № 1 ф-2` bilan):** ustunlar bir xil (№, Шифр, Наименование, Ед. изм., Норма на ед., Количество, Цена, Сумма); 21 bo‘lim — egasida ham 21; ish — «1», resurslar — «1.1, 1.2 …»; to‘liq shifr «Е0904-006-01 ДОП. 11 …»; miqdorlar teng (masalan, bloklar 20,22 / 11,55 / 6,44 / 17,99 m3). Farqlar: platforma bosh pudratchi materiallarini «n.m» bilan raqamlaydi, egasida ular raqamsiz; egasida narxsiz bosh pudratchi qatorlari ham bor (masalan, 30 m3 narxsiz), platformada sarfi yo‘q qator chiqmaydi (D40); egasi ish qatorida hajmni 5- va 6-ustunga yozadi, platforma faqat 6-ustunga; narx egasida yaxlitlanmagan (36 929,937758), platformada 0,01 gacha; egasida 9–11-yordamchi ustunlar bor. Platforma F-2: 648 qator, 601 raqamlangan (49 ish + 552 resurs/material = smetaning 640 qatori − sarfsiz 39 narxsiz qator).

**S5 hisoboti (`отчёт` bilan):**

| Material | Berilgan = sarflangan (platforma) | Egasi |
|---|---|---|
| Blok D500 (H150) | 139,68 m3 | 31,77 + 33,75 + 33,75 + 16,71 + 23,7 = 139,68 |
| Blok D500 (H200) | 52,07 m3 | 27,62 + 24,45 = 52,07 |
| Yelim | 3 991,56 kg | 994,12 + 2 997,44 |
| Setka | 181,64 m2 | 39,39 + 142,25 |
| Burchak 63×63×5 | 0,17 t | 0,17 |
| Armatura 10 mm | 0,007 t | 0,007 |
| Grunt GF-021 | 22,08 kg | 22,08 |
| **Jami summa** | **140 890 681,97** | **140 890 681,77** |

+0,20 nakladnoyning o‘zidan: narx katagida 669 642,86, lekin ikkita 33,75 m3 qatorining summasi yaxlitlanmagan narx bilan (22 600 446,43); platforma kirim summasini miqdor × kiritilgan narx (22 600 446,53) deb oladi. «Отчет» varag‘i egasining 11 ustuni bilan aynan bir xil sarlavhada; farq — platforma material bo‘yicha jamlaydi (egasida har nakladnoy qatori alohida, 14 qator) va «Наименование работ» ni to‘ldiradi; N-03 dagi nol «Лист» qatorlari.

## Vaqt o‘lchovlari (lokal stack)

| Amal | Vaqt |
|---|---|
| Form 5 preview: Е11+Е22+Е23+Е27 / ОБЩЕЕ / «локалка» (API) | 1,3–1,6 s / 2,1 s / 0,55 s |
| Form 5 commit: 4 smeta / ОБЩЕЕ / «локалка» (API) | 1,8 s / 4,4 s / 0,74 s |
| ОБЩЕЕ smetasini ochish (4 124 qator) | 0,27–0,30 s |
| ОБЩЕЕ resurslar yig‘masi | 0,03–0,04 s |
| ОБЩЕЕ dalolatnoma JSON / Excel | 0,10–0,11 s / 0,10–0,11 s |
| ОБЩЕЕ smeta Excel eksporti | 0,47–0,49 s |
| «локалка» to‘liq hajm: dalolatnoma JSON / Excel | 0,13 s / 0,18 s |
| Buyurtmachi materiallari, to‘liq hajm: JSON / Excel | 0,16 s / 0,08 s |
| Dalolatnoma oynasini ochish (UI, sahifa yuklanishi bilan) | ~3,7 s |

Hech biri 5 s dan oshmadi. ОБЩЕЕ commit avvalgi o‘lchovdan 1,3 s sekin (bitta o‘lchov; 483 soxta qator ham saqlanadi).

## Egasiga savollar

1. **N-02:** bosh muhandis dalolatnomani ko‘rishi kerakmi (qoidada — ha)? Ha bo‘lsa, marshrut tuzatiladi; yo‘q bo‘lsa, qoida va tugma.
2. **N-03:** `давальческие` dagi narxsiz bosh pudratchi qatorlari (39 ta) haqiqatan buyurtmachi materialimi? Importda ular uchun standart qiymat qanday bo‘lsin?
3. **N-01** tuzatilgach ОБЩЕЕ qayta import qilinadimi (mavjud smeta 483 ortiqcha qator bilan qoladi)?
4. Egasining `локалка` 361-qatoridagi formula (`$E$328`) xatomi? Excel jami shu sabab 11 148,73 so‘mga ortiq.
5. F-3 ga «АКЦИЗНЫЙ НАЛОГ (БЕЗ АКЦИЗА)» va «Всего к оплате» qatorlari kerakmi?
6. `qa:smoke` ni egasi parolini bergan holda qayta yurgizish kerak (bu tekshiruvda bajarilmadi).
