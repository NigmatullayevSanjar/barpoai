# BARPO.AI — backend mantiqi va ketma-ket to-do reja

Tuzilgan sana: 2026-10-01. Asos: mavjud `backend/src`, migratsiyalar, frontend va backend hujjatlari.

Bu hujjat ish rejasi; undagi ochiq vazifalar ushbu hujjat yozilishi bilan bajarilgan hisoblanmaydi.

- `[x]` — ko‘rsatilgan imkoniyat uchun mavjud kod bor. Bu butun modul production uchun tayyor degani emas.
- `[ ]` — bajarilishi, ulanishi yoki alohida tekshirilishi kerak.
- **Tashqi bog‘liqlik** — provayder hujjati, kirish ma’lumoti yoki biznes qarori talab qilinadi.

Oldingi test natijalari `backend/docs/*verification.json` fayllarida mavjud. Ushbu reja tayyorlash vaqtida ular qayta ishga tushirilmadi.

**1. Backendning hozirgi ishlash mantiqi**

Frontend so‘rov yuboradi → API kiruvchi ma’lumotni tekshiradi → sessiya va ruxsatni tekshiradi → biznes amalini bajaradi → PostgreSQLga saqlaydi → natijani frontendga qaytaradi.

Himoyalangan kompaniya so‘rovida ketma-ketlik quyidagicha:

1. So‘rov uchun bazada tranzaksiya ochiladi. Maydonlar, URL parametrlari va filtrlarning formati tekshiriladi.
2. Bearer token orqali foydalanuvchi aniqlanadi. Bazada tokenning o‘zi emas, hashi saqlanadi; sessiya muddati va foydalanuvchi faolligi tekshiriladi.
3. Boshlang‘ich parolini almashtirmagan xodimga tegishli operatsiyalar cheklanadi.
4. Kompaniya foydalanuvchi sessiyasidan olinadi. Kompaniya holati va trial/pullik foydalanish muddati tekshiriladi.
5. Rolning sahifa bo‘yicha ko‘rish, yaratish, tahrirlash va o‘chirish huquqlari tekshiriladi. Tegishli individual taqiq ham hisobga olinadi.
6. Modul ichida foydalanuvchining obyekt, ombor yoki brigadir hisobiga kirish doirasi tekshiriladi.
7. Takrorlanishdan himoyalangan amallarda `Idempotency-Key` tekshiriladi. Bir xil kalit va bir xil so‘rov avvalgi natijani qaytaradi; o‘sha kalit boshqa ma’lumot bilan ishlatilsa konflikt bo‘ladi.
8. Biznes qoidasi bajariladi: masalan, mavjud material yetarlimi, hujjat holatini o‘zgartirish mumkinmi, to‘lov qarzdan oshmayaptimi.
9. Tegishli yozuvlar, hisob jurnali va mavjud audit chaqiriqlari bir tranzaksiyada saqlanadi. Kerakli joylarda narxlar ruxsatsiz foydalanuvchidan yashiriladi.
10. Hammasi to‘g‘ri bo‘lsa tranzaksiya tasdiqlanadi. Xato bo‘lsa uning o‘zgarishlari bekor qilinib, frontendga xato qaytariladi.

Ochiq login/ro‘yxatdan o‘tish endpointlari va platforma administratorlari uchun tekshiruv yo‘llari farq qiladi. Platforma roli kompaniyaning operatsion ma’lumotlariga avtomatik kirish bermaydi. Barcha endpointlarning audit va javob maydonlari qamrovi yakuniy tekshiruvdan o‘tishi kerak.

**Kompaniya va xodim oqimi**

Platforma egasi kompaniya yaratadi → bir martalik taklif chiqariladi → kompaniya admini taklif orqali ro‘yxatdan o‘tadi → kompaniya faollashadi va 14 kunlik trial boshlanadi → admin xodimlar, rollar va obyekt biriktirishlarini sozlaydi → xodim boshlang‘ich parolini almashtirib ishlaydi.

