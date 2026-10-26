# `claude/figma-stage-1`: PR #10 dan keyingi o‘zgarishlar — qo‘lda test

> **Sana:** 2026-10-22. **Qamrov:** commit `36045f5` (2026-10-18). Bu commit `main` ga hali qo‘shilmagan, PR #10 dan keyin branch’ga tushgan. Unda to‘rt o‘zgarish bor:
> 1. **Sidebar.** Logotip, kompaniya nomi va pastki karta joyida turadi, faqat menyu suriladi.
> 2. **Oy nomlari** brauzerdan emas, lug‘atdan olinadi. Ilgari uz’da “M10” chiqardi, endi “Oktyabr”. Yozuv ham to‘g‘rilandi: “Sentyabr”, “Oktyabr”.
> 3. **Oy tanlagich** (`MonthInput`) brauzerning o‘z oy oynasi o‘rniga keldi.
> 4. **Qarzdorlar sahifasi** endi yangi `GET /v1/platform/billing/debtors` endpointidan oladi. Ro‘yxat kompaniya holatiga qarab emas, qoplanmagan invoyslarga qarab tuziladi.
>
> **PR #10 ning o‘zi** (F1–F6) `FIGMA_F1_F6_TEST_CASES.md` va `FIGMA_F1_F6_SSENARIY.md` da. Bu hujjat faqat yuqoridagi to‘rt o‘zgarishni va ular tegadigan sahifalarni tekshiradi.
> **Natija fayli:** `docs/tests/FIGMA_STAGE1_QOSHIMCHA_NATIJA.md` (ID, natija, izoh, skrinshot).

---

## 0. Tayyorgarlik

1. Branch’ni oling: `git switch claude/figma-stage-1`, so‘ng `git pull`. HEAD `36045f5` yoki undan yangi bo‘lishi kerak.
2. `backend` papkasida `docker compose up --build -d` ni ishga tushiring. Backend kodi o‘zgargan, shuning uchun `--build` majburiy, aks holda qarzdorlar endpointi bo‘lmaydi. Yangi migratsiya yo‘q.
3. `frontend` papkasida `pnpm dev` ni ishga tushirib, `http://localhost:5173` ni oching.
4. Hisoblar `FIGMA_F1_F6_TEST_CASES.md` §0 dagi bilan bir xil (`seed:dev`). Bu hujjat uchun kerak bo‘ladiganlari:
   - **Platforma egasi** (`owner` yoki lokal `platform.owner`): 1, 2, 4-bo‘limlar.
   - **Mijoz admini** (`admin` yoki lokal `sinov.admin`): 1, 2, 3-bo‘limlar. Budjet, ish haqi va smeta sahifalari uchun admin o‘rniga `financier` yoki `accountant` ham bo‘ladi.
   - **Texnik xodim** (`support`) va **super admin** (`superadmin`): faqat DB-14.
5. Har bir hisobni alohida brauzer profilida yoki inkognito oynada oching. Brauzer konsoli (F12) butun test davomida ochiq tursin.
6. 4-bo‘lim uchun obunasi (tarifi) bor bitta kompaniya kerak. Masalan, `FIGMA_F1_F6_SSENARIY.md` A.2 dagi “Test Qurilish MChJ” yoki lokal bazadagi kompaniya. Bu hujjatda u **K1** deb ataladi.

Natija qiymatlari:
- **o‘tdi**;
- **yiqildi**: qadam, kutilgan va haqiqiy natija, skrinshot bilan;
- **o‘tkazib yuborildi**: sababi bilan.

**Xato deb hisoblanmaydi:**
- Qarzdorlar jadvalidagi **Holat** ustuni obuna holatini ko‘rsatadi (sinov yoki to‘lov muddati bo‘yicha), invoys holatini emas. Shuning uchun muddati o‘tgan invoysi bor kompaniya “Sinov” yoki “To‘langan” bo‘lib turishi mumkin.
- Oy tanlagichda kun tanlanmaydi, faqat yil va oy.

---

## 1. Sidebar: faqat menyu suriladi

Tekshirish uchun menyusi uzun rolni oling: `admin` yoki `accountant`. Oyna balandligini 600 px atrofida qiling. Buning uchun DevTools → qurilma paneli → Responsive, o‘lchamni 1280 × 600 qo‘ying.

