# Smetani to‘g‘rilash — Claude Code uchun promptlar (2026-11-06)

> **Asos:** `docs/research/SMETA_TADQIQOT_2026_11_06.md` — O‘zbekiston normalari (ShNK 4.01.16-09, ShNK 4.02.70-05, VMQ 577, VMQ 583, VMQ 46), MDH va xalqaro amaliyot, egasining Excel fayllari va 101-app.com bilan solishtirish.
> **Foydalanish:** har promptni yangi Claude Code sessiyasiga to‘liq nusxalang. Promptdan oldin sarlavhadagi modelni `/model` bilan tanlang (`TZ_VA_NARX_REJASI.md` 6.0-bo‘limi). Hamma promptlar bir xil yakunlanadi: avval reja, keyin egasining tasdig‘i, keyin ish, keyin tekshiruv; commit yo‘q. Har bosqich alohida PR: `main-vxg6su` → PR → egasi birlashtiradi.
> **Holat:** S1 bajarildi (2026-11-06, commit `62ecbbf`); S2 bajarildi (2026-11-07, commit `9e00b54`; egasi qarorlari: eski qatorlar to‘ldirilmaydi, sarlavha reviziyasiz alohida endpoint bilan, kod izohda takrorlanmaydi, «Раздел» ustuni bo‘limga, bo‘lim — filtr, bitta «Shifr» ustuni); S3 bajarildi (2026-11-07; egasi qarorlari: sozlamalar sarlavha endpoint’i orqali reviziyasiz, smeta sahifasida tahrirlanadi, VMQ 583 da foyda 7 % va ishlab chiqarish 2,5/5 % qat’iy, «buyurtmachi» tanlovi faqat bosh pudratchi material qatorlariga, eski 21 % qatorlari bir tugma bilan sozlamaga; commit `0b04562`); S4 bajarildi (2026-11-07; egasi qarorlari: tuzatish kiritilgan sana davriga, ko‘rish — narx va smeta huquqi borlar, yiriklashtirilgan ДАЛОЛАТНОМА yo‘q, rekvizitlarning saqlanmaydiganlari bo‘sh, shakl rus tilida, F-2 da faqat davr hajmi bor qatorlar, o‘chirilgan qator fakti — ogohlantirish; commit `e3165ef`); S5 bajarildi (2026-11-08; egasi qarorlari: buyurtmachi materiali smeta qatoridagi «Kim beradi» bo‘yicha, aralash material — ogohlantirish, summa ombor yozuvi qiymatida, ko‘rish — ombor ko‘rish huquqi borlar, summa — narx huquqi bilan, Excel rus tilida, ish pozitsiyasisiz qatorda normativ yo‘q). 1-bo‘limdagi qarorlar (D35–D41) egasi tomonidan **tasdiqlangan (2026-11-06)** va `docs/TZ_VA_NARX_REJASI.md` 1-bo‘limiga yozilgan.

---

## 0. Nima o‘zgaradi va qaysi tartibda

| Bosqich | Muammo (tadqiqotdan) | Natija | `/model` |
|---|---|---|---|
| **S1** | Form 5 importi miqdori «П» bo‘lgan material qatorlarini ogohlantirishsiz tashlab yuboradi (`Иш турлари` faylida 51 ta) | Ogohlantirish va tanlangan variant bo‘yicha saqlash | sonnet |
| **S2** | Norma kodi `category` ichida, «ДОП. …» qo‘shimchasi kesiladi; bo‘lim nomi yo‘qoladi; smeta sarlavhasi (asos, narx darajasi, shartnoma) yo‘q; resurslar yig‘masi yo‘q | Qator kodlari va bo‘lim, sarlavha ma’lumotlari, «Resurslar yig‘masi» | opus |
| **S3** | Smetaning yakuniy qismi yo‘q: 21 % qotirilgan «xizmat» qatori, buyurtmachi materiallari chegirilmaydi, QQS yo‘q | Server hisoblaydigan foizli zanjir: «Erkin» va «VMQ 583» sozlamalari | opus |
| **S4** | Oylik dalolatnoma (F-2) va ma’lumotnoma (F-3) platformadan chiqmaydi | Qabul qilingan progressdan davr bo‘yicha F-2 va F-3 Excel | opus |
| **S5** | Buyurtmachi materiallari bo‘yicha hisobot yo‘q (berildi, sarflandi, qoldiq) | Davr hisoboti va normativ sarf bilan solishtirish | opus |

**Bog‘liqlik:**
- S1 mustaqil, birinchi bo‘lib qilinadi.
- S2 → S3 → S4: S4 bo‘lim, sarlavha va zanjirdan foydalanadi.
- S5 S3 dagi «kim beradi» belgisiga tayanadi.
- Bir vaqtda ikki bosqichni bir faylda ochmang.

---

## 1. Egasi qarorlari (tasdiqlangan, 2026-11-06)

Qarorlar `docs/TZ_VA_NARX_REJASI.md` 1-bo‘limidagi jadvalga yozilgan; promptlar shu jadvalga qaraydi.

