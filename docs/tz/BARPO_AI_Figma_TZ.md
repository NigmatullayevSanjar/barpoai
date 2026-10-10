# BARPO AI Figma dizayni uchun texnik topshiriq

> Bu fayl `BARPO_AI_Figma_TZ.docx` (v1.0, 10.09.2026) dan avtomatik olingan matn nusxasi; Claude va qidiruv uchun.
> Asl hujjat — shu papkadagi `.docx`. Farq bo‘lsa `.docx` ustun. Loyiha qarorlari (`docs/TZ_VA_NARX_REJASI.md`, 1-bo‘lim) TZ’dagi takliflardan ustun.

Versiya 1.0 | 10 sentabr 2026 | UI/UX dizayner, mahsulot rahbari va dasturchilar uchun

BARPO AI qurilish boshqaruvi platformasining mavjud bordo va oq dizaynini saqlagan holda barcha modullarni tugallang. Yangi Figma faylida mavjud ekranlarning tahrirlanadigan nusxalarini tiklang, yetishmayotgan jarayonlarni qo‘shing va uchta SaaS roli hamda oltita mijoz roli uchun alohida ish muhitlarini yarating. Yakuniy natija komponentlar, ruxsatlar, holatlar, bosiladigan prototiplar va dasturchiga topshirish izohlari bilan birga berilsin.

Bu topshiriq dizayn ishining hajmini belgilaydi. Tijoriy taklifdagi ishlab chiqish narxi, to‘lov shartlari va umumiy muddatni o‘zgartirmaydi. Tavsiya etilgan yangi biznes qoidalari quyida “taklif” yoki Q identifikatori bilan ajratilgan; ular mahsulot rahbari bilan yakunlashtiriladi.

## 1. Manbalar va talablarning ustuvorligi

| Belgi | Manba | Qo‘llanishi |
|---|---|---|
| M1 | Qurilish SaaS platformasi. Tijoriy taklif(2).pdf, 4 sahifa, 19.08.2026 | Modullar, 9 rol, biznes jarayonlari va tijoriy doira |
| M2 | Untitled (4).zip, 11 PDF eksport | Amaldagi vizual yo‘nalish, ekranlar va modallar |
| M3 | BARPO-maket-defektlar.xlsx, 5 varaq, 05.09.2026 | 122 defekt, yetishmayotgan oqimlar, terminologiya va handoff talablari |
| M4 | Buyurtmachining suhbatdagi ko‘rsatmalari | Asosiy dizaynni saqlash, yangi fayl, mavjud sahifalar nusxasi va rollar bo‘yicha kengaytirish |

M2 tarkibi: Untitled.pdf; obyektlar.pdf; obyekt ko‘rish.pdf; obyekt qo‘shish.pdf; blok ko‘rish.pdf; blok qo‘shish.pdf; blok ko‘rish (Xomashyo plus).pdf; sidebar.pdf; main-content.pdf; Login.pdf; Register.pdf. Untitled.pdf bitta katta umumiy kanvas bo‘lib, ichida asosiy sahifalar va ko‘plab modallar joylashgan. Alohida PDFlar ayrim ekranlarning batafsil eksportidir; ularni yangi, alohida funksiyalar deb ikki marta hisoblamang.

M3 auditi Untitled (2).pdf asosida yozilgan. Shuning uchun undagi “mavjud emas” hukmi yangi M2 uchun avtomatik yakuniy hukm emas. Defektlar registridagi eski IDlar saqlansin; yopilgan deb belgilash uchun yangi Figma freymi va tekshiruv dalili kerak.

Asl Figma: https://www.figma.com/design/zT1yQ2F2GwRr2RHpK9hns2

Davom ettirish uchun avval yaratilgan fayl: https://www.figma.com/design/G9HLbNmd3BtwPLqyXgaksD

### 1.1. Yangi eksport bo‘yicha aniqlashtirishlar

| Qism | Yangi eksportda ko‘rinadi | Dizayner vazifasi |
|---|---|---|
| Header | Ayrim asosiy sahifalarda UZ tanlovi va qo‘ng‘iroq bor | Login, modallar va barcha rollarda izchil qilish; RU va o‘qilgan holatini chizish |
| Obyekt va blok | Ro‘yxat, detallar, yaratish modallari, qavat va xonadon ko‘rinishlari bor | Zona modeliga moslash, budjet va material kesimini ulash |
| Smeta | Detal, yangi smeta, qator qo‘shish va tahrirlash, import boshlanishi bor | Gorizontal ro‘yxat, import mapping va xatolar, tasdiqlash, plan/faktni tugallash |
| Hisobot | Kunlik va haftalik detal, foto va yaratish formalari bor | Galereya interaksiyasi, validatsiya, rad etish, tarix va ombor bilan bog‘lanish |
| Xodim va profil | Xodim qo‘shish, tahrirlash, obyektga biriktirish, profil bor | Lavozim va rolni ajratish; profilning parolni ochiq ko‘rsatishini bartaraf etish |
| Xatolik | Umumiy xatolik tasviri bor | 403, 404, 500, tarmoq uzilishi va qayta urinishni alohida belgilash |

M2da BuildFlow nomi ayrim modallar va sozlamalarda saqlangan, smeta sidebarida “Mijozlar” qolgan, sanalar va summalar aralash. Smeta detalida yuqoridagi 2 450 000 000 UZS, pastdagi 596 850 000 UZS va ko‘rsatilgan beshta 102 000 000 UZS qator o‘zaro mos emas. Yangi demo ma’lumot bitta hisoblangan datasetdan olinishi shart.

## 2. Ish doirasi va bosqichlar

Asosiy mahsulot veb platforma va API ko‘rinishida. Mobil ilova M1da MVPdan keyingi ish sifatida belgilangan. Figma topshirig‘ida desktop uchun 1440 va 1280 px majburiy; mobil ilova alohida loyiha bo‘lib qoladi. M1dagi 5 oy butun loyiha muddati: 2 oy tahlil, talablar va dizayn; 3 oy ishlab chiqish va testlash. Bu TZ yangi muddat yoki qo‘shimcha narx va’dasi bermaydi.

| Paket | Dizayn tarkibi | Bosqich qarori |
|---|---|---|
| A | Dizayn tizimi, kirish, kompaniya, 6 mijoz roli, obyekt va zonalar, smeta, ombor, xarid, to‘lov, xarajat, budjet, vazifa, hisobot, profil | Asosiy ishchi prototip |
| B | 3 SaaS roli, obunachilar, invoyslar, markaziy katalog, platforma analitikasi, Telegram, UySot, tanlangan to‘lov manbasi, kamera tarixi | M1 doirasida chiziladi; reliz navbati Q01 orqali kelishiladi |
| C | Global qidiruv, Gantt, 2FA, kengaytirilgan onboarding, individual rol yaratish, qo‘shimcha mobil veb ekranlar | Qo‘shimcha taklif; alohida belgi bilan |

M3ning “2-bosqich” tavsiyasi M1dagi modulni bekor qilmaydi. Paket Bni chiqarib tashlash mumkin emas; faqat uni qaysi relizda ishga tushirish kelishiladi. Brenddagi AI so‘zi avtomatik ravishda chat, LLM tahlili yoki AI yordamchi moduli borligini anglatmaydi. Bunday yangi modul ushbu doiraga kiritilmaydi.

## 3. Figma fayli tuzilishi va nusxalash

| Page nomi | Tarkibi |
|---|---|
| 00 Readme | TZ versiyasi, manbalar, qarorlar, sahifalar xaritasi, prototip boshlanish nuqtalari |
| 01 Reference | 11 PDFdan olingan referenslar, eski ekran nomlari va ularning yangi IDlari |
| 02 Foundations | Rang, shrift, spacing, radius, soya, grid, format va UZ/RU qoidalari |
| 03 Components | Umumiy komponentlar va ularning holatlari |
| 04 Auth | Kirish, ro‘yxatdan o‘tish, tiklash, taklif, kompaniya yaratish |
| 05 Shared Screens | Barcha modullarning asosiy ekranlari va qayta ishlatiladigan tuzilmalari |
| 10 Super admin | Texnik boshqaruv va platforma darajasidagi ruxsatlar |
| 11 Platforma egasi | Obunachilar, tushum, invoyslar, katalog |
| 12 Texnik yordam | Murojaatlar va cheklangan diagnostika |
| 20 Mijoz | Tashkilot rahbari uchun umumiy nazorat va tasdiqlashlar |
| 21 Prorab | Biriktirilgan obyektlar, vazifalar, haftalik hisobot |
| 22 Brigadir | Mening vazifalarim, material qabul qilish, kunlik hisobot |
| 23 Ombor mudiri | Zaxira, kirim, transfer, inventarizatsiya |
| 24 Finansist | Budjet, xarajat, yetkazib beruvchi balansi, to‘lovlar |
| 25 Menejer | Operatsion muvofiqlashtirish va berilgan ruxsatlar |
| 30 States and RU | Holatlar, ruscha uzun matn sinovlari va 1280 px variantlar |
| 40 Prototype and Handoff | Asosiy jarayonlar, ruxsatlar, defekt IDlari va topshirish mezonlari |

Referens rasmlarni 01 Reference sahifasida saqlash mumkin. Ishchi sahifalar tahrirlanadigan text, frame, component va instance qatlamlaridan tuzilsin; to‘liq sahifa PDF yoki PNG ko‘rinishida topshirilmasin. Har bir eski ekran va modal yangi freym bilan moslashtirilsin. Takrorlar bitta komponentga birlashtiriladi, lekin tegishli jarayon yo‘qolmaydi.

Freym nomi: MODUL / EKRAN-ID / ROL / HOLAT / 1440 / UZ. Misol: Smeta / EST-01 / Mijoz / Filled / 1440 / UZ. Har rol page’ida shu rolning dashboardi, menyusi, kamida bitta to‘liq ish jarayoni va ruxsat cheklangan holati bo‘lsin. Faqat profil nomini almashtirish rol varianti hisoblanmaydi.

## 4. Vizual tizim va saqlanadigan dizayn

