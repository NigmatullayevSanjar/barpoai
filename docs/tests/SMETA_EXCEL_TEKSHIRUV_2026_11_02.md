# Excel smetalar bilan platforma tekshiruvi — test case’lar va natijalar (2026-11-02/03)

> **Maqsad:** `docs/` dagi ikki haqiqiy Excel fayl — `Иш турлари.xlsx` va `давальческие.xlsx` — platformaga qanday tushishini va undan keyin har bir funksiya (smeta, ombor, vazifa, hisobot, akkord, qavat matritsasi, reviziya, moliya) shu ma’lumot bilan o‘z mantig‘i bo‘yicha to‘g‘ri ishlashini tekshirish.
> **Egasining tanlovi (2026-11-02):** (1) avval asl fayllar o‘zgartirishsiz, keyin platforma formatiga moslangan nusxalar; (2) `Иш турлари` da narx yo‘q — resurs kodi `локалка` da bo‘lsa o‘sha narx, bo‘lmasa belgilangan test narx (soat 36 929,94 / texnika 100 000 / t 10 000 000 / m3 700 000 / m2 30 000 / m 20 000 / kg 10 000 / dona 50 000); (3) давальческие materiallar — omborga kirim, to‘lovsiz.
> **Usul:** lokal stack (`main` 33bbec1, migratsiya 027), alohida `QA-202611021851-SMETA` kompaniyasi, 6 rol (admin, bosh muhandis, prorab, brigadir, omborchi, buxgalter). Har case kutilgan natijasi kod va `docs/backend/BARPO_BUSINESS_RULES.md` dan; summalar skriptda mustaqil hisoblandi (decimal, server formulasi bilan) va API javobi bilan solishtirildi. B bo‘limi brauzerda (Playwright, Chrome). Yakunda QA kompaniyasi barcha ma’lumotlari bilan `npm run qa:cleanup` orqali o‘chirildi.
> **Moslash qanday qilindi:** Form 5 (ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ) qatorlari platforma eksport ustunlariga o‘tkazildi: ish qatori (masalan, `Е0804-003-01 КЛАДКА …`) — «Ish haqi» turi, narxi 0, birligi «100 М2» → m2 ×100; uning resurslari — alohida qatorlar, `norma × ish hajmi` bilan (ЧЕЛ.-Ч → mehnat/soat, МАШ.-Ч → texnika/soat, qolgani material); bosh pudratchi materiallari (`pcpc…` kodli qatorlar) — miqdori to‘g‘ridan-to‘g‘ri; kategoriya = «kod + ish nomi»; `локалка` bo‘limlari (1–6-qavat, −1-qavat, sokol) — qavat zonalari. Konvertor va barcha skriptlar repoga kiritilmadi.
> **Belgilar:** ✅ o‘tdi · ❌ yiqildi (platformada tuzatish kerak yoki qoida real smetada noto‘g‘ri natija beradi) · ⚠️ bo‘shliq (bu Excel shakli yoki tushuncha platformada yo‘q; kod qoidaga mos).

## Xulosa

| Yo‘nalish | Jami | ✅ O‘tdi | ❌ Yiqildi | ⚠️ Bo‘shliq |
|---|---|---|---|---|
| A. Asl fayllar o‘zgartirishsiz import oynasida (API) | 5 | 2 | 0 | 3 |
| B. Import oynasi brauzerda (Playwright) | 9 | 3 | 4 | 2 |
| C. Локалка (давальческие.xlsx) — moslangan import | 9 | 8 | 1 | 0 |
| D. Давальческие materiallar: kirim (to‘lovsiz) → brigada → sarf | 6 | 4 | 0 | 2 |
| E. Ish: vazifa → hisobot → qabul → akkord → qavat matritsasi | 6 | 6 | 0 | 0 |
| F. Smeta reviziyasi (21% boshqa xarajatlar qatori) | 4 | 3 | 1 | 0 |
| G. Moliya: tushum, ish haqi davri, obyekt kartasi | 4 | 4 | 0 | 0 |
| H. Иш турлари.xlsx — har varaq alohida smeta | 25 | 22 | 2 | 1 |
| **Jami** | **68** | **52** | **8** | **8** |

Moslangan nusxalar bilan platformaning hisob mantig‘i to‘g‘ri ishladi. `локалка` jami (346 409 467,73), turlar bo‘yicha jamlar, qavatlar jami, kirim/sarf qiymati, akkord stavkasi, ish haqi, tushum va obyekt moliya kartasi mustaqil hisob bilan tiyinigacha bir xil chiqdi. `Иш турлари` ning 19 varag‘idan 17 tasi birinchi urinishda import bo‘ldi, 2 tasi birlik to‘qnashuvi tuzatilgach o‘tdi. Asl fayllarning birortasi esa import oynasidan o‘tmadi (A, B bo‘limlari).

## Topilmalar

> **Holat (2026-11-03):** 1–7-bandlar tuzatildi. 4-band (2 MB dan katta fayl) D25 bilan yopildi: smeta fayli 10 MB gacha, brauzer kattasini yubormay aniq xabar beradi. 8–10-bandlar egasi qarorlari D26–D28 bilan amalga oshirildi (ish identifikatori, faktning reviziyada saqlanishi, matritsada ish kodi). Form 5 import rejimi — D29, loyiha `docs/FORM5_IMPORT_LOYIHA.md`. Integratsion testga tegishli tekshiruvlar qo‘shildi.

### Platformadagi nuqsonlar

