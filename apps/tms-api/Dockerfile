FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/tms-api/package*.json apps/tms-api/
COPY packages/tms-sdk packages/tms-sdk
COPY packages/tms-domain packages/tms-domain

RUN npm ci --workspace=tms-api --workspace=@handyseller/tms-sdk --workspace=@handyseller/tms-domain

COPY apps/tms-api apps/tms-api
RUN npm run build -w tms-api

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4100

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/tms-api/dist ./apps/tms-api/dist

EXPOSE 4100

# Nest emit в монорепо даёт вложенный путь (см. локальный `npm run build -w tms-api`).
CMD ["node", "apps/tms-api/dist/apps/tms-api/src/main.js"]
