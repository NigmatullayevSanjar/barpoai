# BARPO AI — Claude Code Project Context

> Ushbu fayl BARPO AI loyihasini Claude Code'ga tushuntirish uchun asosiy loyiha konteksti hisoblanadi.
> Claude Code kod yozishdan oldin ushbu hujjatdagi biznes-logika, rollar, modullar va arxitektura talablarini hisobga olishi kerak.

---

# 1. Loyiha haqida

## 1.1. Loyiha nomi

**BARPO AI**

BARPO AI — qurilish kompaniyalari va qurilish obyektlarini boshqarish uchun mo‘ljallangan **B2B SaaS Construction ERP platforma**.

Platformaning asosiy maqsadi:

- qurilish obyektlarini markazlashgan holda boshqarish;
- smeta va budjetni nazorat qilish;
- materiallar va omborni boshqarish;
- ishchilar va brigadalarni boshqarish;
- vazifalar va bajarilish muddatlarini nazorat qilish;
- moliyaviy ma'lumotlarni yuritish;
- hisobotlar olish;
- rahbar uchun qurilishning umumiy holatini bitta dashboard orqali ko‘rsatish;
- kompaniyalarga platformani obuna/ijara modeli orqali taqdim qilish.

BARPO AI oddiy task-management dasturi emas. U qurilish korxonasining asosiy operatsion jarayonlarini bir tizimga birlashtiradigan ERP/SaaS platforma bo‘ladi.

---

# 2. Asosiy biznes modeli

BARPO AI ikki darajali tizim sifatida ishlaydi.

## 2.1. SaaS platforma darajasi

Bu BARPO AI platformasining o‘zini boshqaradi.

Rollar:

1. Super Admin
2. Platforma egasi
3. Texnik yordam xodimi

Ular platformaning ichki boshqaruvi bilan shug‘ullanadi.

## 2.2. Mijoz kompaniya darajasi

Platformani sotib olgan yoki obuna bo‘lgan qurilish kompaniyasi o‘zining alohida tenant/workspace'iga ega bo‘ladi.

Rollar:

1. Mijoz Admini
2. Prorab
3. Brigadir
4. Ombor mudiri / Zavsklad
5. Finansist
6. Buxgalter
7. Menejer

Har bir mijoz kompaniyasining ma'lumotlari boshqa kompaniyalardan qat'iy ajratiladi.

---

# 3. Multi-tenant SaaS logikasi

BARPO AI — **multi-tenant SaaS**.

Masalan:

- `Company A`
- `Company B`
- `Company C`

uchta alohida mijoz bo‘lishi mumkin.

Ularning:

- obyektlari;
- smetalari;
- materiallari;
- ishchilari;
- vazifalari;
- moliyaviy ma'lumotlari;
- hisobotlari;
- foydalanuvchilari

bir-biridan ajratilgan bo‘lishi kerak.

## Muhim qoida

Bir kompaniyaning foydalanuvchisi boshqa kompaniyaning ma'lumotlarini ko‘ra olmaydi.

Backend barcha querylarda tenant/company scope'ni majburiy nazorat qilishi kerak.

---

# 4. Platforma egasi va mijoz kompaniya o‘rtasidagi asosiy workflow

## 4.1. Yangi mijoz yaratish

Platforma egasi:

1. BARPO AI admin paneliga kiradi.
2. Yangi mijoz kompaniya yaratadi.
3. Kompaniya nomini kiritadi.
4. Tarif/plan tanlaydi:
   - Standard
   - Max
   - boshqa kelajakdagi tariflar
5. Individual registration link yaratadi.
6. Linkni mijozga beradi.

## 4.2. Mijoz ro‘yxatdan o'tishi

Mijoz:

1. Individual linkni ochadi.
2. Kompaniya ma'lumotlarini tasdiqlaydi.
3. Mijoz Admin akkauntini yaratadi.
4. Login/email va password o‘rnatadi.
5. Platformaga kiradi.

Registration link:

- ma'lum bir customer/tenant bilan bog‘langan;
- qayta ishlatish qoidasi biznes talabiga bog‘liq;
- bloklangan yoki expired bo‘lsa ishlamasligi kerak.

## 4.3. Free trial

Yangi mijoz uchun:

**14 kunlik bepul sinov muddati**

bo‘lishi kerak.

Trial tugagandan keyin:

- to‘lov kutilayotgan holat;
- aktiv obuna;
- qarzdorlik;
- bloklangan

