#!/bin/bash
# Настройка новой VM и первый деплой.
# Запуск: VM_HOST=51.250.119.224 bash scripts/setup-new-vm.sh
# Требуется: .env.secrets с YANDEX_MDB_*, ADMIN_*, CORS_ORIGIN

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VM_HOST_ARG="$VM_HOST"
[ -f "$ROOT/.env.secrets" ] && set -a && . "$ROOT/.env.secrets" && set +a
VM_HOST="${VM_HOST_ARG:-$VM_HOST}"
VM_HOST="${VM_HOST:?Укажите VM_HOST}"
VM_USER="${VM_USER:-ubuntu}"
SSH_KEY="${VM_SSH_KEY:-$HOME/.ssh/yandex_vm}"
[ -f "$SSH_KEY" ] || { echo "SSH-ключ не найден: $SSH_KEY"; exit 1; }

MDB_USER="${YANDEX_MDB_USER:-handyseller_user}"
CORS_ORIGIN="${CORS_ORIGIN:-https://handyseller.ru,https://www.handyseller.ru,https://app.handyseller.ru,http://app.handyseller.ru}"

if [ -z "$ADMIN_EMAIL" ] || [ -z "$ADMIN_PASSWORD" ]; then
  echo "Ошибка: ADMIN_EMAIL и ADMIN_PASSWORD в .env.secrets"
  exit 1
fi
if [ -z "$YANDEX_MDB_HOST" ] || [ -z "$YANDEX_MDB_PASSWORD" ]; then
  echo "Ошибка: YANDEX_MDB_HOST и YANDEX_MDB_PASSWORD в .env.secrets"
  exit 1
fi

DATABASE_URL="postgresql://${MDB_USER}:${YANDEX_MDB_PASSWORD}@${YANDEX_MDB_HOST}:6432/handyseller?sslmode=require"
JWT_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -base64 32)

echo "==> 1. Установка Docker, nginx, docker-compose (если нет)..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no ${VM_USER}@${VM_HOST} "command -v docker >/dev/null || (sudo apt-get update -qq && sudo apt-get install -y -qq docker.io) && sudo systemctl enable docker 2>/dev/null; docker compose version >/dev/null 2>&1 || sudo apt-get install -y -qq docker-compose-plugin 2>/dev/null; sudo usermod -aG docker ${VM_USER} 2>/dev/null; command -v nginx >/dev/null || (sudo apt-get update -qq && sudo apt-get install -y -qq nginx)"

echo "==> 2. Создание /opt/handyseller на VM..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no ${VM_USER}@${VM_HOST} "sudo mkdir -p /opt/handyseller/nginx && sudo chown -R ${VM_USER}:${VM_USER} /opt/handyseller"

echo "==> 3. Копирование файлов..."
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no \
  "$ROOT/docker-compose.ci.yml" \
  "$ROOT/scripts/vm-watchdog.sh" \
  "$ROOT/scripts/handyseller-start.sh" \
  ${VM_USER}@${VM_HOST}:/opt/handyseller/
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -r \
  "$ROOT/nginx/"* \
  ${VM_USER}@${VM_HOST}:/opt/handyseller/nginx/

echo "==> 4. Создание .env.production..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no ${VM_USER}@${VM_HOST} "cat > /opt/handyseller/.env.production" << ENVEOF
NODE_ENV=production
PORT=4000
REDIS_HOST=redis
JWT_EXPIRES_IN=2h
DATABASE_URL=$DATABASE_URL
JWT_SECRET=$JWT_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY
CORS_ORIGIN=$CORS_ORIGIN
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD
IMAGE_API=ghcr.io/djmasjx-cyber/handyseller-api:latest
IMAGE_WEB=ghcr.io/djmasjx-cyber/handyseller-web:latest
ENVEOF

# Опциональные переменные
[ -n "$RESEND_API_KEY" ] && ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no ${VM_USER}@${VM_HOST} "echo RESEND_API_KEY=$RESEND_API_KEY >> /opt/handyseller/.env.production"
[ -n "$EMAIL_FROM" ] && ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no ${VM_USER}@${VM_HOST} "echo EMAIL_FROM=$EMAIL_FROM >> /opt/handyseller/.env.production"
[ -n "$VTB_USER_NAME" ] && ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no ${VM_USER}@${VM_HOST} "echo VTB_USER_NAME=$VTB_USER_NAME >> /opt/handyseller/.env.production"
[ -n "$VTB_PASSWORD" ] && ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no ${VM_USER}@${VM_HOST} "echo VTB_PASSWORD=$VTB_PASSWORD >> /opt/handyseller/.env.production"
[ -n "$VTB_MODE" ] && ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no ${VM_USER}@${VM_HOST} "echo VTB_MODE=$VTB_MODE >> /opt/handyseller/.env.production"

echo "==> 5. Nginx, watchdog, systemd..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no ${VM_USER}@${VM_HOST} << 'REMOTE'
set -e
cd /opt/handyseller
chmod +x vm-watchdog.sh handyseller-start.sh

# Nginx
sudo cp nginx/handyseller-bootstrap.conf /etc/nginx/sites-available/handyseller 2>/dev/null || sudo cp nginx/handyseller.conf /etc/nginx/sites-available/handyseller
sudo ln -sf /etc/nginx/sites-available/handyseller /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t 2>/dev/null && sudo systemctl enable nginx 2>/dev/null || true

# Watchdog cron
echo "*/2 * * * * root /opt/handyseller/vm-watchdog.sh" | sudo tee /etc/cron.d/handyseller-watchdog
sudo chmod 644 /etc/cron.d/handyseller-watchdog

# Systemd
sudo tee /etc/systemd/system/handyseller-compose.service > /dev/null << 'SVCEOF'
[Unit]
Description=HandySeller Docker Compose
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/handyseller
ExecStart=/opt/handyseller/handyseller-start.sh
ExecStop=/usr/bin/docker compose -f /opt/handyseller/docker-compose.ci.yml down

[Install]
WantedBy=multi-user.target
SVCEOF
sudo systemctl daemon-reload
sudo systemctl enable handyseller-compose
REMOTE

echo "==> 6. Docker pull и запуск..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no ${VM_USER}@${VM_HOST} << 'REMOTE'
set -e
cd /opt/handyseller
export IMAGE_API="ghcr.io/djmasjx-cyber/handyseller-api:latest"
export IMAGE_WEB="ghcr.io/djmasjx-cyber/handyseller-web:latest"
sudo docker compose -f docker-compose.ci.yml pull
sudo docker compose -f docker-compose.ci.yml --env-file .env.production up -d
sudo systemctl reload nginx 2>/dev/null || true
sleep 5
sudo docker compose -f docker-compose.ci.yml ps
REMOTE

echo ""
echo "=== Готово ==="
echo "Сайт: http://${VM_HOST} (порт 3000) или настройте DNS app.handyseller.ru -> ${VM_HOST}"
echo "SSL: после DNS выполните certbot для app.handyseller.ru"
