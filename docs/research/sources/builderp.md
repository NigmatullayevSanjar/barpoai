# Build ERP (builderp.uz) — raqobatchi eslatmasi

Sana: 2026-10-07. Manbalar: [S] https://builderp.uz/uz (bosh sahifa), [P] https://builderp.uz/files/builderp-presentation.pdf (saytdagi 14 betlik taqdimot, bosh sahifadan havola), [B1] https://builderp.uz/uz/blog/erp-nima-qaysi-kompaniyalarga-kerak, [B2] https://builderp.uz/uz/blog/qurilishda-raqamlashtirishni-qayerdan-boshlash-kerak, [EN] https://builderp.uz/en.
Eslatma: taqdimotdagi raqamlar "namuna ma'lumot" deb belgilangan, haqiqiy mijoz ma'lumoti emas.

## 1. Kimlar uchun
- Turar-joy quruvchilari, tijorat pudratchilar, loyiha jamoalari (proraб, brigadir, ishchi); "kichik jamoadan yirik qurilish kompaniyasigacha" [S].
- Bloglarda: bir nechta obyekt, 10+ xodim, o'sish bosqichi (30-50 kishi) — ERP kerak bo'ladigan belgilar sifatida [B1]. O'zbekiston va Markaziy Osiyo qurilish kompaniyalari [B1].