**Egasi tasdig‘idan oldingi aniqlashtirishlar:**
- **D37:** Form 5 dagi bo‘sh raqamli material qatorlari har doim ham buyurtmachi materiali emas. Egasining faylida 38 tasi narxsiz, faqat nomi bilan berilgan. Shuning uchun «buyurtmachi» standart qiymati faqat jamlar blokida bosh pudratchi materiallari yoki qaytarish qatori bo‘lganda qo‘yiladi.
- **D39:** xizmat qatorlari bo‘yicha qoida qo‘shildi.
- **D40:** qoida barcha normasiz materiallarga kengaytirildi.
- **D36, D39:** D17 va D32 ning tegishli qismlari almashtirilishi aniq yozildi.

| № | Savol | Qaror | Asos |
|---|---|---|---|
| **D35** | Form 5 dagi «П» qatorlari (miqdor loyihadan) | Material qatori **miqdor 0** bilan, o‘sha ishning kategoriyasi va zonasida saqlanadi; izohda «П — miqdor loyihadan» va asl kod. Preview’da qator raqamlari bilan ogohlantirish. Miqdor keyin muharrirda kiritiladi | ShNK 4.02.70-05, 1.9-band; 0 × narx reja summasini o‘zgartirmaydi |
| **D36** | QQS | Smeta zanjirida **ixtiyoriy** QQS foizi (standart — yo‘q; qo‘lda 12 yoki 6 %). Form 5 jamlar blokida НДС bo‘lsa, preview uni taklif qiladi. Moliya jurnaliga va «QQS yo‘q» buxgalteriya qoidasiga ta’sir qilmaydi. **D17 dagi «smeta ustama, foyda va QQS ko‘rsatilmaydi» qismi shu bilan almashtiriladi** (smeta yakuni bloki uchun) | Egasining fayllari, F-3, VMQ 46 (narx QQS bilan) |
| **D37** | Buyurtmachi (bosh pudratchi) materiallari | Material qatorida «kim beradi»: pudratchi (standart) yoki buyurtmachi. Form 5 importida bo‘sh raqamli material qatorlari uchun varaq bo‘yicha bitta tanlov: jamlar blokida «МАТЕРИАЛЫ ГЕНПОДРЯДЧИКА / ЗАКАЗЧИКА» yoki «ВОЗВРАТ» qatori bo‘lsa, standart — «buyurtmachi», aks holda «pudratchi». Muharrirda har qatorda o‘zgartiriladi. Buyurtmachi materiallari foiz bazasiga **kiradi** va jami oxirida **chegiriladi** | VMQ 583, 12-band; egasining «ВОЗВРАТ материалов генподрядчика» qatori |
| **D38** | `plan_total` (moliya kartasi, dashboard, narx varaqasi, blok smetasi) | **O‘zgarmaydi** — tannarx rejasi, ya’ni qatorlar jami (buyurtmachi materiallari ham, hozirgidek). Zanjir natijasi (foizlar, chegirma, QQS) yangi maydonlarda: «smeta narxi». Buyurtmachi materiallari omborga to‘lovsiz kiradi, shuning uchun reja–fakt farqiga ta’sir qiladi. S3 sessiyasi bu ta’sirni o‘lchab hisobotda yozadi; `plan_total` ni o‘zgartirish — alohida qaror | `pricing.ts` va boshqa hisoblar `plan_total` ga tayanadi |
| **D39** | Boshqa xarajatlar bazasi | **Baza:** `materiallar + ish haqi + mashinalar + xizmatlar`, buyurtmachi materiallari bilan. **Ishlab chiqarish xarajatlari** (2,5 % / 5 %) — alohida qator, bazaga kirmaydi. **D29 bo‘yicha qo‘shilgan foiz «xizmat» qatorlari** (21 %) bazaga ham, to‘g‘ridan-to‘g‘ri xarajatlarga ham kirmaydi: S3 ularni aniqlab ogohlantiradi, reviziya orqali olib tashlanadi. **D32 ning 4-bandi** («21 % qatori qotirilgan summa») shu sozlama bilan almashtiriladi | VMQ 583 formulasi va egasining fayli. ShNK 4.01.16-09 da baza `+ Сп`; farq tadqiqotda yozilgan |
| **D40** | F-2/F-3: saqlanadimi va normasiz materiallar | Faqat **Excel eksport** (holat saqlanmaydi), shakl egasining `ф-2` va `ф3` varaqlari kabi. Norma bilan bog‘langan resurslar = norma × qabul qilingan hajm. **Normasiz barcha material qatorlari** (buyurtmachi va pudratchi) davr bo‘yicha shu smeta qatoriga bog‘langan **ombordagi haqiqiy sarf** bilan olinadi. Bog‘lanmagan sarf bo‘lsa — ogohlantirish | Egasining faylida bu qatorlar berilgan = sarflangan miqdorda |
| **D41** | Shartnoma ma’lumotlari | Smeta sarlavhasida **pudrat shartnomasi**: raqami, sanasi, summasi (QQS bilan). F-3 dagi % shu summaga nisbatan. Bu D1 dagi kvartira sotuvi shartnomasi emas. Bir shartnoma bir nechta smetani qamrasa — keyinroq alohida «shartnoma» obyekti | Egasining `ф3` varag‘i; VMQ 46 |

---

## 2. Nazorat misoli (S3 va S4 testlarida aynan shu natija chiqishi shart)

**Kirish ma’lumotlari:**

| Qator | So‘m |
|---|---|
| Ish haqi (mehnat qatorlari) | 1 000 000,00 |
| Mashinalar | 200 000,00 |
| Pudratchi materiallari | 500 000,00 |
| Buyurtmachi materiallari | 300 000,00 |
| **To‘g‘ridan-to‘g‘ri xarajatlar jami** | **2 000 000,00** |

