# Figma F1–F6 — ma’lumot kiritib, rollar bo‘yicha ketma-ket test ssenariysi

> **Sana:** 2026-10-17. **Qamrov:** PR #10. Test case ro‘yxati: `FIGMA_F1_F6_TEST_CASES.md`. Bu hujjat — o‘sha tekshiruvlarni **aniq ma’lumotlar** bilan bajarish tartibi.
> **Qoida:** qadamlarni tartib bilan bajaring. Har qadam oldingisi yaratgan ma’lumotdan foydalanadi, raqamlar oxirigacha bir-biriga mos tanlangan.
> **Korxona:** seed’dagi “Sinov korxona” (`admin` va xodimlar). Parol — `seed:dev` paytida tanlangan umumiy parol.
> **Sanalar** 2026-10-17 (bugun) asosida; boshqa kunda test qilsangiz, sanalarni shunga moslang.
> **“Sabab / izoh”** maydonlari kamida 5 belgi bo‘lishi kerak.

---

## A. Platforma egasi — `owner`

**1. Tarif yaratish.** Tariflar → “Yangi tarif versiyasi”:

| Maydon | Qiymat |
|---|---|
| Kod | `business` |
| Versiya | `1` |
| Oylik narx (UZS) | `1500000` |
| Foydalanuvchilar | `25` |
| Obyektlar | `10` |
| Fayl hajmi (MB) | `5120` |

Kutilgan natija: `business` kartasi chiqadi, narxi 1 500 000 so‘m.

**2. Kompaniya ochish (uch qadam).** Mijozlar → “Yangi kompaniya”:

| Qadam | Maydon | Qiymat |
|---|---|---|
| 1 | Kompaniya nomi | `Test Qurilish MChJ` |
| 1 | Mail manzil | `info@testqurilish.uz` |
| 1 | Mas’ul shaxs | `Aliyev Jasur` |
| 1 | Telefon raqami | `+998901234567` |
| 1 | Yuridik manzil | `Toshkent, Chilonzor 5` |
| 2 | Ro‘yxat raqami (STIR) | `309845217` |
| 2 | Tashkiliy shakl | `MChJ` |
| 2 | Shaxsiy belgi (alias) | `testqurilish` |
| 3 | Tarif versiyasi | `business v1` |
| 3 | Boshlanish sanasi | `2026-10-17` |

Kutilgan natija: kompaniya kartasi ochiladi, holati “Ro‘yxatdan o‘tmagan”, tarifi `business`.

**3. Tahrirlash.** Kartada “Tahrirlash” bosib, telefonni `+998907654321` ga almashtiring. Kutilgan natija: kartada yangi telefon ko‘rinadi.

**4. “Sinov korxona” uchun obuna.** Mijozlar → Sinov korxona:
- “Tarif biriktirish”: `business v1`, Saqlash.
- “Invoys chiqarish”: standart davr, Saqlash.
- Invoys qatorida “To‘lov yozish”:

| Maydon | Qiymat |
|---|---|
| Turi | To‘lov |
| Summa | `1500000` |
| Tashqi hujjat raqami | `PAY-001` |
| Sabab | `Oktyabr obunasi to‘lovi` |

Kutilgan natija: invoys to‘liq qoplangan. “Daromad va qarz” sahifasida oktyabr ustuni 1 500 000, “Kirim-chiqimlar” jadvalida PAY-001 yozuvi turadi.

---

## B. Mijoz admini — `admin`

**5. Obyekt.** Obyektlar → “Obyekt qo‘shish”:

| Maydon | Qiymat |
|---|---|
| Obyekt nomi | `Navoiy 28` |
| Loyiha kodi | `NAV-28` |
| Manzil | `Toshkent, Navoiy ko‘chasi 28` |
| Reja boshlanishi | `2026-10-01` |
| Reja tugashi | `2027-06-30` |
| Maydon, m² | `5400` |

Kutilgan natija: obyekt kartasi ochiladi, “Omborlar” tabida **“Asosiy ombor”** avtomatik paydo bo‘ladi.

**6. Blok.** “Zonalar / bloklar” → “Yangi blok qo‘shish”, nomi `A blok`.

