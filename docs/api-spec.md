# HandySeller API

## Base URL

- Development: `http://localhost:4000`
- Production: `https://api.handyseller.ru`

## Endpoints

### Health
- `GET /health` — состояние сервиса

### Auth (без JWT)
- `POST /auth/register` — регистрация (accessToken в JSON, refreshToken в HttpOnly cookie)
- `POST /auth/login` — вход (accessToken в JSON, refreshToken в HttpOnly cookie)
- `POST /auth/refresh` — обновление access token (refresh из cookie)
- `POST /auth/logout` — выход (очистка cookie и refresh в БД)

**Защита:** блокировка IP на 15 мин после 5 неудачных попыток входа. Rate limit: 100 req/мин.

### Users (требует JWT)
- `GET /users/me` — текущий пользователь

### Products (требует JWT)
- `GET /products` — список товаров
- `POST /products` — создать товар

### Materials (требует JWT)
- `GET /materials` — список материалов
- `POST /materials` — создать материал

### Marketplaces (требует JWT)
- `GET /marketplaces` — подключённые маркетплейсы

### Orders (требует JWT)
- `GET /orders` — заказы

### Subscriptions (требует JWT)
- `GET /subscriptions/me` — текущая подписка

### Analytics (требует JWT)
- `GET /analytics/summary` — сводка
