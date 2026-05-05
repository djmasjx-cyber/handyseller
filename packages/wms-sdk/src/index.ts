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
export type WmsBiImportSourceType = 'FILE' | 'INTEGRATION';
export type WmsBiImportBatchStatus = 'IMPORTED' | 'FAILED';
export type WmsBiTransferOrderKind = 'REPLENISHMENT' | 'TOURIST';
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
  | 'SHIPPED'
  | 'LABEL_PRINTED';

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

export interface WmsBiImportBatchRecord {
  id: string;
  userId: string;
  sourceType: WmsBiImportSourceType;
  sourceName: string;
  fileName: string | null;
  checksum: string | null;
  status: WmsBiImportBatchStatus;
  rawRowCount: number;
  importedRowCount: number;
  errorCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WmsBiRawRowRecord {
  id: string;
  userId: string;
  batchId: string;
  rowNumber: number;
  payload: Record<string, unknown>;
  errors: string[];
  createdAt: string;
}

export interface WmsBiTransferOrderLineRecord {
  id: string;
  userId: string;
  batchId: string;
  rowNumber: number;
  orderRef: string | null;
  orderNumber: string;
  orderDate: string;
  senderWarehouse: string;
  senderWarehouseType: string;
  senderOp: string;
  receiverWarehouse: string;
  receiverWarehouseType: string;
  receiverOp: string;
  itemName: string;
  itemArticle: string | null;
  itemCode: string;
  purpose: string | null;
  baseDocument: string | null;
  isRetailPrice: boolean | null;
  /** Количество (шт.) */
  quantity: number;
  /** Розничная цена за единицу, ₽ (целые рубли, округление вверх при импорте). */
  retailPrice: number | null;
  /** Себестоимость за единицу, ₽ (целые рубли, округление вверх при импорте). */
  costPrice: number | null;
  /** Маржа за строку (розничная цена - себестоимость), ₽. */
  margin: number | null;
  /** Стоимость доставки по строке/заказу, ₽ (может быть заполнена позже). */
  delivery: number | null;
  /** Разница = Маржа - Доставка, если доставка задана; иначе null. */
  difference: number | null;
  /** Контрагент (из файла). */
  counterparty: string | null;
  price: number;
  kind: WmsBiTransferOrderKind;
  createdAt: string;
}

export interface WmsBiTransferOrderLineInput {
  rowNumber: number;
  orderRef?: string | null;
  orderNumber: string;
  orderDate: string;
  senderWarehouse: string;
  receiverWarehouse: string;
  itemName: string;
  itemArticle?: string | null;
  itemCode: string;
  purpose?: string | null;
  baseDocument?: string | null;
  isRetailPrice?: boolean | null;
  quantity?: number | null;
  retailPrice?: number | null;
  costPrice?: number | null;
  margin?: number | null;
  delivery?: number | null;
  difference?: number | null;
  counterparty?: string | null;
  price?: number | null;
}

export interface WmsBiTransferFilters {
  from?: string;
  to?: string;
  receiverWarehouse?: string;
  senderWarehouse?: string;
  receiverOps?: string[];
  senderOps?: string[];
  /** Тип склада **получателя** (`receiver_warehouse_type`). Отбор по отправителю — через «Отправитель». */
  warehouseTypes?: string[];
  /** Подстрочный поиск по названию / коду / артикулу (если не задан itemCodes). */
  item?: string;
  /** Фильтр по точным кодам номенклатуры (мультивыбор из каталога). */
  itemCodes?: string[];
  kind?: WmsBiTransferOrderKind;
  batchId?: string;
  /** Мультивыбор контрагентов (точное совпадение строки из файла). */
  counterparties?: string[];
  qtyMin?: number;
  qtyMax?: number;
  retailMin?: number;
  retailMax?: number;
  costMin?: number;
  costMax?: number;
  /** Пагинация таблицы «по ОП» (сервер обрезает после сортировки). */
  byOpLimit?: number;
  byOpOffset?: number;
  /** Пагинация «туристы по маршрутам». */
  touristsLimit?: number;
  touristsOffset?: number;
  /** Пагинация «риск пополнения». */
  risksLimit?: number;
  risksOffset?: number;
}

export interface WmsBiTransferFilterOptions {
  warehouseTypes: string[];
  receiverOps: string[];
  senderOps: string[];
  counterparties: string[];
}

/** Агрегация строк по полю НоменклатураКод (частота перемещений). */
export interface WmsBiItemFrequencyRow {
  itemCode: string;
  itemArticle: string | null;
  itemName: string;
  rowCount: number;
}

export interface WmsBiTransferSummary {
  rowsTotal: number;
  ordersTotal: number;
  replenishmentRows: number;
  replenishmentOrders: number;
  replenishmentValue: number;
  touristRows: number;
  touristOrders: number;
  touristValue: number;
  valueTotal: number;
  minDate: string | null;
  maxDate: string | null;
}

export interface WmsBiTransferByOpRow {
  receiverWarehouse: string;
  receiverWarehouseType: string;
  receiverOp: string;
  rows: number;
  orders: number;
  replenishmentRows: number;
  touristRows: number;
  valueTotal: number;
  touristValue: number;
  firstDate: string | null;
  lastDate: string | null;
}

/** Строка сводки: один заказ (туристы), для таблицы на уровне заказа. */
export interface WmsBiTouristOrderSummary {
  orderNumber: string;
  senderOp: string;
  receiverOp: string;
  /** Тип/представление склада у получателя. */
  receiverWarehouseType: string;
  /** Число наименований (уникальных НоменклатураКод) в заказе. */
  productCount: number;
  /** Стоимость заказа: сумма РозничнойЦена (fallback: Цена) по туристским строкам. */
  orderTotal: number;
  /** Суммарная себестоимость по заказу. */
  costTotal: number;
  /** Суммарная маржа по заказу. */
  marginTotal: number;
  /** Суммарная доставка по заказу (может быть null/0 для незаполненных заказов). */
  deliveryTotal: number;
  /** Суммарная разница (маржа - доставка) по строкам с заполненной доставкой. */
  differenceTotal: number | null;
  orderDate: string;
}

/** Позиция в детализации заказа (по коду объединены строки Excel). */
export interface WmsBiTouristOrderDetailLine {
  itemCode: string;
  itemName: string;
  quantity: number;
  /** Стоимость единицы, ₽. */
  unitPrice: number;
  /** Сумма = кол-во × стоимость единицы. */
  sum: number;
}

export interface WmsBiTouristOrderDetail {
  orderNumber: string;
  senderOp: string;
  receiverOp: string;
  orderDate: string;
  lines: WmsBiTouristOrderDetailLine[];
}

export interface WmsBiReplenishmentRiskRow {
  receiverWarehouse: string;
  receiverWarehouseType: string;
  receiverOp: string;
  itemCode: string;
  itemArticle: string | null;
  itemName: string;
  replenishmentDate: string;
  nextReplenishmentDate: string | null;
  touristRowsUntilNextReplenishment: number;
  touristOrdersUntilNextReplenishment: number;
  touristValueUntilNextReplenishment: number;
}

export interface WmsBiTransferImportInput {
  fileName: string;
  contentBase64: string;
}

export interface WmsBiTransferImportResult {
  batch: WmsBiImportBatchRecord;
  summary: WmsBiTransferSummary;
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
