import { BadRequestException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { WmsStoreService } from './storage/wms-store.service';
import { WmsAgxIncompleteError } from './wms.errors';
import {
  CreateContainerDto,
  CreateInvoiceReceiptDto,
  CreateItemDto,
  CreateLocationDto,
  AssignPutawayTaskDto,
  CreatePutawayTaskDto,
  CreateReceiptDto,
  CreateWarehouseDto,
  MoveInventoryDto,
  NestContainersDto,
  ReserveReceiptBarcodesDto,
  UnnestContainerDto,
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

  getLocationContents(userId: string, q: { locationId?: string; warehouseId?: string; code?: string }) {
    const id = q.locationId?.trim() ?? '';
    const wh = q.warehouseId?.trim() ?? '';
    const code = q.code?.trim() ?? '';
    if (id && (wh || code)) {
      throw new BadRequestException('Укажите либо locationId, либо пару warehouseId+code.');
    }
    if (id) {
      return this.guardErrors(() => this.store.getLocationContents(userId, id));
    }
    if (wh && code) {
      return this.guardErrors(async () => {
        const locs = await this.store.listLocations(userId, wh);
        const c = code.trim();
        const found = locs.find(
          (l) => l.code.toUpperCase() === c.toUpperCase() || l.path === c || l.path.endsWith(`/${c}`),
        );
        if (!found) throw new NotFoundException('Ячейка с таким code/path на складе не найдена.');
        return this.store.getLocationContents(userId, found.id);
      });
    }
    throw new BadRequestException('Укажите locationId или warehouseId и code.');
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

  getReceiptDetail(userId: string, receiptId: string) {
    return this.guardErrors(() => this.store.getReceiptDetail(userId, receiptId));
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

  nestContainers(userId: string, input: NestContainersDto) {
    return this.guardErrors(() =>
      this.store.nestChildContainerUnderParent(userId, input.parentBarcode, input.childBarcode),
    );
  }

  listTasks(userId: string, warehouseId?: string) {
    return this.guardErrors(() => this.store.listTasks(userId, warehouseId));
  }

  createPutawayTask(userId: string, input: CreatePutawayTaskDto) {
    return this.guardErrors(() =>
      this.store.createPutawayTask(userId, {
        warehouseId: input.warehouseId,
        targetLocationId: input.targetLocationId,
        unitBarcodes: input.unitBarcodes,
        containerBarcode: input.containerBarcode,
        note: input.note,
      }),
    );
  }

  getTask(userId: string, taskId: string) {
    return this.guardErrors(() => this.store.getTask(userId, taskId));
  }

  assignPutawayTask(userId: string, taskId: string, input: AssignPutawayTaskDto) {
    return this.guardErrors(() => this.store.assignPutawayTask(userId, taskId, input.assigneeUserId));
  }

  startPutawayTask(userId: string, taskId: string, actorUserId: string) {
    return this.guardErrors(() => this.store.startPutawayTask(userId, taskId, actorUserId));
  }

  completePutawayTask(userId: string, taskId: string, actorUserId: string) {
    return this.guardErrors(() => this.store.completePutawayTask(userId, taskId, actorUserId));
  }

  unnestChildContainer(userId: string, input: UnnestContainerDto) {
    return this.guardErrors(() => this.store.unnestChildContainer(userId, input.childBarcode));
  }

  getContainerContents(userId: string, q: { containerId?: string; barcode?: string }) {
    const id = q.containerId?.trim() ?? '';
    const bc = q.barcode?.trim() ?? '';
    if (Boolean(id) === Boolean(bc)) {
      throw new BadRequestException('Укажите ровно один параметр: containerId или barcode.');
    }
    return this.guardErrors(() =>
      this.store.getContainerContents(userId, { containerId: id || undefined, barcode: bc || undefined }),
    );
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
      if (error instanceof HttpException) throw error;
      if (error instanceof WmsAgxIncompleteError) {
        throw new BadRequestException({
          code: 'AGX_INCOMPLETE',
          message: 'Для приёмки нужны вес и все габариты (мм) по каждой позиции.',
          lines: error.lines,
        });
      }
      const message = error instanceof Error ? error.message : 'WMS operation failed';
      if (message.toLowerCase().includes('not found')) {
        throw new NotFoundException(message);
      }
      throw new BadRequestException(message);
    }
  }
}
