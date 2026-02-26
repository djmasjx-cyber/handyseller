# HandySeller — Мониторинг и логирование

## Требования

| Компонент | Реализация |
|-----------|------------|
| Логирование запросов | Winston + Morgan |
| Логирование ошибок | Sentry |
| Метрики | Prometheus + Grafana |
| Health checks | /health, /health/ready |
| Алерты | Telegram бот |

## Формат логов

```json
{
  "timestamp": "2025-02-12 20:00:00.123",
  "level": "info",
  "message": "GET /api/products 200 45 ms",
  "service": "handyseller-api",
  "requestId": "uuid",
  "userId": "user-id (если авторизован)",
  "ip": "x-forwarded-for или remoteAddress",
  "userAgent": "...",
  "method": "GET",
  "url": "/api/products",
  "status": "200",
  "responseTime": "45"
}
```

## Endpoints

| Endpoint | Описание |
|----------|----------|
| `GET /health` | Liveness — быстрая проверка, без БД |
| `GET /health/ready` | Readiness — проверка БД, для Kubernetes |
| `GET /metrics` | Prometheus метрики |

## Конфигурация (env)

```bash
# Логи
LOG_LEVEL=info   # debug, info, warn, error

# Sentry (production)
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# Telegram алерты (ошибки 5xx)
TELEGRAM_ALERT_BOT_TOKEN=123456:ABC...
TELEGRAM_ALERT_CHAT_ID=-1001234567890
```

## Grafana + Prometheus

### Prometheus scrape config

```yaml
scrape_configs:
  - job_name: 'handyseller-api'
    static_configs:
      - targets: ['api:4000']
    metrics_path: /metrics
    scrape_interval: 15s
```

### Пример дашборда

- HTTP запросы: `http_requests_total`, `http_request_duration_seconds`
- Node.js: `nodejs_heap_size_used_bytes`, `process_cpu_seconds_total`

## Создание Telegram бота

1. @BotFather → /newbot
2. Получить `TELEGRAM_ALERT_BOT_TOKEN`
3. Добавить бота в группу/канал
4. Chat ID: переслать сообщение боту @userinfobot или через API `getUpdates`
