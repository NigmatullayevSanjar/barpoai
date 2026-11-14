# Smeta S1–S5 ni tekshirish — Claude Code uchun prompt (2026-11-08)

> **Nima uchun:** smetani to‘g‘rilash bosqichlari S1–S5 (`docs/SMETA_TUZATISH_PROMPTLARI.md`) avtomatik testlardan o‘tgan. Endi ular egasining kompyuterida, ishlab turgan stack’da, **egasining haqiqiy Excel fayllari** bilan ishlashini tekshirish va nuqsonlarni qayd etish kerak.
> **Qanday ishlatiladi:** `barpo-ai` papkasida yangi Claude Code sessiyasini oching, `/model claude-opus-5-5` ni tanlang va pastdagi matnni to‘liq nusxalang. Taxminiy vaqt — 2–3 soat. Natija — `docs/tests/` dagi hisobot fayli va chatdagi qisqa xulosa.
> **Kod tuzatilmaydi.** Bu sessiya faqat tekshiradi va yozadi; tuzatishni egasi alohida buyuradi.

```text
CLAUDE.md, docs/SMETA_TUZATISH_PROMPTLARI.md (1-bo‘lim: D35–D41 qarorlari va «Holat» qatori),
docs/backend/BARPO_BUSINESS_RULES.md (Form 5 bandi, «Smeta kodlari, bo‘lim, sarlavha va resurslar yig‘masi (S2)»,
«Smeta narxi zanjiri… (S3)», «Dalolatnoma F-2 va ma’lumotnoma F-3 (S4)», «Buyurtmachi materiallari hisoboti (S5)»),
docs/tests/CLAUDE_CODE_PULL_TEKSHIRUVI.md, docs/tests/S4_DALOLATNOMA_TEST_CASES.md,
docs/tests/S5_BUYURTMACHI_MATERIALLARI_TEST_CASES.md, docs/tests/FORM5_SMETALAR_TEKSHIRUV_2026_11_05.md va
docs/tests/SMETA_EXCEL_TEKSHIRUV_2026_11_02.md ni o‘qi.

MAQSAD
Smetani to‘g‘rilash bosqichlari S1–S5 (branch main-vxg6su: 62ecbbf — S1 «П» qatorlari, 9e00b54 — S2 kodlar,
bo‘lim, sarlavha, resurslar yig‘masi, 0b04562 — S3 smeta narxi zanjiri va «kim beradi», e3165ef — S4 dalolatnoma
F-2/F-3, undan keyin — S5 buyurtmachi materiallari hisoboti) egasining kompyuterida haqiqiy ma’lumot bilan to‘g‘ri
ishlashini isbotla. Har qadamning natijasini va topilgan nuqsonlarni hisobotga yoz.

QOIDALAR (buzilmaydi)
- Kod, migratsiya, test va hujjatlarni o‘zgartirma; commit va push qilma. Yagona yangi fayl — hisobot (pastda).
  Kritik nuqson (ma’lumot yo‘qolishi, boshqa kompaniya ma’lumoti ko‘rinishi, pul noto‘g‘ri hisoblanishi) topilsa —
  to‘xta va egaga chatda yoz.
- Haqiqiy fayllar (docs/Иш турлари.xlsx, docs/давальческие.xlsx va ularning _havolasiz nusxalari) faqat o‘qiladi va
  UI orqali QA kompaniyasiga yuklanadi. Ular repoga qo‘shilmaydi. Kompaniya nomlari, INN, hisob raqamlari,
  telefonlar va manzillar hisobotga, skrinshotlarga yoki skriptlarga yozilmaydi — o‘rniga «Bosh pudratchi»,
  «Subpudratchi», «Obyekt» deb yoz. Skrinshotdan oldin bu kataklar ko‘rinmasligiga ishonch hosil qil.
- docs.zip ga tegilmaydi.
- Test ma’lumoti faqat ro‘yxatdan o‘tish kaliti «QA-» bilan boshlanadigan kompaniyada yaratiladi; oxirida
  `npm run qa:cleanup -- <QA-kalit>` bilan o‘chiriladi. Lokal bazadagi haqiqiy kompaniyaga (SINOV-001) tegilmaydi.
- Parol va tokenlarni chatda egasidan so‘ra; faylga yozma.
- Docker suite’lardan (test:integration, test:roles, test:ui) bir vaqtda ko‘pi bilan ikkitasi ishlaydi. Fon
  jarayonining chiqish kodiga emas, logga qara.
- Suite’lar yozgan hisobot fayllarini NOMMA-NOM tikla:
  git checkout -- docs/backend/verification.json docs/backend/role-verification.json
  docs/backend/ui-verification.json docs/backend/BARPO_ROLE_TEST_REPORT.md docs/backend/platform-tenant-ui.png
  docs/backend/ui-failure-*.png (faqat git’dagilari; yangi ui-failure-*.png o‘chiriladi).
  docs/backend/ papkasini butunlay tiklama — u yerda BARPO_BUSINESS_RULES.md va API hujjatlari ham bor.

0. HOLAT (5 daqiqa)
- `git status`, `git log --oneline -8`, `git rev-list --left-right --count main-vxg6su...origin/main`.
  S5 commit qilinganmi? Qilinmagan bo‘lsa, ishchi daraxtdagi holatni tekshir va buni hisobotga yoz.
- Node, pnpm, Docker versiyalari; `backend/.env` bor (qiymatlarini chiqarma).

1. AVTOMATIK TEKSHIRUV (≈ 25 daqiqa) — CLAUDE_CODE_PULL_TEKSHIRUVI.md 1–2-bo‘limlari, yangilangan sonlar bilan
| ID | Buyruq | Kutilgan |
|---|---|---|
| A-01 | backend: npm run build | xatosiz |
| A-02 | backend: npm test | pass ≥ 41, fail 0 |
| A-03 | backend: npm run test:integration | "passed" ≥ 106, "failed": [] |
| A-04 | backend: npm run test:roles | 10 rol × ≥ 88 GET, findings [], unfillable [] |
| A-05 | backend: npm run test:ui | checks ≥ 66, «No uncaught React/browser errors» |
| A-06 | backend: npm run docs | git’da BARPO_API_OPENAPI.yaml va BARPO_DATABASE_SPEC.md o‘zgarmaydi (S5 commit qilingan bo‘lsa) |
| A-07 | frontend: pnpm typecheck, pnpm build | xatosiz |
| A-08 | hisobot fayllarini tiklash, docker ps -a | vaqtinchalik konteyner qolmagan |
Son kamaysa — bu nuqson (tekshiruv olib tashlangan); sababini yoz.

2. LOKAL STACK VA REGRESSIYA (≈ 15 daqiqa)
- backend: `docker compose up --build -d` (compose loyihasi «barpo»); `docker exec barpo-db-1 psql -U barpo_owner -d barpo`
  bilan 031 va 032 migratsiyalari qo‘llanganini tekshir (estimate_lines: norm_code, resource_code, section_name,
  supplied_by; estimates: basis, contract_amount, markup_mode, other_costs_percent, vat_percent …).
- frontend: `pnpm dev`.
- `npm run qa:smoke` — barcha qadamlar o‘tadi va o‘z QA kompaniyasini o‘chiradi (regressiya).

3. QA KOMPANIYASI (≈ 15 daqiqa)
- Platforma egasi orqali «QA-<sana>» kalitli kompaniya; xodimlar: admin, bosh muhandis, prorab, brigadir, ombor
  mudiri, buxgalter, finansist. Obyekt: buyurtmachi nomi soxta («Bosh pudratchi MChJ»), brigada foizi 20.
  Brigadir, prorab va ombor mudirini obyektga biriktir, brigadirga qo‘l hisobi och.

4. HAQIQIY FAYLLAR BILAN QO‘LDA TEKSHIRUV (brauzerda; ≈ 90 daqiqa)
S1 — «П» qatorlari (Иш турлари.xlsx — havolali asl fayl, D34 bo‘yicha qabul qilinadi; _havolasiz nusxa bilan ham)
| S1-01 | Form 5 importi, to‘plam varaqlari | qatorlar soni: Е11 18, Е22 653, Е23 411, Е27 972; preview’da «П» ogohlantirishi (jami 51 ta, bir nomdagilar guruhlangan) |
| S1-02 | «П» qatori smetada | miqdor 0, izohda «П — miqdor loyihadan», «Shifr» ustunida П… kodi, ishning kategoriyasi va zonasida |
| S1-03 | ОБЩЕЕ (4 124 qator) preview va commit | xatosiz; vaqtini o‘lcha va yoz (avval: preview 1,8 s, commit 3,1 s) |
S2 — kodlar, bo‘lim, sarlavha, resurslar yig‘masi
| S2-01 | Shifr ustuni | ish qatorida to‘liq norma shifri («… ДОП. 11 … № 429 …» qo‘shimchasi bilan), resursda resurs kodi |
| S2-02 | Bo‘lim filtri | bo‘lim tanlansa faqat uning qatorlari; jami serverdan (bo‘lim jami) |
| S2-03 | Sarlavha oynasi | asos, narx darajasi, shartnoma saqlanadi; reviziya raqami o‘zgarmaydi; prorab shartnoma summasini ko‘rmaydi |
| S2-04 | Resurslar yig‘masi (ОБЩЕЕ) | jami = smeta jami; mehnat, mashinalar (ОБЩЕЕ yakunida 154), materiallar (328) soni — farq bo‘lsa sababini yoz |
| S2-05 | Eksport → import | yangi smetada kodlar, bo‘lim va «Kim beradi» saqlanadi; jamlar bloki o‘tkaziladi |
S3 — smeta narxi zanjiri (давальческие.xlsx → `локалка`)
| S3-01 | Form 5 preview, Excel jamlar bloki | 12 qatorning hammasi zanjir qatoriga tushadi («ГЕНПОДРДЧИКА», «С У ЧЕТОМ», «C НДС» yozilishlari ham); taklif: boshqa xarajatlar 21 %, QQS 12 %, bosh pudratchi materiallari «Buyurtmachi» |
| S3-02 | Solishtiruv farqlari | MA’LUM farq (yangi nuqson emas, lekin sababini aniqlashga urin): to‘g‘ridan-to‘g‘ri −11 137,04 (ish haqi −11 137,26), mashinalar +0,01, materiallar +0,21; QQS bilan ≈ 311 656 546,85 (Excel 311 671 640) |
| S3-03 | «Smeta yakuni» kartasi | 21 % → chegirma → QQS 12 %; qatorlar jami (plan_total) o‘zgarmaydi |
| S3-04 | Nazorat misoli (qo‘lda smeta: ish haqi 1 000 000, mashina 200 000, pudratchi materiali 500 000, buyurtmachi materiali 300 000) | «Erkin» 21 % + QQS 12 % = 2 374 400,00; «VMQ 583» (20 + 7 %, 2,5 %) = 2 564 800,00 |
| S3-05 | VMQ 583 noto‘g‘ri foyda | saqlanmaydi (VMQ583_PRESET xabari) |
| S3-06 | Eski «(21 %)» xizmat qatori (qo‘lda smetada yarat) | ogohlantirish; tugma bilan yangi reviziyada sozlamaga o‘tadi; natija foizi tugmada oldindan ko‘rinadi |
S4 — dalolatnoma: S4_DALOLATNOMA_TEST_CASES.md (S4-01…S4-17) давальческие smetasida bajar; F-2 va F-3 Excel’ni
egasining `ф-2` va `ф3` varaqlari bilan ustunma-ustun solishtir (raqamlash 1 / 1.1, bo‘limlar, jamlar bloki,
16 ustun, shartnomaga nisbatan %).
S5 — buyurtmachi materiallari: S5_BUYURTMACHI_MATERIALLARI_TEST_CASES.md (S5-01…S5-15); давальческие `Накладной`
bo‘yicha kirim (nakladnoy narxida, invoyssiz), brigadirga berish, sarf; hisobotni egasining `отчёт` varag‘i bilan
solishtir (berilgan summasi ≈ 140 890 681,77).

5. ROLLAR BO‘YICHA (≈ 20 daqiqa)
Har rol (admin, bosh muhandis, prorab, brigadir, ombor mudiri, buxgalter, finansist) bilan: smeta sahifasi
(narxlar, «Smeta yakuni», sarlavha summasi), «Dalolatnoma» tugmasi (prorab, brigadir, omborchida yo‘q; API 403),
ombor sahifasidagi «Buyurtmachi materiallari» tabi (summa faqat narx huquqi bilan; omborchi va brigadirda smeta
ma’lumoti — ish bo‘yicha jadval, ish nomlari, shartnoma — yo‘q). Kutilgandan farq — nuqson.

6. CHEKKA HOLATLAR VA TEZLIK (≈ 15 daqiqa)
Dalolatnoma davri yildan o‘tsa (ACT_PERIOD_CROSSES_YEAR); shartnomasiz va QQSsiz smeta; reviziyada o‘chirilgan
qator fakti; aralash ta’minotli material; ОБЩЕЕ smetasi uchun resurslar yig‘masi, dalolatnoma va Excel vaqti
(5 s dan oshsa yoz).

7. TOZALASH
`npm run qa:cleanup -- <QA-kalit>`; `docker ps -a`; hisobot fayllari tiklangan; `git status` da faqat yangi
hisobot fayli (va skrinshotlar, agar olingan bo‘lsa).

NATIJA
docs/tests/SMETA_S1_S5_TEKSHIRUV_<YYYY_MM_DD>.md:
- boshida: sana, commit’lar, muhit, umumiy natija (o‘tdi / yiqildi / bo‘shliq soni);
- jadval: ID | Qadam | Kutilgan natija | Natija (o‘tdi / yiqildi / bo‘shliq) | Izoh;
- nuqsonlar: jiddiylik (kritik / yuqori / o‘rta / past), takrorlash qadamlari, dalil (skrinshot
  docs/tests/screenshots/ ga — haqiqiy nomlarsiz), taxminiy sabab (fayl:qator, agar topilsa);
- vaqt o‘lchovlari; egasiga savollar.
Chatga 5–10 qatorli xulosa yoz. Kodni tuzatma, commit qilma.

MODELLAR
- Hujjat va kod qidirish — Explore sub-agent (model: haiku).
- Brauzerdagi qo‘lda qadamlar — general-purpose sub-agent (model: sonnet), har bosqich (S1…S5, rollar) alohida,
  aniq kutilgan natijalar va «haqiqiy nomlarni yozma» qoidasi bilan; natijasini o‘zing tekshir.
- Excel shakllarini egasining varaqlari bilan solishtirish, farqlarning sababini topish va yakuniy hisobot — o‘zing.
```
