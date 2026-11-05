# D22/D23/O-seriya funksiyalarining mustaqil tekshiruvi — test case’lar va natijalar (2026-10-28/29)

> **Maqsad:** `main` (33bbec1) ga birlashtirilgan yangi funksiyalarni (D22 avans hisobi, O3/O12/O17, D23 V-A…V-E, raqam ajratish va shrift o‘lchami) qa:smoke’dan tashqari holatlarda tekshirish: salbiy yo‘llar, chegaralar, ruxsat chegaralari, endpointlar o‘rtasidagi muvofiqlik.
> **Usul:** har yo‘nalish uchun test case’lar kod va `docs/backend/BARPO_BUSINESS_RULES.md` dan mustaqil tuzildi (kutilgan natija kod/qoida manbasi bilan; to‘liq qadamlar — so‘rov tanalari, rollar, tartib — skriptlarda bajarildi, bu yerda ixchamlik uchun faqat kutilgan natija va manba), so‘ng ishlab turgan lokal stack ustida alohida `QA-202610281434-*` kompaniyalarida HTTP (UI uchun Playwright) orqali bajarildi. Yiqilgan har bir holat qayta tekshirildi: haqiqiy nuqsonmi yoki test kutilmasi noto‘g‘rimi. QA kompaniyalar yakunda `npm run qa:cleanup -- --all-qa` bilan o‘chirildi.
> **Belgilar:** ✅ o‘tdi · ❌ yiqildi — haqiqiy nuqson · ⚠️ yiqildi, lekin kod qoidaga mos (test kutilmasi noto‘g‘ri yoki standart siyosat) · ⏸ bloklangan.

## Xulosa

| Yo‘nalish | Jami | O‘tdi | Yiqildi | Bloklangan | Haqiqiy nuqson |
|---|---|---|---|---|---|
| V-A — vazifani smeta qatoriga bog‘lash | 14 | 11 | 2 | 1 | 0 |
| V-B — ko‘p qatorli talabnoma | 14 | 12 | 1 | 1 | 0 |
| V-C — brigada akkord hisobi | 14 | 13 | 1 | 0 | 1 |
| V-D obyekt moliya kartasi va V-E qavat × ish matritsasi | 14 | 10 | 4 | 0 | 0 |
| D22 avans hisobi, O12 hisob sanasi, O3 server jamlari, O17 UTC+5 | 13 | 7 | 6 | 0 | 6 |
| Ruxsat chegaralari, narx kesish, o‘zgarmas jurnallar, tenant izolyatsiyasi | 14 | 13 | 1 | 0 | 0 |
| UI (Playwright): raqam ajratish, shrift, tugmalar, yangi ekranlar | 14 | 8 | 6 | 0 | 0 |
| **Jami** | 97 | 74 | 21 | 2 | 7 |

### Topilgan haqiqiy nuqsonlar

1. **FIN-10 — storno sanasi UTC bo‘yicha (O12/O17).** `reverseFinance` storno hujjatining `document_date` ini Postgres `current_date` dan oladi (`backend/src/finance.ts:268`), baza sessiyasi esa UTC. Toshkent vaqti 00:00–04:59 oralig‘ida qilingan storno kechagi sanani oladi; oyning 1-kunida — o‘tgan oyga tushadi. Tuzatish: `current_date` → `(now() AT TIME ZONE 'Asia/Tashkent')::date`.
2. **VC-07, FIN-02/04/06/07/12 — pul satrlari `"0"` ko‘rinishida.** Yig‘indi bo‘sh bo‘lganda `coalesce(sum(...),0)::text` `"0"` qaytaradi, `"0.00"` emas: `GET /v1/finance/documents` `items[].paid` (`routes-operations.ts:695/:729`), `summary.total/outstanding` (`:716-717`), `GET /v1/finance/payroll` `periods[].paid/total/gross/due` (`routes-finance-extra.ts:677-681`). Hisob-kitob to‘g‘ri, UI to‘g‘ri ko‘rsatadi; faqat API konvensiyasi (2 kasr) buzilgan. Tuzatish: `::numeric(20,2)` cast.

### Egasi qarori

- **Smetani arxivlash (VA-05, VA-12, VDE-04):** egasi 2026-10-29 da qaror qildi (D24) — smetani arxivlash faqat mijoz adminida qoladi; bosh muhandisning 403 olishi to‘g‘ri, shu uch holatdagi kutilma noto‘g‘ri deb belgilandi.

## V-A — vazifani smeta qatoriga bog‘lash

### VA-01 — Vazifa smeta qatori va boshlanish sanasi bilan yaratiladi; ro‘yxat, karta va estimate-lines bir xil reja hajmini qaytaradi (ijobiy)

**Kutilgan natija:** 1: 200; javobda estimate_line_id=L1, planned_start="2026-11-03" (DATE satr), status "todo", version 1. 2: 200; estimate_line_name "QA Beton", estimate_kind "labor", estimate_unit "m3", estimate_plan_quantity "100.000000", estimate_fact_quantity "0" (coalesce(sum,0) — progress yo‘q), estimate_percent "0.0", estimate_line_archived false, estimate_fact_value null (ish qatori — summa yo‘q), planned_start "2026-11-03". 3: …

**Manba:** backend/src/routes-work.ts:88-126 (POST body, INSERT), :29-35 (list taskLineSql); backend/src/estimates.ts:15-23 (taskLineSql); backend/src/routes-work-extra.ts:64-103; backend/src/routes-operations.ts:302-324; BARPO_BUS …

**Natija:** ✅ o‘tdi

### VA-02 — Ish qatori fakti = qabul qilingan hisobot hajmi + tuzatishlar; foiz 1 xonaga yaxlitlanadi (33.35 → 33.4); yuborilgan-lekin-qabul qilinmagan hisobot hisobga kirmaydi (muvofiqlik)

**Kutilgan natija:** 2: estimate_fact_quantity "0", estimate_percent "0.0" (progress_entries faqat qabulda yoziladi). 4: estimate_fact_quantity "33.330000", estimate_percent "33.3". 5: 200, lekin T1 fakti o‘zgarmaydi (R2 submitted). 7: karta estimate_fact_quantity "33.350000", estimate_percent "33.4" (round(33.35,1) — numeric yaxlitlash yarimdan yuqoriga); ro‘yxat itemi bir xil; work-lines item fact_quantity "33.350000"; GET /v1/estimate …

