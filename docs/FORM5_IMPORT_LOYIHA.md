# Form 5 smeta importi — loyiha (D29, 2026-11-03)

> **Holat:** amalga oshirildi (2026-11-04): server `backend/src/form5.ts` va `routes-estimates-extra.ts` (`form5/preview`, `form5/commit`), oyna `frontend/src/features/estimates/Form5Import.tsx`, soxta fayl `backend/tests/form5-fixture.ts`. Loyihadan farqlar: hajmi «--» bo‘lgan ish qatori xato emas, ogohlantirish bilan o‘tkaziladi (egasining fayllarida ishlatilmagan variant shunday yozilgan); 21 % summasi Excel’dan emas, platforma jamidan olinadi.
> **Asos:** egasining haqiqiy fayllari (`Иш турлари.xlsx`, `давальческие.xlsx`) va ularning tekshiruvi `docs/tests/SMETA_EXCEL_TEKSHIRUV_2026_11_02.md`. O‘sha tekshiruvdagi konvertor shu rejimning ishlaydigan prototipi bo‘ldi: o‘tkazilgan fayllarda platforma jamlari Excel bilan tiyinigacha mos keldi.

## 1. Foydalanuvchi uchun qanday ko‘rinadi

Smetalar sahifasida «Excel import» oynasida fayl tanlanadi. Agar fayl Form 5 (ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ) bo‘lsa, platforma buni o‘zi taniydi va yangi qadam ochadi:

1. **Fayl.** 10 MB gacha (D25). Form 5 belgisi — sarlavhada «Наименование работ и затрат» va «Шифр … нормативов», tagida «1 2 3 4 5 6» raqamlangan qator.
2. **Varaqlar.** Faylning hamma varag‘i ro‘yxati: nomi, topilgan ishlar va resurslar soni, narxli/narxsiz. Foydalanuvchi bitta yoki bir nechta varaqni belgilaydi; har varaq alohida smeta bo‘ladi (nomi = varaq nomi, o‘zgartirish mumkin). Form 5 bo‘lmagan varaqlar (накладная, акт, ф3) kulrang, tanlab bo‘lmaydi.
3. **Tekshiruv (preview).** Har varaq bo‘yicha: qatorlar soni, server jami, qavatlar (bo‘limlar), avtomatik yaratiladigan materiallar va zonalar, **ogohlantirishlar** (pastda). Xato bo‘lsa — Excel qator raqami bilan.
4. **Saqlash.** Tanlangan varaqlar bitta amalda smeta bo‘lib saqlanadi; biri xato bo‘lsa hech biri saqlanmaydi.

Platforma shablonidagi oddiy import (ustunlarni moslash) o‘zgarishsiz qoladi.

## 2. Faylni o‘qish qoidalari

| Excel qatori | Qanday tanilinadi | Platformada |
|---|---|---|
| Bo‘lim | A bo‘sh, C «Раздел …» bilan boshlanadi | Keyingi qatorlarning zonasi: bo‘lim nomidagi qavat («1-этаже», «6 этаж», «Цокольный») — obyektdagi shu nomli qavat zonasi, yo‘q bo‘lsa yaratiladi; to‘liq matni keyingi barcha qatorlarning `section_name` maydoniga (S2) |
| Ish | A butun son, B norma kodi (Е0804-003-01…) | «Ish» qatori: nom = C, kategoriya = «kod + nom», `norm_code` = B ning to‘liq matni, qo‘shimchasi bilan (S2), miqdor = hajm × birlik ko‘paytmasi («100 М2» → m2 ×100), narx 0 (narx resurslarda) |
| Resurs | A «13.1» ko‘rinishida | Resurs qatori: norma = E, ish hajmi = ishning hajmi (`norma × hajm`); ЧЕЛ.-Ч → ish haqi/soat, МАШ.-Ч → texnika/soat, qolgani material; narx = G; `resource_code` = B (S2) |
| Bosh pudratchi materiali | A bo‘sh, C, D, E bor (B — `pcpc…` kodi bo‘lishi mumkin) | Material qatori, miqdor = E (normasiz), narx = G; `resource_code` = B (S2) |
| Miqdori loyihadan («П») material (D35, 2026-11-06) | A bo‘sh, E yoki F = «П», F da son yo‘q (B — `П…`, `С…`, `М…` kodi); ShNK 4.02.70-05, 1.9-band | Material qatori **miqdor 0** bilan, o‘sha ishning kategoriyasi va zonasida; asl kod `resource_code` da (S2), izohda «П — miqdor loyihadan»; G da musbat narx bo‘lsa saqlanadi; hajmi «--» ish ostida — o‘tkaziladi; miqdor keyin muharrirda kiritiladi. Egasining `Иш турлари` faylida 51 ta (yig‘ma `ОБЩЕЕ` varag‘ida yo‘q); shu sababli to‘plam varaqlarining qatorlar soni oshadi: Е11 15 → 18, Е22 626 → 653, Е23 394 → 411, Е27 968 → 972 |
| Jamlar bloki | C «ВСЕГО ЗАТРАТ», «ИТОГО», «НДС» | O‘qilmaydi; preview’da «Excel jami» sifatida solishtirish uchun ko‘rsatiladi |

