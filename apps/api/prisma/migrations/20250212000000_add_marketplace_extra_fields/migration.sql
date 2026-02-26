-- AlterTable
ALTER TABLE "MarketplaceConnection" ADD COLUMN "seller_id" TEXT;
ALTER TABLE "MarketplaceConnection" ADD COLUMN "warehouse_id" TEXT;
ALTER TABLE "MarketplaceConnection" ADD COLUMN "last_sync_at" TIMESTAMP(3);
ALTER TABLE "MarketplaceConnection" ADD COLUMN "last_error" TEXT;