Koddagi joriy sozlamalar: taklif 72 soat, sessiya 12 soat, reset token 30 minut. Bularni yakuniy tijorat va xavfsizlik siyosati bilan moslashtirish rejaning birinchi bosqichiga kiradi. Trial tugashi va kompaniyani qo‘lda bloklash alohida holatlar; to‘lov qo‘lda qo‘yilgan blokni avtomatik ochmaydi.

**Materialning harakat mantiqi — misol**

Misol uchun omborda 100 dona material bor, bir donasi 10 000 so‘m. Quyidagi raqamlar tushuntirish uchun olingan.

| Amal | Omborda hisobdagi qoldiq | Omborda rezerv | Omborda erkin qoldiq | Brigadir qo‘lida | Tasdiqlangan sarf |
|---|---:|---:|---:|---:|---:|
| Boshlang‘ich qoldiq | 100 | 0 | 100 | 0 | 0 |
| 30 dona jo‘natish yaratildi | 100 | 30 | 70 | 0 | 0 |
| Brigadir 20 donasini qabul qildi | 80 | 10 | 70 | 20 | 0 |
| Brigadir 15 dona sarf taklifini yubordi | 80 | 10 | 70 | 20, shundan 15 rezerv | 0 |
| Prorab sarfni tasdiqladi | 80 | 10 | 70 | 5 | 15 |
| Jo‘natilmagan 10 dona qoldiq bekor qilindi | 80 | 0 | 80 | 5 | 15 |

Sarf tasdiqlanganda misoldagi obyekt xarajati 150 000 so‘mga oshadi. Brigadirdagi qolgan 5 dona hali ishlatilmagan material hisoblanadi. Uni omborga qaytarish ham alohida qabul bilan bajariladi. Hisobotni tasdiqlash o‘sha 15 donani qayta sarflamaydi.

Joriy kod tannarx uchun har hisob/material kesimida harakatlanuvchi o‘rtacha narxdan foydalanadi. Bu usulni yakuniy qabul qilish biznes qarori sifatida ochiq qolgan.

**Moliya mantiqi**

| Voqea | Backendda hisobga ta’siri |
|---|---|
| Mablag‘ ajratish yoki xarid buyurtmasi | Hujjat yaratiladi; o‘zi pul chiqimi yoki haqiqiy xarajat emas |
| Omborga material kirimi | Material miqdori va inventar qiymati oshadi |
| Yetkazib beruvchi invoysi | Tegishli kirim hujjati bilan bog‘lanadi, yetkazib beruvchi qarzi qayd etiladi |
| Material sarfini tasdiqlash | Inventar qiymati kamayadi, obyekt xarajati oshadi |
| Mehnat, texnika yoki xizmat fakti | Xarajat va to‘lanadigan qarz qayd etiladi |
| Yetkazib beruvchiga to‘lov | Pul va qarz kamayadi; avval yozilgan xarajat takror yaratilmaydi |
| Bankdan kassaga o‘tkazish | Bir pul hisobidan boshqasiga o‘tadi; umumiy sof pul oqimi nol |
| Xatoni tuzatish | Tarixni o‘chirib yozish o‘rniga qarama-qarshi tuzatish yozuvi yaratiladi |

Pul qiymatlari APIga satr sifatida uzatiladi va `decimal.js` bilan hisoblanadi. Bu koddagi ichki moliya hisobi; frontendda soliq hisoboti kartasi borligi to‘liq soliq buxgalteriyasi implementatsiya qilinganini anglatmaydi.

**Vazifa va hisobot mantiqi**

Vazifa: `todo → in_progress → submitted → accepted`. Qaytarilsa `returned` bo‘ladi, bajaruvchi tuzatib qayta yuboradi. Bajaruvchi bilan tekshiruvchi bir odam bo‘lishi mumkin emas.

Hisobot: `submitted → accepted / returned`; qaytarilgan hisobot tuzatilib yana yuboriladi. Qabul qilish tegishli bajarilgan ish progressini qayd etadi. Dastlabki reja tugash sanasi saqlanadi; yangi taxminiy sana alohida yoziladi. Tasdiqlangan progressni keyin tuzatish oqimi hali yakunlanmagan.

**2. Ishlarni bajarish ketma-ketligi**

