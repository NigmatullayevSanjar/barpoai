# Figma redizayni (F1–F6) — rollar bo‘yicha ketma-ket qo‘lda test

> **Sana:** 2026-10-17. **Qamrov:** PR #10 (`claude/figma-stage-1`): F1–F6 bosqichlari va sidebar/jadval tuzatishi (`3da615c`). Egasi qarorlari D17–D20 `docs/TZ_VA_NARX_REJASI.md` da.
> **Avtomatik testlar** (`TZ=UTC`): unit 27, integration 75, roles 5, UI 49 — hammasi o‘tgan. Bu hujjat brauzerda **qo‘lda**, rollar ketma-ketligida tekshiriladigan qismlar.
> **Tartib muhim:** bo‘limlar ma’lumot oqimi bo‘yicha. Har rol keyingisi uchun ma’lumot yaratadi (obyekt → smeta → kirim → jo‘natish → qabul → sarf → tasdiq → moliya). Bo‘limlarni yuqoridan pastga, o‘tkazib yubormasdan bajaring.
> **Natija fayli:** `docs/tests/FIGMA_F1_F6_NATIJA.md` (ID, natija, izoh, skrinshot).

---

## 0. Tayyorgarlik (lokal, Windows)

1. Branch: `git checkout claude/figma-stage-1`, `git pull`.
2. `backend` da `docker compose up --build -d`. Migratsiyalar 022 (“Asosiy ombor”) va 023 (kompaniya profili) qo‘llanadi. Tekshirish: `curl http://127.0.0.1:3001/health/ready` → `{"status":"ok"}`.
3. `frontend` da `pnpm.cmd dev`, brauzerda `http://localhost:5173`.
4. Hisoblar (`seed:dev` bilan yaratilgan, parol — seed paytida o‘zingiz tanlagan):

   | Login | Rol |
   |---|---|
   | `owner` | Platforma egasi |
   | `superadmin` | Super admin |
   | `support` | Texnik xodim |
   | `admin` | Mijoz admini (“Sinov korxona”) |
   | `manager` | Bosh muhandis |
   | `warehouse` | Ombor mudiri |
   | `brigadier` | Brigadir |
   | `foreman` | Prorab |
   | `accountant` | Buxgalter |
   | `financier` | Finansist |

5. Rollar orasida tez o‘tish uchun har rolni alohida brauzer profilida yoki inkognito oynada oching (cookie sessiyalar aralashmaydi).
6. Butun test davomida brauzer konsoli (F12) ochiq tursin.

Natija qiymatlari: **o‘tdi**, **yiqildi** (qadam, kutilgan va haqiqiy natija, skrinshot), **o‘tkazib yuborildi** (sababi bilan).

**Xato deb hisoblanmaydi (D17, ma’lumot yo‘q):** davomat, ishchi kuchi, xavfsizlik, CPU/RAM monitoringi, uptime, zaxira nusxalar, Didox/iHamkor/SMS integratsiyalari, balans/soliq/foyda-zarar hisobotlari, likvidlik ko‘rsatkichlari, xarajat kategoriyalari bo‘yicha budjet, kontragent tomonidagi solishtirma raqamlar, platforma “Hodimlar” va “Ruxsatlar” sahifalari, chat xabarlari tarixi (bitta javob saqlanadi), “Eksport” (kompaniyalar ro‘yxati), tarifni o‘chirish.

---

## 1. Har rolda takrorlanadigan umumiy tekshiruvlar

Har rol bo‘limini boshlaganda shu ro‘yxatni ham o‘tkazing (natijada ID ga rol qo‘shing, masalan `GEN-01/foreman`).