**Manba:** backend/src/estimates.ts:9-10 (workFactSql), :19-21 (round(...,1)); backend/src/routes-work.ts:342-350 (progress_entries faqat accepted); backend/src/routes-work-extra.ts:13-53 (correctProgress), :236-239 (work-lines fac …

**Natija:** ✅ o‘tdi

### VA-03 — Material qatori fakti = tasdiqlangan (posted/partial) sarfning accepted_quantity; kutilayotgan sarf kirmaydi; estimate_fact_value faqat prices.read bilan (ruxsat)

**Kutilgan natija:** 2: estimate_kind "material", estimate_plan_quantity "500.000000", estimate_fact_quantity "0", estimate_percent "0.0", estimate_fact_value "0.00" (M prices.read, jurnal yo‘q). 3: 200, status "posted", accepted_quantity "100.000000". 4: M va admin: estimate_fact_quantity "100.000000", estimate_percent "20.0", estimate_fact_value "120000.00" (100 kg × 1200 FIFO, journal inventory −120000.00); F: hajm va foiz bir xil, le …

**Manba:** backend/src/estimates.ts:16-21 (material: status IN posted,partial); backend/src/inventory.ts:286-313 (review → accepted_quantity, posted; journal expense/inventory); backend/src/routes-work-extra.ts:72-78 (ko‘rish huquq …

**Natija:** ✅ o‘tdi

### VA-04 — Boshqa obyekt qatori yoki mavjud bo‘lmagan qator — 400 ESTIMATE_LINE_NOT_FOUND (POST va PATCH), vazifa yaratilmaydi (salbiy)

**Kutilgan natija:** 1: HTTP 400, error.code "ESTIMATE_LINE_NOT_FOUND" (404 emas). 2: HTTP 400, "ESTIMATE_LINE_NOT_FOUND". 3: items.length = N0 (hech narsa yozilmagan — xato INSERT dan oldin). 4: PATCH → HTTP 400 "ESTIMATE_LINE_NOT_FOUND". 5: estimate_line_id null, version 1 (PATCH ta’sir qilmagan).

**Manba:** backend/src/estimates.ts:24-37 (assertEstimateLine: project_id, archived_at, 400); backend/src/routes-work.ts:107-108; backend/src/routes-lifecycle.ts:79-80; TZ_VA_NARX_REJASI.md:126; BARPO_BUSINESS_RULES.md:178

**Natija:** ✅ o‘tdi

### VA-05 — Arxivlangan reviziya qatori va arxivlangan smeta qatori — 400 ESTIMATE_LINE_NOT_FOUND (salbiy)

**Kutilgan natija:** 1: 200, revision R+1, lines[0].id ≠ L1. 2: HTTP 400 "ESTIMATE_LINE_NOT_FOUND" (l.archived_at IS NOT NULL). 3: 200. 4: DELETE → 200 {ok:true}. 5: HTTP 400 "ESTIMATE_LINE_NOT_FOUND" (qator arxivlanmagan, lekin e.archived_at IS NOT NULL — JOIN estimates sharti). 6: HTTP 400 "ESTIMATE_LINE_NOT_FOUND" (yangi id eski id dan farq qilgani uchun tekshiriladi).

**Manba:** backend/src/estimates.ts:25-36 (l.archived_at IS NULL AND e.archived_at IS NULL), :97-108 (reviziya eski qatorlarni arxivlaydi); backend/src/routes-operations.ts:400-419, :420-442 (DELETE estimate → archived_at); backend …

**Natija:** ⚠️ yiqildi — test kutilmasi noto‘g‘ri — 4-qadam: Egasi qarori (D24, 2026-10-29): smetani arxivlash faqat mijoz adminida — bosh muhandisning 403 PAGE_ACTION_FORBIDDEN olishi to‘g‘ri, test kutilmasi noto‘g‘ri edi. Qolgan 5 qadam (eski reviziya qatori va arxivlangan smeta qatori → 400 ESTIMATE_LINE_NOT_FOUND) kutilganidek o‘tdi.

### VA-06 — PATCH: estimate_line_id/planned_start berilmasa saqlanadi, null bo‘lsa olib tashlanadi; bog‘lanish olib tashlangach karta maydonlari null (chegara)

**Kutilgan natija:** 1: 200, estimate_line_id=L1, planned_start "2026-11-03", version 2. 2: karta estimate_line_name "QA Beton", planned_start "2026-11-03". 3: 200, planned_start null, estimate_line_id hali L1, version 3. 4: 200, estimate_line_id null, version 4. 5: karta: estimate_line_id null, estimate_line_name null, estimate_kind null, estimate_unit null, estimate_plan_quantity null, estimate_fact_quantity null, estimate_percent null …

**Manba:** backend/src/routes-lifecycle.ts:61-63 (nullable().optional()), :83-99 (CASE WHEN $11::boolean ... / $13::boolean); backend/src/estimates.ts:15-22 (l.id IS NULL → NULL; archived false); BARPO_BUSINESS_RULES.md:178

**Natija:** ✅ o‘tdi

### VA-07 — Reja hajmi 0 bo‘lgan qator: estimate_percent null, fakt bo‘lsa ham null qoladi (chegara)

**Kutilgan natija:** 1: 200, lines[0].effective_quantity "0.000000", total "0.00" (agar baza quantity 0 ni rad etsa — buni alohida topilma sifatida yozing; qoida reja ≤ 0 holatini nazarda tutadi). 2: estimate_plan_quantity "0.000000", estimate_fact_quantity "0", estimate_percent null (l.effective_quantity<=0 → NULL). 4: estimate_fact_quantity "5.000000", estimate_percent null — reja 0 bo‘lgani uchun bo‘lishdan saqlanadi; ro‘yxat itemi bi …

**Manba:** backend/src/estimates.ts:19-21 (CASE WHEN l.effective_quantity<=0 THEN NULL); backend/src/schemas.ts:7 (qty "0" ga ruxsat), :28-53; backend/src/money.ts:6-18 (plannedQuantity); BARPO_BUSINESS_RULES.md:179

**Natija:** ✅ o‘tdi

### VA-08 — Smeta reviziyasida vazifa mos qatorga (tur, nom, birlik, zona, material bir xil) o‘tadi; karta yangi reja hajmini oladi; fakt qator id bo‘yicha — qavat matritsasi bilan solishtiriladi (muvofiqlik)

**Kutilgan natija:** 0: estimate_fact_quantity "40.000000", estimate_percent "40.0". 1: 200, L1n ≠ L1. 2: estimate_line_id = L1n (avtomatik o‘tdi), estimate_line_archived false, estimate_plan_quantity "120.000000", estimate_line_name "QA Beton"; ro‘yxat itemi bir xil. Kod bo‘yicha estimate_fact_quantity "0", estimate_percent "0.0" — progress_entries eski L1 ga bog‘langan, workFactSql faqat l.id=L1n ni sanaydi. 3: items ichida L1n bor, L1 …

**Manba:** backend/src/estimates.ts:145-160 (UPDATE tasks ... relink), :9-10 (workFactSql l.id bo‘yicha); backend/src/routes-lifecycle.ts:78-80; backend/src/routes-operations.ts:302-324; BARPO_BUSINESS_RULES.md:180 (reviziya), :193 …

**Natija:** ✅ o‘tdi

### VA-09 — Reviziyada mos qator yo‘q (nom bir xil, zona farq qiladi) — vazifa eski qatorda qoladi, estimate_line_archived=true; oddiy tahrir bloklanmaydi; foydalanuvchi qayta bog‘laydi (muvofiqlik)

**Kutilgan natija:** 2: estimate_line_id = L1 (o‘zgarmagan — zone_id Z1 vs NULL IS DISTINCT), estimate_line_archived true, estimate_line_name "QA Beton", estimate_plan_quantity "100.000000"; ro‘yxat itemida ham estimate_line_archived true; GET /v1/estimate-lines items da L1 yo‘q, L1z bor (zone_name null). 3: 200, estimate_line_id hali L1, version 2 (eski reviziya qatori tahrirni bloklamaydi). 4: 200, estimate_line_id L1, version 3 (id te …

**Manba:** backend/src/estimates.ts:149-158 (n.zone_id IS NOT DISTINCT FROM o.zone_id, EXISTS sharti), :22 (estimate_line_archived); backend/src/routes-lifecycle.ts:78-80 (bog‘lanish o‘zgarmasa tekshirilmaydi); backend/src/routes-o …

**Natija:** ✅ o‘tdi

### VA-10 — Reviziyada bir nechta mos qator bo‘lsa vazifa position bo‘yicha birinchisiga o‘tadi (chegara)

**Kutilgan natija:** 1: 200, uchala qator yangi id bilan. 2: estimate_line_id = Bq (position 2 — ORDER BY n.position,n.id LIMIT 1), estimate_plan_quantity "30.000000", estimate_line_archived false. 3: lines[0].id = Bq, lines[0].position 2, lines[1].id = A — T1.estimate_line_id = lines[0].id. 4: items tartibi smeta nomi, so‘ng position: Bq, A, M1-yangi.

**Manba:** backend/src/estimates.ts:149-153 (ORDER BY n.position,n.id LIMIT 1), :134 (position saqlanadi); backend/src/routes-operations.ts:393 (ORDER BY l.position,l.id), :318; BARPO_BUSINESS_RULES.md:180 (bir nechta bo‘lsa positi …

**Natija:** ✅ o‘tdi

### VA-11 — GET /v1/estimate-lines: estimates.read bo‘lmagan rollar 403, biriktirilmagan obyekt 404, project_id majburiy; javobda narx maydonlari yo‘q (ruxsat)

**Kutilgan natija:** 1: HTTP 403, error.code "PAGE_ACTION_FORBIDDEN" (pageAllowed('estimates','read') permit dan oldin rad etadi; brigadier da estimates.read yo‘q). 2: HTTP 403 "PAGE_ACTION_FORBIDDEN". 3: 200; items[0] kalitlari aynan {id, estimate_id, estimate_name, kind, description, unit_id, effective_quantity, category, zone_name}; unit_price, total, labor_rate, fact_quantity YO‘Q; items.length 2. 4: 200 (accountant estimates.read).  …

**Manba:** backend/src/routes-operations.ts:302-324 (permission estimates.read, select ro‘yxati, sensitive emas); backend/src/http.ts:137-152 (PAGE_ACTION_FORBIDDEN → permit), :229-233 (VALIDATION_ERROR); backend/src/permissions.ts …

**Natija:** ✅ o‘tdi

### VA-12 — GET /v1/estimate-lines q qidiruvi: tavsif, smeta nomi, kategoriya bo‘yicha ILIKE; % va _ qochiriladi; faqat joriy qatorlar; sahifalash (chegara)

**Kutilgan natija:** 1: items 3 ta, tartib: "QA Beton" (estimate_name "QA smeta", position 0), "QA Sement" (position 1), "QA Shtukaturka" (estimate_name "QA smeta B"). 2: 1 item, description "QA Beton" (ILIKE, registr farqsiz). 3: 1 item, "QA Shtukaturka" (smeta nomi bo‘yicha; "QA smeta" nomi "smeta B" ni o‘z ichiga olmaydi). 4: 1 item, "QA Shtukaturka" (category). 5: items [] — "%" literal sifatida qochiriladi, hech bir tavsif/nom/kateg …

**Manba:** backend/src/routes-operations.ts:308-320 (searchQuery, ILIKE ESCAPE, ORDER BY e.name,l.position,l.id, e.archived_at IS NULL); backend/src/schemas.ts:100-104 (searchText max 100, likePattern); BARPO_BUSINESS_RULES.md:181

**Natija:** ⚠️ yiqildi — test kutilmasi noto‘g‘ri — 9-qadam: Egasi qarori (D24, 2026-10-29): smetani arxivlash faqat mijoz adminida — bosh muhandisning 403 PAGE_ACTION_FORBIDDEN olishi to‘g‘ri, test kutilmasi noto‘g‘ri edi. Admin arxivlagandan keyin qidiruv kutilganidek: arxivlangan smeta qatori chiqmaydi; qolgan 8 qadam (ILIKE, % va _ qochirish, sahifalash, 101 belgi → 400) o‘tdi.

### VA-13 — UI: vazifa kartasida qator, reja/fakt/foiz va «Eski reviziya qatori» belgisi; tahrir oynasida qator tanlash; qidiruv qator nomi bo‘yicha (ijobiy)

**Kutilgan natija:** 2: karta ostida kichik matn «QA Beton · 35.0 %». 3: «beton» — karta qoladi (estimate_line_name bo‘yicha filtr); «sement» — karta yo‘qoladi (hech bir vazifa Sement qatoriga bog‘lanmagan); tozalangach qaytadi. 4: «Boshlanish sanasi» qatori 2026-11-03 sanasi bilan; «Smeta qatori» qatori: «QA Beton», ostida «Reja: 100 m3 · Qabul qilingan: 35 m3 (35.0 %)» (formatQuantity ko‘rinishida), «Material sarfi» ko‘rsatilmaydi (ish …

**Manba:** frontend/src/features/work/TasksPage.tsx:86-92 (qidiruv estimate_line_name), :128-131, :289-293 (kanban), :488-502 (can('estimates') SearchSelect /v1/estimate-lines), :581-603 (drawer: planned_start, badge, reja/fakt/foi …

**Natija:** ⏸ bloklangan — UI case not executable in this harness: fetch-only node script, no browser automation (test:ui/puppeteer not allowed), and the frontend dev server at http://localhost:5173 is not running (ECONNREFUSED). Step-0 API data was not created to avoid altering P1 facts. Static read of frontend/src/features/work/TasksPage.tsx matches the described wiring: kanban (l.129-131, 289-293) renders 'estimate_line_name · estimate_percent %'; search (l.89) filters by estimate_line_name; drawer (l.581-603) shows planned_start, estimate_line_name, warning Badge tasks.estimate_old_revision when estimate_line_archiv …

### VA-14 — Validatsiya va qulf: noto‘g‘ri sana/uuid 400, planned_start muddatdan keyin ruxsat, submitted vazifada PATCH 409 TASK_LOCKED, eski version 409 (salbiy)

**Kutilgan natija:** 1: HTTP 400 "VALIDATION_ERROR", fields[].path ["planned_start"] (ISO YYYY-MM-DD kerak). 2: HTTP 400 "VALIDATION_ERROR", path ["estimate_line_id"]. 3: 200 — planned_start "2026-11-20" muddat 2026-11-01 dan keyin bo‘lsa ham qabul qilinadi (tartib tekshirilmaydi). 4: PATCH → HTTP 409 "TASK_LOCKED". 5: estimate_line_id hali L1, status "submitted", version 3. 6: HTTP 409 "VERSION_CONFLICT". 7: HTTP 400 "VALIDATION_ERROR"  …

**Manba:** backend/src/schemas.ts:2-5 (uuid, date=z.iso.date()); backend/src/routes-work.ts:88-100 (strictObject); backend/src/routes-lifecycle.ts:52-64, :73-74 (VERSION_CONFLICT, TASK_LOCKED); backend/src/http.ts:229-233; BARPO_BU …

**Natija:** ✅ o‘tdi

## V-B — ko‘p qatorli talabnoma

### VB-01 — lines[] chegaralari: 0 va 51 qator → 400, 50 qator → 200; miqdor, sana, izoh va noma’lum maydon validatsiyasi (chegara)

**Kutilgan natija:** 2, 3, 4: HTTP 400 {"error":{"code":"VALIDATION_ERROR"}}, fields[0].path[0] == 'lines'. 5: HTTP 200; R50.group_id uuid; R50.lines.length == 50; lines[i].position == i+1 (1..50); barcha lines[i].group_id bir xil; lines[i].quantity == '1.500000'; status 'pending'; version 1; requested_by == B1.id; zone_id null, needed_by null, note null, fulfilled_command_id null, reviewed_by null. 6 va 7: har bir urinish HTTP 400 VALID …

**Manba:** backend/src/routes-stock-extra.ts:190-199 (strictObject, lines min(1).max(50), positiveQty, date, note max 1000); backend/src/schemas.ts:4-9 (date = z.iso.date, qty regex 6 kasr, positiveQty); backend/src/http.ts:228-233 …

**Natija:** ✅ o‘tdi

### VB-02 — Bitta material ikki marta: 400 REQUEST_LINE_DUPLICATE, hech qanday qator va bildirishnoma yozilmaydi (salbiy)

**Kutilgan natija:** 2 va 3: HTTP 400 {"error":{"code":"REQUEST_LINE_DUPLICATE"}}. 4: HTTP 200, lines.length 2. 5: summary.total == T0+1 (faqat nazorat talabnomasi); items ichida note 'QA dup' yoki 'QA dup2' bo‘lgan guruh yo‘q; W bildirishnomalari total == N0+1 (faqat 'QA nazorat' uchun kind 'stock.request'; dup urinishlari xabar yubormagan).

**Manba:** backend/src/routes-stock-extra.ts:203-205 (new Set(materialIds).size === length → invariant 'REQUEST_LINE_DUPLICATE', 400 — INSERT va notify dan oldin), 243-259 (notify faqat muvaffaqiyatli yaratishda); docs/backend/BARP …

**Natija:** ✅ o‘tdi

### VB-03 — Noma’lum yoki arxivlangan material: 404 NOT_FOUND, talabnoma atomar — to‘g‘ri qatorlar ham yozilmaydi (salbiy)

**Kutilgan natija:** 2, 3, 4: HTTP 404 {"error":{"code":"NOT_FOUND"}}. 4: GET /v1/materials ro‘yxatida M3 chiqmaydi (archived_at IS NULL filtri). 5: summary.total == T0; note 'QA notfound' yoki 'QA archived' bo‘lgan guruh yo‘q; M1 uchun yakka qatorli 'QA notfound' guruhi ham yo‘q (butun so‘rov bitta tranzaksiyada — qisman yozuv qolmaydi).

**Manba:** backend/src/routes-stock-extra.ts:206-214 (materials ... archived_at IS NULL; invariant materials.size === materialIds.length, 'NOT_FOUND', 404 — INSERT dan oldin); backend/src/db.ts:24-31 (transaction) va backend/src/ht …

**Natija:** ✅ o‘tdi

### VB-04 — 3 qatorli talabnoma: zona, kerakli sana, izoh har qatorga ko‘chadi; ro‘yxat sarlavhasi; summary, dashboard va overview guruhni sanaydi (3 emas, 1) (ijobiy)

**Kutilgan natija:** 1: HTTP 200; R.group_id uuid; R.lines.length 3; R.lines[0]: position 1, material_id M1, quantity '50.000000'; R.lines[1]: position 2, material_id M2, quantity '120.250000'; R.lines[2]: position 3, material_id M3, quantity '7.000000'; HAR qatorda: zone_id == Z, needed_by == '2026-11-05', note == 'QA VB uch qator', status 'pending', version 1, requested_by == B1.id, project_id == P, group_id == R.group_id, reviewed_by  …

**Manba:** backend/src/routes-stock-extra.ts:217-235 (har qatorga zone_id/needed_by/note), 295-301 (qatorlar JOIN material/users/zones, ORDER BY position), 311-327 (items head maydonlari), 304-310 (summary guruh bo‘yicha), 67-72 (s …

**Natija:** ✅ o‘tdi

### VB-05 — Guruh bo‘yicha bitta bildirishnoma (dedup_key, barcha qatorlar bilan) ombor mudiri va adminga; idempotent qayta yuborish yangi guruh yaratmaydi (muvofiqlik)

**Kutilgan natija:** 2: HTTP 200. 3: HTTP 200, R2.group_id == R.group_id, R2.lines[i].id == R.lines[i].id (saqlangan javob qaytadi, yangi guruh yo‘q). 4: HTTP 409 {"error":{"code":"IDEMPOTENCY_CONFLICT"}}. 5: W da payload.group_id == R.group_id bo‘lgan bildirishnoma AYNAN 1 ta: kind 'stock.request', title '📦 Material so‘rovi', payload.request_id == R.lines[0].id, body quyidagi satrlarni o‘z ichiga oladi: 'Obyekt: QA VB obyekt', '• QA VB …

**Manba:** backend/src/routes-stock-extra.ts:237-242 (lineText '• name: quantity(l.quantity) unit'), 243-259 (projectRecipients ['warehouse_manager'] exclude actor.id; notify dedup_key `stock.request:${groupId}:${user}`, payload {r …

**Natija:** ✅ o‘tdi

### VB-06 — Qisman bajarish: 50 kg so‘rovga 20 kg jo‘natma, rezerv, brigadir custody avtomatik, qabul, qoldiqlar va 'bajarildi' bildirishnomasi (ijobiy)

**Kutilgan natija:** 2: HTTP 200; F.status 'fulfilled'; F.version 2; F.quantity '50.000000' (so‘ralgan miqdor o‘zgarmaydi); F.fulfilled_command_id == F.command.id; F.reviewed_by == W.id; F.review_note null; F.reviewed_at not null; F.from_name 'Asosiy ombor'; F.command: kind 'transfer', status 'pending', quantity '20.000000', accepted_quantity '0.000000', from_account_id WHA, to_account_id == C.id, zone_id Z, project_id P, material_id M1, …

**Manba:** backend/src/routes-stock-extra.ts:367-394 (FROM_ACCOUNT, requester brigadier → custody INSERT ON CONFLICT, createStock quantity body.quantity ?? request.quantity, zone_id, reason), 403-427 (UPDATE status/fulfilled_comman …

**Natija:** ✅ o‘tdi

### VB-07 — Talabnoma holati qatorlardan: pending > fulfilled > rejected > cancelled; status filtri va summary shu holat bo‘yicha (muvofiqlik)

**Kutilgan natija:** 3: GA.status 'pending' (bitta qator kutilsa — bajarilgan va rad etilgan qatorlar bo‘lsa ham). 4: HTTP 200, qator status 'cancelled'. 7 (filtrsiz): GA.status 'fulfilled', GB.status 'rejected', GC.status 'cancelled'; GA.lines[0].reviewed_by W.id, GA.lines[1].reviewed_by W.id va review_note 'Yo‘q', GA.lines[2].reviewed_by B1.id. status=fulfilled → GA bor, GB va GC yo‘q; status=rejected → faqat GB; status=cancelled → faq …

**Manba:** backend/src/routes-stock-extra.ts:279-283 (CASE bool_or pending > fulfilled > rejected ELSE cancelled), 285-291 (WHERE g.status=$5), 304-310 (summary total/pending/fulfilled/rejected), 397-407 (qator status/reviewed_by/r …

**Natija:** ✅ o‘tdi

### VB-08 — Bekor qilish faqat so‘rovchiga: ombor mudiri, prorab, boshqa brigadir 403 FORBIDDEN, admin va bosh muhandis 403 PAGE_ACTION_FORBIDDEN; so‘rovchi 200, bildirishnomasiz (ruxsat)

**Kutilgan natija:** 2, 3, 4: HTTP 403 {"error":{"code":"FORBIDDEN"}} (sahifa ruxsati o‘tadi, handler requested_by === actor.id ni tekshiradi). 5: HTTP 403 {"error":{"code":"PAGE_ACTION_FORBIDDEN"}} (admin ombor sahifasida faqat read). 6: HTTP 403 PAGE_ACTION_FORBIDDEN (manager da stock.accept/stock.review/send/receive yo‘q). 7: L hali status 'pending', version 1. 8: HTTP 200; C.status 'cancelled', C.version 2, C.reviewed_by B1.id, C.rev …

**Manba:** backend/src/routes-stock-extra.ts:355-356 (VERSION_CONFLICT, INVALID_TRANSITION — default 409), 363-364 (cancel: request.requested_by === actor.id → FORBIDDEN 403), 408 (cancel → notify chaqirilmaydi), 426 (from_name nul …

**Natija:** ✅ o‘tdi

### VB-09 — Rad etish va bajarish faqat stock.send: brigadir (so‘rovchi) va prorab 403 FORBIDDEN, bosh muhandis va admin 403 PAGE_ACTION_FORBIDDEN; ombor mudiri rad etadi, so‘rovchiga xabar (ruxsat)

**Kutilgan natija:** 2, 3, 4 (ikkala urinish): HTTP 403 {"error":{"code":"FORBIDDEN"}}. 5: HTTP 403 PAGE_ACTION_FORBIDDEN. 6 (ikkalasi): HTTP 403 PAGE_ACTION_FORBIDDEN. 7: L1 status 'pending', version 1. 8: HTTP 200; J.status 'rejected', J.version 2, J.reviewed_by W.id, J.review_note 'Qoldiq yo‘q', J.command null, J.fulfilled_command_id null, J.from_name null. 9: B1 da 1 ta kind 'stock.request.rejected', title '❌ Material so‘rovi rad eti …

**Manba:** backend/src/routes-stock-extra.ts:365-366 (allowed(stock.send) → FORBIDDEN 403), 397-421 (status 'rejected', notify stock.request.rejected body 'Material/Miqdor/Izoh'), 426; backend/src/permissions.ts:185-199 (brigadier/ …

**Natija:** ✅ o‘tdi

### VB-10 — Bajarish validatsiyasi: from_account yo‘q → 400, brigadir bo‘lmagan so‘rovchiga to_account kerak → 400, custody/ombor manzili → 400, qoldiq yetmasa → 409, versiya → 409; qator o‘zgarmaydi (salbiy)

**Kutilgan natija:** 2: HTTP 200 (ombor mudiri stock.send bilan talabnoma yarata oladi). 3: HTTP 400 {"error":{"code":"FROM_ACCOUNT_REQUIRED"}}. 4: HTTP 409 INSUFFICIENT_AVAILABLE_STOCK. 5: HTTP 400 WAREHOUSE_TO_CUSTODIAN_REQUIRED. 6: HTTP 400 WAREHOUSE_TO_CUSTODIAN_REQUIRED. 7: HTTP 409 VERSION_CONFLICT. 8: ikkalasi HTTP 400 VALIDATION_ERROR. 9: HTTP 400 TO_ACCOUNT_REQUIRED. 10: HTTP 200, status 'fulfilled', command.to_account_id == C1. …

**Manba:** backend/src/routes-stock-extra.ts:338-345 (strictObject, quantity positiveQty), 355 (VERSION_CONFLICT), 368 (FROM_ACCOUNT_REQUIRED 400), 370-376 (requester.role !== brigadier → TO_ACCOUNT_REQUIRED 400), 385-394 (createSt …

**Natija:** ✅ o‘tdi

### VB-11 — Ko‘rish doirasi va yaratish huquqi: brigadir faqat o‘zinikini, ombor mudiri/prorab/admin hammasini, bosh muhandis hech narsa ko‘rmaydi; prorab, bosh muhandis va admin talabnoma yarata olmaydi (ruxsat)

**Kutilgan natija:** 1–3: HTTP 200. 4, 5, 6: HTTP 403 {"error":{"code":"PAGE_ACTION_FORBIDDEN"}} (ombor sahifasida create: prorab/bosh muhandisda stock.receive/send/consume yo‘q; admin stock da faqat read). 7: B1 → items barchasida requested_by == B1.id (R1 bor, R2 va R3 yo‘q), summary.total == B1 guruhlari soni (R2/R3 sanalmaydi); B2 → faqat R2; W (stock.send) → R1, R2, R3 hammasi, summary hammasini sanaydi; F (stock.review) → hammasi;  …

**Manba:** backend/src/routes-stock-extra.ts:275-278 (manage = stock.send || tenant_admin || stock.review), 280-284 (($3 OR requested_by=$4)), 304-310 (summary shu doirada); backend/src/permissions.ts:122-154 (permissionPage: stock …

**Natija:** ✅ o‘tdi

### VB-12 — Sahifalash talabnomalar (guruhlar) bo‘yicha: limit qatorlarni emas guruhlarni cheklaydi; kutilayotganlar avval; summary sahifalashsiz; limit/offset/status chegaralari (chegara)

**Kutilgan natija:** 3: A1.items.length 2, har birida lines.length 2; tartib: pending guruhlar avval, created_at DESC → A1.items[0].group_id == G3.group_id, A1.items[1].group_id == G2.group_id; A1.summary == {total:4, pending:3, fulfilled:0, rejected:0}. 4: A2.items == [G1 (pending), G4 (cancelled — eng yangi bo‘lsa ham pending bo‘lmagani uchun oxirida)], A2.summary o‘sha {total:4, pending:3, fulfilled:0, rejected:0}. 5: A3.items [], sum …

**Manba:** backend/src/routes-stock-extra.ts:269-272 (pageQuery + status enum), 280-291 (GROUP BY group_id; ORDER BY (status='pending') DESC, created_at DESC; LIMIT/OFFSET guruhlar ustida), 292-301 (qatorlar faqat tanlangan guruhla …

**Natija:** ✅ o‘tdi

### VB-13 — Bajarishda miqdor so‘ralgandan katta va boshqa brigadir hisobiga jo‘natish: server chegaralamaydi (kod bo‘yicha), bildirishnoma so‘rovchiga, jo‘natma esa custodianga (chegara)

**Kutilgan natija:** 2: HTTP 200 (kodda so‘ralgan miqdorga nisbatan yuqori chegara yo‘q — faqat mavjud qoldiq tekshiriladi); F.status 'fulfilled'; F.quantity '50.000000' (qator miqdori o‘zgarmaydi); F.review_note 'B2 orqali'; F.command.quantity '60.000000'; F.command.to_account_id == C2.id; F.command.reason == 'Material so‘rovi ' + L.id.slice(0,8) + ': B2 orqali'. 3: M1 reserved '60.000000', available '940.000000'. 4: B1 da 1 ta 'stock.r …

**Manba:** backend/src/routes-stock-extra.ts:343 (quantity: positiveQty.optional() — yuqori chegara yo‘q), 369 (to_account_id body dan), 385-394 (createStock), 409-421 (notify request.requested_by ga, body.quantity ?? request.quant …

**Natija:** ⚠️ yiqildi — test kutilmasi noto‘g‘ri — 5-qadam kutilmasi noto‘g‘ri: boshqa brigadir (saqlovchi emas) jo‘natmani qabul qilmoqchi bo‘lsa, `accountScope` (permissions.ts:385-386) avval ishlaydi va 404 NOT_FOUND qaytaradi — inventory.ts:243-248 dagi 403 FORBIDDEN tarmog‘i brigadir uchun yetib bo‘lmaydigan. So‘rov baribir rad etiladi, ma‘lumot sizmaydi; faqat xato kodi farq qiladi (404 — boshqa hisobni ko‘rsatmaslik siyosatiga mos). Qolgan 6 qadam (so‘ralgandan ko‘p 60 > 50 bajarish, rezerv, bildirishnomalar, qabul, guruh holati) o‘tdi.

### VB-14 — UI: brigadir 2 qatorli talabnoma yaratadi — № guruhning 8 belgisi, qator holatlari va amallar rolga qarab, KPI guruhni sanaydi; ombor mudiri bitta qatorni bajaradi (ijobiy)

**Kutilgan natija:** 2: "So‘rov yuborildi; ombor mudiri xabardor qilindi." xabari, oyna yopiladi. 3: jadvalda BITTA yangi qator: "Talabnoma" ustunida "№ XXXXXXXX" (group_id ning dastlabki 8 belgisi, katta harf) va ostida "QA Brigadir · A blok"; "Materiallar" ustunida 2 satr: "QA VB Sement — 1 500 kg" va "QA VB Qum — 25.5 kg" (lokal formatda), har satr yonida "Kutilmoqda" belgisi (2+ qator bo‘lgani uchun), har satrda faqat "Bekor qilish"  …

**Manba:** frontend/src/features/stock/StockPage.tsx:727 (canRequest: admin emas va can('stock','create')), 745-800 (№ group_id.slice(0,8).toUpperCase(); requested_by_name · zone_name; qator badge faqat lines.length>1; tugmalar has …

**Natija:** ⏸ bloklangan — BLOCKED: UI case: needs a real browser (login as B1/W at http://localhost:5173, modal interaction, network panel); this session has no browser automation tool, so only API cases were executed. The Vite dev server is up (GET http://localhost:5173 → 200).

## V-C — brigada akkord hisobi

### VC-01 — Stavka fallback: obyekt foizi × smeta narxi, 2 xonaga yaxlitlash (33.33 % × 99 999.99) (ijobiy)

**Kutilgan natija:** 1) 200, body.brigade_percent === "33.33". 2) 200, lines[0].labor_rate === null. 4) 200, status "accepted". 5) 200: progress.labor_rate === "33330.00" (round(99999.99×33.33/100,2)=round(33329.996667,2)), progress.labor_amount === "99990.00", progress.quantity === "3.000000", progress.corrected_delta === "0". 6) totals deep-equal {earned:"99990.00", earned_month:"99990.00", in_payroll:"0.00", paid:"0.00", posted_unpaid …

**Manba:** backend/src/routes-work.ts:343-350 (coalesce(labor_rate, round(unit_price*brigade_percent/100,2))); backend/src/earnings.ts:10 (earningSql), :20-37 (totals), :41-51 (entries); backend/src/routes-company-extra.ts:97; migr …

**Natija:** ✅ o‘tdi

### VC-02 — Stavka ham, obyekt foizi ham yo‘q: labor_rate null, summa hisoblanmaydi, davr bo‘sh (PAYROLL_EMPTY) (chegara)

**Kutilgan natija:** 1) 200, brigade_percent === null. 5) 200: progress.quantity "40.000000"; progress has keys labor_rate and labor_amount both === null (keys present for the author, value null). 6) totals all "0.00" (earned, earned_month, in_payroll, paid, posted_unpaid, advances, balance); projects deep-equal [] (project listed only when a rated entry/payroll/advance exists); entries.length 1 with labor_rate null, amount null, payroll …

**Manba:** backend/src/routes-work.ts:347 (coalesce → NULL when both NULL); backend/src/routes-work-extra.ts:136 (CASE labor_rate IS NULL THEN NULL); backend/src/earnings.ts:23 (pe.labor_rate IS NOT NULL filter), :37 (project liste …

**Natija:** ✅ o‘tdi

### VC-03 — Qotirish: qabuldan keyin smeta stavkasi va obyekt foizi o‘zgarsa eski yozuv o‘zgarmaydi, yangi hisobot yangi stavkada (muvofiqlik)

**Kutilgan natija:** 3) R1 progress.labor_rate "100000.00", labor_amount "4000000.00". 4) 200, revision === 2, L2 !== L1, lines[0].labor_rate "150000.00", lines[1].labor_rate null. 5) 200, brigade_percent "50.00", version 2. 6) UNCHANGED: progress.labor_rate "100000.00", labor_amount "4000000.00". 7) 404 {error:{code:"NOT_FOUND"}} (archived line not accepted for a new report). 8) R2 progress.labor_rate "150000.00", labor_amount "1500000. …

**Manba:** backend/src/routes-work.ts:242-248 (archived_at IS NULL → one() → NOT_FOUND 404), :343-350 (rate written once into progress_entries); backend/src/estimates.ts:97-108 (revision archives old lines), :135; backend/src/route …

**Natija:** ✅ o‘tdi

### VC-04 — Rejadan oshgan hajm to‘lanadi; tuzatish qotirilgan stavkada qayta hisoblanadi; 0 va manfiy jami rad etiladi (ijobiy)

**Kutilgan natija:** 5) progress.labor_rate "100000.00" (500000×20/100), labor_amount "1200000.00" (12 > plan 10 still paid), quantity "12.000000". 7) 200, body.quantity_delta "3.000000". 8) R1: corrected_delta "3.000000", corrections.length 1 with quantity_delta "3.000000" and reason "VC-04 qayta o‘lchash +3", labor_rate still "100000.00", labor_amount "1500000.00" (15×100000 — NOT 250000 from new 50 %); task: estimate_plan_quantity "10 …

**Manba:** backend/src/routes-work-extra.ts:26 (NO_ADJUSTMENT_REQUIRED 400), :32 (NEGATIVE_PROGRESS 400), :133-142 (corrected_delta, corrections json), :157-171 (permission reports.review); backend/src/permissions.ts:186 (brigadier …

**Natija:** ✅ o‘tdi

### VC-05 — Ko‘rinish: prorab labor_amount ko‘rmaydi, muallif/menejer/admin ko‘radi, buxgalter va boshqa brigadir 404; smeta/obyektda narx kesiladi (ruxsat)

**Kutilgan natija:** 2) F: 200, progress.quantity "40.000000", corrected_delta "0", and Object.hasOwn(progress,'labor_rate')===false and Object.hasOwn(progress,'labor_amount')===false. B: 200 labor_rate "100000.00", labor_amount "4000000.00". M: 200 labor_amount "4000000.00" (reports.review + prices.read). admin: 200 labor_amount "4000000.00". A: 404 {error:{code:"NOT_FOUND"}} (not author, no reports.review). B2: 404 NOT_FOUND. 3) F: lin …

**Manba:** backend/src/routes-work-extra.ts:122-126 (NOT_FOUND 404 unless author or reports.review), :149-153 (delete labor_rate/labor_amount unless author or prices.read), :227-244 (work-lines SELECT has no labor_rate); backend/sr …

**Natija:** ✅ o‘tdi

### VC-06 — /v1/me/earnings jamlari har bosqichda: qabul → davr yopish → avans (net dan kam) → to‘lov; moliya ko‘rinishi bilan mos (ijobiy)

**Kutilgan natija:** S1 totals: {earned:"4000000.00", earned_month:"4000000.00", in_payroll:"0.00", paid:"0.00", posted_unpaid:"0.00", advances:"0.00", balance:"4000000.00"}. 3) post 200, status "posted". S2: in_payroll "4000000.00", posted_unpaid "4000000.00", paid "0.00", balance "4000000.00" (4M−4M+4M−0); entries[0].payroll_amount "4000000.00", payroll_month "2026-10-01". 5) advance 200. S3: advances "1500000.00", balance "2500000.00" …

**Manba:** backend/src/earnings.ts:20-37 (earned, earned_month, in_payroll, paid, posted_unpaid, advances, balance formula), :47-48 (payroll_month); backend/src/routes-finance-extra.ts:689-692 (advance_available/cash_due only when  …

**Natija:** ✅ o‘tdi

### VC-07 — Davr yopilganda akkord yozuvi avtomatik (oklad 0), progress_payroll izi, piece_pending yo‘qoladi, mehnat hujjati tavsifi (ijobiy)

**Kutilgan natija:** 3) periods[0]: status "open", entries 0, piece_pending deep-equal [{employee_id:B.id, employee_name:"<B display_name>", amount:"4500000.00"}]; entries deep-equal []. 4) 200, status "posted", version 2, posted_by === admin id. 5) periods[0]: status "posted", entries 1, total "4500000.00", gross "4500000.00", piece_total "4500000.00", due "4500000.00", paid "0.00", piece_pending [] ; entries[0]: employee_id B.id, posit …

