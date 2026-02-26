#!/bin/bash
# HandySeller — единственный скрипт деплоя
# Создаёт VM в Yandex Cloud (если нет) и разворачивает Web + API + Redis в Docker, БД — Yandex Managed PostgreSQL
#
# Запуск: npm run deploy  или  ./scripts/full-deploy.sh
# Требуется: yc CLI, SSH-ключ, .env.secrets (ADMIN_EMAIL, ADMIN_PASSWORD, YANDEX_MDB_HOST, YANDEX_MDB_PASSWORD)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/yandex_vm}"

if [ ! -f "$SSH_KEY" ]; then
  echo "Ошибка: SSH-ключ не найден. Укажите DEPLOY_SSH_KEY=/path/to/key"
  exit 1
fi

echo "==> Проверка yc CLI..."
if ! command -v yc &>/dev/null; then
  echo "Ошибка: установите Yandex Cloud CLI (yc)"
  exit 1
fi

# Создаём VM, если ещё не существует
VM_NAME="handyseller-vm"
VM_INFO=$(yc compute instance list --format json 2>/dev/null | jq -r ".[] | select(.name==\"$VM_NAME\") | .id" 2>/dev/null || true)

if [ -z "$VM_INFO" ]; then
  echo "==> Создание VM $VM_NAME..."
  if [ ! -f "${SSH_KEY}.pub" ]; then
    echo "Ошибка: нужен файл ${SSH_KEY}.pub"
    exit 1
  fi
  PUBLIC_KEY=$(cat "${SSH_KEY}.pub")
  if [ -z "$PUBLIC_KEY" ]; then
    echo "Ошибка: не удалось получить публичный ключ. Убедитесь, что есть ${SSH_KEY}.pub"
    exit 1
  fi

  SUBNET_ID=$(yc vpc subnet list --format json | jq -r '.[0].id')
  IMAGE_ID=$(yc compute image list --folder-id standard-images --format json | jq -r '[.[] | select(.family=="ubuntu-2204-lts") | select(.family | contains("oslogin") | not)] | .[0].id')

  yc compute instance create \
    --name "$VM_NAME" \
    --zone ru-central1-d \
    --platform standard-v3 \
    --cores 2 \
    --memory 2GB \
    --create-boot-disk "image-id=$IMAGE_ID,size=20GB" \
    --network-interface "subnet-id=$SUBNET_ID,nat-ip-version=ipv4" \
    --metadata "ssh-keys=ubuntu:${PUBLIC_KEY}" \
    --quiet

  echo "Ожидание загрузки VM (60 сек)..."
  sleep 60
fi

VM_IP=$(yc compute instance list --format json | jq -r ".[] | select(.name==\"$VM_NAME\") | .network_interfaces[0].primary_v4_address.one_to_one_nat.address")
if [ -z "$VM_IP" ] || [ "$VM_IP" = "null" ]; then
  echo "Ошибка: не удалось получить IP VM"
  exit 1
fi

echo "==> VM доступна по адресу $VM_IP"
echo "==> Запуск деплоя (Docker: Web + API + Redis, БД — Managed PostgreSQL)..."
cd "$PROJECT_DIR"
export DOCKER_BUILDKIT=0
DEPLOY_SSH_KEY="$SSH_KEY" VM_USER=ubuntu VM_HOST="$VM_IP" API_URL="http://localhost:4000" "$SCRIPT_DIR/deploy-vm-full.sh"
