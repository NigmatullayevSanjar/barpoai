# Platforma rollari (D21): super admin va support — qo‘lda test

> **Sana:** 2026-10-22. **Qamrov:** branch `claude/platform-roles-d21` (`claude/figma-stage-1` ustidan), qaror D21 (`docs/TZ_VA_NARX_REJASI.md`), migratsiya 024.
>
> **Bu ishda nima o‘zgardi:**
> - **Super admin** endi butun platforma admini. U egasining barcha amallarini bajaradi, platforma xodimlarini, ruxsatlarni va umumiy auditni boshqaradi, kompaniya xatolarini tuzatadi. Unga Telegram 2FA majburiy.
> - **Support** ko‘radi, murojaatlarga javob beradi, diagnostikani ko‘radi va kompaniya foydalanuvchisiga parol tiklash havolasini beradi.
> - **Egasi ustun turadi:** uni hech kim bloklamaydi va rolini o‘zgartirmaydi. Egasining parolini super admin tiklaydi.
>
> **Avtomatik testlar** (`TZ=UTC`, 2026-10-22): unit 27/27, integration 84/84 (D21 uchun 7 ta yangi), roles 5/5, UI 51/51 (D21 uchun 2 ta yangi).
> **Natija fayli:** `docs/tests/PLATFORMA_ROLLARI_D21_NATIJA.md` (ID, natija, izoh, skrinshot).

---

## 0. Tayyorgarlik

1. Branch’ni oling: `git switch claude/platform-roles-d21`.
2. `backend` papkasida `docker compose up --build -d` ni ishga tushiring. Migratsiya 024 (`platform_role_permissions`) qo‘llanadi. Tekshirish: `docker compose logs migrate` → “Migratsiyalar bajarildi.”
3. `frontend` papkasida `pnpm dev` ni ishga tushirib, `http://localhost:5173` ni oching.
4. Kerakli hisoblar:
   - **Platforma egasi** (lokal `platform.owner`).
   - **Kompaniya admini** va kamida bitta xodim (lokal `sinov.admin`, `sinov.menejer`).
   - **Super admin va support** hisoblarini ST-01 da egasi o‘zi yaratadi.
5. Super admin uchun Telegram kerak, chunki bot `backend/.env` da sozlangan. Uni ulash uchun haqiqiy Telegram akkaunti kerak bo‘ladi.
6. Har bir hisobni alohida brauzer profilida yoki inkognito oynada oching. Konsol (F12) ochiq tursin.

Natija qiymatlari: **o‘tdi**, **yiqildi** (qadam, kutilgan va haqiqiy natija, skrinshot), **o‘tkazib yuborildi** (sababi bilan).

**Xato deb hisoblanmaydi:**
- Tuzatish hujjatlari (storno, ish hajmi) kompaniyada **admin nomidan** ko‘rinadi. Sababi: hujjat faqat kompaniya foydalanuvchisiga bog‘lana oladi. Kim bajargani auditda va izohdagi “BARPO AI (…)” yozuvida turadi.
- Super admin kompaniyaning obyekt, smeta, ombor va moliya sahifalarini ko‘rmaydi. Faqat tuzatiladigan yozuvning qisqa ma’lumotini ko‘radi.

---

## 1. Egasi: platforma xodimlari

| ID | Qadam | Kutilgan natija |
|---|---|---|
| ST-01 | `platform.owner` bilan kiring → menyu → “Texnik xodimlar” → “Xodim qo‘shish”. Avval super admin (`sa.test`), keyin support (`sup.test`) yarating | Ikkalasi ro‘yxatda chiqadi, holati “Faol · Boshlang‘ich parolni almashtiring” |
| ST-02 | Egasining menyusini tekshiring | 10 band bor: Bosh sahifa, Mijozlar, Tariflar, Daromad va qarz, Qarzdorlar, Murojaatlar, Texnik xodimlar, Platforma ruxsatlari, Audit, Diagnostika |
| ST-03 | Egasi `sup.test` qatorida rolni o‘zgartiradi, keyin faolsizlantiradi va qayta faollashtiradi | Har amaldan keyin saqlanadi. O‘sha xodimning sessiyasi tugaydi |
| ST-04 | Egasining o‘z qatoriga qarang | Rol tanlash va faolsizlantirish tugmalari yo‘q |

## 2. Super admin: majburiy 2FA