kabi subscription statuslar mavjud bo‘ladi.

## 4.4. To‘lov

Platforma egasi mijozning:

- oylik to‘lovlarini;
- to‘lov tarixini;
- qarzdorligini;
- subscription holatini

ko‘ra oladi.

Agar mijoz to‘lamasa:

1. customer status `overdue` bo‘ladi;
2. platforma egasi uni bloklashi mumkin;
3. customer registration/login/access qoidalar asosida cheklanadi;
4. bloklangan tenant foydalanuvchilari platformaning protected qismlaridan foydalana olmaydi.

---

# 5. Rollar

# 5.1. Super Admin

Super Admin — BARPO AI tizimining eng yuqori texnik darajadagi administratori.

Asosiy vazifalari:

- platformani boshqarish;
- platforma egalarini boshqarish;
- tizim konfiguratsiyasi;
- global statistikalar;
- texnik nazorat;
- audit/loglar;
- permission va role konfiguratsiyasi;
- system-level sozlamalar.

Super Admin barcha tenantlardan yuqori darajada ishlaydi.

---

# 5.2. Platforma egasi

Platforma egasi — BARPO AI SaaS biznesini boshqaruvchi asosiy biznes administrator.

U quyidagilarni boshqaradi:

- mijoz kompaniyalar;
- mijoz adminlari;
- subscriptionlar;
- tariflar;
- to‘lovlar;
- qarzdorlar;
- registration linklar;
- customer status;
- platforma daromadi;
- customer statistikasi.

Platforma egasi customer tenant ichidagi qurilish operatsiyalarini boshqarmaydi.

---

# 5.3. Texnik yordam xodimi

Texnik support:

- foydalanuvchilar muammolarini ko‘rish;
- customer statusni tekshirish;
- texnik ticketlar bilan ishlash;
- login/access muammolarini aniqlash;
- tizim xatolarini kuzatish;
- kerakli texnik ma'lumotlarni ko‘rish

huquqlariga ega bo‘ladi.

Unga biznes/moliya ma'lumotlarini o‘zgartirish huquqi default holatda berilmasin.

---

# 5.4. Mijoz Admini

Mijoz Admini — platformadan foydalanuvchi qurilish kompaniyasining asosiy administratori.

U:

- kompaniya profilini boshqaradi;
- foydalanuvchilar yaratadi;
- rollar beradi;
- obyektlar yaratadi;
- obyektlar bo‘yicha access boshqaradi;
- kompaniya ichidagi modullarni boshqaradi;
- umumiy dashboardni ko‘radi;
- asosiy ERP ma'lumotlarini nazorat qiladi.

Mijoz Admini faqat o‘z tenantiga tegishli ma'lumotlar bilan ishlaydi.

---

# 5.5. Prorab

Prorab qurilish jarayonining operatsion rahbari.

Asosiy vazifalar:

- obyektlarni kuzatish;
- ishlarni rejalashtirish;
- vazifalarni yaratish/taqsimlash;
- brigadalarni boshqarish;
- bajarilish holatini nazorat qilish;
- muddatlarni kuzatish;
- material ehtiyojlarini ko‘rish;
- progress kiritish;
- hisobotlarni ko‘rish.

---

# 5.6. Brigadir

Brigadir:

- o‘z brigadasini boshqaradi;
- ishchilarni ko‘radi;
- topshiriqlarni oladi;
- topshiriq statusini o‘zgartiradi;
- bajarilgan ish haqida ma'lumot kiritadi;
- progress yuboradi;
- muammolarni bildiradi.

Brigadir barcha kompaniya ma'lumotlariga ega bo‘lmasligi kerak.

---

# 5.7. Ombor mudiri / Zavsklad

Asosiy vazifalar:

- materiallar;
- ombor;
- kirim;
- chiqim;
- qoldiq;
- material berish;
- material qaytarish;
- inventarizatsiya;
- material harakati.

Ombor mudiri moliyaviy yoki HR ma'lumotlarini ko‘rmasligi kerak, agar alohida permission berilmagan bo‘lsa.

---

# 5.8. Finansist

Finansist:

- xarajatlar;
- to‘lovlar;
- budjet;
- moliyaviy harakatlar;
- smeta qiymatlari;
- moliyaviy hisobotlar

bilan ishlaydi.

---

# 5.9. Buxgalter

Buxgalter:

