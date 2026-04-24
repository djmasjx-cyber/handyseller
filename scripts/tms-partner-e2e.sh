#!/usr/bin/env bash
set -euo pipefail

# HandySeller TMS partner flow smoke script.
# Usage:
#   CLIENT_ID=... CLIENT_SECRET=... USER_ID=... ./scripts/tms-partner-e2e.sh
# Optional:
#   API_BASE_URL (default: https://api.handyseller.ru/api)
#   ORDER_TYPE   (default: CLIENT_ORDER)
#   EXTERNAL_ORDER_ID (default: 1C-ORDER-<timestamp>)
#   CALLBACK_URL (for webhook subscription creation)
#   PREFERRED_CARRIER_ID (e.g. cdek, major-express, dellin)
#   DOWNLOAD_DOC (default: true)

API_BASE_URL="${API_BASE_URL:-https://api.handyseller.ru/api}"
ORDER_TYPE="${ORDER_TYPE:-CLIENT_ORDER}"
USER_ID="${USER_ID:-u_demo}"
EXTERNAL_ORDER_ID="${EXTERNAL_ORDER_ID:-1C-ORDER-$(date +%s)}"
CALLBACK_URL="${CALLBACK_URL:-}"
PREFERRED_CARRIER_ID="${PREFERRED_CARRIER_ID:-}"
DOWNLOAD_DOC="${DOWNLOAD_DOC:-true}"
TRACE_ID_PREFIX="${TRACE_ID_PREFIX:-smoke}"

trace_id() {
  local step="$1"
  echo "${TRACE_ID_PREFIX}-${step}-$(date +%s)-$RANDOM"
}

classify_error() {
  local body="$1"
  local lower
  lower="$(printf '%s' "$body" | tr '[:upper:]' '[:lower:]')"
  if [[ "$lower" == *"timeout"* || "$lower" == *"timed out"* ]]; then echo "timeout"; return; fi
  if [[ "$lower" == *"401"* || "$lower" == *"403"* || "$lower" == *"unauthorized"* || "$lower" == *"forbidden"* ]]; then echo "auth"; return; fi
  if [[ "$lower" == *"400"* || "$lower" == *"validation"* || "$lower" == *"invalid"* || "$lower" == *"schema"* ]]; then echo "validation"; return; fi
  if [[ "$lower" == *"not ready"* || "$lower" == *"pdf not ready"* || "$lower" == *"uuid not ready"* ]]; then echo "doc_not_ready"; return; fi
  if [[ "$lower" == *"cdek"* || "$lower" == *"major"* || "$lower" == *"dellin"* || "$lower" == *"carrier"* ]]; then echo "carrier"; return; fi
  echo "unknown"
}

is_rate_limited() {
  local body="$1"
  local lower
  lower="$(printf '%s' "$body" | tr '[:upper:]' '[:lower:]')"
  [[ "$lower" == *"http 429"* || "$lower" == *"\"code\":429"* || "$lower" == *"too many requests"* ]]
}

fail_step() {
  local step="$1"
  local body="$2"
  local reason
  reason="$(classify_error "$body")"
  echo "FAIL step=${step} reason=${reason}" >&2
  echo "$body" >&2
  exit 1
}

api_json() {
  local method="$1"
  local url="$2"
  local payload="${3:-}"
  local req_id
  req_id="$(trace_id "${method}")"
  if [[ -n "$payload" ]]; then
    curl -sS -X "$method" "$url" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "Content-Type: application/json" \
      -H "X-Request-Id: ${req_id}" \
      ${IDEMPOTENCY_KEY:+-H "Idempotency-Key: ${IDEMPOTENCY_KEY}"} \
      -d "$payload"
  else
    curl -sS -X "$method" "$url" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "X-Request-Id: ${req_id}" \
      ${IDEMPOTENCY_KEY:+-H "Idempotency-Key: ${IDEMPOTENCY_KEY}"}
  fi
}

if [[ -z "${CLIENT_ID:-}" || -z "${CLIENT_SECRET:-}" ]]; then
  echo "ERROR: CLIENT_ID and CLIENT_SECRET are required." >&2
  exit 1
fi

echo "1) OAuth token..."
TOKEN_RESPONSE="$(curl -sS -X POST "${API_BASE_URL}/tms/oauth/token" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: $(trace_id oauth)" \
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
    ],
    "contacts": {
      "shipper": {
        "name": "Склад HandySeller",
        "phone": "+79990001122"
      },
      "recipient": {
        "name": "Тестовый получатель",
        "phone": "+79990003344"
      }
    }
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
IDEMPOTENCY_KEY="estimate-${EXTERNAL_ORDER_ID}"
ESTIMATE_RESPONSE="$(api_json POST "${API_BASE_URL}/tms/v1/shipments/estimate" "${REQUEST_BODY}")"
unset IDEMPOTENCY_KEY
REQUEST_ID="$(echo "${ESTIMATE_RESPONSE}" | jq -r '.shipmentRequestId // empty')"
if [[ -z "${REQUEST_ID}" ]]; then fail_step "estimate" "${ESTIMATE_RESPONSE}"; fi
if [[ -n "${PREFERRED_CARRIER_ID}" ]]; then
  QUOTE_ID="$(echo "${ESTIMATE_RESPONSE}" | jq -r --arg cid "${PREFERRED_CARRIER_ID}" '.options[] | select(.carrierId==$cid) | .quoteId' | head -n 1)"
