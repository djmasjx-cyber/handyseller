# Wildberries API: загрузка медиа (фото + видео) в карточку товара

> **Обновлено:** 2026-03-21 — добавлена поддержка видео, предварительная валидация URL, улучшенная обработка ошибок.

## Общие правила

1. **Медиа при создании:** WB API не принимает фото/видео при создании карточки. Последовательность:
   - Создать карточку → получить nmID
   - Подождать 3 сек (WB обрабатывает асинхронно)
   - **Проверить доступность URL** (HEAD запрос)
   - Вызвать media/save с URL фото/видео
   - При ошибке — повтор до 4 раз с интервалом 3 сек
2. **Нужен nmID** — идентификатор номенклатуры, который WB возвращает после создания карточки.
3. **URL должны быть публично доступны** — WB скачивает файлы на своей стороне.

## Методы загрузки медиа

| Endpoint | Назначение |
|----------|------------|
| **POST /content/v3/media/save** | Загрузка по URL-ссылкам (предпочтительно) |
| **POST /content/v3/media/file** | Загрузка файла напрямую (multipart/form-data) |

## POST /content/v3/media/save — загрузка по URL

**URL:** `https://content-api.wildberries.ru/content/v3/media/save`

**Заголовки:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Формат тела запроса (актуальный):**
```json
{
  "nmId": 12345678,
  "data": [
    "https://storage.yandexcloud.net/handyseller-media/users/.../photo1.jpg",
    "https://storage.yandexcloud.net/handyseller-media/users/.../photo2.jpg",
    "https://storage.yandexcloud.net/handyseller-media/users/.../video.mp4"
  ]
}
```

> **Важно:** `data` — массив строк URL, не объектов! Проверено 09.03.2026.

**Требования к URL:**
- Публично доступный HTTP или HTTPS
- Формат изображения: JPG, PNG, WebP (рекомендуется вертикальное, мин. 900×1200 px)
- Формат видео: MP4
- WB скачивает файлы по URL на своей стороне

## Текущая реализация (HandySeller)

Файл: `apps/api/src/modules/marketplaces/adapters/wildberries.adapter.ts`

### Основной метод: `uploadMedia()`

```typescript
private async uploadMedia(
  nmId: number,
  images: string[],
  videoUrl?: string,
): Promise<{ success: boolean; uploadedCount: number; errors: string[] }>
```

**Возможности:**
- ✅ Поддержка фото и видео в одном запросе
- ✅ Предварительная проверка доступности URL (HEAD запрос)
- ✅ Batch-загрузка всех файлов одним запросом
- ✅ Retry до 4 раз с интервалом 3 сек
- ✅ Структурированный результат с ошибками

### Валидация URL

```typescript
private async validateMediaUrls(urls: string[]): Promise<string[]>
```

Перед отправкой в WB проверяем каждый URL:
- HEAD запрос с timeout 5 сек
- HTTP 2xx/3xx = доступен
- Недоступные URL пропускаются с логом

### Вызов

Метод вызывается в:
- `uploadFromCanonical()` — при создании карточки
- `updateProduct()` — при обновлении карточки

### Legacy

```typescript
/** @deprecated Use uploadMedia instead */
private async uploadImages(nmId: number, images: string[]): Promise<void>
```

## POST /content/v3/media/file — прямая загрузка файла

Для загрузки без URL (файл из формы, base64 и т.п.):
- Content-Type: multipart/form-data
- Требуется передать бинарные данные файла

## Хранение медиа в HandySeller

**Yandex Object Storage (S3)** — все изображения хранятся в S3.

| Параметр | Значение |
|----------|----------|
| Endpoint | `https://storage.yandexcloud.net` |
| Bucket | `handyseller-media` |
| Формат URL | `https://storage.yandexcloud.net/handyseller-media/users/{userId}/{uuid}.{ext}` |
| Доступ | Публичный (WB может скачивать) |

## Модель данных

**Product (Prisma):**
```prisma
model Product {
  imageUrl   String?  // Основное фото (URL)
  imageUrls  Json?    // Доп. фото: массив URL (JSON string[])
  videoUrl   String?  // Видео для WB/Ozon (URL)
}
```

**CanonicalProduct:**
```typescript
interface CanonicalProduct {
  images?: { url: string; isMain?: boolean }[];
  video_url?: string;
}
```

## Траблшутинг

| Проблема | Причина | Решение |
|----------|---------|----------|
| "Все URL недоступны" | URL не публичны | Проверьте доступ к S3 bucket |
| HTTP 403 | S3 bucket не публичный | Настройте public read в Yandex Cloud |
| HTTP 429 | Rate limit WB | Увеличьте задержку между запросами |
| nmId не найден | Карточка ещё не создана | Увеличьте задержку после создания |

## Источники

