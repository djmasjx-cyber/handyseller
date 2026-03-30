import { KmsService } from './kms.service';
import { CryptoService } from './crypto.service';

/** Создаёт CryptoService для скриптов вне Nest (после dotenv). */
export async function createCryptoServiceForCli(): Promise<CryptoService> {
  const kms = new KmsService();
  const crypto = new CryptoService(kms);
  await crypto.initializeForCli();
  return crypto;
}
