# CI/CD: GitHub Actions → ghcr.io → VM

Сборка образов выполняется в GitHub (без нагрузки на VM). Деплой на VM занимает ~1–2 минуты.

## Как это устроено

1. **Push в `main`** или ручной запуск workflow → триггер деплоя
2. **Build** — образы API и Web собираются в GitHub Actions
3. **Push** — образы публикуются в GitHub Container Registry (ghcr.io)
4. **Deploy** — SSH на VM, `docker compose pull` + `up -d`

## Настройка (один раз)

### 1. Секреты в GitHub

В репозитории: **Settings → Secrets and variables → Actions** добавьте:

| Секрет     | Описание                            | Обязательный | Пример          |
|------------|-------------------------------------|--------------|-----------------|
| `VM_HOST`  | IP или hostname VM                  | Да           | `158.160.209.158` |
| `VM_SSH_KEY` | Приватный SSH-ключ (полностью)    | Да           | содержимое `~/.ssh/yandex_vm` |
| `VM_USER`  | Пользователь SSH                    | Да           | `ubuntu`        |
| `CR_PAT`   | (опционально) PAT для pull приватных образов | Нет  | см. ниже |

### 2. Environment `production`

В **Settings → Environments** создайте `production` (используется в workflow).

### 3. Пакеты образов: публичные или приватные

По умолчанию образы в ghcr.io приватные.

- **Публичные:** В репозитории → Packages → выберите пакет → Package settings → Change visibility → Public. Тогда `CR_PAT` не нужен.
- **Приватные:** Создайте Personal Access Token (read:packages), добавьте как секрет `CR_PAT`.

### 4. Одноразовая настройка VM

На VM должно быть:

- Docker
- `/opt/handyseller/.env.production` с `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, `CORS_ORIGIN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` и др.
- Настроенный Nginx (конфиг в `/etc/nginx/sites-enabled/handyseller`)

Выполните один раз вручную или через `deploy-local-vm.sh`:

```bash
cd /home/ubuntu/handyseller-dev && bash scripts/deploy-local-vm.sh
```

Это создаст структуру и `.env.production`. После этого CI будет только обновлять образы и перезапускать контейнеры.

## Ручной запуск

**Actions → Build and Deploy → Run workflow**

## Проверка после деплоя

```bash
# На VM
docker ps
curl -s http://127.0.0.1:4000/health
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/
```

В браузере: https://app.handyseller.ru/