BARPO AI logotipi, to‘q bordo sidebar, oq kontent, bordo asosiy tugmalar, yumaloq kartalar, ingichka chegaralar va obyekt fotosuratlari bilan yaratilgan hozirgi uslub saqlansin. Xatoni tuzatish va yangi modulni sig‘dirish uchun lokal kompozitsiya o‘zgarishi mumkin. Boshqa rangdagi yangi mahsulot ko‘rinishini yaratmang.

### 4.1. Ranglar va tipografika

| Token | Qiymat | Holati |
|---|---|---|
| brand/sidebar | #33081C | M2 obyektlar eksportidagi vektor rang |
| brand/primary | #681B33 | M2dagi asosiy bordo |
| brand/subtle | #F4E8EC | M2dagi och bordo |
| surface/default | #FFFFFF | Mavjud oq yuzalar |
| surface/muted | #F8FAFC | Mavjud och fon |
| border/default | #E2E8F0 | Mavjud chegaralar |
| text/primary | #33081C | Mavjud sarlavha yo‘nalishi |
| text/secondary | #595959 | Kontrastni yaxshilash uchun taklif |
| brand/hover | #511427 | Taklif, komponent tekshiruvida yakunlanadi |
| success / warning / danger / info | #18794E / #8A4B00 / #B42318 / #175CD3 | Semantik ranglar uchun taklif; brend rangini almashtirmaydi |

M2 eksportidagi matnning bir qismi vektor shakllar bo‘lib qolgan. Shrift nomini rasmga qarab yakuniy deb e’lon qilmang; original Figma text style’ini tekshiring. Asl shrift topilmasa, UZ va kirill belgilarini qo‘llaydigan Inter taklif etiladi. Raqamlar uchun tabular figures ishlatilsin; alohida mono shrift faqat aniqlangan mavjud uslub yoki tasdiqlangan ehtiyoj bilan.

Taklif etiladigan shkala: H1 28/36, H2 22/30, H3 18/26, body 14/22, label 13/18, caption 12/18 px. Qalinliklar 400, 500, 600 va 700 bilan cheklansin. Jadval va forma matni 12 pxdan kichik bo‘lmasin. Diagrammalarga 6 nomlangan rang, legenda va naqsh/yorliq yordami berilsin; holat va prioritet faqat rang bilan farqlanmasin.

### 4.2. Layout va komponentlar

1440 px asosiy freymda sidebar 260 px: bu M2dagi sidebar.pdf kengligiga mos. 1280 pxda yig‘ilgan 72 px variant taklif etiladi. Sahifa ichki chekkasi 32 px, kichik variantda 24 px; grid 12 ustun, gutter 24 px. Spacing: 4, 8, 12, 16, 24, 32, 48 px. Karta paddingi 24 px; input va tugma balandligi 40 px; katta kirish tugmasi 44 px. Radiuslar: input/tugma 8 px, karta 12 px, modal 16 px. Yakuniy qiymatlar 1440 referens bilan yonma-yon tekshirilsin.

Majburiy komponentlar: AppShell, Sidebar, Header, Breadcrumb, PageToolbar, Button, IconButton, Input, PasswordInput, Search, Select, MultiSelect, DatePicker, DateRange, Checkbox, Radio, Toggle, Textarea, MoneyField, QuantityField, StatusBadge, PriorityIndicator, KPI, ObjectCard, ProgressBar, DataTable, Pagination, Tabs, Modal, Drawer, ConfirmDialog, Tooltip, Toast, EmptyState, Skeleton, ErrorState, Upload, Gallery, Stepper, KanbanCard va NotificationItem.

Har mos komponentda default, hover, focus, active/selected, disabled, loading va error variantlari bo‘lsin. Matn komponent xususiyati orqali o‘zgarsin; Auto Layout matn uzayishiga moslashsin. Yangi ikonlar bitta tekshirilgan to‘plamdan olinsin. Saqlangan ikonlar bilan stroke va o‘lcham mos bo‘lsin. Modal viewportdan uzun bo‘lsa ichki scroll va ko‘rinadigan amal paneli bo‘lsin. Escape, fokusni modal ichida ushlash va yopilganda fokusni qaytarish izohlansin.

Har toolbarning o‘ngida bitta asosiy CTA bo‘lsin. Xavfli amal odatiy saqlash tugmasidan ajratilsin. Normal matn kontrasti kamida 4.5:1, katta matn va interaktiv chegaralar uchun 3:1 loyiha qabul mezoni sifatida tekshirilsin. Har ikonka tugmasining nomi va klaviatura fokus holati bo‘lsin. Animatsiya taklifi: 150-200 ms ease-out; reduced motion holatida dekorativ harakat o‘chadi.

## 5. Rollar va maʼlumot chegaralari

M1 bo‘yicha 9 rol saqlanadi. “Zavsklad” interfeysda “Ombor mudiri”, “Finansist/Buxgalter” esa “Finansist” deb ko‘rsatilishi mumkin; lug‘atda manbadagi nom bilan mosligi yozilsin. Lavozim erkin ish nomi, rol esa ruxsatlar to‘plami. “Bosh muhandis” lavozim bo‘lishi mumkin, lekin o‘z-o‘zidan o‘ninchi tizim roli bo‘lmaydi.

### 5.1. SaaS rollari

| Rol | Asosiy ekranlar | Ruxsat chegarasi |
|---|---|---|
| Super admin | Texnik holat, tizim foydalanuvchilari, platforma ruxsatlari, integratsiya diagnostikasi | Mijoz hisob-kitoblarini odatiy tartibda tahrirlamaydi; texnik amallar auditga yoziladi |
| Platforma egasi | Obunachilar, tarif va obunalar, invoyslar, tushum, markaziy katalog | Platforma biznes ma’lumotlarini boshqaradi; tenantning qurilish ma’lumotlariga avtomatik kirish bermaydi |
| Texnik yordam | Murojaatlar, obunachi aloqa kartasi, ulanish holati, cheklangan diagnostika | To‘lovni tasdiqlash, rolni oshirish va moliyaviy yozuvlarni o‘zgartirish yo‘q |

Texnik yordam uchun murojaat navbati va vaqtinchalik yordam seansi M1 rolini ishlatish uchun taklif etilgan UXdir. Seans mijoz roziligi, ko‘rinadigan banner, sabab va tugash vaqti bilan chiziladi; yashirin “mijoz sifatida kirish” bo‘lmasin. Aniq texnik ruxsatlar Q07da kelishiladi.

### 5.2. Mijoz rollari uchun taklif etilgan matritsa

K - ko‘rish, Y - yaratish, T - tahrirlash, A - tasdiqlash yoki qaytarish, R - arxivlash. “O‘z” faqat shaxsga tegishli, “bir.” biriktirilgan obyekt/ombor doirasida. Chiziq - ruxsat yo‘q. Quyidagi taqsimot M1dagi rol nomlarini amaliy jarayonga aylantiruvchi taklif bo‘lib, Q02 bilan tasdiqlanadi.

| Modul | Mijoz | Prorab | Brigadir | Ombor mudiri | Finansist | Menejer |
|---|---|---|---|---|---|---|
| Obyekt va zona | KYTR | KT bir. | K bir. | K bir. | K | KYT bir. |
| Smeta | KYTAR | KYT bir. | K hajm bir. | K material bir. | KYT | KYT bir. |
| Zaxira va kirim | K | K bir. | K o‘z | KYT bir. | K | K bir. |
| Material transferi | KA | KY so‘rov | KA qabul o‘z | KYT jo‘natish | K | KY so‘rov |
| Inventarizatsiya | KA | K bir. | - | KYT bir. | KA | - |
| Yetkazib beruvchi va xarid | KYTAR | KY so‘rov | - | K qabul bir. | KYT | KYT bir. |
| To‘lov va balans | KYA | - | - | K qabul holati | KYTA | K holat bir. |
| Qo‘shimcha xarajat | KYTA | KY bir. | - | - | KYTA | KY bir. |
| Budjet | KYTA | K bir. | - | - | KYT | K bir. |
| Vazifa | KYTAR | KYTA bir. | KT o‘z | KT o‘z | KT o‘z | KYTA bir. |
| Kunlik hisobot | KA | KA bir. | KYT o‘z | K material bir. | K xarajat | K bir. |
| Haftalik hisobot | KA | KYT bir. | K bir. | - | K | K bir. |
| Xodim va rol | KYTR | K bir. | K o‘z | K o‘z | K o‘z | KYT taklif |
| Obuna va integratsiya | KYT | - | - | - | K invoys | - |

O‘chirish faqat bog‘lanmagan qoralama uchun alohida tasdiq bilan ruxsat etiladi. Tasdiqlangan xarid, to‘lov, transfer va inventarizatsiya o‘chirib tashlanmaydi; bekor qilish yoki tuzatish hujjati orqali tarix saqlanadi. Tahrirlash qoralamada yoki qaytarilgan holatda ishlaydi. Menejer xodimni taklif qilishi mumkin, lekin o‘ziga yoki boshqa foydalanuvchiga mijoz vakolatini bera olmaydi.

Tashkilotlar ma’lumotlari barcha ro‘yxat, qidiruv, eksport, bildirishnoma, fayl va to‘g‘ridan-to‘g‘ri havolalarda ajratilsin. Faqat tugmani yashirish yetarli emas: prototipda boshqa tashkilot obyektiga kirish 403 holatini ochsin, izohlarda server tekshiruvi talab etilsin. Moliyaga ruxsatsiz rollarda summa va narx ustunlari yashiriladi; “0” bilan almashtirilmaydi.

## 6. Umumiy navigatsiya va maʼlumot modeli

Mijoz muhiti menyusi: Bosh sahifa, Obyektlar, Smetalar, Vazifalar, Xomashyolar, Hisobotlar, Xodimlar, Sozlamalar. Yangi modullar uchun Moliya guruhi qo‘shiladi: Budjet, Xarajatlar, Yetkazib beruvchilar, Xaridlar, To‘lovlar. Ombor mudirida Xomashyolar guruhi asosiy; brigadirda vazifalar, qabul qilish va hisobot birinchi o‘rinda. “Mijozlar” SaaS konsolidagi “Obunachilar” bo‘limidir va xodimlar o‘rniga chiqmaydi.

