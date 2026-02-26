-- Данные для печати этикеток: штрих-код товара и этикетка заказа
-- WB: номер стикера для QR. Ozon: posting_number для этикетки заказа.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "wb_sticker_number" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "ozon_posting_number" TEXT;

-- Штрих-коды товара на момент заказа (для печати этикеток товара)
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "product_barcode_wb" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "product_barcode_ozon" TEXT;