1. **Smeta sahifasida jami summalar noto‘g‘ri ustunda (UI-08).** Narx ko‘rinadigan rolda bo‘lim jami va umumiy «Jami» summasi «Jami» ustuni ostida emas, bir ustun chapda — «Brigada stavkasi» ostida turadi. V-C da stavka ustuni qo‘shilganda `colSpan` yangilanmagan (`frontend/src/features/estimates/EstimateDetailPage.tsx:278, :393, :442, :446`). Barcha smetalarda ko‘rinadi.
2. **Kategoriya bo‘laklari va noto‘g‘ri bo‘lim jami (UI-09).** Bir xil ish bir necha qavatda takrorlansa, kategoriya bir necha bo‘lakka bo‘linadi va har bo‘lak ostida butun kategoriya jami chiqadi: «Е4604-001-05 … jami: 53 065 367,92» 6 marta, bo‘lakdagi qatorlar yig‘indisi esa 5 089 809,42. Bundan tashqari React konsolida 39 ta kalit xatosi chiqadi va bitta guruhni yig‘ish shu nomli hamma guruhni yig‘adi.
3. **Platformaning o‘z Excel eksporti qayta importga qaytmaydi (LK-07).** Eksportdagi «JAMI» qatori importda smeta qatori deb o‘qiladi (`lines[640]`: turi, birligi, miqdori yo‘q) → 400. Tuzatish: importda turi, birligi va miqdori bo‘sh «JAMI» qatorini o‘tkazib yuborish yoki eksportdagi jami qatorini importga xalaqit bermaydigan qilish.
4. **2 MB dan katta fayl uchun umumiy xabar (UI-01).** 2,6 MB fayl uchun «Kiritilgan ma’lumot noto‘g‘ri.» chiqadi. Sabab: so‘rov tanasidagi base64 uzunligi chegarasi (2 800 000 belgi) fayl tekshiruvidan oldin ishlaydi. To‘g‘ri xabar («… 2 MB dan katta») faqat 2,0–2,05 MB fayllarda chiqadi. Tuzatish: brauzerda hajmni oldindan tekshirish va shu matnni ko‘rsatish.
5. **Tekshirish xatosi texnik inglizcha matn bilan (UI-03).** Masalan: «Kiritilgan ma’lumot noto‘g‘ri. (lines.0.quantity: Invalid string: must match pattern …)». Qator raqami Excel qator raqami emas, 0 dan sanaladi. Kerakli ko‘rinish: «N-qator: miqdor son bo‘lishi kerak».
6. **Birlik to‘qnashuvida qator va material ko‘rsatilmaydi (NR-04, NR-11).** `UNIT_CONVERSION_REQUIRED` 605 yoki 968 qatorli faylda qaysi material va qaysi qator ekanini aytmaydi. Material nomi bilan topilmagan nomlar uchun `IMPORT_NAMES_UNRESOLVED` qator raqamini beradi, bu xato esa bermaydi.
7. Kichik: avtomatik ustun moslash «Birlik» ni «ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ» ustuniga qo‘ydi, chunki `/ед/` qidiruvi «вЕДомость» ichida topiladi (UI-04). Birlik «hour» sahifada tarjimasiz ko‘rinadi (UI-05).

### Egasi qarori kerak (kod qoidaga mos, lekin haqiqiy smetada noto‘g‘ri natija)

8. **Reviziyada vazifa boshqa ishga o‘tib ketadi (RV-03).** Qoida (V-A): «turi, nomi, birligi, zonasi, materiali bir xil; bir nechta bo‘lsa — position bo‘yicha birinchisi». Form 5 smetada bir qavatda bir nechta «ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ» qatori bor (1-qavatda 6 ta). Natijada armirovanie mehnatiga bog‘langan vazifa reviziyadan keyin demontaj mehnatiga o‘tib ketdi. Taklif: moslikka kategoriyani ham qo‘shish (va bir xil bo‘lsa eski pozitsiyaga eng yaqinini olish).
9. **Har qanday reviziya reja–faktni nolga tushiradi (RV-04).** Faqat bitta «21% boshqa xarajatlar» qatori qo‘shildi. Shundan keyin smeta kartasida bajarilgan hajm 0 ga, material fakt qiymati 0 ga, obyekt progressi esa 0,8 % dan 0,0 % ga tushdi. Qavat matritsasi faktni saqlaydi, chunki u nom bo‘yicha hisoblaydi. Qoida «faktni avtomatik ko‘chirish yo‘q» deydi, lekin smeta tez-tez o‘zgarsa reja–fakt ishlatib bo‘lmaydi. Taklif: vazifalar qanday ko‘chirilsa, faktni ham shunday ko‘chirish.
10. **Qavat matritsasi bir xil nomli resurslarni qo‘shib yuboradi (WK-04).** Matritsa satri = nom + birlik. 1-qavatdagi 6 xil ishning «ЗАТРАТЫ ТРУДА» qatorlari bitta satrga qo‘shildi: reja 234,33 soat, fakt 53,71 (22,9 %), qaysi ishniki ekani ko‘rinmaydi. Ish qatorlari esa (masalan, «КЛАДКА … 100 ММ» 188/188) to‘g‘ri chiqdi.
11. **Akkord stavkasi Form 5 tuzilishiga mos emas.** Import ustunlarida brigada stavkasi (`labor_rate`) yo‘q. Ish qatorining narxi 0, chunki narx resurslarda, shuning uchun obyekt foizi bo‘yicha stavka ham 0 chiqadi (WK-03: kladka 188 m2 × 0,00). Akkord faqat «ЗАТРАТЫ ТРУДА» qatoriga soatlab yozilganda ishladi (20 % × 36 929,94 = 7 385,99 so‘m/soat). Ish qatorlariga stavka qo‘yish kerak bo‘lsa, import xaritasiga stavka ustuni kerak.