- moliyaviy hujjatlar;
- xarajatlar;
- to‘lovlar;
- kontragentlar;
- hisob-kitoblar;
- buxgalteriya uchun kerakli ma'lumotlar

bilan ishlaydi.

Finansist va buxgalter rollari bir-biridan ajratilgan bo‘lishi mumkin.

---

# 5.10. Menejer

Menejer:

- obyektlar holatini;
- vazifalarni;
- mijoz/kontragent bilan bog‘liq ma'lumotlarni;
- umumiy project progressni;
- hisobotlarni

ko‘rishi va o‘z vakolatidagi ma'lumotlarni boshqarishi mumkin.

---

# 6. Frontend konsepsiyasi

BARPO AI frontend:

**Desktop-first B2B ERP dashboard**

bo‘lishi kerak.

Mobile app hozirgi scope'ga kirmaydi.

Responsive web kerak, lekin asosiy UX desktop/laptop uchun optimallashtiriladi.

---

# 7. Frontend dizayn

Asosiy visual identity:

- Burgundy / Bordoviy
- White
- Light gray
- Dark text
- Minimal accent colors

BARPO AI professional construction ERP sifatida ko‘rinishi kerak.

Dizayn:

- clean;
- modern;
- professional;
- enterprise;
- information-dense;
- foydalanishga qulay.

Juda ko‘p dekorativ elementlardan foydalanilmasin.

---

# 8. Frontend navigation

## SaaS Admin navigation

Super Admin / Platforma egasi uchun:

- Dashboard
- Mijozlar
- Mijoz Adminlari
- Subscriptionlar
- To‘lovlar
- Tariflar
- Registration Links
- Qarzdorlar
- Statistikalar
- Support
- Audit Logs
- Settings

Super Admin uchun qo‘shimcha:

- Platform Owners
- System Settings
- Global Users
- Permissions
- Technical Logs

---

# 9. Customer ERP navigation

Mijoz Admini va tenant ichidagi rollar uchun:

- Dashboard
- Obyektlar
- Smeta
- Budjet
- Vazifalar
- Ishlar / Progress
- Brigadalar
- Ishchilar
- Ombor
- Materiallar
- Xarajatlar
- To‘lovlar
- Kontragentlar
- Hisobotlar
- Bildirishnomalar
- Foydalanuvchilar
- Rollar va ruxsatlar
- Sozlamalar

Sidebar role permission asosida dinamik bo‘lishi kerak.

Foydalanuvchiga huquqi bo‘lmagan modul sidebar'da ko‘rsatilmasligi yoki disabled bo‘lishi mumkin.

---

# 10. Dashboard

Dashboard har bir rol uchun moslashtiriladi.

## Mijoz Admin Dashboard

Ko‘rsatkichlar:

- jami obyektlar;
- aktiv obyektlar;
- umumiy budjet;
- sarflangan mablag‘;
- qolgan budjet;
- umumiy material qiymati;
- bajarilgan vazifalar;
- kechikayotgan vazifalar;
- ishchilar soni;
- brigadalar;
- muammoli obyektlar.

## Prorab Dashboard

- aktiv obyektlar;
- bugungi vazifalar;
- kechikayotgan vazifalar;
- brigadalar;
- material ehtiyojlari;
- progress;
- muammolar.

## Ombor Dashboard

- jami materiallar;
- ombor qoldig‘i;
- kamayayotgan materiallar;
- bugungi kirim;
- bugungi chiqim;
- inventarizatsiya.

## Finansist Dashboard

- umumiy budjet;
- sarf;
- qolgan budjet;
- daromad;
- xarajat;
- to‘lovlar;
- qarzdorlik;
- moliyaviy progress.

---

# 11. Obyektlar moduli

Har bir qurilish obyekti:

- nomi;
- manzili;
- loyiha kodi;
- mijoz;
- boshlanish sanasi;
- tugash sanasi;
- status;
- loyiha rahbari;
- budjet;
- progress;
- obyektga biriktirilgan foydalanuvchilar

kabi ma'lumotlarga ega.

Statuslar misoli:

- Planning
- Active
- Paused
- Completed
- Archived

Obyekt ichida:

- Overview
- Smeta
- Budget
- Tasks
- Materials
- Warehouse
- Workers
- Teams
- Expenses
- Reports
- Documents

kabi bo‘limlar bo‘lishi mumkin.

---

# 12. Smeta moduli