Headerda kontekst nomi, kerakli joyda obyekt tanlovi, bildirishnoma, UZ/RU va foydalanuvchi menyusi bo‘lsin. Global qidiruv Paket Cga kirsa, uning ishlamaydigan ikonkasini asosiy prototipga qo‘ymang. Obyekt filtri o‘zgarganda bog‘liq zona tanlovi tozalanadi; faol filtrlar chip ko‘rinishida ko‘rsatiladi. Detaldan qaytilganda ro‘yxatning qidiruvi, filtri va sahifa raqami saqlanadi.

Tavsiya etilgan ierarxiya: tashkilot → obyekt → zona. Zona blok, kirish, qavat yoki boshqa ish maydoni turida bo‘lishi mumkin. M2dagi obyekt → blok → kirish → qavat navigatsiyasi saqlanadi; lekin har obyekt uchun barcha pog‘onalar majburiy bo‘lmaydi. Masalan, yo‘l yoki pavilyon uchun xonadon talab qilinmaydi. Qavat va blokka biriktirilgan sarf obyektga bir marta yig‘iladi.

M2dagi xonadonlar va reja rasmlari alohida ko‘rinish sifatida saqlanadi. Xonadonni sotish, bron qilish va mijozlar CRM funksiyasi M1da ko‘rsatilmagan; ular qo‘shilmaydi. UySotdan faqat kelishilgan plan/fakt tushum ma’lumoti olinadi. Ierarxiyaning yakuniy modeli Q03 bilan tasdiqlanadi.

## 7. Kirish va birinchi foydalanish

AUTH-01 Kirish: telefon, parol, ko‘rsatish/yashirish, parolni tiklash, Telegram orqali kirish, UZ/RU. AUTH-02 Ro‘yxatdan o‘tish: telefon, parol, takrorlash, shartlarga rozilik va mavjud akkaunt uchun Kirish havolasi. Chapdagi foto va bordo karta saqlanadi; jonli sana ishlatilsa kun nomi sana bilan hisoblanadi, aks holda soat chiqarib tashlanadi.

AUTH-03 OTP: 6 raqamli kod, yuborilgan raqamning niqoblangan ko‘rinishi, 60 soniyalik qayta yuborish, kod muddati tugashi, noto‘g‘ri kod va limit holati. Kod uzunligi/taymeri - Q08 orqali backend bilan yakunlanadigan UX taklifi. Telefon uchun +998 90 123 45 67 namunasi va formatga yordam matni berilsin.

AUTH-04-06 Parolni tiklash: telefon → tasdiqlash kodi → yangi parol va muvaffaqiyat. AUTH-07 Kompaniya yaratish: nom majburiy, STIR, manzil va faoliyat turi uchun majburiylik Q08da belgilanadi. AUTH-08 Taklif: tashkilot, taklif qiluvchi, berilgan rol, havola muddati, parol o‘rnatish, mavjud akkaunt bilan qabul qilish. Ishlatilgan, muddati tugagan va boshqa telefon uchun taklif holati bo‘lsin.

AUTH-09 Telegram: tasdiqlash kutilmoqda, muvaffaqiyat, bekor qilish, ulanmagan telefonni bog‘lash va mavjud hisob bilan to‘qnashuv. Tashkilot tanlash faqat bir foydalanuvchi bir nechta tashkilotga tegishli bo‘lsa chiqadi. Parolni noto‘g‘ri kiritish matni hisob mavjudligini oshkor qilmaydi. Profil sahifasi mavjud parolni oddiy matnda ham, qayta ko‘rsatish orqali ham chiqarmaydi; faqat “Parolni o‘zgartirish” oqimi bo‘ladi.

## 8. Dashboard va obyektlar

DASH-01 Mijoz: faol obyektlar, jami tasdiqlangan smeta, davr xarajati, bajarilgan vazifalar; plan/fakt diagrammasi; kategoriyalar bo‘yicha xarajat; kam qolgan material; kechikkan vazifa; budjet oshgan obyekt. Har KPI yonida davr va hisoblash izohi, bosilganda ochiladigan modul/filtr ko‘rsatiladi. Davr yoki obyekt almashtirilsa barcha bog‘liq kartalar bir xil kesimga o‘tadi. Naqd oqim va xarajat diagrammalari alohida nomlanadi.

DASH-02 Prorab: obyekt muddati, bugungi ishlar, tekshiriladigan hisobotlar va material so‘rovlari. DASH-03 Brigadir: mening vazifalarim, qabul kutilayotgan transfer, kunlik hisobot CTA. DASH-04 Ombor mudiri: kam qoldiq, kutilayotgan qabul, jo‘natmalar, inventarizatsiya. DASH-05 Finansist: plan/fakt budjet, to‘lanmagan xaridlar, yetkazib beruvchi qarzi, moslashtirilmagan to‘lovlar. DASH-06 Menejer: ochiq so‘rovlar, muddatlar va muvofiqlashtirish vazifalari.

OBJ-01 Ro‘yxat: hozirgi foto kartalar saqlansin; karta/jadval almashtirish, nom qidiruvi, status, mas’ul, sana va budjet holati filtrlari, pagination qo‘shilsin. Kartada obyekt nomi, manzil, zona soni, mas’ul, holat, ish progressi, smeta va fakt xarajat ko‘rsatiladi. Smeta oshsa summa va farq foizi bilan ogohlantiriladi. Rasm yo‘q, uzun nom va katta summa variantlari bo‘lsin.

OBJ-02 Yaratish va tahrirlash: nom, manzil, maydon m², mas’ullar, reja boshlanish/tugash, fakt boshlanish/tugash, rasm, status. Fakt sanalar boshida bo‘sh bo‘lishi mumkin; tugash boshlanishdan oldin bo‘lmaydi. Obyekt yaratilganda mavjud bo‘lmagan zonani majburiy tanlatmang. Nom 2-120 belgi, manzil 250 belgi chegarasi - taklif etilgan validatsiya.

OBJ-03 Detal: hozirgi obyekt banneri va blok kartalari; Umumiy, Zonalar, Smeta, Materiallar, Budjet, Vazifalar, Hisobotlar, Kamera tablari. Ruxsatga qarab tablar qisqaradi. Xarajat, ishlatilgan material va reja/fakt sanalar M1ga muvofiq ko‘rsatiladi. “Arxivlash” modalida bog‘langan ochiq vazifalar va operatsiyalar bo‘yicha oqibat tushuntiriladi.

OBJ-04-06 Blok/zona ro‘yxati, yaratish va detal: nom, turi, parent, mas’ullar, sanalar; tegishli joyda qavatlar soni, yer maydoni, reja rasmi. Parent obyekt almashsa nomuvofiq qavat yoki kirish saqlanmaydi. “Kirish” yorlig‘i autentifikatsiya bilan chalkashmasligi uchun “Kirish yo‘lagi” deb aniqlashtiriladi. m/kv o‘rniga m², kv o‘rniga aniq birlik qo‘llanadi.

OBJ-07 Xonadon/reja: mavjud accordion va reja thumbnaili saqlanadi, reja kattalashtirib ochiladi. Jadvalda xonadon identifikatori, kirish, qavat, maydon va xarajatning ma’nosi ko‘rsatiladi. Bu ko‘rinishning budjet bilan bog‘lanishi Q03da kelishilmaguncha mustaqil yangi hisob-kitob kiritilmaydi.

## 9. Smeta va Excel importi

EST-01 Ro‘yxat gorizontal jadval bo‘lsin: ID, nom, obyekt, zona/blok, summa, holat, sana, mas’ul, amallar. SM-0022, SM-0023, SM-0025 va SM-0026 bir xil qator komponentidan tuzilsin. Qidiruv, obyekt/zona/status/sana filtri, saralash, 10/25/50 qator tanlovi va pagination ishlasin. KPI filtri bosiladigan bo‘lsa active holati ko‘rsatiladi. “+ Yangi smeta”da plyus faqat ikonka sifatida bir marta chiqadi.

EST-02 Yangi smeta: nom, obyekt, zona, mas’ul, sana, izoh. EST-03 Detal: qatorlar, umumiy summa, kategoriyalar jami, versiya, tasdiqlash tarixi va plan/fakt. Qator: kategoriya, katalog elementi/ish nomi, birlik, reja miqdori, birlik narxi, jami. Materiallar M1 asosidir; M2dagi Ish va Texnika kategoriyalari saqlanishi Q04da kelishiladi, ular avtomatik payroll moduli yaratmaydi.

EST-04 Qator yaratish/tahrirlash: katalogdan qidirish, kategoriya bilan filtr, birlikni tanlash, miqdor va narx, hisoblangan jami. Birligi mos bo‘lmagan materialni tanlaganda ogohlantirish; 0 yoki manfiy miqdor va manfiy narx qabul qilinmaydi. Katta smetada qidiruv, kategoriya filtri, sticky header va jami paneli bo‘lsin.

EST-05 Tasdiqlash taklifi: Qoralama → Tasdiqlash kutilmoqda → Tasdiqlangan; rad etilganda Rad etilgan → Tahrirlash → qayta yuborish. Tasdiqlash/rad etish mas’uli matritsa bilan mos; rad etish sababi majburiy. Tasdiqlangan smeta tahriri yangi versiya yaratadi, oldingi tasdiqlangan qiymat tarixda qoladi. Import tugashi smetani avtomatik tasdiqlamaydi.

EST-06 Plan/fakt: material, zona, birlik, reja miqdori, fakt sarf, miqdor farqi, reja qiymati va fakt qiymati. Ombordan brigadirga berilgan miqdorni avtomatik ravishda ishlatilgan material deb hisoblamang. Birligi farqli qatorlarni oddiy yig‘mang. Reja 0 bo‘lsa farq foizi o‘rniga “Rejadan tashqari” yoziladi.

### 9.1. Import oqimi

IMP-01 Fayl yuklash: shablonni olish, obyekt/zona, fayl tanlash yoki tashlash. M2da .xlsx/.xls/.csv va 10 MB ko‘rsatilgan; yakuniy format/hajm backend qo‘llashi bilan Q08da tasdiqlanadi. Parolli, buzilgan, bo‘sh yoki noto‘g‘ri formatdagi faylga tushunarli xato beriladi.

