# BARPO AI — rollar, funksiyalar va «nima qilinsa nima bo‘ladi»

> Sana: 2026-10-28. Holat: `main` (PR #19 gacha). Hujjat egasi uchun qisqa qo‘llanma: kim nima qila oladi, qaysi amal qaysi natijani beradi. Qoidalarning to‘liq manbasi — `docs/backend/BARPO_BUSINESS_RULES.md`, egasi qarorlari — `docs/TZ_VA_NARX_REJASI.md` (D1–D23).

> **2026-11-23 o‘zgarish (PR #27):** brigadir roli olib tashlandi. Ombor mudiri materialni so‘rovsiz prorabga beradi («Chiqim»), prorab qabul qiladi va sarfni tasdiqsiz yozadi (darhol xarajat). Kunlik hisobotni prorab yozadi, bosh muhandis yoki mijoz admini qabul qiladi. Talabnomalar, akkord va brigadir avanslari yo‘q. Quyida brigadir haqidagi bandlar tarix uchun qoldi.

## 1. Tizim tuzilishi

- **Platforma darajasi** — BARPO AI egasi va texnik jamoasi. Kompaniyalarni ochadi, tariflar va to‘lovlarni yuritadi, murojaatlarga javob beradi, xatolarni tuzatadi.
- **Kompaniya darajasi** — har bir qurilish kompaniyasi alohida, ma‘lumotlari bir-biridan to‘liq ajratilgan (baza darajasida RLS). Kompaniya admini xodimlarni va ruxsatlarni boshqaradi.
- **Obyekt** — ish birligi. Xodim faqat biriktirilgan obyektlarni ko‘radi (admin — hammasini).
- **Pul** faqat so‘mda saqlanadi, barcha hisob-kitob serverda. USD faqat ko‘rsatish uchun (CBU kursi).
- **O‘zgarmas yozuvlar**: ombor va moliya jurnali, qabul qilingan progress, audit. Xato tuzatilmaydi, teskari (storno) yoki tuzatish yozuvi bilan to‘g‘rilanadi — tarix saqlanadi.
- **Ruxsat serverda** tekshiriladi. Interfeys tugmani yashiradi, lekin himoya API’da: ruxsatsiz so‘rov 403.

## 2. Platforma rollari

| Rol | Nima qila oladi | Nima qila olmaydi |
|---|---|---|
| **Platforma egasi** | Hammasi: kompaniya ochish, bloklash, arxivlash, taklif havolasi, tariflar, invoys va to‘lovlar, qarzdorlar, murojaatlar, texnik xodimlar, platforma ruxsatlari, umumiy audit, diagnostika, kompaniya xodimiga parol tiklash, adminlikni o‘tkazish, kompaniya hujjatlarini storno qilish | Kompaniyaning obyekt, smeta, ombor, moliya sahifalariga kirmaydi (faqat tuzatiladigan yozuvning qisqa ma‘lumotini ko‘radi) |
| **Super admin** | Standart holatda egasining barcha amallari (texnik administrator). Telegram orqali ikki bosqichli kirish majburiy | Egasini bloklay olmaydi va rolini o‘zgartira olmaydi; ruxsatlari egasi tomonidan qisqartirilishi mumkin |
| **Support** | Ko‘radi (kompaniyalar, tariflar, daromad, qarzdorlar), murojaatlarga javob beradi, diagnostikani ko‘radi, kompaniya foydalanuvchisiga parol tiklash havolasi beradi | Kompaniya yaratmaydi, bloklamaydi, tarif va to‘lovlarni o‘zgartirmaydi, storno qilmaydi |

Platforma menyusi: Bosh sahifa (KPI, daromad dinamikasi, kompaniyalar holati), Mijozlar, Tariflar, Daromad va qarz, Qarzdorlar, Murojaatlar, Texnik xodimlar, Platforma ruxsatlari, Audit, Diagnostika.

**Nima qilinsa nima bo‘ladi (platforma):**

- Kompaniya ochilsa → holati «ro‘yxatdan o‘tmagan», bir martalik taklif havolasi beriladi. Havola bilan admin ro‘yxatdan o‘tsa → 14 kunlik sinov boshlanadi, havola yonib ketadi (ikkinchi marta 409).
- Tarif biriktirilsa → invoys yaratish mumkin; to‘lov yozilsa → qarz kamayadi, ortiqcha to‘lov kreditga o‘tadi va keyingi invoysga qo‘llanadi.
- Kompaniya bloklansa → xodimlar kira olmaydi, admin faqat billing va murojaat sahifalarini ko‘radi. Qayta ochilsa — hamma narsa o‘z joyida.
- Kompaniya xodimiga parol tiklash → 30 daqiqalik bir martalik havola, eski sessiyalar bekor bo‘ladi.
- Adminlik o‘tkazilsa → eski admin oldingi roliga qaytadi, ikkalasi qayta kiradi, yangi adminga bildirishnoma.
- Kompaniya hujjati storno qilinsa → teskari yozuv kompaniyada admin nomidan ko‘rinadi, kim qilgani auditda. Bog‘langan to‘lovlar avval storno qilinishi shart.

## 3. Kompaniya rollari

| Rol | Menyu | Qila oladi | Qila olmaydi |
|---|---|---|---|
| **Mijoz admini** | Bosh sahifa, Obyektlar, Smetalar, Vazifalar, Hisobotlar, Ombor, Xodimlar; barcha moliya sahifalari; Ruxsatlar, Billing, Kamera, Integratsiyalar, Audit, Fayllar, Sozlamalar | Xodim yaratish va biriktirish, rol bo‘yicha ruxsatlarni sozlash, obyekt/blok/zona/xonadon, smeta (yaratish, tahrir, import, Excel), vazifa, hisobotni qabul qilish, barcha moliya amallari, ish haqi, narx varaqasi, audit, kompaniya sozlamalari | Ombor amallarini bajarmaydi va material yaratmaydi (D18): kirim, jo‘natish, qabul, sarf, storno, inventarizatsiya faqat xodim rollarida. Talabnomani bajarmaydi/rad etmaydi |
| **Bosh muhandis (menejer)** | Bosh sahifa, Obyektlar, Smetalar, Vazifalar, Materiallar, Hisobotlar, Xodimlar | Obyekt va blok yaratadi, smeta tuzadi va tahrirlaydi, narxni ko‘radi, vazifalarni boshqaradi, hisobot yuboradi va tekshiradi, xodimlar ro‘yxatini ko‘radi | Xodim yaratmaydi, moliya sahifalari yo‘q, ombor amallari yo‘q |
| **Prorab** | Bosh sahifa, Obyektlar, Smetalar, Vazifalar, Materiallar, Hisobotlar | Vazifalarni beradi va qabul qiladi, hisobotlarni qabul qiladi yoki qaytaradi, progressni tuzatadi, brigadir sarfini tasdiqlaydi, ombor qoldig‘ini ko‘radi, smetani hajm bilan ko‘radi | **Pul ko‘rmaydi (D20)**: narx, summa, stavka, moliya, brigadir ishlab topgani unga chiqmaydi. Kirim va jo‘natish qilmaydi |
| **Brigadir** | Bosh sahifa (Mening hisobim), Vazifalar, Material qabul, Material talabnomasi, Hisobotlar | Vazifani boshlaydi va topshiradi, kunlik/haftalik hisobot va foto yuboradi, jo‘natmani qabul qiladi (qisman ham), sarf taklif qiladi, qaytaradi, ko‘p qatorli talabnoma beradi, o‘z akkord hisobini ko‘radi | Faqat o‘z hisobotlari va o‘z pullari; smetani ko‘rmaydi; boshqa brigadirning ma‘lumoti yo‘q |
| **Ombor mudiri** | Bosh sahifa, Kirim/Chiqim, Omborlar, Talabnomalar, Transferlar, Inventarizatsiya, Materiallar | Material yaratadi, kirim qiladi, brigadirga jo‘natadi, qaytarishni qabul qiladi, talabnomani bajaradi yoki rad etadi, storno va inventarizatsiya, minimal qoldiq | Faqat biriktirilgan omborlar; narxlarni (qiymat ustunini) ko‘rmaydi; sarfni tasdiqlamaydi |
| **Finansist** | Bosh sahifa, Budjetlar, Reja–fakt, Prognoz, To‘lov so‘rovlari, To‘lov kalendari, Hisob hisobotlari, Narx varaqasi | Budjet, reja–fakt tahlili, prognoz, ajratma va to‘lov so‘rovi, narx varaqasi versiyalari, smeta import, Excel eksportlar | Hujjat yozmaydi va to‘lamaydi (kassa yo‘q), ish haqini yopmaydi |
| **Buxgalter** | Bosh sahifa, Birlamchi hujjatlar, Hisoblar va dalolatnomalar, Bank va kassa, Kontragentlar, Ish haqi, Solishtirish, Hisob hisobotlari, Talabnomalarga mablag‘ | Kontragent va kassa, invoys va dalolatnoma, to‘lov, avans va avans hisobi, storno, ish haqi davri va to‘lov, mablag‘ ajratish, ombor hisobotini ko‘rish | Smeta tahrirlamaydi, ombor amallari yo‘q, narx varaqasi yo‘q |

Admin har rol uchun har sahifaning o‘qish/yaratish/o‘zgartirish/o‘chirish ruxsatini «Ruxsatlar» sahifasida o‘zgartira oladi va alohida xodimga individual ruxsat bera oladi. Istisno: adminga ombor amallari hech qanday grant bilan ochilmaydi.

## 4. Modullar: nima qilinsa nima bo‘ladi

### 4.1. Kirish va xavfsizlik

- Xodim yaratilsa → boshlang‘ich parol beriladi, birinchi kirishda almashtirish majburiy, almashtirgach barcha sessiyalar bekor bo‘ladi.
- Rol yoki holat o‘zgartirilsa → xodimning sessiyalari bekor bo‘ladi, qayta kiradi.
- Telegram ulansa → bildirishnomalar botga keladi, bot orqali vazifalar, progress va talabnoma yuboriladi. Super adminga Telegram 2FA (6 xonali kod, 5 urinish, 5 daqiqa) majburiy.
- Noto‘g‘ri parol ko‘p marta → so‘rovlar cheklanadi (rate limit).

### 4.2. Obyektlar, bloklar, zonalar, xonadonlar

- Obyekt yaratilsa → «Asosiy ombor» avtomatik ochiladi, yaratuvchi biriktiriladi. Obyekt kartasi: zonalar/bloklar, xonadonlar, qavatlar progressi, xodimlar, omborlar; narx huquqi bilan moliya kartasi (smeta, fakt, qolgan, to‘langan, qarz, avans, tushum, bajarilish %).
- Blok → qavatlar soni, maydon, sanalar, mas‘ullar, rasm; holati sanalardan o‘zi chiqadi (kutilmoqda, faol, kechikmoqda, tugagan).
- Zona turi: blok, kirish, qavat, boshqa. Qavat zonasi hisobot va smeta qatoriga biriktirilsa → «Qavatlar progressi» jadvalida qavat × ish bo‘yicha reja/fakt/foiz chiqadi.
- Xonadon raqami blok ichida takrorlanmaydi; Excel import oldin reja (preview), keyin yozish; xonadon arxivlansa raqami bo‘shaydi.
- Obyekt arxivlansa → ro‘yxatdan yo‘qoladi, tarix saqlanadi; ochiq vazifa yoki qoldiq material bo‘lsa arxivlab bo‘lmaydi.

### 4.3. Smeta

- Qator turlari: material, ish (labor), texnika, xizmat. Material qatori norma × ish hajmi + yo‘qotish % bilan hisoblanishi mumkin, oylarga taqsimot summasi hajmga teng bo‘lishi shart.
- Jami, tur/kategoriya/zona bo‘yicha guruhlar — serverdan. Narx huquqi bo‘lmagan rolga narx va summa ustunlari kelmaydi.
- Tahrir qilinsa → yangi **reviziya** (eski qatorlar tarix uchun qoladi, fakt bog‘lanishi uzilmaydi; vazifa o‘sha qatorning yangi reviziyasiga o‘tadi).
- Ish qatorida **brigada stavkasi** (so‘m/birlik). Bo‘sh bo‘lsa obyektning «Brigada stavkasi, %» (smeta narxidan) ishlaydi.
- Excel import: sarlavha moslashtirish, xatolar qator raqami bilan, eski smeta yashirin almashtirilmaydi. Excel eksport narx huquqisiz narxsiz.

### 4.4. Vazifalar

- Holatlar: rejada → bajarilmoqda → tekshiruvda → qabul qilingan yoki qaytarilgan. Ijrochi yuboradi, tekshiruvchi (yoki admin) qabul qiladi; ijrochi = tekshiruvchi bo‘lmaydi.
- Vazifani smeta qatoriga bog‘lash ixtiyoriy → kartada reja, qabul qilingan hajm, foiz, material sarfi ko‘rinadi; Kanban kartasida qator va foiz. Vazifa o‘zi hajm yozmaydi — hajm faqat hisobot orqali.
- Qabul qilingan vazifa tahrirlanmaydi va arxivlanmaydi.

### 4.5. Hisobotlar va progress

- Brigadir kunlik/haftalik hisobot yuboradi: matn, zona, smeta ish qatori va bajarilgan hajm, foto, prognoz tugash sanasi.
- Prorab qabul qilsa → **progress yoziladi** (reja–fakt, dashboard, qavat jadvali, obyekt bajarilish foizi yangilanadi), prognoz sanasi obyektga yoziladi, brigada stavkasi qotiriladi va ishlab topilgan summa hisoblanadi. Qaytarsa → brigadir matnni tuzatib qayta yuboradi.
- Qabul qilingan progress xato bo‘lsa → «Progressni tuzatish» (farq va sabab), asl yozuv o‘zgarmaydi. Tuzatish qotirilgan stavka bilan summani ham o‘zgartiradi.
- Rejadan oshgan hajm ham qabul qilinadi va to‘lanadi; reja–faktda alohida ko‘rinadi.

### 4.6. Ombor

- Kirim (ombor mudiri) → qoldiq va qiymat ortadi (harakatlanuvchi o‘rtacha tannarx).
- Jo‘natish brigadirga → omborda rezerv; brigadir qabul qilsa (qisman ham) → uning hisobiga o‘tadi, qolgani rezervda; bekor qilsa rezerv bo‘shaydi; nizo (dispute) — rezerv turadi.
- Brigadir sarf taklif qilsa → prorab tasdiqlaganda **xarajat** yoziladi (smeta qatori va zona bo‘yicha), ishlatilmagani brigadirda qoladi; qaytarish ombor mudiri qabul qilgach omborga o‘tadi.
- Talabnoma (ko‘p qatorli): brigadir bir so‘rovda bir nechta material; ombor mudiri qatorma-qator bajaradi (jo‘natish yaratiladi) yoki rad etadi; so‘rovchi bekor qiladi. Talabnoma holati qatorlardan.
- Minimal qoldiq belgilansa → kamayganda bildirishnoma. Inventarizatsiya → farq o‘zgarmas tuzatish yozuvi (rezervlar avval hal qilinadi).
- Storno → asl yozuv qoladi, teskari yozuv yoziladi; keyingi sarf qoldiqdan oshsa rad etiladi.

### 4.7. Moliya

- Hujjatlar: ajratma, buyurtma, yetkazuvchi invoysi (ombor kirimiga bog‘lanadi, summa kirim qiymatiga teng bo‘lishi shart), boshlang‘ich qarz, mehnat/texnika/xizmat dalolatnomasi, to‘lov, tushum, avans, avans hisobi, kassalar aro o‘tkazma, storno.
- To‘lov hujjatga bog‘lanadi, qoldiqdan oshmaydi («Summa hujjat qoldig‘idan oshadi»). Avans berilsa → kontragentda avans qoldig‘i; «Avansdan yopish» qarzni avans bilan yopadi, kassa o‘zgarmaydi; faqat shu obyekt avansi hisoblanadi.
- Kontragent turlari: yetkazib beruvchi, subpudratchi, buyurtmachi, xodim. Solishtirish — yurib boruvchi qoldiq.
- Budjet oylik; reja–fakt (smeta joriy reviziyasi vs xarajat, tur/kategoriya/oy); prognoz (oylik o‘rtacha, qolgan budjet, tugash sanasiga yetish); hisob sanasi hujjat sanasi bo‘yicha.
- To‘lov so‘rovi: finansist yaratadi, tasdiqlash → kalendarda, to‘lash → to‘lov hujjati.
- Narx varaqasi (finansist): xonadonlar bo‘yicha tannarx va sotish narxi, ustama %, USD kursi bilan versiya; versiyalar o‘zgarmas.

### 4.8. Ish haqi va brigada akkordi

- Ish haqi davri oylik, obyekt bo‘yicha: xodimga oklad, bonus, ushlanma; davr yopilsa → har xodimga mehnat hujjati (kompaniya qarzi), to‘lash → to‘lov hujjati.
- Brigadir akkordi: davr yopilganda hisobot sanasi oy oxirigacha bo‘lgan, hali davrga kirmagan ishlab topgani «Akkord» sifatida avtomatik yoziladi (yozuv bo‘lmasa qo‘shiladi). Kech qabul qilingan hisobot keyingi davrga, to‘lovdan keyingi tuzatish ham.
- To‘lashda xodimning shu obyektdagi avansi avval hisoblanadi, qolgani kassadan. Brigadir panelida: shu oy va jami ishlab topilgan, davrga kirgan, to‘langan, avanslar, qoldiq.

### 4.9. Bosh sahifa, bildirishnomalar, Telegram, audit

- Har rolning o‘z paneli: admin — obyektlar, vazifalar, hisobotlar, ombor, xarajat grafigi, moliya, xodimlar; prorab/brigadir — pulsiz; ombor mudiri — qoldiqlar va talabnomalar; finansist/buxgalter — moliya.
- Bildirishnomalar ilovada va Telegramda: vazifa, hisobot qabul/qaytarish, talabnoma, jo‘natma, minimal qoldiq, murojaat javobi. Admin toifalarni sozlaydi.
- Telegram bot: brigadir — vazifalar, progress yuborish (qadam-baqadam, rasm bilan), material so‘rash; prorab — obyektlar, vazifalar, progress, materiallar, hisobotlar; ombor mudiri — qoldiq, kam qolgan materiallar, talabnomalar; menejer/finansist/buxgalter — obyektlar, moliya ko‘rinishi.
- Audit: kompaniyada admin ko‘radi (kim, qachon, nima), Excel eksport; platformada egasi hamma kompaniyalar bo‘yicha.
- Excel eksport: smeta, reja–fakt, vazifalar, ombor qoldiqlari, audit, narx varaqasi, jadvallar.

## 5. Tez-tez so‘raladigan «nega?»

- **Nega admin kirim qila olmaydi?** Egasi qarori D18: ombor amallari faqat ombor mudiri va brigadirda, admin nazorat qiladi.
- **Nega prorab summani ko‘rmaydi?** D20: prorab hajm bilan ishlaydi, pul finansist/buxgalter/admin da.
- **Nega yozuvni o‘chirib bo‘lmaydi?** Ledger o‘zgarmas: storno yoki tuzatish bilan to‘g‘rilanadi, tarix saqlanadi.
- **Nega smeta tahriri yangi reviziya?** Eski faktlar eski qatorlarga bog‘liq, reviziya tarixi ko‘rinadi.
- **Nega talabnoma admin tomonidan bajarilmaydi?** Jo‘natish — ombor amali (D18).
