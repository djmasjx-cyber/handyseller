#!/bin/bash
# Полный деплой HandySeller: Web + API + Redis в Docker, БД — Yandex Managed PostgreSQL.
# Регистрация и вход работают с сохранением в Managed PG. Секреты не попадают в репозиторий.
#
# Требуется в .env.secrets: DEPLOY_SSH_KEY, ADMIN_EMAIL, ADMIN_PASSWORD,
#   YANDEX_MDB_HOST, YANDEX_MDB_PASSWORD (и опционально YANDEX_MDB_USER)
#
# Использование: npm run deploy  или  bash scripts/run-deploy.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/.env.secrets" ] && set -a && . "$ROOT/.env.secrets" && set +a

VM_HOST="${VM_HOST:-158.160.209.158}"
VM_USER="${VM_USER:-ubuntu}"
SSH_KEY="${DEPLOY_SSH_KEY}"
MDB_USER="${YANDEX_MDB_USER:-handyseller_user}"
API_URL="${API_URL:-http://localhost:4000}"
CORS_ORIGIN="${CORS_ORIGIN:-https://handyseller.ru,https://www.handyseller.ru,https://app.handyseller.ru,http://app.handyseller.ru}"

if [ -z "$SSH_KEY" ]; then
  echo "Ошибка: укажите DEPLOY_SSH_KEY в .env.secrets"
  exit 1
fi
if [ -z "$ADMIN_EMAIL" ] || [ -z "$ADMIN_PASSWORD" ]; then
  echo "Ошибка: ADMIN_EMAIL и ADMIN_PASSWORD обязательны в .env.secrets"
  exit 1
fi
if [ -z "$YANDEX_MDB_HOST" ] || [ -z "$YANDEX_MDB_PASSWORD" ]; then
  echo "Ошибка: для продакшена укажите YANDEX_MDB_HOST и YANDEX_MDB_PASSWORD в .env.secrets"
  exit 1
fi

DATABASE_URL="postgresql://${MDB_USER}:${YANDEX_MDB_PASSWORD}@${YANDEX_MDB_HOST}:6432/handyseller?sslmode=require"
ADMIN_EMAIL_ESC=$(printf '%s' "$ADMIN_EMAIL" | sed "s/'/'\\\\''/g")
ADMIN_PASSWORD_ESC=$(printf '%s' "$ADMIN_PASSWORD" | sed "s/'/'\\\\''/g")
CORS_ORIGIN_ESC=$(printf '%s' "$CORS_ORIGIN" | sed "s/'/'\\\\''/g")

SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no"

echo "==> Сборка Docker-образов (локальный builder, без remote buildx)..."
cd "$ROOT"
export DOCKER_BUILDKIT=0
docker build -f apps/api/Dockerfile -t handyseller-api:latest .
docker build -f apps/web/Dockerfile -t handyseller-web:latest .

echo "==> Подготовка deploy-пакета..."
DEPLOY_DIR=".deploy-tmp"
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR/handyseller"

cp docker-compose.prod.yml "$DEPLOY_DIR/handyseller/"
mkdir -p "$DEPLOY_DIR/handyseller/nginx"
cp nginx/handyseller.conf "$DEPLOY_DIR/handyseller/nginx/"
cp nginx/handyseller-domain.conf "$DEPLOY_DIR/handyseller/nginx/" 2>/dev/null || true
cp nginx/handyseller-bootstrap.conf "$DEPLOY_DIR/handyseller/nginx/" 2>/dev/null || true
cp -r scripts "$DEPLOY_DIR/handyseller/"

# Шаблон .env.production — только несекретные переменные, реальные подставляются на VM
cat > "$DEPLOY_DIR/handyseller/.env.production.template" << 'ENVEOF'
NODE_ENV=production
PORT=4000
API_URL=http://localhost:4000
REDIS_HOST=redis
JWT_EXPIRES_IN=2h
ENVEOF

