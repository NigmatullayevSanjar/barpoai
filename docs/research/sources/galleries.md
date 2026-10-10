# UI/UX ilhom tadqiqoti: SaaSFrame va SaaS Interface galereyalari

Sana: 2026-10-07. Bu tadqiqot: naqshlar umumiy so'z bilan tasvirlangan, dizayn yoki matn ko'chirilmagan. Kod o'zgartirilmagan.
Skrinshotlar: `docs/research/screenshots/gallery-*.png` (faqat ochiq ko'rinadigan sahifalar).

Umumiy eslatma: saasinterface.com galereyasi to'liq yopiq (Access the gallery / Sign in; obuna kerak), faqat kategoriya sarlavhalari va 3 ta teaser ko'rinadi. saasframe.io da bitta misolning asosiy skrinshoti ochiq; "similar examples", flow'lar, Figma va ko'p misollar Pro ($18/oy) ortida.

## 1. Dashboard KPI kartalari

### 1.1 Baremetrics Dashboard
- Havola: https://www.saasframe.io/examples/baremetrics-dashboard (Baremetrics; teg: Dashboard, Charts)
- Tasvir: tepada sana oralig'i tanlagich. 2 ustunli KPI kartalar to'ri: har kartada katta qiymat, oldingi davr qiymati (kichik, kulrang), foiz o'zgarishi (yashil/qizil strelka) va ostida kichik chiziqli grafik (sparkline). O'ng ustunda "Breakdown" (davr tanlagichli sonlar ro'yxati) va "Live Stream" (so'nggi hodisalar lentasi, vaqt belgisi bilan).
- BARPO: `dashboard/TenantDashboard.tsx` (KPI + hodisalar lentasi), `finance/pages.tsx` (reja-fakt, prognoz).
- Moslashuv: `Stat` komponenti: qiymat + oldingi davr + trend `Badge` (success/danger). Sparkline uchun yangi kutubxona kerak emas: oddiy inline SVG yoki umuman qo'shmaslik. Lenta: `--border` bilan ajratilgan qatorlar ro'yxati. Grafik rangi `--brand-600`. Eslatma: BARPO'da statik demo raqam yo'q, ma'lumot bo'lmasa EmptyState.

### 1.2 Mercury Dashboard
- Havola: https://www.saasframe.io/examples/mercury-dashboard (Mercury; teg: Charts, Metrics). Sahifa ochildi, lekin skrinshot ko'zdan kechirilmadi; tavsif yozilmadi.

Boshqa dashboard misollari (wise, lightdash, june, context-dev overview) ro'yxatda bor, ochilmadi.

## 2. Katta jadvallar

### 2.1 Lightspark Transaction History
- Havola: https://www.saasframe.io/examples/lightspark-transaction-history (teg: Table, Filter, Import & Export, Status Indicator)
- Tasvir: sarlavha ostida ixcham toolbar: chapda "Filter", o'ngda "Export". Jadval yengil: kichik kulrang ustun sarlavhalari, qatorlar orasida ingichka chiziq, holat matni ("Completed"), o'ngga tekislangan summa.
- BARPO: `stock/StockPage.tsx` (harakatlar), `finance/DocumentsTable.tsx`.
- Moslashuv: `DataTable` + `SearchInput` + toolbar'da Filter/Export `Button`. Holat uchun `Badge`. Summalar o'ngga, decimal string, UZS. To'liq mos.

### 2.2 Glide CRM contacts list
- Havola: https://www.saasframe.io/examples/glide-crm-contacts-list (teg: Table, List View)
- Tasvir: jadval o'rniga ro'yxat: avatar, ism, ostida lavozim va kompaniya, o'ngda kichik hisoblagich va chevron. Tepada qidiruv, umumiy son ("38 contacts"), o'ngda asosiy "New contact" tugmasi.
- BARPO: `employees/EmployeesPage.tsx`, `projects/ProjectsPage.tsx`.
- Moslashuv: `Avatar` + ikki qatorli matn (asosiy/muted), `SearchInput`, PageHeader'da asosiy `Button`. Qisqa ro'yxatlar uchun mos; EstimateEditor kabi Excel jadvaliga mos emas.

### 2.3 Ommaviy amallar (SaaS Interface teaser)
- Havola: https://saasinterface.com/components/bulk-actions/ (19 misol; Hotjar, TheyDo, Opollo, Dropbox nomlari ko'rinadi). Galereya yopiq.
- Teaser'dan ko'ringan: qatorlar belgilanganda jadval pastida qora panel chiqadi ("N tanlandi" + amallar + yopish); tanlangan qatorlar rangli fon bilan ajraladi.
- BARPO: `stock/StockPage.tsx`, `finance/DocumentsTable.tsx`, `work/TasksPage.tsx`.
- Moslashuv: `DataTable`ga checkbox ustuni + pastki sticky panel (`--brand-900` fon, oq matn, `Button`), tanlangan qator `--brand-50`. Faqat shu panel yangi CSS bo'ladi. Aniq misol sahifasi ochilmadi.

Topilmadi: ustunlarni sozlash (column visibility) bo'yicha ochiq misol. Saralash alohida misol sifatida ko'rilmadi. saasframe /patterns/bulk-actions 0 misol ko'rsatdi.

## 3. Bo'sh holatlar

### 3.1 Lightspark Cards Empty State
- Havola: https://www.saasframe.io/examples/lightspark-cards-empty-state
- Tasvir: sahifa sarlavhasi va asosiy amal tugmasi ("Issue card") saqlanadi, filtr joyida; markazda ikki qator matn: nima yo'q va birinchi qadam. Ikonka/rasm yo'q.
- BARPO: `files/FilesPage.tsx`, `integrations/IntegrationsPage.tsx`, yangi kompaniyada `projects/ProjectsPage.tsx`.
- Moslashuv: `EmptyState` (sarlavha + tavsif + `Button`). Sarlavhadagi asosiy tugma saqlanadi. Mos.

### 3.2 Evervault Empty activity log
- Havola: https://www.saasframe.io/examples/evervault-empty-activity-log
- Tasvir: qidiruv va davr tanlagichi ("Last 7 days") ko'rinib turadi; bo'sh blokda "tanlangan davr uchun yozuv yo'q, boshqa davrni tanlang". Filtr natijasi bo'sh holati ma'lumot umuman yo'q holatidan farqlanadi.
- BARPO: `audit/AuditPage.tsx`, `notifications/NotificationsPage.tsx`, filtrli ro'yxatlar.
- Moslashuv: `EmptyState`da ikki variant: "ma'lumot yo'q" va "filtr natija bermadi" (+ filtrni tozalash). Matnlar uz/ru locale'larga qo'shiladi.

## 4. Onboarding va "birinchi qadamlar"

### 4.1 Customer.io Create First Campaign
- Havola: https://www.saasframe.io/examples/customer-io-create-first-campaign (teg: Progress Indicator, Stepper, Wizard, Task Management; 10 ekranli flow Pro ortida)
- Tasvir: chapda "Your Setup List" paneli: sarlavha, qisqa tavsif, segmentli progress chizig'i, ostida bajarilgan (yashil belgi) va joriy qadamlar, ba'zilarida ichki kichik qadamlar. O'ngda joriy qadam kontenti (kartalar bilan tanlov).
- BARPO: onboarding hozircha yo'q; `dashboard/TenantDashboard.tsx` da yangi kompaniya uchun "Boshlash" bloki (kompaniya sozlash, obyekt qo'shish, xodim taklif qilish, smeta import).
- Moslashuv: karta ko'rinishidagi blok; qadam belgisi: bajarildi `--success`, joriy `--brand-600`; progress `--brand-500`; `Button`. Bajarilganlik serverdagi haqiqiy holatdan hisoblanadi (demo emas). Segmentli progress oddiy CSS flex.

