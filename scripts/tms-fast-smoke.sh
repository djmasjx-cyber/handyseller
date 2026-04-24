#!/usr/bin/env bash
set -euo pipefail

# Fast deterministic smoke for dev/staging gate.
# Does not call carrier estimate/confirm endpoints.

API_BASE_URL="${API_BASE_URL:-https://api.handyseller.ru/api}"
USER_ID="${USER_ID:-u_demo}"
TRACE_ID_PREFIX="${TRACE_ID_PREFIX:-fast-smoke}"

trace_id() {
  local step="$1"
  echo "${TRACE_ID_PREFIX}-${step}-$(date +%s)-$RANDOM"
}

api_json() {
  local method="$1"
  local url="$2"
  curl -sS -X "$method" "$url" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "X-Request-Id: $(trace_id "${method}")"
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

echo "2) Integration health (protected endpoint)..."
OVERVIEW_RESPONSE="$(api_json GET "${API_BASE_URL}/tms/dashboard/overview?userId=${USER_ID}")"
if ! echo "${OVERVIEW_RESPONSE}" | jq -e '.' >/dev/null; then
  echo "ERROR: dashboard overview is not valid JSON" >&2
  echo "${OVERVIEW_RESPONSE}" >&2
  exit 1
fi

echo "3) List shipments (no carrier side-effects)..."
SHIPMENTS_RESPONSE="$(api_json GET "${API_BASE_URL}/tms/v1/shipments?limit=1")"
if ! echo "${SHIPMENTS_RESPONSE}" | jq -e '.' >/dev/null; then
  echo "ERROR: shipments endpoint is not valid JSON" >&2
  echo "${SHIPMENTS_RESPONSE}" >&2
  exit 1
fi

echo "PASS fast_m2m_smoke=true"
