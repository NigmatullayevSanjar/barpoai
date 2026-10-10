# BARPO AI — raqobatchilar va UI/UX tadqiqoti

Sana: 2026-10-07. Tadqiqot faqat ochiq manbalardan olingan: login qilinmadi, formalar to‘ldirilmadi.
Xom eslatmalar: [sources/iqub.md](sources/iqub.md), [sources/builderp.md](sources/builderp.md), [sources/uyqur.md](sources/uyqur.md), [sources/galleries.md](sources/galleries.md). Skrinshotlar: [screenshots/](screenshots/).
BARPO haqidagi har da’vo koddan tekshirilgan (fayl yo‘li ko‘rsatilgan).

**Belgilar.** “bor”, “qisman”, “yo‘q”, “noma’lum”. Raqobatchida “noma’lum” degani ochiq manbada topilmadi, “yo‘q” degani emas. BARPO’da “yo‘q” kodda tekshirilgan.

---

## 1. Qisqa xulosa

1. Uchala raqobatchi ham obyekt, ombor va moliyani qamraydi. Modul kengligi bo‘yicha BARPO ulardan qolishmaydi.
2. **iQUB** turar-joy quruvchilari uchun qurilish va kvartira sotuvini (CRM) birlashtiradi, Didox va OneID bilan ishlaydi. BARPO’da CRM yo‘q.
3. **Build ERP** funksional jihatdan eng chuqur raqobatchi: naryad, zayavka zanjiri, PDF/F-3 hujjatlar, texnika inventari, ko‘p valyuta, 1 oylik bepul sinov.
4. **Uyqur** (Softex) mobil-birinchi: 6 ta ilova, Didox, Google Sheets. Ochiq marketing sayti yo‘q.
5. Hech birining saytida narx yo‘q. Hammasi demo yoki menejer orqali sotadi va joriy etishni odam orqali qiladi.
6. BARPO’ning kod bilan tasdiqlangan farqlari: Telegram bot ish oqimlari, rol×sahifa×CRUD ruxsatlari, o‘zgarmas ledger, brigadir custody, narxni yashirish.
7. Asosiy bo‘shliqlar: hujjat fayllari va PDF, dashboard grafiklari, ilova ichidagi onboarding, Didox/bank, shartnomalar.
8. Strategik qaror kutayotganlar: CRM, mobil ilova, ko‘p valyuta, sotuv modeli.

---

## 2. Raqobatchilar profili

### Manba kalitlari

| Kalit | URL |
|---|---|
| Q1 | https://iqub.uz/uz (bosh sahifa: Modullar, Afzalliklar, FAQ) |
| Q2 | https://iqub.uz/uz/privacy-policy |
| E1 | https://builderp.uz/uz |
| E2 | https://builderp.uz/files/builderp-presentation.pdf (saytdagi 14 betlik taqdimot; undagi raqamlar namuna) |
| E3 | https://builderp.uz/uz/blog/erp-nima-qaysi-kompaniyalarga-kerak |
| E4 | https://builderp.uz/uz/blog/qurilishda-raqamlashtirishni-qayerdan-boshlash-kerak |
| U1 | https://uyqur.uz/login (uyqur.uz va app.uyqur.uz shu login sahifasiga olib boradi) |
| U2 | https://app.uyqur.uz/terms-of-use |
| U3 | https://app.uyqur.uz/privacy-policy |
| U4 | https://play.google.com/store/apps/details?id=uz.softex.uyqur.uyqur_app |
| U5 | https://play.google.com/store/apps/details?id=uz.uyqur.warehouse |
| U6 | https://play.google.com/store/apps/details?id=uz.softex.uyqur.boss |
| U7 | https://play.google.com/store/apps/details?id=uz.uyqur.analytics |
| U8 | https://apps.apple.com/ba/app/uyqur/id6752608630 |
| F | https://www.figma.com/design/zT1yQ2F2GwRr2RHpK9hns2/Barpo.AI (BARPO’ning o‘z dizayn fayli) |

### 2.1. iQUB ERP

- **Kimlar uchun:** ko‘p qavatli turar-joy quruvchilari, qurilish va sotuv bo‘limi bilan [Q1, FAQ]. Kompaniya hajmi noma’lum.
- **Asosiy farqi:** qurilish va kvartira sotuvi bitta tizimda. CRM’da lid, mijoz va shartnoma bor. Xonadonlar “sotuvda / band / sotilgan” holatida yuradi [Q1].
- **Modullar:** obyekt va xonadonlar; ombor (zaxira, buyurtma, omborlararo ko‘chirish, inventarizatsiya); moliya (mijoz to‘lovlari, bank hisobotlari, kassalar, kontragentlar); xodimlar, maosh va rollar; KPI, hisobotlar va aktlar; dashboard [Q1].
- **Integratsiya:** FAQ’da Didox va OneID bilan to‘liq integratsiya deyilgan [Q1]. Bank, 1C, Click/Payme noma’lum.
- **Narx va onboarding:** narx, tarif va trial saytda yo‘q, faqat “Demo olish” tugmasi bor [Q1]. O‘rnatilgandan keyin xodimlarga offline trening, online darsliklar va doimiy yordam beriladi [Q1, FAQ].
- **Va’da va ishonch:** ko‘p qavatli qurilishni avtomatlashtirish va hammasini bitta tizimda yuritish. Saytda “20+ kompaniya” va 4 ta qisqa fikr bor; logotip, keys va raqamli natija yo‘q [Q1]. FAQ’ga ko‘ra har kompaniya ma’lumoti alohida serverda saqlanadi [Q1].
- **Ko‘rinadigan UX** (mahsulot rasmidan talqin, [screenshots/iqub-home.png](screenshots/iqub-home.png)): ingichka ikonka paneli va ikkinchi darajali sidebar, breadcrumb, 4 ta KPI karta, tablar, qidiruv va kategoriya filtri, status badge’li jadval. Oq fon, to‘q sariq aksent.
- **Boshqa:** UNICORP LLC [Q2]; sayt uz, ru va en tillarida.

