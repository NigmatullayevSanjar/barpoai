# BARPO AI — TZ va xonadon narxi bo‘yicha ish rejasi

> **Sana:** 2026-10-09.
> **Manbalar:** `docs/BARPO_AI_HANDOFF.md`, `docs/research/COMPETITORS.md`, Figma TZ (v1.0, 10.09.2026): asl hujjat `docs/tz/BARPO_AI_Figma_TZ.docx`, qidirish uchun matn nusxasi `docs/tz/BARPO_AI_Figma_TZ.md`.
> **Ishlatish:** har bosqich alohida Claude Code sessiyasida bajariladi. Tayyor promptlar 6-bo‘limda, modellar 6.0 da. Bir vaqtda bitta sessiya ishlasin yoki har biri alohida worktree’da. Boshqa kompyuterda davom ettirish va ochiq ishlar — 9-bo‘lim.
> 1-bo‘limdagi qarorlar majburiy. Ular handoff’dagi eski qoidalardan ustun.

---

## 1. Qarorlar (egasi, 2026-10-09)

| # | Qaror |
|---|---|
| D1 | CRM va kvartira sotuvi qo‘shilmaydi: bron, “sotildi” holati, mijoz, shartnoma va to‘lov jadvali yo‘q. |
| D2 | Har xonadonning tannarxi va tavsiya etilgan sotuv narxi hisoblanadi (“Narx varaqasi”). |
| D3 | Narx asosi — **prognoz**: har xarajat guruhi uchun `max(reja, fakt)`, ya’ni fakt + qolgan reja. |
| D4 | Ustama — obyekt bo‘yicha **bitta foiz** (hozircha). Qavat yoki tur koeffitsienti yo‘q. |
| D5 | Umumiy xarajatlar (yer, loyiha, ruxsatnoma, kredit foizi va h.k.) tannarxga kiradi. Ular smeta qatori yoki moliya hujjati sifatida kiritiladi, alohida forma kerak emas. |
| D6 | Narxlar yaxlitlanadi. Qadam R1 da. |
| D7 | USD ko‘rsatiladi. Headerda UZ/RU kabi **UZS/USD almashtirgich**, bir vaqtda faqat bitta valyuta. Saqlash va kiritish UZS’da qoladi; bazadagi `currency='UZS'` cheklovi o‘zgarmaydi. Handoff’dagi “faqat UZS” qoidasi shunday yangilanadi: USD faqat ko‘rsatish uchun. |
| D8 | Narx varaqasini `tenant_admin` va `financier` yaratadi va ko‘radi. Sotuv bo‘limi tizimda rol emas, unga Excel beriladi. |
| D9 | TZ bilan kod zid bo‘lgan joylarda **kod qarorlari qoladi**: 10 rol (buxgalter alohida); smetada tasdiqlash yo‘q; faqat taklif orqali ro‘yxatdan o‘tish (o‘zi ro‘yxat va SMS kod yo‘q); parol admin havolasi bilan tiklanadi; ish haqi moduli qoladi; begona kompaniya ID’si → 404. |
| D10 | Frontendda AppShell ichida to‘liq 404 sahifasi bo‘ladi. Noma’lum manzil va API 404 qaytargan tafsilot sahifalari shu sahifani ko‘rsatadi. |
| D11 | (2026-10-12) Tariflar tahrirlanadi: kod, oylik narx va limitlar (`PATCH /v1/platform/plans/:id`, migratsiya 018). Yangi narx keyingi invoysdan qo‘llanadi, chiqarilgan invoyslar summasi o‘zgarmaydi. Tarifni o‘chirish taqiqligicha qoladi. |
| D12 | (2026-10-12) `super_admin` platforma egasining barcha sahifa va amallariga ega va butun platforma uchun support vazifasini bajaradi. U va egasi istalgan foydalanuvchiga (kompaniya adminiga ham) 30 daqiqalik parol tiklash havolasini beradi; o‘zi va platforma egasi bundan mustasno (egasini faqat egasi tiklaydi). |
| D13 | (2026-10-12) Parol kamida 6 belgi (oldin 12). |
| D15 | (2026-10-13) Platforma rollari alohida odamlar: **egasi** — biznes (kompaniya, tarif, obuna, invoys, to‘lov, bloklash); **super_admin** — texnik (o‘qish, murojaatlar, diagnostika, xodimlarni boshqarish, platforma auditi, parol tiklash); **support** — faqat o‘qish va murojaatlar. D12 shu bilan almashtirildi. Yangi murojaat barcha platforma xodimlariga bildirishnoma beradi. |
| D16 | (2026-10-13) Ikki bosqichli kirish: egasi va super_admin uchun Telegram orqali 6 xonali kod (Telegram ulangan bo‘lsa majburiy ishlaydi, ulanmagan bo‘lsa profil ogohlantiradi). Support va kompaniya foydalanuvchilari uchun yo‘q. Migratsiya 020. |
| D14 | (2026-10-12) Blok — Figma bo‘yicha alohida karta: yer maydoni, reja/fakt sanalari, mas’ullar, rasm (migratsiya 019). Holat qo‘lda tanlanmaydi, sanalardan hisoblanadi: fakt tugagan → Yakunlandi, reja tugash o‘tgan → Kechikmoqda, fakt boshlangan → Faol, aks holda Kutilmoqda. “Smeta” blok zonalaridagi smeta qatorlaridan hisoblanadi, qo‘lda kiritilmaydi. Blok sahifasida xonadonlar xonalar soni bo‘yicha guruhlanadi; xonadonga reja rasmi yuklanadi; “Harajat” — oxirgi narx varaqasidagi tannarx (`pricing.read` bo‘lsa). |
| D17 | (2026-10-16) Figma dizayni — egasi bergan PNG eksportlar (`D:\SANCEEK\barpoai\figma`, 9 rol papkasi, 91 ekran; repoda emas) — har rol uchun dizayn va mantiq manbai; 8-bo‘limdagi “dizayn manbai — kod” qoidasi shu bilan almashtirildi. Backendda ma’lumoti yo‘q bo‘limlar (davomat, xavfsizlik, ishchi kuchi, yetkazuvchi buyurtmasi, hisobdan chiqarish, ombor sig‘imi, tizim monitoringi, xatoliklar, kamera, UzCard, smeta ustama/foyda/QQS, buxgalter balans/soliq hisobotlari, hisobot xavf/hodisa maydonlari) ko‘rsatilmaydi va 7-bo‘limga yoziladi. Qo‘ng‘iroq, UZS/USD va UZ/RU joyida qoladi; bosh sahifalardan bildirishnomalar kartasi olib tashlanadi. Ish 6 bosqich (F1–F6), har biri alohida PR. |
| D18 | (2026-10-16) Mijoz admini ombor va materiallarni faqat ko‘radi: ombor amallari, storno, inventarizatsiya, material yaratish yo‘q; talabnomani faqat ombor mudiri bajaradi/rad etadi. Ombor yaratish va ombor mudirini biriktirish adminda qoladi. Individual grant adminga ochmaydi. |
| D19 | (2026-10-16) Har yangi obyekt bilan “Asosiy ombor” va stock hisobi avtomatik yaratiladi; ombori yo‘q mavjud obyektlarga migratsiya 022. |
| D20 | (2026-10-16) Rollar Figma bo‘yicha: bosh muhandis (`manager`) obyekt/blok/smeta yaratadi va tahrirlaydi, narxni ko‘radi, xodimlarni faqat ko‘radi (`employees.read`; boshqarish faqat adminda), ombor qoldig‘ini ko‘radi, hisobot yuboradi va tekshiradi; buxgalter mablag‘ ajratadi; ombor mudiri storno va inventarizatsiya qiladi; prorab standart holatda narx ko‘rmaydi va obyekt/blok yaratmaydi (admin ruxsat bera oladi); platforma egasi xodimlarni boshqarmaydi (D15 qoladi) — faqat kompaniyalar, tariflar va to‘lovlar. |
| D21 | (2026-10-22) Platforma rollari qayta (D15 va D20 dagi “egasi xodimlarni boshqarmaydi” o‘rniga). **Super admin** — butun platforma admini (developer darajasi): egasining barcha amallari (kompaniya, bloklash, tarif va obuna, invoys va to‘lov), platforma xodimlari, umumiy audit, platforma ruxsatlari, kompaniya xatolarini tuzatish. **Support** — hamma kompaniyalarga yordam: ko‘rish, murojaatlar, diagnostika va kompaniya foydalanuvchisiga (admin ham) parol tiklash havolasi. Ruxsatlar matritsasi sahifadan sozlanadi (`/admin/permissions`, migratsiya 024); egasida hammasi doim bor; super admin o‘z ruxsatlarini ham o‘zgartira oladi, support qatorini — egasi yoki ruxsati bor xodim, super admin qatorini — faqat egasi yoki super admin. Xodimlarni egasi ham, super admin ham qo‘shadi/o‘chiradi. **Egasi ustun:** uni hech kim bloklamaydi va rolini o‘zgartirmaydi; egasining parolini super admin tiklaydi (havola super adminga ko‘rsatiladi). **Super admin uchun Telegram 2FA majburiy:** bot sozlangan, Telegram ulanmagan bo‘lsa faqat profil va Telegramni ulash ochiq. **Kompaniya ichiga kirish yo‘q;** xatolar tayyor amallar bilan tuzatiladi (sabab majburiy): ombor va moliya storno, bajarilgan ish hajmini tuzatish (umumiy audit yozuvidan), xodimni faolsizlantirish, sessiyalar va Telegramni uzish, adminlikni o‘tkazish (kompaniya kartasidagi “Foydalanuvchilar”). Hujjat kompaniya admini nomidan yoziladi (`created_by` kompaniya foydalanuvchisiga bog‘langan), auditga esa super admin (`platform_correction`), kompaniya adminiga bildirishnoma boradi. Umumiy audit — platforma va hamma kompaniyalardagi barcha rollar harakatlari bir sahifada. |
| D22 | (2026-10-26) Kontragent turi “Pudratchi” o‘rniga **“Subpudratchi”** (bazada `contractor` qoladi); subpudratchini mijoz admini ham qo‘shadi. Kontragentga berilgan avans uning dalolatnomasi yoki invoysiga **qo‘lda** hisoblanadi (“Avansdan yopish”, hujjat turi `advance_offset`, migratsiya 024): faqat o‘sha obyekt avansi, summa avans va hujjat qoldig‘idan oshmaydi; ruxsat to‘lov qila oladiganlarda (mijoz admini, buxgalter). Qoidalar `BARPO_BUSINESS_RULES.md` oxirida. |
| D23 | (2026-10-28) Video tahlili g‘oyalari tartibi: **D → A → B → E → C** (D — obyekt moliya kartasi; A — vazifani smeta qatoriga bog‘lash; B — ko‘p qatorli talabnoma; E — qavat × ish progress jadvali; C — brigada akkord hisobi). C qoidalari: brigada stavkasi har smeta qatorida alohida (`labor_rate`), bo‘sh bo‘lsa obyektning standart foizi (smeta narxidan); stavka hisobot **qabul qilinganda qotiriladi** (keyingi o‘zgarish eski hisobga ta’sir qilmaydi); ishlab topilgan summa qabul bilan **darhol** ko‘rinadi, pul hujjati faqat ish haqi davri yopilganda; brigadir — xodim (ish haqi davri orqali, avans D22 bo‘yicha hisoblanadi), brigada ichidagi ishchilar tizimda yo‘q; brigadir faqat o‘z ishlab topgani va avanslarini ko‘radi; prorab summalarni ko‘rmaydi (faqat hajm, D20); rejadan oshgan qabul qilingan hajmga ham to‘lanadi (reja–faktda ajratib ko‘rsatiladi). |
| D24 | (2026-10-29) Smetani arxivlash (`DELETE /v1/estimates/:id`) faqat **mijoz adminida** qoladi: bazaviy siyosatda `estimates/delete` hech bir xodim roliga berilmaydi (bosh muhandis `estimates.edit` bilan reviziya qiladi, lekin arxivlamaydi); admin xohlasa Ruxsatlar sahifasida rolga yoqadi. Mustaqil tekshiruv (`docs/tests/MUSTAQIL_TEKSHIRUV_D22_D23_2026_10_28.md`) shuni savol qilib qo‘ygan edi. |
| D25 | (2026-11-03) Smeta Excel fayli **10 MB gacha** yuklanadi (avval 2 MB): ZIP kengayishi chegarasi mutanosib (bitta ichki fayl 50 MB, hammasi 100 MB), brauzer 10 MB dan katta faylni yubormay aniq xabar beradi. Xonadonlar ro‘yxati importi 2 MB da qoladi. Sabab: egasining haqiqiy smetasi `Иш турлари.xlsx` 2,6 MB (`docs/tests/SMETA_EXCEL_TEKSHIRUV_2026_11_02.md`). |
| D26 | (2026-11-03) Smeta reviziyasida vazifa yangi qatorga **ish kodi (kategoriya) ham hisobga olinib** ko‘chadi: tur, nom, birlik, zona, material va kategoriya bir xil; bunday qator bir nechta bo‘lsa smetadagi tartibi saqlanadi (yuqoriga qator qo‘shilsa ham adashmaydi). Sabab: Form 5 smetada bir qavatda bir xil nomli «ЗАТРАТЫ ТРУДА» qatorlari ko‘p — vazifa boshqa ishga o‘tib ketardi (tekshiruv RV-03). |
| D27 | (2026-11-03) Reviziyada **fakt ham ko‘chadi**: qatorlarga reviziyalar orasida o‘zgarmaydigan «ish identifikatori» beriladi (D26 qoidasi bilan, bir eski qator — bitta yangi qator); bajarilgan hajm, material sarfi va ularning qiymati shu identifikator bo‘yicha hisoblanadi. O‘zgarmas jurnallar (`progress_entries`, `stock_ledger`, `journal_entries`) o‘zgartirilmaydi. Avvalgi qoida «faktni avtomatik ko‘chirish yo‘q» bekor. Sabab: bitta qator qo‘shilsa ham reja–fakt va progress nolga tushardi (RV-04). |
| D28 | (2026-11-03) «Qavat × ish» matritsasida satr = **ish kodi (kategoriya) + nom + birlik**; bir xil nomli resurslar har ish ostida alohida. Sabab: 6 xil ishning mehnat soatlari bitta satrga qo‘shilardi (WK-04). |
| D29 | (2026-11-03) **To‘liq Form 5 import rejimi** (ЛОКАЛЬНАЯ РЕСУРСНАЯ ВЕДОМОСТЬ): varaq tanlash, Form 5 tuzilishini tanish (ish / resurs / bosh pudratchi materiali, norma × hajm), ЧЕЛ.-Ч/МАШ.-Ч → soat, «100 М2» → m2 ×100, formula natijalarini o‘qish. **Amalga oshirildi (2026-11-04):** loyiha `docs/FORM5_IMPORT_LOYIHA.md`, qoidalar `BARPO_BUSINESS_RULES.md` (Form 5 importi). |
| D30 | (2026-11-03) Smeta importida qator chegarasi «olib tashlandi» — amalda **20 000 qator va 200 ustun** (avval 2 000 / 50); smeta ham 20 000 qatorgacha. Butunlay cheksiz qilinmadi: 10 MB faylga million qatorgacha sig‘adi va bitta yuklash serverni hamma uchun to‘xtatishi mumkin; egasining eng katta varag‘i (`ОБЩЕЕ`) 4 149 qator. Xonadonlar ro‘yxati importi 2 000 / 50 da qoladi. D29 dagi «katta varaqni bo‘limlarga bo‘lish» endi kerak emas. |
| D31 | (2026-11-04) Tashqi kompaniya smetasidagi birlik to‘qnashuvini platformaning o‘zi hal qiladi (buxgalterga qo‘lda moslatish yoki AI bilan qayta yozdirish o‘rniga): smeta importida bir material t va kg da kelsa, qator material birligiga avtomatik o‘tkaziladi, qator jami o‘zgarmaydi; aniq o‘tkazib bo‘lmasa qator raqami bilan xato. Form 5 rejimini kutmasdan oddiy importga qo‘shildi. |
| D32 | (2026-11-05) Ikki haqiqiy smeta tekshiruvidan keyin: (1) Form 5 ish qatoriga **akkord stavkasi mehnat resurslaridan avtomatik** — mehnat narxi ÷ hajm × obyekt brigada foizi; narx yo‘q yoki 0 bo‘lsa qo‘lda yoziladi, avtomatik qiymat ham qo‘lda o‘zgartiriladi; akkord faqat ish qatorida («ЗАТРАТЫ ТРУДА» resurslari avtomatik stavkasiz). (2) **Nom moslash** faqat nakladnoy nomi smetadagidan farq qilganda: kirimda yangi material o‘rniga smetadagi o‘xshash material taklif qilinadi, tanlansa nakladnoy nomi uning muqobil nomi bo‘ladi. (3) Birliklar Л, СЕКЦИЯ, КОТЕЛ, ЦИКЛ, КОНЕЦ qo‘shildi. (4) 21 % qatori qotirilgan summa bo‘lib qoladi; smeta qurilish davomida istalgan vaqtda reviziya qilinadi (hozirgidek). Qoidalar: `BARPO_BUSINESS_RULES.md` (Form 5 smetalari, D32). |

