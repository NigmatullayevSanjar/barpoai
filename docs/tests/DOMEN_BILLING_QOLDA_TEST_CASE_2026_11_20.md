# BARPO AI — kompaniya domeni, sinovdagi qarz, invoys va arxiv (qo‘lda test case, 2026-11-20)

> **Qamrov:** D43 (kompaniya domeni bilan kirish, login kompaniya ichida yagona), `LOGIN_TAKEN` / `PHONE_TAKEN`, sinovdagi kompaniyalar qarzdor emas, invoys sinovdan keyin, «Arxivdan chiqarish» tugmasi.
> **Kim uchun:** platformani qo‘lda sinovchi odam (egasi yoki QA). Har qatorda nima bosish va ekranda nima chiqishi yozilgan.
> **Davomiyligi:** 1,5–2 soat. 1–4-bo‘limlar ketma-ket bajariladi, 5–8-bo‘limlar ulardan keyin istalgan tartibda.
> **Ilova:** smeta importi uchun Excel fayl `docs/tests/DOMEN_TEST_SMETA_2026_11_20.xlsx` (8-bo‘lim).
> **Qoidalar manbai:** `docs/backend/BARPO_BUSINESS_RULES.md` (oxirgi bo‘limlar), D43 qarori `docs/TZ_VA_NARX_REJASI.md` da.

---

## 0. Sinovdan oldin

### 0.1. Muhit

1. `backend` papkasida: `docker compose up -d --build api worker`. Bu backend o‘zgarishlarini yangi image’ga yig‘adi; usiz eski kod ishlaydi.
2. `docker compose logs migrate` → «Migratsiyalar bajarildi.» (`033_tenant_domain.sql` qo‘llangan bo‘lishi kerak).
3. `frontend` papkasida: `pnpm dev`. Brauzerda **faqat `http://localhost:5173`** oching (LAN IP orqali kirish hozircha ishlamaydi).
4. Kamida 3 ta alohida brauzer profili (yoki inkognito) oching: 1 — platforma egasi, 2 — 1-kompaniya, 3 — 2-kompaniya. Bitta profilda ikki foydalanuvchi bilan kirmang.
5. Har oynada F12 → Console ochiq tursin. Qizil xato chiqsa, skrinshot oling va qadamni «yiqildi» deb belgilang.

### 0.2. Sinov ma‘lumotlari (nomlar qat’iy)

| Kompaniya | Ro‘yxat raqami | Domen | Admin login |
|---|---|---|---|
| «QA Domen Bir» | `QA-DOM-1` | `qa-dom-bir` | `qa.admin1` |
| «QA Domen Ikki» | `QA-DOM-2` | `qa-dom-ikki` | `qa.admin2` |

- Ro‘yxat raqami albatta `QA-` bilan boshlansin: oxirida tozalash shunga qaraydi.
- Parollar hech qayerga (hujjat, chat, skrinshot) yozilmaydi.
- Ikkala kompaniyada bir xil login: `qa.menejer`.

### 0.3. Natijani yozish

Har qatorga: **O‘tdi / Yiqildi / O‘tkazib yuborildi** va yiqilgan bo‘lsa, izoh va skrinshot nomi.

---

