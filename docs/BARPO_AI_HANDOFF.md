# BARPO AI — boshqa Claude uchun to‘liq loyiha konteksti

> **Kim uchun:** bu repoda ishlashni boshlayotgan boshqa Claude (yoki AI kod agenti).
> **Holat sanasi:** 2026-10-07. Kod, hujjatlar va jonli stack 2026-10-06 da to‘liq tekshirilgan; repo `frontend/`, `backend/`, `docs/` ga ajratilgandan keyin barcha testlar 2026-10-07 da qayta o‘tkazilgan (11-bo‘lim).
> **Maqsad:** bitta faylni o‘qib loyiha nima ekanini, qanday ishlashini, qanday ishga tushirilishini, qaysi qoidalar majburiyligini va nima qolganini bilish.
> Bu **hosila hujjat**. Kod bilan zid kelsa, kod to‘g‘ri. Biznes qoidalari to‘qnashsa, `docs/backend/BARPO_BUSINESS_RULES.md` ustun. Fayl yo‘llari repo ildiziga (`barpo-ai/`) nisbatan yozilgan.
> Secretlar (parollar, tokenlar) bu faylda **yo‘q** va bu yerga yozilmasin.

---

## 0. Birinchi 5 daqiqa: bilishingiz shart bo‘lgan narsalar

1. **Faol loyiha** — `barpo-ai/`. Workspace ildizi (`d:\Ismoil\VScode\Frontend\Frontend`) faqat `CLAUDE.md` saqlaydi, u `barpo-ai/CLAUDE.md` ga yo‘naltiradi.
2. **Ish uslubi** (`barpo-ai/CLAUDE.md`): kod yozishdan oldin o‘yla va noaniqlikni so‘ra; eng kam kod; faqat so‘ralgan joyni o‘zgartir; har vazifani tekshiriladigan maqsadga aylantir. Har o‘zgargan qator foydalanuvchi so‘roviga bog‘lanishi kerak. Begona eskirgan kodni ko‘rsang ayt, o‘chirma.
3. **Loyiha konvensiyalari** (buzilmasin):
   - Pul va miqdor **butun yo‘l davomida decimal string** (`"100.50"`, `"25.000000"`). Backend `decimal.js` bilan hisoblaydi. Frontend **arifmetika qilmaydi**, faqat formatlaydi. Yagona istisno (D7, 2026-10-11): USD faqat ko‘rsatish uchun — konvertatsiya faqat `formatMoney` ichida, server bergan CBU kursi bilan, decimal arifmetika bilan (Number emas); yig‘indi hisoblanmaydi, jamlar serverdan UZS’da keladi.
   - Ruxsat **serverda** tekshiriladi. UI faqat yashiradi.
   - Har yangi UI matni **ikkala** lokalga: `frontend/src/locales/*.uz.ts` va `*.ru.ts`.
   - **Statik demo raqam yo‘q.** Ma’lumot yo‘q bo‘lsa bo‘sh holat, xato bo‘lsa xato holati.
   - Secretlar faqat `backend/.env` da (gitignored). Token commit qilinmaydi.
4. **Commitdan oldin majburiy tekshiruv:** `backend` da `npm run build`, `npm test`, `npm run test:integration`, `npm run test:ui`, `npm run test:roles`; `frontend` da `pnpm typecheck`, `pnpm build`. Route o‘zgarsa `npm run docs`.
5. **Ish rejasi:** `docs/BACKEND_TODO.md` (12 bosqich, sanali status qatorlari). **Mahsulot spetsifikatsiyasi:** `docs/BARPO_AI_PROJECT_CONTEXT.md` — UI va scope uchun yo‘l-yo‘riq, lekin texnik tavsiyalari eskirgan (16-bo‘lim).
6. **Commit va push** faqat foydalanuvchi so‘rasa. Branch `main`, remote `origin` = `https://github.com/Ismoil59/barpoai.git` (eski remote `nigmatullayev` nomi bilan saqlangan).
7. Foydalanuvchi o‘zbek tilida yozadi. Javoblarni o‘zbekcha bering.

---

## 1. Mahsulot bir qarashda

**BARPO AI** — qurilish kompaniyalari uchun **multi-tenant B2B SaaS ERP**. Maqsad: “qurilishning pulini, materialini, odamlarini, vazifalarini va obyektlarini bitta tizimda nazorat qilish”.

Uch qatlam qat’iy ajratilgan, aralashtirilmasin:

```text
SaaS platforma     → super_admin, platform_owner, support: kompaniyalar, tariflar, SaaS invoys/to‘lov, murojaatlar, texnik panel
   ↓
Tenant (kompaniya) → tenant_admin: xodimlar, rollar, ruxsat matritsasi, sozlamalar, obuna
   ↓
Qurilish ERP       → obyektlar, zonalar, smeta, ombor, moliya, vazifa, hisobot, fayllar, dashboard
```

- Desktop-first veb ilova. **Mobil ilova scope’da yo‘q.**
- Til: o‘zbek (lotin) asosiy, rus ikkinchi. Saqlash va kiritish faqat UZS (`currency='UZS'`), QQS yo‘q. USD faqat ko‘rsatish uchun: headerda UZS/USD almashtirgich, CBU kursi (D7); Excel eksportlar UZS’da (narx varaqasidan tashqari). Narx varaqasi (D2, D8, 2026-10-11): obyekt xonadonlari tannarxi va sotuv narxi o‘zgarmas versiyalarda, USD versiya kursi bilan saqlanadi; qoidalar `docs/backend/BARPO_BUSINESS_RULES.md`, hisob `backend/src/pricing.ts`. Vaqt zonasi `Asia/Tashkent`.
- Nomida “AI” bo‘lsa ham, **AI yordamchi 2026-10-04 da egasi qarori bilan rejadan chiqarilgan**. AI funksiya qo‘shmang.
- Platforma roli kompaniya operatsion ma’lumotiga **avtomatik kirmaydi** (break-glass o‘chirilgan).

### 1.1. Asosiy oqim

```text
Platforma egasi: tarif versiyasi → yangi kompaniya (status=pending) → bir martalik taklif havolasi (72 soat)
→ mijoz havolani ochadi (/register#token=…) → tenant_admin yaratiladi, kompaniya active, 14 kunlik trial boshlanadi
→ admin: xodimlar (boshlang‘ich parol, birinchi kirishda almashtirish majburiy), obyektlar, biriktirishlar, rol×sahifa CRUD
→ ish: smeta → ombor kirimi → brigadirga jo‘natish → qabul → sarf taklifi → prorab tasdig‘i → moliya → vazifa/hisobot → dashboard
```

### 1.2. 10 rol

| Rol | Qatlam | Qisqacha |
|---|---|---|
| `super_admin` | platforma | texnik: diagnostika, texnik xodimlar, murojaatlar |
| `platform_owner` | platforma | biznes: kompaniyalar, taklif, tarif, SaaS invoys va to‘lov, qarzdorlar, murojaatlar |
| `support` | platforma | murojaatlar, diagnostika; biznes va moliya ma’lumotini o‘zgartirmaydi |
| `tenant_admin` | kompaniya | kompaniyada hamma narsa; har kompaniyada **bitta** |
| `foreman` (prorab) | kompaniya | vazifalar, hisobotlarni tekshirish, sarfni tasdiqlash |
| `brigadier` (brigadir) | kompaniya | o‘z custody hisobi: qabul, sarf taklifi, hisobot |
| `warehouse_manager` (ombor mudiri) | kompaniya | kirim, jo‘natish; faqat biriktirilgan omborlar |
| `financier` (finansist) | kompaniya | ajratma, budjet, to‘lov so‘rovi, smeta import |
| `accountant` (buxgalter) | kompaniya | hujjatlar, invoys, bank/kassa, ish haqi, reversal |
| `manager` (menejer) | kompaniya | obyekt holati, vazifalar, hisobotlar |

Bitta foydalanuvchi = bitta kompaniya + bitta rol (multi-membership yo‘q). Platforma rollarida `users.tenant_id IS NULL`. 10 rol tasdiqlangan, yangi rol qo‘shmang.

---

## 2. Repo xaritasi

2026-10-07 dan repo uch qismga ajratilgan: `frontend/`, `backend/`, `docs/`. Ildizda faqat `CLAUDE.md`, `README.md`, `.gitignore`, `.gitattributes` qoladi.

```text
d:\Ismoil\VScode\Frontend\Frontend\
├─ CLAUDE.md                      → "@barpo-ai/CLAUDE.md" (repo tashqarisida)
└─ barpo-ai/                      ← git repo (main)
   ├─ CLAUDE.md                   ish uslubi + loyiha ko‘rsatkichlari (majburiy; Claude Code uni ildizdan o‘qiydi)
   ├─ README.md                   qisqa umumiy ko‘rinish: tuzilma, ishga tushirish, hujjatlar
   ├─ frontend/                   Vite + React 19 ilova
   │  ├─ package.json, pnpm-lock.yaml, pnpm-workspace.yaml (allowBuilds: esbuild)
   │  ├─ vite.config.ts, tsconfig.json, index.html, .prettierrc.json (singleQuote, printWidth 110)
   │  ├─ .env.example, .env.local VITE_API_URL= (bo‘sh, bir xil origin; .env.local gitignored)
   │  ├─ src/                     ilova kodi, ~20k qator
   │  ├─ legacy/                  eski Figma demo (137 fayl); ulanmagan, build’ga kirmaydi; faqat dizayn manbasi
   │  ├─ public/assets/           765 ta rasm va SVG (legacy ekranlardan)
   │  └─ node_modules/, dist/     gitignored
   ├─ backend/                    Node.js API + worker + migratsiyalar + testlar
   │  ├─ .env (gitignored), .env.example, compose.yaml, Dockerfile, docker/init.sh
   │  ├─ src/                     ~9k qator TypeScript
   │  ├─ migrations/              001…014 SQL
   │  ├─ scripts/                 integration.ts, ui-test.ts, role-tests.ts, docker-smoke.mjs, docs.ts
   │  ├─ tests/domain.test.ts     unit testlar
   │  ├─ storage/                 lokal private fayllar (gitignored)
   │  └─ node_modules/, dist/     gitignored
   └─ docs/                       barcha hujjatlar
      ├─ BARPO_AI_HANDOFF.md      shu fayl
      ├─ BACKEND_TODO.md          12 bosqichli reja, sanali statuslar (plan of record)
      ├─ BARPO_AI_PROJECT_CONTEXT.md  mahsulot konteksti (UI/scope), 51 bo‘lim
      ├─ README_BACKEND.md        backend + frontendni birga ko‘tarish (4 qadam)
      ├─ SCREEN_MAP.md            eski Figma ekranlari → Figma node
      ├─ frontend/                README.md (frontend README), LEGACY.md, fidelity-verification.json va verification.json (eski Figma demo tekshiruvlari, 2026-09-28)
      ├─ backend/                 README.md (backend README), BARPO_*.md texnik hujjatlar, OpenAPI YAML, test natijalari (JSON, PNG)
      └─ claude/CLAUDE.md         ish uslubining nusxasi (ilgari claude/skills/CLAUDE.md)
```

