-- Add WB color fields to Product table
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "wb_color_id" INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "wb_color_name" VARCHAR(100);