### Format bo‘shliqlari — Form 5 ресурсная ведомость platformaga to‘g‘ridan-to‘g‘ri tushmaydi

- **Fayl:** faqat 1-varaq o‘qiladi, varaq tanlash yo‘q (`Иш турлари` — 24 varaq, `давальческие` — smeta 5-varaqda); fayl hajmi 2 MB gacha (`Иш турлари` 2,6 MB); boshqa fayllarga tashqi havolasi bor fayl xavfsizlik qoidasi bo‘yicha rad etiladi (`давальческие`: `externalLink1–2`).
- **Sarlavha:** birinchi «faqat matnli» qator sarlavha deb olinadi. Natijada «УТВЕРЖДАЮ / СОГЛАСОВАНО» (2-qator) yoki «ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ № / 7-1» (5-qator) sarlavha bo‘lib qoladi. Haqiqiy sarlavha 2 qatorli va birlashtirilgan (12–13 yoki 15–16-qator).
- **Formulalar:** `локалка` dagi miqdor, narx va summa formulalar bilan hisoblangan, import esa formulali katakni rad etadi. Formula natijasini o‘qish varianti yo‘q.
- **Tuzilma:** «ish → resurslar» ierarxiyasi yo‘q: ish va resurslar alohida qatorlarga, umumiy kategoriya bilan yoziladi. `Иш турлари` da narx umuman yo‘q, narx esa majburiy maydon.
- **Birliklar:** ЧЕЛ.-Ч, МАШ.-Ч, «100 М2», «100М ОГРАД», «1000 ШТ», «1 КМ …» to‘g‘ridan-to‘g‘ri tanilmaydi (konvertor soat va ×100/×1000 ga o‘tkazdi); Л (litr), СЕКЦИЯ, КОТЕЛ, ЦИКЛ, 1 КОНЕЦ platformada umuman yo‘q (dona ga tushirildi, NR-23). Bir material bir normada t, boshqasida kg — `t↔kg` jadvali bor, lekin import uni qo‘llamaydi (NR-04/NR-11).
- **Давальческие va hisob-faktura:** «bosh pudratchi materiali» tushunchasi yo‘q. Kirim to‘lovsiz omborga tushadi (fakt 0, qarz 0, DV-03), sarflanganda xarajat bo‘ladi (DV-06). `локалка` dagi «ВОЗВРАТ материалов генподрядчика» (−140,9 mln), 21 % boshqa xarajatlar va QQS 12 % platformada hisoblanmaydi. QQS biznes qoidada ataylab kiritilmagan. 21 % ni qo‘lda «xizmat» qatori qilib qo‘shish mumkin (RV-01).
- **Material nomlari:** nakladnoydagi «Сетка сварная … (100*100)» va `локалка` dagi «… (100*100) ( 1 м2 2,8 кг)» ikki xil material bo‘lib qoldi. Shu sababli Сетка sarfi smeta qatoriga bog‘lanmadi: 5 727 336,25 so‘m smeta faktiga tushmadi (DV-01, DV-06). Nom moslash (alias) yo‘q.

**Taklif (egasi qaroriga):** Form 5 uchun alohida import rejimi. Unda varaq va sarlavha qatorini tanlash, formula natijasini o‘qish, ЧЕЛ.-Ч/МАШ.-Ч va «100 М2» kabi birliklar lug‘ati, ish qatorini ish, resurs qatorini norma bilan resurs qilib yozish bo‘ladi. Yoki: konvertorni (shu tekshiruvda yozilgan) platforma ichiga «Form 5 → BARPO» o‘tkazgich sifatida qo‘shish.

### Manba Excel fayllardagi xatolar (platformaga aloqasi yo‘q, egasiga ma’lumot uchun)

- **`давальческие.xlsx`, «локалка», 361-qator:** `F361 = E361*$E$328` — armirovanie (30-ish) mehnati boshqa ishning hajmi (328-qator) bilan hisoblangan, to‘g‘risi `$E$360`. Natijada 11 148,73 so‘m ortiqcha; ф-2, ф3 va ДАЛОЛАТНОМА jamlariga ham shu ortiqcha qiymat o‘tgan.
- **«локалка», 7-bo‘lim (−1-qavat), 158- va 170-qator:** ishchi mehnati narxi 3 200 so‘m/soat (`G158 = G100` — texnika narxiga havola), boshqa bo‘limlarda esa 36 929,94. Agar xato bo‘lsa, 191,84 soat uchun taxminan 6 470 730 so‘m kam hisoblangan (shubhali, tekshirish kerak).
- **«локалка», 282-qator:** bosh pudratchi materiali (Блоки D500 H150, 5,55 m3, 3 716 517,86 so‘m) birligi yozilmagan.
- **«локалка», 187-qator:** summa formulasiga qo‘lda +0,09 qo‘shilgan (`=E187*G187+0.09`).
- **«локалка»:** 39 ta bosh pudratchi material qatorida narx yo‘q, Excel ularni 0 deb hisoblaydi (masalan, −1-qavat: 30 m3 blok, 632 kg kley).
- **`Иш турлари.xlsx`:** bitta material turli normalarda turli birlikda (БОЛТЫ СТРОИТЕЛЬНЫЕ … — t va kg; РАСТВОРИТЕЛЬ, ХОЛОДНЫЙ ПЛАСТИК, СТЕКЛОШАРИКИ — t va kg). Е15 §104.1 da F ustuni 4 kasrga yaxlitlangan.

## A. Asl fayllar o‘zgartirishsiz import oynasida (API)

