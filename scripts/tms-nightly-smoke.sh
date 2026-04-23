#!/usr/bin/env bash
set -euo pipefail

# Nightly smoke checks for HandySeller TMS API.
# Optional env:
#   API_BASE_URL            default: https://api.handyseller.ru/api
#   CLIENT_ID/CLIENT_SECRET for full partner e2e flow
#   USER_ID                 default: u_smoke
#   ORDER_TYPE              default: CLIENT_ORDER
#   EXTERNAL_ORDER_ID       default: NIGHTLY-<timestamp>
#   NIGHTLY_CARRIERS        default: cdek,major-express
#   DOWNLOAD_DOC            default: true

API_BASE_URL="${API_BASE_URL:-https://api.handyseller.ru/api}"
API_ORIGIN="${API_BASE_URL%/api}"
USER_ID="${USER_ID:-u_smoke}"
ORDER_TYPE="${ORDER_TYPE:-CLIENT_ORDER}"
EXTERNAL_ORDER_ID="${EXTERNAL_ORDER_ID:-NIGHTLY-$(date +%s)}"
NIGHTLY_CARRIERS="${NIGHTLY_CARRIERS:-cdek,major-express}"
DOWNLOAD_DOC="${DOWNLOAD_DOC:-true}"

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
  IFS=',' read -r -a carriers <<< "${NIGHTLY_CARRIERS}"
  failures=0
  for carrier in "${carriers[@]}"; do
    carrier="$(echo "${carrier}" | xargs)"
    [[ -z "${carrier}" ]] && continue
    scenario_ext_id="${EXTERNAL_ORDER_ID}-${carrier}-$(date +%s)"
    echo "[smoke] scenario carrier=${carrier}"
    set +e
    SCENARIO_OUTPUT="$(
      CLIENT_ID="${CLIENT_ID}" \
      CLIENT_SECRET="${CLIENT_SECRET}" \
      USER_ID="${USER_ID}" \
      ORDER_TYPE="${ORDER_TYPE}" \
      EXTERNAL_ORDER_ID="${scenario_ext_id}" \
      API_BASE_URL="${API_BASE_URL}" \
      PREFERRED_CARRIER_ID="${carrier}" \
      DOWNLOAD_DOC="${DOWNLOAD_DOC}" \
      TRACE_ID_PREFIX="nightly-${carrier}" \
      bash "/home/ubuntu/handyseller-repo/scripts/tms-partner-e2e.sh" 2>&1
    )"
    code=$?
    set -e
    if [[ ${code} -ne 0 ]]; then
      failures=$((failures + 1))
      reason="$(echo "${SCENARIO_OUTPUT}" | awk '/^FAIL step=/{print $0; exit}')"
      echo "[smoke] FAIL carrier=${carrier} ${reason:-reason=unknown}"
      echo "${SCENARIO_OUTPUT}"
    else
      pass_line="$(echo "${SCENARIO_OUTPUT}" | awk '/^PASS carrier=/{print $0; exit}')"
      echo "[smoke] ${pass_line:-PASS carrier=${carrier}}"
    fi
  done
  if [[ ${failures} -gt 0 ]]; then
    echo "[smoke] FAILED scenarios=${failures}"
    exit 1
  fi
else
  echo "[smoke] SKIP full e2e (CLIENT_ID/CLIENT_SECRET not provided)"
fi

echo "[smoke] DONE"
