import type { WmsLocationRecord } from '@handyseller/wms-sdk';

const UNIT_KIND = '20';
const LPN_KIND = '21';

/** Стабильные десятичные цифры из строки (например userId) для вкрапления в штрихкод. */
function tenantDigits(seed: string, len: number): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = h >>> 0;
  const mod = 10 ** len;
  return String(u % mod).padStart(len, '0');
}

/**
 * Штрихкод единицы: только цифры, 20 знаков.
 * Префикс 20 — единица хранения; 13-значный серийный номер; 5 цифр от тенанта.
 */
export function buildUnitBarcode(tenantSeed: string, serial: number): string {
  const ser = Math.max(0, Math.floor(serial)) % 10 ** 13;
  return `${UNIT_KIND}${String(ser).padStart(13, '0')}${tenantDigits(tenantSeed, 5)}`;
}

/**
 * Штрихкод тары (LPN): только цифры, 20 знаков. Префикс 21 — отличие от единиц.
 */
export function buildLpnBarcode(tenantSeed: string, serial: number): string {
  const ser = Math.max(0, Math.floor(serial)) % 10 ** 13;
  return `${LPN_KIND}${String(ser).padStart(13, '0')}${tenantDigits(tenantSeed, 5)}`;
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