## 1. Kompaniya yaratishda domen (platforma egasi, 1-oyna)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| D-01 | Platforma egasi bo‘lib kiring (domen maydoni **bo‘sh**). «Mijozlar» → «Yangi kompaniya». 1-qadamni to‘ldirib, 2-qadamga o‘ting. | 2-qadamda «Domen (kirish uchun)» maydoni bor, majburiy. Ostida izoh: «Yagona; 3–32 belgi: kichik lotin harf, raqam, chiziqcha…». |
| D-02 | Domenga ketma-ket `ab`, `-qa`, `qa_dom`, `qa dom` yozib «Keyingi» bosing. | Har birida maydon ostida xato: «3–32 belgi: a–z, 0–9 va chiziqcha (boshida va oxirida chiziqcha emas).» Keyingi qadamga o‘tmaydi. |
| D-03 | Domenga `QA-Dom-Bir` (katta harflar bilan) yozing, qolgan maydonlar 0.2-jadvaldagi «QA Domen Bir» bo‘yicha. «Tarif» qadamida **boshlanish sanasini bo‘sh** qoldiring. Yarating. | Kompaniya yaratiladi. Boshlanish sanasi ostida izoh: «Bo‘sh — sinov muddati tugagan kundan…». Kartada «QA-DOM-1 · Domen: qa-dom-bir» (kichik harflarda saqlangan). |
| D-04 | Xuddi shunday «QA Domen Ikki» ni yarating, lekin domenga avval `qa-dom-bir` yozing. | Yaratishda xato: «Bu domen boshqa kompaniyada band. Boshqa domen tanlang.» |
| D-05 | Domenni `qa-dom-ikki` ga almashtirib qayta yarating. | Kompaniya yaratiladi. |
| D-06 | «Mijozlar» ro‘yxatida «Domen» ustuniga qarang. | Ikkala kompaniyada ustunda `qa-dom-bir` / `qa-dom-ikki`. Agar alias (shaxsiy belgi) berilgan bo‘lsa, u kompaniya nomi ostida kichik satr bo‘lib chiqadi, «Domen» ustunida emas. |
| D-07 | Qidiruvga `dom-ikki` yozing. | Faqat «QA Domen Ikki» qoladi (qidiruv domen bo‘yicha ham ishlaydi). |
| D-08 | Ikkala kompaniya uchun taklif havolasini yarating. 2- va 3-oynada havolalarni oching. | Ro‘yxatdan o‘tish sahifasida ko‘k xabar: «Kompaniya domeni: qa-dom-bir. Siz va xodimlaringiz tizimga shu domen bilan kirasiz.» (2-kompaniyada `qa-dom-ikki`). |
| D-09 | 2-oynada `qa.admin1`, 3-oynada `qa.admin2` bilan ro‘yxatdan o‘ting. | Ikkalasi ham kompaniya bosh sahifasiga kiradi. |
| D-10 | Agar texnik xodim (support yoki super admin) bo‘lsa, shu foydalanuvchi bilan «Mijozlar» ni oching. | «Domen» ustuni har bir platforma roliga ko‘rinadi, qiymatlari egasidagi bilan bir xil. |

---

## 2. Domen bilan kirish

| ID | Qadam | Kutilgan natija |
|---|---|---|
| L-01 | 2-oynada chiqing. Kirish sahifasini oching. | Sarlavha ostida: «Kompaniya domeni, login yoki telefon raqamingiz va parolingizni kiriting». «Kompaniya domeni» maydonida oxirgi kiritilgan domen (`qa-dom-bir`) avtomatik turadi. |
| L-02 | Domen `qa-dom-bir`, login `qa.admin1`, to‘g‘ri parol → «Kirish». | Kiradi, «QA Domen Bir» bosh sahifasi. |
| L-03 | Chiqing. Domenni **o‘chirib**, `qa.admin1` + to‘g‘ri parol bilan kiring. | Kirmaydi: «Domen, login yoki parol noto‘g‘ri.» |
| L-04 | Domen `qa-dom-ikki`, `qa.admin1` + to‘g‘ri parol. | Kirmaydi, xuddi shu xabar (boshqa kompaniyada bunday login yo‘q). |
| L-05 | Domen `yoq-domen`, `qa.admin1` + to‘g‘ri parol. | Kirmaydi, xuddi shu xabar (domen mavjudligi oshkor qilinmaydi). |
| L-06 | Domen `QA-DOM-BIR` (katta harflar), `qa.admin1` + to‘g‘ri parol. | Kiradi (domen katta-kichik harfga sezgir emas). |
| L-07 | Domenga `qa_dom` yozib «Kirish» bosing. | Maydon ostida: «Domen noto‘g‘ri: a–z, 0–9 va chiziqcha, 3–32 belgi.» So‘rov yuborilmaydi. |
| L-08 | `qa.admin1` ga «Sozlamalar» da telefon raqam bering (yoki bor bo‘lsa, o‘shani oling). Chiqing, domen `qa-dom-bir` + **telefon raqam** + parol bilan kiring. | Kiradi. |
| L-09 | 1-oynada chiqing. Platforma egasi bo‘lib domen maydonini **bo‘sh** qoldirib kiring. | Kiradi (platforma xodimlari domensiz kiradi). |
| L-10 | Chiqing. Domen `qa-dom-bir` + platforma egasining login va paroli. | Kirmaydi: «Domen, login yoki parol noto‘g‘ri.» |
| L-11 | 2-oynada `qa.admin1` bilan «Sozlamalar» → kompaniya ma‘lumotlari. | Domen `qa-dom-bir` faqat o‘qish uchun ko‘rsatiladi, izoh: «Xodimlar tizimga shu domen bilan kiradi. O‘zgartirish uchun platforma bilan bog‘laning.» Tahrirlab bo‘lmaydi. |

