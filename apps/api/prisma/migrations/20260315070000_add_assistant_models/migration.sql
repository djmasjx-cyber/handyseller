-- CreateTable
CREATE TABLE "assistant_knowledge" (
    "id" TEXT NOT NULL,
    "source_url" VARCHAR(1024),
    "title" VARCHAR(500) NOT NULL,
    "content" TEXT NOT NULL,
    "category" VARCHAR(100),
    "hash" VARCHAR(64) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_knowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_conversation" (
    "id" TEXT NOT NULL,
    "session_id" VARCHAR(128) NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_message" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "content" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "tokens_used" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_unanswered" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "session_id" VARCHAR(128),
    "answer" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_unanswered_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assistant_knowledge_hash_key" ON "assistant_knowledge"("hash");

-- CreateIndex
CREATE INDEX "assistant_knowledge_category_idx" ON "assistant_knowledge"("category");

-- CreateIndex
CREATE INDEX "assistant_knowledge_is_active_idx" ON "assistant_knowledge"("is_active");

-- CreateIndex
CREATE INDEX "assistant_conversation_session_id_idx" ON "assistant_conversation"("session_id");

-- CreateIndex
CREATE INDEX "assistant_message_conversation_id_idx" ON "assistant_message"("conversation_id");

-- CreateIndex
CREATE INDEX "assistant_message_created_at_idx" ON "assistant_message"("created_at");

-- CreateIndex
CREATE INDEX "assistant_unanswered_resolved_idx" ON "assistant_unanswered"("resolved");

-- CreateIndex
CREATE INDEX "assistant_unanswered_created_at_idx" ON "assistant_unanswered"("created_at");

-- AddForeignKey
ALTER TABLE "assistant_message" ADD CONSTRAINT "assistant_message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "assistant_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
