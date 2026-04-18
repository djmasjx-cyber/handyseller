#!/bin/bash
# Запуск стека HandySeller. Используется systemd и watchdog.
# Должен совпадать с деплоем (docker-compose.ci.yml + ghcr.io).
set -e
cd /opt/handyseller
export IMAGE_API="${IMAGE_API:-ghcr.io/djmasjx-cyber/handyseller-api:latest}"
export IMAGE_WEB="${IMAGE_WEB:-ghcr.io/djmasjx-cyber/handyseller-web:latest}"
export IMAGE_TMS_API="${IMAGE_TMS_API:-ghcr.io/djmasjx-cyber/handyseller-tms-api:latest}"
# shellcheck disable=SC1091
[ -f .env.production ] && set -a && . ./.env.production && set +a
[ -f ./load-lockbox-secrets.sh ] && source ./load-lockbox-secrets.sh || true
docker network create handyseller_handyseller 2>/dev/null || true
docker compose -f docker-compose.ci.yml --env-file .env.production up -d
