ALTER TABLE "Order"
ADD COLUMN IF NOT EXISTS "tms_contact_override" JSONB;
