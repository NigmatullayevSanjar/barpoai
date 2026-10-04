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
- [ ] Taklifni ochish, signup, reset va profil oqimlarining qolgan frontend qismlarini real APIga ulash.
- [ ] Kompaniya adminini tiklash uchun shaxsni tekshirish jarayonini yakunlash.
- [ ] Sessiya tugashi, bloklanish va har rolning to‘g‘ri bosh sahifaga qaytishini tekshirish.

Bog‘liqlik: 02. Qabul mezoni: ruxsatsiz amal UI, bevosita URL va API orqali ham bajarilmaydi.

**04 — Kompaniya, xodim va obyektlar**

- [x] Kompaniya yaratish/bloklash, xodim yaratish/yangilash, obyekt/zona va biriktirish endpointlari mavjud.
- [x] Xodimni deaktivatsiya qilishda ochiq vazifa va materialni topshirish tekshiruvlari mavjud.
- [ ] Platforma kompaniyalari, xodimlar, obyektlar va bloklar ekranlarini real ro‘yxatlar bilan ulash.
- [ ] Frontend talab qiladigan, API katalogida yo‘q amallarni aniqlab qo‘shish; masalan, kerak bo‘lsa zona tahriri va ro‘yxat tafsilotlari.
- [ ] Demo formalaridagi eski tanlangan yozuv holatini tozalash, noto‘g‘ri faol-xodim filtrini tuzatish.

Bog‘liqlik: 03. Qabul mezoni: yaratilgan xodim/obyekt sahifa yangilanganda saqlanadi; foydalanuvchi faqat biriktirilgan doirada ishlaydi.

**05 — Material katalogi va smeta**

- [x] Material yaratish, qo‘lda/norma bilan smeta, oylik taqsimot, reviziya va Excel preview/commit mavjud.
- [ ] Reviziyalar orasida bir xil ish qatorini barqaror bog‘lash modelini yakunlash.
- [ ] Dastlabki reja, joriy reja va haqiqiy natijani obyekt/zona kesimida yig‘ish hisoblarini yakunlash.
- [ ] Smeta yaratish/tahrirlash, material tanlash va Excel import ekranlarini real APIga ulash.
- [ ] Importdagi xatoli qatorlar va o‘lchov birliklarini foydalanuvchiga tushunarli ko‘rsatish.

Bog‘liqlik: 04. Qabul mezoni: smeta o‘zgarsa, oldingi sarf va progress bog‘lanishlari saqlanadi; Excel previewning o‘zi smeta yaratmaydi.

**06 — Ombor va brigadir materiallari**

- [x] Kirim, rezerv, jo‘natish, qisman qabul, sarfni tekshirish, qaytarish, inventarizatsiya va tuzatish yozuvlari mavjud.
- [ ] Frontendda jo‘natilgan, qabul qilingan, sarflangan va qaytarilgan miqdorlarni alohida ko‘rsatish.
- [ ] Ombor mudiri → brigadir → prorab oqimini haqiqiy APIga ulash.
- [ ] Qisman qabul, kelishmovchilik, qoldiqni bekor qilish va sabab yozish boshqaruvlarini ulash.
- [ ] Takror bosish/qayta urinishda bitta biznes amal uchun bir xil idempotency kalitini saqlash.

Bog‘liqlik: 04–05. Qabul mezoni: parallel jo‘natish mavjud qoldiqdan oshmaydi; sarf tasdiqlanmaguncha xarajat yozilmaydi.

**07 — Moliya va buxgalteriya hisoblarini yakunlash**

- [x] Kontragentlar, bank/kassa hisoblari, moliyaviy hujjatlar, ajratma, invoys, haqiqiy xarajat, to‘lov va budjet endpointlari mavjud.
- [ ] Invoys narxi kirimdagi narxdan farqlanganda tuzatishni ombordagi va sarflangan qiymatga taqsimlashni yozish.
- [ ] Bitta invoysni bir nechta kirim bilan bog‘lash va avansni invoys qarziga hisoblashni yozish.
- [ ] To‘lov so‘rovining yuborish/tasdiqlash/rad etish holatlarini belgilab, kerakli API va ma’lumot modelini qo‘shish.
- [ ] Ish haqi ekranidagi oklad, bonus, ushlanma, davr va to‘lov holati uchun to‘liq modelni ishlab chiqish; mavjud `labor` xarajat yozuvi buning to‘liq o‘rnini bosmaydi.
- [ ] Buxgalter va finansist sahifalarini tegishli APIga ulash, ruxsatga qarab ko‘rinadigan hujjatlarni tekshirish.

