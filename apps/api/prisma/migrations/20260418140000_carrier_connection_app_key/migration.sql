-- Ключ приложения перевозчика (например appKey Деловых Линий), хранится зашифрованным в приложении.
ALTER TABLE "carrier_connection" ADD COLUMN IF NOT EXISTS "app_key" TEXT;
