# Деплой HandySeller на VM

## Единственная команда

```bash
npm run deploy
```

Или напрямую: `./scripts/full-deploy.sh`

## Что делает деплой

1. **Проверяет yc CLI** — если VM ещё нет, создаёт handyseller-vm в Yandex Cloud
2. **Получает IP** — актуальный адрес VM через `yc compute instance list`
3. **Собирает Docker-образы** — API и Web из корня монорепо
4. **Запускает deploy-vm-full.sh** — копирует образы и конфиг на VM, поднимает стек

## На VM разворачивается

- **Docker Compose** (`docker-compose.prod.yml`):
  - **API** (NestJS) — порт 4000, подключение к Yandex Managed PostgreSQL
  - **Web** (Next.js standalone) — порт 3001
  - **Redis** — только внутри сети контейнеров
- **БД** — только Yandex Managed PostgreSQL (без локального Postgres в Docker)
- **Nginx** на хосте — 80/443, прокси на 127.0.0.1:4000 и 127.0.0.1:3001 (SSL через Let's Encrypt при наличии сертификата)
- **Systemd** — `docker.service` и опционально `handyseller-compose.service` для автозапуска после перезагрузки

## Требования

- **yc CLI** — [Yandex Cloud CLI](https://cloud.yandex.ru/docs/cli/quickstart)
- **Docker** — на машине, с которой запускается деплой (сборка образов)
- **SSH-ключ** — `~/.ssh/yandex_vm` или `DEPLOY_SSH_KEY=/path/to/key`
- **.env.secrets** в корне проекта:
  - `ADMIN_EMAIL`, `ADMIN_PASSWORD` — обязательны
  - `YANDEX_MDB_HOST`, `YANDEX_MDB_PASSWORD` — обязательны для продакшена (Managed PostgreSQL)
  - опционально: `YANDEX_MDB_USER`, `CORS_ORIGIN`, `VTB_*`, `RESEND_API_KEY` и др. (см. .env.secrets.example)

### Деплой через GitHub Actions (CI)

При push в `main` workflow собирает образы в GHCR и деплоит на VM через `docker-compose.ci.yml`. На VM в `/opt/handyseller/.env.production` должны быть заданы переменные для **AI-ассистента** (иначе ассистент будет отвечать «напишите в Telegram» на каждый вопрос):

- `YANDEX_GPT_API_KEY` — API-ключ Yandex GPT (сервисный аккаунт, область `yc.ai.foundationModels.execute`)
- `YANDEX_GPT_FOLDER_ID` — идентификатор каталога Yandex Cloud
- `TELEGRAM_BOT_TOKEN` — токен бота для уведомлений оператора (при низкой уверенности ответа)
- `TELEGRAM_OPERATOR_CHAT_ID` — (опционально) chat_id оператора; иначе оператор пишет боту `/start` и регистрируется сам

## Безопасность и надёжность

- Секреты (JWT_SECRET, ENCRYPTION_KEY, DATABASE_URL) не попадают в репозиторий: подставляются на VM при деплое из .env.secrets и сохранённых файлов.
- **Yandex KMS + envelope для PII:** задайте `KMS_KEY_ID` и **`ENCRYPTION_DEK_WRAPPED`** — строка из `KmsService.encryptDataKey` (32 байта DEK, зашифрованные KMS). `CryptoService` поднимает AES-256-GCM с расшифрованного DEK. Без простоя при переходе с `ENCRYPTION_KEY`: выполните на машине с доступом к KMS и тем же `ENCRYPTION_KEY`, что в проде (`apps/api/scripts/wrap-encryption-key-for-kms.ts`), вставьте вывод в Lockbox, перезапустите API, затем можно убрать plaintext `ENCRYPTION_KEY` из env. На VM с сервисным аккаунтом IAM для SDK обычно не нужен; иначе `YC_IAM_TOKEN`.
- Контейнеры запускаются с `restart: unless-stopped` — автоматический перезапуск при сбоях и после перезагрузки VM.
- Подключение к БД только по TLS (sslmode=require) на Managed PostgreSQL.

## Альтернативные скрипты

| Скрипт | Назначение |
|--------|------------|
| deploy-api.sh | Только API в Docker (альтернативный сценарий) |
| setup-domain-ssl.sh | Первичная настройка SSL (Let's Encrypt) |
| expand-cert-app.sh | Добавить app.handyseller.ru в сертификат |
