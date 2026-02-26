-- Шифрование email пользователя: email_hash для поиска при логине, email_encrypted для хранения
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "email_hash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "email_encrypted" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_hash_key" ON "User"("email_hash");

-- LoginAttempt: шифруем email (для блокировки ищем по IP)
ALTER TABLE "LoginAttempt" ADD COLUMN IF NOT EXISTS "email_encrypted" TEXT;
