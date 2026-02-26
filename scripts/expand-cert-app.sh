#!/bin/bash
# Расширить SSL-сертификат для app.handyseller.ru
# Запускать ПОСЛЕ добавления A-записи app → IP VM в reg.ru
#
# VM_HOST=158.160.209.158 DEPLOY_SSH_KEY=~/.ssh/yandex_vm ./scripts/expand-cert-app.sh

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

echo "==> Расширение сертификата: +app.handyseller.ru"
ssh $SSH_OPTS ${VM_USER}@${VM_HOST} "sudo certbot certonly --webroot -w /var/www/html -d handyseller.ru -d www.handyseller.ru -d app.handyseller.ru --expand --non-interactive --agree-tos --email $EMAIL --preferred-challenges http"

echo "==> Добавление app в nginx 443..."
# Обновить server_name в 443 блоке (только если app ещё нет)
ssh $SSH_OPTS ${VM_USER}@${VM_HOST} "grep -q 'app.handyseller.ru' /etc/nginx/sites-available/handyseller || sudo sed -i 's/server_name handyseller.ru www.handyseller.ru;/server_name handyseller.ru www.handyseller.ru app.handyseller.ru;/' /etc/nginx/sites-available/handyseller"
ssh $SSH_OPTS ${VM_USER}@${VM_HOST} "sudo nginx -t && sudo nginx -s reload"

echo ""
echo "==> Готово! https://app.handyseller.ru"