IMP-02 Ustunlarni moslashtirish: varaqlarni tanlash, sarlavha qatori, import ustuni → tizim maydoni, majburiy maydon belgisi, birlik va kategoriya mappingi. Miqdor va birlik ikkita alohida maydon. Noma’lum katalog elementi, takror ID, vergul/nuqta son formati va bo‘sh qiymatlar alohida ko‘rsatiladi.

IMP-03 Oldindan ko‘rish: jami, to‘g‘ri, xato va takror qatorlar soni; tekshirilgan miqdorlar va summalar. IMP-04 Xatolarni tuzatish: qator, ustun, kelgan qiymat, sabab, kutilgan format; qo‘lda tuzatish yoki tuzatilgan faylni qayta yuklash. Faqat xatolar filtri bo‘lsin.

IMP-05 Tasdiqlash va natija: import nimalarni yaratishi va mavjud qatorlarga ta’siri oldindan ko‘rsatiladi. Asosiy taklif - xatolar tugamaguncha yakuniy import bloklanadi. Qisman import faqat Q08 bilan ruxsat etilsa, o‘tkazib yuborilgan qatorlar ro‘yxati bilan chiziladi. Bir faylni qayta yuborish dublikat yaratmasligi uchun takror aniqlash holati bo‘lsin. Import faqat natija ekranidan keyin tugallangan hisoblanadi.

## 10. Ombor va materiallar harakati

WH-01 Omborlar: nom, obyekt, manzil, mas’ul. WH-02 Zaxira: material, kategoriya, birlik, balans, rezerv, mavjud miqdor, minimum, oxirgi harakat. Jadval material va yetkazib beruvchini aralashtirmaydi. “Qum” firma nomi bo‘lolmaydi; kg va 100 kg bir xil maydonga yozilmaydi. Minimumdan kam, nol va normal zaxira holatlari chizilsin.

WH-03 Material kartasi: katalog ma’lumoti, birlik, omborlar bo‘yicha qoldiq, minimum, kirim/chiqim tarixi. WH-04 Boshlang‘ich qoldiq: sana, ombor, material, miqdor, birlik, qiymat kerak bo‘lsa alohida; qo‘lda yoki IMP oqimi orqali import. Boshlang‘ich qoldiq keyingi xarid sifatida qayta yozilmaydi.

WH-05 Kirim: xaridga bog‘lanish, qabul sanasi, kelgan va qabul qilingan miqdor, ombor, hujjat, farq sababi. Xarid hujjatini yaratish hali jismoniy kirim degani emas. WH-06 Transfer: manba ombor, brigadir, obyekt/zona, material qatorlari, miqdor, sana va izoh. Jo‘natuvchi va qabul qiluvchi tasdiqlari ajratilsin.

Transferning taklif etilgan modeli: Qoralama → Qabul kutilmoqda → Qabul qilindi yoki Rad etildi. Jo‘natilganda rezerv oshadi, mavjud miqdor kamayadi; balans brigadir qabul qilganida kamayadi, rezerv bo‘shaydi. Bu M1dagi “qabul qilganda balans o‘zgaradi” qoidasini saqlaydi. Qisman qabul bo‘lsa qabul qilingan va qaytariladigan miqdorlar alohida; bu mexanizm Q05da yakunlanadi. Ikki marta qabul tugmasi balansni ikki marta kamaytirmaydi.

WH-07 Brigadir qabul oynasi: yuboruvchi, materiallar, yuborilgan/qabul qilingan miqdor, farq sababi, foto yoki izoh, Qabul qilish/Rad etish. WH-08 Sarf yoki hisobdan chiqarish: obyekt/zona, ish turi, material, miqdor, sana, sabab. Brigadirga topshirish bilan sarflash alohida operatsiya sifatida ko‘rinadi; to‘g‘ridan-to‘g‘ri sarf alternativasi Q05da belgilanadi.

WH-09 Inventarizatsiya: ombor va sana, hisobdagi qoldiq, sanalgan qoldiq, farq, sabab, qoralama va tasdiqlash. Tasdiqlashdan oldin balans o‘zgarmaydi. Sanash vaqtida boshqa operatsiya o‘tsa “Balans o‘zgardi” konflikti va qayta tekshirish chiziladi. WH-10 Harakat tarixi: hujjat, vaqt, material, miqdor, jo‘natuvchi/qabul qiluvchi, status va manba.

Minimum ogohlantirishi dashboard va Telegramga bog‘lanadi. Bir xil past qoldiq hodisasi uchun takror xabarlarni cheklash, normal holatga qaytish va qayta minimumga tushish ssenariysi izohlansin. Telegram ulanmagan bo‘lsa in-app ogohlantirish saqlanadi.

## 11. Yetkazib beruvchi xarid va toʻlov

SUP-01 Yetkazib beruvchilar: nom, kontakt, telefon, manzil, dastlabki balans va balans yo‘nalishi. SUP-02 Detal: xaridlar, to‘lovlar, hujjatlar va davr balansi. “Bizning qarzimiz” va “Avans” alohida yoziladi. Firma katalogi material katalogidan mustaqil.

PUR-01 Xaridlar ro‘yxati va PUR-02 Yaratish: sana, obyekt, zona kerak bo‘lsa, yetkazib beruvchi, izoh, material/birlik/miqdor/narx qatorlari, yetkazish xarajati, jami. M2dagi bitta materialli “buyurtma” formasi ko‘p qatorli shakl bilan to‘ldiriladi. Obyekt kontekstidan ochilganda parent qiymatlar tayyor keladi, lekin foydalanuvchi ularni tekshira oladi.

PUR-03 Detal va qabul: buyurtma, jismoniy qabul va to‘lov uchta mustaqil holat. Qisman yetkazish, qisman to‘lov, to‘liq to‘lov, bekor qilingan xarid va ortiqcha to‘lov variantlari bo‘lsin. M2dagi “Tasdiqlash va jo‘natish” tugmasi aslida qaysi hujjatga nisbatan ishlashi yozilsin; bitta bosish bilan xarid, ombor qabul va to‘lovni yashirincha yakunlamasin.

PAY-01 To‘lovlar ro‘yxati, PAY-02 Qo‘lda kiritish: sana, yetkazib beruvchi, summa, valyuta, usul, bog‘langan xarid(lar), izoh va hujjat. PAY-03 Avtomatik kelgan to‘lovni moslashtirish: tashqi ID, manba, sana, kontragent, summa, mos xarid va tasdiq. Bir tashqi operatsiyani takror yuklash dublikatni ko‘rsatadi. Mos kelmagan summa, kontragent yo‘qligi va bir to‘lovni bir nechta xaridga ajratish holati berilsin.

M1da bank, Didox yoki iHamkor manbalaridan biri nazarda tutilgan. Uchalasini birdan ishlab chiqish majburiy deb yozmang. Integratsiya formasi tanlangan provayderga moslashadi; umumiy status va xato patternlari qayta ishlatiladi. Mijozning material to‘lovi bilan platformaning obuna invoysi alohida modul va raqamlashga ega bo‘ladi.

## 12. Xarajatlar budjet va hisoblash qoidalari

FIN-01 Qo‘shimcha xarajatlar ro‘yxati; FIN-02 Yaratish: sana, obyekt/zona, kategoriya, nom, summa, valyuta, mas’ul, izoh va hujjat. Kran, nasos, ijara, subpudrat va xomashyodan tashqari ishlar kiritiladi. M1dagi oylik xarajatini qo‘lda kategoriya sifatida yuritish mumkin; xodimlar ish haqini avtomatik hisoblaydigan payroll moduli M3 D-01 bilan kelishilmaguncha qo‘shilmaydi.

FIN-03 Obyekt budjeti: oylik plan/fakt tushumlar, plan/fakt xarajatlar, davr boshidagi pul qoldig‘i, davr oxiridagi qoldiq, profitsit/defitsit. UySot plan/fakt tushumi yonida manba va oxirgi yangilanish ko‘rsatiladi. Xarajatlarning smeta bilan bog‘lanishi, davr, solishtirish va detalga o‘tish mavjud bo‘lsin. Qo‘lda kiritilgan boshlang‘ich yig‘ma xarajat uchun sana chegarasi ko‘rsatiladi; oldingi operatsiyalar bilan ikki marta qo‘shilmaydi.

### 12.1. Interfeysda ko‘rsatiladigan formulalar

| Ko‘rsatkich | Qoida |
|---|---|
| Smeta qatori | Miqdor × birlik narxi; jami barcha qatorlar yig‘indisi |
| Smeta farqi | Fakt sarf − reja; musbat farq oshishni bildiradi |
| Farq foizi | (Fakt − reja) / reja × 100; reja 0 bo‘lsa foiz hisoblanmaydi |
| Mavjud material | Balans − rezerv; qabul qilingan transferdan keyin balans va rezerv mos yangilanadi |
| Yetkazib beruvchiga qarz | Boshlang‘ich qarz + hisobga olingan xarid − to‘lov − qaytarish/tuzatish |
| Oylik sof pul oqimi | Oylik tushum − oylik to‘lov; bu tannarx yoki foyda deb nomlanmaydi |
| Davr oxiri pul qoldig‘i | Davr boshi qoldiq + tushum − to‘lov |
| Xarajat tannarxi | Kelishilgan material sarfi qiymati + qo‘shimcha xarajat; yetkazish xarajati bir marta qo‘shiladi |
| Ish progressi | Kelishilgan ish hajmi/og‘irligi asosida; sarflangan pul ulushi bilan almashtirilmaydi |

Bu formulalar dizaynning ko‘rsatish va solishtirish talabi. Material baholash usuli, QQS, kurs farqi, yaxlitlash va xaridning balansga o‘tish momenti Q04-Q06da aniqlanadi. To‘lovning o‘zi xarajatni ikkinchi marta yaratmasin. Ombordagi sarflanmagan material avtomatik qurilish tannarxi bo‘lib chiqmasin.

