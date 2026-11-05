# Form 5 orqali yuklangan ikki smeta bilan platforma tekshiruvi (2026-11-05)

> **Maqsad:** egasining ikki fayli — `Иш турлари.xlsx` va `давальческие.xlsx` (tashqi havolalari olib tashlangan nusxalar) — yangi Form 5 import oynasi (D29) orqali brauzerda yuklanganda platformaning har bir funksiyasi shu ma’lumot bilan o‘z mantig‘i bo‘yicha to‘g‘ri ishlashini tekshirish. 2026-11-02 dagi tekshiruv ([SMETA_EXCEL_TEKSHIRUV_2026_11_02.md](SMETA_EXCEL_TEKSHIRUV_2026_11_02.md)) shu fayllarni qo‘lda yozilgan konvertor orqali o‘tkazgan edi; bu safar konvertor yo‘q, natijalar u bilan solishtirildi.
> **Usul:** lokal stack (ishchi nusxa, commit qilinmagan: D25–D31), alohida `QA-202611050229-FORM5` kompaniyasi, 6 rol. Import — brauzerda (Playwright, Chrome, foydalanuvchining dev serveri), bosh muhandis nomidan; qolgan amallar — API orqali, rollar bo‘yicha. Kutilgan qiymatlar skriptda mustaqil hisoblandi (decimal) yoki 2-noyabr natijasidan olindi. Yakunda QA kompaniyasi o‘chirildi.
> **Belgilar:** ✅ o‘tdi · ⚠️ bo‘shliq (kod qoidaga mos, lekin egasi qarori yoki yangi funksiya kerak).

## 2-yugurish: egasi qarorlaridan keyin (D32, 2026-11-05)

Birinchi yugurishdagi to‘rt bo‘shliq bo‘yicha egasi qaror qildi (D32, [TZ_VA_NARX_REJASI.md](../TZ_VA_NARX_REJASI.md)). Uch masala amalga oshirildi, to‘rtinchisi (21 %) shunday qoldi. Keyin xuddi shu ssenariy yangi `QA-202611051228-FORM5` kompaniyasida qayta o‘tkazildi. Natija: **brauzerda 8 / 8, `локалка` oqimi 28 / 28, `Иш турлари` 29 / 29 — jami 65, hammasi o‘tdi, bo‘shliq yo‘q.** Tekshiruvdan keyin kompaniya o‘chirildi (53 jadval).

| ID | Tekshiruv | Natija |
|---|---|---|
| UI2-01 | `давальческие` brauzerda Form 5 oynasidan, 21 % bilan | ✅ Tekshiruv 0,6 s, saqlash 0,8 s; 640 qator, 346 409 467,73; noma’lum birlik yo‘q. |
| UI2-02 | `Иш турлари` 20 varaq bitta amalda | ✅ Tekshiruv 2,9 s, saqlash 5,2 s; 20 smeta; noma’lum birlik ogohlantirishi bo‘sh (avval СЕКЦИЯ, Л, КОТЕЛ, ЦИКЛ, «1 КОНЕЦ»). |
| UI2-03 | Omborchi kirimda «+» → nakladnoydagi «Сетка сварная Металлическая ВР Ø 5 3000*1000 (100*100)» (kv.m) → «Yaratish» | ✅ Oyna «bazada yo‘q, obyekt smetasida o‘xshashi bor — shu materialmi?» deb so‘radi va bitta material taklif qildi: smetadagi «… (100*100) ( 1 м2 2,8 кг)», m2. Boshqa setkalar (СЕТКА АРМАТУРНАЯ va b.) taklif qilinmadi. |
| UI2-04 | «Shu material» | ✅ «Nakladnoy nomi smetadagi materialga bog‘landi»; kirim oynasida smetadagi material tanlangan. Qayta urinishda o‘sha material «nomi aynan mos · muqobil nomlari: …» bilan chiqdi, dublikat yaratilmadi. |
| UI2-05 | Kirim tanlovida nakladnoy nomi bilan qidirish | ✅ Smetadagi material topiladi (birligi m2). |
| UI2-06 | `локалка` sahifasi, stavka ustuni | ✅ 1-qavat kladka: «4 608,86 avto»; «ЗАТРАТЫ ТРУДА» va texnika qatorlarida «—»; mehnat qatori birligi «soat» («hour» emas). |
| UI2-07 | Smeta muharriri | ✅ Kladka qatorida «Brigada stavkasi» maydoni bo‘sh, ichida avtomatik qiymat 4 608.86 ko‘rinadi; yozilsa — shu qiymat ishlaydi. |
| UI2-08 | Katta smeta va prorab ko‘rinishi | ✅ ОБЩЕЕ (4 124 qator, reviziya 2) 5,4 s da ochildi; prorabda narx, stavka va jamlar yashirin; brauzer konsolida xato yo‘q. |

