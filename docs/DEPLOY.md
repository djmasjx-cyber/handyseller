# Деплой HandySeller

## VM (рекомендуемый способ)

```bash
npm run deploy
```

Разворачивает полный стек на handyseller-vm: Web + API + PostgreSQL + Redis + nginx. Подробнее: [docs/DEPLOY-VM.md](./DEPLOY-VM.md).

---

## Альтернативные варианты (legacy / другой стек)

### Обзор

- **Фронтенд**: статический экспорт Next.js → Object Storage → CDN
- **API**: NestJS → Docker → Compute Instance / Serverless Container
- **БД**: Yandex Managed PostgreSQL (Terraform)

## API

### Переменные окружения

```env
DATABASE_URL=postgresql://handyseller_user:PASSWORD@c-xxx.rw.mdb.yandexcloud.net:6432/handyseller?sslmode=require
PORT=4000
NODE_ENV=production
CORS_ORIGIN=https://handyseller.ru,https://www.handyseller.ru
```

### Сборка Docker (из корня репозитория)

```bash
docker build -f apps/api/Dockerfile -t handyseller-api .
```

### Запуск

```bash
docker run -p 4000:4000 -e DATABASE_URL="..." handyseller-api
```

### Миграции

Миграции применяются отдельно (не в Docker):

```bash
cd apps/api && npx prisma migrate deploy
```

## Фронтенд

### Сборка статики

```bash
npm run build:static
```

### Загрузка в Object Storage

```bash
npm run deploy:storage
```

Бакет: `handyseller-frontend-prod`, префикс `static/`.

## Прокси /api

Статический фронт делает запросы на `/api/*`. Варианты:

1. **Тот же домен**: nginx / API Gateway проксирует `handyseller.ru/api` → NestJS (порт 4000)
2. **Отдельный домен**: API на `api.handyseller.ru`, фронт с `NEXT_PUBLIC_API_URL=https://api.handyseller.ru`

NestJS слушает на префиксе `/api` (кроме `/health`, `/health/ready`).

## API на VM (handyseller-vm)

VM: `158.160.209.158` (ubuntu).

### Автоматический деплой (при наличии SSH)

```bash
# На VM должен быть Docker и SSH-доступ по ключу
npm run deploy:api
```

Или вручную: `./scripts/deploy-api.sh`

### SSH

VM использует OS Login. Для входа по ключу добавлен ключ в метаданные. Если `Permission denied`:
- используйте Serial Console в [консоли Yandex Cloud](https://console.cloud.yandex.ru);
- либо задайте `HS_VM_USER` и `HS_VM_HOST`, если подключаетесь с другого пользователя/хоста.

Подробная инструкция: `scripts/deploy-api-manual.md`.

### Защита персональных данных (PII)

- Email, name, phone пользователей хранятся в зашифрованном виде (AES-256-GCM).
- `ENCRYPTION_KEY` в `.env` — минимум 32 символа. Не коммитить!
- Токены маркетплейсов шифруются тем же ключом.

### .env на VM

В `~/handyseller/.env`:
```env
DATABASE_URL=postgresql://...
JWT_SECRET=...
ENCRYPTION_KEY=...
CORS_ORIGIN=https://handyseller.ru,https://www.handyseller.ru
```

## Terraform

```bash
cd infra/terraform
terraform init
terraform plan
terraform apply
```

После apply — обновить `DATABASE_URL` в `.env` API из вывода Terraform.
