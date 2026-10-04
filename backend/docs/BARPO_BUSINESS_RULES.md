# BARPO AI — Biznes qoidalari

## Tasdiqlangan va tavsiya siyosatlar

Tasdiqlangan: yangi korxonaga 14 kun trial; bir kompaniyada bir admin; platform owner nomni faqat o‘ziga alias qiladi; UZS, QQS yo‘q; smetada approval yo‘q; hisobotda approval bor; jo‘natish ≠ qabul ≠ sarf. Role-page CRUD foydalanuvchining yangi talabidir.

Tavsiya/default: trial muvaffaqiyatli signup tranzaksiyasida boshlanadi, `[start,start+14 kun)` UTC interval. 72 soat invite, 30 minut reset, 12 soat sessiya. **2026-10-04 qarori:** trial yoki to‘lov muddati tugaganda tizim avtomatik bloklamaydi; API `access_state` (trial/paid/overdue) va `days_overdue` ni ko‘rsatadi, bloklash platforma egasining qo‘lda qaroridir. Manual block hatto pullik bo‘lsa 403. To‘lov manual blockni avtomatik ochmaydi. Bu siyosatlar foydalanuvchi tasdiqlagan narx yoki tijorat sharti deb olinmaydi.

## Onboarding va billing

Tenant `pending` → invite → signup atomik `active` + yagona tenant_admin + yagona trial. Preview hech narsani o‘zgartirmaydi. Reissue eski tokenni revoke qiladi. Bir vaqtning o‘zida ikki signup tenant row lock va unique admin indeksiga uriladi; faqat bittasi muvaffaqiyatli. Registration link login URLdan alohida; token log/refererga tushmasligi uchun UI fragmentda tashiladi. Ro‘yxatdan o‘tgandan keyin oddiy login ishlaydi.

Blok/arxiv mavjud sessiyalar va invite’larni revoke qiladi; keyingi operatsion so‘rov, file, worker bajarilmaydi. Bloklangan tenant_admin yangi login bilan faqat billing/support/checkout recoveryga kiradi. Payment adapter yo‘qligi 503; u ishlayapti deb ko‘rsatilmaydi. Archive — qaytarish mumkin; purge endpoint yo‘q. Moliyaviy tarix saqlanadi; retention va qonuniy purge muddati ochiq masala.

Tarif versiyasi immutable. Invoys period_start/end va narx snapshotini saqlaydi. Manual payment, credit va refund append-only. Bir tashqi reference takror kelsa ayni natija, payload farq qilsa konflikt. Qisman payment invoys qarzini kamaytiradi; coverage faqat to‘liq qoplangan va trialdan uzluksiz period zanjiri bilan uzayadi. Refund coverage’ni qayta hisoblaydi. Refund sof olingan cashdan oshmaydi. Ortiqcha to‘lov hozir rad etiladi; hisobdagi carry-forward kredit alohida kelajak ledger talabi.

Formulalar:

- Invoys summasi = chiqarilgan invoice.amount yig‘indisi.
- Sof pul tushumi = payment − refund.
- Qarz = invoys − payment − credit + refund, to‘liq invoyslar kesimida.
- Tan olingan obuna daromadi = xizmat ko‘rsatilgan kunlar ulushiga tegishli net invoice (tavsiya accrual). Hozir API bu daromadni cash bilan almashtirmaydi.
- Foyda = tan olingan daromad − platforma operatsion xarajati. Platforma xarajatlari modeli yo‘qligida `profit:null`; invoiced yoki cash’ni foyda deb nomlamaslik.

## Xodim va scope

Employee yangi parolini almashtirishi shart. Rol/deaktivatsiya parolni ko‘rsatmaydi va sessiyalarni bekor qiladi. Ochiq task yoki custody qoldiq bo‘lsa `HANDOVER_REQUIRED`: vazifani qayta assign, materialni omborga qaytarish/qabul qilish, keyin deaktivatsiya. Tenant adminni oddiy employee API o‘zgartira olmaydi; ownership alohida atomik command eski admin rolini tushirib, yangisini o‘rnatadi, ikkalasining sessiyasini bekor qiladi.

Project assignment barcha tenant rollariga (tenant_admin bundan mustasno) kerak. Warehouse manager qo‘shimcha ombor assignmentga ega. Brigadier faqat o‘z custody hisobi bilan operatsiya qiladi. Individual deny rol grantidan ustun; platforma vakolati tenant grant katalogiga kirmaydi. Narx huquqi o‘chirilsa stock/smeta DTOlarida sezgir qiymat maydonlari kesiladi.

## Smeta va katalog

Global katalog faqat name/category/unit: tenant price, supplier va stock chiqmaydi. Material bazaviy unit bilan immutable mapping sifatida yaratiladi. Ishlatilgan unitni o‘zgartiradigan endpoint yo‘q; yangi material yozuvi kerak. Dimension mos conversion jadvali bor (`t↔kg`); avtomatik taxminiy dona↔kg yo‘q. API kirishidagi miqdor allaqachon material unitida bo‘lishi kerak, aks holda UNIT_CONVERSION_REQUIRED.

