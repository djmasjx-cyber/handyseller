import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  assertAssignFromOpen,
  assertNoContainerNestingCycle,
  assertStartPutawayFrom,
  buildLocationPath,
  buildLpnBarcode,
  buildNumericUnitBarcode,
  canExecutePutawayTaskStatus,
  nextStatusOnAssignFromOpen,
  nextStatusOnStartFromOpenOrAssigned,
  type WmsContainerNestingEdge,
} from '@handyseller/wms-domain';
import { WmsAgxIncompleteError, type WmsAgxIncompleteLine } from '../wms.errors';
import type {
  CreateContainerInput,
  CreateItemInput,
  CreateLocationInput,
  CreateReceiptInput,
  CreateWarehouseInput,
  MoveInventoryInput,
  CreatePutawayTaskInput,
  WmsContainerRecord,
  WmsInventoryEventRecord,
  WmsInventoryUnitRecord,
  WmsInventoryUnitStatus,
  WmsItemRecord,
  WmsLocationRecord,
  WmsReceiptRecord,
  WmsTaskRecord,
  WmsTaskStatus,
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
  private readonly tasks = new Map<string, WmsTaskRecord>();
  /** In-memory mirror of `wms_container_content` when DB is off (строки unit и/или вложенной тары). */
  private readonly containerContentRows: Array<{
    id: string;
    userId: string;
    containerId: string;
    unitId: string | null;
    childContainerId: string | null;
  }> = [];

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
      CREATE UNIQUE INDEX IF NOT EXISTS ux_wms_container_content_user_unit
        ON wms_container_content(user_id, unit_id)
        WHERE unit_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS ux_wms_container_content_user_child_container
        ON wms_container_content(user_id, child_container_id)
        WHERE child_container_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS ix_wms_container_content_child_container
        ON wms_container_content(user_id, child_container_id)
        WHERE child_container_id IS NOT NULL;

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

      CREATE SEQUENCE IF NOT EXISTS wms_unit_numeric_barcode_seq;
      SELECT setval(
        'wms_unit_numeric_barcode_seq',
        GREATEST(
          COALESCE(
            (
              SELECT MAX((payload->>'barcode')::bigint)
              FROM wms_inventory_unit
              WHERE (payload->>'barcode') ~ '^[0-9]{12}$'
            ),
            0
          ),
          CASE
            WHEN (SELECT is_called FROM wms_unit_numeric_barcode_seq)
            THEN COALESCE((SELECT last_value FROM wms_unit_numeric_barcode_seq), 0)
            ELSE 0
          END,
          1
        ),
        (
          COALESCE(
            (
              SELECT MAX((payload->>'barcode')::bigint)
              FROM wms_inventory_unit
              WHERE (payload->>'barcode') ~ '^[0-9]{12}$'
            ),
            0
          ) > 0
          OR (SELECT is_called FROM wms_unit_numeric_barcode_seq)
        )
      );
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
    const receipt = await this.loadReceipt(userId, receiptId);
    const lines = receipt.lines.filter((line) => !receiptLineId || line.id === receiptLineId);
    const created: WmsInventoryUnitRecord[] = [];
    const total = lines.reduce((acc, line) => acc + Math.max(line.expectedQty - line.reservedQty, 0), 0);
    const barcodes = await this.allocateNumericBarcodes(userId, total);
    let b = 0;
    for (const line of lines) {
      const qtyToReserve = Math.max(line.expectedQty - line.reservedQty, 0);
      const lineUnitPrice =
        line.unitPrice != null && Number.isFinite(line.unitPrice) && line.unitPrice >= 0 ? line.unitPrice : null;
      for (let i = 0; i < qtyToReserve; i += 1) {
        const ts = nowIso();
        const unit: WmsInventoryUnitRecord = {
          id: id('unit'),
          userId,
          itemId: line.itemId,
          barcode: barcodes[b]!,
          status: 'RESERVED',
          receiptId: receipt.id,
          receiptLineId: line.id,
          locationId: null,
          containerId: null,
          orderWorkId: null,
          declaredUnitPrice: lineUnitPrice,
          createdAt: ts,
          updatedAt: ts,
        };
        b += 1;
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

  /** N последовательных 12-значных штрихкодов: в БД через SEQUENCE, в памяти — через счётчик единиц. */
  private async allocateNumericBarcodes(userId: string, count: number): Promise<string[]> {
    if (count <= 0) return [];
    if (this.pool) {
      const res = await this.pool.query<{ b: string }>(
        `SELECT LPAD(nextval('wms_unit_numeric_barcode_seq')::text, 12, '0') AS b FROM generate_series(1, $1)`,
        [count],
      );
      return res.rows.map((r) => r.b);
    }
    const firstSerial = await this.nextSerial('wms_inventory_unit', userId);
    return Array.from({ length: count }, (_, i) => buildNumericUnitBarcode(firstSerial + i));
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
    const unitBarcodes = input.unitBarcodes ?? [];
    const shouldRecordPackEvent = Boolean(input.containerBarcode && unitBarcodes.length > 0 && !input.archiveTemporaryContainer);

    if (input.containerBarcode) {
      container = await this.getContainerByBarcode(userId, input.containerBarcode);
      if (container.status !== 'ACTIVE') {
        throw new Error('Container is not active');
      }
      if (container.warehouseId !== toLocation.warehouseId) {
        throw new Error('Destination location warehouse does not match container warehouse');
      }
      if (unitBarcodes.length > 0) {
        for (const bc of unitBarcodes) {
          const u = await this.getUnitByBarcode(userId, bc);
          const uw = await this.resolveUnitWarehouseId(userId, u);
          if (uw !== container.warehouseId) {
            throw new Error(`Unit barcode ${bc} is not on the same warehouse as the container`);
          }
          if (!this.unitStatusAllowedInLpn(u.status)) {
            throw new Error(`Unit ${bc} cannot be loaded into a container while in status ${u.status}`);
          }
        }
      }
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

    for (const barcode of unitBarcodes) {
      const unit = await this.getUnitByBarcode(userId, barcode);
      const uw = await this.resolveUnitWarehouseId(userId, unit);
      if (uw !== toLocation.warehouseId) {
        throw new Error(`Unit ${barcode} cannot be moved to a location on a different warehouse`);
      }
      const fromLocationId = unit.locationId;
      unit.locationId = toLocation.id;
      if (container) {
        if (container.status === 'ARCHIVED') {
          await this.removeContainerUnitLink(userId, unit.id);
          unit.containerId = null;
        } else {
          await this.replaceContainerUnitLink(userId, container.id, unit.id);
          unit.containerId = container.id;
        }
      } else if (unit.containerId) {
        await this.removeContainerUnitLink(userId, unit.id);
        unit.containerId = null;
      }
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

    if (shouldRecordPackEvent && container && container.status === 'ACTIVE') {
      await this.appendEvent(userId, {
        type: 'CONTAINER_PACKED',
        warehouseId: toLocation.warehouseId,
        containerId: container.id,
        referenceType: 'CONTAINER',
        referenceId: container.id,
        payload: { containerBarcode: container.barcode, unitBarcodes },
      });
    }
    if (
      input.archiveTemporaryContainer &&
      container &&
      container.type === 'RECEIVING_TOTE' &&
      container.status === 'ARCHIVED' &&
      unitBarcodes.length > 0
    ) {
      await this.appendEvent(userId, {
        type: 'CONTAINER_UNPACKED',
        warehouseId: toLocation.warehouseId,
        containerId: container.id,
        referenceType: 'CONTAINER',
        referenceId: container.id,
        payload: { reason: 'RECEIVING_TOTE_ARCHIVED', unitBarcodes },
      });
    }

    return { units: movedUnits, container };
  }

  async lookupBarcode(userId: string, barcode: string): Promise<{ kind: string; record: unknown } | null> {
    const unit = await this.findUnitByBarcode(userId, barcode);
    if (unit) {
      const u = await this.reconcileUnitContainerFromContentTable(userId, unit);
      return { kind: 'UNIT', record: u };
    }
    const container = await this.findContainerByBarcode(userId, barcode);
    if (container) {
      const loadedUnitCount = await this.countUnitsInContainer(userId, container.id);
      return { kind: 'LPN', record: { ...container, loadedUnitCount } };
    }
    const locations = await this.listLocations(userId);
    const location = locations.find((l) => l.code === barcode || l.path === barcode);
    if (location) return { kind: 'LOCATION', record: location };
    return null;
  }

  /** Единицы, привязанные к LPN через `wms_container_content`. */
  async listUnitsInContainer(userId: string, containerId: string): Promise<WmsInventoryUnitRecord[]> {
    if (this.pool) {
      const res = await this.pool.query<JsonRow<WmsInventoryUnitRecord>>(
        `SELECT u.payload AS payload
         FROM wms_inventory_unit u
         INNER JOIN wms_container_content c
           ON c.unit_id = u.id AND c.user_id = u.user_id
         WHERE c.user_id = $1 AND c.container_id = $2 AND c.unit_id IS NOT NULL
         ORDER BY u.barcode ASC`,
        [userId, containerId],
      );
      return res.rows.map((r) => r.payload);
    }
    const unitIds = this.containerContentRows
      .filter((r) => r.userId === userId && r.containerId === containerId && r.unitId)
      .map((r) => r.unitId!);
    const out: WmsInventoryUnitRecord[] = [];
    for (const uid of unitIds) {
      const u = this.units.get(uid);
      if (u && u.userId === userId) out.push(u);
    }
    out.sort((a, b) => a.barcode.localeCompare(b.barcode));
    return out;
  }

  async getContainerContents(
    userId: string,
    opts: { containerId?: string; barcode?: string },
  ): Promise<{ container: WmsContainerRecord; units: WmsInventoryUnitRecord[]; nestedContainers: WmsContainerRecord[] }> {
    let container: WmsContainerRecord | null = null;
    if (opts.containerId?.trim()) {
      container = await this.loadContainerById(userId, opts.containerId.trim());
    } else if (opts.barcode?.trim()) {
      container = await this.findContainerByBarcode(userId, opts.barcode.trim());
    } else {
      throw new Error('Provide containerId or barcode');
    }
    if (!container) throw new Error('Container not found');
    const raw = await this.listUnitsInContainer(userId, container.id);
    const units = await Promise.all(raw.map((u) => this.reconcileUnitContainerFromContentTable(userId, u)));
    const nestedIds = await this.listNestedChildContainerIds(userId, container.id);
    const nestedContainers: WmsContainerRecord[] = [];
    for (const cid of nestedIds) {
      const c = await this.loadContainerById(userId, cid);
      if (c) nestedContainers.push(c);
    }
    nestedContainers.sort((a, b) => a.barcode.localeCompare(b.barcode));
    return { container, units, nestedContainers };
  }

  /** Единицы с данным `location_id` (включая лежащие в LPN в этой ячейке). */
  async listUnitsAtLocation(userId: string, locationId: string): Promise<WmsInventoryUnitRecord[]> {
    if (this.pool) {
      const res = await this.pool.query<JsonRow<WmsInventoryUnitRecord>>(
        `SELECT payload FROM wms_inventory_unit
         WHERE user_id = $1 AND location_id = $2
         ORDER BY barcode ASC`,
        [userId, locationId],
      );
      return res.rows.map((r) => r.payload);
    }
    return [...this.units.values()]
      .filter((u) => u.userId === userId && u.locationId === locationId)
      .sort((a, b) => a.barcode.localeCompare(b.barcode));
  }

  async listContainersAtLocation(userId: string, locationId: string): Promise<WmsContainerRecord[]> {
    if (this.pool) {
      const res = await this.pool.query<JsonRow<WmsContainerRecord>>(
        `SELECT payload FROM wms_container_lpn
         WHERE user_id = $1 AND location_id = $2
         ORDER BY barcode ASC`,
        [userId, locationId],
      );
      return res.rows.map((r) => r.payload);
    }
    return [...this.containers.values()]
      .filter((c) => c.userId === userId && c.locationId === locationId)
      .sort((a, b) => a.barcode.localeCompare(b.barcode));
  }

  async getLocationContents(userId: string, locationId: string): Promise<{
    location: WmsLocationRecord;
    units: WmsInventoryUnitRecord[];
    containers: WmsContainerRecord[];
  }> {
    const location = await this.getLocation(userId, locationId);
    const [units, containers] = await Promise.all([
      this.listUnitsAtLocation(userId, locationId),
      this.listContainersAtLocation(userId, locationId),
    ]);
    const reconciledUnits = await Promise.all(units.map((u) => this.reconcileUnitContainerFromContentTable(userId, u)));
    return { location, units: reconciledUnits, containers };
  }

  private async listNestedChildContainerIds(userId: string, parentContainerId: string): Promise<string[]> {
    if (this.pool) {
      const res = await this.pool.query<{ cid: string }>(
        `SELECT child_container_id AS cid FROM wms_container_content
         WHERE user_id = $1 AND container_id = $2 AND child_container_id IS NOT NULL`,
        [userId, parentContainerId],
      );
      return res.rows.map((r) => r.cid);
    }
    return this.containerContentRows
      .filter((r) => r.userId === userId && r.containerId === parentContainerId && r.childContainerId)
      .map((r) => r.childContainerId!);
  }

  private async listContainerNestingEdges(userId: string): Promise<WmsContainerNestingEdge[]> {
    if (this.pool) {
      const res = await this.pool.query<WmsContainerNestingEdge>(
        `SELECT container_id AS "parentContainerId", child_container_id AS "childContainerId"
         FROM wms_container_content
         WHERE user_id = $1 AND child_container_id IS NOT NULL`,
        [userId],
      );
      return res.rows;
    }
    return this.containerContentRows
      .filter((r) => r.userId === userId && r.childContainerId)
      .map((r) => ({ parentContainerId: r.containerId, childContainerId: r.childContainerId! }));
  }

  private async deleteChildNestingRows(userId: string, childContainerId: string): Promise<void> {
    if (this.pool) {
      await this.pool.query('DELETE FROM wms_container_content WHERE user_id = $1 AND child_container_id = $2', [
        userId,
        childContainerId,
      ]);
    } else {
      for (let i = this.containerContentRows.length - 1; i >= 0; i -= 1) {
        const row = this.containerContentRows[i]!;
        if (row.userId === userId && row.childContainerId === childContainerId) this.containerContentRows.splice(i, 1);
      }
    }
  }

  private async insertChildContainerNestingRow(userId: string, parentId: string, childId: string): Promise<void> {
    const rowId = id('ccnt');
    const payload = { nestedAt: nowIso() };
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO wms_container_content (id, user_id, container_id, unit_id, child_container_id, payload)
         VALUES ($1, $2, $3, NULL, $4, $5::jsonb)`,
        [rowId, userId, parentId, childId, JSON.stringify(payload)],
      );
    } else {
      this.containerContentRows.push({
        id: rowId,
        userId,
        containerId: parentId,
        unitId: null,
        childContainerId: childId,
      });
    }
  }

  async nestChildContainerUnderParent(
    userId: string,
    parentBarcode: string,
    childBarcode: string,
  ): Promise<{ parent: WmsContainerRecord; child: WmsContainerRecord }> {
    const parent = await this.getContainerByBarcode(userId, parentBarcode.trim());
    const child = await this.getContainerByBarcode(userId, childBarcode.trim());
    if (parent.status !== 'ACTIVE' || child.status !== 'ACTIVE') {
      throw new Error('Both containers must be ACTIVE');
    }
    if (parent.warehouseId !== child.warehouseId) {
      throw new Error('Containers must belong to the same warehouse');
    }
    if (!parent.locationId || parent.locationId !== child.locationId) {
      throw new Error('Nesting requires both containers at the same location_id');
    }
    await this.deleteChildNestingRows(userId, child.id);
    const edges = await this.listContainerNestingEdges(userId);
    const withoutOld = edges.filter((e) => e.childContainerId !== child.id);
    assertNoContainerNestingCycle(parent.id, child.id, [
      ...withoutOld,
      { parentContainerId: parent.id, childContainerId: child.id },
    ]);
    await this.insertChildContainerNestingRow(userId, parent.id, child.id);
    child.parentContainerId = parent.id;
    child.updatedAt = nowIso();
    this.containers.set(child.id, child);
    await this.upsertContainer(child);
    await this.appendEvent(userId, {
      type: 'CONTAINER_PACKED',
      warehouseId: parent.warehouseId,
      containerId: parent.id,
      referenceType: 'CONTAINER',
      referenceId: child.id,
      payload: { kind: 'NEST', parentBarcode: parent.barcode, childBarcode: child.barcode },
    });
    return { parent, child };
  }

  /** Снять вложенность дочерней LPN: удалить ребро в `wms_container_content`, очистить `parentContainerId`. */
  async unnestChildContainer(userId: string, childBarcode: string): Promise<WmsContainerRecord> {
    const child = await this.getContainerByBarcode(userId, childBarcode.trim());
    const hadNesting = await this.hasChildNestingContentRow(userId, child.id);
    if (!hadNesting && !child.parentContainerId) {
      throw new Error('Container is not nested under a parent LPN');
    }
    if (child.status !== 'ACTIVE') {
      throw new Error('Only ACTIVE containers can be unnested');
    }
    await this.deleteChildNestingRows(userId, child.id);
    child.parentContainerId = null;
    child.updatedAt = nowIso();
    this.containers.set(child.id, child);
    await this.upsertContainer(child);
    await this.appendEvent(userId, {
      type: 'CONTAINER_UNPACKED',
      warehouseId: child.warehouseId,
      containerId: child.id,
      referenceType: 'CONTAINER',
      referenceId: child.id,
      payload: { reason: 'UNNEST', childBarcode: child.barcode },
    });
    return child;
  }

  private async hasChildNestingContentRow(userId: string, childContainerId: string): Promise<boolean> {
    if (this.pool) {
      const res = await this.pool.query<{ n: string }>(
        `SELECT 1::text AS n FROM wms_container_content
         WHERE user_id = $1 AND child_container_id = $2 LIMIT 1`,
        [userId, childContainerId],
      );
      return Boolean(res.rows[0]);
    }
    return this.containerContentRows.some((r) => r.userId === userId && r.childContainerId === childContainerId);
  }

  async listTasks(userId: string, warehouseId?: string): Promise<WmsTaskRecord[]> {
    if (this.pool) {
      const res = await this.pool.query<JsonRow<WmsTaskRecord>>(
        `SELECT payload FROM wms_task WHERE user_id = $1 AND ($2::text IS NULL OR warehouse_id = $2) ORDER BY id DESC LIMIT 200`,
        [userId, warehouseId ?? null],
      );
      return res.rows.map((r) => r.payload);
    }
    return [...this.tasks.values()]
      .filter((t) => t.userId === userId && (!warehouseId || t.warehouseId === warehouseId))
      .sort((a, b) => b.id.localeCompare(a.id));
  }

  async createPutawayTask(userId: string, input: CreatePutawayTaskInput): Promise<WmsTaskRecord> {
    const ubs = (input.unitBarcodes ?? []).map((b) => b.trim()).filter(Boolean);
    const cbc = input.containerBarcode?.trim() ?? '';
    if (!ubs.length && !cbc) {
      throw new Error('Putaway task requires unitBarcodes and/or containerBarcode');
    }
    const loc = await this.getLocation(userId, input.targetLocationId);
    if (loc.warehouseId !== input.warehouseId.trim()) {
      throw new Error('Target location is not on the given warehouse');
    }
    const ts = nowIso();
    const payload: Record<string, unknown> = {
      kind: 'PUTAWAY',
      targetLocationId: input.targetLocationId,
      unitBarcodes: ubs,
      containerBarcode: cbc || null,
      note: input.note?.trim() || null,
    };
    const task: WmsTaskRecord = {
      id: id('task'),
      userId,
      warehouseId: loc.warehouseId,
      type: 'PUTAWAY',
      status: 'OPEN',
      assigneeUserId: null,
      priority: 100,
      payload,
      createdAt: ts,
      updatedAt: ts,
    };
    this.tasks.set(task.id, task);
    await this.upsertTask(task);
    await this.appendEvent(userId, {
      type: 'TASK_CREATED',
      warehouseId: task.warehouseId,
      referenceType: 'TASK',
      referenceId: task.id,
      payload: { taskType: task.type, targetLocationId: input.targetLocationId },
    });
    return task;
  }

  /**
   * Назначение на исполнителя (диспетчер). Дальше — `startPutawayTask` или `complete` (последний сам
   * переводит OPEN/ASSIGNED → IN_PROGRESS при необходимости, чтобы сценарий «без клика старт» остался).
   */
  async assignPutawayTask(userId: string, taskId: string, assigneeUserId: string): Promise<WmsTaskRecord> {
    const aid = assigneeUserId?.trim() ?? '';
    if (!aid) throw new Error('assigneeUserId is required');
    const task = await this.loadTask(userId, taskId);
    if (task.type !== 'PUTAWAY') throw new Error('Only PUTAWAY tasks can be assigned with this operation');
    assertAssignFromOpen(task.status as WmsTaskStatus);
    const next: WmsTaskStatus = nextStatusOnAssignFromOpen();
    const prev = task.status;
    task.status = next;
    task.assigneeUserId = aid;
    task.updatedAt = nowIso();
    this.tasks.set(task.id, task);
    await this.upsertTask(task);
    await this.appendEvent(userId, {
      type: 'TASK_STATUS_CHANGED',
      warehouseId: task.warehouseId,
      referenceType: 'TASK',
      referenceId: task.id,
      payload: { from: prev, to: next, assigneeUserId: task.assigneeUserId, action: 'assign' },
    });
    return task;
  }

  async startPutawayTask(userId: string, taskId: string, actorUserId: string): Promise<WmsTaskRecord> {
    const task = await this.loadTask(userId, taskId);
    if (task.type !== 'PUTAWAY') throw new Error('Only PUTAWAY tasks can be started with this operation');
    assertStartPutawayFrom(task.status as WmsTaskStatus);
    const prev = task.status;
    const next: WmsTaskStatus = nextStatusOnStartFromOpenOrAssigned();
    task.status = next;
    task.assigneeUserId = task.assigneeUserId ?? actorUserId;
    task.updatedAt = nowIso();
    this.tasks.set(task.id, task);
    await this.upsertTask(task);
    await this.appendEvent(userId, {
      type: 'TASK_STATUS_CHANGED',
      warehouseId: task.warehouseId,
      referenceType: 'TASK',
      referenceId: task.id,
      payload: { from: prev, to: next, assigneeUserId: task.assigneeUserId, action: 'start' },
    });
    return task;
  }

  private async ensurePutawayInProgressForMove(
    userId: string,
    task: WmsTaskRecord,
    actorUserId: string,
  ): Promise<void> {
    if (task.status === 'IN_PROGRESS') return;
    if (!canExecutePutawayTaskStatus(task.status as WmsTaskStatus)) {
      throw new Error(`Task cannot be executed from status ${task.status}`);
    }
    const prev = task.status;
    const next: WmsTaskStatus = 'IN_PROGRESS';
    task.status = next;
    task.assigneeUserId = task.assigneeUserId ?? actorUserId;
    task.updatedAt = nowIso();
    this.tasks.set(task.id, task);
    await this.upsertTask(task);
    await this.appendEvent(userId, {
      type: 'TASK_STATUS_CHANGED',
      warehouseId: task.warehouseId,
      referenceType: 'TASK',
      referenceId: task.id,
      payload: { from: prev, to: next, assigneeUserId: task.assigneeUserId, action: 'claim' },
    });
  }

  async getTask(userId: string, taskId: string): Promise<WmsTaskRecord> {
    return this.loadTask(userId, taskId);
  }

  async completePutawayTask(
    userId: string,
    taskId: string,
    actorUserId: string,
  ): Promise<{ task: WmsTaskRecord; result: { units: WmsInventoryUnitRecord[]; container?: WmsContainerRecord } }> {
    const task = await this.loadTask(userId, taskId);
    if (task.status === 'CANCELLED') {
      throw new Error('Task is cancelled');
    }
    if (task.status === 'DONE') {
      return { task, result: { units: [] } };
    }
    if (task.type !== 'PUTAWAY') {
      throw new Error('Only PUTAWAY tasks can be completed with this operation');
    }
    if (!canExecutePutawayTaskStatus(task.status as WmsTaskStatus)) {
      throw new Error(`Task cannot be completed from status ${task.status}`);
    }
    await this.ensurePutawayInProgressForMove(userId, task, actorUserId);
    if (task.status !== 'IN_PROGRESS') {
      throw new Error('Task must be IN_PROGRESS to execute putaway');
    }
    const p = task.payload as { targetLocationId?: string; unitBarcodes?: string[]; containerBarcode?: string | null };
    const toLocationId = p.targetLocationId;
    if (!toLocationId) throw new Error('Task payload missing targetLocationId');
    const unitBarcodes = Array.isArray(p.unitBarcodes) ? p.unitBarcodes.filter(Boolean) : [];
    const containerBarcode = p.containerBarcode?.trim() || undefined;
    if (!containerBarcode && !unitBarcodes.length) {
      throw new Error('Task has nothing to move');
    }
    const result = await this.moveInventory(userId, {
      toLocationId,
      containerBarcode,
      unitBarcodes: unitBarcodes.length ? unitBarcodes : undefined,
    });
    task.status = 'DONE';
    task.updatedAt = nowIso();
    this.tasks.set(task.id, task);
    await this.upsertTask(task);
    await this.appendEvent(userId, {
      type: 'TASK_COMPLETED',
      warehouseId: task.warehouseId,
      referenceType: 'TASK',
      referenceId: task.id,
      payload: { taskType: task.type, actorUserId },
    });
    return { task, result };
  }

  private async loadTask(userId: string, taskId: string): Promise<WmsTaskRecord> {
    if (this.pool) {
      const res = await this.pool.query<JsonRow<WmsTaskRecord>>(
        'SELECT payload FROM wms_task WHERE user_id = $1 AND id = $2',
        [userId, taskId],
      );
      const t = res.rows[0]?.payload;
      if (t) return t;
    }
    const t = this.tasks.get(taskId);
    if (!t || t.userId !== userId) throw new Error('Task not found');
    return t;
  }

  private async upsertTask(task: WmsTaskRecord): Promise<void> {
    this.tasks.set(task.id, task);
    await this.upsert('wms_task', task.id, task.userId, task, {
      warehouse_id: task.warehouseId,
      type: task.type,
      status: task.status,
      assignee_user_id: task.assigneeUserId,
      priority: String(task.priority),
    });
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

  async listReceipts(userId: string): Promise<WmsReceiptRecord[]> {
    if (this.pool) {
      const res = await this.pool.query<JsonRow<WmsReceiptRecord>>(
        'SELECT payload FROM wms_receipt WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 100',
        [userId],
      );
      return res.rows.map((r) => r.payload);
    }
    return [...this.receipts.values()]
      .filter((r) => r.userId === userId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async findItemBySku(userId: string, sku: string): Promise<WmsItemRecord | null> {
    const key = sku.trim();
    if (!key) return null;
    if (this.pool) {
      const res = await this.pool.query<JsonRow<WmsItemRecord>>(
        'SELECT payload FROM wms_item WHERE user_id = $1 AND sku = $2 LIMIT 1',
        [userId, key],
      );
      return res.rows[0]?.payload ?? null;
    }
    return [...this.items.values()].find((item) => item.userId === userId && item.sku === key) ?? null;
  }

  async updateItemDimensions(
    userId: string,
    itemId: string,
    dims: { weightGrams: number; lengthMm: number; widthMm: number; heightMm: number },
  ): Promise<WmsItemRecord> {
    const item = await this.loadItem(userId, itemId);
    item.dimensions = { ...item.dimensions, ...dims };
    item.updatedAt = nowIso();
    this.items.set(item.id, item);
    await this.upsert('wms_item', item.id, userId, item, {
      sku: item.sku,
      core_product_id: item.coreProductId,
    });
    await this.appendEvent(userId, {
      type: 'ADJUSTED',
      referenceType: 'ITEM',
      referenceId: item.id,
      payload: { reason: 'AGX', sku: item.sku, dimensions: dims },
    });
    return item;
  }

  async createInvoiceReceipt(
    userId: string,
    input: {
      warehouseId: string;
      number: string;
      lines: Array<{ article: string; title: string; quantity: number; price: number }>;
    },
  ): Promise<{ receipt: WmsReceiptRecord; units: WmsInventoryUnitRecord[] }> {
    const builtLines: CreateReceiptInput['lines'] = [];
    for (const row of input.lines) {
      const sku = row.article.trim();
      const title = row.title.trim();
      const qty = Math.floor(Number(row.quantity));
      const price = Number(row.price);
      if (!sku || !title || qty < 1 || Number.isNaN(price) || price < 0) continue;
      let item = await this.findItemBySku(userId, sku);
      if (!item) {
        item = await this.createItem(userId, { sku, article: sku, title, serialTracking: true });
      }
      builtLines.push({
        itemId: item.id,
        expectedQty: qty,
        unitPrice: price,
        sku,
        lineTitle: title,
      });
    }
    if (!builtLines.length) {
      throw new Error('Invoice must contain at least one valid line.');
    }
    const receipt = await this.createReceipt(userId, {
      warehouseId: input.warehouseId,
      number: input.number.trim(),
      source: 'INVOICE',
      supplierName: null,
      lines: builtLines,
    });
    const units = await this.reserveReceiptBarcodes(userId, receipt.id);
    const fresh = await this.loadReceipt(userId, receipt.id);
    return { receipt: fresh, units };
  }

  async acceptReceipt(userId: string, receiptId: string): Promise<WmsReceiptRecord> {
    const receipt = await this.loadReceipt(userId, receiptId);
    if (receipt.status === 'RECEIVED' || receipt.status === 'CLOSED') {
      return receipt;
    }
    const incompleteLines: WmsAgxIncompleteLine[] = [];
    for (const line of receipt.lines) {
      const item = await this.loadItem(userId, line.itemId);
      const missing = this.agxMissingKeys(item);
      if (missing.length) {
        incompleteLines.push({
          lineId: line.id,
          itemId: line.itemId,
          sku: line.sku ?? item.sku,
          lineTitle: line.lineTitle ?? item.title ?? null,
          missing,
        });
      }
    }
    if (incompleteLines.length) {
      throw new WmsAgxIncompleteError(incompleteLines);
    }
    const units = await this.listUnitsForReceipt(userId, receiptId);
    let receivedCount = 0;
    for (const unit of units) {
      if (unit.status !== 'RESERVED') continue;
      unit.status = 'RECEIVED';
      unit.updatedAt = nowIso();
      receivedCount += 1;
      await this.upsertUnit(unit);
      await this.appendEvent(userId, {
        type: 'UNIT_RECEIVED',
        warehouseId: receipt.warehouseId,
        unitId: unit.id,
        referenceType: 'RECEIPT',
        referenceId: receipt.id,
        payload: { barcode: unit.barcode, receiptLineId: unit.receiptLineId },
      });
    }
    receipt.status = 'RECEIVED';
    receipt.updatedAt = nowIso();
    await this.upsert('wms_receipt', receipt.id, userId, receipt, {
      warehouse_id: receipt.warehouseId,
      number: receipt.number,
      status: receipt.status,
    });
    await this.appendEvent(userId, {
      type: 'RECEIPT_COMPLETED',
      warehouseId: receipt.warehouseId,
      referenceType: 'RECEIPT',
      referenceId: receipt.id,
      payload: { number: receipt.number, receivedUnits: receivedCount },
    });
    return receipt;
  }

  async getReceiptDetail(
    userId: string,
    receiptId: string,
  ): Promise<{ receipt: WmsReceiptRecord; units: WmsInventoryUnitRecord[] }> {
    const receipt = await this.loadReceipt(userId, receiptId);
    const units = await this.listUnitsForReceipt(userId, receiptId);
    return { receipt, units };
  }

  private agxMissingKeys(item: WmsItemRecord): Array<'weightGrams' | 'lengthMm' | 'widthMm' | 'heightMm'> {
    const d = item.dimensions ?? {};
    const ok = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;
    const missing: Array<'weightGrams' | 'lengthMm' | 'widthMm' | 'heightMm'> = [];
    if (!ok(d.weightGrams)) missing.push('weightGrams');
    if (!ok(d.lengthMm)) missing.push('lengthMm');
    if (!ok(d.widthMm)) missing.push('widthMm');
    if (!ok(d.heightMm)) missing.push('heightMm');
    return missing;
  }

  private async listUnitsForReceipt(userId: string, receiptId: string): Promise<WmsInventoryUnitRecord[]> {
    if (this.pool) {
      const res = await this.pool.query<JsonRow<WmsInventoryUnitRecord>>(
        `SELECT payload FROM wms_inventory_unit WHERE user_id = $1 AND (payload->>'receiptId') = $2`,
        [userId, receiptId],
      );
      return res.rows.map((r) => r.payload);
    }
    return [...this.units.values()].filter((u) => u.userId === userId && u.receiptId === receiptId);
  }

  private async loadReceipt(userId: string, receiptId: string): Promise<WmsReceiptRecord> {
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

  private async loadItem(userId: string, itemId: string): Promise<WmsItemRecord> {
    if (this.pool) {
      const res = await this.pool.query<JsonRow<WmsItemRecord>>(
        'SELECT payload FROM wms_item WHERE user_id = $1 AND id = $2',
        [userId, itemId],
      );
      const item = res.rows[0]?.payload;
      if (item) return item;
    }
    const item = this.items.get(itemId);
    if (!item || item.userId !== userId) throw new Error('Item not found');
    return item;
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
    return this.reconcileUnitContainerFromContentTable(userId, unit);
  }

  /**
   * Источник правды по «в какой таре единица» — строка в `wms_container_content`.
   * Приводим `unit.containerId` в соответствие (устраняет рассинхрон после сбоев/миграций).
   */
  private async reconcileUnitContainerFromContentTable(
    userId: string,
    unit: WmsInventoryUnitRecord,
  ): Promise<WmsInventoryUnitRecord> {
    const canonical = await this.getCanonicalContainerIdForUnit(userId, unit.id);
    const current = unit.containerId ?? null;
    if (canonical === current) return unit;
    const next: WmsInventoryUnitRecord = { ...unit, containerId: canonical, updatedAt: nowIso() };
    this.units.set(unit.id, next);
    await this.upsertUnit(next);
    return next;
  }

  private async getCanonicalContainerIdForUnit(userId: string, unitId: string): Promise<string | null> {
    if (this.pool) {
      const res = await this.pool.query<{ container_id: string }>(
        'SELECT container_id FROM wms_container_content WHERE user_id = $1 AND unit_id = $2 LIMIT 1',
        [userId, unitId],
      );
      return res.rows[0]?.container_id ?? null;
    }
    const row = this.containerContentRows.find((r) => r.userId === userId && r.unitId === unitId);
    return row?.containerId ?? null;
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

  private async findContainerByBarcode(userId: string, barcode: string): Promise<WmsContainerRecord | null> {
    if (this.pool) {
      const res = await this.pool.query<JsonRow<WmsContainerRecord>>(
        'SELECT payload FROM wms_container_lpn WHERE user_id = $1 AND barcode = $2',
        [userId, barcode],
      );
      return res.rows[0]?.payload ?? null;
    }
    return [...this.containers.values()].find((container) => container.userId === userId && container.barcode === barcode) ?? null;
  }

  private async loadContainerById(userId: string, containerId: string): Promise<WmsContainerRecord | null> {
    if (this.pool) {
      const res = await this.pool.query<JsonRow<WmsContainerRecord>>(
        'SELECT payload FROM wms_container_lpn WHERE user_id = $1 AND id = $2',
        [userId, containerId],
      );
      return res.rows[0]?.payload ?? null;
    }
    const c = this.containers.get(containerId);
    if (!c || c.userId !== userId) return null;
    return c;
  }

  private unitStatusAllowedInLpn(status: WmsInventoryUnitStatus): boolean {
    return status === 'RECEIVED' || status === 'STORED' || status === 'IN_BUFFER';
  }

  /** Склад единицы: из ячейки или из приходного документа. */
  private async resolveUnitWarehouseId(userId: string, unit: WmsInventoryUnitRecord): Promise<string> {
    if (unit.locationId) {
      const loc = await this.getLocation(userId, unit.locationId);
      return loc.warehouseId;
    }
    if (unit.receiptId) {
      const r = await this.loadReceipt(userId, unit.receiptId);
      return r.warehouseId;
    }
    throw new Error('Cannot resolve warehouse for inventory unit (missing location and receipt)');
  }

  private async countUnitsInContainer(userId: string, containerId: string): Promise<number> {
    if (this.pool) {
      const res = await this.pool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM wms_container_content
         WHERE user_id = $1 AND container_id = $2 AND unit_id IS NOT NULL`,
        [userId, containerId],
      );
      return Number.parseInt(res.rows[0]?.n ?? '0', 10);
    }
    return this.containerContentRows.filter((r) => r.userId === userId && r.containerId === containerId && r.unitId).length;
  }

  private async removeContainerUnitLink(userId: string, unitId: string): Promise<void> {
    if (this.pool) {
      await this.pool.query('DELETE FROM wms_container_content WHERE user_id = $1 AND unit_id = $2', [userId, unitId]);
    } else {
      for (let i = this.containerContentRows.length - 1; i >= 0; i -= 1) {
        const row = this.containerContentRows[i]!;
        if (row.userId === userId && row.unitId === unitId) this.containerContentRows.splice(i, 1);
      }
    }
  }

  private async replaceContainerUnitLink(userId: string, containerId: string, unitId: string): Promise<void> {
    await this.removeContainerUnitLink(userId, unitId);
    const rowId = id('ccnt');
    const payload = { attachedAt: nowIso() };
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO wms_container_content (id, user_id, container_id, unit_id, child_container_id, payload)
         VALUES ($1, $2, $3, $4, NULL, $5::jsonb)`,
        [rowId, userId, containerId, unitId, JSON.stringify(payload)],
      );
    } else {
      this.containerContentRows.push({ id: rowId, userId, containerId, unitId, childContainerId: null });
    }
  }

  private async appendEvent(
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
