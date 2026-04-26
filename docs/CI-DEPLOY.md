# CI/CD: fast dev -> stable prod

Сборка, тесты и деплой выполняются в GitHub Actions, без нагрузки на ноутбук.

## Workflows

- `CI Checks` (`.github/workflows/ci.yml`)
  - запускается на PR в `dev`/`main` и push в `dev`.
  - fast-gate: lint + build (`api`, `tms-api`, `wms-api`, `web`) (без вызовов TMS/ТК и без тестовых заявок).
  - context-aware quality matrix:
    - `core-quality` (api lint/build/unit)
    - `tms-quality` (tms-api build)
    - `web-quality` (web lint/build)
    - `contracts-quality` (shared SDK/domain build для TMS и WMS)
    - `wms-quality` (`packages/wms-*` + `apps/wms-api` build)
- `Deploy Staging` (`.github/workflows/deploy-staging.yml`)
  - автозапуск по push в `dev`, плюс ручной запуск.
  - на VM обновляется **только** стэк staging: `docker-compose.staging.yml` (порты 4010/3010/4110/4210, контейнеры `handyseller-staging-*`, проект `-p handyseller-staging`). **Прод-стэк** (`docker-compose.ci.yml`, 4000/3001) этим job **не** перезапускается.
  - deploy в environment `staging` на `https://dev.handyseller.ru`; Nginx — `nginx/handyseller-dev-ssl.conf`. Подробно: `docs/DEV-PROD-STACK.md`.
  - после деплоя — `curl` health внутри SSH (без вызовов ТК из CI).
- `Deploy Production` (`.github/workflows/deploy.yml`)
  - запуск по push в `main` или вручную.
  - build/deploy + health + SLO read-only check (`tms-slo-alert-check.sh`, GET метрики) + rollback при сбоях. Блокирующих шагов с реальными перевозчиками в GitHub нет.
  - governance v1: для ручного запуска требуется `change_class`, `release_owner`, а для high-risk/schema-impact — обязательный `risk_notes`.
  - после каждого prod-выката публикуется artifact `release-evidence-*`.
- `Release Gate (PR -> main)` (`.github/workflows/release-gate-main-pr.yml`) — `verify-build-and-lint` для PR в `main`.

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
- `wms-api` деплоится отдельным контейнером. Для отдельной WMS базы задайте `WMS_DATABASE_URL`; если переменная не задана, MVP использует текущий `DATABASE_URL`.

## Branch protection (обязательно)

Для веток `dev` и `main` включите в GitHub:

1. Require a pull request before merging
2. Require status checks to pass before merging
3. Required checks (для `dev`):
   - `build-lint-typecheck`
4. Required checks (для `main`):
   - `verify-build-and-lint` (см. `release-gate-main-pr.yml`)
5. Restrict direct pushes
6. (для `main`) Require approvals (минимум 1)

## Rollback логика в prod

`Deploy Production` автоматически:

1. сохраняет предыдущие image tags из `.env.production`
2. деплоит новые image SHA
3. запускает post-deploy health checks + SLO gate
4. при ошибке возвращает предыдущие образы

## Release change classes

- `standard`: типовой релиз без рискованных изменений контракта/схемы.
- `high-risk`: изменение критических сценариев, требующее явного risk note.
- `schema-impact`: релиз, затрагивающий схему данных или миграции; обязателен risk note и ручная проверка rollback-пути.

## Операционные контуры

### Fast lane (ежедневная разработка)
1. PR/merge в `dev` -> fast-gate + auto deploy на `https://dev.handyseller.ru` (health на VM, без сценариев ТК).
2. Ручная проверка измененного UI/бизнес-сценария на `dev.handyseller.ru` и, при необходимости, проверка цепочки «клиент → HandySeller → ТК» в продуктиве.
3. Повторяем цикл до готовности.

### Release lane (выкатка в прод)
1. PR `dev -> main` после успешной ручной проверки на `dev.handyseller.ru` и зелёного `Release Gate` (build/lint) на PR в `main`.
2. Merge в `main` -> `Deploy Production` (health, SLO read-only, rollback).
