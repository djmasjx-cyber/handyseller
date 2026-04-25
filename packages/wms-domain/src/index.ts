import type { WmsLocationRecord } from '@handyseller/wms-sdk';

export {
  canExecutePutawayTaskStatus,
  nextStatusOnAssignFromOpen,
  nextStatusOnStartFromOpenOrAssigned,
  assertStartPutawayFrom,
  assertAssignFromOpen,
  taskTypeSupportsAssignment,
  PUTAWAY_LIVELY_STATUSES,
} from './task-workflow';

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

/** Сквозная нумерация единиц вида 000000123456 (фиксированная длина). */
export function buildNumericUnitBarcode(serial: number, width = 12): string {
  const n = Math.max(0, Math.floor(serial));
  const s = String(n);
  if (s.length > width) {
    throw new Error(`Numeric barcode overflow: serial ${n} exceeds width ${width}`);
  }
  return s.padStart(width, '0');
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

/** Ребро «родительская тара содержит дочернюю LPN» в `wms_container_content`. */
export type WmsContainerNestingEdge = {
  parentContainerId: string;
  childContainerId: string;
};

/**
 * Запрет циклов во вложенности LPN: если `child` уже (транзитивно) содержит `parent`,
 * добавление `parent` → `child` замкнёт граф.
 */
export function assertNoContainerNestingCycle(
  parentContainerId: string,
  childContainerId: string,
  existingEdges: WmsContainerNestingEdge[],
): void {
  if (parentContainerId === childContainerId) {
    throw new Error('Container cannot be nested into itself');
  }
  const parentsOf = new Map<string, string[]>();
  for (const e of existingEdges) {
    const list = parentsOf.get(e.childContainerId) ?? [];
    list.push(e.parentContainerId);
    parentsOf.set(e.childContainerId, list);
  }
  const queue = [...(parentsOf.get(parentContainerId) ?? [])];
  const seen = new Set<string>();
  while (queue.length) {
    const x = queue.shift()!;
    if (x === childContainerId) {
      throw new Error('Container nesting would create a cycle');
    }
    if (seen.has(x)) continue;
    seen.add(x);
    queue.push(...(parentsOf.get(x) ?? []));
  }
}
