# Namuna smeta bilan qo‘lda test case: importdan dalolatnomagacha (2026-11-11)

**Maqsad:** bitta obyektda smetaning to‘liq oqimini qo‘lda tekshirish: Form 5 importi → smeta yakuni → ombor → ish hajmi → dalolatnoma (F-2/F-3) → buyurtmachi materiallari hisoboti.
**Fayl:** `docs/research/NAMUNA_SMETA_FORM5_2026_11_10.xlsx` (o‘quv namunasi, haqiqiy kompaniya ma’lumoti yo‘q).
**Muhit:** lokal stack, `http://localhost:5173` (IP manzil orqali login ishlamaydi). Kompaniyada xodimlar bor: admin, bosh muhandis, prorab, brigadir, ombor mudiri, buxgalter. Obyektlar bo‘sh bo‘lishi mumkin.
**Kutilgan raqamlar** 2026-11-10 dagi avtomatik tekshiruvda tasdiqlangan (`NAMUNA_SMETA_TEKSHIRUV_2026_11_10.md`); istisnolar qadamning o‘zida yozilgan. Sarf va hisobotlar bir oy ichida kiritilsin — dalolatnoma shu oy uchun ochiladi.
**Natija yozish:** har qator uchun «o‘tdi» yoki «yiqildi + haqiqiy natija, skrinshot».

## 1. Obyekt va import

| ID | Qadam | Kutilgan natija |
|---|---|---|
| Q-01 | Admin → Obyektlar → yangi obyekt «Namuna ofis», brigada foizi **20**; Xodimlar tabida bosh muhandis, prorab, brigadir, buxgalterni biriktiring, ombor mudiriga obyekt omborini ham | Obyekt ochildi; xodimlar ro‘yxatda |
| Q-02 | Bosh muhandis → Smetalar → shu obyekt → «Excel import» → namuna faylni tanlang | Fayl Form 5 deb taniladi; faqat «Ресурсная ведомость» belgilanadi (5 ta ish, 20 ta resurs, 3 ta material); qolgan 3 varaq yopiq |
| Q-03 | «Tekshirish» | «Tekshiruv o‘tdi: 28 ta qator, jami 75 537 564 so‘m»; Excel jamlari jadvalida 12 qatorning hammasida farq 0; oxirgi qator «ИТОГО С НДС» 81 077 530,73 |
| Q-04 | Shu oynadagi sozlamalarni ko‘ring | Boshqa xarajatlar 21; QQS 12; «Bosh pudratchi materiallarini kim beradi (2 ta qator)» — Buyurtmachi; chegirish belgilangan; «Smeta narxi: 81 077 530,73 so‘m» |
| Q-05 | Ogohlantirishlarni o‘qing | Qavatlar: 1-qavat, 2-qavat; 10 ta material va 2 ta zona yaratildi; «П» ogohlantirishi: ПРОФИЛЬ МАЯЧКОВЫЙ ПМ-6, 26-qator |
| Q-06 | «1 ta smetani yaratish» | Smeta sahifasi ochiladi: 28 qator, 5 guruh; ish qatorlarida avtomatik stavka 9 059,2 / 228 000 / 4 780,4 / 2 888 / 3 230; «Yakuniy jami» 75 537 564 |
| Q-07 | Sahifa pastidagi «Smeta yakuni» | Ish haqi 25 969 200; Mashinalar 1 692 000; Pudratchi materiallari 28 866 564; Buyurtmachi materiallari 19 009 800; Boshqa xarajatlar 21 % — 15 862 888,44; QQSsiz jami 72 390 652,44; QQS 8 686 878,29; QQS bilan jami **81 077 530,73** |

## 2. Sarlavha va sozlamalar

| ID | Qadam | Kutilgan natija |
|---|---|---|
| Q-08 | «Sarlavhani tahrirlash»: shartnoma raqami `NAMUNA-1`, sana shu oyning 1-kuni, summa 81 077 530,73 | Saqlanadi; reviziya 1 bo‘lib qoladi |
| Q-09 | «Sozlamalar» → VMQ 583: boshqa xarajatlar 20, ishlab chiqarish 2,5 | Boshqa xarajatlar (foyda bilan) 20 395 142,28; Ishlab chiqarish 1 888 439,10; QQS bilan jami **88 268 706,83** (fayldagi «Hisob-kitob» varag‘ining C ustuni) |
| Q-10 | «Sozlamalar» → «Erkin», boshqa xarajatlar 21, foyda 0, ishlab chiqarish 0 | Yana 81 077 530,73; reviziya 1 |
| Q-11 | «Resurslar yig‘masi» tabi | 14 qator; ЗАТРАТЫ ТРУДА РАБОЧИХ-СТРОИТЕЛЕЙ 672 soat / 25 536 000; ВОДА 3,096 m3 / 27 864 — fayldagi «Сводка ресурсов» bilan bir xil («П» qatori qo‘shimcha, 0 bilan) |
| Q-12 | «Excel eksport» | Faylda «Smeta» va «Resurslar yig‘masi» varaqlari; Bo‘lim, Norma kodi, Resurs kodi ustunlari; oxirgi qator «QQS bilan jami» 81 077 530,73 |

## 3. Ombor

