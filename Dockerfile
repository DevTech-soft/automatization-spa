# NOTA: cuando se implemente Fase 8 (Gift Cards con Puppeteer) esta imagen
# necesitará las dependencias de Chromium headless. Se revisita en esa fase.

FROM node:20-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/web ./web
COPY package.json ./

EXPOSE 3000
CMD ["node", "dist/server.js"]
