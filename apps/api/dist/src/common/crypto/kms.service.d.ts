export declare class KmsService {
    private keyId;
    private useKms;
    encryptDataKey(plainKey: Buffer): Promise<string>;
    decryptDataKey(encryptedKey: string): Promise<Buffer>;
    isAvailable(): Promise<boolean>;
}
