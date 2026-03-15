-- CreateTable: assistant_operator
CREATE TABLE "assistant_operator" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "chat_id" VARCHAR(32) NOT NULL UNIQUE,
  "type" VARCHAR(30) NOT NULL DEFAULT 'primary',
  "title" VARCHAR(255),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