**Manba:** backend/src/routes-finance-extra.ts:673-711 (periods aggregates, piece_pending only when open), :757 (PAYROLL_PERIOD_CLOSED), :829-830 (VERSION_CONFLICT, CLOSED), :833-855 (auto INSERT piece_rate, progress_payroll amount …

**Natija:** ❌ yiqildi — haqiqiy nuqson — Kichik formatlash nomuvofiqligi: `GET /v1/finance/payroll` da hech narsa to‘lanmagan davr uchun `periods[].paid` "0" qaytadi, "0.00" emas (routes-finance-extra.ts:678 — `total`, `gross`, `due` kabi ustunlarda `::numeric(20,2)` cast yo‘q, faqat `piece_total` da bor). Hisob-kitob to‘g‘ri (qolgan 21 tekshiruv o‘tdi), UI `formatMoney` buni to‘g‘ri ko‘rsatadi; tuzatish bir qatorli cast. Ikkinchi urinishda ham takrorlandi.

### VC-08 — Oldindan kiritilgan yozuv saqlanadi: net = oklad + akkord − ushlanma; brigadir bo‘lmagan xodimda akkord 0; manfiy net 400 (ijobiy)

**Kutilgan natija:** 3) 200: base_salary "1000000.00", bonus "0.00", deduction "200000.00", net "800000.00", status "pending", version 1. 4) 200 net "2000000.00". 5) 400 {error:{code:"NEGATIVE_NET_SALARY"}} (and B's entry unchanged: GET shows base_salary "1000000.00"). 6) periods[0].piece_pending [{employee_id:B.id, amount:"4000000.00"}] (manual entry does not consume pending); entries: B piece_rate "0.00", F piece_rate "0.00". 7) 200. 8 …

**Manba:** backend/src/routes-finance-extra.ts:741-784 (entries upsert, NEGATIVE_NET_SALARY 400), :846-847 (ON CONFLICT updates only piece_rate), :856-862 (net>0 entries posted), :871; migrations/027:12 (net = base_salary+bonus+pie …

**Natija:** ✅ o‘tdi

### VC-09 — Davr chegarasi hisobot sanasi bo‘yicha: o‘tgan oy, joriy oy va kelgusi oy hisobotlari o‘z davriga; ikkinchi davr faqat yangi qabulni oladi (chegara)

**Kutilgan natija:** 4) totals: earned "5500000.00", earned_month "1000000.00" (only RB is in the current month), in_payroll "0.00". 5) period month "2026-09-01": piece_pending [{employee_id:B.id, amount:"4000000.00"}] (only RA: report_date ≤ 2026-09-30). 6) 200; entries for P1: piece_rate "4000000.00". 7) period "2026-10-01": piece_pending [{B.id, "1000000.00"}] (RA already in payroll, RC beyond 2026-10-31). 8) 200; P2 entry piece_rate  …

