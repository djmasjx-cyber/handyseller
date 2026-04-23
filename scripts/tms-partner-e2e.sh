#!/usr/bin/env bash
set -euo pipefail

# HandySeller TMS partner flow smoke script.
# Usage:
#   CLIENT_ID=... CLIENT_SECRET=... USER_ID=... ./scripts/tms-partner-e2e.sh
# Optional:
#   API_BASE_URL (default: https://app.handyseller.ru/api)
#   ORDER_TYPE   (default: CLIENT_ORDER)
#   EXTERNAL_ORDER_ID (default: 1C-ORDER-<timestamp>)
#   CALLBACK_URL (for webhook subscription creation)

API_BASE_URL="${API_BASE_URL:-https://app.handyseller.ru/api}"
ORDER_TYPE="${ORDER_TYPE:-CLIENT_ORDER}"
USER_ID="${USER_ID:-u_demo}"
EXTERNAL_ORDER_ID="${EXTERNAL_ORDER_ID:-1C-ORDER-$(date +%s)}"
CALLBACK_URL="${CALLBACK_URL:-}"

if [[ -z "${CLIENT_ID:-}" || -z "${CLIENT_SECRET:-}" ]]; then
  echo "ERROR: CLIENT_ID and CLIENT_SECRET are required." >&2
  exit 1
fi

echo "1) OAuth token..."
TOKEN_RESPONSE="$(curl -sS -X POST "${API_BASE_URL}/tms/oauth/token" \
  -H "Content-Type: application/json" \
  -d "{
    \"grant_type\": \"client_credentials\",
    \"client_id\": \"${CLIENT_ID}\",
    \"client_secret\": \"${CLIENT_SECRET}\"
  }")"
ACCESS_TOKEN="$(echo "${TOKEN_RESPONSE}" | jq -r '.access_token // empty')"
if [[ -z "${ACCESS_TOKEN}" ]]; then
  echo "ERROR: failed to get access_token" >&2
  echo "${TOKEN_RESPONSE}" >&2
  exit 1
fi

REQUEST_BODY="$(cat <<EOF
{
  "snapshot": {
    "sourceSystem": "HANDYSELLER_CORE",
    "userId": "${USER_ID}",
    "coreOrderId": "ord_${EXTERNAL_ORDER_ID}",
    "coreOrderNumber": "${EXTERNAL_ORDER_ID}",
    "marketplace": "OWN_SITE",
    "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
    "originLabel": "Москва, Склад 1",
    "destinationLabel": "Казань, ул. Пример 1",
    "cargo": {
      "weightGrams": 1500,
      "widthMm": 200,
      "lengthMm": 300,
      "heightMm": 150,
      "places": 1,
      "declaredValueRub": 10000
    },
    "itemSummary": [
      {
        "productId": "p1",
        "title": "Товар",
        "quantity": 1,
        "weightGrams": 1500
      }
    ]
  },
  "draft": {
    "originLabel": "Москва, Склад 1",
    "destinationLabel": "Казань, ул. Пример 1",
    "serviceFlags": ["EXPRESS"]
  },
  "integration": {
    "externalOrderId": "${EXTERNAL_ORDER_ID}",
    "orderType": "${ORDER_TYPE}"
  }
}
EOF
)"

echo "2) Estimate..."
ESTIMATE_RESPONSE="$(curl -sS -X POST "${API_BASE_URL}/tms/v1/shipments/estimate" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: estimate-${EXTERNAL_ORDER_ID}" \
  -d "${REQUEST_BODY}")"
REQUEST_ID="$(echo "${ESTIMATE_RESPONSE}" | jq -r '.shipmentRequestId // empty')"
QUOTE_ID="$(echo "${ESTIMATE_RESPONSE}" | jq -r '.options[0].quoteId // empty')"
if [[ -z "${REQUEST_ID}" || -z "${QUOTE_ID}" ]]; then
  echo "ERROR: estimate did not return shipmentRequestId or options[0].quoteId" >&2
  echo "${ESTIMATE_RESPONSE}" >&2
  exit 1
fi

echo "3) Select quote..."
curl -sS -X POST "${API_BASE_URL}/tms/v1/shipments/${REQUEST_ID}/select" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"quoteId\":\"${QUOTE_ID}\"}" >/dev/null

echo "4) Confirm..."
CONFIRM_RESPONSE="$(curl -sS -X POST "${API_BASE_URL}/tms/v1/shipments/${REQUEST_ID}/confirm" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Idempotency-Key: confirm-${EXTERNAL_ORDER_ID}")"
SHIPMENT_ID="$(echo "${CONFIRM_RESPONSE}" | jq -r '.id // empty')"
if [[ -z "${SHIPMENT_ID}" ]]; then
  echo "ERROR: confirm did not return shipment id" >&2
  echo "${CONFIRM_RESPONSE}" >&2
  exit 1
fi

echo "5) Get shipment + events..."
curl -sS -X GET "${API_BASE_URL}/tms/v1/shipments/${SHIPMENT_ID}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" | jq .
curl -sS -X GET "${API_BASE_URL}/tms/v1/shipments/${SHIPMENT_ID}/events" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" | jq .

echo "6) Lookup by externalOrderId..."
curl -sS -X GET "${API_BASE_URL}/tms/v1/shipments/by-external/${EXTERNAL_ORDER_ID}?orderType=${ORDER_TYPE}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" | jq .

echo "7) Batch sync query..."
curl -sS -X GET "${API_BASE_URL}/tms/v1/shipments?updatedSince=$(date -u -d '1 day ago' +%Y-%m-%dT%H:%M:%S.000Z)&limit=20" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" | jq .

if [[ -n "${CALLBACK_URL}" ]]; then
  echo "8) Create webhook subscription..."
  curl -sS -X POST "${API_BASE_URL}/tms/v1/webhooks/subscriptions" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"callbackUrl\":\"${CALLBACK_URL}\"}" | jq .
fi

echo "Done."
