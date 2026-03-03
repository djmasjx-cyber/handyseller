#!/usr/bin/env node
/**
 * DEPRECATED: Исправления перенесены в исходники (ozon.adapter.ts, marketplaces.service.ts).
 * Не используйте — при сборке через GH изменения в dist будут перезаписаны.
 *
 * Скрипт для автоматического применения исправления проблемы со штрих-кодами Ozon
 * Запуск: cd /home/ubuntu/handyseller-repo && node scripts/fix-ozon-barcode.js
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
        } else {
            console.log('  → Вызов generateBarcodes не найден (уже удалён?)');
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
        } else {
            console.log('  → Метод generateBarcodes уже изменён');
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
    
    console.log('🧪 Тестирование:');
    console.log('   URL: https://app.handyseller.ru/dashboard/products/[ID]');
    console.log('   Действие: Нажать "Загрузить в Ozon"');
    console.log('   Ожидание: Через 10-20 сек поле "Штрих-код Ozon" должно заполниться\n');
    
    console.log('📋 Логи для проверки:');
    console.log('   tail -f /var/log/handyseller/api.log | grep -i "ozon\\|barcode"\n');
} else {
    console.log('ℹ️  Изменений не внесено (файлы уже исправлены или не найдены)\n');
}

console.log('📚 Документация:');
console.log('   - docs/OZON-BARCODE-GENERATION-ISSUE.md - полный анализ проблемы');
console.log('   - docs/OZON-BARCODE-FIX-PATCH.md - подробная инструкция');
console.log('   - docs/OZON-FIELDS-ANALYSIS.md - требования к полям Ozon');
console.log('   - docs/OZON-FLOW.md - процесс выгрузки товаров\n');