**7. Xodimlarni biriktirish.** Obyekt → “Xodimlar” → “Xodim biriktirish” bilan quyidagilarni birma-bir qo‘shing:
- Menejer, Prorab, Brigadir, Buxgalter, Moliyachi — omborsiz;
- Omborchi — **“Asosiy ombor”** tanlab.

**8. Murojaat.** Obuna → “Yordam so‘rovi yuborish”, xabar: `Test: Navoiy 28 obyekti ochildi`.

**9. Ombor faqat ko‘rish uchun.** Ombor va materiallar sahifasida Kirim, Jo‘natish, Sarf tugmalari va “Yangi material” bo‘lmasligi kerak.

---

## C. Texnik xodim — `support`

**10.** Murojaatlar → 8-qadamdagi murojaatni tanlang. Javob yozing: `Qabul qilindi, rahmat`, keyin “Yuborish” va “Yakunlansin”.

Kutilgan natija:
- murojaat “Yakunlanganlar” ro‘yxatiga o‘tadi;
- `admin` bildirishnoma oladi;
- Mijozlar jadvalida “Domen” ustuni yo‘q, xodimlar soni o‘ngga tekislangan.

---

## D. Bosh muhandis — `manager`

**11. Smeta.** Smetalar → “Yangi smeta”, Smeta nomi `Navoiy 28 — poydevor`, obyekt `Navoiy 28`.

1-qator, Material:

| Maydon | Qiymat |
|---|---|
| Turi | Material |
| Kategoriya | `Poydevor` |
| Nomi | `Sement M500` |
| Material | “Yangi material” → nomi `Sement M500`, birlik **Tonna (t)** |
| Zona | `A blok` |
| Miqdor | `30` |
| Birlik narxi | `1200000` |

2-qator, ish:

| Maydon | Qiymat |
|---|---|
| Turi | Ish haqi |
| Kategoriya | `Poydevor` |
| Nomi | `Beton quyish` |
| Birlik | m³ |
| Zona | `A blok` |
| Miqdor | `50` |
| Birlik narxi | `150000` |

Saqlang. Kutilgan natija:
- material qatori 36 000 000, ish qatori 7 500 000;
- smeta jami **43 500 000**, “Poydevor” kategoriyasi jami ham shu.

**12. Vazifa.** Vazifalar → “Vazifa qo‘shish”:

| Maydon | Qiymat |
|---|---|
| Nomi | `A blok poydevorini quyish` |
| Bajaruvchi | Brigadir |
| Tekshiruvchi | Prorab |
| Muhimlik | Yuqori |
| Muddat | `2026-10-24` |
| Zona | `A blok` |

Kutilgan natija: karta Kanban’ning “Rejada” ustunida paydo bo‘ladi.

---

## E. Ombor mudiri — `warehouse`

**13. Kirim.** Kirim/Chiqim → “Kirim”:

| Maydon | Qiymat |
|---|---|
| Qayerga | Asosiy ombor |
| Material | Sement M500 |
| Miqdor | `20` |
| Birlik tannarxi | `1200000` |
| Sabab | `Qurilish Savdo yetkazib berdi` |

Kutilgan natija: “Kirimlar” segmentida yozuv turadi, Omborlar bo‘limida qoldiq 20 t, holati “Yetarli”.

**14. Minimal qoldiq.** Omborlar → Sement qatorida “Minimal qoldiq” = `25`. Kutilgan natija: holat **“Kam qoldi”**, bosh sahifadagi “Kam qolganlar” = 1.

**15. Jo‘natish.** Transferlar → “Jo‘natish”:

| Maydon | Qiymat |
|---|---|
| Qayerdan | Asosiy ombor |
| Qayerga | Brigadir qo‘lida |
| Material | Sement M500 |
| Miqdor | `8` |
| Sabab | `A blok poydevori uchun` |

Kutilgan natija: holat “Kutilmoqda”, omborda mavjud qoldiq 12 t (8 t rezervda).

---

## F. Brigadir — `brigadier`

**16. Qisman qabul.** Material qabul → jo‘natma → “Qabul qilish”, miqdor `6`. Kutilgan natija: holat **“Qisman”**, 2 t qabul qilinmagan.

**17. Sarf.** Qoldiqlar tabi → “Brigadir qo‘lida” qatorida “Sarf”:

| Maydon | Qiymat |
|---|---|
| Miqdor | `4` |
| Smeta qatori | Sement M500 |
| Zona | `A blok` |
| Sabab | `Poydevor betoni uchun sarf` |

Kutilgan natija: sarf “Kutilmoqda” holatida turadi va prorab bildirishnoma oladi.

**18. Talabnoma.** Material talabnomasi → “Material so‘rash”: Sement M500, miqdor `5`, kerak bo‘lgan sana `2026-10-20`, izoh `Ikkinchi quyish uchun`. Kutilgan natija: KPI jami 1, jarayonda 1.

**19. Ikkinchi talabnoma.** Xuddi shunday, miqdor `3`, izoh `Zaxira uchun`.

**20. Vazifa.** Vazifalar → 12-qadamdagi vazifa → “Boshlash”, keyin “Tekshiruvga yuborish”. Kutilgan natija: karta “Bajarilmoqda”, so‘ng “Tekshiruvda” ustuniga o‘tadi.

**21. Hisobot.** Hisobotlar → “Hisobot yaratish”:

| Maydon | Qiymat |
|---|---|
| Turi | Kunlik |
| Sana | `2026-10-17` |
| Obyekt | `Navoiy 28` |
| Zona | `A blok` |
| Bajarilgan ishlar | `A blok poydevoriga beton quyildi` |
| Smeta qatori | Beton quyish |
| Hajm | `10` |
| Foto | ixtiyoriy |

Kutilgan natija: hisobot ro‘yxatda “Kunlik” belgisi bilan, tekshiruvda turadi.

---

## G. Ombor mudiri — `warehouse`

**22. Bajarish.** Talabnomalar → 5 t talabnoma → “Jo‘natish bilan bajarish”, Qaysi ombordan: Asosiy ombor. Kutilgan natija: talabnoma “Bajarildi”, Transferlar’da yangi 5 t jo‘natma paydo bo‘ladi.

**23. Rad etish.** 3 t talabnoma → “Rad etish”, izoh `Hozircha zaxira kerak emas`.

Kutilgan KPI natijasi:

| Ko‘rsatkich | Qiymat |
|---|---|
| Jami | 2 |
| Bajarilgan | 1 |
| Rad etilgan | 1 |

---

## H. Brigadir — `brigadier`

**24.** Material qabul → 5 t jo‘natmani to‘liq qabul qiling (`5`). Kutilgan natija: holat “Bajarildi”. Brigadir qo‘lida hisobda 11 t (6 + 5), shundan 4 t tasdiqlanmagan sarf rezervida, mavjud 7 t.

---

## I. Ombor mudiri — `warehouse`

**25. Qolganini bekor qilish.** Transferlar → 8 t jo‘natma (Qisman) → “Qolganini bekor qilish”. Kutilgan natija: holat “Bekor qilingan”, ombor rezervi 0.

**26. Inventarizatsiya.** “Asosiy ombor” tanlangan holda “Inventarizatsiya”:
- Sanalgan miqdor: `8.5`
- Sabab: `Oylik sanoq, 0,5 t kamomad`

Kutilgan natija:
- hisobdagi 9 t o‘rniga 8,5 t qoladi;
- “Tuzatish” yozuvi yaratiladi;
- holat “Kam qoldi”.

---

## J. Prorab — `foreman`

**27. Narx ko‘rinmasligi.** Smetalar → “Navoiy 28 — poydevor”: miqdorlar bor, narx va summa ustunlari **yo‘q**. Obyektlar sahifasida “Obyekt qo‘shish” tugmasi yo‘q.

**28. Sarfni tasdiqlash.** Xomashyolar → Harakatlar → 4 t sarf → “Tasdiqlash”. Kutilgan natija: holat “Bajarildi”, brigadir qo‘lidagi qoldiq **7 t** (11 − 4), rezerv 0.

**29. Hisobotni qabul qilish.** Hisobotlar → 21-qadamdagi hisobot → “Qabul qilish”, izoh `Sifatli bajarildi`. Kutilgan natija: holat qabul qilingan. Bajarilgan hajm smetaga yoziladi: “Beton quyish” **10 / 50 m³ (20%)**, buni 45-qadamda Reja–fakt sahifasida tekshirasiz.

**30. Vazifani qabul qilish.** Vazifalar → 12-qadamdagi vazifa → “Qabul qilish”. Kutilgan natija: karta “Qabul qilingan” ustunida.