### 4.2 Superlist Checklist
- Havola: https://www.saasframe.io/examples/superlist-checklist (teg: Checkbox, Side Panel, Onboarding Checklist, Task Management, Progress Indicator)
- Tasvir: chapda sidebar, o'rtada vazifalar ro'yxati (tepada segment tablar: Tasks for me / Others / Upcoming / Done), o'ngda tanlangan vazifaning yon paneli (subtasklar, izoh maydoni, "Complete" tugmasi). Tanlangan qator chetida rangli chiziq.
- BARPO: `work/TasksPage.tsx` (jadval + yon panel tafsilot), yengil checklist uchun onboarding bloki.
- Moslashuv: `Segmented`/`Tabs` + ro'yxat + o'ng panel (Modal o'rniga drawer; faqat CSS). Aksent `--brand-600`.

Topilmadi: saasinterface onboarding galereyasi yopiq.

## 5. Sozlamalar sahifalari

### 5.1 Lightspark Account & Security Settings
- Havola: https://www.saasframe.io/examples/lightspark-account-security-settings (teg: Settings & Preferences, MFA, SSO, Table, Roles & Permissions)
- Tasvir: bitta tor markaziy ustun; bo'lim sarlavhalari kichik kulrang matn (Account, Two-factor authentication, Team, Security). Har bo'lim oq karta; qatorlar: chapda nom + tavsif, o'ngda kichik tugma (Update / Set up / Configure). "Team" kartasida a'zolar jadvali va "Invite member".
- BARPO: `settings/SettingsPage.tsx` (kompaniya, Telegram toifalari), `billing/TenantBillingPage.tsx`.
- Moslashuv: `Field`/`Switch` qatorlari, bo'lim sarlavhasi muted matn, karta surface + `--border`, radius 10px. Telegram toifalari: har qatorda `Switch`. To'liq mos.

### 5.2 Context.dev Billing Settings
- Havola: https://www.saasframe.io/examples/context-dev-billing-settings (Settings sahifasi, tablar: Personal / Organization / Billing)
- Tasvir: markazda sarlavha + tavsif, tagida tablar; tab ichida bitta karta: reja nomi, narx, o'ngda "Upgrade", ostida kredit sarfi (qolgan/jami, progress chizig'i, yangilanish sanasi).
- BARPO: `settings/SettingsPage.tsx` (tablar), `billing/TenantBillingPage.tsx`.
- Moslashuv: `Tabs` + karta + progress (`--brand-500`). Mos.