| ID | Qadam | Kutilgan natija |
|---|---|---|
| GEN-01 | Kirish, so‘ng sidebar’dagi har bir bandni ketma-ket bosish | Har sahifada **faqat bitta** band faol (bordo fon va o‘ngda oq chiziq). “Bosh sahifa” boshqa sahifalarda yonmaydi |
| GEN-02 | Sichqoncha bilan bandni bosish | Band atrofida qizg‘ish hoshiya paydo bo‘lmaydi (faqat Tab bilan yurganda ingichka oq chiziq) |
| GEN-03 | Bosh sahifa | Sarlavha rolga xos; “So‘nggi bildirishnomalar” kartasi **yo‘q**; raqamlar demo emas (bo‘sh bo‘lsa “Ma’lumot yo‘q”) |
| GEN-04 | Qo‘ng‘iroq, UZ/RU, UZS/USD | Joyida va ishlaydi; RU’da xom kalit (`stock.xxx`) yo‘q; USD da summalar kurs bo‘yicha |
| GEN-05 | Raqamli ustunli istalgan jadval | Sarlavha va qiymat **ikkalasi ham o‘ngda** (bir chiziqda) |
| GEN-06 | Mobil kenglik (DevTools, 375 px): menyu → bandni bosish | Menyu yopiladi (ombor bo‘limlari `?tab=` orasida ham) |
| GEN-07 | Konsol | Qizil xato yo‘q |

---

## 2. Platforma egasi (`owner`) — boshlanish

| ID | Qadam | Kutilgan natija |
|---|---|---|
| OW-01 | Kirish | “Platforma boshqaruv paneli”: KPI — Kompaniyalar, Umumiy hodimlar, Faol obunalar, Oylik daromad, Qarzdorlik, Tushgan pul; “Oylik daromad dinamikasi” (invoyslar va tushum), “Kompaniyalar holati”, “Xodimlar taqsimoti” (rollar), “So‘nggi operatsiyalar” |
| OW-02 | Menyu | Bosh sahifa, Mijozlar, Tariflar, Daromad va qarz, Qarzdorlar, Murojaatlar, Audit |
| OW-03 | Tariflar | Har tarif versiyasi alohida **karta**: kod, versiya, oylik narx, limitlar (foydalanuvchilar chizig‘i), kompaniyalar soni; “O‘chirish” tugmasi yo‘q |
| OW-04 | Tariflar → “Yangi tarif versiyasi” (`business`, v1, narx, limitlar) → Yaratish | Yangi karta paydo bo‘ladi |
| OW-05 | Kartada “Tarifni tahrirlash” → narxni o‘zgartirish | Saqlanadi; versiya raqami o‘zgarmaydi |
| OW-06 | Mijozlar | Jadval: Kompaniya nomi, (Domen — alias bo‘lsa), Tarif, Xodimlar, Holat (“Sinov · N kun qoldi”), Sana; qidiruv, “Barcha holatlar”, “Barcha tariflar” filtrlari |
| OW-07 | “Yangi kompaniya” → 1-qadam: nom, mail, mas’ul shaxs, telefon, manzil → Keyingisi | 2-qadamga o‘tadi; nom bo‘sh bo‘lsa Keyingisi faol emas |
| OW-08 | 2-qadam: ro‘yxat raqami (STIR), tashkiliy shakl (MChJ), alias → Keyingisi; “Orqaga” bosib qaytish | Orqaga qaytganda 1-qadam qiymatlari saqlangan |
| OW-09 | 3-qadam: tarif (OW-04), boshlanish sanasi → Yaratish | Kompaniya kartasi ochiladi; holat “Ro‘yxatdan o‘tmagan”; tarif biriktirilgan |
| OW-10 | Kartada “Tahrirlash” → mas’ul shaxs, telefon (`+998901234567`), shaklni o‘zgartirish | Saqlanadi, kartada yangi qiymatlar; noto‘g‘ri e-mail rad etiladi |
| OW-11 | Mijozlar → filtr “Barcha tariflar” → `business` | Faqat shu tarifdagi kompaniyalar |
| OW-12 | “Daromad va qarz” | “Ohirgi 6 oylik daromad dinamikasi”, “Qarzdorlik taqsimoti” (donut: muddati o‘tgan / joriy), “1 oylik buxgalter hisoboti” (oy tanlash; kirim-chiqimlar qoldiq bilan; Daromad-zarar kartalari), invoyslar jadvali |