`docs/backend/` ga backend skriptlari yozadi: `npm run docs` (OpenAPI, DATABASE_SPEC, PERMISSIONS) va testlar (verification JSON, ROLE_TEST_REPORT, PNG). Skriptlar `backend/` papkasidan `../docs/backend/` yo‘li bilan yozadi. `test:ui` frontendni `../frontend` dan ko‘taradi va `frontend/node_modules/vite` dan foydalanadi.

### 2.1. Backend fayllari (`backend/src`)

| Fayl | Qatorlar | Vazifa |
|---|---:|---|
| `server.ts` | 20 | API kirish nuqtasi; productionda DB roli SUPERUSER/BYPASSRLS emasligini tekshiradi |
| `app.ts` | 52 | `buildApp(pool)`: route modullari, `/health/live`, `/health/ready`, `/openapi.json`, 5xx → `error_events` |
| `http.ts` | 334 | Fastify bazasi (helmet, cookie, cors, rate-limit), **router** (so‘rov konveyeri), OpenAPI generatori |
| `db.ts` | 115 | pool, `transaction()` (RLS konteksti, timeout, retry), `audit()`, `idempotent()`, DB xatolarini mapping |
| `auth.ts` | 135 | sessiya (12 soat, `barpo_session`), login (login yoki telefon), invite signup, `accessState`, `tenantAccess` |
| `security.ts` | 50 | scrypt hash, token, SHA-256 digest, Telegram Login Widget imzosi |
| `permissions.ts` | 398 | rollar, 29 domen ruxsati, 29 sahifa, bazaviy siyosat, `allowed`, `pageAllowed`, scope, `redactPrices` |
| `schemas.ts` | 91 | umumiy zod: `amount`, `qty`, `password` (12–128), `phone`, smeta/ombor/moliya DTO |
| `money.ts` | 25 | `dec`, `money` (2 xona), `quantity` (6 xona), `plannedQuantity`, `variance` (ROUND_HALF_UP, precision 40) |
| `errors.ts` | 18 | `DomainError`, `invariant(cond, CODE, status=409)` |
| `estimates.ts` | 267 | smeta yaratish/reviziya, Excel parse va xavfsizlik chegaralari |
| `inventory.ts` | 439 | ombor komandalari, rezerv, ledger, o‘rtacha tannarx, holat o‘tishlari |
| `finance.ts` | 242 | moliyaviy hujjat → jurnal yozuvlari, reversal |
| `billing.ts` | 187 | SaaS: 30 kunlik davr, avtomatik invoys, kredit, qoplanish (`paid_until`) |
| `notify.ts` | 90 | ilova ichidagi bildirishnoma + Telegram outbox (dedup, toifa sozlamasi) |
| `telegram.ts` | 671 | bot: deep-link ulash, long polling, rolga mos menyu, buyruqlar |
| `telegram-flows.ts` | 449 | ko‘p qadamli bot oqimlari: material so‘rovi, progress hisoboti (rasm bilan) |
| `worker.ts` | 123 | outbox yetkazish, deadline eslatmalari, avtomatik invoys, bot polling |
| `migrate.ts` | 39 | migratsiya runneri (advisory lock, `schema_migrations`) |
| `bootstrap.ts` | 31 | birinchi `platform_owner` yoki `super_admin` |
| `xlsx.ts` | 25 | Excel eksport yordamchisi |
| `routes-auth.ts` | 245 | auth, profil, reset, Telegram link/login, bildirishnomalar |
| `routes-platform.ts`, `routes-platform-extra.ts` | 445, 151 | kompaniyalar, taklif, tarif, billing, support, diagnostika, staff |
| `routes-company.ts`, `routes-company-extra.ts` | 501, 157 | obyekt, zona, xodim, biriktirish, ownership, tenant billing, sozlamalar |
| `routes-permissions.ts` | 141 | `/v1/me/permissions`, rol×sahifa matritsasi |
| `routes-operations.ts` | 682 | katalog, material, ombor komandalari, smeta, import, kontragent, kassa, moliya hujjatlari, budjet |
| `routes-stock-extra.ts` | 358 | ombor ko‘rinishi, ledger, material so‘rovlari, eksport |
| `routes-estimates-extra.ts` | 150 | reviziyalar, Excel eksport, import inspect |
| `routes-finance-extra.ts` | 942 | yig‘ma, to‘lov so‘rovlari, kalendar, ish haqi, reja–fakt, prognoz, hisobotlar |
| `routes-work.ts`, `routes-work-extra.ts` | 551, 216 | vazifa, hisobot, fayl, progress tuzatish, eksport |
| `routes-lifecycle.ts` | 166 | arxivlash va o‘chirish oqimlari |
| `routes-dashboard.ts` | 511 | `/v1/dashboard`, audit, integratsiya holati, kompaniya sozlamalari |

### 2.2. Frontend fayllari (`frontend/src`)

| Yo‘l | Vazifa |
|---|---|
| `main.tsx` | Geist shriftlari, CSS, `<App/>` (StrictMode) |
| `app/App.tsx` | provayderlar (I18n → QueryClient → Toast → Auth → BrowserRouter), barcha marshrutlar, lazy sahifalar |
| `app/guards.tsx` | `RequireAuth`, `RedirectIfAuthed`, `RequirePage`, `Forbidden`, `NotFound`, `FullScreenLoading` |
| `app/layouts/AppShell.tsx` | sidebar (ruxsat bo‘yicha), topbar, bildirishnoma qo‘ng‘irog‘i (30 s), foydalanuvchi menyusi, UZ/RU almashtirgich |
| `app/layouts/AuthLayout.tsx` | auth sahifalari ramkasi |
| `lib/api.ts` | `api()`: `credentials: include`, avtomatik `Idempotency-Key`, `ApiError(code, status, fields, requestId)`, 401 tinglovchisi, `qs()` |
| `lib/auth.tsx` | `AuthProvider`/`useAuth`: `me`, `permissions`, `issue` (TENANT_BLOCKED/ARCHIVED), `login`, `logout`, `refresh`, `can(page, action)`, `isPlatform` |
| `lib/permissions.ts` | rollar, 29 sahifa, `pageRoutes`, `tenantNav` (3 guruh), `platformNav`, `homeFor` |
| `lib/i18n.tsx` | `I18nProvider`/`useT`, `t(key, vars)`, `errorMessage(t, code, status)`; til `localStorage['barpo.lang']` |
| `lib/format.ts` | `formatMoney`, `formatQuantity`, `formatDate`, `formatDateTime`, `formatRelative` (Asia/Tashkent), `todayIso`, `monthStart` |
| `lib/download.ts` | `saveBase64File` — server qaytargan base64 Excel’ni yuklab olish |
| `components/ui/index.tsx` | Button, Input, Select, Textarea, Field, Modal, ConfirmDialog, Tabs, Segmented, Switch, Badge, Avatar, Alert, Stat, PageHeader, SearchInput, Pagination, EmptyState, ErrorState, Loading, Spinner, `useListState` |
| `components/ui/DataTable.tsx` | umumiy jadval (`Column` tipi) |
| `components/ui/Toast.tsx`, `icons.tsx` | toast provayderi; lucide ikonalar xaritasi (`NavIcon`) |
| `features/*` | sahifalar (12.2-bo‘lim) |
| `locales/` | 7 lug‘at × 2 til: `uz/ru`, `erp`, `estimates`, `stock`, `finance`, `work`, `ops` (~1017 kalit har tilda, uz va ru soni teng) |
| `styles/` | `tokens.css`, `base.css`, `components.css`, `layout.css` — o‘z CSS tizimi, Tailwind yo‘q |

---

## 3. Texnologiyalar

| Qatlam | Stack |
|---|---|
| Frontend | Vite 7, React 19, TypeScript ~5.9 strict, react-router-dom 7, TanStack Query 5, React Hook Form 7 + Zod 4, lucide-react, `@fontsource/geist`. Paket menejeri pnpm 10. |
| Backend | Node.js ≥24, Fastify 5 (`@fastify/cookie`, `cors`, `helmet`, `rate-limit`), `pg`, Zod 4, decimal.js, exceljs, jszip, yaml. **ORM yo‘q**, parametrli SQL. Paket menejeri npm. Prettier printWidth 100. |
| Baza | PostgreSQL 17 (`postgres:17-bookworm`). RLS, deferred constraint triggerlar. |
| Navbat | PostgreSQL `outbox` jadvali (`FOR UPDATE SKIP LOCKED`). Redis yo‘q. |
| Test | `node:test` (tsx), Docker’dagi vaqtinchalik PostgreSQL, Playwright + o‘rnatilgan Google Chrome. |
| Infra | Docker Compose: `db`, `migrate` (bir martalik), `api`, `worker`. Hosting tanlanmagan. |

---

## 4. Lokal ishga tushirish (Windows, shu mashina)

### 4.1. Joriy lokal holat (2026-10-06 dan)

- Docker Compose loyiha nomi **`barpo`**, `backend/.env` dagi `COMPOSE_PROJECT_NAME=barpo` orqali. Sabab: odatiy nom `backend` bo‘lardi. U bu mashinada boshqa loyihaning (`D:\Ismoil\projects\tracker - Copy\backend`, postgres:16) compose loyihasi va `backend_postgres_data` volume’i bilan band. **O‘sha volume’ga tegmang.**
- Konteynerlar: `barpo-db-1`, `barpo-migrate-1` (tugab chiqadi), `barpo-api-1`, `barpo-worker-1`. Volume’lar: `barpo_postgres_data`, `barpo_private_files`.
- Portlar: API `127.0.0.1:3001`, DB `127.0.0.1:5433` (konteyner ichida 5432), frontend `localhost:5173` (`strictPort`).
- Bazada lokal hisoblar bor: platforma egasi `platform.owner`; kompaniya “Sinov kompaniya” (ro‘yxat kaliti `SINOV-001`), admini `sinov.admin`. **Parollar repoda saqlanmaydi**, foydalanuvchidan so‘rang.
- Boshqa loyihaning `oshxona-postgres` (5544) va `oshxona-minio` (9000–9001) konteynerlari ham ishlaydi. Ular BARPO’ga tegishli emas.

### 4.2. Buyruqlar

```powershell
# 1) Backend (Docker Desktop ishlab turishi kerak)
cd D:\Ismoil\VScode\Frontend\Frontend\barpo-ai\backend
docker compose up -d            # kod o‘zgargan bo‘lsa: docker compose up --build -d
curl http://localhost:3001/health/ready   # {"status":"ok"}

# 2) Frontend
cd D:\Ismoil\VScode\Frontend\Frontend\barpo-ai\frontend
pnpm install                    # TTY yo‘q muhitda (agent): CI=true pnpm install --frozen-lockfile
pnpm dev                        # http://localhost:5173 ; /v1 va /health → localhost:3001 proxy

# To‘xtatish
docker compose down             # backend papkasida; ma’lumot volume’da qoladi
```

