-- CreateTable
CREATE TABLE "OrderProcessingTime" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "processing_time_min" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'sync_proxy',
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderProcessingTime_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderProcessingTime_order_id_key" ON "OrderProcessingTime"("order_id");

-- CreateIndex
CREATE INDEX "OrderProcessingTime_order_id_idx" ON "OrderProcessingTime"("order_id");

-- AddForeignKey
ALTER TABLE "OrderProcessingTime" ADD CONSTRAINT "OrderProcessingTime_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate valid legacy data (processing_time_min <= 72h)
INSERT INTO "OrderProcessingTime" (id, order_id, processing_time_min, source, calculated_at)
SELECT gen_random_uuid()::text, id, "processing_time_min", 'sync_proxy', NOW()
FROM "Order"
WHERE "processing_time_min" IS NOT NULL AND "processing_time_min" <= 4320;
