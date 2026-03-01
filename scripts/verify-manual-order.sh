#!/bin/bash
# Проверка API создания ручного заказа (шаг 4 PLAN-MANUAL-ORDERS)
set -e
# BASE = URL до /api (например https://app.handyseller.ru или http://localhost:4000)
BASE="${1:-http://localhost:4000}"
API="${BASE%/}/api"
echo "Base URL: $BASE"

# Регистрация и получение токена
EMAIL="verify-order-$(date +%s)@test.com"
REG=$(curl -s -X POST "$API/auth/register" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"Test123!\",\"name\":\"Test\"}")
TOKEN=$(echo "$REG" | jq -r '.accessToken')
if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "FAIL: no accessToken from register"
  exit 1
fi

# Создать товар
echo "POST /products..."
PROD=$(curl -s -X POST "$API/products" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"title":"Test Product","article":"t001"}')
PRODUCT_ID=$(echo "$PROD" | jq -r '.id')
if [ -z "$PRODUCT_ID" ] || [ "$PRODUCT_ID" = "null" ]; then
  echo "FAIL: no product id: $PROD"
  exit 1
fi
echo "  OK: productId=$PRODUCT_ID"

# Создать источник
curl -s -X POST "$API/sales-sources" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"авито"}' >/dev/null

# Создать ручной заказ
echo "POST /orders (manual)..."
ORDER=$(curl -s -X POST "$API/orders" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"externalId\":\"0001\",\"productId\":\"$PRODUCT_ID\",\"quantity\":2,\"price\":500,\"salesSource\":\"авито\"}")
ORDER_ID=$(echo "$ORDER" | jq -r '.id')
if [ -z "$ORDER_ID" ] || [ "$ORDER_ID" = "null" ]; then
  echo "FAIL: no order id: $ORDER"
  exit 1
fi
MARKETPLACE=$(echo "$ORDER" | jq -r '.marketplace')
SALES_SOURCE=$(echo "$ORDER" | jq -r '.salesSource')
TOTAL=$(echo "$ORDER" | jq -r '.totalAmount')
if [ "$MARKETPLACE" != "MANUAL" ]; then
  echo "FAIL: expected marketplace MANUAL, got $MARKETPLACE"
  exit 1
fi
if [ "$SALES_SOURCE" != "Авито" ]; then
  echo "FAIL: expected salesSource Авито, got $SALES_SOURCE"
  exit 1
fi
if [ "$TOTAL" != "1000" ]; then
  echo "FAIL: expected totalAmount 1000, got $TOTAL"
  exit 1
fi
echo "  OK: orderId=$ORDER_ID, marketplace=$MARKETPLACE, salesSource=$SALES_SOURCE, total=$TOTAL"

# Дубликат externalId — 400
echo "POST duplicate externalId..."
HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/orders" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"externalId\":\"0001\",\"productId\":\"$PRODUCT_ID\",\"quantity\":1,\"price\":100,\"salesSource\":\"Инстаграм\"}")
if [ "$HTTP" != "400" ]; then
  echo "FAIL: expected 400 for duplicate, got $HTTP"
  exit 1
fi
echo "  OK: 400 for duplicate"

echo "All checks passed."