Smeta BARPO AI ning asosiy modullaridan biridir.

Smeta oddiy card-list emas.

U **Excel-like ERP table** ko‘rinishida bo‘lishi kerak.

Misol ustunlar:

- №
- Ish/material nomi
- Kategoriya
- Birlik
- Miqdor
- Birlik narxi
- Material summasi
- Ish haqi
- Texnika
- Qo‘shimcha xarajat
- Jami
- Izoh

Hisoblash:

`Jami = Miqdor × Birlik narxi + qo‘shimcha xarajatlar`

Aniq biznes formula backendda markazlashtirilishi kerak.

Smeta:

- row qo‘shish;
- row edit;
- row delete;
- category;
- grouping;
- filtering;
- sorting;
- search;
- totals;
- export;
- import

kabi imkoniyatlarga ega bo‘lishi kerak.

Manager/Mijoz Admin smetani to‘g‘ridan-to‘g‘ri yaratishi mumkin.

Alohida "Draft / Approval" workflow hozirgi scope'da majburiy emas.

---

# 13. Budjet moduli

Budjet smeta bilan bog‘liq.

Tizim:

- rejalashtirilgan budjet;
- smeta qiymati;
- real xarajat;
- qolgan budjet;
- variance;
- category bo‘yicha xarajat

ni ko‘rsatishi kerak.

Masalan:

`Remaining Budget = Planned Budget - Actual Expenses`

`Variance = Planned Cost - Actual Cost`

Budjet va real xarajatlar dashboard va reportlarda ko‘rsatiladi.

---

# 14. Task Management

Vazifa:

- title;
- description;
- object;
- category;
- assignee;
- team;
- priority;
- start date;
- due date;
- status;
- progress;
- attachments;
- comments

ga ega.

Statuslar:

- TODO
- IN_PROGRESS
- BLOCKED
- COMPLETED
- CANCELLED

Priority:

- LOW
- MEDIUM
- HIGH
- URGENT

Kechikkan vazifalar avtomatik aniqlanishi kerak.

---

# 15. Ishlar va Progress

Qurilish progressini kuzatish kerak.

Masalan:

- Foundation — 100%
- Walls — 75%
- Roofing — 40%
- Electrical — 20%

Har bir ish uchun:

- planned quantity;
- completed quantity;
- unit;
- percentage;
- responsible team;
- date

bo‘lishi mumkin.

---

# 16. Brigadalar va ishchilar

Worker:

- ism;
- telefon;
- lavozim;
- brigade;
- object;
- status;
- hire date

kabi ma'lumotlarga ega.

Brigade:

- nom;
- brigadir;
- ishchilar;
- obyekt;
- specialty;
- status

kabi ma'lumotlarga ega.

---

# 17. Ombor va materiallar

Material entity:

- name;
- category;
- SKU/code;
- unit;
- current stock;
- minimum stock;
- purchase price;
- supplier;
- warehouse.

Material harakati:

- IN — kirim
- OUT — chiqim
- RETURN — qaytarish
- TRANSFER — ko‘chirish
- ADJUSTMENT — inventarizatsiya tuzatishi

Har bir stock movement audit qilinishi kerak.

Stock quantity manfiy bo‘lib ketmasligi kerak, agar biznes qoidasi bunga ruxsat bermasa.

---

# 18. Moliya

Finance moduli:

- income;
- expense;
- payment;
- debt;
- budget;
- financial category;
- contractor;
- payment status

bilan ishlaydi.

Har bir moliyaviy tranzaksiya:

- tenant;
- object;
- amount;
- currency;
- category;
- date;
- creator;
- description

bilan bog‘lanadi.

---

# 19. Hisobotlar

Reports:

- Obyekt hisoboti
- Smeta hisoboti
- Budjet hisoboti
- Material hisoboti
- Ombor hisoboti
- Task report
- Worker report
- Financial report
- Progress report

Filterlar:

- sana;
- obyekt;
- kategoriya;
- responsible person;
- status.

Export:

- Excel/CSV;
- PDF — keyingi bosqichda.

---

# 20. Role-Based Access Control

RBAC qat'iy ishlashi kerak.

Permission formatini quyidagicha tashkil qilish mumkin:

`module.action`

Misol:

