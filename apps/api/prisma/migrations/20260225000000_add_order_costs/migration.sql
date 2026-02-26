-- Логистика и комиссия по заказам (из API WB reportDetailByPeriod, Ozon finance/transaction/list)
ALTER TABLE "Order" ADD COLUMN "logistics_cost" DECIMAL(10,2);
ALTER TABLE "Order" ADD COLUMN "commission_amount" DECIMAL(10,2);
ALTER TABLE "Order" ADD COLUMN "costs_synced_at" TIMESTAMP(3);