Asosiy tartib: biznes qarorlari → API shartnomasi va baza → kirish/ruxsat → kompaniya/xodim/obyekt → smeta → ombor → moliya → vazifa/hisobot → ekranlar uchun hisob-kitoblar → tashqi integratsiyalar → to‘liq sinov → production.

Har bir modulda takrorlanadigan ish tartibi: ma’lumot modeli → ruxsatlar → biznes qoidasi → API → test → frontendga ulash → foydalanuvchi oqimini tekshirish. Frontendni ulashni barcha backend ishlari tugaguncha kechiktirish shart emas; barqaror modul tayyor bo‘lishi bilan uning sahifalari ulanadi.

**01 — Talablar va hisob qoidalarini yakunlash**

- [ ] Har bir frontend sahifasidagi jadval, hisob ko‘rsatkichi, filtr va tugmani tegishli backend amaliga moslash jadvalini tuzish.
- [ ] Tarif narxlari/limitlari, trial tugagandagi tartib, tannarx usuli, ortiqcha to‘lov va saqlash muddatlari bo‘yicha ochiq qarorlarni qayd etish.
- [ ] Ish haqi, to‘lov so‘rovi, prognoz va moliyaviy hisobotlar uchun kerakli ma’lumotlar hamda hisoblash qoidalarini aniqlashtirish.
- [ ] Bank, Didox, iHamkor, UySot, kamera va payment provayderlari bo‘yicha alohida bog‘liqliklar ro‘yxatini yuritish.

Natija: har bir ekran va amalning aniq kiruvchi ma’lumoti, natijasi, vakolati va qabul mezoni bor. Aniqlanmagan qiymatlar taxminiy real ma’lumot bilan to‘ldirilmaydi.

**02 — Baza va API asosini mustahkamlash**

- [x] Fastify/TypeScript API, PostgreSQL, Docker, migratsiyalar, bootstrap va alohida worker kodi mavjud.
- [x] Kompaniyalar ma’lumotini bazada ajratish, bog‘lanishlar va hisob invariantlari mavjud.
- [ ] Har endpoint javobidagi maydonlarni qat’iy shartnoma bilan belgilash; maxfiy maydonlar chiqmasligini tekshirish.
- [ ] Yangi talablar uchun keyingi raqamli migratsiyalarni yozish; ishlatilgan migratsiyalarni o‘zgartirmaslik.
- [ ] Frontenddagi qidiruv/filtr/sahifalash ehtiyojlarini mavjud API bilan solishtirib, yetishmaydiganlarini qo‘shish.

Bog‘liqlik: 01. Qabul mezoni: toza va avvalgi sxemali test bazasida migratsiya o‘tadi, ikki kompaniya ma’lumoti aralashmaydi.

**03 — Login, taklif va ruxsatlar**

- [x] Login/logout, parol almashtirish, taklif orqali signup va reset token endpointlari mavjud.
- [x] 10 rol, kompaniya roli uchun sahifa–CRUD matritsasi va obyekt/ombor doirasi mavjud.
- [x] Frontend login va ruxsatlar sahifasi serverga ulangan.
- [x] 2026-10-04: login foydalanuvchi nomi yoki telefon bilan; httpOnly cookie sessiya (Origin tekshiruvi) va Bearer parallel; profil tahriri (`PATCH /v1/auth/profile`); trial tugashi avtomatik bloklamaydi — `access_state`/`days_overdue` platforma ro‘yxatida ko‘rinadi, bloklash qo‘lda.
- [x] 2026-10-04: yangi frontend poydevori (Vite + React, feature-based, TanStack Query, RHF+Zod, UZ/RU i18n, cookie sessiya, DataTable/Modal/Form komponentlari). Login, taklif orqali signup, parol almashtirish/tiklash, profil, Telegram ulash, bildirishnomalar, ruxsatlar matritsasi va platforma egasi sahifalari (kompaniyalar, taklif, tarif, invoys, to‘lov, qarzdorlar, murojaatlar, texnik xodimlar) real APIga ulangan. Brauzer e2e: `npm run test:ui`.
- [ ] Kompaniya adminini tiklash uchun shaxsni tekshirish jarayonini yakunlash.
- [ ] Sessiya tugashi, bloklanish va har rolning to‘g‘ri bosh sahifaga qaytishini tekshirish.

