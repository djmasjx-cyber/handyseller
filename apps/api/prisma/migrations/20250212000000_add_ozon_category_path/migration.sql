-- Ozon: путь категории для отображения в UI
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "ozon_category_path" VARCHAR(500);
