-- Refresh token hardening: hash storage + family/revocation metadata
ALTER TABLE "RefreshToken"
  RENAME COLUMN "token" TO "token_hash";

ALTER TABLE "RefreshToken"
  ADD COLUMN "family_id" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "revoked_at" TIMESTAMP(3),
  ADD COLUMN "replaced_by_token_hash" TEXT;

UPDATE "RefreshToken"
SET "family_id" = "id"
WHERE "family_id" = '';

DROP INDEX IF EXISTS "RefreshToken_token_key";
DROP INDEX IF EXISTS "RefreshToken_token_idx";
CREATE UNIQUE INDEX "RefreshToken_token_hash_key" ON "RefreshToken"("token_hash");
CREATE INDEX "RefreshToken_token_hash_idx" ON "RefreshToken"("token_hash");
CREATE INDEX "RefreshToken_family_id_idx" ON "RefreshToken"("family_id");

-- Track login attempts by account as well as IP
ALTER TABLE "LoginAttempt"
  ADD COLUMN "email_hash" TEXT;

CREATE INDEX "LoginAttempt_email_hash_idx" ON "LoginAttempt"("email_hash");

-- Password recovery flow
CREATE TABLE "PasswordResetToken" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordResetToken_token_hash_key" ON "PasswordResetToken"("token_hash");
CREATE INDEX "PasswordResetToken_user_id_idx" ON "PasswordResetToken"("user_id");
CREATE INDEX "PasswordResetToken_expires_at_idx" ON "PasswordResetToken"("expires_at");

ALTER TABLE "PasswordResetToken"
  ADD CONSTRAINT "PasswordResetToken_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