| ID | Qadam | Kutilgan natija | Natija |
|---|---|---|---|
| AS-01 | Иш турлари.xlsx (asl, 2,6 MB) — inspeksiya | Fayl 2 MB chegarasidan katta: tushunarli 400 xato (fayl hajmi) | ✅ 400 VALIDATION_ERROR («Too big: <=2800000 characters») — hajm chegarasi ishlaydi, lekin xabar umumiy (UI-01 ga qarang). |
| AS-02 | давальческие.xlsx (asl) — inspeksiya | Smeta varag‘i (локалка) topilishi kerak; import faqat 1-varaqni o‘qiydi — natija qayd etiladi | ⚠️ 400 UNSAFE_WORKBOOK: faylda boshqa Excel fayllarga tashqi havolalar bor (xl/externalLinks/externalLink1–2.xml) — xavfsizlik qoidasi bo‘yicha rad. Havolalar bo‘lmasa ham 1-varaq (Накладная) o‘qilar edi. |
| AS-03 | Иш турлари, Е4 varag‘i alohida faylda (o‘zgartirishsiz) — inspeksiya va preview | Sarlavha qatori (12/15-qator: «Наименование работ и затрат», «Единица измерения», «Количество») aniqlanib, nom/birlik/miqdor/narx moslanishi kerak | ⚠️ Sarlavha 5-qatordan olindi: «ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ №», «7-1» (haqiqiy sarlavha 12–13-qator, birlashtirilgan). Preview: 400 MAPPING_HEADER_NOT_FOUND. Narx ustuni umuman yo‘q. |
| AS-04 | давальческие, локалка varag‘i alohida faylda (o‘zgartirishsiz) — inspeksiya va preview | Sarlavha qatori (12/15-qator: «Наименование работ и затрат», «Единица измерения», «Количество») aniqlanib, nom/birlik/miqdor/narx moslanishi kerak | ⚠️ Sarlavha 2-qatordan olindi: «"УТВЕРЖДАЮ":», «"СОГЛАСОВАНО"» (haqiqiy sarlavha 15–16-qator). Preview: 400 MAPPING_HEADER_NOT_FOUND. Miqdor va narx ustunlari formulali. |
| AS-05 | ОБЩЕЕ varag‘i (moslangan, 4 124 qator) — preview | Qator chegarasi (2 001 qator) ishlaydi: 400 WORKBOOK_LIMIT | ✅ 400 WORKBOOK_LIMIT — chegara ishlaydi. |

## B. Import oynasi brauzerda (Playwright)

| ID | Qadam | Kutilgan natija | Natija |
|---|---|---|---|
| UI-01 | Asl «Иш турлари.xlsx» (2,6 MB, 24 varaq) yuklash | Fayl 2 MB dan katta ekani aniq aytiladi | ❌ 1-qadamda qizil xabar: «Kiritilgan ma’lumot noto‘g‘ri.» — hajm va 2 MB chegara aytilmaydi. To‘g‘ri matn «Fayl XLSX formatida emas yoki 2 MB dan katta.» faqat 2,0–2,05 MB oralig‘idagi fayllarda chiqadi; brauzerda hajm tekshiruvi yo‘q. |
| UI-02 | Asl «давальческие.xlsx» yuklash (1-varaq — Накладная, smeta — «локалка») | Smeta varag‘ini tanlash mumkin yoki nima qilish kerakligi aniq aytiladi | ⚠️ «Faylda makros yoki tashqi havolalar bor; bunday fayl qabul qilinmaydi.» — sabab to‘g‘ri, lekin qanday tuzatish aytilmaydi; varaq tanlash yo‘q. |
| UI-03 | «локалка» varag‘i alohida faylda (formulali) — moslash va tekshirish | Formulalar rad etilgani tushunarli o‘zbekcha matn bilan aytiladi | ❌ «657 ta qator topildi · Sarlavha 2-qatorda topildi»; faqat 2 ustun taklif qilinadi. Tekshirishda: «Kiritilgan ma’lumot noto‘g‘ri. (lines.0.quantity: Invalid string: must match pattern /^(0\|[1-9]\d{0,17})(\.\d{1,6})?$/)» — inglizcha texnik matn, qator raqami Excel raqami emas (0 dan). |
| UI-04 | «Е4» varag‘i alohida faylda (Form 5, narxsiz) — moslash va tekshirish | Sarlavha/narx yo‘qligi tushunarli xabar bilan aytiladi | ⚠️ «162 ta qator topildi · Sarlavha 5-qatorda topildi»; avtomatik moslash «Birlik» ni nom ustuniga qo‘ydi (/ед/ «вЕДомость» ga mos keldi); preview xabari UI-03 dagidek texnik. |
| UI-05 | Moslangan «lokalka-barpo.xlsx» (640 qator): moslash, tekshirish, saqlash | Preview jami 346 409 467,73; saqlanadi; sahifada 640 qator va shu jami | ✅ «Tekshiruv o‘tdi: 640 ta qator, jami 346 409 467,73 so‘m», «… 0 ta material va 8 ta zona avtomatik yaratildi», «Smeta import qilindi». Sahifada 640 qator, «Yakuniy jami 346 409 467,73 so‘m»; turlar bo‘yicha jamlar to‘g‘ri. Birlik «hour» tarjimasiz ko‘rinadi (kosmetik). Jadvaldagi nuqsonlar — UI-08, UI-09. |
| UI-06 | Prorab import qilingan smetani ochadi | Narx/jami ustunlari va summalar ko‘rinmaydi | ✅ «Narxlar sizning rolingiz uchun yashirin»; narx/jami ustunlari va summalar yo‘q; prorab eksporti 13 ustun, narxsiz. |
| UI-07 | Moslangan «norm-ОБЩЕЕ.xlsx» (4 124 qator) yuklash | Qator chegarasi haqida aniq xabar | ✅ «Fayl 2000 qator yoki 50 ustundan oshmasligi kerak.» |
| UI-08 | Smeta sahifasi: jami summalar ustuni (narx ko‘rinadigan rol) | Bo‘lim jami va umumiy «Jami» summasi jadvaldagi «Jami» ustuni ostida turadi | ❌ Bo‘lim jami va «Jami 346 409 467,73» bir ustun chapda, «Brigada stavkasi» ostida (skrinshot ui-UI-05-grand-total.png). Sabab: 13 ustunli jadvalda colSpan={8} (EstimateDetailPage.tsx:393, :442) va colSpan 12 (:278) — V-C da stavka ustuni qo‘shilganda yangilanmagan. |
| UI-09 | Smeta sahifasi: kategoriya guruhlari | Har kategoriya bir marta, o‘z qatorlari va o‘z jami bilan; yig‘ish faqat shu guruhni yig‘adi | ❌ Guruh — ketma-ket kelgan bir xil kategoriya (EstimateDetailPage.tsx:280-286). Ish har qavatda takrorlangani uchun 10 kategoriya 49 bo‘lakka bo‘lingan; har bo‘lak ostida butun kategoriya jami: «Е4604-001-05 … jami: 53 065 367,92» 6 marta, bo‘lakdagi qatorlar esa 5 089 809,42. React key = kategoriya nomi → konsolda 39 xato; bitta guruhni yig‘ish shu nomli hamma guruhni yig‘adi. |

