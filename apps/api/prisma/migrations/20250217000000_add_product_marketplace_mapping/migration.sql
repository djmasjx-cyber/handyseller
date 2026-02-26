-- CreateTable: Связка товара с маркетплейсом по системному ID (nm_id, product_id, ASIN)
CREATE TABLE "ProductMarketplaceMapping" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "marketplace" "MarketplaceType" NOT NULL,
    "external_system_id" TEXT NOT NULL,
    "external_group_id" TEXT,
    "external_article" TEXT,
    "sync_stock" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProductMarketplaceMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductMarketplaceMapping_user_id_marketplace_external_system_key" ON "ProductMarketplaceMapping"("user_id", "marketplace", "external_system_id");
CREATE INDEX "ProductMarketplaceMapping_product_id_idx" ON "ProductMarketplaceMapping"("product_id");
CREATE INDEX "ProductMarketplaceMapping_user_id_marketplace_idx" ON "ProductMarketplaceMapping"("user_id", "marketplace");

-- AddForeignKey
ALTER TABLE "ProductMarketplaceMapping" ADD CONSTRAINT "ProductMarketplaceMapping_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing WB sku to mappings
INSERT INTO "ProductMarketplaceMapping" ("id", "product_id", "user_id", "marketplace", "external_system_id", "external_article", "sync_stock", "is_active")
SELECT
    gen_random_uuid()::text,
    p."id",
    p."user_id",
    'WILDBERRIES'::"MarketplaceType",
    split_part(p."sku", '-', 3),
    p."article",
    true,
    true
FROM "Product" p
WHERE p."sku" IS NOT NULL
  AND p."sku" ~ '^WB-[^-]+-[0-9]+$'
  AND NOT EXISTS (
    SELECT 1 FROM "ProductMarketplaceMapping" m
    WHERE m."product_id" = p."id" AND m."marketplace" = 'WILDBERRIES'
  );
