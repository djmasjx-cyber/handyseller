# HandySeller — Инициализация PostgreSQL

## Порядок развёртывания

1. **Terraform** создаёт кластер и БД:
   - БД `handyseller`
   - Пользователь `handyseller_user`
   - Базовая конфигурация (s2.micro, 16 ГБ, network-ssd)

2. **Скрипт** `01-init.sql` — расширения и настройки:
   ```bash
   # Подключение от postgres (логин из консоли Yandex Cloud или через yc)
   psql "host=<FQDN> port=6432 dbname=handyseller user=postgres sslmode=require" -f 01-init.sql
   ```

## Расширения

| Расширение  | Назначение                              |
|-------------|-----------------------------------------|
| uuid-ossp   | Генерация UUID                          |
| pgcrypto    | Шифрование паролей (crypt, gen_salt)    |
| citext      | Регистронезависимый текст (email)       |
| pg_trgm     | Поиск по триграммам, similarity         |
| unaccent    | Поиск без диакритики (ё→е)              |

## Справка

- [Managed Service for PostgreSQL](https://cloud.yandex.ru/docs/managed-postgresql/)
- Подключение: порт **6432** (Managed PG), SSL обязателен
