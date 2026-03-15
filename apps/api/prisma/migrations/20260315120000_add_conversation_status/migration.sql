-- AlterTable: add status to assistant_conversation
ALTER TABLE "assistant_conversation" ADD COLUMN "status" VARCHAR(30) NOT NULL DEFAULT 'active';
