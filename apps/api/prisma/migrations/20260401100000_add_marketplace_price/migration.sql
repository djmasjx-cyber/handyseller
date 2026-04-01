-- AddColumn: marketplace_price to product_marketplace_commission
ALTER TABLE "product_marketplace_commission"
  ADD COLUMN IF NOT EXISTS "marketplace_price" DECIMAL(10,2) NOT NULL DEFAULT 0;
