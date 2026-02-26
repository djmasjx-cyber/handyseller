-- Таблица кодов подтверждения email при регистрации (TTL 15 минут)
CREATE TABLE "EmailVerification" (
    "id" TEXT NOT NULL,
    "email_hash" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name_encrypted" TEXT,
    "phone_encrypted" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailVerification_email_hash_key" ON "EmailVerification"("email_hash");
CREATE INDEX "EmailVerification_email_hash_idx" ON "EmailVerification"("email_hash");
CREATE INDEX "EmailVerification_expires_at_idx" ON "EmailVerification"("expires_at");
