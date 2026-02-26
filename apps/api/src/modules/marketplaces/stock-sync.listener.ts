import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ProductsService } from '../products/products.service';
import { PRODUCT_SYNC_CHANGED_EVENT, StockChangedPayload } from '../products/products.service';
import { MarketplacesService } from './marketplaces.service';

/**
 * Слушает product.sync.changed и синхронизирует товар (остаток, цена, описание, атрибуты) со всеми маркетплейсами.
 * Событие вызывается при изменении остатка (StockService), цены или любых полей карточки (ProductsService.update).
 * Изменения в HandySeller транслируются на WB, Ozon и др.
 */
@Injectable()
export class StockSyncListener {
  constructor(
    private readonly productsService: ProductsService,
    private readonly marketplacesService: MarketplacesService,
  ) {}

  @OnEvent(PRODUCT_SYNC_CHANGED_EVENT)
  async handleProductSyncChanged(payload: StockChangedPayload) {
    const { userId, productId } = payload;
    try {
      const product = await this.productsService.findById(userId, productId);
      if (!product) return;

      const productData = {
        id: product.id,
        name: product.title,
        description: product.description ?? undefined,
        price: Number(product.price),
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
      };

      const results = await this.marketplacesService.syncProducts(userId, [productData]);
      const hasErrors = results.some((r) => !r.success || (r.errors?.length ?? 0) > 0);
      if (hasErrors) {
        console.warn('[StockSyncListener] Авто-синхронизация частично не удалась:', JSON.stringify(results));
      }
    } catch (err) {
      console.error('[StockSyncListener] Ошибка авто-синхронизации с маркетплейсами:', err);
    }
  }
}