| ID | Qadam | Kutilgan natija |
|---|---|---|
| Q-13 | Admin → Ombor va materiallar → «Buyurtmachi materiallari» tabi | Ikki material: Блоки газобетонные (m3), Пленка полиэтиленовая (m2); hamma ustun 0 |
| Q-14 | Ombor mudiri → «Kirim»: bloklar 27,54 m3, tannarx 650 000; plyonka 264 m2, tannarx 4 200 | «Berilgan» 17 901 000 va 1 108 800; Moliyada yetkazib beruvchi qarzi paydo bo‘lmaydi |
| Q-15 | Ombor mudiri → «Jo‘natish»: brigadirga bloklar 20, plyonka 130; brigadir to‘liq qabul qiladi | «Buyurtmachi materiallari» jamlari o‘zgarmaydi |
| Q-16 | Brigadir → «Sarf»: bloklar 14, smeta qatori «Блоки газобетонные», zona 1-qavat; plyonka 125, smeta qatori «Пленка…», zona 2-qavat. Prorab ikkalasini tasdiqlaydi | Sarflangan 14 / 9 100 000 va 125 / 525 000; oxirgi qoldiq 13,54 va 139 |
| Q-17 | Brigadir: bloklar 1 m3 sarf (qatorga bog‘lab), prorab tasdiqlaydi; ombor mudiri shu sarfni storno qiladi | Sarflangan yana 14. Ma’lum nuqson K-1: smeta sahifasida bloklar «Fakt»i 15 ko‘rsatadi |
| Q-18 | Brigadir: bloklar 0,5 m3 sarf, smeta qatorini **tanlamasdan**; prorab tasdiqlaydi | Sarflangan 14,5; «bog‘lanmagan sarf» ogohlantirishi: 0,5 m3 |
| Q-19 | Ombor mudiri → Inventarizatsiya: bloklar haqiqiy 7,04 (hisobda 7,54) | «Inventarizatsiya» −0,5 / −325 000; oxirgi qoldiq 12,54 / 8 151 000 |

## 4. Ish hajmi va brigadir haqi

| ID | Qadam | Kutilgan natija |
|---|---|---|
| Q-20 | Brigadir → Hisobotlar: 4 ta kunlik hisobot, smeta qatori va hajm: КЛАДКА 90 m2; АРМИРОВАНИЕ 0,06 t; ШТУКАТУРКА 360 m2; СТЯЖКА 120 m2 (bo‘yash — hisobotsiz). Prorab hammasini qabul qiladi | Hisobotlar «Qabul qilingan» |
| Q-21 | Brigadir → hisobot kartalari | «Ishlab topilgan»: 815 328; 13 680; 1 720 944; 387 600 (hajm × avtomatik stavka; jami 2 937 552). Bu qadam 10-noyabr tekshiruvida yurgizilmagan — raqamlar D32 qoidasi bo‘yicha hisoblangan |
| Q-22 | Admin → Ombor → «Buyurtmachi materiallari» → «Ish bo‘yicha normativ sarf» | Bloklar: normativ 13,77, haqiqiy 14, farq **0,23 qizil**; plyonka: 132, 125, farq −7 |

## 5. Dalolatnoma va hisobot

| ID | Qadam | Kutilgan natija |
|---|---|---|
| Q-23 | Buxgalter → smeta → «Dalolatnoma (F-2/F-3)», joriy oy | Davr, yil boshidan, qurilish boshidan: **47 065 711,86**, shartnomadan 58,05 %; ogohlantirish: bog‘lanmagan sarf 0,5 m3; bo‘yash ishi jadvalda yo‘q |
| Q-24 | Jadvalda qatorlarni tekshiring | КЛАДКА 90 m2; ЗАТРАТЫ ТРУДА 106,2 soat / 4 035 600; КЛЕЙ 405 kg / 587 250; Блоки 14 m3 / 9 100 000; Пленка 125 m2 / 525 000 |
| Q-25 | «Excel (F-2, F-3)» | F-2: Итого прямых затрат 42 684 262; Прочие 21 % 8 963 695,02; Итого с НДС 47 065 711,86. F-3: ВСЕГО СМР 51 647 957,02; минус материалы заказчика 9 625 000; НДС 5 042 754,84; 58,05 % |
| Q-26 | Bosh muhandis → shu smetada dalolatnomani oching | Qoidaga ko‘ra ochilishi kerak. Ma’lum nuqson N-02: hozir «ruxsat yo‘q» chiqadi |
| Q-27 | Admin → «Buyurtmachi materiallari» → «Excel» | «Отчет» varag‘i: 11 ustun, «Итого» — berilgan 19 009 800, sarflangan 9 950 000, oxirgi qoldiq 8 734 800; «Нормативный расход» varag‘ida 13,77 va 132 |
| Q-28 | Ombor mudiri va brigadir → shu tab | Faqat miqdorlar: summa ustunlari, ish bo‘yicha jadval va shartnoma yo‘q |
| Q-29 | Keyingi oyni tanlang | Davr boshidagi qoldiq 12,54 / 8 151 000 va 139 / 583 800; berilgan va sarflangan 0 |

## 6. Smetani o‘zgartirish

| ID | Qadam | Kutilgan natija |
|---|---|---|
| Q-30 | Bosh muhandis → «Tahrirlash»: «П» qatoriga (ПРОФИЛЬ МАЯЧКОВЫЙ) miqdor 120, narx 8 000 → saqlang | Reviziya 2; Yakuniy jami 76 497 564; QQS bilan jami 82 378 522,73 (75 537 564 + 960 000, keyin 21 %, chegirma, 12 %) — qo‘lda hisoblangan, avtomatik tekshiruvda yurgizilmagan |
| Q-31 | Ombor qoldiqlari, «Buyurtmachi materiallari» va hisobotlarni qayta oching | Kirim, qoldiq, sarf va qabul qilingan hajmlar o‘zgarmagan; brigadir «Ishlab topilgan» summalari o‘zgarmagan |