Birinchi yugurishdagi bo‘shliqlar endi:

| Avval | Endi |
|---|---|
| WK-07: kladka 188 m2 × 0 = 0 | ✅ Avtomatik stavka: 117,312 soat × 36 929,94 = 4 332 325,12 / 188 m2 × 20 % = **4 608,86 so‘m/m2**, 188 m2 uchun **866 465,68**; demontaj 7,75 × 49 042,96 = 380 082,94. «ЗАТРАТЫ ТРУДА» qatorlariga hisobot stavkasiz (akkord faqat ish qatorida, ikki marta to‘lanmaydi). Brigadir daromadi 1 246 548,62 = ish haqi davri = to‘lov. |
| DV-01, DV-06: Сетка smetaga bog‘lanmadi (5 727 336,25) | ✅ 7 material ham smetadagi materialga tushdi (Сетка — muqobil nom orqali); 39 sarf, hammasi smeta qatoriga bog‘langan; smeta material fakti = obyekt fakti = **140 890 681,97**, bog‘lanmagan 0,00. |
| NR-07: 5 birlik «dona» bo‘lardi | ✅ ОБЩЕЕ da litr 21, seksiya 2, qozon 1, sikl 2, uchi 2 qator; konvertor bilan qatorma-qator solishtirish (NR-02) 7 840 qator, farq 0 (D32 birliklari va 32 ta t ↔ kg o‘tkazishi hisobga olingan). |
| RV-01: 21 % qatori qotirilgan | Egasi qarori: shunday qoladi, qo‘lda o‘zgartiriladi. Reviziyada 72 745 988,22 bo‘lib qoldi. |

Yangi tekshiruvlar: NR-04 — narxsiz smetada ish qatorining avtomatik stavkasi yo‘q (null); NR-09 — narx reviziya bilan qo‘yilgach, o‘sha qatorda stavka paydo bo‘ldi: Е4 burg‘ulash, mehnat 8 615,76 / 1 m × 20 % = 1 723,15; uning 3 ta resurs qatori stavkasiz. Qolgan natijalar birinchi yugurish bilan bir xil: 20 smeta jamlari 2-noyabr bilan tiyinigacha teng (ОБЩЕЕ 5 834 821 656,39, reviziya 3,0 s), obyekt jami 11 669 689 872,78; `локалка` 419 155 455,95 → reviziya 2 da 424 155 455,95; tushum 311 671 640; obyekt fakti 142 137 230,59 (33,5 %).

Avtomatlashtirilgan testlar (D32 bilan): unit 31, integration 101, rol matritsasi 10 rol × 83 GET (mos kelmagani 0), UI 59.

Quyidagi bo‘limlar — birinchi yugurish (D32 dan oldin).

## Xulosa

| Yo‘nalish | Jami | ✅ | ⚠️ |
|---|---|---|---|
| A. Brauzerda import va sahifalar | 7 | 7 | 0 |
| B. `локалка` smetasi | 7 | 7 | 0 |
| C. Давальческие materiallar: kirim → brigada → sarf | 6 | 4 | 2 |
| D. Ish: vazifa → hisobot → akkord → qavat matritsasi | 7 | 6 | 1 |
| E. Reviziya (D26, D27) | 4 | 4 | 0 |
| F. Moliya | 4 | 4 | 0 |
| G. `Иш турлари` — 20 smeta | 28 | 27 | 1 |
| **Jami** | **63** | **59** | **4** |

