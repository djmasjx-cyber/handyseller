# Сборка из корня монорепо: docker build -f apps/api/Dockerfile .
FROM node:20-alpine AS builder

WORKDIR /app

# Монорепо: lock-файл в корне
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma/
RUN npm ci --workspace=api --omit=dev

COPY apps/api ./apps/api
RUN npm run build --workspace=api
RUN npx prisma generate --schema=./apps/api/prisma/schema.prisma

FROM node:20-alpine AS runner

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
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