### 4.3. Birinchi platforma egasini yaratish (bo‘sh bazada)

Default hisob **yo‘q**. Bootstrap har rol uchun bir marta ishlaydi (`BOOTSTRAP_ROLE_ALREADY_EXISTS`), parol kamida 12 belgi.

```bash
cd backend
BOOTSTRAP_LOGIN=platform.owner BOOTSTRAP_PASSWORD='<kamida 12 belgi>' \
  node --env-file=.env --import tsx src/bootstrap.ts
# texnik admin uchun: BOOTSTRAP_ROLE=super_admin qo‘shing
```

PowerShell varianti `docs/backend/README.md` 3-bandida (parol `Read-Host -AsSecureString` bilan).

### 4.4. Node bilan backend (Docker’siz API)

`npm run dev` `.env` ni **o‘zi yuklamaydi**. Ishlating: `node --env-file=.env --import tsx src/server.ts` (worker uchun `src/worker.ts`). Baza baribir Docker’dagi `db` (5433).

### 4.5. Muhit tuzoqlari

- **pnpm TTY:** agent shell’ida `pnpm install` `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` bilan to‘xtaydi. `CI=true` qo‘ying.
- **Vite birinchi tashrif:** dev server dependency’larni qayta optimallashtirib sahifani bir marta qayta yuklaydi. Birinchi Playwright urinishi 20 s timeout bilan yiqilishi mumkin. Bu ilova xatosi emas, qayta urining.
- **Playwright repo tashqarisidan:** `playwright` paketi faqat `backend/node_modules` da. Scratch skriptda `file:///D:/Ismoil/VScode/Frontend/Frontend/barpo-ai/backend/node_modules/playwright/index.mjs` dan import qiling. Brauzer: `chromium.launch({ channel: 'chrome' })`.
- **Telegram bot:** `backend/.env` da haqiqiy `@barpoai_bot` tokeni bor va lokal worker shu botni long-polling qiladi. Bir token bilan ikki joydan `getUpdates` qilish Telegram’da konfliktga olib keladi. Bot boshqa muhitda ham ishlasa, lokal worker’ni to‘xtating.
- **CSRF va origin:** cookie sessiyasidagi o‘zgartiruvchi so‘rov `Origin === APP_ORIGIN` (`http://localhost:5173`) talab qiladi. Frontendni boshqa portda ochsangiz `APP_ORIGIN` ni moslang. Bearer token bilan bu tekshiruv yo‘q, API skriptlari uchun Bearer qulay.
- **Shell:** Windows 11. Git Bash va PowerShell 5.1 bor. PowerShell 5.1 da `&&` yo‘q.
- **Juda uzun buyruq:** bitta bash buyrug‘iga juda katta heredoc berilsa `ENAMETOOLONG` chiqadi. Katta fayllarni fayl yozish vositasi bilan yozing.

---

## 5. Konfiguratsiya (env)

| O‘zgaruvchi | Kim ishlatadi | Default | Ma’no |
|---|---|---|---|
| `DATABASE_URL` | api, worker | majburiy | runtime rol `barpo_app` (NOSUPERUSER, NOBYPASSRLS) |
| `MIGRATION_DATABASE_URL` | migrate, bootstrap | — | ega rol `barpo_owner` |
| `DB_OWNER_PASSWORD`, `DB_APP_PASSWORD`, `DB_PORT` | compose | port 5433 | hex parol tavsiya etiladi (URL escaping muammosi bo‘lmasin) |
| `HOST`, `PORT` | api | 127.0.0.1, 3001 | Docker image’da `0.0.0.0` |
| `NODE_ENV` | api | — | `production` da cookie `Secure` va DB rol tekshiruvi |
| `APP_ORIGIN` | api | `http://localhost:5173` | CORS, CSRF origin, taklif havolasi bazasi |
| `TRUST_PROXY` | api | 0 | reverse proxy orqasida `1` |
| `RATE_LIMIT_PER_MINUTE` | api | 900 | IP bo‘yicha umumiy limit |
| `AUTH_RATE_LIMIT_PER_MINUTE` | api | marshrutga qarab | login 15, preview 30, register 10, reset 10 daqiqasiga; env berilsa hammasini almashtiradi |
| `STORAGE_DIR` | api | `./storage` | private fayllar (Docker’da `/app/storage` volume) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_LINK_TOKEN_TTL_SECONDS` | api, worker | —, `barpoai_bot`, 300 | bot |
| `BOOTSTRAP_LOGIN`, `BOOTSTRAP_PASSWORD`, `BOOTSTRAP_ROLE` | bootstrap | rol `platform_owner` | birinchi platforma hisobi |
| `COMPOSE_PROJECT_NAME` | compose | lokal `barpo` | 4.1-bo‘lim |
| `API_PROXY_TARGET` | vite.config | `http://localhost:3001` | dev proxy manzili (UI testi o‘z API’siga yo‘naltiradi) |
| `PLAYWRIGHT_CHANNEL` | ui-test | `chrome` | boshqa Chromium kanali |
| `VITE_API_URL` | frontend | bo‘sh | bo‘sh = bir xil origin; alohida domen bo‘lsa to‘ldiriladi va `APP_ORIGIN` moslanadi |

---

## 6. Backend arxitekturasi

### 6.1. So‘rov konveyeri (`http.ts`, `router`)

Har marshrut `add({...})` bilan ro‘yxatdan o‘tadi (`Endpoint` tipi: `method, path, summary, body, params, query, public, platform, recovery, passwordChange, permission, page, action, pageFor, adminOnly, idempotent, sensitive, rateLimit, session, handler`). Har so‘rovda tartib:

1. **Bitta DB tranzaksiyasi** (`transaction`): `SET LOCAL app.tenant_id`, `statement_timeout=15s`, `lock_timeout=5s`. `40001`/`40P01` da ko‘pi bilan 2 qayta urinish.
2. `body`, `params`, `query` **zod** bilan parse. `strictObject` noma’lum maydonni 400 bilan rad etadi.
3. **CSRF:** Bearer yo‘q, cookie bor va metod GET emas → `Origin` (yoki `Referer`) `APP_ORIGIN` ga teng bo‘lishi shart, aks holda `403 CSRF_ORIGIN_REJECTED`.
4. **Autentifikatsiya** (`public` bo‘lmasa): Bearer yoki `barpo_session` cookie → sessiya hashi, muddati, foydalanuvchi faolligi.
5. `must_change_password` bo‘lsa faqat `passwordChange` marshrutlari ochiq (`403 PASSWORD_CHANGE_REQUIRED`).
6. **Platforma marshruti** (`platform: [...]`): `tenant_id` NULL va rol ro‘yxatda bo‘lishi shart.
7. **Tenant marshruti:** `app.tenant_id` sessiyadan o‘rnatiladi. Client yuborgan tenant ID hech qachon ishlatilmaydi. `tenantAccess`: arxiv → `TENANT_ARCHIVED`, bloklangan → `TENANT_BLOCKED`. Bloklangan admin uchun faqat `recovery: true` marshrutlar ochiq (billing, support so‘rovi va hk).
8. `adminOnly` → faqat `tenant_admin`.
9. **Sahifa ruxsati:** `pageFor`/`page`/`permission` dan sahifa, metoddan amal (GET→read, DELETE→delete, PATCH→update, POST→ruxsat xaritasidagi amal) → `pageAllowed` (`403 PAGE_ACTION_FORBIDDEN`), keyin domen `permit` (`403 FORBIDDEN`).
10. `idempotent: true` → `Idempotency-Key` (8–128 belgi). Actor+kalit bo‘yicha advisory lock; so‘rov hashi va javob saqlanadi. Bir kalit + bir payload → avvalgi javob. Bir kalit + boshqa payload → `409 IDEMPOTENCY_CONFLICT`.
11. Handler bajariladi. `sensitive: true` va `prices.read` yo‘q bo‘lsa javobdan narx maydonlari kesiladi (`redactPrices`: `unit_price, unit_cost, total, material_total, work_total, value, value_delta, amount, price, monthly_price`).
12. `session: 'set'` → `access_token` cookie sifatida ham qo‘yiladi; `'clear'` → cookie o‘chiriladi.
13. COMMIT. Xatoda ROLLBACK va `{ error: { code, fields? }, request_id }`. 5xx javoblar `error_events` jadvaliga yoziladi (texnik panel).

Boshqa: Helmet; CORS faqat `APP_ORIGIN`; body limit 8 MiB; loglarda `authorization` va `cookie` redakt qilinadi; so‘rov body’si loglanmaydi.

### 6.2. Sessiya va xavfsizlik

- Token 32 bayt random (base64url). Bazada faqat **SHA-256 hash**. Sessiya 12 soat.
- Cookie `barpo_session`: httpOnly, SameSite=Lax, productionda Secure, `path=/`.
- Parol: scrypt N=131072, r=8, p=1, 16 bayt salt, format `scrypt$131072$8$1$salt$hash`. Foydalanuvchi topilmasa ham dummy hash tekshiriladi (timing himoyasi).
- Login identifikatori: login nomi (`[a-zA-Z0-9._-]{3,64}`, kichik harfga o‘tkaziladi) yoki telefon (`+998XXXXXXXXX` ga normalizatsiya).
- Parol almashtirish, rol yoki holat o‘zgarishi, deaktivatsiya va bloklash sessiyalarni bekor qiladi.
- Taklif tokeni 72 soat, reset tokeni 30 daqiqa, Telegram link tokeni 5 daqiqa. Hammasi bir martalik va hash bilan saqlanadi.
- Fayl yuklash: faqat JPEG/PNG, magic bayt tekshiruvi, ~5 MiB gacha (base64 ≤7 000 000 belgi), random storage kaliti, har yuklab olishda scope tekshiruvi. Public URL yo‘q.
- Excel import: ≤2 MiB siqilgan, ichki yozuv ≤10 MiB, jami ochilgan ≤20 MiB, `vbaProject`/`externalLinks` rad, formula katak rad, ≤2001 qator va ≤50 ustun.

### 6.3. Tenant izolyatsiyasi

- Operatsion jadvallarda **FORCE ROW LEVEL SECURITY** va `tenant_isolation` siyosati: `tenant_id = current_setting('app.tenant_id')`. Kontekst yo‘q bo‘lsa **0 qator**.
- Runtime rol `barpo_app`: NOSUPERUSER, NOBYPASSRLS, DDL yo‘q (`docker/init.sh`).
- Auth va platforma jadvallari (users, sessions, tenants, invites…) login oldidan kerak bo‘lgani uchun RLS’siz. Ularda server `tenant_id` predikatini majburiy qo‘yadi.
- Composite FK (`tenant_id` + id) chet kompaniya ID’sini bog‘lashga yo‘l qo‘ymaydi.
- Obyekt doirasi (`projectScope`): `tenant_admin` dan boshqa hamma faqat `project_assignments` dagi obyektlarni ko‘radi. Biriktirilmagan obyekt → **404** (403 emas, mavjudligi oshkor bo‘lmasin).
- Ombor doirasi (`accountScope`): `warehouse_manager` faqat `warehouse_assignments` dagi omborlar, `brigadier` faqat o‘z custody hisobi.

