# Сборка из корня монорепо: docker build -f apps/api/Dockerfile .
FROM node:20-alpine AS builder

WORKDIR /app

COPY apps/api/package*.json ./
COPY apps/api/prisma ./prisma/
RUN npm ci --omit=dev

COPY apps/api .
RUN npm run build
RUN npx prisma generate

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package*.json ./

RUN npx prisma generate

EXPOSE 4000

# Миграции при старте контейнера, затем запуск API (Nest: outDir=dist → dist/src/main.js)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
