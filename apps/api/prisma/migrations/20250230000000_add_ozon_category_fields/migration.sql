-- Ozon: description_category_id и type_id — выбор категории для выгрузки
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "ozon_category_id" INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "ozon_type_id" INTEGER;
