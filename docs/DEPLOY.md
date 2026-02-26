# HandySeller: деплой и восстановление

## Схема

```
Internet → Nginx (80/443) → /api/* → API :4000
                            /*     → Web :3001
         Redis :6379 ← API
         Yandex Managed PG ← API
```

## Одноразовая настройка VM

```bash
# На своей машине: скопировать скрипты на VM и запустить
scp -r scripts nginx docker-compose.* ubuntu@VM_IP:/tmp/handyseller-setup/
ssh ubuntu@VM_IP "cd /tmp/handyseller-setup && sudo mkdir -p /opt/handyseller && sudo chown ubuntu:ubuntu /opt/handyseller"

# Создать .env.production на VM (DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, CORS_ORIGIN, ADMIN_EMAIL, ADMIN_PASSWORD)
# Затем:
ssh ubuntu@VM_IP "bash -s" < scripts/vm-setup-once.sh
```

## CI/CD (GitHub Actions)

Push в `main` → сборка образов → push в ghcr.io → деплой на VM.

**Секреты:** VM_HOST, VM_SSH_KEY, VM_USER (опционально), CR_PAT (если образы приватные).

## Ручной деплой (когда CI упал)

```bash
VM_HOST=158.160.x.x bash scripts/deploy-manual-ssh.sh
```

Требуется: образы уже в ghcr.io (собранные ранее или локально запушенные).

## Восстановление при падении

1. **Watchdog** (cron каждые 2 мин): проверяет /health API и / Web, перезапускает контейнеры при падении.
2. **Systemd**: при перезагрузке VM автоматически поднимает стек.
3. **Ручной перезапуск:**
   ```bash
   ssh ubuntu@VM_IP "cd /opt/handyseller && docker compose -f docker-compose.ci.yml --env-file .env.production up -d"
   ```

## Диагностика

```bash
bash scripts/diagnose-site.sh   # через SSH если DEPLOY_SSH_KEY задан
# или на VM:
curl -s http://127.0.0.1:4000/health
curl -s http://127.0.0.1:3001/
docker compose -f /opt/handyseller/docker-compose.ci.yml ps
```