# Опциональные переменные из .env.secrets (ВТБ, email)
touch "$DEPLOY_DIR/handyseller/.env.extra"
[ -n "$VTB_USER_NAME" ]     && echo "VTB_USER_NAME=$VTB_USER_NAME"         >> "$DEPLOY_DIR/handyseller/.env.extra"
[ -n "$VTB_PASSWORD" ]      && echo "VTB_PASSWORD=$VTB_PASSWORD"           >> "$DEPLOY_DIR/handyseller/.env.extra"
[ -n "$VTB_MODE" ]          && echo "VTB_MODE=$VTB_MODE"                   >> "$DEPLOY_DIR/handyseller/.env.extra"
[ -n "$VTB_WEBHOOK_SECRET" ] && echo "VTB_WEBHOOK_SECRET=$VTB_WEBHOOK_SECRET" >> "$DEPLOY_DIR/handyseller/.env.extra"
[ -n "$RESEND_API_KEY" ]    && echo "RESEND_API_KEY=$RESEND_API_KEY"       >> "$DEPLOY_DIR/handyseller/.env.extra"
[ -n "$EMAIL_FROM" ]        && echo "EMAIL_FROM=$EMAIL_FROM"               >> "$DEPLOY_DIR/handyseller/.env.extra"

COPYFILE_DISABLE=1 tar -czf "$DEPLOY_DIR/handyseller.tar.gz" -C "$DEPLOY_DIR" handyseller

echo "==> Сохранение образов и копирование на VM..."
docker save handyseller-api:latest handyseller-web:latest -o "$DEPLOY_DIR/images.tar"
scp $SSH_OPTS "$DEPLOY_DIR/handyseller.tar.gz" "$DEPLOY_DIR/images.tar" ${VM_USER}@${VM_HOST}:/tmp/

echo "==> Развёртывание на VM..."
ssh $SSH_OPTS ${VM_USER}@${VM_HOST} bash -s << ENDSSH
set -e
export DEPLOY_DATABASE_URL='$(printf '%s' "$DATABASE_URL" | sed "s/'/'\\\\''/g")'
export DEPLOY_ADMIN_EMAIL='$ADMIN_EMAIL_ESC'
export DEPLOY_ADMIN_PASSWORD='$ADMIN_PASSWORD_ESC'
export DEPLOY_CORS_ORIGIN='$CORS_ORIGIN_ESC'

sudo mkdir -p /opt/handyseller

# Сохраняем ключи ДО распаковки (сессии пользователей не инвалидируются)
KEY_FILE="/opt/handyseller/.encryption-key"
JWT_FILE="/opt/handyseller/.jwt-secret"
SAVED_KEY=""
SAVED_JWT=""
[ -f "\$KEY_FILE" ] && SAVED_KEY=\$(cat "\$KEY_FILE")
[ -z "\$SAVED_KEY" ] && [ -f /opt/handyseller/.env.production ] && \
  SAVED_KEY=\$(grep -E "^ENCRYPTION_KEY=" /opt/handyseller/.env.production 2>/dev/null | cut -d= -f2-)
[ -f "\$JWT_FILE" ] && SAVED_JWT=\$(cat "\$JWT_FILE")
[ -z "\$SAVED_JWT" ] && [ -f /opt/handyseller/.env.production ] && \
  SAVED_JWT=\$(grep -E "^JWT_SECRET=" /opt/handyseller/.env.production 2>/dev/null | cut -d= -f2-)

sudo tar -xzf /tmp/handyseller.tar.gz -C /opt
sudo chown -R \$(whoami):\$(whoami) /opt/handyseller
rm -f /tmp/handyseller.tar.gz

# Генерируем ключи только при первом деплое
[ -z "\$SAVED_KEY" ] && SAVED_KEY=\$(openssl rand -base64 32)
[ -z "\$SAVED_JWT" ] && SAVED_JWT=\$(openssl rand -base64 32)
echo "\$SAVED_KEY" > "\$KEY_FILE"
echo "\$SAVED_JWT" > "\$JWT_FILE"