---

## 3. Texnik xodim (`support`) va super admin (`superadmin`)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| SP-01 | `support` bilan kirish | “Mijoz kompaniyalar” ochiladi; menyuda 7 band; faqat “Mijozlar” faol |
| SP-02 | Mijozlar jadvali | “Xodimlar” sarlavhasi va raqamlari **o‘ngda bir chiziqda**; “Domen” ustuni **yo‘q** (alias egasining shaxsiy belgisi); “Yangi kompaniya” tugmasi yo‘q |
| SP-03 | Qatorni bosish | Kompaniya kartasi faqat o‘qish uchun (Bloklash, Tahrirlash, Invoys tugmalari yo‘q) |
| SP-04 | Tariflar | Kartalar bor, “Yangi tarif versiyasi” va “Tarifni tahrirlash” yo‘q |
| SP-05 | Diagnostika | KPI: Bugungi xatoliklar, Worker navbati, Sessiyalar, Ma’lumotlar bazasi (“Ishlayapti”); “Xatoliklar dinamikasi (haftalik)”; “Integratsiya holati” (Telegram bot, CBU valyuta kursi — oxirgi sinxronizatsiya bilan); “Diagnostika jurnali” |
| SP-06 | Murojaatlar | Chap — qidiruv, “Aktivlar / Yakunlanganlar / Hammasi”, ro‘yxat; o‘ng — “Murojaatni tanlang”. (Murojaat 4-bo‘limda admin yuboradi, SP-07 o‘shandan keyin) |
| SA-01 | `superadmin` bilan kirish | Bosh sahifa ochiladi; Audit va Texnik xodimlar sahifalari bor; biznes tugmalari (tarif, kompaniya, invoys) yo‘q |

---

## 4. Mijoz admini (`admin`) — tayyorgarlik ma’lumotlari

| ID | Qadam | Kutilgan natija |
|---|---|---|
| AD-01 | Kirish, menyu | Guruhlar: Asosiy, Moliya, Boshqaruv; bosh sahifa Bosh muhandis ko‘rinishida (obyektlar jadvali, xarajatlar grafigi) |
| AD-02 | Obyektlar → “Obyekt qo‘shish” (nom, kod, sanalar) | Obyekt kartasi rasmli ko‘rinishda; ichida “Omborlar” tabida **“Asosiy ombor” avtomatik** bor |
| AD-03 | Obyekt → “Zonalar / bloklar” → “Yangi blok qo‘shish” | Blok kartasi chiqadi |
| AD-04 | Obyekt → “Xodimlar” → “Xodim biriktirish”: `manager`, `foreman`, `brigadier`, `accountant`, `financier`; `warehouse` — “Asosiy ombor” bilan | Hammasi ro‘yxatda; brigadir uchun ombor sahifasida “Brigadir qo‘lida” hisobi paydo bo‘ladi |
| AD-05 | Ombor va materiallar | KPI va qoldiqlar ko‘rinadi; **Kirim / Jo‘natish / Sarf / Qaytarish tugmalari yo‘q**; Materiallar tabida “Yangi material” yo‘q |
| AD-06 | Xodimlar | KPI (jami/faol/nofaol), avatar bilan ism, telefon, lavozim, holat; “Xodim qo‘shish” bor |
| AD-07 | Rollar va ruxsatlar → Prorab; Xodimlar → `foreman` kartasi | Matritsada Obyektlar “yaratish” standartda **yopiq**; kartada narxni ko‘rish (`prices.read`) berilmagan. Admin ochishi mumkin — ochmang, 9-bo‘lim standart holatni tekshiradi |
| AD-08 | Obuna → “Yordam so‘rovi yuborish” (matn: “Test: sidebar”) | Yuborildi xabari |
| SP-07 | (`support` oynasi) Murojaatlar → AD-08 murojaatini tanlash → javob yozib “Yuborish” | O‘ngda mijoz xabari va bordo “Texnik xodim” pufakchasi; admin bildirishnoma oladi |
| SP-08 | “Yakunlansin” → “Yakunlanganlar” | Murojaat yakunlanganlar ro‘yxatida; “Qayta ochish” bilan qaytadi |

