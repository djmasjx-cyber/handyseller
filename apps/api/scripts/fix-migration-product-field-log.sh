#!/bin/bash
# Восстановление после неудачной миграции 20250218000000_add_product_field_log
# Запустить на VM: cd /opt/handyseller/apps/api && bash scripts/fix-migration-product-field-log.sh

set -e
cd "$(dirname "$0")/.."
[ -f /opt/handyseller/.env.production ] && set -a && . /opt/handyseller/.env.production && set +a
export DATABASE_URL="${DATABASE_URL:-postgresql://handyseller:${POSTGRES_PASSWORD}@localhost:5432/handyseller}"

echo "Помечаем миграцию как откатанную..."
npx prisma migrate resolve --rolled-back 20250218000000_add_product_field_log --schema=./prisma/schema.prisma

echo "Удаляем таблицу product_field_log (если создалась)..."
psql "$DATABASE_URL" -c 'DROP TABLE IF EXISTS "product_field_log" CASCADE' 2>/dev/null || true

echo "Готово. Запустите деплой снова."
