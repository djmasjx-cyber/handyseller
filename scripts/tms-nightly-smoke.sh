#!/usr/bin/env bash
set -euo pipefail

# Nightly smoke checks for HandySeller TMS API.
# Optional env:
#   API_BASE_URL            default: https://app.handyseller.ru/api
#   CLIENT_ID/CLIENT_SECRET for full partner e2e flow
#   USER_ID                 default: u_smoke
#   ORDER_TYPE              default: CLIENT_ORDER
#   EXTERNAL_ORDER_ID       default: NIGHTLY-<timestamp>

API_BASE_URL="${API_BASE_URL:-https://app.handyseller.ru/api}"
API_ORIGIN="${API_BASE_URL%/api}"
USER_ID="${USER_ID:-u_smoke}"
ORDER_TYPE="${ORDER_TYPE:-CLIENT_ORDER}"
EXTERNAL_ORDER_ID="${EXTERNAL_ORDER_ID:-NIGHTLY-$(date +%s)}"

echo "[smoke] 1/4 API root reachability"
if ! curl -fsS -m 20 "${API_BASE_URL%/}/" >/dev/null 2>&1; then
  echo "[smoke] WARN: API root did not return 2xx"
fi

echo "[smoke] 2/4 health endpoint"
if ! curl -fsS -m 20 "${API_ORIGIN}/health" >/dev/null 2>&1; then
  echo "[smoke] WARN: health endpoint check failed"
fi

echo "[smoke] 3/4 partner endpoints discovery"
if ! curl -fsS -m 20 "${API_BASE_URL%/}/tms/oauth/token" -X OPTIONS >/dev/null 2>&1; then
  echo "[smoke] WARN: oauth endpoint OPTIONS check failed"
fi

echo "[smoke] 4/4 full partner e2e (optional)"
if [[ -n "${CLIENT_ID:-}" && -n "${CLIENT_SECRET:-}" ]]; then
  CLIENT_ID="${CLIENT_ID}" \
  CLIENT_SECRET="${CLIENT_SECRET}" \
  USER_ID="${USER_ID}" \
  ORDER_TYPE="${ORDER_TYPE}" \
  EXTERNAL_ORDER_ID="${EXTERNAL_ORDER_ID}" \
  API_BASE_URL="${API_BASE_URL}" \
  bash "/home/ubuntu/handyseller-repo/scripts/tms-partner-e2e.sh"
else
  echo "[smoke] SKIP full e2e (CLIENT_ID/CLIENT_SECRET not provided)"
fi

echo "[smoke] DONE"
