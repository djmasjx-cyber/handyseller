# HandySeller — Инфраструктура (Яндекс Облако)

## Развёртывание на VM

### Деплой (единственный скрипт)

```bash
npm run deploy
# или: ./scripts/full-deploy.sh
```

Создаёт VM при необходимости (через yc), разворачивает полный стек: Web + API + PostgreSQL + Redis + nginx.

Требуется: `yc` CLI, SSH-ключ `~/.ssh/yandex_vm`, `.env.secrets` (ADMIN_EMAIL, ADMIN_PASSWORD). Опционально:
- `POSTGRES_PASSWORD` — пароль PostgreSQL (по умолчанию: handyseller_prod_change_me)
- `JWT_SECRET` — секрет для JWT (по умолчанию: случайный)
- `CORS_ORIGIN` — разрешённый origin для API (по умолчанию: http://VM_HOST:3000)

**Переменные:**
- `DEPLOY_SSH_KEY` — путь к приватному SSH-ключу (обязательно)
- `VM_USER` — пользователь на VM (по умолчанию: ubuntu)
- `VM_HOST` — IP или hostname VM (по умолчанию: 158.160.209.158)

**Требования на VM:**
- Node.js 18+
- PM2 (рекомендуется): `npm install -g pm2`
- Порт 3000 открыт в файрволе

## Подключение к виртуальной машине

```bash
ssh -i /path/to/key -l user ip
```

## DNS настройка

После развёртывания Terraform и API Gateway:

```bash
# Получите IP API Gateway
yc serverless api-gateway get handyseller-frontend-prod

# Добавьте A-запись в DNS вашего домена
# handyseller.ru.     A  <IP_API_GATEWAY>
# www.handyseller.ru  CNAME  handyseller.ru.
```

## Быстрый старт

1. **Установите Yandex Cloud CLI**
   ```bash
   curl https://storage.yandexcloud.net/yandexcloud-yc/install.sh | bash
   yc init  # авторизуйтесь и выберите облако/каталог
   ```

2. **Настройте Terraform**
   ```bash
   cp terraform.tfvars.example terraform.tfvars
   # Заполните переменные, включая db_password
   ```

3. **Развёртывание**
   ```bash
   terraform init
   terraform plan
   terraform apply
   ```

## Загрузка статики

```bash
npm run build:static
npm run deploy:storage
```
