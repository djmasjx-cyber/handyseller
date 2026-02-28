-- Add MANUAL to MarketplaceType for manual (custom) orders
ALTER TYPE "MarketplaceType" ADD VALUE IF NOT EXISTS 'MANUAL';

-- Add sales_source to Order (for MANUAL orders: "Авито", "Инстаграм", etc.)
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "sales_source" TEXT;

-- Create SalesSource table for autocomplete of sales channels
CREATE TABLE IF NOT EXISTS "SalesSource" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SalesSource_user_id_name_key" ON "SalesSource"("user_id", "name");
CREATE INDEX IF NOT EXISTS "SalesSource_user_id_idx" ON "SalesSource"("user_id");

ALTER TABLE "SalesSource" ADD CONSTRAINT "SalesSource_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
