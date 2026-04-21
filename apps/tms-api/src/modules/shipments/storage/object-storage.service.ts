import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

@Injectable()
export class ObjectStorageService {
  private readonly rootDir =
    process.env.TMS_OBJECT_STORAGE_DIR?.trim() || '/tmp/handyseller-tms-object-storage';

  async putBuffer(
    key: string,
    content: Buffer,
  ): Promise<{ objectKey: string; checksum: string; sizeBytes: number }> {
    const objectKey = key.replace(/^\/+/, '');
    const fullPath = join(this.rootDir, objectKey);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content);
    const checksum = createHash('sha256').update(content).digest('hex');
    return { objectKey, checksum, sizeBytes: content.length };
  }

  async getBuffer(key: string): Promise<Buffer | null> {
    try {
      return await readFile(join(this.rootDir, key.replace(/^\/+/, '')));
    } catch {
      return null;
    }
  }

  async statObject(key: string): Promise<{ sizeBytes: number } | null> {
    try {
      const s = await stat(join(this.rootDir, key.replace(/^\/+/, '')));
      return { sizeBytes: s.size };
    } catch {
      return null;
    }
  }
}

