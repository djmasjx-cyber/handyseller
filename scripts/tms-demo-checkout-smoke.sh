#!/usr/bin/env bash
set -euo pipefail

WEB_BASE_URL="${WEB_BASE_URL:-http://localhost:3000}"
REAL_CONFIRM="${REAL_CONFIRM:-false}"
EXTERNAL_ORDER_ID="${EXTERNAL_ORDER_ID:-DEMO-SMOKE-$(date +%s)}"

payload="$(cat <<EOF
{
  "externalOrderId": "${EXTERNAL_ORDER_ID}",
  "customer": {
    "name": "Тестовый покупатель",
    "phone": "+79990003344",
    "address": "Казань, ул. Пример 1"
  },
  "cart": {
    "items": [
      {
        "productId": "demo-rc-car",
        "title": "Демо товар",
        "quantity": 1,
        "priceRub": 6070,
        "weightGrams": 1500
      }
    ],
    "declaredValueRub": 6070,
    "weightGrams": 1500,
    "widthMm": 200,
    "lengthMm": 300,
    "heightMm": 150
  }
}
EOF
)"

echo "1) Estimate through web BFF..."
estimate="$(curl -sS -X POST "${WEB_BASE_URL}/api/tms-demo/estimate" -H "Content-Type: application/json" -d "${payload}")"
request_id="$(echo "${estimate}" | jq -r '.shipmentRequestId // empty')"
quote_id="$(echo "${estimate}" | jq -r '.options[0].quoteId // empty')"
if [[ -z "${request_id}" || -z "${quote_id}" ]]; then
  echo "FAIL step=estimate" >&2
  echo "${estimate}" >&2
  exit 1
fi
echo "request_id=${request_id} quote_id=${quote_id}"

echo "2) Select quote..."
select_response="$(curl -sS -X POST "${WEB_BASE_URL}/api/tms-demo/select" -H "Content-Type: application/json" -d "{\"requestId\":\"${request_id}\",\"quoteId\":\"${quote_id}\"}")"
selected_quote_id="$(echo "${select_response}" | jq -r '.selectedQuoteId // empty')"
if [[ "${selected_quote_id}" != "${quote_id}" ]]; then
  echo "FAIL step=select" >&2
  echo "${select_response}" >&2
  exit 1
fi

if [[ "${REAL_CONFIRM}" != "true" ]]; then
  echo "3) Confirm skipped. Set REAL_CONFIRM=true to create a real carrier booking."
  exit 0
fi

echo "3) Confirm real booking..."
confirm="$(curl -sS -X POST "${WEB_BASE_URL}/api/tms-demo/confirm" -H "Content-Type: application/json" -d "{\"requestId\":\"${request_id}\",\"externalOrderId\":\"${EXTERNAL_ORDER_ID}\",\"allowRealBooking\":true}")"
tracking="$(echo "${confirm}" | jq -r '.shipment.trackingNumber // empty')"
if [[ -z "${tracking}" ]]; then
  echo "FAIL step=confirm" >&2
  echo "${confirm}" >&2
  exit 1
fi
echo "tracking=${tracking}"