**Ochiq masalalar**

- **R1. Yaxlitlash qadami — hal qilindi (2026-10-09):** UZS — 1 000 so‘m, USD — 1 dollar, `ROUND_HALF_UP`. Avval m² narxi yaxlitlanadi, keyin xonadon narxi = maydon × m² narxi va yana shu qadamgacha yaxlitlanadi (4.3).
- **R2. Xonadon raqami unikalligi — hal qilindi (2026-10-09):** raqam **blok ichida** takrorlanmaydi. Blok — xonadon zonasining eng yaqin `kind='block'` ota zonasi (zonaning o‘zi ham bo‘lishi mumkin). Blok yo‘q bo‘lsa raqam butun obyekt ichida takrorlanmaydi. Parking va tijorat joylari prefiks bilan yoziladi (masalan `P-12`, `T-3`), shuning uchun alohida qoida kerak emas.

---

## 2. TZ’dan kodga ta’sir qiladigan talablar

| TZ | Talab | Bosqich |
|---|---|---|
| G-13, S-10, H-07, HD-10, O-05, 16-bo‘lim | Har jadvalda sahifalash, qatorlar soni (10/25/50), saralash; to‘liq yuklanmagan ro‘yxatda ekrandagi yig‘indi umumiy jami deb ko‘rsatilmaydi | 1.1, 1.2 |
| NEW-01, EST-03 | Smeta jamlari va kategoriya jamlari bir-biriga mos | 1.2 |
| OBJ-02 | Obyekt: maydon m², rasm, reja va fakt boshlanish/tugash sanalari | 1.3 |
| OBJ-04–06, Q03 | Zona turi: blok, kirish yo‘lagi, qavat; qavatlar soni | 1.3 |
| DASH-01–06 | Rolga mos dashboard, plan/fakt va kategoriya diagrammalari, kam qoldiq, kechikkan vazifa, budjetdan oshgan obyekt | 1.4 |
| 1.1-jadval (Xatolik), P02 | 403, 404, 500 va tarmoq uzilishi alohida holatlar; begona havola “topilmadi” | 1.5 |
| G-05, SZ-02, 16-bo‘lim | UZS va USD, kurs sanasi va manbasi | 2 |
| OBJ-07 | Xonadon/reja ko‘rinishi | 3, 4 |

TZ’ning qolgan talablari 7-bo‘limda. D9 tufayli bajarilmaydiganlari 8-bo‘limda.

---

## 3. Bosqichlar

| Bosqich | Ish | Hajm | Bog‘liqlik |
|---|---|---|---|
| 1.1 | Ro‘yxatlarda server sahifalash va qidiruv (100 qator xatosi) | M | — |
| 1.2 | Smeta jami summalari serverdan | S | — |
| 1.3 | Obyekt va zona maydonlari, zona tahriri | S–M | — |
| 1.4 | Dashboard grafiklari | M | 1.1 tavsiya |
| 1.5 | 404 sahifasi va xato holatlari | S | — |
| 2 | UZS/USD almashtirgich va valyuta kursi | M | — |
| 3 | Xonadonlar ro‘yxati va Excel import | M | 1.3 |
| 4 | Narx varaqasi | L | 2, 3, R1 |

**Holat:**
- 1.1 — bajarildi (commit `ec91638`, 2026-10-10). Backend: `q` (materiallar, kontragentlar, obyektlar, xodimlar, smetalar, kompaniyalar, SaaS invoyslar), `status`/`role`/`active`/`archived`/`unpaid`/`state` filtrlari; `queryBool` (`"false"` endi `true` emas). Frontend: `useListState` + `Pagination` 10/25/50; jadval ro‘yxatlari server sahifalashda; material va kontragent tanlovlari `SearchSelect` (server qidiruvi); obyekt va xodim tanlovlari `apiAll`. `limit=100` qolgan joylar chegaralangan tanlovlar: budjetlar, kirimga bog‘lanadigan ombor kirimlari, kontragent bo‘yicha qarz hujjatlari, obyekt smetalari.
- 1.2 — bajarildi (`ec91638`). `GET /v1/estimates/:id` → `totals` (jami, material, ish; tur/kategoriya/zona guruhlari). Filtrlangan qatorlar jami: filtr yo‘q → server jami, faqat tur filtri → tur jami, aks holda ko‘rsatilmaydi. Muharrirdagi saqlanmagan qatorlar taxminiy jami o‘zgarmadi.
- 1.5 — bajarildi (`ec91638`). `NotFound` (ikonka, orqaga, bosh sahifa, ro‘yxatga qaytish) va `DetailError` (`frontend/src/app/guards.tsx`); obyekt, smeta, smeta muharriri va kompaniya kartalari 404/403/5xx holatlarini ajratadi.
- 1.3 — bajarildi (2026-10-10, `af70f57`, `main` da). Migratsiya `014_project_zone_profile.sql`: `projects.area_m2`, `projects.image_file_id` (kompozit FK — faqat shu obyektga yuklangan fayl), `zones.kind` (block/entrance/floor/other, default other), `zones.floors_count` (faqat block), `zones.version`. API: `POST/PATCH /v1/projects` `area_m2`; PATCH `image_file_id` (null — olib tashlash; faqat shu obyektga yuklangan, hisobot/vazifaga bog‘lanmagan fayl; fayl arxivlansa havola avtomatik tozalanadi; PATCH to‘liq almashtirish rejimida, frontend barcha maydonlarni yuboradi); reja va fakt sanalari tartibi `DATE_RANGE_INVALID` (400); `POST .../zones` `kind`, `floors_count` + audit `zone.create`; yangi `PATCH /v1/projects/:id/zones/:zone_id` (version, nom, tur, qavatlar; parent o‘zgarmas; audit `zone.update`). Frontend: obyekt formasida maydon va sana tartibi tekshiruvi, tahrirda rasm (JPEG/PNG ≤5 MB, `POST /v1/files` orqali), kartada rasm va maydon, zona daraxtida tur belgisi, qavatlar soni va tahrir modali. Rasm almashtirilganda eski fayl `files`da qoladi (08-bosqich ochiq masalasi).

