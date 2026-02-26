import { Test, TestingModule } from '@nestjs/testing';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  let service: CryptoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CryptoService],
    }).compile();
    service = module.get<CryptoService>(CryptoService);
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
});