Bog‘liqlik: 05–06. Qabul mezoni: kirim, haqiqiy xarajat, qarz va pul to‘lovi alohida hisoblanadi; bir xarid ikki marta xarajatga yozilmaydi.

**08 — Vazifalar, hisobotlar va fotosuratlar**

- [x] Vazifa holatlari, kunlik/haftalik hisobotlar, tekshirish/qayta yuborish va private foto endpointlari mavjud.
- [ ] Qabul qilingan progressni sabab bilan tuzatish yoki bekor qilish oqimini yozish.
- [ ] Vazifa/hisobot yaratish, tekshirish, qaytarish va foto yuklashni frontendga ulash.
- [ ] Hisobotga biriktirilgan smeta qatori, zona va bajarilgan miqdorni real ma’lumotdan tanlatish.
- [ ] Faylni tekshirish, rasmni qayta kodlash va ishlatilmay qolgan fayllarni tozalashni yakunlash.

Bog‘liqlik: 04–06; miqdorlar va tannarx mosligi uchun 07 bilan birga tekshiriladi. Qabul mezoni: hisobotni qayta tasdiqlash progressni takror yozmaydi, ruxsatsiz odam fotosuratni yuklab ololmaydi.

**09 — Dashboard, prognoz va qolgan sahifa imkoniyatlari**

- [x] Obyekt tannarxi, sof pul oqimi, yetkazib beruvchi qarzi va avans yig‘indisi endpointi mavjud.
- [ ] Dashboarddagi har bir ko‘rsatkich uchun manba va hisoblash qoidasini belgilash; umumiy moliya huquqi bilan sahifa ruxsatlarining mosligini tekshirish.
- [ ] Reja–fakt, to‘lov kalendari, prognoz va moliyaviy hisobotlar uchun yetishmayotgan hisoblar/APIlarni yozish.
- [ ] To‘liq kontragent solishtiruvi va kerakli hujjat/Excel/PDF eksportlarini ishlab chiqish.
- [ ] Texnik paneldagi CPU/RAM/xatolik/backup ko‘rsatkichlari va support suhbatlari uchun zarur backendni yozish; mavjud diagnostics va support ro‘yxati bu ekranlarning hamma funksiyasini qoplamaydi.
- [ ] Sozlamalar, bildirishnomalar va profilning saqlanadigan maydonlarini aniqlab ulash; talab doirasidagi AI yordamchi uchun alohida kontrakt belgilash.
- [ ] Ushbu oqimlarda qolgan statik raqamlar va faqat muvaffaqiyat xabari chiqaradigan tugmalarni haqiqiy natijaga ulash.

Bog‘liqlik: 05–08. Qabul mezoni: har bir ko‘rsatkichni bazadagi manba yozuvlari bilan tekshirish mumkin; mavjud bo‘lmagan ma’lumot yolg‘on nol yoki foyda sifatida chiqmaydi.

**10 — Obuna va tashqi integratsiyalar**

- [x] Tarif versiyalari, SaaS invoyslari, qo‘lda to‘lov/kredit/refund yozuvlari va integratsiya holati kodi mavjud.
- [x] Telegram identity tekshiruvi va kam qolgan material haqida xabar yuboruvchi worker kodi mavjud; real ulanish tasdiqlanmagan.
- [x] 2026-10-04: Telegram deep-link ulash (`/v1/integrations/telegram/link`, bir martalik hash token, 5 daqiqa, race-safe), `telegram_accounts`, bot long polling (`/start`, rolga mos menyu, /tasks, /notifications, /profile, obyektlar, kam qolgan material, qarzdorlar), ilova ichidagi `notifications` jadvali va outbox orqali yetkazish. Integration testlar: 22/22. Material so‘rovi va progress yuborish bot oqimlari 06 va 08 bosqichlarida ulanadi.
- [ ] Avtomatik oylik invoys chiqarish va ortiqcha to‘lovni keyingi davrga o‘tkazishni yozish.
- [ ] Kamera hodisalarini saqlash/bog‘lash, UySot reja/fakt ma’lumotlari va reconciliation — tashqi/ichki yozuvlarni solishtirish — oqimini yozish.
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
