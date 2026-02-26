# HandySeller — Модуль шифрования

## Реализовано

| Требование | Реализация |
|------------|------------|
| Пароли | bcrypt (salt 12) |
| API ключи маркетплейсов | AES-256-GCM, шифрование при сохранении |
| PII (имя, телефон) | AES-256-GCM, шифрование в БД |
| Ключи | ENCRYPTION_KEY из env; KMS — заглушка для production |
| SSL/TLS | На уровне load balancer/reverse proxy |
| HSTS | maxAge 1 год, includeSubDomains |

## Конфигурация

```
ENCRYPTION_KEY="min-32-chars-for-aes-256"  # Обязательно в production
KMS_KEY_ID="fc8xxxxx-xxxx"                  # Опционально: Yandex KMS
```

## Схема (envelope encryption для production)

1. Мастер-ключ в Yandex KMS
2. Data Key шифруется мастер-ключом
3. Зашифрованный DEK хранится в БД
4. Расшифровка при чтении через KMS
5. Ротация раз в 90 дней — задача для cron/job

## Использование

- **CryptoService** — `encrypt()`, `decrypt()`, `encryptOptional()`, `decryptOptional()`
- **MarketplacesService** — токены WB/Ozon шифруются автоматически
- **UsersService** — name, phone шифруются при создании, расшифровываются при отдаче