- 3 — bajarildi (2026-10-10, PR #1, `main` da). Migratsiya `015_premises.sql`: `premises` (zona ixtiyoriy, `kind` apartment/commercial/parking/storage, qavat −10…500, xonalar, maydon, arxiv, version; RLS, kompozit FK). R2 bazada: `block_zone_id` trigger bilan hisoblanadi (eng yaqin `kind='block'` ota zona), ikkita qisman unikal indeks (blok ichida / bloksiz obyekt ichida, faqat arxivlanmaganlar, `lower(number)`); zona turi o‘zgarsa bloklar qayta hisoblanadi, to‘qnashuv — `PREMISE_NUMBER_CONFLICT`. `import_previews` ga `kind` va `result`. API (`routes-premises.ts`): ro‘yxat (q, blok/`none`, qavat, tur, arxiv; `total_count`, `total_area_m2` serverdan), yaratish, PATCH (version), archive/unarchive, shablon (uz/ru), import preview → commit. Import: qat’iy shablon, haqiqiy qator raqamlari, xato bo‘lsa bloklanadi, (blok, raqam) bo‘yicha yangilash yoki o‘zgarishsiz, eskirgan preview rad etiladi. Frontend: obyekt kartasida “Xonadonlar” tabi (`PremisesTab.tsx`), uz/ru lokallar. Smeta import commit’i endi faqat `kind='estimate'` preview’ni oladi.

- 2 — bajarildi (2026-10-11, PR #2, `main` da). Migratsiya `016_exchange_rates.sql` (umumiy jadval, kurs > 0). Worker `refreshRates` (`rates.ts`): CBU USD kursi, 12 soat yangi bo‘lsa o‘tkaziladi, xatoda oxirgi kurs qoladi. `GET /v1/exchange-rates/latest` (har bir kirgan foydalanuvchi, platforma ham). Frontend: `CurrencyProvider` (`lib/currency.tsx`, `barpo.currency`), `useT()` valyutaga obuna, konvertatsiya `formatMoney` → `toDisplay` (`lib/currency-store.ts`, `decimal.js`), UZ/RU yonida UZS/USD almashtirgich va kurs izohi, kurs yo‘q — USD o‘chiq. Jadval sarlavhalari `displayCurrency()`, formalardagi summalar UZS’ga qotirilgan, kiritish yorliqlarida UZS. CBU javob formati bulut muhitida jonli tekshirilmagan (tarmoq ruxsati yo‘q) — lokal tekshirish kerak. 2026-10-11 lokalda tekshirildi: CBU JSON `parseCbuRate` bilan mos, worker kursni yozdi.
- 4 — bajarildi (2026-10-11, PR #2, `main` da). Migratsiya `017_price_lists.sql`: `price_lists` (versiya, ustama, R1 qadamlari, USD kursi va sanasi, jamlar, `groups` jsonb), `price_list_lines` (xonadon snapshot‘i, tannarx, sotuv m², narx, USD); ikkalasi `immutable` + RLS; `pricing` sahifasi. Hisob `backend/src/pricing.ts` (sof, decimal.js), unit test 4.4 misolini aynan beradi. API `routes-pricing.ts`: versiyalar, yaratish (`pricing.write`, advisory qulf), detal (sahifalash, q, kind), Excel eksport (`currency`, audit). Fakt zonasi: hujjat/sarf zonasi → sarfda zona bo‘lmasa smeta qatori zonasi → reversal uchun asl hujjat; xonadonsiz zona xarajati eng yaqin xonadonli ota zonaga (egasi, 2026-10-11). `GET /v1/pricing/readiness` bo‘sh holatlar uchun. Frontend: Moliya → “Narx varaqasi” (`/app/finance/pricing`), bo‘sh holatlar (xonadon yo‘q, xarajat yo‘q) sababi bilan, `formatMoney` `pin='USD'`. Qoidalar `docs/backend/BARPO_BUSINESS_RULES.md`.
- 1.4 — bajarildi (2026-10-12, PR #3, `main` da). `GET /v1/dashboard` ga `project_id` (barcha bloklarga, ko‘rinmaydigan obyekt — 404) va `months` (3/6/12, standart 6; joriy oy bilan tugaydigan to‘liq oylar, Toshkent). Davrga bog‘liq: `finance.period_expense`, `period_budget`, `monthly` (reja — smeta oylik taqsimoti, budjet, fakt), `by_kind` (material/ish/texnika/xizmat, har xarajat yozuvi bir marta, storno asl tur bo‘yicha; `share_percent` serverda), `tasks.accepted_period` (audit `task.accepted` sanasi), `reports.in_period` (`report_date`). Fakt oyi hisob sanasi bo‘yicha: moliya hujjati `document_date`, ombor sarfi — yozuvning Toshkent sanasi (sarfda hujjat sanasi yo‘q). Hozirgi holat: `finance.over_budget` (Budjetlar sahifasi ta’rifi, O12), `tasks.overdue_items` (6 ta). O‘chirildi: `month_expense`, `budget_month`, `accepted_30d`, `last_7d`. Frontend: obyekt va davr filtri, har KPI yonida davr yoki “hozirgi holat” izohi, inline SVG grafiklar (`features/dashboard/charts.tsx`, ranglar `--chart-1…4`), o‘q qiymatlari va summalar `formatMoney` (USD rejimi). Ta’riflar `docs/backend/BARPO_DASHBOARD_METRICS.md`.
Tartib: avval 1.1, 1.2 va 1.5 (xatolar va kichik ishlar), keyin 1.3 → 3 → 2 → 4. 1.4 ni istalgan payt qilish mumkin.

**Figma bosqichlari (D17, 2026-10-16):**

| Bosqich | Ish | Holat |
|---|---|---|
| F1a | Backend mantiq: D18–D20, migratsiya 022, `employees.read`, testlar va hujjatlar | bajarildi 2026-10-16, branch `claude/figma-stage-1` (PR egasi ruxsati bilan) |
| F1b | Umumiy qobiq Figma bo‘yicha (tokenlar, sahifa sarlavhasi, KPI karta, jadval, badge, grafik), rolga xos tekis menyular, rol bosh sahifalari `/v1/dashboard` dan, bildirishnomalar kartasi olib tashlanadi | bajarildi 2026-10-17, branch `claude/figma-stage-1` (F1a bilan birga, PR egasi ruxsati bilan) |
| F2 | Obyektlar (rasmli kartalar, holat filtri), obyekt sahifasi (banner, blok kartalari), blok sahifasi, smetalar ro‘yxati va smeta ko‘rish, yangi smeta modali | bajarildi 2026-10-17, branch `claude/figma-stage-1` (blok sahifasi D14 da allaqachon Figma bo‘yicha; yangi smeta modali o‘rniga mavjud muharrir qoldi) |
| F3 | Vazifalar (Kanban), kunlik/haftalik hisobot formalari (mavjud maydonlar), hisobot ko‘rish, xomashyolar va talabnomalar, xodimlar, sozlamalar | bajarildi 2026-10-17, branch `claude/figma-stage-1` (sozlamalar sahifasi uchun Figma ekrani yo‘q — faqat umumiy qobiq) |
| F4 | Brigadir (material qabul, talabnomalar) va ombor mudiri (kirim/chiqim, omborlar, qoldiqlar, transferlar, inventarizatsiya) | bajarildi 2026-10-17, branch `claude/figma-stage-1` (yetkazuvchi buyurtmasi va hisobdan chiqarish bo‘limlari ma’lumot yo‘qligi sababli yo‘q — D17) |
| F5 | Buxgalter va finansist sahifalari | bajarildi 2026-10-17, branch `claude/figma-stage-1` (balans, soliq, foyda-zarar hisobotlari, likvidlik ko‘rsatkichlari, kontragent tomonidagi ma’lumot va xarajat kategoriyalari bo‘yicha budjet — ma’lumot yo‘q, D17) |
| F6 | Platforma egasi (kompaniyalar, uch qadamli qo‘shish, tariflar, daromad va qarzdorlik) va texnik xodim (murojaatlar chat, diagnostika) | bajarildi 2026-10-17, branch `claude/figma-stage-1` (platforma “Hodimlar” va “Ruxsatlar” sahifalari D15 bo‘yicha yo‘q; CPU/RAM monitoring, uptime, zaxira nusxalar, Didox/iHamkor/SMS integratsiyalari, chat tarixi — ma’lumot yo‘q, D17) |

F1b tafsiloti: `tokens.css` (radius 12, Geist Mono raqamlar, Figma grafik ranglari), `layout.css` (260 px sidebar, faol band bordo fon va oq chiziq, foydalanuvchi kartasi, sarlavhasiz yuqori qator — faqat qo‘ng‘iroq va mobil menyu), `components.css` (soyasiz karta, KPI karta, chegarali holat belgilari, jadval sarlavhasi, bordo faol segment, sahifa sarlavhasi), `lib/permissions.ts` `roleNav`/`navFor(role)` (Figma tartibidagi tekis menyular; admin uchun guruhlar), `AppShell` (menyu `navFor`, topbar sarlavhasiz), `features/dashboard/` (`model.ts`, `widgets.tsx`, `RoleDashboards.tsx`: prorab, bosh muhandis/admin, brigadir, ombor mudiri, buxgalter, finansist; `TenantDashboard` rol bo‘yicha tanlaydi), `locales/dashboard.uz|ru.ts` (eski `dash.*` kalitlar `erp.*`/`ops.*` dan ko‘chirildi), platforma bosh sahifasi yengil qayta uslublandi (“Platforma boshqaruv paneli”). Backend `GET /v1/dashboard`: `costs` bloki (`prices.read` bilan, bosh muhandis uchun), `projects.items[].planned_start/actual_start/responsible_name`, `tasks.total/accepted`, `stock.monthly` (kirim/chiqim soni) va `stock.recent` — `BARPO_DASHBOARD_METRICS.md` yangilandi. UI testda menyu `navFor(role)` bilan solishtiriladi, bosh sahifa tekshiruvlari yangi sarlavhalarga o‘tkazildi. Figma’dagi ma’lumotsiz vidjetlar (ishchi kuchi, xavfsizlik, grafik bosqichlari, davomat, eng ko‘p so‘ralgan mahsulotlar donuti, so‘mdagi ombor kirim/chiqimi) ko‘rsatilmaydi (D17).

F3 tafsiloti: `TasksPage` — Figma toolbar kartasi (obyekt, qidiruv, holat, daraja, “menga tegishli”, doska/jadval), Kanban ustunlari rangli nuqta va son bilan, kartada to‘ldirilgan daraja belgisi, sana, zona va bajaruvchi; vazifa oynasida ma’lumotlar kartasi. Qidiruv va daraja filtri sahifadagi qatorlar ustida (ro‘yxat API’sida `q` yo‘q). `ReportsPage` — tur segmenti (Barchasi/Kunlik/Haftalik), qidiruv, “Yuborilgan hisobotlar ro‘yxati” kartasi (№, sana, turi, mazmuni, mas’ul, holati); yaratish oynasi raqamlangan bo‘limlar bilan (asosiy ma’lumotlar, bajarilgan ishlar yoki xulosa, foto izohi yoki prognoz sanasi) — faqat mavjud maydonlar; hisobot kartasi: ma’lumotlar, bajarilgan ishlar jadvali (smeta qatori, birlik, hajm, reja, amaldagi progress), foto, tekshiruvchi izohi (tarixdan), prognoz ogohlantirishi. `EmployeesPage` — KPI (jami/faol/nofaol, `GET /v1/employees` yangi `summary`), toolbar kartasi, avatar bilan ism, telefon mono, lavozim (rol + lavozim), holat matni. `StockPage` — Figma sarlavhasi, KPI (turlar, kam qolganlar, talabnomalar, jo‘natmalar), amallar toolbar kartasida. Figma’dagi “Davomat”, ombordan olingan materiallar jadvali, hisobotdagi bir nechta ish qatori va xavf/hodisa maydonlari ma’lumot yo‘qligi sababli ko‘rsatilmadi (D17, 7-bo‘lim).

F4 tafsiloti: brigadir va ombor mudiri menyusi Figma bo‘yicha bitta ombor sahifasining ichki bo‘limlariga so‘rov parametri bilan olib boradi (`lib/permissions.ts`: `NavItem.to`, `navHref`, `isNavActive` — bir vaqtda faqat eng aniq band yonadi): brigadirda “Material qabul” (`/app/stock?tab=movements&kind=transfer`) va “Material talabnomasi” (`?tab=requests`); ombor mudirida “Kirim/Chiqim” (`?tab=movements`), “Omborlar” (`?tab=balances`), “Talabnomalar” (`?tab=requests`), “Transferlar” (`?tab=movements&kind=transfer`), “Inventarizatsiya” (`?tab=balances&inventory=1`), “Materiallar” (`?tab=materials`). `StockPage` `tab`/`kind`/`inventory` parametrlarini o‘qiydi, tab almashganda `tab` ni manzilga yozadi, bo‘limga xos sarlavha ko‘rsatadi (`stock.tab_title.*`, umumiy “Xomashyolar” bandida eski sarlavha qoladi). Qoldiqlar jadvalida Figma “Holati” ustuni (Tugagan / Kam qoldi / Yetarli, qoldiq va minimal chegaradan), inventarizatsiya bandida birinchi ombor hisobi tanlangan holda ochiladi va yo‘riqnoma chiqadi. Harakatlar tabida Barchasi/Kirimlar/Chiqimlar segmenti — serverda `GET /v1/stock/commands` yangi `direction=in|out` filtri (in: opening/receipt/return, out: transfer/consumption). Talabnomalar tabida KPI (jami, jarayonda, bajarilgan, rad etilgan) — `GET /v1/stock/requests` yangi `summary`, ro‘yxat doirasi bilan bir xil (brigadir faqat o‘z so‘rovlarini sanaydi). Figma’dagi “Buyurtma” (yetkazuvchi buyurtmasi), “Hisobdan chiqarish”, ombor sig‘imi va so‘mdagi kirim/chiqim grafigi ma’lumot yo‘qligi sababli ko‘rsatilmadi (D17, 7-bo‘lim).

F5 tafsiloti: moliya sahifalari `features/finance/` ichida modullarga bo‘lindi (`documents`, `counterparties`, `budgets`, `requests`, `calendar`, `payroll`, `analysis`; `pages.tsx` da faqat admin moliya markazi va obyekt filtri; `workflow.tsx` olib tashlandi). Buxgalter: “Birlamchi hujjatlar” (hujjat raqami, turi, kontragent, sana, summa, holat — to‘langan/kutilmoqda/muddati o‘tgan/teskari/o‘tkazilgan), “Hisoblar va dalolatnomalar” (Schyot-fakturalar | Dalolatnomalar segmenti — invoys va boshlang‘ich qarz | mehnat/texnika/xizmat; KPI jami/to‘langan/kutilmoqda/muddati o‘tgan; ustunlar to‘lov muddati, to‘langan, qoldiq), “Bank va kassa” (bank va kassa qoldig‘i kartalari, Bank | Kassa operatsiyalari segmenti, kirim/chiqim ustunlari), “Kontragentlar bilan hisob-kitob” (KPI debitorlik/kreditorlik/muddati o‘tgan, tur filtri, STIR, oxirgi operatsiya, holat), “Ish haqi va xodimlar” (KPI fond/hisoblangan/to‘langan/qoldiq, lavozim ustuni), “Solishtirish” (bizning ma’lumot kartasi, dalolatnomani chop etish — kontragent tomonidagi raqamlar yo‘q), “Hisob hisobotlari” (hisobot kartalari: pul oqimi, obyekt xarajatlari, qarz yoshi, ombor hisoboti eksporti; ko‘rish va chop etish), “Talabnomalarga pul ajratish” (KPI soni va summasi). Finansist: “Budjetlar boshqaruvi” (Yillik | Oylik segment, KPI, bajarilish chizig‘i), “Reja va fakt tahlili” (KPI, 6 oylik reja–fakt ustunlar grafigi, kategoriyalar jadvali), “Prognoz” (KPI, oylik xarajat tendensiyasi, ko‘rsatkichlar kartasi), “To‘lov so‘rovlari” (filtr kartasi, harakatlar ustuni), “To‘lov kalendari” (bugun/hafta/oy KPI, oylik to‘r — bajarilgan/rejalashtirilgan/muddati o‘tgan nuqtalar, tanlangan kun ro‘yxati). Backend: `GET /v1/finance/documents` `summary`, `paid`, `cash_kind` filtri; `GET /v1/counterparties` `kind` filtri, `overdue`, `last_activity`, `summary`; `GET /v1/finance/cash-balances` `summary`; `GET /v1/finance/calendar` `payments` va `summary`; `GET /v1/budgets` `actual/remaining/percent`, `yearly`, `summary`; `GET /v1/finance/payroll` davrda `gross`/`due`; `GET /v1/finance/plan-actual` `totals` va `by_category`; `GET /v1/finance/forecast` `recent` 6 oy. Finansist menyusidagi “Hisobotlar” Figma’da kunlik/haftalik ish hisobotlari (F3 sahifasi) — finansistda moliyaviy hisobotlar sahifasi qoldi (D8 bo‘yicha narx varaqasi ham). Ma’lumotsiz bo‘limlar ko‘rsatilmadi (D17, 7-bo‘lim).

F6 tafsiloti: platforma sahifalari `features/platform/` ichida modullarga bo‘lindi (`dashboard`, `tenants`, `plans`, `billing`, `support`, `diagnostics`; `pages.tsx` da kompaniya kartasi, xodimlar va umumiy turlar). Platforma egasi: “Platforma boshqaruv paneli” (KPI: kompaniyalar, hodimlar, faol obunalar, oylik daromad, qarzdorlik, tushgan pul; oylik daromad dinamikasi — invoyslar va tushum; kompaniyalar holati; xodimlar taqsimoti rollar bo‘yicha; so‘nggi operatsiyalar), “Kompaniyalar” (qidiruv, holat va tarif filtri, jadval: kompaniya, domen (alias), tarif, xodimlar, holat, sana), “Kompaniya ochish” uch qadam (ma’lumotlar: nom, e-mail, mas’ul shaxs, telefon, manzil → yuridik va domen: ro‘yxat raqami, tashkiliy shakl, alias → tarif va boshlanish sanasi; bitta `POST /v1/platform/tenants`), “Kompaniyani tahrirlash” (karta ichida profil oynasi, `PATCH /v1/platform/tenants/:id/profile`, migratsiya 023: `contact_name`, `email`, `legal_form`), “Tariflar” kartalari (narx, limitlar, foydalanuvchilar bo‘yicha foydalanish chizig‘i, kompaniyalar soni; versiyalar o‘zgarmas — o‘chirish yo‘q), “Daromad va qarzdorlik” (6 oylik dinamika, qarzdorlik taqsimoti donuti — muddati o‘tgan/joriy, 1 oylik buxgalter hisoboti: kirim-chiqimlar yurib boruvchi qoldiq bilan va daromad–zarar kartalari, invoyslar ro‘yxati; `GET /v1/platform/billing/summary` kengaytirildi, yangi `GET /v1/platform/billing/report?month=`). Texnik xodim: “Murojaatlar (Chat)” (chapda ro‘yxat — qidiruv, Aktivlar/Yakunlanganlar/Barchasi; o‘ngda suhbat — mijoz xabari va texnik xodim javobi, “Yuborish”, “Yakunlansin”, “Qayta ochish”; model avvalgidek bitta javob), “Diagnostika” (KPI: bugungi xatolar, worker navbati, sessiyalar, baza; haftalik xatolar dinamikasi; diagnostika jurnali xato kodi bo‘yicha; integratsiya holati — Telegram bot va CBU kursi; worker xatolari va so‘nggi 5xx; `GET /v1/platform/diagnostics` `errors.daily`, `errors.by_code`, `integrations`). Texnik xodim bosh sahifasi alohida qilinmadi (D15: support Mijozlar ro‘yxatiga tushadi). UI test: tarif kartasi sarlavhasi, uch qadamli yaratish, chat oqimi bo‘yicha yangilandi.

F2 tafsiloti: `GET /v1/projects` kartalar uchun `progress_percent` (dashboard qoidasi), `responsible_name` (prorab, bo‘lmasa menejer), `plan_total` va `fact_total` (narx huquqisiz kesiladi — marshrut `sensitive`); `GET /v1/estimates` ga `summary` (obyekt bo‘yicha smetalar soni, qatorlar, jami, materiallar — sahifalashsiz). Frontend: `ProjectsPage` — Figma kartalari (rasm, holat, manzil, progress, smeta/xarajat, mas’ul), qidiruv va holat segmenti, sahifalash; `ProjectDetailPage` — orqaga va amallar qatori, rasmli banner, faktlar qatori, bloklar tabi standart; `EstimatesPage` — KPI kartalar, toolbar kartasi, qatorli ro‘yxat; `EstimateDetailPage` — orqaga tugmasi, ma’lumot kartasi, amallar paneli (tahrir, Excel, chop etish), kategoriya bo‘yicha yig‘iladigan jadval va kategoriya jamlari (serverdagi `totals.by_category`), “Hisoblash” kartasi (materiallar, ishlar, yakuniy jami). Figma’dagi ustama/foyda/QQS hisobi va smeta raqami (`SM-…`) ma’lumot yo‘qligi sababli ko‘rsatilmaydi (D17).

F1a tafsiloti: `backend/src/permissions.ts` (admin uchun `adminReadOnlyStock` qattiq taqiq, `pageAllowed` da `stock` faqat o‘qish; `manager`, `accountant`, `warehouse_manager` bazaviy siyosati), `POST /v1/materials` admin uchun 403, talabnoma amallari faqat `stock.send`, `POST /v1/projects` “Asosiy ombor” yaratadi, `GET /v1/employees*` `employees.read`. Testlar: admin o‘rniga ombor mudiri/prorab/finansist ishlatadi, admin uchun 403 tekshiruvlari qo‘shildi, UI testda `ui.warehouse` va `ui.foreman` foydalanuvchilari. Frontend (minimal): `can()` admin uchun server ruxsatini ishlatadi, ombor sahifasi va smeta muharriri adminga amal tugmalarini ko‘rsatmaydi. Qoidalar `docs/backend/BARPO_BUSINESS_RULES.md` oxirgi bo‘limida.

**Video tahlili g‘oyalari (D23, 2026-10-28):**

| Bosqich | Ish | Holat |
|---|---|---|
| V-D | Obyekt moliya kartasi: smeta, fakt, qolgan, bajarilish, to‘langan, qarz, avans, tushum — `GET /v1/projects/:id` `finance` (faqat `prices.read`) | bajarildi 2026-10-28 |
| V-A | Vazifani smeta qatoriga bog‘lash (kartada reja, qabul qilingan hajm, material sarfi; boshlanish sanasi) — `tasks.estimate_line_id`, `tasks.planned_start` (migratsiya 025), `GET /v1/estimate-lines` | bajarildi 2026-10-28 |
| V-B | Ko‘p qatorli talabnoma: bitta so‘rovda bir nechta material, qatorma-qator bajarish/rad etish — `material_requests.group_id` (migratsiya 026), `POST /v1/stock/requests` `lines[]`, `GET /v1/stock/requests` talabnomalar va qatorlari | bajarildi 2026-10-28 |
| V-E | Qavat × ish progress jadvali — `GET /v1/projects/:id/floor-progress`, obyekt sahifasida «Qavatlar progressi» tabi (migratsiyasiz) | bajarildi 2026-10-28 |
| V-C | Brigada akkord hisobi (qoidalar D23): qator stavkasi `labor_rate`, obyekt foizi `brigade_percent`, qabulda qotirish, `GET /v1/me/earnings`, ish haqi davrida `piece_rate`, to‘lovda avans hisobi (migratsiya 027) | bajarildi 2026-10-28 |

Hajm: S — bir necha kun, M — 1–2 hafta, L — 2+ hafta (taxminiy).

V-A tafsiloti: vazifa ixtiyoriy ravishda **bitta** joriy smeta qatoriga bog‘lanadi (boshqa obyekt yoki eski reviziya qatori — 400 `ESTIMATE_LINE_NOT_FOUND`); `planned_start` — rejalashtirilgan boshlanish sanasi. Vazifa ro‘yxati va kartasi qatordan reja hajmini, faktni (ish qatori — qabul qilingan hisobot hajmlari va tuzatishlar; material qatori — tasdiqlangan sarf) va foizni oladi; karta `prices.read` bilan material sarfining summasini (ombor jurnali) ko‘rsatadi. Vazifa o‘zi progress yozmaydi — hajm faqat kundalik hisobot orqali. Kanban kartasida qator nomi va foiz, qidiruv qator nomi bo‘yicha ham. Smeta reviziyasida vazifa yangi reviziyadagi o‘sha qatorga (tur, nom, birlik, zona, material bir xil) o‘tadi; mos qator bo‘lmasa eski qatorda qoladi va kartada “Eski reviziya qatori” belgisi chiqadi — foydalanuvchi qayta bog‘laydi. `GET /v1/estimate-lines?project_id&q` (`estimates.read`) — obyektning joriy qatorlari qidiruvi; vazifa oynasida qator tanlash faqat smetani ko‘ra oladigan rolga chiqadi.

V-B tafsiloti: talabnoma — umumiy `group_id` bilan birlashgan qatorlar (har qator alohida `material_requests` yozuvi: material, miqdor, holat, bajarilgan jo‘natma); zona, kerakli sana va izoh talabnoma bo‘yicha umumiy. Yaratish `lines[]` (1–50 qator, bitta material takrorlanmaydi — 400 `REQUEST_LINE_DUPLICATE`); ombor mudiriga bitta bildirishnoma (barcha qatorlar bilan). Bajarish, rad etish (ombor mudiri) va bekor qilish (so‘rovchi) avvalgidek qatorma-qator — har qator o‘z jo‘natmasini yaratadi, qisman miqdor saqlanadi. Talabnoma holati qatorlardan: bittasi kutilsa — kutilmoqda; aks holda bajarilgan > rad etilgan > bekor qilingan. Ro‘yxat, KPI va dashboarddagi “ochiq so‘rovlar” talabnomalarni (qatorlarni emas) sanaydi. Telegram orqali so‘rov bitta qatorli talabnoma. UI: talabnoma oynasida qatorlar (material + miqdor, “Qator qo‘shish”), jadvalda № (guruh identifikatorining 8 belgisi), qatorlar ustunida har qatorning holati va amallari.

V-E tafsiloti: qator — `kind='floor'` zona (ichidagi zonalar o‘sha qavatga yig‘iladi), ustun — joriy smetalarning ish qatorlari (material emas) tavsif va birlik bo‘yicha. Katak: reja — qavatga (yoki uning ichidagi zonaga) biriktirilgan qatorlar hajmi; fakt — qabul qilingan hisobotlar progressi va tuzatishlar, qavati hisobot zonasidan, zonasiz hisobotda smeta qatori zonasidan; foiz reja > 0 bo‘lsa. Qavat jami — kataklar yig‘indisi; ish jami — obyekt bo‘yicha (zonasiz qatorlar ham). Hamma raqam serverda; narx yo‘q, shuning uchun prorab va brigadir ham ko‘radi. Qavat zonasi bo‘lmasa yo‘riqnoma chiqadi.

V-C tafsiloti: stavka smeta ish qatorida (so‘m/birlik), bo‘sh bo‘lsa obyekt kartasidagi «Brigada stavkasi, %» smeta narxidan; hisobot qabulida stavka qotiriladi (keyingi o‘zgarish eski hisobga ta’sir qilmaydi), summa = (hajm + tuzatishlar) × stavka, rejadan oshgan hajm ham to‘lanadi. Brigadir panelida «Mening hisobim» (ishlab topilgan jami/shu oy, davrga kirgan, to‘langan, avanslar, qoldiq — obyektlar kesimida, so‘nggi yozuvlar); hisobot kartasida «Ishlab topilgan» faqat muallif va narx huquqi bor rollarga (prorab ko‘rmaydi, D20). Ish haqi davri yopilganda brigadirning hisobot sanasi oy oxirigacha bo‘lgan, davrga kirmagan summasi akkord sifatida yoziladi (yozuv avtomatik, oklad 0; kech qabul keyingi davrga); to‘lovda avans avval hisoblanadi, qolgani kassadan — D22 shu tarzda aniqlashtirildi. Brigada ichidagi ishchilar tizimda yo‘q.

---

## 4. Narx varaqasi: hisoblash qoidalari (Bosqich 4)

Hamma hisob serverda `decimal.js` bilan bajariladi. Frontend faqat ko‘rsatadi.

### 4.1. Xarajat guruhlari

- **Zona guruhi Z:** smeta qatorlari va xarajatlar, `zone_id = Z` bilan to‘g‘ridan-to‘g‘ri bog‘langanlari.
  - `reja(Z)` — obyektning arxivlanmagan smetalaridagi joriy reviziya qatorlari `total` yig‘indisi, `zone_id = Z`.
  - `fakt(Z)` — `account='expense'` jurnal yozuvlari yig‘indisi. Zona manba hujjatdan olinadi (`finance_documents.zone_id` yoki `stock_commands.zone_id`); sarfda zona bo‘lmasa bog‘langan smeta qatori zonasi; reversal uchun asl hujjat zonasi (egasi, 2026-10-11).
  - `prognoz(Z) = max(reja(Z), fakt(Z))`.
- **Xonadonsiz zona:** daraxtida birorta ham xonadon yo‘q zonaning rejasi va fakti eng yaqin xonadonli ota zona guruhiga qo‘shiladi (egasi, 2026-10-11); bunday ota zona bo‘lmasa umumiy guruhga.
- **Umumiy guruh C:** `zone_id` bo‘sh bo‘lgan reja va fakt, hamda xonadonli ota zonasi yo‘q xonadonsiz zonalarning xarajati. `prognoz(C) = max(reja(C), fakt(C))`.

Moliya hujjatlari smeta qatoriga bog‘lanmagan. Shuning uchun max qator darajasida emas, guruh darajasida olinadi.

### 4.2. Taqsimot

- `prognoz(Z)` Z daraxtidagi xonadonlarga sotiladigan maydon ulushi bo‘yicha taqsimlanadi.
- `prognoz(C)` obyektdagi barcha xonadonlarga maydon ulushi bo‘yicha taqsimlanadi.
- Xonadon tannarxi = o‘zi va ota zonalaridan tushgan ulushlar + umumiy ulush.
- Pul 2 xonali. Taqsimot qoldig‘i aniq tartibdagi oxirgi xonadonga yoziladi. **Invariant:** Σ xonadon tannarxi = Σ barcha guruhlar prognozi, tiyinigacha aniq.

### 4.3. Narx

- `tannarx_m2 = tannarx / maydon`
- `sotuv_m2 = round(tannarx_m2 × (1 + ustama/100), R1_UZS)`
- `narx = round(maydon × sotuv_m2, R1_UZS)`
- **USD**, versiya kursi bilan:
  - `sotuv_m2_usd = round(sotuv_m2 / kurs, R1_USD)`
  - `narx_usd = round(maydon × sotuv_m2_usd, R1_USD)`

Har valyutada jami = maydon × m² narxi, shuning uchun varaq o‘z ichida mos keladi.

### 4.4. Nazorat misoli (testda aynan shu natija chiqishi shart)

| Guruh | Sotiladigan maydon | Reja | Fakt | Prognoz | m² ga |
|---|---:|---:|---:|---:|---:|
| Blok A | 3 000 m² | 8 000 000 000 | 9 000 000 000 | 9 000 000 000 | 3 000 000 |
| Blok B | 7 000 m² | 14 000 000 000 | 5 000 000 000 | 14 000 000 000 | 2 000 000 |
| Umumiy (zonasiz) | 10 000 m² | 3 000 000 000 | 1 000 000 000 | 3 000 000 000 | 300 000 |

Blok A dagi 65 m² xonadon, ustama 25%:

- tannarx m² = 3 300 000; tannarx = 214 500 000;
- sotuv m² = 4 125 000; narx = 268 125 000 UZS;
- namunaviy kurs 12 800 bilan: 322 $/m², 20 930 $.

Σ tannarx = 26 000 000 000.

### 4.5. Versiya

- Har hisob yangi **o‘zgarmas versiya** bo‘ladi: sana, muallif, ustama, R1 qadamlari, USD kursi va kurs sanasi, guruhlar bo‘yicha reja/fakt/prognoz yig‘masi, xonadon qatorlari snapshot’i.
- UPDATE va DELETE trigger bilan taqiqlanadi (`IMMUTABLE_LEDGER` naqshi).
- Kurs bo‘lmasa USD maydonlari `null` bo‘ladi, 0 emas.

---

## 5. Valyuta qoidalari (Bosqich 2)

- **Kurs:** O‘zbekiston Markaziy banki (CBU) kunlik USD kursi. Worker kuniga bir marta oladi va global `exchange_rates` jadvaliga yozadi (sana, valyuta, kurs, manba). Olish xato bo‘lsa oxirgi kurs qoladi va sanasi ko‘rsatiladi; hech qachon 0 bo‘lmaydi. CBU manzilini amalga oshirishda tekshiring.
- **Ko‘rsatish:** headerda UZ/RU yonida UZS/USD almashtirgich. Tanlov brauzerda saqlanadi (`barpo.currency`, til kabi). Yonida “1 USD = … UZS, sana, CBU” izohi. Kurs bo‘lmasa USD tugmasi o‘chiq va sababi yozilgan.
- **Konvertatsiya:** faqat `formatMoney` ichida, server bergan kurs bilan, aniq decimal arifmetika bilan (`Number` emas). Natija 2 xonagacha yaxlitlanadi. Bu “frontend arifmetika qilmaydi” qoidasidan **yagona istisno**: faqat ko‘rsatish uchun, yig‘indi hisoblanmaydi. Jamlar serverdan UZS’da keladi va shundan keyin konvertatsiya qilinadi. Istisno `CLAUDE.md` va handoff’ga yoziladi.
- **Kurs sanasi:** umumiy ekranlarda hamma summa joriy kurs bo‘yicha ko‘rsatiladi, izohda “joriy kurs bo‘yicha” yoziladi. Narx varaqasi bundan mustasno: u versiyaga saqlangan kurs va USD qiymatlarini ishlatadi, frontend faqat ustunni tanlaydi.
- **Kiritish va eksport:** formalarda summa har doim UZS’da kiritiladi, yorlig‘ida “UZS” turadi. Excel eksportlar UZS’da qoladi; narx varaqasi eksporti tanlangan valyutada bo‘ladi.

---

## 6. Claude Code uchun promptlar

Har promptni yangi sessiyaga to‘liq nusxalang. Hammasi bir xil yakunlanadi: avval reja, keyin tasdiq, keyin ish, keyin tekshiruv, commit yo‘q.

### 6.0. Modellarni almashtirish

**Asosiy sessiya modeli.** Promptni tashlashdan oldin jadvaldagi modelni `/model` bilan o‘zingiz tanlaysiz:

```text
/model claude-opus-5-5
```

```text
/model claude-sonnet-5-5
```

**Sessiya ichida** Claude ishni sub-agentlarga bo‘ladi va har biriga model beradi (Agent vositasining `model` parametri: `haiku`, `sonnet`, `opus`, `fable`). Har promptdagi “Modellar” bloki shuni belgilaydi.

| Ish turi | Kim bajaradi |
|---|---|
| Kod qidirish, fayllarni o‘qib xulosa qilish | `Explore` sub-agent, `haiku` |
| Tasdiqlangan rejadagi mexanik kod: lokal matnlar, UI komponentlar, oddiy CRUD, Excel shablon | `general-purpose` sub-agent, `sonnet` |
| Reja, migratsiya, ruxsatlar, pul, hisoblash moduli, qismlarni birlashtirish | asosiy sessiya |
| Yakuniy mustaqil tekshiruv (diff review) | yangi `opus` sub-agent; Bosqich 4 da `fable`, mavjud bo‘lmasa `opus` |

**Qoidalar:**
- Sonnet sub-agentga aniq fayllar ro‘yxati va qabul mezoni beriladi.
- Ikki sub-agent bir faylni bir vaqtda o‘zgartirmaydi.
- Tekshiruv buyruqlarini asosiy sessiya o‘zi ishga tushiradi.

| Bosqich | `/model` | Haiku | Sonnet sub-agent | Asosiy sessiya o‘zi | Yakuniy tekshiruv |
|---|---|---|---|---|---|
| 1.1 | opus | `limit=100` joylari | sahifalarni guruhlab yangilash | backend `q` parametri, scope | opus |
| 1.2 | sonnet | — | — | hammasi (kichik) | opus |
| 1.3 | sonnet | obyekt va zona kodi xaritasi | forma va lokallar | migratsiya, API | opus |
| 1.4 | opus | dashboard ma’lumot manbalari | SVG grafik komponentlari, lokallar | endpoint, ruxsat | opus |
| 1.5 | sonnet | tafsilot sahifalari ro‘yxati | — | hammasi (kichik) | shart emas |
| 2 | opus | `formatMoney` ishlatilgan joylar | CurrencyProvider UI, lokallar | jadval, worker, decimal konvertatsiya | opus |
| 3 | opus | smeta import naqshi | UI tab, shablon, lokallar | migratsiya, API, import | opus |
| 4 | opus | xarajat manbalari (`zone_id`) | UI sahifa, lokallar | migratsiya, hisoblash moduli, testlar, API | fable (yo‘q bo‘lsa opus) |

### 6.1. Bosqich 1.1 — sahifalash va qidiruv (`/model claude-opus-5-5`)

```text
CLAUDE.md, docs/BARPO_AI_HANDOFF.md va docs/TZ_VA_NARX_REJASI.md (1-, 2- va 6.0-bo‘limlar) ni o‘qi.

Muammo: backend ro‘yxatlarda ko‘pi bilan 100 qator beradi (backend/src/schemas.ts, pageQuery). Ko‘p frontend
ro‘yxatlari limit=100 bilan bir marta so‘raydi va keyingi sahifani olmaydi, shuning uchun 100 dan keyingi qatorlar
ko‘rinmay qoladi. Eng og‘ir joy: smeta muharriridagi material tanlash (frontend/src/features/estimates/model.ts,
useMaterials). /v1/materials da qidiruv yo‘q. Boshqalari: finance/model.ts, work/model.ts, stock/model.ts,
employees, counterparties, ProjectSelect.

Vazifa:
1) limit=100 ishlatilgan hamma joyni top va uchga ajrat: (a) server qidiruvi kerak bo‘lgan tanlash maydoni,
   (b) sahifalash kerak bo‘lgan ro‘yxat, (c) o‘zgartirish shart emas.
2) Har tur uchun eng kichik yechimni taklif qil. TZ talabi: jadvalda sahifalash va 10/25/50 tanlovi,
   to‘liq yuklanmagan ro‘yxatda ekrandagi yig‘indi umumiy jami deb ko‘rsatilmaydi.
3) Kerakli joyda backend’ga q (qidiruv) parametrini qo‘sh (zod strictObject, scope va ruxsat saqlansin).
   Frontendda mavjud Pagination va useListState’dan foydalan. Yangi matnlar uz va ru lokallarga.

Modellar:
- 1-band qidiruvini Explore sub-agentga (model: haiku) ber, natija fayl:qator ro‘yxati bo‘lsin.
- Backend o‘zgarishlarini o‘zing yoz.
- Reja tasdiqlangach frontend sahifalarini modul bo‘yicha (finance, work, stock, estimates, qolganlari)
  general-purpose sub-agentlarga (model: sonnet) ber, ketma-ket, har biriga aniq fayllar va qabul mezoni bilan.
- Oxirida diff’ni yangi sub-agentga (model: opus) mustaqil tekshirtir: scope, ruxsat va tenant izolyatsiyasi.

Avval reja va taxminlaringni ayt, tasdiqlashimni kut.
Tekshiruv: backend — npm run build, npm test, npm run test:integration, npm run test:roles, npm run docs;
frontend — pnpm typecheck, pnpm build. Commit qilma.
```

### 6.2. Bosqich 1.2 — smeta jamlari serverdan (`/model claude-sonnet-5-5`)

```text
CLAUDE.md, docs/BARPO_AI_HANDOFF.md va docs/TZ_VA_NARX_REJASI.md (1- va 6.0-bo‘limlar) ni o‘qi.

Muammo: frontend/src/features/estimates/EstimateDetailPage.tsx (60, 89, 214-qatorlar atrofi) pul summalarini
Number bilan qo‘shadi. Bu "frontend arifmetika qilmaydi" qoidasini buzadi va TZ talabiga zid (NEW-01: smeta
jami va kategoriya jamlari mos bo‘lishi kerak).

Vazifa:
1) Smeta detali API’si (joriy reviziya) umumiy jami va tur bo‘yicha jamlarni (material, labor, equipment,
   service) decimal string sifatida qaytarsin. Narx huquqi yo‘q rolga bu maydonlar kelmasin (sensitive).
2) Frontend shu qiymatlarni ko‘rsatsin, Number bilan qo‘shish olib tashlansin.
3) 214-qator muharrirdagi saqlanmagan qatorlar uchun bo‘lsa, yechim variantlarini taklif qil va so‘ra.

Modellar:
- Ish kichik, o‘zing bajar.
- Oxirida diff’ni yangi sub-agentga (model: opus) tekshirtir: pul aniqligi va narx redaksiyasi.

Avval reja va taxminlaringni ayt, tasdiqlashimni kut.
Tekshiruv: backend — npm run build, npm test, npm run test:integration, npm run test:roles, npm run docs;
frontend — pnpm typecheck, pnpm build. Commit qilma.
```

### 6.3. Bosqich 1.3 — obyekt va zona maydonlari (`/model claude-sonnet-5-5`)

```text
CLAUDE.md, docs/BARPO_AI_HANDOFF.md va docs/TZ_VA_NARX_REJASI.md (1- va 6.0-bo‘limlar) ni o‘qi.

Maqsad (TZ OBJ-02, OBJ-04): obyekt va zona ma’lumotini kengaytirish. Bu keyingi "Xonadonlar" bosqichi uchun zarur.

Vazifa:
1) Obyekt: area_m2 (ixtiyoriy, decimal), rasm (mavjud fayl infratuzilmasi, faqat JPEG/PNG), planned_start,
   actual_start, actual_end. Sanalar bazada bor, API va UI’ga chiqar. Tugash boshlanishdan oldin bo‘lmasin.
2) Zona: kind (block, entrance, floor, other; UI’da "Blok", "Kirish yo‘lagi", "Qavat", "Boshqa") va floors_count
   (ixtiyoriy, blok uchun).
3) Zona tahriri: nom va tur PATCH bilan, version tekshiruvi va audit bilan. Parent o‘zgarmas qoladi.
   API’da hozir zona tahriri yo‘q (BACKEND_TODO 04).
4) Yangi migratsiya keyingi bo‘sh raqam bilan. Qo‘llangan migratsiyalarga tegma.
5) Obyekt formasi, kartasi va zona daraxtida yangi maydonlar ko‘rinsin. Matnlar uz va ru lokallarga.

Modellar:
- Obyekt va zona kodining xaritasini (route, schema, frontend fayllari) Explore sub-agentga (model: haiku) yig‘dir.
- Migratsiya va API’ni o‘zing yoz.
- Frontend forma, karta va lokallarni general-purpose sub-agentga (model: sonnet) ber.
- Oxirida diff’ni yangi sub-agentga (model: opus) tekshirtir: migratsiya, RLS, version va audit.

Avval reja va taxminlaringni ayt, tasdiqlashimni kut.
Tekshiruv: backend — npm run build, npm test, npm run test:integration, npm run test:roles, npm run docs;
frontend — pnpm typecheck, pnpm build. Commit qilma.
```

### 6.4. Bosqich 1.4 — dashboard grafiklari (`/model claude-opus-5-5`)

```text
CLAUDE.md, docs/BARPO_AI_HANDOFF.md, docs/TZ_VA_NARX_REJASI.md (1- va 6.0-bo‘limlar) va
docs/backend/BARPO_DASHBOARD_METRICS.md ni o‘qi.

Maqsad (TZ DASH-01–06): rolga mos dashboard’ga grafik va ro‘yxatlar qo‘shish. Admin uchun: 6 oylik xarajat
dinamikasi, xarajat turlari bo‘yicha taqsimot, plan/fakt, kam qolgan material, kechikkan vazifalar,
budjetdan oshgan obyektlar. Tepada obyekt va davr filtri (ProjectSelect bor).

Qoidalar:
- Ma’lumot faqat serverdan. Kerakli seriyalarni /v1/dashboard ga yoki alohida endpointga qo‘sh.
  Ruxsat bo‘lmasa blok null bo‘ladi va ko‘rsatilmaydi.
- Grafiklar inline SVG, ranglar tokens.css dan. Yangi kutubxona qo‘shma.
- Har grafikda nom, legenda va o‘q qiymatlari formatlangan bo‘lsin. Holatni faqat rang bilan farqlama.
- Bo‘sh davrda bo‘sh holat ko‘rsatiladi, soxta 0 emas.
- Figma hali yakuniy emas: mavjud komponentlar bilan qil, keyin moslanadi.

Modellar:
- Mavjud dashboard ma’lumot manbalarini va moliya oylik qatorlarini Explore sub-agentga (model: haiku) xaritalat.
- Endpoint va ruxsatlarni o‘zing yoz.
- SVG grafik komponentlari (ustunli, donut) va lokallarni general-purpose sub-agentga (model: sonnet) ber.
  Qabul mezoni: props faqat serverdan kelgan string qiymatlar, ichida pul yig‘indisi yo‘q.
- Oxirida diff’ni yangi sub-agentga (model: opus) tekshirtir.

Avval reja va taxminlaringni ayt, tasdiqlashimni kut.
Tekshiruv: backend — npm run build, npm test, npm run test:integration, npm run test:roles, npm run docs;
frontend — pnpm typecheck, pnpm build; npm run test:ui. Commit qilma.
```

### 6.5. Bosqich 1.5 — 404 sahifasi va xato holatlari (`/model claude-sonnet-5-5`)

```text
CLAUDE.md, docs/BARPO_AI_HANDOFF.md va docs/TZ_VA_NARX_REJASI.md (1- va 6.0-bo‘limlar, D9, D10) ni o‘qi.

Hozirgi holat:
- Noma’lum manzil uchun frontend/src/app/App.tsx dagi path="*" NotFound’ni ko‘rsatadi (frontend/src/app/guards.tsx).
  Lekin u oddiy EmptyState kartasi: ikonka yo‘q, "Bosh sahifa" tugmasi sahifani to‘liq qayta yuklaydi (location.href).
- Tafsilot sahifalarida (/app/projects/:id, /app/estimates/:id, /app/estimates/:id/edit, /admin/tenants/:id)
  API 404 qaytarsa (obyekt yo‘q, biriktirilmagan yoki begona kompaniyaniki) faqat qizil Alert
  "Ma’lumot topilmadi." chiqadi.

Vazifa (TZ: 403, 404, 500 va tarmoq uzilishi alohida holatlar; P02 — begona havola "topilmadi"):
1) AppShell ichida yagona 404 sahifasi: ikonka, sarlavha, qisqa tushuntirish, "Bosh sahifa" (homeFor bilan,
   SPA navigatsiya) va "Orqaga" tugmalari. Figma’dagi 404 freymini mavjud komponentlar va tokens.css bilan qil.
   Yangi rang va kutubxona qo‘shma.
2) Tafsilot sahifalari javobga qarab holat ko‘rsatsin:
   - API 404 → shu 404 sahifasi, ro‘yxatga qaytish havolasi bilan;
   - 403 → Forbidden;
   - 5xx va tarmoq xatosi → ErrorState, "Qayta urinish" tugmasi bilan.
   Har sahifada takrorlamay, bitta yordamchi komponent yoki funksiya orqali qil.
3) "Yo‘q" va "ruxsat yo‘q" obyekt bir xil 404 ko‘rinishida bo‘lsin: mavjudlik oshkor bo‘lmasin.
4) Login qilmagan foydalanuvchi noma’lum manzilga kirsa hozirgidek login’ga yo‘naltirilishini tekshir.
5) Matnlar uz va ru lokallarga.

Modellar:
- API’dan yuklanadigan barcha tafsilot sahifalarini Explore sub-agentga (model: haiku) toptir.
- Qolganini o‘zing bajar. Yakuniy opus tekshiruvi shart emas.

Avval reja va taxminlaringni ayt, tasdiqlashimni kut.
Tekshiruv: frontend — pnpm typecheck, pnpm build; backend papkasida npm run test:ui. Commit qilma.
```

### 6.6. Bosqich 2 — UZS/USD almashtirgich (`/model claude-opus-5-5`)

```text
CLAUDE.md, docs/BARPO_AI_HANDOFF.md va docs/TZ_VA_NARX_REJASI.md (1-bo‘lim D7, 5- va 6.0-bo‘limlar) ni o‘qi.
5-bo‘limdagi qoidalar majburiy.

Vazifa:
1) Global exchange_rates jadvali (tenant ma’lumoti emas) va worker’da CBU’dan kunlik USD kursini olish.
   Xatoda oxirgi kurs qoladi, 0 yozilmaydi. CBU manzili va javob formatini tekshir.
2) GET endpoint: so‘nggi kurs, sana va manba.
3) Frontend: CurrencyProvider (I18nProvider naqshi), headerda UZ/RU yonida UZS/USD almashtirgich,
   tanlov localStorage['barpo.currency'] da saqlanadi.
   formatMoney tanlangan valyutada ko‘rsatsin: konvertatsiya aniq decimal bilan (Number emas), faqat shu funksiyada.
   Kurs bo‘lmasa USD tugmasi o‘chiq va sababi ko‘rinsin.
4) Formalar va eksportlar UZS’da qoladi (5-bo‘lim).
5) CLAUDE.md va handoff’dagi "faqat UZS" va "frontend arifmetika qilmaydi" qoidalarini D7 va 5-bo‘limga
   moslab yangilashni taklif qil. Matnni menga ko‘rsat, keyin yoz.

Modellar:
- formatMoney va pul ko‘rsatiladigan barcha joylarni Explore sub-agentga (model: haiku) toptir.
- Jadval, worker, endpoint va formatMoney ichidagi decimal konvertatsiyani o‘zing yoz.
- CurrencyProvider, header almashtirgichi va lokallarni general-purpose sub-agentga (model: sonnet) ber.
- Oxirida diff’ni yangi sub-agentga (model: opus) tekshirtir: konvertatsiya aniqligi, kurs yo‘q holati,
  Number ishlatilmaganligi.

Avval reja va taxminlaringni ayt, tasdiqlashimni kut.
Tekshiruv: backend — npm run build, npm test, npm run test:integration, npm run test:roles, npm run docs;
frontend — pnpm typecheck, pnpm build; npm run test:ui. Commit qilma.
```

### 6.7. Bosqich 3 — xonadonlar (`/model claude-opus-5-5`)

```text
CLAUDE.md, docs/BARPO_AI_HANDOFF.md va docs/TZ_VA_NARX_REJASI.md (1- va 6.0-bo‘limlar) ni o‘qi.
1.3 bosqich (zona turi) bajarilgan bo‘lishi kerak; bo‘lmasa to‘xta va ayt.

Maqsad (D1, D2, TZ OBJ-07): obyektdagi xonadon va joylar ro‘yxati. Bu CRM emas: holat, mijoz, bron va narx
bu yerda yo‘q.

Vazifa:
1) Jadval nomi premises. units emas, chunki units o‘lchov birliklari jadvali.
   Maydonlar: project_id, zone_id (ixtiyoriy), number, kind (apartment, commercial, parking, storage),
   rooms (ixtiyoriy), floor (ixtiyoriy), area_m2 (>0, 2 xona), archived_at, version.
   RLS, composite FK. Raqam unikalligi R2 bo‘yicha: blok ichida (eng yaqin kind='block' ota zona),
   blok yo‘q bo‘lsa obyekt ichida. Bazada qanday kafolatlashni (ustun yoki trigger) rejada taklif qil.
2) CRUD: o‘qish projects.read, yozish obyekt sahifasining create/update ruxsati bilan, projectScope bilan.
   Ishlatilgan xonadon o‘chirilmaydi, arxivlanadi.
3) Excel import qat’iy shablon bilan (blok, kirish, qavat, raqam, tur, xonalar, maydon).
   Yuklab olinadigan shablon. inspect → preview → commit naqshi va estimates.ts dagi xavfsiz xlsx cheklovlari.
   Xato qatorlar raqami bilan ko‘rsatiladi. Xato bor ekan import bloklanadi. Qayta yuklash dublikat yaratmaydi.
4) UI: obyekt kartasida "Xonadonlar" tabi. Blok, qavat va tur filtri, sahifalash, jami maydon serverdan.
   Matnlar uz va ru lokallarga.

Modellar:
- Smeta Excel importi naqshini (estimates.ts, routes-estimates-extra.ts, frontend import ustasi)
  Explore sub-agentga (model: haiku) xulosa qildir.
- Migratsiya, API, ruxsat va import tekshiruvini o‘zing yoz.
- "Xonadonlar" tabi, Excel shablon fayli va lokallarni general-purpose sub-agentga (model: sonnet) ber.
- Oxirida diff’ni yangi sub-agentga (model: opus) tekshirtir: RLS, scope, import xavfsizligi, dublikat.

Avval reja va taxminlaringni ayt, tasdiqlashimni kut.
Tekshiruv: backend — npm run build, npm test, npm run test:integration, npm run test:roles, npm run docs;
frontend — pnpm typecheck, pnpm build; npm run test:ui. Commit qilma.
```

### 6.8. Bosqich 4 — narx varaqasi (`/model claude-opus-5-5`)

```text
CLAUDE.md, docs/BARPO_AI_HANDOFF.md va docs/TZ_VA_NARX_REJASI.md ni to‘liq o‘qi. 4-bo‘limdagi hisoblash
qoidalari majburiy. 2 va 3 bosqichlar bajarilgan bo‘lishi kerak. R1 tasdiqlanmagan bo‘lsa to‘xta va so‘ra.

Vazifa:
1) Ma’lumot: price_lists (versiya sarlavhasi) va price_list_lines (xonadon snapshot’i).
   Ikkalasi o‘zgarmas (UPDATE/DELETE trigger), RLS bilan.
2) Hisoblash moduli (alohida fayl, decimal.js): 4.1–4.3 qoidalari, taqsimot qoldig‘i va invariant.
   Unit test: 4.4 nazorat misoli aynan shu raqamlarni bersin, invariant ham tekshirilsin.
3) API:
   - yangi versiya yaratish (ustama foizi kiritiladi, oldingisidan to‘ldiriladi);
   - versiyalar ro‘yxati;
   - versiya detali: qatorlar, sahifalash, guruhlar bo‘yicha reja/fakt/prognoz yig‘masi;
   - Excel eksport tanlangan valyutada, auditga yoziladi.
   Hammasi sensitive; ruxsat: yangi "pricing" sahifasi, handoff 13-bo‘limdagi "Yangi kompaniya sahifasi" retsepti.
   Bazaviy siyosat: tenant_admin va financier (D8).
4) UI: Moliya guruhida "Narx varaqasi". Obyekt tanlash, versiyalar, xonadonlar jadvali (blok, kirish, qavat,
   raqam, tur, xonalar, maydon, tannarx m², tannarx, sotuv m², narx), guruhlar yig‘masi.
   UZS/USD almashtirgich faqat ustunni tanlaydi. Bo‘sh holatlar: xonadon yo‘q, xarajat yo‘q, kurs yo‘q.
5) Hujjatlar: docs/backend/BARPO_BUSINESS_RULES.md ga narx bo‘limi, handoff’dagi qarorlar ro‘yxati, npm run docs.

Modellar:
- Xarajat manbalari va zone_id qayerdan olinishini (estimate_lines, finance_documents, stock_commands,
  journal_entries) Explore sub-agentga (model: haiku) xaritalat.
- Migratsiya, hisoblash moduli, uning testlari va API’ni faqat o‘zing yoz. Bu qismlarni sub-agentga berma.
- "Narx varaqasi" sahifasi va lokallarni general-purpose sub-agentga (model: sonnet) ber.
  Qabul mezoni: frontend hech narsa hisoblamaydi, faqat server qiymatlarini ko‘rsatadi.
- Hisoblash moduli va testlarini yangi sub-agentga (model: fable; mavjud bo‘lmasa opus) mustaqil tekshirtir:
  4.4 misolini qo‘lda qayta hisoblasin, chegaraviy holatlarni topsin (xonadonsiz zona, 0 maydon, kurs yo‘q,
  qoldiq taqsimoti). Keyin butun diff’ni yangi sub-agentga (model: opus) tekshirtir: ruxsat, redaksiya,
  o‘zgarmaslik.

Avval reja va taxminlaringni ayt, tasdiqlashimni kut.
Tekshiruv: backend — npm run build, npm test, npm run test:integration, npm run test:roles, npm run docs;
frontend — pnpm typecheck, pnpm build; npm run test:ui. Commit qilma.
```

---

## 7. Keyingi navbat (TZ’da bor, rejalashtirilmagan)

| TZ | Ish | Nima kutadi |
|---|---|---|
| PUR-01–03 | Ko‘p qatorli xarid, qisman yetkazib berish, bitta invoysga bir nechta kirim | Biznes qoidasi (BACKEND_TODO 07) |
| WH-09 | Inventarizatsiya qoralamasi va tasdiqlash | — |
| REP-04, REP-06 | Hisobot qoralamasi; haftalik hisobotda xavf va yangi prognoz maydonlari | — |
| CAT-01–02 | Markaziy katalogni platforma egasi boshqarishi | Q09: lokal material siyosati |
| NOT-01–02 | Hodisa × rol × kanal sozlamasi | Email/SMS provayderi |
| FIN-03 | Budjetda UySot tushumi | UySot kirishi |
| PAY-03, INT | Bank / Didox / iHamkor’dan biri | Provayder va kirish ma’lumotlari |
| CAM-01–03 | Kamera transport tarixi | Q10: provayder |

---

## 8. TZ’dan kelishilgan farqlar (egasi qarori)

Loyihada dizayner yo‘q (2026-10-12): Figma maketi chizilmaydi, dizayn manbai — kodning o‘zi (mavjud komponentlar va `tokens.css`). Figma TZ’ni egasi o‘zi tayyorlagan va u talablar ro‘yxati sifatida ishlatiladi; tashqi buyurtmachiga xabar berish shart emas. D9 tufayli TZ’ning quyidagi bandlari kodda boshqacha; ular TZ 18-bo‘limi ma’nosida kelishilgan o‘zgarish hisoblanadi:

- **L-01, L-02, L-03, AUTH-02–07, P01:** o‘zi ro‘yxatdan o‘tish, SMS kod, telefon orqali parol tiklash, kompaniya yaratish yo‘q. Kompaniya adminini platforma egasi bir martalik taklif havolasi (72 soat) bilan qo‘shadi; xodimlarni kompaniya admini login va boshlang‘ich parol bilan qo‘shadi (birinchi kirishda almashtirish majburiy); parol admin bergan bir martalik havola (30 daqiqa) bilan tiklanadi.
- **EST-05, S-06, P04:** smeta tasdiqlash oqimi.
- **5-bo‘lim, G-07:** 9 rol o‘rniga 10 rol (platforma: super admin, platforma egasi, texnik yordam; kompaniya: admin, prorab, brigadir, ombor mudiri, finansist, buxgalter, menejer); buxgalter alohida rol.
- **P02:** begona kompaniya havolasi 403 emas, “topilmadi” (404). Ko‘rinishi D10 dagi 404 sahifasi.
- **D-01, FIN-01:** ish haqi moduli kodda bor.
- **G-05, SZ-02:** USD qo‘llanadi, lekin almashtirgich ko‘rinishida (bir vaqtda bitta valyuta). Valyuta tanlash va kurs sozlamasi o‘rniga CBU kursi.
- **OBJ-07, Q03:** xonadonlar ro‘yxati va narx varaqasi qo‘shiladi; sotuv, bron va CRM qo‘shilmaydi.

---

## 9. Boshqa kompyuterda davom ettirish (2026-10-10)

### 9.1. Joriy holat

Holat 2026-10-12 ga.

- **Bajarilgan va `main` da:** 1.1, 1.2, 1.5 (`ec91638`), 1.3 (`af70f57`), 3 (PR #1), 2 va 4 (PR #2), 1.4 (PR #3). Har birining tafsiloti 3-bo‘limda.
- **Bosqich 1 test natijalari:** `docs/tests/BOSQICH_1_NATIJA.md` — 57 o‘tdi; ERR-03 qisman tekshirilgan. UI-11 cheklovi O1 bilan yopildi.
- **Kichik tuzatishlar (2026-10-12):** O1, O4, O5, O6, O7, O8, O10 bajarildi, har biri alohida commit (9.4).
- **Egasi fikri (2026-10-12, 13 band):** D11–D14 qarorlari (1-bo‘lim), migratsiyalar 018–019, branch `claude/feedback-2026-10-12`. Keyinga qoldirilgani: super admin Telegram boti (O16). Tekshiruvda topilgan eski xato: O17 (integratsiya testi UTC+5 da).
- **Platforma rollari va 2FA (2026-10-13, D15–D16, migratsiya 020):** super_admin texnik rolga qisqartirildi, support faqat o‘qiydi (mijoz kartasi ham), xodimlarni faolsizlantirish/rol almashtirish, platforma auditi sahifasi (`/admin/audit`), yangi murojaat → platforma xodimlariga bildirishnoma, egasi va super_admin uchun Telegram kodi bilan kirish (`login_codes`, 5 daqiqa, 5 urinish — 2026-10-27: hisob bitta `UPDATE` da, parallel so‘rovlar ham 5 tadan oshmaydi va ortiqcha ulanish olinmaydi). Qoldirilgani: O16 (alohida super admin boti) — endi bildirishnomalar asosiy bot orqali ham keladi, alohida bot ixtiyoriy.
- **CSS auditi (2026-10-13, egasi so‘rovi):** haqiqiy ma’lumotli vaqtinchalik stendda (ui-test oqimi + qo‘shimcha fixture’lar: 104 obyekt, 120 belgili nom, 100 belgili kontragent, 40 qatorli smeta, 3 blok, 16 xonadon) 10 rol × 150+ marshrut 390/768/1024/1280/1440 kengliklarda, uz va ru, modallar bilan tekshirildi. Tuzatilgan 4 ta defekt (hammasi CSS, kod o‘zgarmagan): ☰ tugmasi desktopda ko‘rinardi (`layout.css`: `.menu-btn` qoidasi `.icon-btn` dan keyin); obyekt tanlovi (`Select`) yashirin `<select>` eng uzun variantga 1017 px cho‘zilib 1024 da toolbarni buzar, 390 da gorizontal scroll berardi (`components.css`: `.select-wrap` max-width, toolbar’da 480 px); bosh sahifa kartalari 390 da 432 px (`base.css`: 720 px media’da `1fr` → `minmax(0,1fr)`); grafikning `sr-only` jadvali 428 px bo‘lib sahifani kengaytirardi (`base.css`: `.sr-only` ga `display:block`, `clip-path`). Favicon qo‘shildi (`public/favicon.png`, logodan). Tekshiruv yakunida: hech bir marshrutda gorizontal scroll, kenglikdan oshgan karta yoki ellipsissiz kesilgan matn yo‘q; modallar ru tilida 390/1024 da sig‘adi. Konsolda faqat boshqa rolga tegishli obyekt sahifasiga kirganda kutilgan 404 qoladi.
- **Platforma rollari D21 (2026-10-22, migratsiya 024, branch `claude/platform-roles-d21` — `claude/figma-stage-1` ustidan):** platforma ruxsatlari matritsasi (`platform-permissions.ts`, `/admin/permissions`), super admin egasining barcha amallari bilan, majburiy 2FA (`TWO_FACTOR_SETUP_REQUIRED`), umumiy audit (`/v1/platform/audit` scope/tenant/role filtrlari, tuzatish turi), kompaniya foydalanuvchilari va tuzatishlar (`routes-platform-admin.ts`), support uchun parol tiklash. Qo‘lda test: `docs/tests/PLATFORMA_ROLLARI_D21_TEST_CASES.md`.
- **Avans hisobi va subpudratchi (2026-10-26, D22, migratsiya `024_advance_offset`):** bajarildi, `main` da (PR #9). Integratsiya 78/0, rollar 5/5, UI 50 tekshiruv.
- **Egasi izohlari (O.docx, 2026-10-26):** Subpudratchi — D22 bilan yopildi; raqam maydonlarida minglar bo‘sh joy bilan (`3 000 000`) — bajarildi (`NumericInput`, `Input inputMode="decimal"`, qiymat bo‘sh joysiz). Tugmalar (2026-10-27): ikkinchi darajali va matnli “ghost” tugmalar chegarali, ustiga kelganda bordo; jadvaldagi bir nechta amal tugmasi tor ustunda ustma-ust tushadi (kesilmaydi); “Reversal” → “Teskari qilish / Teskari yozuv”. Shrift o‘lchami: Profil → “Shrift o‘lchami” (Kichik 0,9 / O‘rtacha / Katta 1,15; `--font-scale`, tanlov shu qurilmada). Jadval va kartalardagi summalar ham `1 000 000` (Chrome’da `uz-UZ` “1,000,000” berardi — `formatMoney`/`formatQuantity` endi `ru-RU` guruhlashi bilan).
- **2026-10-27:** O3, O12, O17 bajarildi (9.4), 2FA poygasi tuzatildi (PR #14).
- **2026-10-27:** rollar testi D21 tuzatish marshrutlarini (`:doc_id` — ombor harakati, moliyaviy hujjat, hisobot) ham qamraydi; endi har GET marshrut matritsada bo‘lishi shart (`unfillable` bo‘sh bo‘lmasa test yiqiladi).
- **2026-10-28 (D23):** video g‘oyalari tartibi D → A → B → E → C tasdiqlandi, C qoidalari 1-bo‘limda; har biri alohida bosqich va PR.
- **Keyingi qadam:** video g‘oyalari (A–E, egasi tanlovi); production tayyorgarligi (BACKEND_TODO 12). Keyin 9.4 dagi qolgan ochiq ishlar va 7-bo‘lim.

### 9.2. Yangi kompyuterni tayyorlash

1. **Dasturlar:** Git, Node.js ≥ 24, pnpm 10, Docker Desktop, Google Chrome (`test:ui` uchun), Claude Code.
2. **Repo:** `git clone https://github.com/Ismoil59/barpoai.git`. Repo private, shuning uchun GitHub akkauntiga kirish kerak.
3. **`backend/.env`:** git’da yo‘q, unda baza parollari va Telegram bot tokeni bor.
   - Eski kompyuterdan xavfsiz yo‘l bilan ko‘chiring (flesh, parol menejeri) yoki `backend/.env.example` dan yangisini yarating.
   - Chat yoki git orqali yubormang.
4. **Telegram:** bitta bot tokeni bilan ikki kompyuterda worker ishlamasin, `getUpdates` konflikt beradi. Eski kompyuterda `backend` papkasida `docker compose down` qiling yoki yangi kompyuterda alohida test bot ishlating.
5. **Ishga tushirish:** handoff 4.2 bo‘yicha.
   - Yangi baza bo‘sh bo‘ladi: birinchi platforma egasini handoff 4.3 bo‘yicha yarating.
   - Eski kompyuterdagi “Sinov kompaniya” va `SINOV-` test ma’lumotlari ko‘chmaydi.
6. **`COMPOSE_PROJECT_NAME=barpo`:** faqat eski kompyuterdagi nom to‘qnashuvi uchun kerak edi (handoff 4.1). Yangi kompyuterda shart emas, lekin qo‘yib qo‘ysangiz zarari yo‘q.
7. **Testlar:** handoff 11-bo‘limdagi buyruqlar.

### 9.3. Yangi Claude sessiyasini boshlash

Claude Code’ni repo papkasida oching. Birinchi xabar:

```text
CLAUDE.md, docs/BARPO_AI_HANDOFF.md va docs/TZ_VA_NARX_REJASI.md ni o‘qi (ayniqsa 1-, 3- va 9-bo‘limlar).
Joriy holatni va keyingi qadamni qisqa ayt, hech narsani o‘zgartirma.
```

Keyin keyingi bosqich uchun 6-bo‘limdagi promptni yangi sessiyada ishlating. TZ ID’lari (G-13, OBJ-07 va h.k.) `docs/tz/BARPO_AI_Figma_TZ.md` da qidiriladi.

### 9.4. Ochiq ishlar (testlar va tekshiruvlar topgan, hali rejalashtirilmagan)

Qator raqamlari 2026-10-10 holatiga tegishli.

| # | Ish | Manba | Taklif |
|---|---|---|---|
| O1 | **Bajarildi 2026-10-12.** Invoysga bog‘lanadigan ombor kirimlari tanlovi `limit=100`: 101-chi eski, hali bog‘lanmagan kirim chiqmaydi | NATIJA UI-11, `DocumentModal.tsx:49` | `GET /v1/stock/commands` ga `unmatched=true` va `q` (material nomi); invoys formasida `SearchSelect` |
| O2 | Telegram bot material ro‘yxati `LIMIT 60`, qidiruvsiz: 60+ materialli kompaniya bot orqali material so‘ray olmaydi | `telegram-flows.ts:153` | Botda nom bo‘yicha qidiruv yoki sahifalash |
| O3 | **Bajarildi 2026-10-27.** Frontendda pul yig‘indisi: kassalar (`finance/pages.tsx:387`), budjet (`:755–756`), to‘lov kalendari (`workflow.tsx:483, 525`), smeta importi oldindan ko‘rish (`ImportWizard.tsx:153`) | NATIJA UI-10, EST-06 | Jamlarni serverdan olish (`CLAUDE.md` qoidasi). Kassalar, budjet va kalendar jamlari F5 da serverga o‘tgan edi; 2026-10-27: smeta importi oldindan ko‘rish jami (`POST /v1/estimate-imports/preview` → qator `total`, umumiy `total`) va invoys uchun ombor kirimi qiymati (`GET /v1/stock/commands` → `value`, ledger bo‘yicha — invoys summasi aynan shunga teng) serverdan. Muharrirdagi saqlanmagan qatorlar taxminiy jami (1.2 qarori) va oylik miqdor tekshiruvi qoldi |
| O4 | **Bajarildi 2026-10-12.** Tarmoq xatosi (status 0) avtomatik qayta urinilmaydi | `frontend/src/app/App.tsx:141` | Faqat GET so‘rovlar (query) uchun: status 0 va 5xx 2 martagacha qayta uriniladi; mutation’lar qayta urinilmaydi |
| O5 | **Bajarildi 2026-10-12.** Obyekt PATCH’ida `FOR UPDATE` yo‘q: poyga holatida 409 o‘rniga 404 | 1.3 tekshiruvi | Qator `FOR NO KEY UPDATE` bilan qulflanadi, keyin versiya solishtiriladi; integratsion test poygani takrorlaydi |
| O6 | **Bajarildi 2026-10-12.** Blok bo‘lmagan zonaga `floors_count` xatosiz tashlab yuboriladi | 1.3 | Yaratish va tahrirda 400 `VALIDATION_ERROR` (`floors_count`) |
| O7 | **Bajarildi 2026-10-12.** `top_debt` va obyekt yig‘masi yozuv bo‘lmasa `'0'` qaytarishi mumkin, `'0.00'` emas | Tuzatish sessiyasi | `/v1/finance/summary` dagi barcha summalar `::numeric(20,2)`. Obyekt yig‘masi (`/v1/projects/:id/dashboard`) avvaldan `money()` orqali `'0.00'` qaytarardi |
| O8 | **Bajarildi 2026-10-12.** `docs/backend/BARPO_API_GUIDE.md` dagi auditga yoziladigan eksportlar ro‘yxatida smeta eksporti yo‘q | Tuzatish sessiyasi | `GET /v1/estimates/{id}/export` ro‘yxatga qo‘shildi |
| O9 | `/admin/tenants/abc` va Billing default sahifa hajmi uchun UI testi yo‘q; ERR-03 ning super_admin va support qismi tekshirilmagan | NATIJA | `ui-test.ts` ga qo‘shish (bootstrap bilan) |
| O10 | **Bajarildi 2026-10-12.** `PayablesList` (`finance/pages.tsx`) hech qayerda ishlatilmaydi | Kod ko‘rib chiqish | O‘chirildi (egasi qarori) |
| O11 | Rasm almashtirilganda eski fayl qoladi (yetim fayllar) | 1.3, BACKEND_TODO 08 | 08-bosqich bilan |
| O12 | **Bajarildi 2026-10-27** (`finance.ts`: `accountingDaySql` — hujjat `document_date`, sarf Toshkent sanasi; reja–fakt, yig‘ma/budjetlar, prognoz, hisobotlar va dashboard `over_budget` bitta qoida). Fakt xarajat oyi sahifalarda `journal_entries.created_at` (yozuv vaqti) bo‘yicha: reja–fakt (`routes-finance-extra.ts:66`) va Budjetlar sahifasi manbasi `/v1/finance/summary` (`routes-finance-extra.ts:294`). Dashboard grafiklari esa hisob sanasi (`document_date`) bo‘yicha, shuning uchun o‘tgan sana bilan kiritilgan hujjat dashboardda va sahifada turli oyda ko‘rinadi. “Budjetdan oshgan obyekt” sahifa bilan bir xil bo‘lishi uchun hozircha `created_at` da | 1.4 (egasi, 2026-10-12) | Sahifalarni ham hisob sanasiga o‘tkazish (`routes-dashboard.ts` dagi `expenseSql` ni umumiy qilish), keyin `over_budget` ham |
| O13 | Bekor qilingan (reversal) invoys ombor kirimini bo‘shatmaydi: `finance_documents` da `UNIQUE(tenant_id, matched_receipt_id)` bor, asl invoys `matched_receipt_id` ni saqlab qoladi. Shuning uchun kirimni yangi invoysga bog‘lab bo‘lmaydi va u O1 dagi `unmatched=true` tanlovida ham chiqmaydi | O1 (egasi, 2026-10-12) | Xatti-harakat hozircha o‘zgartirilmagan. Kerak bo‘lsa: unikallikni faqat bekor qilinmagan invoyslarga qo‘llash (qisman indeks) va `unmatched` filtrini shunga moslash |
| O14 | Ruxsatlar qayta yuklanayotganda (`loadPermissions` xato bersa `permissions=null`) `RequirePage` bir lahza “Ruxsat yo‘q” ko‘rsatadi; UI testda bir marta “topilmadi” tekshiruvini yiqitgan | `frontend/src/lib/auth.tsx`, `guards.tsx`; `ui-test.ts` ~1139 (2026-10-11) | Qayta yuklash paytida va vaqtinchalik xatoda oldingi ruxsatlarni saqlash |
| O16 | Super admin uchun alohida Telegram bot: support so‘rovi (`POST /v1/support-requests`) yozilganda super admin(lar)ga platformadagi bildirishnoma va shu botga xabar ketadi. Bot faqat xabar yuboradi, javob platformada yoziladi. Hozir support so‘rovi hech kimga bildirishnoma yubormaydi | Egasi, 2026-10-12 | Keyinchalik: alohida token (`TELEGRAM_ADMIN_BOT_TOKEN`, egasi BotFather’da yaratadi va `.env` ga o‘zi yozadi), platforma foydalanuvchisini bir martalik havola bilan ulash, `notify()` ni `tenant_id IS NULL` qabul qiluvchilar uchun shu bot orqali yetkazish, alohida polling |
| O17 | **Bajarildi.** `date` ustunlari matn sifatida o‘qiladi (`db.ts`, `pg.types.setTypeParser(1082)`, PR #11); 2026-10-27 tekshirildi: `TZ=Asia/Tashkent npm run test:integration` — 89 o‘tdi, 0 yiqildi. `test:integration` UTC+5 vaqt zonasidagi kompyuterda (foydalanuvchining Windows’i) `integration.ts` ~3043-qatorda yiqiladi: `pg` `date` ustunini mahalliy yarim tunda o‘qiydi, JSON’da oldingi kun bo‘lib chiqadi, `summaryP.monthly` da joriy oy topilmaydi. Toza `main` da ham shunday; `TZ=UTC` bilan hammasi o‘tadi | Tekshiruv, 2026-10-12 | `date` turini satr sifatida o‘qish (`pg.types.setTypeParser(1082, v => v)`) — API javoblari formatiga ta’sirini tekshirib, alohida |
