# Pre-Launch Checklist — HandySeller

## База данных

| # | Задача | Статус | Комментарий |
|---|--------|--------|-------------|
| 1 | Создан кластер PostgreSQL в Яндекс Облаке | ✅ | Terraform: `yandex_mdb_postgresql_cluster.handyseller_db` |
| 2 | Настроена репликация | ✅ | 2 хоста: ru-central1-a (primary), ru-central1-b (replica) |
| 3 | Настроено резервное копирование | ✅ | backup_window_start 02:00 UTC, backup_retain_period_days = 7 |
| 4 | Включено шифрование (KMS) | ✅ | disk_encryption_key_id, KMS AES-256 |
| 5 | Применены миграции Prisma | ⏳ | Выполнить вручную: `prisma migrate deploy` |
| 6 | Созданы индексы для производительности | ✅ | schema.prisma: @@index на token, userId, email, ip, createdAt |
| 7 | Настроены параметры производительности | ✅ | shared_buffers, effective_cache_size, work_mem в Terraform |
| 8 | Протестирована отказоустойчивость | ⏳ | Ручная проверка failover |

---

## Безопасность

| # | Задача | Статус | Комментарий |
|---|--------|--------|-------------|
| 1 | Настроены security groups | ✅ | yandex_vpc_security_group.db: порт 6432, 10.0.0.0/16 |
| 2 | Отключён публичный доступ к БД | ✅ | assign_public_ip = false, access.web_sql = false |
| 3 | Настроены CORS правила | ✅ | main.ts: handyseller.ru, staging, localhost |
| 4 | Включены все заголовки безопасности (Helmet) | ✅ | CSP, xssFilter, noSniff, frameguard DENY, HSTS |
| 5 | Настроен rate limiting | ✅ | ThrottlerModule: 100 req/мин на user, 1000/мин на IP |
| 6 | Реализована защита от brute force | ✅ | AuthService: блокировка на 15 мин после 5 неудачных попыток по IP |
| 7 | Все пароли хэшируются (bcrypt) | ✅ | hash.util.ts: bcrypt salt 12 |
| 8 | API ключи шифруются (AES-256) | ✅ | CryptoService + MarketplacesService |
| 9 | Включён SSL для всех соединений | ⏳ | На уровне load balancer / reverse proxy |
| 10 | Проведён аудит безопасности (OWASP) | ⏳ | docs/testing.md: инструкции для OWASP ZAP |

---

## Масштабируемость

| # | Задача | Статус | Комментарий |
|---|--------|--------|-------------|
| 1 | Настроено несколько инстансов приложения | ⏳ | VM deployment: 1 инстанс, нужен второй для HA |
| 2 | Настроен балансировщик нагрузки | ⏳ | Yandex ALB / NLB — инфраструктура |
| 3 | Настроен кэш (Redis) | ⏳ | В docker-compose есть, API не использует |
| 4 | Настроена CDN для статики | ✅ | Terraform: yandex_cdn_resource.frontend |
| 5 | Протестирована нагрузка (1000+ запросов/сек) | ⏳ | Artillery config есть, запускать вручную |
| 6 | Настроено автомасштабирование | ⏳ | Yandex Instance Group с auto scaling |

---

## Мониторинг

| # | Задача | Статус | Комментарий |
|---|--------|--------|-------------|
| 1 | Настроен лог агрегатор (Winston) | ✅ | LoggerService + Morgan |
| 2 | Подключён Sentry для ошибок | ✅ | main.ts + AllExceptionsFilter |
| 3 | Настроены метрики (Prometheus) | ✅ | /metrics endpoint, @willsoto/nestjs-prometheus |
| 4 | Настроен дашборд (Grafana) | ⏳ | Нужен datasource Prometheus, дашборд |
| 5 | Настроены алерты | ✅ | TelegramAlertService при 5xx |
| 6 | Реализованы health checks | ✅ | /health, /health/ready (с проверкой БД) |

---

## Резервное копирование

| # | Задача | Статус | Комментарий |
|---|--------|--------|-------------|
| 1 | Ежедневные бэкапы БД | ✅ | Terraform: backup_window_start 02:00 |
| 2 | Хранение бэкапов 7 дней | ✅ | backup_retain_period_days = 7 |
| 3 | Протестировано восстановление из бэкапа | ⏳ | Ручная проверка через Yandex Console |
| 4 | Автоматические скрипты бэкапа | ⏳ | MDB делает автоматически, внешние скрипты не нужны |

---

## Резюме

| Категория | Готово | Всего | % |
|-----------|--------|-------|---|
| База данных | 6 | 8 | 75% |
| Безопасность | 8 | 10 | 80% |
| Масштабируемость | 1 | 6 | 17% |
| Мониторинг | 5 | 6 | 83% |
| Резервное копирование | 2 | 4 | 50% |
| **Итого** | **22** | **34** | **65%** |

---

## Рекомендуемые действия перед запуском

1. **terraform apply** — применить Terraform (если ещё не применён)
2. **prisma migrate deploy** — применить миграции к production БД
3. Настроить **SSL** на ALB / nginx / Caddy перед API
4. Создать **Telegram бота** и задать TELEGRAM_ALERT_BOT_TOKEN, TELEGRAM_ALERT_CHAT_ID
5. Задать **SENTRY_DSN** в production
6. Запустить **Artillery** для проверки нагрузки
7. Запустить **OWASP ZAP** для базового аудита