### 6.4. O‘zgarmas tarix

- `stock_ledger` va `journal_entries` da UPDATE/DELETE trigger bilan taqiqlangan (`IMMUTABLE_LEDGER`).
- Deferred constraint triggerlar commitda tekshiradi: ledger va `stock_balances` mosligi, jurnal balansi (debit − kredit = 0), oylik taqsimot = effective_quantity. Buzilsa `23514`.
- Xatoni tuzatish = **teskari (reversal) yozuv**. Smeta tahriri = yangi reviziya. Progress tuzatish = `progress_corrections`.
- Arxivlash (`archived_at`) bor, purge endpoint yo‘q.

---

## 7. Ruxsatlar modeli

### 7.1. Ikki qatlam

1. **Sahifa × CRUD** (29 sahifa × create/read/update/delete). Kompaniya admini har rol uchun `/app/permissions` sahifasida sozlaydi (`role_page_permissions`, optimistic `version`). `GET /v1/me/permissions` → `{role, version, pages, permissions}` — frontend menyusi va tugmalari shundan.
2. **Domen ruxsatlari** (29 ta, `module.action`). Har biri sahifa+amalga bog‘langan (`permissionPage`).

Sahifalar: `dashboard, projects, employees, estimates, stock, finance, tasks, reports, files, integrations, camera, billing, settings, permissions, audit` va 13 moliya ichki sahifasi `accounting_documents, invoices, bank_cash, counterparties, payroll, reconciliation, financial_reports, allocations, budgets, plan_actual, forecast, payment_requests, payment_calendar`, hamda `pricing` (narx varaqasi, Bosqich 4).

| Domen ruxsati | Sahifa / amal |
|---|---|
| projects.read / projects.write | projects / read, create |
| employees.manage | employees / update |
| estimates.read / import / edit | estimates / read, create, update |
| prices.read | finance / read |
| stock.read | stock / read |
| stock.receive, stock.send, stock.consume | stock / create |
| stock.accept, stock.review | stock / update |
| stock.reverse | stock / delete |
| finance.read / allocate / post / reverse | finance / read, create, create, delete |
| tasks.read / tasks.manage | tasks / read, update |
| reports.read / submit / review | reports / read, create, update |
| files.read / files.write | files / read, create |
| integrations.read, audit.read | o‘z sahifasi / read |
| pricing.read / pricing.write | pricing / read, create |

### 7.2. Bazaviy rol siyosati (`basePermissions`, muhandislik defaulti)

Hammaga umumiy: `projects.read, tasks.read, reports.read, files.read, files.write`.

| Rol | Qo‘shimcha |
|---|---|
| tenant_admin | barcha 29 ruxsat |
| foreman | stock.read, stock.review, tasks.manage, reports.submit, reports.review, estimates.read |
| brigadier | stock.read, stock.accept, stock.consume, reports.submit |
| warehouse_manager | stock.read, stock.receive, stock.send |
| financier | estimates.read, estimates.import, prices.read, finance.read, finance.allocate, pricing.read, pricing.write |
| accountant | estimates.read, prices.read, finance.read, finance.post, finance.reverse |
| manager | tasks.manage |
| platforma rollari | tenant ruxsati yo‘q |

Haqiqiy sahifa matritsasi (testdan olingan) `docs/backend/BARPO_ROLE_TEST_REPORT.md` da.

### 7.3. Baholash tartibi (`allowed`, `pageAllowed`)

1. Sessiya, faol foydalanuvchi, kompaniya holati.
2. `tenant_admin` → sahifa darajasida har doim ruxsat.
3. `permissions` sahifasi **faqat admin**, delegatsiya qilinmaydi (adminni bloklab qo‘yishdan himoya).
4. Individual **deny** (`permission_overrides`) har doim ustun.
5. Rolning sahifa `read=false` qoidasi sahifani butunlay yopadi (create/update/delete ham).
6. Individual **grant**, keyin rol×sahifa aniq qoidasi, keyin bazaviy rol.
7. Moliya ichki sahifalari: create uchun `allocations`, `budgets`, `payment_requests` → `finance.allocate`, qolganlari → `finance.post`; read → `finance.read`.
8. Domen o‘tish qoidalari alohida (masalan, o‘z sarfini o‘zi tasdiqlay olmaydi: `SELF_REVIEW_FORBIDDEN`).

Moliyaviy hujjat turi → sahifa (`financialPages`): allocation→allocations, purchase_order→payment_requests, supplier_invoice→invoices, opening_debt/equipment/service/reversal→accounting_documents, labor→payroll, payment/receipt/advance/cash_transfer→bank_cash. Hujjat ro‘yxati ham shu sahifa ruxsatlari bo‘yicha filtrlanadi.

Delegatsiya: admin bo‘lmagan foydalanuvchi o‘zida yo‘q ruxsatni boshqaga bera olmaydi (`DELEGATION_EXCEEDS_OWN_PERMISSIONS`). Tenant admin platforma vakolatini bera olmaydi.

Frontend `can(page, action)`: `tenant_admin` → true, aks holda `pages[page].read && pages[page][action]`. Ruxsatlar har 60 s va oyna fokusida qayta yuklanadi (`/v1/auth/me` + `/v1/me/permissions`). Cookie boshqa foydalanuvchiga o‘tsa query kesh tozalanadi.

---

## 8. Ma’lumotlar bazasi

To‘liq DDL: `docs/backend/BARPO_DATABASE_SPEC.md` (`npm run docs` migratsiyalardan qayta yaratadi). ERD: `BARPO_ERD.md`.

| Migratsiya | Nima qo‘shadi |
|---|---|
| 001_core | 46 jadval: tenants, users, sessions, invites, password_resets, tenant_aliases, plan_versions, subscriptions, billing_invoices, billing_entries, support_requests, projects, project_assignments, zones, permission_overrides, units, unit_conversions, catalog_categories, catalog_materials, materials, warehouses, warehouse_assignments, estimates, estimate_revisions, estimate_lines, estimate_months, import_previews, stock_accounts, stock_balances, stock_commands, stock_ledger, counterparties, cash_accounts, finance_documents, journal_entries, budgets, tasks, reports, progress_entries, files, integration_connections, integration_mappings, integration_inbox, outbox, idempotency_keys, audit_events; RLS |
| 002_page_permissions | role_page_permissions (15 asosiy sahifa CHECK), permission_versions |
| 003_invariants | manba FK, o‘zgarmas trial, projection va oy cheklovlari, arxivlash |
| 004_financial_page_permissions | sahifa CHECK ro‘yxatiga 13 moliya ichki sahifasi |
| 005_budget_version | budjet create/update ajratish, optimistic version |
| 006_identity_telegram_notifications | `users.phone`, `sessions.channel`, telegram_link_tokens, telegram_accounts (`chat_state` jsonb), telegram_bot_state, notifications |
| 007_project_profile | `projects`: code, address, customer_name, description, status; `users`: position, hired_at |
| 008_estimate_line_meta | `estimate_lines`: category, note, position |
| 009_material_requests | material_requests |
| 010_finance_workflow | payment_requests, payroll_periods, payroll_entries; `finance_documents`: due_date, reference; kontragent `employee` turi; `cash_accounts.account_number` |
| 011_tasks_reports_files | `tasks.description`, `files.task_id`, progress_corrections |
| 012_settings_support_diagnostics | `tenants`: address, phone, settings (jsonb); `support_requests`: response, responded_by, responded_at; error_events |
| 013_billing_credit_auto_invoice | billing_credits; `billing_invoices.source` (manual/auto); `billing_entries.created_by` nullable (worker yozuvlari uchun) |
| 014_project_zone_profile | `projects`: area_m2, image_file_id (kompozit FK → shu obyekt fayli); `zones`: kind (block/entrance/floor/other), floors_count (faqat block), version |
| 015_premises | premises (xonadonlar: zona, blok trigger bilan, tur, qavat, xonalar, maydon, arxiv, version; R2 unikal indekslari; RLS), `import_previews.kind`/`result` |
| 016_exchange_rates | exchange_rates (umumiy jadval, CBU USD kursi, RLS yo‘q) |
| 017_price_lists | price_lists (versiya, ustama, R1 qadamlari, USD kursi va sanasi, jamlar, `groups` jsonb), price_list_lines (xonadon snapshot‘i, tannarx, sotuv m², narx, USD); ikkalasi immutable + RLS; sahifa CHECK ro‘yxatiga `pricing` |

**Qoida:** qo‘llangan migratsiyani hech qachon tahrirlamang, faqat keyingi raqam (`018_*.sql`). Runner advisory lock bilan ishlaydi va `schema_migrations` ga yozadi. Qayta ishga tushirish no-op.

### 8.1. Holat va tur qiymatlari (CHECK)

| Jadval | Qiymatlar |
|---|---|
| tenants.status | pending, active, blocked, archived |
| projects.status | planning, active, paused, completed |
| zones.kind | block, entrance, floor, other (`floors_count` faqat block) |
| tasks.status | todo, in_progress, submitted, returned, accepted |
| reports.status / kind | submitted, returned, accepted / daily, weekly |
| estimate_lines.kind | material, labor, equipment, service |
| stock_commands.kind | opening, receipt, transfer, consumption, return, adjustment, reversal |
| stock_commands.status | pending, partial, posted, cancelled, disputed |
| finance_documents.kind | allocation, purchase_order, supplier_invoice, opening_debt, labor, equipment, service, payment, receipt, advance, cash_transfer, reversal |
| counterparties.kind | supplier, contractor, customer, employee |
| cash_accounts.kind | bank, cash |
| payment_requests.status | pending, approved, rejected, paid, cancelled |
| material_requests.status | pending, fulfilled, rejected, cancelled |
| payroll_periods.status | open, posted, closed |
| billing_entries.kind | payment, credit, refund |
| billing_credits.kind | overpayment, applied, manual |
| billing_invoices.source | manual, auto |
| support_requests.kind | support, plan_change |
| outbox.status | pending, done, dead |
| integration_connections.status | not_configured, healthy, stale, error |
| permission_overrides.effect | grant, deny |
| sessions.channel | bearer, cookie |

---

## 9. Domen modullari va biznes qoidalari

### 9.1. Onboarding, trial va SaaS billing