| ID | Qadam | Kutilgan natija |
|---|---|---|
| TF-01 | `sa.test` bilan kiring va parolni almashtiring | Profil sahifasi ochiladi. Qizil ogohlantirish: “Super admin uchun Telegram 2FA majburiy…”. Menyu bo‘sh |
| TF-02 | Manzil qatoriga `/admin/tenants` yozing | Yana profilga qaytaradi |
| TF-03 | “Telegramni ulash” → bot havolasini oching → botda tasdiqlang | Bir necha soniyadan keyin karta “Ulangan” bo‘ladi. Menyu qayta kirmasdan ochiladi (10 band) |
| TF-04 | Chiqib, qayta kiring | Paroldan keyin Telegramga 6 xonali kod keladi. Kod bilan kiriladi |
| TF-05 | `sup.test` bilan kiring | Kod so‘ralmaydi, 2FA ogohlantirishi yo‘q. Support 2FA siz ishlaydi |

## 3. Super admin: egasining amallari

| ID | Qadam | Kutilgan natija |
|---|---|---|
| SA-01 | Tariflar → “Yangi tarif versiyasi” (`sa-test`, v1, 1000), so‘ng kartada “Tarifni tahrirlash” | Yaratiladi va tahrirlanadi |
| SA-02 | Mijozlar → “Yangi kompaniya” (uch qadam) → kartada “Yangi havola yaratish” | Kompaniya ochiladi, havola beriladi |
| SA-03 | Kompaniya kartasi → “Tarif biriktirish”, “Invoys chiqarish”, invoys qatorida “To‘lov yozish” | Uchalasi ham ishlaydi |
| SA-04 | Faol kompaniya kartasi → “Tahrirlash”, “Bloklash” (sabab bilan), so‘ng “Qayta ochish” | Ishlaydi. Bloklanganda kompaniya foydalanuvchilarining sessiyasi tugaydi |
| SA-05 | Diagnostika va Murojaatlar (javob yozish, yakunlash) | Ishlaydi |

## 4. Platforma ruxsatlari (`/admin/permissions`)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| PR-01 | Super admin bilan sahifani oching | Jadval: 11 ta ruxsat × Platforma egasi / Super admin / Texnik yordam. Egasi ustunida hammasi belgilangan va o‘zgarmaydi. Support uchun standart: Parol tiklash, Murojaatlarga javob, Diagnostika |
| PR-02 | Support ustunida “Umumiy audit” ni belgilab, “Saqlash” bosing | “Ruxsatlar saqlandi” xabari chiqadi. `sup.test` sahifani yangilasa, menyuda “Audit” paydo bo‘ladi |
| PR-03 | “Standart qiymatlar” → “Saqlash” | Support yana standart holatga qaytadi, “Audit” yo‘qoladi |
| PR-04 | Super admin o‘z ustunidan “Invoys va to‘lov” ni olib, saqlaydi. So‘ng kompaniya kartasini ochadi | “Invoys chiqarish” va “To‘lov yozish” tugmalari yo‘qoladi. Egasi PR-01 sahifasida qaytarib beradi va tugmalar qaytadi |
| PR-05 | Supportga “Platforma ruxsatlari” berilgan bo‘lsin, u sahifani ochsin | Super admin ustuni nofaol. Ogohlantirish: “Super admin ruxsatlarini faqat egasi yoki super admin o‘zgartiradi”. Sinovdan keyin standartga qaytaring |

## 5. Support

| ID | Qadam | Kutilgan natija |
|---|---|---|
| SU-01 | `sup.test` menyusini tekshiring | 7 band: Bosh sahifa, Mijozlar, Tariflar, Daromad va qarz, Qarzdorlar, Murojaatlar, Diagnostika |
| SU-02 | Kompaniya kartasi | “Tahrirlash”, “Bloklash”, “Tarif biriktirish”, “Invoys chiqarish” yo‘q. Admin qatorida va “Foydalanuvchilar” jadvalida “Havola yaratish” (parol tiklash) bor |
| SU-03 | Kompaniya xodimiga “Havola yaratish” | 30 daqiqalik havola chiqadi, nusxa olinadi. Havola bilan yangi parol qo‘yiladi |
| SU-04 | “Foydalanuvchilar” jadvalida faolsizlantirish, “Sessiyalarni bekor qilish”, “Telegramni uzish”, “Admin qilish” tugmalarini qidiring | Bu tugmalar yo‘q |

## 6. Umumiy audit (`/admin/audit`)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| AU-01 | Super admin bilan sahifani oching | Sarlavha “Umumiy audit”. Hammasi / Platforma / Kompaniyalar tanlovi, kompaniya, rol, amal va sana filtrlari bor |
| AU-02 | “Kompaniyalar” → kompaniyani tanlang | Faqat shu kompaniya yozuvlari: Kompaniya ustunida nomi, “Kim” ustunida xodim va uning roli (masalan, Prorab) |
| AU-03 | “Platforma” | Faqat platforma yozuvlari: “Kompaniya” ustunida “Platforma” |
| AU-04 | Rol: “Ombor mudiri” | Faqat ombor mudiri harakatlari |
| AU-05 | Amal maydoniga `stock.receipt` yozing | Kirim yozuvlari, har qatorda “Tuzatish” tugmasi |

