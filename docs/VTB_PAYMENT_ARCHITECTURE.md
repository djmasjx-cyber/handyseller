# Архитектура: Интеграция ВТБ Эквайринг

## Доступ

**Только для админов** (и будущих ролей с правами на финансы).  
Раздел админ-панели: `/dashboard/admin/payments`.

---

## Два слоя доступа

| Сценарий | Кто | Доступ |
|----------|-----|--------|
| **Оплата подписки** | Обычный юзер | Создать платёж → редирект на форму ВТБ → success/fail. Без доступа к списку платежей, возвратам, логам |
| **Управление платежами** | ADMIN (и будущие роли) | Список платежей, возвраты, вебхуки, мониторинг, настройки ВТБ |

---

## Варианты прав (обсуждение)

### Вариант A: Только ADMIN (проще)
- Все операции с платежами — только `role === ADMIN`
- Минимум кода, легко поддерживать

### Вариант B: ADMIN + PAYMENT_MANAGER (гибче)
- `PAYMENT_MANAGER`: просмотр платежей, возвраты, логи вебхуков
- `ADMIN`: всё выше + настройки ВТБ (ключи, webhook URL), доступ к финансовым отчётам
- Требует миграцию `Role` и новые guards

**Рекомендация:** начать с **Варианта A**. Добавить PAYMENT_MANAGER позже, если появятся отдельные финансовые специалисты.

---

## Интеграция с HandySeller

### Текущие сущности
- **Subscription** — план (FREE/PROFESSIONAL/BUSINESS), `expiresAt`
- **Order** — заказы с маркетплейсов (WB, Ozon), не платежи

### Что платим
- **Оплата подписки** — пользователь продлевает/повышает план
- В будущем — другие типы платежей (доп.услуги и т.п.)

### Связь Payment ↔ Subscription
- `Payment.subjectType = 'subscription'`
- `Payment.subjectId = subscription.id`
- При успешной оплате — обновляем `subscription.plan`, `subscription.expiresAt`

---

## Безопасность (усиленная)

### 1. Вебхук ВТБ
- **Без JWT** — банк не отправляет токены
- **Проверка подписи** — HMAC, `crypto.timingSafeEqual` (защита от timing attacks)
- **Идемпотентность** — один и тот же вебхук можно обрабатывать многократно без дублей
- **Логирование** — все вебхуки в `vtb_webhooks`, без карточных данных
- **IP whitelist** — при наличии списка IP ВТБ (по документации банка)

### 2. Секреты ВТБ
- В env: `VTB_MERCHANT_ID`, `VTB_SECRET_KEY`, `VTB_WEBHOOK_SECRET`
- В `.env.secrets`, не в коде
- Не логировать в ошибках/телах запросов

### 3. Создание платежа
- Только для авторизованных
- Юзер — только для своей подписки
- Админ — для любой подписки (например, ручное продление)
- **Idempotency key** — защита от двойных списаний

### 4. Возвраты
- **Только ADMIN**
- Аудит: кто, когда, сколько (AdminAuditLog или аналог)

### 5. PCI DSS
- Данные карты **не храним** — форма на стороне ВТБ
- У нас только: `amount`, `status`, `vtb_payment_id`, `metadata` (без карт)

---

## Схема БД (Prisma)

```prisma
model Payment {
  id             String   @id @default(uuid())
  userId         String   @map("user_id")
  
  amount         Decimal  @db.Decimal(10, 2)
  currency       String   @default("RUB")
  status         PaymentStatus @default(PENDING)
  
  subjectType    String   @map("subject_type")   // subscription | order | ...
  subjectId      String   @map("subject_id")   // subscription.id или order.id
  
  vtbPaymentId   String?  @unique @map("vtb_payment_id")
  vtbSessionId   String?  @map("vtb_session_id")
  paymentMethod  String?  @map("payment_method")  // card, sbp, applepay, googlepay
  
  refundable     Boolean  @default(true)
  refundedAmount Decimal  @default(0) @map("refunded_amount") @db.Decimal(10, 2)
  
  idempotencyKey String?  @unique @map("idempotency_key")
  metadata       Json?
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id])
  
  webhooks VtbWebhook[]

  @@index([userId])
  @@index([status])
  @@index([vtbPaymentId])
  @@index([subjectType, subjectId])
  @@index([createdAt])
}

enum PaymentStatus {
  PENDING
  PROCESSING
  SUCCEEDED
  FAILED
  REFUNDED
  CANCELLED
}

model VtbWebhook {
  id             String   @id @default(uuid())
  paymentId      String?  @map("payment_id")
  eventType      String   @map("event_type")
  vtbPaymentId   String?  @map("vtb_payment_id")
  payload        Json
  signature      String
  ipAddress      String?  @map("ip_address")
  processed      Boolean  @default(false)
  processingError String? @map("processing_error") @db.Text
  createdAt      DateTime @default(now()) @map("created_at")

  payment Payment? @relation(fields: [paymentId], references: [id])

  @@index([vtbPaymentId])
  @@index([processed])
  @@index([createdAt])
}
```

