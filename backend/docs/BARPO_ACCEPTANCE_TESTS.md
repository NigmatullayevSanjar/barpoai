# BARPO AI — Qabul mezonlari va testlar

`npm test` sof hisob/parol/DTO testlari. `npm run test:integration` haqiqiy Docker PostgreSQL 17 + NOSUPERUSER/NOBYPASSRLS runtime rolida HTTP injection va concurrency testlarini bajaradi. Oxirgi real bajarilgan natija: [verification.json](verification.json). Quyidagi barcha dizayn ssenariylari avtomatlashtirilgan deb qabul qilinmasin; real natijadagi tekshiruvlar alohida qayd etiladi.

| Ssenariy | Kutilgan natija |
|---|---|
| 0.10 + 0.20 | string `0.30` |
| Qo‘lda 10 birlik; norma 2.5 × 10 va 4% loss | 10.000000 yoki 26.000000 |
| Reja 0, fakt 8 | percent=null |
| JSON pul number yoki `1e6` | 400 validation |
| Invite preview 2 marta | token sarflanmaydi |
| Parallel signup bir invite | 1 admin/trial, ikkinchisi 410 |
| Bloklangan invite | preview/signup ishlamaydi |
| Employee boshlang‘ich parol | faqat me/logout/password |
| Role/deactivate/password change | oldingi sessiya rad etiladi |
| Tenant A → Tenant B project/material FK | API 404 yoki FK 409; tenant data chiqmaydi |
| RLS SET LOCALsiz | tenant operatsion jadvallaridan 0 qator |
| Rol uchun create=true, update=false | create 200, update 403 |
| Role read=false | menyudan sahifa yo‘q, bevosita API 403 |
| Individual deny + role grant | deny ustun |
| Tenant admin platforma vakolatini grant qiladi | DTO 400 yoki 403 |
| Ikki admin matritsani bir versiondan saqlaydi | birinchisi 200, ikkinchisi 409 |
| Boshqa kompaniyaning matritsasi | o‘zgarmaydi |
| Warehouse 100; parallel 70 + 70 jo‘natish | bitta muvaffaqiyat, bitta 409; reserved=70 |
| 70 jo‘natmadan 40 qabul | book=60, reserved=30, custody=40, cost=0 |
| Xuddi acceptance bir idempotency key bilan retry | ayni response, bitta ledger effekt |
| 40 custodydan 25 sarf, 10 UZS/unit | reviewdan keyin custody=15, expense=250 |
| Remaining 30 cancel | warehouse book=60, reserved=0 |
| Self review | 403 |
| Ledger update/delete | DB IMMUTABLE_LEDGER |
| Ledger/projection turli | commit 23514 |
| Journal source debit-credit nol emas | commit 23514 |
| Finance allocation 100 | expense/cash 0 o‘zgarish |
| Labor expense 100 va payment 60 | cost+100, cash−60, debt=40 |
| Invoice qoldig‘i 40; payment 50 | 409; qisman posting yo‘q |
| Ichki cash transfer 100 | company net cash flow 0 |
| Finansist smeta import | 200; edit/delete defaultsiz 403 |
| Month sum norma totalga mos emas | 400; DB bypass bo‘lsa deferred 23514 |
| Excel formula/macro/external link yoki oversized zip | 400 |
| Smeta revisiondan keyin eski material fact | eski line FK saqlanadi |
| Report accept retry | bitta progress entry, stock sarfi qayta yozilmaydi |
| Forecast report accept | forecast_end o‘zgaradi, planned_end saqlanadi |
| Report boshqa project fotosi | FK/handler rad etadi |
| Faylga bloklangan tenant sessiyasi | 401/403; public URL yo‘q |
| Manual block existing session | sessiya 401; yangi admin login billing/supportga kiradi |
| Provider configure qilinmagan | not_configured yoki 503; 0 / fake success yo‘q |

`npm run test:ui` haqiqiy Chrome brauzerida admin va menejerning alohida sessiyalarini tekshiradi: ruxsatni saqlash, menyuni yashirish, bevosita URLni rad etish, mavjud sessiya ruxsatini yangilash, boshqa rol menyusidan sahifa delegatsiyasi va yaratish tugmasining mustaqil CRUD holati. [Brauzer natijalari](ui-verification.json). `npm run test:docker` production image, migratsiya va cheklangan DB rolini tekshiradi: [Docker natijalari](docker-verification.json).

## Release oldidan majburiy, hali bajarilmagan

Haqiqiy provayder sandbox callback imzolari, replay/out-of-order/refund/reconciliation; crash-after-network-send; backup/PITR restore drill; 50+ parallel foydalanuvchi load; antivirus/re-encode; invoice adjustment va avans matching; barcha frontend CRUD ekranlarini real APIga ulash. Docker image smoke testi build va health bilan alohida tekshiriladi; bu production deploy emas.