| ID | Qadam | Kutilgan natija |
|---|---|---|
| SB-01 | Sidebar menyusini sichqoncha g‘ildiragi bilan pastga suring | Faqat menyu bandlari suriladi. Tepada logotip va kompaniya nomi joyida qoladi. Pastda UZ/RU, UZS/USD, kurs yozuvi va foydalanuvchi kartasi joyida qoladi |
| SB-02 | Menyuni oxirigacha surib, g‘ildirakni yana aylantiring | Asosiy sahifa (o‘ng tomondagi kontent) surilmaydi |
| SB-03 | Menyu ichidagi scroll chizig‘iga qarang | Chiziq ingichka va och rangli, bordo fonda bilinar-bilinmas |
| SB-04 | Eng pastdagi menyu bandini bosing | Sahifa ochiladi, band faol bo‘ladi, foydalanuvchi kartasi ustiga chiqib qolmaydi |
| SB-05 | Oyna balandligini 900 px ga qaytaring | Menyu sig‘sa, scroll chizig‘i umuman ko‘rinmaydi |
| SB-06 | Asosiy sahifani uzun jadvalda (masalan, Xodimlar yoki Smetalar) pastga suring | Sidebar ekranda yopishib turadi, uning ichi surilmaydi |
| SB-07 | Mobil kenglik (375 px): ☰ tugmasi bilan menyuni ochib, pastga suring | 1-bandlardagidek, faqat menyu suriladi. Bandni bosganda menyu yopiladi (GEN-06) |
| SB-08 | `owner` bilan SB-01 ni takrorlang | Tepada “Platforma” yozuvi joyida, xuddi shunday ishlaydi |

---

## 2. Oy nomlari lug‘atdan

Sahifalarni **UZ** tilida oching, keyin **RU** ga o‘tib, takrorlang. Bugun 2026-10-22, demak joriy oy “Oktyabr 2026” (ru: “Октябрь 2026”).

| ID | Qadam | Kutilgan natija |
|---|---|---|
| OY-01 | (`owner`) Bosh sahifa → “Oylik daromad dinamikasi” grafigi: ustun ustiga sichqonchani olib boring, grafik ostidagi jadvalga qarang | Oy nomlari “Sentyabr 2026”, “Oktyabr 2026” ko‘rinishida. “M10”, “10-oy”, “oktabr” yoki “sentabr” chiqmaydi |
| OY-02 | (`owner`) Bosh sahifadagi “Oylik daromad” KPI kartasining osti | “Oktyabr 2026 · UZS” (yoki oxirgi oy) |
| OY-03 | (`owner`) Daromad va qarz → “1 oylik buxgalter hisoboti” | Izohda “Oktyabr 2026 uchun kirim-chiqimlar…”, jadval sarlavhasida “Kirim-chiqimlar (Oktyabr 2026)” |
| OY-04 | (`financier`/`admin`) Budjetlar → “Oylik” jadvalidagi Oy ustuni, Reja–fakt → “6 oylik solishtirma tahlil” va jadval, Prognoz grafigi | Hamma joyda oy nomi lug‘atdagidek, bosh harf bilan |
| OY-05 | (`financier`/`admin`) To‘lov kalendari sarlavhasi; oldingi va keyingi oyga o‘ting | “Oktyabr 2026” → “Sentyabr 2026” → “Noyabr 2026” |
| OY-06 | (`accountant`/`admin`) Ish haqi → davr sarlavhasi va KPI osti | “Davr: Oktyabr 2026 · …” |
| OY-07 | Istalgan sana maydonini oching (masalan, Vazifa qo‘shish → muddat) | Kalendar sarlavhasida “Oktyabr 2026” |
| OY-08 | UZ/RU ni RU ga o‘tkazib, OY-01…OY-07 ni qayta ko‘ring | “Сентябрь 2026”, “Октябрь 2026”. Lotin harfli yoki xom kalit (`ui.date.m10`) chiqmaydi |
| OY-09 | Boshqa brauzerda (Firefox yoki Edge) OY-01 va OY-05 ni qayta ko‘ring | Natija Chrome bilan bir xil (ilgari brauzerga qarab farq qilardi) |

---

## 3. Oy tanlagich (`MonthInput`)

### 3.1. Umumiy xatti-harakat

Avval bitta joyda to‘liq tekshiriladi: `financier` yoki `admin` → Budjetlar → “Budjet qo‘shish” → **Oy** maydoni.

