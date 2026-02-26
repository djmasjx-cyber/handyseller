-- AlterEnum: READY_FOR_PICKUP — товар в ПВЗ, ждёт клиента (WB: ready_for_pickup, waiting)
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'READY_FOR_PICKUP';
