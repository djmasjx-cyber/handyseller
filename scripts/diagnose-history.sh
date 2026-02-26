#!/bin/bash
# Диагностика истории изменений товаров
# Запуск на VM: cd /opt/handyseller && bash scripts/diagnose-history.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/.env.production" ] && set -a && . "$ROOT/.env.production" && set +a
[ -f "$ROOT/.env" ] && set -a && . "$ROOT/.env" && set +a

# psql: локально или через docker
run_sql() {
  if command -v psql &>/dev/null && [ -n "$DATABASE_URL" ]; then
    psql "$DATABASE_URL" "$@"
  elif docker ps -q -f name=handyseller-postgres &>/dev/null; then
    docker exec handyseller-postgres psql -U handyseller -d handyseller "$@"
  else
    echo "Ошибка: нужен psql или запущенный контейнер handyseller-postgres"
    exit 1
  fi
}

echo "=== 1. Проверка таблиц истории ==="
run_sql -t -c "
SELECT 'product_change_log: ' || count(*) FROM product_change_log;
SELECT 'StockLog: ' || count(*) FROM \"StockLog\";
SELECT 'ProductFieldLog: ' || count(*) FROM product_field_log;
" 2>/dev/null || { echo "Ошибка подключения к БД."; exit 1; }

echo ""
echo "=== 2. Триггер product_change_trigger ==="
run_sql -t -c "
SELECT tgname FROM pg_trigger WHERE tgrelid = '\"Product\"'::regclass AND tgname = 'product_change_trigger';
" 2>/dev/null || true

echo ""
echo "=== 3. Последние 5 записей в product_change_log ==="
run_sql -c "
SELECT id, product_id, user_id, change_type, field_name, old_value, new_value, delta, created_at 
FROM product_change_log ORDER BY created_at DESC LIMIT 5;
" 2>/dev/null || true

echo ""
echo "=== 4. Последние 5 записей в StockLog ==="
run_sql -c "
SELECT id, \"productId\", \"userId\", delta, \"quantityBefore\", \"quantityAfter\", source, \"createdAt\"
FROM \"StockLog\" ORDER BY \"createdAt\" DESC LIMIT 5;
" 2>/dev/null || true

echo ""
echo "=== 5. Товар 0006 (Ang002) — ID и остаток ==="
run_sql -c "
SELECT id, display_id, article, title, stock FROM \"Product\" 
WHERE article = 'Ang002' OR display_id = 6 LIMIT 3;
" 2>/dev/null || true

echo ""
echo "=== 6. API health ==="
curl -s -o /dev/null -w "GET /api/health: %{http_code}\n" http://127.0.0.1:4000/api/health 2>/dev/null || echo "API не доступен на :4000"