| ID | Qadam | Kutilgan natija |
|---|---|---|
| MI-01 | Bo‘sh oy maydoniga qarang | “Oy tanlang” yozuvi va o‘ngda kalendar ikonkasi bor. Brauzerning o‘z “----- ----” maydoni ko‘rinmaydi |
| MI-02 | Maydonni bosing | Sayt kalendari uslubidagi oyna ochiladi. Tepada ‹ 2026 › yozuvi, ostida 3 × 4 katakda 12 oy. Oktyabr bordo hoshiyali (joriy oy). Pastda “Joriy oy” va “Tozalash” tugmalari. **Brauzerning o‘z oy oynasi ochilmaydi** |
| MI-03 | Kalendar ikonkasini bosing | MI-02 dagi oyna ochiladi. Ikonkani qayta bosish oynani yopadi |
| MI-04 | “Mart” ni bosing | Oyna yopiladi, maydonda “Mart 2026” yozuvi chiqadi |
| MI-05 | Yana oching | Mart bordo fon bilan belgilangan (tanlangan), Oktyabr hoshiyada qoladi |
| MI-06 | › bosib 2027 ga o‘ting, “Yanvar” ni tanlang | Maydonda “Yanvar 2027” |
| MI-07 | Oching → “Joriy oy” | Maydonda “Oktyabr 2026” |
| MI-08 | Oching → “Tozalash” | Maydon bo‘shaydi, yana “Oy tanlang” yozuvi chiqadi |
| MI-09 | Oyna ochiq turganda oynadan tashqariga bosing | Oyna yopiladi, qiymat o‘zgarmaydi |
| MI-10 | Klaviatura bilan: Tab bilan maydonga keling, ↓ (yoki Probel) bosing | Oyna ochiladi, fokus tanlangan oyda (yoki joriy oyda) |
| MI-11 | ← → ↑ ↓ bilan yuring | ←/→ bir oyga, ↑/↓ uch oyga (bir qatorga) suradi. Dekabrdan → bosilsa keyingi yil yanvariga o‘tadi va sarlavhadagi yil o‘zgaradi |
| MI-12 | PageUp / PageDown | Bir yil oldinga yoki orqaga, shu oyning o‘zida |
| MI-13 | Enter | Fokusdagi oy tanlanadi, oyna yopiladi, fokus maydonga qaytadi |
| MI-14 | Oching → Esc | Oyna yopiladi, fokus maydonda qoladi |
| MI-15 | Maydon fokusda, qiymat bor: Backspace (yoki Delete) bosing | Qiymat tozalanadi (majburiy maydonda tozalanmaydi, MI-22 ga qarang) |
| MI-16 | Oy tanlab, summa kiritib saqlang | Budjet saqlanadi. “Oylik” jadvalda tanlangan oy nomi bilan chiqadi. Konsolda xato yo‘q |
| MI-17 | MI-16 dagi budjetni ochib tahrirlang | Oy maydoni nofaol: bosganda oyna ochilmaydi, ↓ ham ishlamaydi |
| MI-18 | RU tilida MI-01, MI-02 | “Выберите месяц”, oylar ruscha, tugmalar “Текущий месяц” va “Очистить” |
| MI-19 | Mobil kenglik (375 px) da MI-02 | Oyna ekranga sig‘adi, katakchalarni barmoq bilan bosish qulay |
| MI-20 | Oynaning (modalning) pastki qismidagi maydonni, sahifa pastga surilgan holatda oching | Oyna ekrandan chiqib ketmaydi: joy bo‘lmasa, maydonning ustida ochiladi |

### 3.2. Oy tanlagich turgan boshqa joylar

| ID | Joy | Qadam | Kutilgan natija |
|---|---|---|---|
| MI-21 | (`accountant`/`admin`) Ish haqi → “Davr ochish” | Oy tanlab, Yaratish | Davr yaratiladi. Sarlavhada “Davr: <oy> 2026” |
| MI-22 | (`manager`/`admin`) Smetalar → smeta tahriri → qatordagi kalendar ikonkasi (“Oylar”) → “Oylik taqsimot” → “Oy qo‘shish” | Har qatordagi oy maydonini oching | Oyna MI-02 dagidek, lekin **“Tozalash” tugmasi yo‘q**, Backspace qiymatni o‘chirmaydi (maydon majburiy) |
| MI-23 | Xuddi shu modal | Ikki oy qo‘shing (masalan, Noyabr va Dekabr), miqdorlarni yig‘indi hisobiy miqdorga teng bo‘ladigan qilib kiriting, saqlang va smetani saqlang | Smeta saqlanadi. Qayta ochilganda modalda “Noyabr 2026”, “Dekabr 2026” turadi. Yig‘indi chizig‘i “… / …” teng |
| MI-24 | Xuddi shu modal | Oy maydoni tor joyda turibdi | Maydon qatorga sig‘adi, miqdor maydoni va o‘chirish tugmasini siqib chiqarmaydi |
| MI-25 | (`owner`) Daromad va qarz → “1 oylik buxgalter hisoboti” sarlavhasidagi oy maydoni | Sentyabrni tanlang | Izoh va “Kirim-chiqimlar (Sentyabr 2026)” jadvali shu oyga almashadi. Maydon kengligi (~170 px) sarlavhaga sig‘adi |
| MI-26 | Xuddi shu joy | “Tozalash” bosing | Sahifa buzilmaydi (bo‘sh holat yoki joriy oy). Konsolda qizil xato yo‘q. Natijani izohda yozing |

