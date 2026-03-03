# Решение проблемы с генерацией штрих-кода Ozon

## Файлы для исправления

Поскольку исходные TypeScript файлы отсутствуют, предоставляю патч для скомпилированных JavaScript файлов.

**ВНИМАНИЕ:** После следующей компиляции TypeScript эти изменения будут перезаписаны! Необходимо также исправить исходные TS файлы.

---

## 1. Патч для `ozon.adapter.js`

### Изменение #1: Удалить вызов устаревшего generateBarcodes

**Файл:** `/home/ubuntu/handyseller-repo/apps/api/dist/src/modules/marketplaces/adapters/ozon.adapter.js`

**Строка:** 361

**БЫЛО:**
```javascript
if (productId) {
    await this.generateBarcodes([String(productId)]);
    await new Promise((r) => setTimeout(r, 5000));
    return String(productId);
}
```

**СТАЛО:**
```javascript
if (productId) {
    // Штрих-код генерируется автоматически при импорте Ozon
    // Ждём немного для обработки
    await new Promise((r) => setTimeout(r, 3000));
    return String(productId);
}
```

### Изменение #2: Превратить generateBarcodes в заглушку

**Файл:** `/home/ubuntu/handyseller-repo/apps/api/dist/src/modules/marketplaces/adapters/ozon.adapter.js`

**Строки:** 806-828

**БЫЛО:**
```javascript
async generateBarcodes(productIds) {
    const ids = productIds
        .map((id) => parseInt(String(id).trim(), 10))
        .filter((n) => !Number.isNaN(n));
    if (ids.length === 0)
        return;
    try {
        const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.API_BASE}/v1/barcode/generate`, { product_id: ids }, {
            headers: {
                'Client-Id': this.config.sellerId ?? '',
                'Api-Key': this.config.apiKey,
                'Content-Type': 'application/json',
            },
        }));
        const errors = data?.errors;
        if (Array.isArray(errors) && errors.length > 0) {
            this.logError(new Error(String(errors[0])), 'generateBarcodes');
        }
    }
    catch (err) {
        this.logError(err, 'generateBarcodes');
    }
}
```

**СТАЛО:**
```javascript
async generateBarcodes(productIds) {
    // Метод устарел: Ozon автоматически генерирует штрих-код при импорте товара
    // Документация: https://docs.ozon.ru/api/seller/#operation/ProductAPI_ProductsImportV3
    this.logger.warn('generateBarcodes() вызван: штрих-код генерируется автоматически через /v3/product/import');
    return Promise.resolve();
}
```

---

## 2. Патч для `marketplaces.service.js`

### Изменение #3: Увеличить количество попыток получения штрих-кода

**Файл:** `/home/ubuntu/handyseller-repo/apps/api/dist/src/modules/marketplaces/marketplaces.service.js`

**Строки:** 928-940

**БЫЛО:**
```javascript
let barcode = null;
for (let attempt = 0; attempt < 4; attempt++) {
    barcode = await adapter.getBarcodeByProductId(ozonProductId ?? '', offerId || undefined);
    if (barcode)
        break;
    if (attempt === 0 && ozonProductId) {
        await adapter.generateBarcodes([ozonProductId]);
        await new Promise((r) => setTimeout(r, 3000));
    }
    else if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 2500));
    }
}
```

**СТАЛО:**
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
- Увеличено с 4 до 6 попыток
- Общее время ожидания: 5 + 4*4 = 21 секунда (было 3 + 2*3 = 9 секунд)
- По данным Ozon, генерация штрих-кода может занимать до 15-20 секунд

---

## 3. Автоматическое применение патча

Создайте файл `/home/ubuntu/handyseller-repo/scripts/fix-ozon-barcode.js`:

```javascript
#!/usr/bin/env node
/**
 * Скрипт для автоматического применения исправления проблемы со штрих-кодами Ozon
 * Запуск: node scripts/fix-ozon-barcode.js
 */

const fs = require('fs');
const path = require('path');

console.log('=== Исправление генерации штрих-кодов Ozon ===\n');

