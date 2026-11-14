# S5 — Buyurtmachi materiallari hisoboti: qo‘lda test case’lar (2026-11-08)

**Maqsad:** buyurtmachi (bosh pudratchi) bergan materiallar bo‘yicha davr hisoboti (egasining `отчёт` shakli) ombor harakatlaridan to‘g‘ri chiqishini va ish bo‘yicha normativ sarf bilan solishtirilishini tekshirish (D37, D40; VMQ 583, 12-band).
**Muhit:** lokal stack, sinov kompaniyasi. Haqiqiy kompaniya nomlari, INN va hisob raqamlari test ma’lumotiga yozilmaydi.
**Tayyorgarlik:** obyekt; ombor mudiri, brigadir (qo‘l hisobi bilan), prorab biriktirilgan; Form 5 smeta: ish pozitsiyasi (reja 100 m2) va uning guruhida «Kim beradi: Buyurtmachi» material qatori (reja 10 dona); boshqa smetada shu material «Pudratchi» qatori bilan (aralash holat uchun, ixtiyoriy).

| ID | Qadam | Kutilgan natija |
|---|---|---|
| S5-01 | Ombor sahifasida «Buyurtmachi materiallari» tabi ochiladi (smetada buyurtmachi materiali yo‘q obyekt) | Bo‘sh holat: «buyurtmachi beradi» deb belgilangan material yo‘q |
| S5-02 | Smetada material qatori «Buyurtmachi» qilinadi; tab qayta ochiladi | Material ro‘yxatda; hamma ustunlar 0 |
| S5-03 | Ombor mudiri materialni nakladnoy narxida kirim qiladi (10 dona × 1 000) | «Berilgan» 10 / 10 000; oxirgi qoldiq 10 / 10 000; yetkazib beruvchi qarzi paydo bo‘lmaydi |
| S5-04 | 5 dona brigadirga o‘tkaziladi, brigadir qabul qiladi | Jamlar o‘zgarmaydi (o‘tkazish obyekt ichida) |
| S5-05 | Brigadir 3 donani smeta qatoriga bog‘lab sarf qiladi, prorab tasdiqlaydi | «Sarflangan» 3; oxirgi qoldiq 7; ish bo‘yicha jadvalda haqiqiy sarf 3 |
| S5-06 | 1 dona sarf qilinadi va ombor mudiri uni storno qiladi | Sarflangan o‘zgarmaydi (storno chiqariladi) |
| S5-07 | 1 dona smeta qatoriga bog‘lanmasdan sarf qilinadi | Sarflangan 4; «bog‘lanmagan sarf» ogohlantirishi (1 dona); normativ varag‘ida «Без привязки к текущей строке сметы» qatori |
| S5-08 | Ish pozitsiyasiga 20 m2 hajm qabul qilinadi | Normativ sarf 10 × 20 / 100 = 2; farq = haqiqiy − normativ (musbat — ortiqcha sarf, qizil) |
| S5-09 | Inventarizatsiyada qoldiq 1 donaga kamaytiriladi | «Inventarizatsiya» ustuni −1; ogohlantirish; oxirgi qoldiq shunga mos |
| S5-10 | Keyingi oy tanlanadi | Shu oy harakatlari «Davr boshidagi qoldiq» ga o‘tadi; berilgan va sarflangan 0 |
| S5-11 | Material boshqa smetada «Pudratchi» qatori bilan ham bor | «Aralash» ogohlantirishi (kirimlarni ajratib bo‘lmaydi) |
| S5-12 | «Sana oralig‘i»da boshlanish tugashdan keyin | Xato (DATE_RANGE_INVALID) |
| S5-13 | Admin yoki buxgalter «Excel» bosadi | `buyurtmachi-materiallari-…xlsx`; «Отчет» varag‘i — 11 ustun (ish, material, birlik, boshidagi qoldiq, berilgan, sarflangan, oxirgi qoldiq — miqdor va summa), «Итого»; «Нормативный расход» varag‘i |
| S5-14 | Ombor mudiri, prorab yoki brigadir tabni ochadi va Excel yuklaydi | Faqat miqdorlar; summa ustunlari bo‘sh (narx huquqi yo‘q). Ombor mudiri va brigadir — ish bo‘yicha jadval, ish nomlari va shartnoma yo‘q (smetaga kirmaydi); prorab — ish bo‘yicha jadval va farq bor |
| S5-15 | Hisobot ochilgandan keyin ombor qoldiqlari va harakatlari ko‘riladi | Hech narsa o‘zgarmagan (hisobot saqlanmaydi); Excel eksport auditda `export.customer_materials` |
