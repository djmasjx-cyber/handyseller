#!/bin/bash
# Деплой HandySeller прямо на текущей VM (без scp/ssh).
# Запуск: cd /home/ubuntu/handyseller-dev && bash scripts/deploy-local-vm.sh
#
# Требуется: .env.secrets с YANDEX_MDB_HOST, YANDEX_MDB_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/.env.secrets" ] && set -a && . "$ROOT/.env.secrets" && set +a

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

echo "==> 1. Сборка Docker-образов..."
cd "$ROOT"
export DOCKER_BUILDKIT=0
docker build -f apps/api/Dockerfile -t handyseller-api:latest .
docker build -f apps/web/Dockerfile -t handyseller-web:latest .

echo "==> 2. Подготовка /opt/handyseller..."
sudo mkdir -p /opt/handyseller
sudo cp docker-compose.prod.yml /opt/handyseller/
sudo mkdir -p /opt/handyseller/nginx
sudo cp nginx/*.conf /opt/handyseller/nginx/ 2>/dev/null || true
sudo chown -R $(whoami):$(whoami) /opt/handyseller

# Ключи (сохраняем между запусками)
KEY_FILE="/opt/handyseller/.encryption-key"
JWT_FILE="/opt/handyseller/.jwt-secret"
[ -f "$KEY_FILE" ] || echo "$(openssl rand -base64 32)" > "$KEY_FILE"
[ -f "$JWT_FILE" ] || echo "$(openssl rand -base64 32)" > "$JWT_FILE"

# .env.production
cat > /opt/handyseller/.env.production << ENVEOF
NODE_ENV=production
PORT=4000
API_URL=http://localhost:4000
REDIS_HOST=redis
JWT_EXPIRES_IN=2h
DATABASE_URL=$DATABASE_URL
JWT_SECRET=$(cat "$JWT_FILE")
ENCRYPTION_KEY=$(cat "$KEY_FILE")
CORS_ORIGIN=$CORS_ORIGIN
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD
ENVEOF
chmod 600 /opt/handyseller/.env.production $KEY_FILE $JWT_FILE

# Опциональные переменные
[ -n "$VTB_USER_NAME" ]     && echo "VTB_USER_NAME=$VTB_USER_NAME" >> /opt/handyseller/.env.production
[ -n "$VTB_PASSWORD" ]      && echo "VTB_PASSWORD=$VTB_PASSWORD" >> /opt/handyseller/.env.production
[ -n "$VTB_MODE" ]          && echo "VTB_MODE=$VTB_MODE" >> /opt/handyseller/.env.production
[ -n "$RESEND_API_KEY" ]    && echo "RESEND_API_KEY=$RESEND_API_KEY" >> /opt/handyseller/.env.production
[ -n "$EMAIL_FROM" ]        && echo "EMAIL_FROM=$EMAIL_FROM" >> /opt/handyseller/.env.production

echo "==> 3. Остановка старых процессов..."
sudo fuser -k 3000/tcp 2>/dev/null || true
sudo fuser -k 3001/tcp 2>/dev/null || true
sudo fuser -k 4000/tcp 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
pkill -9 -f "apps/web/server.js" 2>/dev/null || true
pkill -9 -f "apps/api/dist" 2>/dev/null || true
sleep 2

echo "==> 4. Остановка старого Docker (postgres если был)..."
cd /opt/handyseller
docker compose -f docker-compose.yml down 2>/dev/null || true
docker compose -f docker-compose.prod.yml down --remove-orphans 2>/dev/null || true

echo "==> 5. Запуск стека (Redis + API + Web)..."
docker compose -f docker-compose.prod.yml --env-file .env.production up -d

echo "Ожидание API..."
for i in $(seq 1 20); do
  if curl -sf http://127.0.0.1:4000/health >/dev/null 2>&1; then
    echo "API готов"
    break
  fi
  sleep 3
done

echo "Запуск seed..."
docker exec handyseller-api node scripts/seed-database.js 2>/dev/null || true

echo "==> 6. Nginx..."
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
sudo nginx -t
sudo systemctl enable nginx 2>/dev/null || true
sudo systemctl reload nginx 2>/dev/null || sudo systemctl start nginx

echo "==> 7. Systemd (автозапуск при перезагрузке)..."
sudo systemctl enable docker 2>/dev/null || true
[ -f "$ROOT/scripts/handyseller-compose.service" ] && \
  sudo cp "$ROOT/scripts/handyseller-compose.service" /etc/systemd/system/ && \
  sudo systemctl daemon-reload && sudo systemctl enable handyseller-compose 2>/dev/null || true

echo ""
echo "=== Статус ==="
docker compose -f docker-compose.prod.yml ps
echo ""
echo "Готово: https://app.handyseller.ru"