---

## K. Buxgalter — `accountant`

**31. Kontragentlar.** “Kontragent qo‘shish” bilan uchta yarating:

| Nomi | Turi | STIR |
|---|---|---|
| `Qurilish Savdo MChJ` | Yetkazib beruvchi | `301245789` |
| `Orzu Invest` | Buyurtmachi | `208451963` |
| `Kran Servis MChJ` | Pudratchi | `305147820` |

**32. Hisoblar.** Bank va kassa → “Hisob qo‘shish”: `Kapitalbank` (Bank) va `Asosiy kassa` (Kassa).

**33. Tushum.** Bank va kassa → “Operatsiya qo‘shish”:

| Maydon | Qiymat |
|---|---|
| Turi | Buyurtmachidan tushum |
| Bank/kassa hisobi | Kapitalbank |
| Kontragent | Orzu Invest |
| Summa | `60000000` |
| Tavsif | `Avans to‘lovi, Navoiy 28` |

Kutilgan natija: “Bank hisoblari” = **60 000 000**.

**34. O‘tkazma.** “Operatsiya qo‘shish”, Turi: Hisoblar aro o‘tkazma, Kapitalbank → Asosiy kassa, summa `10000000`, tavsif `Kassaga naqd pul`. Kutilgan natija: bank 50 000 000, kassa 10 000 000.

**35. Invoys.** Hisoblar va dalolatnomalar → “Invoys / dalolatnoma”:

| Maydon | Qiymat |
|---|---|
| Turi | Yetkazib beruvchi invoysi |
| Kontragent | Qurilish Savdo MChJ |
| Bog‘lanadigan ombor kirimi | 13-qadamdagi 20 t kirim |
| Summa | avtomatik **24 000 000** |
| To‘lov muddati | `2026-10-27` |
| Hujjat raqami | `SF-2026-001` |
| Tavsif | `Sement M500, 20 t` |

Kutilgan natija: “Schyot-fakturalar” segmentida, KPI “Kutilmoqda” = 1.

**36. Invoysni to‘lash.** Invoys qatorida “To‘lash”, hisob Kapitalbank, tavsif `SF-2026-001 to‘lovi`. Kutilgan natija: holat “To‘langan”, qoldiq 0, bank **26 000 000**.

**37. Dalolatnoma.** “Invoys / dalolatnoma”:

| Maydon | Qiymat |
|---|---|
| Turi | Xizmat |
| Kontragent | Kran Servis MChJ |
| Summa | `4000000` |
| To‘lov muddati | `2026-10-20` |
| Hujjat raqami | `DL-2026-015` |
| Tavsif | `Kran ijarasi, 3 kun` |

Kutilgan natija: “Dalolatnomalar” segmentida, “Kutilmoqda” holatida.

**38. Ish haqi.** Ish haqi → “Davr ochish”, oy `2026-10`. Keyin “Xodim qo‘shish”:

| Maydon | Qiymat |
|---|---|
| Xodim | Brigadir |
| Lavozim | `Brigadir` |
| Oklad | `7000000` |
| Bonus | `500000` |
| Ushlanma | `700000` |

Kutilgan KPI natijasi:

| Ko‘rsatkich | Qiymat |
|---|---|
| Fond | 7 500 000 |
| Hisoblangan | 6 800 000 |
| To‘lanadigan qoldiq | 6 800 000 |

**39. Davrni yopish va to‘lash.** “Davrni yopish (hisoblash)”, keyin xodim qatorida “To‘lash”, hisob Asosiy kassa. Kutilgan natija: to‘langan 6 800 000, qoldiq 0, kassa **3 200 000**.

**40. Mablag‘ ajratish.** Mablag‘ ajratish → “Ajratma / buyurtma”, Turi: Mablag‘ ajratish, summa `20000000`, tavsif `Poydevor ishlari uchun`. Kutilgan natija: KPI jami 1, summa 20 000 000. Bank va kassa qoldiqlari o‘zgarmaydi.

**41. Solishtirish.** Solishtirish → Qurilish Savdo MChJ. Kutilgan natija: invoys 24 000 000 va to‘lov 24 000 000, jami qarz **0**. “Dalolatnoma shakllantirish” chop etish oynasini ochadi.

