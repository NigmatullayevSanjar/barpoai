# BARPO AI — egasi uchun qo‘lda test case (lokal stack, to‘liq oqim)

> **Sana:** 2026-10-28. **Qamrov:** `main` (PR #19 gacha) — barcha rollar, asosiy modullar va D22/D23 qoidalari.
> **Muhit:** lokal `docker compose` (API, worker, PostgreSQL) + `pnpm dev` (frontend, `http://localhost:5173`). Haqiqiy ma‘lumotlarga tegilmaydi: hamma narsa **`QA-` kaliti bilan yaratilgan sinov kompaniyasida** qilinadi va oxirida bitta buyruq bilan o‘chiriladi.
> **Natija:** har qator uchun «o‘tdi» yoki «yiqildi + qadam, kutilgan va haqiqiy natija, skrinshot». Yiqilgan qadam tuzatilmaydi — Claude Code’ga xabar beriladi.

## 0. Tayyorgarlik (10 daqiqa)

1. `git pull`, so‘ng `backend` da `docker compose up --build -d` (migratsiyalar avtomatik: `docker compose logs migrate` → «Migratsiyalar bajarildi.»), `frontend` da `pnpm install && pnpm dev`.
2. Platforma egasi hisobi bor (lokal `platform.owner` yoki `npm run bootstrap`). Parollar hech qayerga yozilmaydi.
3. Brauzerda 4 ta alohida profil yoki inkognito oyna: **egasi**, **admin**, **xodim A** (prorab/ombor mudiri/finansist/buxgalter navbat bilan), **xodim B** (brigadir). Konsol (F12) ochiq tursin — qizil xato bo‘lmasin.
4. Avtomatik smoke (ixtiyoriy, 1 daqiqa): `backend` da `set QA_OWNER_LOGIN=... && set QA_OWNER_PASSWORD=... && npm run qa:smoke` (Windows CMD; PowerShell: `$env:QA_OWNER_LOGIN='...'`). Natija: `"checks"` ro‘yxatida 14 band, oxirgisi «Tozalash…». Bu qo‘lda testdan oldin API sog‘ligini tasdiqlaydi.

Nomlash: kompaniya kaliti `QA-QOLDA-1` (faqat `QA-` bilan boshlansin — tozalash shunga qaraydi), xodim loginlari `qa.admin`, `qa.prorab`, `qa.brigadir`, `qa.ombor`, `qa.finansist`, `qa.buxgalter`, `qa.muhandis`.

## 1. Platforma egasi

| ID | Qadam | Kutilgan natija |
|---|---|---|
| P-01 | Egasi bilan kiring → Mijozlar → «Kompaniya ochish»: nom «QA Qo‘lda MCHJ», ro‘yxat raqami `QA-QOLDA-1`, tarif tanlang | Kompaniya ro‘yxatda «Ro‘yxatdan o‘tmagan» holatda; kartada taklif havolasi tugmasi |
| P-02 | «Taklif havolasi» → nusxalang, inkognito oynada oching | Signup formasi: login, parol, ism. `qa.admin` bilan ro‘yxatdan o‘ting → admin paneliga kiradi; 14 kunlik sinov boshlangan |
| P-03 | Xuddi shu havolani yana oching | «Havola yaroqsiz» (bir martalik) |
| P-04 | Egasi → Mijozlar → kompaniya kartasi | Holat «Faol (sinov)», admin ismi, tarif, invoys yo‘q |
| P-05 | Egasi → Tariflar → kartalar; Daromad va qarz | Tarif kartasida kompaniyalar soni; daromad sahifasi xatosiz ochiladi (bo‘sh holatlar) |

## 2. Admin: xodimlar va ruxsatlar

| ID | Qadam | Kutilgan natija |
|---|---|---|
| A-01 | `qa.admin` → Xodimlar → «Xodim qo‘shish»: 6 xodim (prorab, brigadir, ombor mudiri, finansist, buxgalter, bosh muhandis), boshlang‘ich parol bering | Ro‘yxatda 6 xodim, holat «Boshlang‘ich parolni almashtiring» |
| A-02 | Xodim B oynasida `qa.brigadir` bilan kiring | Parol almashtirish talab qilinadi; almashtirgach qayta kirish; brigadir paneli ochiladi («Mening vazifalarim», «Mening hisobim») |
| A-03 | Admin → Ruxsatlar → prorab qatorida «Moliya» o‘qishni ko‘ring | Standart siyosatda prorabda moliya yo‘q; o‘zgartirmang |
| A-04 | Admin → Sozlamalar → kompaniya nomi va telefonini saqlang | «Sozlamalar saqlandi», chap panelda yangi nom |

## 3. Obyekt, zonalar, xonadonlar

| ID | Qadam | Kutilgan natija |
|---|---|---|
| O-01 | Admin → Obyektlar → «Obyekt qo‘shish»: «QA obyekt», maydon 1250.50, **Brigada stavkasi, %** = 20 | Obyekt kartasi ochiladi; «Omborlar» tabida «Asosiy ombor» avtomatik |
| O-02 | Zonalar / bloklar → «Zona qo‘shish»: «A blok», turi blok, 3 qavat; keyin «1-qavat», turi qavat, ota «A blok» | Blok kartasi «3 qavat», daraxtda qavat |
| O-03 | Xonadonlar → qo‘shish: raqam 1, A blok, 1-qavat, 45 m²; yana raqam 1 | Ikkinchisi rad etiladi — raqam blok ichida takrorlanishi haqida xato |
| O-04 | Xodimlar tabi → 6 xodimni biriktiring (ombor mudiriga «Asosiy ombor» ni ham) | Ro‘yxatda hammasi; brigadir oynasida obyekt paydo bo‘ladi |
| O-05 | «Qavatlar progressi» tabi | Yo‘riqnoma: ish qatori yo‘q (smeta hali yo‘q) |

## 4. Smeta (bosh muhandis)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| S-00 | `qa.ombor` → Ombor → Materiallar → «Material qo‘shish»: «Sement», kg (S-01 dan oldin) | Ro‘yxatda; admin oynasida «Material qo‘shish» tugmasi yo‘q (D18) |
| S-01 | `qa.muhandis` → Smetalar → «Yangi smeta»: 1-qator ish «Beton quyish», m³, 100, narx 250 000, **Brigada stavkasi** 100 000, zona 1-qavat; 2-qator material «Sement» (S-00 da yaratilgan), kg, 500, narx 1 200 | Saqlangach jami **25 600 000**; «Hisoblash» kartasi: materiallar 600 000, ishlar 25 000 000 |
| S-02 | `qa.prorab` → Smetalar → shu smeta | Narx va summa ustunlari yo‘q, hajm ko‘rinadi; «Narxlar yashirilgan» ogohlantirishi |
| S-03 | Muhandis → smetani tahrirlang: Sement miqdorini 600 ga | Yangi reviziya (№2); reviziyalar tarixida ikkita yozuv; jami 25 720 000 |
| S-04 | Smeta → Excel eksport (muhandis), keyin prorab bilan | Muhandis faylida narxlar bor, prorabnikida yo‘q |

## 5. Ombor (ombor mudiri, brigadir, prorab)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| W-01 | `qa.ombor` → Kirim/Chiqim → «Kirim»: Sement, Asosiy ombor, 1000 kg, tannarx 1 200 | Qoldiqlar: Sement 1000 kg, holat «Yetarli»; admin oynasida kirim tugmasi yo‘q |
| W-02 | «Jo‘natish»: Sement 300 kg → brigadir `qa.brigadir` | Harakat «Kutilmoqda», omborda 300 rezerv (mavjud 700) |
| W-03 | Brigadir → Material qabul → jo‘natmani 250 kg qabul qiling | Holat «Qisman»; brigadir hisobida 250, omborda 50 rezervda |
| W-04 | Brigadir → qolgan 50 ni qabul qiling | «Qabul qilindi»; brigadirda 300, omborda 700, rezerv 0 |
| W-05 | Brigadir → «Sarf»: Sement 100 kg, smeta qatori Sement, zona 1-qavat | «Kutilmoqda»; brigadir rezervi 100 |
| W-06 | Prorab → Harakatlar → «Tasdiqlash» | Sarf «O‘tkazildi»; brigadirda 200 qoldi; obyekt kartasi (admin) fakt xarajat **120 000** |
| W-07 | Brigadir → Material talabnomasi → «Material so‘rash»: 1-qator Sement 50 kg, «Qator qo‘shish» → 2-qator boshqa material 5 kg | Talabnoma № bilan ro‘yxatda, ikki qator, holat «Kutilmoqda» |
| W-08 | Ombor mudiri → Talabnomalar → 1-qatorni «Jo‘natish bilan bajarish», 2-qatorni «Rad etish» | Talabnoma «Bajarildi» (bir qatori bajarilgan); brigadirga yangi jo‘natma (50 kg rezervda); admin oynasida bajarish tugmasi yo‘q |
| W-08b | Brigadir → Material qabul → 50 kg jo‘natmani qabul qiling | Omborda 650 kg, rezerv 0; brigadirda 250 kg |
| W-09 | Ombor mudiri → Qoldiqlar → Sement → «Minimal qoldiq» 900 | Holat «Kam qoldi» (650 < 900); bildirishnoma (qo‘ng‘iroq) ombor mudirida |
| W-10 | Ombor mudiri → Inventarizatsiya: Sement haqiqiy 645 kg (hisobda 650) | Farq −5 tuzatish yozuvi; qoldiq 645; harakatlarda «Tuzatish». Rezerv bo‘lsa (W-08b bajarilmagan) inventarizatsiya rad etiladi |

## 6. Vazifalar va hisobotlar

| ID | Qadam | Kutilgan natija |
|---|---|---|
| T-01 | Prorab → Vazifalar → «Vazifa qo‘shish»: «Beton quyish 1-qavat», ijrochi brigadir, tekshiruvchi prorab, daraja yuqori, **Smeta qatori** Beton quyish, boshlanish sanasi bugun | Kanban «Rejada» ustunida karta: qator nomi va 0 % |
| T-02 | Brigadir → vazifani «Boshlash», keyin «Topshirish» | Ustunlar: Bajarilmoqda → Tekshiruvda; prorabga bildirishnoma |
| T-03 | Brigadir → vazifani «Qabul qilish»ga urinish | Tugma yo‘q (tekshiruvchi emas) |
| T-04 | Prorab → «Qabul qilish», izoh bilan | «Qabul qilingan»; tarixda izoh; vazifa endi tahrirlanmaydi |
| R-01 | Brigadir → Hisobotlar → «Hisobot yaratish» (kunlik): matn, zona 1-qavat, smeta qatori Beton quyish, hajm 40, foto | Ro‘yxatda «Yuborilgan»; foto yuklandi |
| R-02 | Prorab → hisobotni oching → «Qaytarish» sabab bilan | Holat «Qaytarilgan»; brigadirga bildirishnoma |
| R-03 | Brigadir → matnni tuzatib «Qayta yuborish» | «Yuborilgan» |
| R-04 | Prorab → «Qabul qilish» | «Qabul qilingan»; vazifa kartasida reja 100 / qabul 40 / 40 %; obyekt → Qavatlar progressi: 1-qavat × Beton quyish **40 %** (40 / 100) |
| R-05 | Prorab → hisobot kartasi | «Ishlab topilgan» ustuni **yo‘q** (D20) |
| R-06 | Brigadir → hisobot kartasi | «Ishlab topilgan» **4 000 000** (40 × 100 000), stavka qavs ichida |
| R-06b | Muhandis → smetani tahrirlang: Beton quyish stavkasini 120 000 ga (yangi reviziya); brigadir hisobot kartasini yangilang | Summa **o‘zgarmaydi** — 4 000 000 (stavka qabulda qotirilgan). Vazifa kartasi yangi reviziya qatoriga o‘tgan, «Eski reviziya qatori» belgisi yo‘q |
| R-07 | Prorab → hisobot → «Progressni tuzatish»: −5, sabab | Amalda 35; brigadir kartasida **3 500 000** (eski stavka 100 000 bilan); qavat matritsasi 35 % (35 / 100) |
| R-08 | Brigadir → Bosh sahifa → «Mening hisobim» | Shu oy ishlab topilgan 3 500 000; davrga kirgan 0; to‘langan 0; qoldiq 3 500 000 |

## 7. Moliya (buxgalter, finansist, admin)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| F-01 | `qa.buxgalter` → Bank va kassa → «Hisob qo‘shish»: «QA kassa» (kassa) | Ro‘yxatda, qoldiq 0 |
| F-02 | Kontragentlar → «QA Buyurtmachi» (buyurtmachi), «QA Yetkazuvchi» (yetkazib beruvchi), «QA Subpudrat» (**subpudratchi**) | Uchalasi ro‘yxatda; turlar ro‘yxatida «Pudratchi» yo‘q |
| F-03 | Bank va kassa → «Operatsiya»: Tushum 10 000 000, QA Buyurtmachi, QA obyekt | Kassa 10 000 000; obyekt kartasi (admin): tushum 10 000 000 |
| F-04 | Hisoblar va dalolatnomalar → «Invoys»: yetkazuvchi invoysi 1 200 000, QA Yetkazuvchi, **W-01 kirimiga bog‘lang** | Ro‘yxatda «Kutilmoqda», qoldiq 1 200 000; boshqa summa bilan urinish — «Narx tuzatish talab qilinadi» |
| F-05 | «To‘lash» 1 200 000, QA kassa | «To‘langan»; kassa 8 800 000; obyekt kartasi: to‘langan 1 200 000, qarz 0 |
| F-06 | Subpudratchiga avans 1 000 000; keyin xizmat dalolatnomasi 3 000 000; «Avansdan yopish» | Avans oldindan to‘ldirilgan 1 000 000; qoldiq 2 000 000; kassa o‘zgarmaydi; AV-05..AV-10 (`AVANS_HISOBI_TEST_CASES.md`) qoidalari |
| F-07 | `qa.finansist` → Budjetlar: joriy oy 5 000 000; Reja–fakt; Prognoz | Budjet kartasida fakt (sarf 120 000 + dalolatnoma 3 000 000) va foiz; reja–fakt jadvalida smeta vs fakt; prognoz xatosiz |
| F-08 | Finansist → To‘lov so‘rovlari → yangi so‘rov 500 000 (QA Yetkazuvchi); buxgalter tasdiqlaydi va to‘laydi | Holatlar: kutilmoqda → tasdiqlangan → to‘langan; kalendarda chiqadi |
| F-09 | `qa.prorab` → manzil qatoriga `/app/finance` yozing | Moliya sahifasi ochilmaydi (ruxsat yo‘q) |

## 8. Ish haqi va akkord (buxgalter + admin)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| Z-01 | Buxgalter → Ish haqi → «Yangi davr»: joriy oy, QA obyekt | Davr «Ochiq»; **«Kutilayotgan akkord»** kartasi: brigadir — 3 500 000 |
| Z-02 | «Xodim qo‘shish»: prorab, oklad 2 000 000 | Jadvalda prorab, akkord 0, net 2 000 000 |
| Z-03 | Buxgalter → «Davrni yopish» | Rad etiladi (ruxsat yo‘q — standart siyosatda davrni admin yopadi; kerak bo‘lsa Ruxsatlar sahifasida buxgalterga «Ish haqi: o‘zgartirish» beriladi) |
| Z-04 | Admin → Ish haqi → «Davrni yopish» | Davr «Yopilgan»; brigadir qatori avtomatik: akkord 3 500 000, net 3 500 000; prorab net 2 000 000; har xodimga mehnat hujjati (Birlamchi hujjatlar, tavsifda «akkord 3500000.00») |
| Z-05 | Buxgalter → Bank va kassa → Avans berish: brigadir (xodim kontragenti), 500 000 | Obyekt kartasi: avanslar 500 000; brigadir panelida avanslar 500 000, qoldiq kamaydi |
| Z-06 | Admin → Ish haqi → brigadir qatorida «To‘lash» | Oynada «Avansdan hisoblanadi 500 000 · Kassadan to‘lanadi 3 000 000»; tasdiqlangach holat «To‘langan»; kassa 3 000 000 ga kamaydi; Birlamchi hujjatlarda «Avans hisobi» 500 000 va to‘lov 3 000 000 |
| Z-07 | Brigadir → Bosh sahifa → «Mening hisobim» | Davrga kirgan 3 500 000, to‘langan 3 500 000, avanslar 0, qoldiq 0 |
| Z-08 | Prorab → hisobotni +2 tuzatish (to‘lovdan keyin); admin → keyingi oy davrini ochib yoping | Brigadir panelida qoldiq 200 000; keyingi davrda brigadir qatori akkord 200 000 (eski stavka 100 000). Manfiy tuzatishda farq keyingi musbat summadan ayiriladi, jami manfiy bo‘lsa davrga kirmaydi |

## 9. Bosh sahifa, Telegram, audit, platforma yakuni

| ID | Qadam | Kutilgan natija |
|---|---|---|
| D-01 | Admin → Bosh sahifa | KPI: obyektlar, vazifalar, hisobotlar, ombor; xarajat grafigi; moliya bloki; davr va obyekt filtri |
| D-02 | Brigadir va prorab → Bosh sahifa | Moliya bloki yo‘q; hajmlar va vazifalar bor |
| D-03 | Admin → Integratsiyalar → Telegram ulash havolasi (bot sozlangan bo‘lsa) | Botda menyu rolga mos; brigadir botdan progress yuboradi — saytda «Yuborilgan» hisobot |
| D-04 | Admin → Audit | Yuqoridagi amallar ijrochi nomi bilan; Excel eksport ishlaydi |
| D-05 | Egasi → Mijozlar → kompaniyani bloklang; `qa.prorab` bilan kiring | Xodim kira olmaydi; admin faqat Billing va Murojaat; «Qayta ochish» hamma narsani qaytaradi |
| D-06 | Egasi → kompaniya → Audit (umumiy) | Kompaniya amallari egasida ko‘rinadi |

## 10. Tozalash (majburiy)

1. Hamma oynalarni yoping.
2. `backend` papkasida: `npm run qa:cleanup -- QA-QOLDA-1` (yoki `--all-qa`). Natija: `"deleted": true`, jadvallar soni va o‘chirilgan fayllar soni.
3. Egasi → Mijozlar: «QA Qo‘lda MCHJ» yo‘q; `qa.admin` bilan kirish — «Login yoki parol xato».
4. `docker compose ps` — hamma konteyner ishlayapti; haqiqiy kompaniyalar joyida.

Tozalash faqat `QA-` kaliti bilan boshlangan kompaniyani o‘chiradi; boshqa kalit bilan buyruq rad etiladi. Buyruq `backend/.env` dagi `MIGRATION_DATABASE_URL` (egasi roli) bilan ishlaydi.
