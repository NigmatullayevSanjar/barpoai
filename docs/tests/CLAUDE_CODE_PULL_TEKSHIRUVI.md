# Claude Code uchun test case: `git pull` dan keyingi to‘liq tekshiruv

> **Maqsad:** yangi kod lokal kompyuterda ishlashini isbotlash — qurilish, avtomatik testlar, ishlab turgan stack ustida to‘liq biznes oqimi — va o‘zidan keyin **hech qanday soxta ma‘lumot qoldirmaslik**.
> **Kim bajaradi:** Claude Code (egasi kompyuterida, repo papkasida). **Davomiyligi:** 20–30 daqiqa.
> **Qoida:** yiqilgan qadam tuzatilmaydi; natija hisobotda qayd etiladi va egasidan qaror kutiladi. Haqiqiy kompaniyalar ma‘lumotiga tegilmaydi.

## 0. Boshlang‘ich shartlar

| Shart | Tekshiruv |
|---|---|
| Node.js 22+ va pnpm | `node -v`, `pnpm -v` |
| Docker Desktop ishlayapti | `docker info` xatosiz |
| Repo toza | `git status` — commit qilinmagan o‘zgarish yo‘q (bo‘lsa egasidan so‘raladi) |
| `backend/.env` to‘ldirilgan | `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `APP_ORIGIN` bor; token va parollar chatga chiqarilmaydi |
| Platforma egasi hisobi | Login va parol egasidan chatda so‘raladi, faylga yozilmaydi |

## 1. Kodni olish va qurish (5 daqiqa)

| ID | Buyruq (papka) | Kutilgan natija |
|---|---|---|
| C-01 | `git pull` (repo) | `main` yangilandi; `git log -1` eng so‘nggi merge commit |
| C-02 | `npm ci` (`backend`), `pnpm install --frozen-lockfile` (`frontend`) | Xatosiz; lockfile o‘zgarmaydi |
| C-03 | `npm run build` (`backend`) | `tsc` xatosiz |
| C-04 | `pnpm typecheck && pnpm build` (`frontend`) | Xatosiz; `dist/` yaratildi |
| C-05 | `npm test` (`backend`) | `# pass 27`, `# fail 0` (son faqat o‘sishi mumkin) |
| C-06 | `npm run docs` (`backend`) | «... endpoint: OpenAPI, database DDL va ruxsatlar hujjati yangilandi.»; `git status` da `docs/backend/BARPO_API_OPENAPI.yaml` yoki `BARPO_DATABASE_SPEC.md` **o‘zgarmagan** (o‘zgarsa — hujjat kodga mos emas, hisobotga yoziladi) |

## 2. Avtomatik to‘plamlar vaqtinchalik bazada (10–12 daqiqa, ketma-ket)

Har to‘plam o‘z PostgreSQL 17 konteynerini ochadi va yopadi; egasi bazasiga tegmaydi. **Bir vaqtda ikkitadan ko‘p ishga tushirilmaydi.** Fon jarayonining chiqish kodi emas, log o‘qiladi.

| ID | Buyruq (`backend`) | Kutilgan natija |
|---|---|---|
| C-07 | `npm run test:integration` | Oxirida JSON, `"checks"` ro‘yxatida kamida **94** band, jarayon kodi 0; `AssertionError` yo‘q |
| C-08 | `npm run test:roles` | `"findings": []`, `"unfillable": []`; hisobotda har rol «Mos kelmadi» ustuni 0 |
| C-09 | `npm run test:ui` | `"checks"` ro‘yxatida kamida **57** band; `ERRORS []`, `ERROR_EVENTS []` |
| C-10 | `git checkout -- docs/backend/verification.json docs/backend/role-verification.json docs/backend/ui-verification.json docs/backend/BARPO_ROLE_TEST_REPORT.md docs/backend/platform-tenant-ui.png` va `git checkout -- docs/backend/ui-failure-*.png` (bo‘lsa) | `git status` toza — to‘plamlar yozgan hisobot fayllari commit qilinmaydi |
| C-11 | `docker ps -a` | `barpo-`/`pg` nomli vaqtinchalik konteyner qolmagan (qolsa `docker rm -f` bilan o‘chiriladi va hisobotga yoziladi) |