Form 5 importi 2-noyabrdagi konvertor bilan aynan bir xil natija berdi:
- `Иш турлари`: 7 840 qatorning har biri bir xil (tur, nom, birlik, hisobiy miqdor). Shu test narxlari qo‘yilganda 20 smeta jami 2-noyabr natijasiga tiyinigacha teng.
- `локалка`: jami 346 409 467,73, 21 % bilan 419 155 455,95.

2-noyabrda yiqilgan to‘rt holat endi o‘tadi:
- reviziyada vazifa boshqa ishga o‘tib ketishi (endi RV-02 o‘tadi);
- reviziyada reja–fakt nolga tushishi (RV-03);
- matritsada bir xil nomli resurslar qo‘shilib ketishi (WK-04);
- eksport faylining qayta importga qaytmasligi (LK-05).

Ochiq qolgan to‘rt bo‘shliq 2-noyabrdan ma’lum; ular pastda.

## Ochiq masalalar (birinchi yugurish; D32 da hal qilindi — yuqorida)

1. **Ish qatoriga akkord stavkasi 0 (WK-07).** Form 5 da ish qatorining narxi 0, narx esa resurslarda turadi. Shuning uchun obyekt foizi bo‘yicha stavka ham 0 chiqadi (kladka 188 m2 × 0). Akkord faqat «ЗАТРАТЫ ТРУДА» qatoriga soatlab yozilganda ishlaydi. Ish qatoriga brigada stavkasini qo‘lda yozish mumkin. Egasi qarori kerak: ish qatori stavkasini uning mehnat resurslaridan avtomatik olish kerakmi (2-noyabr, 11-band).
2. **Nakladnoy va smetada material nomi farqi (DV-01, DV-06).** Nakladnoyda «Сетка сварная … (100*100)», `локалка` da esa «… (100*100) ( 1 м2 2,8 кг)». Bu ikki xil material bo‘lib qoldi, shuning uchun Сетка sarfi (5 727 336,25 so‘m) smeta qatoriga bog‘lanmadi. Obyekt fakt xarajatida bu summa bor, smeta material faktida yo‘q. Nom moslash (alias) funksiyasi yo‘q.
3. **Platformada yo‘q birliklar (NR-07).** СЕКЦИЯ, Л, КОТЕЛ, ЦИКЛ va «1 КОНЕЦ» «dona» qilib olinadi, asl birlik izohda qoladi, oynada ogohlantirish chiqadi. Bu birliklarni platformaga qo‘shish yoki shunday qoldirish — egasi qarori.
4. **21 % qatori — qotirilgan summa (RV-01).** Import paytida platforma jamidan hisoblanadi (72 745 988,22). Keyingi reviziyada smeta o‘zgarsa, bu summa qayta hisoblanmaydi va qo‘lda yangilanishi kerak.

Kichik kamchiliklar (ko‘rinish):
- Smeta sahifasida birliklar «hour» va «set» tarjimasiz ko‘rinadi.
- So‘mda kasrning oxirgi noli tashlanadi: obyekt kartasida «141 287 414,4», «,40» emas (`formatMoney` qoidasi bo‘yicha).

## Manba Excel’dagi shubhali qatorlar (platformaga aloqasi yo‘q)

- **`Иш турлари`, Е27 (§326.6 va §327.5).** «КАБЕЛИ КОНТРОЛЬНЫЕ …» resursining birligi «1000М», normasi 380. Bu ish qatorining (10 M2 yo‘l chizig‘ini olib tashlash, hajm 0,1) hajmiga ko‘paytirilganda 1 m2 uchun 38 000 m kabel chiqadi. Platforma Excel’dagidek o‘qidi (Excel F ustunida ham 38 ming m). Norma yoki birlik xato bo‘lishi mumkin, tekshirish kerak.
- **`локалка`.** 2-noyabr va 4-noyabrda topilgan xatolar o‘z kuchida: 361-qator formulasi (−11 148,73 so‘m), 155-qator (F = 0,676; norma × hajm = 0,507; narxi yo‘q, summaga ta’sir qilmaydi), 158- va 170-qatorda ishchi soati 3 200 so‘m, 282-qatorda birlik yo‘q.

