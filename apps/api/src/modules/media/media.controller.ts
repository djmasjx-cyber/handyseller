import { Controller, Get, Post, Query, Body, Res, BadRequestException, UseGuards, Request } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MediaService } from './media.service';
import { GetUploadSignatureDto, ConfirmUploadDto, UploadFromUrlDto } from './dto/upload.dto';

/** Allowed domains for image proxying (WB CDN, Ozon CDN, etc.) */
const ALLOWED_HOSTS = [
  'wbbasket.ru',
  'wb.ru',
  'wildberries.ru',
  'basket-01.wbbasket.ru',
  'ozonusercontent.com',
  'cdn.ozon.ru',
  'ozon.ru',
  'ir.ozone.ru',
  'a.lmcdn.ru',       // Lamoda
  'img.ozon.ru',
];

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return ALLOWED_HOSTS.some(
      (h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`),
    );
  } catch {
    return false;
  }
}

@Controller('media')
export class MediaController {
  constructor(
    private readonly httpService: HttpService,
    private readonly mediaService: MediaService,
  ) {}

  /**
   * Server-side image proxy.
   * Bypasses CORS and hotlink protection for marketplace CDN images.
   * Usage: GET /api/media/proxy?url={encoded_url}
   *
   * Pattern used by Notion, Linear, Figma and other SaaS products
   * to serve external images through own domain.
   */
  @Get('proxy')
  async proxyImage(
    @Query('url') url: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!url) throw new BadRequestException('url is required');

    const decoded = decodeURIComponent(url);
    if (!isAllowedUrl(decoded)) {
      throw new BadRequestException('Domain not allowed');
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<Buffer>(decoded, {
          responseType: 'arraybuffer',
          timeout: 10000,
          headers: {
            // Mimic a browser request to avoid hotlink blocks
            'User-Agent':
              'Mozilla/5.0 (compatible; HandySeller/1.0; +https://handyseller.ru)',
            Accept: 'image/webp,image/avif,image/apng,image/*,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
          },
        }),
      );

      const contentType =
        (response.headers['content-type'] as string) || 'image/jpeg';
      const data = response.data as unknown as Buffer;

      // Cache proxied images for 7 days
      res.set({
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=604800, immutable',
        'X-Content-Type-Options': 'nosniff',
      });
      res.send(data);
    } catch {
      // Return a transparent 1x1 gif on error instead of 500
      const emptyGif = Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64',
      );
      res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' });
      res.send(emptyGif);
    }
  }

  /**
   * Check if storage is configured.
   * GET /api/media/status
   */
  @Get('status')
  getStatus() {
    return {
      storageEnabled: this.mediaService.isEnabled(),
    };
  }

  /**
   * Get presigned URL for direct browser-to-S3 upload.
   * Requires authentication.
   * POST /api/media/upload-signature
   */
  @UseGuards(JwtAuthGuard)
  @Post('upload-signature')
  async getUploadSignature(
    @Request() req: { user: { userId: string } },
    @Body() dto: GetUploadSignatureDto,
  ) {
    const userId = req.user.userId;
    return this.mediaService.getUploadSignature(
      userId,
      dto.filename,
      dto.contentType || 'image/jpeg',
    );
  }

  /**
   * Confirm an upload exists in storage.
   * Requires authentication.
   * POST /api/media/confirm
   */
  @UseGuards(JwtAuthGuard)
  @Post('confirm')
  async confirmUpload(@Body() dto: ConfirmUploadDto) {
    return this.mediaService.confirmUpload(dto.key);
  }

  /**
   * Upload image from external URL (server-side).
   * Requires authentication.
   * POST /api/media/upload-from-url
   */
  @UseGuards(JwtAuthGuard)
  @Post('upload-from-url')
  async uploadFromUrl(
    @Request() req: { user: { userId: string } },
    @Body() dto: UploadFromUrlDto,
  ) {
    const userId = req.user.userId;
    return this.mediaService.uploadFromUrl(dto.url, userId, dto.productId);
  }
}