### 2.2. Build ERP

- **Kimlar uchun:** turar-joy quruvchilar, tijorat pudratchilari va loyiha jamoalari, “kichikdan yirikkacha” [E1]. Blogda bir nechta obyekt va 10+ xodimli kompaniyalar tilga olinadi [E3].
- **Modullar** [E2]:
  - obyekt kartasi (dom/blok bo‘limlari, 8 ta tab);
  - smeta (Excel import, reja/fakt);
  - naryad kanbani (qavat bo‘yicha hajm);
  - ombor va zayavka zanjiri (omborchi → ta’minotchi → qabul);
  - moliya (kassa, so‘m/dollar, pul so‘rovlari doskasi, qism-qism to‘lov, kontragent qarzi);
  - 7 rol (Admin, PTO, Prorab, Brigadir, Ta’minotchi, Omborchi, Buxgalter), sozlanadigan huquqlar va tasdiqlash zanjiri;
  - hujjatlar (shartnoma, F-3);
  - PDF, DOCX va Excel eksport;
  - audit izi;
  - korxona mulki (inventar raqami, QR yorliq, telefon kamerasi bilan inventarizatsiya, ta’mir jurnali, hisobdan chiqarish akti).
- **Integratsiya:** noma’lum. Footerdagi “Integratsiyalar” havolasi hech qayerga olib bormaydi [E1].
- **Narx va onboarding:** narx ochiq emas; obyektga tashrifdan keyin individual narx beriladi [E1]. 1 oylik bepul sinov, karta talab qilinmaydi [E1]. Va’dalar: 5 daqiqada sozlanadi, ko‘pchilik 1 haftada ishga tushadi, shaxsiy menejer va 24/7 yordam [E1]. Blogda pilot tavsiya qilinadi: 1 obyekt, 1 oy [E4].
- **Va’da va ishonch:** Excel, Telegram va qog‘oz hisobotlar o‘rniga bitta ekran. O‘zini “N1” deb ataydi, lekin isbot keltirmaydi [E1]. Raqamlar: 40+ modul, 7 rol, 3 til. 5 ta hamkor nomi va 3 ta iqtibos bor; mijozlar soni noma’lum [E1].
- **Ko‘rinadigan UX:** saytda haqiqiy skrinshot yo‘q, faqat marketing maketi bor: 3 ta KPI, 6 haftalik ustunli diagramma, byudjet progress-bari, voqealar lentasi ([screenshots/builderp-home-hero.png](screenshots/builderp-home-hero.png)). Taqdimotga ko‘ra obyekt sarlavhasida jonli KPI, tablar, kanban va menyuda kutilayotgan so‘rovlar soni bor [E2]. Binafsha aksent.
- **Boshqa:** sayt 4 tilda (uz, ўз, ru, en) [E1].

### 2.3. Uyqur

- **Ishlab chiqaruvchi:** Softex [U2][U3][U8]. Ochiq marketing sayti yo‘q: uyqur.uz login sahifasiga yo‘naltiradi [U1].
- **Kimlar uchun:** qurilish, ishlab chiqarish va xizmat ko‘rsatish [U4]. Multi-tenant: har tashkilot alohida, ma’lumot izolyatsiya qilingan [U2]. Kompaniya hajmi noma’lum. Play’dagi yuklab olishlar 50+ dan 100+ gacha [U4–U7]; izoh: bu erta bosqich belgisi bo‘lishi mumkin.
- **Modullar:**
  - loyiha kassalari, kirim-chiqim, kategoriya limitlari, shartnoma bo‘yicha to‘lov, o‘zaro qarzdorlik, dashboard vidjetlari [U8];
  - ombor: alohida Sklad ilovasi (qabul, yaroqsizga chiqarish, ko‘chirish, buyurtma, push orqali tasdiq) [U5];
  - smeta va foyda/zarar prognozi (Boss ilovasida) [U6];
  - hisobotni tasdiqlash (Analitika ilovasida) [U7];
  - rollar va huquqlar [U4].
