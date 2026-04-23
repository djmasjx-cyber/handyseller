#!/bin/bash
# Настройка домена handyseller.ru на VM: порты 80/443, SSL (Let's Encrypt)
#
# Требуется: DNS уже указывает на VM (A-записи @, www, app, api)
#            Порты 80, 443 открыты в группе безопасности Yandex Cloud
#
# Использование:
#   ./scripts/setup-domain-ssl.sh
#   или: VM_HOST=158.160.209.158 DEPLOY_SSH_KEY=~/.ssh/yandex_vm ./scripts/setup-domain-ssl.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/yandex_vm}"
VM_HOST="${VM_HOST:-}"
VM_USER="${VM_USER:-ubuntu}"

if [ -z "$VM_HOST" ]; then
  VM_HOST=$(yc compute instance list --format json 2>/dev/null | jq -r '.[] | select(.name=="handyseller-vm") | .network_interfaces[0].primary_v4_address.one_to_one_nat.address' 2>/dev/null || true)
fi
if [ -z "$VM_HOST" ] || [ "$VM_HOST" = "null" ]; then
  echo "Ошибка: укажите VM_HOST или настройте yc CLI (yc compute instance list)"
  exit 1
fi
if [ ! -f "$SSH_KEY" ]; then
  echo "Ошибка: SSH-ключ не найден: $SSH_KEY"
  exit 1
fi

SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no"
DOMAIN="handyseller.ru"
EMAIL="${ADMIN_EMAIL:-admin@handyseller.ru}"

echo "==> Подключение к VM $VM_HOST..."

# 1. Копируем bootstrap-конфиг (порт 80, без SSL)
scp $SSH_OPTS "$ROOT/nginx/handyseller-bootstrap.conf" ${VM_USER}@${VM_HOST}:/tmp/

# 2. Выполняем на VM
ssh $SSH_OPTS ${VM_USER}@${VM_HOST} bash -s "$EMAIL" "$ROOT" << 'ENDSSH'
set -e
EMAIL="${1:-admin@handyseller.ru}"

# Создаём директорию для certbot
sudo mkdir -p /var/www/html
sudo chown -R www-data:www-data /var/www/html 2>/dev/null || sudo chown -R nginx:nginx /var/www/html 2>/dev/null || true

# Останавливаем nginx на 3000 (старый конфиг)
sudo nginx -s stop 2>/dev/null || true
sudo fuser -k 3000/tcp 2>/dev/null || true
sleep 2

# Заменяем конфиг на bootstrap (порт 80)
sudo cp /tmp/handyseller-bootstrap.conf /etc/nginx/sites-available/handyseller
sudo ln -sf /etc/nginx/sites-available/handyseller /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo nginx
echo "Nginx запущен на порту 80"

# Certbot
if ! command -v certbot &>/dev/null; then
  echo "Установка certbot..."
  sudo apt-get update -qq && sudo apt-get install -y certbot python3-certbot-nginx
fi

echo "Получение SSL-сертификата..."
sudo certbot certonly --webroot -w /var/www/html -d handyseller.ru -d www.handyseller.ru -d app.handyseller.ru -d api.handyseller.ru \
  --non-interactive --agree-tos --email "$EMAIL" \
  --preferred-challenges http

# Заменяем на полный конфиг с SSL
# (конфиг handyseller-domain.conf должен быть скопирован отдельно - через второй scp)
echo "Сертификат получен. Замените конфиг на handyseller-domain.conf и перезапустите nginx."
ENDSSH

# 3. Копируем полный конфиг с SSL
scp $SSH_OPTS "$ROOT/nginx/handyseller-domain.conf" ${VM_USER}@${VM_HOST}:/tmp/

ssh $SSH_OPTS ${VM_USER}@${VM_HOST} bash -s << 'ENDSSH2'
set -e
sudo cp /tmp/handyseller-domain.conf /etc/nginx/sites-available/handyseller
sudo nginx -t && sudo nginx -s reload
echo "Nginx перезапущен с HTTPS"
ENDSSH2

# Certbot auto-renewal
ssh $SSH_OPTS ${VM_USER}@${VM_HOST} "sudo certbot renew --dry-run 2>/dev/null || true"

echo ""
echo "==> Готово! Сайт: https://handyseller.ru"
echo "    Добавьте в .env.secrets: CORS_ORIGIN=https://handyseller.ru,https://www.handyseller.ru"
echo "    И передеплойте приложение."