Bog‘liqlik: 02. Qabul mezoni: ruxsatsiz amal UI, bevosita URL va API orqali ham bajarilmaydi.

**04 — Kompaniya, xodim va obyektlar**

- [x] Kompaniya yaratish/bloklash, xodim yaratish/yangilash, obyekt/zona va biriktirish endpointlari mavjud.
- [x] Xodimni deaktivatsiya qilishda ochiq vazifa va materialni topshirish tekshiruvlari mavjud.
- [x] 2026-10-04: platforma kompaniyalari (ro‘yxat, karta, taklif, tarif, invoys, to‘lov, bloklash), xodimlar (ro‘yxat, yaratish, karta, biriktirish, parol tiklash havolasi, individual ruxsatlar, adminlikni topshirish) va obyektlar (ro‘yxat, karta, zonalar, xodimlar, omborlar, tahrir, arxiv) real API bilan ulangan; migratsiya 007 (obyekt kodi/manzil/buyurtmachi/holat, xodim lavozimi). Brauzer e2e 14/14.
- [ ] Frontend talab qiladigan, API katalogida yo‘q amallarni aniqlab qo‘shish; masalan, kerak bo‘lsa zona tahriri va ro‘yxat tafsilotlari.
- [ ] Demo formalaridagi eski tanlangan yozuv holatini tozalash, noto‘g‘ri faol-xodim filtrini tuzatish.

Bog‘liqlik: 03. Qabul mezoni: yaratilgan xodim/obyekt sahifa yangilanganda saqlanadi; foydalanuvchi faqat biriktirilgan doirada ishlaydi.

**05 — Material katalogi va smeta**

- [x] Material yaratish, qo‘lda/norma bilan smeta, oylik taqsimot, reviziya va Excel preview/commit mavjud.
- [ ] Reviziyalar orasida bir xil ish qatorini barqaror bog‘lash modelini yakunlash.
- [ ] Dastlabki reja, joriy reja va haqiqiy natijani obyekt/zona kesimida yig‘ish hisoblarini yakunlash.
- [x] 2026-10-04: smeta ro‘yxati (jami, material/ish summalari), Excel-ko‘rinishidagi tahrir jadvali (tur, kategoriya, material, zona, birlik, qo‘lda/norma miqdor, yo‘qotish %, narx, izoh, oylik taqsimot, qator nusxalash/o‘chirish, jonli validatsiya), yangi reviziya bilan saqlash, smeta kartasi (qatorlar, kategoriya guruhlari, reja/fakt, turlar/kategoriya/zona bo‘yicha yig‘indi, reviziyalar tarixi va snapshot ko‘rish), Excel eksport, Excel import ustasi (inspeksiya, avto moslash, material/zona nomini aniqlash, preview, commit), inline material yaratish. Migratsiya 008 (kategoriya, izoh, tartib). E2e 17/17.
- [x] Importdagi topilmagan nomlar qator raqami bilan ko‘rsatiladi; birlik material birligi bilan solishtiriladi (jonli xato).

Bog‘liqlik: 04. Qabul mezoni: smeta o‘zgarsa, oldingi sarf va progress bog‘lanishlari saqlanadi; Excel previewning o‘zi smeta yaratmaydi.

**06 — Ombor va brigadir materiallari**

