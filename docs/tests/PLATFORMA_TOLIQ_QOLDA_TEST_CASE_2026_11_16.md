# BARPO AI — butun platformani qo‘lda tekshirish (yig‘ma test case, 2026-11-16)

> **Qamrov:** `main` (PR #23 gacha: S1–S5, D42 bilan). Platforma egasi va texnik xodimlar, kompaniyaning 7 roli, barcha modullar: obyekt, xonadon, smeta (oddiy, Form 5, fayldan reviziya), ombor, vazifa, hisobot, akkord, moliya, ish haqi, dalolatnoma F-2/F-3, buyurtmachi materiallari, narx varaqasi, billing, Telegram, audit, interfeys (til, valyuta, shrift, raqamlar).
> **Kim uchun:** platformani qo‘lda sinovchi odam (egasi yoki QA). Kod bilish shart emas: har qatorda nima bosish va ekranda nima chiqishi yozilgan.
> **Davomiyligi:** to‘liq o‘tish — 1 ish kuni (5–7 soat). 1–9-bo‘limlar ketma-ket bajariladi (oldingi qadam natijasi keyingisiga kerak); 10–15-bo‘limlar mustaqil.
> **Batafsil manbalar:** bo‘lim oxirida havola bor. Bu hujjat ular o‘rnini bosmaydi — yig‘ma yo‘l xaritasi.

---

## 0. Sinovdan oldin

### 0.1. Muhit (15 daqiqa)

1. `git pull` (`main`).
2. `backend` papkasida: `docker compose up --build -d`. `docker compose logs migrate` → «Migratsiyalar bajarildi.» `docker compose ps` — `db`, `api`, `worker` ishlayapti.
3. `frontend` papkasida: `pnpm install`, so‘ng `pnpm dev`.
4. Brauzerda **faqat `http://localhost:5173`** oching. LAN IP manzil (`http://10.x.x.x:5173`) orqali kirish hozir ishlamaydi (ma‘lum nuqson, 0.4-band).
5. Ixtiyoriy tezkor tekshiruv (1 daqiqa): `backend` da PowerShell’da `$env:QA_OWNER_LOGIN='...'; $env:QA_OWNER_PASSWORD='...'; npm run qa:smoke`. Natijada `"checks"` ro‘yxati, oxirgi band «Tozalash…». Yiqilsa — qo‘lda testni boshlamang, avval xabar bering.

### 0.2. Brauzer oynalari

Bir vaqtda bir nechta rol bilan ishlash uchun **4 ta alohida brauzer profili** (yoki Chrome + Edge + ikkita inkognito) oching. Bitta profilda ikkita rol bilan kirmang — cookie almashib ketadi.

| Oyna | Kim bilan ishlaydi |
|---|---|
| 1 — Egasi | platforma egasi (keyin super admin, support) |
| 2 — Admin | `qa.admin` |
| 3 — Xodim A | prorab, bosh muhandis, ombor mudiri, finansist, buxgalter — navbat bilan (chiqib-kirib) |
| 4 — Xodim B | `qa.brigadir` |

Har oynada F12 → Console ochiq tursin. Qizil xato chiqsa — skrinshot oling, shu qadamni «yiqildi» deb yozing.

### 0.3. Sinov ma‘lumotlari (nomlar qat’iy)

- Kompaniya: **«QA To‘liq MCHJ»**, ro‘yxat raqami **`QA-TOLIQ-1`** (albatta `QA-` bilan boshlansin — oxirida tozalash shunga qaraydi).
- Xodimlar (login → rol): `qa.admin` (admin), `qa.muhandis` (bosh muhandis), `qa.prorab` (prorab), `qa.brigadir` (brigadir), `qa.ombor` (ombor mudiri), `qa.finansist` (finansist), `qa.buxgalter` (buxgalter).
- Parollar hech qayerga (hujjat, chat, skrinshot) yozilmaydi.
- Haqiqiy kompaniya nomi, INN, hisob raqami ishlatilmaydi.
- Barcha sarf, hisobot va hujjatlar **bir oy ichida** kiritilsin (dalolatnoma va ish haqi shu oy uchun tekshiriladi).

### 0.4. Ma‘lum nuqsonlar (qayta xabar qilmang)

Quyidagilar ma‘lum va ochiq. Qadamda uchrasa «ma‘lum nuqson» deb belgilang, yangi xato sifatida yozmang:

| Kod | Nuqson |
|---|---|
| N-01 | Form 5 haqiqiy «ОБЩЕЕ» varag‘idagi «ИТОГО ПО ЛОКАЛЬНОЙ РЕСУРСНОЙ ВЕДОМОСТИ» blokini soxta ish qatorlari sifatida import qiladi |
| N-02 | Bosh muhandis dalolatnomani (F-2/F-3) ochganda «ruxsat yo‘q» (403) chiqadi |
| K-1 | Smeta qatoridagi «Fakt» va «Umumiy» tab ombor stornosini ayirmaydi (dalolatnoma va S5 hisobotida to‘g‘ri) |
| LAN | `http://<IP>:5173` orqali login ishlamaydi — faqat `localhost` |
| N-03 | Narxsiz bosh pudratchi qatorlari «buyurtmachi» deb belgilanadi |

### 0.5. Natijani qanday yozish

Har qator uchun: **o‘tdi** / **yiqildi** / **ma‘lum nuqson** / **o‘tkazib yuborildi (sabab)**. Yiqilganda hujjat oxiridagi jadvalga yozing: ID, nima qildingiz, nima kutilgan edi, nima chiqdi, skrinshot nomi. Xatoni o‘zingiz tuzatmang.

**Raqamlar:** summalar `25 600 000` ko‘rinishida (bo‘sh joy bilan) chiqadi. Kasr vergul yoki nuqta bilan bo‘lishi mumkin — qiymat mos kelsa «o‘tdi».

---

## 1. Platforma egasi: kompaniya ochish

Oyna 1, platforma egasi bilan kiring.

| ID | Qadam | Kutilgan natija |
|---|---|---|
| P-01 | Bosh sahifa | KPI kartalari, daromad dinamikasi, kompaniyalar holati; konsolda xato yo‘q |
| P-02 | Mijozlar → «Kompaniya qo‘shish»: nom «QA To‘liq MCHJ», ro‘yxat raqami `QA-TOLIQ-1`, kontakt ismi, telefon `901234567`, tarif tanlang | Kompaniya ro‘yxatda, holati «Ro‘yxatdan o‘tmagan»; telefon `+998 90 123 45 67` ko‘rinishida saqlangan |
| P-03 | Kompaniya kartasi → «Taklif havolasi» → nusxalang; oyna 2 da oching | Ro‘yxatdan o‘tish formasi (login, parol, ism) |
| P-04 | Oyna 2: login `qa.admin`, parol (6+ belgi), ism → ro‘yxatdan o‘ting | Admin paneliga kiradi; yuqorida «QA To‘liq MCHJ» |
| P-05 | Xuddi shu havolani yana oching | «Havola yaroqsiz» (bir martalik) |
| P-06 | Oyna 1 → Mijozlar → kompaniya kartasi | Holat «Faol (sinov)», sinov 14 kun, admin ismi, tarif |
| P-07 | Tariflar | Tarif kartasida kompaniyalar va xodimlar soni ortgan |
| P-08 | Daromad va qarz; Qarzdorlar | Ikkalasi xatosiz ochiladi; ma‘lumot yo‘q joyda bo‘sh holat yozuvi (soxta raqam emas) |

## 2. Admin: xodimlar, ruxsatlar, sozlamalar

Oyna 2, `qa.admin`.

| ID | Qadam | Kutilgan natija |
|---|---|---|
| A-01 | Chap menyu | Uch guruh: Asosiy (Bosh sahifa, Obyektlar, Smetalar, Vazifalar, Hisobotlar, Ombor va materiallar, Xodimlar), Moliya (15 band), Boshqaruv (Rollar va ruxsatlar, Obuna, Kamera kuzatuvi, Integratsiyalar, Audit jurnali, Fayllar, Sozlamalar) |
| A-02 | Xodimlar → «Xodim qo‘shish» × 6: muhandis (bosh muhandis), prorab, brigadir, ombor mudiri, finansist, buxgalter; har biriga boshlang‘ich parol | 6 xodim ro‘yxatda, holati «Boshlang‘ich parolni almashtiring» |
| A-03 | Xuddi shu login bilan 7-xodim qo‘shishga urining (`qa.prorab`) | Rad etiladi: login band |
| A-04 | Oyna 4: `qa.brigadir` bilan kiring | Parolni almashtirish sahifasi; almashtirgach qayta kirish so‘raladi; brigadir paneli |
| A-05 | Oyna 3: qolgan 5 xodim bilan bir martadan kirib parolni almashtiring | Har biri o‘z paneliga tushadi |
| A-06 | Rollar va ruxsatlar → «Prorab» qatori | Moliya sahifalari o‘chiq; narx (`prices.read`) yo‘q. **Hech narsani o‘zgartirmang** |
| A-07 | Sozlamalar → kompaniya nomi «QA To‘liq MCHJ», telefon, manzil → saqlang | «Saqlandi»; chap paneldagi nom yangilangan |
| A-08 | Sozlamalar → bildirishnoma toifalari | Ro‘yxat ochiladi; o‘zgartirmang |

## 3. Obyekt, zona, xonadon

Oyna 2, admin.

| ID | Qadam | Kutilgan natija |
|---|---|---|
| O-01 | Obyektlar → «Obyekt qo‘shish»: «QA obyekt», maydon `1250.50`, buyurtmachi nomi «QA Buyurtmachi», manzil, **Brigada stavkasi, %** = 20 | Obyekt kartasi; «Omborlar» tabida «Asosiy ombor» avtomatik bor |
| O-02 | «Zonalar / bloklar» → «Zona qo‘shish»: «A blok», turi **blok**, 3 qavat; so‘ng «1-qavat», turi **qavat**, ota «A blok» | Blok kartasi «3 qavat»; daraxtda 1-qavat A blok ichida |
| O-03 | Blok kartasi → reja boshlanish/tugash sanasi (tugash — boshlanishdan oldin) | Xato: sana oralig‘i noto‘g‘ri; to‘g‘ri sana bilan saqlanadi, holati sanaga mos («Kutilmoqda»/«Faol») |
| O-04 | «Xonadonlar» tabi → «Xonadon qo‘shish»: raqam 1, A blok, 1-qavat, 45 m², 2 xona; raqam 2, 55 m², 3 xona | Ikkalasi ro‘yxatda; jami 2 ta, 100 m² (server jami) |
| O-05 | Yana raqam «1» bilan xonadon qo‘shing (A blok) | Rad etiladi: raqam blok ichida takrorlanadi |
| O-06 | Xonadon qo‘shish, qavat 5 (blokda 3 qavat) | Rad etiladi: qavat blok qavatlaridan yuqori |
| O-07 | «Shablonni yuklab olish» (bo‘sh keladi) → 1 qator yozing: Blok «A blok», **Kirish — bo‘sh**, Qavat 1, Raqam 3, Tur Kvartira, Xonalar 1, Maydon 30 → «Excel’dan import». «Kirish» ustuniga faqat blok ichidagi **kirish turidagi zona** nomi yoziladi (bu obyektda yo‘q); blok nomini yozmang | Preview: «Yangi: 1»; «Import qilish» → 3 ta xonadon. Shu faylni qayta import qiling — «O‘zgarmagan: 1», dublikat yo‘q |
| O-07b | Faylga yana bir qator: A blok, Kirish «A blok», raqam 4 → import | Shu qator «Xato — Kirish: Kirish topilmadi»; «Import qilish» o‘chiq (xatoli fayl umuman yozilmaydi) |
| O-08 | Xonadon 3 ni arxivlang | Ro‘yxatda yo‘q; jami 2 ta, 100 m² |
| O-09 | «Xodimlar» tabi → 6 xodimni biriktiring; ombor mudiriga «Asosiy ombor» ni ham | Hammasi ro‘yxatda; oyna 4 (brigadir) yangilansa obyekt ko‘rinadi |
| O-10 | «Qavatlar progressi» tabi | Yo‘riqnoma: ish qatori yo‘q (smeta hali yo‘q) |

## 4. Smeta: oddiy smeta, reviziya, smeta yakuni

| ID | Qadam | Kutilgan natija |
|---|---|---|
| S-00 | Oyna 3, `qa.ombor` → Materiallar → «Material qo‘shish»: «Sement», kg | Ro‘yxatda. Oyna 2 (admin) Ombor → Materiallar: «Material qo‘shish» tugmasi **yo‘q** (D18) |
| S-01 | Oyna 3, `qa.muhandis` → Smetalar → «Yangi smeta», obyekt «QA obyekt»: 1-qator **ish** «Beton quyish», m3, 100, narx 250 000, **Brigada stavkasi** 100 000, zona 1-qavat; 2-qator **material** «Sement», kg, 500, narx 1 200 → saqlang | «Smeta saqlandi (reviziya 1)»; jami **25 600 000**; materiallar 600 000, ishlar 25 000 000 |
| S-02 | Miqdor maydoniga `5000`, narxga `1200000` yozib ko‘ring (saqlamang, bekor qiling) | Yozish paytida `5 000` va `1 200 000` ko‘rinadi |
| S-03 | «Tahrirlash»: Sement miqdori 600 → saqlang | Reviziya 2; «Reviziyalar tarixi»da ikki yozuv; jami **25 720 000** |
| S-04 | «Sarlavhani tahrirlash»: asos, narx darajasi sanasi, shartnoma raqami `QA-1`, sana — shu oyning 1-kuni, summa **34 855 744** | Saqlanadi; reviziya **2 bo‘lib qoladi** (sarlavha reviziya yaratmaydi) |
| S-05 | «Sozlamalar»: «Erkin», boshqa xarajatlar 21, foyda 0, ishlab chiqarish 0, QQS 12 → saqlang; sahifa pastidagi «Smeta yakuni» | Ish haqi 25 000 000; Pudratchi materiallari 720 000; to‘g‘ridan-to‘g‘ri 25 720 000; Boshqa xarajatlar 21 % — **5 401 200**; QQSsiz jami **31 121 200**; QQS **3 734 544**; QQS bilan jami **34 855 744**; reviziya 2 |
| S-06 | «Sozlamalar» → VMQ 583, foyda 7 ga teng emas qiymat kiritishga urining | Rad etiladi (VMQ 583 da foyda 7 %, ishlab chiqarish 2,5 yoki 5). Keyin yana «Erkin» 21 / 0 / 0 / 12 ga qaytaring |
| S-07 | «Resurslar yig‘masi» tabi | Mehnat: Beton quyish 100 m3 / 25 000 000; Materiallar: Sement 600 kg / 720 000; jami 25 720 000 |
| S-08 | «Excel eksport» (muhandis) | Faylda «Smeta» va «Resurslar yig‘masi» varaqlari; narx va summa ustunlari bor; Bo‘lim, Norma kodi, Resurs kodi, Kim beradi ustunlari; oxirida smeta yakuni bloki, «QQS bilan jami» 34 855 744 |
| S-09 | Oyna 3, `qa.prorab` → Smetalar → shu smeta | Hajmlar ko‘rinadi; narx, summa, stavka ustunlari va «Smeta yakuni» **yo‘q**; «Dalolatnoma» tugmasi yo‘q. Excel eksport — narxsiz, smeta yakuni blokisiz |
| S-10 | Oyna 2, admin → smeta → «Arxivlash» tugmasi borligini ko‘ring (bosmang). Oyna 3, muhandis → shu smetada «Arxivlash» | Adminda bor; muhandisda **yo‘q** (D24) |

Batafsil: `SMETA_EXCEL_TEKSHIRUV_2026_11_02.md`, `RAQAM_AJRATISH_TEST_CASES.md`.

## 5. Ombor

| ID | Qadam | Kutilgan natija |
|---|---|---|
| W-01 | Oyna 3, `qa.ombor` → menyu | Bosh sahifa, Kirim/Chiqim, Omborlar, Talabnomalar, Transferlar, Inventarizatsiya, Materiallar, Buyurtmachi materiallari. Vazifa va Hisobot yo‘q |
| W-02 | Omborlar (Qoldiqlar), Asosiy ombor | Sement qatori: **Reja (smeta)** 600, Kirim 0, qoldiq 0, holati «Kirim yo‘q» (D42) |
| W-03 | Kirim/Chiqim → «Kirim»: Sement, Asosiy ombor, 1000 kg, tannarx 1 200 | Qoldiq 1000; holati «Yetarli»; Reja 600 yonida «Rejadan oshgan». Ombor mudirida qiymat (so‘m) ustuni yo‘q. Oyna 2 (admin) — «Kirim» tugmasi yo‘q |
| W-04 | «Jo‘natish»: Sement 300 kg → `qa.brigadir`, smeta qatori «Sement» | Harakat «Kutilmoqda»; omborda rezerv 300, mavjud 700 |
| W-05 | Oyna 4, brigadir → menyu | Bosh sahifa, Vazifalar, Material qabul, Material talabnomasi, Qoldiqlar, Materiallar, Hisobotlar; ombor sahifasida tablar yo‘q (har band o‘z bo‘limi) |
| W-06 | Material qabul → jo‘natmani **250 kg** qabul qiling | Holat «Qisman»; brigadirda 250, omborda 50 rezervda |
| W-07 | Qolgan 50 ni qabul qiling | «Qabul qilindi»; brigadirda 300; omborda 700, rezerv 0 |
| W-08 | «Sarf»: Sement 100 kg, **Smeta qatori** ro‘yxatda «Sement» bor → tanlang, zona 1-qavat | «Kutilmoqda»; brigadirda 100 rezervda |
| W-09 | Oyna 3, `qa.prorab` → Xomashyolar → Harakatlar → sarfni «Tasdiqlash» | «O‘tkazildi»; brigadirda 200. Oyna 2 (admin) obyekt kartasi: fakt xarajat **120 000** |
| W-10 | Oyna 4: Material talabnomasi → «Material so‘rash»: Sement 50 kg; «Qator qo‘shish» → yana Sement | Rad etiladi: bir material ikki marta. 2-qatorni boshqa materialga almashtirish uchun avval ombor mudiri «Qum» (m3) yaratsin; Qum 5 m3 → yuboring: talabnoma raqam bilan, 2 qator, «Kutilmoqda» |
| W-11 | Oyna 3, ombor mudiri → Talabnomalar: 1-qator «Jo‘natish bilan bajarish», 2-qator «Rad etish» | Talabnoma «Bajarildi»; brigadirga 50 kg jo‘natma; qo‘ng‘iroqchada bildirishnoma. Admin oynasida bajarish tugmasi yo‘q |
| W-12 | Oyna 4: 50 kg ni qabul qiling | Omborda 650, rezerv 0; brigadirda 250 |
| W-13 | Brigadir → «Qaytarish»: 20 kg; ombor mudiri qabul qiladi | Omborda 670; brigadirda 230 |
| W-14 | Ombor mudiri → Qoldiqlar → Sement → «Minimal qoldiq» 900 | Holati «Kam qoldi»; ombor mudirida bildirishnoma |
| W-15 | Inventarizatsiya: Sement haqiqiy 665 (hisobda 670) | Tuzatish −5; qoldiq 665; harakatlarda «Tuzatish» |
| W-16 | Ombor mudiri: Kirim 10 kg Sement → shu kirimni «Storno» | Asl yozuv qoladi, teskari yozuv qo‘shiladi; qoldiq yana 665 |
| W-17 | Ombor → «Excel» eksport | Ustunlar: Reja (smeta), Kirim, Rejadan oshgan va qoldiqlar ekrandagidek |

Batafsil: `SMETA_REVIZIYA_OMBOR_D35_TEST_CASES.md`, `FIGMA_F1_F6_TEST_CASES.md`.

## 6. Vazifa, hisobot, progress, akkord

| ID | Qadam | Kutilgan natija |
|---|---|---|
| T-01 | `qa.prorab` → Vazifalar → «Vazifa qo‘shish»: «Beton quyish 1-qavat», ijrochi brigadir, tekshiruvchi prorab, daraja yuqori, **Smeta qatori** «Beton quyish», boshlanish bugun | Kanban «Rejada»da karta: qator nomi va 0 % |
| T-02 | Ijrochi va tekshiruvchiga bir odamni qo‘yishga urining | Rad etiladi |
| T-03 | Oyna 4, brigadir → vazifani «Boshlash», keyin «Topshirish» | Bajarilmoqda → Tekshiruvda; prorabda bildirishnoma |
| T-04 | Brigadirda «Qabul qilish» tugmasi | Yo‘q |
| T-05 | Prorab → «Qabul qilish», izoh bilan | «Qabul qilingan»; tarixda izoh; vazifani tahrirlab/arxivlab bo‘lmaydi |
| R-01 | Brigadir → Hisobotlar → «Hisobot yaratish» (kunlik): matn, zona 1-qavat, smeta qatori «Beton quyish», hajm **40**, foto | «Yuborilgan»; foto ochiladi |
| R-02 | Prorab → hisobot → «Qaytarish», sabab bilan | «Qaytarilgan»; brigadirda bildirishnoma |
| R-03 | Brigadir → matnni tuzatib «Qayta yuborish» | «Yuborilgan» |
| R-04 | Prorab → «Qabul qilish» | «Qabul qilingan»; vazifa kartasida reja 100 / qabul 40 / 40 %; obyekt → Qavatlar progressi: 1-qavat × Beton quyish **40 %** |
| R-05 | Prorab → hisobot kartasi | «Ishlab topilgan» **yo‘q** (D20) |
| R-06 | Brigadir → hisobot kartasi | «Ishlab topilgan» **4 000 000** (40 × 100 000) |
| R-07 | Muhandis → smetada Beton quyish stavkasini 120 000 ga (reviziya 3); brigadir kartani yangilaydi | Summa **4 000 000 bo‘lib qoladi** (qabulda qotirilgan); vazifa yangi reviziya qatoriga o‘tgan, «Eski reviziya qatori» belgisi yo‘q |
| R-08 | Prorab → hisobot → «Progressni tuzatish»: −5, sabab | Amalda 35; brigadir kartasida **3 500 000**; Qavatlar progressi 35 % |
| R-09 | Brigadir → Bosh sahifa → «Mening hisobim» | Shu oy ishlab topilgan 3 500 000; davrga kirgan 0; to‘langan 0; qoldiq 3 500 000 |
| R-10 | Brigadir → Hisobotlar → boshqa brigadirning hisobotini ko‘rish imkoni | Faqat o‘z hisobotlari |

## 7. Dalolatnoma F-2/F-3 (S4)

6-bo‘limdan keyin, shu oy uchun. Oyna 3, `qa.buxgalter` (menyuda «Smetalar» bor).

| ID | Qadam | Kutilgan natija |
|---|---|---|
| AK-01 | Smetalar → QA smeta → «Dalolatnoma (F-2/F-3)», joriy oy | Beton quyish 35 m3 / 8 750 000; Sement 100 kg / 120 000 (bog‘langan sarf); to‘g‘ridan-to‘g‘ri **8 870 000**; boshqa xarajatlar 21 % 1 862 700; QQSsiz **10 732 700**; QQS 1 287 924; QQS bilan **12 020 624**; shartnomadan ≈ **34,49 %**. Uch ustun (Davr, Yil boshidan, Qurilish boshidan) bir xil |
| AK-02 | «Sana oralig‘i»: boshlanish tugashdan keyin | Xato, ma‘lumot chiqmaydi |
| AK-03 | O‘tgan oyni tanlang | «Tanlangan davrda qabul qilingan ish yo‘q»; «Qurilish boshidan» ham 0 |
| AK-04 | «Excel (F-2, F-3)» | `akt-…xlsx`; F-2 va F-3 varaqlari; kataklarda qiymat (formula emas); F-3 da bank, MFO, INN qatorlari bo‘sh |
| AK-05 | Admin va finansist dalolatnomani ochadi | Ochiladi, raqamlar AK-01 dagidek |
| AK-06 | Prorab, brigadir, ombor mudiri | Tugma yo‘q (brigadir va ombor mudiri smeta sahifasiga umuman kirmaydi) |
| AK-07 | Bosh muhandis dalolatnomani ochadi | Qoidaga ko‘ra ochilishi kerak — **ma‘lum nuqson N-02** (403) |
| AK-08 | Admin → Audit jurnali | `export.estimate_act` yozuvi |

Batafsil: `S4_DALOLATNOMA_TEST_CASES.md` (17 holat).

## 8. Moliya

| ID | Qadam | Kutilgan natija |
|---|---|---|
| F-01 | `qa.buxgalter` → menyu | Bosh sahifa, Birlamchi hujjatlar, Hisoblar va dalolatnomalar, Smetalar, Bank va kassa, Kontragentlar, Ish haqi, Solishtirish, Moliyaviy hisobotlar, Mablag‘ ajratish |
| F-02 | Bank va kassa → «Hisob qo‘shish»: «QA kassa» (kassa) | Qoldiq 0 |
| F-03 | Kontragentlar → «QA Buyurtmachi» (buyurtmachi), «QA Yetkazuvchi» (yetkazib beruvchi), «QA Subpudrat» (**subpudratchi**) | Turlar ro‘yxatida «Pudratchi» yo‘q, «Subpudratchi» bor |
| F-04 | Bank va kassa → «Operatsiya»: Tushum 10 000 000, QA Buyurtmachi, QA obyekt | Kassa 10 000 000; admin obyekt kartasi: tushum 10 000 000 |
| F-05 | Hisoblar va dalolatnomalar → yetkazuvchi invoysi, QA Yetkazuvchi, **W-03 kirimiga bog‘lang** | Summa kirim qiymatidan o‘zi to‘ladi: 1 200 000; «Kutilmoqda». Boshqa summa yozishga urinish — «Narx tuzatish talab qilinadi» |
| F-06 | «To‘lash» 1 200 000, QA kassa | «To‘langan»; kassa 8 800 000; obyekt kartasi: to‘langan 1 200 000, qarz 0 |
| F-07 | Yana 1 so‘m to‘lashga urining | «Summa hujjat qoldig‘idan oshadi» |
| F-08 | QA Subpudrat: avans 1 000 000; xizmat dalolatnomasi 3 000 000; «Avansdan yopish» | Summa 1 000 000 oldindan to‘ldirilgan, kassa maydoni yo‘q; qoldiq 2 000 000; kassa 7 800 000 (avansdan keyin), yopishda o‘zgarmaydi |
| F-09 | Dalolatnomani «Teskari qilish» | Rad etiladi: avval avans hisobini teskari qiling |
| F-10 | Kontragentlar va Solishtirish (QA Subpudrat) | Ikkalasida qarz 2 000 000, avans 0 |
| F-11 | Oyna 2 (admin) → QA obyekt kartasi, moliya bloki | Reja 25 720 000; fakt **3 126 000** (sarf 120 000 + inventarizatsiya kamomadi 5 kg × 1 200 = 6 000 + xizmat 3 000 000); to‘langan, qarz, avans, tushum 10 000 000; bajarilish % |
| F-12 | `qa.finansist` → menyu | Bosh sahifa, Budjetlar, Reja–fakt, Prognoz, To‘lov so‘rovlari, To‘lov kalendari, Moliyaviy hisobotlar, Narx varaqasi |
| F-13 | Budjetlar → joriy oy 5 000 000; Reja–fakt; Prognoz | Budjet kartasida fakt va foiz; reja–faktda smeta vs fakt; prognoz xatosiz |
| F-14 | To‘lov so‘rovi 500 000 (QA Yetkazuvchi); buxgalter tasdiqlaydi va to‘laydi | Kutilmoqda → Tasdiqlangan → To‘langan; To‘lov kalendarida ko‘rinadi |
| F-15 | Finansistda «To‘lash» yoki «Avansdan yopish» | Yo‘q (to‘lov qilmaydi) |
| F-16 | O‘tgan oy sanasi bilan xizmat dalolatnomasi 100 000 kiriting | Reja–fakt va budjetda **o‘tgan oyda** ko‘rinadi (hujjat sanasi bo‘yicha, O12) |
| F-17 | Birlamchi hujjatlar | Barcha hujjatlar, «Avans hisobi» turi bor; «Teskari qilish» — chegarali tugma |

Batafsil: `AVANS_HISOBI_TEST_CASES.md`, `BOSQICH_2_3_4_TEST_CASES.md`.

## 9. Ish haqi va akkord

| ID | Qadam | Kutilgan natija |
|---|---|---|
| Z-01 | Buxgalter → Ish haqi → «Yangi davr»: joriy oy, QA obyekt | Davr «Ochiq»; «Kutilayotgan akkord»: brigadir — 3 500 000 |
| Z-02 | «Xodim qo‘shish»: prorab, oklad 2 000 000 | Prorab qatori, net 2 000 000 |
| Z-03 | Buxgalter → «Davrni yopish» | Rad etiladi (standartda admin yopadi) |
| Z-04 | Admin → Ish haqi → «Davrni yopish» | «Yopilgan»; brigadir qatori avtomatik: akkord 3 500 000; har xodimga mehnat hujjati (tavsifda akkord) |
| Z-05 | Buxgalter → avans: brigadir (xodim kontragenti), 500 000 | Brigadir «Mening hisobim»: avanslar 500 000 |
| Z-06 | Admin → brigadir qatori «To‘lash» | Oynada «Avansdan hisoblanadi 500 000 · Kassadan to‘lanadi 3 000 000»; «To‘langan» |
| Z-07 | Brigadir → «Mening hisobim» | Davrga kirgan 3 500 000, to‘langan 3 500 000, avans 0, qoldiq 0 |
| Z-08 | Prorab → hisobotga +2 tuzatish; admin keyingi oy davrini ochib yopadi | Brigadirda qoldiq 200 000; keyingi davrda akkord 200 000 (eski stavka 100 000) |

---

Quyidagi bo‘limlar mustaqil — istalgan tartibda.

## 10. Form 5 namuna smeta (S1–S5, to‘liq oqim)

Fayl: `docs/research/NAMUNA_SMETA_FORM5_2026_11_10.xlsx` (sintetik, ko‘rsatish xavfsiz). Admin yangi obyekt «QA Namuna ofis» ochadi, brigada foizi 20, xodimlarni biriktiradi.

| ID | Qadam | Kutilgan natija |
|---|---|---|
| N-01a | Muhandis → «Excel import» → namuna fayl | Form 5 deb taniladi; «Ресурсная ведомость» belgilangan |
| N-02a | «Tekshirish» | 28 qator, jami **75 537 564**; Excel jamlari jadvalida farq 0; «ИТОГО С НДС» 81 077 530,73; «П» ogohlantirishi (ПРОФИЛЬ МАЯЧКОВЫЙ) |
| N-03a | Sozlamalar | Boshqa xarajatlar 21, QQS 12, bosh pudratchi materiallari — Buyurtmachi |
| N-04a | Smetani yaratish → «Smeta yakuni» | QQS bilan jami **81 077 530,73**; ish qatorlarida «avto» stavka |
| N-05a | Ombor, sarf, hisobot, dalolatnoma va «Buyurtmachi materiallari» — `NAMUNA_SMETA_QOLDA_TEST_CASE_2026_11_11.md` Q-13…Q-31 bo‘yicha | Dalolatnoma **47 065 711,86** (58,05 %) — faqat sarflar smeta qatoriga bog‘langanda; Q-21 va Q-30 raqamlari avtomatik tasdiqlanmagan |

## 11. Smetani fayldan qayta yuklash (D42)

`SMETA_REVIZIYA_OMBOR_D35_TEST_CASES.md` dagi `smeta-v1.xlsx` va `smeta-v2.xlsx` ni (jadval o‘sha faylda) Excel’da tayyorlang; yangi «D35 obyekt».

| ID | Qadam | Kutilgan natija |
|---|---|---|
| D42-01 | Import, «Qayerga yuklash» = Yangi smeta, v1 | Smeta rev. 1; «3 ta material yaratildi»; ombor qoldiqlarida Reja 100 / 5 / 4, «Kirim yo‘q» |
| D42-02 | Kirim Sement 120, Gips 2; kirimda «D35 Sement M400» ni «+» → «Shu materialmi?» → D35 Sement (muqobil nom), bekor qiling | Sement «Rejadan oshgan»; muqobil nom saqlangan |
| D42-03 | Import v2, «Qayerga yuklash» = shu smeta — yangi reviziya | «1 ta material yaratildi» (faqat Shag‘al); tasdiqlangach rev. 2, obyektda bitta smeta |
| D42-04 | Qoldiqlar | Sement Reja 80, qoldiq 120; Gips Reja «—», qoldiq 2; Shag‘al Reja 3, «Kirim yo‘q»; Qum yo‘q |
| D42-05 | Ikki oynada bir vaqtda v2 ni tekshirib, ketma-ket tasdiqlang | Ikkinchisi: «Smeta shu orada o‘zgargan… Faylni qayta tekshiring» |
| D42-06 | Finansist bilan import | «Qayerga yuklash» tanlovi yo‘q — faqat yangi smeta |

## 12. Narx varaqasi va valyuta

| ID | Qadam | Kutilgan natija |
|---|---|---|
| NV-01 | `qa.finansist` → Narx varaqasi → QA obyekt → ustama 20 % → «Hisoblash» | Versiya 1; xonadon 1 (45 m²) va 2 (55 m²) qatorlari; jami tannarx = guruhlar prognozi jami (tiyinigacha); sotuv m² narxi 1 000 ga karrali |
| NV-02 | Ustama 25 % bilan qayta hisoblang | Versiya 2; versiya 1 o‘zgarmagan, tarixdan ochiladi |
| NV-03 | Xonadonsiz obyektda hisoblash | Xato: xonadon yo‘q |
| NV-04 | Excel eksport UZS va USD | Ikkala fayl yuklanadi; USD — versiya kursi bilan |
| NV-05 | Yuqori paneldagi UZS/USD almashtirgich → USD | Jadval summalari USD (2 kasr); formalar va Excel UZS’da qoladi. Kurs yo‘q bo‘lsa tugma o‘chiq |
| NV-06 | Buxgalter va prorab → Narx varaqasi | Menyuda yo‘q; manzilni qo‘lda yozganda ochilmaydi |

## 13. Rol bo‘yicha kirish cheklovlari (salbiy tekshiruvlar)

Har rol bilan kirib, **manzil qatoriga qo‘lda** yozing. Kutilgan: sahifa ochilmaydi (ruxsat yo‘q / bosh sahifaga qaytaradi), konsolda 403 dan boshqa xato yo‘q.

| ID | Rol | Manzil yoki amal | Kutilgan natija |
|---|---|---|---|
| RL-01 | prorab | `/app/finance`, `/app/finance/payroll` | Ochilmaydi |
| RL-02 | prorab | obyekt kartasi | Moliya bloki va brigada foizi yo‘q |
| RL-03 | brigadir | `/app/estimates`, `/app/projects` | Ochilmaydi |
| RL-04 | brigadir | Bosh sahifa | Faqat o‘z pullari; moliya bloki yo‘q |
| RL-05 | ombor mudiri | `/app/estimates`, `/app/tasks` | Ochilmaydi |
| RL-06 | ombor mudiri | Sarfni tasdiqlash | Tugma yo‘q |
| RL-07 | finansist | `/app/finance/bank-cash` da operatsiya qo‘shish | Tugma yo‘q |
| RL-08 | buxgalter | `/app/finance/pricing` | Ochilmaydi |
| RL-09 | bosh muhandis | `/app/finance`, `/app/employees` da «Xodim qo‘shish» | Moliya ochilmaydi; xodimlar ro‘yxati ko‘rinadi, qo‘shish tugmasi yo‘q |
| RL-10 | admin | Ombor: kirim, jo‘natish, sarf, inventarizatsiya, material qo‘shish | Tugmalar yo‘q (D18) |
| RL-11 | admin | Rollar va ruxsatlar → prorabga «Moliya: o‘qish» bering; prorab qayta kiradi; keyin qaytarib oling | Berilganda prorabda Moliya bandi chiqadi; olingach yo‘qoladi |
| RL-12 | har qanday | Mavjud bo‘lmagan manzil `/app/yoq` va mavjud bo‘lmagan obyekt id | «Topilmadi» sahifasi (bo‘sh oq ekran emas) |

## 14. Platforma: rollar, billing, tuzatish, blok

Oyna 1.

| ID | Qadam | Kutilgan natija |
|---|---|---|
| PL-01 | Texnik xodimlar → super admin va support qo‘shing | Ikkalasi ro‘yxatda |
| PL-02 | Super admin bilan kiring (Telegram ulanmagan, bot sozlangan) | Faqat profil va Telegramni ulash ochiladi (2FA majburiy). Bot sozlanmagan bo‘lsa — profil ogohlantiradi |
| PL-03 | Telegram ulangan egasi/super admin bilan kirish | Botga 6 xonali kod; noto‘g‘ri kod 5 marta — kod bekor; to‘g‘ri kod — kirish |
| PL-04 | Support bilan kiring | Mijozlar, Tariflar, Daromad, Qarzdorlar, Murojaatlar, Diagnostika ko‘rinadi; «Kompaniya qo‘shish», «Bloklash», tarif o‘zgartirish, storno yo‘q |
| PL-05 | Platforma ruxsatlari → supportga yangi ruxsat bering, support qayta kiradi; keyin qaytaring | Ruxsat ta‘sir qiladi; har o‘zgarish auditda |
| PL-06 | Super admin egasini bloklashga urinadi | Rad etiladi |
| PL-07 | Kompaniyaga invoys yarating, qisman to‘lov, keyin ortiqcha to‘lov | Qarz kamayadi; ortiqcha qism kredit bo‘lib keyingi invoysga o‘tadi; Daromad va qarz sahifasida ko‘rinadi |
| PL-08 | Kompaniya → foydalanuvchi `qa.prorab` → «Parolni tiklash» | 30 daqiqalik bir martalik havola; eski sessiya chiqib ketadi |
| PL-09 | Kompaniya → tuzatish: W-16 dan boshqa ombor harakatini sabab bilan storno (oldindan ko‘rish → tasdiq) | Kompaniyada teskari yozuv admin nomidan, izohda «BARPO AI (<xodim>): <sabab>»; admin bildirishnoma oladi; auditda platforma xodimi |
| PL-10 | Admin → Obuna → murojaat yuboring; egasi → Murojaatlar → javob | Egasi bildirishnoma oladi; javob adminda ko‘rinadi |
| PL-11 | Mijozlar → «QA To‘liq MCHJ» → **Bloklash** (sabab bilan); `qa.prorab` bilan kiring | Xodim kira olmaydi; admin faqat Obuna va murojaat sahifalarini ko‘radi |
| PL-12 | «Qayta ochish» | Hamma narsa joyida |
| PL-13 | Audit (umumiy), kompaniya filtri bilan | Kompaniya amallari; shartnoma summasi o‘rnida faqat «o‘zgargan» belgisi |
| PL-14 | Diagnostika | Xatolar 7 kun, Telegram bot va CBU kursi holati. «Conflict» — LAN’dagi boshqa kompyuter shu bot tokeni bilan ishlayotgani (ma‘lum) |
| PL-15 | *Ixtiyoriy, texnik:* sinov muddati tugagan, to‘lanmagan kompaniyani worker 10 daqiqada avtomatik bloklashi (D33) | Holat «Bloklangan», sabab «Obuna muddati tugadi…»; qoplovchi to‘lov yozilsa o‘zi ochiladi; qo‘lda qo‘yilgan blokni to‘lov ochmaydi. Muddatni o‘tkazish uchun bazada sana o‘zgartiriladi — buni dasturchi bajaradi |

Batafsil: `PLATFORMA_ROLLARI_D21_TEST_CASES.md`.

## 15. Interfeys, bildirishnoma, Telegram, audit

| ID | Qadam | Kutilgan natija |
|---|---|---|
| UI-01 | Tilni RU ga almashtiring, 5 ta sahifani ko‘ring (Bosh sahifa, Smeta, Ombor, Moliya, Profil) | Hamma yozuv ruscha; o‘zbekcha qolgan yoki `page.xxx` kabi kalit ko‘rinmaydi |
| UI-02 | Profil → Shrift o‘lchami → Katta, sahifani yangilang; keyin O‘rtacha | Butun ilova kattalashadi va saqlanadi; O‘rtacha — avvalgi holat |
| UI-03 | Summa maydoniga `3000000`, `65,4`, `1250.50` | `3 000 000`, `65,4`, `1 250.50`; saqlangan qiymat to‘g‘ri |
| UI-04 | Ro‘yxatlarda qidiruv va sahifalash (Obyektlar, Ombor harakatlari, Birlamchi hujjatlar) | Qidiruv ishlaydi; keyingi sahifa; jamlar filtrga mos (serverdan) |
| UI-05 | Brauzer oynasini telefon kengligiga (≈ 375 px) toraytiring | Menyu tugma orqali ochiladi; gorizontal aylantirish yo‘q |
| UI-06 | Qo‘ng‘iroqcha (bildirishnomalar) — brigadir, prorab, ombor mudiri | Yuqoridagi amallar bo‘yicha xabarlar; bosilganda tegishli sahifa ochiladi (jo‘natma/sarf → Harakatlar) |
| UI-07 | Admin → Bosh sahifa: davr va obyekt filtri | KPI, xarajat grafigi, moliya bloki filtrga mos; ma‘lumot yo‘q bo‘lsa bo‘sh holat |
| UI-08 | Prorab va brigadir → Bosh sahifa | Pul yo‘q; hajm va vazifalar bor |
| UI-09 | Admin → Integratsiyalar → Telegram ulash (bot sozlangan bo‘lsa); brigadir botdan progress yuboradi | Bot menyusi rolga mos; saytda «Yuborilgan» hisobot paydo bo‘ladi |
| UI-10 | Admin → Audit jurnali → filtr va Excel | Yuqoridagi amallar ijrochi nomi bilan; Excel yuklanadi |
| UI-11 | Admin → Fayllar | Hisobot fotosi va yuklangan fayllar ro‘yxatda, ochiladi |
| UI-12 | Chiqish → orqaga tugmasi | Ichki sahifa ochilmaydi, login sahifasi |

Batafsil: `TUGMA_SHRIFT_TEST_CASES.md`, `FIKR_2026_10_12_TEST_CASES.md`.

---

## 16. Tozalash (majburiy)

1. Hamma oynalardan chiqing.
2. `backend` papkasida: `npm run qa:cleanup -- QA-TOLIQ-1`. Natijada `"deleted": true`. 10–11-bo‘limlar uchun boshqa `QA-` kompaniya ochilgan bo‘lsa — uni ham, yoki `npm run qa:cleanup -- --all-qa`.
3. Egasi → Mijozlar: «QA To‘liq MCHJ» yo‘q; `qa.admin` bilan kirish — «Login yoki parol xato».
4. `docker compose ps` — hamma konteyner ishlayapti; haqiqiy kompaniyalar joyida.

Tozalash faqat `QA-` bilan boshlangan kompaniyani o‘chiradi.

## 17. Natijalar

**Yig‘ma:** jami ___ qator · o‘tdi ___ · yiqildi ___ · ma‘lum nuqson ___ · o‘tkazib yuborildi ___
**Sinovchi:** ________ **Sana:** ________ **Commit:** `git rev-parse --short HEAD` → ________

| ID | Nima qilindi | Kutilgan | Haqiqiy natija | Skrinshot |
|---|---|---|---|---|
| | | | | |
