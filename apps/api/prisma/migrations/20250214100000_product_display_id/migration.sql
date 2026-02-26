-- Сквозной счётчик товаров (ID): 1, 2, 3... Уникален для всех клиентов
CREATE SEQUENCE IF NOT EXISTS product_display_id_seq;

ALTER TABLE "Product" ADD COLUMN "display_id" INTEGER;

-- Backfill: присваиваем 1, 2, 3... по порядку создания
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "created_at", id) AS rn
  FROM "Product"
  WHERE "display_id" IS NULL
)
UPDATE "Product" p
SET "display_id" = n.rn
FROM numbered n
WHERE p.id = n.id;

-- Синхронизируем sequence
SELECT setval('product_display_id_seq', (SELECT COALESCE(MAX("display_id"), 1) FROM "Product"));

ALTER TABLE "Product" ALTER COLUMN "display_id" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "display_id" SET DEFAULT nextval('product_display_id_seq');
CREATE UNIQUE INDEX IF NOT EXISTS "Product_display_id_key" ON "Product"("display_id");
