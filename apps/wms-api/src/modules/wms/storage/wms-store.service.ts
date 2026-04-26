import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { buildLocationPath, buildLpnBarcode, buildUnitBarcode, isCanonicalUnitBarcode } from '@handyseller/wms-domain';
import { buildProductScanCandidates, gsinComparableKey } from '../labeling/scan-identity';
import type {
  CreateContainerInput,
  CreateItemInput,
  CreateLocationInput,
  CreateReceiptInput,
  CreateWarehouseInput,
  MoveInventoryInput,
  WmsContainerRecord,
  WmsInventoryEventRecord,
  WmsInventoryUnitRecord,
  WmsItemRecord,
  WmsLocationRecord,
  WmsReceiptLineInput,
  WmsReceiptRecord,
  WmsWarehouseRecord,
} from '@handyseller/wms-sdk';
import { Pool } from 'pg';

type JsonRow<T> = { payload: T };

function nowIso(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildPool(conn: string): Pool {
  const url = new URL(conn);
  const sslMode = url.searchParams.get('sslmode')?.toLowerCase();
  const usesManagedDbSsl = sslMode === 'require' || sslMode === 'prefer' || sslMode === 'verify-ca';
  if (usesManagedDbSsl) {
    url.searchParams.delete('sslmode');
  }
  return new Pool({
    connectionString: usesManagedDbSsl ? url.toString() : conn,
    ssl: usesManagedDbSsl ? { rejectUnauthorized: false } : undefined,
  });
}

@Injectable()
export class WmsStoreService implements OnModuleInit {
  private readonly logger = new Logger(WmsStoreService.name);
  private readonly pool: Pool | null;
  private readonly warehouses = new Map<string, WmsWarehouseRecord>();
  private readonly locations = new Map<string, WmsLocationRecord>();
  private readonly items = new Map<string, WmsItemRecord>();
  private readonly receipts = new Map<string, WmsReceiptRecord>();
  private readonly units = new Map<string, WmsInventoryUnitRecord>();
  private readonly containers = new Map<string, WmsContainerRecord>();
  private readonly events: WmsInventoryEventRecord[] = [];
  /** in-memory: ключ `${userId}\t${barcode}` → itemId (внешние/заводские копии из wms_barcode_alias). */
  private readonly externalBarcodeToItem = new Map<string, string>();

  constructor() {
    const conn = process.env.WMS_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim() || '';
    this.pool = conn ? buildPool(conn) : null;
  }

  async onModuleInit(): Promise<void> {
    if (!this.pool) {
      this.logger.warn('WMS_DATABASE_URL is not set; wms-api runs with in-memory state only.');
      return;
    }
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS wms_warehouse (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        code TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ux_wms_warehouse_user_code ON wms_warehouse(user_id, code);

      CREATE TABLE IF NOT EXISTS wms_location (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        warehouse_id TEXT NOT NULL,
        parent_id TEXT,
        type TEXT NOT NULL,
        code TEXT NOT NULL,
        path TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ux_wms_location_warehouse_path ON wms_location(warehouse_id, path);
      CREATE INDEX IF NOT EXISTS ix_wms_location_parent ON wms_location(parent_id);

      CREATE TABLE IF NOT EXISTS wms_item (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        sku TEXT NOT NULL,
        core_product_id TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ux_wms_item_user_sku ON wms_item(user_id, sku);

      CREATE TABLE IF NOT EXISTS wms_barcode_alias (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        barcode TEXT NOT NULL,
        kind TEXT NOT NULL,
        payload JSONB NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ux_wms_barcode_alias_user_barcode ON wms_barcode_alias(user_id, barcode);

      CREATE TABLE IF NOT EXISTS wms_route_rule (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        warehouse_id TEXT NOT NULL,
        operation_type TEXT NOT NULL,
        status TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 100,
        payload JSONB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ix_wms_route_rule_warehouse ON wms_route_rule(warehouse_id, operation_type, status);

      CREATE TABLE IF NOT EXISTS wms_receipt (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        warehouse_id TEXT NOT NULL,
        number TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ux_wms_receipt_user_number ON wms_receipt(user_id, number);

      CREATE TABLE IF NOT EXISTS wms_inventory_unit (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        barcode TEXT NOT NULL,
        item_id TEXT NOT NULL,
        status TEXT NOT NULL,
        location_id TEXT,
        container_id TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ux_wms_inventory_unit_user_barcode ON wms_inventory_unit(user_id, barcode);
      CREATE INDEX IF NOT EXISTS ix_wms_inventory_unit_location ON wms_inventory_unit(location_id);
      CREATE INDEX IF NOT EXISTS ix_wms_inventory_unit_container ON wms_inventory_unit(container_id);

      CREATE TABLE IF NOT EXISTS wms_container_lpn (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        warehouse_id TEXT NOT NULL,
        barcode TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        location_id TEXT,
        parent_container_id TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ux_wms_container_user_barcode ON wms_container_lpn(user_id, barcode);
      CREATE INDEX IF NOT EXISTS ix_wms_container_location ON wms_container_lpn(location_id);

      CREATE TABLE IF NOT EXISTS wms_container_content (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        container_id TEXT NOT NULL,
        unit_id TEXT,
        child_container_id TEXT,
        payload JSONB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ix_wms_container_content_container ON wms_container_content(container_id);

      CREATE TABLE IF NOT EXISTS wms_task (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        warehouse_id TEXT,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        assignee_user_id TEXT,
        priority INTEGER NOT NULL DEFAULT 100,
        payload JSONB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ix_wms_task_work_queue ON wms_task(user_id, warehouse_id, type, status, priority);

      CREATE TABLE IF NOT EXISTS wms_order_work (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        warehouse_id TEXT,
        core_order_id TEXT,
        tms_shipment_id TEXT,
        status TEXT NOT NULL,
        payload JSONB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ix_wms_order_work_core_order ON wms_order_work(user_id, core_order_id);

      CREATE TABLE IF NOT EXISTS wms_inventory_event (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        warehouse_id TEXT,
        unit_id TEXT,
        container_id TEXT,
        reference_type TEXT,
        reference_id TEXT,
        payload JSONB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ix_wms_event_user_occurred ON wms_inventory_event(user_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS ix_wms_event_unit ON wms_inventory_event(unit_id);
      CREATE INDEX IF NOT EXISTS ix_wms_event_container ON wms_inventory_event(container_id);
    `);
  }

  async listWarehouses(userId: string): Promise<WmsWarehouseRecord[]> {
    if (this.pool) {
      const res = await this.pool.query<JsonRow<WmsWarehouseRecord>>(
        'SELECT payload FROM wms_warehouse WHERE user_id = $1 ORDER BY code ASC',
        [userId],
      );
      return res.rows.map((r) => r.payload);
    }
    return [...this.warehouses.values()].filter((w) => w.userId === userId);
  }

  async createWarehouse(userId: string, input: CreateWarehouseInput): Promise<WmsWarehouseRecord> {
    const ts = nowIso();
    const warehouse: WmsWarehouseRecord = {
      id: id('wh'),
      userId,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      kind: input.kind ?? 'PHYSICAL',
      status: 'ACTIVE',
      createdAt: ts,
      updatedAt: ts,
    };
    this.warehouses.set(warehouse.id, warehouse);
    await this.upsert('wms_warehouse', warehouse.id, userId, warehouse, {
      code: warehouse.code,
      status: warehouse.status,
    });
    await this.appendEvent(userId, {
      type: 'WAREHOUSE_CREATED',
      warehouseId: warehouse.id,
      referenceType: 'WAREHOUSE',
      referenceId: warehouse.id,
      payload: { title: 'Warehouse created', code: warehouse.code },
    });
    return warehouse;
  }

  async listLocations(userId: string, warehouseId?: string): Promise<WmsLocationRecord[]> {
    if (this.pool) {
      const res = await this.pool.query<JsonRow<WmsLocationRecord>>(
        `SELECT payload FROM wms_location WHERE user_id = $1 AND ($2::text IS NULL OR warehouse_id = $2) ORDER BY path ASC`,
        [userId, warehouseId ?? null],
      );
      return res.rows.map((r) => r.payload);
    }
    return [...this.locations.values()]
      .filter((l) => l.userId === userId && (!warehouseId || l.warehouseId === warehouseId))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  async createLocation(userId: string, input: CreateLocationInput): Promise<WmsLocationRecord> {
    const parent = input.parentId ? await this.getLocation(userId, input.parentId) : null;
    const ts = nowIso();
    const location: WmsLocationRecord = {
      id: id('loc'),
      userId,
      warehouseId: input.warehouseId,
      parentId: input.parentId ?? null,
      type: input.type,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      path: buildLocationPath(parent?.path, input.code),
      status: 'ACTIVE',
      capacity: input.capacity ?? null,
      constraints: input.constraints ?? null,
      createdAt: ts,
      updatedAt: ts,
    };
    this.locations.set(location.id, location);
    await this.upsert('wms_location', location.id, userId, location, {
      warehouse_id: location.warehouseId,
      parent_id: location.parentId,
      type: location.type,
      code: location.code,
      path: location.path,
      status: location.status,
    });
    await this.appendEvent(userId, {
      type: 'LOCATION_CREATED',
      warehouseId: location.warehouseId,
      toLocationId: location.id,
      referenceType: 'LOCATION',
      referenceId: location.id,
      payload: { title: 'Location created', path: location.path },
    });
    return location;
  }

  async listItems(userId: string): Promise<WmsItemRecord[]> {
    if (this.pool) {
      const res = await this.pool.query<JsonRow<WmsItemRecord>>(
        'SELECT payload FROM wms_item WHERE user_id = $1 ORDER BY sku ASC',
        [userId],
      );
      return res.rows.map((r) => r.payload);
    }
    return [...this.items.values()].filter((item) => item.userId === userId);
  }

  async listReceipts(userId: string): Promise<WmsReceiptRecord[]> {
    if (this.pool) {
      const res = await this.pool.query<JsonRow<WmsReceiptRecord>>(
        'SELECT payload FROM wms_receipt WHERE user_id = $1 ORDER BY updated_at DESC',
        [userId],
      );
      return res.rows.map((r) => r.payload);
    }
    return [...this.receipts.values()]
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private async listAllUnits(userId: string): Promise<WmsInventoryUnitRecord[]> {
    if (this.pool) {
      const res = await this.pool.query<JsonRow<WmsInventoryUnitRecord>>(
        'SELECT payload FROM wms_inventory_unit WHERE user_id = $1',
        [userId],
      );
      return res.rows.map((r) => r.payload);
    }
    return [...this.units.values()].filter((u) => u.userId === userId);
  }

  async getInventoryUnitById(userId: string, unitId: string): Promise<WmsInventoryUnitRecord | null> {
    if (this.pool) {
      const res = await this.pool.query<JsonRow<WmsInventoryUnitRecord>>(
        'SELECT payload FROM wms_inventory_unit WHERE user_id = $1 AND id = $2',
        [userId, unitId],
      );
      return res.rows[0]?.payload ?? null;
    }
    const u = this.units.get(unitId);
    return u && u.userId === userId ? u : null;
  }

  async getItemById(userId: string, itemId: string): Promise<WmsItemRecord | null> {
    if (this.pool) {
      const res = await this.pool.query<JsonRow<WmsItemRecord>>(
        'SELECT payload FROM wms_item WHERE user_id = $1 AND id = $2',
        [userId, itemId],
      );
      return res.rows[0]?.payload ?? null;
    }
    const it = this.items.get(itemId);
    return it && it.userId === userId ? it : null;
  }

  async getReceiptWithUnits(
    userId: string,
    receiptId: string,
  ): Promise<{ receipt: WmsReceiptRecord; units: WmsInventoryUnitRecord[] }> {
    const receipt = await this.getReceipt(userId, receiptId);
    const all = await this.listAllUnits(userId);
    const units = all.filter((u) => u.receiptId === receiptId);
    await this.migrateLegacyUnitBarcodesToNumeric(userId, units, receipt);
    const allAfter = await this.listAllUnits(userId);
    return { receipt, units: allAfter.filter((u) => u.receiptId === receiptId) };
  }

  /** Неканонические штрихкоды единиц (HU…, длинные цифры и т.д.) → 12 цифр `0…` при открытии накладной. */
  private async migrateLegacyUnitBarcodesToNumeric(
    userId: string,
    units: WmsInventoryUnitRecord[],
    receipt: WmsReceiptRecord,
  ): Promise<void> {
    const legacy = units.filter((u) => Boolean(u.barcode) && !isCanonicalUnitBarcode(u.barcode));
    if (!legacy.length) return;

    let seq = (await this.nextSerial('wms_inventory_unit', userId)) + 10_000_000;
    const ts = nowIso();
    for (const u of legacy) {
      let nextBc: string;
      let guard = 0;
      do {
        nextBc = buildUnitBarcode(userId, seq);
        seq += 1;
        guard += 1;
        if (guard > 500) throw new Error('barcode_migration_uniqueness');
      } while (await this.findUnitByBarcode(userId, nextBc));

      u.barcode = nextBc;
      u.updatedAt = ts;
      if (!this.pool) {
        this.units.set(u.id, u);
      }
      await this.upsertUnit(u);
    }
    this.logger.log(`Migrated ${legacy.length} unit barcode(s) to numeric-only for receipt ${receipt.number}`);
  }

  async createInvoiceReceipt(
    userId: string,
    input: { warehouseId: string; lines: Array<{ article: string; title: string; quantity: number; price?: number }> },
  ): Promise<{ receipt: WmsReceiptRecord; units: WmsInventoryUnitRecord[] }> {
    if (!input.lines.length) {
      throw new Error('At least one line is required');
    }
    const itemCache = await this.listItems(userId);
    const lineInputs: WmsReceiptLineInput[] = [];
    for (const l of input.lines) {
      const article = l.article.trim();
      const title = l.title.trim();
      const qty = Math.max(1, Math.floor(Number(l.quantity)));
      if (!article || !title) {
        throw new Error('Each line must have article and title');
      }
      let item = itemCache.find((i) => (i.article && i.article === article) || i.sku === article);
      if (!item) {
        item = await this.createItem(userId, { sku: article, article, title });
        itemCache.push(item);
      }
      lineInputs.push({ itemId: item.id, expectedQty: qty, unitLabel: null });
    }
    const number = `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const receipt = await this.createReceipt(userId, {
      warehouseId: input.warehouseId,
      number,
      source: 'INVOICE',
      supplierName: null,
      lines: lineInputs,
    });
    const units = await this.reserveReceiptBarcodes(userId, receipt.id, undefined);
    return { receipt, units };
  }

  async createItem(userId: string, input: CreateItemInput): Promise<WmsItemRecord> {
    const ts = nowIso();
    const item: WmsItemRecord = {
      id: id('item'),
      userId,
      coreProductId: input.coreProductId ?? null,
      sku: input.sku.trim(),
      article: input.article ?? null,
      title: input.title.trim(),
      gtin: input.gtin ?? null,
      requiresDataMatrix: input.requiresDataMatrix ?? false,
      serialTracking: input.serialTracking ?? true,
      shelfLifeDays: input.shelfLifeDays ?? null,
      dimensions: input.dimensions ?? {},
      createdAt: ts,
      updatedAt: ts,
    };
    this.items.set(item.id, item);
    await this.upsert('wms_item', item.id, userId, item, {
      sku: item.sku,
      core_product_id: item.coreProductId,
    });
    await this.appendEvent(userId, {
      type: 'ITEM_CREATED',
      referenceType: 'ITEM',
      referenceId: item.id,
      payload: { sku: item.sku, title: item.title },
    });
    return item;
  }

  async createReceipt(userId: string, input: CreateReceiptInput): Promise<WmsReceiptRecord> {
    const ts = nowIso();
    const receipt: WmsReceiptRecord = {
      id: id('rcpt'),
      userId,
      warehouseId: input.warehouseId,
      number: input.number.trim(),
      status: 'DRAFT',
      source: input.source ?? null,
      supplierName: input.supplierName ?? null,
      createdAt: ts,
      updatedAt: ts,
      lines: input.lines.map((line) => ({
        ...line,
        id: id('rline'),
        reservedQty: 0,
        receivedQty: 0,
      })),
    };
    this.receipts.set(receipt.id, receipt);
    await this.upsert('wms_receipt', receipt.id, userId, receipt, {
      warehouse_id: receipt.warehouseId,
      number: receipt.number,
      status: receipt.status,
    });
    await this.appendEvent(userId, {
      type: 'RECEIPT_CREATED',
      warehouseId: receipt.warehouseId,
      referenceType: 'RECEIPT',
      referenceId: receipt.id,
      payload: { number: receipt.number, lineCount: receipt.lines.length },
    });
    return receipt;
  }

  async reserveReceiptBarcodes(userId: string, receiptId: string, receiptLineId?: string): Promise<WmsInventoryUnitRecord[]> {
    const receipt = await this.getReceipt(userId, receiptId);
    const lines = receipt.lines.filter((line) => !receiptLineId || line.id === receiptLineId);
    const created: WmsInventoryUnitRecord[] = [];
    const nextUnitSerial = await this.nextSerial('wms_inventory_unit', userId);
    for (const line of lines) {
      const qtyToReserve = Math.max(line.expectedQty - line.reservedQty, 0);
      for (let i = 0; i < qtyToReserve; i += 1) {
        const ts = nowIso();
        const unit: WmsInventoryUnitRecord = {
          id: id('unit'),
          userId,
          itemId: line.itemId,
          barcode: buildUnitBarcode(userId, nextUnitSerial + created.length),
          status: 'RESERVED',
          receiptId: receipt.id,
          receiptLineId: line.id,
          locationId: null,
          containerId: null,
          orderWorkId: null,
          createdAt: ts,
          updatedAt: ts,
        };
        this.units.set(unit.id, unit);
        await this.upsertUnit(unit);
        await this.appendEvent(userId, {
          type: 'BARCODE_RESERVED',
          warehouseId: receipt.warehouseId,
          unitId: unit.id,
          referenceType: 'RECEIPT',
          referenceId: receipt.id,
          payload: { barcode: unit.barcode, receiptLineId: line.id },
        });
        created.push(unit);
      }
      line.reservedQty += qtyToReserve;
    }
    receipt.status = receipt.status === 'DRAFT' ? 'EXPECTED' : receipt.status;
    receipt.updatedAt = nowIso();
    await this.upsert('wms_receipt', receipt.id, userId, receipt, {
      warehouse_id: receipt.warehouseId,
      number: receipt.number,
      status: receipt.status,
    });
    return created;
  }

  private async getItemRecord(userId: string, itemId: string): Promise<WmsItemRecord> {
    if (this.pool) {
      const res = await this.pool.query<JsonRow<WmsItemRecord>>(
        'SELECT payload FROM wms_item WHERE user_id = $1 AND id = $2',
        [userId, itemId],
      );
      const row = res.rows[0]?.payload;
      if (row) return row;
    } else {
      const row = this.items.get(itemId);
      if (row && row.userId === userId) return row;
    }
    throw new Error('Item not found');
  }

  async updateItem(
    userId: string,
    itemId: string,
    input: { weightGrams: number; lengthMm: number; widthMm: number; heightMm: number },
  ): Promise<WmsItemRecord> {
    const item = await this.getItemRecord(userId, itemId);
    item.dimensions = {
      ...item.dimensions,
      weightGrams: input.weightGrams,
      lengthMm: input.lengthMm,
      widthMm: input.widthMm,
      heightMm: input.heightMm,
    };
    item.updatedAt = nowIso();
    this.items.set(item.id, item);
    await this.upsert('wms_item', item.id, userId, item, {
      sku: item.sku,
      core_product_id: item.coreProductId,
    });
    await this.appendEvent(userId, {
      type: 'ITEM_UPDATED',
      referenceType: 'ITEM',
      referenceId: item.id,
      payload: { sku: item.sku, dimensions: item.dimensions },
    });
    return item;
  }

  async acceptReceipt(
    userId: string,
    receiptId: string,
  ): Promise<{ receipt: WmsReceiptRecord; units: WmsInventoryUnitRecord[] }> {
    const receipt = await this.getReceipt(userId, receiptId);
    if (receipt.status === 'RECEIVED' || receipt.status === 'CLOSED') {
      return this.getReceiptWithUnits(userId, receiptId);
    }
    for (const line of receipt.lines) {
      line.receivedQty = line.expectedQty;
    }
    const all = await this.listAllUnits(userId);
    for (const u of all) {
      if (u.receiptId !== receiptId) continue;
      if (u.status === 'RESERVED') {
        u.status = 'RECEIVED';
        u.updatedAt = nowIso();
        this.units.set(u.id, u);
        await this.upsertUnit(u);
      }
    }
    receipt.status = 'RECEIVED';
    receipt.updatedAt = nowIso();
    await this.upsert('wms_receipt', receipt.id, userId, receipt, {
      warehouse_id: receipt.warehouseId,
      number: receipt.number,
      status: receipt.status,
    });
    await this.appendEvent(userId, {
      type: 'RECEIPT_ACCEPTED',
      warehouseId: receipt.warehouseId,
      referenceType: 'RECEIPT',
      referenceId: receipt.id,
      payload: { number: receipt.number },
    });
    return this.getReceiptWithUnits(userId, receiptId);
  }

  async createContainer(userId: string, input: CreateContainerInput): Promise<WmsContainerRecord> {
    const ts = nowIso();
    const nextContainerSerial = await this.nextSerial('wms_container_lpn', userId);
    const container: WmsContainerRecord = {
      id: id('lpn'),
      userId,
      warehouseId: input.warehouseId,
      barcode: buildLpnBarcode(userId, nextContainerSerial),
      type: input.type,
      status: 'ACTIVE',
      locationId: input.locationId ?? null,
      parentContainerId: input.parentContainerId ?? null,
      createdAt: ts,
      updatedAt: ts,
    };
    this.containers.set(container.id, container);
    await this.upsertContainer(container);
    await this.appendEvent(userId, {
      type: 'LPN_CREATED',
      warehouseId: container.warehouseId,
      containerId: container.id,
      toLocationId: container.locationId,
      referenceType: 'CONTAINER',
      referenceId: container.id,
      payload: { barcode: container.barcode, type: container.type },
    });
    return container;
  }

  async moveInventory(userId: string, input: MoveInventoryInput): Promise<{ units: WmsInventoryUnitRecord[]; container?: WmsContainerRecord }> {
    const toLocation = await this.getLocation(userId, input.toLocationId);
    const movedUnits: WmsInventoryUnitRecord[] = [];
    let container: WmsContainerRecord | undefined;
    if (input.containerBarcode) {
      container = await this.getContainerByBarcode(userId, input.containerBarcode);
      const fromLocationId = container.locationId;
      container.locationId = toLocation.id;
      container.updatedAt = nowIso();
      if (input.archiveTemporaryContainer && container.type === 'RECEIVING_TOTE') {
        container.status = 'ARCHIVED';
      }
      await this.upsertContainer(container);
      await this.appendEvent(userId, {
        type: 'MOVED',
        warehouseId: toLocation.warehouseId,
        containerId: container.id,
        fromLocationId,
        toLocationId: toLocation.id,
        referenceType: 'CONTAINER',
        referenceId: container.id,
        payload: { barcode: container.barcode, archived: container.status === 'ARCHIVED' },
      });
    }
    for (const barcode of input.unitBarcodes ?? []) {
      const unit = await this.getUnitByBarcode(userId, barcode);
      const fromLocationId = unit.locationId;
      unit.locationId = toLocation.id;
      unit.containerId = container?.status === 'ARCHIVED' ? null : container?.id ?? unit.containerId;
      unit.status = 'STORED';
      unit.updatedAt = nowIso();
      await this.upsertUnit(unit);
      await this.appendEvent(userId, {
        type: 'MOVED',
        warehouseId: toLocation.warehouseId,
        unitId: unit.id,
        containerId: unit.containerId,
        fromLocationId,
        toLocationId: toLocation.id,
        referenceType: 'UNIT',
        referenceId: unit.id,
        payload: { barcode: unit.barcode },
      });
      movedUnits.push(unit);
    }
    return { units: movedUnits, container };
  }

  async lookupBarcode(userId: string, barcode: string): Promise<{ kind: string; record: unknown } | null> {
    const unit = await this.findUnitByBarcode(userId, barcode);
    if (unit) return { kind: 'UNIT', record: unit };
    const container = await this.findContainerByBarcode(userId, barcode);
    if (container) return { kind: 'LPN', record: container };
    const locations = await this.listLocations(userId);
    const location = locations.find((l) => l.code === barcode || l.path === barcode);
    if (location) return { kind: 'LOCATION', record: location };
    const item = await this.findItemByScannedProductCode(userId, barcode);
    if (item) return { kind: 'ITEM', record: item };
    return null;
  }

  /**
   * Внешние штрихкоды (EAN, доп. коды поставщика) в БД: уникальность (user_id, barcode).
   */
  async addItemExternalBarcode(
    userId: string,
    itemId: string,
    rawBarcode: string,
  ): Promise<{ id: string; itemId: string; barcode: string }> {
    const it = await this.getItemById(userId, itemId);
    if (!it) {
      throw new Error('Item not found');
    }
    const barcode = rawBarcode.trim();
    if (!barcode) {
      throw new Error('Barcode is required');
    }
    if (this.pool) {
      const bcaId = id('bca');
      const ins = await this.pool.query<{ id: string }>(
        `INSERT INTO wms_barcode_alias (id, user_id, item_id, barcode, kind, payload)
         VALUES ($1, $2, $3, $4, 'EXTERNAL', $5::jsonb)
         ON CONFLICT (user_id, barcode)
         DO UPDATE SET item_id = EXCLUDED.item_id, kind = EXCLUDED.kind, payload = EXCLUDED.payload
         RETURNING id`,
        [bcaId, userId, itemId, barcode, JSON.stringify({ itemId, sku: it.sku })],
      );
      const rowId = ins.rows[0]?.id ?? bcaId;
      return { id: rowId, itemId, barcode };
    }
    const k = `${userId}\t${barcode}`;
    for (const [k2, id2] of this.externalBarcodeToItem) {
      if (k2.endsWith(`\t${barcode}`) && id2 !== itemId) {
        throw new Error('Barcode is already used for another item in memory state');
      }
    }
    this.externalBarcodeToItem.set(k, itemId);
    return { id: id('bca'), itemId, barcode };
  }

  /**
   * Разрешение: алиас → товар, затем поля item (арт., SKU, GTIN).
   */
  async findItemIdByProductScan(userId: string, raw: string): Promise<string | null> {
    const candidates = buildProductScanCandidates(raw);
    if (candidates.length === 0) return null;
    const fromAlias = await this.findItemIdByAliasBarcodes(userId, candidates);
    if (fromAlias) return fromAlias;
    return this.findItemIdFromItemList(userId, raw, candidates);
  }

  private async findItemIdByAliasBarcodes(userId: string, candidates: string[]): Promise<string | null> {
    const uniq = [...new Set(candidates)].filter(Boolean).slice(0, 30);
    if (uniq.length === 0) return null;
    if (this.pool) {
      const res = await this.pool.query<{ item_id: string }>(
        `SELECT item_id FROM wms_barcode_alias WHERE user_id = $1 AND barcode = ANY($2::text[]) LIMIT 1`,
        [userId, uniq],
      );
      if (res.rows[0]?.item_id) {
        return res.rows[0].item_id;
      }
    } else {
      for (const b of uniq) {
        const v = this.externalBarcodeToItem.get(`${userId}\t${b}`);
        if (v) return v;
      }
    }
    return null;
  }

  private async findItemIdFromItemList(userId: string, raw: string, candidates: string[]): Promise<string | null> {
    const items = await this.listItems(userId);
    const trim = raw.trim();
    for (const it of items) {
      if (it.sku.trim() === trim) return it.id;
      if (it.article && it.article.trim() === trim) return it.id;
    }
    for (const c of candidates) {
      const ck = gsinComparableKey(c);
      if (!ck) continue;
      for (const it of items) {
        if (!it.gtin) continue;
        const ik = gsinComparableKey(it.gtin);
        if (ik && ik === ck) return it.id;
      }
    }
    return null;
  }

  /**
   * Заводской EAN/UPC/GTIN, алиас, артикул или SKU: для `lookup` и маршрутизации.
   */
  async findItemByScannedProductCode(userId: string, raw: string): Promise<WmsItemRecord | null> {
    const itemId = await this.findItemIdByProductScan(userId, raw);
    if (!itemId) return null;
    return this.getItemById(userId, itemId);
  }

  /**
   * Первая сопоставившаяся единица по вариантам ввода (внутренний 12-зн. с ведущими нулями и т.д.).
   */
  async findFirstInventoryUnitForScanCode(userId: string, raw: string): Promise<WmsInventoryUnitRecord | null> {
    const seen = new Set<string>();
    for (const c of buildProductScanCandidates(raw)) {
      if (seen.has(c)) continue;
      seen.add(c);
      const u = await this.findUnitByBarcode(userId, c);
      if (u) return u;
    }
    return null;
  }

  async findLocationByScannedCode(userId: string, raw: string): Promise<WmsLocationRecord | null> {
    const locations = await this.listLocations(userId);
    for (const c of buildProductScanCandidates(raw)) {
      const hit = locations.find((l) => l.code === c || l.path === c);
      if (hit) return hit;
    }
    return null;
  }

  async findFirstLpnForScanCode(userId: string, raw: string): Promise<WmsContainerRecord | null> {
    for (const c of buildProductScanCandidates(raw)) {
      const x = await this.findContainerByBarcode(userId, c);
      if (x) return x;
    }
    return null;
  }

  /**
   * Следующая зарезервированная единица по товару: для маркировки (очередь по createdAt).
   * receiptId сужает зону до конкретной накладной, если задан.
   */
  async getNextReservedUnitForItem(
    userId: string,
    itemId: string,
    receiptId?: string | null,
  ): Promise<WmsInventoryUnitRecord | null> {
    const all = await this.listAllUnits(userId);
    const list = all.filter(
      (u) =>
        u.userId === userId &&
        u.itemId === itemId &&
        u.status === 'RESERVED' &&
        (receiptId == null || receiptId === '' || u.receiptId === receiptId),
    );
    if (list.length === 0) return null;
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return list[0] ?? null;
  }

  async listEvents(userId: string, limit = 50): Promise<WmsInventoryEventRecord[]> {
    if (this.pool) {
      const res = await this.pool.query<JsonRow<WmsInventoryEventRecord>>(
        'SELECT payload FROM wms_inventory_event WHERE user_id = $1 ORDER BY occurred_at DESC LIMIT $2',
        [userId, limit],
      );
      return res.rows.map((r) => r.payload);
    }
    return this.events.filter((e) => e.userId === userId).slice(-limit).reverse();
  }

  private async getReceipt(userId: string, receiptId: string): Promise<WmsReceiptRecord> {
    if (this.pool) {
      const res = await this.pool.query<JsonRow<WmsReceiptRecord>>(
        'SELECT payload FROM wms_receipt WHERE user_id = $1 AND id = $2',
        [userId, receiptId],
      );
      const receipt = res.rows[0]?.payload;
      if (receipt) return receipt;
    }
    const receipt = this.receipts.get(receiptId);
    if (!receipt || receipt.userId !== userId) throw new Error('Receipt not found');
    return receipt;
  }

  private async getLocation(userId: string, locationId: string): Promise<WmsLocationRecord> {
    if (this.pool) {
      const res = await this.pool.query<JsonRow<WmsLocationRecord>>(
        'SELECT payload FROM wms_location WHERE user_id = $1 AND id = $2',
        [userId, locationId],
      );
      const location = res.rows[0]?.payload;
      if (location) return location;
    }
    const location = this.locations.get(locationId);
    if (!location || location.userId !== userId) throw new Error('Location not found');
    return location;
  }

  private async getUnitByBarcode(userId: string, barcode: string): Promise<WmsInventoryUnitRecord> {
    const unit = await this.findUnitByBarcode(userId, barcode);
    if (!unit) throw new Error('Inventory unit not found');
    return unit;
  }

  private async findUnitByBarcode(userId: string, barcode: string): Promise<WmsInventoryUnitRecord | null> {
    if (this.pool) {
      const res = await this.pool.query<JsonRow<WmsInventoryUnitRecord>>(
        'SELECT payload FROM wms_inventory_unit WHERE user_id = $1 AND barcode = $2',
        [userId, barcode],
      );
      return res.rows[0]?.payload ?? null;
    }
    return [...this.units.values()].find((unit) => unit.userId === userId && unit.barcode === barcode) ?? null;
  }

  private async getContainerByBarcode(userId: string, barcode: string): Promise<WmsContainerRecord> {
    const container = await this.findContainerByBarcode(userId, barcode);
    if (!container) throw new Error('Container not found');
    return container;
  }

  async findContainerByBarcode(userId: string, barcode: string): Promise<WmsContainerRecord | null> {
    if (this.pool) {
      const res = await this.pool.query<JsonRow<WmsContainerRecord>>(
        'SELECT payload FROM wms_container_lpn WHERE user_id = $1 AND barcode = $2',
        [userId, barcode],
      );
      return res.rows[0]?.payload ?? null;
    }
    return [...this.containers.values()].find((container) => container.userId === userId && container.barcode === barcode) ?? null;
  }

  async appendEvent(
    userId: string,
    input: Pick<WmsInventoryEventRecord, 'type' | 'payload'> &
      Partial<
        Pick<
          WmsInventoryEventRecord,
          | 'actorUserId'
          | 'occurredAt'
          | 'warehouseId'
          | 'unitId'
          | 'containerId'
          | 'fromLocationId'
          | 'toLocationId'
          | 'referenceType'
          | 'referenceId'
        >
      >,
  ): Promise<WmsInventoryEventRecord> {
    const event: WmsInventoryEventRecord = {
      id: id('evt'),
      userId,
      occurredAt: input.occurredAt ?? nowIso(),
      actorUserId: input.actorUserId ?? null,
      warehouseId: input.warehouseId ?? null,
      unitId: input.unitId ?? null,
      containerId: input.containerId ?? null,
      fromLocationId: input.fromLocationId ?? null,
      toLocationId: input.toLocationId ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      type: input.type,
      payload: input.payload,
    };
    this.events.push(event);
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO wms_inventory_event (id, user_id, type, occurred_at, warehouse_id, unit_id, container_id, reference_type, reference_id, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
        [
          event.id,
          event.userId,
          event.type,
          event.occurredAt,
          event.warehouseId,
          event.unitId,
          event.containerId,
          event.referenceType,
          event.referenceId,
          JSON.stringify(event),
        ],
      );
    }
    return event;
  }

  private async upsert(
    table: string,
    idValue: string,
    userId: string,
    payload: unknown,
    columns: Record<string, string | null>,
  ): Promise<void> {
    if (!this.pool) return;
    const names = Object.keys(columns);
    const values = Object.values(columns);
    const insertCols = ['id', 'user_id', ...names, 'payload'];
    const params = [idValue, userId, ...values, JSON.stringify(payload)];
    const placeholders = params.map((_, idx) => `$${idx + 1}`);
    const updates = [...names.map((name) => `${name} = EXCLUDED.${name}`), 'payload = EXCLUDED.payload', 'updated_at = NOW()'];
    await this.pool.query(
      `INSERT INTO ${table} (${insertCols.join(', ')}) VALUES (${placeholders.join(', ')})
       ON CONFLICT (id) DO UPDATE SET ${updates.join(', ')}`,
      params,
    );
  }

  private async upsertUnit(unit: WmsInventoryUnitRecord): Promise<void> {
    await this.upsert('wms_inventory_unit', unit.id, unit.userId, unit, {
      barcode: unit.barcode,
      item_id: unit.itemId,
      status: unit.status,
      location_id: unit.locationId,
      container_id: unit.containerId,
    });
  }

  private async upsertContainer(container: WmsContainerRecord): Promise<void> {
    await this.upsert('wms_container_lpn', container.id, container.userId, container, {
      warehouse_id: container.warehouseId,
      barcode: container.barcode,
      type: container.type,
      status: container.status,
      location_id: container.locationId,
      parent_container_id: container.parentContainerId,
    });
  }

  private async nextSerial(table: string, userId: string): Promise<number> {
    if (this.pool) {
      const res = await this.pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${table} WHERE user_id = $1`, [
        userId,
      ]);
      return Number.parseInt(res.rows[0]?.count ?? '0', 10) + 1;
    }
    const size = table === 'wms_container_lpn' ? this.containers.size : this.units.size;
    return size + 1;
  }
}