## C. Локалка (давальческие.xlsx) — moslangan import

| ID | Qadam | Kutilgan natija | Natija |
|---|---|---|---|
| LK-01 | Moslangan локалка — inspeksiya | Sarlavhalar = platforma eksport ustunlari, 640 qator | ✅ 11 sarlavha, 640 qator. |
| LK-02 | Preview: jami serverda | Jami 346409467.73 (har qator round2(round6(norma×hajm)×narx), mustaqil hisob), 640 qator | ✅ Jami 346 409 467.73, 640 qator; 39 material avtomatik yaratildi, zonalar oldindan ochilgan qavatlarga bog‘landi (0 yangi). |
| LK-03 | Commit va smeta kartasi | Smeta yaratiladi; totals.total=346409467.73; turlar: {"labor":"190650309.38","equipment":"14868476.37","material":"140890681.98"} | ✅ Jami 346 409 467.73; ish 190 650 309.38, texnika 14 868 476.37, material 140 890 681.98 — mustaqil hisob bilan tiyinigacha bir xil; reviziya 1. |
| LK-04 | Excel (локалка) jamlari bilan solishtirish | Platforma jami Excel H680 (346420604.77) dan faqat manba xatosi (361-qator: F361=E361×$E$328, to‘g‘risi $E$360) va narxni 2 kasrga yaxlitlash farqicha farq qiladi | ✅ Platforma 346 409 467.73, Excel H680 346 420 604.77, farq −11 137.04 = 361-qator formulasi xatosi −11 148.73 + narxni 2 kasrga yaxlitlash +11.69. Material 140 890 681.98 vs Excel 140 890 681.77 (+0.21: 669 642.857→.86 va H187 dagi qo‘lda +0.09). |
| LK-05 | Qavatlar bo‘yicha jamlar (by_zone) | 8 qavat zonasi; zonalar jami = smeta jami | ✅ 8 qavat: 5-qavat 147 111 754.94; 4-qavat 46 994 589.70; −1-qavat 44 483 738.30; 6-qavat 32 570 737.91; 1-qavat 24 680 439.10; 2- va 3-qavat 24 479 484.04; Sokol 1 609 239.70 — yig‘indi = jami. |
| LK-06 | Prorab smetani ko‘radi — narxsiz | unit_price, total va totals.total kelmaydi (D20) | ✅ Narx va summalar kesilgan, hajmlar ko‘rinadi. |
| LK-07 | Excel eksport va qayta import (round-trip) | Eksportda 640 qator + JAMI; eksport fayli platformaning o‘ziga qayta yuklanganda xuddi shu jami chiqadi | ❌ Eksport: 640 qator + «JAMI» qatori. Shu faylni qayta import qilish: 400 VALIDATION_ERROR — lines[640] (JAMI qatori) da turi, birligi, miqdori yo‘q. Platformaning o‘z eksporti importga qaytmaydi. |
| LK-08 | Vazifaga bog‘lash tanlovi: norma kodi bo‘yicha qidiruv | GET /v1/estimate-lines?q=Е0804-003-01 — shu kodli ish va resurs qatorlari topiladi | ✅ 99 qator topildi (Е0804-003-01 ishi va resurslari, hamma qavatlarda). |
| LK-09 | Prorab eksporti — narx ustunlarisiz | Eksport faylida «Birlik narxi» va «Jami» ustunlari yo‘q | ✅ Ustunlar: №, Turi, Kategoriya, Nomi, Material, Zona, Birlik, Miqdor, Norma, Ish hajmi, Yo‘qotish %, Hisobiy miqdor, Izoh — narx yo‘q. |

## D. Давальческие materiallar: kirim (to‘lovsiz) → brigada → sarf