- [x] Kirim, rezerv, jo‘natish, qisman qabul, sarfni tekshirish, qaytarish, inventarizatsiya va tuzatish yozuvlari mavjud.
- [x] 2026-10-04: Ombor sahifasi (qoldiqlar: hisobdagi/rezerv/mavjud/qiymat/minimal, kam qolgan belgisi, ledger tarixi; harakatlar ro‘yxati filtr bilan; material so‘rovlari; materiallar katalogi). Kirim, boshlang‘ich qoldiq, jo‘natish, sarf, qaytarish, inventarizatsiya, minimal qoldiq modal oynalari; qisman qabul, tasdiqlash, qoldiqni bekor qilish, kelishmovchilik, reversal amallari rolga qarab. Migratsiya 009: material so‘rovlari (so‘rov → bajarish jo‘natish yaratadi → bildirishnoma). Brigadir biriktirilganda custody hisobi avtomatik. E2e 21/21 (kirim → jo‘natish → qisman qabul → sarf → tasdiq → so‘rov → bajarish, jurnal summalari tekshirilgan).
- [x] Ombor mudiri → brigadir → prorab oqimi real API bilan ishlaydi.
- [x] Qisman qabul, kelishmovchilik, qoldiqni bekor qilish va sabab yozish boshqaruvlari ulangan.
- [ ] Takror bosish/qayta urinishda bitta biznes amal uchun bir xil idempotency kalitini saqlash.

Bog‘liqlik: 04–05. Qabul mezoni: parallel jo‘natish mavjud qoldiqdan oshmaydi; sarf tasdiqlanmaguncha xarajat yozilmaydi.

**07 — Moliya va buxgalteriya hisoblarini yakunlash**

- [x] Kontragentlar, bank/kassa hisoblari, moliyaviy hujjatlar, ajratma, invoys, haqiqiy xarajat, to‘lov va budjet endpointlari mavjud.
- [ ] Invoys narxi kirimdagi narxdan farqlanganda tuzatishni ombordagi va sarflangan qiymatga taqsimlashni yozish.
- [ ] Bitta invoysni bir nechta kirim bilan bog‘lash va avansni invoys qarziga hisoblashni yozish.
- [x] 2026-10-04: to‘lov so‘rovlari (migratsiya 010): so‘rov → tasdiqlash/rad etish → to‘lash (payment hujjati, bank/kassa hisobidan, bog‘langan hujjatga allokatsiya), bildirishnomalar, to‘lov kalendari (muddat bo‘yicha hujjatlar va so‘rovlar, muddati o‘tganlar).
- [x] 2026-10-04: ish haqi: oylik davr, xodim bo‘yicha oklad/bonus/ushlanma/qo‘lga, davrni yopish har xodim uchun `labor` xarajati va qarz (counterparty kind=employee avtomatik), to‘lash payment hujjati bilan qarzni yopadi.
- [x] 2026-10-04: moliya sahifalari real APIda: Moliya hub (yig‘ma, oylik, obyektlar, qarzdorlik), birlamchi hujjatlar, hisoblar/dalolatnomalar (qoldiq, to‘lash), bank va kassa (hisoblar, qoldiqlar, pul harakatlari), kontragentlar (rekvizitlar, qarz/avans, solishtirish), mablag‘ ajratish, budjetlar (oylik, fakt bilan), to‘lov so‘rovlari, kalendar, ish haqi, reja–fakt (tur/qator/oy), prognoz (3 oylik o‘rtacha), moliyaviy hisobotlar (pul oqimi, obyekt xarajatlari, qarz yoshi), solishtirish. Hujjat ro‘yxati sahifa ruxsatlariga qarab filtrlanadi; narx huquqi bo‘lmasa summalar yashirin. E2e 25/25 (invoys↔kirim GR/IR, to‘lov, so‘rov, ish haqi jurnal summalari tekshirilgan).

Bog‘liqlik: 05–06. Qabul mezoni: kirim, haqiqiy xarajat, qarz va pul to‘lovi alohida hisoblanadi; bir xarid ikki marta xarajatga yozilmaydi.

**08 — Vazifalar, hisobotlar va fotosuratlar**