- **Mobil:** 6 ta ilova (Uyqur, Sklad, Prorab, Boss, Analitika, Ekspeditor), iOS va Android. Faol yangilanib turadi [U4–U8].
- **Integratsiya:** mobil ilovada Didox hujjatlari [U8]; Google Sheets’ga bir tomonlama sinxronlash [U3]; ta’minotchilarga SMS [U6]; API [U2]. Ma’lumotlar O‘zbekistondagi serverlarda [U2].
- **Narx va onboarding:** obuna asosida, to‘lov davr boshida [U2]. Tarif sahifasi topilmadi; foydalanish shartlarida to‘ldirilmagan shablon joylari qolgan [U2]. Trial noma’lum. Login sahifasida Domen, Login va Parol maydonlari, Telegram va email bilan kirish tugmalari bor; ro‘yxatdan o‘tish havolasi yo‘q [U1].
- **Va’da:** obyektlarni zamonaviy boshqarish, qurilishdagi o‘g‘irlikning oldini olish, qog‘oz hisobotlardan voz kechish [U1][U6][U7]. Ishonch belgisi topilmadi.
- **Ko‘rinadigan UX:** faqat login sahifasi ko‘rinadi ([screenshots/uyqur-login.png](screenshots/uyqur-login.png)): ikki panelli, chapda bino fotosi, soat va ob-havo, o‘ngda kirish kartasi, ko‘k asosiy rang. Ichki ekranlar noma’lum.
- **Boshqa:** agent App Store’dagi “More by SOFTEX” ro‘yxatida Uysot CRM va Uysot ilovalarini ko‘rgan [U8]. BARPO integratsiyalar ro‘yxatida UySot bor (`frontend/src/features/integrations/IntegrationsPage.tsx`). Bu bog‘liqlikni alohida tekshirish kerak (7-bo‘lim).

### 2.4. Figma (BARPO’ning o‘z dizayn fayli)

Fayl login’siz ochiladi, lekin faqat oynali brauzerda (headless rejimni CloudFront bloklaydi) [F]. Kanvasdagi freymlar: kirish va ro‘yxatdan o‘tish, bosh sahifa, bildirishnomalar, obyektlar (ro‘yxat, ko‘rish A/B, qo‘shish), smetalar, vazifalar, xomashyolar, hisobotlar, hodimlar, sozlamalar, profil, 404. Ikkita freymning skrinshoti olindi:

- **Bosh sahifa** ([screenshots/figma-bosh-sahifa.png](screenshots/figma-bosh-sahifa.png)): obyekt tanlash filtri, sana oralig‘i, 4 ta KPI karta, 6 oylik xarajat ustunli grafigi, xarajatlar taqsimoti donut grafigi, yaqin vazifalar ro‘yxati va faol obyektlar jadvali (progress bilan).
- **Sozlamalar** ([screenshots/figma-sozlamalar.png](screenshots/figma-sozlamalar.png)): til, vaqt mintaqasi, valyuta, sana formati; Email, SMS, Telegram va vazifa eslatmalari uchun tugmalar. Platforma nomi “BuildFlow” deb yozilgan.

Kirish dizaynida telefon, parol va “Telegram orqali kirish” bor. Obyektlar fotosuratli kartalar ko‘rinishida, obyekt ichida esa “Blok A/B/C” kartalari bor. Figmadagi raqamlar namuna, ular BARPO’ga ko‘chirilmaydi (statik demo raqam qoidasi).

---

## 3. Funksiyalar matritsasi

BARPO ustunidagi yo‘llar `frontend/src/features/` va `backend/src/` ga nisbatan.

