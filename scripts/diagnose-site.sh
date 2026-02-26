#!/bin/bash
# Диагностика доступности сайта — запускать на VM:
#   ssh ubuntu@158.160.209.158 "bash -s" < scripts/diagnose-site.sh
# Или: DEPLOY_SSH_KEY=~/.ssh/yandex_vm ./scripts/diagnose-site.sh

set -e
if [ -n "$DEPLOY_SSH_KEY" ]; then
  ROOT="$(cd "$(dirname "$0")/.." && pwd)"
  [ -f "$ROOT/.env.secrets" ] && set -a && . "$ROOT/.env.secrets" && set +a
  SSH_OPTS="-i ${DEPLOY_SSH_KEY:-$HOME/.ssh/yandex_vm} -o StrictHostKeyChecking=no"
  VM_HOST="${VM_HOST:-158.160.209.158}"
  exec ssh $SSH_OPTS ubuntu@$VM_HOST "bash -s" < "$0"
  exit 0
fi

echo "=== 1. Активный конфиг nginx ==="
ls -la /etc/nginx/sites-enabled/

echo ""
echo "=== 2. Слушающие порты ==="
sudo ss -tlnp | grep -E ':(80|443|3000|3001|4000) ' || true

echo ""
echo "=== 3. Процессы ==="
pgrep -a -f "next-server|server.js|dist/src/main" 2>/dev/null || echo "Процессы не найдены"

echo ""
echo "=== 4. Проверка бэкендов ==="
curl -s -o /dev/null -w "Next.js :3001 → %{http_code}\n" http://127.0.0.1:3001/ 2>/dev/null || echo "Next.js недоступен"
curl -s -o /dev/null -w "API :4000 health → %{http_code}\n" http://127.0.0.1:4000/api/health 2>/dev/null || echo "API недоступен"
curl -s -o /dev/null -w "API :4000 dashboard (без токена → 401) → %{http_code}\n" http://127.0.0.1:4000/api/dashboard 2>/dev/null || echo "API dashboard недоступен"

echo ""
echo "=== 5. Проверка через nginx ==="
curl -s -o /dev/null -w "localhost:80 → %{http_code}\n" http://127.0.0.1:80/ -H "Host: app.handyseller.ru" 2>/dev/null || echo "Порт 80 недоступен"
curl -s -o /dev/null -w "localhost:443 → %{http_code}\n" -k https://127.0.0.1:443/ -H "Host: app.handyseller.ru" 2>/dev/null || echo "Порт 443 недоступен"

echo ""
echo "=== 6. Последние логи API (ошибки регистрации/входа) ==="
if command -v pm2 &>/dev/null; then
  for f in ~/.pm2/logs/handyseller-api-error.log ~/.pm2/logs/handyseller-api-out.log; do
    [ -f "$f" ] && echo "--- $f ---" && tail -25 "$f"
  done
elif [ -f /tmp/handyseller-api.log ]; then
  tail -50 /tmp/handyseller-api.log 2>/dev/null || true
else
  echo "Логи не найдены (pm2 или /tmp/handyseller-api.log)"
fi

echo ""
echo "=== 7. SSL сертификат (если domain-конфиг) ==="
if [ -f /etc/letsencrypt/live/handyseller.ru/fullchain.pem ]; then
  echo "Сертификат есть. SAN:"
  openssl x509 -in /etc/letsencrypt/live/handyseller.ru/fullchain.pem -noout -text 2>/dev/null | grep -A1 "Subject Alternative Name" || true
else
  echo "Сертификат не найден (используется bootstrap или handyseller.conf)"
fi
