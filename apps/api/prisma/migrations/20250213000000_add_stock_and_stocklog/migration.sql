-- AlterTable: Product - add article and stock
ALTER TABLE "Product" ADD COLUMN "article" TEXT;
ALTER TABLE "Product" ADD COLUMN "stock" INTEGER NOT NULL DEFAULT 0;

-- CreateEnum: StockLogSource
CREATE TYPE "StockLogSource" AS ENUM ('MANUAL', 'SALE', 'IMPORT', 'SYNC');

-- CreateTable: StockLog
CREATE TABLE "StockLog" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "quantity_before" INTEGER NOT NULL,
    "quantity_after" INTEGER NOT NULL,
    "source" "StockLogSource" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_user_id_article_idx" ON "Product"("user_id", "article");

CREATE INDEX "StockLog_product_id_idx" ON "StockLog"("product_id");
CREATE INDEX "StockLog_user_id_idx" ON "StockLog"("user_id");
CREATE INDEX "StockLog_created_at_idx" ON "StockLog"("created_at");

-- AddForeignKey
ALTER TABLE "StockLog" ADD CONSTRAINT "StockLog_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockLog" ADD CONSTRAINT "StockLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