| Modul | BARPO | iQUB | Build ERP | Uyqur |
|---|---|---|---|---|
| Obyekt boshqaruvi | bor: obyekt, zona daraxti (`projects/`, `routes-company.ts`) | bor: majmua, xonadon holati [Q1] | bor: dom/blok, 8 tab [E2] | bor: loyiha rejasi, loyiha kassalari [U4][U8] |
| Smeta | bor: norma, oylik taqsimot, reviziya, Excel import (`estimates.ts`, `estimates/`) | noma’lum | bor: Excel import [E2] | qisman: Boss ilovasida [U6] |
| Reja–fakt | bor: tur, zona, oy kesimida (`routes-finance-extra.ts`) | noma’lum | bor [E2] | qisman: foyda/zarar prognozi [U6] |
| Ombor | bor: kirim, jo‘natish, qisman qabul, inventarizatsiya (`inventory.ts`, `stock/`) | bor [Q1] | bor [E2] | bor: alohida ilova [U5] |
| Material so‘rovi zanjiri | bor: brigadir → ombor, Telegram’dan ham (`routes-stock-extra.ts`) | qisman: buyurtmalar [Q1] | bor: omborchi → ta’minotchi → qabul [E2] | bor: buyurtma va push-tasdiq [U5] |
| Xodim qo‘lidagi material (custody) | bor: tasdiqlanmagan sarf xarajat emas (`inventory.ts`) | noma’lum | qisman: “instrument kimda” [E2] | noma’lum |
| Kassa va bank hisoblari | bor (`cash_accounts`) | bor [Q1] | bor [E2] | bor [U8] |
| To‘lov so‘rovi va tasdiqlash | bor (`finance/workflow.tsx`) | noma’lum | bor: doska ko‘rinishida [E2] | qisman: limitlar, push-tasdiq [U4][U5] |
| Kontragent qarzi va solishtirish | bor (`/v1/counterparties/{id}/statement`) | bor [Q1] | bor [E2] | bor [U8] |
| Ko‘p valyuta | yo‘q (egasi qarori: faqat UZS) | noma’lum | bor: so‘m/dollar [E2] | noma’lum |
| Ish haqi | bor (`/v1/finance/payroll`) | bor [Q1] | bor: brigadir avansi [E2] | noma’lum |
| Vazifalar | bor: kanban, tekshiruvchi (`work/TasksPage.tsx`) | noma’lum | bor: naryad kanbani [E2] | noma’lum |
| Kunlik/haftalik hisobot va foto | bor (`work/ReportsPage.tsx`) | qisman: hisobot, akt [Q1] | bor [E2] | qisman: tasdiqlash [U7] |
| Rollar | bor: 7 kompaniya + 3 platforma roli (`permissions.ts`) | bor [Q1] | bor: 7 rol [E2] | bor [U4] |
| Sozlanadigan ruxsatlar | bor: rol×sahifa×CRUD, individual grant/deny (`permissions/RolePermissionsPage.tsx`) | noma’lum | bor: huquq va tasdiqlash zanjiri [E2] | qisman: tafsilot noma’lum [U4] |
| CRM / kvartira sotuvi | yo‘q | bor: lid, mijoz, shartnoma [Q1] | noma’lum | noma’lum (Softex’da alohida Uysot CRM [U8]) |
| Shartnomalar | yo‘q | bor (sotuv) [Q1] | bor [E2] | bor [U8] |
| Hujjat fayllari | qisman: faqat JPEG/PNG foto (`routes-work.ts`) | qisman: aktlar, Didox [Q1] | bor [E2] | qisman: Didox [U8] |
| Dashboard | bor: rolga mos KPI, grafiksiz (`dashboard/TenantDashboard.tsx`) | bor [Q1] | bor: KPI, diagramma [E1][E2] | bor: vidjetlar, Analitika ilovasi [U7][U8] |
| Excel eksport | bor: smeta, reja–fakt, vazifa, ombor, audit | noma’lum | bor [E2] | qisman: Google Sheets [U3] |
| PDF/DOCX | yo‘q | noma’lum | bor: PDF, DOCX, F-3 [E2] | noma’lum |
| Audit jurnali | bor (`audit/AuditPage.tsx`) | noma’lum | bor [E2] | noma’lum |
| Telegram bot (ish oqimlari) | bor: rol menyusi, material so‘rovi, progress+foto (`telegram.ts`, `telegram-flows.ts`) | noma’lum (faqat kanal) [Q1] | noma’lum (faqat aloqa) [E1] | noma’lum |
| Telegram orqali kirish | qisman: backend bor, frontend tugmasi yo‘q (`routes-auth.ts`) | noma’lum | noma’lum | qisman: login’da tugma [U1] |
| SMS | yo‘q | qisman: qarzdorlarga, mijoz fikrida [Q1] | noma’lum | bor: ta’minotchilarga [U6] |
| Mobil ilova | yo‘q (scope’dan tashqari) | noma’lum (maxfiylik siyosatida tilga olingan) [Q2] | noma’lum | bor: 6 ilova [U4][U8] |
| Didox | yo‘q (`not_configured`) | bor [Q1] | noma’lum | qisman: mobil ilovada [U8] |
| OneID | yo‘q | bor [Q1] | noma’lum | noma’lum |
| Bank | yo‘q (`not_configured`) | qisman: “bank hisobotlari” [Q1] | noma’lum | noma’lum |
| 1C | yo‘q | noma’lum | noma’lum | noma’lum |
| Click / Payme | yo‘q (SaaS checkout 503) | noma’lum | noma’lum | noma’lum |
| Google Sheets | yo‘q | noma’lum | noma’lum | bor [U3] |
| Texnika va asbob hisobi | yo‘q (texnika faqat xarajat turi) | noma’lum | bor: QR, ta’mir, hisobdan chiqarish [E2] | noma’lum |
| API | bor: OpenAPI, Bearer token | noma’lum | noma’lum | bor [U2] |
| Ma’lumot izolyatsiyasi | bor: PostgreSQL RLS (`migrations/001_core.sql`) | bor: alohida server [Q1] | noma’lum | bor [U2] |
| Tillar | uz, ru | uz, ru, en [Q1] | uz, ўз, ru, en [E1] | uz; Analitika’da ru [U1][U7] |
| Saytda ochiq narx | yo‘q (marketing sayt yo‘q) | yo‘q [Q1] | yo‘q, individual narx [E1] | yo‘q [U1] |
| Bepul sinov | bor: 14 kun | noma’lum | bor: 1 oy [E1] | noma’lum |
| O‘zi ro‘yxatdan o‘tish | yo‘q: faqat platforma egasining taklifi orqali | noma’lum (demo formasi) [Q1] | noma’lum [E1] | yo‘q [U1] |
| Joriy etish va o‘qitish | belgilanmagan | bor: offline trening [Q1] | bor: shaxsiy menejer, ~1 hafta [E1] | noma’lum |
| Ilova ichidagi onboarding | yo‘q | noma’lum | noma’lum | noma’lum |

---

## 4. BARPO’ning ustunliklari (kod bilan tasdiqlangan)

Quyidagilar raqobatchilarning ochiq manbalarida ko‘rinmadi. Bu ularda yo‘qligini isbotlamaydi, faqat ular buni ko‘rsatmaydi. Sotuvda shu farqlarni ko‘rsatish mumkin.