---

## 5. Bosh muhandis (`manager`)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| MG-01 | Menyu | Bosh sahifa, Obyektlar, Smetalar, Vazifalar, Xomashyolar, Hisobotlar, Xodimlar |
| MG-02 | Obyektlar | AD-02 obyekti kartada: progress, mas’ul, smeta va xarajat summalari; “Obyekt qo‘shish” **bor** |
| MG-03 | Smetalar → “Yangi smeta” (yoki “Excel import”): material qatori (masalan Sement M500), ish qatori | Saqlanadi; smetalar ro‘yxatida KPI (soni, qatorlar, jami); smeta ko‘rishda kategoriyalar yig‘iladi/ochiladi, kategoriya jamlari, hisoblash kartasi, **narxlar ko‘rinadi** |
| MG-04 | Vazifalar → “Vazifa qo‘shish” (bajaruvchi `brigadier`, daraja yuqori, muddat) | Kanban’da rangli nuqtali ustunda karta; daraja belgisi, sana, bajaruvchi |
| MG-05 | Xodimlar | Ro‘yxat ko‘rinadi, lekin “Xodim qo‘shish” va tahrirlash **yo‘q** |
| MG-06 | Xomashyolar | Qoldiqlar faqat ko‘rish; ombor amallari tugmalari yo‘q |

---

## 6. Ombor mudiri (`warehouse`)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| WH-01 | Menyu | Bosh sahifa, Kirim/Chiqim, Omborlar, Talabnomalar, Transferlar, Inventarizatsiya, Materiallar — hammasi bitta ombor sahifasining bo‘limlari; har bandda sarlavha o‘zgaradi va faqat o‘sha band yonadi |
| WH-02 | Materiallar → “Yangi material” (agar MG-03 da yaratilmagan bo‘lsa) | Katalogda paydo bo‘ladi |
| WH-03 | Kirim/Chiqim → “Kirim”: Asosiy ombor, material, miqdor 100, birlik tannarxi | Harakatlar ro‘yxatida; “Kirimlar” segmentida ko‘rinadi, “Chiqimlar” da yo‘q |
| WH-04 | Omborlar | “Holati” ustuni: 0 — “Tugagan” (qizil), minimaldan past — “Kam qoldi” (to‘q sariq), aks holda “Yetarli” (yashil); qiymat ustuni bor |
| WH-05 | Omborlar → qatorda “Minimal qoldiq” = 120 | Holat “Kam qoldi” ga o‘tadi; bosh sahifadagi “Kam qolganlar” soni oshadi |
| WH-06 | Transferlar → “Jo‘natish”: Asosiy ombor → Brigadir qo‘lida, miqdor 40 | Transferlar bo‘limida “Kutilmoqda” holatida |
| WH-07 | Inventarizatsiya | Birinchi ombor hisobi tanlangan holda ochiladi, yo‘riqnoma chiqadi; rezerv (WH-06) yopilmaguncha inventarizatsiya rad etiladi — bu to‘g‘ri |

---

## 7. Brigadir (`brigadier`)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| BR-01 | Menyu | Bosh sahifa, Vazifalar, Material qabul, Material talabnomasi, Hisobotlar; “Material qabul” da **faqat u** faol (Bosh sahifa va talabnoma yonmaydi) |
| BR-02 | Material qabul | Sarlavha “Material qabul qilish”; WH-06 jo‘natmasi ro‘yxatda |
| BR-03 | “Qabul qilish” → 30 (qisman) | Holat “Qisman”; qoldiq 10 |
| BR-04 | Omborda (Qoldiqlar tabi) “Brigadir qo‘lida” hisobidan “Sarf”: 10, smeta qatori MG-03 | Sarf taklifi “Kutilmoqda” (prorab tasdiqlaydi) |
| BR-05 | Material talabnomasi → “Material so‘rash” (miqdor 50, sana, izoh) | KPI: jami/jarayonda oshadi; brigadir **faqat o‘z** talabnomalarini ko‘radi |
| BR-06 | Vazifalar → MG-04 vazifasi → holatni o‘zgartirish | Kanban ustuni almashadi |
| BR-07 | Hisobotlar → “Hisobot yaratish” (kunlik): raqamlangan bo‘limlar, bajarilgan ish (smeta qatori, hajm), foto | Ro‘yxatda “Kunlik” belgisi bilan, holat tekshiruvda |

