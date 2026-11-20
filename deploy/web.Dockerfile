# Frontend build + Caddy (HTTPS, statik fayllar, /v1 -> api).
FROM node:24-bookworm-slim AS build
RUN npm install -g pnpm@10.34.5
WORKDIR /app
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend ./
RUN pnpm build

FROM caddy:2.10
# Railway: CADDYFILE=deploy/Caddyfile.railway (servis o'zgaruvchisi build arg bo'lib keladi).
ARG CADDYFILE=deploy/Caddyfile
COPY ${CADDYFILE} /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
