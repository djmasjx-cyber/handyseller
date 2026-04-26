export type WmsWarehouseKind = 'PHYSICAL' | 'VIRTUAL';
export type WmsWarehouseStatus = 'ACTIVE' | 'BLOCKED' | 'ARCHIVED';

export type WmsLocationType =
  | 'WAREHOUSE'
  | 'ZONE'
  | 'AISLE'
  | 'RACK'
  | 'LEVEL'
  | 'SECTION'
  | 'SHELF'
  | 'BIN'
  | 'SUB_BIN'
  | 'BUFFER'
  | 'STAGING'
  | 'SHIPMENT_DOCK';

export type WmsLocationStatus = 'ACTIVE' | 'BLOCKED' | 'ARCHIVED';
export type WmsBarcodeKind = 'UNIT' | 'LPN' | 'LOCATION' | 'ORDER' | 'EXTERNAL';
export type WmsContainerType = 'RECEIVING_TOTE' | 'TOTE' | 'BOX' | 'PALLET' | 'SHIPMENT_BATCH';
export type WmsContainerStatus = 'ACTIVE' | 'EMPTY' | 'SEALED' | 'ARCHIVED';
export type WmsInventoryUnitStatus =
  | 'RESERVED'
  | 'RECEIVED'
  | 'IN_BUFFER'
  | 'STORED'
  | 'ALLOCATED'
  | 'PICKED'
  | 'PACKED'
  | 'SHIPPED'
  | 'QUARANTINED'
  | 'ADJUSTED';

export type WmsReceiptStatus = 'DRAFT' | 'EXPECTED' | 'RECEIVING' | 'RECEIVED' | 'CLOSED' | 'CANCELLED';
export type WmsTaskType = 'RECEIVE' | 'PUTAWAY' | 'MOVE' | 'PICK' | 'PACK' | 'COUNT' | 'SHIP';
export type WmsTaskStatus = 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
export type WmsInventoryEventType =
  | 'WAREHOUSE_CREATED'
  | 'LOCATION_CREATED'
  | 'ITEM_CREATED'
  | 'ITEM_UPDATED'
  | 'RECEIPT_CREATED'
  | 'RECEIPT_ACCEPTED'
  | 'BARCODE_RESERVED'
  | 'UNIT_RECEIVED'
  | 'LPN_CREATED'
  | 'CONTAINER_PACKED'
  | 'CONTAINER_UNPACKED'
  | 'MOVED'
  | 'ALLOCATED'
  | 'PICKED'
  | 'PACKED'
  | 'COUNTED'
  | 'ADJUSTED'
  | 'SHIPPED';

export interface WmsWarehouseRecord {
  id: string;
  userId: string;
  code: string;
  name: string;
  kind: WmsWarehouseKind;
  status: WmsWarehouseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WmsLocationRecord {
  id: string;
  userId: string;
  warehouseId: string;
  parentId: string | null;
  type: WmsLocationType;
  code: string;
  name: string;
  path: string;
  status: WmsLocationStatus;
  capacity?: Record<string, unknown> | null;
  constraints?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface WmsItemRecord {
  id: string;
  userId: string;
  coreProductId: string | null;
  sku: string;
  article: string | null;
  title: string;
  gtin: string | null;
  requiresDataMatrix: boolean;
  serialTracking: boolean;
  shelfLifeDays: number | null;
  dimensions: {
    weightGrams?: number | null;
    widthMm?: number | null;
    lengthMm?: number | null;
    heightMm?: number | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface WmsReceiptLineInput {
  itemId: string;
  expectedQty: number;
  unitLabel?: string | null;
}

export interface WmsReceiptRecord {
  id: string;
  userId: string;
  warehouseId: string;
  number: string;
  status: WmsReceiptStatus;
  source: string | null;
  supplierName: string | null;
  createdAt: string;
  updatedAt: string;
  lines: Array<WmsReceiptLineInput & { id: string; reservedQty: number; receivedQty: number }>;
}

export interface WmsInventoryUnitRecord {
  id: string;
  userId: string;
  itemId: string;
  barcode: string;
  status: WmsInventoryUnitStatus;
  receiptId: string | null;
  receiptLineId: string | null;
  locationId: string | null;
  containerId: string | null;
  orderWorkId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WmsContainerRecord {
  id: string;
  userId: string;
  warehouseId: string;
  barcode: string;
  type: WmsContainerType;
  status: WmsContainerStatus;
  locationId: string | null;
  parentContainerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WmsInventoryEventRecord {
  id: string;
  userId: string;
  type: WmsInventoryEventType;
  occurredAt: string;
  actorUserId: string | null;
  warehouseId: string | null;
  unitId: string | null;
  containerId: string | null;
  fromLocationId: string | null;
  toLocationId: string | null;
  referenceType: string | null;
  referenceId: string | null;
  payload: Record<string, unknown>;
}

export interface CreateWarehouseInput {
  code: string;
  name: string;
  kind?: WmsWarehouseKind;
}

export interface CreateLocationInput {
  warehouseId: string;
  parentId?: string | null;
  type: WmsLocationType;
  code: string;
  name: string;
  capacity?: Record<string, unknown> | null;
  constraints?: Record<string, unknown> | null;
}

export interface CreateItemInput {
  coreProductId?: string | null;
  sku: string;
  article?: string | null;
  title: string;
  gtin?: string | null;
  requiresDataMatrix?: boolean;
  serialTracking?: boolean;
  shelfLifeDays?: number | null;
  dimensions?: WmsItemRecord['dimensions'];
}

export interface CreateReceiptInput {
  warehouseId: string;
  number: string;
  source?: string | null;
  supplierName?: string | null;
  lines: WmsReceiptLineInput[];
}

export interface CreateContainerInput {
  warehouseId: string;
  type: WmsContainerType;
  locationId?: string | null;
  parentContainerId?: string | null;
}

export interface MoveInventoryInput {
  unitBarcodes?: string[];
  containerBarcode?: string;
  toLocationId: string;
  archiveTemporaryContainer?: boolean;
}