---

## 8. Ombor mudiri (`warehouse`) — talabnomalar

| ID | Qadam | Kutilgan natija |
|---|---|---|
| WH-08 | Talabnomalar | KPI: Jami, Yangi (jarayonda), Bajarilgan, Rad etilgan; BR-05 talabnomasi “Kutilmoqda” |
| WH-09 | “Jo‘natish bilan bajarish” (ombordan brigadirga) | Talabnoma “Bajarildi”; Transferlar’da yangi jo‘natma |
| WH-10 | Yangi talabnoma (brigadir oynasidan yana bittasi) → “Rad etish” izoh bilan | “Rad etildi”; brigadirda izoh ko‘rinadi |

---

## 9. Prorab (`foreman`)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| FM-01 | Menyu | Bosh sahifa, Obyektlar, Smetalar, Vazifalar, Xomashyolar, Hisobotlar |
| FM-02 | Obyektlar | “Obyekt qo‘shish” va “Yangi blok qo‘shish” **yo‘q**; kartalarda smeta/xarajat summalari **yo‘q** |
| FM-03 | Smetalar → MG-03 smetasi | Qatorlar va miqdorlar bor, **narx va summa ustunlari yo‘q** |
| FM-04 | Xomashyolar | Qiymat (so‘m) ustuni yo‘q |
| FM-05 | Xomashyolar → Harakatlar → BR-04 sarf taklifi → “Tasdiqlash” | “Bajarildi”; brigadir qoldig‘i kamayadi |
| FM-06 | Hisobotlar → BR-07 hisoboti → tekshirish (izoh bilan qabul yoki qaytarish) | Hisobot kartasida tekshiruvchi izohi; brigadirga bildirishnoma |
| FM-07 | Bosh sahifa | “Prorab operativ paneli”: obyektlar, bugungi ishlar, kechikishlar, materiallar; narx yo‘q |

---

## 10. Buxgalter (`accountant`)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| AC-01 | Menyu | Bosh sahifa, Birlamchi hujjatlar, Hisoblar va dalolatnomalar, Bank va kassa, Kontragentlar, Ish haqi, Solishtirish, Moliyaviy hisobotlar, Mablag‘ ajratish |
| AC-02 | Kontragentlar → “Kontragent qo‘shish” (yetkazib beruvchi, STIR) | KPI: debitorlik, kreditorlik, muddati o‘tgan; tur filtri; jadvalda STIR, oxirgi operatsiya, holat |
| AC-03 | Bank va kassa → “Hisob qo‘shish”: bank va kassa | Yuqorida “Bank hisoblari” va “Kassa balansi” kartalari |
| AC-04 | Hisoblar va dalolatnomalar → “Invoys / dalolatnoma”: yetkazib beruvchi invoysi, WH-03 kirimiga bog‘lash, to‘lov muddati | KPI: Jami hisoblar, To‘langan, Kutilmoqda, Muddati o‘tgan; “Schyot-fakturalar” segmentida ko‘rinadi |
| AC-05 | Shu invoys → “To‘lash” (bank hisobidan) | Holat “To‘langan”, qoldiq 0; Bank va kassa → “Bank operatsiyalari” da chiqim |
| AC-06 | “Invoys / dalolatnoma” → xizmat (kran ijarasi), muddat | “Dalolatnomalar” segmentida |
| AC-07 | Mablag‘ ajratish (sarlavha “Talabnomalarga pul ajratish”) → “Ajratma / buyurtma”: obyektga mablag‘ ajratish | KPI: Jami ajratmalar va summa; jadvalda mas’ul ustuni; bu yozuv xarajat yoki pul chiqimi emas |
| AC-08 | Ish haqi → “Davr ochish” → “Xodim qo‘shish” (brigadir: oklad, bonus, ushlanma) | KPI: Jami ish haqi fondi, Hisoblangan, To‘langan, To‘lanadigan qoldiq; lavozim ustuni |
| AC-09 | Solishtirish → kontragent (AC-02) | “Bizning ma’lumot” kartasi, hujjatlar va qarz qoldig‘i; “Dalolatnoma shakllantirish” chop etish oynasini ochadi |
| AC-10 | Moliyaviy hisobotlar | Hisobot kartalari: Pul oqimi, Obyekt xarajatlari, Qarz yoshi, Ombor hisoboti; “Ko‘rish” jadvalni ochadi, “Chop etish” ishlaydi |

