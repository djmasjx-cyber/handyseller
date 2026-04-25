#!/usr/bin/env bash
set -euo pipefail

TMS_BASE_URL="${TMS_BASE_URL:-http://localhost:4001/tms}"
TMS_ACCESS_TOKEN="${TMS_ACCESS_TOKEN:-}"

if [[ -z "${TMS_ACCESS_TOKEN}" ]]; then
  echo "FAIL TMS_ACCESS_TOKEN is required" >&2
  exit 1
fi

echo "1) Load registry list..."
list_response="$(
  curl -sS \
    -H "Authorization: Bearer ${TMS_ACCESS_TOKEN}" \
    "${TMS_BASE_URL}/v1/orders?limit=5"
)"

items_type="$(echo "${list_response}" | jq -r 'if (.items | type) == "array" then "array" else "bad" end')"
if [[ "${items_type}" != "array" ]]; then
  echo "FAIL step=list expected .items array" >&2
  echo "${list_response}" >&2
  exit 1
fi

request_id="$(echo "${list_response}" | jq -r '.items[0].requestId // empty')"
if [[ -z "${request_id}" ]]; then
  echo "OK registry is reachable; no orders yet"
  exit 0
fi

echo "2) Load registry detail requestId=${request_id}..."
detail_response="$(
  curl -sS \
    -H "Authorization: Bearer ${TMS_ACCESS_TOKEN}" \
    "${TMS_BASE_URL}/v1/orders/${request_id}"
)"

detail_request_id="$(echo "${detail_response}" | jq -r '.requestId // empty')"
if [[ "${detail_request_id}" != "${request_id}" ]]; then
  echo "FAIL step=detail expected matching requestId" >&2
  echo "${detail_response}" >&2
  exit 1
fi

audit_type="$(echo "${detail_response}" | jq -r 'if (.auditEvents | type) == "array" then "array" else "bad" end')"
if [[ "${audit_type}" != "array" ]]; then
  echo "FAIL step=detail expected .auditEvents array" >&2
  echo "${detail_response}" >&2
  exit 1
fi

echo "OK registry list/detail smoke passed"
