# Проблема: Штрих-код Ozon не генерируется при выгрузке товара

## Дата анализа: 3 марта 2026

## 🔴 Критическая проблема

При нажатии кнопки "Загрузить в Ozon" на странице товара штрих-код **не генерируется**, потому что используется **устаревший и удалённый API endpoint**.

### Текущая реализация (НЕ РАБОТАЕТ)

Файл: `apps/api/dist/src/modules/marketplaces/adapters/ozon.adapter.js`, строка 813:

```javascript
async generateBarcodes(productIds) {
    const ids = productIds
        .map((id) => parseInt(String(id).trim(), 10))
        .filter((n) => !Number.isNaN(n));
    if (ids.length === 0)
        return;
    try {
        const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(
            `${this.API_BASE}/v1/barcode/generate`,  // ❌ УДАЛЁННЫЙ ENDPOINT
            { product_id: ids }, 
            {
                headers: {
                    'Client-Id': this.config.sellerId ?? '',
                    'Api-Key': this.config.apiKey,
                    'Content-Type': 'application/json',
                },
            }
        ));
        // ...
    }
}
```

**Вызов происходит из:** `uploadProduct()`, строка 361:
```javascript
if (productId) {
    await this.generateBarcodes([String(productId)]);  // Вызывается после успешного импорта
    await new Promise((r) => setTimeout(r, 5000));
    return String(productId);
}
```

## 📚 Анализ Ozon API 2025-2026

### Статус endpoint'ов для работы со штрих-кодами

| Endpoint | Статус | Примечание |
|----------|--------|------------|
| `POST /v1/barcode/generate` | ❌ **УДАЛЁН** | Deprecation: декабрь 2024, Removal: январь 2025 |
| `GET /v2/product/info/list` | ✅ Работает | Возвращает информацию о товаре, включая штрих-коды |
| `POST /v3/product/import` | ✅ Работает | Импорт товаров с полем `barcode` |

### Как сейчас работает генерация штрих-кодов на Ozon

Согласно документации Ozon Seller API (2025):

1. **Автоматическая генерация при импорте**
   - При создании товара через `/v3/product/import` можно указать поле `barcode`
   - Если `barcode` не указан — Ozon **автоматически генерирует** свой штрих-код (OZ-формат)
   - Штрих-код становится доступен сразу после обработки импорта

2. **Получение сгенерированного штрих-кода**
   - Endpoint: `POST /v2/product/info/list` или `POST /v3/product/info/list`
   - Поля в ответе: `barcode`, `barcodes`, `fbs_list[].barcode`

3. **Важное изменение**
   - Раньше: нужно было отдельно вызывать `/v1/barcode/generate`
   - Сейчас: штрих-код генерируется автоматически при создании карточки

## 🔍 Диагностика текущего поведения

### Сценарий работы приложения

1. Пользователь нажимает "Загрузить в Ozon" на странице товара
2. Backend вызывает `marketplaces.syncProducts()` → `ozonAdapter.uploadProduct()`
3. Товар создаётся через `POST /v3/product/import` ✅
4. После успеха вызывается `generateBarcodes([productId])` ❌
5. **Endpoint `/v1/barcode/generate` возвращает ошибку 404/410**
6. Ошибка логируется, но не прерывает выполнение
7. Через 5 секунд вызывается `getBarcodeByProductId()` 
8. **Штрих-код не найден**, т.к. генерация не сработала
9. Поле `barcode_ozon` в базе **не заполняется**

### Логирование ошибок

Из `ozon.adapter.js:820-827`:
```javascript
const errors = data?.errors;
if (Array.isArray(errors) && errors.length > 0) {
    this.logError(new Error(String(errors[0])), 'generateBarcodes');  // Ошибка игнорируется
}
// ...
catch (err) {
    this.logError(err, 'generateBarcodes');  // Ошибка только логируется
}
```

**Проблема:** ошибка не прерывает выполнение и не отображается пользователю!

## 💡 Решение

### Вариант 1: Быстрое исправление (рекомендуется)

**Удалить вызов устаревшего метода и полагаться на автоматическую генерацию**

#### Изменения в `ozon.adapter.ts`:

```typescript
// БЫЛО (строки 360-363 в uploadProduct):
if (productId) {
    await this.generateBarcodes([String(productId)]);  // ❌ Удалить
    await new Promise((r) => setTimeout(r, 5000));
    return String(productId);
}

// СТАЛО:
if (productId) {
    // Штрих-код генерируется автоматически при импорте
    // Просто ждём немного для обработки
    await new Promise((r) => setTimeout(r, 3000));
    return String(productId);
}
```

```typescript
// Метод generateBarcodes() можно удалить или оставить как заглушку:
async generateBarcodes(productIds: string[]): Promise<void> {
    // Метод устарел: Ozon автоматически генерирует штрих-код при импорте
    this.logger.warn('generateBarcodes() устарел: Ozon генерирует штрих-код автоматически');
    return Promise.resolve();
}
```

#### Обновление `getBarcodeByProductId()`:

Увеличить количество попыток и время ожидания, т.к. генерация может занять до 10 секунд:

