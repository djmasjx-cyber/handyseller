-- Create table for WB FBS supplies, per HandySeller user.

CREATE TABLE "WbSupply" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id" TEXT NOT NULL,
    "wb_supply_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "warehouse_id" TEXT,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WbSupply_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WbSupply_user_id_wb_supply_id_key" ON "WbSupply"("user_id", "wb_supply_id");

ALTER TABLE "WbSupply"
ADD CONSTRAINT "WbSupply_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

