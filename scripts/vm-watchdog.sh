#!/bin/bash
# Watchdog: проверка здоровья контейнеров, автоперезапуск при падении.
# Установка на VM: sudo cp scripts/vm-watchdog.sh /opt/handyseller/ && sudo chmod +x /opt/handyseller/vm-watchdog.sh
# Cron (каждые 2 мин): echo "*/2 * * * * root /opt/handyseller/vm-watchdog.sh" | sudo tee /etc/cron.d/handyseller-watchdog

set -e
DIR="/opt/handyseller"
COMPOSE_FILE="${DIR}/docker-compose.ci.yml"
ENV_FILE="${DIR}/.env.production"

# Fallback на prod если ci нет (первый запуск)
[ ! -f "$COMPOSE_FILE" ] && COMPOSE_FILE="${DIR}/docker-compose.prod.yml"

cd "$DIR" 2>/dev/null || exit 0

# IMAGE_* для docker-compose.ci.yml (если не заданы — prod-образы)
export IMAGE_API="${IMAGE_API:-ghcr.io/djmasjx-cyber/handyseller-api:latest}"
export IMAGE_WEB="${IMAGE_WEB:-ghcr.io/djmasjx-cyber/handyseller-web:latest}"
[ -f "$ENV_FILE" ] && set -a && . "$ENV_FILE" 2>/dev/null && set +a

need_restart=0

# Проверка API
if ! curl -sf --connect-timeout 3 http://127.0.0.1:4000/health >/dev/null 2>&1; then
  echo "$(date -Iseconds) [WATCHDOG] API unhealthy, will restart"
  need_restart=1
fi

# Проверка Web
if ! curl -sf --connect-timeout 3 http://127.0.0.1:3001/ >/dev/null 2>&1; then
  echo "$(date -Iseconds) [WATCHDOG] Web unhealthy, will restart"
  need_restart=1
fi

if [ "$need_restart" = "1" ]; then
  echo "$(date -Iseconds) [WATCHDOG] Restarting stack..."
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d 2>/dev/null || true
  sleep 5
  sudo systemctl reload nginx 2>/dev/null || true
  echo "$(date -Iseconds) [WATCHDOG] Restart done"
fi
