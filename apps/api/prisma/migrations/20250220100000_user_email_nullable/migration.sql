-- Разрешаем null в email: новые пользователи используют только email_hash и email_encrypted
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
