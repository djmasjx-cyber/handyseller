-- CreateTable: organization_profile
CREATE TABLE "organization_profile" (
    "id"                   TEXT NOT NULL,
    "user_id"              TEXT NOT NULL,
    "entity_type"          TEXT,
    "tax_system"           TEXT,
    "vat_rate"             TEXT,
    "inn"                  TEXT,
    "kpp"                  TEXT,
    "ogrn"                 TEXT,
    "okpo"                 TEXT,
    "okved"                TEXT,
    "full_name"            TEXT,
    "short_name"           TEXT,
    "legal_address"        TEXT,
    "actual_address"       TEXT,
    "bik"                  TEXT,
    "bank_name"            TEXT,
    "settlement_account"   TEXT,
    "corr_account"         TEXT,
    "org_phone"            TEXT,
    "director_name"        TEXT,
    "chief_accountant"     TEXT,
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_profile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_profile_user_id_key" ON "organization_profile"("user_id");

-- AddForeignKey
ALTER TABLE "organization_profile"
    ADD CONSTRAINT "organization_profile_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
