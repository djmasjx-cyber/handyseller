-- Add archivedAt for soft delete (archive)
ALTER TABLE "Product" ADD COLUMN "archived_at" TIMESTAMP(3);
