# CI/CD: fast dev -> stable prod

Сборка, тесты и деплой выполняются в GitHub Actions, без нагрузки на ноутбук.

## Workflows

- `CI Checks` (`.github/workflows/ci.yml`)
  - запускается на PR в `dev`/`main` и push в `dev`.
  - fast-gate: lint + build (`api`, `tms-api`, `web`) + `tms-fast-smoke` (OAuth + protected read endpoints без вызова перевозчиков).
  - context-aware quality matrix:
    - `core-quality` (api lint/build/unit)
    - `tms-quality` (tms-api build)
    - `web-quality` (web lint/build)
    - `contracts-quality` (shared SDK/domain build)
    - `wms-quality` (зарезервированный gate для будущего WMS)
- `Deploy Staging` (`.github/workflows/deploy-staging.yml`)
  - автозапуск по push в `dev`, плюс ручной запуск.
  - deploy в environment `staging` на `https://dev.handyseller.ru`.
  - после деплоя запускает health checks, `tms-fast-smoke`, registry smoke, demo checkout smoke и carrier document smoke с оригинальным `LABEL`.
- `Deploy Production` (`.github/workflows/deploy.yml`)
  - запуск по push в `main` или вручную.
  - release-gate: verify build/lint -> `external-carrier-gate` (реальные перевозчики на dev/staging, включая скачивание оригинальных документов) -> deploy `production` + post-deploy smoke + SLO gate + rollback.
  - governance v1: для ручного запуска требуется `change_class`, `release_owner`, а для high-risk/schema-impact — обязательный `risk_notes`.
  - после каждого prod-выката публикуется artifact `release-evidence-*`.
- `External Carrier E2E` (`.github/workflows/dellin-nightly.yml`)
  - отдельный контур реальных e2e с `dellin/cdek/major-express`.
  - запускается по расписанию, вручную, и автоматически после успешного staging deploy.
  - не блокирует быстрый цикл `dev`.

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

- `API_BASE_URL`
  - `staging`: `https://dev.handyseller.ru/api`
  - `production`: `https://api.handyseller.ru/api`
- `WEB_BASE_URL`
  - `staging`: `https://dev.handyseller.ru`
  - `production`: `https://app.handyseller.ru`
- `STAGING_DOCUMENT_CARRIER_ID` (опционально, по умолчанию `dellin`)

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
3. Required checks (для `dev`):
   - `build-lint-typecheck`
   - `quick-partner-smoke`
4. Required checks (для `main`):
   - `verify-build-and-lint`
   - `external-carrier-gate (dellin)`
   - `external-carrier-gate (cdek)`
   - `external-carrier-gate (major-express)`
5. Restrict direct pushes
6. (для `main`) Require approvals (минимум 1)

## Rollback логика в prod

`Deploy Production` автоматически:

1. сохраняет предыдущие image tags из `.env.production`
2. деплоит новые image SHA
3. запускает post-deploy smoke + SLO gate
4. при ошибке возвращает предыдущие образы

## Release change classes

- `standard`: типовой релиз без рискованных изменений контракта/схемы.
- `high-risk`: изменение критических сценариев, требующее явного risk note.
- `schema-impact`: релиз, затрагивающий схему данных или миграции; обязателен risk note и ручная проверка rollback-пути.

## Операционные контуры

### Fast lane (ежедневная разработка)
1. PR/merge в `dev` -> fast-gate + auto deploy на `https://dev.handyseller.ru`.
2. Автоматическая проверка сценария в dev/staging: API smoke, registry smoke, demo checkout smoke, document smoke.
3. Ручная проверка измененного UI/бизнес-сценария на `dev.handyseller.ru`.
4. Повторяем цикл быстро до готовности.

### Release lane (выкатка в прод)
1. PR `dev -> main` только после успешной ручной проверки на `dev.handyseller.ru`.
2. Блокирующий `external-carrier-gate` на dev/staging: реальные перевозчики + `DOWNLOAD_DOC=true`.
3. Если gate зелёный -> merge в `main` и production deploy.
4. Post-deploy smoke + SLO + rollback при ошибке.
