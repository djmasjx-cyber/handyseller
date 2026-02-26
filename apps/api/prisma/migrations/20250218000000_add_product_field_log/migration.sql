-- CreateTable
CREATE TABLE "product_field_log" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_field_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_field_log_product_id_idx" ON "product_field_log"("product_id");

-- CreateIndex
CREATE INDEX "product_field_log_created_at_idx" ON "product_field_log"("created_at");

-- AddForeignKey
ALTER TABLE "product_field_log" ADD CONSTRAINT "product_field_log_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_field_log" ADD CONSTRAINT "product_field_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