1. **Telegram bot ish oqimlari.** Rolga mos menyu, material so‘rovi (obyekt → material → miqdor → izoh) va foto bilan progress hisoboti (obyekt → ish qatori → miqdor → matn → rasm) to‘g‘ridan-to‘g‘ri tizimga yoziladi. Kod: `backend/src/telegram.ts`, `backend/src/telegram-flows.ts`. Raqobatchilarda Telegram faqat aloqa kanali sifatida ko‘rindi [Q1][E1].
2. **Rol × sahifa × CRUD matritsasi.** Admin har rol uchun 28 ta sahifada yaratish, o‘qish, tahrirlash va o‘chirishni alohida sozlaydi. Xodimga individual ruxsat berish yoki taqiqlash mumkin. Tekshiruv serverda, 63 endpoint × 10 rol testi bilan. Kod: `backend/src/permissions.ts`, `frontend/src/features/permissions/RolePermissionsPage.tsx`. Build ERP’da ham sozlanadigan huquqlar bor [E2], lekin tafsiloti noma’lum.
3. **O‘zgarmas ledger va jurnal.** Ombor va moliya yozuvlarini o‘zgartirish yoki o‘chirish baza darajasida taqiqlangan (`IMMUTABLE_LEDGER` trigger). Xato teskari yozuv bilan tuzatiladi. Kod: `backend/migrations/001_core.sql`.
4. **Brigadir custody.** Jo‘natish, qabul va sarf alohida bosqichlar. Prorab tasdiqlamaguncha xarajat yozilmaydi, qisman qabul qilish mumkin. Kod: `backend/src/inventory.ts`.
5. **Narxni yashirish.** Narx huquqi bo‘lmagan rollarga (masalan brigadir) API javobida narx maydonlari umuman kelmaydi. Kod: `redactPrices`, `backend/src/permissions.ts`.
6. **Takroriy bosishdan himoya.** `Idempotency-Key` va optimistic version tufayli pul, material va progress ikki marta yozilmaydi. Kod: `backend/src/db.ts`, `backend/src/http.ts`.
7. **Smeta tarixi va xavfsiz import.** Har tahrir yangi o‘zgarmas reviziya bo‘ladi. Excel importda formula, makros va tashqi havola rad etiladi. Kod: `backend/src/estimates.ts`.
8. **Progress tuzatish tarixi.** Qabul qilingan progress o‘chirilmaydi, tuzatish sababi bilan alohida yoziladi. Kod: `progress_corrections` (migratsiya 011).
9. **Ma’lumot izolyatsiyasi baza darajasida.** PostgreSQL FORCE RLS va cheklangan runtime roli. Kod: `backend/migrations/001_core.sql`. iQUB alohida server haqida yozadi [Q1], Uyqur tashkilot izolyatsiyasi haqida [U2].
10. **Ochiq bepul sinov va avtomatik obuna hisobi.** 14 kunlik trial, 30 kunlik avtomatik invoys va ortiqcha to‘lovni kreditga o‘tkazish. Kod: `backend/src/billing.ts`. Build ERP’da sinov uzunroq: 1 oy [E1].

Build ERP’da ham bor bo‘lgani uchun noyob emas: audit jurnali va Excel eksport [E2].

---

## 5. Bizda yo‘q, lekin foydali narsalar

Ustuvorlik: **P0** — raqobatchilarda keng tarqalgan yoki BARPO’ning o‘z Figma dizaynida bor va biznes qarori talab qilmaydi; **P1** — muhim, qaror yoki tashqi kirish kerak bo‘lishi mumkin; **P2** — keyinroq. Hajm: S — bir necha kun, M — 1–2 hafta, L — 2+ hafta (taxminiy).