**Natija:**

| Qator | «Erkin»: 21 %, QQS 12 % | «VMQ 583»: 20 % + 7 %, 2,5 %, QQS 12 % |
|---|---|---|
| Boshqa xarajatlar (foyda bilan) | 420 000,00 | 540 000,00 |
| Ishlab chiqarish xarajatlari | — | 50 000,00 |
| Jami | 2 420 000,00 | 2 590 000,00 |
| Buyurtmachi materiallari chegirmasi | −300 000,00 | −300 000,00 |
| QQSsiz jami | 2 120 000,00 | 2 290 000,00 |
| QQS | 254 400,00 | 274 800,00 |
| **QQS bilan jami** | **2 374 400,00** | **2 564 800,00** |

**Yaxlitlash:** har qator 0,01 gacha (half-up). Keyingi qator yaxlitlangan qiymatlardan hisoblanadi.

**Qo‘lda tekshiruv (testga kirmaydi; haqiqiy fayl repoda yo‘q):** egasining `давальческие.xlsx → локалка` varag‘i bilan solishtiriladi:

| Qator | So‘m |
|---|---|
| To‘g‘ridan-to‘g‘ri xarajatlar | 346 420 604,77 |
| 21 % | 72 748 327,00 |
| Chegirma | 140 890 681,77 |
| QQSsiz | 278 278 250,00 |
| QQS | 33 393 390,00 |
| QQS bilan | 311 671 640,00 |

---

## 3. Promptlar

### 3.1. S1 — Form 5: «П» qatorlari (`/model claude-sonnet-5-5`)

```text
CLAUDE.md, docs/FORM5_IMPORT_LOYIHA.md, docs/research/SMETA_TADQIQOT_2026_11_06.md (4-bo‘limdagi
«ShNK 4.02.70-05» bandi va 9-bo‘lim) hamda docs/SMETA_TUZATISH_PROMPTLARI.md (1-bo‘lim, D35) ni o‘qi.
D35 qarori docs/TZ_VA_NARX_REJASI.md 1-bo‘limida — unga amal qil.

Muammo: ShNK 4.02.70-05, 1.9-band bo‘yicha normada ayrim materiallar faqat nomi bilan beriladi, sarfi
loyihadan (ishchi chizmalardan) olinadi va sarf ustunida «П» harfi bilan belgilanadi. Form 5 faylida
bunday qator: A bo‘sh, B kod (П54889, С…, М…), C nom, D birlik, E = "П", F bo‘sh. backend/src/form5.ts
(parseForm5, `if (!a && (num(F) ?? num(E)))` sharti) bunday qatorni hech qanday ogohlantirishsiz tashlab
yuboradi. Egasining `Иш турлари.xlsx` faylida (to‘plam varaqlarida) 51 ta shunday qator bor; ular
smetaga ham, preview’ga ham tushmaydi.

Vazifa:
1) parseForm5 «П» qatorlarini tanisin: E yoki F qiymati "П" (katta-kichik harf va bo‘sh joylar
   e’tiborsiz). Ular alohida ro‘yxatda qaytsin: Excel qatori, kod, nom, birlik, tegishli ish
   (kategoriya) va zona.
2) Preview javobiga mavjud ogohlantirishlar naqshida yangi tur qo‘sh: soni va qatorlar ro‘yxati.
   frontend/src/features/estimates/Form5Import.tsx ogohlantirishlar blokida ko‘rsat. Matnlar
   frontend/src/locales/estimates.uz.ts va estimates.ru.ts ga.
3) Commit’da D35 bo‘yicha: material qatori miqdor 0 bilan saqlanadi, izohda «П — miqdor loyihadan»
   va asl kod. Material o‘sha ishning kategoriyasi va zonasiga bog‘lansin, `material_name` mavjud
   material moslash qoidasi bilan.
4) Mavjud tekshiruvlar buzilmasin: bosh pudratchi materiali (miqdori raqam), resurs (A «n.m»),
   ish (A butun son), «ВСЕГО ЗАТРАТ» dan keyingi jamlar bloki. Narxsiz qatorlar ogohlantirishi
   va norma × hajm farqi ogohlantirishi o‘zgarmasin.
5) backend/tests/form5-fixture.ts ga «П» qatori qo‘sh. Unit va integratsion test: preview’da
   ogohlantirish va qator raqami, commit’da tanlangan variant, boshqa qatorlar natijasi o‘zgarmagan.
   UI testida (backend/scripts/ui-test.ts) ogohlantirish ko‘rinishi.
6) docs/FORM5_IMPORT_LOYIHA.md (2- va 3-bo‘lim) va docs/backend/BARPO_BUSINESS_RULES.md dagi
   Form 5 bo‘limini yangila.

Modellar:
- Ish kichik, o‘zing bajar.
- Oxirida diff’ni yangi sub-agentga (model: opus) mustaqil tekshirtir: qator turlari to‘qnashmaydimi,
  fixture’ning eski natijalari o‘zgarmadimi, matnlar ikki tilda bormi.

Avval reja va taxminlaringni ayt, tasdiqlashimni kut.
Tekshiruv: backend — npm run build, npm test, npm run test:integration, npm run test:ui,
npm run test:roles, npm run docs; frontend — pnpm typecheck, pnpm build. Suite’lar yozgan hisobot
fayllarini (docs/backend/*verification.json, BARPO_ROLE_TEST_REPORT.md, *.png) git checkout -- bilan
tikla. Commit qilma.
```