// Пути к файлам
const OZON_ADAPTER_PATH = path.join(__dirname, '../apps/api/dist/src/modules/marketplaces/adapters/ozon.adapter.js');
const MARKETPLACES_SERVICE_PATH = path.join(__dirname, '../apps/api/dist/src/modules/marketplaces/marketplaces.service.js');

let hasChanges = false;

// Исправление #1: generateBarcodes -> заглушка
console.log('Проверка ozon.adapter.js...');
if (fs.existsSync(OZON_ADAPTER_PATH)) {
    let content = fs.readFileSync(OZON_ADAPTER_PATH, 'utf8');
    
    // Проверяем, нужно ли применять патч
    if (content.includes('/v1/barcode/generate')) {
        console.log('  ✓ Найдено устаревшее API /v1/barcode/generate');
        
        // Замена 1: Удалить вызов generateBarcodes в uploadProduct
        const oldUploadCall = `if (productId) {
                    await this.generateBarcodes([String(productId)]);
                    await new Promise((r) => setTimeout(r, 5000));
                    return String(productId);
                }`;
        
        const newUploadCall = `if (productId) {
                    // Штрих-код генерируется автоматически при импорте Ozon
                    // Ждём немного для обработки
                    await new Promise((r) => setTimeout(r, 3000));
                    return String(productId);
                }`;
        
        if (content.includes(oldUploadCall)) {
            content = content.replace(oldUploadCall, newUploadCall);
            console.log('  ✓ Удалён вызов generateBarcodes из uploadProduct');
            hasChanges = true;
        }
        
        // Замена 2: Превратить generateBarcodes в заглушку
        const oldGenerateBarcodes = `async generateBarcodes(productIds) {
        const ids = productIds
            .map((id) => parseInt(String(id).trim(), 10))
            .filter((n) => !Number.isNaN(n));
        if (ids.length === 0)
            return;
        try {
            const { data } = await (0, rxjs_1.firstValueFrom)(this.httpService.post(\`\${this.API_BASE}/v1/barcode/generate\`, { product_id: ids }, {
                headers: {
                    'Client-Id': this.config.sellerId ?? '',
                    'Api-Key': this.config.apiKey,
                    'Content-Type': 'application/json',
                },
            }));
            const errors = data?.errors;
            if (Array.isArray(errors) && errors.length > 0) {
                this.logError(new Error(String(errors[0])), 'generateBarcodes');
            }
        }
        catch (err) {
            this.logError(err, 'generateBarcodes');
        }
    }`;
        
        const newGenerateBarcodes = `async generateBarcodes(productIds) {
        // Метод устарел: Ozon автоматически генерирует штрих-код при импорте товара
        // Документация: https://docs.ozon.ru/api/seller/#operation/ProductAPI_ProductsImportV3
        this.logger.warn('generateBarcodes() вызван: штрих-код генерируется автоматически через /v3/product/import');
        return Promise.resolve();
    }`;
        
        if (content.includes(oldGenerateBarcodes)) {
            content = content.replace(oldGenerateBarcodes, newGenerateBarcodes);
            console.log('  ✓ generateBarcodes превращён в заглушку');
            hasChanges = true;
        }
        
        fs.writeFileSync(OZON_ADAPTER_PATH, content, 'utf8');
        console.log('  ✓ Файл обновлён\n');
    } else {
        console.log('  → Патч уже применён или файл изменён\n');
    }
} else {
    console.error('  ✗ Файл не найден!\n');
}

