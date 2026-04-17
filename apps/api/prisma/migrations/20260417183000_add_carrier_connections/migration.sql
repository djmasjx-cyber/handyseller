-- CreateEnum
CREATE TYPE "CarrierCode" AS ENUM ('MAJOR_EXPRESS');

-- CreateEnum
CREATE TYPE "CarrierServiceType" AS ENUM ('EXPRESS', 'LTL');

-- CreateTable
CREATE TABLE "carrier_connection" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "carrier_code" "CarrierCode" NOT NULL,
    "service_type" "CarrierServiceType" NOT NULL DEFAULT 'EXPRESS',
    "account_label" TEXT,
    "contract_label" TEXT,
    "login" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT true,
    "last_validated_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carrier_connection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "carrier_connection_user_id_carrier_code_idx" ON "carrier_connection"("user_id", "carrier_code");

-- CreateIndex
CREATE INDEX "carrier_connection_user_id_carrier_code_service_type_idx" ON "carrier_connection"("user_id", "carrier_code", "service_type");

-- AddForeignKey
ALTER TABLE "carrier_connection" ADD CONSTRAINT "carrier_connection_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
