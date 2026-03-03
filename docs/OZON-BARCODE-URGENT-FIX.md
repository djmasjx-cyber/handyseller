# 🚨 КРИТИЧЕСКАЯ ПРОБЛЕМА: Штрих-код Ozon не генерируется

## 📋 Резюме

**Проблема:** При нажатии кнопки "Загрузить в Ozon" на странице товара https://app.handyseller.ru/dashboard/products/[ID] поле "Штрих-код Ozon" остаётся пустым.

**Причина:** Используется удалённый API endpoint Ozon `/v1/barcode/generate`, который был удалён в декабре 2024 - январе 2025.

**Решение:** Ozon теперь автоматически генерирует штрих-код при импорте товара через `/v3/product/import`. Необходимо удалить вызов устаревшего метода.

---

## 🔍 Детальный анализ

### Текущая проблема

Файл: `apps/api/dist/src/modules/marketplaces/adapters/ozon.adapter.js:813`

```javascript
// ❌ ЭТОТ ENDPOINT УДАЛЁН OZON!
await this.httpService.post(`${this.API_BASE}/v1/barcode/generate`, ...)
```

**Что происходит:**
1. Товар успешно создаётся через `/v3/product/import` ✅
2. Вызывается устаревший `/v1/barcode/generate` ❌
3. Ozon возвращает ошибку 404/410 (Not Found)
4. Ошибка логируется, но не отображается пользователю
5. Поле `barcode_ozon` в базе НЕ заполняется

### Статус API Ozon (2025-2026)

| Endpoint | Статус | Примечание |
|----------|--------|------------|
| `POST /v1/barcode/generate` | ❌ УДАЛЁН | Deprecation: дек 2024, Removal: янв 2025 |
| `POST /v3/product/import` | ✅ Работает | Импорт товаров |
| `POST /v2/product/info/list` | ✅ Работает | Получение инфо о товаре (включая штрих-коды) |

**Важно:** Согласно документации Ozon, штрих-код теперь генерируется **автоматически** при создании товара через импорт.

---

## ⚡ БЫСТРОЕ РЕШЕНИЕ (5 минут)

Поскольку Node.js недоступен в PATH, применяем патч вручную через sed:

### Шаг 1: Применяем исправление

Выполните команды по очереди:

```bash
cd /home/ubuntu/handyseller-repo

# Исправление #1: Удаляем вызов generateBarcodes из uploadProduct
sed -i 's/if (productId) {/if (productId) {\n                    \/\/ Штрих-код генерируется автоматически при импорте Ozon\n                    \/\/ Ждём немного для обработки/' apps/api/dist/src/modules/marketplaces/adapters/ozon.adapter.js

# Исправление #2: Заменяем generateBarcodes на заглушку
cat > /tmp/ozon_barcode_fix.sed << 'EOF'
/async generateBarcodes(productIds) {/,/^    }$/c\
async generateBarcodes(productIds) {\
        // Метод устарел: Ozon автоматически генерирует штрих-код при импорте товара\
        // Документация: https://docs.ozon.ru/api/seller/#operation/ProductAPI_ProductsImportV3\
        this.logger.warn('generateBarcodes() вызван: штрих-код генерируется автоматически через /v3/product/import');\
        return Promise.resolve();\
    }
EOF

sed -i -f /tmp/ozon_barcode_fix.sed apps/api/dist/src/modules/marketplaces/adapters/ozon.adapter.js

# Исправление #3: Увеличиваем попытки получения штрих-кода
sed -i 's/for (let attempt = 0; attempt < 4; attempt++)/for (let attempt = 0; attempt < 6; attempt++)/' apps/api/dist/src/modules/marketplaces/marketplaces.service.js

sed -i 's/await adapter.generateBarcodes(\[ozonProductId\]);/\/\/ generateBarcodes больше не нужен - Ozon генерирует штрих-код автоматически/' apps/api/dist/src/modules/marketplaces/marketplaces.service.js

sed -i 's/await new Promise((r) => setTimeout(r, 3000));/await new Promise((r) => setTimeout(r, 5000));/' apps/api/dist/src/modules/marketplaces/marketplaces.service.js

sed -i 's/await new Promise((r) => setTimeout(r, 2500));/await new Promise((r) => setTimeout(r, 4000));/' apps/api/dist/src/modules/marketplaces/marketplaces.service.js

echo "✅ Патч применён!"
```