**Manba:** backend/src/routes-finance-extra.ts:703-707 and :835-842 (r.report_date <= month+1 month−1 day), :724 (MONTH_FIRST_DAY_REQUIRED 400), :725-728 (INSERT → unique violation); backend/src/db.ts:117,127 (23505 → ALREADY_EXIST …

**Natija:** ✅ o‘tdi

### VC-10 — Yopilgan davrdan keyingi manfiy tuzatish: jami manfiy bo‘lsa davrga yozilmaydi (PAYROLL_EMPTY), keyingi qabul bilan netto keyingi davrga (chegara)

**Kutilgan natija:** 2) P1 entry piece_rate "4000000.00". 3) 200. 4) RA: corrected_delta "-10.000000", labor_amount "3000000.00"; earnings: earned "3000000.00", in_payroll "4000000.00", posted_unpaid "4000000.00", balance "3000000.00"; entries[0].amount "3000000.00", payroll_amount "4000000.00". 5) period "2026-11-01".piece_pending deep-equal [] (sum −1 000 000 fails HAVING > 0). 6) 400 {error:{code:"PAYROLL_EMPTY"}}; P2 still "open", ve …

**Manba:** backend/src/earnings.ts:12-14 (payrollAmountSql / pendingEarningSql), :47-48 (max month); backend/src/routes-finance-extra.ts:833-842 (pending<>0 rows, HAVING sum>0), :850-854 (negative progress_payroll row written with  …

**Natija:** ✅ o‘tdi

### VC-11 — To‘lov: avans ≥ net → kassa hujjati yo‘q, advance_applied = net, paid_cash 0; kassa maydoni baribir majburiy; qayta to‘lash 409 (ijobiy)

**Kutilgan natija:** 3) 409 {error:{code:"INVALID_TRANSITION"}} (entry status pending, no labor document). 4) 200. 7) EB: status "posted", net "4000000.00", advance_available "4000000.00" (least(net, 5M)), cash_due "0.00"; earnings: advances "5000000.00", posted_unpaid "4000000.00", balance "-1000000.00" (4M−4M+4M−5M). 8) 400 {error:{code:"VALIDATION_ERROR"}} with fields[].path containing ["cash_account_id"]. 9) 200: status "paid", advan …

**Manba:** backend/src/routes-finance-extra.ts:897 (cash_account_id required uuid → zod), :906-907 (INVALID_TRANSITION, default 409), :912-926 (offset = min(advance, net); cash = net − offset), :927-938 (payment only if cash>0), :9 …

**Natija:** ✅ o‘tdi

### VC-12 — brigade_percent chegaralari: 101 / −1 / 3 kasr → 400; 100.01 regexdan o‘tib DB CHECK 409; 0 → stavka 0.00; PATCH da berilmasa null bo‘ladi (salbiy)

**Kutilgan natija:** 1) 400 {error:{code:"VALIDATION_ERROR", fields:[{path:["brigade_percent"],…}]}}. 2) 400 VALIDATION_ERROR. 3) 400 VALIDATION_ERROR. 4) 409 {error:{code:"INVARIANT_VIOLATION"}} (regex ^(100|\d{1,2})(\.\d{1,2})?$ accepts "100.01"; DB CHECK ≤100 rejects — report as inconsistency with the 400 of cases 1-3). 5) 200 brigade_percent "100.00". 6) 200 brigade_percent "0.00". 8) progress.labor_rate "0.00" (not null), labor_amou …

**Manba:** backend/src/routes-company.ts:93-97 (regex), :125 and :203 (`?? null`), :183-186 (full-field UPDATE); backend/src/http.ts:228-235 (zod → 400 VALIDATION_ERROR with fields); migrations/027_brigade_piece_rate.sql:6 (CHECK b …

**Natija:** ✅ o‘tdi

### VC-13 — Material qatorida labor_rate jim null bo‘ladi; manfiy/3-kasr stavka 400; material qatoriga hisobot 409; service qatori akkord oladi (salbiy)

**Kutilgan natija:** 1) 200: lines[0].labor_rate === null (material labor_rate silently ignored, estimates.ts:135), lines[1].labor_rate "7000.00", lines[2].labor_rate null. 2) 400 {error:{code:"VALIDATION_ERROR"}} (amount regex forbids sign). 3) 400 VALIDATION_ERROR (max 2 decimals). 4) 409 {error:{code:"MATERIAL_IS_NOT_WORK_PROGRESS"}}. 5) 400 {error:{code:"PROGRESS_LINE_REQUIRED"}}. 6) RS progress.labor_rate "7000.00", labor_amount "14 …

**Manba:** backend/src/schemas.ts:6 (amount regex), :37 (labor_rate amount.nullable().optional()); backend/src/estimates.ts:135 (material → null); backend/src/routes-work.ts:237-248 (PROGRESS_LINE_REQUIRED 400; MATERIAL_IS_NOT_WORK …

**Natija:** ✅ o‘tdi

### VC-14 — Ruxsatlar matritsasi: buxgalter davr ochadi lekin yopa olmaydi (403), finansist yopish/to‘lash 403, brigadir xodim hisobi 403, prorab payroll 403, prorab o‘z hisobotini qabul qila olmaydi (ruxsat)

**Kutilgan natija:** 2) 403 {error:{code:"FORBIDDEN"}} (brigadier lacks reports.review). 3) 403 {error:{code:"SELF_REVIEW_FORBIDDEN"}}. 4) 200. 5) 403 {error:{code:"PAGE_ACTION_FORBIDDEN"}} (financier lacks finance.post). 6) 200. 7) 200: periods[0].piece_pending [{B.id, "4000000.00"}] visible to financier (finance.read). 8) 403 {error:{code:"PAGE_ACTION_FORBIDDEN"}}. 9) 403 {error:{code:"PAGE_ACTION_FORBIDDEN"}} (payroll page has no 'upd …

**Manba:** backend/src/http.ts:137-153 (pageAllowed → PAGE_ACTION_FORBIDDEN 403 before permit → FORBIDDEN 403); backend/src/permissions.ts:122-153 (no finance permission maps to 'update'), :279-321 (pageAllowed: tenant_admin true e …

**Natija:** ✅ o‘tdi

## V-D obyekt moliya kartasi va V-E qavat × ish matritsasi

### VDE-01 — Bo‘sh obyekt moliya kartasi: narx huquqi bor rollarga nol qiymatli obyekt, prorab/brigadir/omborchiga null va brigade_percent yo‘q (ruxsat)

**Kutilgan natija:** Hammasi 200. admin, accountant, financier, manager javobida finance === {"plan_total":"0.00","fact_total":"0.00","remaining_plan":"0.00","fact_percent":null,"paid":"0.00","debt":"0.00","advances":"0.00","income":"0.00","progress_percent":null} va brigade_percent === "20.00". foreman, brigadier, warehouse_manager javobida finance === null va JSON’da brigade_percent kaliti umuman yo‘q (undefined); counters, zones ([]), …

**Manba:** backend/src/routes-company-extra.ts:21,68-93,95-103 (prices = allowed(prices.read); finance = prices ? … : null; brigade_percent: prices ? … : undefined); backend/src/permissions.ts:175-227 (prices.read: tenant_admin, fi …

**Natija:** ✅ o‘tdi

### VDE-02 — Individual deny bilan prices.read olib qo‘yilganda moliya kartasi null bo‘ladi, inherit qaytaradi; matritsa baribir ochiq; admin bo‘lmagan rol override bera olmaydi (ruxsat)

**Kutilgan natija:** 2) 200, finance !== null. 3) 200 {"ok":true}. 4) 200, finance === null, brigade_percent kaliti yo‘q (deny override rol ruxsatidan ustun). 5) 200 {"floors":[],"works":[],"cells":[]} — matritsa narxsiz, projects.read yetarli. 6) 403 {"error":{"code":"FORBIDDEN"}} (employees.manage yo‘q / faqat tenant_admin). 7) 200 {"ok":true}. 8) 200, finance yana to‘liq obyekt (nol qiymatlar) va brigade_percent "15.00".

**Manba:** backend/src/permissions.ts:253-278 (override deny → false, L264-266), routes-company.ts:598-636 (POST /v1/employees/:id/permissions, L610 FORBIDDEN 403), routes-company-extra.ts:21,68,97,114-118 (floor-progress permissio …

**Natija:** ⚠️ yiqildi — test kutilmasi noto‘g‘ri — 6-qadam kutilmasi noto‘g‘ri: bosh muhandis boshqa xodimga ruxsat bera olmaydi — xato kodi 403 PAGE_ACTION_FORBIDDEN (sahifa darvozasi avval ishlaydi, http.ts:137-152), FORBIDDEN emas. Qolgan 16 tekshiruv (prices.read taqiqlansa finance null va brigade_percent yo‘q, qaytarilsa tiklanadi) mos.

### VDE-03 — Doira va identifikator xatolari: biriktirilmagan obyekt 404, noto‘g‘ri uuid 400, yo‘q obyekt 404, arxivlangan obyekt 404 (karta va matritsa) (salbiy)

**Kutilgan natija:** 2) 404 {"error":{"code":"NOT_FOUND"}} (biriktirilmagan). 3) 404 NOT_FOUND. 4) 400 {"error":{"code":"VALIDATION_ERROR","fields":[{"path":["id"],…}]}}. 5) ikkalasi 404 NOT_FOUND. 6) 200 {"floors":[],"works":[],"cells":[]}. 7) 200 {"ok":true}. 8) uchalasi 404 NOT_FOUND — projectScope archived_at IS NULL shartini qo‘yadi, admin uchun ham.

**Manba:** backend/src/permissions.ts:348-366 (projectScope: archived_at IS NULL, biriktirilmagan → NOT_FOUND 404); backend/src/db.ts:19-21 (one → NOT_FOUND 404); backend/src/http.ts:102,228-235 (idParams zod → VALIDATION_ERROR 400 …

**Natija:** ✅ o‘tdi

### VDE-04 — plan_total faqat arxivlanmagan smetalarning joriy qatorlari: smeta arxivlansa chiqadi, reviziya eski qatorlarni almashtiradi; ro‘yxat va smeta summary bilan bir xil (ijobiy)

**Kutilgan natija:** 5) finance.plan_total "4100000.00" (3 000 000 + 600 000 + 500 000), fact_total "0.00", remaining_plan "4100000.00", fact_percent "0.0" (reja > 0, fakt 0 → round(0,1)), counters.estimates 2. 6) 200 {"ok":true}. 7) plan_total "3600000.00", remaining_plan "3600000.00", counters.estimates 1. 8) 200, revision 2, lines.length 1. 9) finance.plan_total "4000000.00" (eski 2 qator arxivlangan, faqat 40×100 000); GET /v1/projec …

**Manba:** backend/src/routes-company-extra.ts:76-78,85-86 (plan = Σ l.total WHERE l.archived_at IS NULL AND e.archived_at IS NULL; fact_percent CASE WHEN plan>0 THEN round(100*fact/plan,1)); routes-operations.ts:420-442 (DELETE →  …

**Natija:** ⚠️ yiqildi — test kutilmasi noto‘g‘ri — 6-qadam: Egasi qarori (D24, 2026-10-29): smetani arxivlash faqat mijoz adminida — bosh muhandisning 403 PAGE_ACTION_FORBIDDEN olishi to‘g‘ri, test kutilmasi noto‘g‘ri edi. 7–9-qadamlar shu sababdan kaskad; admin arxivlagach karta, ro‘yxat va smeta jamlari bir xil 4 000 000 — hisob mos.

### VDE-05 — fact_total, qarz, to‘langan va fact_percent yaxlitlash: xizmat akti va qisman to‘lov; invoys ro‘yxati, obyektlar ro‘yxati va obyekt dashboard bilan mos (ijobiy)

**Kutilgan natija:** 4) finance: fact_total "1200000.00", debt "1200000.00", paid "0.00", remaining_plan "2400000.00", fact_percent "33.3" (33.333… → 1 xona), advances "0.00", income "0.00", plan_total "3600000.00". 6) fact_total "1200000.00" (to‘lov xarajat emas), debt "500000.00", paid "700000.00", fact_percent "33.3". 7) 400 {"error":{"code":"PAYMENT_ALLOCATION_REQUIRED"}}. 8) 409 {"error":{"code":"OVERPAYMENT_USE_ADVANCE"}} (700 000  …

**Manba:** backend/src/finance.ts:212-218 (service → expense +, payable −; payment → payable +, cash −), 90-125 (OVERPAYMENT_USE_ADVANCE, PAYMENT_ALLOCATION_REQUIRED 400); routes-company-extra.ts:79-87 (fact/paid/debt, numeric(20,2 …

**Natija:** ⚠️ yiqildi — test kutilmasi noto‘g‘ri — 4-qadam kutilmasi noto‘g‘ri: progress_percent null emas, "0.0" — ish qatori (reja 30 > 0) bor, lekin qabul qilingan progress yo‘q; null faqat ish qatori umuman bo‘lmaganda (routes-company-extra.ts:88-89, ro‘yxat bilan bir xil SQL; VDE-08/13 null holatini tasdiqladi). Qolgan 11 tekshiruv (fakt, qarz, to‘lov, OVERPAYMENT_USE_ADVANCE, dashboard) mos.

### VDE-06 — paid/advances/income: tushum to‘langanga kirmaydi, avans kiradi, kassalar aro o‘tkazma kirmaydi, avans stornosi netto; stornoni storno qilib bo‘lmaydi (muvofiqlik)

**Kutilgan natija:** 3) finance: income "5000000.00", paid "0.00", debt "0.00", fact_total "0.00", advances "0.00". 4) advances "800000.00", paid "800000.00", income "5000000.00", debt "0.00". 5) 200; finance 4-banddagidek o‘zgarmagan (paid "800000.00" — cash_transfer kirmaydi). 6) 400 {"error":{"code":"DIFFERENT_TARGET_ACCOUNT_REQUIRED"}}. 7) 200, REV.kind "reversal", REV.reverses_id === ADV.id; finance: advances "0.00", paid "0.00" (st …

**Manba:** backend/src/finance.ts:84-89 (DIFFERENT_TARGET_ACCOUNT_REQUIRED 400), 217-234 (advance/receipt/cash_transfer yozuvlari), 240-299 (reversal: kind 'reversal', entries negated; L250 INVALID_REVERSAL); routes-company-extra.t …

**Natija:** ✅ o‘tdi

### VDE-07 — Avans hisobi (advance_offset): qarz va avans kamayadi, to‘langan o‘zgarmaydi; ortiqcha hisob, ishlatilgan avans stornosi va to‘lovli akt stornosi rad etiladi (salbiy)

**Kutilgan natija:** 3) finance: fact_total "1000000.00", debt "1000000.00", advances "400000.00", paid "400000.00". 4) 200; finance: debt "600000.00" (payable +400 000), advances "0.00", paid "400000.00" (avans kassa chiqimi o‘zgarmaydi), fact_total "1000000.00". 5) 409 {"error":{"code":"ADVANCE_INSUFFICIENT"}}. 6) 409 {"error":{"code":"ADVANCE_ALREADY_APPLIED"}}. 7) 409 {"error":{"code":"REVERSE_PAYMENTS_FIRST"}}. 8) finance 4-banddagi …

