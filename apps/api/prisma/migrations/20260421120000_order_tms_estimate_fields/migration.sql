-- Поля для ручной оценки доставки TMS (адрес прибытия и параметры груза).
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "delivery_address_label" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "tms_cargo_override" JSONB;
