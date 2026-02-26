#!/bin/bash
# Ручной деплой на VM когда CI не сработал.
# Запуск: VM_HOST=158.160.x.x bash scripts/deploy-manual-ssh.sh
# Требуется: .env.secrets с VM_HOST, VM_SSH_KEY (или ~/.ssh/yandex_vm)

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/.env.secrets" ] && set -a && . "$ROOT/.env.secrets" && set +a

VM_HOST="${VM_HOST:?Укажите VM_HOST}"
VM_USER="${VM_USER:-ubuntu}"
SSH_KEY="${VM_SSH_KEY:-$HOME/.ssh/yandex_vm}"
[ -f "$SSH_KEY" ] || { echo "SSH-ключ не найден: $SSH_KEY"; exit 1; }

echo "==> Копирование docker-compose.ci.yml и скриптов на VM..."
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no \
  "$ROOT/docker-compose.ci.yml" \
  "$ROOT/scripts/vm-watchdog.sh" \
  "$ROOT/scripts/handyseller-start.sh" \
  ${VM_USER}@${VM_HOST}:/opt/handyseller/

echo "==> Деплой на VM..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no ${VM_USER}@${VM_HOST} << 'REMOTE'
set -e
cd /opt/handyseller
chmod +x vm-watchdog.sh handyseller-start.sh

# Обновить IMAGE_* в .env.production
IMAGE_API="ghcr.io/djmasjx-cyber/handyseller-api:latest"
IMAGE_WEB="ghcr.io/djmasjx-cyber/handyseller-web:latest"
[ -f .env.production ] && grep -v '^IMAGE_API=' .env.production | grep -v '^IMAGE_WEB=' > .env.tmp || touch .env.tmp
echo "IMAGE_API=$IMAGE_API" >> .env.tmp
echo "IMAGE_WEB=$IMAGE_WEB" >> .env.tmp
mv .env.tmp .env.production

# Логин в ghcr.io: если образы приватные, выполните на VM:
#   echo $CR_PAT | docker login ghcr.io -u djmasjx-cyber --password-stdin

export IMAGE_API IMAGE_WEB
docker compose -f docker-compose.ci.yml pull
docker compose -f docker-compose.ci.yml --env-file .env.production up -d
sudo systemctl reload nginx 2>/dev/null || true
docker compose -f docker-compose.ci.yml ps
echo "Готово: https://app.handyseller.ru"
REMOTE
