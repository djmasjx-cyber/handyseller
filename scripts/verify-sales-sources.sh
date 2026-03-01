#!/bin/bash
# Проверка API sales-sources (шаг 3 PLAN-MANUAL-ORDERS)
set -e
BASE="${1:-http://localhost:3000}"
echo "Base URL: $BASE"

# Регистрация и получение токена
EMAIL="verify-sales-$(date +%s)@test.com"
REG=$(curl -s -X POST "$BASE/auth/register" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"Test123!\",\"name\":\"Test\"}")
TOKEN=$(echo "$REG" | jq -r '.accessToken')
if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "FAIL: no accessToken from register"
  exit 1
fi

# GET /api/sales-sources — пустой список
echo "GET /api/sales-sources..."
LIST=$(curl -s -X GET "$BASE/sales-sources" -H "Authorization: Bearer $TOKEN")
if ! echo "$LIST" | jq -e 'type == "array"' >/dev/null 2>&1; then
  echo "FAIL: expected array, got: $LIST"
  exit 1
fi
echo "  OK: list is array"

# POST /api/sales-sources — создание
echo "POST /api/sales-sources { name: \"авито\" }..."
CREATED=$(curl -s -X POST "$BASE/sales-sources" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"авито"}')
ID=$(echo "$CREATED" | jq -r '.id')
NAME=$(echo "$CREATED" | jq -r '.name')
if [ -z "$ID" ] || [ "$ID" = "null" ]; then
  echo "FAIL: no id in response: $CREATED"
  exit 1
fi
if [ "$NAME" != "Авито" ]; then
  echo "FAIL: expected name 'Авито', got '$NAME'"
  exit 1
fi
echo "  OK: id=$ID, name=$NAME (normalized)"

# GET — теперь есть 1 элемент
LIST2=$(curl -s -X GET "$BASE/sales-sources" -H "Authorization: Bearer $TOKEN")
LEN=$(echo "$LIST2" | jq 'length')
if [ "$LEN" != "1" ]; then
  echo "FAIL: expected 1 item, got $LEN"
  exit 1
fi
echo "  OK: list has 1 item"

# POST тот же источник — upsert (вернёт существующий)
echo "POST same source (upsert)..."
UPSERTED=$(curl -s -X POST "$BASE/sales-sources" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"АВИТО"}')
UPSERT_ID=$(echo "$UPSERTED" | jq -r '.id')
if [ "$UPSERT_ID" != "$ID" ]; then
  echo "FAIL: upsert should return same id, got $UPSERT_ID vs $ID"
  exit 1
fi
echo "  OK: upsert returns same id"

# POST пустое имя — 400
echo "POST empty name..."
HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/sales-sources" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"  "}')
if [ "$HTTP" != "400" ]; then
  echo "FAIL: expected 400 for empty name, got $HTTP"
  exit 1
fi
echo "  OK: 400 for empty name"

echo "All checks passed."
