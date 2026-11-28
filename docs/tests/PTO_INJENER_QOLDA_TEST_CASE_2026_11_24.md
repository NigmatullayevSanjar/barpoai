# BARPO AI — PTO injeneri roli (qo‘lda test case, 2026-11-24)

> **Qamrov:** D44 — yangi rol «PTO injeneri» (`pto_engineer`): xodim yaratish, menyu, «PTO paneli», smeta, F-2/F-3 dalolatnoma, hisobotlarni tasdiqlash, ombor qoldig‘i, taqiqlar, ruxsatlar matritsasi, Telegram. Shu bilan N-02 (bosh muhandis dalolatnomani ocholmasdi) tuzatilgani tekshiriladi.
> **Kim uchun:** platformani qo‘lda sinovchi odam (egasi yoki QA). Har qatorda nima bosish va ekranda nima chiqishi yozilgan.
> **Davomiyligi:** 1–1,5 soat. 1–3-bo‘limlar ketma-ket bajariladi, 4–11-bo‘limlar ulardan keyin istalgan tartibda.
> **Ilova:** smeta importi uchun `docs/research/NAMUNA_SMETA_FORM5_2026_11_10.xlsx` (sintetik, ko‘rsatish xavfsiz).
> **Qoidalar manbai:** `docs/backend/BARPO_BUSINESS_RULES.md` («PTO injeneri roli» bo‘limi), D44 qarori `docs/TZ_VA_NARX_REJASI.md` da.

---

## 0. Sinovdan oldin

### 0.1. Muhit

1. `backend` papkasida: `docker compose up -d --build`. `docker compose logs migrate` → «Migratsiyalar bajarildi.», `039_pto_engineer_role.sql` qo‘llangan bo‘lishi kerak.
2. `frontend` papkasida: `pnpm dev`. Brauzerda **`http://localhost:5173`** oching.
3. Uchta alohida brauzer profili (yoki inkognito) oching: **A** — kompaniya admini, **B** — PTO injeneri, **C** — bosh muhandis. Prorab uchun 4-profil (**D**) 6-bo‘limda kerak.
4. Har oynada F12 → Console ochiq tursin. Qizil xato chiqsa, skrinshot oling va qadamni «Yiqildi» deb belgilang.

### 0.2. Sinov ma‘lumotlari (nomlar qat’iy)

| Narsa | Qiymat |
|---|---|
| Kompaniya | platforma egasi yaratgan sinov kompaniyasi, ro‘yxat raqami `QA-PTO-1`, domen `qa-pto-1` |
| PTO injeneri | login `qa.pto`, ism «QA PTO» |
| Bosh muhandis | login `qa.bosh`, ism «QA Bosh muhandis» |
| Prorab | login `qa.prorab`, ism «QA Prorab» |
| Obyekt | «QA PTO obyekti» |

- Ro‘yxat raqami albatta `QA-` bilan boshlansin: oxirida tozalash shunga qaraydi.
- Parollar hech qayerga (hujjat, chat, skrinshot) yozilmaydi.

### 0.3. Natijani yozish

Har qatorga: **O‘tdi / Yiqildi / O‘tkazib yuborildi** va yiqilgan bo‘lsa, izoh va skrinshot nomi.

---

## 1. Xodim yaratish (admin, A-oyna)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| PTO-01 | A: «Obyektlar» → «QA PTO obyekti» obyektini yarating | Obyekt ro‘yxatda paydo bo‘ladi |
| PTO-02 | A: «Xodimlar» → «Xodim qo‘shish» → «Rol» ro‘yxatini oching | Ro‘yxatda **«PTO injeneri»** bor; «Brigadir» yo‘q |
| PTO-03 | A: login `qa.pto`, ism «QA PTO», rol «PTO injeneri», obyekt «QA PTO obyekti», boshlang‘ich parol → «Saqlash» | Xodim yaratiladi; ro‘yxatda rol ustunida «PTO injeneri» |
| PTO-04 | A: xuddi shunday `qa.bosh` (rol «Menejer» / bosh muhandis) va `qa.prorab` (rol «Prorab») yarating, ikkalasini ham obyektga biriktiring | Ikkala xodim yaratiladi |
| PTO-05 | A: «Xodimlar» ro‘yxatida rol filtri → «PTO injeneri» | Faqat «QA PTO» qoladi |
| PTO-06 | A: tilni rus tiliga almashtiring | Rol nomi **«Инженер ПТО»**; tilni qaytaring |
| PTO-07 | A: yana `qa.pto` loginli xodim qo‘shishga urining | Login maydoni ostida «Bu login kompaniyangizda band …» xabari (`LOGIN_TAKEN`), xodim yaratilmaydi |

## 2. Birinchi kirish (PTO, B-oyna)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| PTO-08 | B: domen `qa-pto-1`, login `qa.pto`, boshlang‘ich parol bilan kiring | Parolni almashtirish sahifasi ochiladi, boshqa sahifalar ochilmaydi |
| PTO-09 | B: yangi parol kiriting → saqlang | Bosh sahifa ochiladi; yuqori o‘ng burchakda ism «QA PTO» va rol «PTO injeneri» |

