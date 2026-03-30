/**
 * Обернуть текущий материал ключа (как в CryptoService без DEK) в KMS без смены байтов DEK.
 * После добавления ENCRYPTION_DEK_WRAPPED в окружение существующие ciphertext в БД продолжают расшифровываться.
 *
 * Требует: KMS_KEY_ID, ENCRYPTION_KEY (как сейчас в проде), YC_IAM_TOKEN или metadata на ВМ.
 * Запуск из apps/api:
 *   npx ts-node -r tsconfig-paths/register scripts/wrap-encryption-key-for-kms.ts
 */
import { scryptSync } from 'crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { KmsService } from '../src/common/crypto/kms.service';

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.secrets'), override: true });

const KEY_LENGTH = 32;

async function main() {
  const envKey = process.env.ENCRYPTION_KEY;
  if (!envKey || envKey.length < 32) {
    throw new Error('ENCRYPTION_KEY обязателен (≥32 символа), как в текущем CryptoService.');
  }
  const dek = scryptSync(envKey, 'handyseller-salt', KEY_LENGTH);
  const kms = new KmsService();
  const wrapped = await kms.encryptDataKey(dek);
  console.log('Добавьте в Lockbox / .env.production (одна строка). Можно затем убрать ENCRYPTION_KEY из env.\n');
  console.log(`ENCRYPTION_DEK_WRAPPED=${wrapped}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