Nazorat demo to‘plami: reja 100 dona × 10 000 UZS = 1 000 000 UZS; fakt 120 dona × 10 000 = 1 200 000 UZS; oshish 200 000 UZS va 20%. Boshlang‘ich qarz 0, xarid 1 200 000, to‘lov 700 000 bo‘lsa qarz 500 000 UZS. Zaxira 200, rezerv 30 bo‘lsa mavjud 170; 30 qabul qilingach balans 170, rezerv 0. Bu qiymatlar dashboard, detal va jadvalda o‘zaro mos kelishi shart.

## 13. Vazifalar va hisobotlar

TASK-01 Kanban: Kutilmoqda, Jarayonda, Tekshiruvda, Yakunlandi. Kartada nom, obyekt/zona, ijrochi, muddat, prioritet, izoh/foto/fayl soni; kechikish matn va ikonka bilan. TASK-02 Yaratish: nom, tavsif, obyekt/zona, ijrochi, dedlayn, prioritet va biriktirmalar. Xodimning “lavozimga tayinlangan sanasi” vazifa dedlayni o‘rnida ishlatilmasin; takror “Holati” maydonlari olib tashlansin.

TASK-03 Detal: ma’lumotlar, izohlar, fayllar, tarix va qabul qilish. Ijrochi ishni Tekshiruvdaga o‘tkazadi; vakolatli tekshiruvchi Yakunlandi yoki izoh bilan Jarayondaga qaytaradi. O‘z vazifasini o‘zi tasdiqlash siyosati Q02da belgilanadi. TASK-04 Drag/drop: sudralayotgan karta, maqsad ustun, ruxsatsiz drop, server xatosida qaytarish. Klaviatura va menyu orqali status almashtirish muqobili mavjud.

Qidiruv, obyekt, ijrochi, muddat, prioritet va holat filtrlari ishlaydi. Bo‘sh ustun, bo‘sh board va filtrda natija yo‘q holatlari ajratiladi. Ustun ichki scroll bilan 50+ kartani ko‘tara oladi; kartalar bosqichma-bosqich yuklanishi ko‘rsatiladi. Gantt/timeline Paket Cda alohida; Kanbanni ishlatish uchun majburiy shart emas.

REP-01 Hisobotlar ro‘yxati: ID, sana/davr, turi, obyekt, mas’ul, foto soni, holat, amallar. Kunlik/haftalik turi neytral badge, status semantik badge bilan. Sana, obyekt, muallif va holat filtrlari, pagination va detalga kirish bo‘lsin.

REP-02 Kunlik yaratish: sana, obyekt/zona, brigadir, bajarilgan ish nomi/birligi/hajmi, foto va izoh. Shu kunda ombordan olingan materiallar avtomatik bog‘lanishi mumkin, lekin “Olingan” va “Ishlatilgan” ajratiladi. Olingan qatorga manba transfer havolasi qo‘yilsin. Sarf miqdori kiritilsa zaxira va tegishli joy bilan tekshiriladi.

REP-03 Kunlik detal: mavjud jadval va foto bo‘limi saqlanadi; thumbnail → to‘liq ko‘rish → oldingi/keyingi rasm, fayl yuklanish xatosi, o‘chirish tasdig‘i, qayta yuklash holatlari qo‘shiladi. Foto yo‘q bo‘lsa rasm soni 0 deb ko‘rsatiladi; yuborish uchun foto majburiyligi Q08da belgilanadi.

REP-04 Haftalik yaratish: hafta davri, obyekt, prorab, ishlar xulosasi, reja bajarilishi, muddat holati, kutilmagan vaziyat, xavf va yangilangan bitish prognozi. REP-05 Detal: dastlabki reja, avvalgi prognoz, yangi prognoz, kun farqi, sabab va tasdiqlovchi. Yangi prognoz boshlang‘ich rejani ustiga yozmaydi. Hisobotga asoslangan prognoz M1 talabi; uning avtomatik algoritmi kelishilmaguncha “AI hisoblagan” yorlig‘i qo‘llanmaydi.

REP-06 Tasdiqlash: Qoralama → Yuborildi → Tasdiqlangan yoki Qaytarilgan. Qaytarish sababi majburiy; tasdiqlangan hisobot keyin o‘zgarsa tarix/versiya saqlanadi. Kunlikni prorab, haftalikni mijoz tasdiqlashi taklif etiladi. “Yakunlandi” hisobotni tasdiqlash statusi sifatida ishlatilmaydi.

## 14. Xodimlar profil va bildirishnomalar

EMP-01 Ro‘yxat: FIO, telefon, lavozim, tizim roli, obyektlar, holat, amallar. Qidiruv matni “Xodim ismi yoki telefonini kiriting”. Filtrdagi Faol tanlovi Arxiv qatorlarini chiqarmaydi. KPIlar faqat bir-birini takrorlamaydigan aniq statuslardan hisoblansin; ta’til belgisi faol/noj faol hisobiga qo‘shilib ikki marta sanalmasin.

EMP-02 Taklif/yangi xodim: FIO, telefon, lavozim, rol, obyektlar va taklif yuborish. EMP-03 Detal: biriktirmalar, topshiriqlar, taklif holati va tarix. EMP-04 Ruxsat berish: rol va obyekt doirasi, o‘zgarish oqibati. EMP-05 Deaktivatsiya/arxiv: ochiq vazifalarni qayta biriktirish, kirishni to‘xtatish, tasdiq. Parolni tiklash xodim parolini ko‘rsatish orqali bajarilmaydi.

PRO-01 Profil: rasm, ism, familiya, telefonni tasdiqlab almashtirish, shaxsiy til, bildirishnomalar. Lavozim, rol va obyekt biriktirmalari oddiy foydalanuvchi uchun faqat ko‘rish. PRO-02 Parolni almashtirish: amaldagi, yangi, takroriy parol; muvaffaqiyat va noto‘g‘ri amaldagi parol holati. Chiqish foydalanuvchi menyusida joylashadi.

NOT-01 Bildirishnomalar paneli va NOT-02 Sozlamalar: o‘qilgan/o‘qilmagan, hammasini o‘qildi qilish, vaqt, obyekt, hodisa, manba sahifaga o‘tish. Yangi eksportdagi panel saqlanadi; takror matnlar o‘rniga turli hodisalar beriladi. Qabul kutilayotgan transfer, minimal qoldiq, vazifa dedlayni, smeta qarori, qaytarilgan hisobot, to‘lov xatosi va obuna holati uchun namuna bo‘lsin.

Hodisa × rol × kanal jadvali topshirilsin. Minimal qoldiq: ombor mudiri, prorab va mijozga; transfer: jo‘natuvchi va qabul qiluvchiga; vazifa: ijrochi va tayinlovchiga; smeta: muallif va tasdiqlovchiga. Faqat ruxsatli obyekt ma’lumoti yuboriladi. M1dagi Telegram majburiy; M2dagi email/SMS imkoniyatlari provayder kelishuviga bog‘liq. Ulanmagan kanal tugmasi sabab va ulash havolasini ko‘rsatadi.

## 15. SaaS konsoli va integratsiyalar

SAAS-01 Analitika: obunachilar va tushum tendensiyasi, davr filtri, faol/qarzdor obunalar; tushumning invoys summasidan farqi aniq. SAAS-02 Obunachilar ro‘yxati: tashkilot, aloqa, tarif, holat, amal qilish muddati, qarz. SAAS-03 Obunachi detali: obuna, invoyslar, to‘lovlar, yordam tarixi; qurilish ichki ma’lumotlari standartda ko‘rinmaydi.

SAAS-04 Obuna/tarif: nom, davr, summa, amaldagi shartlar. Tarif limitlari manbalarda belgilanmagan; obyektlar soniga ixtiyoriy cheklov o‘ylab topmang, M1 istalgan miqdordagi obyekt va zonani nazarda tutadi. SAAS-05 Invoys: raqam, tashkilot, davr, summa, status, to‘lov usuli; Qoralama, Yuborilgan, Qisman to‘langan, To‘langan, Muddati o‘tgan, Bekor qilingan variantlari taklif etiladi. SAAS-06 To‘lov: naqdni qayd qilish yoki tizim orqali to‘lash, kutilmoqda/muvaffaqiyat/xato va qayta tekshirish.

CAT-01 Markaziy katalog: kategoriya, podkategoriya, material nomi va o‘lchov birligi. CAT-02 Element yaratish/tahrirlash, bir xil nomlar, arxivlangan material va mavjud operatsiyalarda ishlatilayotgan birlikni almashtirish cheklovi. Barcha tenantlar katalogdan foydalanadi; mijozning narxi, ombor qoldig‘i va yetkazib beruvchisi boshqa tenantga chiqmaydi. Mijozning lokal element qo‘shish siyosati Q09da kelishiladi.

INT-01 Integratsiyalar markazi: Telegram, UySot, tanlangan bank/Didox/iHamkor manbasi va Kamera. Har kartada Ulanmagan, Ulanmoqda, Ulangan, Xato, Vakolat muddati tugagan holatlari; oxirgi muvaffaqiyatli sinxronizatsiya va qayta urinish. INT-02 Ulash va sozlash: provayderga mos maydonlar, niqoblangan kalitlar, tekshirish, uzish tasdig‘i. Kalitni prototipda haqiqiy qiymat bilan ko‘rsatmang.

INT-03 Sinxronizatsiya jurnali: vaqt, manba, natija, import qilingan/takror/xato yozuvlar, tegishli obyekt va tuzatish. Ulanish xatosi 0 tushum yoki 0 to‘lov sifatida ko‘rsatilmaydi; “Ma’lumot yangilanmadi” va oxirgi ishonchli sana chiqadi. Integratsiyani uzish tarixiy hujjatlarni o‘chirmaydi.

CAM-01 Transport tarixi: obyekt/kamera/sana/yo‘nalish filtri, kirish yoki chiqish, vaqt, transport identifikatori, kadr va bog‘langan hujjat. CAM-02 Hodisa detali: kadr, topilgan ma’lumot, xarid/ijara/xizmat yozuviga biriktirish. CAM-03 Aniqlanmagan yoki noto‘g‘ri transport: qo‘lda tekshirish, tuzatish sababi, takror hodisa. Kamera orqali yuzni tanish yoki xodim davomatini kuzatish qo‘shilmaydi; M1 transport hodisalariga qaratilgan. Aniqlash texnologiyasi va saqlash muddati Q10da kelishiladi.