- `projects.read`
- `projects.create`
- `projects.update`
- `projects.delete`
- `tasks.read`
- `tasks.create`
- `tasks.update`
- `tasks.delete`
- `materials.read`
- `materials.create`
- `materials.update`
- `materials.delete`
- `finance.read`
- `finance.create`
- `finance.update`
- `finance.delete`
- `reports.read`
- `users.read`
- `users.create`
- `users.update`
- `users.delete`

Backend permissionni tekshirishi shart.

Frontenddagi buttonni yashirishning o‘zi xavfsizlik hisoblanmaydi.

---

# 21. CRUD qoidasi

Har bir asosiy entity uchun:

- Create
- Read
- Update
- Delete

permission alohida bo‘lishi kerak.

Misol:

Prorab:

- Task: CRUD
- Project: Read/Update
- Material: Read
- Warehouse: Read
- Finance: Read limited
- Users: None

Ombor mudiri:

- Material: CRUD
- Warehouse: CRUD
- Tasks: Read
- Finance: limited Read
- Workers: Read
- Users: None

Mijoz Admin:

- barcha tenant modullarida keng huquq;
- user/role management;
- company settings.

Aniq permissionlar backendda konfiguratsiya qilinadigan bo‘lishi kerak.

---

# 22. Authentication

Authentication uchun:

- login;
- password;
- logout;
- refresh/session;
- password reset;
- email verification — kerak bo‘lsa;
- account status

bo‘lishi kerak.

User status:

- ACTIVE
- INACTIVE
- BLOCKED
- INVITED

Tenant status:

- TRIAL
- ACTIVE
- OVERDUE
- SUSPENDED
- CANCELLED

---

# 23. Security

Majburiy xavfsizlik qoidalari:

1. Tenant isolation.
2. RBAC.
3. Backend authorization.
4. Password hashing.
5. Secure session/token handling.
6. Rate limiting.
7. Input validation.
8. SQL injection protection.
9. XSS protection.
10. CSRF himoyasi — architecture talab qilsa.
11. Audit logs.
12. Sensitive data logging qilinmasin.
13. File upload validation.
14. Access denied holatlari aniq qaytarilsin.

---

# 24. Audit Log

Muhim o‘zgarishlar log qilinadi:

- kim;
- qachon;
- qaysi tenant;
- qaysi entity;
- qaysi action;
- old value;
- new value;
- IP/device metadata — kerak bo‘lsa.

Misol:

`User X updated Project Y budget from 100,000,000 to 120,000,000.`

Audit logni oddiy user o‘zgartira olmasligi kerak.

---

# 25. Frontend texnologik talablar

Agar loyiha stacki oldindan belgilanmagan bo‘lsa, frontend uchun tavsiya:

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui yoki unga mos reusable UI layer
- TanStack Query
- React Hook Form
- Zod
- Lucide icons

Frontend komponentlari reusable bo‘lishi kerak.

Masalan:

- DataTable
- Modal
- Drawer
- Form
- Select
- DatePicker
- StatusBadge
- PermissionGuard
- EmptyState
- LoadingState
- ErrorState
- Pagination
- Search
- FilterBar

---

# 26. Frontend architecture

Tavsiya:

```text
src/
  app/
  components/
    ui/
    layout/
    tables/
    forms/
    charts/
  features/
    auth/
    dashboard/
    tenants/
    projects/
    estimates/
    budgets/
    tasks/
    workers/
    teams/
    warehouse/
    materials/
    finance/
    reports/
    users/
    roles/
  lib/
    api/
    auth/
    permissions/
    utils/
  hooks/
  types/
```

Feature-based architecture afzal.

---

# 27. API architecture

Frontend backend bilan REST API yoki aniq belgilangan API layer orqali ishlaydi.

API taxminan:

```text
/api/auth
/api/users
/api/roles
/api/permissions
/api/tenants
/api/projects
/api/estimates
/api/budgets
/api/tasks
/api/workers
/api/teams
/api/materials
/api/warehouses
/api/stock-movements
/api/expenses
/api/payments
/api/reports
/api/notifications
/api/audit-logs
```

Har bir endpoint:

- authentication;
- tenant scope;
- authorization;
- validation

dan o‘tishi kerak.

---

# 28. Database konsepsiyasi

Asosiy entitylar:

```text
User
Role
Permission
RolePermission
Tenant
Subscription
Plan
RegistrationLink
Payment
Project
ProjectMember
Estimate
EstimateItem
Budget
Task
TaskComment
TaskAttachment
Worker
Team
Warehouse
Material
StockMovement
Expense
FinancialTransaction
Contractor
Report
Notification
AuditLog
```