## 3. Ishlab turgan lokal stack ustida to‘liq oqim (3 daqiqa)

Bu qadam egasi ko‘radigan haqiqiy lokal stack’da bajariladi, lekin faqat **`QA-` kaliti bilan yaratilgan alohida kompaniyada**, va muvaffaqiyatda o‘zini o‘chiradi.

| ID | Buyruq (`backend`) | Kutilgan natija |
|---|---|---|
| C-12 | `docker compose up --build -d`; `docker compose logs migrate` | «Migratsiyalar bajarildi.» (yangi migratsiyalar, masalan 025–027, qo‘llandi); `curl http://127.0.0.1:3001/health/ready` → `{"status":"ok"}` |
| C-13 | Egasi login/parolini chatda so‘rab, **faqat shu jarayon muhitiga** bering: PowerShell `$env:QA_OWNER_LOGIN='...'; $env:QA_OWNER_PASSWORD='...'`, CMD `set QA_OWNER_LOGIN=...`; keyin `npm run qa:smoke` (API manzili boshqa bo‘lsa `API_URL=...`) | Chiqishda JSON: `"tenant": "QA-<vaqt>"`, `"checks"` ro‘yxatida **14** band, oxirgisi «Tozalash: QA kompaniyasi va uning barcha ma‘lumotlari o‘chirildi…», `"cleanup": { "deleted": true, "tables": 50+ }`, jarayon kodi 0 |
| C-14 | Tekshiruv mazmuni (JSON dagi 14 band) | 1 API sog‘lom; 2 kompaniya + bir martalik taklif; 3 6 rol xodimi, parol almashtirish; 4 obyekt, zona, standart ombor; 5 ombor kirimi (admin 403); 6 smeta 25 600 000, prorabga narx yo‘q; 7 jo‘natish → qabul → sarf → 120 000 xarajat; 8 ko‘p qatorli talabnoma; 9 vazifa oqimi; 10 hisobot, qotirilgan stavka, tuzatish, qavat matritsasi 35 %; 11 tushum, invoys, to‘lov, obyekt moliya kartasi; 12 ish haqi: akkord 3 500 000, avans avval, brigadir balansi 0; 13 dashboard va ruxsat chegaralari; 14 tozalash |
| C-15 | Yiqilsa | Ma‘lumot saqlanadi, chiqishda `npm run qa:cleanup -- QA-<vaqt>` buyrug‘i ko‘rsatiladi. Sabab hisobotga yoziladi (qadam, kutilgan va haqiqiy javob), **keyin** tozalash buyrug‘i bajariladi; egasidan qaror kutiladi |
| C-16 | `npm run qa:cleanup -- --all-qa` | `"cleaned": []` yoki o‘chirilganlar ro‘yxati — hech qanday `QA-` kompaniya qolmagan |

Parol va login hech qachon fayl, commit yoki chat xabariga yozilmaydi; `QA_PASSWORD` berilmasa smoke tasodifiy parol ishlatadi.

## 4. Yakuniy holat

| ID | Tekshiruv | Kutilgan natija |
|---|---|---|
| C-17 | `git status` | Toza (hech qanday o‘zgarish yo‘q) |
| C-18 | Egasi bazasi | Egasi → Mijozlar ro‘yxatida `QA-` kompaniya yo‘q; haqiqiy kompaniyalar joyida |
| C-19 | Hisobot | Chatga qisqa jadval: C-01…C-18 har biri «o‘tdi» yoki «yiqildi + sabab». Yiqilgan bo‘lsa — kodga tegmasdan egasi qarorini kutish |

## 5. Hisobot shabloni

```
Pull tekshiruvi — <sana>, commit <hash>
Qurilish: backend ✅ frontend ✅ unit 27 ✅ docs ✅
Vaqtinchalik baza: integration 94 ✅ roles ✅ ui 57 ✅ (hisobot fayllari qaytarildi ✅)
Lokal stack: qa:smoke 14/14 ✅, QA kompaniya o‘chirildi ✅ (tables: 52)
Yakun: git status toza ✅, QA- kompaniya yo‘q ✅
Yiqilganlar: yo‘q / <ID, qadam, kutilgan, haqiqiy>
```