Line kind: material/labor/equipment/service. Material line material_id oladi; boshqa line olmaydi. Qo‘lda effective_quantity=quantity. Norma ishlatilsa norm×work_quantity. Ikkalasiga optional `(1+loss_percent/100)` qo‘llanadi. Total=round(effective_quantity×unit_price,2). Monthlar ixtiyoriy; kiritilsa unique first-of-month va jami effective_quantityga teng. Bazaviy unit va description tarixiy snapshotda qoladi.

Finansist create/import qila oladi. Uning edit/delete defaulti yopiq; admin yangi role CRUD talabi bo‘yicha aniq grant bersa ochiladi. Smeta approval statusi yo‘q. Excel preview validation xolos, commit approvalsiz yangi smeta yaratadi; eski smeta o‘z-o‘zidan almashtirilmaydi. Edit yangi revision va yangi active qatorlar yaratadi, oldin ishlatilgan qatorlar archive bo‘lib haqiqiy sarf/progress FKlari buzilmaydi. Revision 1 boshlang‘ich plan. Hozir qatorlarni revisionlararo avtomatik bir xil work identityga ko‘chirish yo‘q; buni foydalanuvchi mapping bilan tanlashi kerak.

Reja–fakt miqdor va qiymat alohida: fact_quantity − plan_quantity; fact_value − plan_value; plan 0 bo‘lsa percent=null. Material sarfi foizi work completion foizi emas. Parent/child zonalarga bir faktni qayta post qilmaslik; leaf va bevosita zonadagi source eventlar bir marta olinadi, keyin parent rollup.

## Ombor

Opening/receipt → warehouse book va inventory value. Transfer yaratish bookni kamaytirmaydi; reserved ortadi, available=book−reserved. Partial accept → qabul qilingan miqdor source book/reserveddan chiqadi, brigadier custodyga kiradi. Qolgan qismi reserved bo‘lib turadi. Cancel qolgan rezervni bo‘shatadi; oldin qabul qilingan qism bekor bo‘lmaydi. Dispute pending qoldiqni rezervda saqlaydi.

Brigadier consumption taklifida custody reserved ortadi. Prorab review bir tranzaksiyada reservedni kamaytiradi, stock ledger chiqimini va expense/inventory jurnalini yozadi. Self-review yo‘q. Report acceptance bu consumptionni yana post qilmaydi. Ishlatilmagan miqdor custodyda qoladi. Return custodyda rezervlanadi va warehouse qabul qilganda stock ikki hisob o‘rtasida o‘tadi. Minimum threshold outbox notification yaratadi.

Tannarx usuli — **muhandislik tavsiyasi: har account/material uchun harakatlanuvchi o‘rtacha narx**. FIFO lot izi va supplier layer uchun aniqroq, ammo lot allocation/reversal murakkabroq. O‘rtacha usulda outgoing value=round(current_value/current_qty×qty,2); oxirgi to‘liq chiqim remaining value’ni to‘liq oladi. Transfer qiymati qabul vaqtida snapshot, destination custody value saqlanadi. Bir xil idempotency key takror chiqim yaratmaydi. Yangi key bilan duplicate state/version ham konflikt.

Reversal immutable manbaning teskari effektidir. Keyingi sarflangan qoldiq yetmasa rad etiladi; oldin downstream oqimni qaytarish kerak. Matched receipt reversal invoice reversal’dan oldin taqiqlangan. Hozir supplier invoice qiymati receipt qiymatiga teng bo‘lishi kerak (`PRICE_ADJUSTMENT_REQUIRED` aks holda); kech narx adjustmentini stock va consumed costga pro-rata taqsimlash alohida release gate, yashirincha historical narxni tahrirlash yo‘q. Inventarizatsiya `/stock/accounts/{id}/reconcile` orqali actual count va book farqiga immutable adjustment yaratadi; rezervlar avval hal etilishi shart. Ortiqcha materialga unit cost beriladi, kamomad current average bilan expensega yoziladi.

## Ichki moliya jurnali

Bu to‘liq soliq buxgalteriyasi emas. QQS, deklaratsiya yoki uy savdosi CRM kiritilmagan.

| Voqea | Debit (+) | Credit (−) | Xarajatmi? |
|---|---|---|---|
| Fund allocation / PO | Journal yo‘q | Journal yo‘q | Yo‘q |
| Opening stock | inventory | opening_equity | Yo‘q |
| Goods receipt | inventory | clearing | Yo‘q |
| Receipt bilan matched supplier invoice | clearing | payable | Yo‘q |
| Material consumption | expense | inventory | Ha |
| Labor/equipment/service actual | expense | payable | Ha |
| Supplier payment | payable | cash | Yo‘q |
| Supplier advance | advance | cash | Yo‘q |
| Customer receipt | cash | income | Yo‘q |
| Internal cash transfer | target cash | source cash | Yo‘q |

