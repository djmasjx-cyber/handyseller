import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ProductsService } from '../products/products.service';
import { PRODUCT_SYNC_CHANGED_EVENT, StockChangedPayload } from '../products/products.service';
import { MarketplacesService } from './marketplaces.service';
import { ProductMappingService } from './product-mapping.service';

/**
 * Слушает product.sync.changed и синхронизирует товар ТОЛЬКО на маркетплейсы, где он уже выгружен.
 * Событие вызывается при изменении остатка (StockService), цены или любых полей карточки (ProductsService.update).
 * 
 * ВАЖНО: Авто-синхронизация НЕ создаёт новые карточки — только обновляет существующие.
 * Для создания карточки используйте кнопку "Выгрузить на WB/Ozon" в карточке товара.
 */
@Injectable()
export class StockSyncListener {
  constructor(
    private readonly productsService: ProductsService,
    private readonly marketplacesService: MarketplacesService,
    private readonly productMappingService: ProductMappingService,
  ) {}

  @OnEvent(PRODUCT_SYNC_CHANGED_EVENT)
  async handleProductSyncChanged(payload: StockChangedPayload) {
    const { userId, productId } = payload;
    try {
      const product = await this.productsService.findById(userId, productId);
      if (!product) return;

      // Получаем маппинги — на какие маркетплейсы товар уже выгружен
      const mappings = await this.productMappingService.getMappingsForProduct(productId, userId);
      if (!mappings || mappings.length === 0) {
        // Товар ещё не выгружен ни на один маркетплейс — пропускаем авто-синхронизацию
        return;
      }

      const productData = {
        id: product.id,
        name: product.title,
        description: product.description ?? undefined,
        stock: product.stock,
        images: product.imageUrl ? [product.imageUrl] : [],
        sku: product.sku ?? undefined,
        vendorCode: (product.article ?? product.sku ?? '').toString().trim() || undefined,
        brand: product.brand ?? undefined,
        weight: product.weight ?? undefined,
        width: product.width ?? undefined,
        length: product.length ?? undefined,
        height: product.height ?? undefined,
        color: product.color ?? undefined,
        material: product.material ?? undefined,
        craftType: product.craftType ?? undefined,
        countryOfOrigin: product.countryOfOrigin ?? undefined,
        packageContents: product.packageContents ?? undefined,
        richContent: product.richContent ?? undefined,
        itemsPerPack: product.itemsPerPack ?? undefined,
        ozonCategoryId: product.ozonCategoryId ?? undefined,
        ozonTypeId: product.ozonTypeId ?? undefined,
        barcodeOzon: product.barcodeOzon ?? undefined,
        barcode: product.barcodeOzon ?? product.barcodeWb ?? undefined,
        // Передаём externalId для корректного обновления (не создания)
        wbNmId: mappings.find((m) => m.marketplace === 'WILDBERRIES')?.externalSystemId
          ? parseInt(mappings.find((m) => m.marketplace === 'WILDBERRIES')!.externalSystemId, 10)
          : undefined,
        ozonProductId: mappings.find((m) => m.marketplace === 'OZON')?.externalSystemId,
      };

      // Синхронизируем на каждый маркетплейс ОТДЕЛЬНО (только где есть маппинг)
      for (const mapping of mappings) {
        const mp = mapping.marketplace as 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO';
        if (!['WILDBERRIES', 'OZON', 'YANDEX', 'AVITO'].includes(mp)) continue;

        try {
          const results = await this.marketplacesService.syncProducts(userId, [productData], mp);
          const hasErrors = results.some((r) => !r.success || (r.errors?.length ?? 0) > 0);
          if (hasErrors) {
            console.warn(`[StockSyncListener] Авто-синхронизация на ${mp} частично не удалась:`, JSON.stringify(results));
          }
        } catch (mpErr) {
          console.error(`[StockSyncListener] Ошибка авто-синхронизации на ${mp}:`, mpErr);
        }
      }
    } catch (err) {
      console.error('[StockSyncListener] Ошибка авто-синхронизации с маркетплейсами:', err);
    }
  }
}