---

## 4. Qarzdorlar (`owner`)

Avval **Qarzdorlar** sahifasini oching va boshlang‘ich holatni (qaysi kompaniyalar va qanday summalar borligini) skrinshot qiling. Keyingi qadamlarda K1 uchun invoys **Mijozlar → K1 → “Invoys chiqarish”** orqali yaratiladi, to‘lov esa **“To‘lov yozish”** orqali yoziladi.

| ID | Qadam | Kutilgan natija |
|---|---|---|
| DB-01 | Menyu → Qarzdorlar | Sarlavha “Qarzdorlar”. Izoh: “Qoplanmagan invoyslari bor kompaniyalar; muddati o‘tgan qarz birinchi turadi”. Tepada uchta KPI: Qarzdorlik, Muddati o‘tgan, Joriy qarzdorlik (ostida valyuta). Qidiruv maydoni va “Faqat muddati o‘tgan” belgisi bor |
| DB-02 | Jadval ustunlari | Kompaniya nomi (ostida ro‘yxat kaliti), Tarif, Ochiq invoyslar, Muddati o‘tgan, Joriy qarzdorlik, Jami qarz, Eng eski muddat, Holat. Raqamli ustunlar o‘ngda (GEN-05) |
| DB-03 | Qarzi yo‘q holat: barcha invoyslar to‘langan bo‘lsa (yoki qidiruvda mavjud bo‘lmagan nom) | Bo‘sh holat: “Qarzdor kompaniyalar yo‘q”. Demo raqam chiqmaydi |
| DB-04 | **Asosiy tuzatish.** K1 holati “Sinov” yoki “To‘langan” bo‘lsin. K1 ga invoys chiqaring: to‘lov muddati **kelajakda** (masalan, 2026-11-05). Summani yozib oling | K1 Qarzdorlarda chiqadi (ilgari chiqmasdi). Ochiq invoyslar 1, Muddati o‘tgan “—”, Joriy qarzdorlik = summa, Jami qarz = summa, Eng eski muddat “—”, Holat yashil (“Sinov” yoki “To‘langan”) |
| DB-05 | K1 ga ikkinchi invoys: davr boshi va to‘lov muddati **5 kun oldin** (2026-10-17) | K1 ro‘yxatning **eng tepasiga** chiqadi. Ochiq invoyslar 2. “Muddati o‘tgan” da qizil belgi bilan ikkinchi invoys summasi, ostida “5 kun o‘tdi”. Eng eski muddat 17.10.2026. Joriy qarzdorlik DB-04 summasi. Jami qarz = ikkalasining yig‘indisi |
| DB-06 | Har qatorda | Jami qarz = Muddati o‘tgan + Joriy qarzdorlik (“—” = 0) |
| DB-07 | KPI va jadval: jadval bitta sahifaga sig‘sa, ustunlarni qo‘lda qo‘shing | Qarzdorlik KPI = “Jami qarz” ustuni yig‘indisi. Muddati o‘tgan va Joriy KPI = mos ustunlar yig‘indisi |
| DB-08 | Daromad va qarz → “Qarzdorlik taqsimoti” donutini Qarzdorlar KPI bilan solishtiring | Muddati o‘tgan va joriy qarz summalari bir xil (ikkalasida qarz ta’rifi bir xil) |
| DB-09 | Tartib | Muddati o‘tgan summasi katta kompaniya tepada. Muddati o‘tgan teng bo‘lsa, jami qarzi kattasi tepada |
| DB-10 | “Faqat muddati o‘tgan” belgisini qo‘ying | Faqat muddati o‘tgan qarzi bor qatorlar qoladi (K1 bor). 2-sahifada turgan bo‘lsangiz, 1-sahifaga qaytadi. Belgini olib tashlasangiz, hammasi qaytadi |
| DB-11 | Qidiruv: K1 nomining bir qismi, so‘ng K1 ro‘yxat kaliti (masalan, `SINOV-001`), so‘ng mavjud bo‘lmagan so‘z | Birinchi ikkitasida faqat K1. Uchinchisida bo‘sh holat (DB-03). Katta-kichik harf farq qilmaydi |
| DB-12 | K1 kartasi → “To‘lov yozish”: muddati o‘tgan invoys summasining **yarmi** | Qarzdorlarda Muddati o‘tgan yarmiga kamayadi, Jami qarz ham shuncha kamayadi. Ochiq invoyslar 2 bo‘lib qoladi |
| DB-13 | K1 ning ikkala invoysi qoldig‘ini to‘liq to‘lang | K1 Qarzdorlardan yo‘qoladi. KPI’lar shuncha kamayadi |
| DB-14 | `support` va `superadmin` bilan Qarzdorlarni oching | Sahifa ochiladi, ma’lumot egasinikiga teng. Qatorni bosish kompaniya kartasini faqat o‘qish uchun ochadi (SP-03) |
| DB-15 | Qatorni bosing (`owner`) | `/admin/tenants/<id>` kompaniya kartasi ochiladi |
| DB-16 | Ustun sarlavhalarini bosing (Jami qarz, Eng eski muddat, Kompaniya nomi) | Jadval shu ustun bo‘yicha saralanadi, qayta bosilsa teskari tartibda |
| DB-17 | UZS → USD | KPI va jadval summalari kurs bo‘yicha USD da. Ochiq invoyslar soni va kunlar o‘zgarmaydi. UZS ga qaytganda avvalgi summalar |
| DB-18 | RU tili | “Должники”, “Только просроченные”, “Открытые счета”, “Всего долг”, “Самый ранний срок”. Xom kalit (`debtors.xxx`) yo‘q |
| DB-19 | Konsol va Network (F12) | Sahifa `GET /v1/platform/billing/debtors` ni chaqiradi (javob 200). `/v1/platform/tenants` ning hammasini yuklab olmaydi. Qizil xato yo‘q |