---

## 3. Bir xil login ikki kompaniyada

| ID | Qadam | Kutilgan natija |
|---|---|---|
| S-01 | 2-oynada (`qa.admin1`) «Xodimlar» → «Xodim qo‘shish»: login `qa.menejer`, rol — bosh muhandis, parol P1. | Xodim yaratiladi. |
| S-02 | 3-oynada (`qa.admin2`) xuddi shunday `qa.menejer`, boshqa parol P2. | Xodim yaratiladi, 409 xato **chiqmaydi**. |
| S-03 | Yangi oynada: domen `qa-dom-bir`, `qa.menejer`, P1. | Kiradi, «QA Domen Bir» ma‘lumotlari ko‘rinadi (obyektlar, xodimlar faqat shu kompaniyaniki). |
| S-04 | Chiqing: domen `qa-dom-ikki`, `qa.menejer`, P2. | Kiradi, «QA Domen Ikki» ma‘lumotlari. |
| S-05 | Domen `qa-dom-bir`, `qa.menejer`, **P2**. | Kirmaydi: «Domen, login yoki parol noto‘g‘ri.» (parol boshqa kompaniyaniki). |
| S-06 | Domen `qa-dom-ikki`, `qa.menejer`, **P1**. | Kirmaydi, xuddi shu xabar. |

---

## 4. Xodim qo‘shishda band login va telefon

| ID | Qadam | Kutilgan natija |
|---|---|---|
| X-01 | 2-oynada (`qa.admin1`) yana `qa.menejer` loginli xodim qo‘shishga urining. | Modal yopilmaydi, **login maydoni ostida**: «Bu login kompaniyangizda band (nofaol xodim ham shu loginni egallaydi)…». Umumiy «Bunday yozuv allaqachon mavjud» xabari chiqmaydi. |
| X-02 | `qa.menejer` ni nofaol qiling. Keyin yana `qa.menejer` loginli yangi xodim qo‘shishga urining. | X-01 dagi xabar (nofaol xodim ham login egallaydi). |
| X-03 | `qa.menejer` ni qayta faollashtiring. | Domen `qa-dom-bir` + P1 bilan yana kira oladi. |
| X-04 | 2-oynada telefon raqami T bilan yangi xodim `qa.ombor1` qo‘shing. | Yaratiladi. |
| X-05 | 3-oynada (`qa.admin2`) shu T telefon bilan `qa.ombor2` qo‘shishga urining. | **Telefon maydoni ostida**: «Bu telefon raqami boshqa foydalanuvchiga biriktirilgan.» (telefon butun platformada yagona). |
| X-06 | X-05 da telefonni boshqa raqamga almashtiring. | Xodim yaratiladi. |

---

## 5. Kompaniya domenini o‘zgartirish (platforma egasi)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| E-01 | «Mijozlar» → «QA Domen Ikki» kartasi → «Tahrirlash». | Profil oynasida «Domen (kirish uchun)» maydoni, hozirgi qiymati `qa-dom-ikki`. |
| E-02 | Domenni `qa-dom-bir` ga o‘zgartirib saqlang. | Xato: «Bu domen boshqa kompaniyada band. Boshqa domen tanlang.» |
| E-03 | Domenni `qa-dom-uch` ga o‘zgartiring (hali saqlamang). | Ogohlantirish: «Domen o‘zgarsa, kompaniyaning barcha xodimlari yangi domen bilan kiradi.» |
| E-04 | Saqlang. | Kartada «Domen: qa-dom-uch». |
| E-05 | 3-oynada chiqing, `qa-dom-ikki` + `qa.admin2` bilan kiring. | Kirmaydi. |
| E-06 | `qa-dom-uch` + `qa.admin2` bilan kiring. | Kiradi. |
| E-07 | Platforma egasi «Audit» ni oching. | `tenant.domain` yozuvi: avvalgi `qa-dom-ikki`, yangi `qa-dom-uch`. |
| E-08 | Domenni yana `qa-dom-ikki` ga qaytaring. | Saqlanadi, keyingi bo‘limlar shu domen bilan davom etadi. |

---

## 6. Sinovdagi kompaniya qarzdor emas va invoys sinovdan keyin

«QA Domen Bir» va «QA Domen Ikki» D-09 da ro‘yxatdan o‘tgan, ya‘ni hozir **sinov muddatida** (14 kun).