## 16. Holatlar lokalizatsiya va formatlar

Har asosiy ro‘yxatga Filled, Empty, No results, Loading, Error va Permission denied variantlari berilsin. Har detail/formada Loading, Validation error, Saving, Success, Server error va Unsaved changes holatlari mavjud. Tarmoq uzilganda foydalanuvchi kiritgan matn yo‘qolmasin; saqlanmagan holat aniq ko‘rsatiladi. To‘liq offline mahsulot va’dasi berilmaydi.

Har DataTable’da sarlavha, sort yo‘nalishi, hover, tanlangan qator zarur bo‘lsa, amallar, sahifa va qatorlar soni bo‘ladi. Gorizontal scroll bo‘lsa ID/nom yoki muhim kontekst ustuni saqlanadi. Barcha ma’lumot hali yuklanmagan bo‘lsa ekrandagi qatorlar yig‘indisi umumiy jami deb ko‘rsatilmaydi. Arxivlash va o‘chirish dialogi aniq entitet nomini aytadi.

| Maʼlumot | Yagona qoida |
|---|---|
| Qisqa sana | 10.09.2026; input namunasi KK.OO.YYYY |
| Uzun sana | 10-sentabr, 2026; kun nomi sana bilan hisoblanadi |
| Sana va vaqt | 10.09.2026 14:30; tashkilot vaqt zonasi ko‘rinadi |
| Vaqt zonasi | Tashkilot sozlamasi; ushbu demo Asia/Tashkent |
| Pul | 1 256 244 000 UZS; jadvalda aniq summa, KPIda mln/mlrd va tooltipda to‘liq qiymat |
| Kasr va miqdor | 2,4 tonna; miqdor va birlik alohida ustunlarda; demo uchun 3 kasrgacha taklif |
| USD ekvivalenti | Asl summa + ikkilamchi ekvivalent, kurs, kurs sanasi va manbasi |
| Telefon | +998 90 123 45 67; bazaviy kiritish maskasi bir xil |
| Birlik | dona, kg, tonna, m, m², m³, litr; materialga mos birlik |
| Brend va menyu | BARPO AI; Xodimlar; Yetkazib beruvchilar; Buxgalter; Smeta; Xarajat |

UZ/RU barcha ishlatiladigan ekran va microcopy uchun beriladi. Login va headerda tanlanadi; shaxsiy til tashkilotning standart tilidan alohida saqlanadi. Ruscha uzun sarlavha va tugmalar 1280 pxda tekshirilsin. O‘zbek apostroflari yagona uslubda, kirill gliflari to‘liq bo‘lsin. M3dagi “Hodimlar” yozuvi imlo jihatdan “Xodimlar”ga tuzatiladi.

### 16.1. Namunaviy microcopy

| Holat | UZ | RU |
|---|---|---|
| Obyekt yo‘q | Hali obyekt qo‘shilmagan. Birinchi obyektni yarating. | Объектов пока нет. Создайте первый объект. |
| Natija yo‘q | Bu filtrlar bo‘yicha natija topilmadi. Filtrlarni tozalang. | По этим фильтрам ничего не найдено. Сбросьте фильтры. |
| Saqlash xatosi | O‘zgarishlar saqlanmadi. Qayta urinib ko‘ring. | Изменения не сохранены. Попробуйте ещё раз. |
| Ruxsat yo‘q | Bu amal uchun ruxsatingiz yo‘q. Tashkilot rahbariga murojaat qiling. | У вас нет доступа к этому действию. Обратитесь к руководителю организации. |
| Import qatori | 12-qator: miqdor son bo‘lishi kerak. | Строка 12: количество должно быть числом. |
| Qoldiq yetmaydi | Mavjud: 170 dona. Miqdorni kamaytiring. | Доступно: 170 шт. Уменьшите количество. |
| Saqlanmagan forma | Saqlanmagan o‘zgarishlar bor. Chiqilsinmi? | Есть несохранённые изменения. Выйти? |
| Bog‘liq yozuv | Bu yozuv operatsiyalarda ishlatilgan. Uni arxivlashingiz mumkin. | Эта запись используется в операциях. Вы можете её архивировать. |

Bu jadval boshlang‘ich namuna. Dizayner barcha forma va holatlar uchun to‘liq UZ/RU matnlar registrini topshiradi. USD va RU talabi M3da qayd etilgan, M1da batafsillashtirilmagan; UI doirasida saqlanadi, kurs siyosati Q06da yakunlanadi.

## 17. Bosiladigan prototip va qabul mezonlari

| Ssenariy | Kutiladigan yo‘l va natija |
|---|---|
| P01 | Ro‘yxat → OTP → kompaniya → birinchi obyekt; noto‘g‘ri koddan tuzalish ham ishlaydi |
| P02 | Xodim taklifi → birinchi kirish → rolga mos menyu; boshqa tenant havolasi 403 |
| P03 | Obyekt → blok/zona → smeta → import mapping → xato qator → tuzatish → qoralama natija |
| P04 | Smeta yuborish → vakolatli tasdiqlovchi → rad etish sababi → qayta yuborish → tasdiqlash tarixi |
| P05 | Xarid → qisman kirim → qoldiq → brigadirga transfer → qabul; balans bir marta yangilanadi |
| P06 | Qoldiq yetishmaydi → miqdorni tuzatish → transfer; rad etilgan transfer rezervi bo‘shaydi |
| P07 | Inventarizatsiya → sanalgan qoldiq → farq sababi → tasdiqlash; balans faqat yakunda o‘zgaradi |
| P08 | Kunlik hisobot → foto → material manbasi → prorab qaytarishi → tuzatish → tasdiqlash |
| P09 | Haftalik hisobot → xavf → yangi prognoz → mijoz tasdiqlashi; dastlabki reja saqlanadi |
| P10 | To‘lov importi → dublikat yoki moslash xatosi → tuzatish → qarz va budjetda mos natija |
| P11 | Vazifa → bajarish → tekshiruv → yakun; ruxsatsiz drag qaytariladi |
| P12 | SaaS invoys → to‘lov holati; kamera hodisasi → tegishli xaridga biriktirish |

Qabul shartlari: barcha M1 modullari xaritada bor; 9 rolning ish muhiti va ruxsatlari ko‘rsatilgan; M2dagi har bir mazmunli ekran/modalning mosligi bor; 122 defektning har biriga Figma freymi yoki asosli qaror bog‘langan. Hech bir defekt faqat tavsiya yozilgani uchun “yopildi” bo‘lmaydi.

Vizual tekshiruv: 1440 va 1280 px; UZ va RU; uzun nom, katta summa, 0 va 100% progress, 100+ obyekt va 50+ kanban kartasi, jadval paginationi, rasm yo‘qligi. Progress uzunligi ko‘rsatilgan foizga mos. Barcha asosiy CTA, modal, qaytish, cancel va prototipdagi menyular manzilga ega. Disabled amal sababi ko‘rinadi.

Hisob tekshiruvi: 12 1 bo‘limdagi dataset natijalari barcha sahifada mos; smeta kategoriyalari jami umumiy summaga teng; qisman qabul/to‘lov qarz va zaxiraga to‘g‘ri ta’sir qiladi; transfer bilan sarf ikki marta sanalmaydi. Moliyaviy vakolati bo‘lmagan rolga narx chiqmaydi. Sinxronizatsiya xatosi nol qiymat bilan almashtirilmaydi.

Topshiriladigan natija: tahrirlanadigan Figma fayli, 9 rol prototipi, komponent va token kutubxonasi, 1440/1280 freymlar, UZ/RU matn registri, maydonlar lug‘ati, rol × modul × amal matritsasi, biznes holatlari va formulalar izohi, defekt bog‘lanishlari, SVG logotip/ikonlar va zarur rasmlar. Handoffda har forma maydonining majburiyligi, tipi, chegarasi, xatosi, manbasi va ruxsati ko‘rsatiladi.

## 18. Ish tartibi va yakunlashtiriladigan qarorlar

Ish ketma-ketligi: referens inventari va eskidan yangiga moslik → brend/format/komponentlar → auth va ruxsatlar → obyekt va smeta → import va ombor → xarid/to‘lov/budjet → vazifa/hisobot → SaaS va integratsiyalar → rollar, RU/1280, prototip va defektlarni qayta tekshirish. Har modul tugaganda asosiy holat va xato holati birga ko‘rsatiladi.

| ID | Yakunlashtiriladigan masala | Ishchi taklif va qaror egasi |
|---|---|---|
| Q01 | M1 va M3dagi reliz navbati farqi | M1 modullari dizaynda saqlanadi; mahsulot rahbari relizni belgilaydi |
| Q02 | Tasdiqlovchilar, menejer vakolati, o‘z ishini tasdiqlash | 5-bo‘lim matritsasi; mijoz va mahsulot rahbari tasdiqlaydi |
| Q03 | Zona, blok, kirish, qavat va xonadon ierarxiyasi | 6-bo‘limdagi moslashuvchan model; xonadon savdosi qo‘shilmaydi |
| Q04 | Smeta ish/texnika qatori, payroll chegarasi, tannarx | Ish/texnika ko‘rinishi shartli; payroll alohida; finansist tasdiqlaydi |
| Q05 | Transfer, rezerv, qisman qabul, qaytarish, sarf | 10-bo‘lim modeli; ombor mas’uli va backend bilan yakunlanadi |
| Q06 | USD kursi, QQS, yaxlitlash va baholash usuli | Asl valyuta va kurs snapshoti saqlanadi; finansist va backend belgilaydi |
| Q07 | Texnik yordam kirishi va audit doirasi | Standartda tenant mazmuniga kirish yo‘q; platforma egasi belgilaydi |
| Q08 | OTP, parol, fayl chegarasi, qisman import, foto majburiyligi | TZdagi takliflar; mahsulot rahbari va backend bilan yakunlanadi |
| Q09 | Markaziy katalog va lokal material yaratish | Umumiy katalog o‘qiladi; lokal taklif/pending oqimi mumkin |
| Q10 | UySot, to‘lov provayderi va kamera imkoniyati | Bitta kelishilgan moliyaviy manba; API maydonlari va saqlash muddati aniqlanadi |
| Q11 | White-label, individual rollar, Gantt, 2FA va AI | Alohida kelishuvsiz asosiy relizga qo‘shilmaydi |