---

## 5. Qisqa regressiya

O‘zgargan fayllar tegadigan, PR #10 da tekshirilgan joylarni bir marta qayta o‘tkazing (ID lar `FIGMA_F1_F6_TEST_CASES.md` dan):

| ID | Nega |
|---|---|
| GEN-01, GEN-05, GEN-06 | Sidebar CSS o‘zgardi |
| OW-12 | Daromad va qarz sahifasi o‘zgardi (oy maydoni, oy nomlari) |
| MG-03 | Smeta tahriri o‘zgardi (oylik taqsimot modali) |
| AC-08 | Ish haqi davri oy maydoni orqali ochiladi |
| FN-02, FN-04, FN-05 | Budjet, kalendar va reja–fakt oy nomlarini `monthLabel` dan oladi |

---

## 6. Avtomatik testlar

| Test | Holat |
|---|---|
| `pnpm typecheck` (frontend) | o‘tdi (2026-10-22) |
| `npm run build` (backend) | o‘tdi (2026-10-22) |
| `npm test` (backend unit) | 27/27 o‘tdi (2026-10-22) |
| `npm run test:integration` (Docker, `TZ=UTC`) | 77/77 o‘tdi (2026-10-22), qarzdorlarning ikki tekshiruvi ham bor |
| `npm run test:roles` (Docker) | 5/5 o‘tdi, kamchilik topilmadi (2026-10-22) |
| `npm run test:ui` | ishga tushirilmadi (5173 portida dev server ishlab turgan edi) |

Integratsiya testiga qarzdorlar uchun ikkita tekshiruv qo‘shilgan:
- **To‘langan kompaniya.** Obunasi to‘langan, lekin qoplanmagan invoysi bor kompaniya ro‘yxatda chiqadi. Jami qarz qoplanmagan invoyslar yig‘indisiga teng. `overdue=true` va `q` filtrlari ishlaydi, noto‘g‘ri bayroq qiymati 400 qaytaradi.
- **Muddati o‘tgan invoys.** Muddati 5 kun oldin o‘tgan invoys kompaniyani tepaga chiqaradi: muddati o‘tgan summa, kunlar soni va eng eski muddat to‘g‘ri, `q` ro‘yxat kaliti bo‘yicha qidiradi.

Super admin va texnik xodim endpointni o‘qiy oladi.