| # | Imkoniyat | Kimda bor | Ust. | Hajm | Modul va fayllar | Qaror |
|---|---|---|---|---|---|---|
| 1 | Hujjat fayllarini biriktirish (PDF, DOCX, XLSX): shartnoma, akt, nakladnoy | Build ERP [E2], Uyqur [U8], iQUB qisman [Q1] | P0 | M | `backend/src/routes-work.ts` (`/v1/files` faqat JPEG/PNG), `features/files/FilesPage.tsx`, `features/work/Files.tsx`; fayl skaneri ochiq band (BACKEND_TODO 08) | Kichik qaror: ruxsat etilgan turlar va hajm |
| 2 | Dashboard grafiklari: oylik xarajat dinamikasi, xarajat taqsimoti, obyekt va sana filtri | Figma dizayni [F], Build ERP [E1][E2], Uyqur [U8] | P0 | M | `features/dashboard/TenantDashboard.tsx`, `backend/src/routes-dashboard.ts`; oylik qatorlar `routes-finance-extra.ts` da bor. Grafik inline SVG, yangi kutubxonasiz | Yo‘q |
| 3 | Ilova ichidagi “Birinchi qadamlar” ro‘yxati va trial tugashi eslatmasi | Hech kimda ko‘rinmadi; raqobatchilar buni odam orqali qiladi [Q1][E1] | P1 | M | `TenantDashboard.tsx`, `routes-dashboard.ts` (holat serverdan hisoblanadi), `billing/TenantBillingPage.tsx` | Yo‘q |
| 4 | PDF chop etish: smeta, obyekt hisoboti, akt, naryad | Build ERP: PDF, DOCX, F-3 [E2] | P1 | M–L | `backend/src/xlsx.ts` yonida PDF generator, `routes-*-extra.ts` eksportlari, `common/ExportButton.tsx` | **QAROR KERAK**: qaysi shakllar (F-3, akt, naryad) va backend’ga yangi kutubxona |
| 5 | Didox integratsiyasi | iQUB [Q1], Uyqur [U8] | P1 | L | `integrations/`, `docs/backend/BARPO_INTEGRATIONS.md` adapter kontrakti | **QAROR KERAK**: tashqi kirish (hujjat, sandbox, kalit) |
| 6 | Bank ko‘chirmasi importi yoki bank integratsiyasi | iQUB qisman [Q1] | P1 | L | `finance/`, `cash_accounts`, integratsiya kontrakti | **QAROR KERAK**: qaysi bank va format |
| 7 | Shartnomalar moduli: pudratchi va yetkazib beruvchi shartnomasi, shartnoma bo‘yicha to‘lov | Build ERP [E2], Uyqur [U8] | P1 | L | yangi migratsiya, `finance/`, `counterparties` | **QAROR KERAK**: maydonlar va to‘lov bog‘lanishi |
| 8 | Telegram orqali kirish tugmasi | Figma dizayni [F], Uyqur [U1] | P2 | S | `features/auth/pages.tsx`; backend `POST /v1/auth/telegram/login` tayyor | Kichik sozlama: BotFather’da domen |
| 9 | Obyekt bloklari va qavatlari bo‘yicha ko‘rinish (blok kartalari, progress) | Build ERP [E2], Figma [F] | P2 | M | `features/projects/ProjectDetailPage.tsx`; mavjud zona daraxti asos bo‘ladi | Yo‘q |
| 10 | Xarid (ta’minot) zanjiri: so‘rov → xarid buyurtmasi → yetkazib beruvchi → kirim | Build ERP: ta’minotchi roli [E2] | P2 | L | `stock/`, `finance/` (`purchase_order` turi bor), `permissions.ts` | **QAROR KERAK**: yangi rol 10 rol qaroriga zid |
| 11 | Texnika va asbob-uskuna hisobi: inventar raqami, kimda, ta’mir, hisobdan chiqarish | Build ERP [E2] | P2 | L | yangi modul, `stock/` | **QAROR KERAK**: scope |
| 12 | SMS bildirishnoma: qarzdorlarga, ta’minotchilarga | iQUB qisman [Q1], Uyqur [U6] | P2 | M | `backend/src/notify.ts`, `worker.ts` | **QAROR KERAK**: SMS provayderi va narxi |
| 13 | Kontragentni STIR bo‘yicha avtomatik tekshirish | Uyqur [U8] | P2 | M | `finance/pages.tsx` (kontragentlar) | **QAROR KERAK**: tashqi manba |
| 14 | Google Sheets’ga eksport yoki sinxronlash | Uyqur [U3] | P2 | M | eksport endpointlari | Yo‘q (past qiymat) |
| 15 | Ko‘p valyuta (USD) | Build ERP [E2] | — | L | `money.ts`, barcha moliya jadvallari | **QAROR KERAK**: egasi qaroriga zid (faqat UZS) |
| 16 | Marketing sayt, ochiq narx, o‘zi ro‘yxatdan o‘tish | Raqobatchilarda sayt bor, narx hech kimda yo‘q [Q1][E1] | — | M | alohida loyiha; `routes-platform.ts` taklif oqimi | **QAROR KERAK**: sotuv modeli |
| 17 | Mobil ilova | Uyqur: 6 ilova [U4][U8] | — | L | — | **QAROR KERAK**: egasi qaroriga zid (scope’dan tashqari) |
| 18 | CRM / kvartira sotuvi | iQUB [Q1] | — | L | yangi modul | **QAROR KERAK**: egasi qaroriga zid bo‘lishi mumkin; UySot integratsiyasi bilan bog‘liq |

AI funksiyalari raqobatchilarning ochiq manbalarida uchramadi. Egasi qarori bilan ular rejadan tashqarida qoladi.

---

## 6. UI/UX tavsiyalari (BARPO sahifalari bo‘yicha)

Hamma tavsiya mavjud komponentlar (`frontend/src/components/ui`) va `tokens.css` dagi ranglar bilan amalga oshadi. Yangi UI kutubxona va yangi rang kerak emas. Galereya misollaridan faqat g‘oya olinadi. Raqamlar faqat serverdan keladi, demo raqam yo‘q.

**Galereya havolalari:**
- G1 https://www.saasframe.io/examples/baremetrics-dashboard
- G2 https://www.saasframe.io/examples/lightspark-transaction-history
- G3 https://www.saasframe.io/examples/glide-crm-contacts-list
- G4 https://saasinterface.com/components/bulk-actions/ (pullik, faqat teaser ko‘rindi)
- G5 https://www.saasframe.io/examples/lightspark-cards-empty-state
- G6 https://www.saasframe.io/examples/evervault-empty-activity-log
- G7 https://www.saasframe.io/examples/customer-io-create-first-campaign
- G8 https://www.saasframe.io/examples/superlist-checklist
- G9 https://www.saasframe.io/examples/lightspark-account-security-settings
- G10 https://www.saasframe.io/examples/context-dev-billing-settings
- G11 https://www.saasframe.io/examples/hugging-face-billing-overview
- G12 https://www.saasframe.io/examples/tines-workspace-members
- G13 https://www.saasframe.io/examples/tines-member-access-permissions