- Kompaniya `pending` yaratiladi. Taklif (72 soat) qayta chiqarilsa eskisi bekor bo‘ladi. Preview tokenni sarflamaydi.
- Signup atomik: tenant row lock → invite lock → `tenant_admin` + `active` + `trial_ends_at = now() + 14 kun`. Parallel ikki signup → bittasi o‘tadi, ikkinchisi `410 INVITE_UNAVAILABLE`. Kompaniyada bitta faol admin (partial unique indeks).
- **Trial yoki to‘lov tugashi avtomatik bloklamaydi** (2026-10-04 qarori). `accessState()` faqat ko‘rsatadi: `access_state` (pending, trial, paid, overdue, yoki blocked/archived), `covered_until`, `days_left`, `days_overdue`. Bloklash — platforma egasining qo‘lda qarori: `PATCH /v1/platform/tenants/{id}` (`status` active|blocked|archived, `version`, `reason`).
- Bloklash sessiyalar va takliflarni bekor qiladi. Bloklangan admin yangi login bilan faqat billing, support va profilga kiradi. To‘lov qo‘lda qo‘yilgan blokni avtomatik ochmaydi.
- Tarif versiyalari o‘zgarmas. Invoys narx snapshotini saqlaydi.
- **Avtomatik invoys** (2026-10-04 qarori): davr 30 kun (`PERIOD_DAYS`), zanjir `trial_ends_at` dan. Worker har 10 daqiqada `issueDueInvoices` ni chaqiradi: davr boshlanishiga ≤3 kun (`INVOICE_LEAD_DAYS`) qolganda bitta `source='auto'` invoys, `due_at = period_start`, adminga `billing.invoice` bildirishnomasi. Muddati o‘tsa bir martalik `billing.overdue`, blok yo‘q.
- **Ortiqcha to‘lov** rad etilmaydi: `payment` haqiqiy pulni to‘liq yozadi, ortiqchasi `billing_credits(overpayment)` ga tushadi. Kredit eng eski to‘lanmagan invoysga va keyingi avtomatik invoysga `billing_entries(kind='credit')` bilan qo‘llanadi. Qo‘lda `credit` va `refund` chegaralangan (`BILLING_AMOUNT_EXCEEDED`). Refund sof olingan puldan oshmaydi.
- Formulalar: qarz = `Σ max(0, invoys − qoplangan)` invoys kesimida; kredit qoldig‘i alohida; sof tushum = payment − refund; `paid_until` faqat to‘liq qoplangan uzluksiz davrlar zanjiri bilan uzayadi. **Foyda = `null`** (platforma xarajatlari modeli yo‘q; invoys yoki pulni foyda deb atamang).
- To‘lov provayderi yo‘q: `POST /v1/billing/checkout` → `503 PAYMENT_PROVIDER_NOT_CONFIGURED`.

### 9.2. Xodimlar va obyektlar

- Xodimni admin boshlang‘ich parol bilan yaratadi. Birinchi kirishda almashtirish majburiy (faqat me, logout, password ochiq).
- Parolni tiklash: admin bir martalik reset token chiqaradi (`/reset-password#token=…`, 30 daqiqa). Parol hech qachon qaytarilmaydi yoki ko‘rsatilmaydi.
- Deaktivatsiya: ochiq vazifa yoki custody qoldig‘i bo‘lsa `HANDOVER_REQUIRED`, `OPEN_TASKS_EXIST` yoki `STOCK_HANDOVER_REQUIRED`. Avval vazifani boshqaga biriktirish va materialni qaytarish kerak.
- Adminlikni topshirish: `POST /v1/company/ownership` — atomik, ikkala tomonning sessiyasi bekor qilinadi. Oddiy xodim API admin’ni o‘zgartira olmaydi. O‘z rolini o‘zgartirish taqiqlangan (`SELF_ROLE_CHANGE_FORBIDDEN`).
- Obyekt: nom, kod, manzil, buyurtmachi, tavsif, holat, `area_m2`, rasm (`image_file_id` — faqat shu obyektga yuklangan JPEG/PNG fayl), `planned_end` (o‘zgarmas boshlang‘ich reja) va `forecast_end` (hisobotdan); tugash sanasi boshlanishdan oldin bo‘lsa `DATE_RANGE_INVALID` (400). PATCH to‘liq almashtirish rejimida: yuborilmagan ixtiyoriy maydon `null` bo‘ladi (`status` joriy qiymatini saqlaydi); rasm fayli arxivlansa havola avtomatik tozalanadi. Zonalar daraxt shaklida, parent o‘zgarmas; tur `kind` (block/entrance/floor/other), `floors_count` faqat blok uchun, tahrir `version` bilan (`zone.create`/`zone.update` audit). Brigadir obyektga biriktirilganda custody hisobi avtomatik ochiladi.

### 9.3. Smeta

- Approval **yo‘q**. Finansist yaratadi va import qiladi. Uning tahrir/o‘chirish huquqi default yopiq, admin grant bersa ochiladi.
- Qator turi: material (`material_id` majburiy), labor, equipment, service.
- `effective_quantity` = qo‘lda `quantity` yoki `norm × work_quantity`; ikkalasiga `× (1 + loss_percent/100)`. `total = round(effective_quantity × unit_price, 2)`. Oylik taqsimot ixtiyoriy: oy boshi sanasi, unique, yig‘indisi = effective_quantity.
- Tahrir = **yangi o‘zgarmas reviziya**. Eski qatorlar arxivga o‘tadi, fakt va progress FK’lari buzilmaydi. Reviziya 1 = boshlang‘ich reja.
- Excel: `inspect` (sarlavha va namuna, hech narsa saqlanmaydi) → `preview` (mapping, validatsiya) → `commit` (yangi smeta; eskisini almashtirmaydi). Topilmagan nomlar qator raqami bilan qaytadi (`IMPORT_NAMES_UNRESOLVED`).
- Birlik: material o‘z bazaviy birligida. Faqat o‘lchami mos konvertatsiya (`t↔kg`), aks holda `UNIT_CONVERSION_REQUIRED`.
- Reja–fakt: miqdor va qiymat alohida. Reja 0 bo‘lsa foiz `null`. Material sarfi foizi ish bajarilishi foizi emas.

### 9.4. Ombor (eng nozik modul)

Hisoblar (`stock_accounts`): ombor hisobi yoki brigadir custody hisobi. Qoldiq: `quantity` (book), `reserved`, `available = book − reserved`, `value`.

| Komanda yoki amal | Kim | Ta’sir |
|---|---|---|
| opening / receipt | `stock.receive` (ombor mudiri) | book va qiymat oshadi; jurnal inventory ← opening_equity yoki clearing |
| transfer | `stock.send` (ombor mudiri) | `pending`; manbada `reserved` oshadi, book o‘zgarmaydi |
| action `accept` (transfer, qisman mumkin) | qabul qiluvchi brigadir (`stock.accept`) | qabul qilingani manbadan chiqib custody’ga kiradi; qolgani rezervda (`partial`) |
| consumption | brigadir (`stock.consume`) | custody’da rezerv; xarajat **hali yo‘q** |
| action `review` (consumption) | prorab (`stock.review`), o‘zi yaratmagan bo‘lsa | rezervdan chiqim, ledger, jurnal expense ← inventory |
| return + action `accept` | brigadir yaratadi, ombor qabul qiladi (`stock.receive`) | material custody’dan omborga o‘tadi |
| action `cancel` / `dispute` | transfer: `stock.send`; return: `stock.consume`; consumption: `stock.review` | cancel qolgan rezervni bo‘shatadi (qabul qilingani bekor bo‘lmaydi); dispute → `disputed`, rezerv saqlanadi |
| reverse | `stock.reverse` | teskari yozuv; keyin sarflangan bo‘lsa rad (`REVERSAL_STOCK_ALREADY_USED`) |
| reconcile (inventarizatsiya) | `stock.reverse` | haqiqiy sanoq − book farqiga adjustment; rezervlar avval hal qilinsin (`RESERVATIONS_MUST_BE_RESOLVED`) |
| minimum | `stock.send` | minimal qoldiq; pastga tushsa `stock.low` bildirishnomasi |

Hamma amal `version` (optimistic) va `Idempotency-Key` bilan. Parallel jo‘natishlar mavjud qoldiqdan oshmaydi (`INSUFFICIENT_AVAILABLE_STOCK`).

**Namunaviy hisob** (100 dona × 10 000 so‘m):

| Amal | Book | Rezerv | Erkin | Brigadirda | Tasdiqlangan sarf |
|---|---:|---:|---:|---:|---:|
| Boshlang‘ich | 100 | 0 | 100 | 0 | 0 |
| 30 jo‘natildi | 100 | 30 | 70 | 0 | 0 |
| 20 qabul qilindi | 80 | 10 | 70 | 20 | 0 |
| 15 sarf taklifi | 80 | 10 | 70 | 20 (15 rezerv) | 0 |
| Prorab tasdiqladi | 80 | 10 | 70 | 5 | 15 (150 000 so‘m xarajat) |
| 10 qoldiq bekor | 80 | 0 | 80 | 5 | 15 |

Tannarx: har hisob/material uchun **harakatlanuvchi o‘rtacha narx** (tasdiqlanmagan muhandislik tavsiyasi; FIFO ochiq qaror). Chiqim qiymati `round(value / qty × chiqim, 2)`, oxirgi to‘liq chiqim qolgan qiymatni to‘liq oladi.

Material so‘rovi (`material_requests`): brigadir so‘raydi (qoldiq o‘zgarmaydi) → ombor mudiri `fulfill` (transfer yaratadi), `reject` yoki `cancel`. Telegram orqali ham yuboriladi.

### 9.5. Moliya (ichki boshqaruv jurnali, soliq buxgalteriyasi emas)

| Hujjat | Debit | Kredit | Xarajatmi |
|---|---|---|---|
| allocation / purchase_order | — | — | yo‘q (jurnal yozuvi yo‘q) |
| opening (ombor) | inventory | opening_equity | yo‘q |
| goods receipt | inventory | clearing | yo‘q |
| supplier_invoice (kirimga bog‘langan) | clearing | payable | yo‘q |
| material consumption (tasdiq) | expense | inventory | **ha** |
| labor / equipment / service | expense | payable | **ha** |
| payment (yetkazib beruvchiga) | payable | cash | yo‘q |
| advance | advance | cash | yo‘q |
| receipt (mijozdan) | cash | income | yo‘q |
| cash_transfer | target cash | source cash | yo‘q (sof 0) |

Qoidalar:
- `supplier_invoice` bitta kirimga to‘liq bog‘lanadi (`RECEIPT_MATCH_REQUIRED`). Summa kirim qiymatiga teng bo‘lishi kerak, aks holda `PRICE_ADJUSTMENT_REQUIRED` (narx farqini taqsimlash hali yozilmagan).
- `payment` invoysga allokatsiya qilinadi (`PAYMENT_ALLOCATION_REQUIRED`), qoldiqdan oshmaydi (`OVERPAYMENT_USE_ADVANCE`), boshqa obyekt yoki kontragentga ulanmaydi.
- Reversal manba sahifasining **delete** ruxsatini talab qiladi. Bog‘langan to‘lov yoki invoys avval qaytarilsin (`REVERSE_PAYMENTS_FIRST`, `REVERSE_MATCHED_INVOICE_FIRST`).
- Ko‘rsatkichlar: obyekt tannarxi = Σ expense; sof pul oqimi = Σ cash; yetkazib beruvchi qarzi = −Σ payable; avans = Σ advance; daromad = −Σ income.
- To‘lov so‘rovi: `pending` → approve, reject, cancel; `approved` → pay, reject, cancel. `pay` payment hujjati yaratadi va bank/kassa hisobidan chiqaradi.
- Ish haqi: oylik davr (`open`) → xodim yozuvlari (oklad, bonus, ushlanma, qo‘lga; manfiy bo‘lmaydi) → `post` (har xodim uchun `labor` xarajati va qarz, kontragent `employee` avtomatik) → `pay` (payment bilan yopiladi).
- Budjet obyekt bo‘yicha oylik, optimistic version. Prognoz 3 oylik o‘rtacha xarajatdan.

