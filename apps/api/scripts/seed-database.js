const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const secretsPath = path.resolve(__dirname, '../../../.env.secrets');
if (fs.existsSync(secretsPath)) {
  require('dotenv').config({ path: secretsPath, override: true, quiet: true });
}

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

// CryptoService for PII encryption (inline to avoid NestJS bootstrap)
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

function encryptOptional(value) {
  if (value == null || value === '') return null;
  return encrypt(value);
}

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set (e.g. in .env or .env.secrets)');
  }
  const emailNorm = email.toLowerCase();
  const emailHash = hashForLookup(email);
  const emailEncrypted = encrypt(emailNorm);
  const passwordHash = await bcrypt.hash(password, 10);
  const encryptedName = encryptOptional('Администратор');

  let user = await prisma.user.findFirst({
    where: { OR: [{ emailHash }, { email: emailNorm }] },
  });
  if (user) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { role: 'ADMIN', passwordHash, emailHash, emailEncrypted },
    });
  } else {
    user = await prisma.user.create({
      data: {
        emailHash,
        emailEncrypted,
        passwordHash,
        name: encryptedName,
        role: 'ADMIN',
        subscription: { create: { plan: 'FREE' } },
      },
    });
  }
  const displayEmail = user.emailEncrypted ? '(encrypted)' : user.email;
  console.log('Seed OK:', displayEmail, 'role:', user.role);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
