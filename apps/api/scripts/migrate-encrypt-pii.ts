/**
 * Миграция PII: шифрование email пользователей и backfill email_hash/email_encrypted.
 * Запуск: npx ts-node -r tsconfig-paths/register scripts/migrate-encrypt-pii.ts
 * Требует: DATABASE_URL, ENCRYPTION_KEY в .env
 */
import { PrismaClient } from '@prisma/client';
import { CryptoService } from '../src/common/crypto/crypto.service';

async function main() {
  const prisma = new PrismaClient();
  const crypto = new CryptoService();

  const users = await prisma.user.findMany({
    select: { id: true, email: true, emailHash: true, emailEncrypted: true },
  });

  let updated = 0;
  for (const u of users) {
    if (u.emailHash && u.emailEncrypted) continue; // уже мигрировано
    if (!u.email?.trim()) continue;

    const emailHash = crypto.hashForLookup(u.email);
    const emailEncrypted = crypto.encrypt(u.email.trim());

    await prisma.user.update({
      where: { id: u.id },
      data: { emailHash, emailEncrypted },
    });
    updated++;
  }

  console.log(`PII migration: ${updated} users updated`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
