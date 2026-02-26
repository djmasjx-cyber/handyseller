# Проверка остатков на Wildberries

## Продакшен (VM)

```bash
# 1. Логин — получите токен
TOKEN=$(curl -s -X POST http://158.160.209.158:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ваш@email","password":"пароль"}' | jq -r '.accessToken')

# 2. Остаток товара 0001 на WB
curl -s "http://158.160.209.158:3000/api/marketplaces/wb-stock/0001" \
  -H "Authorization: Bearer $TOKEN"
```

Ответ:
```json
{
  "displayId": "0001",
  "nmId": 518430607,
  "localStock": 2,
  "wbStock": 1
}
```

- `localStock` — остаток в HandySeller
- `wbStock` — сколько доступно к покупке на WB

## Локальная разработка

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ваш@email","password":"пароль"}' | jq -r '.accessToken')

curl -s "http://localhost:3000/api/marketplaces/wb-stock/0001" \
  -H "Authorization: Bearer $TOKEN"
```

Если API запущен отдельно (порт 4000): замените `localhost:3000` на `localhost:4000`.

## Остатки не обновляются на WB

1. **Проверьте warehouseId** — при подключении WB укажите ID склада (ЛК WB → Маркетплейс → Мои склады). Без него остатки не отправляются. Если не указан, система попытается взять первый склад через API — проверьте права токена (категория «Marketplace»).
2. **Токен** — нужен доступ к категориям Content, Marketplace, Prices. ЛК WB → Настройки → API‑интеграции.
3. **Товар** — должен быть импортирован с WB (sku вида `WB-xxx-nmId`). Ручно созданные товары не синхронизируются.
4. **chrtId (с 09.02.2025)** — WB требует chrtId (ID размера) вместо sku/nmId. Система получает chrtId через Prices API (`/api/v2/list/goods/size/nm`) или Content API. Товар должен иметь хотя бы один размер в карточке WB.