- [x] Vazifa holatlari, kunlik/haftalik hisobotlar, tekshirish/qayta yuborish va private foto endpointlari mavjud.
- [x] 2026-10-04: qabul qilingan progressni tuzatish — `progress_corrections` o‘zgarmas yozuvi (ishorali farq + sabab), fakt hisoblarida (smeta kartasi, reja–fakt, ish qatorlari) tuzatishlar qo‘shiladi; migratsiya 011 (vazifa tavsifi, vazifaga fayl, tuzatishlar).
- [x] 2026-10-04: Vazifalar sahifasi (kanban/jadval, yaratish/tahrirlash, bajaruvchi boshlash→yuborish, tekshiruvchi qabul/qaytarish izoh bilan, fayllar, tarix, arxiv) va Hisobotlar sahifasi (kunlik/haftalik, ish qatori va miqdor, prognoz sanasi, foto yuklash JPEG/PNG ≤5 MB, tekshirish/qaytarish/qayta yuborish, progress tuzatish, tarix). Telegram «📊 Progress yuborish» oqimi (obyekt → ish qatori → miqdor → matn → rasm) kunlik hisobot yaratadi. E2e 29/29, integration 24/24.
- [x] Hisobotdagi smeta qatori va zona real ma’lumotdan (`GET /v1/projects/:id/work-lines`, narxsiz), reja va hozirgi fakt ko‘rsatiladi.
- [ ] Faylni tekshirish, rasmni qayta kodlash va ishlatilmay qolgan fayllarni tozalashni yakunlash.

Bog‘liqlik: 04–06; miqdorlar va tannarx mosligi uchun 07 bilan birga tekshiriladi. Qabul mezoni: hisobotni qayta tasdiqlash progressni takror yozmaydi, ruxsatsiz odam fotosuratni yuklab ololmaydi.

**09 — Dashboard, prognoz va qolgan sahifa imkoniyatlari**

- [x] Obyekt tannarxi, sof pul oqimi, yetkazib beruvchi qarzi va avans yig‘indisi endpointi mavjud.
- [x] 2026-10-04: `GET /v1/dashboard` — obyektlar (progress, jadvaldan orqada), vazifalar, hisobotlar, ombor (kam qoldiq, so‘rovlar, bugungi kirim/sarf), moliya (budjet, xarajat, qarz, muddati o‘tgan qarz, to‘lov so‘rovlari), xodimlar bloklari; har blok faqat haqiqiy ruxsat bilan, aks holda `null`. Manba va qoidalar `backend/docs/BARPO_DASHBOARD_METRICS.md`. Rolga mos bosh sahifa UI (admin/prorab/brigadir/ombor/finansist bir sahifa, bloklar ruxsatga qarab).
- [x] 2026-10-04: reja–faktga zona kesimi (`by_zone`) qo‘shildi; moliya yig‘masi, reja–fakt, prognoz va moliyaviy hisobotlardagi oylik so‘rovlar (`month` yalang‘och alias) va qarz yoshi parametri xatosi tuzatildi (ilgari 500 qaytarar edi), integration testda regressiya tekshiruvi bor.
- [x] 2026-10-04: Excel eksportlar — reja–fakt (qatorlar/zonalar/oylar), vazifalar, ombor qoldiqlari, audit; narx huquqisiz summa ustunlari yo‘q, har eksport auditga yoziladi. PDF spec bo‘yicha keyingi bosqich. Kontragent solishtiruvi 07-bosqichdagi `statement` bilan qoladi.
- [x] 2026-10-04: texnik panel — baza (latency, oxirgi migratsiya), worker navbati (pending/dead/24 soat, muvaffaqiyatsiz vazifalar), 5xx xatolar jurnali (`error_events`, migratsiya 012), sessiyalar, Telegram, kompaniyalar; super admin va support ko‘radi. Support murojaatiga javob (`response`) — egasiga bildirishnoma. CPU/RAM/backup hosting bilan (12-bosqich).
- [x] 2026-10-04: Sozlamalar sahifasi (`GET/PATCH /v1/company`: nom, manzil, telefon, Telegram bildirishnoma toifalari; logotip yo‘q), Bildirishnomalar sahifasi (`/notifications`, sahifalash, o‘qildi), Fayllar (obyekt bo‘yicha), Integratsiyalar va Kamera (halol `not_configured`), Audit (filtr, ijrochi, eksport). «Tez kunda» sahifalar qolmadi. **AI yordamchi egasi qarori bilan rejadan chiqarildi (2026-10-04).**
- [x] 2026-10-04: tekshirildi — kompaniya UI da statik raqam yoki faqat toast chiqaradigan tugma qolmadi (barcha tugmalar API natijasiga bog‘langan; e2e 35/35, integration 30/30).

