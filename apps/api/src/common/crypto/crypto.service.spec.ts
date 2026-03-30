import { Test, TestingModule } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import { CryptoService } from './crypto.service';
import { KmsService } from './kms.service';

describe('CryptoService', () => {
  let service: CryptoService;

  const setupModule = async (kmsMock: Partial<KmsService>) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CryptoService,
        { provide: KmsService, useValue: kmsMock },
      ],
    }).compile();
    await module.init();
    return module.get<CryptoService>(CryptoService);
  };

  beforeEach(async () => {
    delete process.env.ENCRYPTION_DEK_WRAPPED;
    process.env.ENCRYPTION_KEY = 'dev-only-change-in-production-32chars!!';
    service = await setupModule({
      decryptDataKey: jest.fn(),
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt string', () => {
      const plain = 'secret-api-key-123';
      const encrypted = service.encrypt(plain);
      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(plain);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plain);
    });

    it('should produce different ciphertext each time (IV)', () => {
      const plain = 'data';
      const e1 = service.encrypt(plain);
      const e2 = service.encrypt(plain);
      expect(e1).not.toBe(e2);
      expect(service.decrypt(e1)).toBe(plain);
      expect(service.decrypt(e2)).toBe(plain);
    });
  });

  describe('encryptOptional/decryptOptional', () => {
    it('should return null for null/undefined/empty', () => {
      expect(service.encryptOptional(null)).toBeNull();
      expect(service.encryptOptional(undefined)).toBeNull();
      expect(service.encryptOptional('')).toBeNull();
    });

    it('should encrypt non-empty string', () => {
      const enc = service.encryptOptional('value');
      expect(enc).toBeTruthy();
    });

    it('should decryptOptional handle null', () => {
      expect(service.decryptOptional(null)).toBeNull();
      expect(service.decryptOptional(undefined)).toBeNull();
      expect(service.decryptOptional('')).toBeNull();
    });
  });

  describe('ENCRYPTION_DEK_WRAPPED', () => {
    it('should use KMS unwrap when ENCRYPTION_DEK_WRAPPED is set', async () => {
      const dek = randomBytes(32);
      const kmsMock = {
        decryptDataKey: jest.fn().mockResolvedValue(dek),
      };
      process.env.ENCRYPTION_DEK_WRAPPED = 'kms:w:1:dummy';
      const svc = await setupModule(kmsMock);
      const plain = 'x';
      const enc = svc.encrypt(plain);
      expect(kmsMock.decryptDataKey).toHaveBeenCalledWith('kms:w:1:dummy');
      expect(svc.decrypt(enc)).toBe(plain);
      delete process.env.ENCRYPTION_DEK_WRAPPED;
    });
  });
});
