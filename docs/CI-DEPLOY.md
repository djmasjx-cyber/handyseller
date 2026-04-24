# CI/CD: dev -> staging -> prod

Сборка, тесты и деплой выполняются в GitHub Actions, без нагрузки на ноутбук.

## Workflows

- `CI Checks` (`.github/workflows/ci.yml`)
  - запускается на PR в `dev`/`main` и push в `dev`.
  - gates: lint + build (`api`, `tms-api`, `web`) + optional quick smoke.
- `Deploy Staging` (`.github/workflows/deploy-staging.yml`)
  - автозапуск по push в `dev`, плюс ручной запуск.
  - deploy в environment `staging` + staging smoke.
- `Deploy Production` (`.github/workflows/deploy.yml`)
  - запуск по push в `main` или вручную.
  - deploy в environment `production` + post-deploy smoke + SLO gate + rollback.
- `Dellin Nightly E2E` (`.github/workflows/dellin-nightly.yml`)
  - ночная проверка dellin flow на `staging`, с артефактами логов.

## Требуемая структура GitHub Environments

Создайте environments:

- `staging`
- `production`

В каждом окружении задайте секреты/vars:

### Секреты

- `VM_HOST`
- `VM_SSH_KEY` (base64 приватного ключа)
- `VM_USER` (обычно `ubuntu`)
- `CR_PAT` (опционально, если ghcr приватный)
- `TMS_CLIENT_ID`
- `TMS_CLIENT_SECRET`

### Vars

- `API_BASE_URL` (например, `https://api.handyseller.ru/api` или staging URL)

## VM prerequisites

На VM должны быть:

- Docker + docker compose plugin
- рабочий каталог `/opt/handyseller`
- env-файл:
  - `/opt/handyseller/.env.staging` для staging
  - `/opt/handyseller/.env.production` для prod
- `docker-compose.ci.yml`
- nginx (для prod) и корректный DNS/SSL

## Branch protection (обязательно)

Для веток `dev` и `main` включите в GitHub:

1. Require a pull request before merging
2. Require status checks to pass before merging
3. Required checks:
   - `build-lint-typecheck`
   - `quick-partner-smoke`
4. Restrict direct pushes
5. (для `main`) Require approvals (минимум 1)

## Rollback логика в prod

`Deploy Production` автоматически:

1. сохраняет предыдущие image tags из `.env.production`
2. деплоит новые image SHA
3. запускает post-deploy smoke + SLO gate
4. при ошибке возвращает предыдущие образы

## Быстрый операционный цикл

1. Merge в `dev` -> staging deploy + smoke
2. Проверка staging
3. Merge `dev -> main`
4. Prod deploy с автоматическими проверками и rollback