## 6. Billing / obuna

### 6.1 Hugging Face Billing overview
- Havola: https://www.saasframe.io/examples/hugging-face-billing-overview (teg: Billing & Subscription, Usage Indicator, Invoice, Upgrade Prompt)
- Tasvir: chapda sozlamalar sidebar'i, o'ngda "Billing" sarlavhasi va tablar (Overview / Payment information / Subscriptions / Invoices). Overview: chap kartada kredit balansi, joriy davr sarfi va tugash sanasi; markazda resurslar bo'yicha sarf chiziqlari (ishlatilgan/limit); tepada yashil upgrade banneri. Ma'lumot bo'lmasa "No usage" bloki.
- BARPO: `billing/TenantBillingPage.tsx` (obuna, invoyslar, kredit).
- Moslashuv: `Tabs` (Umumiy / Invoyslar), `Stat` (balans, davr oxiri), limit chiziqlari (foydalanuvchilar, obyektlar), upgrade uchun `Alert` (info), invoyslar `DataTable`. Pul UZS, decimal string.

### 6.2 EigenPal Billing plans and upgrade
- Havola: https://www.saasframe.io/examples/eigenpal-billing-plans-and-upgrade (teg: Billing & Subscription, Upgrade Prompt, Card, Usage Indicator). Faqat metadata ko'rildi; tavsif yo'q.
- BARPO: `platform/pages.tsx` (tariflar), `billing/TenantBillingPage.tsx`.