Qarorlar Readme va tegishli freym annotatsiyasida ID, tanlangan yechim, mas’ul va sana bilan qayd etiladi. Dizayner ochiq qarorni yashirin taxmin bilan almashtirmaydi; ta’sir qilmaydigan sahifalarda ishni davom ettiradi. Topshirishda 24 blokerning har biri tekshirilgan yechimga yoki buyurtmachi tasdiqlagan o‘zgarish qaroriga ega bo‘lishi shart.

## 19. Defektlar bilan bogʻlanish registri

Quyidagi registr M3dagi barcha 122 IDni saqlaydi: 24 bloker, 40 yuqori, 42 o‘rta va 16 past. “Tekshiruv talabi” ustuni yangi dizaynni qabul qilish vazifasidir; eski defektning hozir ham ochiq yoki yopiq ekanini oldindan da’vo qilmaydi. Qayta tekshiruvda har satrga Figma freymi, tekshirgan shaxs, sana va natija qo‘shilsin. Tavsiya manbada texnik imkoniyat yoki tijoriy scopega bog‘liq bo‘lsa, ushbu TZdagi Q qarori ustuvor.

### Umumiy

| ID | Daraja | TZ bo‘limi | Tekshiruv talabi |
|---|---|---|---|
| G-01 | Bloker | 4, 5, 6, 16 | Bitta nomni tanlab, barcha freym, subtitr, logotip va microcopy'da almashtirish. Dasturchiga yagona nom va logotip fayli berilishi kerak. |
| G-02 | Bloker | 4, 5, 6, 16 | Sidebar'ni yagona Figma Component'ga aylantirish va barcha ekranga shu instansiyani qo'yish. Menyu tarkibi bitta manbadan boshqarilishi kerak. |
| G-03 | Bloker | 4, 5, 6, 16 | Yagona format qoidasi yozish: qisqa (KK.OO.YYYY), uzun (24-iyun, 2024) va nisbiy ("2 kun oldin") - qaysi biri qayerda ishlatilishini belgilash. |
| G-04 | Bloker | 4, 5, 6, 16 | Yagona qoida: mingliklar probel bilan (1 256 244 000), valyuta belgisi qayerda turishi, qachon qisqartma (mln/mlrd) ishlatilishi hujjatlashtirilsin. |
| G-05 | Bloker | 4, 5, 6, 16 | UZS va USD ko‘rinishi, kurs sanasi va manbasi. Kurs siyosati Q06. |
| G-06 | Bloker | 4, 5, 6, 16 | Har asosiy ekran uchun 4 ta holat qo'shish: bo'sh, yuklanmoqda, xato, to'liq. Tugma va inputlar uchun hover/focus/disabled/loading variantlari. |
| G-07 | Bloker | 4, 5, 6, 16 | 9 rol uchun alohida muhit; modul va amal ruxsatlari 5-bo‘limda. |
| G-08 | Bloker | 4, 5, 6, 16 | Header'ga til almashtirgich qo'shish, login ekranida ham ko'rsatish, har foydalanuvchi uchun alohida til saqlanishini belgilash. |
| G-09 | Yuqori | 4, 5, 6, 16 | Har ekranni uzun ruscha matn bilan tekshirish; Auto Layout qoidalari 4-bo‘limda. |
| G-10 | Yuqori | 4, 5, 6, 16 | Brenddan kelib chiqadigan diagramma palitrasi yaratish (5-6 rang), rang tokenlari sifatida nomlash. |
| G-11 | Yuqori | 4, 5, 6, 16 | Status va prioritet uchun ikki alohida vizual tizim: status - rangli badge, prioritet - neytral, faqat "Yuqori" aksentli. |
| G-12 | Yuqori | 4, 5, 6, 16 | Mavjud UZ va qo‘ng‘iroqni barcha shellarda birlashtirish. Global qidiruv Paket C. |
| G-13 | Yuqori | 4, 5, 6, 16 | Yagona jadval komponenti yaratish: sarlavha, saralash, qator hover, qator amallari menyusi, pagination, qatorlar soni tanlash. |
| G-14 | O‘rta | 4, 5, 6, 16 | Bitta KPI komponenti, variantlari bilan (tavsifli / tavsifsiz / trend bilan). |
| G-15 | O‘rta | 4, 5, 6, 16 | Obyekt, zona va smeta uchun navigatsiya zanjiri; blokdagi mavjud yo‘lni to‘ldirish. |
| G-16 | O‘rta | 4, 5, 6, 16 | 1440 pxda 260 px sidebar; 1280 pxda 72 px yig‘ilgan variant taklifi. |
| G-17 | O‘rta | 4, 5, 6, 16 | Barcha matnni to'g'ri belgilarga o'tkazish va tanlangan shrift bu glif'larni qo'llab-quvvatlashini tekshirish. |
| G-18 | O‘rta | 4, 5, 6, 16 | Bitta qoida: primary CTA har doim toolbar'ning o'ng chetida. |
| G-19 | O‘rta | 4, 5, 6, 16 | Bosh muhandis lavozim bo‘lishi mumkin; tizim roli 9 rol ro‘yxatidan tanlanadi. |
| G-20 | Past | 4, 5, 6, 16 | Asl shrift aniqlansin; raqamlar tabular figures bilan izchil ko‘rsatilsin. |

### Kirish va Ro'yxat

| ID | Daraja | TZ bo‘limi | Tekshiruv talabi |
|---|---|---|---|
| L-01 | Bloker | 7 | OTP ekranini qo'shish: kod kiritish, qayta yuborish taymeri, noto'g'ri kod holati. |
| L-02 | Bloker | 7 | 3 ekran qo'shish: telefon so'rovi > kod tasdiqlash > yangi parol. |
| L-03 | Bloker | 7 | Ro'yxatdan keyin kompaniya ma'lumotlari ekrani: nom, STIR, manzil, faoliyat turi. |
| L-04 | Yuqori | 7 | Taklif havolasi/SMS orqali birinchi kirish va parol o'rnatish ekranlarini chizish. |
| L-05 | Yuqori | 7 | Har input uchun placeholder, maska va helper text belgilash. |
| L-06 | Yuqori | 7 | Input'ning xato varianti (qizil chegara + xato matni) va server xatosi banneri chizilsin. |
| L-07 | O‘rta | 7 | "Akkountingiz bormi? Kirish" ko'rinishidagi standart pattern'ga o'tkazish. |
| L-08 | O‘rta | 7 | Ikkalasini bitta karta komponentidan yasash, padding qiymatlarini tenglashtirish. |
| L-09 | O‘rta | 7 | Ro'yxatdan o'tish formasiga checkbox va havolalar qo'shish. |
| L-10 | Past | 7 | Parol talablari ro'yxati va kuch indikatori qo'shish. |
| L-11 | Past | 7 | Sana-kun juftligini to'g'rilash. Dasturchiga bu jonli soatmi yoki statik rasmmi - aniq yozib berish. |

### Dashboard

| ID | Daraja | TZ bo‘limi | Tekshiruv talabi |
|---|---|---|---|
| D-01 | Bloker | 8, 12 | Qo‘lda ish haqi xarajati va avtomatik payroll ajratilsin. Q04. |
| D-02 | Yuqori | 8, 12 | Ikkala diagrammani yagona palitraga keltirish. |
| D-03 | Yuqori | 8, 12 | G-04 qoidasiga muvofiq birlashtirish. |
| D-04 | O‘rta | 8, 12 | Auto Layout bilan kartalarni kontentga moslashtirish yoki diagrammani kartaga to'ldirish. |
| D-05 | O‘rta | 8, 12 | Gridline qo'shish, legenda kontrastini oshirish, o'q qiymatlari formatini belgilash. |
| D-06 | O‘rta | 8, 12 | Ma'lumot ierarxiyasini qayta ko'rib chiqish yoki kartani boshqa kesimga o'zgartirish. |
| D-07 | O‘rta | 8, 12 | Har KPI uchun qaysi ekranga va qanday filtr bilan o'tishini yozib qo'yish. |
| D-08 | O‘rta | 8, 12 | Progress bar komponentini foizga bog'lash. |
| D-09 | Past | 8, 12 | Noto‘g‘ri jumla o‘rniga mazmunga mos sarlavha: Materiallar bo‘yicha xarajatlar. |
| D-10 | Past | 8, 12 | Ish haqqi → Ish haqi; harjatlar → xarajatlar. |

### Obyektlar

| ID | Daraja | TZ bo‘limi | Tekshiruv talabi |
|---|---|---|---|
| O-01 | Yuqori | 8 | Smetadan oshgan xarajat uchun summa va foiz ogohlantirishi; pul defitsitidan ajratish. |
| O-02 | Yuqori | 8 | Obyektning yakun holati barcha filtr va kartalarda Yakunlandi deb yoziladi. |
| O-03 | Yuqori | 8 | Karta hover holati va amallar menyusini qo'shish. |
| O-04 | Yuqori | 8 | Mavjud blok va qavat sahifalarini zona modeli, budjet va sarf bilan bog‘lash. |
| O-05 | Yuqori | 8 | Karta va jadval ro‘yxatida bir xil pagination qoidasi qo‘llanadi. |
| O-06 | O‘rta | 8 | Komponentni foizga bog'lash. |
| O-07 | O‘rta | 8 | Standart placeholder (ikonka + brend fon) chizish. |
| O-08 | O‘rta | 8 | Karta / jadval ko'rinishi almashtirgichini qo'shish. |
| O-09 | O‘rta | 8 | Statusga qo‘shimcha mas’ul, sana va budjet holati filtrlari. |
| O-10 | Past | 8 | Real ma'lumotga yaqin turli qiymatlar bilan to'ldirish - uzun nom va katta summa qanday sig'ishini ko'rish uchun. |

### Smetalar

