"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const hash_util_1 = require("./hash.util");
describe('hash.util', () => {
    describe('hashPassword', () => {
        it('should hash password', async () => {
            const hash = await (0, hash_util_1.hashPassword)('password123');
            expect(hash).toBeDefined();
            expect(hash).not.toBe('password123');
            expect(hash.length).toBeGreaterThan(50);
        });
        it('should produce different hashes for same password (salt)', async () => {
            const [h1, h2] = await Promise.all([
                (0, hash_util_1.hashPassword)('same'),
                (0, hash_util_1.hashPassword)('same'),
            ]);
            expect(h1).not.toBe(h2);
        });
    });
    describe('comparePassword', () => {
        it('should return true for correct password', async () => {
            const hash = await (0, hash_util_1.hashPassword)('secret');
            const ok = await (0, hash_util_1.comparePassword)('secret', hash);
            expect(ok).toBe(true);
        });
        it('should return false for wrong password', async () => {
            const hash = await (0, hash_util_1.hashPassword)('secret');
            const ok = await (0, hash_util_1.comparePassword)('wrong', hash);
            expect(ok).toBe(false);
        });
    });
});
//# sourceMappingURL=hash.util.spec.js.map