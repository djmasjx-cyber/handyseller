-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "vtb_order_id" TEXT,
    "payment_method" TEXT,
    "refundable" BOOLEAN NOT NULL DEFAULT true,
    "refunded_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "idempotency_key" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vtb_webhooks" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT,
    "event_type" TEXT NOT NULL,
    "vtb_order_id" TEXT,
    "payload" JSONB NOT NULL,
    "signature" VARCHAR(512),
    "ip_address" VARCHAR(45),
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processing_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vtb_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_vtb_order_id_key" ON "payments"("vtb_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_user_id_idx" ON "payments"("user_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_vtb_order_id_idx" ON "payments"("vtb_order_id");

-- CreateIndex
CREATE INDEX "payments_subject_type_subject_id_idx" ON "payments"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "payments_created_at_idx" ON "payments"("created_at");

-- CreateIndex
CREATE INDEX "vtb_webhooks_vtb_order_id_idx" ON "vtb_webhooks"("vtb_order_id");

-- CreateIndex
CREATE INDEX "vtb_webhooks_processed_idx" ON "vtb_webhooks"("processed");

-- CreateIndex
CREATE INDEX "vtb_webhooks_created_at_idx" ON "vtb_webhooks"("created_at");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vtb_webhooks" ADD CONSTRAINT "vtb_webhooks_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
