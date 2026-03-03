#!/bin/bash
# DEPRECATED: Исправления перенесены в исходники (ozon.adapter.ts, marketplaces.service.ts).
# Не используйте — при сборке через GH изменения в dist будут перезаписаны.
#
# Скрипт для применения исправления проблемы со штрих-кодами Ozon
# Запуск: bash /home/ubuntu/handyseller-repo/scripts/apply-ozon-barcode-fix.sh

set -e

echo "=== Исправление генерации штрих-кодов Ozon ==="
echo ""

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
API_DIR="$REPO_DIR/apps/api/dist/src/modules/marketplaces"

OZON_ADAPTER="$API_DIR/adapters/ozon.adapter.js"
MARKETPLACES_SERVICE="$API_DIR/marketplaces.service.js"

HAS_CHANGES=false

# Проверка существования файлов
if [ ! -f "$OZON_ADAPTER" ]; then
    echo "❌ Файл не найден: $OZON_ADAPTER"
    exit 1
fi

if [ ! -f "$MARKETPLACES_SERVICE" ]; then
    echo "❌ Файл не найден: $MARKETPLACES_SERVICE"
    exit 1
fi

echo "✓ Файлы найдены"
echo ""

# Исправление #1: Удаляем вызов generateBarcodes из uploadProduct
echo "Применение исправления #1: ozon.adapter.js (вызов generateBarcodes)..."

if grep -q "await this.generateBarcodes(\[String(productId)\])" "$OZON_ADAPTER"; then
    # Создаём временный файл с исправлением
    cat > /tmp/ozon_upload_fix.sed << 'SED_EOF'
