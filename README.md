# BARPO AI — frontend

Qurilish kompaniyalari uchun multi-tenant ERP/SaaS platformaning veb ilovasi. Vite + React 19 + TypeScript, feature-based tuzilma, TanStack Query, React Hook Form + Zod, o‘z CSS dizayn tizimi (bordo/oq/och kulrang). Backend: [backend/README.md](backend/README.md). Ish rejasi: [BACKEND_TODO.md](BACKEND_TODO.md). Mahsulot konteksti: [BARPO_AI_PROJECT_CONTEXT.md](BARPO_AI_PROJECT_CONTEXT.md).

## Ishga tushirish

Node.js 24 va pnpm kerak. Backend Docker Compose bilan `localhost:3001` da ishlab turishi kerak (qarang backend/README.md).

```sh
pnpm install
pnpm dev        # http://localhost:5173 — /v1 so‘rovlari API ga proxy qilinadi
pnpm typecheck
pnpm build
pnpm preview
```

Frontend va API bir xil origin orqali ishlaydi (dev’da Vite proxy, production’da reverse proxy `/v1` → API). Shu sababli sessiya httpOnly cookie’da, `VITE_API_URL` bo‘sh qoladi. API alohida domenda bo‘lsa `.env.local` da `VITE_API_URL` ni bering va backendda `APP_ORIGIN` ni frontend domeniga sozlang.

## Tuzilma

```
src/
  app/            App (provayderlar, router), layouts (AppShell, AuthLayout), guards
  lib/            api (fetch + cookie + Idempotency-Key), auth (sessiya, ruxsatlar), i18n, permissions, format
  locales/        uz.ts, ru.ts — barcha UI matnlari
  components/ui/  Button, Input, Select, Modal, DataTable, Badge, Toast, holatlar (empty/error/loading)
  features/
    auth/         login (login yoki telefon), taklif orqali ro‘yxatdan o‘tish, parol almashtirish/tiklash
    profile/      profil, til, Telegram ulash (bir martalik deep link)
    permissions/  rol × sahifa CRUD matritsasi (mijoz admini)
    billing/      kompaniya obunasi va yordam so‘rovi
    platform/     platforma egasi: dashboard, kompaniyalar, taklif, tarif, invoys, to‘lov, qarzdorlar, murojaatlar, texnik xodimlar
    common/       ComingSoon — hali ulanmagan bo‘limlar uchun halol bo‘sh holat
  styles/         tokens, base, components, layout
legacy/           eski Figma demo ekranlari (ulanmagan, faqat dizayn manbasi)
```

Marshrutlar: `/login`, `/register#token=…`, `/reset-password#token=…`, `/change-password`, `/profile`; kompaniya: `/app/*` (sahifa kalitlari backenddagi `pages` bilan bir xil, menyu `GET /v1/me/permissions` bo‘yicha filtrlanadi); platforma: `/admin/*`.

## Qoidalar

- Ruxsat UI’da faqat ko‘rsatish uchun; har amal serverda tekshiriladi.
- Pul va miqdor API’dan string keladi; frontend arifmetika qilmaydi, faqat formatlaydi.
- Statik “demo” raqamlar ko‘rsatilmaydi: ma’lumot yo‘q bo‘lsa bo‘sh holat, xato bo‘lsa xato holati.
- Har bir yangi matn `locales/uz.ts` va `locales/ru.ts` ga qo‘shiladi.

## Sinov

Brauzer e2e sinovi backend papkasidan: `npm run test:ui` (vaqtinchalik PostgreSQL + API + Vite, Headless Chrome). Natija: [backend/docs/ui-verification.json](backend/docs/ui-verification.json).