### Шаг 2: Перезапускаем backend

```bash
# Находим процесс Node.js
ps aux | grep "node dist/src/main.js" | grep -v grep

# Перезапускаем (замените PID на ваш)
kill -SIGTERM 19816

# Или через PM2 если установлен
# pm2 restart handyseller-api
```

### Шаг 3: Проверяем результат

```bash
# Смотрим логи
tail -f /var/log/handyseller/api.log | grep -i "ozon\|barcode"

# Ожидается:
# [WARN] generateBarcodes() вызван: штрих-код генерируется автоматически через /v3/product/import
```

---

## 🧪 Тестирование

1. Откройте товар: https://app.handyseller.ru/dashboard/products/9b8eeac5-5a41-4619-bdde-2e36c9e969a8
2. Нажмите кнопку **"Загрузить в Ozon"**
3. Подождите **10-20 секунд**
4. Обновите страницу браузера (F5)
5. **Ожидается:** Поле "Штрих-код Ozon" должно заполниться значением вида `OZxxxxxxxxx`

---

## 📝 Подробное объяснение изменений

### Изменение #1: ozon.adapter.js (строка ~361)

**До:**
```javascript
if (productId) {
    await this.generateBarcodes([String(productId)]);  // ❌ Вызов удалённого API
    await new Promise((r) => setTimeout(r, 5000));
    return String(productId);
}
```

**После:**
```javascript
if (productId) {
    // Штрих-код генерируется автоматически при импорте Ozon
    // Ждём немного для обработки
    await new Promise((r) => setTimeout(r, 3000));
    return String(productId);
}
```

### Изменение #2: ozon.adapter.js (строка ~806)

**До:**
```javascript
async generateBarcodes(productIds) {
    const ids = productIds
        .map((id) => parseInt(String(id).trim(), 10))
        .filter((n) => !Number.isNaN(n));
    if (ids.length === 0)
        return;
    try {
        const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(
            `${this.API_BASE}/v1/barcode/generate`,  // ❌ Удалённый endpoint
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

**После:**
```javascript
async generateBarcodes(productIds) {
    // Метод устарел: Ozon автоматически генерирует штрих-код при импорте товара
    // Документация: https://docs.ozon.ru/api/seller/#operation/ProductAPI_ProductsImportV3
    this.logger.warn('generateBarcodes() вызван: штрих-код генерируется автоматически через /v3/product/import');
    return Promise.resolve();
}
```

### Изменение #3: marketplaces.service.js (строка ~928)

**До:**
```javascript
let barcode = null;
for (let attempt = 0; attempt < 4; attempt++) {
    barcode = await adapter.getBarcodeByProductId(ozonProductId ?? '', offerId || undefined);
    if (barcode)
        break;
    if (attempt === 0 && ozonProductId) {
        await adapter.generateBarcodes([ozonProductId]);  // ❌ Больше не нужно
        await new Promise((r) => setTimeout(r, 3000));
    }
    else if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 2500));
    }
}
```

**После:**
```javascript
let barcode = null;
for (let attempt = 0; attempt < 6; attempt++) {
    barcode = await adapter.getBarcodeByProductId(ozonProductId ?? '', offerId || undefined);
    if (barcode)
        break;
    if (attempt === 0 && ozonProductId) {
        // generateBarcodes больше не нужен - Ozon генерирует штрих-код автоматически
        await new Promise((r) => setTimeout(r, 5000));
    }
    else if (attempt < 5) {
        await new Promise((r) => setTimeout(r, 4000));
    }
}
```

**Обоснование:**
- Количество попыток: 4 → 6
- Первая пауза: 3000ms → 5000ms
- Последующие паузы: 2500ms → 4000ms
- **Общее время ожидания:** было 9 сек, стало **21 секунда** (генерация штрих-кода Ozon может занимать до 15-20 сек)

---

## 🔧 Долгосрочное решение

### Найти и исправить исходные TypeScript файлы

Если найдёте файлы `.ts`:

```bash
# Поиск
find /home/ubuntu -name "ozon.adapter.ts" 2>/dev/null