Tenant bilan bog‘liq entitylarning ko‘pchiligida:

```text
tenant_id
```

bo‘lishi kerak.

Object/project bilan bog‘liq entitylarda:

```text
project_id
```

bo‘lishi mumkin.

---

# 29. Tenant isolation

Backend query misol konsepsiyasi:

```text
SELECT *
FROM projects
WHERE tenant_id = currentUser.tenantId;
```

Hech qachon:

```text
SELECT * FROM projects;
```

kabi tenant scope'siz query ishlatilmasin.

Super Admin va platform-level role uchun alohida global scope ishlatiladi.

---

# 30. Frontend UX qoidalari

ERP tizimida foydalanuvchi ko‘p ma'lumot bilan ishlaydi.

Shuning uchun:

- table'lar qulay;
- filterlar tez ishlashi;
- search;
- pagination;
- sorting;
- bulk actions;
- keyboard-friendly interaction;
- confirmation dialog;
- unsaved changes warning;
- loading skeleton;
- error handling;
- toast notifications

bo‘lishi kerak.

Delete action uchun confirmation kerak.

Masalan:

> "Ushbu obyektni o‘chirishni xohlaysizmi?"

---

# 31. Empty states

Har bir modulda empty state bo‘lishi kerak.

Misol:

> Hozircha obyektlar mavjud emas.
> Birinchi obyektni yaratish uchun "Obyekt qo‘shish" tugmasini bosing.

---

# 32. Error states

Backend errorlari user-friendly ko‘rsatiladi.

Masalan:

- `403` → Sizda bu amal uchun ruxsat yo‘q.
- `404` → Ma'lumot topilmadi.
- `409` → Ma'lumot boshqa jarayon bilan bog‘liq.
- `422` → Kiritilgan ma'lumot noto‘g‘ri.
- `500` → Serverda xatolik yuz berdi.

Texnik stack trace userga ko‘rsatilmasin.

---

# 33. AI funksiyalari

BARPO AI nomidagi "AI" qismi kelajakda quyidagi imkoniyatlarni qo‘llashi mumkin:

- smeta tahlili;
- budget anomaly detection;
- xarajatlarni tahlil qilish;
- material sarfini prognoz qilish;
- kechikish xavfini aniqlash;
- project progress analysis;
- rahbarga AI recommendations;
- hisobotni avtomatik qisqartirish;
- natural-language query.

Masalan:

> "Qaysi obyektlarda budjetdan ortiqcha xarajat qilish xavfi bor?"

AI tizim ma'lumotlarni tahlil qilib javob beradi.

AI funksiyalari core ERP CRUD logikasini buzmasligi kerak.

---

# 34. Notifications

Notification turlari:

- task assigned;
- task overdue;
- material low stock;
- payment overdue;
- project deadline approaching;
- budget exceeded;
- report ready;
- system notification.

Notification:

- user;
- type;
- title;
- message;
- read/unread;
- created_at

bilan bog‘liq.

---

# 35. SaaS Dashboard statistikasi

Platforma egasi uchun:

- jami mijozlar;
- aktiv mijozlar;
- trial mijozlar;
- qarzdorlar;
- bloklanganlar;
- oylik revenue;
- subscription revenue;
- plan distribution;
- yangi mijozlar;
- churn

ko‘rsatkichlari bo‘lishi mumkin.

Moliyaviy statistika faqat haqiqiy payment records asosida hisoblanishi kerak.

---

# 36. Registration Link

Individual customer registration link misol:

```text
/register/{token}
```

Token:

- random;
- yetarlicha uzun;
- taxmin qilib bo‘lmaydigan;
- expiry;
- active/inactive status

ga ega bo‘lishi kerak.

Registration link ma'lum tenant/customer invitation bilan bog‘langan bo‘ladi.

---

# 37. Subscription lifecycle

Misol:

```text
TRIAL
  ↓
ACTIVE
  ↓
PAYMENT_DUE
  ↓
OVERDUE
  ↓
SUSPENDED
  ↓
CANCELLED
```

Mijoz to‘lov qilsa:

```text
OVERDUE → ACTIVE
```

Platforma egasi qo‘lda ham status boshqarishi mumkin, lekin barcha o‘zgarishlar audit qilinadi.

---

# 38. Data integrity

Muhim biznes qoidalari:

- o‘chirilgan projectga bog‘liq critical data yo‘qolib ketmasligi kerak;
- imkon qadar soft delete ishlatiladi;
- financial records oddiy delete orqali yo‘q qilinmasin;
- stock movement history o‘zgarmas tarix sifatida saqlansin;
- audit log o‘zgartirilmasin;
- completed task tarixini buzmaslik kerak;
- tenant_id hech qachon user inputdan ko‘r-ko‘rona olinmasin.

---

# 39. Soft delete

Critical entitylar uchun:

```text
deleted_at
```

ishlatish mumkin.

Masalan:

- User
- Project
- Material
- Worker
- Team

Financial/audit records uchun delete o‘rniga reversal/correction workflow afzal.

---

# 40. Development principles

Claude Code quyidagi qoidalarga amal qilishi kerak:

1. Avval mavjud project structure'ni tekshir.
2. Mavjud kodni sababsiz qayta yozma.
3. Reusable component yarat.
4. Duplicate code yozma.
5. TypeScript strict typing ishlat.
6. `any` ni imkon qadar ishlatma.
7. API validation qo‘sh.
8. Backend authorizationni unutma.
9. Tenant isolationni har doim tekshir.
10. Frontend permission faqat UX uchun; security backendda bo‘ladi.
11. Migrationlarni xavfsiz yoz.
12. Breaking change bo‘lsa oldindan tushuntir.
13. Test yozish imkoniyatini saqla.
14. Error handlingni to‘liq qil.
15. Loading/empty/error statesni unutma.
16. UI mavjud design systemdan chetga chiqmasin.
17. Mobile app yaratma — hozirgi scope web ERP.
18. AI feature qo‘shishdan oldin core ERP logicni to‘liq va barqaror qil.

---

# 41. Frontend sahifalarining minimal ro‘yxati

## Public

```text
/
 /login
 /register/[token]
 /forgot-password
 /reset-password
```

## SaaS Admin

```text
/admin
/admin/customers
/admin/customers/[id]
/admin/customer-admins
/admin/subscriptions
/admin/payments
/admin/plans
/admin/registration-links
/admin/debtors
/admin/reports
/admin/support
/admin/audit-logs
/admin/settings
```

## Super Admin

```text
/super-admin
/super-admin/platform-owners
/super-admin/users
/super-admin/permissions
/super-admin/system-settings
/super-admin/logs
```

## Customer ERP

```text
/app
/app/projects
/app/projects/[id]
/app/estimates
/app/budgets
/app/tasks
/app/workers
/app/teams
/app/materials
/app/warehouses
/app/stock-movements
/app/expenses
/app/payments
/app/contractors
/app/reports
/app/notifications
/app/users
/app/roles
/app/settings
```

---

# 42. UX: role switching

Agar Mijoz Admin bir nechta permission/rolega ega bo‘lsa, tizim kerak bo‘lsa role context yoki permission context bilan ishlashi mumkin.

Lekin frontendda oddiygina role nomini almashtirish orqali authorization bypass qilish mumkin emas.

Haqiqiy permission backend tomonidan aniqlanadi.

---

# 43. Frontend state

Server state uchun:

- TanStack Query yoki equivalent.

Local UI state uchun:

- React state;
- Context;
- Zustand — kerak bo‘lsa.

Global state'ga hamma narsani tiqishtirmaslik kerak.

---

# 44. Forms

Formlar:

- React Hook Form;
- Zod validation

kabi yondashuv bilan tashkil qilinishi mumkin.

Validation:

Frontend + Backend

ikkalasida ham bo‘lishi kerak.

---

# 45. Table komponenti

BARPO AI ERP uchun kuchli reusable DataTable juda muhim.

Talablar:

- pagination;
- sorting;
- filtering;
- search;
- column visibility;
- row selection;
- bulk action;
- responsive horizontal scroll;
- empty state;
- loading state;
- server-side pagination;
- server-side filtering.

Smeta table esa bundan ham kengroq Excel-like interactionga ega bo‘lishi mumkin.

---

# 46. Muhim UX scenario

## Scenario 1 — Platforma egasi yangi mijoz qo‘shadi

```text
Platforma egasi
→ Mijozlar
→ Yangi mijoz
→ Kompaniya ma'lumotlari
→ Plan tanlash
→ Trial/Subscription
→ Registration link yaratish
→ Linkni mijozga yuborish
```

## Scenario 2 — Mijoz onboarding