| ID | Qadam | Kutilgan natija | Natija |
|---|---|---|---|
| DV-01 | Nakladnoy materiallari smeta materiallari bilan bir xilmi | Nakladnoydagi 7 xil material smeta importida yaratilgan materiallar bilan nomi va birligi bo‘yicha mos keladi (sarfni smeta qatoriga bog‘lash shu bilan ishlaydi) | ⚠️ 7 materialdan 6 tasi nomi bo‘yicha mos. «Сетка сварная … (100*100)» nakladnoyda shunday, локалка'da «… (100*100) ( 1 м2 2,8 кг)» — platforma ularni ikki xil material deb biladi; omborchi alohida material yaratdi. |
| DV-02 | Kirim: 14 qator (bosh pudratchi, to‘lovsiz) | Ombor qoldig‘i = nakladnoy miqdorlari; qiymat Σround2(miqdor×narx) = 140890681.97 (nakladnoy jami 140890681.77) | ✅ 14 kirim; qiymat 140 890 681.97 (nakladnoy 140 890 681.77, +0.20 narxni 2 kasrga yaxlitlashdan). Omborchi kirim ro‘yxatida narx va qiymatni ko‘rmaydi (narx huquqi yo‘q). Izoh: birinchi urinishda test skriptida qiymat noto‘g‘ri maydondan o‘qilgan — qayta tekshirildi. |
| DV-03 | Kirimdan keyin obyekt moliya kartasi | To‘lovsiz kirim: xarajat (fakt) 0, to‘langan 0, qarz 0 — material omborda, hisob-faktura yo‘q | ✅ fakt 0.00, to‘langan 0.00, qarz 0.00 — kirim xarajat ham, qarz ham emas (hisob-faktura kutilmoqda holati). |
| DV-04 | Brigadirga jo‘natish va qabul | Barcha qoldiq brigadir hisobiga o‘tadi; ombor qoldig‘i 0 | ✅ 7 material jo‘natildi, brigadir qabul qildi, ombor qoldig‘i 0. |
| DV-05 | Sarf smeta qatorlariga bog‘lab (отчёт: hammasi ishlatilgan) | Har material smetadagi o‘z qatorlariga reja miqdoricha, qoldiq oxirgi qatorga yoziladi; brigadir o‘z sarfini tasdiqlay olmaydi (403); prorab tasdiqlaydi | ✅ 32 sarf (31 tasi smeta qatoriga bog‘langan, Сетка — qatorsiz); brigadir o‘z sarfini tasdiqlay olmadi (403), prorab tasdiqladi. Reja vs olingan: Клей 4 623.56/3 991.56 kg, Блоки H150 169.68/139.68 m3, Уголок 2.4/0.17 t, Грунтовка 93.84/22.08 kg. |
| DV-06 | Sarfdan keyin: fakt xarajat va reja–fakt | Dashboard actual_cost = kirim qiymati 140890681.97 (hammasi sarflandi); smeta material fakti = sarf qiymati; brigadir qoldig‘i 0 | ⚠️ Dashboard actual_cost 140 890 681.97 (= kirim qiymati, hammasi sarflandi), brigadir qoldig‘i 0. Smetadagi material fakti 135 163 345.72 — 5 727 336.25 farq Сетка sarfi, chunki u nom farqi sababli smeta qatoriga bog‘lanmadi. |

## E. Ish: vazifa → hisobot → qabul → akkord → qavat matritsasi

| ID | Qadam | Kutilgan natija | Natija |
|---|---|---|---|
| WK-01 | Vazifalar smeta qatorlariga bog‘lab (V-A) | 4 vazifa: kladka va armirovanie ishlari (1-qavat), ularning «Затраты труда» resurs qatorlari; kartada smeta qatori nomi, birligi, reja hajmi | ✅ 4 vazifa; kartada «КЛАДКА ПЕРЕГОРОДОК … 100 ММ», m2, reja 188, tur labor. |
| WK-02 | Vazifa holatlari: brigadir boshlaydi va topshiradi, prorab qabul qiladi | todo → in_progress → submitted → accepted | ✅ accepted. |
| WK-03 | Kunlik hisobotlar → qabul → stavka qotiriladi (V-C) | Ish qatorlari (narx 0) stavkasi 0.00; «Затраты труда» qatori: 20% × 36929.94 = 7385.99 so‘m/soat, summa = round2(soat × stavka) | ✅ Kladka 188 × 0.00 = 0.00; armirovanie mehnati 3.714184 × 7 385.99 = 27 432.93; demontaj 7.75 × 0.00 = 0.00; demontaj mehnati 50 × 7 385.99 = 369 299.50; jami 396 732.43. |
| WK-04 | Qavat × ish matritsasi (V-E) | 8 qavat; 1-qavatda kladka: reja 188 / fakt 188 / 100.0%; resurs qatorlari bir xil nom («ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ») bilan qanday guruhlanishi qayd etiladi | ✅ 8 qavat; kladka 1-qavat: 188/188 (100.0%). «ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ / hour» 1-qavatda bitta qator: 6 xil ishning mehnati qo‘shilib reja 234.328569, fakt 53.714184 (22.9%) — qaysi ishniki ekani ko‘rinmaydi. |
| WK-05 | Smeta kartasida reja–fakt (ish qatorlari) | Kladka qatori fakt 188; armirovanie mehnati fakt = reja; demontaj 7.75 | ✅ Kladka 188, demontaj 7.75, armirovanie mehnati 3.714184, demontaj mehnati 50. |
| WK-06 | Brigadir daromadi (V-C) | /v1/me/earnings: ishlangan = Σ hisobot summalari | ✅ earned 396 732.43 = hisobotlar yig‘indisi. |

## F. Smeta reviziyasi (21% boshqa xarajatlar qatori)

