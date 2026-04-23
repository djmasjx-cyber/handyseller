#!/usr/bin/env bash
set -euo pipefail

# TMS SLO alert gate.
# Non-zero exit code means SLO breach candidate.
#
# Optional env:
#   API_BASE_URL                           default: https://api.handyseller.ru/api
#   ACCESS_TOKEN                           bearer token for /tms/slo/metrics
#   STALE_HOURS                            default: 24
#   WEBHOOK_WINDOW_HOURS                   default: 24
#   MAX_STALE_SHIPMENTS                    default: 50
#   MIN_WEBHOOK_SUCCESS_RATE               default: 0.95
#   MAX_FAILED_SYNC_JOBS                   default: 20
#   MAX_CARRIER_FAILED_SHARE               default: 0.70
#   MAX_QUOTE_P95_MS                       default: 120000
#   MAX_CONFIRM_P95_MS                     default: 180000

API_BASE_URL="${API_BASE_URL:-https://api.handyseller.ru/api}"
ACCESS_TOKEN="${ACCESS_TOKEN:-}"
STALE_HOURS="${STALE_HOURS:-24}"
WEBHOOK_WINDOW_HOURS="${WEBHOOK_WINDOW_HOURS:-24}"

MAX_STALE_SHIPMENTS="${MAX_STALE_SHIPMENTS:-50}"
MIN_WEBHOOK_SUCCESS_RATE="${MIN_WEBHOOK_SUCCESS_RATE:-0.95}"
MAX_FAILED_SYNC_JOBS="${MAX_FAILED_SYNC_JOBS:-20}"
MAX_CARRIER_FAILED_SHARE="${MAX_CARRIER_FAILED_SHARE:-0.70}"
MAX_QUOTE_P95_MS="${MAX_QUOTE_P95_MS:-120000}"
MAX_CONFIRM_P95_MS="${MAX_CONFIRM_P95_MS:-180000}"

if [[ -z "${ACCESS_TOKEN}" ]]; then
  echo "[slo-check] ERROR: ACCESS_TOKEN is required" >&2
  exit 2
fi

URL="${API_BASE_URL%/}/tms/slo/metrics?staleHours=${STALE_HOURS}&webhookWindowHours=${WEBHOOK_WINDOW_HOURS}"
REQ_ID="slo-check-$(date +%s)-$RANDOM"

RESPONSE="$(
  curl -sS -m 25 -X GET "${URL}" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "X-Request-Id: ${REQ_ID}" \
    -H "Accept: application/json"
)"

if ! echo "${RESPONSE}" | jq . >/dev/null 2>&1; then
  echo "[slo-check] ERROR: non-json response" >&2
  echo "${RESPONSE}" >&2
  exit 2
fi

stale_shipments="$(echo "${RESPONSE}" | jq -r '.totals.staleShipments // 0')"
webhook_success_rate="$(echo "${RESPONSE}" | jq -r '.webhookDelivery.successRate // 0')"
failed_sync_jobs="$(echo "${RESPONSE}" | jq -r '.syncJobs.failed // 0')"
quote_p95_ms="$(echo "${RESPONSE}" | jq -r '.latency.quoteMs.p95 // 0')"
confirm_p95_ms="$(echo "${RESPONSE}" | jq -r '.latency.confirmMs.p95 // 0')"
top_carrier_share="$(echo "${RESPONSE}" | jq -r '.carrierErrors.byCarrier[0].rate // 0')"
top_carrier_name="$(echo "${RESPONSE}" | jq -r '.carrierErrors.byCarrier[0].carrier // "n/a"')"

breach=0
check_fail() {
  local msg="$1"
  echo "[slo-check] BREACH: ${msg}" >&2
  breach=1
}

awk -v a="${stale_shipments}" -v b="${MAX_STALE_SHIPMENTS}" 'BEGIN {exit !(a>b)}' && \
  check_fail "staleShipments=${stale_shipments} > ${MAX_STALE_SHIPMENTS}"
awk -v a="${webhook_success_rate}" -v b="${MIN_WEBHOOK_SUCCESS_RATE}" 'BEGIN {exit !(a<b)}' && \
  check_fail "webhookSuccessRate=${webhook_success_rate} < ${MIN_WEBHOOK_SUCCESS_RATE}"
awk -v a="${failed_sync_jobs}" -v b="${MAX_FAILED_SYNC_JOBS}" 'BEGIN {exit !(a>b)}' && \
  check_fail "failedSyncJobs=${failed_sync_jobs} > ${MAX_FAILED_SYNC_JOBS}"
awk -v a="${quote_p95_ms}" -v b="${MAX_QUOTE_P95_MS}" 'BEGIN {exit !(a>b)}' && \
  check_fail "quoteP95Ms=${quote_p95_ms} > ${MAX_QUOTE_P95_MS}"
awk -v a="${confirm_p95_ms}" -v b="${MAX_CONFIRM_P95_MS}" 'BEGIN {exit !(a>b)}' && \
  check_fail "confirmP95Ms=${confirm_p95_ms} > ${MAX_CONFIRM_P95_MS}"
awk -v a="${top_carrier_share}" -v b="${MAX_CARRIER_FAILED_SHARE}" 'BEGIN {exit !(a>b)}' && \
  check_fail "carrierFailedShare[${top_carrier_name}]=${top_carrier_share} > ${MAX_CARRIER_FAILED_SHARE}"

echo "[slo-check] snapshot stale=${stale_shipments} webhookRate=${webhook_success_rate} failedJobs=${failed_sync_jobs} quoteP95=${quote_p95_ms} confirmP95=${confirm_p95_ms}"

if [[ ${breach} -ne 0 ]]; then
  exit 1
fi

echo "[slo-check] PASS"