## A. Brauzerda import va sahifalar (bosh muhandis, prorab)

| ID | Qadam | Kutilgan natija | Natija |
|---|---|---|---|
| UI-01 | `давальческие` (havolasiz) ni «Excel import» oynasiga yuklash | Form 5 varaqlari tanlanadi, qolganlari kulrang | ✅ `локалка` va `Апартамент № 1 ф-2` tanlangan; Накладной, Акт, ДАЛОЛАТНОМА, ф3, отчёт — kulrang. `ф-2` olib tashlandi. |
| UI-02 | «Tekshirish» → 21 % ni «Smetaga qo‘shish» → «1 ta smetani yaratish» | 640 qator, 346 409 467,73; Excel solishtiruvi; 21 % dan keyin 641 qator; smeta sahifasi ochiladi | ✅ Tekshiruv 0,7 s, saqlash 0,9 s. Excel 346 420 604,77, farq −11 137,04. 39 material va 8 qavat zonasi yaratildi. Ogohlantirishlar: 155- va 361-qator miqdori, ishchi soati 3 200 – 36 929,94, 282-qatorda birlik yo‘q, 459 narxsiz qator. 641 qatorli smeta ochildi. |
| UI-03 | `Иш турлари` (havolasiz, 24 varaq): hamma Form 5 varaqlari → saqlash | 20 varaq tanlanadi, 4 ta «ТЧ» kulrang; 20 smeta bitta amalda | ✅ Tekshiruv 3,5 s, 20 ta «Tekshiruv o‘tdi»; saqlash 6,2 s; «20 ta smeta import qilindi». |
| UI-04 | ОБЩЕЕ smetasi (4 124 qator) sahifasini ochish | Sahifa ochiladi, konsolda xato yo‘q | ✅ 5,5 s (narxli reviziya 2), xato yo‘q. |
| UI-05 | `локалка` reviziya 2 sahifasi | 21 % va qo‘shimcha qator ko‘rinadi; jami «Jami» ustunida | ✅ «Jami 424 155 455,95», bo‘lim jamlari «Jami» ustuni ostida (2-noyabr UI-08 tuzatilgan). |
| UI-06 | Obyekt kartasi va «Qavatlar progressi» | Moliya kartasi raqamlari; matritsada ish kodi bilan ustunlar | ✅ Reja 424 155 455,95, fakt 141 287 414,4 (33,3 %), progress 0,8 %. Matritsa ustunlari «Е4604-001-05 РАЗБОРКА … / ЗАТРАТЫ ТРУДА …» — kod bilan, 1-qavat 50,0 % va 48,6 %. |
| UI-07 | Prorab `локалка` ni ochadi | Narx ustunlari va summalar yo‘q | ✅ «Narxlar sizning rolingiz uchun yashirin», narx ustuni va «Yakuniy jami» yo‘q. |

## B. `локалка` smetasi

| ID | Qadam | Kutilgan natija | Natija |
|---|---|---|---|
| LK-01 | Import qilingan smeta | 641 qator, reviziya 1, jami 419 155 455,95; turlar 2-noyabr bilan bir xil | ✅ Ish haqi 190 650 309,38, texnika 14 868 476,37, material 140 890 681,98, xizmat (21 %) 72 745 988,22. |
| LK-02 | Excel bilan solishtirish | Farq = 361-qator xatosi + narx yaxlitlash | ✅ −11 137,04 = −11 148,73 (361-qator) + 11,69 (yaxlitlash). 155-qator «КРУГ ОТРЕЗНОЙ» narxsiz — summaga ta’siri yo‘q. |
| LK-03 | Qavat zonalari | 8 zona `kind=floor`, import yaratgan; zonalar jami = smeta jami | ✅ 5-qavat 147 111 754,94; 4-qavat 46 994 589,70; −1-qavat 44 483 738,30; 6-qavat 32 570 737,91; 1-qavat 24 680 439,10; 2- va 3-qavat 24 479 484,04; Sokol 1 609 239,70; zonasiz (21 %) 72 745 988,22. |
| LK-04 | Prorab smetani API orqali o‘qiydi | Narx va summalar kelmaydi (D20) | ✅ |
| LK-05 | Excel eksport → qayta import (oddiy jadval) | 641 qator, jami 419 155 455,95 | ✅ Eksportda 642 qator (641 + JAMI), JAMI o‘tkazib yuborildi. |
| LK-06 | Ish kodi bo‘yicha qidiruv | `Е0804-003-01` — shu kodli qatorlar | ✅ 99 qator, kategoriya «Е0804-003-01 КЛАДКА ПЕРЕГОРОДОК …». |
| LK-07 | Prorab eksporti | Narx ustunlarisiz | ✅ 13 ustun, narx yo‘q. |

