#!/bin/bash
# Синхронизация изменений с локальной машины на сервер (для Remote-SSH).
# Запуск: ./scripts/sync-to-remote.sh
# Используйте после setup-remote-dev.sh, если вносите правки локально.

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
[ -f "$ROOT/.env.secrets" ] && set -a && . "$ROOT/.env.secrets" && set +a

VM_HOST="${VM_HOST:-158.160.209.158}"
VM_USER="${VM_USER:-ubuntu}"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/yandex_vm}"
REMOTE_DIR="${REMOTE_DEV_DIR:-handyseller-dev}"

rsync -avz -e "ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no" \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'out' \
  --exclude 'apps/*/dist' \
  --exclude 'apps/*/.next' \
  --exclude '*.tsbuildinfo' \
  --exclude '.deploy-tmp' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude '.env.production' \
  "$ROOT/" "${VM_USER}@${VM_HOST}:~/${REMOTE_DIR}/"

echo "Синхронизировано: $VM_USER@$VM_HOST:~/$REMOTE_DIR"
