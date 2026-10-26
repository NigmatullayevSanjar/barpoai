# Egasi fikrlari (2026-10-12) — qo‘lda test case’lar

> **Sana:** 2026-10-13. **Qamrov:** PR #8 (`7c46164`, `e87c74e`, `da1a12f`), `main` da — D11 (tariflarni tahrirlash), D12 (super_admin huquqlari), D13 (parol kamida 6 belgi), D14 (blok kartasi), xonadon reja rasmi va filtrlari, smeta Excel importi, UI tuzatishlari, CBU kursini yangilash, `seed-dev`.
> **Avtomatik testlar** (PR #8 muallifi xabari): integration 71, roles 5, UI 47 — `TZ=UTC` da. Bu hujjat — brauzerda **qo‘lda** tekshiriladigan qismlar.
> **Diqqat:** `claude/feedback-2026-10-12` branch’idagi `72ef171` (D15 rollar, D16 Telegram 2FA) hali `main` da emas. Bu yerdagi super_admin testlari **joriy `main`** (D12: super_admin egasining barcha huquqlariga ega) bo‘yicha. D15 birlashsa SA-bo‘limi qayta yoziladi.
> **Natija fayli:** `docs/tests/FIKR_2026_10_12_NATIJA.md` (8-bo‘lim formati).

---

## 0. Tayyorgarlik (lokal, Windows)

1. `git checkout main`, `git pull`. `backend` da `docker compose up --build -d` — migratsiya 018 va 019 qo‘llanadi; `curl http://localhost:3001/health/ready` → `{"status":"ok"}`.
2. Sinov hisoblari (yangi bazada, parolni o‘zingiz tanlaysiz, faylga yozilmaydi):
   ```powershell
   cd backend
   $owner = ((Select-String -Path .env -Pattern '^DB_OWNER_PASSWORD=').Line -split '=', 2)[1]
   $env:MIGRATION_DATABASE_URL = "postgresql://barpo_owner:$owner@127.0.0.1:5433/barpo"
   $p = Read-Host 'Sinov paroli (kamida 6 belgi)' -AsSecureString
   $env:SEED_PASSWORD = [System.Net.NetworkCredential]::new('', $p).Password
   npm.cmd run seed:dev
   Remove-Item Env:SEED_PASSWORD, Env:MIGRATION_DATABASE_URL; Remove-Variable owner, p
   ```
   Natijada: `owner`, `superadmin`, `support`, korxona `DEV-TENANT-1` admini `admin` va har rol uchun xodim (`foreman`, `brigadier`, `warehouse`, `financier`, `accountant`, `manager`).
3. `frontend` da `pnpm dev`, brauzerda `http://localhost:5173`. Windows’da Chrome — kursor testlari uchun.
4. Sinov uchun Excel fayllar: oddiy smeta (sarlavha 1-qatorda), sarlavhasi 3–5-qatorda va birlashtirilgan kataklar bilan smeta, oxirida “Jami” qatori bor smeta, birligi “kompl.” bo‘lgan qator, ruscha sarlavhali smeta.

Natija qiymatlari: **o‘tdi**, **yiqildi** (qadamlar, kutilgan va haqiqiy natija, skrinshot), **o‘tkazib yuborildi** (sababi bilan).

---

## 1. Kirish sahifasi va umumiy UI

| ID | Qadam | Kutilgan natija |
|---|---|---|
| UI-01 | Kirish sahifasini UZ va RU tilida ochish | Hamma matnlar tarjima qilingan, xom kalit yo‘q; logo ko‘rinadi |
| UI-02 | Brauzer yorlig‘i | BARPO favicon’i |
| UI-03 | Desktop kenglik (≥1280 px) | Menyu (gamburger) tugmasi ko‘rinmaydi; sidebar doim ochiq |
| UI-04 | Mobil kenglik (DevTools, 375 px) | Menyu tugmasi bor; formalar bir ustunda, gorizontal scroll yo‘q |
| UI-05 | Sahifani pastga/tepaga “ortiqcha” tortish (trackpad yoki sichqoncha) | Sahifa chegaradan oshib “sakramaydi” (overscroll yo‘q) |
| UI-06 | Windows Chrome’da istalgan matn maydoniga kursorni olib borish | Kursor I-beam ko‘rinishida va aniq ko‘rinadi |
| UI-07 | Har qanday ro‘yxatdagi tanlov (Select) — ochish, qidirish (bo‘lsa), klaviatura ↑↓ Enter, Esc | Yangi ochiluvchi ro‘yxat to‘g‘ri joylashadi (ekrandan chiqmaydi), klaviatura ishlaydi, Esc yopadi |
| UI-08 | Toolbar’dagi filtr tanlovlari (masalan, Xonadonlar tabi) | Kenglik matnga mos, qatordan toshib ketmaydi |
| UI-09 | Sana maydoni (DateInput): kalendardan tanlash, qo‘lda `13.10.2026` yozish, noto‘g‘ri sana `31.02.2026` | Ko‘rinish `KK.OO.YYYY`; kalendar ochiladi/yopiladi; noto‘g‘ri sana qabul qilinmaydi yoki xato chiqadi; saqlangan sana qayta ochilganda o‘zgarmaydi |
| UI-10 | Bildirishnomalar sahifasi → bildirishnomani bosish | Tegishli sahifa ochiladi (vazifa, hisobot, murojaat va h.k.) |
| UI-11 | Kompaniya bosh sahifasidagi kartalar | Obyektlar kartasi bosilsa — tegishli ro‘yxat ochiladi |
| UI-12 | Brauzer konsoli (F12) butun test davomida | Qizil xato yo‘q |

---

## 2. Parol (D13 — kamida 6 belgi)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| PW-01 | Admin yangi xodim qo‘shadi, boshlang‘ich parol 5 belgi | Rad etiladi, xabar tushunarli |
| PW-02 | Xuddi shu, 6 belgi | Qabul qilinadi |
| PW-03 | Xodim birinchi kirishda parolni 5 belgiga almashtirmoqchi | Rad etiladi |
| PW-04 | Parolni tiklash havolasi orqali 6 belgili yangi parol | Qabul qilinadi, yangi parol bilan kirish ishlaydi |

---

## 3. Tariflar (D11) va obuna to‘lovlari

| ID | Qadam | Kutilgan natija |
|---|---|---|
| TR-01 | `owner` → Tariflar → mavjud tarifni tahrirlash (narx va limit) | Saqlanadi; ro‘yxatda yangi qiymat |
| TR-02 | Tarifni o‘chirishga urinish | O‘chirish imkoni yo‘q yoki rad etiladi |
| TR-03 | Tahrirdan **oldin** chiqarilgan invoys | Summasi o‘zgarmagan |
| TR-04 | Tahrirdan keyin shu tarifdagi kompaniyaga yangi invoys | Yangi narx bilan |
| TR-05 | Platforma menyusi | “Obuna to‘lovlari” nomi (eski nom yo‘q) |

---

## 4. Super admin (D12 — joriy `main`)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| SA-01 | `superadmin` bilan kirish | Platforma menyusi egasinikiga teng (D12); hech bir sahifa “Ruxsat yo‘q” bermaydi |
| SA-02 | Kompaniya kartasi → admin uchun “Parolni tiklash havolasi” | 30 daqiqalik havola chiqadi; havola bilan yangi parol o‘rnatiladi; eski sessiyalar yopiladi |
| SA-03 | `superadmin` o‘z parolini shu tugma bilan tiklashga urinadi | Rad etiladi |
| SA-04 | `superadmin` egasining (`owner`) parolini tiklashga urinadi | Rad etiladi (egasini faqat egasi) |
| SA-05 | Tiklash havolasini 30 daqiqadan keyin yoki ikkinchi marta ochish | “Muddati o‘tgan” xabari |

---

## 5. Blok kartasi (D14)

Obyekt yaratib, unda 2 ta blok bilan tekshiriladi.

| ID | Qadam | Kutilgan natija |
|---|---|---|
| BL-01 | Obyekt sahifasi → “Yangi blok qo‘shish”: nom, qavatlar, yer maydoni, reja sanalari, mas’ul(lar), rasm | Blok kartasi chiqadi: rasm, maydon, muddatlar, mas’ul |
| BL-02 | Mas’ul tanlovi obyektga biriktirilmagan xodimlar bo‘lsa | Faqat biriktirilganlar; hech kim bo‘lmasa “Obyektga biriktirilgan xodimlar yo‘q” |
| BL-03 | Tugash sanasi boshlanishdan oldin | Saqlanmaydi, xato ko‘rsatiladi |
| BL-04 | Holat: reja boshlanishi kelajakda → “Kutilmoqda”; fakt boshlangan → “Faol”; reja tugashi o‘tgan, fakt tugash yo‘q → “Kechikmoqda”; fakt tugash bor → “Yakunlandi” | Holat qo‘lda tanlanmaydi, sanalardan to‘g‘ri hisoblanadi |
| BL-05 | Blokka bog‘langan smeta qatorlari bor/yo‘q | “Smeta” kartada serverdan (qatorlar yig‘indisi); qator yo‘q — bo‘sh, soxta 0 emas |
| BL-06 | Bloklar filtri (holat bo‘yicha, “Barchasi”) va qidiruv | Faqat mos bloklar; topilmasa “Filtr bo‘yicha blok topilmadi” |
| BL-07 | Blokni tahrirlash (rasmni almashtirish, mas’ulni olib tashlash) | O‘zgarishlar saqlanadi, kartada ko‘rinadi |
| BL-08 | Blok sahifasi (`/app/projects/:id/blocks/:blockId`) | Muddatlar, kirish va qavat filtrlari; xonadonlar xonalar soni bo‘yicha guruhlangan (“2 xonali xonadonlar”, “Studiya”, “Xonalar soni ko‘rsatilmagan”), har guruhda soni |
| BL-09 | Blok sahifasidan “Obyektga qaytish” | Obyekt sahifasiga qaytadi |
| BL-10 | Prorab (blokka biriktirilgan) bilan kirish | Ko‘radi, lekin yaratish/tahrir tugmalari yo‘q |
| BL-11 | Boshqa kompaniya bloki URL’ini ochish | “Topilmadi” |

---

## 6. Xonadonlar: reja rasmi, filtrlar, tannarx

| ID | Qadam | Kutilgan natija |
|---|---|---|
| XN-01 | Xonadonga reja rasmi (planirovka) yuklash — JPEG/PNG | Blok sahifasida “Reja rasmi” ustunida kichik rasm; bosilsa kattalashadi |
| XN-02 | Fayl tanlash oynasida PDF; juda katta rasm (masalan, 20 MB) | Faqat JPEG/PNG tanlanadi; katta fayl tushunarli xabar bilan rad etiladi (500 emas) |
| XN-03 | Xonadonlar filtri: xonalar soni va zona | Faqat mos qatorlar, jami soni va maydoni serverdan |
| XN-04 | Narx varaqasi versiyasi bor obyekt | Xonadonlarda “Harajat” (tannarx) eng so‘nggi versiyadan; versiya yo‘q — bo‘sh |
| XN-05 | Yangi narx varaqasi versiyasi yaratish | “Harajat” yangi versiya qiymatiga o‘tadi |

---

## 7. Smeta Excel importi

| ID | Qadam | Kutilgan natija |
|---|---|---|
| EI-01 | Oddiy smeta (sarlavha 1-qatorda) | Ustunlar avtomatik moslanadi, import muvaffaqiyatli |
| EI-02 | Sarlavha 3–5-qatorda, ustida korxona nomi | Sarlavha qatori avtomatik topiladi |
| EI-03 | Birlashtirilgan kataklar va oxirida “Jami”/“Итого” qatori | Birlashtirilgan va jami qatorlari smeta qatoriga aylanmaydi |
| EI-04 | Birlik “kompl.” / “комплект” | “Komplekt” birligiga moslanadi |
| EI-05 | LibreOffice yoki Python (openpyxl) bilan saqlangan `.xlsx` | Ochiladi (avval 500 berardi) |
| EI-06 | Buzilgan fayl (`.xlsx` deb nomlangan `.txt`) | “Noto‘g‘ri Excel fayl” xabari, 500 emas |
| EI-07 | Ustun moslash qadami (import ustasi) | Har ustun uchun tanlov aniq, majburiylar belgilangan; noto‘g‘ri moslashda tushunarli xato |
| EI-08 | Smeta muharriri — import qilingan smetani ochish | Ustunlar kengligi to‘g‘ri, matn kesilmaydi, jami serverdan |

---

## 8. CBU kursi (e87c74e)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| KR-01 | Ish kuni: worker ishga tushgach 10–20 daqiqa | Header izohida bugungi (yoki CBU e’lon qilgan oxirgi) sana bilan kurs |
| KR-02 | Internetni uzib worker’ni qayta ishga tushirish, keyin ulash | Ulangach ~10 daqiqada kurs yangilanadi (bir soat kutmaydi); uzilgan paytda oxirgi kurs qoladi |
| KR-03 | `docker compose logs worker` | Takroriy “CBU rate fetch failed” faqat tarmoq uzilgan paytda |

> Kuzatuv: dam olish kunlari CBU oldingi sana kursini qaytaradi, shuning uchun “bugungi” kurs bo‘lmaydi va worker har 10 daqiqada so‘raydi (kuniga ~144 so‘rov). Zararsiz, lekin natijada qayd eting.

---

## 9. Natija formati (`docs/tests/FIKR_2026_10_12_NATIJA.md`)

```markdown
| ID | Natija | Dalil | Izoh |
|---|---|---|---|
| BL-04 | o‘tdi | screenshots/BL-04.png | |
| EI-03 | yiqildi | “Jami” qatori smetaga qo‘shildi; fayl: … | taklif |
```

Skrinshotlar `docs/tests/screenshots/` ga, fayl nomi ID bilan.
