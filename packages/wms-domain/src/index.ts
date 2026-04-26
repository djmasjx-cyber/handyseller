import type { WmsLocationRecord } from '@handyseller/wms-sdk';

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
