# PostgreSQL в Yandex Cloud

Кластер **handyseller-db** создан и работает (статус: ALIVE, RUNNING).

## Подключение

- **Host:** `rc1a-5n1ok7rb7ukbemv7.mdb.yandexcloud.net` (с публичным IP)
- **Port:** 6432
- **Database:** handyseller
- **User:** handyseller_user
- **SSL:** обязателен (`sslmode=require`)

### Connection string (для приложения на VM в том же VPC)

```
postgresql://handyseller_user:PASSWORD@rc1a-oamicdcfjuij7s2m.mdb.yandexcloud.net:6432/handyseller?sslmode=require
```

Пароль сохранён в `infra/terraform/terraform.tfvars` (если создавали через Terraform) или был указан при создании через `yc` CLI.

## Важно

Кластер **без публичного IP** — доступен только из той же VPC. API должен работать на виртуальной машине в Yandex Cloud в той же сети.

## Подключение с локальной машины (через SSH-туннель)

VM в той же VPC выступает как bastion:

```bash
# 1. Добавьте в .env.secrets:
#    YANDEX_MDB_HOST=<FQDN из terraform output postgresql_host>
#    YANDEX_MDB_PASSWORD=<пароль из terraform.tfvars>

# 2. Подключиться
./scripts/connect-db.sh mdb        # psql
./scripts/connect-db.sh mdb studio # Prisma Studio
```

## Миграции

Выполнять с машины, имеющей доступ к VPC (например, с вашей VM):

```bash
cd apps/api
DATABASE_URL="postgresql://handyseller_user:YOUR_PASSWORD@rc1a-oamicdcfjuij7s2m.mdb.yandexcloud.net:6432/handyseller?sslmode=require" npx prisma migrate deploy
```

## Мониторинг

Консоль: https://console.cloud.yandex.ru/folders/b1gp764ln7p89sc0kb3s/managed-postgresql/cluster/c9qi3ukea9mae1rs2kfl