Bog‘liqlik: 05–08. Qabul mezoni: har bir ko‘rsatkichni bazadagi manba yozuvlari bilan tekshirish mumkin; mavjud bo‘lmagan ma’lumot yolg‘on nol yoki foyda sifatida chiqmaydi.

**10 — Obuna va tashqi integratsiyalar**

- [x] Tarif versiyalari, SaaS invoyslari, qo‘lda to‘lov/kredit/refund yozuvlari va integratsiya holati kodi mavjud.
- [x] Telegram identity tekshiruvi va kam qolgan material haqida xabar yuboruvchi worker kodi mavjud; real ulanish tasdiqlanmagan.
- [x] 2026-10-04: Telegram deep-link ulash (`/v1/integrations/telegram/link`, bir martalik hash token, 5 daqiqa, race-safe), `telegram_accounts`, bot long polling (`/start`, rolga mos menyu, /tasks, /notifications, /profile, obyektlar, kam qolgan material, qarzdorlar), ilova ichidagi `notifications` jadvali va outbox orqali yetkazish. Integration testlar: 22/22. Material so‘rovi bot oqimi 06-bosqichda ulandi (chat_state bilan ko‘p qadamli: obyekt → material → miqdor → izoh); progress yuborish 08-bosqichda.
- [x] 2026-10-04: avtomatik 30 kunlik invoys (egasi qarori: zanjir trial tugagan kundan; worker davr boshidan 3 kun oldin chiqaradi, admin bildirishnoma oladi, muddati o‘tganda bir martalik ogohlantirish, blok yo‘q). Ortiqcha to‘lov `billing_credits` kreditiga o‘tadi va to‘lanmagan/keyingi invoysga avtomatik qo‘llanadi; qarz invoys kesimida, kredit qoldig‘i alohida (migratsiya 013, `src/billing.ts`). UI: kompaniya billing (kredit, keyingi invoys, manba), kompaniya kartasi (kredit, manba), platforma yig‘masi. Integration 34/34, e2e 36/36.
- [ ] Kamera hodisalarini saqlash/bog‘lash, UySot reja/fakt ma’lumotlari va reconciliation — tashqi/ichki yozuvlarni solishtirish — oqimini yozish. *(2026-10-04: provayder kirishi yo‘q; UI va API halol `not_configured`, 12-bosqichdan keyin provayder bilan.)*
- [ ] **Tashqi bog‘liqlik:** tanlangan provayder hujjati, sandbox va ruxsat etilgan kirish ma’lumotlari bilan har adapterni ulash.
- [ ] Adapter tartibi: haqiqiylik tekshiruvi → kelgan hodisani saqlash → kompaniya/obyektga moslash → takrorlanmaydigan biznes amal → solishtirish → xatoni qayta ishlash.
- [ ] Telegram real yetkazilishi, payment settlement/refund, bank tranzaksiyasi va provayderlararo takror yozuvlarni sinash.

Bog‘liqlik: tegishli 06–09 modullari. Kontraktlarni tayyorlash 01 bosqichdan boshlanishi mumkin. Mavjud R1 rejasida bu integratsiyalar chiqarilish sharti sifatida belgilangan; provayderga kirish yo‘qligi ularni bajarilgan deb belgilashga asos emas.

**11 — Har bir rol bilan to‘liq sinov**

- [x] Unit, PostgreSQL integration, Docker va login/ruxsat UI test skriptlari mavjud.
- [ ] Har qo‘shilgan biznes qoidasi bilan uning oddiy, xato, takroriy va parallel so‘rov testlarini yozib borish.
- [ ] 10 rol uchun haqiqiy ma’lumot bilan UI → API → DB oqimlarini sinash.
- [ ] Kompaniyalararo kirish, individual taqiq, sahifa CRUD, obyekt/ombor chegaralari va narxlarni yashirishni tekshirish.
- [ ] To‘liq ssenariy: kompaniya → xodim → obyekt → smeta → kirim → jo‘natish → qabul → sarf → invoys → to‘lov → hisobot → dashboard.
- [ ] Xatolikdan keyingi qayta urinish, bekor qilish, tuzatish va qayta kirish holatlarida pul/material/progress ikki marta yozilmasligini tekshirish.