| ID | Daraja | TZ bo‘limi | Tekshiruv talabi |
|---|---|---|---|
| S-01 | Bloker | 9 | Yagona jadval komponentiga o'tkazish: № / Nomi / Obyekt / Blok / Summa / Holat / Sana / Amallar. |
| S-02 | Bloker | 9 | Mavjud upload oynasiga mapping, preview, xato tuzatish va yakuniy natija qo‘shish. |
| S-03 | Bloker | 9 | G-02 bilan birga hal qilinsin. |
| S-04 | Yuqori | 9 | Matn rangini kamida #595959 darajasiga qorong'ilashtirish. |
| S-05 | Yuqori | 9 | G-04 qoidasiga keltirish. |
| S-06 | Yuqori | 9 | Tasdiqlash/rad etish modallari va status tarixi (timeline) ekranini qo'shish. |
| S-07 | Yuqori | 9 | Qator hover holati va amallar ustunini qo'shish. |
| S-08 | O‘rta | 9 | Matndagi plyusni olib tashlash. |
| S-09 | O‘rta | 9 | Kartalarni bosiladigan filtrga aylantirish yoki alohida filtr paneli qo'shish. |
| S-10 | O‘rta | 9 | Pagination qo'shish. |

### Vazifalar

| ID | Daraja | TZ bo‘limi | Tekshiruv talabi |
|---|---|---|---|
| V-01 | Yuqori | 13 | Uch holatni chizish: drag, drop target, rad etilgan drop. |
| V-02 | Yuqori | 13 | Bo'sh ustun holati (matn + "Vazifa qo'shish" havolasi) chizish. |
| V-03 | Yuqori | 13 | G-11 ga muvofiq ikki alohida vizual tizim. |
| V-04 | Yuqori | 13 | Karta komponentini kengaytirish: rasm soni, izoh soni, muddat holati. |
| V-05 | Yuqori | 13 | Filtrlarni obyekt / ijrochi / muddat / prioritet bo'yicha qayta tuzish. |
| V-06 | Yuqori | 13 | Gantt yoki timeline Paket C; alohida kelishuvsiz MVP majburiyati emas. |
| V-07 | O‘rta | 13 | Swimlane yoki obyekt bo'yicha majburiy filtr qo'shish. |
| V-08 | O‘rta | 13 | Bitta sana tanlash komponentiga birlashtirish. Format ham KK.OO.YYYY bo'lsin. |
| V-09 | O‘rta | 13 | Yil ko'rsatish yoki nisbiy sana qoidasini belgilash. |
| V-10 | O‘rta | 13 | Ustun ichida aylantirish va yuklash chegarasini belgilash. |
| V-11 | Past | 13 | Ustundagi qo‘shish faqat ruxsatli boshlang‘ich holat uchun; qolganida yashirish. |
| V-12 | Past | 13 | Turli uzunlikdagi sarlavha va turli ijrochilar bilan to'ldirish. |

### Ombor va Xomashyo

| ID | Daraja | TZ bo‘limi | Tekshiruv talabi |
|---|---|---|---|
| X-01 | Bloker | 10, 11 | Asosiy zaxira jadvalini qo'shish: xomashyo / o'lchov / joriy qoldiq / minimal chegara / oxirgi harakat. |
| X-02 | Bloker | 10, 11 | Boshlang‘ich qoldiq, kirim, sarf, transfer va inventarizatsiya oqimlarini chizish. |
| X-03 | Bloker | 10, 11 | Zaxira jadvalida past qoldiq holati (qizil qator/badge) va ogohlantirish chegarasini sozlash joyi. |
| X-04 | Bloker | 10, 11 | Firma va material entitetlarini ajratish. Firmalar jadvali: firma nomi / rahbar / tel / manzil / yetkazadigan materiallar. |
| X-05 | Yuqori | 10, 11 | G-04 qoidasiga keltirish. |
| X-06 | Yuqori | 10, 11 | Ustunlarni ajratish: MIQDOR (100) va O'LCHOV (dona / kg / m3). |
| X-07 | Yuqori | 10, 11 | Matn rangini qorong'ilashtirish. |
| X-08 | Yuqori | 10, 11 | G-13 yagona jadval komponentini qo'llash. |
| X-09 | O‘rta | 10, 11 | FRIMA RAHBARI yozuvini FIRMA RAHBARI yoki Mas’ul shaxsga almashtirish. |
| X-10 | O‘rta | 10, 11 | Tab'larga bo'lish: Zaxira / Buyurtmalar / Firmalar. |
| X-11 | O‘rta | 10, 11 | Biri primary, ikkinchisi secondary bo'lsin. |
| X-12 | O‘rta | 10, 11 | Har material uchun real turdagi qiymat qo'yish. |
| X-13 | O‘rta | 10, 11 | Yagona telefon formati qoidasi. |
| X-14 | Past | 10, 11 | Ko‘roq ko‘rish → Ko‘proq ko‘rish. |
| X-15 | Past | 10, 11 | Firma nomi boyicha filtr → Yetkazib beruvchi bo‘yicha filtr. |
| X-16 | Past | 10, 11 | Buyurtmalar soni uchun tur emas, ta birligi ishlatiladi. |
| X-17 | Past | 10, 11 | Demo ma'lumotni yagona davrga keltirish. |

### Hisobotlar

| ID | Daraja | TZ bo‘limi | Tekshiruv talabi |
|---|---|---|---|
| H-01 | Bloker | 13 | Mavjud foto va hisobot detallari: galereya, upload holatlari va qator indikatori. |
| H-02 | Yuqori | 13 | Tahlil bo'limini qo'shish yoki sarlavhani kontentga moslashtirish. |
| H-03 | Yuqori | 13 | Mavjud detallarni ro‘yxatga ulash; tasdiqlash, qaytarish va tarix oqimi. |
| H-04 | Yuqori | 13 | Hisobot uchun Qoralama, Yuborildi, Tasdiqlangan, Qaytarilgan; vazifa statusidan ajratish. |
| H-05 | Yuqori | 13 | G-03 qoidasiga keltirish. |
| H-06 | O‘rta | 13 | KPI kartalarini qo'shish yoki layout'ni qayta muvozanatlash. |
| H-07 | O‘rta | 13 | Pagination qo'shish. |
| H-08 | O‘rta | 13 | Tur uchun neytral (kulrang) badge uslubi. |
| H-09 | Past | 13 | Yo sarlavhani, yo qiymatdagi "#" ni olib tashlash. |

### Xodimlar

| ID | Daraja | TZ bo‘limi | Tekshiruv talabi |
|---|---|---|---|
| HD-01 | Bloker | 14 | Ikki ustun: LAVOZIM (Prorab, Buxgalter) va ROL (tizimdagi ruxsat). Rol berish modalini chizish. |
| HD-02 | Yuqori | 14 | Faol / Arxiv / Ishdan bo'shagan kabi atamalarga o'tkazish. |
| HD-03 | Yuqori | 14 | Demo ma'lumotni filtrga moslashtirish. |
| HD-04 | Yuqori | 14 | Mavjud obyektga biriktirishni barcha detallar va ruxsat filtrlari bilan tekshirish. |
| HD-05 | Yuqori | 14 | Amallar ustunini qo'shish. |
| HD-06 | O‘rta | 14 | Yangi eksportda brigadir bor; oltita mijoz roli uchun turli demo shaxslar kiritish. |
| HD-07 | O‘rta | 14 | Xodim statusiga yagona badge; ta’til alohida belgi sifatida hisoblanadi. |
| HD-08 | O‘rta | 14 | Sarlavhani "LAVOZIM" ga o'zgartirish. |
| HD-09 | O‘rta | 14 | "Xodim ismi bo'yicha qidiruv" ga o'zgartirish. |
| HD-10 | O‘rta | 14 | Pagination qo'shish. |
| HD-11 | Past | 14 | Bugalter → Buxgalter; malumotlar → ma’lumotlar. |
| HD-12 | Past | 14 | Turli uzunlikdagi ismlar bilan to'ldirish. |

### Sozlamalar

| ID | Daraja | TZ bo‘limi | Tekshiruv talabi |
|---|---|---|---|
| SZ-01 | Bloker | 14, 15, 16 | G-01 bilan birga hal qilinsin. |
| SZ-02 | Bloker | 14, 15, 16 | Valyuta tanlash, kurs manbasi va yangilanish davrini qo'shish. |
| SZ-03 | Bloker | 14, 15, 16 | Sozlamalar, SaaS va integratsiyalar 14-15 bo‘limlar asosida; 2FA Q11. |
| SZ-04 | Yuqori | 14, 15, 16 | Sozlamani real qo'llash yoki uni olib tashlash. |
| SZ-05 | Yuqori | 14, 15, 16 | Hodisa x rol x kanal matritsasini chizish. |
| SZ-06 | Yuqori | 14, 15, 16 | Profil bo'limiga shaxsiy til tanlovini qo'shish. |
| SZ-07 | O‘rta | 14, 15, 16 | Chiqishni sidebar'dagi profil blokiga ko'chirish. |
| SZ-08 | O‘rta | 14, 15, 16 | Bekor qilish, saqlanmagan o‘zgarish dialogi va saqlash natijasi toasti qo‘shish. |
| SZ-09 | O‘rta | 14, 15, 16 | Toggle kontrastini oshirish, holat matnini qo'shish. |
| SZ-10 | O‘rta | 14, 15, 16 | White-label Q11 orqali kelishiladi; standartda BARPO AI o‘zgarmaydi. |
| SZ-11 | Past | 14, 15, 16 | "Platforma sozlamalari va bildirishnomalarni boshqarish" ga o'zgartirish. |

### Registrdan foydalanish

Figma tekshiruv jadvalida har ID uchun yangi freym havolasi, Ochiq / Tekshiruvda / Yopildi / Qaror bilan o‘zgardi holati va tekshiruv sanasi yuritilsin. Yangi eksportda topilgan qo‘shimcha masalalar NEW-01 (smeta jamlari), NEW-02 (profil paroli), NEW-03 (vazifa formasidagi begona maydonlar) va NEW-04 (buyurtma, qabul va to‘lovni ajratish) sifatida kuzatilsin. Ularning yechimlari mos ravishda 9–12, 7–14, 13 va 10–11 bo‘limlarda berilgan.
