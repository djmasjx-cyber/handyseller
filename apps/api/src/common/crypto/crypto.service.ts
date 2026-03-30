import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync } from 'crypto';
import { KmsService } from './kms.service';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const HASH_PREFIX = 'pii:';

/**
 * AES-256-GCM для PII и токенов маркетплейсов.
 *
 * Ключ данных (DEK):
 * - **Рекомендуется в production (YC):** `ENCRYPTION_DEK_WRAPPED` — строка из `KmsService.encryptDataKey` (32 байта DEK, обёрнутые KMS).
 * - **Легаси / dev:** `ENCRYPTION_KEY` (≥32 символа) → scrypt → DEK.
 */
@Injectable()
export class CryptoService implements OnModuleInit {
  private readonly logger = new Logger(CryptoService.name);
  private dataKey: Buffer | null = null;

  constructor(private readonly kms: KmsService) {}

  async onModuleInit(): Promise<void> {
    await this.loadKey();
  }

  /** Скрипты и CLI вне Nest: вызвать один раз перед encrypt/decrypt/hashForLookup. */
  async initializeForCli(): Promise<void> {
    await this.loadKey();
  }

  private get keyMaterial(): Buffer {
    if (!this.dataKey) {
      throw new Error('CryptoService not initialized (call initializeForCli or use Nest onModuleInit)');
    }
    return this.dataKey;
  }

  private async loadKey(): Promise<void> {
    if (this.dataKey) return;

    const wrapped = process.env.ENCRYPTION_DEK_WRAPPED?.trim();
    if (wrapped) {
      const dek = await this.kms.decryptDataKey(wrapped);
      if (dek.length !== KEY_LENGTH) {
        throw new Error(
          `After KMS unwrap, DEK must be ${KEY_LENGTH} bytes (got ${dek.length}). Check ENCRYPTION_DEK_WRAPPED.`,
        );
      }
      this.dataKey = dek;
      this.logger.log('Data key: ENCRYPTION_DEK_WRAPPED (KMS envelope)');
      return;
    }

    const envKey = process.env.ENCRYPTION_KEY;
    if (process.env.NODE_ENV === 'production' && (!envKey || envKey.length < 32)) {
      throw new Error(
        'ENCRYPTION_KEY required in production (min 32 chars) when ENCRYPTION_DEK_WRAPPED is not set',
      );
    }
    if (process.env.KMS_KEY_ID && process.env.NODE_ENV === 'production') {
      this.logger.warn(
        'KMS_KEY_ID is set but ENCRYPTION_DEK_WRAPPED is missing — using ENCRYPTION_KEY (scrypt). Prefer ENCRYPTION_DEK_WRAPPED for KMS envelope.',
      );
    }
    const keySource = envKey && envKey.length >= 32 ? envKey : 'dev-only-change-in-production-32chars!!';
    this.dataKey = scryptSync(keySource, 'handyseller-salt', KEY_LENGTH);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.keyMaterial, iv, { authTagLength: AUTH_TAG_LENGTH });
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
    const decipher = createDecipheriv(ALGORITHM, this.keyMaterial, iv, { authTagLength: AUTH_TAG_LENGTH });
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
    const hmac = createHmac('sha256', this.keyMaterial);
    hmac.update(HASH_PREFIX + normalized);
    return hmac.digest('hex');
  }
}
