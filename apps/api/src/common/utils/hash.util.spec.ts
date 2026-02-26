import { hashPassword, comparePassword } from './hash.util';

describe('hash.util', () => {
  describe('hashPassword', () => {
    it('should hash password', async () => {
      const hash = await hashPassword('password123');
      expect(hash).toBeDefined();
      expect(hash).not.toBe('password123');
      expect(hash.length).toBeGreaterThan(50);
    });

    it('should produce different hashes for same password (salt)', async () => {
      const [h1, h2] = await Promise.all([
        hashPassword('same'),
        hashPassword('same'),
      ]);
      expect(h1).not.toBe(h2);
    });
  });

  describe('comparePassword', () => {
    it('should return true for correct password', async () => {
      const hash = await hashPassword('secret');
      const ok = await comparePassword('secret', hash);
      expect(ok).toBe(true);
    });

    it('should return false for wrong password', async () => {
      const hash = await hashPassword('secret');
      const ok = await comparePassword('wrong', hash);
      expect(ok).toBe(false);
    });
  });
});