### 6.1. Bosh sahifa — `features/dashboard/TenantDashboard.tsx`
- KPI kartada joriy qiymat yonida oldingi davr bilan farq va kichik trend chizig‘i [G1]. Bu `Stat` va `Badge` bilan, chiziq esa inline SVG va `--brand-500` bilan qilinadi.
- Tepaga obyekt tanlash va sana oralig‘i filtrini qo‘yish [F]. `ProjectSelect` allaqachon bor.
- 6 oylik xarajat ustunli grafigi va xarajat taqsimoti [F]. Ma’lumot reja–fakt va moliya yig‘masining oylik qatorlarida bor. Ranglar bordo shkalasidan va holat ranglaridan olinadi.
- Yangi kompaniya uchun “Boshlash” bloki: obyekt yaratish, xodim qo‘shish, smeta import qilish, Telegram ulash. Har qadam serverdagi haqiqiy holatdan belgilanadi [G7]. Progress `--brand-500`, bajarilgan qadam `--success`.
- Pastda so‘nggi voqealar lentasi (audit hodisalaridan, ruxsat doirasida) [G1][E1].

### 6.2. Obyektlar — `features/projects/ProjectsPage.tsx`, `ProjectDetailPage.tsx`
- Ro‘yxat uchun jadval va karta ko‘rinishini `Segmented` bilan almashtirish. Kartada progress chizig‘i va asosiy raqamlar bo‘ladi [F].
- Obyekt kartasi sarlavhasida byudjet, ishlatilgan, qolgan va foiz ko‘rsatiladi [E2]. Bu `finance.read` huquqi bo‘lsa `/v1/projects/{id}/dashboard` dan olinadi.
- Zonalarni bloklar sifatida, har biri progress bilan kartalarda ko‘rsatish [F][E2].

### 6.3. Katta jadvallar — `components/ui/DataTable.tsx` va undan foydalanadigan sahifalar (ombor, moliya hujjatlari, xodimlar, vazifalar)
- Yagona toolbar: chapda qidiruv va filtrlar, o‘ngda eksport va asosiy tugma [G2].
- Server tomonda sahifalash. Hozir `Pagination` faqat audit, fayllar va bildirishnomalarda ishlatiladi. Ko‘p ro‘yxat yuklangan qatorlar ichida qidiradi.
- Ommaviy amallar: checkbox ustuni va qator tanlanganda pastda chiqadigan panel (`--brand-900`) [G4]. Hozir `DataTable` da tanlash yo‘q.
- Ustunlarni yashirish yoki ko‘rsatish. Galereyada ochiq misol topilmadi, lekin katta moliya jadvallari uchun foydali.
- Xodimlar ro‘yxatida avatar, rol belgisi va oxirgi faollik [G3][G12].

### 6.4. Bo‘sh holatlar — barcha ro‘yxatlar
- “Ma’lumot yo‘q” va “filtr natija bermadi” holatlarini ajratish. Ikkinchisida “Filtrni tozalash” tugmasi bo‘ladi [G6]. `EmptyState` ikki variantda ishlatiladi.
- Bo‘sh holatda sahifaning asosiy tugmasi ko‘rinib turadi [G5]. Smetalar sahifasida asosiy amal “Excel’dan import” bo‘lishi mumkin, chunki raqobatchi aynan smeta faylini yuklashni bosh va’da qilib qo‘ygan [E1].

### 6.5. Vazifalar — `features/work/TasksPage.tsx`
- Modal o‘rniga o‘ng tomondan ochiladigan tafsilot paneli. Ro‘yxat ko‘rinib turgan holda vazifani o‘qish va o‘tkazish mumkin bo‘ladi [G8]. Panel faqat CSS bilan qilinadi.
- Vazifalar sahifasida qidiruv yo‘q, qo‘shish kerak.

### 6.6. Moliya — `features/finance/pages.tsx`, `workflow.tsx`
- To‘lov so‘rovlarini holat ustunlari bo‘yicha doska ko‘rinishida ham ko‘rsatish (kutilmoqda, tasdiqlangan, to‘langan) [E2]. Hozir faqat jadval bor.
- Menyuda kutilayotgan so‘rovlar soni belgisi [E2]: to‘lov so‘rovlari, material so‘rovlari, tekshiruvdagi hisobotlar. Raqam `/v1/dashboard` dan olinadi.

### 6.7. Xodimlar va ruxsatlar — `features/employees/EmployeesPage.tsx`, `features/permissions/RolePermissionsPage.tsx`
- Xodim kartasida “Kirish” tabi: obyekt va omborlar ro‘yxati, qidiruv bilan [G13].
- Matritsada sarlavha qatori va sahifa ustuni yopishqoq (sticky) bo‘ladi. Katakda `Switch` yoki checkbox ishlatiladi. Galereyada aynan rol×sahifa×CRUD misoli topilmadi.