| ID | Qadam | Kutilgan natija |
|---|---|---|
| B-01 | «QA Domen Bir» kartasini oching, «Sinov tugashi» sanasini yozib oling (S sanasi). | Ro‘yxatdan o‘tgan kundan 14 kun keyin. |
| B-02 | «Tarif biriktirish»: istalgan tarif, boshlanish sanasi **bugun** (S dan oldin). | Sana ostida: «Sinov tugashidan oldingi sana sinov tugashiga suriladi: invoys sinovdan keyin chiqadi.» Saqlanadi. |
| B-03 | Kartadagi tarif / keyingi davr boshlanishiga qarang. | Keyingi davr bugundan emas, **S** sanasidan boshlanadi. |
| B-04 | Kompaniyaning invoyslar ro‘yxatini oching (darhol, worker bir necha daqiqa ishlagandan keyin ham). | Bugungi sanali avtomatik invoys **yo‘q**. Birinchi invoys S dan 3 kun oldin tayyorlanadi, to‘lov muddati S bo‘ladi (buni darhol tekshirib bo‘lmaydi: S−3 kunda qayta qarang). |
| B-05 | «QA Domen Ikki» ni yaratishda tarif tanlangan, boshlanish sanasi bo‘sh qoldirilgan bo‘lsa (D-03 dagi kabi), kartasini oching. | Keyingi davr «Sinov tugashi» sanasidan boshlanadi. Invoys yo‘q. |
| B-06 | «QA Domen Bir» kartasida «Invoys chiqarish» bilan qo‘lda invoys chiqaring (summa: 100 000). | Qo‘lda invoys darhol chiqadi (qo‘lda invoysga sinov qoidasi tegmaydi). |
| B-07 | «Qarzdorlar» sahifasini oching. | «QA Domen Bir» ro‘yxatda **yo‘q**, garchi to‘lanmagan invoysi bor bo‘lsa ham (sinovda). |
| B-08 | «Daromad va qarz» sahifasi: qarz kartalari va «Qarzdorlik taqsimoti» («Muddati o‘tgan» / «Joriy qarzdorlik»). | B-06 dagi 100 000 hech bir qarz kartasida va taqsimotda hisoblanmaydi. |
| B-09 | Agar bazada sinovi tugagan va to‘lanmagan invoysi bor kompaniya bo‘lsa (holati «Muddati o‘tgan»), uni «Qarzdorlar» da qidiring. | U ro‘yxatda bor, summasi qarz kartalarida hisoblangan (qoida faqat sinovdagilarni chiqaradi). |
| B-10 | Arxivdagi, to‘lanmagan invoysi bor kompaniya bo‘lsa, «Qarzdorlar» ga qarang. | Arxivdagi kompaniya ro‘yxatda **qoladi** (ochiq savol: egasi hali qaror qilmagan). |

---

## 7. Arxivlash va arxivdan chiqarish

| ID | Qadam | Kutilgan natija |
|---|---|---|
| A-01 | «QA Domen Ikki» kartasi → «Arxivlash» → tasdiqlang. | Holat «Arxivlangan». «Bloklash» / «Arxivlash» tugmalari o‘rnida **«Arxivdan chiqarish»** tugmasi. |
| A-02 | 3-oynada `qa-dom-ikki` + `qa.admin2` bilan kirishga urining. | Kirmaydi (kompaniya yopiq). |
| A-03 | Platforma egasi: «Arxivdan chiqarish» ni bosing. | Tasdiqlash oynasi: «Kompaniya arxivdan chiqariladi va qayta faol bo‘ladi: xodimlar avvalgi domen va loginlari bilan kira oladi. Sinov yoki to‘langan davr tugagan bo‘lsa, holat «Muddati o‘tgan» bo‘ladi.» |
| A-04 | Tasdiqlang. | Holat «Sinov» (sinov hali tugamagan). Arxiv tugmasi qaytadi. |
| A-05 | 3-oynada `qa-dom-ikki` + `qa.admin2` bilan kiring. | Kiradi, avvalgi ma‘lumotlar joyida. |

---

## 8. Smeta Excel importi va kompaniyalar ajratilganligi

Fayl: **`docs/tests/DOMEN_TEST_SMETA_2026_11_20.xlsx`** (sintetik, ko‘rsatish xavfsiz). 8 ta qator, 2 bo‘lim, ustunlar: Bo‘lim, Turi, Nomi, Material, Zona, Birlik, Miqdor, Narx, Kim beradi, Izoh, Jami. «Jami» ustuni import qilinmaydi, u faqat solishtirish uchun.