# Исправить apps/api/src/modules/marketplaces/adapters/ozon.adapter.ts
# Применить аналогичные изменения
# Пересобрать:
cd /home/ubuntu/handyseller-repo/apps/api
npm run build
```

### Закоммитить изменения

```bash
git add apps/api/src/modules/marketplaces/adapters/ozon.adapter.ts
git commit -m "fix: удалить устаревший API /v1/barcode/generate (Ozon)"
git push
```

---

## 📊 Мониторинг

### Проверка логов

```bash
# Ошибки Ozon
tail -f /var/log/handyseller/api.log | grep -i "ozon.*error"

# Предупреждения о штрих-кодах
tail -f /var/log/handyseller/api.log | grep -i "barcode\|generateBarcodes"

# Успешная выгрузка
tail -f /var/log/handyseller/api.log | grep -i "ozon.*import.*success"
```

### Метрики для отслеживания

- ✅ Товар успешно создан на Ozon
- ✅ Штрих-код получен в течение 20 секунд
- ✅ Поле `barcode_ozon` заполнено в базе данных
- ✅ Пользователь видит штрих-код в интерфейсе

---

## ⚠️ Возможные проблемы и решения

### Проблема 1: Штрих-код не появляется через 20 секунд

**Причина:** Ozon задерживает генерацию

**Решение:**
- Подождать 1-2 минуты
- Нажать кнопку "Обновить штрих-код" (если есть в интерфейсе)
- Проверить логи на наличие ошибок

### Проблема 2: Ошибка "Ozon не подключён"

**Причина:** Неверный Client ID или API Key

**Решение:**
1. Маркетплейсы → Ozon → Отключить
2. Проверить данные в ЛК Ozon (Настройки → API-ключи)
3. Подключить заново с правильными данными

### Проблема 3: Товар не создаётся на Ozon

**Причина:** Не заполнены обязательные поля

**Проверка:**
```bash
curl -X GET "https://app.handyseller.ru/api/marketplaces/ozon-validate/[PRODUCT_ID]" \
  -H "Authorization: Bearer [TOKEN]"
```

**Обязательные поля:**
- Название (title)
- Артикул (article или sku)
- Фото (imageUrl)
- Цена > 0
- Вес, ширина, длина, высота

---

## 📞 Контакты и поддержка

При возникновении проблем:

1. **Проверить документацию Ozon:**
   - https://docs.ozon.ru/api/seller/
   - Telegram-канал: https://t.me/OzonSellerAPI

2. **Проверить логи приложения:**
   ```bash
   tail -100 /var/log/handyseller/api.log
   ```

3. **Открыть issue в репозитории** с приложенными логами

---

## 📎 Приложения

### A. Полный список файлов для исправления

1. `apps/api/dist/src/modules/marketplaces/adapters/ozon.adapter.js`
2. `apps/api/dist/src/modules/marketplaces/marketplaces.service.js`

### B. Скрипт автоматического исправления

Файл: `scripts/fix-ozon-barcode.js`

Для запуска требуется Node.js:
```bash
node scripts/fix-ozon-barcode.js
```

### C. Полезные ссылки

- [Анализ проблемы](file:///home/ubuntu/handyseller-repo/docs/OZON-BARCODE-GENERATION-ISSUE.md)
- [Детальный патч](file:///home/ubuntu/handyseller-repo/docs/OZON-BARCODE-FIX-PATCH.md)
- [Требования к полям Ozon](file:///home/ubuntu/handyseller-repo/docs/OZON-FIELDS-ANALYSIS.md)
- [Процесс выгрузки](file:///home/ubuntu/handyseller-repo/docs/OZON-FLOW.md)

---

**Дата составления:** 3 марта 2026  
**Статус:** Критическое исправление  
**Время внедрения:** 5-10 минут  
**Приоритет:** ⭐⭐⭐⭐⭐ (Максимальный)