---

## 11. Finansist (`financier`)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| FN-01 | Menyu | Bosh sahifa, Budjetlar, Reja–fakt, Prognoz, To‘lov so‘rovlari, To‘lov kalendari, Moliyaviy hisobotlar, Narx varaqasi |
| FN-02 | Budjetlar → “Budjet qo‘shish” (joriy oy) | KPI: Jami budjet, Sarflangan, Qolgan, Bajarilish ko‘rsatkichi; “Oylik” jadvalda bajarilish chizig‘i; “Yillik” segmentida yil yig‘masi |
| FN-03 | To‘lov so‘rovlari → “To‘lov so‘rovi”: kontragent AC-02, bog‘langan hujjat AC-06, maqsad | So‘rov “Kutilmoqda”; filtr kartasi va “Harakatlar” ustuni; o‘z so‘rovida “Tasdiqlash” tugmasi **yo‘q** (o‘zini o‘zi tasdiqlamaydi) |
| FN-04 | To‘lov kalendari | KPI: Bugungi to‘lovlar, Haftalik reja, Oylik umumiy; oylik to‘r — nuqtalar (yashil bajarilgan, sariq rejalashtirilgan, qizil muddati o‘tgan); kunni bosganda o‘ngda ro‘yxat; oylar orasida o‘tish |
| FN-05 | Reja–fakt | KPI: Rejadagi xarajatlar, Faktik xarajatlar, Farq, Reja bajarilishi; “6 oylik solishtirma tahlil” grafigi; kategoriyalar jadvali; Excel eksport |
| FN-06 | Prognoz | KPI, “Oylik xarajat tendensiyasi” grafigi, “Prognoz ko‘rsatkichlari” kartasi (tugash sanasi yo‘q bo‘lsa — shuni aytadi) |
| FN-07 | Narx varaqasi | Avvalgidek ochiladi (D8) |

---

## 12. Yakuniy tekshiruvlar

| ID | Qadam | Kutilgan natija |
|---|---|---|
| AD-11 | (`admin`) To‘lov so‘rovlari → FN-03 so‘rovi → “Tasdiqlash”, so‘ng “To‘lash” (AC-03 bank hisobi) | “Tasdiqlangan”, keyin “To‘langan”; AC-06 dalolatnomasi qoldig‘i 0; finansist kalendarida shu kunda yashil nuqta |
| AD-09 | (`admin`) Bosh sahifa va Moliya markazi | KPI’lar butun oqimni aks ettiradi (xarajat, qarz, kam qolganlar, ochiq vazifalar) |
| AD-10 | (`admin`) Audit jurnali | Oqimdagi amallar yozilgan (obyekt, kirim, jo‘natish, to‘lov) |
| OW-13 | (`owner`) Mijozlar → “Sinov korxona” | Xodimlar soni va holat to‘g‘ri; Bosh sahifadagi “Xodimlar taqsimoti” rollar bo‘yicha yangilangan |
