import { type MarketplaceType, OrderCancellationKind, OrderStatus } from '@prisma/client';

function isDeliveryLifecycleStatus(status: OrderStatus): boolean {
  return (
    status === OrderStatus.SHIPPED ||
    status === OrderStatus.READY_FOR_PICKUP ||
    status === OrderStatus.DELIVERED
  );
}

function hasDeliverySignalInRawStatus(rawStatus: string | undefined | null): boolean {
  const s = (rawStatus ?? '').toLowerCase().trim();
  if (!s) return false;
  return [
    'delivering',
    'ready_for_pickup',
    'pickup',
    'delivered',
    'sold',
    'receive',
  ].includes(s);
}

export function resolveCancellationKind(params: {
  marketplace: MarketplaceType;
  mappedStatus: OrderStatus;
  incomingRawStatus?: string | null;
  existingStatus?: OrderStatus;
  existingRawStatus?: string | null;
  ozonCancelledAfterShip?: boolean;
}): OrderCancellationKind | null {
  if (params.mappedStatus !== OrderStatus.CANCELLED) return null;

  if (params.marketplace === 'OZON') {
    if (params.ozonCancelledAfterShip === true) return OrderCancellationKind.REFUSAL;
    if (params.ozonCancelledAfterShip === false) return OrderCancellationKind.CANCELLATION;
  }

  if (params.existingStatus && isDeliveryLifecycleStatus(params.existingStatus)) {
    return OrderCancellationKind.REFUSAL;
  }

  if (
    hasDeliverySignalInRawStatus(params.existingRawStatus) ||
    hasDeliverySignalInRawStatus(params.incomingRawStatus)
  ) {
    return OrderCancellationKind.REFUSAL;
  }

  return OrderCancellationKind.CANCELLATION;
}
