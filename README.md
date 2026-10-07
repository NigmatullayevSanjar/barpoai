# BARPO AI

Qurilish kompaniyalari uchun multi-tenant B2B SaaS ERP: obyektlar, smeta, ombor, moliya, vazifa va hisobotlar bitta tizimda.

## Tuzilma

| Papka | Ichida |
|---|---|
| [`frontend/`](frontend) | Vite + React 19 + TypeScript veb ilova |
| [`backend/`](backend) | Node.js 24 + Fastify + PostgreSQL 17 API, worker, migratsiyalar, testlar |
| [`docs/`](docs) | barcha hujjatlar: reja, mahsulot konteksti, texnik hujjatlar, test natijalari |

To‘liq loyiha konteksti bitta faylda: [docs/BARPO_AI_HANDOFF.md](docs/BARPO_AI_HANDOFF.md).

## Ishga tushirish

Kerak: Node.js 24, pnpm, Docker Desktop.

```sh
# 1) Backend: baza, migratsiya, API (localhost:3001) va worker
cd backend
cp .env.example .env        # parollarni to‘ldiring
docker compose up --build -d

# 2) Frontend: http://localhost:5173 (/v1 so‘rovlari API ga proxy qilinadi)
cd ../frontend
pnpm install
pnpm dev
```

Birinchi platforma egasini yaratish va batafsil sozlash: [docs/backend/README.md](docs/backend/README.md).

## Hujjatlar

- [docs/BACKEND_TODO.md](docs/BACKEND_TODO.md) — 12 bosqichli ish rejasi va holati
- [docs/BARPO_AI_PROJECT_CONTEXT.md](docs/BARPO_AI_PROJECT_CONTEXT.md) — mahsulot konteksti
- [docs/backend/BARPO_BACKEND_INDEX.md](docs/backend/BARPO_BACKEND_INDEX.md) — backend texnik hujjatlari
- [docs/frontend/README.md](docs/frontend/README.md) — frontend tuzilmasi va qoidalari