### 9.6. Vazifalar va hisobotlar

- Vazifa: `todo → in_progress → submitted → accepted`; `submitted → returned` (sabab majburiy, `RETURN_REASON_REQUIRED`); `returned → in_progress | submitted`. Bajaruvchi boshlaydi va yuboradi; tekshiruvchi yoki admin qabul qiladi yoki qaytaradi. Bajaruvchi va tekshiruvchi bir odam bo‘lishi mumkin emas. Yuborilgan yoki qabul qilingan vazifa tahrirlanmaydi (`TASK_LOCKED`).
- Hisobot: kunlik yoki haftalik, `submitted → accepted | returned`, `returned → submitted` (qayta yuborish). Qabulda ish qatori (material emas) uchun `progress_entries` **bir marta** yoziladi va `forecast_end` yangilanadi; `planned_end` o‘zgarmaydi. Qabul ombor sarfini qayta yozmaydi.
- Qabul qilingan progressni tuzatish: `POST /v1/progress-entries/{id}/corrections` — ishorali farq + sabab, asl yozuv o‘zgarmaydi, fakt hisoblariga qo‘shiladi.
- Fotolar hisobot yoki vazifaga biriktiriladi. Qabul qilingan hisobotga foto qo‘shish yoki o‘chirish mumkin emas (`REPORT_FILE_LOCKED`).

### 9.7. Bildirishnomalar, worker va Telegram

- `notify()`: `notifications` ga yozadi va `outbox` ga Telegram vazifasini qo‘yadi (dedup kaliti bilan). Kompaniya sozlamasida toifa (`tasks`, `reports`, `stock`, `finance`) o‘chirilgan bo‘lsa ilova ichidagi yozuv qoladi, outbox darhol `done/DISABLED_BY_SETTINGS`. Toifa `kind` prefiksidan olinadi: `task.*`, `report.*`/`progress.*`, `stock.*`, `payment.*`. Qolganlari (`support.response`, `billing.*` va hk) har doim yuboriladi.
- Worker sikli (5 s): har faol kompaniya va platforma uchun bitta outbox vazifasi (`SKIP LOCKED`). Telegram ulanmagan → `done/NO_TELEGRAM`. Xato → eksponensial backoff (≤1 soat), 8 urinishdan keyin `dead`. Har 10 daqiqada: deadline eslatmalari (24 soat qolganda va muddati o‘tganda, kuniga bir marta) va `issueDueInvoices`. Bot long polling alohida siklda.
- Telegram ulash: `POST /v1/integrations/telegram/link` → `https://t.me/barpoai_bot?start=<token>` (5 daqiqa, bir martalik). Bot `/start <token>` ni atomik sarflaydi. Bitta Telegram akkaunt bitta foydalanuvchiga (`TELEGRAM_ACCOUNT_IN_USE`).
- Bot menyusi rolga qarab, uz yoki ru (Telegram tilidan): obyektlar, vazifalar, hisobotlar, ombor/kam qolgan material, material so‘rovlari, moliya, bildirishnomalar, profil; platforma egasi uchun mijozlar va qarzdorlar; support va super_admin uchun murojaatlar. Buyruqlar: `/start`, `/menu`, `/profile`, `/tasks`, `/notifications`, `/help`. Har amal bazadagi ruxsat bilan qayta tekshiriladi.
- Ko‘p qadamli oqimlar (`telegram_accounts.chat_state`): material so‘rovi (obyekt → material → miqdor → izoh) va progress (obyekt → ish qatori → miqdor → matn → rasm) → kunlik hisobot.
- Telegram yetkazish exactly-once emas (yuborilgandan keyin crash bo‘lsa takrorlanishi mumkin). Biznes ta’sirlari esa takrorlanmaydi.

### 9.8. Dashboard, eksport, audit, texnik panel, integratsiyalar

- `GET /v1/dashboard` → `{generated_at, projects, tasks, reports, stock, finance, employees}`. Har blok faqat ruxsat bo‘lsa, aks holda `null` (yolg‘on nol yo‘q). Hisoblash manbalari `docs/backend/BARPO_DASHBOARD_METRICS.md` da. Progress faqat qabul qilingan hisobotlardan, material sarfi progress emas.
- Excel eksportlar `{filename, mime_type, base64}` qaytaradi va har biri auditga yoziladi: smeta, reja–fakt (qatorlar, zonalar, oylar), vazifalar, ombor qoldiqlari, audit (≤5000). Narx huquqi bo‘lmasa summa ustunlari yo‘q. PDF keyingi bosqich.
- Audit: kompaniya admini uchun; `action` prefiksi, ijrochi va sana filtrlari.
- Texnik panel (`/admin/diagnostics`, super_admin va support): baza latency va oxirgi migratsiya, outbox (pending, dead, 24 soat), so‘nggi 5xx xatolar, sessiyalar, Telegram, kompaniyalar holati. Tenant moliyasi ochilmaydi. CPU, RAM va backup hosting bilan keladi.
- Integratsiyalar (UySot, bank, Didox, iHamkor, kamera, SaaS to‘lov): **provayder kirishi yo‘q**, holat halol `not_configured`. Ishlayapti deb ko‘rsatilmaydi va 0 bilan to‘ldirilmaydi. Adapter kontrakti va inbox/outbox semantikasi `BARPO_INTEGRATIONS.md` da.

---

## 10. API katalogi

Baza `/v1`. 141 operatsiya, 106 yo‘l. Runtime kontrakt `GET /openapi.json` (route registridan generatsiya). Fayl ko‘rinishi `docs/backend/BARPO_API_OPENAPI.yaml` (`npm run docs`). Har operatsiyada `x-permission` (domen ruxsati, `authenticated` yoki platforma rollari).

Umumiy shartlar: auth cookie yoki `Authorization: Bearer <token>`; o‘zgartiruvchi so‘rovda `Idempotency-Key` (UUID); pul va miqdor string; ro‘yxat `{items:[...]}`, `limit` (≤100, default 30) va `offset`; xato `{error:{code, fields?}, request_id}`.

```text
# Tizim
GET  /health/live   GET /health/ready   GET /openapi.json

# Auth va o‘zim
POST /v1/auth/login [public]            POST /v1/auth/invites/preview [public]
POST /v1/auth/register [public]         POST /v1/auth/reset [public]
POST /v1/auth/telegram/login [public]   GET  /v1/auth/me
POST /v1/auth/logout                    POST /v1/auth/password
PATCH /v1/auth/profile                  GET  /v1/me/permissions
GET  /v1/me/notifications               POST /v1/me/notifications/read   (ids=[] → hammasi)
POST /v1/integrations/telegram/link     GET|DELETE /v1/integrations/telegram

# Platforma (boshqasi ko‘rsatilmasa platform_owner)
GET|POST  /v1/platform/tenants          GET|PATCH /v1/platform/tenants/{id}
POST /v1/platform/tenants/{id}/invites  POST /v1/platform/tenants/{id}/alias
GET|POST  /v1/platform/plans            POST /v1/platform/subscriptions
GET|POST  /v1/platform/billing/invoices POST /v1/platform/billing/entries
GET  /v1/platform/billing/summary
GET  /v1/platform/support, PATCH /v1/platform/support/{id}   (support | platform_owner | super_admin)
GET  /v1/platform/diagnostics                                 (super_admin | support)
GET|POST /v1/platform/staff                                   (super_admin)

# Kompaniya, xodimlar, obuna
GET|PATCH /v1/company (settings)        POST /v1/company/ownership (employees.manage)
GET|POST  /v1/company/role-permissions  (faqat admin)
GET|POST  /v1/employees                 GET|PATCH /v1/employees/{id}
POST|DELETE /v1/employees/{id}/assignments
POST /v1/employees/{id}/permissions     POST /v1/employees/{id}/reset
GET  /v1/billing (recovery)             POST /v1/support-requests (recovery)
POST /v1/billing/checkout → 503

# Obyektlar, katalog
GET|POST /v1/projects                   GET|PATCH|DELETE /v1/projects/{id}
GET|POST /v1/projects/{id}/zones        GET /v1/projects/{id}/dashboard (finance.read)
PATCH /v1/projects/{id}/zones/{zone_id} (nom, tur, qavatlar; version)
GET  /v1/projects/{id}/work-lines (reports.read, narxsiz)
GET  /v1/catalog                        GET|POST /v1/materials

# Narx varaqasi (pricing sahifasi, sensitive; eksport prices.read talab qiladi; tenant_admin va financier)
GET|POST /v1/pricing/price-lists        GET /v1/pricing/price-lists/{id} (sahifalash, q, kind)
GET  /v1/pricing/price-lists/{id}/export?currency=UZS|USD (audit export.price_list)

# Ombor
GET|POST /v1/warehouses                 POST /v1/stock/custody
GET  /v1/stock/accounts                 GET  /v1/stock/accounts/{id}/balances
POST /v1/stock/accounts/{id}/minimum    POST /v1/stock/accounts/{id}/reconcile
GET  /v1/stock/overview                 GET  /v1/stock/overview/export
GET|POST /v1/stock/commands             POST /v1/stock/commands/{id}/actions   (accept | review | cancel | dispute)
POST /v1/stock/commands/{id}/reverse    GET  /v1/stock/ledger
GET|POST /v1/stock/requests             POST /v1/stock/requests/{id}/actions   (fulfill | reject | cancel)

# Smeta
GET|POST /v1/estimates                  GET|PATCH|DELETE /v1/estimates/{id}
GET  /v1/estimates/{id}/revisions       GET  /v1/estimates/{id}/revisions/{revision}
GET  /v1/estimates/{id}/export
POST /v1/estimate-imports/inspect       POST /v1/estimate-imports/preview
POST /v1/estimate-imports/{id}/commit

# Moliya
GET|POST /v1/counterparties             PATCH /v1/counterparties/{id}
GET  /v1/counterparties/{id}/statement
GET|POST /v1/cash-accounts              PATCH /v1/cash-accounts/{id}
GET|POST /v1/finance/documents          POST /v1/finance/documents/{id}/reverse
GET  /v1/finance/summary | cash-balances | payables | calendar | forecast | reports
GET  /v1/finance/plan-actual            GET  /v1/finance/plan-actual/export
GET|POST /v1/finance/payment-requests   POST /v1/finance/payment-requests/{id}/actions (approve | reject | cancel | pay)
GET  /v1/finance/payroll                POST /v1/finance/payroll/periods
POST /v1/finance/payroll/periods/{id}/entries    POST /v1/finance/payroll/periods/{id}/post
DELETE /v1/finance/payroll/entries/{id}          POST /v1/finance/payroll/entries/{id}/pay
GET|POST|PATCH /v1/budgets

# Ish
GET|POST /v1/tasks                      GET|PATCH|DELETE /v1/tasks/{id}
POST /v1/tasks/{id}/transition          GET  /v1/tasks/export
GET|POST /v1/reports                    GET|DELETE /v1/reports/{id}
POST /v1/reports/{id}/review            POST /v1/reports/{id}/resubmit
POST /v1/progress-entries/{id}/corrections
GET|POST /v1/files                      GET|DELETE /v1/files/{id}

# Boshqa
GET  /v1/dashboard   GET /v1/integrations   GET /v1/audit   GET /v1/audit/export
```

