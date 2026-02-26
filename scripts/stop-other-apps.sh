#!/bin/bash
# Останавливает приложения на порту 3000 (например YUNU) перед запуском HandySeller
# Запуск на VM: ./scripts/stop-other-apps.sh
# Или через SSH: ssh user@host 'bash -s' < scripts/stop-other-apps.sh

echo "Остановка процессов на порту 3000..."
PID=$(lsof -ti:3000 2>/dev/null || sudo lsof -ti:3000 2>/dev/null)
if [ -n "$PID" ]; then
  kill -9 $PID 2>/dev/null || sudo kill -9 $PID 2>/dev/null
  echo "Готово. Порт 3000 свободен."
else
  echo "Порт 3000 свободен."
fi