Bog‘liqlik: sinovlar har bosqichda yuradi; umumiy qabul 03–10 yakunida. Qabul mezoni: ochiq xatolar va provayderga bog‘liq bajarilmagan testlar alohida ko‘rsatilgan hisobot mavjud.

**12 — Productionga chiqarish**

- [ ] Hosting, HTTPS, secretlar va saqlanadigan fayllar konfiguratsiyasini tayyorlash.
- [ ] Bazadan va private fayllardan backup olish hamda alohida muhitga amalda tiklashni tekshirish.
- [ ] Yuklama sinovi, monitoring, xatolik ogohlantirishlari va worker navbati nazoratini sozlash.
- [ ] Audit qamrovi, javob maydonlari va ko‘p API nusxasi ishlasa umumiy so‘rov cheklovini tekshirish.
- [ ] Stagingda barcha chiqarilish shartlari bajarilgach, deploy va nosozlikdan tiklash tartibini bajarish.

Bog‘liqlik: 11 va ochiq chiqarilish shartlari yopilgan bo‘lishi kerak. Qabul mezoni: real foydalanuvchi oqimlari, backupdan tiklanish va monitoring amalda tasdiqlangan.

**3. Ish davomida to-do holatini chiqarish shakli**

Har bosqich bo‘yicha yangilanish quyidagi shaklda yoziladi. Bu hozir bajarilayotgan ish haqidagi hisobot emas, keyingi implementatsiya uchun shablon.

```text
Bosqich: 06 — Ombor
Holat: Boshlanmagan / Bajarilmoqda / Tekshiruvda / Yakunlangan / Tashqi ma’lumot kutilmoqda
Tugagan: [aniq vazifa va uning natijasi]
Hozirgi ish: [bitta aniq vazifa]
Qolgan: [ochiq to-do bandlari]
Tekshiruv: [bajarilgan test va natija; bajarilmagan bo‘lsa shunday yoziladi]
Bogliqlik: [kerakli oldingi bosqich yoki tashqi ma’lumot]
Keyingi qadam: [navbatdagi amal]
```

Band faqat kodi, kerakli UI ulanishi va belgilangan qabul tekshiruvi tugagach yakunlangan deb belgilanadi. Kod yozilgan, lekin tekshirilmagan ish `Tekshiruvda` bo‘ladi. Hozirgi checklistdagi `[x]` esa faqat bandda aniq aytilgan mavjud kod holatini bildiradi.

**4. Kod bo‘yicha yo‘l ko‘rsatkich**

| Mantiq | Asosiy fayllar |
|---|---|
| So‘rov va tranzaksiya | `backend/src/http.ts`, `backend/src/db.ts` |
| Sessiya va kompaniya holati | `backend/src/auth.ts`, `backend/src/routes-auth.ts` |
| Rol, CRUD va obyekt doirasi | `backend/src/permissions.ts`, `backend/src/routes-permissions.ts` |
| Platforma va kompaniya | `backend/src/routes-platform.ts`, `backend/src/routes-company.ts` |
| Smeta va aniq hisoblash | `backend/src/estimates.ts`, `backend/src/money.ts` |
| Ombor | `backend/src/inventory.ts`, `backend/src/routes-operations.ts` |
| Moliya | `backend/src/finance.ts`, `backend/src/routes-operations.ts` |
| Vazifa, hisobot, fayl va arxiv | `backend/src/routes-work.ts`, `backend/src/routes-lifecycle.ts` |
| Navbatdagi bildirishnomalar | `backend/src/worker.ts` |
| Baza sxemasi | `backend/migrations/001_core.sql` dan `005_budget_version.sql` gacha |

Qo‘shimcha: [mavjud implementatsiya holati](backend/docs/BARPO_IMPLEMENTATION_PLAN.md), [biznes qoidalari](backend/docs/BARPO_BUSINESS_RULES.md), [integratsiya chegaralari](backend/docs/BARPO_INTEGRATIONS.md), [API qo‘llanmasi](backend/docs/BARPO_API_GUIDE.md).
