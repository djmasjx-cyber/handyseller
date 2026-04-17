# Сборка из корня монорепо: docker build -f apps/api/Dockerfile .
FROM node:20-alpine AS builder

WORKDIR /app

# Монорепо: lock-файл в корне
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/tms-sdk/package.json ./packages/tms-sdk/
COPY apps/api/prisma ./apps/api/prisma/
RUN npm ci --workspace=api

COPY apps/api ./apps/api
COPY packages/tms-sdk ./packages/tms-sdk
RUN npx prisma generate --schema=./apps/api/prisma/schema.prisma
RUN npm run build --workspace=api

FROM node:20-slim AS runner

RUN apt-get update -qq && apt-get install -y -qq openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/package*.json ./

RUN npx prisma generate --schema=./prisma/schema.prisma

EXPOSE 4000

# Миграции при старте контейнера, затем запуск API (Nest: outDir=dist → dist/src/main.js)
# resolve --rolled-back нужен однократно: если миграция уже не в failed-состоянии — команда завершится с ошибкой, || true это подавляет
CMD ["sh", "-c", "npx prisma migrate resolve --rolled-back 20260402000000_add_organization_profile 2>&1 || true && npx prisma migrate deploy && node dist/src/main.js"]