## C. Давальческие materiallar: kirim (to‘lovsiz) → brigada → sarf

| ID | Qadam | Kutilgan natija | Natija |
|---|---|---|---|
| DV-01 | Nakladnoy materiallari smeta materiallari bilan mosmi | 7 material nomi va birligi bo‘yicha mos | ⚠️ 6 tasi mos. «Сетка сварная … (100*100)» smetada boshqa nom bilan — omborchi alohida material yaratdi. |
| DV-02 | Kirim: 14 qator | Qoldiq = nakladnoy; qiymat 140 890 681,97 (nakladnoy 140 890 681,77) | ✅ +0,20 — narxni 2 kasrga yaxlitlashdan. |
| DV-03 | Kirimdan keyin obyekt kartasi | Fakt 0, to‘langan 0, qarz 0 | ✅ |
| DV-04 | Brigadirga jo‘natish va qabul | Ombor qoldig‘i 0 | ✅ 7 material. |
| DV-05 | Sarf smeta qatorlariga bog‘lab; tasdiq | Brigadir o‘z sarfini tasdiqlay olmaydi (403), prorab tasdiqlaydi | ✅ 32 sarf, 31 tasi smeta qatoriga bog‘langan (Сетка — qatorsiz). |
| DV-06 | Sarfdan keyin fakt | actual_cost 140 890 681,97; smeta material fakti = bog‘langan sarf | ⚠️ actual_cost 140 890 681,97; smeta material fakti 135 163 345,72 — farq 5 727 336,25 (Сетка). |

## D. Ish: vazifa → hisobot → qabul → akkord → qavat matritsasi

| ID | Qadam | Kutilgan natija | Natija |
|---|---|---|---|
| WK-01 | 4 vazifa smeta qatorlariga bog‘lab (1-qavat) | Kartada qator nomi, birligi, reja hajmi | ✅ «КЛАДКА ПЕРЕГОРОДОК … 100 ММ», m2, 188. |
| WK-02 | Vazifa holatlari | todo → in_progress → submitted → accepted | ✅ |
| WK-03 | Hisobotlar → qabul → stavka qotiriladi | Ish qatorlari 0; «ЗАТРАТЫ ТРУДА»: 20 % × 36 929,94 = 7 385,99 so‘m/soat | ✅ Armirovanie mehnati 3,714184 × 7 385,99 = 27 432,93; demontaj mehnati 50 × 7 385,99 = 369 299,50; jami 396 732,43. |
| WK-04 | Qavat × ish matritsasi (D28) | 8 qavat; kladka 188/188; «ЗАТРАТЫ ТРУДА» har ish kodi ostida alohida | ✅ 1-qavatda 6 ta alohida «ЗАТРАТЫ ТРУДА» satri: armirovanie 3,714184/3,714184 (100 %), demontaj 50/102,92 (48,6 %). |
| WK-05 | Smeta kartasida reja–fakt | Kladka 188, demontaj yarmi, mehnat qatorlari | ✅ |
| WK-06 | Brigadir daromadi | earned = hisobotlar yig‘indisi | ✅ 396 732,43. |
| WK-07 | Ish qatoriga akkord | — | ⚠️ 188 m2 × 0,00 = 0 (yuqorida 1-band). |

## E. Reviziya

