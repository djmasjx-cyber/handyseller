import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import * as https from 'https';
import * as http from 'http';

export interface UploadSignatureResult {
  /** Presigned URL for direct PUT upload */
  uploadUrl: string;
  /** Public URL after upload completes */
  publicUrl: string;
  /** Object key in S3 */
  key: string;
  /** Expiration time in seconds */
  expiresIn: number;
}

export interface ConfirmUploadResult {
  url: string;
  key: string;
  size?: number;
  contentType?: string;
}

export interface UploadFromUrlResult {
  url: string;
  key: string;
  size: number;
  contentType: string;
}

/**
 * MediaService - Yandex Object Storage (S3-compatible)
 *
 * Provides image upload functionality using Yandex Cloud Object Storage.
 * Supports direct browser uploads via presigned URLs and server-side uploads from URLs.
 *
 * Configuration (in .env):
 * - S3_ENDPOINT=https://storage.yandexcloud.net
 * - S3_REGION=ru-central1
 * - S3_BUCKET=handyseller-media
 * - S3_ACCESS_KEY_ID=your-key
 * - S3_SECRET_ACCESS_KEY=your-secret
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly s3Client: S3Client | null;
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly isConfigured: boolean;

  constructor() {
    const endpoint = process.env.S3_ENDPOINT;
    const region = process.env.S3_REGION || 'ru-central1';
    const bucket = process.env.S3_BUCKET;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

    this.endpoint = endpoint || 'https://storage.yandexcloud.net';
    this.bucket = bucket || 'handyseller-media';
    this.isConfigured = !!(accessKeyId && secretAccessKey);

    if (this.isConfigured) {
      this.s3Client = new S3Client({
        endpoint: this.endpoint,
        region,
        credentials: {
          accessKeyId: accessKeyId!,
          secretAccessKey: secretAccessKey!,
        },
        forcePathStyle: true, // Required for Yandex S3
      });
      this.logger.log(`Yandex Object Storage configured: bucket=${this.bucket}`);
    } else {
      this.s3Client = null;
      this.logger.warn(
        'Yandex Object Storage not configured. Set S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY in .env',
      );
    }
  }

  /**
   * Check if storage is configured
   */
  isEnabled(): boolean {
    return this.isConfigured;
  }

  /**
   * Generate a presigned URL for direct browser upload.
   * The client can PUT the file directly to this URL without going through our server.
   *
   * @param userId - User ID for organizing files
   * @param filename - Original filename (for extension)
   * @param contentType - MIME type (e.g., 'image/jpeg')
   */
  async getUploadSignature(
    userId: string,
    filename: string,
    contentType: string = 'image/jpeg',
  ): Promise<UploadSignatureResult> {
    if (!this.s3Client) {
      throw new BadRequestException('Storage not configured. Contact administrator.');
    }

    // Validate content type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(contentType)) {
      throw new BadRequestException(
        `Invalid file type: ${contentType}. Allowed: ${allowedTypes.join(', ')}`,
      );
    }

    // Generate unique key with user folder structure
    const ext = this.getExtensionFromFilename(filename) || this.getExtensionFromContentType(contentType);
    const key = `users/${userId}/${uuidv4()}${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const expiresIn = 600; // 10 minutes

    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
    const publicUrl = this.getPublicUrl(key);

    return {
      uploadUrl,
      publicUrl,
      key,
      expiresIn,
    };
  }

  /**
   * Confirm that an upload completed successfully.
   * Checks if the object exists in S3.
   */
  async confirmUpload(key: string): Promise<ConfirmUploadResult> {
    if (!this.s3Client) {
      throw new BadRequestException('Storage not configured');
    }

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      return {
        url: this.getPublicUrl(key),
        key,
        size: response.ContentLength,
        contentType: response.ContentType,
      };
    } catch (error) {
      this.logger.error(`Failed to confirm upload: ${key}`, error);
      throw new BadRequestException('Upload not found or failed');
    }
  }

  /**
   * Upload an image from URL (server-side).
   * Useful for importing images from WB/Ozon or other external sources.
   *
   * @param imageUrl - Source URL to download from
   * @param userId - User ID for organizing files
   * @param productId - Optional product ID for subfolder
   */
  async uploadFromUrl(
    imageUrl: string,
    userId: string,
    productId?: string,
  ): Promise<UploadFromUrlResult> {
    if (!this.s3Client) {
      throw new BadRequestException('Storage not configured');
    }

    try {
      // Download the image
      const { buffer, contentType } = await this.downloadImage(imageUrl);

      // Generate key with folder structure
      const ext = this.getExtensionFromContentType(contentType);
      const folder = productId ? `users/${userId}/products/${productId}` : `users/${userId}`;
      const key = `${folder}/${uuidv4()}${ext}`;

      // Upload to S3
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });

      await this.s3Client.send(command);

      return {
        url: this.getPublicUrl(key),
        key,
        size: buffer.length,
        contentType,
      };
    } catch (error) {
      this.logger.error(`Failed to upload from URL: ${imageUrl}`, error);
      throw new BadRequestException('Failed to upload image from URL');
    }
  }

  /**
   * Delete an image from storage.
   */
  async deleteImage(key: string): Promise<boolean> {
    if (!this.s3Client) {
      return false;
    }

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete image: ${key}`, error);
      return false;
    }
  }

  /**
   * Get public URL for an object.
   * Yandex Object Storage public URL format:
   * https://storage.yandexcloud.net/{bucket}/{key}
   */
  getPublicUrl(key: string): string {
    return `${this.endpoint}/${this.bucket}/${key}`;
  }

  /**
   * Check if URL is from our storage.
   */
  isOurStorageUrl(url: string): boolean {
    return url.includes(`${this.bucket}`) && url.includes('storage.yandexcloud.net');
  }

  /**
   * Extract key from our storage URL.
   */
  extractKeyFromUrl(url: string): string | null {
    const pattern = new RegExp(`${this.bucket}/(.+)$`);
    const match = url.match(pattern);
    return match ? match[1] : null;
  }

  /**
   * Download image from URL.
   */
  private downloadImage(url: string): Promise<{ buffer: Buffer; contentType: string }> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;

      const request = client.get(url, { timeout: 30000 }, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            this.downloadImage(redirectUrl).then(resolve).catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
          return;
        }

        const contentType = response.headers['content-type'] || 'image/jpeg';
        const chunks: Buffer[] = [];

        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve({ buffer, contentType });
        });
        response.on('error', reject);
      });

      request.on('error', reject);
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Download timeout'));
      });
    });
  }

  /**
   * Get file extension from content type.
   */
  private getExtensionFromContentType(contentType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
    };
    return map[contentType] || '.jpg';
  }

  /**
   * Get file extension from filename.
   */
  private getExtensionFromFilename(filename: string): string {
    const match = filename.match(/\.[a-z0-9]+$/i);
    return match ? match[0].toLowerCase() : '';
  }
}
