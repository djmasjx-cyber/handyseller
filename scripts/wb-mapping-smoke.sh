#!/usr/bin/env bash
set -euo pipefail

# WB mapping smoke check (safe mode).
# Required env:
#   BASE_URL="http://localhost:3000"
#   TOKEN="<jwt>"
#
# Optional env:
#   REPAIR_LIMIT=30

if [[ -z "${BASE_URL:-}" ]]; then
  echo "BASE_URL is required, e.g. BASE_URL=http://localhost:3000"
  exit 1
fi

if [[ -z "${TOKEN:-}" ]]; then
  echo "TOKEN is required (Bearer token of current user session)"
  exit 1
fi

REPAIR_LIMIT="${REPAIR_LIMIT:-30}"

auth_header="Authorization: Bearer ${TOKEN}"
json_header="Content-Type: application/json"

echo "1/3 WB mapping audit"
curl -sS "${BASE_URL}/api/marketplaces/wb-mapping-audit" \
  -H "${auth_header}" | sed 's/^/  /'
echo
echo

echo "2/3 WB manual health check (dry-run preview only)"
curl -sS -X POST "${BASE_URL}/api/marketplaces/wb-mapping-health/run" \
  -H "${auth_header}" \
  -H "${json_header}" \
  --data "{\"withDryRunRepairPreview\":true,\"withApplyRepair\":false,\"repairLimit\":${REPAIR_LIMIT},\"sendTelegram\":false}" | sed 's/^/  /'
echo
echo

echo "3/3 WB mapping repair async dry-run"
curl -sS -X POST "${BASE_URL}/api/marketplaces/wb-mapping-repair?async=true" \
  -H "${auth_header}" \
  -H "${json_header}" \
  --data "{\"limit\":${REPAIR_LIMIT},\"dryRun\":true}" | sed 's/^/  /'
echo
echo

echo "Smoke completed."
