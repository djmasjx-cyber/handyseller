-- M2M OAuth clients for external TMS integrations (hashed secret only).
CREATE TABLE "tms_m2m_client" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "label" TEXT,
    "public_id" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "scopes" JSONB NOT NULL DEFAULT '["tms:read", "tms:write"]',
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tms_m2m_client_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tms_m2m_client_public_id_key" ON "tms_m2m_client"("public_id");
CREATE INDEX "tms_m2m_client_user_id_idx" ON "tms_m2m_client"("user_id");

ALTER TABLE "tms_m2m_client" ADD CONSTRAINT "tms_m2m_client_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
