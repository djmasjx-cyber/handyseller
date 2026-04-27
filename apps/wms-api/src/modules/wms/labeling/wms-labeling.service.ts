import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { WmsInventoryUnitRecord } from '@handyseller/wms-sdk';
import { WmsStoreService } from '../storage/wms-store.service';
import { renderUnitShelfLabelsPdf } from '../unit-label-pdf';
import { buildProductScanCandidates } from './scan-identity';

export type PrintLabelForScanResult = { buffer: Buffer; unit: WmsInventoryUnitRecord; source: 'INTERNAL_UNIT' | 'FROM_QUEUE' };

@Injectable()
export class WmsLabelingService {
  constructor(private readonly store: WmsStoreService) {}

  /**
   * Полный сценарий: один скан → строгая развилка: внутренняя единица | очередь RESERVED
   * по сопоставлению товара (GTIN, алиасы, арт., SKU) → PDF этикетки 40×27.
   */
  async printLabelForScan(userId: string, rawScan: string, receiptId?: string | null): Promise<PrintLabelForScanResult> {
    const scan = rawScan.trim();
    if (!scan) {
      throw new BadRequestException({ code: 'EMPTY_SCAN', message: 'Пустой скан.' });
    }
    const lpn = await this.store.findFirstLpnForScanCode(userId, scan);
    if (lpn) {
      throw new BadRequestException({
        code: 'IS_LPN',
        message: 'Скан — штрихкод тары (LPN), а не товара. Используйте заводской или внутренний товар.',
      });
    }
    const loc = await this.store.findLocationByScannedCode(userId, scan);
    if (loc) {
      throw new BadRequestException({
        code: 'IS_LOCATION',
        message: 'Скан соответствует зоне/адресу хранения, а не товару. Используйте EAN/артикул/внутренний ШК единицы.',
      });
    }
    const directUnit = await this.store.findFirstInventoryUnitForScanCode(userId, scan);
    if (directUnit) {
      const item = await this.store.getItemById(userId, directUnit.itemId);
      if (!item) {
        throw new NotFoundException({ code: 'ITEM_GONE', message: 'Товар единицы не найден.' });
      }
      const article = (item.article && item.article.trim()) || item.sku;
      const buffer = await renderUnitShelfLabelsPdf([{ article, title: item.title, barcode: directUnit.barcode }]);
      await this.store.appendEvent(userId, {
        type: 'LABEL_PRINTED',
        unitId: directUnit.id,
        referenceType: 'UNIT',
        referenceId: directUnit.id,
        payload: { source: 'INTERNAL_UNIT', scan },
      });
      return { buffer, unit: directUnit, source: 'INTERNAL_UNIT' };
    }
    const itemId = await this.store.findItemIdByProductScan(userId, scan);
    if (!itemId) {
      throw new NotFoundException({
        code: 'PRODUCT_UNKNOWN',
        message: 'Код не сопоставлен с товаром. Укажите GTIN, арт., SKU или внешний штрихкод (POST …/items/…/external-barcodes).',
      });
    }
    const unit = await this.store.getNextReservedUnitForItem(userId, itemId, receiptId?.trim() || null);
    if (!unit) {
      throw new NotFoundException({
        code: 'NO_RESERVED_UNIT',
        message: 'Нет зарезервированных единиц (очереди) по этому товару. Зарезервируйте в приходе.',
      });
    }
    const item = await this.store.getItemById(userId, unit.itemId);
    if (!item) {
      throw new NotFoundException({ code: 'ITEM_GONE', message: 'Товар единицы не найден.' });
    }
    const article = (item.article && item.article.trim()) || item.sku;
    const buffer = await renderUnitShelfLabelsPdf([{ article, title: item.title, barcode: unit.barcode }]);
    await this.store.appendEvent(userId, {
      type: 'LABEL_PRINTED',
      unitId: unit.id,
      referenceType: 'UNIT',
      referenceId: unit.id,
      payload: { source: 'QUEUE', scan, itemId, receiptId: receiptId ?? null },
    });
    return { buffer, unit, source: 'FROM_QUEUE' };
  }
}