- [WB OpenAPI: работа с товарами](https://dev.wildberries.ru/docs/openapi/work-with-products)
- [Добавление медиа, создание и обновление карточек (форум)](https://dev.wildberries.ru/forum/topics/1971)
- [Инструкция по работе с товарами](https://dev.wildberries.ru/news/101)
- Swagger: https://dev.wildberries.ru/swagger/products
# Wildberries API: загрузка медиа (фото + видео) в карточку товара

> **Обновлено:** 2026-03-21 — добавлена поддержка видео, предварительная валидация URL, улучшенная обработка ошибок.

## Общие правила

1. **Медиа при создании:** WB API не принимает фото/видео при создании карточки. Последовательность:
   - Создать карточку → получить nmID
   - Подождать 3 сек (WB обрабатывает асинхронно)
   - **Проверить доступность URL** (HEAD запрос)
   - Вызвать media/save с URL фото/видео
   - При ошибке — повтор до 4 раз с интервалом 3 сек
2. **Нужен nmID** — идентификатор номенклатуры, который WB возвращает после создания карточки.
3. **URL должны быть публично доступны** — WB скачивает файлы на своей стороне.

## Методы загрузки медиа

| Endpoint | Назначение |
|----------|------------|
| **POST /content/v3/media/save** | Загрузка по URL-ссылкам (предпочтительно) |
| **POST /content/v3/media/file** | Загрузка файла напрямую (multipart/form-data) |

## POST /content/v3/media/save — загрузка по URL

**URL:** `https://content-api.wildberries.ru/content/v3/media/save`

**Заголовки:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Формат тела запроса:**
```json
{
  "nmID": 12345678,
  "data": [
    { "url": "https://example.com/photo1.jpg" },
    { "url": "https://example.com/photo2.jpg" }
  ]
}
```

- `nmID` (number) — ID номенклатуры карточки
- `data` (array) — массив объектов с полем `url` (строка, публичный HTTP/HTTPS URL изображения)

**Требования к URL:**
- Публично доступный HTTP или HTTPS
- Формат изображения: JPG, PNG (рекомендуется вертикальное, мин. 900×1200 px по требованиям WB)
- WebP: WB поддерживает webp (см. [release-notes](https://dev.wildberries.ru/release-notes?id=386) — отзывы возвращают фото в webp)
- WB скачивает изображение по URL на своей стороне

**Альтернативный формат тела:** некоторые источники указывают `mediaFiles` вместо `data`. Реализация пробует оба.

## Текущая реализация (HandySeller)

Файл: `apps/api/src/modules/marketplaces/adapters/wildberries.adapter.ts`

### Основной метод: `uploadMedia()`

```typescript
private async uploadMedia(
  nmId: number,
  images: string[],
  videoUrl?: string,
): Promise<{ success: boolean; uploadedCount: number; errors: string[] }>
```

**Возможности:**
- ✅ Поддержка фото и видео в одном запросе
- ✅ Предварительная проверка доступности URL (HEAD запрос)
- ✅ Batch-загрузка всех файлов одним запросом
- ✅ Retry до 4 раз с интервалом 3 сек
- ✅ Структурированный результат с ошибками

### Валидация URL

```typescript
private async validateMediaUrls(urls: string[]): Promise<string[]>
```

Перед отправкой в WB проверяем каждый URL:
- HEAD запрос с timeout 5 сек
- HTTP 2xx/3xx = доступен
- Недоступные URL пропускаются с логом

### Формат запроса

```json
{
  "nmId": 12345678,
  "data": [
    "https://storage.yandexcloud.net/handyseller-media/users/.../photo1.jpg",
    "https://storage.yandexcloud.net/handyseller-media/users/.../photo2.jpg",
    "https://storage.yandexcloud.net/handyseller-media/users/.../video.mp4"
  ]
}
```

> **Важно:** `data` — массив строк URL, не объектов! Проверено 09.03.2026.

### Вызов

Метод вызывается в:
- `uploadFromCanonical()` — при создании карточки
- `updateProduct()` — при обновлении карточки

### Legacy

```typescript
/** @deprecated Use uploadMedia instead */
private async uploadImages(nmId: number, images: string[]): Promise<void>
```

## POST /content/v3/media/file — прямая загрузка файла

Для загрузки без URL (файл из формы, base64 и т.п.):
- Content-Type: multipart/form-data
- Требуется передать бинарные данные файла

## Хранение медиа в HandySeller

**Yandex Object Storage (S3)** — все изображения хранятся в S3.

| Параметр | Значение |
|----------|----------|
| Endpoint | `https://storage.yandexcloud.net` |
| Bucket | `handyseller-media` |
| Формат URL | `https://storage.yandexcloud.net/handyseller-media/users/{userId}/{uuid}.{ext}` |
| Доступ | Публичный (WB может скачивать) |

## Модель данных

**Product (Prisma):**
```prisma
model Product {
  imageUrl   String?  // Основное фото (URL)
  imageUrls  Json?    // Доп. фото: массив URL (JSON string[])
  videoUrl   String?  // Видео для WB/Ozon (URL)
}
```

**CanonicalProduct:**
```typescript
interface CanonicalProduct {
  images?: { url: string; isMain?: boolean }[];
  video_url?: string;
}
```

## Траблшутинг

| Проблема | Причина | Решение |
|----------|---------|----------|
| "Все URL недоступны" | URL не публичны | Проверьте доступ к S3 bucket |
| HTTP 403 | S3 bucket не публичный | Настройте public read в Yandex Cloud |
| HTTP 429 | Rate limit WB | Увеличьте задержку между запросами |
| nmId не найден | Карточка ещё не создана | Увеличьте задержку после создания |

## Источники

- [WB OpenAPI: работа с товарами](https://dev.wildberries.ru/docs/openapi/work-with-products)
- [Добавление медиа, создание и обновление карточек (форум)](https://dev.wildberries.ru/forum/topics/1971)
- [Инструкция по работе с товарами](https://dev.wildberries.ru/news/101)
- Swagger: https://dev.wildberries.ru/swagger/products
