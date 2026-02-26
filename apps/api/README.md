# HandySeller API (NestJS)

## Запуск

```bash
# Установка
npm install

# Генерация Prisma Client
npm run prisma:generate

# Миграции (при наличии БД)
DATABASE_URL="..." npm run prisma:migrate

# Разработка
npm run dev
```

## Переменные окружения

См. `.env.example`

## Docker

```bash
cd docker
docker-compose up -d
```

API: http://localhost:4000
