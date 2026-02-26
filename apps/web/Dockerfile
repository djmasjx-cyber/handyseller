# Сборка из корня монорепо: docker build -f apps/web/Dockerfile .
FROM node:20-alpine AS builder

WORKDIR /app

# Зависимости монорепо (packages/ui)
COPY package.json package-lock.json ./
COPY packages/ui packages/ui
COPY apps/web/package*.json apps/web/
RUN npm ci --workspace=web --workspace=@handyseller/ui

COPY apps/web apps/web
COPY packages packages
RUN mkdir -p apps/web/public
# Сборка Next.js standalone (то же, что при деплое: webpack, OUTPUT_MODE=standalone)
ENV OUTPUT_MODE=standalone
ENV API_URL=http://localhost:4000
ENV NEXT_PRIVATE_WORKERS=1
RUN npm run build:webpack -w web

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3001

# Standalone: server.js в корне или apps/web (outputFileTracingRoot)
CMD ["sh", "-c", "if [ -f apps/web/server.js ]; then node apps/web/server.js; else node server.js; fi"]
