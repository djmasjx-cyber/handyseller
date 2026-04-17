import { OrderCancellationKind, OrderStatus } from '@prisma/client';
import { resolveCancellationKind } from './order-cancellation.util';

describe('resolveCancellationKind', () => {
  it('returns null for non-cancelled status', () => {
    const result = resolveCancellationKind({
      marketplace: 'OZON',
      mappedStatus: OrderStatus.SHIPPED,
      ozonCancelledAfterShip: true,
    });
    expect(result).toBeNull();
  });

  it('classifies Ozon cancelled_after_ship=true as refusal', () => {
    const result = resolveCancellationKind({
      marketplace: 'OZON',
      mappedStatus: OrderStatus.CANCELLED,
      ozonCancelledAfterShip: true,
    });
    expect(result).toBe(OrderCancellationKind.REFUSAL);
  });

  it('classifies Ozon cancelled_after_ship=false as cancellation', () => {
    const result = resolveCancellationKind({
      marketplace: 'OZON',
      mappedStatus: OrderStatus.CANCELLED,
      ozonCancelledAfterShip: false,
    });
    expect(result).toBe(OrderCancellationKind.CANCELLATION);
  });

  it('uses delivery lifecycle fallback when prior status is shipped', () => {
    const result = resolveCancellationKind({
      marketplace: 'OZON',
      mappedStatus: OrderStatus.CANCELLED,
      existingStatus: OrderStatus.SHIPPED,
    });
    expect(result).toBe(OrderCancellationKind.REFUSAL);
  });

  it('uses raw delivery signal fallback', () => {
    const result = resolveCancellationKind({
      marketplace: 'WILDBERRIES',
      mappedStatus: OrderStatus.CANCELLED,
      incomingRawStatus: 'delivering',
    });
    expect(result).toBe(OrderCancellationKind.REFUSAL);
  });

  it('defaults to cancellation when no ship signal exists', () => {
    const result = resolveCancellationKind({
      marketplace: 'WILDBERRIES',
      mappedStatus: OrderStatus.CANCELLED,
      incomingRawStatus: 'new',
      existingStatus: OrderStatus.NEW,
    });
    expect(result).toBe(OrderCancellationKind.CANCELLATION);
  });
});
