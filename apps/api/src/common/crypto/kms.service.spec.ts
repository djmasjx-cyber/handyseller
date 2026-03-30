import { randomBytes } from 'crypto';
import { KmsService } from './kms.service';

describe('KmsService', () => {
  const originalKmsKey = process.env.KMS_KEY_ID;

  afterEach(() => {
    if (originalKmsKey === undefined) {
      delete process.env.KMS_KEY_ID;
    } else {
      process.env.KMS_KEY_ID = originalKmsKey;
    }
  });

  it('local mode: encryptDataKey / decryptDataKey roundtrip without KMS_KEY_ID', async () => {
    delete process.env.KMS_KEY_ID;
    const kms = new KmsService();
    const plain = randomBytes(32);
    const wrapped = await kms.encryptDataKey(plain);
    expect(wrapped.startsWith('local:')).toBe(true);
    const out = await kms.decryptDataKey(wrapped);
    expect(out.equals(plain)).toBe(true);
  });

  it('legacy kms:v1: format still decrypts as plaintext DEK', async () => {
    delete process.env.KMS_KEY_ID;
    const kms = new KmsService();
    const plain = randomBytes(32);
    const legacy = `kms:v1:${plain.toString('base64')}`;
    const out = await kms.decryptDataKey(legacy);
    expect(out.equals(plain)).toBe(true);
  });
});