---

## API

### Публичные (для юзеров)
| Метод | Путь | Кто | Описание |
|-------|------|-----|----------|
| POST | /api/payments/create | JWT, свой userId | Создать платёж для своей подписки |
| GET | /api/payments/:id/status | JWT, владелец платежа | Статус платежа |

### Админские
| Метод | Путь | Кто | Описание |
|-------|------|-----|----------|
| GET | /api/admin/payments | ADMIN | Список платежей, фильтры |
| GET | /api/admin/payments/:id | ADMIN | Детали платежа |
| POST | /api/admin/payments/:id/refund | ADMIN | Возврат |
| GET | /api/admin/payments/webhooks | ADMIN | Логи вебхуков |
| GET | /api/admin/payments/stats | ADMIN | Статистика |

### Вебхук (без auth)
| Метод | Путь | Кто | Описание |
|-------|------|-----|----------|
| POST | /api/payments/webhook/vtb | ВТБ (проверка подписи) | Обработка событий от банка |

---

## Фактический API ВТБ (из sandbox.vtb.ru)

**URL:**
- TEST: `https://vtb.rbsuat.com/payment/rest/`
- PROD: `https://platezh.vtb24.ru/payment/rest/`

**Методы:**
- `register.do` — регистрация заказа. Параметры: userName, password, orderNumber, amount (копейки), currency (643=RUB), returnUrl, failUrl, description. Ответ: orderId (mdOrder), formUrl
- `getOrderStatusExtended.do` — статус заказа. orderStatus: 1 или 2 = оплачен
- `dynamicCallbackUrl` — для callback-уведомлений (опционально)

**Аутентификация:** userName + password (или token от поддержки)

---

## Конфигурация (env)

```env
# ВТБ (sandbox.vtb.ru)
VTB_USER_NAME=           # логин API мерчанта (-api)
VTB_PASSWORD=            # пароль API

# Режим: sandbox | production
VTB_MODE=sandbox
```

---

## План внедрения

### Фаза 1: База (≈2–3 дня) ✅
1. Миграция Prisma: Payment, VtbWebhook ✅
2. PaymentModule, VtbPaymentService (create, getStatus, verifyWebhook) ✅
3. POST /api/payments/create (для своей подписки) ✅
4. POST /api/payments/webhook/vtb (вебхук, проверка подписи) ✅
5. GET /api/admin/payments (список) ✅

### Фаза 2: Админ-панель (≈1–2 дня) ✅
1. Страница /dashboard/admin/payments ✅
2. Таблица платежей, фильтры, детали (GET /admin/payments/:id) ✅
3. Страница /dashboard/admin/payments/webhooks ✅
4. POST /api/admin/payments/:id/refund + UI ✅

### Фаза 3: Юзерский флоу (≈1 день) ✅
1. Страница оплаты подписки (выбор плана → create → redirect на ВТБ) ✅
2. Success/fail callback после возврата с формы ✅
3. Polling статуса при необходимости ✅

### Фаза 4: Мониторинг ✅
1. GET /api/admin/payments/stats ✅
2. Алерты на необработанные вебхуки (отображаются на странице платежей) ✅
3. (Опционально) AdminAuditLog для возвратов — отложено

---

## Чек-лист перед запуском

- [ ] Договор эквайринга с ВТБ
- [ ] Тестовый стенд (sandbox)
- [ ] SSL на домене
- [ ] Публичный URL для вебхука (ВТБ должен достучаться)
- [ ] Секреты в .env.secrets
- [ ] Идемпотентность вебхуков
- [ ] Тесты: создание платежа, вебхук, возврат
