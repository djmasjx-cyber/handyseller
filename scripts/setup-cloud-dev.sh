#!/bin/bash
# Полная настройка облачной разработки (Remote-SSH + Managed PostgreSQL)
# Запускать на MacBook (где есть SSH к VM)
#
# Делает:
# 1. Добавляет handyseller в ~/.ssh/config
# 2. Синхронизирует проект на VM
# 3. Настраивает .env с Managed PostgreSQL
#
# После: Cursor → Remote-SSH → handyseller → Open Folder ~/handyseller-dev

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
[ -f "$ROOT/.env.secrets" ] && set -a && . "$ROOT/.env.secrets" && set +a

VM_HOST="${VM_HOST:-158.160.209.158}"
VM_USER="${VM_USER:-ubuntu}"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/yandex_vm}"
SSH_CONFIG="$HOME/.ssh/config"

echo "==> Настройка облачной разработки"
echo ""

# 1. SSH config
if ! grep -q "Host handyseller" "$SSH_CONFIG" 2>/dev/null; then
  echo "==> Добавление handyseller в ~/.ssh/config..."
  mkdir -p "$(dirname "$SSH_CONFIG")"
  cat >> "$SSH_CONFIG" << EOF

# HandySeller Remote-SSH
Host handyseller
  HostName ${VM_HOST}
  User ${VM_USER}
  IdentityFile ${SSH_KEY}
  ServerAliveInterval 60
EOF
  echo "    Добавлено."
else
  echo "==> handyseller уже в ~/.ssh/config"
fi

# 2. Проверка SSH
echo ""
echo "==> Проверка SSH-подключения..."
if ! ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=5 "${VM_USER}@${VM_HOST}" "echo OK" 2>/dev/null; then
  echo "Ошибка: не удалось подключиться к VM. Проверьте SSH-ключ и VM_HOST."
  exit 1
fi
echo "    OK"

# 3. Setup remote
echo ""
"$ROOT/scripts/setup-remote-dev.sh"

echo ""
echo "==> Готово! Дальше:"
echo "  1. Cursor: Cmd+Shift+P → Remote-SSH: Connect to Host → handyseller"
echo "  2. File → Open Folder → /home/ubuntu/handyseller-dev"
echo "  3. Терминал: npm run dev:api  (в одном), npm run dev (в другом)"
echo ""
