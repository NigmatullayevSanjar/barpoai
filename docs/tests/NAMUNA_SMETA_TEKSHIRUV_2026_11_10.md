# Namuna smeta (Form 5) bilan S1–S5 tekshiruvi — 2026-11-10

**Fayl:** `docs/research/NAMUNA_SMETA_FORM5_2026_11_10.xlsx`. Bu o‘quv namunasi: 2 qavatli ofis, 3 bo‘lim, 5 ish va 28 qator. Faylda «Генподрядчик» materiallari (2 ta), «П» qatori (1 ta), jamlar bloki (21 %, ВОЗВРАТ, НДС 12 %), «Сводка ресурсов» va «Hisob-kitob» (VMQ 583) varaqlari bor. Haqiqiy kompaniya ma’lumoti yo‘q.

**Muhit:** lokal stack, API image S5 kodi bilan. Test `QA-202611100458-NAMUNA` kompaniyasida o‘tdi, 7 rol, obyektning brigada foizi 20 %. Oxirida kompaniya `qa:cleanup` bilan o‘chirildi (53 jadval). Kod, migratsiya va testlar o‘zgartirilmadi.

**Usul:** kutilgan qiymatlar Excel kirish kataklaridan (norma, ish hajmi, narx) Python skripti bilan alohida hisoblandi, platforma kodi ishlatilmadi. Bu hisob faylning o‘zidagi formulalar natijasi bilan tiyinigacha bir xil chiqdi. Import brauzerdagi Form 5 oynasi orqali bosh muhandis sifatida qilindi. Qolgan qadamlar API va brauzer orqali bajarildi.

## Natija

40 ta tekshiruv: **38 tasi o‘tdi, 1 tasi yiqildi, 1 tasi ma’lumot uchun**. Yiqilgan tekshiruv avvalgi hisobotdagi N-02, kod hali tuzatilmagan. Yangi kritik nuqson topilmadi.

| Ko‘rsatkich | Excel | Platforma |
|---|---|---|
| ВСЕГО ЗАТРАТ | 75 537 564 | 75 537 564 |
| ЗАРПЛАТА / ЭКСПЛУАТАЦИЯ МАШИН | 25 969 200 / 1 692 000 | 25 969 200 / 1 692 000 |
| Материалы генподрядчика / субподрядчика | 19 009 800 / 28 866 564 | 19 009 800 / 28 866 564 |
| ПРОЧИЕ ЗАТРАТЫ 21 % | 15 862 888,44 | 15 862 888,44 |
| ИТОГО С УЧЕТОМ ПРОЧИХ (QQSsiz) | 72 390 652,44 | 72 390 652,44 |
| ИТОГО С НДС | 81 077 530,73 | 81 077 530,73 |
| VMQ 583 («Hisob-kitob» C ustuni), QQS bilan | 88 268 706,83 | 88 268 706,83 |
| «Сводка ресурсов» ИТОГО | 75 537 564 | 75 537 564 |

Tezlik: fayl tekshiruvi 0,21 s, preview 0,14 s, smetani yaratish 0,14 s.

## Topilmalar

| ID | Daraja | Topilma | Holat |
|---|---|---|---|
| N-02 | Yuqori (eski) | Bosh muhandis dalolatnomani ocholmaydi: `GET /v1/estimates/:id/acts` → 403 `PAGE_ACTION_FORBIDDEN`. Qoidaga ko‘ra ruxsat bor. | 2026-11-08 hisobotida qayd etilgan, hali tuzatilmagan |
| K-1 | O‘rta (ma’lum cheklov) | Smeta sahifasidagi material qatori «Fakt»i storno qilingan sarfni ayirmaydi. Bloklar: 15 m³ / 9 750 000, holbuki dalolatnoma va buyurtmachi materiallari hisoboti to‘g‘ri — 14 m³ / 9 100 000. «Umumiy» tabidagi turlar, kategoriyalar va zonalar «Fakt»i ham shunday. Kod: `backend/src/routes-operations.ts:421` (guruh jamlari), `:467-472` (`fact_quantity`, `fact_value`), `backend/src/estimates.ts:26,29` (vazifalardagi foiz). | `BARPO_BUSINESS_RULES.md:123` da «reja–fakt material fakti reversalsiz, o‘zgarmaydi» deb yozilgan. Egasi qarori kerak: endi S4/S5 dagi raqam bilan farq ko‘rinib turadi |
| K-2 | Ma’lumot | «Hisob-kitob» varag‘ining D ustuni (ish haqi stavkasi 68 000 bilan, QQS bilan 118 004 807,63) platformada hisoblanmaydi. Stavka qator narxida turadi; uni almashtirish — qatorlarni tahrirlash yoki yangi reviziya. | S1–S5 rejasida yo‘q; `SMETA_TADQIQOT_2026_11_06.md` da egasiga savol |
| K-3 | Past (eski N-05) | Dalolatnoma Excel fayli nomida kirillcha smeta nomi tushib qoladi: `akt-_-2026-11-01-2026-11-30.xlsx`. | Avvalgi hisobotda qayd etilgan |
| K-4 | Kuzatuv | F-2 da ishlar dalolatnoma ichida qayta raqamlanadi: bo‘yash bajarilmagani uchun Excel’dagi 5-ish dalolatnomada 4-raqamda chiqadi. Norma platforma birligida ko‘rsatiladi: 1,18 kishi-soat/m², Excel’dagi 118 / 100 m² o‘rniga. Summalar to‘g‘ri. | Egasi bilan kelishish kerak |

