FROM node:22-slim AS base
WORKDIR /app
# Gift Cards (Fase 8) renderizan con Puppeteer (gift-card-image.service.ts) —
# node:20-slim no trae Chromium ni sus libs nativas, así que sin esto
# puppeteer.launch() falla en runtime ("error while loading shared
# libraries"). Se usa el paquete chromium de Debian (declara sus propias libs
# vía apt) en vez del binario que Puppeteer bajaría por su cuenta: evita la
# lista larga de libs sueltas de Chrome for Testing y da una imagen más chica
# (hardening de Fase 11 — este TODO quedó pendiente desde la Fase 0).
RUN apt-get update && apt-get install -y chromium && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npx prisma generate
RUN npm run build
# Solo dependencies de producción en la imagen final: sin esto, node_modules
# (copiado abajo) incluye vitest/vite/esbuild (devDependencies) con
# vulnerabilidades conocidas del dev server de esbuild — nunca se ejecutan en
# runtime, pero igual quedan en la imagen y las marca cualquier scanner de
# seguridad de contenedores (hardening de Fase 10).
RUN npm prune --omit=dev

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/web ./web
COPY package.json ./

EXPOSE 3000
# "prisma" quedó movido a dependencies (no devDependencies) específicamente
# para poder correr las migraciones acá — npm prune --omit=dev (arriba) lo
# habría eliminado si siguiera en devDependencies (ver docs/DEPLOYMENT.md).
CMD ["sh", "-c", "npm run prisma:deploy && node dist/server.js"]