**Manba:** backend/src/finance.ts:124-141 (PAYMENT_ALLOCATION_REQUIRED, ADVANCE_INSUFFICIENT), 223-225 (advance_offset → payable +, advance −), 252-265 (ADVANCE_ALREADY_APPLIED, REVERSE_PAYMENTS_FIRST); routes-company-extra.ts:80-8 …

**Natija:** ✅ o‘tdi

### VDE-08 — Reja 0 chegarasi: sarf xarajati bilan remaining_plan manfiy, fact_percent va progress_percent null; ajratma va yetkazuvchi invoysi faktga kirmaydi; sarf stornosi faktni qaytaradi (chegara)

**Kutilgan natija:** 3) review 200, CONS.status "posted". 4) finance: plan_total "0.00", fact_total "75000.00" (50 × 1 500), remaining_plan "-75000.00", fact_percent null (reja 0), progress_percent null (ish qatori yo‘q), debt "0.00", paid "0.00". 5) 200; finance 4-banddagidek (ajratma jurnalga yozilmaydi). 6) 409 {"error":{"code":"PRICE_ADJUSTMENT_REQUIRED"}} (kirim qiymati 300 000 ≠ 250 000). 7) 200; finance: fact_total "75000.00" (inv …

**Manba:** backend/src/routes-company-extra.ts:79,85-86 (fact = Σ expense; CASE WHEN plan>0 … END → null), 88-89 (progress_percent null — qator yo‘q); inventory.ts:286-309 (review → expense = stockCost), 318-396 (reverseStock: jurn …

**Natija:** ✅ o‘tdi

### VDE-09 — progress_percent: ish qatorlari o‘rtachasi, har qator 100 % da cheklanadi, obyektlar ro‘yxati va dashboard bilan bir xil; matritsa foizi cheklanmaydi (120.0) (muvofiqlik)

**Kutilgan natija:** 6) admin finance.progress_percent "67.5" (avg(least(100, 35), least(100, 120)) = (35+100)/2; material qatori kirmaydi). foreman GET /v1/projects items[0].progress_percent "67.5" (ro‘yxat prorabga ham beradi, finance esa null). foreman GET /v1/dashboard projects.items.find(id===P).progress_percent "67.5". floor-progress: works [{description "Beton", unit_id "m3", plan "100.000000", fact "35.000000", percent "35.0"},{d …

**Manba:** backend/src/routes-company-extra.ts:88-89 (avg(least(100,100*workFactSql/effective_quantity)) numeric(5,1)), routes-company.ts:56-57 (ro‘yxat — bir xil SQL), routes-dashboard.ts:112-113,120-126 (projects.items), estimate …

**Natija:** ✅ o‘tdi

### VDE-10 — Qavat matritsasi tuzilmasi: parent_name, raqamli tartib (1, 2, 10), ichki zona qavatga yig‘iladi, hisobot zonasi qator zonasidan ustun, bo‘sh katak yo‘q; prorab va admin javobi bir xil va narxsiz (ijobiy)

**Kutilgan natija:** 4) A.floors.length 3, tartib ids [F1, F2, F10] (nomlar "1-qavat","2-qavat","10-qavat" — raqamli, "10" oxirida), har birida parent_name "A blok"; X floors’da yo‘q. floors[F1] {plan "150.000000", fact "60.000000", percent "40.0"} (L2 ichki zona X → F1; R2 zonasiz → qator zonasi X → F1; R3 hisobot zonasi F1 → F1). floors[F2] {plan "80.000000", fact "0.000000", percent "0.0"}. floors[F10] {plan null, fact "0.000000", per …

**Manba:** backend/src/routes-company-extra.ts:126-132 (floors + parent_name), 146-158 (tree: qavat va ichki kind<>'floor' zonalar; f: coalesce(r.zone_id,l.zone_id); coalesce(f.fact,0)::text → "0"), 159-177 (total: quantity() → 6 x …

**Natija:** ✅ o‘tdi

### VDE-11 — Ish ustunlari tavsif+birlik bo‘yicha, material chiqmaydi, zonasiz qator va blok zonali hisobot faqat ish jamida, tuzatish kiradi, tartib smeta nomi va qator o‘rni bo‘yicha; work-lines bilan mos (ijobiy)

**Kutilgan natija:** 6) works.length 3, tartib: [{description "Beton", unit_id "m3", plan "60.000000", fact "17.000000", percent "28.3"} (8 + 5 + 4; 28.333 → 28.3), {description "Beton", unit_id "kg", plan "7.000000", fact "0", percent "0.0"}, {description "Kran", unit_id "hour", plan "10.000000", fact "0", percent "0.0"}]; "Sement" ustuni yo‘q. cells.length 2: {zone_id F1, description "Beton", unit_id "m3", plan "40.000000", fact "8.000 …

**Manba:** backend/src/routes-company-extra.ts:120-125 (kind<>'material'; progress_corrections delta), 133-143 (GROUP BY description, unit_id; ORDER BY min(e.name), min(position)), 144-158 (tree faqat qavat va ichki zonalar; blok d …

**Natija:** ✅ o‘tdi

### VDE-12 — Chegaralar: qavat zonasi yo‘q → floors [] lekin ishlar bor; reja 0 qator → percent null; reviziyadan keyin eski qator fakti tavsif bo‘yicha oxirida (plan null); UI yo‘riqnoma (chegara)

**Kutilgan natija:** 4) floors [], cells [], works === [{description "Beton", unit_id "m3", plan "0.000000", fact "0", percent null}, {description "Suvoq", unit_id "m2", plan "10.000000", fact "4.000000", percent "40.0"}]. 5) 200, revision 2. 6) works === [{"Beton","m3", plan "0.000000", fact "0", percent null}, {"Shtukaturka","m2", plan "12.000000", fact "0", percent "0.0"}, {"Suvoq","m2", plan null, fact "4.000000", percent null}] — ar …

**Manba:** backend/src/routes-company-extra.ts:126-143 (floors kind='floor'; works FULL JOIN; CASE WHEN cur.plan>0 → null; ORDER BY cur.est NULLS LAST), 88-89 (progress_percent effective_quantity>0, archived_at IS NULL); estimates. …

**Natija:** ✅ o‘tdi

### VDE-13 — UI: obyekt sahifasida «Obyekt moliyasi» faqat narx huquqi bilan; manfiy qolgan reja «Rejadan oshgan» belgisi, fact_percent null bo‘lsa foiz yo‘q; «Qavatlar progressi» tabi prorabga ham (muvofiqlik)

**Kutilgan natija:** 2) admin finance: plan_total "0.00", fact_total "250000.00", remaining_plan "-250000.00", fact_percent null, debt "250000.00", progress_percent null; foreman finance null. 3) Sarlavha «Obyekt moliyasi» ko‘rinadi; «Smeta (reja)» qiymati 0; «Fakt xarajat» qiymati 250 000 (guruhlangan) va ostida «Rejadan … %» yozuvi YO‘Q (fact_percent null); «Qolgan reja» qiymati «-» bilan boshlanib 250 000 ni ko‘rsatadi, danger rangda, …

**Manba:** frontend/src/features/projects/ProjectDetailPage.tsx:176-218 (d.finance && …; sub fact_percent !== null; remaining_plan.startsWith('-') → danger + over_plan), 219-229 (tab 'projects.tab.progress'); frontend/src/locales/e …

**Natija:** ✅ o‘tdi

### VDE-14 — Faqat qabul qilingan hisobot matritsaga kiradi (yuborilgan/qaytarilgan kirmaydi); material qatoriga progress, qatorsiz hajm, o‘z hisobotini qabul qilish, manfiy/nol tuzatish va brigadir tuzatishi rad etiladi (salbiy)

**Kutilgan natija:** 2) 409 {"error":{"code":"MATERIAL_IS_NOT_WORK_PROGRESS"}}. 3) 400 {"error":{"code":"PROGRESS_LINE_REQUIRED"}}. 4) R1.status "submitted"; matritsa: cells === [{zone_id F1, description "Beton", unit_id "m3", plan "100.000000", fact "0", percent "0.0"}], works[0].fact "0", floors[0].fact "0.000000" — yuborilgan hisobot kirmaydi. 5) brigadir 403 {"error":{"code":"SELF_REVIEW_FORBIDDEN"}}; prorab 200, status "accepted"; m …

**Manba:** backend/src/routes-work.ts:237-248 (PROGRESS_LINE_REQUIRED 400, MATERIAL_IS_NOT_WORK_PROGRESS 409), 339-350 (SELF_REVIEW_FORBIDDEN 403; progress_entries faqat accepted’da), 357-360 (returned → yozuv yo‘q); routes-work-ex …

**Natija:** ⚠️ yiqildi — test kutilmasi noto‘g‘ri — 5-qadam kutilmasi noto‘g‘ri: brigadir o‘z hisobotini tasdiqlamoqchi bo‘lsa 403 FORBIDDEN (reports.review ruxsati yo‘q — permit avval ishlaydi), SELF_REVIEW_FORBIDDEN faqat tasdiqlash huquqi bor rol (prorab) o‘z hisobotida oladi — nazorat sinovi buni tasdiqladi. Qolgan 26 tekshiruv (yuborilgan/qaytarilgan hisobot matritsaga kirmaydi, qabul qilingani kiradi, NEGATIVE_PROGRESS, NO_ADJUSTMENT_REQUIRED) mos.

## D22 avans hisobi, O12 hisob sanasi, O3 server jamlari, O17 UTC+5

### FIN-01 — Avans hisobi hujjat qoldig‘idan oshmaydi: qisman to‘lovdan keyingi qoldiq chegarasi va tekshiruv tartibi (OVERPAYMENT_USE_ADVANCE avval ADVANCE_INSUFFICIENT dan) (chegara)

**Kutilgan natija:** 1–3: 200. 4: ACT.outstanding "500000.00", paid "1500000.00", advance_offsettable "500000.00" (min(qoldiq 500 000, avans 5 000 000)). 5: 409 {error:{code:'OVERPAYMENT_USE_ADVANCE'}} — avans 5 000 000 yetarli bo‘lsa ham, hujjat qoldig‘i tekshiruvi avans qoldig‘idan oldin. 6: 200; javobda kind 'advance_offset', amount "500000.00", cash_account_id null, allocated_invoice_id = ACT. 7: ACT.outstanding "0.00", paid "2000000 …

**Manba:** backend/src/finance.ts:114-122 (OVERPAYMENT_USE_ADVANCE), :139-140 (ADVANCE_INSUFFICIENT keyin), :223-224 (payable +, advance −); routes-operations.ts:728-733 (outstanding/paid/advance_offsettable); routes-finance-extra. …

**Natija:** ✅ o‘tdi

### FIN-02 — Bitta avans ikki qarz hujjatiga: advance_offsettable = min(qoldiq, obyekt avansi) va har hisobdan keyin dinamik kamayadi (chegara)

**Kutilgan natija:** 3: A.advance_offsettable "1000000.00" (min(3 000 000, 1 000 000)); B.advance_offsettable "400000.00" (min(400 000, 1 000 000)). 4: 200. 5: B.outstanding "0.00", paid "400000.00", advance_offsettable "0.00"; A.outstanding "3000000.00", paid "0.00", advance_offsettable "600000.00". 6: 409 ADVANCE_INSUFFICIENT (qoldiq 3 000 000 ichida, lekin avans 600 000). 7: 200. 8: A.outstanding "2400000.00", paid "600000.00", advanc …

**Manba:** routes-operations.ts:730-733 (greatest(0,least(qoldiq, Σadvance))), :689-693 (kind ro‘yxati vergul bilan); finance.ts:21-34 (advanceBalance), :139-140; routes-finance-extra.ts:348-354 (top_debt); BARPO_BUSINESS_RULES.md  …

**Natija:** ❌ yiqildi — haqiqiy nuqson — Faqat formatlash: `GET /v1/finance/documents` da hali to‘lov bo‘lmagan hujjatda `paid` "0" qaytadi, "0.00" emas (routes-operations.ts:695 `coalesce(...,0)` va :729 `::text` — `::numeric(20,2)` cast yo‘q; `advance_offsettable` :733 da cast bor). D22 hisob-kitobi (offsettable = min(qoldiq, avans), ADVANCE_INSUFFICIENT, dinamik kamayish) to‘liq mos. VC-07 bilan bir oila.

### FIN-03 — INVOICE_MISMATCH: boshqa kontragent, boshqa obyekt hujjati, qarz bo‘lmagan hujjat; boshqa obyekt avansi hisoblanmaydi (salbiy)

**Kutilgan natija:** 3: 409 INVOICE_MISMATCH (invoice.counterparty_id ≠ S3). 4: 409 INVOICE_MISMATCH (invoice.project_id ≠ P). 5: 409 INVOICE_MISMATCH (kind 'advance' qarz turlari ichida emas). 6: 404 NOT_FOUND. 7: 400 ONLY_PAYMENT_CAN_ALLOCATE. 8: 400 COUNTERPARTY_REQUIRED. 9: 200. 10: L3.advance_offsettable "1000000.00" (P2 avansi tegilmagan), L1.advance_offsettable "0.00", L1.outstanding "1000000.00"; summary(P2).advances "1000000.00" …

**Manba:** finance.ts:90-104 (ONLY_PAYMENT_CAN_ALLOCATE, INVOICE_MISMATCH: tur, kontragent, obyekt), :68-81 (COUNTERPARTY_REQUIRED), :22-34 (advanceBalance project_id bo‘yicha); db.ts:21 (one → NOT_FOUND 404); BARPO_BUSINESS_RULES. …

**Natija:** ✅ o‘tdi

### FIN-04 — Storno qilingan dalolatnomaga avans hisobi va to‘lov rad etiladi (INVOICE_REVERSED); GET da reversed=true, advance_offsettable "0.00", summary.by_kind stornoni hisobga oladi (salbiy)

**Kutilgan natija:** 3: "800000.00". 4: 200; javob kind 'reversal', reverses_id = L, amount "800000.00", counterparty_id S5, document_date "2026-10-28". 5: L qatorida reversed true, advance_offsettable "0.00", outstanding "800000.00" (formula amount−paid, stornoni hisobga olmaydi) lekin summary.outstanding "0.00" va summary.total "1000000.00" (faqat storno qilinmaganlar); ro‘yxatda kind 'reversal', reverses_id L qatori bor. 6: 409 INVOIC …