/if (productId) {/,/return String(productId);/{
    s/if (productId) {/if (productId) {\n                    \/\/ Штрих-код генерируется автоматически при импорте Ozon\n                    \/\/ Ждём немного для обработки/
    s/await this.generateBarcodes(\[String(productId)\]);/\/\/ Удалено: generateBarcodes устарел/
    s/await new Promise((r) => setTimeout(r, 5000));/await new Promise((r) => setTimeout(r, 3000));/
}
SED_EOF
    
    sed -i -f /tmp/ozon_upload_fix.sed "$OZON_ADAPTER"
    echo "  ✓ Вызов generateBarcodes удалён из uploadProduct"
    HAS_CHANGES=true
else
    echo "  → Вызов уже удалён или изменён"
fi

echo ""

# Исправление #2: Заменяем generateBarcodes на заглушку
echo "Применение исправления #2: ozon.adapter.js (метод generateBarcodes)..."

if grep -q "/v1/barcode/generate" "$OZON_ADAPTER"; then
    # Находим начало и конец метода generateBarcodes
    START_LINE=$(grep -n "async generateBarcodes(productIds)" "$OZON_ADAPTER" | cut -d: -f1)
    
    if [ -n "$START_LINE" ]; then
        # Находим закрывающую скобку метода (простая эвристика)
        END_LINE=$(tail -n +$START_LINE "$OZON_ADAPTER" | grep -n "^    }$" | head -1 | cut -d: -f1)
        END_LINE=$((START_LINE + END_LINE - 1))
        
        # Создаём новый метод-заглушку
        cat > /tmp/new_generate_barcodes.txt << 'METHOD_EOF'
    async generateBarcodes(productIds) {
        // Метод устарел: Ozon автоматически генерирует штрих-код при импорте товара
        // Документация: https://docs.ozon.ru/api/seller/#operation/ProductAPI_ProductsImportV3
        this.logger.warn('generateBarcodes() вызван: штрих-код генерируется автоматически через /v3/product/import');
        return Promise.resolve();
    }
METHOD_EOF
        
        # Заменяем старый метод на новый
        head -n $((START_LINE - 1)) "$OZON_ADAPTER" > /tmp/ozon_adapter_new.js
        cat /tmp/new_generate_barcodes.txt >> /tmp/ozon_adapter_new.js
        tail -n +$((END_LINE + 1)) "$OZON_ADAPTER" >> /tmp/ozon_adapter_new.js
        mv /tmp/ozon_adapter_new.js "$OZON_ADAPTER"
        
        echo "  ✓ Метод generateBarcodes заменён на заглушку"
        HAS_CHANGES=true
    else
        echo "  → Метод уже изменён"
    fi
else
    echo "  → Endpoint /v1/barcode/generate уже удалён"
fi

echo ""

# Исправление #3: Увеличиваем попытки получения штрих-кода
echo "Применение исправления #3: marketplaces.service.js (цикл получения штрих-кода)..."

if grep -q "for (let attempt = 0; attempt < 4; attempt++)" "$MARKETPLACES_SERVICE"; then
    sed -i 's/for (let attempt = 0; attempt < 4; attempt++)/for (let attempt = 0; attempt < 6; attempt++)/' "$MARKETPLACES_SERVICE"
    echo "  ✓ Количество попыток увеличено (4→6)"
    HAS_CHANGES=true
fi

if grep -q "await adapter.generateBarcodes(\[ozonProductId\])" "$MARKETPLACES_SERVICE"; then
    sed -i 's/await adapter.generateBarcodes(\[ozonProductId\]);/\/\/ generateBarcodes больше не нужен - Ozon генерирует штрих-код автоматически/' "$MARKETPLACES_SERVICE"
    echo "  ✓ Вызов generateBarcodes удалён из цикла"
    HAS_CHANGES=true
fi

if grep -q "await new Promise((r) => setTimeout(r, 3000));" "$MARKETPLACES_SERVICE"; then
    sed -i 's/await new Promise((r) => setTimeout(r, 3000));/await new Promise((r) => setTimeout(r, 5000));/' "$MARKETPLACES_SERVICE"
    echo "  ✓ Первая пауза увеличена (3000→5000)"
    HAS_CHANGES=true
fi

if grep -q "await new Promise((r) => setTimeout(r, 2500));" "$MARKETPLACES_SERVICE"; then
    sed -i 's/await new Promise((r) => setTimeout(r, 2500));/await new Promise((r) => setTimeout(r, 4000));/' "$MARKETPLACES_SERVICE"
    echo "  ✓ Последующие паузы увеличены (2500→4000)"
    HAS_CHANGES=true
fi

echo ""

# Итоговый отчёт
if [ "$HAS_CHANGES" = true ]; then
    echo "✅ Исправления успешно применены!"
    echo ""
    echo "⚠️  ВНИМАНИЕ: Теперь нужно перезапустить backend:"
    echo ""
    echo "   # Найти процесс"
    echo "   ps aux | grep 'node dist/src/main.js'"
    echo ""
    echo "   # Перезапустить (замените PID на ваш)"
    echo "   kill -SIGTERM <PID>"
    echo ""
    echo "   # Или через PM2 если установлен"
    echo "   pm2 restart handyseller-api"
    echo ""
    echo "📝 Следующие шаги:"
    echo "1. Перезапустить backend (см. выше)"
    echo "2. Протестировать выгрузку товара на Ozon"
    echo "3. Проверить, что поле \"Штрих-код Ozon\" заполняется через 10-20 секунд"
    echo ""
    echo "🧪 Тестирование:"
    echo "   URL: https://app.handyseller.ru/dashboard/products/[ID]"
    echo "   Действие: Нажать \"Загрузить в Ozon\""
    echo "   Ожидание: Через 10-20 сек поле \"Штрих-код Ozon\" должно заполниться"
    echo ""
    echo "📋 Логи для проверки:"
    echo "   tail -f /var/log/handyseller/api.log | grep -i 'ozon\\|barcode'"
    echo ""
else
    echo "ℹ️  Изменений не внесено (файлы уже исправлены)"
    echo ""
fi

echo "📚 Документация:"
echo "   - docs/OZON-BARCODE-URGENT-FIX.md - краткая инструкция"
echo "   - docs/OZON-BARCODE-GENERATION-ISSUE.md - полный анализ проблемы"
echo "   - docs/OZON-BARCODE-FIX-PATCH.md - подробный патч"
echo "   - docs/OZON-FIELDS-ANALYSIS.md - требования к полям Ozon"
echo ""

echo "=== Готово ==="