| ID | Qadam | Kutilgan natija | Natija |
|---|---|---|---|
| RV-01 | Reviziya 2: «Прочие затраты субподрядчика 21%» qatori qo‘shiladi | Reviziya 2; jami 346409467.73 + 72745988.22 = 419155455.95 (Excel H688 419168931.77) | ✅ Reviziya 2, 641 qator, jami 419 155 455.95 (Excel H688 419 168 931.77, farq −13 475.82 = 361-qator xatosi ×1.21 va yaxlitlash). |
| RV-02 | Reviziyalar tarixi | 2 ta reviziya, har biri o‘z jami va qatorlar soni bilan | ✅ rev2: 641 qator, 419 155 455.95; rev1: 640 qator, 346 409 467.73. |
| RV-03 | Vazifalar yangi reviziyadagi «o‘sha» qatorga o‘tadimi (V-A) | Har vazifa yangi reviziyada xuddi shu ish/resurs qatoriga (bir xil § va pozitsiya) o‘tadi | ❌ Kladka, armirovanie, demontaj mehnati — to‘g‘ri qatorga o‘tdi. Armirovanie mehnati (§14.1, poz. 164) vazifasi demontaj mehnatiga (§1.1, poz. 1) o‘tib ketdi: 1-qavatda nomi, birligi, zonasi bir xil 6 qator bor, qoida «position bo‘yicha birinchisi» (BUSINESS_RULES, V-A). |
| RV-04 | Reviziyadan keyin reja–fakt | Biznes qoidasi: fakt eski qatorda qoladi (avtomatik ko‘chirish yo‘q) — yangi qatorlarda fakt 0; qavat matritsasi nom bo‘yicha faktni saqlaydi; natija qayd etiladi | ✅ Yangi reviziyada kladka fakti 0, material fakt qiymati 0.00; obyekt progress_percent 0.8 → 0.0. Qavat matritsasi faktni saqlaydi (188/188). Qoidaga mos («avtomatik ko‘chirish yo‘q»), lekin bitta qator qo‘shilsa butun reja–fakt nolga tushadi. |

## G. Moliya: tushum, ish haqi davri, obyekt kartasi

| ID | Qadam | Kutilgan natija | Natija |
|---|---|---|---|
| FN-01 | Buyurtmachidan tushum (далолатнома, QQS bilan) | Tushum 311 671 640.00 → kartada income 311671640.00 (QQS platformada alohida yuritilmaydi) | ✅ income 311 671 640.00. |
| FN-02 | Ish haqi davri: akkord avtomatik | piece_pending (brigadir) = Σ qabul qilingan hisobot summalari | ✅ piece_pending: QA Brigadir 396 732.43. |
| FN-03 | Davrni yopish va to‘lash | Admin yopadi → piece_rate = akkord; to‘lov kassadan; brigadir balansi 0 | ✅ piece_rate 396 732.43, to‘landi 396 732.43, brigadir balansi 0.00. |
| FN-04 | Obyekt moliya kartasi (V-D) | Reja = reviziya 2 jami 419155455.95; fakt = material sarfi 140890681.97 + akkord; to‘langan = akkord to‘lovi; qarz 0; fakt % = round1(100×fakt/reja) | ✅ Reja 419 155 455.95, fakt 141 287 414.40 (= 140 890 681.97 material + 396 732.43 akkord), to‘langan 396 732.43, qarz 0.00, fakt 33.7%, tushum 311 671 640.00, progress 0.0% (RV-04 sababli). |

## H. Иш турлари.xlsx — har varaq alohida smeta

