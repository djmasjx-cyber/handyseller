-- Add WB fulfillment type enum and column on Order

CREATE TYPE "WbFulfillmentType" AS ENUM ('FBS', 'DBS', 'DBW');

ALTER TABLE "Order"
ADD COLUMN "wb_fulfillment_type" "WbFulfillmentType";