// Исправление #2: Увеличить попытки получения штрих-кода
console.log('Проверка marketplaces.service.js...');
if (fs.existsSync(MARKETPLACES_SERVICE_PATH)) {
    let content = fs.readFileSync(MARKETPLACES_SERVICE_PATH, 'utf8');
    
    const oldRetryLoop = `let barcode = null;
        for (let attempt = 0; attempt < 4; attempt++) {
            barcode = await adapter.getBarcodeByProductId(ozonProductId ?? '', offerId || undefined);
            if (barcode)
                break;
            if (attempt === 0 && ozonProductId) {
                await adapter.generateBarcodes([ozonProductId]);
                await new Promise((r) => setTimeout(r, 3000));
            }
            else if (attempt < 3) {
                await new Promise((r) => setTimeout(r, 2500));
            }
        }`;
    
    const newRetryLoop = `let barcode = null;
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
        }`;
    
    if (content.includes(oldRetryLoop)) {
        content = content.replace(oldRetryLoop, newRetryLoop);
        console.log('  ✓ Увеличено количество попыток получения штрих-кода (4→6)');
        console.log('  ✓ Удалён вызов generateBarcodes из цикла');
        console.log('  ✓ Увеличены таймауты (3000→5000, 2500→4000)');
        fs.writeFileSync(MARKETPLACES_SERVICE_PATH, content, 'utf8');
        console.log('  ✓ Файл обновлён\n');
        hasChanges = true;
    } else {
        console.log('  → Патч уже применён или файл изменён\n');
    }
} else {
    console.error('  ✗ Файл не найден!\n');
}

if (hasChanges) {
    console.log('✅ Исправления успешно применены!');
    console.log('\n⚠️  ВНИМАНИЕ: Эти изменения будут потеряны при следующей компиляции TypeScript!');
    console.log('Необходимо найти и исправить исходные .ts файлы.\n');
    
    console.log('📝 Следующие шаги:');
    console.log('1. Перезапустить backend: pm2 restart handyseller-api');
    console.log('2. Протестировать выгрузку товара на Ozon');
    console.log('3. Проверить, что поле "Штрих-код Ozon" заполняется через 10-20 секунд');
    console.log('4. Найти исходные .ts файлы и применить аналогичные изменения\n');
} else {
    console.log('ℹ️  Изменений не внесено (файлы уже исправлены или не найдены)\n');
}

console.log('📋 Документация:');
console.log('- docs/OZON-BARCODE-GENERATION-ISSUE.md - полный анализ проблемы');
console.log('- docs/OZON-FIELDS-ANALYSIS.md - требования к полям Ozon');
console.log('- docs/OZON-FLOW.md - процесс выгрузки товаров\n');
```

---

## 4. Инструкция по применению

### Быстрое решение (5 минут)

```bash
cd /home/ubuntu/handyseller-repo
node scripts/fix-ozon-barcode.js
pm2 restart handyseller-api
```

### Проверка результата

1. Откройте товар в приложении: https://app.handyseller.ru/dashboard/products/[ID]
2. Нажмите "Загрузить в Ozon"
3. Подождите 10-20 секунд
4. Обновите страницу
5. **Ожидается:** Поле "Штрих-код Ozon" должно заполниться (формат OZxxxxxxxxx)

### Логи для проверки

```bash
# Проверка логов на ошибки
tail -f /var/log/handyseller/api.log | grep -i "ozon\|barcode"

# Ожидается предупреждение вместо ошибки:
# [WARN] generateBarcodes() вызван: штрих-код генерируется автоматически через /v3/product/import
```

---

## 5. Поиск исходных TypeScript файлов

Если файлы были скомпилированы, найдите оригиналы:

```bash
# Поиск по всем директориям
find /home/ubuntu -name "ozon.adapter.ts" 2>/dev/null

# Проверка возможных мест
ls -la /home/ubuntu/handyseller-repo/apps/api/src/modules/marketplaces/adapters/
ls -la /home/ubuntu/handyseller-repo/packages/*/src/marketplaces/
```

Если файлы не найдены, возможно они:
- В отдельном репозитории
- Были удалены
- Компилируются на лету через `ts-node`

В этом случае обратитесь к разработчику, который развёртывал приложение.

---

## 6. Долгосрочное решение

После применения быстрого исправления:

1. **Найти исходные .ts файлы**
2. **Применить аналогичные изменения**
3. **Пересобрать проект:**
   ```bash
   cd /home/ubuntu/handyseller-repo/apps/api
   npm run build
   ```
4. **Закоммитить изменения:**
   ```bash
   git add apps/api/src/modules/marketplaces/adapters/ozon.adapter.ts
   git commit -m "fix: удалить устаревший API /v1/barcode/generate (Ozon)"
   git push
   ```

---

**Контакты:** При возникновении вопросов обращайтесь к документации Ozon API или в поддержку Ozon для продавцов.
