# Form 5 importi — tekshiruv (D29, 2026-11-04)

Loyiha: [FORM5_IMPORT_LOYIHA.md](../FORM5_IMPORT_LOYIHA.md). Qoidalar: [BARPO_BUSINESS_RULES.md](../backend/BARPO_BUSINESS_RULES.md) («Form 5 importi»).

## Avtomatik testlar

| To‘plam | Natija | Form 5 tekshiruvi |
|---|---|---|
| Unit (`npm test`) | 30 / 30 | Soxta Form 5 varag‘i: ish, resurs (norma × hajm), bosh pudratchi materiali, bo‘lim → qavat, birliklar («100 М2», «1 КМ», «Л»), ogohlantirishlar, «Excel jami», natijasiz formula xatosi |
| Integratsion (`npm run test:integration`) | 100 / 100 | Varaqlar ro‘yxati, ikki varaq preview (21 % platforma jamidan, QQS qo‘shilmaydi), t ↔ kg, qavat zonalari `kind='floor'` va qavat matritsasi, xato varaq va qator bilan, ikkala smeta bitta amalda yoki hech biri |
| UI (`npm run test:ui`) | 58 / 58 | Oynada Form 5 tanildi, Form 5 bo‘lmagan varaq tanlanmaydi, «Excel jami» va ogohlantirish ko‘rinadi, 21 % qo‘shiladi, smeta saqlanadi |
| Rollar (`npm run test:roles`) | topilma yo‘q | — |

Soxta fayl: `backend/tests/form5-fixture.ts` (haqiqiy fayllar repoga kirmaydi — egasi qarori).

## Egasining fayllari bilan qo‘lda tekshiruv (lokal stack, QA kompaniyasi, keyin o‘chirildi)

Ikkala asl faylda tashqi havola bor, shuning uchun ular tekshiruvdan oldin havolasiz nusxaga keltirildi (Excel’da «Данные → Изменить связи → Разорвать связь» bilan bir xil natija).

| ID | Qadam | Kutilgan natija | Natija |
|---|---|---|---|
| F5-01 | Asl `Иш турлари.xlsx` va `давальческие.xlsx` ni yuklash | `UNSAFE_WORKBOOK` (tashqi havola), xabarda yechim | ✅ ikkalasi 400 `UNSAFE_WORKBOOK` |
| F5-02 | `Иш турлари` (havolasiz) — inspeksiya | 20 ta Form 5 varag‘i, «ТЧ …» varaqlari Form 5 emas | ✅ 0,7 s; 20 ta Form 5, 4 ta «ТЧ» kulrang |
| F5-03 | 20 varaqni birga tekshirish | Har varaq alohida smeta, qatorlar soni avvalgi konvertor bilan bir xil | ✅ 3,3 s; qatorlar soni hamma varaqda bir xil (ОБЩЕЕ 4 124); narxsiz — jami 0 |
| F5-04 | Hajmi «--» ish qatorlari | Xato emas, ogohlantirish bilan o‘tkaziladi | ✅ Е5: 131; Е27: 197, 418, 639; ОБЩЕЕ: 291, 2544, 2765, 2986 |
| F5-05 | Platformada yo‘q birliklar | «dona», asl birlik izohda, ogohlantirish | ✅ СЕКЦИЯ, Л, КОТЕЛ, ЦИКЛ, «1 КОНЕЦ» |
| F5-06 | t va kg to‘qnashuvi | Material birligiga o‘tkaziladi (D31) | ✅ ОБЩЕЕ 16, Е9 10, Е27 6 qator |
| F5-07 | 20 smetani bitta amalda saqlash | Hammasi saqlanadi | ✅ 5,4 s; ОБЩЕЕ 4 124 qator |
| F5-08 | `давальческие` (havolasiz) — inspeksiya | `локалка` va `ф-2` Form 5; nakladnoy, akt, dalolatnoma, ф3, hisobot — yo‘q | ✅ |
| F5-09 | `локалка` preview | Avvalgi konvertor jami 346 409 467,73; Excel «ВСЕГО ЗАТРАТ» 346 420 604,77 | ✅ 640 qator, 346 409 467,73; farq −11 137,04 (361-qator formulasi xatosi −11 148,73 va narxni 2 kasrga yaxlitlash +11,69) |
| F5-10 | `локалка` ogohlantirishlari | 361-qator F ≠ norma × hajm (ma’lum xato) | ✅ 155 va 361 (155 — yangi topilgan shunday xato: F155 = 0,676, norma × hajm = 0,507); ishchi soati narxi 3 200 va 36 929,94; 282-qatorda birlik yo‘q; 459 narxsiz qator |
| F5-11 | Bo‘limlar → qavatlar | 8 qavat, qavat matritsasida ko‘rinadi | ✅ −1, 1–6, Sokol qavat |
| F5-12 | 21 % tugmasi | Xizmat qatori, summa platforma jamidan; QQS tugmasi yo‘q | ✅ 72 745 988,22; jami 419 155 455,95 (avvalgi RV-01 bilan bir xil); НДС qatorida tugma yo‘q |
| F5-13 | Brauzerda oyna (bosh muhandis) | Varaqlar ro‘yxati, preview, ogohlantirishlar, konsolda xato yo‘q | ✅ |

## Egasiga eslatma

- `ф-2` varag‘i `локалка` ning nusxasi bo‘lib chiqdi (bir xil 640 qator) — ikkalasini birga tanlasangiz ikki xil smeta yaratiladi.
- 155-qator: Excel’dagi F formulasi boshqa hajmga havola qiladi (361-qatordagi kabi). Platforma norma × hajmni oladi.
