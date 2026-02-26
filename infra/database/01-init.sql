-- HandySeller: инициализация БД
-- Запускать от имени postgres (суперпользователь) после создания кластера через Terraform.
-- Terraform уже создаёт БД handyseller и пользователя handyseller_user.

-- Расширения для производительности и поиска
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";   -- Регистронезависимые тексты (email, slugs)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- Поиск по триграммам (ILIKE, similarity)
CREATE EXTENSION IF NOT EXISTS "unaccent"; -- Поиск без учёта диакритики

-- Настройки производительности (s2.micro, 16 ГБ)
-- В Managed PostgreSQL часть параметров может быть ограничена кластером
ALTER DATABASE handyseller SET work_mem = '16MB';
ALTER DATABASE handyseller SET maintenance_work_mem = '256MB';
ALTER DATABASE handyseller SET effective_cache_size = '1GB';
-- shared_buffers в Managed PG обычно задаётся кластером — при необходимости добавьте в Terraform postgresql_config
-- ALTER DATABASE handyseller SET shared_buffers = '512MB';
ALTER DATABASE handyseller SET random_page_cost = '1.1';
ALTER DATABASE handyseller SET effective_io_concurrency = '200';
