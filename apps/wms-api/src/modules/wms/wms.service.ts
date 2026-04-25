import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
  UpdateItemAgxDto,
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

  createItem(userId: string, input: CreateItemDto) {
    return this.guardErrors(() => this.store.createItem(userId, input));
  }

  createReceipt(userId: string, input: CreateReceiptDto) {
    if (!input.lines.length) {
      throw new BadRequestException('Receipt must contain at least one line.');
    }
    return this.guardErrors(() => this.store.createReceipt(userId, input));
  }

  listReceipts(userId: string) {
    return this.guardErrors(() => this.store.listReceipts(userId));
  }

  createInvoiceReceipt(userId: string, input: CreateInvoiceReceiptDto) {
    if (!input.lines?.length) {
      throw new BadRequestException('Invoice must contain at least one line.');
    }
    const number = input.number?.trim() || `INV-${Date.now()}`;
    return this.guardErrors(() =>
      this.store.createInvoiceReceipt(userId, {
        warehouseId: input.warehouseId,
        number,
        lines: input.lines.map((l) => ({
          article: l.article,
          title: l.title,
          quantity: l.quantity,
          price: l.price,
        })),
      }),
    );
  }

  acceptReceipt(userId: string, receiptId: string) {
    return this.guardErrors(() => this.store.acceptReceipt(userId, receiptId));
  }

  updateItemAgx(userId: string, itemId: string, input: UpdateItemAgxDto) {
    return this.guardErrors(() =>
      this.store.updateItemDimensions(userId, itemId, {
        weightGrams: input.weightGrams,
        lengthMm: input.lengthMm,
        widthMm: input.widthMm,
        heightMm: input.heightMm,
      }),
    );
  }

  reserveReceiptBarcodes(userId: string, receiptId: string, input: ReserveReceiptBarcodesDto) {
    return this.guardErrors(() => this.store.reserveReceiptBarcodes(userId, receiptId, input.receiptLineId));
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