---

## L. Finansist — `financier`

**42. Budjet.** Budjetlar → “Budjet qo‘shish”, oy `2026-10`, summa `40000000`. Kutilgan natija: sarflangan **16 200 000**, bajarilish **40.5%**. Yig‘indi quyidagicha:

| Xarajat | Summa |
|---|---|
| Sarf | 4 800 000 |
| Inventarizatsiya kamomadi | 600 000 |
| Kran xizmati | 4 000 000 |
| Ish haqi | 6 800 000 |
| **Jami** | **16 200 000** |

**43. To‘lov so‘rovi.** To‘lov so‘rovlari → “To‘lov so‘rovi”:

| Maydon | Qiymat |
|---|---|
| Obyekt | Navoiy 28 |
| Kontragent | Kran Servis MChJ |
| Bog‘langan hujjat | DL-2026-015 |
| Summa | avtomatik 4 000 000 |
| Muddat | `2026-10-20` |
| Maqsad | `Kran ijarasi uchun to‘lov` |

Kutilgan natija: holat “Kutilmoqda”, finansistda “Tasdiqlash” tugmasi **yo‘q**, chunki bu uning o‘z so‘rovi.

**44. To‘lov kalendari.** Bugun (17-oktabr) yashil nuqta turadi: invoys va ish haqi to‘lovlari. 20-oktabrda sariq nuqta turadi: dalolatnoma va so‘rov.

**45. Reja–fakt.** Kutilgan natija:

| Ko‘rsatkich | Qiymat |
|---|---|
| Rejadagi xarajatlar | 43 500 000 |
| Faktik xarajatlar | 16 200 000 |
| Farq | 27 300 000 |
| Reja bajarilishi | 37.2% |

Turlar kartalarida Material fakti 5 400 000 (sarf 4 800 000 va kamomad 600 000). Kategoriyalar jadvalida “Poydevor / Material” fakti 4 800 000: unga faqat smeta qatoriga bog‘langan sarf kiradi, kamomad kirmaydi. “Smeta qatorlari bo‘yicha” jadvalida “Beton quyish” bajarilishi 10 / 50 (20%).

---

## M. Yakuniy tekshiruv

**46. Admin tasdiqlaydi va to‘laydi.** `admin` bilan To‘lov so‘rovlari → 43-qadamdagi so‘rov → “Tasdiqlash”, so‘ng “To‘lash”, hisob Kapitalbank. Kutilgan natija: “To‘langan”, bank **22 000 000**, DL-2026-015 qoldig‘i 0.

**47. Admin bosh sahifasi va Moliya markazi.** Kutilgan natija:

| Ko‘rsatkich | Qiymat |
|---|---|
| Haqiqiy xarajat | 16 200 000 |
| Yetkazib beruvchilarga qarz | 0 |
| Tushum | 60 000 000 |

Ombor va materiallar sahifasida “Kam qolganlar” = 1.

**48. Audit.** `admin` → Audit jurnali: kirim, jo‘natish, qabul, sarf, to‘lov yozuvlari bor.

**49. Platforma egasi.** `owner` → Bosh sahifa:
- “So‘nggi operatsiyalar”da PAY-001 to‘lovi turadi;
- “Xodimlar taqsimoti”da Sinov korxona rollari ko‘rinadi;
- Mijozlar → Sinov korxona holati “To‘langan”.

---

## Yakuniy kutilgan raqamlar

| Ko‘rsatkich | Qiymat |
|---|---|
| Asosiy ombor, Sement M500 | 8,5 t (holat “Kam qoldi”, minimal 25) |
| Brigadir qo‘lida | 7 t |
| Kapitalbank | 22 000 000 |
| Asosiy kassa | 3 200 000 |
| Obyekt xarajati (oktyabr) | 16 200 000 |
| Smeta (reja) | 43 500 000 |
| Beton quyish bajarilishi | 10 / 50 m³ (20%) |
| Yetkazib beruvchi va pudratchi qarzi | 0 |
| Talabnomalar | 2 (1 bajarilgan, 1 rad etilgan) |
| Platforma tushumi (Sinov korxona) | 1 500 000 |

Raqam boshqacha chiqsa — qadam raqami, kutilgan va haqiqiy qiymat, skrinshot bilan yozing.
