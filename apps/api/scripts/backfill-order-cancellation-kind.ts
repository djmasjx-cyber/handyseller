#!/usr/bin/env node
import * as dotenv from 'dotenv';
import * as path from 'path';
import {
  PrismaClient,
  Prisma,
  OrderCancellationKind,
  OrderStatus,
  type MarketplaceType,
} from '@prisma/client';
import { resolveCancellationKind } from '../src/modules/orders/order-cancellation.util';

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.secrets'), override: true });
dotenv.config({ path: '/opt/handyseller/.env.production', override: true });

const prisma = new PrismaClient();

const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 500);
const DRY_RUN = process.env.DRY_RUN === '1';
const FORCE_RECALC = process.env.FORCE_RECALC === '1';
type BackfillOrder = Prisma.OrderGetPayload<{
  select: {
    id: true;
    marketplace: true;
    status: true;
    rawStatus: true;
    cancelledAfterShip: true;
    cancellationKind: true;
    statusEvents: {
      select: { status: true; rawStatus: true };
    };
  };
}>;

function statusFromHistory(events: Array<{ status: OrderStatus }>): OrderStatus | undefined {
  const deliveryPriority: OrderStatus[] = [
    OrderStatus.DELIVERED,
    OrderStatus.READY_FOR_PICKUP,
    OrderStatus.SHIPPED,
  ];
  for (const s of deliveryPriority) {
    if (events.some((e) => e.status === s)) return s;
  }
  return undefined;
}

function rawStatusFromHistory(events: Array<{ rawStatus: string | null }>): string | null {
  for (const e of events) {
    if (e.rawStatus && e.rawStatus.trim()) return e.rawStatus;
  }
  return null;
}

async function main() {
  console.log(
    `[backfill] start BATCH_SIZE=${BATCH_SIZE} DRY_RUN=${DRY_RUN ? '1' : '0'} FORCE_RECALC=${FORCE_RECALC ? '1' : '0'}`,
  );

  let processed = 0;
  let changed = 0;
  let skipped = 0;
  let cursorId: string | null = null;
  const byKind: Record<OrderCancellationKind, number> = {
    [OrderCancellationKind.CANCELLATION]: 0,
    [OrderCancellationKind.REFUSAL]: 0,
  };

  for (;;) {
    const orders: BackfillOrder[] = await prisma.order.findMany({
      where: {
        status: OrderStatus.CANCELLED,
        ...(FORCE_RECALC ? {} : { cancellationKind: null }),
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: {
        id: true,
        marketplace: true,
        status: true,
        rawStatus: true,
        cancelledAfterShip: true,
        cancellationKind: true,
        statusEvents: {
          orderBy: { occurredAt: 'desc' },
          select: { status: true, rawStatus: true },
        },
      },
    });
    if (orders.length === 0) break;

    for (const o of orders) {
      processed += 1;

      const existingStatus = statusFromHistory(o.statusEvents);
      const existingRawStatus = rawStatusFromHistory(o.statusEvents);
      const nextKind = resolveCancellationKind({
        marketplace: o.marketplace as MarketplaceType,
        mappedStatus: o.status,
        incomingRawStatus: o.rawStatus,
        existingStatus,
        existingRawStatus,
        ozonCancelledAfterShip: o.cancelledAfterShip ?? undefined,
      });

      if (!nextKind) {
        skipped += 1;
        continue;
      }

      byKind[nextKind] += 1;
      if (o.cancellationKind === nextKind) {
        skipped += 1;
        continue;
      }

      changed += 1;
      if (!DRY_RUN) {
        await prisma.order.update({
          where: { id: o.id },
          data: { cancellationKind: nextKind },
        });
      }
    }

    cursorId = orders[orders.length - 1]?.id ?? null;
    console.log(`[backfill] processed=${processed} changed=${changed} skipped=${skipped}`);
  }

  console.log('[backfill] done', {
    processed,
    changed,
    skipped,
    byKind,
    dryRun: DRY_RUN,
    forceRecalc: FORCE_RECALC,
  });
}

main()
  .catch((e) => {
    console.error('[backfill] failed', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
