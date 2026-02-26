-- AlterTable
ALTER TABLE "User" ADD COLUMN "linked_to_user_id" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_linkedToUserId_fkey" FOREIGN KEY ("linked_to_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