## 3. Menyu va «PTO paneli» (B-oyna)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| PTO-10 | B: chap menyuni ko‘ring | Aynan shu bandlar: **Bosh sahifa, Obyektlar, Smetalar, Vazifalar, Xomashyolar, Hisobotlar**. «Xodimlar», moliya bandlari, «Rollar va ruxsatlar», «Billing», «Sozlamalar» yo‘q |
| PTO-11 | B: «Bosh sahifa» | Sarlavha **«PTO paneli»**, ostida «Smetalar, bajarilgan ish hajmi, tekshiruvdagi hisobotlar va budjetdan oshgan obyektlar» |
| PTO-12 | B: panel kartalari (smeta hali yo‘q) | 4 ta karta: «Faol obyektlar» (1), «Jami smeta summasi» (0), «Tekshiruvdagi hisobotlar» (0), «Bajarilgan vazifalar» («—» yoki 0%). Statik demo raqam yo‘q |
| PTO-13 | B: pastdagi bloklar | «Budjetdan oshgan obyektlar» (bo‘sh holat), «E’tibor talab qiladiganlar» (bo‘sh holat), «Tizimdagi faol obyektlar» jadvalida «QA PTO obyekti» |
| PTO-14 | B: obyekt filtri va davr (oylar) filtrini almashtiring | Raqamlar qayta yuklanadi, xato chiqmaydi |
| PTO-15 | B: rus tiliga o‘ting | «Панель ПТО», menyu va kartalar rus tilida; tilni qaytaring |

## 4. Smeta (B-oyna)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| PTO-16 | B: «Smetalar» → yangi smeta, obyekt «QA PTO obyekti»; ish qatori «Suvoq», m², 100, narx `25 000` → saqlang | Smeta yaratiladi; narx va summa ko‘rinadi (2 500 000) |
| PTO-17 | B: qatorni tahrirlang (miqdor 120) → saqlang | Summa 3 000 000 bo‘ladi; sahifa yangilangach ham saqlanib qoladi |
| PTO-18 | B: «Smetalar» → Excel import → `NAMUNA_SMETA_FORM5_2026_11_10.xlsx` (Form 5) → oldindan ko‘rish → import | Import muvaffaqiyatli; Excel jamlari bilan mos (ВСЕГО ЗАТРАТ 75 537 564) |
| PTO-19 | B: smeta kartasida arxivlash (o‘chirish) tugmasini qidiring | Tugma **yo‘q** (smeta arxivi faqat adminda, D24) |
| PTO-20 | A: o‘sha smetani oching | Admin PTO yaratgan smetani ko‘radi va arxivlay oladi (arxivlamang) |

## 5. Dalolatnoma F-2/F-3 (B va C-oynalar)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| PTO-21 | B: smeta kartasida **«Dalolatnoma (F-2/F-3)»** tugmasi | Tugma ko‘rinadi |
| PTO-22 | B: tugmani bosing (joriy oy) | Oyna ochiladi, xato yo‘q; bajarilgan ish bo‘lmasa bo‘sh holat va uch jamg‘arma (boshidan, yil boshidan, davr) |
| PTO-23 | B: davrni oy ↔ sana oralig‘iga almashtiring, keyin «Excel» | `akt-*.xlsx` yuklanadi; ichida F-2 va F-3 varaqlari |
| PTO-24 | C: `qa.bosh` bilan kiring → o‘sha smeta → «Dalolatnoma (F-2/F-3)» | **Oyna ochiladi (N-02 tuzatildi)**: avval 403 «ruxsat yo‘q» xatosi chiqardi |
| PTO-25 | D: `qa.prorab` bilan kiring → o‘sha smeta | Narx va «Dalolatnoma» tugmasi ko‘rinmaydi (prorab pul ko‘rmaydi, D20) |

## 6. Hisobotlar (B va D-oynalar)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| PTO-26 | D: prorab «Hisobotlar» → kunlik hisobot, smeta qatori «Suvoq», hajm 20 → yuboring | Hisobot «Tekshiruvda» holatida |
| PTO-27 | B: «Bosh sahifa» | «Tekshiruvdagi hisobotlar» = 1; «E’tibor talab qiladiganlar»da shu band |
| PTO-28 | B: «Hisobotlar» → hisobotni oching → «Qabul qilish» | Hisobot qabul qilinadi; smeta qatori faktida 20 m² paydo bo‘ladi |
| PTO-29 | D: yana hisobot yuboring; B: uni izoh bilan **qaytaring** | Prorabga qaytgan holat va izoh ko‘rinadi |
| PTO-30 | B: o‘zi ham hisobot yuboring | Hisobot yaratiladi (PTO hisobot yubora oladi) |
| PTO-31 | B: smeta → «Dalolatnoma (F-2/F-3)» (joriy oy) | «Suvoq» qatori 20 m² hajm bilan chiqadi |

