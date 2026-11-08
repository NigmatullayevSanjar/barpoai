# S4 — Dalolatnoma (F-2) va ma’lumotnoma (F-3): qo‘lda test case’lar (2026-11-07)

**Maqsad:** davr bo‘yicha bajarilgan ishlar dalolatnomasi (F-2) va ma’lumotnoma-hisobvaraq-faktura (F-3) qabul qilingan ish hajmi va ombor sarfidan to‘g‘ri chiqishini tekshirish (D40, D41).
**Muhit:** lokal stack (`docker compose up --build -d`, frontend `pnpm dev`), sinov kompaniyasi. Haqiqiy kompaniya nomlari, INN va hisob raqamlari test ma’lumotiga yozilmaydi.
**Tayyorgarlik:** obyekt (buyurtmachi nomi va manzili bilan), unga biriktirilgan brigadir, prorab va ombor mudiri; Form 5 smeta (bitta ish pozitsiyasi, normali mehnat va material resurslari, bosh pudratchi materiali — «Buyurtmachi beradi») va bitta oddiy texnika qatori; smeta sarlavhasida shartnoma raqami, sanasi va summasi; «Smeta yakuni» sozlamasi: boshqa xarajatlar 21 %, QQS 12 %.

| ID | Qadam | Kutilgan natija |
|---|---|---|
| S4-01 | Admin smeta sahifasida «Dalolatnoma (F-2/F-3)» tugmasini bosadi | Oyna ochiladi, joriy oy tanlangan; davrda qabul qilingan ish bo‘lmasa «Tanlangan davrda qabul qilingan ish yo‘q» va uchta jamg‘arma (Davr, Yil boshidan, Qurilish boshidan) |
| S4-02 | Brigadir ish pozitsiyasiga o‘tgan oy sanasi bilan hisobot yuboradi (hajm 40), bosh muhandis qabul qiladi; oynada o‘tgan oy tanlanadi | Ish pozitsiyasi qatori — hajm 40, summa 0; uning resurslari — reja miqdori × 40 / reja hajmi (norma × hajm); summalar joriy narxda |
| S4-03 | Brigadir xuddi shu oy sanasi bilan ikkinchi hisobot yuboradi, lekin u **qabul qilinmaydi** | Dalolatnomada hajm o‘zgarmaydi (faqat qabul qilinganlar) |
| S4-04 | Bosh muhandis smetaga yangi reviziya qiladi (texnika narxini o‘zgartiradi), keyin yangi qatorga hisobot qabul qilinadi | Ikki reviziyadagi hajm bitta qatorda jamlanadi; narx — joriy reviziyadagi |
| S4-05 | Qabul qilingan hisobotga bugungi sana bilan hajm tuzatishi kiritiladi; o‘tgan oy va joriy oy dalolatnomasi ochiladi | O‘tgan oy o‘zgarmaydi; tuzatish joriy oy «Davr» va «Qurilish boshidan» ga kiradi |
| S4-06 | Ombor mudiri buyurtmachi materialini 0 narx bilan kiritadi, brigadirga beradi; brigadir shu smeta qatoriga bog‘lab sarf qiladi, prorab tasdiqlaydi | Material qatori miqdori — sarf (joriy oy); smeta narxida summa; «Buyurtmachi materiallari» va chegirma shu summaga teng |
| S4-07 | Bitta sarf storno qilinadi | Sarf miqdori stornoga kamayadi |
| S4-08 | Shu material smeta qatoriga bog‘lanmasdan sarf qilinadi | Oynada «bog‘lanmagan sarf» ogohlantirishi, material nomi va miqdori bilan; summaga kirmaydi |
| S4-09 | Texnika qatori yangi reviziyada o‘chiriladi; o‘tgan oy dalolatnomasi ochiladi | «O‘chirilgan qatorlar» ogohlantirishi (nom va hajm); texnika summasi 0 |
| S4-10 | Davr «Sana oralig‘i» bilan tanlanadi, boshlanish sanasi tugashdan keyin | Xato xabari (DATE_RANGE_INVALID), ma’lumot chiqmaydi |
| S4-11 | «Excel (F-2, F-3)» bosiladi | `akt-…xlsx` yuklanadi; varaqlar F-2 va F-3; kataklarda qiymat (formula emas) |
| S4-12 | F-2 varag‘i ko‘riladi | Sarlavha: генподрядчик (obyekt buyurtmachisi), субподрядчик (kompaniya), obyekt, shartnoma, davr, smeta va reviziya; ustunlar №, Шифр, Наименование, Ед. изм., Норма, Количество за период, Цена, Сумма; ish — 1, resurslar — 1.1, 1.2; bo‘lim satrlari; oxirida jamlar bloki (21 %, chegirma, QQS 12 %) |
| S4-13 | F-3 varag‘i ko‘riladi | 16 ustun; «ВСЕГО СМР» shartnoma ustunida — shartnoma summasi QQSsiz; «Итого с НДС» — boshidan / yil boshidan / davr summalari va shartnomaga nisbatan %; bank, MFO, INN, OKED qatorlari bo‘sh (qo‘lda to‘ldiriladi) |
| S4-14 | Shartnoma summasi kiritilmagan smetada oyna ochiladi | % ko‘rsatilmaydi, «Shartnoma summasi kiritilmagan» eslatmasi |
| S4-15 | Prorab, brigadir va ombor mudiri smeta sahifasiga kiradi | «Dalolatnoma» tugmasi yo‘q; API to‘g‘ridan-to‘g‘ri chaqirilsa 403 |
| S4-16 | Finansist va buxgalter dalolatnomani ochadi | Ochiladi (narx va smeta ko‘rish huquqi bor) |
| S4-17 | Dalolatnoma ochilgandan keyin smeta, hisobot va ombor sahifalari ko‘riladi | Hech narsa o‘zgarmagan (holat saqlanmaydi); Excel eksport auditda `export.estimate_act` |
