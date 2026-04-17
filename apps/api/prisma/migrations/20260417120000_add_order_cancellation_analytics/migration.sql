-- Cancellation analytics and status event journal for scalable marketplace order analysis.
CREATE TYPE "OrderCancellationKind" AS ENUM ('CANCELLATION', 'REFUSAL');

ALTER TABLE "Order"
ADD COLUMN "cancellation_kind" "OrderCancellationKind",
ADD COLUMN "cancelled_after_ship" BOOLEAN,
ADD COLUMN "cancellation_initiator" TEXT,
ADD COLUMN "cancellation_type" TEXT,
ADD COLUMN "cancellation_reason" TEXT,
ADD COLUMN "cancellation_reason_id" BIGINT,
ADD COLUMN "cancellation_raw" JSONB;

CREATE TABLE "order_status_event" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "status" "OrderStatus" NOT NULL,
  "raw_status" TEXT,
  "source" TEXT NOT NULL DEFAULT 'sync',
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancellation_kind" "OrderCancellationKind",
  "metadata" JSONB,
  CONSTRAINT "order_status_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_status_event_order_id_occurred_at_idx" ON "order_status_event"("order_id", "occurred_at");

ALTER TABLE "order_status_event"
ADD CONSTRAINT "order_status_event_order_id_fkey"
FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
