#!/bin/bash
# Загрузка runtime-секретов из Yandex Lockbox в окружение shell.
# Использование:
#   export YC_LOCKBOX_SECRET_ID=...
#   source ./scripts/load-lockbox-secrets.sh

set -euo pipefail

SECRET_ID="${YC_LOCKBOX_SECRET_ID:-${LOCKBOX_SECRET_ID:-}}"
if [ -z "${SECRET_ID}" ]; then
  exit 0
fi

if ! command -v yc >/dev/null 2>&1; then
  echo "[lockbox] yc CLI not found, skip Lockbox sync" >&2
  exit 0
fi

TMP_JSON="$(mktemp)"
trap 'rm -f "$TMP_JSON"' EXIT

yc lockbox payload get --id "$SECRET_ID" --format json > "$TMP_JSON"

while IFS= read -r line; do
  if [ -n "$line" ]; then
    export "$line"
  fi
done < <(python3 - "$TMP_JSON" <<'PY'
import json
import shlex
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    payload = json.load(f)

entries = payload.get("entries", [])
for item in entries:
    key = item.get("key")
    text = item.get("textValue")
    if not key or text is None:
        continue
    print(f"{key}={shlex.quote(text)}")
PY
)

echo "[lockbox] Loaded secrets from Lockbox ${SECRET_ID}" >&2