Supplier debt = −SUM(payable), advance alohida aktiv. Ob’yekt tannarxi=SUM(expense), net cash flow=SUM(cash). Ichki transfer net 0. Supplier payment invoice row lock bilan qoldiqdan oshirilmaydi. Payment allocation boshqa project/supplierga ulanmaydi. Bir supplier invoice hozir bir receiptga to‘liq matching; multi-receipt va avansni payablega allocation keyingi ichki completion gate.

UySot receipt bank cash eventiga reconciliation orqali bog‘lanishi kerak; bu ikkita alohida cash yozuvi emas. Kamera hodisasi receipt/payment yaratmaydi. Ushbu real adapterlar credential/schema yo‘qligi sababli hali post qilmaydi.

## Task va report

Task: todo→in_progress→submitted→accepted yoki returned→in_progress/submitted. Assignee yuboradi, reviewer yoki tenant admin qabul qiladi; reviewer=assignee taqiqlangan. Qaytarishda reason, optimistic version va audit kerak. Accepted/submitted taskni oddiy tahrirlash/archive yopiq.

Report: submitted→accepted/returned, returned→submitted. Daily/weekly alohida kind. Qabulda non-material estimate line uchun progress_entries unique(report_id), forecast_end projectga yoziladi. planned_end o‘zgarmaydi. Qabul qilingan hisobotga photo qo‘shish/o‘chirish yopiq. Returned report matnini tuzatishdan oldingi content auditda. Accepted progressni tuzatish uchun explicit reversal/supersession hali implementatsiya gate; yangi report bilan eski progressni ikki marta hisoblash mumkin emas.

## Sozlamalar, bildirishnoma toifalari va texnik panel (2026-10-04)

Kompaniya nomi, manzili va telefonini kompaniya admini o‘zi tahrirlaydi (`settings` sahifasi); platforma egasidagi alias alohida qoladi. Logotip saqlanmaydi. Telegram bildirishnoma toifalari kompaniya darajasida (`tenants.settings.telegram`): o‘chirilgan toifa ilova ichidagi yozuvni to‘xtatmaydi, faqat Telegramga yubormaydi; dedup saqlanishi uchun outbox yozuvi `done/DISABLED_BY_SETTINGS` bilan yoziladi.

Dashboard har bir blokni foydalanuvchining haqiqiy ruxsati bilan hisoblaydi; ruxsat yo‘q blok `null`, yolg‘on nol ko‘rsatilmaydi. Ko‘rsatkich manbalari `BARPO_DASHBOARD_METRICS.md` da. Eksport faqat o‘sha ro‘yxatni ko‘rish huquqi bilan ishlaydi va auditga yoziladi; narx huquqi bo‘lmasa summa ustunlari chiqmaydi.

Texnik panel faqat bazadagi haqiqiy holatni ko‘rsatadi (5xx xatolar `error_events`, worker navbati, sessiyalar); CPU/RAM/backup hosting bilan birga. Support javobi murojaat egasiga bildirishnoma sifatida boradi va biznes/moliya ma’lumotini o‘zgartirmaydi.

**Egasi qarori (2026-10-04):** AI yordamchi mahsulot doirasidan chiqarildi; kontrakt ham, UI ham rejalashtirilmaydi.

Tuzatilgan xatolar: moliya yig‘masi, reja–fakt, prognoz va moliyaviy hisobotlardagi oylik so‘rovlar (`month` yalang‘och alias) hamda qarz yoshi so‘rovidagi ortiqcha parametr 500 qaytarar edi — integration testga regressiya tekshiruvi qo‘shildi; super admin uchun murojaatlar ro‘yxati va support xodimi uchun diagnostika ruxsati menyu bilan moslashtirildi.

## Avtomatik invoys va carry-forward kredit (2026-10-04, egasi qarori)

Obuna davri 30 kun, zanjir trial tugagan kundan (`period_start = oldingi period_end`, birinchisi `trial_ends_at`). Invoys davr boshlanishidan 3 kun oldin avtomatik chiqadi (`source='auto'`), narx tarif versiyasi snapshoti. To‘lov muddati davr boshi; muddati o‘tganda `access_state=overdue`, adminga bir martalik ogohlantirish, blok faqat platforma egasining qo‘lda qarori.

Ortiqcha to‘lov rad etilmaydi: `payment` yozuvi haqiqiy pulni to‘liq aks ettiradi, invoysdan oshgan qismi kompaniya kredit qoldig‘i (`billing_credits`, append-only). Kredit avtomatik ravishda to‘lanmagan invoyslarga (eng eskisidan) va keyingi avtomatik invoysga qo‘llanadi; qo‘llash `billing_entries(kind='credit')` bilan ko‘rinadi, shuning uchun qoplanish zanjiri formulasi o‘zgarmaydi. Qarz formulasi: invoys kesimida `Σ max(0, amount − qoplangan)`; kredit qoldig‘i alohida ko‘rsatkich. Refund hamon sof olingan cashdan oshmaydi.
