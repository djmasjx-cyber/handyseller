# Wildberries API: загрузка фото в карточку товара

## Общие правила

1. **Фото при создании:** WB API не принимает фото при создании карточки. Последовательность:
   - Создать карточку → получить nmID;
   - Подождать 3 сек (WB обрабатывает асинхронно);
   - Вызвать media/save с URL фото;
   - При ошибке — повтор до 4 раз с интервалом 3 сек.
2. **Нужен nmID** — идентификатор номенклатуры, который WB возвращает после создания карточки.

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
- WB скачивает изображение по URL на своей стороне

## Текущая реализация (HandySeller)

Файл: `apps/api/src/modules/marketplaces/adapters/wildberries.adapter.ts`

- Метод `uploadImages(nmId, images: string[])` — отправляет фото по одному в цикле с задержкой 500 мс (rate limit)
- Формат: `{ nmID: nmId, data: [{ url }] }` — по одному URL за запрос
- Вызывается после `uploadFromCanonical` при успешном создании карточки

## Альтернатива: batch-загрузка

Можно попробовать отправить все URL одним запросом:
```json
{
  "nmID": 12345678,
  "data": [
    { "url": "https://..." },
    { "url": "https://..." }
  ]
}
```
Если WB поддерживает массив из нескольких URL — это сократит число запросов.

## POST /content/v3/media/file — прямая загрузка файла

Для загрузки без URL (файл из формы, base64 и т.п.):
- Content-Type: multipart/form-data
- Требуется передать бинарные данные файла

## Источники

- [WB OpenAPI: работа с товарами](https://dev.wildberries.ru/docs/openapi/work-with-products)
- [Добавление медиа, создание и обновление карточек (форум)](https://dev.wildberries.ru/forum/topics/1971)
- Swagger: https://openapi.wildberries.ru/content/swagger/api/en/swagger.yaml (при доступности)