# .env.production: шаблон + секреты (не из tarball)
cp /opt/handyseller/.env.production.template /opt/handyseller/.env.production
echo "DATABASE_URL=\$DEPLOY_DATABASE_URL"     >> /opt/handyseller/.env.production
echo "JWT_SECRET=\$SAVED_JWT"                 >> /opt/handyseller/.env.production
echo "ENCRYPTION_KEY=\$SAVED_KEY"             >> /opt/handyseller/.env.production
echo "CORS_ORIGIN=\$DEPLOY_CORS_ORIGIN"       >> /opt/handyseller/.env.production
echo "ADMIN_EMAIL=\$DEPLOY_ADMIN_EMAIL"       >> /opt/handyseller/.env.production
echo "ADMIN_PASSWORD=\$DEPLOY_ADMIN_PASSWORD" >> /opt/handyseller/.env.production
[ -f /opt/handyseller/.env.extra ] && cat /opt/handyseller/.env.extra >> /opt/handyseller/.env.production
# Права 600: только владелец читает секреты
chmod 600 /opt/handyseller/.env.production \$KEY_FILE \$JWT_FILE 2>/dev/null || true

# Убиваем старые nohup-процессы (если остались от предыдущей схемы без Docker)
sudo fuser -k 3000/tcp 2>/dev/null || true
sudo fuser -k 3001/tcp 2>/dev/null || true
sudo fuser -k 4000/tcp 2>/dev/null || true
pkill -9 -f "next-server"       2>/dev/null || true
pkill -9 -f "apps/web/server.js" 2>/dev/null || true
pkill -9 -f "apps/api/dist"     2>/dev/null || true
sleep 2

# Docker
if ! command -v docker &>/dev/null; then
  echo "Установка Docker..."
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker \$(whoami)
fi
DOCKER="docker"
docker info &>/dev/null || DOCKER="sudo docker"

cd /opt/handyseller
\$DOCKER load -i /tmp/images.tar
rm -f /tmp/images.tar

# Пересоздаём compose-стек с новыми образами
\$DOCKER compose -f docker-compose.prod.yml --env-file .env.production down --remove-orphans 2>/dev/null || true
\$DOCKER compose -f docker-compose.prod.yml --env-file .env.production up -d

# Ждём готовности API
echo "Ожидание API..."
for i in \$(seq 1 15); do
  if curl -sf http://127.0.0.1:4000/health >/dev/null 2>&1; then
    echo "API готов (попытка \$i)"
    break
  fi
  sleep 3
done

# Seed — только создаёт данные если их нет (идемпотентен)
\$DOCKER exec handyseller-api node scripts/seed-database.js 2>/dev/null || true

# Nginx через systemd (автозапуск при перезагрузке VM)
if ! command -v nginx &>/dev/null; then
  sudo apt-get update -qq && sudo apt-get install -y nginx
fi
if sudo test -f /etc/letsencrypt/live/handyseller.ru/fullchain.pem 2>/dev/null; then
  sudo cp /opt/handyseller/nginx/handyseller-domain.conf /etc/nginx/sites-available/handyseller
elif [ -f /opt/handyseller/nginx/handyseller-bootstrap.conf ]; then
  sudo cp /opt/handyseller/nginx/handyseller-bootstrap.conf /etc/nginx/sites-available/handyseller
else
  sudo cp /opt/handyseller/nginx/handyseller.conf /etc/nginx/sites-available/handyseller
fi
sudo ln -sf /etc/nginx/sites-available/handyseller /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
if sudo systemctl is-active nginx &>/dev/null; then
  sudo systemctl reload nginx
else
  sudo systemctl enable nginx
  sudo systemctl start nginx
fi

# Автозапуск Docker и compose-стека при перезагрузке VM
sudo systemctl enable docker 2>/dev/null || true
if [ -f /opt/handyseller/scripts/handyseller-compose.service ]; then
  sudo cp /opt/handyseller/scripts/handyseller-compose.service /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable handyseller-compose 2>/dev/null || true
fi

echo ""
echo "=== Статус контейнеров ==="
\$DOCKER compose -f docker-compose.prod.yml ps
echo ""
echo "=== Деплой завершён ==="
ENDSSH

rm -rf "$DEPLOY_DIR"
echo ""
echo "==> Готово: https://app.handyseller.ru"
echo "    БД: Yandex Managed PostgreSQL (без локального Postgres)"
echo "    Стек: API + Web + Redis в Docker (restart: unless-stopped)"
echo "    Nginx: управляется через systemd, автозапуск при перезагрузке VM"
