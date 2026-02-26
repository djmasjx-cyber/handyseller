import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;
const HASH_PREFIX = 'pii:';

/**
 * AES-256-GCM шифрование для API ключей маркетплейсов и PII.
 * В production ключ берётся через KMS (envelope encryption).
 */
@Injectable()
export class CryptoService {
  private key: Buffer;

  constructor() {
    const envKey = process.env.ENCRYPTION_KEY;
    if (process.env.NODE_ENV === 'production' && (!envKey || envKey.length < 32)) {
      throw new Error('ENCRYPTION_KEY required in production (min 32 chars)');
    }
    const keySource = envKey && envKey.length >= 32 ? envKey : 'dev-only-change-in-production-32chars!!';
    this.key = scryptSync(keySource, 'handyseller-salt', KEY_LENGTH);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, { authTagLength: AUTH_TAG_LENGTH });
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  decrypt(ciphertext: string): string {
    const buf = Buffer.from(ciphertext, 'base64');
    if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new Error('Invalid ciphertext');
    }
    const iv = buf.subarray(0, IV_LENGTH);
    const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, this.key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted) + decipher.final('utf8');
  }

  encryptOptional(value: string | null | undefined): string | null {
    if (value == null || value === '') return null;
    return this.encrypt(value);
  }

  decryptOptional(value: string | null | undefined): string | null {
    if (value == null || value === '') return null;
    try {
      return this.decrypt(value);
    } catch {
      return null;
    }
  }

  /**
   * Детерминированный хэш для поиска по PII (email и т.п.).
   * HMAC-SHA256(normalized, key) — один и тот же ввод даёт один хэш.
   */
  hashForLookup(value: string): string {
    const normalized = value.toLowerCase().trim();
    const hmac = createHmac('sha256', this.key);
    hmac.update(HASH_PREFIX + normalized);
    return hmac.digest('hex');
  }
}
