# Bosqich 3, 2, 4, 1.4 va kichik tuzatishlar — test case’lar

> **Sana:** 2026-10-12. **Holat:** hammasi `main` da (`0542d87`, PR #1–#6).
> **Qamrov:** `docs/TZ_VA_NARX_REJASI.md` dagi Bosqich 3 (xonadonlar), 2 (UZS/USD), 4 (narx varaqasi), 1.4 (dashboard grafiklari) va 9.4 dagi O1, O4–O8, O10.
> **Natija fayli:** `docs/tests/BOSQICH_2_3_4_NATIJA.md` (8-bo‘lim formati).

**“Qanday” ustuni**

| Belgi | Ma’nosi |
|---|---|
| **A** | Mavjud avtomatik test qamraydi (`backend/scripts/*`, `backend/tests/*`). Ustunda test nomi yoki fayli. |
| **B** | Brauzerda qo‘lda tekshiriladi, lokal stack’da (`docker compose up --build -d`, `pnpm dev`). |

---

## 0. Muhit va tayyorgarlik

- Avtomatik testlar o‘z vaqtinchalik PostgreSQL konteynerini ochadi, lokal bazaga tegmaydi. Ular `docs/backend/` dagi hisobot fayllarini qayta yozadi — natija yozilgach `git checkout -- docs/backend` bilan qaytariladi (haqiqiy hujjat o‘zgarmagan bo‘lsa).
- Docker testlari ketma-ket ishga tushiriladi. Windows PowerShell’da `npm.cmd`, `pnpm.cmd` yoki `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
- B testlari uchun parollarni foydalanuvchi o‘zi kiritadi; hech qayerga yozilmaydi.
- Yiqilgan test **tuzatilmaydi**: takrorlash qadamlari, kutilgan va haqiqiy natija natija fayliga yoziladi.

**B testlari uchun ma’lumot (yangi, bo‘sh bazada bir marta):**

1. Platforma egasi (`npm.cmd run bootstrap`) → kirish → “Mijozlar” → yangi kompaniya “TEST-QURILISH” → taklif havolasi.
2. Havola bilan kompaniya admini ro‘yxatdan o‘tadi; admin sifatida kirish.
3. Obyekt **“Test obyekt”**. Zonalar: **“A blok”** (tur: blok, qavatlar 9) va uning ichida **“1-kirish”** (tur: kirish yo‘lagi); **“B blok”** (blok); **“Hovli”** (boshqa).
4. Xodim: **finansist** (obyektga biriktirilgan) va **prorab** (obyektga biriktirilgan). Har biri birinchi kirishda parolni almashtiradi.
5. Narx varaqasi uchun xarajat ma’lumotlari — 5-bo‘limdagi **NV-00**.

---

## 1. Avtomatik buyruqlar

| ID | Buyruq | Kutilgan natija (2026-10-12, `0542d87`) |
|---|---|---|
| AUTO-01 | `backend`: `npm run build` | Xatosiz |
| AUTO-02 | `backend`: `npm test` | 27/27 (xonadon importi, CBU, konvertatsiya, narx hisobi) |
| AUTO-03 | `backend`: `npm run test:integration` | 65 o‘tdi, `failed: []` |
| AUTO-04 | `backend`: `npm run test:roles` | 5/5, `findings: []`, `unfillable: []` |
| AUTO-05 | `backend`: `npm run test:ui` | 47 tekshiruv, “No uncaught React/browser errors” |
| AUTO-06 | `backend`: `npm run docs`, keyin `git diff --stat docs/backend` | Ikkinchi yurishda farq yo‘q |
| AUTO-07 | `frontend`: `pnpm typecheck`, `pnpm build` | Xatosiz |
| AUTO-08 | `git diff` da secret qidirish | `backend/.env` tracked emas, token yoki parol yo‘q |

---

## 2. Bosqich 3 — xonadonlar

| ID | Qanday | Qadam | Kutilgan natija |
|---|---|---|---|
| XN-01 | A — integration “Premises: number unique…” | Bir blokda bir xil raqam (`12` va ` 12 `, `T-3` va `t-3`) | Ikkinchisi `409 PREMISE_NUMBER_CONFLICT` |
| XN-02 | A — o‘sha | Ikki blokda `12` | Ikkalasi yaratiladi |
| XN-03 | A — o‘sha | Bloksiz zonada (Hovli) va zonasiz `P-1` va `p-1` | `409` (raqam obyekt ichida unikal) |
| XN-04 | A — o‘sha | Blok ichidagi xonadon `40` va Hovlida `40`; “A blok” turini “boshqa” ga o‘zgartirish | Zona tahriri `409 PREMISE_NUMBER_CONFLICT`, blok turi o‘zgarmaydi |
| XN-05 | A — o‘sha | 9 qavatli blokda 10-qavat | `400 FLOOR_ABOVE_BLOCK` |
| XN-06 | A — o‘sha | Arxivlash, shu raqam bilan yangisi, eskisini arxivdan qaytarish | Yangisi yaratiladi; qaytarish `409` |
| XN-07 | A — o‘sha | Prorab yozadi; begona kompaniya o‘qiydi; tenant kontekstisiz SELECT | `403`; `404`; 0 qator (RLS) |
| XN-08 | A — integration “Premises Excel import…” | Shablon (uz/ru), bo‘sh qatorli fayl, qayta yuklash, eskirgan preview | Haqiqiy Excel qator raqamlari; xato bo‘lsa `id=null`; qayta yuklash dublikat yaratmaydi; `PREVIEW_CHANGED` |
| XN-09 | A — `tests/premises.test.ts` | Formula, 501 belgi, `1e21`, `65.30000000000001` | Qator xatosi (`FORMULA_NOT_ALLOWED`, `TOO_LONG`, `INVALID_CELL`); maydon `65.30` |
| XN-10 | B | Obyekt kartasi → “Xonadonlar” → “Xonadon qo‘shish”: raqam `12`, zona “1-kirish”, qavat 3, xonalar 2, maydon `65,4` | Jadvalda qator; blok “A blok”, zona “1-kirish”; “Jami: 1 ta, 65,4 m²” |
| XN-11 | B | Yana `12` ni “A blok” ga qo‘shish | Xato xabari: raqam blokda band (uz va ru matni bor) |
| XN-12 | B | “Shablonni yuklab olish” (UZ va RU tilda) | `.xlsx` ochiladi: 7 ustun sarlavhasi tanlangan tilda, ikkinchi varaqda tur qiymatlari |
| XN-13 | B | Shablonga (Blok, Kirish, Qavat, Raqam, Tur, Xonalar, Maydon): 2-qator `A blok, 1-kirish, 4, 13, Kvartira, 3, 70,5`; 3-qator bo‘sh; 4-qator `C blok, —, 1, 14, Kvartira, 1, 40` → import | Oldindan ko‘rishda 2-qator “Yangi”, 4-qator “Xato: blok topilmadi”; “Import qilish” o‘chiq va sababi yozilgan |
| XN-14 | B | Xatoli qatorni o‘chirib qayta yuklash → “Import qilish” | Natija: yaratildi 1; jadvalda 2 ta xonadon |
| XN-15 | B | Xuddi shu faylni yana import qilish | Hammasi “O‘zgarishsiz”, “Import qilish” o‘chiq — dublikat yo‘q |
| XN-16 | B | Filtrlar: blok “A blok”, qavat 4, tur “Kvartira”, raqam qidiruvi `13`, “Arxivdagilar” | Har filtr serverdan; “Jami” filtr bo‘yicha o‘zgaradi |
| XN-17 | B | Xonadonni arxivlash, “Arxivdagilar” ni yoqish, arxivdan qaytarish | Ro‘yxatlar o‘rtasida ko‘chadi; arxivdagi xonadonni tahrirlash tugmasi yo‘q |
| XN-18 | B | Prorab bilan kirish → shu obyekt → “Xonadonlar” | Ro‘yxat ko‘rinadi; qo‘shish, import va arxiv tugmalari yo‘q |
| XN-19 | B | RU tilida tab, modal va import oynasi | Xom kalit (`premises.xxx`) yo‘q |

---

## 3. Bosqich 2 — UZS/USD almashtirgich

| ID | Qanday | Qadam | Kutilgan natija |
|---|---|---|---|
| VA-01 | A — `tests/rates.test.ts` | CBU javobi: to‘g‘ri, 0, manfiy, matn, noto‘g‘ri sana | To‘g‘risi o‘qiladi, qolganlari rad etiladi |
| VA-02 | A — o‘sha | Konvertatsiya `268125000 ÷ 12800`, `64 ÷ 12800`, katta son | `20947.27`, `0.01` (yarmi yuqoriga), aniq decimal |
| VA-03 | A — integration “CBU USD rate…” | Worker: to‘g‘ri kurs, 12 soat ichida qayta, HTTP/timeout/matn xatosi, `INSERT rate=0` | Saqlanadi; o‘tkazib yuboriladi; oxirgi kurs qoladi; baza rad etadi |
| VA-04 | A — o‘sha | `GET /v1/exchange-rates/latest`: kompaniya xodimi, platforma egasi, kirmagan | 200, 200, 401 |
| VA-05 | A — ui-test “Currency switch…” | Kurssiz USD; kurs bilan hujjatlar jadvali | USD o‘chiq; `500 000 ÷ 12 500 = 40,00 $`, sarlavha “(USD)” |
| VA-06 | B | Worker ishga tushgach (bir necha daqiqa): sidebar pastida UZ/RU yonida UZS/USD | Izoh: “1 USD = 11 9xx,xx so‘m · sana · CBU, joriy kurs bo‘yicha”; `docker compose logs worker` da “CBU rate fetch failed” yo‘q |
| VA-07 | B | USD ni tanlash → Moliya, Hujjatlar, Budjetlar, Smeta kartasi | Summalar `… $` (2 xona), sarlavhalar “(USD)”; sahifani yangilash — tanlov saqlanadi |
| VA-08 | B | USD rejimida moliya hujjati yaratish oynasi | Summa maydoni yorlig‘ida “UZS”; oynadagi summalar so‘mda |
| VA-09 | B | USD rejimida Excel eksport (reja–fakt yoki ombor) | Fayldagi summalar so‘mda |
| VA-10 | B | UZS ga qaytish | Hammasi so‘mda, xato yo‘q |

---

## 4. Bosqich 1.4 — dashboard

| ID | Qanday | Qadam | Kutilgan natija |
|---|---|---|---|
| DB-01 | A — integration “Dashboard charts (stage 1.4)…” | Obyekt va davr filtri, turlar yig‘indisi, storno, budjetdan oshgan, kechikkan vazifalar | Turlar yig‘indisi = davr xarajati; storno asl tur va oyda; “budjetdan oshgan” Budjetlar sahifasi bilan bir xil |
| DB-02 | A — ui-test “Dashboard charts…” | Grafiklar, filtrlar, brigadir | Grafiklar chiziladi; filtr serverdan qayta oladi; brigadirda moliya grafiklari yo‘q |
| DB-03 | B | Admin → Bosh sahifa | Oylik grafik (reja/budjet/fakt), turlar donuti, budjetdan oshgan va kechikkan vazifalar ro‘yxati; ma’lumot yo‘q davrda bo‘sh holat (soxta 0 emas) |
| DB-04 | B | Davr 3 → 6 → 12 oy | Grafik oylar soni o‘zgaradi; davr xarajati KPI o‘zgaradi; “hozirgi holat” izohli sanoqlar o‘zgarmaydi |
| DB-05 | B | Obyekt filtri “Test obyekt” | Barcha bloklar shu obyekt bo‘yicha; biriktirilmagan obyekt ID’si URL’da → “topilmadi” |
| DB-06 | B | USD rejimi | O‘q qiymatlari va summalar dollarda |
| DB-07 | B | Prorab va finansist bilan kirish | Har biri faqat ruxsati bor bloklarni ko‘radi |

---

## 5. Bosqich 4 — narx varaqasi

### NV-00. Qo‘lda tekshiriladigan nazorat misoli (B testlari uchun ma’lumot)

“Test obyekt” da (0-bo‘lim) **faqat** quyidagilar bo‘lsin (boshqa smeta va xarajat yo‘q):

| Ma’lumot | Qiymat |
|---|---|
| Xonadonlar | `A-1` (A blok, 50 m²), `A-2` (A blok, 50 m²), `B-1` (B blok, 100 m²) — jami 200 m² |
| Smeta (ish qatorlari, zona bilan) | A blok **10 000 000**; B blok **20 000 000**; zonasiz **2 000 000** — tayyor fayl: `docs/tests/fixtures/smeta_namuna.xlsx` (Smetalar → Excel import; ustunlar avtomatik moslanadi) |
| Fakt xarajat (xizmat yoki ish hujjati, zona bilan) | A blok **12 000 000**; B blok **5 000 000** |

Kutilgan guruhlar (prognoz = max(reja, fakt)):

| Guruh | Maydon | Reja | Fakt | Prognoz | m² ga |
|---|---:|---:|---:|---:|---:|
| A blok | 100 | 10 000 000 | 12 000 000 | 12 000 000 | 120 000 |
| B blok | 100 | 20 000 000 | 5 000 000 | 20 000 000 | 200 000 |
| Umumiy | 200 | 2 000 000 | 0 | 2 000 000 | 10 000 |

Ustama **20 %** bilan kutilgan qatorlar:

| Xonadon | Tannarx m² | Tannarx | Sotuv m² | Narx |
|---|---:|---:|---:|---:|
| A-1, A-2 | 130 000 | 6 500 000 | 156 000 | 7 800 000 |
| B-1 | 210 000 | 21 000 000 | 252 000 | 25 200 000 |

Σ tannarx = 34 000 000 = Σ prognoz. USD: `sotuv m² ÷ versiya kursi` 1 dollargacha yaxlitlanadi, narx = maydon × shu qiymat (masalan, kurs 12 000 bo‘lsa: A — 13 $/m², 650 $; B — 21 $/m², 2 100 $).

| ID | Qanday | Qadam | Kutilgan natija |
|---|---|---|---|
| NV-01 | A — `tests/pricing.test.ts` | Rejaning 4.4 nazorat misoli | 214 500 000; 3 300 000; 4 125 000; 268 125 000; 322 $; 20 930 $; Σ 26 000 000 000 |
| NV-02 | A — o‘sha | Qoldiq taqsimoti, ichma-ich zonalar, xonadonsiz zona, yaxlitlash chegarasi, xonadon/xarajat yo‘q | Invariant tiyinigacha; xonadonsiz zona — eng yaqin xonadonli ota zonaga; `…500` yuqoriga |
| NV-03 | A — integration “Price list (stage 4)…” | 4.4 oxirigacha, storno, o‘zgarmaslik, versiya raqami, USD, eksport auditi, ruxsat | Hammasi kutilgandek; `UPDATE` → `IMMUTABLE_LEDGER`; prorab 403 |
| NV-04 | A — ui-test “Price list…” | 25 % ustama bilan versiya | Narxlar serverdan, USD ustuni versiya kursi bo‘yicha |
| NV-05 | B | Xonadonsiz obyekt → Moliya → “Narx varaqasi” | “Obyektda faol xonadon yo‘q” va Xonadonlar tabiga havola; “Yangi versiya” o‘chiq |
| NV-06 | B | Xonadon bor, xarajat yo‘q | “Xarajat yo‘q” holati; “Yangi versiya” o‘chiq |
| NV-07 | B | NV-00 ma’lumoti bilan yangi versiya, ustama 20 % | Guruhlar va qatorlar NV-00 jadvallariga aynan teng |
| NV-08 | B | USD ni tanlash | Faqat narx ustunlari USD ga o‘tadi, qiymatlar versiyaga yozilgan kurs bo‘yicha (NV-00 formulasi) |
| NV-09 | B | Excel eksport UZS va USD da | Fayl tanlangan valyutada; Audit sahifasida eksport yozuvi |
| NV-10 | B | Yangi xarajat qo‘shib ikkinchi versiya | Versiya 2; ustama oldingisidan to‘ldirilgan; 1-versiya o‘zgarmagan |
| NV-11 | B | Prorab bilan kirish | Menyuda “Narx varaqasi” yo‘q; to‘g‘ridan-to‘g‘ri URL → “Ruxsat yo‘q” |
| NV-12 | B | A blokka qo‘shimcha 3 000 000 xarajat hujjati → versiya; keyin shu hujjatni bekor qilish → yana versiya | Birinchisida A blok fakti va prognozi 15 000 000; bekor qilingandan keyin yana 12 000 000; umumiy guruh ikkalasida 2 000 000 |

---

## 6. Kichik tuzatishlar (9.4)

| ID | Qanday | Qadam | Kutilgan natija |
|---|---|---|---|
| KT-O1a | A — integration “Receipts for invoice matching…” | `unmatched=true`, `q` | Invoysga bog‘langan kirim chiqmaydi; material nomi bo‘yicha qidiradi |
| KT-O1b | B | Ikki ombor kirimi → yetkazib beruvchi invoysi oynasi → “Bog‘langan kirim” maydoniga material nomini yozish | Qidiruv natijasi chiqadi; bittasini invoysga bog‘lagach, yangi invoysda u ro‘yxatda yo‘q |
| KT-O4 | B | Sahifa ochiq turganda tarmoqni o‘chirib-yoqish (brauzer DevTools → Offline) | O‘qish so‘rovlari qayta uriniladi; saqlash tugmasi bosilganda qayta yuborilmaydi |
| KT-O5 | A — integration | Obyektni eski versiya bilan PATCH | `409 VERSION_CONFLICT`, `404` emas |
| KT-O6 | A — integration; B | API: tur “qavat” + qavatlar soni. UI: blok zonani “qavat” turiga o‘zgartirib saqlash | API `400`; UI xatosiz saqlaydi (qavatlar soni faqat blok uchun yuboriladi) |
| KT-O7 | A — integration “Finance summary amounts…” | Yozuvsiz obyekt uchun Moliya xulosasi | Hamma summalar `'0.00'` |
| KT-O8 | — | `docs/backend/BARPO_API_GUIDE.md` | Auditga yoziladigan eksportlar ro‘yxatida smeta eksporti bor |
| KT-O10 | A — `pnpm typecheck` | `PayablesList` | Kodda yo‘q, typecheck o‘tadi |

---

## 7. Umumiy (har bosqich uchun)

| ID | Qanday | Qadam | Kutilgan natija |
|---|---|---|---|
| UM-01 | B | Yangi ekranlar RU tilida, 1280 px | Xom kalit yo‘q, gorizontal scroll yo‘q |
| UM-02 | B | Brauzer konsoli (F12) butun B sinovi davomida | Qizil xato yo‘q |
| UM-03 | B | Yangi ekranlarda summa va maydon | Faqat formatlangan qiymatlar (`NaN`, `undefined`, xom `65.40000` yo‘q) |

---

## 8. Natija formati (`docs/tests/BOSQICH_2_3_4_NATIJA.md`)

```markdown
| ID | Natija | Dalil | Izoh |
|---|---|---|---|
| XN-10 | o‘tdi | skrinshot / log / test nomi | |
| NV-07 | yiqildi | kutilgan 7 800 000, chiqdi 7 801 000; qadamlar … | taklif qilingan yechim |
```

Natija: **o‘tdi**, **yiqildi**, **o‘tkazib yuborildi** (sababi bilan). Skrinshotlar `docs/tests/screenshots/` ga.
