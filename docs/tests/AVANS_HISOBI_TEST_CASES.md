# Avans hisobi va subpudratchi — qo‘lda test case’lar (D22, 2026-10-26)

**Tayyorgarlik:** “Test obyekt” va “B obyekt”, bitta bank yoki kassa hisobi (mablag‘ kirimi bilan). Kirish: mijoz admini; R-03 uchun buxgalter, finansist va prorab ham.

| ID | Qadam | Kutilgan natija |
|---|---|---|
| AV-01 | Moliya → Kontragentlar → “Kontragent qo‘shish”: turi ro‘yxatini oching | “Pudratchi” yo‘q, o‘rnida **“Subpudratchi”** (ru: “Субподрядчик”). “Usta Subpudrat” nomli subpudratchi saqlanadi |
| AV-02 | Bank va kassa → “Operatsiya qo‘shish” → Avans berish, Usta Subpudrat, 3 000 000 | Kassa 3 000 000 ga kamayadi; Kontragentlar: avans 3 000 000 |
| AV-03 | Hisoblar va dalolatnomalar → “Invoys / dalolatnoma” → Xizmat yoki Ish haqi / mehnat, Usta Subpudrat, 10 000 000 | Qatorda “To‘lash” va **“Avansdan yopish”** tugmalari |
| AV-04 | “Avansdan yopish” | Summa 3 000 000 oldindan to‘ldirilgan, kassa maydoni yo‘q. Saqlangach: to‘langan 3 000 000, qoldiq 7 000 000, “Avansdan yopish” tugmasi yo‘qoladi; kassa o‘zgarmaydi |
| AV-05 | Kontragentlar va Solishtirish (Usta Subpudrat) | Kontragentlar: qarz 7 000 000, avans 0. Solishtirishda yurib boruvchi qoldiq ham 7 000 000 — ikki sahifa bir xil |
| AV-06 | “To‘lash” → 7 000 000 | Dalolatnoma “To‘langan”, qarz 0, avans 0. Yana 1 so‘m to‘lashga urinish — “Summa hujjat qoldig‘idan oshadi” |
| AV-07 | Birlamchi hujjatlar | “Avans hisobi” turidagi hujjat ko‘rinadi |
| AV-08 | Dalolatnomani “Reversal” tugmasi bilan teskari qilish | Rad etiladi: “Avval bog‘langan to‘lov va avans hisoblarini teskari qiling.” |
| AV-09 | AV-02 dagi avansni “Reversal” bilan teskari qilish | Rad etiladi: “Avans hujjatga hisoblangan. Avval avans hisobini teskari qiling.” |
| AV-10 | “Avans hisobi” hujjatini teskari qilish | Qarz 3 000 000 va avans 3 000 000 qaytadi; dalolatnomada yana “Avansdan yopish” chiqadi |
| AV-11 | “B obyekt” da shu subpudratchiga 500 000 avans; “Test obyekt” da yangi 2 000 000 dalolatnoma | “Avansdan yopish” summasi faqat “Test obyekt” avansidan (B obyekt avansi qo‘shilmaydi) |
| AV-12 | Ish haqi davrini yopish (xodim), xodimga avans | Ish haqi hujjatida “Avansdan yopish” chiqmaydi — u “Ish haqi va xodimlar” sahifasidan to‘lanadi |
| R-03 | Buxgalter, finansist va prorab bilan Hisoblar sahifasi | Buxgalter “Avansdan yopish” ni ko‘radi va bajaradi; finansistda tugma yo‘q (API 403); prorabda moliya sahifalari yo‘q |

Natijani har qator uchun “o‘tdi / yiqildi + qadam va haqiqiy natija” shaklida yozing.
