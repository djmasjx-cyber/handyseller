-- Reviews with moderation workflow
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED');

CREATE TABLE "review" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "rating" INTEGER NOT NULL DEFAULT 5,
  "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
  "admin_note" TEXT,
  "moderated_by" TEXT,
  "moderated_at" TIMESTAMP(3),
  "published_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "review_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "review_status_created_at_idx" ON "review"("status", "created_at");
CREATE INDEX "review_user_id_created_at_idx" ON "review"("user_id", "created_at");

ALTER TABLE "review"
  ADD CONSTRAINT "review_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
