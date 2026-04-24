# TMS Demo Checkout

Временная страница `/tms-demo` имитирует сайт клиента: корзина уходит в Partner TMS API, TMS возвращает варианты доставки, выбранный тариф подтверждается и через HandySeller создается заказ у перевозчика.

## Как включить

На VM выполнить bootstrap для нужного окружения:

```bash
npm run tms:demo:bootstrap --workspace=api -- --env-file=/opt/handyseller/.env.staging --write-env=true
```

Скрипт сам найдет первого активного `ADMIN`, создаст или обновит M2M-клиент TMS с правами `tms:read` и `tms:write`, запишет `TMS_DEMO_CLIENT_ID` и `TMS_DEMO_CLIENT_SECRET` в env-файл.

Секрет клиента используется только на серверной стороне Next.js в `/api/tms-demo/*` и не попадает в браузер.

## Боевой сценарий

1. Заполнить номер заказа, ФИО, телефон и адрес покупателя.
2. Нажать “Рассчитать доставку”.
3. Проверить список вариантов: перевозчик, цена, срок, комментарий.
4. Выбрать тариф.
5. Поставить флаг осознанного боевого подтверждения.
6. Нажать “Оформить доставку у перевозчика”.

В успешном ответе страница показывает `shipmentId`, перевозчика, номер заявки/референс перевозчика, `trackingNumber`, документы и events.

## Проверка

```bash
WEB_BASE_URL=https://dev.handyseller.ru REAL_CONFIRM=false npm run smoke:tms:demo
```

Для реального создания заявки:

```bash
WEB_BASE_URL=https://dev.handyseller.ru REAL_CONFIRM=true npm run smoke:tms:demo
```

## Когда удалить

Когда клиентская интеграция будет подтверждена и появится постоянный demo/sandbox-стенд, удалить:

- `apps/web/app/tms-demo/page.tsx`;
- `apps/web/app/api/tms-demo/*`;
- переменные `TMS_DEMO_*` из окружений.
