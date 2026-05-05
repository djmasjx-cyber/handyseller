import type { WmsBiTransferOrderKind, WmsLocationRecord } from '@handyseller/wms-sdk';

/** 11 цифр счётчика (0 … 99_999_999_999). */
const MOD_11 = 100_000_000_000;

/**
 * Единица хранения: ровно **12 цифр**, сквозной номер `000000000001`, `000000000002`, …
 * Первая цифра `0` — тип «единица», чтобы не пересекаться с тарой (LPN).
 *
 * `tenantSeed` оставлен в сигнатуре для совместимости вызовов; не используется.
 */
export function buildUnitBarcode(_tenantSeed: string, serial: number): string {
  const n = Math.max(0, Math.floor(serial)) % MOD_11;
  return `0${String(n).padStart(11, '0')}`;
}

/**
 * Тара (LPN): ровно **12 цифр**, первая цифра `8` — отличие от единиц (`0…`).
 */
export function buildLpnBarcode(_tenantSeed: string, serial: number): string {
  const n = Math.max(0, Math.floor(serial)) % MOD_11;
  return `8${String(n).padStart(11, '0')}`;
}

/** Штрихкод единицы в каноническом 12-значном виде. */
export function isCanonicalUnitBarcode(barcode: string): boolean {
  return /^0\d{11}$/.test(barcode);
}

export function buildLocationPath(parentPath: string | null | undefined, code: string): string {
  const normalizedCode = code.trim().toUpperCase();
  return parentPath ? `${parentPath}/${normalizedCode}` : normalizedCode;
}

export function assertNoLocationCycle(locationId: string, nextParentId: string | null, locations: WmsLocationRecord[]): void {
  let cursor = nextParentId;
  const byId = new Map(locations.map((location) => [location.id, location]));
  while (cursor) {
    if (cursor === locationId) {
      throw new Error('Location topology cannot contain cycles');
    }
    cursor = byId.get(cursor)?.parentId ?? null;
  }
}

export function rankPutawayLocations(locations: WmsLocationRecord[]): WmsLocationRecord[] {
  return [...locations]
    .filter((location) => location.status === 'ACTIVE')
    .sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Ключ заказа в смысле исходного Excel: один **Номер** и одна **календарная дата** (дата без времени).
 * Строки с одним номером и одной датой схлопываются в одну сущность «заказ» для классификации.
 */
export function transferOrderGroupKey(orderNumber: string, orderDateIso: string): string {
  const num = orderNumber.trim();
  const day = orderDateIso.trim().slice(0, 10);
  return `${num}\t${day}`;
}

/**
 * Число строк в группе (Номер + календарная дата), начиная с которого можно применять эвристику
 * «массовое пополнение» для пустых Назначение/ДокументОснование (по умолчанию **строго больше трёх**).
 */
export const WMS_BI_BULK_TRANSFER_MIN_LINES = 4;

function normalizeWarehouseName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Разрешённые **склады-отправители** для типа «Пополнение»: только хабы **Елино** и **Балашиха**
 * (по подстроке в наименовании из 1С, без жёсткого полного совпадения).
 */
export function isAllowedReplenishmentOriginSender(senderWarehouse: string): boolean {
  const s = normalizeWarehouseName(senderWarehouse);
  return s.includes('елино') || s.includes('балаших');
}

/**
 * Для эвристики «многострочное пополнение»: отправитель уже в Елино/Балашиха и это склад **запчастей**
 * (длинные перемещения с пустыми Назначение/ДокументОснование).
 */
export function isBulkSparePartsRouteSender(senderWarehouse: string): boolean {
  const s = normalizeWarehouseName(senderWarehouse);
  if (!isAllowedReplenishmentOriginSender(senderWarehouse)) return false;
  return s.includes('запчаст');
}

export type TransferOrderLineKindInput = {
  orderNumber: string;
  orderDate: string;
  purpose: string | null;
  baseDocument: string | null;
};

export type TransferOrderLineKindClassifyInput = {
  purpose: string | null;
  baseDocument: string | null;
  senderWarehouse: string;
};

/**
 * Классификация **одной строки** Excel «Заказы на перемещение».
 * Пополнение возможно только при отправке **с Елино или Балашиха** ({@link isAllowedReplenishmentOriginSender}):
 * - непустое «Назначение» **или** «ДокументОснование» → Пополнение, если отправитель разрешён, иначе Турист;
 * - оба пусты → Турист, кроме: в группе (Номер + дата) ≥ `bulkMinLines` строк и отправитель под
 *   {@link isBulkSparePartsRouteSender} (Елино/Балашиха + склад запчастей) → Пополнение.
 */
export function classifyTransferOrderLineKind(
  line: TransferOrderLineKindClassifyInput,
  groupLineCount: number,
  opts?: { bulkMinLines?: number },
): WmsBiTransferOrderKind {
  const purpose = line.purpose?.trim() ?? '';
  const baseDocument = line.baseDocument?.trim() ?? '';
  if (purpose || baseDocument) {
    return isAllowedReplenishmentOriginSender(line.senderWarehouse) ? 'REPLENISHMENT' : 'TOURIST';
  }

  const minLines = opts?.bulkMinLines ?? WMS_BI_BULK_TRANSFER_MIN_LINES;
  if (groupLineCount >= minLines && isBulkSparePartsRouteSender(line.senderWarehouse)) {
    return 'REPLENISHMENT';
  }
  return 'TOURIST';
}

/**
 * Упрощённая классификация только по полям строки (без учёта группы и склада).
 * @deprecated Для импорта BI используйте {@link classifyTransferOrderLineKind} с размером группы и отправителем.
 */
export function classifyTransferOrderLine(input: {
  purpose?: string | null;
  baseDocument?: string | null;
}): WmsBiTransferOrderKind {
  const purpose = input.purpose?.trim() ?? '';
  const baseDocument = input.baseDocument?.trim() ?? '';
  return purpose || baseDocument ? 'REPLENISHMENT' : 'TOURIST';
}