else
  QUOTE_ID="$(echo "${ESTIMATE_RESPONSE}" | jq -r '.options[0].quoteId // empty')"
fi
if [[ -z "${QUOTE_ID}" ]]; then fail_step "estimate_select_quote" "${ESTIMATE_RESPONSE}"; fi

echo "3) Select quote..."
SELECT_RESPONSE="$(api_json POST "${API_BASE_URL}/tms/v1/shipments/${REQUEST_ID}/select" "{\"quoteId\":\"${QUOTE_ID}\"}")"
SELECTED_QUOTE_ID="$(echo "${SELECT_RESPONSE}" | jq -r '.selectedQuoteId // empty')"
if [[ -z "${SELECTED_QUOTE_ID}" ]]; then fail_step "select_quote" "${SELECT_RESPONSE}"; fi

echo "4) Confirm..."
IDEMPOTENCY_KEY="confirm-${EXTERNAL_ORDER_ID}"
CONFIRM_RESPONSE=""
for attempt in 1 2 3; do
  CONFIRM_RESPONSE="$(api_json POST "${API_BASE_URL}/tms/v1/shipments/${REQUEST_ID}/confirm")"
  SHIPMENT_ID="$(echo "${CONFIRM_RESPONSE}" | jq -r '.id // empty')"
  if [[ -n "${SHIPMENT_ID}" ]]; then
    break
  fi
  if is_rate_limited "${CONFIRM_RESPONSE}"; then
    sleep $((attempt * 5))
    continue
  fi
  break
done
unset IDEMPOTENCY_KEY
SHIPMENT_ID="$(echo "${CONFIRM_RESPONSE}" | jq -r '.id // empty')"
if [[ -z "${SHIPMENT_ID}" ]]; then
  fail_step "confirm" "${CONFIRM_RESPONSE}"
fi

echo "5) Get shipment + events..."
SHIPMENT_RESPONSE="$(api_json GET "${API_BASE_URL}/tms/v1/shipments/${SHIPMENT_ID}")"
echo "${SHIPMENT_RESPONSE}" | jq .
EVENTS_RESPONSE="$(api_json GET "${API_BASE_URL}/tms/v1/shipments/${SHIPMENT_ID}/events")"
echo "${EVENTS_RESPONSE}" | jq .

echo "6) Refresh shipment..."
REFRESH_RESPONSE="$(api_json POST "${API_BASE_URL}/tms/shipments/${SHIPMENT_ID}/refresh")"
REFRESH_STATUS="$(echo "${REFRESH_RESPONSE}" | jq -r '.status // empty')"
if [[ -z "${REFRESH_STATUS}" ]]; then fail_step "refresh" "${REFRESH_RESPONSE}"; fi

echo "7) Documents list + optional file..."
DOCS_RESPONSE="$(api_json GET "${API_BASE_URL}/tms/shipments/${SHIPMENT_ID}/documents")"
DOC_ID="$(echo "${DOCS_RESPONSE}" | jq -r '.[0].id // empty')"
if [[ -z "${DOC_ID}" ]]; then
  fail_step "documents_list" "${DOCS_RESPONSE}"
fi
if [[ "${DOWNLOAD_DOC}" == "true" ]]; then
  DOC_REQ_ID="$(trace_id docfile)"
  DOC_STATUS="$(
    curl -sS -o /tmp/tms-smoke-doc.bin -w "%{http_code}" \
      -X GET "${API_BASE_URL}/tms/shipments/${SHIPMENT_ID}/documents/${DOC_ID}/file" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "X-Request-Id: ${DOC_REQ_ID}"
  )"
  if [[ "${DOC_STATUS}" != "200" ]]; then
    fail_step "document_file" "HTTP ${DOC_STATUS} for documentId=${DOC_ID}"
  fi
fi

echo "8) Lookup by externalOrderId..."
LOOKUP_RESPONSE="$(api_json GET "${API_BASE_URL}/tms/v1/shipments/by-external/${EXTERNAL_ORDER_ID}?orderType=${ORDER_TYPE}")"
echo "${LOOKUP_RESPONSE}" | jq .

echo "9) Batch sync query..."
BATCH_RESPONSE="$(api_json GET "${API_BASE_URL}/tms/v1/shipments?updatedSince=$(date -u -d '1 day ago' +%Y-%m-%dT%H:%M:%S.000Z)&limit=20")"
echo "${BATCH_RESPONSE}" | jq .

if [[ -n "${CALLBACK_URL}" ]]; then
  echo "10) Create webhook subscription..."
  WEBHOOK_RESPONSE="$(api_json POST "${API_BASE_URL}/tms/v1/webhooks/subscriptions" "{\"callbackUrl\":\"${CALLBACK_URL}\"}")"
  echo "${WEBHOOK_RESPONSE}" | jq .
fi

echo "PASS carrier=${PREFERRED_CARRIER_ID:-auto} requestId=${REQUEST_ID} shipmentId=${SHIPMENT_ID}"