### 3.2. S2 — Qator kodlari, bo‘lim, smeta sarlavhasi va resurslar yig‘masi (`/model claude-opus-5-5`)

```text
CLAUDE.md, docs/BARPO_AI_HANDOFF.md, docs/research/SMETA_TADQIQOT_2026_11_06.md (2-, 3-, 4-, 6.1- va
9-bo‘limlar), docs/FORM5_IMPORT_LOYIHA.md, docs/backend/BARPO_BUSINESS_RULES.md («Smeta va katalog»,
D26–D32 bo‘limlari) va docs/SMETA_TUZATISH_PROMPTLARI.md (1-bo‘lim, D41) ni o‘qi.

Muammo (tadqiqotdan):
- Norma kodi faqat `category` ichida «kod + nom» bo‘lib saqlanadi. Kodning «ДОП. 11 ГОСАРХИТЕКТСТРОЙ
  РУЗ ПР. № 429 …» qo‘shimchasi kesiladi; resurs kodi (1 — ishchilar, 3 — mashinistlar, mashina va
  material kodlari) faqat `note` da. Kod tuzilishi: `Е` + SRN to‘plami (2 raqam) + bo‘lim (2) − jadval (3)
  − band (2); to‘plam raqamlari VMQ 577 ilovalaridagi SRN 4.02.NN bilan mos (tadqiqot, 4-bo‘lim).
- «Раздел …» qatoridan form5Floor faqat qavatni oladi, bo‘lim nomi (ish turi va joy) saqlanmaydi.
  ShNK 4.01.16-09 (2.15-band) bo‘yicha lokal vedomost bo‘limlari texnologik ketma-ketlikda bo‘ladi.
- Smeta sarlavhasi yo‘q: asos (chizmalar), narx darajasi va sanasi, ish haqi stavkasi manbai,
  shartnoma (D41).
- Resurslar yig‘masi yo‘q, holbuki `Иш турлари`dagi «ОБЩЕЕ» yakuni (mehnat, 154 mashina, 328 material)
  va VMQ 46 3a-ilovasi (tenderda ish haqi fondi, mashinalar, materiallar reestri) aynan shuni talab qiladi.

Vazifa:
1) Avval Explore sub-agent (model: haiku) bilan xarita tuz: `category`, `note`, `zone_id` qayerda
   ishlatiladi — D26/D27 reviziya lineage moslash, D28 qavat × ish matritsasi, D32 avtomatik akkord
   (`autoRateSql`, guruh = kategoriya + zona), eksport/import, `GET /v1/estimate-lines` qidiruvi.
   `category` semantikasi O‘ZGARMAYDI (shu uch qoida unga tayanadi).
2) Migratsiya (keyingi raqam, nomi `^\d{3}_[a-z_]+\.sql$`):
   - `estimate_lines`: `norm_code` (to‘liq shifr, qo‘shimchasi bilan), `resource_code`, `section_name`;
     hammasi ixtiyoriy matn.
   - `estimates`: `basis`, `price_level_date`, `labor_rate_source`, `contract_number`, `contract_date`,
     `contract_amount` (decimal, QQS bilan; D41) — ixtiyoriy.
   UPDATE va ALTER bir migratsiyada bo‘lmasin. Eski qatorlarni `category` prefiksidan to‘ldirish kerakmi —
   taklif qil va so‘ra (alohida migratsiya).
3) Reviziya snapshot’i (`estimate_revisions`, o‘zgarmas) yangi maydonlarni o‘z ichiga olsin. Eski
   snapshot’larda ular yo‘q — UI va lineage buni ko‘tarsin. Lineage moslash qoidasi o‘zgarmaydi.
4) Form 5 importi:
   - ish qatorida `norm_code` = B ustunining to‘liq matni, resurs qatorida `resource_code` = B;
   - `section_name` = oxirgi «Раздел …» qatorining to‘liq matni, keyingi barcha qatorlarga;
   - zona mantiqi (form5Floor) o‘zgarmaydi.
   Oddiy import va eksportga ixtiyoriy ustunlar qo‘sh: «Norma kodi», «Resurs kodi», «Bo‘lim» (uz va ru
   sarlavhalar). Eksport → import aylanmasi ularni saqlasin.
5) API:
   - `GET /v1/estimates/:id` yangi maydonlarni qaytarsin;
   - `PATCH` sarlavhani o‘zgartirsin (`estimates.edit`); `contract_amount` narx maydoni — `redactPrices`
     ro‘yxatiga;
   - `GET /v1/estimate-lines?q=` norma kodi va bo‘lim bo‘yicha ham qidirsin.
6) Resurslar yig‘masi:
   - `GET /v1/estimates/:id/resources` (`estimates.read`, `projectScope`): joriy reviziya bo‘yicha
     tur + nom + birlik (+ resurs kodi) guruhida Σ `effective_quantity`; mehnat (kishi-soat), mashinalar
     (mashina-soat), materiallar alohida;
   - summa faqat `prices.read` bilan (route `sensitive`, yangi maydon nomlari `redactPrices` ga);
   - smeta Excel eksportiga «Resurslar yig‘masi» varag‘i;
   - yangi `:id` route `npm run test:roles` ga avtomatik tushadi; prefiks yangi bo‘lsa `ids` xaritasini
     yangila (`unfillable` bo‘sh qolsin).
7) UI (frontend/src/features/estimates):
   - smeta jadvalida «Norma kodi» ustuni va bo‘lim bo‘yicha guruhlash/filtr;
   - smeta sahifasida sarlavha kartasi (asos, narx darajasi, shartnoma) va uni tahrirlash;
   - «Resurslar yig‘masi» tabi.
   Pul `formatMoney`, raqam maydonlari `Input inputMode="decimal"` / `NumericInput`; matnlar uz va ru.
8) Hujjatlar: BUSINESS_RULES, FORM5_IMPORT_LOYIHA, D41 natijasi; `npm run docs`.

Modellar:
- 1-band — Explore sub-agent (model: haiku), natija fayl:qator ro‘yxati.
- Migratsiya, API, import, ruxsatlar — o‘zing.
- Reja tasdiqlangach UI va lokallarni general-purpose sub-agentga (model: sonnet) aniq fayllar va qabul
  mezoni bilan ber.
- Oxirida diff’ni yangi sub-agentga (model: opus) tekshirtir: lineage, D28 matritsa va D32 akkord
  natijalari o‘zgarmaganmi; narx redaksiyasi; tenant izolyatsiyasi.

Avval reja va taxminlaringni ayt, tasdiqlashimni kut.
Tekshiruv: backend — npm run build, npm test, npm run test:integration, npm run test:ui,
npm run test:roles, npm run docs; frontend — pnpm typecheck, pnpm build. Hisobot fayllarini
git checkout -- bilan tikla. Commit qilma.
```

