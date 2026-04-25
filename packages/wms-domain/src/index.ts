import type { WmsLocationRecord } from '@handyseller/wms-sdk';

const UNIT_PREFIX = 'HU';
const LPN_PREFIX = 'HL';

function padSerial(value: number): string {
  return Math.max(value, 0).toString(36).toUpperCase().padStart(8, '0');
}

function checksum(value: string): string {
  const sum = Array.from(value).reduce((acc, ch, idx) => acc + ch.charCodeAt(0) * (idx + 1), 0);
  return (sum % 97).toString().padStart(2, '0');
}

export function buildUnitBarcode(tenantSeed: string, serial: number): string {
  const core = `${UNIT_PREFIX}${tenantSeed.slice(0, 4).toUpperCase()}${padSerial(serial)}`;
  return `${core}${checksum(core)}`;
}

export function buildLpnBarcode(tenantSeed: string, serial: number): string {
  const core = `${LPN_PREFIX}${tenantSeed.slice(0, 4).toUpperCase()}${padSerial(serial)}`;
  return `${core}${checksum(core)}`;
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