| № | Nomi | Turi | Birlik | Miqdor | Narx | Jami |
|---|---|---|---|---|---|---|
| 1 | Beton B25 | material | m3 | 12,5 | 850 000 | 10 625 000 |
| 2 | Armatura A500 12 mm | material | t | 1,2 | 9 800 000 | 11 760 000 |
| 3 | Beton quyish ishlari | ish | m3 | 12,5 | 120 000 | 1 500 000 |
| 4 | Avtokran 25 t | texnika | soat | 8 | 350 000 | 2 800 000 |
| 5 | G‘isht M100 | material | dona | 15 000 | 1 200 | 18 000 000 |
| 6 | Sement M400 (buyurtmachi) | material | t | 3,75 | 1 150 000 | 4 312 500 |
| 7 | G‘isht terish | ish | m3 | 60 | 180 000 | 10 800 000 |
| 8 | Qurilish chiqindisini olib chiqish | xizmat | kompl | 2 | 450 000 | 900 000 |
| | **Jami** | | | | | **60 697 500** |

| ID | Qadam | Kutilgan natija |
|---|---|---|
| I-01 | 2-oynada (`qa-dom-bir`, `qa.admin1`) «Obyekt qo‘shish»: «QA Domen obyekt 1». Obyekt → Smetalar → «Excel import» → faylni tanlang. | «8 ta qator topildi», «Sarlavha 1-qatorda topildi». Ustunlar avtomatik moslangan: Nomi, Turi, Birlik, Miqdor, Narx, Material, Zona, Bo‘lim, Kim beradi, Izoh. «Jami» — «Moslanmagan». |
| I-02 | «Tekshirish». | «Tekshiruv o‘tdi: 8 ta qator, jami 60 697 500,00». Xabar: «…4 ta material va 1 ta zona avtomatik yaratildi.» (birinchi yuklashda). |
| I-03 | «Smetani yaratish». | «Smeta import qilindi». Smetada 2 bo‘lim, 8 qator; turlari: material 4, ish haqi 2, texnika 1, xizmat 1. Birliklar: m3, t, dona, soat, komplekt. Sement qatori «buyurtmachi» materiali. |
| I-04 | 2-oynada Ombor → «Materiallar». | Beton B25, Armatura A500 12 mm, G‘isht M100, Sement M400 bor. |
| I-05 | 3-oynada (`qa-dom-ikki`, `qa.admin2`) Ombor → «Materiallar». | Bu 4 material **yo‘q** (1-kompaniyaniki ko‘rinmaydi). |
| I-06 | 3-oynada «QA Domen obyekt 2» yarating va shu faylni import qiling (I-01…I-03). | Natija xuddi shunday: jami 60 697 500,00, yana 4 material va 1 zona yaratiladi (kompaniyalar materiallari umumiy emas). |
| I-07 | Domen `qa-dom-bir` + `qa.menejer` (P1) bilan kiring, smetalarni oching. | Faqat «QA Domen obyekt 1» smetasi. |
| I-08 | Domen `qa-dom-ikki` + `qa.menejer` (P2) bilan kiring. | Faqat «QA Domen obyekt 2» smetasi. |
| I-09 | 2-oynada shu faylni «QA Domen obyekt 1» smetasiga **yangi reviziya** sifatida qayta yuklang («Qayerga yuklash» → «… — yangi reviziya»). | Reviziya 2 yaratiladi, jami o‘zgarmaydi (60 697 500,00), yangi material yaratilmaydi (0 ta). |

---

## 9. Tozalash

1. `backend` papkasida: `npm run qa:cleanup -- QA-DOM-1` va `npm run qa:cleanup -- QA-DOM-2`.
2. «Mijozlar» da ikkala kompaniya yo‘qligini tekshiring.
3. Natijalar jadvalini (O‘tdi / Yiqildi) va skrinshotlarni egasiga yuboring.

## Ma‘lum cheklovlar (nuqson emas)

- Telefon raqami butun platformada yagona (egasining qarori, A varianti).
- Birinchi avtomatik invoys sinov tugashidan 3 kun oldin tayyorlanadi (ochiq savol).
- Sinov paytida (bu tuzatishdan oldin) chiqqan invoyslar bazada qolgan, sinov tugagach qarz bo‘ladi (masalan, «QA To‘liq MCHJ», «sinov»).
- LAN IP orqali kirish ishlamaydi (alohida nuqson).
