#!/bin/bash
# Одноразовая настройка VM после создания. Запуск: bash scripts/vm-setup-once.sh
# Или по SSH: ssh ubuntu@VM_IP "bash -s" < scripts/vm-setup-once.sh
#
# На VM должны быть: Docker, nginx. Секреты — в .env.production (создать вручную или из .env.secrets).

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> 1. Создание /opt/handyseller..."
sudo mkdir -p /opt/handyseller/nginx
sudo chown -R $(whoami):$(whoami) /opt/handyseller

echo "==> 2. Копирование конфигов..."
cp "$ROOT/docker-compose.ci.yml" /opt/handyseller/
cp "$ROOT/docker-compose.prod.yml" /opt/handyseller/
cp "$ROOT/scripts/vm-watchdog.sh" /opt/handyseller/
cp "$ROOT/scripts/handyseller-start.sh" /opt/handyseller/
cp "$ROOT/scripts/load-lockbox-secrets.sh" /opt/handyseller/
if [ -f "$ROOT/scripts/vm-diagnose-api.sh" ]; then
  cp "$ROOT/scripts/vm-diagnose-api.sh" /opt/handyseller/
  chmod +x /opt/handyseller/vm-diagnose-api.sh
fi
cp -r "$ROOT/nginx/"* /opt/handyseller/nginx/
chmod +x /opt/handyseller/vm-watchdog.sh
chmod +x /opt/handyseller/load-lockbox-secrets.sh

echo "==> 3. .env.production — проверка..."
if [ ! -f /opt/handyseller/.env.production ]; then
  echo "Создайте /opt/handyseller/.env.production с:"
  echo "  DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, CORS_ORIGIN, ADMIN_EMAIL, ADMIN_PASSWORD"
  echo "Скопируйте из .env.secrets и добавьте JWT_SECRET, ENCRYPTION_KEY (openssl rand -base64 32)"
  exit 1
fi

echo "==> 4. Сохранение IMAGE_* в .env.production (для автозапуска)..."
grep -q "IMAGE_API=" /opt/handyseller/.env.production 2>/dev/null || echo 'IMAGE_API=ghcr.io/djmasjx-cyber/handyseller-api:latest' >> /opt/handyseller/.env.production
grep -q "IMAGE_WEB=" /opt/handyseller/.env.production 2>/dev/null || echo 'IMAGE_WEB=ghcr.io/djmasjx-cyber/handyseller-web:latest' >> /opt/handyseller/.env.production

echo "==> 5. Systemd — автозапуск при перезагрузке..."
chmod +x /opt/handyseller/handyseller-start.sh
sudo cp "$ROOT/scripts/handyseller-compose.service" /etc/systemd/system/handyseller-compose.service
sudo systemctl daemon-reload
sudo systemctl enable handyseller-compose

echo "==> 6. Cron watchdog (каждые 2 мин)..."
echo "*/2 * * * * root /opt/handyseller/vm-watchdog.sh" | sudo tee /etc/cron.d/handyseller-watchdog
sudo chmod 644 /etc/cron.d/handyseller-watchdog

echo "==> 7. Nginx..."
if sudo test -f /etc/letsencrypt/live/handyseller.ru/fullchain.pem 2>/dev/null; then
  sudo cp /opt/handyseller/nginx/handyseller-domain.conf /etc/nginx/sites-available/handyseller
elif sudo test -f /etc/letsencrypt/live/app.handyseller.ru/fullchain.pem 2>/dev/null; then
  sudo cp /opt/handyseller/nginx/handyseller-app-ssl.conf /etc/nginx/sites-available/handyseller
elif [ -f /opt/handyseller/nginx/handyseller-bootstrap.conf ]; then
  sudo cp /opt/handyseller/nginx/handyseller-bootstrap.conf /etc/nginx/sites-available/handyseller
else
  sudo cp /opt/handyseller/nginx/handyseller.conf /etc/nginx/sites-available/handyseller
fi
sudo ln -sf /etc/nginx/sites-available/handyseller /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl enable nginx

echo ""
echo "=== Готово ==="
echo "Деплой: docker compose -f docker-compose.ci.yml --env-file .env.production pull && docker compose -f docker-compose.ci.yml --env-file .env.production up -d"
echo "Или дождитесь CI/CD push в main."
