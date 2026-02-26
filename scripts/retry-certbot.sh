#!/bin/bash
# Повторная попытка получения SSL после исправления DNS
# Запускать когда A-записи @ и www указывают на IP VM
#
# VM_HOST=158.160.209.158 DEPLOY_SSH_KEY=~/.ssh/yandex_vm ./scripts/retry-certbot.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/.env.secrets" ] && set -a && . "$ROOT/.env.secrets" && set +a

SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/yandex_vm}"
VM_HOST="${VM_HOST:-$(yc compute instance list --format json 2>/dev/null | jq -r '.[] | select(.name=="handyseller-vm") | .network_interfaces[0].primary_v4_address.one_to_one_nat.address' 2>/dev/null)}"
VM_USER="${VM_USER:-ubuntu}"
EMAIL="${ADMIN_EMAIL:-admin@handyseller.ru}"

[ -z "$VM_HOST" ] || [ "$VM_HOST" = "null" ] && { echo "Укажите VM_HOST"; exit 1; }
[ ! -f "$SSH_KEY" ] && { echo "SSH-ключ не найден: $SSH_KEY"; exit 1; }

SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no"

echo "==> Получение SSL-сертификата для handyseller.ru..."
ssh $SSH_OPTS ${VM_USER}@${VM_HOST} "sudo certbot certonly --webroot -w /var/www/html -d handyseller.ru -d www.handyseller.ru --non-interactive --agree-tos --email $EMAIL --preferred-challenges http"

echo "==> Установка конфига с HTTPS..."
scp $SSH_OPTS "$ROOT/nginx/handyseller-domain.conf" ${VM_USER}@${VM_HOST}:/tmp/
ssh $SSH_OPTS ${VM_USER}@${VM_HOST} "sudo cp /tmp/handyseller-domain.conf /etc/nginx/sites-available/handyseller && sudo nginx -t && sudo nginx -s reload"

echo ""
echo "==> Готово! https://handyseller.ru"
