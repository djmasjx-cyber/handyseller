-- Add image_urls (JSON array of URLs) for multiple photos on WB
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "image_urls" JSONB;
