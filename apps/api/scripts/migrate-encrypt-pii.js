/**
 * Миграция PII: backfill email_hash и email_encrypted для пользователей с plaintext email.
 * Запуск: node scripts/migrate-encrypt-pii.js
 * Требует: DATABASE_URL, ENCRYPTION_KEY
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const secretsPath = path.resolve(__dirname, '../../../.env.secrets');
if (fs.existsSync(secretsPath)) {
  require('dotenv').config({ path: secretsPath, override: true, quiet: true });
}

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const KEY = process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length >= 32
  ? crypto.scryptSync(process.env.ENCRYPTION_KEY, 'handyseller-salt', 32)
  : crypto.scryptSync('dev-only-change-in-production-32chars!!', 'handyseller-salt', 32);

function hashForLookup(value) {
  const normalized = value.toLowerCase().trim();
  return crypto.createHmac('sha256', KEY).update('pii:' + normalized).digest('hex');
}

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv, { authTagLength: 16 });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, emailHash: true, emailEncrypted: true },
  });

  let updated = 0;
  for (const u of users) {
    if (u.emailHash && u.emailEncrypted) continue;
    if (!u.email?.trim()) continue;

    const emailNorm = u.email.trim().toLowerCase();
    const emailHash = hashForLookup(u.email);
    const emailEncrypted = encrypt(emailNorm);

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