### 3.3. S3 — Smetaning yakuniy qismi: foizli zanjir (`/model claude-opus-5-5`)

```text
CLAUDE.md, docs/BARPO_AI_HANDOFF.md, docs/research/SMETA_TADQIQOT_2026_11_06.md (0-, 3.5-, 3.6-, 5-, 6-,
9- va 10-bo‘limlar), docs/backend/BARPO_BUSINESS_RULES.md (Form 5, D29, D32, `plan_total` ishlatilgan
qoidalar) va docs/SMETA_TUZATISH_PROMPTLARI.md (1- va 2-bo‘limlar) ni o‘qi. D36–D39 qarorlari
docs/TZ_VA_NARX_REJASI.md 1-bo‘limida — ularga amal qil.

Kontekst (tadqiqotdan, asl manbalar):
- ShNK 4.01.16-09, 4.15-band: pudratchining boshqa xarajatlari `Пп = (См + Сзп + Сэм + Сп) × У`;
  foyda shu summa ichida (5.12, 6.8-bandlar); qat’iy foiz yo‘q.
- VMQ 583 (21.10.2026; 01.01.2027 dan budjet va davlat ulushi ≥ 50 % obyektlar):
  - `Пп = (См + Сзп + Сэм) × У`, У = 20 % boshqa xarajatlar + 7 % foyda;
  - ishlab chiqarish xarajatlari to‘g‘ridan-to‘g‘ri xarajatlarning 2,5 %i (tog‘li, cho‘l va borish qiyin
    hududlarda 5 %);
  - tender shartnomasida foiz shartnoma davomida o‘zgarmaydi;
  - buyurtmachi materiallari foiz bazasiga kiradi va to‘lovda chegiriladi (12-band).
- Egasining Form 5 jamlar bloki: ИТОГО ПРЯМЫХ ЗАТРАТ → ПРОЧИЕ ЗАТРАТЫ 21 % → ИТОГО → ВОЗВРАТ материалов
  генподрядчика → ИТОГО С УЧЕТОМ ПРОЧИХ → НДС 12 % → ИТОГО С НДС.
- Hozir: D29 — 21 % bir tugma bilan qotirilgan «xizmat» qatoriga aylanadi va reviziyada qo‘lda
  o‘zgartiriladi; buyurtmachi materiallari chegirilmaydi; QQS yo‘q.
- D36 va D39 eski qarorlarning bir qismini almashtiradi: D17 dagi «smeta ustama/foyda/QQS
  ko‘rsatilmaydi» va D32 ning 4-bandi («21 % qatori qotirilgan summa»).

Vazifa:
1) Avval Explore sub-agent (model: haiku) bilan `plan_total`, `estimate_total` va smeta qator summalari
   yig‘ilgan barcha joylarni top (pricing.ts, routes-dashboard.ts, routes-finance-extra.ts,
   routes-company*.ts, blok smetasi). D38 bo‘yicha ularning semantikasi O‘ZGARMAYDI.
2) Material qatorida «kim beradi» (`supplied_by`: `contractor` | `customer`; standart — contractor).
   Form 5 importida bo‘sh raqamli material qatorlari uchun varaq bo‘yicha bitta tanlov (D37). Standart:
   jamlar blokida «МАТЕРИАЛЫ ГЕНПОДРЯДЧИКА / ЗАКАЗЧИКА» yoki «ВОЗВРАТ» qatori bo‘lsa — `customer`,
   aks holda — `contractor`; preview’da o‘zgartiriladi. Oddiy import va eksportda ixtiyoriy
   «Kim beradi» ustuni. Muharrirda har qatorda tanlash.
3) Smeta sozlamalari (estimate darajasida, reviziya snapshot’iga kiradi):
   - `markup_mode` (`free` | `vmq583`);
   - `other_costs_percent`, `profit_percent`, `production_costs_percent`, `deduct_customer_materials`,
     `vat_percent` (ixtiyoriy, D36).
   «VMQ 583» presetida: 20 / 7 / 2,5 (hudud tanlansa 5). «Erkin»da foizlar qo‘lda; 21 % bitta «boshqa
   xarajatlar» foizi sifatida, foyda 0.
   Sozlama o‘zgarishi tarixda qolsin (reviziya yoki audit_events — mavjud naqshga qarab taklif qil).
4) Hisoblash moduli (backend, decimal.js; Number taqiqlangan; har qator 0,01 half-up, keyingisi
   yaxlitlangan qiymatlardan):
   - ish haqi (labor), mashinalar (equipment), pudratchi materiallari, buyurtmachi materiallari,
     xizmatlar (service), to‘g‘ridan-to‘g‘ri xarajatlar jami. D29 bo‘yicha qo‘shilgan foiz «xizmat»
     qatorlari (21 %) bu yerga kirmaydi (D39);
   - boshqa xarajatlar = baza × (other + profit) % (D39: baza = materiallar + ish haqi + mashinalar
     + xizmatlar, buyurtmachi materiallari bilan);
   - ishlab chiqarish xarajatlari = to‘g‘ridan-to‘g‘ri × %;
   - jami, buyurtmachi materiallari chegirmasi, QQSsiz jami, QQS, QQS bilan jami.
   Natija docs/SMETA_TUZATISH_PROMPTLARI.md 2-bo‘limidagi nazorat misoli bilan tiyinigacha mos kelsin.
5) API: `GET /v1/estimates/:id` javobiga `summary` (qatorlar yuqoridagi tartibda: kalit, summa, foiz).
   Route `sensitive`, `prices.read` siz `summary` kesiladi, yangi maydon nomlari `redactPrices` ga
   (prorab D20 — ko‘rmaydi). Sozlamalarni o‘zgartirish — `estimates.edit`.
6) Form 5 preview va import:
   - Excel jamlar blokidagi foiz (0,21) va QQS (0,12) sozlamaga avtomatik taklif qilinsin;
   - preview platforma zanjiri va «Excel jami»ni qatorma-qator solishtirsin, farqni ko‘rsatsin;
   - D29 dagi «21 % ni xizmat qatori qilish» tugmasi sozlamaga almashtirilsin;
   - mavjud smetalardagi shunday foiz «xizmat» qatorlari (D39): ularni qanday aniqlashni (masalan,
     import izohi yoki nomi bo‘yicha) rejada ko‘rsat; smeta sahifasida ogohlantirish va bir tugma bilan
     yangi reviziyada olib tashlab, foizni sozlamaga o‘tkazish. O‘zgarmas ledger’larga tegilmaydi.
7) Excel eksport: smeta oxirida jamlar bloki egasining `локалка` tartibida (uz/ru yorliqlar,
   foiz ustuni bilan).
8) UI: smeta sahifasida «Smeta yakuni» bloki (sozlamalar va jamlar), muharrirda sozlamalarni
   o‘zgartirish. USD faqat `formatMoney` ichida; frontend summa qo‘shmaydi. Matnlar uz va ru.
9) Testlar:
   - unit: hisoblash moduli, nazorat misolining ikkala ustuni, yaxlitlash, QQSsiz va chegirmasiz
     variantlar;
   - integratsion: API, reviziya snapshot’i, narx redaksiyasi (prorab, brigadir, omborchi), Form 5
     preview solishtiruvi, `plan_total` o‘zgarmagani;
   - UI: blok ko‘rinishi va sozlamani o‘zgartirish.
10) Hujjatlar: BUSINESS_RULES ga yangi bo‘lim, D36–D39 natijasi, FORM5_IMPORT_LOYIHA (D29 o‘zgarishi),
    `npm run docs`.

Modellar:
- 1-band — Explore sub-agent (model: haiku).
- Hisoblash moduli, migratsiya, API, import, ruxsatlar — o‘zing.
- Tasdiqdan keyin UI, lokallar va Excel yakuniy blok shaklini general-purpose sub-agentga
  (model: sonnet) ber, aniq fayllar va qabul mezoni bilan.
- Oxirida diff’ni yangi sub-agentga (model: fable, mavjud bo‘lmasa opus) mustaqil tekshirtir:
  pul aniqligi, yaxlitlash tartibi, nazorat misoli, `plan_total` o‘zgarmagani, narx redaksiyasi.

Avval reja va taxminlaringni ayt, tasdiqlashimni kut.
Tekshiruv: backend — npm run build, npm test, npm run test:integration, npm run test:ui,
npm run test:roles, npm run docs; frontend — pnpm typecheck, pnpm build. Hisobot fayllarini
git checkout -- bilan tikla. Commit qilma.
```

