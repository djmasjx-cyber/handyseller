import type { WmsTaskStatus, WmsTaskType } from '@handyseller/wms-sdk';

/** Статусы, из которых допустимо взять задачу в работу (с исполнителем или при первом claim). */
export const PUTAWAY_LIVELY_STATUSES: ReadonlySet<WmsTaskStatus> = new Set([
  'OPEN',
  'ASSIGNED',
  'IN_PROGRESS',
] as const);

/**
 * Можно ли взять PUTAWAY в работу (движение) из текущего статуса.
 * CANCELLED/DONE — нет; дальше типы (PICK) расширяют эту матрицу в том же файле.
 */
export function canExecutePutawayTaskStatus(status: WmsTaskStatus): boolean {
  return PUTAWAY_LIVELY_STATUSES.has(status);
}

/**
 * Взять в работу: диспетчер назначил исполнителя, или исполнитель жмёт «старт».
 * OPEN/ASSIGNED → IN_PROGRESS. Ассайн в OPEN: OPEN → ASSIGNED.
 */
export function nextStatusOnAssignFromOpen(): Extract<WmsTaskStatus, 'ASSIGNED'> {
  return 'ASSIGNED';
}

export function nextStatusOnStartFromOpenOrAssigned(): Extract<WmsTaskStatus, 'IN_PROGRESS'> {
  return 'IN_PROGRESS';
}

export function assertStartPutawayFrom(current: WmsTaskStatus): void {
  if (current !== 'OPEN' && current !== 'ASSIGNED') {
    throw new Error(`Start is only valid from OPEN or ASSIGNED, got ${current}`);
  }
}

export function assertAssignFromOpen(current: WmsTaskStatus): void {
  if (current !== 'OPEN') {
    throw new Error('Assign is only valid from OPEN status');
  }
}

/**
 * Масштабируемая точка расширения: в будущем PICK/SHIP дадим свои матрицы, не плодя if в store.
 */
export function taskTypeSupportsAssignment(type: WmsTaskType): boolean {
  return type === 'PUTAWAY' || type === 'PICK' || type === 'PACK' || type === 'COUNT';
}
