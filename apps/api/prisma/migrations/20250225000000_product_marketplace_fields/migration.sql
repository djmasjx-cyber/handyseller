-- Поля для соответствия требованиям маркетплейсов (WB, Ozon, Яндекс)
-- brand — обяз. на WB; weight/width/length/height — обяз. на WB и Ozon; productUrl — обяз. на Яндексе
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "brand" VARCHAR(200);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "weight" INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "width" INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "length" INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "height" INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "product_url" VARCHAR(512);
