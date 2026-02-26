"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CryptoService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;
const HASH_PREFIX = 'pii:';
let CryptoService = class CryptoService {
    constructor() {
        const envKey = process.env.ENCRYPTION_KEY;
        if (process.env.NODE_ENV === 'production' && (!envKey || envKey.length < 32)) {
            throw new Error('ENCRYPTION_KEY required in production (min 32 chars)');
        }
        const keySource = envKey && envKey.length >= 32 ? envKey : 'dev-only-change-in-production-32chars!!';
        this.key = (0, crypto_1.scryptSync)(keySource, 'handyseller-salt', KEY_LENGTH);
    }
    encrypt(plaintext) {
        const iv = (0, crypto_1.randomBytes)(IV_LENGTH);
        const cipher = (0, crypto_1.createCipheriv)(ALGORITHM, this.key, iv, { authTagLength: AUTH_TAG_LENGTH });
        const encrypted = Buffer.concat([
            cipher.update(plaintext, 'utf8'),
            cipher.final(),
        ]);
        const authTag = cipher.getAuthTag();
        return Buffer.concat([iv, authTag, encrypted]).toString('base64');
    }
    decrypt(ciphertext) {
        const buf = Buffer.from(ciphertext, 'base64');
        if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) {
            throw new Error('Invalid ciphertext');
        }
        const iv = buf.subarray(0, IV_LENGTH);
        const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
        const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
        const decipher = (0, crypto_1.createDecipheriv)(ALGORITHM, this.key, iv, { authTagLength: AUTH_TAG_LENGTH });
        decipher.setAuthTag(authTag);
        return decipher.update(encrypted) + decipher.final('utf8');
    }
    encryptOptional(value) {
        if (value == null || value === '')
            return null;
        return this.encrypt(value);
    }
    decryptOptional(value) {
        if (value == null || value === '')
            return null;
        try {
            return this.decrypt(value);
        }
        catch {
            return null;
        }
    }
    hashForLookup(value) {
        const normalized = value.toLowerCase().trim();
        const hmac = (0, crypto_1.createHmac)('sha256', this.key);
        hmac.update(HASH_PREFIX + normalized);
        return hmac.digest('hex');
    }
};
exports.CryptoService = CryptoService;
exports.CryptoService = CryptoService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], CryptoService);
//# sourceMappingURL=crypto.service.js.map