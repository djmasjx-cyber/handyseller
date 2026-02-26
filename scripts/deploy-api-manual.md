# Ручной деплой API на handyseller-vm

Если нет SSH с локальной машины, используйте **консоль браузера** в Yandex Cloud:
1. [Compute Cloud](https://console.cloud.yandex.ru/folders/b1gp764ln7p89sc0kb3s/compute/instances) → handyseller-vm → «Подключиться» → «Средство просмотра» (Serial Console).

## Вариант A: Docker на VM (рекомендуется)

На VM выполните:

```bash
# Установка Docker (если ещё нет)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Перелогиниться для применения группы

# Создать директорию и .env
mkdir -p ~/handyseller
cd ~/handyseller
nano .env   # вставить DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, CORS_ORIGIN
```

С локальной машины (где есть код):

```bash
# Сборка и загрузка образа
docker build -f apps/api/Dockerfile -t handyseller-api .
docker save handyseller-api -o handyseller-api.tar
scp handyseller-api.tar docker-compose.api.yml ubuntu@158.160.209.158:~/handyseller/
# Скопировать .env с DATABASE_URL
```

На VM:

```bash
cd ~/handyseller
mv docker-compose.api.yml docker-compose.yml
docker load -i handyseller-api.tar
docker compose up -d
```

## Вариант B: Без Docker — Node.js на VM

```bash
# На VM
cd ~
git clone <repo> handyseller   # или scp копируйте apps/api
cd handyseller/apps/api
npm ci --omit=dev
npx prisma generate
npm run build

# .env с DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY
export $(cat .env | xargs)
node dist/main.js
# Или через pm2: pm2 start dist/main.js --name handyseller-api
```

## Проверка

```bash
curl http://158.160.209.158:4000/health
```
