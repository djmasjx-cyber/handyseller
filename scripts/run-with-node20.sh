#!/bin/bash
# Запуск команды с Node 20. Исправляет crypto/nest-schedule на Node 18.
# Использование: run-with-node20.sh npm run dev:api
set -e
# Сбрасываем npm_config_prefix ДО nvm (конфликт)
unset npm_config_prefix 2>/dev/null || true
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
  nvm use 20 2>/dev/null || nvm use default 2>/dev/null || true
fi
exec "$@"