| ID | Qadam | Kutilgan natija | Natija |
|---|---|---|---|
| NR-01 | «Е4» varag‘i (160 qator: 16 ish, 144 resurs) | Import o‘tadi; jami 1050982.07 (narx: 16 qator локалка kodidan, 128 test narx) | ✅ 1 050 982.07, 160 qator, 6 yangi material. |
| NR-02 | «Е5» varag‘i (171 qator: 12 ish, 159 resurs) | Import o‘tadi; jami 17606779.19 (narx: 37 qator локалка kodidan, 122 test narx) | ✅ 17 606 779.19, 171 qator; «СЕКЦИЯ» birligi platformada yo‘q (dona). |
| NR-03 | «Е7» varag‘i (255 qator: 26 ish, 229 resurs) | Import o‘tadi; jami 3183045.49 (narx: 69 qator локалка kodidan, 160 test narx) | ✅ 3 183 045.49, 255 qator. |
| NR-04 | «Е9» varag‘i (605 qator: 40 ish, 565 resurs) | Import o‘tadi; jami 609187035.94 (narx: 126 qator локалка kodidan, 439 test narx) | ❌ 409 UNIT_CONVERSION_REQUIRED: «БОЛТЫ СТРОИТЕЛЬНЫЕ С ГАЙКАМИ И ШАЙБАМИ» bir normada t, boshqasida kg (605 qatorning 10 tasi). Xato qaysi qator/material ekanini aytmaydi. NR-04b: kg→t o‘tkazilgach import o‘tdi. |
| NR-04b | «Е9» qayta: kg qatorlari mavjud material birligiga (t) o‘tkazilgan | Birlik to‘qnashuvi yagona to‘siq bo‘lsa — import o‘tadi, jami mustaqil hisobga teng | ✅ 10 qator kg→t; 609 187 035.94, 605 qator — o‘tdi. |
| NR-05 | «Е11» varag‘i (15 qator: 3 ish, 12 resurs) | Import o‘tadi; jami 6293.65 (narx: 9 qator локалка kodidan, 6 test narx) | ✅ 6 293.65, 15 qator. |
| NR-06 | «Е12» varag‘i (47 qator: 5 ish, 42 resurs) | Import o‘tadi; jami 776700.28 (narx: 15 qator локалка kodidan, 27 test narx) | ✅ 776 700.28, 47 qator. |
| NR-07 | «Е15» varag‘i (73 qator: 4 ish, 69 resurs) | Import o‘tadi; jami 6710488.10 (narx: 16 qator локалка kodidan, 54 test narx) | ✅ 6 710 488.10, 73 qator. |
| NR-08 | «Е19» varag‘i (7 qator: 1 ish, 6 resurs) | Import o‘tadi; jami 399154.66 (narx: 2 qator локалка kodidan, 4 test narx) | ✅ 399 154.66, 7 qator; «КОТЕЛ» birligi yo‘q (dona). |
| NR-09 | «Е22» varag‘i (626 qator: 64 ish, 562 resurs) | Import o‘tadi; jami 2666994641.02 (narx: 170 qator локалка kodidan, 419 test narx) | ✅ 2 666 994 641.02, 626 qator. |
| NR-10 | «Е23» varag‘i (394 qator: 55 ish, 339 resurs) | Import o‘tadi; jami 512165085.24 (narx: 109 qator локалка kodidan, 247 test narx) | ✅ 512 165 085.24, 394 qator. |
| NR-11 | «Е27» varag‘i (968 qator: 104 ish, 864 resurs) | Import o‘tadi; jami 1918074323.49 (narx: 207 qator локалка kodidan, 661 test narx) | ❌ 409 UNIT_CONVERSION_REQUIRED: «РАСТВОРИТЕЛЬ», «ХОЛОДНЫЙ ПЛАСТИК … СТРЕЛА», «СТЕКЛОШАРИКИ …» bir joyda t, boshqasida kg. Qator ko‘rsatilmaydi. NR-11b: o‘tkazilgach o‘tdi. |
| NR-11b | «Е27» qayta: kg qatorlari mavjud material birligiga (t) o‘tkazilgan | Birlik to‘qnashuvi yagona to‘siq bo‘lsa — import o‘tadi, jami mustaqil hisobga teng | ✅ 6 qator kg→t; 1 918 074 323.49, 968 qator — o‘tdi. |
| NR-12 | «Е31» varag‘i (21 qator: 3 ish, 18 resurs) | Import o‘tadi; jami 4845.45 (narx: 6 qator локалка kodidan, 12 test narx) | ✅ 4 845.45, 21 qator. |
| NR-13 | «Е33» varag‘i (125 qator: 7 ish, 118 resurs) | Import o‘tadi; jami 91811450.49 (narx: 7 qator локалка kodidan, 111 test narx) | ✅ 91 811 450.49, 125 qator. |
| NR-14 | «Е37» varag‘i (19 qator: 1 ish, 18 resurs) | Import o‘tadi; jami 798049.65 (narx: 1 qator локалка kodidan, 17 test narx) | ✅ 798 049.65, 19 qator. |
| NR-15 | «Е42» varag‘i (92 qator: 9 ish, 83 resurs) | Import o‘tadi; jami 637345.48 (narx: 32 qator локалка kodidan, 51 test narx) | ✅ 637 345.48, 92 qator. |
| NR-16 | «Е46» varag‘i (49 qator: 6 ish, 43 resurs) | Import o‘tadi; jami 4645975.01 (narx: 12 qator локалка kodidan, 31 test narx) | ✅ 4 645 975.01, 49 qator. |
| NR-17 | «Ц6» varag‘i (34 qator: 8 ish, 26 resurs) | Import o‘tadi; jami 732487.53 (narx: 8 qator локалка kodidan, 18 test narx) | ✅ 732 487.53, 34 qator; «ЦИКЛ» birligi yo‘q. |
| NR-18 | «Ц8» varag‘i (7 qator: 2 ish, 5 resurs) | Import o‘tadi; jami 36973.65 (narx: 2 qator локалка kodidan, 3 test narx) | ✅ 36 973.65, 7 qator; «1 КОНЕЦ» birligi yo‘q. |
| NR-19 | «Е4.04.06-14 ПЕР АВТОМОБИЛ» varag‘i (48 qator: 16 ish, 32 resurs) | Import o‘tadi; jami 46560.00 (narx: 16 qator локалка kodidan, 16 test narx) | ✅ 46 560.00, 48 qator. |
| NR-20 | Norma × hajm = Excel «по проектным данным» ustuni | Har resurs qatorida platformaning hisobiy miqdori (norma×hajm, 6 kasr) Excel F ustuni bilan 0,000001 aniqlikda teng | ✅ 1 880 resurs qatori: platforma norma×hajmni aniq hisoblaydi. Excel F bilan 18 farq: 17 tasi «1000 ШТ», «10 ШТ», «1000 М» birligini dona/metrga o‘tkazishdan (Excel F eski birlikda), 1 tasi Excel F ning 4 kasrga yaxlitlanganidan (Е15 §104.1: 2.74712 vs 2.7471). |
| NR-21 | Obyekt smetalari ro‘yxati va server jami | summary.count = import qilinganlar soni; summary.total = ularning jami yig‘indisi | ✅ 17 smeta, 2 143 qator, jami 3 307 606 856.96 = import qilinganlar yig‘indisi. |
| NR-22 | Norma kodi bo‘yicha ish tanlash va vazifa | Е0401-053-01 qidirilsa ish qatori topiladi; unga vazifa yaratiladi va hisobot qabul qilinadi; reja–fakt yangilanadi | ✅ 10 qator topildi; «УДАРНО-ВРАЩАТЕЛЬНОЕ БУРЕНИЕ…» 1 m — vazifa, hisobot qabul qilindi, fakt 1. |
| NR-23 | Platformada yo‘q birliklar | Excel birliklari platforma birliklariga (kg, t, m, m2, m3, dona, soat, komplekt) mos keladi | ⚠️ Yo‘q birliklar: СЕКЦИЯ, Л (litr), КОТЕЛ, ЦИКЛ, 1 КОНЕЦ — konvertorda «dona», asl birlik izohda. |
