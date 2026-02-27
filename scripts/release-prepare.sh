#!/bin/bash
# Подготовка релиза: миграции + сборка для деплоя.
# Запуск: ./scripts/release-prepare.sh
#
# Миграции выполняются автоматически при старте API (Dockerfile: prisma migrate deploy).
# Этот скрипт проверяет готовность и выполняет локальную проверку.

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> 1. Проверка миграций Prisma..."
cd apps/api
if command -v npx &>/dev/null; then
  npx prisma validate
  echo "    ✓ Схема валидна"
  npx prisma migrate status 2>/dev/null || echo "    ⚠ migrate status требует DATABASE_URL (опционально)"
else
  echo "    ⚠ npx не найден, пропуск prisma validate"
fi
cd "$ROOT"

echo ""
echo "==> 2. Сборка Docker-образов..."
export DOCKER_BUILDKIT=0
docker build -f apps/api/Dockerfile -t handyseller-api:latest .
docker build -f apps/web/Dockerfile -t handyseller-web:latest .

echo ""
echo "=== Релиз готов к деплою ==="
echo "Миграция price→cost (20260225010000) применится при старте API."
echo ""
echo "Деплой: npm run deploy"
echo "  или: bash scripts/run-deploy.sh"
echo "  или: bash scripts/full-deploy.sh"
echo ""
