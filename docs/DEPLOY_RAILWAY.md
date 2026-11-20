# BARPO AI — Railway'ga joylash

Railway loyihasida 3 ta servis:

| Servis | Manba | Vazifa |
|---|---|---|
| `Postgres` | Railway PostgreSQL shabloni | baza |
| `app` | repo, Root Directory `backend` | API + worker bitta konteynerda (worker Telegram rasmlarini `/app/storage` ga yozadi, Railway volume'ni ikki servis bo‘lisha olmaydi) |
| `web` | repo, `deploy/web.Dockerfile` | frontend + Caddy, `/v1` → `app` |

HTTPS'ni Railway beradi. Tashqariga faqat `web` ochiq; `app` va `Postgres` ichki tarmoqda (`*.railway.internal`).

> Eslatma: Railway serverlari O‘zbekistondan tashqarida (qonun 27¹-modda) — pilot uchun. Keyin ko‘chirish: 7-bo‘lim.

Servis nomlari aynan `Postgres`, `app`, `web` bo‘lsin — quyidagi `${{...}}` havolalar shu nomlarga tayanadi.

## 1. Loyiha va baza
1. railway.com → New Project → Deploy PostgreSQL. Servis nomi `Postgres`.
2. Postgres → Variables'dan `DATABASE_PUBLIC_URL` ni nusxalang.
3. Ilova roli uchun parol yarating (`openssl rand -hex 24`) va uni saqlab qo‘ying — `APP_DB_PASSWORD`.
4. **Birinchi deploydan oldin** `barpo_app` rolini yarating (jadvallar keyin yaratilsa, huquqlar ularga avtomatik beriladi). Kompyuteringizda Docker bilan:
   ```sh
   docker run --rm -it postgres:17 psql "<DATABASE_PUBLIC_URL>"
   ```
   ```sql
   CREATE ROLE barpo_app LOGIN PASSWORD '<APP_DB_PASSWORD>' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
   GRANT CONNECT ON DATABASE railway TO barpo_app;
   GRANT USAGE ON SCHEMA public TO barpo_app;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO barpo_app;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO barpo_app;
   ```
   (`backend/docker/init.sh` bilan bir xil; baza nomi Railway'da `railway`.)

## 2. `app` servisi (API + worker)
New → GitHub Repo → repo, branch `main`. Nomini `app` qiling.

Settings:
- Source → Root Directory: `backend` (Dockerfile o‘zi topiladi).
- Deploy → Custom Start Command:
  ```sh
  bash -c 'node dist/server.js & node dist/worker.js & wait -n; exit 1'
  ```
  Biri to‘xtasa konteyner ham to‘xtaydi va Railway uni qayta ishga tushiradi.
- Deploy → Pre-deploy Command: `node dist/migrate.js` (har deployda yangi migratsiyalar).
- Deploy → Healthcheck Path: `/health/ready`. Restart Policy: On Failure.
- Replicas: **1** (ikkita nusxa bo‘lsa Telegram `getUpdates` to‘qnashadi).
- Volume: servisga Volume qo‘shing, Mount Path `/app/storage`.
- Public domain **bermang**.

Variables:
```
DATABASE_URL=postgresql://barpo_app:<APP_DB_PASSWORD>@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{Postgres.PGDATABASE}}
MIGRATION_DATABASE_URL=${{Postgres.DATABASE_URL}}
APP_ORIGIN=https://${{web.RAILWAY_PUBLIC_DOMAIN}}
TRUST_PROXY=1
HOST=::
PORT=3001
RAILWAY_RUN_UID=0
TELEGRAM_BOT_TOKEN=<token>
TELEGRAM_BOT_USERNAME=barpoai_bot
TELEGRAM_LINK_TOKEN_TTL_SECONDS=300
```
- `HOST=::` — Railway ichki tarmog‘i IPv6 ishlatadi.
- `RAILWAY_RUN_UID=0` — volume root nomidan ulanadi, `node` foydalanuvchisi unga yoza olmaydi.
- O‘z domeningiz bo‘lsa `APP_ORIGIN=https://app.example.uz`.
- Shu token bilan boshqa joyda (lokal stek) worker ishlamasin.

## 3. `web` servisi (frontend)
New → GitHub Repo → o‘sha repo, branch `main`. Nomini `web` qiling. Root Directory bo‘sh qoladi.

Variables:
```
RAILWAY_DOCKERFILE_PATH=deploy/web.Dockerfile
CADDYFILE=deploy/Caddyfile.railway
API_UPSTREAM=${{app.RAILWAY_PRIVATE_DOMAIN}}:3001
PORT=8080
```
Settings → Networking → Generate Domain (port 8080). O‘z domeningiz: Custom Domain qo‘shib, Railway ko‘rsatgan `CNAME` yozuvini DNS'ga kiriting.

## 4. Ishga tushirish va tekshirish
1. `app` deploy bo‘lsin (pre-deploy loglarida migratsiyalar, keyin healthcheck yashil).
2. `web` deploy bo‘lsin. Tekshirish: `https://<web domeni>/health/ready` → `{"status":"ok"}`.
3. Platforma egasini yaratish (bir marta, kompyuteringizdan, `backend/` papkasida):
   ```sh
   MIGRATION_DATABASE_URL='<DATABASE_PUBLIC_URL>' BOOTSTRAP_LOGIN=platform.owner BOOTSTRAP_PASSWORD='<kuchli parol>' npx tsx src/bootstrap.ts
   ```
   Keyin `history -c` (parol tarixda qolmasin).
4. `https://<web domeni>` da domensiz kiring (platforma xodimi).

## 5. Yangilash
`main` ga push (yoki PR birlashtirish) — Railway ikkala servisni o‘zi qayta yig‘adi, `app` pre-deploy'da migratsiyalarni qo‘llaydi. Katta yangilashdan oldin 6-bo‘limdagi qo‘lda zaxira nusxani oling.

## 6. Zaxira nusxa va tiklash
- Railway: `Postgres` va `app` volume'lari → Backups (rejaga qarab qo‘lda va jadval bo‘yicha). Yoqib qo‘ying.
- Qo‘shimcha, Railway'dan tashqarida (haftasiga kamida bir marta):
  ```sh
  docker run --rm -v "$PWD:/out" postgres:17 pg_dump -Fc -f /out/barpo-$(date +%Y%m%d).dump "<DATABASE_PUBLIC_URL>"
  ```
- Tiklash: `app` ni to‘xtating (Settings → Remove deployment emas, replicas 0 yoki servisni pauza), keyin
  ```sh
  docker run --rm -v "$PWD:/in" postgres:17 pg_restore --clean --if-exists --no-owner -d "<DATABASE_PUBLIC_URL>" /in/barpo-YYYYMMDD.dump
  ```
  va `app` ni qayta yoqing. Yangi bazaga tiklashdan oldin 1-bo‘limdagi rol SQL'ini bajaring.
- Yuklangan fayllar (`/app/storage`) faqat volume backup'ida. Volume tarkibini yuklab olish: `railway ssh` orqali `app` ga kirib `tar` bilan.

## 7. Boshqa serverga ko‘chirish
Hetzner yoki O‘zbekistondagi VPS: `docs/DEPLOY_HETZNER.md` 2–4-bo‘limlar, so‘ng `pg_dump` (6-bo‘lim) va fayllarni tiklash, keyin DNS'ni yangi serverga yo‘naltirish.

## 8. Kuzatish
- Loglar: Railway → servis → Deployments / Logs.
- Ilova ichida: `/admin/diagnostics` (super admin).
- Tashqi tekshiruv: UptimeRobot (tekin) `https://<domen>/health/ready` ga.
