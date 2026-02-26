-- CreateIndex: идемпотентность заказов — один externalId на маркетплейс на пользователя
CREATE UNIQUE INDEX "Order_user_id_marketplace_external_id_key" ON "Order"("user_id", "marketplace", "external_id");
CREATE INDEX "Order_user_id_marketplace_idx" ON "Order"("user_id", "marketplace");
