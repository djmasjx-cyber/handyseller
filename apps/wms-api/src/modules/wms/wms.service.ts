import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { WmsStoreService } from './storage/wms-store.service';
import {
  CreateContainerDto,
  CreateInvoiceReceiptDto,
  CreateItemDto,
  CreateLocationDto,
  CreateReceiptDto,
  CreateWarehouseDto,
  MoveInventoryDto,
  ReserveReceiptBarcodesDto,
  UpdateItemDto,
} from './wms.dto';

@Injectable()
export class WmsService {
  constructor(private readonly store: WmsStoreService) {}

  listWarehouses(userId: string) {
    return this.store.listWarehouses(userId);
  }

  createWarehouse(userId: string, input: CreateWarehouseDto) {
    return this.guardErrors(() => this.store.createWarehouse(userId, input));
  }

  listLocations(userId: string, warehouseId?: string) {
    return this.store.listLocations(userId, warehouseId);
  }

  createLocation(userId: string, input: CreateLocationDto) {
    return this.guardErrors(() => this.store.createLocation(userId, input));
  }

  listItems(userId: string) {
    return this.store.listItems(userId);
  }

  listReceipts(userId: string) {
    return this.guardErrors(() => this.store.listReceipts(userId));
  }

  async getReceiptDetail(userId: string, receiptId: string) {
    return this.guardErrors(async () => {
      const { receipt, units } = await this.store.getReceiptWithUnits(userId, receiptId);
      const items = await this.store.listItems(userId);
      const byId = new Map(items.map((i) => [i.id, i] as const));
      const lines = receipt.lines.map((ln) => {
        const it = byId.get(ln.itemId);
        return { ...ln, sku: it?.sku ?? null, lineTitle: it?.title ?? null };
      });
      return { receipt: { ...receipt, lines }, units };
    });
  }

  createInvoiceReceipt(userId: string, input: CreateInvoiceReceiptDto) {
    return this.guardErrors(() => this.store.createInvoiceReceipt(userId, input));
  }

  createItem(userId: string, input: CreateItemDto) {
    return this.guardErrors(() => this.store.createItem(userId, input));
  }

  updateItem(userId: string, itemId: string, input: UpdateItemDto) {
    return this.guardErrors(() => this.store.updateItem(userId, itemId, input));
  }

  createReceipt(userId: string, input: CreateReceiptDto) {
    if (!input.lines.length) {
      throw new BadRequestException('Receipt must contain at least one line.');
    }
    return this.guardErrors(() => this.store.createReceipt(userId, input));
  }

  reserveReceiptBarcodes(userId: string, receiptId: string, input: ReserveReceiptBarcodesDto) {
    return this.guardErrors(() => this.store.reserveReceiptBarcodes(userId, receiptId, input.receiptLineId));
  }

  /**
   * Закрывает приход: нужны ВГХ по всем товарам в строках; RESERVED → RECEIVED.
   */
  async acceptReceipt(userId: string, receiptId: string) {
    const { receipt } = await this.guardErrors(() => this.store.getReceiptWithUnits(userId, receiptId));
    if (receipt.status === 'CANCELLED') {
      throw new BadRequestException('Накладная отменена.');
    }
    if (receipt.status === 'RECEIVED' || receipt.status === 'CLOSED') {
      return this.getReceiptDetail(userId, receiptId);
    }
    const items = await this.store.listItems(userId);
    const byId = new Map(items.map((i) => [i.id, i] as const));
    const seen = new Set<string>();
    const lines: { sku: string; lineTitle: string | null; missing: string[] }[] = [];
    for (const ln of receipt.lines) {
      if (seen.has(ln.itemId)) continue;
      seen.add(ln.itemId);
      const it = byId.get(ln.itemId);
      if (!it) {
        throw new NotFoundException(`Позиция (товар) не найдена: ${ln.itemId}`);
      }
      const d = it.dimensions ?? {};
      const missing: string[] = [];
      if (typeof d.weightGrams !== 'number' || d.weightGrams < 1) missing.push('weightGrams');
      if (typeof d.lengthMm !== 'number' || d.lengthMm < 1) missing.push('lengthMm');
      if (typeof d.widthMm !== 'number' || d.widthMm < 1) missing.push('widthMm');
      if (typeof d.heightMm !== 'number' || d.heightMm < 1) missing.push('heightMm');
      if (missing.length) {
        lines.push({ sku: it.sku, lineTitle: it.title, missing });
      }
    }
    if (lines.length) {
      throw new HttpException({ code: 'VGH_INCOMPLETE', lines }, HttpStatus.BAD_REQUEST);
    }
    await this.guardErrors(() => this.store.acceptReceipt(userId, receiptId));
    return this.getReceiptDetail(userId, receiptId);
  }

  createContainer(userId: string, input: CreateContainerDto) {
    return this.guardErrors(() => this.store.createContainer(userId, input));
  }

  moveInventory(userId: string, input: MoveInventoryDto) {
    if (!input.containerBarcode && !input.unitBarcodes?.length) {
      throw new BadRequestException('Move requires containerBarcode or unitBarcodes.');
    }
    return this.guardErrors(() => this.store.moveInventory(userId, input));
  }

  async lookupBarcode(userId: string, barcode: string) {
    const result = await this.store.lookupBarcode(userId, barcode);
    if (!result) throw new NotFoundException('Barcode not found.');
    return result;
  }

  listEvents(userId: string, limit?: number) {
    return this.store.listEvents(userId, limit);
  }

  private async guardErrors<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'WMS operation failed';
      if (message.toLowerCase().includes('not found')) {
        throw new NotFoundException(message);
      }
      throw new BadRequestException(message);
    }
  }
}
