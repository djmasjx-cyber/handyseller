FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/wms-api/package*.json apps/wms-api/
COPY packages/wms-sdk packages/wms-sdk
COPY packages/wms-domain packages/wms-domain
RUN npm ci --workspace=wms-api --workspace=@handyseller/wms-sdk --workspace=@handyseller/wms-domain
COPY apps/wms-api apps/wms-api
RUN npm run build -w wms-api

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4200
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/wms-api/dist ./apps/wms-api/dist
EXPOSE 4200
CMD ["node", "apps/wms-api/dist/apps/wms-api/src/main.js"]
