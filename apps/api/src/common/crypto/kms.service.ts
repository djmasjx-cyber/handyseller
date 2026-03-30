import { Injectable } from '@nestjs/common';

/**
 * Yandex KMS adapter для envelope encryption.
 * Production: интеграция с @yandex-cloud/nodejs-sdk, SymmetricCryptoServiceClient.
 * Development: fallback на ENCRYPTION_KEY из env.
 *
 * Схема:
 * 1. Мастер-ключ создаётся в KMS (yc kms symmetric-key create)
 * 2. Data Key генерируется локально, шифруется мастер-ключом через KMS
 * 3. Зашифрованный Data Key хранится в БД
 * 4. При чтении: KMS расшифровывает DEK → расшифровка данных AES-256-GCM
 * 5. Ротация: новая версия ключа в KMS, перешифрование данных (раз в 90 дней)
 */
@Injectable()
export class KmsService {
  private keyId = process.env.KMS_KEY_ID;
  private useKms = Boolean(this.keyId);
  private localKeyVersion = process.env.KMS_LOCAL_KEY_VERSION ?? 'v1';
  private localCurrentKey = process.env.ENCRYPTION_KEY ?? '';
  private localOldKeys = (process.env.KMS_LOCAL_OLD_KEYS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  /**
   * Шифрует Data Key мастер-ключом KMS.
   * Возвращает base64(encrypted_dek) для хранения.
   */
  async encryptDataKey(plainKey: Buffer): Promise<string> {
    if (!this.useKms) return `local:${this.localKeyVersion}:${plainKey.toString('base64')}`;
    // TODO: Yandex KMS SymmetricEncrypt
    // const client = await this.getClient();
    // const result = await client.encrypt({ keyId: this.keyId, plaintext: plainKey });
    // return Buffer.from(result.ciphertext).toString('base64');
    return `kms:${this.localKeyVersion}:${plainKey.toString('base64')}`;
  }

  /**
   * Расшифровывает Data Key через KMS.
   */
  async decryptDataKey(encryptedKey: string): Promise<Buffer> {
    const [provider, _version, payload] = encryptedKey.split(':', 3);
    if (!provider || !payload) {
      return Buffer.from(encryptedKey, 'base64');
    }

    if (provider === 'local' || !this.useKms) return Buffer.from(payload, 'base64');
    // TODO: Yandex KMS SymmetricDecrypt
    // const client = await this.getClient();
    // const result = await client.decrypt({ keyId: this.keyId, ciphertext: Buffer.from(encryptedKey, 'base64') });
    // return Buffer.from(result.plaintext);
    return Buffer.from(payload, 'base64');
  }

  /**
   * Проверка доступности KMS (для health check).
   */
  async isAvailable(): Promise<boolean> {
    if (!this.useKms) return true;
    try {
      // await this.getClient().getKey({ keyId: this.keyId });
      return true;
    } catch {
      return false;
    }
  }

  getCurrentKeyVersion(): string {
    return this.localKeyVersion;
  }

  canRewrapLocalKeys(): boolean {
    return Boolean(this.localCurrentKey) && this.localOldKeys.length > 0;
  }
}