Yopiq: saasinterface.com/pages/billing-plan/ (55 misol; Supabase, Mailchimp, Buildkite nomlari ko'rinadi). saasframe /categories/billing 404.

## 7. Ruxsat matritsasi va jamoa a'zolari

### 7.1 Tines Workspace Members
- Havola: https://www.saasframe.io/examples/tines-workspace-members (teg: Table, Search, Filter, Tabs, Roles & Permissions)
- Tasvir: chapda sozlamalar sidebar'i (Members, Groups, Roles, SSO, Audit logs ...); o'ngda oq karta: tablar (Members / Service accounts), qidiruv va dumaloq "+" tugmasi; jadval: nom (avatar, email, rol belgisi), qo'shilgan sana, oxirgi faollik, guruhlar (chiplar).
- BARPO: `employees/EmployeesPage.tsx`, `permissions/RolePermissionsPage.tsx`.
- Moslashuv: `Avatar`, `Badge` (rol), `Tabs`, `SearchInput`, `DataTable`. Guruhlar o'rniga rol/obyekt chiplari.

### 7.2 Tines Member Access Permissions
- Havola: https://www.saasframe.io/examples/tines-member-access-permissions (teg: Modal, Roles & Permissions, Search, List View, Tabs)
- Tasvir: a'zo bo'yicha modal: tablar (Membership / Access); "Access" ichida qidiruv va resurslar ro'yxati, har qatorda resurs nomi va unga biriktirilgan rol belgilari (ba'zilari tanlanadigan), pastda "Done".
- BARPO: `permissions/RolePermissionsPage.tsx`, xodimning obyektlarga kirishi (`projects/ProjectDetailPage.tsx`).
- Moslashuv: `Modal` + `Tabs` + `Select` har qatorda. Rol x sahifa x CRUD matritsasi uchun to'g'ridan-to'g'ri misol topilmadi; BARPO uchun jadval ichida `Switch`/checkbox katakchalar mantiqiyroq.

### 7.3 Dust People & Security
- Havola: https://www.saasframe.io/examples/dust-people-security (teg: Invite Team Members, Avatar Group, Roles & Permissions, Table). Faqat metadata ko'rildi.
- Ochilmagan ro'yxatlar: https://www.saasframe.io/patterns/roles-permissions (38 misol), https://www.saasframe.io/categories/invite-team-members (103 misol).

## 8. Bildirishnomalar

Topilmadi: saasframe.io da `/categories/notifications` va `/patterns/notifications` 404 berdi ("Inbox" kategoriyasi bor, ochilmadi). saasinterface.com'da bildirishnoma kategoriyasi yo'q ("Activity Feed" bor, yopiq). Eng yaqin ilhom: Evervault activity log (3.2) va Baremetrics "Live Stream" (1.1), ya'ni vaqt belgisi bilan hodisalar lentasi, `notifications/NotificationsPage.tsx` uchun.

## Ko'rilgan sahifalar
saasframe.io kategoriyalar: dashboard, table, empty-state, checklist, settings, team-members, user-onboarding, plans, usage, invite-team-members; patterns: roles-permissions, bulk-actions, usage-indicator. Misollar: baremetrics-dashboard, mercury-dashboard (metadata), lightspark-transaction-history, glide-crm-contacts-list, lightspark-cards-empty-state, evervault-empty-activity-log, superlist-checklist, customer-io-create-first-campaign, lightspark-account-security-settings, context-dev-billing-settings, tines-workspace-members, tines-member-access-permissions, dust-people-security (metadata), hugging-face-billing-overview, context-dev-usage-history (metadata), height-details (metadata), eigenpal-billing-plans-and-upgrade (metadata).
saasinterface.com: bosh sahifa, /components/bulk-actions/, /pages/billing-plan/ (marketing sahifalari).

## Ochilmaganlar / sabab
- saasinterface.com galereyasi: obuna ortida (yopiq), faqat teaser.
- saasframe: similar examples, flow ekranlari, Figma: Pro ortida (yopiq).
- /categories/billing, /categories/notifications, /patterns/notifications: 404.
- Mercury, EigenPal, Dust, Context.dev usage, Height: skrinshot olingan, lekin ko'zdan kechirilmadi.

## Skrinshotlar (docs/research/screenshots/)
gallery-dashboard-mercury, gallery-dashboard-baremetrics, gallery-table-lightspark, gallery-table-glide, gallery-empty-lightspark, gallery-empty-evervault, gallery-checklist-superlist, gallery-onboarding-customerio, gallery-settings-lightspark, gallery-billing-contextdev, gallery-team-tines, gallery-team-dust, gallery-perm-tines, gallery-billing-hf, gallery-usage-contextdev, gallery-bulk-height, gallery-plans-eigenpal, gallery-si-bulk, gallery-si-billing, gallery-index-billing (404 sahifa, ahamiyatsiz).
