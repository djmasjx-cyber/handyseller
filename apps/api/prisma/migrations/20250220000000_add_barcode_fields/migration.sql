-- Add barcode fields for WB and Ozon
ALTER TABLE "Product" ADD COLUMN "barcode_wb" TEXT;
ALTER TABLE "Product" ADD COLUMN "barcode_ozon" TEXT;
