import { Injectable, Logger } from '@nestjs/common';
import { Session, cloudApi, serviceClients } from '@yandex-cloud/nodejs-sdk';

/**
 * Yandex KMS adapter для envelope encryption (KEK в KMS шифрует DEK).
 *
 * Режимы:
 * - `KMS_KEY_ID` не задан: dev — строки `local:...` (DEK в base64 в строке).
 * - `KMS_KEY_ID` задан: `encrypt`/`decrypt` через SymmetricCryptoService (YC).
 *
 * Авторизация SDK:
 * - `YC_IAM_TOKEN` или `IAM_TOKEN` — явный IAM-токен;
 * - иначе `new Session()` — metadata service (VM/инфраструктура Yandex Cloud с привязанным SA).
 *
 * Формат зашифрованного DEK: `kms:w:1:` + base64url(JSON { keyId, versionId, ciphertext }).
 * Легаси: `kms:<ver>:<base64>` (раньше без реального KMS) и `local:...` — по-прежнему расшифровываются локально.
 */
const WRAP_V1_PREFIX = 'kms:w:1:';

interface KmsWrappedPayloadV1 {
  keyId: string;
  versionId: string;
  /** base64 ciphertext от KMS */
  ciphertext: string;
}

@Injectable()
export class KmsService {
  private readonly logger = new Logger(KmsService.name);
  private keyId = process.env.KMS_KEY_ID;
  private useKms = Boolean(this.keyId);
  private localKeyVersion = process.env.KMS_LOCAL_KEY_VERSION ?? 'v1';
  private localCurrentKey = process.env.ENCRYPTION_KEY ?? '';
  private localOldKeys = (process.env.KMS_LOCAL_OLD_KEYS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  private session: Session | null = null;

  private getSession(): Session {
    if (this.session) return this.session;
    const iamToken = process.env.YC_IAM_TOKEN ?? process.env.IAM_TOKEN;
    this.session = iamToken ? new Session({ iamToken }) : new Session();
    return this.session;
  }

  private getSymmetricCryptoClient() {
    return this.getSession().client(serviceClients.SymmetricCryptoServiceClient);
  }

  /**
   * Шифрует Data Key симметричным ключом KMS.
   * Возвращает сериализованную строку для хранения (не сырой ciphertext без обёртки).
   */
  async encryptDataKey(plainKey: Buffer): Promise<string> {
    if (!this.useKms) {
      return `local:${this.localKeyVersion}:${plainKey.toString('base64')}`;
    }

    const { SymmetricEncryptRequest } = cloudApi.kms.symmetric_crypto_service;
    try {
      const client = this.getSymmetricCryptoClient();
      const res = await client.encrypt(
        SymmetricEncryptRequest.fromPartial({
          keyId: this.keyId!,
          plaintext: plainKey,
          aadContext: Buffer.alloc(0),
        }),
      );

      const payload: KmsWrappedPayloadV1 = {
        keyId: res.keyId,
        versionId: res.versionId,
        ciphertext: Buffer.from(res.ciphertext).toString('base64'),
      };
      const json = Buffer.from(JSON.stringify(payload), 'utf8');
      return `${WRAP_V1_PREFIX}${json.toString('base64url')}`;
    } catch (err) {
      this.logger.error(`KMS encrypt failed: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  /**
   * Расшифровывает Data Key (обёртка `kms:w:1:` или локальный/легаси формат).
   */
  async decryptDataKey(encryptedKey: string): Promise<Buffer> {
    if (encryptedKey.startsWith(WRAP_V1_PREFIX)) {
      const b64url = encryptedKey.slice(WRAP_V1_PREFIX.length);
      let rawJson: string;
      try {
        rawJson = Buffer.from(b64url, 'base64url').toString('utf8');
      } catch {
        throw new Error('Invalid KMS wrapped key encoding');
      }
      const payload = JSON.parse(rawJson) as KmsWrappedPayloadV1;
      if (!payload.ciphertext || !payload.keyId) {
        throw new Error('Invalid KMS wrapped key payload');
      }

      const { SymmetricDecryptRequest } = cloudApi.kms.symmetric_crypto_service;
      try {
        const client = this.getSymmetricCryptoClient();
        const res = await client.decrypt(
          SymmetricDecryptRequest.fromPartial({
            keyId: payload.keyId,
            ciphertext: Buffer.from(payload.ciphertext, 'base64'),
            aadContext: Buffer.alloc(0),
          }),
        );
        return Buffer.from(res.plaintext);
      } catch (err) {
        this.logger.error(`KMS decrypt failed: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
      }
    }

    const [provider, , payload] = encryptedKey.split(':', 3);
    if (!provider || payload === undefined) {
      return Buffer.from(encryptedKey, 'base64');
    }

    if (provider === 'local' || !this.useKms) {
      return Buffer.from(payload, 'base64');
    }

    /* Легаси: `kms:<ver>:<base64>` — ранее plaintext DEK, не ciphertext KMS */
    return Buffer.from(payload, 'base64');
  }

  /**
   * Проверка доступности KMS (для health). Без лишних вызовов Encrypt в проде.
   */
  async isAvailable(): Promise<boolean> {
    if (!this.useKms) return true;
    try {
      this.getSymmetricCryptoClient();
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