| ID | Qadam | Kutilgan natija | Natija |
|---|---|---|---|
| RV-01 | Reviziya 2: bitta qo‘shimcha qator (5 000 000) | 642 qator, jami 424 155 455,95; 21 % o‘zgarmaydi | ✅ 21 % qatori 72 745 988,22 bo‘lib qoldi (yuqorida 4-band). |
| RV-02 | Vazifalar o‘sha qatorga o‘tdimi (D26) | Kategoriya, nom va pozitsiya bir xil — 1-qavatda 6 ta «ЗАТРАТЫ ТРУДА» bo‘lsa ham | ✅ 4 vazifa ham to‘g‘ri qatorda (2-noyabr RV-03 tuzatilgan). |
| RV-03 | Reviziyadan keyin reja–fakt (D27) | Fakt saqlanadi | ✅ Kladka 188, demontaj mehnati 50, material fakti 135 163 345,72, progress 0,8 % → 0,8 %, matritsa 188/188 (2-noyabr RV-04 tuzatilgan). |
| RV-04 | Reviziyalar tarixi | 2 reviziya | ✅ rev1 641 qator / 419 155 455,95; rev2 642 qator / 424 155 455,95. |

## F. Moliya

| ID | Qadam | Kutilgan natija | Natija |
|---|---|---|---|
| FN-01 | Buyurtmachidan tushum 311 671 640 | income 311 671 640,00 | ✅ |
| FN-02 | Ish haqi davri | piece_pending = 396 732,43 | ✅ |
| FN-03 | Davrni yopish va to‘lash | piece_rate = akkord, to‘lov, balans 0 | ✅ |
| FN-04 | Obyekt moliya kartasi | Reja 424 155 455,95; fakt = 140 890 681,97 + 396 732,43; qarz 0 | ✅ Fakt 141 287 414,40 (33,3 %), to‘langan 396 732,43, tushum 311 671 640,00. |

## G. `Иш турлари` — 20 smeta

| ID | Qadam | Kutilgan natija | Natija |
|---|---|---|---|
| NR-01 | 20 smeta, qatorlar soni | 2-noyabr konvertori bilan bir xil | ✅ Е4 160, Е5 171, Е7 255, Е9 605, Е11 15, Е12 47, Е15 73, Е19 7, Е22 626, Е23 394, Е27 968, Е31 21, Е33 125, Е37 19, Е42 92, Е46 49, Ц6 34, Ц8 7, Е4.04.06-14 48, ОБЩЕЕ 4 124. |
| NR-02 | Qatorma-qator solishtirish | Tur, nom, birlik, hisobiy miqdor bir xil; farq faqat t ↔ kg (D31) | ✅ 7 840 qator (6 582 tasi norma × hajm), farq 0. t ↔ kg: Е9 10, Е27 6, ОБЩЕЕ 16 qator. |
| NR-03 | Narxsiz smetalar | 20 smeta, jami 0 | ✅ |
| NR-04 | Kod bo‘yicha qidiruv → vazifa → hisobot | `Е0401-053-01` topiladi, fakt = reja | ✅ «УДАРНО-ВРАЩАТЕЛЬНОЕ БУРЕНИЕ …» 1 m, fakt 1. |
| NR-P01–P20 | Har smetaga 2-noyabr test narxlari reviziya bilan | Jami = mustaqil hisob = 2-noyabr natijasi | ✅ 20 tasi ham farqsiz: Е4 1 050 982,07 … ОБЩЕЕ 5 834 821 656,39. ОБЩЕЕ (4 124 qator) reviziyasi 3,6 s. |
| NR-05 | Narx reviziyasidan keyin vazifa va fakt | Vazifa o‘sha qatorda, fakt saqlangan | ✅ |
| NR-06 | Obyekt smetalari jami | Serverda 20 smeta yig‘indisi | ✅ 11 669 689 872,78. |
| NR-07 | Platformada yo‘q birliklar | — | ⚠️ СЕКЦИЯ, «1 СЕКЦИЯ АРМАТУРНОГО КАРКАСА», Л, КОТЕЛ, ЦИКЛ, «1 КОНЕЦ» — «dona» (yuqorida 3-band). |
| NR-08 | Hajmi «--» ish qatorlari | Xato emas, ogohlantirish | ✅ Е5: 131; Е27: 197, 418, 639; ОБЩЕЕ: 291, 2544, 2765, 2986. |