```text
Registration link
→ Register
→ Mijoz Admin account
→ Company workspace
→ Onboarding
→ Birinchi obyekt
→ Smeta
→ Team
→ Dashboard
```

## Scenario 3 — Qurilish jarayoni

```text
Project
→ Estimate
→ Budget
→ Tasks
→ Teams
→ Materials
→ Warehouse
→ Expenses
→ Progress
→ Reports
```

## Scenario 4 — Material

```text
Material requirement
→ Warehouse request
→ Stock check
→ Material OUT
→ Task/Project consumption
→ Stock update
```

## Scenario 5 — Budget control

```text
Estimate
→ Planned budget
→ Actual expense
→ Variance
→ Alert
→ Report
```

---

# 47. Claude Code uchun ish tartibi

Claude Code yangi feature yaratishdan oldin:

### Step 1
Project structure'ni tekshir.

### Step 2
Package manager va frameworkni aniqlash.

### Step 3
Existing components/design systemni tekshir.

### Step 4
Existing API/backend architecture'ni tekshir.

### Step 5
Database schema/migrationsni tekshir.

### Step 6
Feature qaysi rolelarga tegishli ekanini aniqlash.

### Step 7
Permissionlarni aniqlash.

### Step 8
Backend logic.

### Step 9
Frontend UI.

### Step 10
Loading/error/empty states.

### Step 11
Test/build/lint.

### Step 12
Natijani qisqa va aniq tushuntir.

---

# 48. Definition of Done

Feature "tayyor" deb hisoblanishi uchun:

- UI mavjud;
- backend endpoint mavjud;
- validation mavjud;
- authorization mavjud;
- tenant isolation mavjud;
- database migration mavjud;
- loading state mavjud;
- error state mavjud;
- empty state mavjud;
- CRUD kerak bo‘lsa to‘liq;
- audit kerak bo‘lsa mavjud;
- build muvaffaqiyatli;
- lint/test xatolari hal qilingan.

---

# 49. Eng muhim prinsip

BARPO AI quyidagi uch qatlamni qat'iy ajratishi kerak:

```text
SaaS Platform
    ↓
Tenant / Customer Company
    ↓
Construction ERP
```

### SaaS Platform

- Super Admin
- Platforma egasi
- Texnik yordam
- Subscription
- Payment
- Customer management

### Tenant

- Mijoz kompaniyasi
- Mijoz Admini
- Users
- Roles
- Company settings

### Construction ERP

- Projects
- Estimates
- Budget
- Tasks
- Workers
- Teams
- Warehouse
- Materials
- Finance
- Reports

Bu uch qatlamni aralashtirib yubormaslik kerak.

---

# 50. Yakuniy loyiha vizioni

BARPO AI — qurilish kompaniyalari uchun:

**"Qurilishning pulini, materialini, odamlarini, vazifalarini va obyektlarini bitta tizimda nazorat qilish"**

platformasi.

Asosiy maqsad:

> Rahbar istalgan vaqtda "Qaysi obyekt qanday holatda?", "Qancha pul sarflandi?", "Qancha budjet qoldi?", "Qaysi material yetishmayapti?", "Qaysi ish kechikmoqda?", "Qaysi brigada ishlayapti?" kabi savollarga tez javob olishi kerak.

BARPO AI ning frontend'i shu ma'lumotlarni professional, sodda va tez tushuniladigan ERP dashboardlar orqali ko‘rsatadi.

Backend esa:

- xavfsiz;
- multi-tenant;
- RBAC;
- audit qilinadigan;
- scalable;
- API-first

arxitekturaga ega bo‘lishi kerak.

---

# 51. Claude Code uchun qisqa instruktsiya

Claude Code:

> You are working on BARPO AI, a multi-tenant construction ERP SaaS platform.
>
> Before implementing anything, understand the architecture in this document.
>
> Do not mix SaaS-level administration with customer construction ERP logic.
>
> Always enforce tenant isolation and backend authorization.
>
> Build reusable, production-ready components.
>
> Do not implement only the visual frontend when a feature requires backend/database logic.
>
> Do not create mobile app screens in the current scope.
>
> Preserve the existing BARPO AI design language: professional enterprise UI, burgundy/white visual identity, clean layouts, dense but usable ERP tables.
>
> When modifying existing code, inspect the current implementation first and make the smallest safe change.
>
> After implementation, run appropriate lint/typecheck/test/build commands and report any remaining issues.