### 3.4. S4 — Oylik yopish paketi: F-2 dalolatnoma va F-3 ma’lumotnoma (`/model claude-opus-5-5`)

```text
CLAUDE.md, docs/BARPO_AI_HANDOFF.md, docs/research/SMETA_TADQIQOT_2026_11_06.md (2-, 3.6-, 6-, 6.1-, 8-,
9- va 9.1-bo‘limlar; egasining ф-2, ф3, ДАЛОЛАТНОМА varaqlari tavsifi shu yerda),
docs/backend/BARPO_BUSINESS_RULES.md (hisobot qabuli, progress_entries, progress_corrections, D26–D27,
O12, O17) va docs/SMETA_TUZATISH_PROMPTLARI.md (1- va 2-bo‘lim; D40, D41) ni o‘qi. Shakl namunasi —
egasining lokal fayli docs/давальческие_havolasiz.xlsx (repoda emas): undagi kompaniya nomlari, INN va
summalarni kodga, testga yoki hujjatga ko‘chirma. S2 va S3 main’da bo‘lishi shart — tekshir.

Kontekst:
- ShNK 4.01.16-09, 2.11-band: obyekt resurs vedomostlari — buyurtmachi va pudratchi o‘rtasidagi
  hisob-kitob hujjati.
- Egasining fayllaridagi shakllar:
  - `ф-2` — Form 5 shaklining o‘zi, davr hajmlari bilan («АКТ ВЫПОЛНЕННЫХ РАБОТ (локальная ресурсная
    смета) за ___ м-ц»; resurs miqdori = norma × davr hajmi);
  - `ф3` — «СПРАВКА-СЧЕТ-ФАКТУРА»: qurilish boshidan / yil boshidan / hisobot oyi bo‘yicha hajm,
    % va summa; shartnoma summasi; QQS;
  - `ДАЛОЛАТНОМА` — yiriklashtirilgan qatorlar va QQS.
- ESF majburiy, dalolatnoma shartnoma bo‘yicha. 101-app davr hisobotidan dalolatnoma chiqaradi, lekin
  o‘zbek shaklini bermaydi — bu BARPO uchun farqlovchi imkoniyat.

Vazifa:
1) Avval Explore sub-agent (model: haiku) bilan xarita tuz: progress_entries, progress_corrections,
   reports.report_date, qabul vaqti, lineage_id, sarf buyruqlari (stock_commands → estimate_line_id).
2) Hisoblash moduli (backend):
   - Davr — oy yoki sana oralig‘i, hisobot sanasi bo‘yicha (UTC+5, O12/O17). Faqat qabul qilingan
     hisobotlar va tuzatishlar.
   - Smeta qatorlari reviziyalar bo‘ylab `lineage_id` bilan jamlanadi; narx — joriy reviziyadagi,
     qotirilgan akkord stavkalariga tegilmaydi.
   - Form 5 smetada ish qatorining davr hajmi → uning resurslari = norma × davr hajmi (ф-2 mantiqi).
   - Normasiz barcha material qatorlari (buyurtmachi va pudratchi) — D40 bo‘yicha: davr bo‘yicha shu
     smeta qatoriga bog‘langan ombordagi haqiqiy sarf (`stock_commands.estimate_line_id`, lineage
     orqali); bog‘lanmagan sarf bo‘lsa — ogohlantirish.
   - Davr summalariga S3 zanjiri qo‘llanadi (shu smetaning sozlamalari bilan).
   - Jamg‘armalar: qurilish boshidan, yil boshidan, davr.
3) API: `GET /v1/estimates/:id/acts?from&to` (JSON preview) va Excel eksport (F-2 va F-3 bitta
   faylda, alohida varaqlarda; ixtiyoriy yiriklashtirilgan dalolatnoma varag‘i — so‘ra).
   - Huquq: `prices.read` va mavjud ruxsatlardan qaysi biri (estimates.read / finance.read) — rollar
     matritsasini taklif qil. Prorab va brigadir ololmaydi (D20).
   - Holat saqlanmaydi (D40). «Dalolatnoma hujjati»ni moliya bilan bog‘lash — alohida bosqich.
4) Excel shakllari:
   - **F-2:** sarlavha (obyekt, smeta, davr, shartnoma — S2), egasining ф-2 si kabi ustunlar
     (№, shifr, nom, birlik, miqdor birlikka / davr bo‘yicha, narx birlikka, summa), bo‘limlar
     (`section_name`), oxirida S3 jamlar bloki;
   - **F-3:** 16 ustunli shakl — hajm / % / summa × (boshidan, yil boshidan, davr); shartnoma summasi
     (D41); QQSsiz, chegirma, QQS, jami.
   Raqamlar decimal satrdan; Excel’da formula emas, qiymat.
5) UI: smeta sahifasida «Dalolatnoma (F-2/F-3)» tugmasi: davr tanlash oynasi, preview jadvali, Excel
   yuklash. Matnlar uz va ru.
6) Testlar:
   - unit: nazorat misoli davr summalarida, norma × hajm, jamg‘armalar;
   - integratsion: ikki reviziya o‘rtasidagi davr, tuzatish, oy chegarasi (UTC+5), qabul qilinmagan
     hisobot kirmaydi, boshqa obyekt va tenant ma’lumoti chiqmaydi, rollar;
   - Excel: ustunlar va jamlar;
   - UI: oyna va yuklash.
7) Hujjatlar: BUSINESS_RULES, D40–D41 natijasi, `npm run docs`; docs/tests/ ga qo‘lda test case’lar
   (ID | Qadam | Kutilgan natija).

Modellar:
- 1-band — Explore sub-agent (model: haiku).
- Hisoblash, API, ruxsatlar — o‘zing.
- Tasdiqdan keyin Excel shakllari va UI ni general-purpose sub-agentlarga (model: sonnet), ketma-ket,
  aniq fayllar bilan ber.
- Oxirida diff’ni yangi sub-agentga (model: opus) tekshirtir: pul, davr chegaralari, lineage, tenant,
  narx redaksiyasi.

Avval reja va taxminlaringni ayt, tasdiqlashimni kut.
Tekshiruv: backend — npm run build, npm test, npm run test:integration, npm run test:ui,
npm run test:roles, npm run docs; frontend — pnpm typecheck, pnpm build. Hisobot fayllarini
git checkout -- bilan tikla. Commit qilma.
```

