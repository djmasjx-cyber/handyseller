#!/bin/bash
# [АЛЬТЕРНАТИВА] Деплой API в Docker на VM (отдельно от full-deploy)
# Для обычного деплоя используйте: npm run deploy (full-deploy.sh)
#
# Этот скрипт — для случая, когда API нужен в Docker, а не как node-процесс.
# Требуется: Docker локально, Managed PostgreSQL (или иная БД). SSH к VM.

set -e
VM_HOST="${HS_VM_HOST:-158.160.209.158}"
VM_USER="${HS_VM_USER:-ubuntu}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Сборка Docker-образа..."
docker build -f apps/api/Dockerfile -t handyseller-api:latest .

echo "==> Сохранение образа в tar..."
docker save handyseller-api:latest -o /tmp/handyseller-api.tar

echo "==> Копирование на VM..."
ssh "$VM_USER@$VM_HOST" "mkdir -p ~/handyseller"
scp -o StrictHostKeyChecking=no /tmp/handyseller-api.tar "$VM_USER@$VM_HOST:/tmp/"
scp -o StrictHostKeyChecking=no "$ROOT/docker-compose.api.yml" "$VM_USER@$VM_HOST:~/handyseller/docker-compose.yml"

echo "==> Запуск на VM..."
ssh "$VM_USER@$VM_HOST" "cd ~/handyseller && docker load -i /tmp/handyseller-api.tar && docker compose down 2>/dev/null; docker compose up -d"

echo "==> Готово. API: http://$VM_HOST:4000"
echo "    Health: http://$VM_HOST:4000/health"
