import type { ShipmentStatus } from '@handyseller/tms-sdk';

type StatusSource = 'refresh' | 'webhook';

type MapperResult = {
  status: ShipmentStatus | null;
  matchedBy: string | null;
};

const CANONICAL_STATUSES = new Set<ShipmentStatus>([
  'CREATED',
  'CONFIRMED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELETED_EXTERNAL',
  'SUPERSEDED',
]);

const GENERIC_RULES: Array<{ id: string; match: RegExp; status: ShipmentStatus }> = [
  { id: 'generic_deleted', match: /(NOT[\s_-]*FOUND|DELETED|CANCEL|CANCELED|CANCELLED|УДАЛЕН|ОТМЕН)/i, status: 'DELETED_EXTERNAL' },
  { id: 'generic_delivered', match: /(DELIVERED|DELIVERY_COMPLETE|ВРУЧЕН|ДОСТАВЛЕН)/i, status: 'DELIVERED' },
  { id: 'generic_out_for_delivery', match: /(OUT_FOR_DELIVERY|ON_COURIER|НА[\s_-]*ДОСТАВК)/i, status: 'OUT_FOR_DELIVERY' },
  { id: 'generic_in_transit', match: /(IN_TRANSIT|IN[\s_-]*WAY|В[\s_-]*ПУТИ|ТРАНЗИТ)/i, status: 'IN_TRANSIT' },
  { id: 'generic_confirmed', match: /(CONFIRMED|ACCEPTED|SUCCESS|ПРИНЯТ|ОФОРМЛЕН)/i, status: 'CONFIRMED' },
  { id: 'generic_created', match: /(CREATED|NEW|DRAFT|СОЗДАН)/i, status: 'CREATED' },
];

const CDEK_RULES: Array<{ id: string; match: RegExp; status: ShipmentStatus }> = [
  { id: 'cdek_removed', match: /(INVALID\s+ORDER|ORDER\s+NOT\s+FOUND|ORDER\s+WAS\s+REMOVED)/i, status: 'DELETED_EXTERNAL' },
];

const DELLIN_RULES: Array<{ id: string; match: RegExp; status: ShipmentStatus }> = [
  { id: 'dellin_deleted', match: /(ORDER\s+NOT\s+FOUND|DECLINED|CANCELED)/i, status: 'DELETED_EXTERNAL' },
];

const MAJOR_RULES: Array<{ id: string; match: RegExp; status: ShipmentStatus }> = [
  { id: 'major_removed', match: /(NOT\s+FOUND|CANCELLED|CANCELED)/i, status: 'DELETED_EXTERNAL' },
];

const DALLI_RULES: Array<{ id: string; match: RegExp; status: ShipmentStatus }> = [
  { id: 'dalli_delivered', match: /(^|\b)COMPLETE(\b|$)/i, status: 'DELIVERED' },
  { id: 'dalli_out_for_delivery', match: /(^|\b)DELIVERY(\b|$)|COURIERDELIVERED/i, status: 'OUT_FOR_DELIVERY' },
  { id: 'dalli_confirmed', match: /(^|\b)(NEW|ACCEPTED|CONFIRM)(\b|$)/i, status: 'CONFIRMED' },
  { id: 'dalli_canceled', match: /(^|\b)(CANCELED|RETURNED|LOST)(\b|$)/i, status: 'DELETED_EXTERNAL' },
];

function rulesForCarrier(carrier: string | undefined): Array<{ id: string; match: RegExp; status: ShipmentStatus }> {
  const id = (carrier ?? '').trim().toLowerCase();
  if (id === 'cdek') return CDEK_RULES;
  if (id === 'dellin') return DELLIN_RULES;
  if (id === 'major-express') return MAJOR_RULES;
  if (id === 'dalli-service') return DALLI_RULES;
  return [];
}

export function extractCarrierStatusHint(body: Record<string, unknown>): string | undefined {
  const pick = (...values: unknown[]): string | undefined => {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return undefined;
  };
  const meta = (body.meta ?? body.metadata ?? body.data ?? body.payload) as Record<string, unknown> | undefined;
  return pick(
    body.status,
    body.orderStatus,
    body.shipmentStatus,
    body.state,
    body.deliveryStatus,
    meta?.status,
    meta?.orderStatus,
    meta?.shipmentStatus,
    meta?.state,
    meta?.deliveryStatus,
  );
}

export function normalizeCarrierShipmentStatus(
  rawStatus: string | undefined,
  carrier: string | undefined,
  _source: StatusSource,
): MapperResult {
  if (!rawStatus) return { status: null, matchedBy: null };
  const normalized = rawStatus.trim().toUpperCase();
  if (!normalized) return { status: null, matchedBy: null };
  if (CANONICAL_STATUSES.has(normalized as ShipmentStatus)) {
    return { status: normalized as ShipmentStatus, matchedBy: 'canonical' };
  }

  for (const rule of rulesForCarrier(carrier)) {
    if (rule.match.test(normalized)) {
      return { status: rule.status, matchedBy: rule.id };
    }
  }
  for (const rule of GENERIC_RULES) {
    if (rule.match.test(normalized)) {
      return { status: rule.status, matchedBy: rule.id };
    }
  }
  return { status: null, matchedBy: null };
}
