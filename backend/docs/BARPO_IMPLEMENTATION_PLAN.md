# BARPO AI — Implementatsiya va release rejasi

## Bajarilgan qism

1. Mavjud React demo saqlandi; mustaqil `backend/` paketi yaratildi. Fastify + TypeScript strict + pg + zod + decimal.js, lockfile, Dockerfile/Compose, migration runner, owner bootstrap va worker bor.
2. PostgreSQL schema, RLS, FK, immutable journal/stock/revision, deferred summa invariantlari va indekslar yozildi.
3. Sessiya, invite/signup race, employee first password, reset token, tenant block/recovery, 10 rol va project/warehouse scope ishlaydi.
4. Admin roli uchun sahifa bo‘yicha C/R/U/D matritsa, individual override va optimistic version. Moliyaning alohida dizayn sahifalari (bank/kassa, ish haqi, invoys, budjet, reja-fakt va boshqalar) mustaqil permission keylarga ega. API moliyaviy ro‘yxatlarni shu sahifa huquqlariga ham filtrlaydi.
5. Smeta qo‘lda/norma/oylar, immutable revisions, Excel mapping preview/commit; ombor book/reserve/partial acceptance/custody/consumption review/return/reversal/inventarizatsiya; moliya allocation/invoice/actual/payment/journal; task/report/progress/foto uchun endpointlar.
6. Auth va permission matritsa frontendga ulandi; umumiy va rolga maxsus menyular serverdan filtrlanadi, create/update/delete handlerlari ajratildi. VITE_API_URL yoqilganda role switch demo huquq bermaydi.
7. Unit, haqiqiy PostgreSQL integration testlar, frontend/backend build va Docker image tekshiruvlari bajariladi; natija verification.json va terminal chiqishlarida.

## R1gacha ichki completion gate

Quyidagilar **hali to‘liq amalga oshirilmagan**; mavjud kodni to‘liq R1 deb e’lon qilish mumkin emas:

- Supplier invoice narxi receipt narxidan farqlanganda value-only adjustmentni qolgan inventory/consumed costga izchil taqsimlash. Hozir xavfsiz `PRICE_ADJUSTMENT_REQUIRED` rad javobi, tarixni tahrirlash yo‘q.
- Bitta invoys–bir nechta receipt va advance→invoice clearing; hisobdagi ortiqcha SaaS kreditni keyingi davrga ko‘chirish; avtomatik oylik invoice chiqarish/billing worker.
- Qabul qilingan progressni explicit correction/reversal bilan tuzatish, revisionlararo stable work-line mapping, loyiha/zone bo‘yicha to‘liq baseline/current plan–fact rolluplari.
- Kamera eventlarini persist/link qilish, UySot monthly plan/fact datasetlari, tashqi provider adapterlari va reconciliation operator UI/API. Credential kutish davrida kontrakt/schema infratuzilmasi tayyor, ammo business adapterlar ishlayapti deyilmaydi.
- Qolgan frontend Figma formalarini real domain APIlar bilan ulash; hozir ular demo ekanligi live rejimda banner bilan ko‘rsatiladi. Permissions ekrani va login real.
- Restore drill, load/soak sinovlari, full audit coverage review, endpoint response DTOlarini barcha maydonlari bilan qat’iy serialization, centralized rate-limit, scanner va fayl re-encode/cleanup. Tenant-admin parol resetini verified support identity jarayoniga ulash.

Bu ro‘yxat tashqi integratsiyalarni keyingi relizga ko‘chirish emas: **R1 chiqarilishidan oldingi gate**. Tez chiqarish uchun muvaffaqiyatsiz integratsiyalarni fake qiymat bilan almashtirish tavsiya qilinmaydi.

## Dependency tartibi

1. Biznes ochiq qarorlari va provider kontraktlari → schema additions (backward-compatible).
2. Value adjustments, matching va progress correction → invariant/concurrency testlari.
3. Provider raw signature verifier → inbox → mapping → idempotent domain posting → reconciliation → dead-letter qayta ishlash.
4. Frontend real data binding → har rolning e2e UI/API access matrix testi.
5. Hosting TLS/secrets/WAL/private files → restore/monitoring → staging sandbox → release.

## Migration tartibi

001_core: domain jadvallari, dastlabki FK/RLS/journal. 002_page_permissions: tenant role CRUD/version. 003_invariants: source FK, immutable trial, projection/oy constraintlar, arxivlash. 004_financial_page_permissions: har moliya sahifasini ajratish. 005_budget_version: budjet create/update huquqlarini ajratish va optimistic version. Migrator advisory lock bilan parallel release’ni serialize qiladi; fayl nomlari schema_migrations’da, qayta run no-op. Birinchi productiondan keyin applied fayllar tahrirlanmasin; faqat keyingi raqamli migration.

## Definition of done

Talab→schema→permission→API→test izchilligi; no cross-tenant leak; barcha kerakli race/retrylar real PostgreSQLda; decimal/string; restore drill; monitoring; R1 provayder sandbox settlement/refund va reconciliation; har user role uchun real frontend sahifa CRUD; no fake integration status; deployment rollback/forward-fix yozilgan. Hozir ichki core testlari o‘tgan, butun R1 DoD hali bajarilmagan.

## Ochiq masalalar va tavsiya

| Masala | Holat / tavsiya | Ta’siri |
|---|---|---|
| Providerlar | Foydalanuvchi: hozircha hech biri yo‘q; qayta so‘ralmaydi | Hujjat/sandbox/merchant kerak; R1 blocker |
| Bank, Didox, iHamkor | Uchalasimi yoki tanlangan manbalar — ochiq | Adapter va reconciliation doirasi |
| Tarif narx/limit | Berilmagan; seed qilinmagan | Plan versionni owner kiritadi |
| FIFO vs average | Average koddagi tavsiya; tasdiqlanmagan | Ishga tushirishdan oldin inventory valuation qarori |
| Trial start / grace | Signupda 14×24 soat, grace 0 tavsiya | Commercial policy va API blocking |
| Finansist edit/delete | Default yopiq; endi tenant admin aniq page CRUD grant bilan ochishi mumkin | Eng so‘nggi foydalanuvchi talabi bilan yechildi |
| Admin-only pages | Faqat permission administration admin-only; billing/settings active xodimga delegatsiya qilinishi mumkin | Egaga tegishli xavfsizlik/delegatsiya chegarasi |
| Payment period/credit | Oylik invoice, partial allowed, carry-forward hali yo‘q | Billing yakuniy accounting |
| Hosting va backup | Provider/config noma’lum; RPO15min/RTO4h tavsiya | Production operational readiness |
| Retention/purge | Archive bor, purge yo‘q; muddat noma’lum | Finance/audit/file retention |
| Real identity unique | Global login unique; verified person ID hali yo‘q | Bir odam boshqa login bilan yana kiritilishini aniqlash |

Narx, limit, real provider API yoki qonuniy saqlash muddati ixtiro qilinmagan.
