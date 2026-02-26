# HandySeller — Тестирование

## Требования

| Тип | Покрытие / Цель | Инструменты |
|-----|-----------------|-------------|
| Unit | ≥ 80% | Jest |
| Integration | Все основные сценарии | Jest, Supertest |
| E2E | Критические пути | Jest, Supertest |
| Load | 1000+ req/sec | Artillery |
| Security | OWASP Top 10 | OWASP ZAP |

---

## Запуск тестов (API)

```bash
cd apps/api

# Все тесты
npm test

# С покрытием (цель 80%, порог повышается по мере добавления тестов)
npm run test:cov

# Unit (без E2E)
npm run test:unit

# Integration
npm run test:integration

# E2E (требует DATABASE_URL)
npm run test:e2e

# Load (API должен быть запущен)
npm run test:load
npm run test:load:quick  # быстрый прогон
```

---

## OWASP ZAP — проверка безопасности

### Установка

```bash
# Docker
docker pull owasp/zap2docker-stable

# Или скачать desktop: https://www.zaproxy.org/download/
```

### Базовое сканирование

```bash
# API должен быть запущен на localhost:4000
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t http://localhost:4000 \
  -r zap-report.html
```

### Активное сканирование (полное)

```bash
docker run -t owasp/zap2docker-stable zap-full-scan.py \
  -t http://localhost:4000 \
  -r zap-full-report.html
```

### Ожидаемые проверки (OWASP Top 10)

- **A01:2021 Broken Access Control** — JWT, CORS, rate limit
- **A02:2021 Cryptographic Failures** — HTTPS, шифрование PII
- **A03:2021 Injection** — SQL (Prisma), валидация входных данных
- **A04:2021 Insecure Design** — аутентификация, блокировка по IP
- **A05:2021 Security Misconfiguration** — Helmet, CSP, заголовки
- **A06:2021 Vulnerable Components** — `npm audit`
- **A07:2021 Auth Failures** — блокировка после 5 попыток
- **A08:2021 Integrity Failures** — подпись JWT
- **A09:2021 Logging** — AuthAuditLog
- **A10:2021 SSRF** — нет внешних запросов от пользователя

### CI

Добавить в pipeline:

```yaml
- name: Security scan
  run: |
    docker run -t owasp/zap2docker-stable zap-baseline.py \
      -t $API_URL -r zap-report.html || true
```
