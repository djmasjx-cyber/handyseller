# Как устроены dev (staging) и production на одной VM

## Идея в одном абзаце

- **Прод** — что видят пользователи: `app.handyseller.ru`, `api.handyseller.ru`. Крутится в Docker с портами на `127.0.0.1` **4000, 3001, 4100, 4200** (файл `docker-compose.ci.yml`, контейнеры `handyseller-api`, `handyseller-web`, …).
- **Dev / staging** — что вы проверяете **перед** выкаткой в прод: `https://dev.handyseller.ru`. Крутится **в отдельных** контейнерах с префиксом `handyseller-staging-*` и **другими** портами: **4010, 3010, 4110, 4210** (файл `docker-compose.staging.yml`).

Один публичный IP у обоих: Nginx смотрит на **имя сайта** (`server_name`) и шлёт трафик **на разные** локальные порты.

## Последовательность работы (ваша «вертикаль»)

1. Разработка в ветке **`dev`**, PR, merge в `dev`.
2. GitHub **Deploy Staging** собирает образы и на VM **обновляет только** staging-стэк. **Прод на этом шаге не трогается.**
3. Вы проверяете сценарии на **`https://dev.handyseller.ru`**. Если что-то не так — чините в `dev` и снова п. 2.
4. Когда всё устраивает — PR **`dev` → `main`**, merge.
5. GitHub **Deploy Production** обновляет **только** production-стэк (порты 4000/3001/…).

Пока не смержили в `main`, на `app` и `api` остаётся **предыдущий** прод-релиз.

## Что должно лежать на VM

- `/opt/handyseller/.env.production` — прод.
- `/opt/handyseller/.env.staging` — staging; в нём **обязательно** учтите:
  - `CORS_ORIGIN` с `https://dev.handyseller.ru` (и при необходимости `http://dev.handyseller.ru` для тестов);
  - `API_BASE_URL` / публичные URL для той среды, с которой ходит фронт (в GitHub environment `staging` уже задан `API_BASE_URL` на `dev`).

## Локальная отладка (PM2, порты 4001/3002)

Скрипты `npm run dev:parallel` (PM2) — **отдельный** режим для правок в коде **без** пересборки Docker. Порты **4001/3002** намеренно **не** совпадают с staging **4010/3010**, чтобы PM2 и Docker-staging не конфликтовали.

Публичный `dev.handyseller.ru` ведёт на **Docker staging** (после деплоя), а не на PM2. PM2 — для вас с SSH, если смотрите `localhost:3002` или настроите отдельно.

## Файлы в репозитории

| Файл | Назначение |
|------|------------|
| `docker-compose.ci.yml` | Production (и образец для prod). |
| `docker-compose.staging.yml` | Только staging. |
| `nginx/handyseller-app-ssl.conf` | `app` + `api` → 4000/3001. |
| `nginx/handyseller-dev-ssl.conf` | `dev` → 4010/3010. |

## Первый запуск после включения split

После merge этих правил на VM после **первого** успешного **Deploy Staging** появятся новые контейнеры `handyseller-staging-*`. Прод-контейнеры `handyseller-api` и т.д. останутся как были до **следующего** Deploy Production. При необходимости один раз вручную задеплойте прод (push в `main` или ручной workflow), чтобы образы на проде совпадали с ожиданиями.
