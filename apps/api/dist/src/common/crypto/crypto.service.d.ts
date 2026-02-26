export declare class CryptoService {
    private key;
    constructor();
    encrypt(plaintext: string): string;
    decrypt(ciphertext: string): string;
    encryptOptional(value: string | null | undefined): string | null;
    decryptOptional(value: string | null | undefined): string | null;
    hashForLookup(value: string): string;
}