## 7. Kompaniya foydalanuvchilari (kompaniya kartasi → “Foydalanuvchilar”)

Sinov uchun admin bo‘lmagan, qo‘lida materiali va ochiq vazifasi yo‘q xodimni oling (masalan, `sinov.menejer`).

| ID | Qadam | Kutilgan natija |
|---|---|---|
| TU-01 | Jadvalga qarang | Ism, login, rol, holat, Telegram, faol sessiyalar soni ko‘rinadi |
| TU-02 | Xodim brauzerda kirgan bo‘lsin → “Sessiyalarni bekor qilish” (sabab: “Shubhali kirish”) | Xodim keyingi bosishda login sahifasiga tushadi. Sessiyalar soni 0 |
| TU-03 | “Faolsizlantirish” (sabab bilan), so‘ng xodim kirishga urinsin, keyin “Faollashtirish” | Faolsizlantirilganda kira olmaydi, faollashtirilgach kiradi |
| TU-04 | Telegrami ulangan xodimda “Telegramni uzish” | Telegram ustuni “—” bo‘ladi. Xodim profilida “Ulanmagan” |
| TU-05 | “Admin qilish” → amaldagi adminning yangi roli “Menejer”, sabab bilan | Tanlangan xodim kompaniya admini bo‘ladi, eski admin “Menejer” bo‘ladi. Ikkalasi qayta kiradi. Yangi admin bildirishnoma oladi |
| TU-06 | Kompaniyaning o‘zida (yangi admin bilan) Audit sahifasi | TU-02…TU-05 yozuvlari super admin nomi bilan, `platform_correction` belgisi bilan chiqadi |

## 8. Kompaniya xatolarini tuzatish (umumiy auditdan)

| ID | Qadam | Kutilgan natija |
|---|---|---|
| CR-01 | Kompaniyada ombor mudiri sinov kirimini qiladi (masalan, 2 dona). Super admin AU-05 dagi shu qatorda “Tuzatish” bosadi | “Ombor harakatini storno qilish” oynasi: tur, material, miqdor, holat, obyekt, kim kiritgan. Sabab maydoni |
| CR-02 | Sabab bilan “Storno qilish” | “Tuzatish bajarildi” xabari chiqadi. Kompaniya omborida kirim qoldig‘i kamayadi. Harakatlar ro‘yxatida reversal izohi “BARPO AI (…)” bilan boshlanadi. Kompaniya adminiga bildirishnoma boradi |
| CR-03 | Shu qatorni yana oching | “Bu yozuv allaqachon storno qilingan”, tugma nofaol |
| CR-04 | Moliyaviy hujjat yozuvida (`finance.` amallari) xuddi shunday storno | Hujjat storno qilinadi. Unga bog‘langan to‘lovi bo‘lsa, avval to‘lovni storno qilish so‘raladi |
| CR-05 | Qabul qilingan hisobot yozuvi (`report.accepted`) → “Tuzatish” → ishni tanlab, farq `1` | “Bajarilgan ish hajmini tuzatish”. Hozirgi hajm ko‘rinadi. Saqlangach hajm 1 ga oshadi, hisobot muallifiga bildirishnoma boradi |
| CR-06 | CR-05 da farq `-1000` | Xato: natija manfiy bo‘lmaydi |
| CR-07 | Admini yo‘q (hali ro‘yxatdan o‘tmagan) kompaniyada tuzatish | “Kompaniyada faol admin yo‘q: avval adminlikni o‘tkazing” |

## 9. Egasi ustunligi

| ID | Qadam | Kutilgan natija |
|---|---|---|
| OW-01 | Super admin → Texnik xodimlar → egasi qatori | Faqat “Havola yaratish” (parol tiklash) bor. Rol va faolsizlantirish yo‘q |
| OW-02 | Super admin egasiga havola yaratadi | Havola super adminga ko‘rsatiladi. Egasining ochiq sessiyalari tugaydi. Egasi havola bilan yangi parol qo‘yadi |
| OW-03 | Super admin o‘zining qatoriga qaraydi | Hech qanday amal tugmasi yo‘q (o‘zini o‘zgartirmaydi va tiklamaydi) |
| OW-04 | Egasi → Texnik xodimlar → `sa.test` → “Faolsizlantirish” | Super admin chiqariladi va kira olmaydi |
