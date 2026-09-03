# Monorepo (pnpm + Turborepo). El contexto de build es la RAÍZ del repo;
# railway.json apunta a este archivo con build.dockerfilePath.
FROM node:22-slim AS base
WORKDIR /app
# Gift Cards (Fase 8) renderizan con Puppeteer (gift-card-image.service.ts) —
# node:22-slim no trae Chromium ni sus libs nativas, así que sin esto
# puppeteer.launch() falla en runtime ("error while loading shared libraries").
# Se usa el paquete chromium de Debian (declara sus propias libs vía apt) en vez
# del binario que Puppeteer bajaría por su cuenta.
RUN apt-get update && apt-get install -y chromium && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PNPM_HOME=/root/.local/share/pnpm \
    CI=true
RUN corepack enable

FROM base AS build
# Manifiestos primero para cachear la instalación.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/db/package.json ./packages/db/
RUN pnpm install --frozen-lockfile
# Resto del código y build.
COPY . .
RUN pnpm --filter @spa/db generate
RUN pnpm --filter @spa/backend build

FROM base AS runtime
ENV NODE_ENV=production
# Se copia el workspace completo ya instalado y compilado (incluye el cliente
# de Prisma ya generado y los symlinks de pnpm). Prunear devDependencies en un
# monorepo pnpm es frágil; queda como hardening posterior (antes lo hacía
# `npm prune --omit=dev`).
COPY --from=build /app /app
WORKDIR /app/apps/backend
EXPOSE 3000
# `prisma` es dependency de @spa/db (no devDependency) para poder migrar acá.
# Railway inyecta DATABASE_URL/DIRECT_URL como variables de entorno.
CMD ["sh", "-c", "pnpm --filter @spa/db migrate:deploy && node dist/server.js"]