**Manba:** finance.ts:105-113 (INVOICE_REVERSED), :240-298 (reverseFinance, document_date current_date); routes-operations.ts:696-700, :716-717, :730-734 (reversed, notReversedSql); routes-finance-extra.ts:342-347 (by_kind notRever …

**Natija:** ❌ yiqildi — haqiqiy nuqson — Faqat formatlash: hujjatlar ro‘yxati `summary.outstanding` (va bo‘sh ro‘yxatda `summary.total`) "0" qaytadi (routes-operations.ts:716-717). Storno mazmuni — INVOICE_REVERSED, by_kind, qarz/avans — hammasi mos.

### FIN-05 — advance_offset kiruvchi maydonlari: UNEXPECTED_CASH_ACCOUNT va boshqa 400 kodlar aniq tartibda; ichki payroll_offset bayrog‘i API orqali o‘tmaydi (salbiy)

**Kutilgan natija:** 1: 400 UNEXPECTED_CASH_ACCOUNT. 2: 400 UNEXPECTED_RECEIPT_REFERENCE. 3: 400 UNEXPECTED_TARGET_ACCOUNT. 4: 400 UNEXPECTED_RECEIPT_REFERENCE (invariantlar tartibi: receipt → target → cash). 5: 400 PAYMENT_ALLOCATION_REQUIRED. 6: to‘rttasi ham 400 VALIDATION_ERROR (error.fields bilan) — xususan payroll_offset strictObject tufayli rad etiladi, ya’ni PAYROLL_DOCUMENT_NOT_OFFSETTABLE ni API orqali chetlab o‘tib bo‘lmaydi.  …

**Manba:** finance.ts:46-67 (UNEXPECTED_* tartibi), :124-125 (PAYMENT_ALLOCATION_REQUIRED), :126-138 (payroll_offset ichki bayroq); schemas.ts:6-8 (amount regex, positiveAmount), :4 (date), :66-94 (financeInput strictObject); http. …

**Natija:** ✅ o‘tdi

### FIN-06 — Storno zanjiri: ikki hisobdan biri qaytarilsa avans hali «hisoblangan» (ADVANCE_ALREADY_APPLIED), ikkalasi qaytarilgach avans storno bo‘ladi; takroriy storno ALREADY_EXISTS; stornoni storno qilib bo‘lmaydi (muvofiqlik)

**Kutilgan natija:** 1: 409 ADVANCE_ALREADY_APPLIED (avans qoldig‘i 1 000 000 < 3 000 000). 2: 409 REVERSE_PAYMENTS_FIRST. 3: 200; R1 kind 'reversal', reverses_id O1, amount "1000000.00", document_date "2026-10-28". 4: hali ham 409 ADVANCE_ALREADY_APPLIED (qoldiq 2 000 000 < 3 000 000). 5: L1.paid "0.00", outstanding "2000000.00", advance_offsettable "2000000.00"; L2.paid "1000000.00", outstanding "1000000.00", advance_offsettable "10000 …

**Manba:** finance.ts:250-265 (INVALID_REVERSAL, ADVANCE_ALREADY_APPLIED, REVERSE_PAYMENTS_FIRST), :266-296 (storno yozuvlari; takroriy stornoga dastur tekshiruvi yo‘q); migrations/001_core.sql:176 (UNIQUE(tenant_id,reverses_id));  …

**Natija:** ❌ yiqildi — haqiqiy nuqson — Faqat formatlash: `paid` "0" (routes-operations.ts:695/:729). Storno zanjiri (ADVANCE_ALREADY_APPLIED, REVERSE_PAYMENTS_FIRST, ALREADY_EXISTS, INVALID_REVERSAL, qarz/avans tiklanishi) to‘liq mos.

### FIN-07 — Ruxsatlar: finansist advance_offsettable ni ko‘radi, lekin hisob yaratish va storno — 403 PAGE_ACTION_FORBIDDEN; bosh muhandis va prorab moliya ro‘yxatini ko‘rmaydi; buxgalter yaratadi va storno qiladi (ruxsat)

**Kutilgan natija:** 1: 200; L.advance_offsettable "3000000.00" (finance.read bor — UI tugmani faqat ruxsat bo‘yicha yashiradi). 2: 403 PAGE_ACTION_FORBIDDEN (bank_cash sahifasida create → finance.post kerak; finansistda yo‘q). 3: POST 403 PAGE_ACTION_FORBIDDEN; GET 403 FORBIDDEN (finance.read yo‘q, ruxsatli sahifa yo‘q). 4: fore POST 403 PAGE_ACTION_FORBIDDEN, fore GET 403 FORBIDDEN, wh POST 403 PAGE_ACTION_FORBIDDEN. 5: 200. 6: 403 PAG …

**Manba:** http.ts:137-152 (pageFor → pageAllowed → PAGE_ACTION_FORBIDDEN); permissions.ts:91-106 (advance_offset → bank_cash), :189-211 (financier/accountant bazaviy ruxsatlari), :279-322 (pageAllowed: finance create → finance.pos …

**Natija:** ❌ yiqildi — haqiqiy nuqson — Faqat formatlash: `paid` "0" (routes-operations.ts:695/:729). Ruxsat chegaralari (finansist, bosh muhandis, prorab, omborchi 403; buxgalter 200) to‘liq mos.

### FIN-08 — O12: bugun kiritilgan, o‘tgan oy sanali hujjatlar summary.monthly, dashboard monthly/by_kind, plan-actual monthly va forecast.recent da o‘tgan oyda (created_at emas) (muvofiqlik)

**Kutilgan natija:** 1–3: 200, har javobda document_date "2026-09-30". 4: monthly aynan bitta qator {month:"2026-09-01", expense:"1500000.00", cash_out:"-3000000.00", cash_in:"2000000.00", budget:"0.00"} — "2026-10-01" qatori yo‘q; actual_cost "1500000.00", net_cash_flow "-1000000.00", supplier_debt "1500000.00", advances "3000000.00", income "2000000.00". 5 (months=6): period {months:6, from:"2026-05-01", to:"2026-10-31"}; costs.monthly …

**Manba:** finance.ts:6-13 (accountingDaySql/accountingMonthSql/journalWithDocSql); routes-finance-extra.ts:328-341 (summary.monthly, cash_out = Σ manfiy), :71-80 (plan-actual monthly), :982-987, :1022 (forecast.recent); routes-das …

**Natija:** ✅ o‘tdi

### FIN-09 — O12: hisobotlar from/to, hujjatlar from/to filtri, budjet fakti va dashboard over_budget hujjat sanasi oyi bo‘yicha (muvofiqlik)

**Kutilgan natija:** 1: expenses [{project:'FIN-08 obyekt', month:"2026-09-01", material:"0", other:"1500000.00", total:"1500000.00"}]; cash_flow [{month:"2026-09-01", account:'FIN kassa', kind:'cash', inflow:"2000000.00", outflow:"3000000.00"}]; income "2000000.00"; aging [{counterparty:'FIN-08 S8', current:"1500000.00", d30:"0", d90:"0", older:"0", total:"1500000.00"}]. 2: expenses [], cash_flow [], income "0" (yaratilgan kun oktabr bo …

**Manba:** routes-finance-extra.ts:1038-1070 (reports: cash_flow/expenses/income accountingDaySql BETWEEN from/to, aging sanasiz); routes-operations.ts:696-698 (documents from/to = document_date), :760-773 (MONTH_FIRST_DAY_REQUIRED …

**Natija:** ✅ o‘tdi

### FIN-10 — UTC+5 chegara: oy oxiri 2026-09-30 va 2026-10-01 sanali hujjatlar; Toshkent 00:00–04:59 oynasida ombor sarfi Toshkent oyida, storno document_date Toshkent sanasi (chegara)

**Kutilgan natija:** 2: monthly aynan [{month:"2026-09-01", expense:"100000.00", …},{month:"2026-10-01", expense:"200000.00", …}]. 3: period.from "2026-08-01", period.to "2026-10-31"; costs.monthly: "2026-08-01" fact "0.00", "2026-09-01" fact "100000.00", "2026-10-01" fact "200000.00". 4: birinchi — expenses [{month:"2026-09-01", other:"100000.00", total:"100000.00"}]; ikkinchi — [{month:"2026-10-01", other:"200000.00", total:"200000.00" …

**Manba:** finance.ts:11-13 (accountingDaySql: document_date, aks holda created_at AT TIME ZONE 'Asia/Tashkent'), :266-268 (storno document_date current_date); routes-dashboard.ts:22-24 (todaySql Toshkent), :69-76 (davr Toshkent),  …

**Natija:** ❌ yiqildi — haqiqiy nuqson — HAQIQIY NUQSON (O12/O17): storno hujjatining `document_date` si Postgres `current_date` dan olinadi (finance.ts:268), baza sessiyasi esa UTC (`show timezone` = Etc/UTC). Toshkent vaqti 00:00–04:59 oralig‘ida yaratilgan storno kechagi sanani oladi (ikki marta takrorlandi: Toshkent 2026-10-29 01:14 da storno 2026-10-28 sanasi bilan). Oyning 1-kunida bu storno o‘tgan oyga tushadi — `accountingDaySql` (finance.ts:11, Toshkent sanasi) va O12 qoidasiga zid. Tuzatish: `current_date` → `(now() AT TIME ZONE 'Asia/Tashkent')::date`. FIN-10 ning qolgan qismi (document_date bo‘yicha oylar, ombor sarfi Toshkent kuni bo‘yicha) mos.

### FIN-11 — O3: smeta importi preview har qatorga total (hisobiy miqdor × narx) va umumiy total ni serverda decimal bilan qaytaradi; commit dan keyingi smeta bilan bir xil (ijobiy)

**Kutilgan natija:** 1: 200; PV.created {materials:0, zones:0}; PV.preview.lines[*].total aynan ["3000.99","0.10","0.20","330.00"] (4-qator: norma 2 × ish hajmi 1.5 × 1.10 = 3.300000 × 100, xom quantity "999" ishlatilmaydi — lines[3].quantity "999" bo‘lib qoladi); PV.total "3331.29" (ikki xona, 0.1+0.2 float siljishi yo‘q); PV.preview.lines[*].kind 'labor', unit_id 'm3'. 2: 200. 3: lines[*].total ["3000.99","0.10","0.20","330.00"], lines …

**Manba:** routes-operations.ts:443-512 (preview: plannedQuantity × unit_price, total), :514-540 (commit); money.ts:1-19 (Decimal precision 40, ROUND_HALF_UP, plannedQuantity); estimates.ts:38-86 (validateEstimate), :109-137 (effec …

**Natija:** ✅ o‘tdi

### FIN-12 — O3: kirim value = miqdor × narx serverda yaxlitlangan (3001.875 → 3001.88); yetkazib beruvchi invoysi aynan shu summaga teng bo‘lishi shart; bitta kirimga ikki invoys yo‘q (chegara)

**Kutilgan natija:** 1: 200, R.status 'posted', R.quantity "2.500000", R.unit_cost "1200.75". 2: R.value "3001.88" (2.5 × 1200.75 = 3001.875, ROUND_HALF_UP → 3001.88; frontend ko‘paytirmaydi). 3: 409 PRICE_ADJUSTMENT_REQUIRED. 4: 400 VALIDATION_ERROR (amount ≤ 2 xona). 5: 200; INV.matched_receipt_id R.id, amount "3001.88". 6: unmatched ro‘yxatda R yo‘q; invoys qatori outstanding "3001.88", paid "0.00", matched_material_name 'FIN-12 Semen …

**Manba:** inventory.ts:184-192 (value = money(quantity × unit_cost), inventory/clearing); money.ts:2-4; routes-stock-extra.ts:112 (value = Σ value_delta ::numeric(20,2)), :125 (unmatched); finance.ts:142-172 (RECEIPT_MATCH_REQUIRE …

**Natija:** ❌ yiqildi — haqiqiy nuqson — Ikki kichik farq: (1) 1-qadam kutilmasi noto‘g‘ri — ombor mudirida `prices.read` yo‘q, shuning uchun o‘z kirimi javobida `unit_cost` kesiladi (sensitive marshrut, permissions.ts:406-444); buxgalter uchun qiymat "1200.750000" (numeric(20,6)). (2) 6-qadam `paid` "0" — formatlash oilasi (routes-operations.ts:695/:729). O3 mazmuni (kirim `value` 3001.88 = 2.5 × 1200.75 yarimdan yuqoriga, boshqa summa → PRICE_ADJUSTMENT_REQUIRED) to‘liq mos.

### FIN-13 — Yetkazib beruvchi invoysi faqat posted, storno qilinmagan «receipt» ga: transfer va opening — RECEIPT_MISMATCH, storno qilingan kirim — RECEIPT_REVERSED; value maydoni faqat kirim/ochilishda (salbiy)

**Kutilgan natija:** 2: 409 RECEIPT_MISMATCH (kind 'transfer', status 'pending'). 3: 409 RECEIPT_MISMATCH (kind 'opening' — qiymati bo‘lsa ham invoysga bog‘lanmaydi). 4: 400 RECEIPT_MATCH_REQUIRED. 5: 200 (ombor mudirida stock.reverse). 6: 409 RECEIPT_REVERSED. 7: T.value null, O.value "500.00", R1.value "1000.00" (R1 ning ledger yozuvlari saqlanadi; storno alohida kind 'reversal' buyruq, uning value null); unmatched=true ro‘yxatida stor …

**Manba:** finance.ts:143-164 (RECEIPT_MATCH_REQUIRED 400, RECEIPT_MISMATCH: kind='receipt' AND status='posted' AND project, RECEIPT_REVERSED); routes-stock-extra.ts:112 (value CASE kind IN receipt/opening), :125 (unmatched = finan …

**Natija:** ✅ o‘tdi

## Ruxsat chegaralari, narx kesish, o‘zgarmas jurnallar, tenant izolyatsiyasi

### PERM-01 — Prorab smeta kartasi va smeta qatorlari ro'yxatida narx maydonlarini ko'rmaydi (unit_price, total, labor_rate, totals) (ruxsat)

**Kutilgan natija:** 1) 200. Har bir lines[i] obyektida 'unit_price', 'total', 'labor_rate', 'fact_value' kalitlari YO'Q (undefined, null emas); lines[0].description 'QA Beton', lines[0].quantity '100.000000', lines[0].effective_quantity '100.000000', lines[0].fact_quantity '35.000000' qoladi. totals obyektida 'total', 'material_total', 'work_total' kalitlari yo'q; totals.by_kind elementlarida faqat key va count qoladi ('total' va 'value …

**Manba:** backend/src/permissions.ts:406-444 (redactPrices ro'yxati: unit_price, labor_rate, total, material_total, work_total, value, fact_value); backend/src/http.ts:176-177 (sensitive + prices.read yo'q → redactPrices); backend …

**Natija:** ✅ o‘tdi

### PERM-02 — Vazifa kartasida estimate_fact_value faqat narx huquqi bilan; prorab hajm va foizni ko'radi, summani emas (ruxsat)

**Kutilgan natija:** 1) 200, estimate_line_id = materialLine.id. 2) 200: estimate_kind 'labor', estimate_plan_quantity '100.000000', estimate_fact_quantity '35.000000', estimate_percent '35.0', estimate_fact_value null, estimate_line_archived false; javobda 'labor_rate', 'labor_amount', 'unit_price', 'total' kalitlari yo'q. 3) 200: 2-banddagi bilan bir xil hajm/foiz; estimate_fact_value null (ish qatorida summa hisoblanmaydi, narx huquqi …

**Manba:** backend/src/routes-work-extra.ts:57-105 (GET /v1/tasks/:id, estimateFactValue faqat material && prices.read); backend/src/estimates.ts:15-23 (taskLineSql: estimate_plan_quantity, estimate_fact_quantity, estimate_percent) …

**Natija:** ✅ o‘tdi

### PERM-03 — Obyekt kartasi: brigade_percent va finance faqat prices.read bilan; prorab, brigadir, omborchi uchun finance null (ruxsat)

**Kutilgan natija:** 1) 200: javobda 'brigade_percent' kaliti yo'q (undefined), finance === null; zones[blok].estimate_total null (narxsiz); counters, members, warehouses, zones mavjud. 2) 200: brigade_percent yo'q, finance null. 3) 200: brigade_percent yo'q, finance null. 4) 200: brigade_percent '20.00'; finance obyekt: plan_total '25600000.00', fact_total '3620000.00', paid '4700000.00', debt '0.00', income '10000000.00', remaining_pla …

**Manba:** backend/src/routes-company-extra.ts:11-104 (prices=allowed(prices.read); brigade_percent: prices ? ... : undefined; finance: prices ? ... : null; estimate_total faqat $3=true); backend/src/routes-company.ts:41-60 (GET /v …

**Natija:** ✅ o‘tdi

### PERM-04 — Xodim akkord hisobi (GET /v1/employees/:id/earnings): finance.read bo'lmagan rollar 403, finansist/buxgalter/admin 200 va bir xil jami (ruxsat)

**Kutilgan natija:** 1) 403 {"error":{"code":"PAGE_ACTION_FORBIDDEN"}} (pageAllowed(finance, read) birinchi tekshiriladi, permit emas). 2) 403 PAGE_ACTION_FORBIDDEN. 3) 403 PAGE_ACTION_FORBIDDEN. 4) 403 PAGE_ACTION_FORBIDDEN (manager bazasida finance.read yo'q, prices.read bor — yetarli emas). 5) 200: totals.earned '3500000.00', totals.in_payroll '3500000.00', totals.paid '3500000.00', totals.posted_unpaid '0.00', totals.advances '0.00', …

**Manba:** backend/src/earnings.ts:71-93 (permission finance.read, action read; one(users) → 404 begona id); backend/src/permissions.ts:189-227 (financier/accountant finance.read bor, manager/foreman/brigadier/warehouse yo'q), 279- …

**Natija:** ✅ o‘tdi

### PERM-05 — Brigadir /v1/me/earnings faqat o'z hisobotlarini ko'radi; boshqa brigadir summasi aralashmaydi; prorab hisobi bo'sh (muvofiqlik)

**Kutilgan natija:** 3) 200 status 'submitted'. 4) 200 status 'accepted'. 5) 200: totals.earned '1000000.00' (10 × 100000), totals.earned_month '1000000.00', totals.in_payroll '0.00', totals.paid '0.00', totals.posted_unpaid '0.00', totals.advances '0.00', totals.balance '1000000.00'; projects.length 1, projects[0].earned '1000000.00'; entries.length 1, entries[0].quantity '10.000000', entries[0].labor_rate '100000.00', entries[0].amount …

**Manba:** backend/src/earnings.ts:17-69 (r.author_id=$2, x.employee_id=$2, c.employee_id=$2 filtrlari; earningSql = round(qty × labor_rate, 2)); backend/src/routes-work.ts:324-375 (qabulda labor_rate qotiriladi: coalesce(l.labor_r …

**Natija:** ✅ o‘tdi

### PERM-06 — Ombor mudiri smeta, vazifa, hisobot yarata olmaydi va smetani o'qiy olmaydi (403 PAGE_ACTION_FORBIDDEN); /v1/me/permissions bunga mos (ruxsat)

**Kutilgan natija:** 1) 403 {"error":{"code":"PAGE_ACTION_FORBIDDEN"}}. 2) 403 PAGE_ACTION_FORBIDDEN. 3) 403 PAGE_ACTION_FORBIDDEN. 4) 403 PAGE_ACTION_FORBIDDEN. 5) 403 PAGE_ACTION_FORBIDDEN. 6) 403 PAGE_ACTION_FORBIDDEN. 7) 200 (tasks.read bor), items faqat o'ziga tegishli vazifalar — ombor mudiri assignee/reviewer emas → items []. 8) 200: role 'warehouse_manager'; pages.estimates.read false, pages.estimates.create false, pages.tasks.cr …

