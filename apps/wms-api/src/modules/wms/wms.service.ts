import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { WmsStoreService } from './storage/wms-store.service';
import {
  CreateContainerDto,
  CreateItemDto,
  CreateLocationDto,
  CreateReceiptDto,
  CreateWarehouseDto,
  MoveInventoryDto,
  ReserveReceiptBarcodesDto,
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