### 6.8. Sozlamalar — `features/settings/SettingsPage.tsx`
- Tor ustun, bo‘lim sarlavhalari, har qatorda nom, tavsif va o‘ngda boshqaruv elementi [G9]. `Field` va `Switch` bilan qilinadi.
- Vaqt mintaqasi (Toshkent), valyuta (UZS) va sana formati Figma’da tanlanadigan maydon [F]. BARPO’da bular qat’iy, shuning uchun faqat o‘qish uchun ko‘rsatiladi.

### 6.9. Obuna — `features/billing/TenantBillingPage.tsx`
- Tablar: umumiy ko‘rinish, invoyslar, to‘lovlar [G10][G11]. Kredit qoldig‘i va keyingi invoys sanasi kartalarda.
- Trial yoki to‘lov muddati yaqinlashganda yuqorida `Alert` banner chiqadi [G11]. Ma’lumot `access_state` va `days_left` dan olinadi, ular API’da allaqachon bor.

### 6.10. Bildirishnomalar — `features/notifications/NotificationsPage.tsx`
- Kun bo‘yicha guruhlash va toifa filtri (vazifa, hisobot, ombor, moliya) `Segmented` bilan. Toifalar `notify.ts` dagilar bilan bir xil.
- Galereyada bildirishnoma sahifasi topilmadi. Eng yaqin ilhom voqealar lentasi [G1][G6].

### 6.11. Kirish — `features/auth/pages.tsx`
- Figma’dagi “Telegram orqali kirish” tugmasi (5-bo‘lim, 8-band) [F]. Uyqur login sahifasida ham shunday tugma bor [U1].

---

## 7. Ochiq savollar

1. **CRM va kvartira sotuvi.** iQUB’ning asosiy farqi shu. BARPO bu segmentga kiradimi yoki UySot integratsiyasi bilan yopiladimi?
2. **UySot kimniki.** Agent App Store’da UySot CRM’ni Softex mahsuloti sifatida ko‘rdi; Softex raqobatchi Uyqur’ni ham ishlab chiqaradi. Integratsiya rejasini qayta ko‘rib chiqish kerakmi?
3. **Mobil ilova.** Uyqur 6 ta ilova bilan dalaga chiqadi. “Mobil ilova scope’da yo‘q” qarori kuchdami? Telegram bot va moslashuvchan veb yetarlimi?
4. **Sotuv modeli.** Ochiq narx, marketing sayt va o‘zi ro‘yxatdan o‘tish kerakmi? Hozir kompaniya faqat platforma egasining taklifi bilan kiradi.
5. **Trial va joriy etish.** 14 kun qoladimi? Build ERP 1 oy beradi. O‘qitish, shaxsiy menejer yoki pilot (1 obyekt, 1 oy) taklif qilinadimi?
6. **Ko‘p valyuta.** “Faqat UZS” qarori qoladimi? Build ERP so‘m va dollar bilan ishlaydi.
7. **Hujjat shakllari.** PDF kerak bo‘lsa, qaysi shakllar: F-3, akt, naryad, obyekt hisoboti?
8. **Rollar.** Ta’minotchi (xarid) roli kerakmi? Bu “10 rol” qaroriga ta’sir qiladi.
9. **Integratsiyalar tartibi.** Didox, bank va UySot’dan qaysi biri birinchi? Kirish ma’lumotlarini kim beradi?
10. **Figma.** Fayl ochiq, lekin faqat 2 ta freymning skrinshoti olindi. Qolgan ekranlar (obyektlar, smeta, vazifalar, xomashyo, hisobotlar, hodimlar) bilan batafsil solishtirish uchun PNG eksportini `docs/research/figma/` ga qo‘yasizmi? Sozlamalar freymidagi “BuildFlow” nomi va Email/SMS tugmalari dizayn qaroriga kiradimi?

---

## 8. Manbalar va cheklovlar

- **iQUB:** sayt bitta sahifadan iborat. Tarif, blog va ilova havolalari yo‘q. Mahsulot rasmlari kichik, shuning uchun UX tavsifi qisman [sources/iqub.md](sources/iqub.md).
- **Build ERP:** eng boy manba taqdimot PDF’i [E2]. Undagi raqamlar namuna. FAQ javoblarining ko‘pi yopiq accordion ichida, faqat bepul sinov javobi o‘qildi. `/ru` va `/uz-cyrl` tahlil qilinmadi [sources/builderp.md](sources/builderp.md).
- **Uyqur:** ochiq marketing sayti yo‘q. Ma’lumot do‘kon sahifalari, foydalanish shartlari va maxfiylik siyosatidan olindi. Ichki ekranlar ko‘rilmadi. Prorab va Ekspeditor ilovalarining App Store sahifalari mintaqa xatosi sababli ochilmadi [sources/uyqur.md](sources/uyqur.md).
- **Galereyalar:** saasinterface.com to‘liq pullik. saasframe.io’da har misolning asosiy skrinshoti ochiq, o‘xshash misollar esa pullik. Bildirishnomalar kategoriyasi 404 berdi. Mercury, Eigenpal va Dust misollarining faqat metama’lumoti ko‘rildi [sources/galleries.md](sources/galleries.md).
- **Figma:** headless brauzer bloklandi, oynali brauzerda ochildi. Hech narsa bosilmadi, shuning uchun sahifalar paneli ko‘rilmadi.
- **Matn va dizayn:** raqobatchilarning matni, logotipi va dizayni ko‘chirilmadi. Iqtiboslar faqat qisqa va manba bilan.