**Manba:** backend/src/permissions.ts:188 (warehouse_manager bazasi), 279-322 (pageAllowed: estimates/tasks/reports create binding → allowed=false), 312 (tasks update → tasks.read), 313-318 (stock update stock.send orqali); backend …

**Natija:** ✅ o‘tdi

### PERM-07 — Bosh muhandis (manager) chegaralari: smeta/material/vazifa mumkin, moliya, xodim boshqaruvi, ombor amallari va audit 403 (ruxsat)

**Kutilgan natija:** 1) 403 PAGE_ACTION_FORBIDDEN. 2) 403 {"error":{"code":"FORBIDDEN"}} (ruxsatli moliya sahifasi yo'q — kinds bo'sh). 3) 403 PAGE_ACTION_FORBIDDEN. 4) 403 PAGE_ACTION_FORBIDDEN. 5) 403 PAGE_ACTION_FORBIDDEN (employees.manage yo'q). 6) 200, items ichida qa.foreman/qa.brigadier loginlari bor, hech bir item da 'password_hash'/'token' kaliti yo'q. 7) 200: id, name 'QA Armatura <stamp>', unit_id 'kg' (estimates.import yetarl …

**Manba:** backend/src/permissions.ts:215-227 (manager bazasi), 202-211 (accountant); backend/src/routes-operations.ts:73-95 (POST /v1/materials: admin emas va stock.receive yoki estimates.import), 666-679 (GET finance/documents: k …

**Natija:** ✅ o‘tdi

### PERM-08 — Tenant tokenlari /v1/platform/* marshrutlarida 403 FORBIDDEN, hech narsa yaratilmaydi (ruxsat)

**Kutilgan natija:** 1) 403 {"error":{"code":"FORBIDDEN"}} (request_id mavjud). 2) 403 FORBIDDEN. 3) 403 FORBIDDEN. 4) 403 FORBIDDEN. 5) 403 FORBIDDEN. 6) 200, items.length 0 — tenant token bilan kompaniya yaratilmagan. Barcha 1–5 javob tanasi tenant ma'lumotlarini (legal_name ro'yxati) o'z ichiga olmaydi.

**Manba:** backend/src/http.ts:130-132 (route.platform → invariant(!actor.tenant_id && platform.includes(role), 'FORBIDDEN', 403) — tenant_id bor har qanday aktor rad etiladi, tenantAccess/page tekshiruvlarigacha); backend/src/rout …

**Natija:** ✅ o‘tdi

### PERM-09 — Tenant izolyatsiyasi: boshqa kompaniya admini tokeni bilan bu tenant identifikatorlari 404 NOT_FOUND (403 emas, ma'lumot emas) (ruxsat)

**Kutilgan natija:** 1) 404 {"error":{"code":"NOT_FOUND"}}. 2) 404 NOT_FOUND. 3) 404 NOT_FOUND. 4) 404 NOT_FOUND. 5) 404 NOT_FOUND (projectScope). 6) 404 NOT_FOUND (users lookup tenant bo'yicha). 7) 404 NOT_FOUND. 8) 404 NOT_FOUND (FOR UPDATE tanlovi tenant_id bilan). 9) 404 NOT_FOUND. Hech bir javob 403 yoki 200 emas va tanasida 'QA obyekt', 'QA Beton', 'QA Brigadir' satrlari yo'q. 10) 200, status 'accepted', version 4 (o'zgarmagan).

**Manba:** backend/src/permissions.ts:348-366 (projectScope: tenant_id=$1 AND id=$2 → one → NOT_FOUND 404), 367-388 (accountScope); backend/src/db.ts:19-21 (one → NOT_FOUND 404); backend/src/routes-work-extra.ts:64-71, 113-121; bac …

**Natija:** ✅ o‘tdi

### PERM-10 — Bazada o'zgarmas jurnallar: progress_entries, progress_payroll, journal_entries, finance_documents UPDATE/DELETE → IMMUTABLE_LEDGER (faqat QA tenant qatorlari) (salbiy)

**Kutilgan natija:** 1) count ≥ 1; UPDATE throw qiladi: error.message 'IMMUTABLE_LEDGER' ni o'z ichiga oladi, error.code '23514'. 2) UPDATE va DELETE ikkalasi ham IMMUTABLE_LEDGER / 23514 bilan rad etiladi (progress_payroll da 027 migratsiya triggeri; count ≥1 — davr yopilganda yozilgan). 3) UPDATE va DELETE → IMMUTABLE_LEDGER / 23514. 4) UPDATE va DELETE → IMMUTABLE_LEDGER / 23514. Hech bir holatda rowCount>0 bilan muvaffaqiyat bo'lmayd …

**Manba:** backend/migrations/001_core.sql:255-259 (reject_mutation RAISE 'IMMUTABLE_LEDGER' ERRCODE 23514; trigger immutable BEFORE UPDATE OR DELETE ON stock_ledger, journal_entries, billing_entries, audit_events, estimate_revisio …

**Natija:** ✅ o‘tdi

### PERM-11 — API da moliyaviy hujjat va progress yozuvini o'zgartirish/o'chirish marshruti yo'q (PATCH/DELETE → 404), faqat reversal; prorab reversal qila olmaydi (salbiy)

**Kutilgan natija:** 1) 404 — Fastify standart 'route not found' javobi: tanada statusCode 404, error 'Not Found', message 'Route PATCH:/v1/finance/documents/<id> not found' (bu marshrut ro'yxatda yo'q; {error:{code}} formatidagi NOT_FOUND emas). 2) 404 (Route DELETE:... not found). 3) 404. 4) ikkalasi 404. 5) 404. 6) 403 {"error":{"code":"PAGE_ACTION_FORBIDDEN"}} (invoices sahifasida delete yo'q), reversal hujjat yaratilmaydi. 7) 200: i …

**Manba:** backend/src/routes-operations.ts:654-760 (finance/documents uchun faqat POST, GET va POST :id/reverse ta'riflangan); backend/src/routes-work-extra.ts:157-172 (progress-entries uchun faqat POST :id/corrections); backend/s …

**Natija:** ⚠️ yiqildi — test kutilmasi noto‘g‘ri — 5-qadam kutilmasi noto‘g‘ri: `DELETE /v1/reports/:id` marshruti mavjud (routes-lifecycle.ts:128-150, «Qaytarilgan hisobotni arxivlash»), tanasiz so‘rov 400 VALIDATION_ERROR, tanali so‘rov qabul qilingan hisobotda 409 REPORT_LOCKED beradi — qabul qilingan fakt o‘chmaydi, bu aynan qoidaga mos. Moliya hujjati va progress yozuvi uchun PATCH/DELETE marshruti yo‘q (404), prorab storno qila olmaydi (403) — hammasi kutilganidek.

### PERM-12 — Faolsizlantirilgan xodim tokeni darhol ishlamaydi (401), login ham rad etiladi; custody qoldig'i bor brigadirni faolsizlantirish HANDOVER_REQUIRED (ruxsat)

**Kutilgan natija:** 3) ikkalasi 200 (role 'financier', must_change_password false). 5) 200: active false, version v+1. 6) uchalasi 401 {"error":{"code":"UNAUTHORIZED"}} (sessiya revoked_at va u.active=false). 7) 401 {"error":{"code":"INVALID_CREDENTIALS"}}. 8) 200, items ichida D.id bor, active false; hech bir item da password_hash yo'q. 9) 409 {"error":{"code":"HANDOVER_REQUIRED"}}; brigadir active true qoladi. 10) 200 (brigadir sessiy …

**Manba:** backend/src/routes-company.ts:488-553 (PATCH /v1/employees/:id: HANDOVER_REQUIRED custody/ochiq vazifa; !active → UPDATE sessions SET revoked_at); backend/src/auth.ts:9-21 (authenticate: s.revoked_at IS NULL AND u.active …

**Natija:** ✅ o‘tdi

### PERM-13 — /v1/me/permissions snapshot haqiqiy 403 lar bilan mos: 6 rol × 6 sahifa (projects, estimates, stock, finance, payroll, employees) (muvofiqlik)

**Kutilgan natija:** Kutilgan read matritsasi (pages[...].read va zond): foreman — projects T(200), estimates T(200), stock T(200), finance F(403), payroll F(403), employees F(403); brigadier — projects T, estimates F, stock T, finance F, payroll F, employees F; warehouse_manager — projects T, estimates F, stock T, finance F, payroll F, employees F; financier — projects T, estimates T, stock F(403), finance T, payroll T, employees F; acc …

**Manba:** backend/src/permissions.ts:175-231 (basePermissions), 279-331 (pageAllowed/effectivePages; payroll → financeSubpages → finance.read; stock read → stock.read), 253-278 (allowed); backend/src/routes-permissions.ts:15-34; b …

**Natija:** ✅ o‘tdi

### PERM-14 — Individual deny rol grantidan ustun: manager uchun prices.read deny → smeta, obyekt kartasi, vazifa kartasida narx yo'qoladi; inherit → qaytadi (muvofiqlik)

**Kutilgan natija:** 1) 200 {"ok":true}. 2) 200: permissions massivida 'prices.read' YO'Q, 'estimates.read', 'estimates.edit', 'projects.write' bor; pages.estimates.read true (deny sahifani yopmaydi, faqat narxni). 3) 200: lines[0] da unit_price/labor_rate/total yo'q; totals da total/material_total/work_total yo'q; lines.length 2. 4) 200: 'brigade_percent' kaliti yo'q, finance null. 5) 200: estimate_fact_value null, estimate_percent '20. …

