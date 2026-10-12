# BARPO AI — Dashboard ko‘rsatkichlari: manba va hisoblash qoidasi

`GET /v1/dashboard` bitta javobda bloklarni qaytaradi. Har blok foydalanuvchining haqiqiy ruxsati bo‘lsa hisoblanadi, aks holda `null` (UI blokni ko‘rsatmaydi; yolg‘on nol yo‘q). Obyekt doirasi: tenant admin — barcha arxivlanmagan obyektlar, qolganlar — `project_assignments`dagi obyektlar. Vaqt zonasi: `Asia/Tashkent` («bugun» hisoblari shu zona bo‘yicha).

**Filtrlar.** `project_id` — barcha bloklar shu obyekt bilan cheklanadi (ko‘rinmaydigan yoki begona obyekt — 404; xodimlar bloki — obyektga biriktirilganlar). `months` — 3, 6 yoki 12 (standart 6): joriy oy bilan tugaydigan to‘liq oylar, javobda `period: {months, from, to}`. Davr faqat «davr» deb belgilangan ko‘rsatkichlarga ta’sir qiladi; qolganlari hozirgi holat.

**Xarajat yozuvi va hisob sanasi** (davr ko‘rsatkichlari uchun): `journal_entries.account='expense'`. Tur: ombor buyrug‘idan — `material`, moliya hujjatidan — hujjat turi (`labor`, `equipment`, `service`), storno — asl hujjat turi. Yetkazib beruvchi invoysi xarajat emas (`clearing`), shuning uchun alohida tur yo‘q va har xarajat bir marta hisoblanadi. Sana: moliya hujjati `document_date`, ombor yozuvi — `created_at` ning Toshkent sanasi (sarf buyrug‘ida hujjat sanasi yo‘q).

| Blok | Ruxsat | Ko‘rsatkich | Manba va qoida |
| --- | --- | --- | --- |
| projects | sahifa `projects.read` | `total`, `active`, `completed` | `projects` (archived_at IS NULL), `status` bo‘yicha |
| | | `behind_schedule` | `status<>'completed'` va (`planned_end<bugun` yoki `forecast_end>planned_end`) |
| | | `items[].open_tasks`, `overdue_tasks` | `tasks` (archived_at IS NULL, status<>accepted); overdue — `deadline<now()` |
| | | `items[].pending_reports` | `reports` status='submitted' |
| | | `items[].progress_percent` | ish qatorlari (`estimate_lines.kind<>'material'`, joriy smetalar, `effective_quantity>0`) bo‘yicha `least(100, fakt/reja·100)` ning oddiy o‘rtachasi; fakt = `progress_entries` + `progress_corrections` yig‘indisi (faqat qabul qilingan hisobotlar) |
| tasks | `tasks.read` | `open`, `overdue`, `due_today` | `tasks`; `tasks.manage` bo‘lmasa faqat o‘zi bajaruvchi/tekshiruvchi bo‘lgan vazifalar; due_today — `deadline` Toshkent sanasi = bugun |
| | | `awaiting_my_review` | status='submitted' va reviewer = foydalanuvchi |
| | | `my_open` | status ∈ {todo,in_progress,returned} va assignee = foydalanuvchi |
| | | `accepted_period` | davr: status='accepted' va audit `task.accepted` sanasi davrda |
| | | `overdue_items` | ko‘rish doirasidagi muddati o‘tgan 6 ta ochiq vazifa (deadline bo‘yicha), bajaruvchi nomi bilan |
| | | `items` | foydalanuvchiga tegishli ochiq 6 ta vazifa, deadline bo‘yicha |
| reports | `reports.read` | `pending_review` | status='submitted'; faqat `reports.review` bo‘lsa, aks holda `null` |
| | | `my_returned` | status='returned' va author = foydalanuvchi |
| | | `in_period` | davr: `report_date` davrda (ko‘rish doirasida) |
| stock | `stock.read` | `low` | `stock_balances`: `minimum_quantity>0` va `quantity-reserved<minimum_quantity`; hisoblar rol doirasida (brigadir — o‘z custody hisobi, ombor mudiri — biriktirilgan omborlar) |
| | | `materials` | qoldig‘i >0 bo‘lgan alohida materiallar soni |
| | | `inventory_value` | `sum(stock_balances.value)`; `prices.read` bo‘lmasa `null` |
| | | `pending_requests` | `material_requests` status='pending' |
| | | `pending_transfers` | `stock_commands` kind='transfer', status ∈ {pending,partial,disputed} |
| | | `today_receipts`, `today_consumptions` | `stock_commands` kind='receipt' (posted) / 'consumption' (posted, partial), `created_at` bugun |
| | | `low_items` | kam qolgan 6 ta material (mavjud/minimum nisbati bo‘yicha) |
| finance | `finance.read` | `budget_total`, `period_budget` | `budgets.amount` yig‘indisi; davr oylari |
| | | `plan_total` | joriy smetalar `estimate_lines.total` yig‘indisi |
| | | `actual_cost` | `journal_entries.account='expense'` (hammasi) |
| | | `period_expense` | davr: xarajat yozuvlari, hisob sanasi davrda; = `by_kind` yig‘indisi = `monthly.fact` yig‘indisi |
| | | `monthly[]` | davr oylari (bo‘sh oy ham `0.00` bilan): `plan` — `estimate_months.quantity × unit_price` (joriy smetalar), `budget`, `fact` — hisob sanasi oyi |
| | | `by_kind[]` | davr: `material`, `labor`, `equipment`, `service` (qat’iy tartib); `share_percent` = tur / `period_expense` × 100, 1 xona; jami 0 bo‘lsa `null` |
| | | `over_budget[]` | hozirgi holat, «Budjetlar» sahifasi ta’rifi: budjet kiritilgan oylar fakti (yozuv oyi, `created_at`) yig‘indisi > shu oylar budjeti; `over` = fakt − budjet; budjeti yo‘q obyekt kirmaydi. Oy manbasi farqi — `TZ_VA_NARX_REJASI.md` 9.4, O12 |
| | | `remaining_budget` | `budget_total − actual_cost` (decimal) |
| | | `net_cash_flow` | `account='cash'` yig‘indisi |
| | | `supplier_debt` | `−sum(account='payable')` |
| | | `advances` | `account='advance'` |
| | | `income` | `−sum(account='income')` |
| | | `payment_requests.pending/approved` | `payment_requests` status bo‘yicha |
| | | `overdue_payables` | `finance_documents` (supplier_invoice, opening_debt, labor, equipment, service), teskari qilinmagan, qoldiq>0, `due_date<bugun`; qoldiq = summa − bog‘langan to‘lovlar |
| employees | sahifa `employees.read` | `active`, `by_role` | `users` tenant bo‘yicha, `active=true`, rol kesimida; obyekt filtri bilan — shu obyektga biriktirilganlar |

Pul qiymatlari `numeric(20,2)` matn sifatida, foizlar `numeric(5,1)`. Grafik ulushlari ham serverdan; frontend summalarni qo‘shmaydi. Material sarfi progress deb hisoblanmaydi; progress faqat qabul qilingan hisobotlardan. UI «Manba» izohini sahifa pastida ko‘rsatadi va bu hujjatga yo‘naltiradi.
