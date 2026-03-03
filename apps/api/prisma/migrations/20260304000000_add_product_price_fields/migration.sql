-- Add price and old_price to Product for Ozon (Ваша цена, Цена до скидки)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "price" DECIMAL(10,2);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "old_price" DECIMAL(10,2);
