-- Product marketplace commission snapshots (FBO / FBS)
CREATE TABLE "product_marketplace_commission" (
  "id"                    TEXT NOT NULL,
  "product_id"            TEXT NOT NULL,
  "marketplace"           TEXT NOT NULL,
  "scheme"                TEXT NOT NULL,
  "sales_commission_pct"  DECIMAL(6,2)  NOT NULL DEFAULT 0,
  "sales_commission_amt"  DECIMAL(10,2) NOT NULL DEFAULT 0,
  "logistics_amt"         DECIMAL(10,2) NOT NULL DEFAULT 0,
  "first_mile_amt"        DECIMAL(10,2) NOT NULL DEFAULT 0,
  "return_amt"            DECIMAL(10,2) NOT NULL DEFAULT 0,
  "acceptance_amt"        DECIMAL(10,2) NOT NULL DEFAULT 0,
  "total_fee_amt"         DECIMAL(10,2) NOT NULL DEFAULT 0,
  "synced_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "raw_data"              JSONB,

  CONSTRAINT "product_marketplace_commission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_marketplace_commission_product_marketplace_scheme_key"
  ON "product_marketplace_commission"("product_id", "marketplace", "scheme");

CREATE INDEX "product_marketplace_commission_product_id_idx"
  ON "product_marketplace_commission"("product_id");

ALTER TABLE "product_marketplace_commission"
  ADD CONSTRAINT "product_marketplace_commission_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