### 3.5. S5 — Buyurtmachi materiallari hisoboti (`/model claude-opus-5-5`)

```text
CLAUDE.md, docs/BARPO_AI_HANDOFF.md, docs/research/SMETA_TADQIQOT_2026_11_06.md (3.6-, 6- va 8-bo‘limlar),
docs/tests/SMETA_EXCEL_TEKSHIRUV_2026_11_02.md (давальческие materiallarni omborga to‘lovsiz kirim
qilish tekshiruvi), docs/backend/BARPO_BUSINESS_RULES.md (ombor bo‘limi: jo‘natish ≠ qabul ≠ sarf, o‘zgarmas
stock_ledger) va docs/SMETA_TUZATISH_PROMPTLARI.md (D37, D40) ni o‘qi. S3 (`supplied_by`) main’da
bo‘lishi shart.

Kontekst:
- Egasining `Накладной № 1`, `Акт № 1` va `отчёт` varaqlari. Hisobot ustunlari: ish nomi, material,
  birlik, davr boshidagi qoldiq (miqdor/summa), davrda berilgan, haqiqatda sarflangan, davr oxiridagi
  qoldiq.
- VMQ 583, 12-band: buyurtmachi (bosh pudratchi) materiallari pudratchi omborida birlamchi hujjatlar
  (hisobvaraq-faktura, yuk xati) asosida kirim qilinadi; ish hajmi to‘lovga taqdim etilganda ularning
  qiymati chegiriladi.

Vazifa:
1) Avval Explore sub-agent (model: haiku) bilan hozir buyurtmachi materiallari qanday kirim qilinishini
   top (to‘lovsiz kirim, kontragent, hujjat turi). Kirimni «buyurtmachi materiali» deb belgilash yo‘lini
   taklif qil: smeta qatoridagi `supplied_by` va/yoki kirim hujjatidagi belgi. O‘zgarmas ledger’larga
   UPDATE yo‘q.
2) Hisoblash: davr bo‘yicha (UTC+5) — boshlang‘ich qoldiq, berilgan (kirim), sarflangan (sarf
   buyruqlari), oxirgi qoldiq. Material bo‘yicha va smeta qatori (ish) bo‘yicha. Normativ sarf
   (norma × qabul qilingan hajm, S4 moduli) bilan solishtirib, ortiqcha yoki kam sarf.
3) API va Excel eksport egasining `отчёт` shaklida (uz/ru). Summalar faqat `prices.read` bilan.
   Huquq: omborchi, buxgalter, admin, bosh muhandis — matritsani taklif qil.
4) UI: ombor yoki smeta bo‘limida hisobot sahifasi/tab. Matnlar uz va ru.
5) Testlar (unit, integratsion, rollar, UI) va hujjatlar (BUSINESS_RULES, `npm run docs`,
   docs/tests/ test case’lar).

Modellar:
- 1-band — Explore sub-agent (model: haiku).
- Hisoblash va API — o‘zing.
- UI va Excel — general-purpose sub-agent (model: sonnet).
- Yakuniy tekshiruv — yangi sub-agent (model: opus): ledger o‘zgarmasligi, davr chegaralari, tenant,
  narx redaksiyasi.

Avval reja va taxminlaringni ayt, tasdiqlashimni kut.
Tekshiruv: backend — npm run build, npm test, npm run test:integration, npm run test:ui,
npm run test:roles, npm run docs; frontend — pnpm typecheck, pnpm build. Hisobot fayllarini
git checkout -- bilan tikla. Commit qilma.
```

---

## 4. Keyinroq (prompt yozilmagan; tadqiqotda asoslangan)

- **Tannarx va mijoz narxi** — qatorda ikki narx va qator foydasi (101-app’da bor).
- **Narxlar katalogi** — smeta qatorlari uchun kategoriyalar va Excel import bilan.
- **Parametrik shablonlar** — masalan, «maydon × qatlam».
- **Kutilmagan xarajatlar zaxirasi** va uning sarfini kuzatish; **EVM** (CPI, SPI) obyekt kartasida.
- **Klassifikator va ESF:** materiallarni milliy klassifikator va IKPU kodlariga bog‘lash (01.07.2026 dan ESF’da umumiy kodlar cheklanmoqda); budjet qurilishi uchun maxsus ESF shakli (VMQ 330, 3-1-bob).
- **Tender resurslar reestri:** VMQ 46 3a-ilovasi shaklida eksport (S2 dagi resurslar yig‘masi asosida).
- **«Hajm usuli»** — PQ-165 da e’lon qilingan; ta’rif chiqqanda qayta ko‘rib chiqiladi.