## Tekshiruvlar

| ID | Qadam | Kutilgan natija | Natija |
|---|---|---|---|
| S5-01 | Import oldidan «Buyurtmachi materiallari» tabi | Bo‘sh holat | ✅ API 0 material; UI matni chiqdi |
| N-S1-01 | Faylni Form 5 oynasiga yuklash | Form 5 deb taniladi; faqat «Ресурсная ведомость»: 5 ish, 20 resurs, 3 material, 22 narxli qator; qolgan 3 varaq yopiq | ✅ |
| N-S1-02 | Excel jamlar bloki qatorma-qator | 12 qatorning hammasida farq 0 | ✅ 12/12 |
| N-S1-03 | Taklif qilingan sozlamalar | «Erkin» 21 %, QQS 12 %, chegirish yoqilgan, 2 qator uchun «Buyurtmachi» | ✅ UI maydonlari ham shu qiymatda |
| N-S1-04 | «П» qatori (26-qator, ПРОФИЛЬ МАЯЧКОВЫЙ ПМ-6) | Ogohlantirish; miqdor 0 m, «Pudratchi», izoh «П — miqdor loyihadan» | ✅ |
| N-S1-05 | Boshqa ogohlantirishlar | Narxsiz, miqdor nomuvofiq, noma’lum birlik, narxi turlicha va hajmsiz ish — hammasi 0 | ✅ |
| N-S1-06 | Qavatlar | 1-qavat (1–2-bo‘lim), 2-qavat (3-bo‘lim); 10 material va 2 zona yaratiladi | ✅ |
| N-S1-07 | 28 qator mustaqil hisob bilan | Tur, shifr, nom, birlik, miqdor, narx va jami bir xil; ish qatorida asl «100 М2» izohda | ✅ 28/28 |
| N-S2-01 | Bo‘limlar | 29 531 124; 30 747 960; 15 258 480 | ✅ |
| N-S2-02 | Resurslar yig‘masi va «Сводка ресурсов» | 13 resurs: kod, nom, birlik, miqdor, summa bir xil | ✅ «П» qatori qo‘shimcha 14-qator bo‘lib chiqadi (0 m, 0 so‘m) |
| N-S2-03 | Sarlavha va shartnoma | Saqlanadi, reviziya 1 bo‘lib qoladi | ✅ |
| N-S2-04 | Smeta Excel eksporti | Bo‘lim, Norma kodi va Resurs kodi ustunlari; «Resurslar yig‘masi» varag‘i; 28 qator yig‘indisi 75 537 564; oxirgi qator 81 077 530,73 | ✅ |
| N-S3-01 | Smeta yakuni «Erkin» 21 % | 13 qator Excel bilan bir xil | ✅ |
| N-S3-02 | VMQ 583: boshqa 20 %, foyda 7 %, ishlab chiqarish 2,5 % | «Hisob-kitob» C ustuni bilan bir xil | ✅ 12/12 |
| N-S3-03 | VMQ 583: ishlab chiqarish 5 %; foyda 6 % | Mustaqil hisob bilan mos; foyda 6 % → 400 `VMQ583_PRESET` | ✅ QQS bilan 90 383 758,62 |
| N-S3-04 | «Erkin», chegirmasiz va QQSsiz | Jami 91 400 452,44; QQS qatori yo‘q | ✅ |
| N-S3-05 | Faylning sozlamasiga qaytarish | 81 077 530,73; reviziya 1 | ✅ |
| N-S3-06 | Brigada akkord stavkasi (D32) | 9 059,20 / 228 000 / 4 780,40 / 2 888 / 3 230 | ✅ |
| N-S3-07 | «Hisob-kitob» D ustuni | — | ℹ️ K-2 |
| S5-02 | Import qilingandan keyin | Ikki material (bloklar m³, plyonka m²), hammasi 0 | ✅ |
| S5-03 | Kirim: 27,54 × 650 000 va 264 × 4 200 | Berilgan 17 901 000 va 1 108 800; qarz yo‘q | ✅ moliya hujjati 0 |
| S5-04 | Brigadirga 20 m³ va 130 m² berish | Jamlar o‘zgarmaydi | ✅ |
| S5-05 | Bog‘langan sarf 14 m³ va 125 m², prorab tasdiqlaydi | Oxirgi qoldiq 13,54 va 139; haqiqiy sarf 14 va 125 | ✅ tasdiqgacha sarf 0 |
| S5-06 | 1 m³ sarf va storno | Sarflangan 14 bo‘lib qoladi | ✅ (smeta sahifasidagi «Fakt» — K-1) |
| S5-07 | 0,5 m³ bog‘lanmagan sarf | Sarflangan 14,5; ogohlantirish 0,5 | ✅ |
| S5-08 | Ish hajmini qabul qilish: 90/180, 0,06/0,12, 360/360, 120/240 | Bloklar: normativ 13,77, farq +0,23 (qizil). Plyonka: 132 va −7 | ✅ |
| S5-09 | Inventarizatsiya 7,54 → 7,04 | −0,5 / −325 000; oxirgi qoldiq 12,54 / 8 151 000 | ✅ |
| S5-10 | Dekabr | Davr boshida 12,54 / 8 151 000 va 139 / 583 800; harakat 0 | ✅ |
| S5-11 | Plyonka boshqa smetada «Pudratchi» | «Aralash» ogohlantirishi faqat plyonkaga | ✅ |
| S5-12 | Teskari sana oralig‘i | 400 `DATE_RANGE_INVALID` | ✅ |
| S5-13 | Excel (admin, buxgalter) | «Отчет» 11 ustun va «Итого»; «Нормативный расход» da 13,77, 132 va «Без привязки…» | ✅ |
| S5-14 | Rollar | Omborchi va brigadir: summa, ish jadvali va shartnoma yo‘q. Prorab: 2 qatorli jadval va farq bor, summa yo‘q | ✅ Moliyachi 403 — rolda `stock.read` yo‘q, qoidaga mos |
| S5-15 | Hisobot hech narsani o‘zgartirmaydi | Ombor va moliya holati bir xil; auditda `export.customer_materials` | ✅ |
| N-S4-01 | F-2, noyabr | Resurs hajmi = reja × bajarilgan ulush; buyurtmachi materiali bog‘langan sarfdan | ✅ 23 qator mos; nol qatorlar (bo‘yash, «П») chiqmaydi |
| N-S4-02 | F-3 zanjiri va shartnoma foizi | To‘g‘ridan-to‘g‘ri 42 684 262; 21 % 8 963 695,02; QQS bilan 47 065 711,86; 58,05 % | ✅ |
| N-S4-03 | Dalolatnoma Excel | F-2 va F-3 varaqlari, summalar yuqoridagidek; F-3 ф3 tuzilishida (21 % «ВСЕГО СМР» ichida) | ✅ |
| N-S4-04 | Bosh muhandis dalolatnomani ochadi | 200 | ❌ 403 — N-02 |
| N-S4-05 | Oktyabr dalolatnomasi | Hamma summa 0 | ✅ |
| N-E-01 | Preview’da «Pudratchi» tanlash | Buyurtmachi materiallari 0; Excel’dagi farqli qatorlar ko‘rinadi; QQS bilan 102 368 506,73 | ✅ farq ±19 009 800 to‘rtta qatorda |
| N-E-02 | Boshqa obyektda S5 | Bo‘sh | ✅ |

## Skrinshotlar

- `docs/tests/screenshots/namuna-s1-preview.png` — import oynasi: Excel jamlari, sozlamalar, «П» ogohlantirishi.
- `docs/tests/screenshots/namuna-s1-smeta.png` — import qilingan smeta: guruhlar, avtomatik stavkalar, smeta yakuni.
- `docs/tests/screenshots/namuna-s4-dalolatnoma.png` — noyabr dalolatnomasi oynasi (buxgalter).
- `docs/tests/screenshots/namuna-s5-buyurtmachi-materiallari.png` — buyurtmachi materiallari, noyabr (admin).
