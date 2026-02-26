#!/bin/bash
# Пошаговая диагностика остатков Ozon
# Использование: ./scripts/ozon-stock-debug.sh [article]
# Требует: .env.secrets с ADMIN_EMAIL, ADMIN_PASSWORD

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/.env.secrets" ] && set -a && . "$ROOT/.env.secrets" && set +a

ARTICLE="${1:-edc002}"
API_URL="${API_URL:-http://158.160.209.158:3000}"

if [ -z "$ADMIN_EMAIL" ] || [ -z "$ADMIN_PASSWORD" ]; then
  echo "Ошибка: ADMIN_EMAIL и ADMIN_PASSWORD в .env.secrets"
  exit 1
fi

echo "==> Логин..."
BODY=$(jq -n --arg e "$ADMIN_EMAIL" --arg p "$ADMIN_PASSWORD" '{email:$e,password:$p}')
TOKEN=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "$BODY" | jq -r '.accessToken')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "Ошибка: не удалось получить токен"
  exit 1
fi

echo "==> Диагностика остатков Ozon (артикул: $ARTICLE)..."
curl -s "$API_URL/api/marketplaces/ozon-stock-debug/$ARTICLE" \
  -H "Authorization: Bearer $TOKEN" | jq .
