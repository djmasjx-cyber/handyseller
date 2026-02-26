#!/bin/bash
# Запуск стека HandySeller. Используется systemd и watchdog.
set -e
cd /opt/handyseller
. .env.production 2>/dev/null || true
docker compose -f docker-compose.ci.yml --env-file .env.production up -d
