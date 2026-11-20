# BARPO AI — Hetzner VPS'ga joylash

Bitta server: Hetzner Cloud, 2 vCPU / 4 GB RAM / 40 GB SSD (~4–5 €), Ubuntu 24.04.
Hammasi Docker Compose'da: `db` (PostgreSQL 17), `migrate`, `api`, `worker`, `web` (Caddy: HTTPS, frontend, `/v1` → api).
Fayllar: `deploy/compose.prod.yaml`, `deploy/web.Dockerfile`, `deploy/Caddyfile`, `deploy/.env.example`, `deploy/backup.sh`.

> Eslatma: shaxsiy ma’lumotlar O‘zbekistondan tashqarida saqlanadi (qonun 27¹-modda). Pilot uchun; keyin O‘zbekistondagi serverga ko‘chirish — 7-bo‘lim.

## 1. Server buyurtma qilish
1. Hetzner Cloud Console → New Server: Location Helsinki yoki Falkenstein, Image Ubuntu 24.04, Type CX22/CX23 (2 vCPU, 4 GB).
2. SSH key qo‘shing (parol bilan kirish o‘chiq bo‘lsin). Backups ni yoqing (+20%).
3. Firewall: kiruvchi faqat TCP 22, 80, 443 va UDP 443.
4. Domen DNS: `A` yozuv (`app.example.uz`) → server IPv4. Cloudflare ishlatilsa, birinchi sertifikat olinguncha «DNS only» rejimida qoldiring.

## 2. Serverni tayyorlash
```sh
ssh root@SERVER_IP
apt update && apt upgrade -y
apt install -y git rsync unattended-upgrades
curl -fsSL https://get.docker.com | sh
# 4 GB RAM uchun swap (katta smeta importida xotira tugamasin)
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 3. Kod va sozlamalar
```sh
git clone https://github.com/<owner>/<repo>.git /opt/barpoai
cd /opt/barpoai/deploy
cp .env.example .env
openssl rand -hex 24   # DB_OWNER_PASSWORD uchun
openssl rand -hex 24   # DB_APP_PASSWORD uchun (boshqasi)
nano .env              # DOMAIN, parollar, TELEGRAM_BOT_TOKEN
chmod 600 .env
```

## 4. Ishga tushirish
```sh
cd /opt/barpoai/deploy
docker compose -f compose.prod.yaml up -d --build
docker compose -f compose.prod.yaml ps          # api healthy, web Up
curl https://$DOMAIN/health/ready                # {"status":"ok"}
```
Birinchi marta platforma egasini yaratish (parol buyruqlar tarixida qolmasin — keyin `history -c`):
```sh
docker compose -f compose.prod.yaml run --rm \
  -e BOOTSTRAP_LOGIN=platform.owner -e BOOTSTRAP_PASSWORD='<kuchli parol>' \
  migrate node dist/bootstrap.js
```

## 5. Yangilash (yangi versiya)
```sh
cd /opt/barpoai && git pull
cd deploy && docker compose -f compose.prod.yaml up -d --build
```
`migrate` har ishga tushishda yangi migratsiyalarni qo‘llaydi. Yangilashdan oldin `./backup.sh` ni qo‘lda ishga tushiring.

## 6. Zaxira nusxa va tiklash
Har kuni soat 03:00 (server vaqti):
```sh
chmod +x /opt/barpoai/deploy/backup.sh
(crontab -l 2>/dev/null; echo '0 3 * * * /opt/barpoai/deploy/backup.sh >> /var/log/barpo-backup.log 2>&1') | crontab -
```
Nusxalar `/var/backups/barpo` da 14 kun saqlanadi. Server o‘chsa ham yo‘qolmasligi uchun Hetzner Storage Box (~3–4 €) oling, server SSH kalitini unga qo‘shing va `.env` da `BACKUP_REMOTE` ni to‘ldiring.

Tiklash (bo‘sh serverda, 4-bo‘limdagi `up -d` dan keyin):
```sh
cd /opt/barpoai/deploy
docker compose -f compose.prod.yaml stop api worker
docker compose -f compose.prod.yaml exec -T db sh -c \
  'dropdb -U barpo_owner barpo && createdb -U barpo_owner barpo && pg_restore -U barpo_owner -d barpo' \
  < /var/backups/barpo/db-YYYYMMDD-HHMM.dump
docker compose -f compose.prod.yaml run --rm -T --entrypoint sh api -c 'tar -C /app/storage -xzf -' \
  < /var/backups/barpo/files-YYYYMMDD-HHMM.tar.gz
docker compose -f compose.prod.yaml up -d
```
Tiklashni oyiga bir marta alohida serverda sinab ko‘ring.

## 7. Boshqa serverga ko‘chirish (masalan O‘zbekistondagi VPS)
Yangi serverda 2–4-bo‘limlar (bootstrapsiz), keyin 6-bo‘limdagi tiklash, so‘ng DNS `A` yozuvini yangi IP'ga o‘zgartiring.

## 8. Kuzatish
- Holat: `docker compose -f compose.prod.yaml ps`, loglar: `docker compose -f compose.prod.yaml logs -f --tail=100 api worker`.
- Ilova ichida: `/admin/diagnostics` (super admin) — baza, worker navbati, 5xx xatolar.
- Tashqi tekshiruv: UptimeRobot (tekin) `https://$DOMAIN/health/ready` ga, ogohlantirish Telegram'ga.