## 2. Modullar (asosan [P], bosh sahifa [S])
- Obyekt boshqaruvi: BOR. Obyekt kartochkasi (shartnoma raqami, byudjet, sanalar, holat), bo'limlar (dom/blok), obyekt ichida 8 bo'lim (Hisobot, Bo'limlar, Smeta, Ishlar doskasi, Ta'minot, Ombor, Hujjatlar, Pudratchilar), byudjet/ishlatilgan/kutilmoqda/qolgan/bajarilgan % [P].
- Smeta: BOR. Excel'dan import, reja/fakt/farq, ishga resurs biriktirish, Excel'ga eksport [P].
- Ombor/material: BOR. Materiallar, instrument, texnika katalogi; material harakati tarixi; instrument kimda; Excel import/eksport; material zayavkasi (omborchi -> ta'minotchi -> qabul, naryad rasmi bilan) [P].
- Moliya: BOR. Kassa kirim-chiqim, ko'p valyuta (so'm/dollar, konvertatsiya), pul so'rovlari doskasi (kutilmoqda/tasdiqlandi/arxiv), qism-qism to'lov, kelgusi kirim-chiqim, kontragentlar bilan qarz/balans, subpudratchilar [P].
- Vazifa va hisobotlar: BOR. "Ishlar doskasi" (naryad: yaratildi/jarayonda/yakunlandi, brigadirga biriktirish, qavat bo'yicha hajm), chop etiladigan naryad hisoboti, obyekt moliyaviy hisoboti PDF, F-3 hujjatlar [P].
- Xodimlar/rollar: BOR. 7 ta rol (Admin, PTO, Prorab, Brigadir, Ta'minotchi, Omborchi, Buxgalter), "sozlanadigan huquq", kim kimdan so'rashi/tasdiqlashi sozlamadan; brigadir kartochkasi, avans, oylik jadvali (yillik, 12 oy) [P].
- CRM/sotuv (kvartira, shartnoma, bo'lib to'lash mijozga): NOMA'LUM / saytda ko'rinmadi (faqat pudratchi/kontragent to'lovlari bor).
- Hujjatlar: QISMAN/BOR — shartnoma, F-3, rasm va fayllar obyektga biriktiriladi [P]; bosh sahifada "hujjat aylanishi" [B2].
- Dashboard/analitika: BOR. Obyekt paneli, diagrammalar (xarajat/qarz taqsimoti, PTO dinamikasi) [S][P]. Bosh sahifadagi panel — marketing maketi (12 faol obyekt, $2.4M va h.k.).
- Korxona mulki (texnika, QR yorliq, telefon kamerasi bilan inventarizatsiya, ta'mir jurnali, spisaniye DOCX akt): BOR [P] — bu BARPO'da bo'lmasligi mumkin bo'lgan farq.
- Telegram: bot/bildirishnoma — NOMA'LUM (saytda funksiya sifatida yo'q). Telegram faqat aloqa kanali (@builderpuz) va "Telegram'dan voz kechish" marketingida [S].
- Mobil ilova: NOMA'LUM (saytda App Store/Google Play havolasi yo'q; "istalgan joydan" iborasi bor, [S] footer). Taqdimotda telefon kamerasi inventarizatsiyada ishlatiladi [P].
- Integratsiyalar (bank, Didox, 1C, soliq, Click/Payme): NOMA'LUM. Footerdagi "Integratsiyalar" havolasi hech qayerga olib bormaydi (#) [S]. Blog 1C ni almashtiriladigan vosita deb ataydi [B1].
- Boshqa: audit izi ("kim, qachon, qancha — har amal yozib boriladi") [P]; 3 til [P]; PDF/DOCX/Excel eksport.

## 3. Narx va onboarding
- Narx saytda ochiq EMAS. Narx obyektga borib baholangandan keyin taklif qilinadi: bog'lanish -> obyektga tashrif -> individual narx va onboarding rejasi [S].
- 1 oy bepul sinov, karta kerak emas, istalgan vaqt bekor qilish; keyin bank o'tkazmasi orqali to'lov [S, FAQ].
- "5 daqiqada sozlanadi"; "ko'pchilik kompaniyalar 1 haftada ishga tushadi"; bepul baholash; shaxsiy menejer; 24/7 texnik yordam [S].
- Demo: "Demo so'rash" formasi (to'ldirilmadi) [S]. Pilot (bitta obyektda 1 oy) tavsiya etiladi [B2].
- Tarif jadvali, valyuta, narx: NOMA'LUM. Alohida narx sahifasi yo'q ("Narx so'rash" = bosh sahifadagi forma).

## 4. Marketing va ishonch
- Va'da: "Excel, Telegram, qog'oz hisobotlar — endi kerak emas. Hammasi bitta ekranda"; "O'zbekistondagi N1 qurilish ERP platformasi" (o'zi aytgan, isbotsiz) [S].
- Pozitsiya: smeta faylini yuklang -> bitta panel; "an'anaviy ERP uzoq o'rnatiladi" ga qarshi oddiy tizim [S].
- Hamkorlar logotip/nomlari: International Invest, Deling, Nestro MCHJ, Aziz Buildings, YTS Group Buildings [S]. Mijozlar soni: NOMA'LUM.
- 3 ta iqtibos (The Minora hammuassisi, omborchi, Nestro bosh moliyachisi) [S]. (Dastlabki WebFetch "33% yo'qotish kamaydi" degan edi, lekin to'liq sahifada bu raqam topilmadi — ishonmang.)
- Raqamlar: 40+ modul, 7 rol, 3 til, 24/7 yordam [S][P].
- Blog: 2 maqola (2026-09-08, 2026-09-11) — SEO/kontent boshlangan [S].

## 5. Ko'rinadigan UX
- Haqiqiy mahsulot skrinshoti ochiq saytda yo'q; faqat marketing maketi (obyekt paneli: 3 KPI karta, 6 haftalik ustunli diagramma, byudjet progress-bar, voqealar lenta) [S].
- Taqdimotda tasvirlangan UI (matndan): obyekt sarlavhasida jonli KPI, obyekt ichida 8 ta tab, kanban doskalar (naryad, pul so'rovlari), menyuda kutilayotgan so'rovlar soni, har rol "o'z ekrani bilan" [P]. Sidebar/top navigatsiya turi aniq emas.
- Sayt dizayni: och fon, binafsha (violet) aksent, katta qora sarlavha; yuqori menyu (Imkoniyatlar, Yechimlar, Narx so'rash, Aloqa, Blog); suzuvchi Telegram tugmasi (skrinshotda ko'rinadi).
- Solishtirish vidjeti "Excel va qog'ozlar" vs Build ERP paneli (sudrab solishtirish).

## 6. Boshqa
- Tillar: UZ (lotin), ЎЗ (kirill), RU, EN [S]; taqdimotda UZ/kirill/RU [P].
- Aloqa: +998 90 544 48 28, builderpuz@gmail.com, Telegram t.me/builderpuz, Instagram @builderpuz; "2 soat ichida javob" [S]. Footerdagi "savol bormi" havolasi boshqa Telegram akkauntga (t.me/odi1ov) olib boradi.
- Maxfiylik/Shartlar — Google Docs havolasi (bitta hujjat) [S]. Kompaniya yuridik nomi/manzili: NOMA'LUM.

## Ko'rilgan sahifalar
builderp.uz/uz, /uz/blog, 2 ta blog maqola, /en (qisman matn), taqdimot PDF (14 bet, matn orqali), WebFetch orqali bosh sahifa.
## Ochilmagan / sabab
- /ru, /uz-cyrl: skript yozildi, lekin mazmuni tahlil qilinmadi (bosh sahifa bilan bir xil deb taxmin; tekshirilmadi).
- App Store/Google Play, YouTube: saytda havola yo'q. Telegram kanal, Instagram: ochilmadi (kirish talab qilishi mumkin; tashqi tarmoq, vazifa uchun muhim emas).
- Alohida narx/imkoniyat/FAQ sahifasi: mavjud emas (hammasi bosh sahifada, FAQ javoblarining ko'pi yopiq accordion — faqat "bepul sinov" javobi o'qildi).
## Skrinshotlar
docs/research/screenshots/: builderp-home.png (to'liq), builderp-home-hero.png, builderp-blog.png, builderp-en.png
