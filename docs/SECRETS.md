# Хранение секретов и персональных данных

## Принципы

1. **Никогда не коммитить** реальные логины, пароли, ключи, токены
2. **Использовать env-переменные** для конфигурации приложений
3. **Шифровать в БД** чувствительные персональные данные
4. **Примеры** — только плейсхолдеры (`your-password`, `YOUR_KEY`)

---

## Где хранятся секреты

### 1. Локальная разработка

| Секрет | Файл | Пример |
|--------|------|--------|
| Admin (seed) | `.env.secrets` в корне | `ADMIN_EMAIL`, `ADMIN_PASSWORD` |
| DB, JWT, Encryption | `apps/api/.env` | `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY` |

Файлы `.env` и `.env.secrets` в `.gitignore` — **не попадают в git**.

### 2. Деплой на VM (продакшен)

- **Перед деплоем**: все секреты берутся из `.env.secrets` на машине, с которой запускают `npm run deploy`. В репозиторий и в tarball **не попадают** реальные значения `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, пароли админа.
- **На VM** создаётся `/opt/handyseller/.env.production`:
  - из шаблона (только несекретные переменные),
  - плюс подстановка при деплое: `DATABASE_URL` (Yandex Managed PostgreSQL), `JWT_SECRET`, `ENCRYPTION_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `CORS_ORIGIN`;
  - опционально дописывается `.env.extra` (ВТБ, Resend и т.д.), если переменные заданы в `.env.secrets`.
- **Между деплоями** на VM сохраняются ключи в `/opt/handyseller/.jwt-secret` и `/opt/handyseller/.encryption-key`, чтобы не инвалидировать сессии пользователей.

### 3. База данных

| Данные | Хранение |
|--------|----------|
| Пароли пользователей | Хеш bcrypt (`password_hash`), никогда plain text |
| Email, имя, телефон (PII) | Шифруются AES через `CryptoService` |
| Маркетплейсы (API-ключи, токены) | Шифруются в `MarketplaceConnection` |
| TMS внешние клиенты (`client_secret`) | В БД только **SHA-256** в `tms_m2m_client.secret_hash`; в открытом виде показывается один раз при создании |

Продакшен использует **Yandex Managed PostgreSQL**; подключение только по TLS.

---

## Обязательные env-переменные

### API (`apps/api/.env` или контейнер)

- `DATABASE_URL` — строка подключения к PostgreSQL (Managed PG: порт 6432, `?sslmode=require`)
- `JWT_SECRET` — ключ для JWT (минимум 32 символа)
- `ENCRYPTION_KEY` — ключ AES для PII (минимум 32 символа)
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` — для seed
- опционально: `TMS_M2M_TOKEN_EXPIRES_IN` — срок жизни M2M access token для внешних интеграций TMS (например `1h`)
- опционально (контейнер **web**): `DADATA_TOKEN` — подсказки адресов на странице TMS «Заказы клиентов» (API DaData, ключ не уходит в браузер)

### Деплой (`.env.secrets`)

- `DEPLOY_SSH_KEY` — путь к SSH-ключу
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` — обязательны
- `YANDEX_MDB_HOST`, `YANDEX_MDB_PASSWORD` — обязательны для продакшена (Managed PostgreSQL)
- опционально: `YANDEX_MDB_USER`, `CORS_ORIGIN`, `VTB_*`, `RESEND_API_KEY`, `EMAIL_FROM` (см. `.env.secrets.example`)

---

## Что не должно быть в коде

- Реальные email/пароль админа
- Пароли БД
- JWT_SECRET, ENCRYPTION_KEY
- Реальные хосты БД (в примерах — плейсхолдеры)
- API-ключи маркетплейсов (только из БД, шифрованные)

## Тестовые данные

В тестах (`*.spec.ts`, `*.e2e-spec.ts`) используются только фейковые значения: `test@example.com`, `password123`, `Test123!` — это допустимо, т.к. `example.com` зарезервирован для документации, а пароли не относятся к production.