**Manba:** backend/src/permissions.ts:253-278 (allowed: override deny → false, bazadan oldin), 232-252 (permissionContext tranzaksiya ichida keshlanadi — keyingi so'rov yangi o'qiydi); backend/src/routes-company.ts:600-636 (POST /v …

**Natija:** ✅ o‘tdi

## UI (Playwright): raqam ajratish, shrift, tugmalar, yangi ekranlar

### UI-01 — Kirim oynasida 3000000 → «3 000 000» ko‘rinadi, API tanasiga bo‘sh joysiz «3000000» ketadi (ijobiy)

**Kutilgan natija:** qty.inputValue()==='2 500' va cost.inputValue()==='3 000 000' (U+0020 bilan, 'inputmode'==='decimal'); body deepEqual {project_id:P, kind:'receipt', material_id:M1, to_account_id:WH.account_id, quantity:'2500', unit_cost:'3000000', reason:'UI kirim'} (bo‘sh joy yo‘q, ortiqcha maydon yo‘q); resp.status()===200; dialog yopiladi, '.toast.success' ko‘rinadi; balances items.find(material_id===M1).quantity==='2500.000000'; …

**Manba:** frontend/src/components/ui/NumericInput.tsx:16-23,58-82,95-97; frontend/src/components/ui/index.tsx:126-135; frontend/src/features/stock/StockModals.tsx:102-103,120-136,160-165,205-225; frontend/src/features/estimates/mo …

**Natija:** ⚠️ yiqildi — test kutilmasi noto‘g‘ri — Test kutilmasi noto‘g‘ri: raqam guruhlari oddiy bo‘sh joy (U+0020) emas, ajratilmas bo‘sh joy (U+00A0) bilan ajratiladi (NumericInput.tsx:16 SEP = ) — ekranda bir xil ko‘rinadi. Mazmun mos: maydonda guruhlangan ko‘rinish, API ga yuborilgan qiymatda bo‘sh joy yo‘q, jadvalda summalar guruhlangan. Kirim POST tanasi aynan {quantity:"2500",unit_cost:"3000000"}, qoldiq 2500.000000.

### UI-02 — Ajratuvchi bo‘sh joy ustida Backspace — yonidagi raqam o‘chadi, kursor to‘g‘ri joyda qoladi (chegara)

**Kutilgan natija:** 1) inputValue '12 345'. 2) inputValue '1 345' (bo‘sh joy emas, '2' o‘chdi) va area.evaluate(el=>el.selectionStart)===1. 3) inputValue '19 345', selectionStart===2 (yozilgan raqamdan keyin). 4) '19 345' → '19 34' → '19 3' → '19' → '1' ketma-ket (har bosishda bitta raqam; guruhlar qayta quriladi). 5) inputValue '1 234 567.5' (kasr qismi guruhlanmaydi, nuqta saqlanadi). Hech qanday /v1/ so‘rovi yuborilmaydi (dialog ochi …

**Manba:** frontend/src/components/ui/NumericInput.tsx:17-31,58-82; frontend/src/features/projects/ProjectsPage.tsx:121-127; docs/tests/RAQAM_AJRATISH_TEST_CASES.md RA-02/RA-03

**Natija:** ⚠️ yiqildi — test kutilmasi noto‘g‘ri — Test kutilmasi noto‘g‘ri: raqam guruhlari oddiy bo‘sh joy (U+0020) emas, ajratilmas bo‘sh joy (U+00A0) bilan ajratiladi (NumericInput.tsx:16 SEP = ) — ekranda bir xil ko‘rinadi. Mazmun mos: maydonda guruhlangan ko‘rinish, API ga yuborilgan qiymatda bo‘sh joy yo‘q, jadvalda summalar guruhlangan. Qo‘shimcha: Backspace har bosishda guruhlar qayta quriladi ("1 934", "193" — NumericInput.tsx:71-77), test matnidagi "19 34"/"19 3" oraliq ko‘rinishlari bo‘lishi mumkin emas; kursor holati va kasr qismi ("1 234 567.5") to‘g‘ri.

### UI-03 — Maydon «65,4» (vergul) — mijoz tomonida xato, so‘rov ketmaydi; «1250.50» → «1 250.50», tanada area_m2 "1250.50" (salbiy)

**Kutilgan natija:** Birinchi urinish: area.inputValue()==='65,4' (vergul saqlanadi, guruhlanmaydi); dlg ichida role=alert matni 'Musbat son, ko‘pi bilan 2 kasr xona (masalan 1250.50)'; posts.length===0 (so‘rov yuborilmadi); dialog ochiq. Ikkinchi: inputValue '1 250.50'; req.postDataJSON().area_m2==='1250.50' va name==='UI maydon sinovi', status 200; obyekt sahifasida «Maydon, m²» dd matni '1250.50' (xom qiymat, guruhlanmaydi — ProjectDe …

**Manba:** frontend/src/features/projects/ProjectsPage.tsx:36,57-60,71-82,121-127,307-318; frontend/src/locales/erp.uz.ts:57; frontend/src/components/ui/index.tsx:77-80; frontend/src/features/projects/ProjectDetailPage.tsx:158-161; …

**Natija:** ⚠️ yiqildi — test kutilmasi noto‘g‘ri — Test kutilmasi noto‘g‘ri: raqam guruhlari oddiy bo‘sh joy (U+0020) emas, ajratilmas bo‘sh joy (U+00A0) bilan ajratiladi (NumericInput.tsx:16 SEP = ) — ekranda bir xil ko‘rinadi. Mazmun mos: maydonda guruhlangan ko‘rinish, API ga yuborilgan qiymatda bo‘sh joy yo‘q, jadvalda summalar guruhlangan. "65,4" rad etiladi (maydon xabari), "1250.50" → "1 250.50" ko‘rinadi, API ga "1250.50" ketadi, obyekt kartasida 1250.50.

### UI-04 — Obyekt moliya kartasi va obyekt kartochkasida summalar bo‘sh joy bilan (25 600 000), vergul bilan emas (muvofiqlik)

**Kutilgan natija:** fin.plan_total==='25600000.00', fin.fact_total==='0.00', fin.remaining_plan==='25600000.00'. Sahifada h3 'Obyekt moliyasi' va 8 ta .stat (yorliqlar: 'Smeta (reja) (UZS)', 'Fakt xarajat (UZS)', 'Qolgan reja (UZS)', 'Ish hajmi bajarilishi', 'To‘langan (UZS)', 'Kontragentlarga qarz (UZS)', 'Berilgan avanslar (UZS)', 'Buyurtmachidan tushum (UZS)'). vals[0].replace(/ /g,' ')==='25 600 000', vals[1]==='0', vals[2]==='25 60 …

**Manba:** frontend/src/features/projects/ProjectDetailPage.tsx:176-218; frontend/src/features/projects/ProjectsPage.tsx:176-184; frontend/src/lib/format.ts:10-33; frontend/src/components/ui/index.tsx:471-502; frontend/src/locales/ …

**Natija:** ✅ o‘tdi

### UI-05 — Moliya kartasi: admin va bosh muhandis ko‘radi, prorab ko‘rmaydi (API finance=null); Tahrirlash/Arxivlash chegarali tugma (ruxsat)

**Kutilgan natija:** finF.finance===null; finA.finance va finM.finance obyektlar, kalitlari {plan_total,fact_total,remaining_plan,fact_percent,progress_percent,paid,debt,advances,income} (hammasi string yoki null). Brauzer 1 (prorab): h.count()===0, e.count()===0, a.count()===0 (projects.update/delete yo‘q); '.block-facts' ko‘rinadi (obyekt o‘zi ochiladi, 403 yo‘q). Brauzer 2 (admin): h.count()===1; e2: tag 'BUTTON', cls /\bbtn\b.*\bbtn- …

**Manba:** backend/src/routes-company-extra.ts:21,66-68; backend/src/permissions.ts:155-161,176-184,208-220; frontend/src/features/projects/ProjectDetailPage.tsx:104,116-125,176-178; frontend/src/lib/auth.tsx:143-152; frontend/src/ …

**Natija:** ✅ o‘tdi

### UI-06 — «Qavatlar progressi» tabi: qavat × ish matritsasi 35 / 100 (35.0 %) va ?tab=progress chuqur havola (ijobiy)

**Kutilgan natija:** matrix.cells.find(c=>c.zone_id===floor.id&&c.description==='QA Beton') === {plan:'100.000000', fact:'35.000000', percent:'35.0', unit_id:'m3', zone_id:floor.id, description:'QA Beton'}; matrix.floors[0].percent==='35.0'; matrix.works[0] plan '100.000000', fact '35.000000', percent '35.0'. UI: tab.getAttribute('aria-selected')==='true' (URL parametri orqali ochildi, bosishsiz); tbl ko‘rinadi, '.alert' yo‘q; thead: th[ …

**Manba:** frontend/src/features/projects/FloorProgressTab.tsx:35-58,60-135; frontend/src/features/projects/ProjectDetailPage.tsx:49-60,219-239; frontend/src/locales/erp.uz.ts:39-46; backend/src/routes-company-extra.ts:111-175; bac …

**Natija:** ✅ o‘tdi

### UI-07 — Qavat zonasi yo‘q → yo‘riqnoma; qavat bor, smeta yo‘q → «Smetada ish qatorlari yo‘q.» (chegara)

**Kutilgan natija:** m0 deepEqual {floors:[], works:[], cells:[]} (blok kind='floor' emas). al1 matni 'Qavat turidagi zona yo‘q. «Zonalar / bloklar» bo‘limida blok yoki kirish ichiga qavat qo‘shing.'; sahifada 'table.table-dense' yo‘q; .alert-danger yo‘q. m1.floors.length===1 (name '1-qavat', parent_name 'B blok', plan null, fact '0.000000' yoki '0', percent null), m1.works.length===0. al2 matni 'Smetada ish qatorlari yo‘q.'; jadval hali …

**Manba:** frontend/src/features/projects/FloorProgressTab.tsx:66-75; frontend/src/locales/erp.uz.ts:44-46; backend/src/routes-company-extra.ts:111-135; frontend/src/features/projects/ProjectDetailPage.tsx:219-239

**Natija:** ✅ o‘tdi

### UI-08 — Talabnoma oynasi: «Qator qo‘shish» bilan ikkinchi qator, miqdor «1 500», lines[] ikki element bilan yuboriladi (ijobiy)

**Kutilgan natija:** rm0===0 (bitta qatorda olib tashlash tugmasi yo‘q); ikkinchi qatordan keyin 'Qatorni olib tashlash' tugmalari 2 ta; g2 ichida suffix 'm3' ko‘rinadi; q2.inputValue()==='1 500'. body deepEqual {project_id:P, lines:[{material_id:M1, quantity:'50'},{material_id:M2, quantity:'1500'}], note:'UI ikki qator'} (zone_id/needed_by yo‘q). status 200; res.group_id uuid, res.lines.length===2, har biri status 'pending'. after.items …

**Manba:** frontend/src/features/stock/StockPage.tsx:721-799,852-964; frontend/src/locales/stock.uz.ts:100-109,115; backend/src/routes-stock-extra.ts:183-261; backend/src/schemas.ts:7-9; frontend/src/components/ui/SearchSelect.tsx: …

**Natija:** ⚠️ yiqildi — test kutilmasi noto‘g‘ri — Test kutilmasi noto‘g‘ri: raqam guruhlari oddiy bo‘sh joy (U+0020) emas, ajratilmas bo‘sh joy (U+00A0) bilan ajratiladi (NumericInput.tsx:16 SEP = ) — ekranda bir xil ko‘rinadi. Mazmun mos: maydonda guruhlangan ko‘rinish, API ga yuborilgan qiymatda bo‘sh joy yo‘q, jadvalda summalar guruhlangan. Ko‘p qatorli talabnoma oynasi: "Qator qo‘shish" → 2 qator, POST /v1/stock/requests lines[] aynan ikki qator, jadvalda № va ikki qator holati — mos.

### UI-09 — Talabnoma: bir xil material ikki qatorda → 400 REQUEST_LINE_DUPLICATE; miqdor «0» → 400 VALIDATION_ERROR; oyna ochiq qoladi (salbiy)

**Kutilgan natija:** 1) resp1.status()===400, (await resp1.json()).error.code==='REQUEST_LINE_DUPLICATE'; dialog hali ochiq ('[role=dialog]' ko‘rinadi); '.toast.error' (role=status) paydo bo‘ladi. 2) '0' bo‘lsa tugma faol (ready: l.qty truthy), resp2.status()===400 va error.code==='VALIDATION_ERROR' (positiveQty /[1-9]/ talab qiladi); dialog ochiq. 3) bo‘sh miqdorda btn.isDisabled()===true, so‘rov ketmaydi. API: lines:[] → 400 VALIDATION …

**Manba:** backend/src/routes-stock-extra.ts:190-206; backend/src/schemas.ts:7-9; frontend/src/features/stock/StockPage.tsx:864-878,889; frontend/src/features/stock/StockModals.tsx useStockMutation onError (toast.error); frontend/s …

**Natija:** ✅ o‘tdi

### UI-10 — Vazifa oynasida «Smeta qatori» tanlagichi faqat estimates.read bilan; ruxsat olib tashlansa yo‘qoladi va API 403 FORBIDDEN (ruxsat)

**Kutilgan natija:** Avval: cb.count()===1, hint matni 'Ixtiyoriy: vazifa qaysi smeta ishiga tegishli — kartada reja va qabul qilingan hajm ko‘rinadi'; linesReq.status()===200, URL ichida project_id=P va limit=50; opt ko‘rinadi, uning .cell-sub matni (NBSP→space) '100 m3 · QA smeta'. Ruxsat olib tashlangach: POST role-permissions 200; GET /v1/me/permissions (F) → pages.estimates.read===false; cb2.count()===0 (dialogdagi boshqa maydonlar  …

**Manba:** frontend/src/features/work/TasksPage.tsx:337-343,488-502; frontend/src/lib/auth.tsx:143-152; frontend/src/locales/work.uz.ts:22-24; backend/src/permissions.ts:127,155-161,176-184,346; backend/src/routes-operations.ts:258 …

**Natija:** ⚠️ yiqildi — test kutilmasi noto‘g‘ri — Xato kodi: smeta o‘qish ruxsati olingan prorab uchun GET /v1/estimate-lines 403 PAGE_ACTION_FORBIDDEN qaytaradi (http.ts:151 sahifa darvozasi avval), FORBIDDEN emas. Asosiy mazmun mos: vazifa oynasida "Smeta qatori" tanlovi faqat smetani ko‘ra oladigan rolda, ruxsat olingach yo‘qoladi, admin oynasida qoladi.

### UI-11 — Brigadir bosh sahifasida «Mening hisobim»: 3 500 000 UZS, API /v1/me/earnings bilan mos; prorab va adminda bo‘lim yo‘q (muvofiqlik)

**Kutilgan natija:** e.totals deepEqual {earned:'3500000.00', earned_month:'3500000.00', in_payroll:'0.00', paid:'0.00', posted_unpaid:'0.00', advances:'0.00', balance:'3500000.00'}; e.entries.length===1, entries[0].description==='QA Beton', unit_id 'm3', labor_rate '100000.00'. Brauzer 1: h1 'Brigadir paneli'; sec.count()===1, h3 ichida .card-sub 'Qabul qilingan ishlar bo‘yicha akkord'; kpis 4 ta: 'Shu oy ishlab topilgan' → '3 500 000 U …

**Manba:** frontend/src/features/dashboard/RoleDashboards.tsx:319-384,386-447; frontend/src/features/dashboard/model.ts:121-152; frontend/src/locales/dashboard.uz.ts:34-39,95-106; frontend/src/lib/currency-math.ts:17; frontend/src/ …

**Natija:** ✅ o‘tdi

### UI-12 — Shrift o‘lchami «Katta»: localStorage barpo.fontSize='large', html[data-font-size], --font-scale 1.15, qayta yuklashda saqlanadi (ijobiy)

**Kutilgan natija:** before: {attr:null, scale:'1', body:'14px', ls:null}; h0===40. after: attr 'large', scale '1.15', body '16.1px' (14×1.15), ls 'large'; h1===46 (--control-h 40×1.15); fld ichida 'Katta' aria-pressed 'true', 'Kichik' va 'O‘rtacha' 'false'; hint 'Matn va tugmalar o‘lchami. Tanlov shu qurilmada saqlanadi.'. Qayta yuklashdan keyin: early==='large' (main.tsx birinchi chizishdan oldin applyFontSize) — miltillash yo‘q; press …

**Manba:** frontend/src/lib/font-size.ts:5-28; frontend/src/main.tsx:15-18; frontend/src/features/profile/ProfilePage.tsx:196,259-274; frontend/src/styles/tokens.css:52-69; frontend/src/styles/base.css:16-19; frontend/src/styles/co …

**Natija:** ✅ o‘tdi

### UI-13 — Shrift: «Kichik» 0.9, «O‘rtacha» atributni olib tashlaydi; yangi kontekst va noto‘g‘ri localStorage qiymati → O‘rtacha (chegara)

**Kutilgan natija:** s1: {has:true, attr:'small', scale:'0.9', body:'12.6px', btn:36, ls:'small'}. s2: {has:false, attr:null, scale:'1', body:'14px', btn:40, ls:'normal'} (normal tanlovda atribut o‘chiriladi, lekin localStorage 'normal' saqlanadi); s2r === s2 va 'O‘rtacha' aria-pressed 'true'. s3: has:false, scale '1', body '14px', ls null; 'O‘rtacha' aria-pressed 'true' (tanlov faqat qurilmada — TS-07). s4: has:false, scale '1', body '1 …

**Manba:** frontend/src/lib/font-size.ts:5-28; frontend/src/styles/tokens.css:53-69; frontend/src/styles/base.css:16-19; frontend/src/styles/components.css:2-8,24-27; frontend/src/features/profile/ProfilePage.tsx:196,259-274; front …

**Natija:** ✅ o‘tdi

### UI-14 — Birlamchi hujjatlarda «Teskari qilish» — chegarali tugma, summa 10 000 000 (vergulsiz), «Reversal» yo‘q; sahifalar bo‘ylab konsol xatosi yo‘q (muvofiqlik)

**Kutilgan natija:** btn.count()===1; info: tag 'BUTTON', cls /\bbtn\b/ va /\bbtn-ghost\b/ va /\bbtn-sm\b/, NOT /\bbtn-icon\b/; bw '1px', bs 'solid', bc !== 'rgba(0, 0, 0, 0)' (var(--border-strong)); h===32 (--control-h-sm, normal shrift); bcHover !== info.bc (brand-500 ga o‘tadi). row summa katagi (NBSP→space) '10 000 000' ni o‘z ichiga oladi; tableText /\d,\d{3}/ ga mos kelmaydi; page.getByText('Reversal') count 0. dlg sarlavhasi 'Tesk …

**Manba:** frontend/src/features/finance/DocumentsTable.tsx:53,251-269,330-357; frontend/src/locales/finance.uz.ts:55; frontend/src/styles/components.css:2-8,45-53,61-72; frontend/src/styles/tokens.css:54-55; frontend/src/lib/forma …

**Natija:** ⚠️ yiqildi — test kutilmasi noto‘g‘ri — Yorliq: storno oynasi tavsifida hujjat turi "Buyurtmachidan tushum" (finance.uz.ts:34), test "Tushum" deb kutgan. Qolgani mos: "Teskari qilish" chegarali tugma (btn btn-ghost btn-sm, ustida bordo), summalar "10 000 000" (vergulsiz), "Reversal" so‘zi yo‘q, bekor qilish hujjat yaratmaydi, 5 sahifada konsol xatosi yo‘q.