### 10.1. Asosiy xato kodlari

| HTTP | Kodlar |
|---|---|
| 400 | VALIDATION_ERROR (`fields:[{path,message}]`), INVALID_INPUT, DATE_RANGE_INVALID, IDEMPOTENCY_KEY_REQUIRED, RETURN_REASON_REQUIRED, INVALID_ACCEPTANCE_QUANTITY, WORKBOOK_LIMIT, FORMULAS_NOT_ALLOWED, UNSAFE_WORKBOOK, FILE_SIGNATURE_INVALID, FILE_SIZE_INVALID, PAYMENT_ALLOCATION_REQUIRED, RECEIPT_MATCH_REQUIRED |
| 401 | UNAUTHORIZED, INVALID_CREDENTIALS, INVALID_TELEGRAM_SIGNATURE |
| 403 | FORBIDDEN, PAGE_ACTION_FORBIDDEN, TENANT_BLOCKED, TENANT_ARCHIVED, PASSWORD_CHANGE_REQUIRED, CSRF_ORIGIN_REJECTED, SELF_REVIEW_FORBIDDEN, DELEGATION_EXCEEDS_OWN_PERMISSIONS |
| 404 | NOT_FOUND (biriktirilmagan obyekt yoki ombor va chet kompaniya ID’si ham) |
| 409 | VERSION_CONFLICT, IDEMPOTENCY_CONFLICT, INVALID_TRANSITION, PRICE_LIST_NO_PREMISES, PRICE_LIST_NO_COSTS, PRICE_LIST_NO_RATE, PREMISE_NUMBER_CONFLICT, INSUFFICIENT_AVAILABLE_STOCK, INVARIANT_VIOLATION, PRICE_ADJUSTMENT_REQUIRED, HANDOVER_REQUIRED, OPEN_TASKS_EXIST, REVERSAL_STOCK_ALREADY_USED (`invariant` ning default statusi 409) |
| 410 | INVITE_UNAVAILABLE, PREVIEW_EXPIRED |
| 429 | RATE_LIMITED |
| 503 | PROVIDER_NOT_CONFIGURED, PAYMENT_PROVIDER_NOT_CONFIGURED, TELEGRAM_NOT_CONFIGURED |

Frontend `errorMessage(t, code, status)` avval `error.<CODE>` lokal kalitini qidiradi, topilmasa statusga qarab umumiy matn beradi. Foydalanuvchiga ko‘rinadigan yangi xato kodi qo‘shsangiz, ikkala lokalga `error.<CODE>` qo‘shing.

---

## 11. Testlar va oxirgi natijalar

| Buyruq (`backend` papkasida) | Nima qiladi | 2026-10-07 natija |
|---|---|---|
| `npm run build` | `tsc` → `dist/` | o‘tdi |
| `npm test` | unit: decimal arifmetika, norma/yo‘qotish, DTO, scrypt, Telegram imzo, Excel parse, telefon, trial, bot, bildirishnoma toifasi, billing davri | 11/11 |
| `npm run test:integration` | vaqtinchalik `postgres:17-bookworm` (tasodifiy port), migratsiya 2 marta, `barpo_app` NOBYPASSRLS, `app.inject` bilan to‘liq biznes ssenariy, poyga va retry | 34/34 |
| `npm run test:roles` | 2 kompaniya, 10 rol; 63 GET endpoint × 10 rol `/v1/me/permissions` bilan; chet kompaniya ID’lari; narx redaksiyasi; idempotent takrorlar | 5/5 blok, 0 nomuvofiqlik |
| `npm run test:ui` | vaqtinchalik PostgreSQL + API + Vite + Headless Chrome; platforma egasidan barcha rollargacha to‘liq oqim | 37/37, brauzer xatosi yo‘q |
| `npm run test:docker` | `barpo-backend:local` image (oldin `docker build -t barpo-backend:local .`): init skript, migratsiya, non-root API, health, OpenAPI, auth’siz rad | 6/6 |
| `frontend` da `pnpm typecheck`, `pnpm build` | `tsc -b`, Vite build | o‘tdi |

Shuningdek jonli stackda qo‘lda tekshirildi: owner login, cookie va CSRF, kompaniya + taklif + admin signup, ruxsatlar; brauzerda owner dashboard, mijozlar, admin ish maydoni, obyektlar va ruxsatlar sahifasi. API 5xx yo‘q.

Muhim:
- Testlar mavjud bazaga **tegmaydi**. Har biri o‘z konteynerini yaratib, oxirida o‘chiradi.
- Testlar **tracked fayllarni qayta yozadi** (`docs/backend/` ichida): `verification.json`, `role-verification.json`, `BARPO_ROLE_TEST_REPORT.md`, `ui-verification.json`, `platform-tenant-ui.png`, `docker-verification.json`. UI testi xatoda `ui-failure-N.png` yozadi. Test yurgizgandan keyin `git status` da shular ko‘rinadi.
- `test:ui` uchun Google Chrome va `frontend/` dagi dependency’lar (`pnpm install`) kerak. U `frontend/src/lib/permissions.ts` ni import qilib menyuni server ruxsati bilan solishtiradi.
- Yangi GET endpoint `test:roles` matritsasiga avtomatik tushadi. Yo‘l parametrini skript to‘ldira olmasa hisobotda “matritsadan tashqari” (`unfillable`) chiqadi. `scripts/role-tests.ts` dagi `fillUrl` ni to‘ldiring.
- Yangi biznes qoidasi uchun test yozish talab qilinadi (CLAUDE.md, 4-band).

---

## 12. Frontend tafsilotlari

### 12.1. Marshrutlar

| Yo‘l | Guard | Sahifa |
|---|---|---|
| `/` | — | `homeFor(role)` ga yo‘naltirish |
| `/login`, `/register#token=…`, `/forgot-password`, `/reset-password#token=…` | `RedirectIfAuthed` | auth; token URL **fragmentida**, log va refererga tushmasin |
| `/change-password` | `RequireAuth` | boshlang‘ich parolni almashtirish |
| `/profile`, `/notifications` | `RequireAuth` | profil (til, Telegram ulash), bildirishnomalar |
| `/app/*` | `RequireAuth platform={false}` + `RequirePage` | kompaniya sahifalari (`pageRoutes`) |
| `/app/projects/:id`, `/app/estimates/:id`, `/app/estimates/new` (create), `/app/estimates/:id/edit` (update) | `RequirePage` | tafsilot va muharrir |
| `/admin`, `/admin/tenants`, `/admin/tenants/:id`, `/admin/plans`, `/admin/billing`, `/admin/debtors`, `/admin/support`, `/admin/staff`, `/admin/diagnostics` | `RequireAuth platform` | platforma |

`homeFor`: parol almashtirilmagan → `/change-password`; `platform_owner` → `/admin`; `super_admin` va `support` → `/admin/support`; kompaniya rollari → `/app`. Kompaniya bloklangan bo‘lsa (`issue`) faqat `billing` ochiq.

`pageRoutes`: dashboard `/app`; projects, employees, estimates, stock, tasks, reports, files, integrations, camera, billing, settings, permissions, audit → `/app/<nom>`; moliya `/app/finance` va `/app/finance/{documents, invoices, bank-cash, counterparties, payroll, reconciliation, reports, allocations, budgets, plan-actual, forecast, payment-requests, payment-calendar}`.

Sidebar (`tenantNav`) uch guruh: Asosiy (dashboard, obyektlar, smetalar, vazifalar, hisobotlar, ombor), Moliya (14 band), Admin (xodimlar, ruxsatlar, obuna, kamera, integratsiyalar, audit, sozlamalar). Band faqat `can(page, 'read')` bo‘lsa ko‘rinadi. Yorliq `t('page.<kalit>')`. Platforma menyusi `platformNav`, yorliq `t('nav.<kalit>')`.

### 12.2. Sahifalar (`frontend/src/features`)

| Papka | Nima qiladi |
|---|---|
| auth | login (login yoki telefon), taklif bilan ro‘yxat, parolni almashtirish va tiklash |
| dashboard | rolga mos bosh sahifa; `null` bloklar ko‘rsatilmaydi |
| projects | ro‘yxat, yaratish, karta (zonalar, xodimlar, omborlar, tahrir, arxiv) |
| employees | ro‘yxat, yaratish, karta, biriktirish, reset havolasi, individual ruxsat, adminlikni topshirish |
| estimates | ro‘yxat, Excel-ko‘rinishidagi muharrir (jonli validatsiya, oylik taqsimot), karta (guruhlar, reja/fakt, reviziyalar), Excel import ustasi, eksport |
| stock | qoldiqlar, ledger, harakatlar, material so‘rovlari, katalog; kirim, jo‘natish, sarf, qaytarish, inventarizatsiya, minimal qoldiq modallari; qabul, tasdiq, bekor, dispute, reversal |
| finance | `pages.tsx`: hub (yig‘ma), hujjatlar, kontragentlar (solishtirish), budjetlar, solishtirish; `workflow.tsx`: to‘lov so‘rovlari, kalendar, ish haqi, reja–fakt, prognoz, moliyaviy hisobotlar |
| work | vazifalar (kanban va jadval, o‘tishlar, fayllar, tarix), hisobotlar (kunlik/haftalik, foto, tekshirish, progress tuzatish) |
| files, audit, notifications, settings, integrations (+ kamera) | ro‘yxatlar va sozlamalar; integratsiyalar halol `not_configured` |
| permissions | rol × sahifa CRUD matritsasi (faqat admin) |
| billing | kompaniya obunasi, invoyslar, kredit, keyingi invoys sanasi, yordam so‘rovi |
| platform | `pages.tsx` (eng katta fayl, 1814 qator): platforma dashboard, kompaniyalar va karta, taklif, tarif, invoys, to‘lov, qarzdorlar, murojaatlar, texnik xodimlar, diagnostika |
| profile | ism va telefon, til, Telegram deep link |
| common | `ExportButton`, `ProjectSelect` |

### 12.3. Frontend qoidalari