- **Formulalar:** Excel saqlagan oxirgi natija o‘qiladi (formula qayta hisoblanmaydi). Natijasi yo‘q formula — qator xatosi.
- **Birliklar lug‘ati:** ЧЕЛ.-Ч, МАШ.-Ч → soat; Т, ТН, т-н, tonna → t; М3, кубический метр → m3; М2, кв.м → m2; М, п.м → m; КГ, килограмм → kg; ШТ → dona; КОМПЛ → komplekt; «100 М2», «1000 ШТ», «1 КМ» → asosiy birlik × ko‘paytma (norma ham shunga ko‘paytiriladi).
- **Materiallar:** nom bo‘yicha mavjudiga bog‘lanadi, yo‘q bo‘lsa yaratiladi. Bir material turli birlikda (t va kg) — `t↔kg` jadvali bilan avtomatik o‘tkaziladi, boshqa juftlik — qator raqami bilan xato. (Oddiy importda D31 bilan allaqachon bor: `convertMass`.)

## 3. Ogohlantirishlar (saqlashga to‘sqinlik qilmaydi)

- Platformada yo‘q birlik (Л, СЕКЦИЯ, КОТЕЛ, ЦИКЛ, КОНЕЦ) — «dona» bo‘ladi, asl birlik izohda.
- Narxsiz resurs yoki material qatorlari soni va summaga ta’siri (0 deb olinadi).
- Excel F ustuni `norma × hajm` ga teng emas — qator raqami va farq (tekshiruvda 361-qator xatosini shunday topdik).
- Bir xil resursning narxi bo‘limlarda turlicha (masalan, ishchi soati 3 200 va 36 929,94).
- Excel jami va platforma jami farqi (yaxlitlash va yuqoridagi sabablar).
- Miqdori «П» (loyihadan) bo‘lgan materiallar: soni va qatorlar (raqam va nom) — ular 0 miqdor bilan qo‘shilgan (D35).

## 4. Egasi qarorlari (2026-11-03)

1. **Tashqi havolali fayllar** (`давальческие.xlsx` kabi) — **rad etiladi**, hozirgidek (`UNSAFE_WORKBOOK`). Xabar matniga yechim qo‘shiladi: «Excel’da Ma’lumotlar → Havolalarni tahrirlash → Havolani uzish, so‘ng qayta saqlang».
2. **Qator chegarasi** — egasi keyinroq chegarani olib tashlashni so‘radi (D30): smeta 20 000 qatorgacha, shuning uchun `ОБЩЕЕ` (4 124 qator) bitta smeta bo‘lib yuklanadi; bo‘limlar bo‘yicha bo‘lish kerak emas. 20 000 dan oshsa — `WORKBOOK_LIMIT`.
3. **Boshqa xarajatlar, bosh pudratchi materiallari qaytarilishi, QQS** (`локалка` dagi 21 %, «ВОЗВРАТ», 12 %) — import qilinmaydi, preview’da **«Excel jami» blokida ko‘rsatiladi**; 21 % ni bir tugma bilan «xizmat» qatori qilib qo‘shish mumkin.
4. **Haqiqiy fayllar** repoga qo‘shilmaydi (kompaniya nomlari, INN, hisob raqamlari); testlar uchun shu tuzilishdagi soxta fayllar yasaladi.
5. **Navbat:** avval smeta tekshiruvidagi nuqsonlar tuzatiladi (smeta sahifasi jamlari, kategoriya guruhlari, eksport→import, xato matnlari, birlik to‘qnashuvi qatori), keyin Form 5.

## 5. Amalga oshirish bosqichlari

1. Server: Form 5 tanish va o‘qish (`POST /v1/estimate-imports/inspect` javobiga `format: 'form5'` va varaqlar ro‘yxati; yangi `POST /v1/estimate-imports/form5/preview` va `…/commit`), birliklar lug‘ati, ogohlantirishlar, unit va integratsion testlar soxta Form 5 fayllari bilan.
2. Frontend: import oynasida varaq tanlash va Form 5 preview qadami (uz/ru matnlar), UI testi.
3. Egasining haqiqiy fayllari bilan qo‘lda tekshiruv (lokal QA kompaniyasida) va natijani `docs/tests/` ga yozish.