## 7. Ombor va vazifalar (B-oyna)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| PTO-32 | B: «Xomashyolar» | Qoldiqlar ko‘rinadi; «Kirim», «Chiqim», «Storno», «Inventarizatsiya» tugmalari **yo‘q** |
| PTO-33 | B: «Vazifalar» | Vazifalar ro‘yxati ko‘rinadi; «Vazifa qo‘shish» tugmasi **yo‘q** |

## 8. Taqiqlar (B-oyna, manzil satri orqali)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| PTO-34 | B: manzil satriga `http://localhost:5173/app/finance` yozing | «Bu sahifaga ruxsat yo‘q» va «Bosh sahifaga» tugmasi |
| PTO-35 | B: `.../app/employees` | «Bu sahifaga ruxsat yo‘q» |
| PTO-36 | B: `.../app/permissions` va `.../app/settings` | «Bu sahifaga ruxsat yo‘q» |
| PTO-37 | B: «Obyektlar» sahifasi | «Obyekt qo‘shish» tugmasi yo‘q; obyekt kartasida blok/zona qo‘shish yo‘q |
| PTO-38 | A: «QA PTO obyekti» kartasidagi «Mas’ul» | Prorab yoki bosh muhandis ko‘rsatiladi, **PTO injeneri emas** |

## 9. Ruxsatlar matritsasi (A va B-oynalar)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| PTO-39 | A: «Rollar va ruxsatlar» → rol tanlovi | «PTO injeneri» ro‘yxatda bor; standart belgilar 1–8-bo‘limlarga mos |
| PTO-40 | A: PTO uchun «Smetalar» → «O‘zgartirish»ni o‘chiring → saqlang | Saqlanadi |
| PTO-41 | B: sahifani yangilang → smeta qatorini tahrirlashga urining | Tahrirlash tugmasi yo‘q; API ga to‘g‘ridan so‘rov 403 |
| PTO-42 | A: belgini qaytaring → B: yangilang | Tahrirlash yana ishlaydi |

## 10. Telegram (agar bot ulangan bo‘lsa)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| PTO-43 | B: «Profil» → Telegram ulash → botda `/start` | Bot profilda rolni **«PTO injeneri»** deb ko‘rsatadi |
| PTO-44 | Botdagi menyu tugmalari | Aynan: «🏗 Obyektlar», «📈 Hisobotlar», «🔔 Bildirishnomalar», «👤 Profil» («Vazifalar» va «Moliya» yo‘q) |
| PTO-45 | «🏗 Obyektlar» | «QA PTO obyekti» ro‘yxatda |

## 11. Platforma tomoni (platforma egasi)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| PTO-46 | Egasi: «Mijozlar» → `QA-PTO-1` → Foydalanuvchilar | `qa.pto` qatorida rol «PTO injeneri» |
| PTO-47 | Egasi: tuzatish orqali foydalanuvchi rolini almashtirish ro‘yxati | «PTO injeneri» tanlash mumkin |

## 12. Tozalash

| ID | Qadam | Kutilgan natija |
|---|---|---|
| PTO-48 | `backend` papkasida: `npm run qa:cleanup -- QA-PTO-1` | `"cleaned"` ro‘yxatida `QA-PTO-1` |
| PTO-49 | Egasi: «Mijozlar» ro‘yxati | `QA-PTO-1` yo‘q; boshqa kompaniyalar joyida |

---

## Ilova: avtomatik tekshiruv natijalari (2026-11-24)

| To‘plam | Natija |
|---|---|
| Unit (`npm test`) | 41 / 41 o‘tdi |
| Integratsiya (`npm run test:integration`) | 113 tekshiruv o‘tdi (yangi D44 tekshiruvi bilan) |
| Rol matritsasi (`npm run test:roles`) | 10 rol × barcha GET marshrutlar, topilma yo‘q |
| UI (`npm run test:ui`) | 69 tekshiruv o‘tdi |
| Frontend | `pnpm typecheck`, `pnpm build` xatosiz |

Jonli lokal stack (alohida `QA-PTO-*` kompaniya, keyin o‘chirildi):

| ID | Tekshiruv | Natija |
|---|---|---|
| L-01 | Kompaniya va admin ro‘yxatdan o‘tishi | O‘tdi |
| L-02 | Admin `pto_engineer` xodim yaratadi, parol almashtiriladi, obyektga biriktiriladi | O‘tdi |
| L-03 | `/v1/me/permissions` — 12 ta kutilgan huquq | O‘tdi |
| L-04 | Dashboard: smeta/xarajat bloki bor, moliya va xodimlar bloki yo‘q | O‘tdi |
| L-05 | PTO smeta yaratadi, narx ko‘rinadi | O‘tdi |
| L-06 | PTO dalolatnomani ochadi va Excel’ga chiqaradi | O‘tdi |
| L-07 | Bosh muhandis dalolatnomani ochadi (N-02) | O‘tdi |
| L-08 | PTO: obyekt yaratish, moliya, xodimlar — 403 | O‘tdi |
| L-09 | PTO smetani arxivlay olmaydi — 403 | O‘tdi |