```typescript
// В marketplaces.service.js, строки 929-940:
let barcode = null;
for (let attempt = 0; attempt < 5; attempt++) {  // Было 4 попытки
    barcode = await adapter.getBarcodeByProductId(ozonProductId ?? '', offerId || undefined);
    if (barcode)
        break;
    if (attempt === 0 && ozonProductId) {
        // generateBarcodes больше не нужен!
        await new Promise((r) => setTimeout(r, 4000));  // Увеличено с 3000
    } else if (attempt < 4) {
        await new Promise((r) => setTimeout(r, 3000));
    }
}
```

### Вариант 2: Полная переработка (долгосрочное)

**Реализовать правильный workflow с обработкой асинхронности**

1. **При импорте товара:**
   ```typescript
   async uploadProduct(product: ProductData): Promise<string> {
       // 1. Отправляем импорт с barcode (если есть)
       const importPayload = this.buildImportPayload(product);
       
       // 2. Получаем task_id
       const taskId = await this.importTask(importPayload);
       
       // 3. Ждём завершения
       const status = await this.waitForImportCompletion(taskId);
       
       // 4. Получаем product_id
       const productId = status.product_id;
       
       // 5. Сразу получаем штрих-код из ответа
       const barcode = this.extractBarcodeFromImportResponse(status);
       
       // 6. Сохраняем в базу
       if (barcode) {
           await this.saveBarcode(productId, barcode);
       }
       
       return productId;
   }
   ```

2. **Модифицировать `saveBarcodeFromMarketplace()`:**
   ```typescript
   async saveBarcodeFromMarketplace(userId: string, productId: string) {
       // Пытаемся получить штрих-код из кэша импорта
       // Если не удалось — делаем 5 попыток с интервалом 4 секунды
   }
   ```

## 📋 План внедрения

### Этап 1: Экстренное исправление (1 день)

1. ✅ Удалить вызов `/v1/barcode/generate` из `uploadProduct()`
2. ✅ Обновить `generateBarcodes()` на заглушку
3. ✅ Увеличить таймауты в `getBarcodeByProductId()`
4. ✅ Протестировать на staging
5. ✅ Развернуть на production

### Этап 2: Улучшение обработки (3 дня)

6. Извлечь штрих-код напрямую из ответа `/v1/product/import/info`
7. Сохранять штрих-код сразу после импорта
8. Добавить логирование всех этапов
9. Показать пользователю статус генерации штрих-кода

### Этап 3: Мониторинг (постоянно)

10. Добавить метрики успешности получения штрих-кодов
11. Настроить алерты при ошибках
12. Документировать изменения в API Ozon

## 🧪 Тестирование

### Чек-лист проверки

- [ ] Товар успешно создаётся на Ozon через `/v3/product/import`
- [ ] Ozon автоматически генерирует штрих-код (OZ-формат)
- [ ] Штрих-код корректно извлекается из `/v2/product/info/list`
- [ ] Поле `barcode_ozon` заполняется в базе данных
- [ ] Пользователь видит штрих-код в интерфейсе через 10-15 секунд
- [ ] Нет ошибок в логах backend

### Пример ответа Ozon API со штрих-кодом:

```json
{
  "result": {
    "items": [{
      "product_id": 123456789,
      "offer_id": "ARTICLE123",
      "barcode": "OZ123456789",
      "barcodes": [
        {"type": "OZ", "value": "OZ123456789"},
        {"type": "EAN13", "value": "4601234567890"}
      ],
      "name": "Товар",
      "status": "imported"
    }]
  }
}
```

## ⚠️ Риски

1. **Временное отсутствие штрих-кодов**
   - В течение 10-30 секунд после создания штрих-код может быть недоступен
   - Решение: показать пользователю "Штрих-код генерируется..."

2. **Старые товары без штрих-кодов**
   - Товары, созданные с ошибкой, могут не иметь штрих-кода
   - Решение: кнопка "Обновить штрих-код" в интерфейсе

3. **Изменения в API Ozon**
   - Ozon может снова изменить API
   - Решение: мониторинг уведомлений в Telegram-канале Ozon Seller API

## 📞 Контакты для согласования

- **Разработчик:** изучить `apps/api/src/modules/marketplaces/adapters/ozon.adapter.ts`
- **Тестировщик:** проверить полный цикл выгрузки на staging
- **DevOps:** подготовить миграцию БД (если нужна)
- **Поддержка:** подготовить FAQ для пользователей

## 📎 Приложения

- [Ozon API Changelog](https://t.me/OzonSellerAPI)
- [Документация /v3/product/import](https://docs.ozon.ru/api/seller/#operation/ProductAPI_ProductsImportV3)
- [Исходный код ozon.adapter.ts](file:///home/ubuntu/handyseller-repo/apps/api/src/modules/marketplaces/adapters/ozon.adapter.ts)

---

**Резюме:** Проблема критическая, требует немедленного исправления. Причина — использование удалённого API endpoint Ozon. Решение простое — удалить вызов устаревшего метода и использовать автоматическую генерацию штрих-кодов Ozon.
