-- Add isFbo to Order: FBO orders (WB DBW, Ozon FBO) do not reduce "Мой склад" stock
ALTER TABLE "Order" ADD COLUMN "is_fbo" BOOLEAN;

-- Backfill: existing WB DBW orders
UPDATE "Order" SET "is_fbo" = true WHERE "wb_fulfillment_type" = 'DBW';