- Server holati TanStack Query bilan (staleTime 15 s, fokusda refetch, 500 dan past statusda retry yo‘q). Formalar RHF + Zod.
- Har mutatsiya `api()` orqali, Idempotency-Key avtomatik. Bitta biznes amalni qayta urinishda bir xil kalitni saqlash hali to‘liq qilinmagan (BACKEND_TODO, 06-bosqich).
- Pul `formatMoney(string)` bilan ko‘rsatiladi. Yig‘indini frontendda hisoblamang, serverdan oling.
- Har sahifada loading, empty va error holati bo‘lsin. O‘chirishdan oldin `ConfirmDialog`.
- Dizayn: bordo (`--brand-900 #33081c` … `--brand-50 #fbf4f6`), oq, och kulrang fon `#f5f6f8`, Geist shrifti, sidebar 248 px, topbar 60 px. Yangi rang yoki UI kutubxona qo‘shmang, `tokens.css` dan foydalaning.
- `frontend/legacy/` dan import qilmang. U faqat dizayn va matn manbasi.

---

## 13. Ish retseptlari

**Yangi endpoint.** Tegishli `routes-*.ts` da `add({ method, path, summary, body/params/query (zod strictObject), permission yoki page+action, idempotent (yozuv uchun true), sensitive (narx bo‘lsa), handler })`. Handler `ctx.db` (tranzaksiya ichida) va `ctx.actor` bilan ishlaydi. Obyektga oid bo‘lsa `projectScope`, ombor hisobi bo‘lsa `accountScope`. Holat o‘zgarsa `version` tekshiruvi va `audit()`. Keyin `npm run docs`, `npm run test:roles` va kerak bo‘lsa integration testga qadam qo‘shing.

**Yangi migratsiya.** `backend/migrations/018_<nom>.sql`. Kompaniya jadvali bo‘lsa `tenant_id`, FORCE RLS va `tenant_isolation` siyosati (001 dagi `format(...)` naqshi). Pul `numeric(20,2)`, miqdor 6 xonali. Keyin `npm run docs` (DATABASE_SPEC qayta yaratiladi) va integration test.

**Yangi kompaniya sahifasi.** Backend `pages` + yangi migratsiyada `role_page_permissions` sahifa CHECK ro‘yxatini kengaytirish → frontend `pages`, `pageRoutes`, `tenantNav`, `App.tsx` dagi `tenantPages` → ikkala lokalda `page.<kalit>`. `pages` backend va frontendda bir xil bo‘lishi shart, `test:ui` buni tekshiradi.

**Yangi UI matni.** Kalitni tegishli `frontend/src/locales/<modul>.uz.ts` va `.ru.ts` ga bir xil nom bilan qo‘shing. Ishlatish: `t('key', { var })`.

---

## 14. Holat va yo‘l xaritasi (`docs/BACKEND_TODO.md` bo‘yicha)

| Bosqich | Holat |
|---|---|
| 01 Talablar va hisob qoidalari | **ochiq**: ekran↔API jadvali, tarif narx/limit, trial tartibi, tannarx usuli, saqlash muddati, ish haqi va prognoz qoidalari, provayderlar ro‘yxati |
| 02 Baza va API asosi | asos bor; **ochiq**: qat’iy javob DTO’lari, qidiruv/filtr/sahifalash bo‘shliqlari |
| 03 Login, taklif, ruxsatlar | bajarilgan (2026-10-04); **ochiq**: admin tiklashda shaxsni tekshirish, sessiya tugashi va bloklanishda har rolni to‘g‘ri sahifaga qaytarishni tekshirish |
| 04 Kompaniya, xodim, obyekt | bajarilgan (zona tahriri, obyekt maydoni va rasmi — 2026-10-10); **ochiq**: API’da yo‘q boshqa amallar |
| 05 Smeta | bajarilgan; **ochiq**: reviziyalararo barqaror ish qatori identifikatori, obyekt/zona bo‘yicha boshlang‘ich va joriy reja–fakt |
| 06 Ombor | bajarilgan; **ochiq**: retry’da bir xil Idempotency-Key saqlash (frontend) |
| 07 Moliya | bajarilgan; **ochiq**: invoys narx farqini taqsimlash, bitta invoys–ko‘p kirim, avansni invoysga hisoblash |
| 08 Vazifa, hisobot, foto | bajarilgan; **ochiq**: fayl skaneri, rasmni qayta kodlash, yetim fayllarni tozalash |
| 09 Dashboard va qolgan sahifalar | bajarilgan; “Tez kunda” sahifa qolmagan |
| 10 Obuna va integratsiyalar | Telegram va avtomatik billing bajarilgan; **tashqi bog‘liqlik**: UySot, bank, Didox, iHamkor, kamera, to‘lov provayderi (kirish yo‘q) |
| 11 Rol bo‘yicha to‘liq sinov | bajarilgan (2026-10-05) |
| 12 Production | **boshlanmagan**: hosting, HTTPS, secretlar, backup va restore drill, yuklama sinovi, monitoring va alert, deploy tartibi |

Egasi qarorlari: trial va to‘lov muddati avtomatik bloklamaydi (2026-10-04); avtomatik 30 kunlik invoys va carry-forward kredit (2026-10-04); AI yordamchi rejadan chiqarildi (2026-10-04); logotip saqlanmaydi; smetada approval yo‘q, hisobotda approval bor; kompaniyada bitta admin.

Ochiq biznes qarorlari (ixtiro qilmang, foydalanuvchidan so‘rang): tarif narxlari va limitlari; FIFO yoki o‘rtacha tannarx; grace muddat; ma’lumot saqlash va purge muddati; hosting va RPO/RTO (tavsiya 15 daqiqa / 4 soat); bank, Didox, iHamkor doirasi; haqiqiy shaxs identifikatori.

**R1 sharti:** tashqi integratsiyalar va 12-bosqich bajarilmaguncha kodni “production tayyor” deb e’lon qilmang.

---

## 15. Hujjatlar xaritasi

| Savol | Fayl |
|---|---|
| Qanday ishlash kerak | `CLAUDE.md` (repo ildizida) |
| Nima qilingan, nima qolgan | `docs/BACKEND_TODO.md` |
| Mahsulot g‘oyasi, rollar, UX | `docs/BARPO_AI_PROJECT_CONTEXT.md` |
| Biznes qoidalari va formulalar (**ustun manba**) | `docs/backend/BARPO_BUSINESS_RULES.md` |
| Rol × ruxsat | `docs/backend/BARPO_PERMISSIONS.md` (generatsiya), `docs/backend/BARPO_ROLE_TEST_REPORT.md` (haqiqiy matritsa) |
| Arxitektura, xavfsizlik, tiklash | `docs/backend/BARPO_BACKEND_ARCHITECTURE.md` |
| DDL va ERD | `docs/backend/BARPO_DATABASE_SPEC.md` (generatsiya), `docs/backend/BARPO_ERD.md` |
| API va DTO namunalari | `docs/backend/BARPO_API_GUIDE.md`, `docs/backend/BARPO_API_OPENAPI.yaml` |
| Dashboard ko‘rsatkichlari | `docs/backend/BARPO_DASHBOARD_METRICS.md` |
| Integratsiya kontraktlari | `docs/backend/BARPO_INTEGRATIONS.md` |
| Qabul mezonlari | `docs/backend/BARPO_ACCEPTANCE_TESTS.md` |
| R1 gate va ochiq masalalar | `docs/backend/BARPO_IMPLEMENTATION_PLAN.md` |
| Backendni ishga tushirish | `docs/backend/README.md`, `docs/README_BACKEND.md` |
| Frontend tuzilma | `docs/frontend/README.md` |
| Eski Figma ekranlari | `docs/SCREEN_MAP.md`, `docs/frontend/LEGACY.md` |

---

## 16. Hujjatlardagi ma’lum eskirgan joylar (kod ustun)

| Joy | Yozilgan | Haqiqat |
|---|---|---|
| `docs/backend/README.md`, 5-band | `.env.local` da `VITE_API_URL=http://localhost:3001` | `VITE_API_URL` **bo‘sh** qoladi; Vite proxy ishlatiladi (cookie sessiya bir xil origin talab qiladi) |
| `docs/backend/README.md`, `docs/backend/BARPO_BACKEND_INDEX.md` | `permissions-ui.png` | bunday fayl yo‘q; hozirgi skrinshot `docs/backend/platform-tenant-ui.png` |
| `docs/backend/BARPO_BACKEND_INDEX.md` | `src/api/client.ts`, `src/ui/roles.ts` | bular endi `frontend/legacy/` da; yangisi `frontend/src/lib/api.ts`, `frontend/src/lib/permissions.ts` |
| `docs/BACKEND_TODO.md`, kod xaritasi | migratsiyalar 001–005 | 001–013 |
| `docs/backend/BARPO_BUSINESS_RULES.md` (onboarding bo‘limi), `docs/backend/BARPO_IMPLEMENTATION_PLAN.md` | ortiqcha to‘lov rad etiladi, carry-forward yo‘q | 013 da amalga oshgan: ortiqcha to‘lov kreditga o‘tadi (BUSINESS_RULES ning keyingi bo‘limida yozilgan) |
| `docs/backend/BARPO_IMPLEMENTATION_PLAN.md` | qolgan ekranlar demo, banner bilan | barcha kompaniya sahifalari real API’da (09-bosqich) |
| `docs/backend/BARPO_PERMISSIONS.md` | frontend 15 s da yangilanadi | 60 s va fokusda (`frontend/src/lib/auth.tsx`) |
| `docs/backend/BARPO_API_GUIDE.md` | `SUBSCRIPTION_REQUIRED (402)` | kodda bunday kod yo‘q |
| `docs/BARPO_AI_PROJECT_CONTEXT.md` | Next.js, Tailwind, shadcn; `/api/*`; `/register/[token]`; vazifa TODO/BLOCKED/COMPLETED/CANCELLED; tenant TRIAL/OVERDUE/SUSPENDED; AI funksiyalar | Vite + o‘z CSS; `/v1/*`; `/register#token=`; holatlar 8.1-jadvalda; trial va overdue `access_state` sifatida hisoblanadi; AI chiqarilgan |
| `docs/backend/ui-failure-*.png` | tracked | eski muvaffaqiyatsiz UI test skrinshotlari; joriy testlar o‘tadi |

Bularni foydalanuvchi so‘ramasa tuzatmang (CLAUDE.md, 3-band). Faqat xabar bering.

---

## 17. Qilmang

- Frontendda pulni `Number` bilan qo‘shish yoki ayirish.
- Tenant ID’ni so‘rov body yoki query’sidan olish.
- Ruxsatni faqat UI’da tekshirish.
- Ledger, jurnal yoki tarix yozuvini UPDATE/DELETE qilish; qo‘llangan migratsiyani tahrirlash.
- Ma’lumot yo‘q joyda 0 yoki soxta raqam ko‘rsatish; integratsiyani “ishlayapti” deb ko‘rsatish.
- Matnni faqat bitta lokalga qo‘shish.
- Narx maydonini `sensitive` belgilamasdan qaytarish.
- `backend_postgres_data` volume’ini o‘chirish (boshqa loyihaniki).
- Secret yoki parolni repo fayliga yozish.
- So‘ralmagan refaktor yoki “yaxshilash”; so‘ralmagan commit yoki push.
